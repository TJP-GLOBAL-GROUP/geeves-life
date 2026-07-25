/**
 * Booking.com Email Scraper
 *
 * Searches Gmail for Booking.com reservation confirmation emails and enriches
 * property_bookings rows with guest name, confirmation number, and exact dates.
 *
 * Why this is needed:
 * Booking.com's iCal feed exports ALL blocks (reservations + manual closures) as
 * "CLOSED - Not available" with no guest details. This service cross-references
 * the Gmail inbox to fill in the missing information.
 *
 * Flow:
 * 1. For each active Booking.com platform with notificationEmail + emailScrapingEnabled
 * 2. Fetch a Gmail OAuth token for that email address
 * 3. Search Gmail for Booking.com confirmation emails since lastEmailScrapedAt
 * 4. Parse each email for: guest name, confirmation number, check-in, check-out, property name
 * 5. Match against existing property_bookings rows by date overlap
 * 6. Enrich matched rows with guest details; create new rows for unmatched bookings
 * 7. Update lastEmailScrapedAt on the platform
 */

import * as db from "../db";
import { getDb } from "../db";
import { propertyBookings, propertyPlatforms } from "../../drizzle/schema";
import { eq, and, isNotNull } from "drizzle-orm";
import { randomUUID } from "crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ScrapedBooking {
  confirmationNumber: string;
  guestName: string;
  checkIn: number;   // UTC ms
  checkOut: number;  // UTC ms
  propertyName?: string;
  rawEmailId: string;
  // Financial fields
  totalPrice?: number;       // Gross booking value (what guest paid)
  commissionAmount?: number; // Platform fee
  netAmount?: number;        // What you receive (totalPrice - commissionAmount)
  currency?: string;         // ISO 4217 currency code
}

export interface ScrapeResult {
  platformId: string;
  propertyId: string;
  emailsProcessed: number;
  bookingsEnriched: number;
  bookingsCreated: number;
  errors: string[];
}

// ─── Date parsing helper ─────────────────────────────────────────────────────

/**
 * C-03: Parse a booking date string to UTC midnight milliseconds.
 * Always appends T00:00:00Z to force UTC midnight regardless of server timezone.
 * Handles formats: YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, "21 June 2026", "Jun 21, 2026"
 */
function parseBookingDate(raw: string): number | null {
  const s = raw.trim().replace(/\//g, "-");
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(s + "T00:00:00Z");
    return isNaN(d.getTime()) ? null : d.getTime();
  }
  // DD-MM-YYYY → YYYY-MM-DD
  const dmy = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dmy) {
    const d = new Date(`${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}T00:00:00Z`);
    return isNaN(d.getTime()) ? null : d.getTime();
  }
  // Natural language: "21 June 2026" or "Jun 21, 2026" or "June 21 2026"
  // Let Date.parse handle it but force UTC by appending 00:00:00 UTC
  const parsed = Date.parse(s + " 00:00:00 UTC");
  if (!isNaN(parsed)) return parsed;
  // Last resort: native parse — normalise to YYYY-MM-DD then force UTC midnight
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  // Re-normalise to UTC midnight to avoid server timezone drift
  const iso = d.toISOString().slice(0, 10);
  return new Date(iso + "T00:00:00Z").getTime();
}

// ─── Gmail API helpers ────────────────────────────────────────────────────────

const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

