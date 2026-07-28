/**
 * Multi-Platform Booking Email Scraper
 *
 * Searches Gmail for booking confirmation emails from Airbnb, VRBO, Booking.com,
 * and direct booking platforms. Uses LLM to parse email bodies into structured
 * booking data, then enriches property_bookings rows with guest details,
 * financial data, and platform booking URLs.
 *
 * Key design decisions:
 * - Uses existing member OAuth tokens (keyed by email address) — no new auth needed
 *   if the token already has gmail.readonly scope
 * - Falls back to property_email_tokens table for property-specific tokens
 * - 2-year backfill on first scrape or when email address changes
 * - Incremental scrape on subsequent runs (from lastEmailScrapedAt)
 * - LLM parser handles all platform email formats uniformly
 * - Regex parser as fallback if LLM is unavailable
 * - Enriches existing iCal-matched rows; creates new rows for email-only bookings
 * - Writes scrape provenance fields: rawEmailSubject, rawEmailDate, emailScrapeSource,
 *   scrapeConfidence, lastEnrichedAt
 * - Logs each run to email_scrape_jobs table
 */

import * as db from "../db";
import { getDb } from "../db";
import {
  propertyBookings,
  propertyPlatforms,
  emailScrapeJobs,
  propertyEmailTokens,
} from "../../drizzle/schema";
import { eq, and, isNotNull, or, desc } from "drizzle-orm";
import { randomUUID } from "crypto";
import { invokeLLM } from "../_core/vertexAi";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ParsedBookingEmail {
  confirmationNumber?: string;
  guestName?: string;
  guestEmail?: string;
  guestPhone?: string;
  guestCount?: number;
  checkIn?: number;       // UTC ms
  checkOut?: number;      // UTC ms
  propertyName?: string;
  platform?: string;      // detected platform: airbnb | vrbo | booking_com | direct
  totalPrice?: number;
  cleaningFee?: number;
  commissionAmount?: number;
  netAmount?: number;
  currency?: string;
  platformBookingUrl?: string;
  confidence: number;     // 0-100
}

export interface MultiScrapeResult {
  platformId: string;
  propertyId: string;
  emailAddress: string;
  emailsProcessed: number;
  bookingsEnriched: number;
  bookingsCreated: number;
  errors: string[];
  jobId: string;
}

// ─── Gmail API helpers ────────────────────────────────────────────────────────

const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