async function gmailGet(path: string, accessToken: string) {
  const res = await fetch(`${GMAIL_BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gmail API ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

function base64UrlDecode(str: string): string {
  // Gmail uses URL-safe base64
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const decoded = Buffer.from(padded, "base64").toString("utf-8");
  return decoded;
}

function extractEmailBody(payload: any): string {
  if (!payload) return "";
  // Prefer text/plain parts
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return base64UrlDecode(payload.body.data);
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      const text = extractEmailBody(part);
      if (text) return text;
    }
  }
  // Fall back to HTML if no plain text
  if (payload.mimeType === "text/html" && payload.body?.data) {
    const html = base64UrlDecode(payload.body.data);
    // Strip HTML tags for basic text extraction
    return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  }
  return "";
}

// ─── Booking.com email parser ─────────────────────────────────────────────────

/**
 * Parse a Booking.com confirmation email body to extract booking details.
 * Booking.com sends emails in multiple formats; we try several patterns.
 */
export function parseBookingComEmail(body: string): Partial<ScrapedBooking> | null {
  const result: Partial<ScrapedBooking> = {};

  // Confirmation number — Booking.com uses "Confirmation number: XXXXXXXXX" or "Booking number: XXXXXXXXX"
  const confirmMatch = body.match(/(?:confirmation|booking|reservation)\s+(?:number|#|no\.?)\s*[:\s]*([A-Z0-9]{6,12})/i);
  if (confirmMatch) result.confirmationNumber = confirmMatch[1].toUpperCase();

  // Guest name — "Guest name: John Smith" or "Booked by: John Smith"
  const guestMatch = body.match(/(?:guest\s+name|booked\s+by|guest)\s*[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/);
  if (guestMatch) result.guestName = guestMatch[1].trim();

  // Check-in date — "Check-in: Friday, 20 June 2026" or "Arrival: 20/06/2026"
  const checkInMatch = body.match(
    /(?:check[\s-]?in|arrival)\s*[:\s]+(?:\w+,\s+)?(\d{1,2}[\s\/\-]\w+[\s\/\-]\d{4}|\d{4}[\-\/]\d{2}[\-\/]\d{2})/i
  );
  if (checkInMatch) {
    const d = parseBookingDate(checkInMatch[1]);
    if (d !== null) result.checkIn = d;
  }

  // Check-out date — "Check-out: Saturday, 21 June 2026" or "Departure: 21/06/2026"
  const checkOutMatch = body.match(
    /(?:check[\s-]?out|departure)\s*[:\s]+(?:\w+,\s+)?(\d{1,2}[\s\/\-]\w+[\s\/\-]\d{4}|\d{4}[\-\/]\d{2}[\-\/]\d{2})/i
  );
  if (checkOutMatch) {
    const d = parseBookingDate(checkOutMatch[1]);
    if (d !== null) result.checkOut = d;
  }

  // Property name — "Property: Morabeza" or "Accommodation: Morabeza"
  const propMatch = body.match(/(?:property|accommodation|apartment|room)\s*[:\s]+([^\n\r]{3,60})/i);
  if (propMatch) result.propertyName = propMatch[1].trim();

  // ─── Financial fields ────────────────────────────────────────────────────────
  // Currency — detect currency symbol or code in the email
  const currencyMatch = body.match(/\b(USD|EUR|GBP|JMD|CAD|AUD|BBD)\b/i)
    || body.match(/(\$|€|£|¥)/);
  if (currencyMatch) {
    const sym = currencyMatch[1];
    const symbolMap: Record<string, string> = { "$": "USD", "€": "EUR", "£": "GBP", "¥": "JPY" };
    (result as any).currency = symbolMap[sym] ?? sym.toUpperCase();
  }

  // Total price — "Total price: $350.00" / "Total amount: USD 350" / "Grand total: 350.00"
  const totalMatch = body.match(
    /(?:total\s+(?:price|amount|charge|cost)|grand\s+total|amount\s+due)\s*[:\s]*(?:USD|EUR|GBP|JMD|\$|€|£)?\s*([\d,]+\.?\d*)/i
  );
  if (totalMatch) (result as any).totalPrice = parseFloat(totalMatch[1].replace(/,/g, ""));

  // Commission / platform fee — "Commission: $52.50" / "Service fee: $52.50" / "Booking.com fee: 15%"
  const commissionMatch = body.match(
    /(?:commission|platform\s+fee|booking\.com\s+fee|service\s+fee)\s*[:\s]*(?:USD|EUR|GBP|JMD|\$|€|£)?\s*([\d,]+\.?\d*)/i
  );
  if (commissionMatch) (result as any).commissionAmount = parseFloat(commissionMatch[1].replace(/,/g, ""));

  // Net payout — "You will receive: $297.50" / "Net amount: $297.50" / "Payout: $297.50"
  const netMatch = body.match(
    /(?:you\s+will\s+receive|net\s+(?:amount|payout|revenue)|payout|your\s+earnings?)\s*[:\s]*(?:USD|EUR|GBP|JMD|\$|€|£)?\s*([\d,]+\.?\d*)/i
  );
  if (netMatch) (result as any).netAmount = parseFloat(netMatch[1].replace(/,/g, ""));

  // Derive missing financial field if two of three are known
  const fp = result as any;
  if (fp.totalPrice && fp.commissionAmount && !fp.netAmount) {
    fp.netAmount = Math.round((fp.totalPrice - fp.commissionAmount) * 100) / 100;
  } else if (fp.totalPrice && fp.netAmount && !fp.commissionAmount) {
    fp.commissionAmount = Math.round((fp.totalPrice - fp.netAmount) * 100) / 100;
  } else if (fp.commissionAmount && fp.netAmount && !fp.totalPrice) {
    fp.totalPrice = Math.round((fp.commissionAmount + fp.netAmount) * 100) / 100;
  }

  // Require at minimum a confirmation number and check-in date to be useful
  if (!result.confirmationNumber && !result.checkIn) return null;

  return result;
}

// ─── Airbnb email parser ─────────────────────────────────────────────────────

/**
 * Parse an Airbnb confirmation email body to extract booking details.
 * Airbnb sends from automated@airbnb.com with subject "Reservation confirmed".
 */
export function parseAirbnbEmail(body: string): Partial<ScrapedBooking> | null {
  const result: Partial<ScrapedBooking> = {};

  // Confirmation code — Airbnb uses "Confirmation code: HMXXXXXXXX" (alphanumeric, 8-12 chars)
  const confirmMatch = body.match(/(?:confirmation\s+code|reservation\s+code)\s*[:\s]*([A-Z0-9]{6,14})/i);
  if (confirmMatch) result.confirmationNumber = confirmMatch[1].toUpperCase();

  // Guest name — "Hi [Name]," or "Guest: John Smith" or "Hosted by ... for John Smith"
  const guestMatch = body.match(/(?:guest\s*[:\s]+|reserved\s+for\s+|booked\s+by\s+)([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/)
    || body.match(/^Hi\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),/m);
  if (guestMatch) result.guestName = guestMatch[1].trim();

  // Check-in — "Check-in: Fri, Jun 20, 2026" or "Check-in Jun 20, 2026"
  const checkInMatch = body.match(
    /(?:check[\s-]?in|arrival)\s*[:\s]+(?:\w+,\s+)?([A-Za-z]+\.?\s+\d{1,2},?\s+\d{4}|\d{1,2}[\s\/\-]\w+[\s\/\-]\d{4}|\d{4}[\-\/]\d{2}[\-\/]\d{2})/i
  );
  if (checkInMatch) {
    const d = parseBookingDate(checkInMatch[1]);
    if (d !== null) result.checkIn = d;
  }

  // Check-out — "Checkout: Sat, Jun 21, 2026"
  const checkOutMatch = body.match(
    /(?:check[\s-]?out|checkout|departure)\s*[:\s]+(?:\w+,\s+)?([A-Za-z]+\.?\s+\d{1,2},?\s+\d{4}|\d{1,2}[\s\/\-]\w+[\s\/\-]\d{4}|\d{4}[\-\/]\d{2}[\-\/]\d{2})/i
  );
  if (checkOutMatch) {
    const d = parseBookingDate(checkOutMatch[1]);
    if (d !== null) result.checkOut = d;
  }

  // Property name — "You're going to [Property Name]"
  const propMatch = body.match(/(?:going\s+to|staying\s+at|listing\s*[:\s]+)([^\n\r]{3,60})/i);
  if (propMatch) result.propertyName = propMatch[1].trim();

  // Financial — Airbnb sends "Total (USD): $350.00" and "Airbnb service fee: $35.00"
  const currencyMatch = body.match(/\b(USD|EUR|GBP|JMD|CAD|AUD|BBD)\b/i) || body.match(/(\$|€|£)/);
  if (currencyMatch) {
    const sym = currencyMatch[1];
    const symbolMap: Record<string, string> = { "$": "USD", "€": "EUR", "£": "GBP" };
    (result as any).currency = symbolMap[sym] ?? sym.toUpperCase();
  }

  const totalMatch = body.match(/(?:total|amount\s+charged|total\s+\([A-Z]{3}\))\s*[:\s]*(?:USD|EUR|GBP|JMD|\$|€|£)?\s*([\d,]+\.?\d*)/i);
  if (totalMatch) (result as any).totalPrice = parseFloat(totalMatch[1].replace(/,/g, ""));

  const feeMatch = body.match(/(?:airbnb\s+service\s+fee|service\s+fee|host\s+service\s+fee)\s*[:\s]*(?:USD|EUR|GBP|JMD|\$|€|£)?\s*([\d,]+\.?\d*)/i);
  if (feeMatch) (result as any).commissionAmount = parseFloat(feeMatch[1].replace(/,/g, ""));

  const payoutMatch = body.match(/(?:your\s+payout|host\s+payout|you\s+earn|you\s+will\s+receive)\s*[:\s]*(?:USD|EUR|GBP|JMD|\$|€|£)?\s*([\d,]+\.?\d*)/i);
  if (payoutMatch) (result as any).netAmount = parseFloat(payoutMatch[1].replace(/,/g, ""));

  const fp = result as any;
  if (fp.totalPrice && fp.commissionAmount && !fp.netAmount) fp.netAmount = Math.round((fp.totalPrice - fp.commissionAmount) * 100) / 100;
  else if (fp.totalPrice && fp.netAmount && !fp.commissionAmount) fp.commissionAmount = Math.round((fp.totalPrice - fp.netAmount) * 100) / 100;

  if (!result.confirmationNumber && !result.checkIn) return null;
  return result;
}

// ─── VRBO / HomeAway email parser ─────────────────────────────────────────────

/**
 * Parse a VRBO/HomeAway confirmation email body to extract booking details.
 * VRBO sends from noreply@vrbo.com with subject "Booking Confirmed" or "Reservation Confirmed".
 */
export function parseVrboEmail(body: string): Partial<ScrapedBooking> | null {
  const result: Partial<ScrapedBooking> = {};

  // Confirmation number — VRBO uses "Confirmation #: HA-XXXXXXXX" or "Booking ID: XXXXXXXX"
  const confirmMatch = body.match(/(?:confirmation\s*#?|booking\s+id|reservation\s+id|reservation\s+number)\s*[:\s]*([A-Z0-9\-]{5,16})/i);
  if (confirmMatch) result.confirmationNumber = confirmMatch[1].toUpperCase().replace(/^HA-/, "");

  // Guest name — "Traveler: John Smith" or "Guest: John Smith"
  const guestMatch = body.match(/(?:traveler|traveller|guest|renter)\s*[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i);
  if (guestMatch) result.guestName = guestMatch[1].trim();

  // Check-in
  const checkInMatch = body.match(
    /(?:check[\s-]?in|arrival|from)\s*[:\s]+(?:\w+,\s+)?([A-Za-z]+\.?\s+\d{1,2},?\s+\d{4}|\d{1,2}[\s\/\-]\w+[\s\/\-]\d{4}|\d{4}[\-\/]\d{2}[\-\/]\d{2})/i
  );
  if (checkInMatch) {
    const d = parseBookingDate(checkInMatch[1]);
    if (d !== null) result.checkIn = d;
  }

  // Check-out
  const checkOutMatch = body.match(
    /(?:check[\s-]?out|checkout|departure|to)\s*[:\s]+(?:\w+,\s+)?([A-Za-z]+\.?\s+\d{1,2},?\s+\d{4}|\d{1,2}[\s\/\-]\w+[\s\/\-]\d{4}|\d{4}[\-\/]\d{2}[\-\/]\d{2})/i
  );
  if (checkOutMatch) {
    const d = parseBookingDate(checkOutMatch[1]);
    if (d !== null) result.checkOut = d;
  }

  // Property name — "Property: Villa Morabeza"
  const propMatch = body.match(/(?:property|rental|listing|vacation\s+rental)\s*[:\s]+([^\n\r]{3,60})/i);
  if (propMatch) result.propertyName = propMatch[1].trim();

  // Financial
  const currencyMatch = body.match(/\b(USD|EUR|GBP|JMD|CAD|AUD)\b/i) || body.match(/(\$|€|£)/);
  if (currencyMatch) {
    const sym = currencyMatch[1];
    const symbolMap: Record<string, string> = { "$": "USD", "€": "EUR", "£": "GBP" };
    (result as any).currency = symbolMap[sym] ?? sym.toUpperCase();
  }

  const totalMatch = body.match(/(?:total\s+(?:price|charge|amount)|amount\s+due|rental\s+total)\s*[:\s]*(?:USD|EUR|GBP|JMD|\$|€|£)?\s*([\d,]+\.?\d*)/i);
  if (totalMatch) (result as any).totalPrice = parseFloat(totalMatch[1].replace(/,/g, ""));

  const feeMatch = body.match(/(?:vrbo\s+service\s+fee|homeaway\s+service\s+fee|service\s+fee|traveler\s+service\s+fee)\s*[:\s]*(?:USD|EUR|GBP|JMD|\$|€|£)?\s*([\d,]+\.?\d*)/i);
  if (feeMatch) (result as any).commissionAmount = parseFloat(feeMatch[1].replace(/,/g, ""));

  const payoutMatch = body.match(/(?:owner\s+payout|your\s+payout|host\s+payout|you\s+receive)\s*[:\s]*(?:USD|EUR|GBP|JMD|\$|€|£)?\s*([\d,]+\.?\d*)/i);
  if (payoutMatch) (result as any).netAmount = parseFloat(payoutMatch[1].replace(/,/g, ""));

  const fp = result as any;
  if (fp.totalPrice && fp.commissionAmount && !fp.netAmount) fp.netAmount = Math.round((fp.totalPrice - fp.commissionAmount) * 100) / 100;
  else if (fp.totalPrice && fp.netAmount && !fp.commissionAmount) fp.commissionAmount = Math.round((fp.totalPrice - fp.netAmount) * 100) / 100;

  if (!result.confirmationNumber && !result.checkIn) return null;
  return result;
}

// ─── Platform config ──────────────────────────────────────────────────────────

interface PlatformEmailConfig {
  confirmationQuery: string;
  cancellationQuery: string;
  parser: (body: string) => Partial<ScrapedBooking> | null;
}

function getPlatformEmailConfig(platformType: string, afterStr: string): PlatformEmailConfig | null {
  switch (platformType) {
    case "booking_com":
      return {
        confirmationQuery: `from:(noreply@booking.com OR reservations@booking.com OR no-reply@booking.com) subject:(reservation OR booking OR confirmation) after:${afterStr}`,
        cancellationQuery: `from:(noreply@booking.com OR reservations@booking.com OR no-reply@booking.com) subject:(cancell) after:${afterStr}`,
        parser: parseBookingComEmail,
      };
    case "airbnb":
      return {
        confirmationQuery: `from:(automated@airbnb.com OR no-reply@airbnb.com OR noreply@airbnb.com) subject:(reservation confirmed OR booking confirmed OR confirmed reservation) after:${afterStr}`,
        cancellationQuery: `from:(automated@airbnb.com OR no-reply@airbnb.com OR noreply@airbnb.com) subject:(cancell) after:${afterStr}`,
        parser: parseAirbnbEmail,
      };
    case "vrbo":
      return {
        confirmationQuery: `from:(noreply@vrbo.com OR noreply@homeaway.com OR reservations@vrbo.com) subject:(booking confirmed OR reservation confirmed OR confirmed) after:${afterStr}`,
        cancellationQuery: `from:(noreply@vrbo.com OR noreply@homeaway.com OR reservations@vrbo.com) subject:(cancell) after:${afterStr}`,
        parser: parseVrboEmail,
      };
    default:
      return null;
  }
}

// ─── Main scraping function ───────────────────────────────────────────────────

/**
 * Scrape Booking.com confirmation emails for a single platform.
 */
export async function scrapeBookingEmails(platformId: string): Promise<ScrapeResult> {
  const d = await getDb();
  if (!d) throw new Error("Database not available");

  const [platform] = await d
    .select()
    .from(propertyPlatforms)
    .where(eq(propertyPlatforms.id, platformId))
    .limit(1);

  if (!platform) throw new Error(`Platform ${platformId} not found`);
  if (!platform.notificationEmail) throw new Error(`Platform ${platformId} has no notification email configured`);
  const SUPPORTED_PLATFORMS = ["booking_com", "airbnb", "vrbo"];
  if (!SUPPORTED_PLATFORMS.includes(platform.platform)) {
    throw new Error(`Email scraping only supported for: ${SUPPORTED_PLATFORMS.join(", ")}. Got: ${platform.platform}`);
  }

  const result: ScrapeResult = {
    platformId,
    propertyId: platform.propertyId,
    emailsProcessed: 0,
    bookingsEnriched: 0,
    bookingsCreated: 0,
    errors: [],
  };

  // Get OAuth token for the notification email
  // We need to find the memberId — look up via the property's household
  const property = await db.getPropertyById(platform.propertyId);
  if (!property) throw new Error(`Property ${platform.propertyId} not found`);

  const members = await db.getHouseholdMembers(property.householdId);
  if (!members.length) throw new Error(`No household members found for property ${platform.propertyId}`);

  let accessToken: string | null = null;
  for (const member of members) {
    const token = await db.getOAuthTokenByEmail(member.id, "google", platform.notificationEmail);
    if (token?.accessToken) {
      // P-09 scope guard: fail fast with actionable error if gmail.readonly is missing
      const scopes = (token.scopes || "").split(" ");
      const hasGmailRead = scopes.some(s =>
        s === "https://www.googleapis.com/auth/gmail.readonly" || s === "gmail.readonly"
      );
      if (!hasGmailRead) {
        result.errors.push(
          `Account ${platform.notificationEmail} is missing the gmail.readonly permission. ` +
          `Go to Settings → Integrations, find this account, and click Reconnect — ` +
          `make sure "Email Scraping" is checked as a purpose.`
        );
        return result;
      }
      // Check if token is still valid or needs refresh
      const expiresAt = token.expiresAt ? new Date(token.expiresAt).getTime() : 0;
      if (expiresAt > Date.now() + 5 * 60 * 1000) {
        accessToken = token.accessToken;
      } else if (token.refreshToken) {
        // Attempt refresh
        try {
          const { refreshAccessToken } = await import("../services/googleCalendarSync");
          const refreshed = await refreshAccessToken(token.refreshToken);
          accessToken = refreshed.accessToken;
        } catch (e) {
          result.errors.push(`Token refresh failed for ${platform.notificationEmail}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      break;
    }
  }

  if (!accessToken) {
    result.errors.push(`No valid Gmail access token for ${platform.notificationEmail}. Please connect this account in Settings → Accounts.`);
    return result;
  }

  // Build Gmail search query
  // On first scrape (no lastEmailScrapedAt) OR when notification email has changed: go back 2 years
  // to capture all historical bookings. On subsequent runs: incremental from lastEmailScrapedAt.
  const TWO_YEARS_MS = 2 * 365 * 24 * 60 * 60 * 1000;
  const emailChanged = (platform as any).emailNotificationEmailPrev &&
    (platform as any).emailNotificationEmailPrev !== platform.notificationEmail;
  const isFirstScrape = !platform.lastEmailScrapedAt;
  const sinceMs = (isFirstScrape || emailChanged)
    ? Date.now() - TWO_YEARS_MS
    : platform.lastEmailScrapedAt!;
  const sinceDate = new Date(sinceMs);
  const afterStr = `${sinceDate.getFullYear()}/${String(sinceDate.getMonth() + 1).padStart(2, "0")}/${String(sinceDate.getDate()).padStart(2, "0")}`;
  const platformConfig = getPlatformEmailConfig(platform.platform, afterStr);
  if (!platformConfig) throw new Error(`No email config for platform: ${platform.platform}`);
  const query = platformConfig.confirmationQuery;

  // Paginate through all Gmail results (500 max per page, loop until no nextPageToken)
  let messageIds: string[] = [];
  try {
    let pageToken: string | undefined;
    do {
      const url = `/messages?q=${encodeURIComponent(query)}&maxResults=500${
        pageToken ? `&pageToken=${pageToken}` : ""
      }`;
      const searchResult = await gmailGet(url, accessToken);
      const page: string[] = (searchResult.messages || []).map((m: any) => m.id);
      messageIds.push(...page);
      pageToken = searchResult.nextPageToken;
      // Safety cap: 2000 emails max to avoid runaway scrapes
      if (messageIds.length >= 2000) break;
    } while (pageToken);
  } catch (e) {
    result.errors.push(`Gmail search failed: ${e instanceof Error ? e.message : String(e)}`);
    return result;
  }

  // Process each email
  for (const msgId of messageIds) {
    try {
      const msg = await gmailGet(`/messages/${msgId}?format=full`, accessToken);
      const body = extractEmailBody(msg.payload);
      const parsed = platformConfig.parser(body);
      result.emailsProcessed++;

      if (!parsed) continue;

      // Try to match against existing bookings by date overlap
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

        // Find the booking whose date range overlaps with the parsed dates
        const TOLERANCE_MS = 2 * 24 * 60 * 60 * 1000; // 2-day tolerance for back-to-back merges
        const matched = existingBookings.find((b: any) => {
          const checkInDiff = Math.abs(b.checkIn - parsed.checkIn!);
          const checkOutDiff = Math.abs(b.checkOut - parsed.checkOut!);
          return checkInDiff <= TOLERANCE_MS && checkOutDiff <= TOLERANCE_MS;
        });

        if (matched) {
          // Enrich existing booking
          const fp = parsed as any;
          await d
            .update(propertyBookings)
            .set({
              summary: parsed.guestName
                ? `Booking.com — ${parsed.guestName}`
                : matched.summary,
              guestName: parsed.guestName ?? matched.guestName,
              confirmationNumber: parsed.confirmationNumber ?? matched.confirmationNumber,
              ...(fp.totalPrice != null && { totalPrice: String(fp.totalPrice) }),
              ...(fp.commissionAmount != null && { commissionAmount: String(fp.commissionAmount) }),
              ...(fp.netAmount != null && { netAmount: String(fp.netAmount) }),
              ...(fp.currency && { currency: fp.currency }),
              updatedAt: new Date(),
            })
            .where(eq(propertyBookings.id, matched.id));
          result.bookingsEnriched++;
        } else if (parsed.confirmationNumber) {
          // Check if this confirmation number already exists
          const existing = await d
            .select()
            .from(propertyBookings)
            .where(
              and(
                eq(propertyBookings.propertyId, platform.propertyId),
                eq(propertyBookings.platformId, platformId),
                eq(propertyBookings.confirmationNumber, parsed.confirmationNumber)
              )
            )
            .limit(1);

          if (!existing.length) {
            // Create new booking from email (not yet in iCal)
            await d.insert(propertyBookings).values({
              id: randomUUID(),
              propertyId: platform.propertyId,
              platformId,
              icalUid: `email-${parsed.confirmationNumber}-${platformId}`,
              summary: parsed.guestName
                ? `Booking.com — ${parsed.guestName}`
                : "Booking.com Reservation",
              description: `Scraped from confirmation email. Confirmation: ${parsed.confirmationNumber}`,
              checkIn: parsed.checkIn,
              checkOut: parsed.checkOut,
              bookingType: "booking",
              guestName: parsed.guestName ?? null,
              confirmationNumber: parsed.confirmationNumber ?? null,
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

  // ─── Cancellation Email Detection ────────────────────────────────────────────────
  //
  // Booking.com sends a separate cancellation email when a guest cancels.
  // Subject patterns: "Cancellation of reservation", "Your reservation has been cancelled",
  //                   "Reservation cancelled", "Booking cancelled"
  // We search for these emails and mark matched bookings as cancelled.
  // This is a second signal in addition to the iCal removal detection in aggregatePlatformICal.
  const cancelQuery = platformConfig.cancellationQuery;
  let cancelMessageIds: string[] = [];
  try {
    const cancelSearch = await gmailGet(`/messages?q=${encodeURIComponent(cancelQuery)}&maxResults=200`, accessToken);
    cancelMessageIds = (cancelSearch.messages || []).map((m: any) => m.id);
  } catch (e) {
    // Non-fatal: cancellation email search failure should not block the main scrape
    result.errors.push(`Cancellation email search failed (non-fatal): ${e instanceof Error ? e.message : String(e)}`);
  }

  for (const msgId of cancelMessageIds) {
    try {
      const msg = await gmailGet(`/messages/${msgId}?format=full`, accessToken);
      const body = extractEmailBody(msg.payload);

      // Extract confirmation number from cancellation email
      const confirmMatch = body.match(/(?:confirmation|booking|reservation)\s+(?:number|#|no\.?)\s*[:\s]*([A-Z0-9]{6,12})/i);
      const confirmationNumber = confirmMatch ? confirmMatch[1].toUpperCase() : null;

      // Extract dates from cancellation email (same patterns as confirmation)
      let checkIn: number | null = null;
      let checkOut: number | null = null;
      const checkInMatch = body.match(/(?:check[\s-]?in|arrival)\s*[:\s]+(?:\w+,\s+)?(\d{1,2}[\s\/\-]\w+[\s\/\-]\d{4}|\d{4}[\-\/]\d{2}[\-\/]\d{2})/i);
      if (checkInMatch) { const d = parseBookingDate(checkInMatch[1]); if (d !== null) checkIn = d; }
      const checkOutMatch = body.match(/(?:check[\s-]?out|departure)\s*[:\s]+(?:\w+,\s+)?(\d{1,2}[\s\/\-]\w+[\s\/\-]\d{4}|\d{4}[\-\/]\d{2}[\-\/]\d{2})/i);
      if (checkOutMatch) { const d = parseBookingDate(checkOutMatch[1]); if (d !== null) checkOut = d; }

      if (!confirmationNumber && !checkIn) continue;

      // Find the matching booking row
      const allBookings = await d
        .select()
        .from(propertyBookings)
        .where(
          and(
            eq(propertyBookings.propertyId, platform.propertyId),
            eq(propertyBookings.platformId, platformId),
            eq(propertyBookings.bookingStatus, "confirmed"),
          )
        );

      const TOLERANCE_MS = 2 * 24 * 60 * 60 * 1000;
      const matched = allBookings.find((b: any) => {
        if (confirmationNumber && b.confirmationNumber === confirmationNumber) return true;
        if (checkIn && checkOut) {
          return Math.abs(b.checkIn - checkIn) <= TOLERANCE_MS && Math.abs(b.checkOut - checkOut) <= TOLERANCE_MS;
        }
        return false;
      });

      if (matched) {
        await d
          .update(propertyBookings)
          .set({
            bookingStatus: "cancelled",
            cancelledAt: Date.now(),
            cancellationSource: "email_scrape",
            hasConflict: false,
            conflictWith: undefined,
            updatedAt: new Date(),
          } as any)
          .where(eq(propertyBookings.id, matched.id));
        (result as any).bookingsCancelled = ((result as any).bookingsCancelled ?? 0) + 1;
      }
    } catch (e) {
      result.errors.push(`Error processing cancellation email ${msgId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Update lastEmailScrapedAt and store current notificationEmail as prev
  // so future runs can detect email address changes and trigger a full re-scrape
  await d
    .update(propertyPlatforms)
    .set({
      lastEmailScrapedAt: Date.now(),
      emailNotificationEmailPrev: platform.notificationEmail,
      updatedAt: new Date(),
    } as any)
    .where(eq(propertyPlatforms.id, platformId));

  return result;
}

/**
 * Scrape emails for all active platforms with email scraping enabled.
 * Supports: Booking.com, Airbnb, VRBO.
 */
export async function scrapeAllBookingEmails(): Promise<ScrapeResult[]> {
  const d = await getDb();
  if (!d) throw new Error("Database not available");

  const { inArray: inArr } = await import("drizzle-orm");
  const SUPPORTED = ["booking_com", "airbnb", "vrbo"] as ("booking_com" | "airbnb" | "vrbo" | "direct" | "zillow" | "apartments_com" | "other")[];

  const platforms = await d
    .select()
    .from(propertyPlatforms)
    .where(
      and(
        inArr(propertyPlatforms.platform, SUPPORTED),
        eq(propertyPlatforms.isActive, true),
        eq(propertyPlatforms.emailScrapingEnabled, true),
        isNotNull(propertyPlatforms.notificationEmail)
      )
    );

  return Promise.all(platforms.map((p: any) => scrapeBookingEmails(p.id)));
}