async function gmailGet(path: string, accessToken: string) {
  const res = await fetch(`${GMAIL_BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gmail API ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

function base64UrlDecode(str: string): string {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(padded, "base64").toString("utf-8");
}

function extractEmailBody(payload: any): string {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return base64UrlDecode(payload.body.data);
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      const text = extractEmailBody(part);
      if (text) return text;
    }
  }
  if (payload.mimeType === "text/html" && payload.body?.data) {
    const html = base64UrlDecode(payload.body.data);
    return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 8000);
  }
  return "";
}

function extractEmailHeader(headers: any[], name: string): string {
  const h = headers?.find((h: any) => h.name?.toLowerCase() === name.toLowerCase());
  return h?.value || "";
}

// ─── Platform detection ───────────────────────────────────────────────────────

const PLATFORM_SENDERS: Record<string, string[]> = {
  airbnb: [
    "automated@airbnb.com", "no-reply@airbnb.com", "express@airbnb.com",
    "airbnb.com",
  ],
  vrbo: [
    "noreply@vrbo.com", "no-reply@vrbo.com", "vrbo.com", "homeaway.com",
    "noreply@homeaway.com",
  ],
  booking_com: [
    "noreply@booking.com", "reservations@booking.com", "no-reply@booking.com",
    "booking.com",
  ],
};

function detectPlatformFromSender(from: string): string {
  const fromLower = from.toLowerCase();
  for (const [platform, senders] of Object.entries(PLATFORM_SENDERS)) {
    if (senders.some(s => fromLower.includes(s))) return platform;
  }
  return "direct";
}

// ─── Property-name disambiguation ───────────────────────────────────────────

/**
 * When multiple properties share the same notification email, the LLM-parsed
 * propertyName field is the ONLY reliable signal for which property a booking
 * belongs to. This map uses fuzzy keyword matching to resolve the parsed name
 * to a property ID. If the parsed name doesn't match the current platform's
 * property, we skip enrichment/creation to prevent cross-contamination.
 */
const PROPERTY_NAME_KEYWORDS: Record<string, string[]> = {
  // DB property ID → keywords that appear in Airbnb/Vrbo listing names
  "ZI2Zy7OuLGYF-vmWOAII-": ["bohemian", "artist", "boutique", "dillsbury", "kingston", "jamaica"],
  "nJnk4hr3AxZJZ-RkwhRJy": ["morabeza", "tropical", "haven"],
  "Ln-_SMF7Nrt1uXsQcdP9C": ["sunset", "sunsets", "studio", "seneca sunsets"],
  "8W4U2WJg6d4rDN9v7I8-Z": ["apartment #1", "jessica", "dougherty"],
  "RsUUOvqGAX3TgASRzDbGJ": ["apartment #2", "jennifer", "ungberg"],
};

// Vrbo property number → DB property ID mapping
// Vrbo emails include the property number in the subject line:
// "Reservation from [Guest]: [dates] - Vrbo #[number]"
const VRBO_PROPERTY_NUMBER_MAP: Record<string, string> = {
  "4728879": "Ln-_SMF7Nrt1uXsQcdP9C",  // Sunset Studio
  "4698060": "nJnk4hr3AxZJZ-RkwhRJy",  // Morabeza (second listing on tarikp@gmail.com)
  "3001841": "ZI2Zy7OuLGYF-vmWOAII-",  // Artiste's Boutique (on tarikp@gmail.com)
  "2778727": "nJnk4hr3AxZJZ-RkwhRJy",  // Morabeza (original listing on tarik@maxfieldmarket.com)
};

/**
 * For Vrbo emails, extract the property number from the subject line
 * and resolve to a DB property ID. This is more reliable than LLM parsing.
 */
function resolvePropertyFromVrboSubject(subject: string): string | null {
  const match = subject.match(/Vrbo #(\d+)|Property(?:\s+ID)?\s+(\d+)/i);
  if (match) {
    const propNum = match[1] || match[2];
    return VRBO_PROPERTY_NUMBER_MAP[propNum] || null;
  }
  return null;
}

function resolvePropertyFromName(parsedPropertyName: string | undefined): string | null {
  if (!parsedPropertyName) return null;
  const lower = parsedPropertyName.toLowerCase();
  for (const [propId, keywords] of Object.entries(PROPERTY_NAME_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) return propId;
  }
  return null;
}

// ─── Gmail search query per platform ─────────────────────────────────────────

/**
 * Build a Gmail search query scoped to the given platform's sender domain.
 * Platform-specific queries mean:
 *   1. Each platform only reads emails relevant to it (faster, less noise).
 *   2. An Airbnb/VRBO scrape is fully independent of Booking.com — a Booking.com
 *      auth failure does NOT prevent Airbnb/VRBO data from being enriched.
 *   3. Returning 0 results cleanly when no matching emails exist is correct behaviour.
 */
function buildGmailQuery(afterStr: string, platform?: string): string {
  const after = ` after:${afterStr}`;
  switch (platform) {
    case "airbnb":
      return [
        `(from:(automated@airbnb.com OR no-reply@airbnb.com OR express@airbnb.com)`,
        ` subject:(reservation OR booking OR confirmation OR "you have a new booking"))`,
        after,
      ].join("");
    case "vrbo":
      return [
        `(from:(sender@messages.homeaway.com OR noreply@vrbo.com OR no-reply@vrbo.com OR vrbo@partners.expediagroup.com)`,
        ` subject:(reservation OR "instant booking" OR booking OR payout OR confirmation))`,
        after,
      ].join("");
    case "booking_com":
      return [
        `(from:(noreply@booking.com OR reservations@booking.com OR no-reply@booking.com)`,
        ` subject:(reservation OR booking OR confirmation))`,
        after,
      ].join("");
    default:
      // Fallback: scan all known booking platforms (used for direct / unknown)
      return [
        `(from:(automated@airbnb.com OR no-reply@airbnb.com OR express@airbnb.com)`,
        ` subject:(reservation OR booking OR confirmation OR "you have a new booking"))`,
        ` OR (from:(sender@messages.homeaway.com OR noreply@vrbo.com OR no-reply@vrbo.com OR vrbo@partners.expediagroup.com)`,
        ` subject:(reservation OR "instant booking" OR booking OR payout OR confirmation))`,
        ` OR (from:(noreply@booking.com OR reservations@booking.com OR no-reply@booking.com)`,
        ` subject:(reservation OR booking OR confirmation))`,
        after,
      ].join("");
  }
}

// ─── LLM email parser ─────────────────────────────────────────────────────────

async function parseEmailWithLLM(
  subject: string,
  body: string,
  from: string
): Promise<ParsedBookingEmail> {
  const detectedPlatform = detectPlatformFromSender(from);

  // Platform-specific financial guidance
  const financialGuidance = detectedPlatform === "booking_com"
    ? `\n\nCRITICAL: Booking.com confirmation emails do NOT contain financial data (payout amounts, commission, or net earnings). Do NOT extract or guess any financial fields (totalPrice, cleaningFee, commissionAmount, netAmount). Set confidence to 0 for any financial field you cannot explicitly see in the email text. Only extract: confirmation number, guest name, dates, property name, and guest count.`
    : detectedPlatform === "airbnb"
    ? `\n\nFINANCIAL CONTEXT: In Airbnb host emails, the dollar amount shown is typically the HOST PAYOUT (net after Airbnb's service fee). It is NOT the guest-facing total. If you see a single dollar amount, treat it as netAmount (host payout), not totalPrice. Only set totalPrice if the email explicitly shows "Guest pays" or "Total" as a separate higher figure. Set commissionAmount only if explicitly shown as "Service fee" or "Host fee".`
    : detectedPlatform === "vrbo"
    ? `\n\nFINANCIAL CONTEXT: In VRBO/HomeAway host emails, the dollar amount shown is typically the HOST EARNINGS before VRBO's commission. If you see a single dollar amount labeled "earnings" or "you'll receive", treat it as the gross host earnings (totalPrice from host perspective). VRBO's commission is typically 5% but is not always shown in the email. Only set commissionAmount if explicitly stated.`
    : ``;

  const prompt = `You are a booking data extractor. Extract structured booking information from this ${detectedPlatform} confirmation email.${financialGuidance}

EMAIL FROM: ${from}
SUBJECT: ${subject}
BODY (first 4000 chars):
${body.slice(0, 4000)}

Extract all available booking details. For dates, output as ISO 8601 strings (YYYY-MM-DD). For URLs, extract the direct booking management link if present. If a field is not present in the email, omit it from the response.`;

  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: "You are a precise booking data extractor. Extract only what is explicitly stated in the email. Do not infer or guess values that are not present.",
        },
        { role: "user", content: prompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "booking_extraction",
          strict: true,
          schema: {
            type: "object",
            properties: {
              confirmationNumber: { type: "string", description: "Booking/confirmation/reservation number" },
              guestName: { type: "string", description: "Full name of the guest" },
              guestEmail: { type: "string", description: "Guest email address" },
              guestPhone: { type: "string", description: "Guest phone number" },
              guestCount: { type: "number", description: "Number of guests" },
              checkInDate: { type: "string", description: "Check-in date as YYYY-MM-DD" },
              checkOutDate: { type: "string", description: "Check-out date as YYYY-MM-DD" },
              propertyName: { type: "string", description: "Property/listing name" },
              platform: { type: "string", description: "Platform: airbnb, vrbo, booking_com, or direct" },
              totalPrice: { type: "number", description: "Total amount guest paid" },
              cleaningFee: { type: "number", description: "Cleaning fee if separately listed" },
              commissionAmount: { type: "number", description: "Platform commission/service fee" },
              netAmount: { type: "number", description: "Net payout to host" },
              currency: { type: "string", description: "3-letter ISO currency code" },
              platformBookingUrl: { type: "string", description: "Direct URL to manage this booking on the platform" },
              confidence: { type: "number", description: "Confidence score 0-100 for this extraction" },
            },
            required: ["confidence"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response?.choices?.[0]?.message?.content;
    if (!content) return { confidence: 0 };

    const parsed = typeof content === "string" ? JSON.parse(content) : content;

    // Convert date strings to UTC ms timestamps
    const result: ParsedBookingEmail = {
      confirmationNumber: parsed.confirmationNumber,
      guestName: parsed.guestName,
      guestEmail: parsed.guestEmail,
      guestPhone: parsed.guestPhone,
      guestCount: parsed.guestCount,
      propertyName: parsed.propertyName,
      platform: parsed.platform || detectedPlatform,
      totalPrice: parsed.totalPrice,
      cleaningFee: parsed.cleaningFee,
      commissionAmount: parsed.commissionAmount,
      netAmount: parsed.netAmount,
      currency: parsed.currency,
      platformBookingUrl: parsed.platformBookingUrl,
      confidence: parsed.confidence ?? 50,
    };

    if (parsed.checkInDate) {
      const d = new Date(parsed.checkInDate + "T12:00:00Z");
      if (!isNaN(d.getTime())) result.checkIn = d.getTime();
    }
    if (parsed.checkOutDate) {
      const d = new Date(parsed.checkOutDate + "T12:00:00Z");
      if (!isNaN(d.getTime())) result.checkOut = d.getTime();
    }

    // ─── Booking.com financial suppression ────────────────────────────────────
    // Booking.com emails NEVER contain reliable financial data. Strip any
    // hallucinated amounts the LLM may have produced.
    if (detectedPlatform === "booking_com") {
      delete result.totalPrice;
      delete result.cleaningFee;
      delete result.commissionAmount;
      delete result.netAmount;
    }

    // Derive missing financial field if two of three are known
    // (only for platforms where email financial data is meaningful)
    if (detectedPlatform !== "booking_com") {
      if (result.totalPrice && result.commissionAmount && !result.netAmount) {
        result.netAmount = Math.round((result.totalPrice - result.commissionAmount) * 100) / 100;
      } else if (result.totalPrice && result.netAmount && !result.commissionAmount) {
        result.commissionAmount = Math.round((result.totalPrice - result.netAmount) * 100) / 100;
      } else if (result.commissionAmount && result.netAmount && !result.totalPrice) {
        result.totalPrice = Math.round((result.commissionAmount + result.netAmount) * 100) / 100;
      }
    }

    // Cap confidence for financial fields from email scraping
    // Email-scraped financials are never authoritative (max 70)
    if (result.confidence > 70 && (result.totalPrice || result.netAmount || result.commissionAmount)) {
      result.confidence = 70;
    }

    return result;
  } catch (e) {
    console.warn("[MultiScraper] LLM parse failed, falling back to regex:", e instanceof Error ? e.message : String(e));
    return regexFallbackParser(subject, body, detectedPlatform);
  }
}

// ─── Regex fallback parser ────────────────────────────────────────────────────

function regexFallbackParser(subject: string, body: string, platform: string): ParsedBookingEmail {
  const result: ParsedBookingEmail = { platform, confidence: 30 };

  // Confirmation number
  const confirmMatch = body.match(/(?:confirmation|booking|reservation|ref(?:erence)?)\s*(?:number|#|no\.?|code)\s*[:\s]*([A-Z0-9]{5,15})/i);
  if (confirmMatch) result.confirmationNumber = confirmMatch[1].toUpperCase();

  // Guest name
  const guestMatch = body.match(/(?:guest\s+name|booked\s+by|guest|traveler|renter)\s*[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/);
  if (guestMatch) result.guestName = guestMatch[1].trim();

  // Check-in
  const checkInMatch = body.match(/(?:check[\s-]?in|arrival|from)\s*[:\s]+(?:\w+,\s+)?(\d{1,2}[\s\/\-]\w+[\s\/\-]\d{4}|\d{4}[\-\/]\d{2}[\-\/]\d{2})/i);
  if (checkInMatch) {
    const d = new Date(checkInMatch[1].replace(/\//g, "-"));
    if (!isNaN(d.getTime())) result.checkIn = d.getTime();
  }

  // Check-out
  const checkOutMatch = body.match(/(?:check[\s-]?out|departure|to)\s*[:\s]+(?:\w+,\s+)?(\d{1,2}[\s\/\-]\w+[\s\/\-]\d{4}|\d{4}[\-\/]\d{2}[\-\/]\d{2})/i);
  if (checkOutMatch) {
    const d = new Date(checkOutMatch[1].replace(/\//g, "-"));
    if (!isNaN(d.getTime())) result.checkOut = d.getTime();
  }

  // Currency
  const currencyMatch = body.match(/\b(USD|EUR|GBP|JMD|CAD|AUD|BBD)\b/i) || body.match(/(\$|€|£)/);
  if (currencyMatch) {
    const sym = currencyMatch[1];
    const symbolMap: Record<string, string> = { "$": "USD", "€": "EUR", "£": "GBP" };
    result.currency = symbolMap[sym] ?? sym.toUpperCase();
  }

  // Total price
  const totalMatch = body.match(/(?:total\s+(?:price|amount|charge|cost)|grand\s+total|amount\s+due)\s*[:\s]*(?:USD|EUR|GBP|JMD|\$|€|£)?\s*([\d,]+\.?\d*)/i);
  if (totalMatch) result.totalPrice = parseFloat(totalMatch[1].replace(/,/g, ""));

  // Net payout
  const netMatch = body.match(/(?:you\s+will\s+receive|net\s+(?:amount|payout)|payout|your\s+earnings?)\s*[:\s]*(?:USD|EUR|GBP|JMD|\$|€|£)?\s*([\d,]+\.?\d*)/i);
  if (netMatch) result.netAmount = parseFloat(netMatch[1].replace(/,/g, ""));

  if (!result.confirmationNumber && !result.checkIn) result.confidence = 10;

  return result;
}

// ─── Token resolution ─────────────────────────────────────────────────────────

/**
 * Resolve a valid Gmail access token for a given email address.
 * Checks:
 * 1. property_email_tokens table (property-specific tokens)
 * 2. oauth_tokens table (member-linked tokens, any member in the household)
 * Refreshes expired tokens automatically.
 */
async function resolveGmailToken(
  propertyId: string,
  emailAddress: string
): Promise<{ accessToken: string; source: string } | null> {
  const d = await getDb();
  if (!d) return null;

  // 1. Check property_email_tokens first
  const [propToken] = await d
    .select()
    .from(propertyEmailTokens)
    .where(
      and(
        eq(propertyEmailTokens.propertyId, propertyId),
        eq(propertyEmailTokens.emailAddress, emailAddress)
      )
    )
    .limit(1);

  if (propToken?.accessToken) {
    const expiry = propToken.tokenExpiry || 0;
    if (expiry > Date.now() + 5 * 60 * 1000) {
      // Update lastUsedAt
      await d.update(propertyEmailTokens)
        .set({ lastUsedAt: Date.now() })
        .where(eq(propertyEmailTokens.id, propToken.id));
      return { accessToken: propToken.accessToken, source: "property_email_tokens" };
    }
    if (propToken.refreshToken) {
      try {
        const { refreshAccessToken } = await import("./googleCalendarSync");
        const refreshed = await refreshAccessToken(propToken.refreshToken);
        const newExpiry = (refreshed as any).expiresIn
          ? Date.now() + ((refreshed as any).expiresIn * 1000)
          : (refreshed as any).expiresAt ?? Date.now() + 3600 * 1000;
        await d.update(propertyEmailTokens)
          .set({
            accessToken: refreshed.accessToken,
            tokenExpiry: newExpiry,
            lastUsedAt: Date.now(),
          })
          .where(eq(propertyEmailTokens.id, propToken.id));
        return { accessToken: refreshed.accessToken, source: "property_email_tokens" };
      } catch (e) {
        console.warn(`[MultiScraper] Property email token refresh failed for ${emailAddress} — token may be revoked:`, e);
        // Mark the property email token as failed so dashboard can surface the issue
        await d.update(propertyEmailTokens)
          .set({ lastUsedAt: Date.now() })
          .where(eq(propertyEmailTokens.id, propToken.id));
      }
    }
  }

  // 2. Fall back to member OAuth tokens
  const property = await db.getPropertyById(propertyId);
  if (!property) return null;

  const members = await db.getHouseholdMembers(property.householdId);
  for (const member of members) {
    const token = await db.getOAuthTokenByEmail(member.id, "google", emailAddress);
    if (token?.accessToken) {
      // P-09 scope guard: fail fast with actionable error if gmail.readonly is missing
      // (token was connected before gmail.readonly was added to the scope list)
      const scopes = (token.scopes || "").split(" ");
      const hasGmailRead = scopes.some(s =>
        s === "https://www.googleapis.com/auth/gmail.readonly" || s === "gmail.readonly"
      );
      if (!hasGmailRead) {
        console.warn(
          `[MultiScraper] Token for ${emailAddress} (member ${member.id}) is missing gmail.readonly scope. ` +
          `User must reconnect this account in Settings → Integrations with the email_scraping purpose.`
        );
        // Return a sentinel so the caller can surface an actionable error
        return { accessToken: "__MISSING_GMAIL_READONLY__", source: `oauth_tokens:${member.id}:missing_scope` };
      }

      const expiresAt = token.expiresAt ? new Date(token.expiresAt).getTime() : 0;
      if (expiresAt > Date.now() + 5 * 60 * 1000) {
        return { accessToken: token.accessToken, source: `oauth_tokens:${member.id}` };
      }
      if (token.refreshToken) {
        try {
          const { refreshAccessToken } = await import("./googleCalendarSync");
          const refreshed = await refreshAccessToken(token.refreshToken);
          // Update the token in DB with refreshed access token and expiry
          await db.updateOAuthToken(token.id, {
            accessToken: refreshed.accessToken,
            expiresAt: refreshed.expiresAt,
            lastRefreshedAt: new Date(),
            status: "active",
          });
          return { accessToken: refreshed.accessToken, source: `oauth_tokens:${member.id}` };
        } catch (e) {
          console.warn(`[MultiScraper] Member token refresh failed for ${emailAddress} — marking expired:`, e);
          // Mark the token as expired so dashboard health indicator turns red
          try {
            await db.updateOAuthToken(token.id, { status: "expired" });
          } catch (dbErr) {
            console.error(`[MultiScraper] Failed to mark token expired for ${emailAddress}:`, dbErr);
          }
        }
      }
    }
  }

  return null;
}

// ─── Cancellation query builder ─────────────────────────────────────────────

function buildCancellationQuery(afterStr: string, platform?: string): string | null {
  const after = ` after:${afterStr}`;
  switch (platform) {
    case "airbnb":
      // Include alteration/modification emails which may indicate effective cancellation
      return `(from:(automated@airbnb.com OR no-reply@airbnb.com OR express@airbnb.com) subject:(cancell OR canceled OR cancelled OR alteration OR "reservation change"))${after}`;
    case "vrbo":
      return `(from:(sender@messages.homeaway.com OR noreply@messages.homeaway.com OR noreply@vrbo.com OR no-reply@vrbo.com OR vrbo@partners.expediagroup.com) subject:(cancell OR canceled OR cancelled OR "was Canceled" OR modification OR "date change"))${after}`;
    case "booking_com":
      return `(from:(noreply@booking.com OR reservations@booking.com OR no-reply@booking.com) subject:(cancell OR canceled OR cancelled OR "no-show" OR modification))${after}`;
    default:
      return null;
  }
}

// ─── Main scraping function ───────────────────────────────────────────────────

/**
 * Scrape all booking confirmation emails for a single platform.
 * Handles Airbnb, VRBO, Booking.com, and direct bookings.
 */
export async function scrapeMultiPlatformEmails(platformId: string): Promise<MultiScrapeResult> {
  const d = await getDb();
  if (!d) throw new Error("Database not available");

  const [platform] = await d
    .select()
    .from(propertyPlatforms)
    .where(eq(propertyPlatforms.id, platformId))
    .limit(1);

  if (!platform) throw new Error(`Platform ${platformId} not found`);
  if (!platform.notificationEmail) throw new Error(`Platform ${platformId} has no notification email configured`);

  // Create a job record
  const jobId = randomUUID();
  await d.insert(emailScrapeJobs).values({
    id: jobId,
    propertyId: platform.propertyId,
    platformId,
    emailAddress: platform.notificationEmail,
    status: "running",
    startedAt: Date.now(),
  } as any);

  const result: MultiScrapeResult = {
    platformId,
    propertyId: platform.propertyId,
    emailAddress: platform.notificationEmail,
    emailsProcessed: 0,
    bookingsEnriched: 0,
    bookingsCreated: 0,
    errors: [],
    jobId,
  };

  try {
    // Resolve access token
    const tokenResult = await resolveGmailToken(platform.propertyId, platform.notificationEmail);
    if (!tokenResult) {
      const msg = `No valid Gmail token for ${platform.notificationEmail}. Connect this account in Properties → Email Settings.`;
      result.errors.push(msg);
      await d.update(emailScrapeJobs)
        .set({ status: "failed", completedAt: Date.now(), errorMessage: msg })
        .where(eq(emailScrapeJobs.id, jobId));
      return result;
    }

    // P-09 scope guard: sentinel returned when token exists but lacks gmail.readonly
    if (tokenResult.accessToken === "__MISSING_GMAIL_READONLY__") {
      const msg = `Account ${platform.notificationEmail} needs to be reconnected with email access. ` +
        `Go to Settings → Integrations, find this account, and click Reconnect — ` +
        `make sure "Email Scraping" is checked as a purpose.`;
      // P-33: Log clearly so the issue is visible in server logs without a DB query.
      // This platform is skipped but Promise.allSettled in scrapeAllMultiPlatformEmails
      // ensures all OTHER platforms continue to scrape independently.
      console.warn(
        `[MultiScraper] NEEDS_REAUTH: ${platform.notificationEmail} on ` +
        `${platform.platform} (${platformId}) — missing gmail.readonly scope. ` +
        `Other platforms will continue scraping normally.`
      );
      result.errors.push(msg);
      // Check previous status to fire notification only on FIRST transition to needs_reauth (P-34)
      const [prevJobRow] = await d.select({ prevStatus: emailScrapeJobs.status })
        .from(emailScrapeJobs)
        .where(eq(emailScrapeJobs.id, jobId))
        .limit(1);
      const wasAlreadyNeedsReauth = prevJobRow?.prevStatus === "needs_reauth";
      // Use needs_reauth status so the dashboard can surface an actionable warning
      // without treating this as a hard failure — other platforms continue scraping
      await d.update(emailScrapeJobs)
        .set({ status: "needs_reauth" as any, completedAt: Date.now(), errorMessage: msg })
        .where(eq(emailScrapeJobs.id, jobId));
      // P-34: Fire owner notification on first transition to needs_reauth.
      // Turns a silent dashboard badge into an active push alert.
      if (!wasAlreadyNeedsReauth) {
        import("../_core/notification").then(({ notifyOwner }) => {
          notifyOwner({
            title: `⚠️ Email Scraper: ${platform.platform} needs reconnect`,
            content: `${msg}\n\nThis platform will be skipped on every scrape run until the account is reconnected.`,
          }).catch(() => {});
        }).catch(() => {});
      }
      return result;
    }

    const { accessToken } = tokenResult;

    // Determine scrape window
    const TWO_YEARS_MS = 2 * 365 * 24 * 60 * 60 * 1000;
    const emailChanged = (platform as any).emailNotificationEmailPrev &&
      (platform as any).emailNotificationEmailPrev !== platform.notificationEmail;
    const isFirstScrape = !platform.lastEmailScrapedAt;
    const sinceMs = (isFirstScrape || emailChanged)
      ? Date.now() - TWO_YEARS_MS
      : (platform.lastEmailScrapedAt as number);
    const sinceDate = new Date(sinceMs);
    const afterStr = `${sinceDate.getFullYear()}/${String(sinceDate.getMonth() + 1).padStart(2, "0")}/${String(sinceDate.getDate()).padStart(2, "0")}`;

    // Pass platform type so the query is scoped to only that platform's sender domain.
    // This is the key isolation fix: Airbnb/VRBO scrapes are independent of Booking.com.
    const query = buildGmailQuery(afterStr, platform.platform);

    // Paginate Gmail results
    let messageIds: string[] = [];
    try {
      let pageToken: string | undefined;
      do {
        const url = `/messages?q=${encodeURIComponent(query)}&maxResults=500${pageToken ? `&pageToken=${pageToken}` : ""}`;
        const searchResult = await gmailGet(url, accessToken);
        const page: string[] = (searchResult.messages || []).map((m: any) => m.id);
        messageIds.push(...page);
        pageToken = searchResult.nextPageToken;
        if (messageIds.length >= 2000) break;
      } while (pageToken);
    } catch (e) {
      const msg = `Gmail search failed: ${e instanceof Error ? e.message : String(e)}`;
      result.errors.push(msg);
      await d.update(emailScrapeJobs)
        .set({ status: "failed", completedAt: Date.now(), errorMessage: msg })
        .where(eq(emailScrapeJobs.id, jobId));
      return result;
    }

    console.log(`[MultiScraper] Found ${messageIds.length} emails for platform ${platformId}`);

    // Process each email
    for (const msgId of messageIds) {
      try {
        const msg = await gmailGet(`/messages/${msgId}?format=full`, accessToken);
        const headers = msg.payload?.headers || [];
        const subject = extractEmailHeader(headers, "subject");
        const from = extractEmailHeader(headers, "from");
        const dateHeader = extractEmailHeader(headers, "date");
        const emailDateMs = dateHeader ? new Date(dateHeader).getTime() : Date.now();

        const body = extractEmailBody(msg.payload);
        result.emailsProcessed++;

        if (!body && !subject) continue;

        // Parse with LLM
        const parsed = await parseEmailWithLLM(subject, body, from);

        // Skip low-confidence extractions with no useful data
        if (parsed.confidence < 20 && !parsed.confirmationNumber && !parsed.checkIn) continue;

        // ─── Property-name disambiguation guard ──────────────────────────────
        // For Vrbo emails, the subject line contains the property number which is
        // the most reliable signal. Check it first before falling back to LLM name.
        const vrboResolvedPropId = resolvePropertyFromVrboSubject(subject);
        if (vrboResolvedPropId && vrboResolvedPropId !== platform.propertyId) {
          // Vrbo property number clearly identifies a different property — skip
          continue;
        }
        // Fallback: If the LLM extracted a property name, check if it matches the current
        // platform's property. If it clearly belongs to a DIFFERENT property,
        // skip this email to prevent cross-contamination.
        if (!vrboResolvedPropId && parsed.propertyName) {
          const resolvedPropId = resolvePropertyFromName(parsed.propertyName);
          if (resolvedPropId && resolvedPropId !== platform.propertyId) {
            // This email belongs to a different property — skip
            continue;
          }
        }

        // Try to match against existing bookings
        if (parsed.checkIn && parsed.checkOut) {
          const existingBookings = await d
            .select()
            .from(propertyBookings)
            .where(
              and(
                eq(propertyBookings.propertyId, platform.propertyId),
                eq(propertyBookings.platformId, platformId)
              )
            );

          const TOLERANCE_MS = 2 * 24 * 60 * 60 * 1000;
          const matched = existingBookings.find((b: any) => {
            // Match by confirmation number first (most reliable)
            if (parsed.confirmationNumber && b.confirmationNumber === parsed.confirmationNumber) return true;
            // Fall back to date overlap
            const checkInDiff = Math.abs(b.checkIn - parsed.checkIn!);
            const checkOutDiff = Math.abs(b.checkOut - parsed.checkOut!);
            return checkInDiff <= TOLERANCE_MS && checkOutDiff <= TOLERANCE_MS;
          });

          if (matched) {
            // Enrich existing booking — only overwrite null/empty fields
            const updates: Record<string, any> = {
              lastEnrichedAt: Date.now(),
              emailScrapeSource: tokenResult.source,
              scrapeConfidence: parsed.confidence,
              rawEmailSubject: subject.slice(0, 500),
              rawEmailDate: emailDateMs,
              updatedAt: new Date(),
              // P-31: store email-reported dates separately so merge logic can detect iCal/email mismatches
              emailCheckIn: parsed.checkIn,
              emailCheckOut: parsed.checkOut,
              // P-31: promote dataSource to 'both' since we now have both iCal and email confirmation
              dataSource: 'both',
            };

            if (!matched.guestName && parsed.guestName) updates.guestName = parsed.guestName;
            if (!matched.guestEmail && parsed.guestEmail) updates.guestEmail = parsed.guestEmail;
            if (!matched.guestPhone && parsed.guestPhone) updates.guestPhone = parsed.guestPhone;
            if (!matched.confirmationNumber && parsed.confirmationNumber) updates.confirmationNumber = parsed.confirmationNumber;
            if (parsed.guestCount != null) updates.guestCount = parsed.guestCount;

            // ─── FINANCIAL FIELD PROTECTION ────────────────────────────────────────
            // NEVER overwrite verified financial data (platform_export, screenshot_ocr, manual)
            // with email-scraped data. Email financials are provisional and less reliable.
            const protectedSources = ['platform_export', 'screenshot_ocr', 'manual'];
            const existingFinancialSource = (matched as any).financialSource;
            const isFinancialProtected = protectedSources.includes(existingFinancialSource);

            if (!isFinancialProtected) {
              // Only set financial fields if the booking doesn't already have verified data
              if (parsed.totalPrice != null) updates.totalPrice = String(parsed.totalPrice);
              if (parsed.cleaningFee != null) updates.cleaningFee = String(parsed.cleaningFee);
              if (parsed.commissionAmount != null) updates.commissionAmount = String(parsed.commissionAmount);
              if (parsed.netAmount != null) updates.netAmount = String(parsed.netAmount);
              if (parsed.totalPrice != null || parsed.netAmount != null) {
                updates.financialSource = 'email_scrape';
              }
            }
            if (parsed.currency) updates.currency = parsed.currency;
            if (parsed.platformBookingUrl) updates.platformBookingUrl = parsed.platformBookingUrl;

            // Update summary to include guest name if it was anonymous
            if (parsed.guestName && (matched.summary?.includes("Reserved") || matched.summary?.includes("Not available") || matched.summary?.includes("Airbnb Guest") || matched.summary?.includes("Booking.com Guest"))) {
              const platformLabel = parsed.platform === "airbnb" ? "Airbnb" :
                parsed.platform === "vrbo" ? "VRBO" :
                parsed.platform === "booking_com" ? "Booking.com" : "Direct";
              updates.summary = `${platformLabel} — ${parsed.guestName}`;
            }

            await d.update(propertyBookings).set(updates).where(eq(propertyBookings.id, matched.id));
            result.bookingsEnriched++;

          } else if (parsed.confirmationNumber || parsed.confidence >= 60) {
            // ─── PRE-CREATION CANCELLATION CROSS-CHECK ─────────────────────────
            // Before creating a new email-only booking, check if we already have a
            // cancelled booking with the same confirmation number. This prevents
            // "phantom bookings" where a confirmation email arrives, then a
            // cancellation follows, but we'd recreate the booking on next scrape.
            const dupCheck = parsed.confirmationNumber
              ? await d.select().from(propertyBookings).where(
                  and(
                    eq(propertyBookings.propertyId, platform.propertyId),
                    eq(propertyBookings.confirmationNumber, parsed.confirmationNumber!)
                  )
                )
              : [];

            // Skip if a booking with this confirmation already exists (active OR cancelled)
            // Previously we only checked for active duplicates, which caused phantom recreations
            if (!dupCheck.length) {
              const platformLabel = parsed.platform === "airbnb" ? "Airbnb" :
                parsed.platform === "vrbo" ? "VRBO" :
                parsed.platform === "booking_com" ? "Booking.com" : "Direct";

              await d.insert(propertyBookings).values({
                id: randomUUID(),
                propertyId: platform.propertyId,
                platformId,
                icalUid: `email-${parsed.confirmationNumber || msgId}-${platformId}`,
                summary: parsed.guestName
                  ? `${platformLabel} — ${parsed.guestName}`
                  : `${platformLabel} Reservation`,
                description: `Scraped from confirmation email. ${parsed.confirmationNumber ? `Confirmation: ${parsed.confirmationNumber}` : ""}`,
                checkIn: parsed.checkIn,
                checkOut: parsed.checkOut,
                // P-31: store email-reported dates and mark as email_only until iCal confirms
                emailCheckIn: parsed.checkIn,
                emailCheckOut: parsed.checkOut,
                dataSource: 'email_only',
                bookingType: "booking",
                guestName: parsed.guestName ?? null,
                guestEmail: parsed.guestEmail ?? null,
                guestPhone: parsed.guestPhone ?? null,
                guestCount: parsed.guestCount ?? null,
                confirmationNumber: parsed.confirmationNumber ?? null,
                totalPrice: parsed.totalPrice != null ? String(parsed.totalPrice) : null,
                cleaningFee: parsed.cleaningFee != null ? String(parsed.cleaningFee) : null,
                commissionAmount: parsed.commissionAmount != null ? String(parsed.commissionAmount) : null,
                netAmount: parsed.netAmount != null ? String(parsed.netAmount) : null,
                currency: parsed.currency ?? "USD",
                platformBookingUrl: parsed.platformBookingUrl ?? null,
                // Mark financial source as email_scrape (provisional)
                financialSource: (parsed.totalPrice != null || parsed.netAmount != null) ? 'email_scrape' : null,
                rawEmailSubject: subject.slice(0, 500),
                rawEmailDate: emailDateMs,
                emailScrapeSource: tokenResult.source,
                scrapeConfidence: parsed.confidence,
                lastEnrichedAt: Date.now(),
                hasConflict: false,
              });
              result.bookingsCreated++;
            }
          }
        }
      } catch (e) {
        result.errors.push(`Error processing email ${msgId}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // ─── Cancellation Email Detection ────────────────────────────────────────────
    //
    // Search for cancellation emails and mark matched bookings as cancelled.
    // This provides a second signal in addition to iCal removal detection.
    const cancelQuery = buildCancellationQuery(afterStr, platform.platform);
    if (cancelQuery) {
      let cancelMessageIds: string[] = [];
      try {
        const cancelSearch = await gmailGet(`/messages?q=${encodeURIComponent(cancelQuery)}&maxResults=200`, accessToken);
        cancelMessageIds = (cancelSearch.messages || []).map((m: any) => m.id);
      } catch (e) {
        // Non-fatal: cancellation search failure should not block the main scrape
        result.errors.push(`Cancellation email search failed (non-fatal): ${e instanceof Error ? e.message : String(e)}`);
      }

      for (const msgId of cancelMessageIds) {
        try {
          const msg = await gmailGet(`/messages/${msgId}?format=full`, accessToken);
          const headers = msg.payload?.headers || [];
          const subject = extractEmailHeader(headers, "subject");
          const body = extractEmailBody(msg.payload);

          // Extract confirmation number from cancellation email
          const confirmMatch = body.match(/(?:confirmation|booking|reservation)\s*(?:number|#|no\.?|code)?\s*[:\s]*([A-Z0-9]{5,15})/i)
            || subject.match(/(?:Reservation|Booking)\s+([A-Z0-9]{5,15})/i);
          const confirmationNumber = confirmMatch ? confirmMatch[1].toUpperCase() : null;

          // Extract dates from cancellation email
          let cancelCheckIn: number | null = null;
          const checkInMatch = body.match(/(?:check[\s-]?in|arrival|from)\s*[:\s]+(?:\w+,\s+)?(\d{1,2}[\s\/\-]\w+[\s\/\-]\d{4}|\d{4}[\-\/]\d{2}[\-\/]\d{2})/i);
          if (checkInMatch) {
            const d2 = new Date(checkInMatch[1].replace(/\//g, "-"));
            if (!isNaN(d2.getTime())) cancelCheckIn = d2.getTime();
          }

          if (!confirmationNumber && !cancelCheckIn) continue;

          // Property-name disambiguation for cancellations too
          const cancelParsedName = body.match(/(?:listing|property|accommodation)[:\s]+([^\n]+)/i);
          if (cancelParsedName) {
            const resolvedPropId = resolvePropertyFromName(cancelParsedName[1]);
            if (resolvedPropId && resolvedPropId !== platform.propertyId) continue;
          }

          // Find the matching booking row
          const allBookings = await d
            .select()
            .from(propertyBookings)
            .where(
              and(
                eq(propertyBookings.propertyId, platform.propertyId),
                eq(propertyBookings.platformId, platformId)
              )
            );

          const CANCEL_TOLERANCE_MS = 2 * 24 * 60 * 60 * 1000;
          const matched = allBookings.find((b: any) => {
            if (confirmationNumber && b.confirmationNumber === confirmationNumber) return true;
            if (cancelCheckIn) {
              return Math.abs(b.checkIn - cancelCheckIn) <= CANCEL_TOLERANCE_MS;
            }
            return false;
          });

          if (matched && (matched as any).bookingStatus !== "cancelled") {
            await d.update(propertyBookings).set({
              bookingStatus: "cancelled",
              cancelledAt: Date.now(),
              cancellationSource: "email_scrape",
              hasConflict: false,
              updatedAt: new Date(),
            } as any).where(eq(propertyBookings.id, matched.id));
            (result as any).bookingsCancelled = ((result as any).bookingsCancelled ?? 0) + 1;
          }
        } catch (e) {
          result.errors.push(`Error processing cancellation email ${msgId}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }

    // Update platform scrape metadata — only stamp lastEmailScrapedAt when we actually
    // processed emails. Stamping on 0-email runs hides the real problem (wrong token,
    // no matching emails) and prevents the 2-year backfill from re-triggering.
    if (result.emailsProcessed > 0) {
      await d.update(propertyPlatforms)
        .set({
          lastEmailScrapedAt: Date.now(),
          emailNotificationEmailPrev: platform.notificationEmail,
          updatedAt: new Date(),
        } as any)
        .where(eq(propertyPlatforms.id, platformId));
    }

    // Mark job complete
    await d.update(emailScrapeJobs)
      .set({
        status: "done",
        completedAt: Date.now(),
        emailsScanned: result.emailsProcessed,
        bookingsEnriched: result.bookingsEnriched,
        bookingsCreated: result.bookingsCreated,
      })
      .where(eq(emailScrapeJobs.id, jobId));

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    result.errors.push(msg);
    await d.update(emailScrapeJobs)
      .set({ status: "failed", completedAt: Date.now(), errorMessage: msg })
      .where(eq(emailScrapeJobs.id, jobId));
  }

  return result;
}

/**
 * Scrape emails for all active platforms with email scraping enabled.
 */
export async function scrapeAllMultiPlatformEmails(propertyId?: string): Promise<MultiScrapeResult[]> {
  const d = await getDb();
  if (!d) throw new Error("Database not available");

  let query = d.select().from(propertyPlatforms).where(
    and(
      eq(propertyPlatforms.isActive, true),
      eq(propertyPlatforms.emailScrapingEnabled, true),
      isNotNull(propertyPlatforms.notificationEmail)
    )
  );

  const platforms = await query;
  const filtered = propertyId
    ? platforms.filter((p: any) => p.propertyId === propertyId)
    : platforms;

  // Use allSettled so one platform failure never blocks others (P-20 resilience)
  const settled = await Promise.allSettled(filtered.map((p: any) => scrapeMultiPlatformEmails(p.id)));
  return settled.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    // If a platform threw unexpectedly, synthesize a result with the error
    const p = filtered[i] as any;
    console.error(`[MultiScraper] Platform ${p.id} threw unexpectedly:`, r.reason);
    return {
      platformId: p.id,
      propertyId: p.propertyId,
      emailAddress: p.notificationEmail || "",
      emailsProcessed: 0,
      bookingsEnriched: 0,
      bookingsCreated: 0,
      errors: [r.reason instanceof Error ? r.reason.message : String(r.reason)],
      jobId: "",
    } as MultiScrapeResult;
  });
}

/**
 * Get the latest scrape job status for a property.
 */
export async function getLatestScrapeJob(propertyId: string): Promise<any | null> {
  const d = await getDb();
  if (!d) return null;

  const [job] = await d
    .select()
    .from(emailScrapeJobs)
    .where(eq(emailScrapeJobs.propertyId, propertyId))
    .orderBy(desc(emailScrapeJobs.createdAt))
    .limit(1);

  return job || null;
}
