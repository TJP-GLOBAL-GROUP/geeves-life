/**
 * ⚠️ CRITICAL OPERATIONAL NOTE ⚠️
 *
 * generateOutboundICS() generates the S3-hosted ICS file that platforms
 * (Booking.com, Airbnb, VRBO) consume for availability. This file MUST
 * stay in sync with the propertyBookings table.
 *
 * ICS is regenerated automatically via:
 *   1. icalPollHandler after each successful platform poll (every 10 min)
 *   2. processIcsRegenerationQueue() draining the ics_regeneration_queue table
 *   3. Manual queue via queueIcsRegeneration() from icsRegenerationQueue.ts
 *   4. Live endpoint /api/ical/:propertyId.ics generates fresh on every request
 *
 * ⚠️ DB TRIGGERS NOT AVAILABLE: TiDB Serverless does not support MySQL triggers.
 *    If you modify propertyBookings via RAW SQL (feed swaps, migrations,
 *    bulk updates), you MUST manually call:
 *      await queueIcsRegeneration(propertyId, "reason");
 *    after the raw SQL update, OR hit the reconciliation endpoint:
 *      POST /api/scheduled/ics-reconcile
 *
 * A stale outbound ICS = double-bookings on Booking.com.
 * Incident reference: Jul 10, 2026 — CDN-cached ICS caused double-booking.
 */

/**
 * iCal Aggregator Service
 *
 * Polls inbound iCal feeds from short-term rental platforms (Airbnb, VRBO, Booking.com, direct),
 * merges them into a unified property_bookings table, detects conflicts, and generates
 * an outbound ICS file (hosted on S3) that includes blackout blocks and prep time rules.
 *
 * Phase 1 scope: iCal parsing, booking upsert, conflict detection, outbound ICS generation.
 * Phase 2 scope: email scraping for guest details and revenue.
 *
 * Sunday/Holiday Prep Rule (Sprint v2.10):
 *   blockSundays / blockNationalHolidays do NOT block every Sunday or holiday.
 *   They only add a block when a booking transition (checkout → check-in) would force
 *   the cleaning window to fall on a Sunday or national holiday.
 *
 *   Algorithm:
 *     For each pair of consecutive bookings (sorted by checkIn):
 *       - Identify the "cleaning window" = the day(s) between checkOut of booking A
 *         and checkIn of booking B.
 *       - If ALL days in the cleaning window are Sundays or holidays (per the property's
 *         country code), add a 1-day block on the first such day to prevent the back-to-back.
 *       - This block appears in the outbound ICS so platforms cannot book the transition.
 *
 *   Country codes:
 *     "US" → US federal holidays (hardcoded, updated annually)
 *     "JM" → Jamaican public holidays (hardcoded, updated annually)
 *     Other / null → only Sunday rule applies (no holiday data)
 */

import nodeIcalDefault from "node-ical";
import type { VEvent } from "node-ical";
// node-ical is a CJS module. The default export IS the module object, but its
// `.async` sub-object may be undefined in some bundler/transpile contexts.
// Use the top-level `fromURL` export directly which is always available.
const fromURL: (url: string) => Promise<Record<string, any>> =
  (nodeIcalDefault as any).fromURL ??
  (nodeIcalDefault as any).async?.fromURL;
import { ICalCalendar } from "ical-generator";
import { getDb } from "../db";
import { propertyPlatforms, propertyPrepRules, propertyBookings, properties } from "../../drizzle/schema";
import { eq, and, lt, gt, ne, notInArray, inArray } from "drizzle-orm";
import { storagePut } from "../storage";
import { randomUUID } from "crypto";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AggregationResult {
  propertyId: string;
  platformId: string;
  added: number;
  updated: number;
  conflicts: number;
  errors: string[];
}

// ─── Holiday Data ─────────────────────────────────────────────────────────────
//
// Hardcoded public holiday lists for supported country codes.
// Format: "YYYY-MM-DD" strings in the property's local timezone.
// Updated annually — covers current year ± 1 to handle advance bookings.
//
// US Federal Holidays (2025–2027)
const US_HOLIDAYS_2025 = [
  "2025-01-01", // New Year's Day
  "2025-01-20", // Martin Luther King Jr. Day
  "2025-02-17", // Presidents' Day
  "2025-05-26", // Memorial Day
  "2025-06-19", // Juneteenth
  "2025-07-04", // Independence Day
  "2025-09-01", // Labor Day
  "2025-10-13", // Columbus Day
  "2025-11-11", // Veterans Day
  "2025-11-27", // Thanksgiving Day
  "2025-12-25", // Christmas Day
];
const US_HOLIDAYS_2026 = [
  "2026-01-01", // New Year's Day
  "2026-01-19", // Martin Luther King Jr. Day
  "2026-02-16", // Presidents' Day
  "2026-05-25", // Memorial Day
  "2026-06-19", // Juneteenth
  "2026-07-03", // Independence Day (observed, Jul 4 is Saturday)
  "2026-09-07", // Labor Day
  "2026-10-12", // Columbus Day
  "2026-11-11", // Veterans Day
  "2026-11-26", // Thanksgiving Day
  "2026-12-25", // Christmas Day
];
const US_HOLIDAYS_2027 = [
  "2027-01-01", // New Year's Day
  "2027-01-18", // Martin Luther King Jr. Day
  "2027-02-15", // Presidents' Day
  "2027-05-31", // Memorial Day
  "2027-06-18", // Juneteenth (observed, Jun 19 is Saturday)
  "2027-07-05", // Independence Day (observed, Jul 4 is Sunday)
  "2027-09-06", // Labor Day
  "2027-10-11", // Columbus Day
  "2027-11-11", // Veterans Day
  "2027-11-25", // Thanksgiving Day
  "2027-12-24", // Christmas Day (observed, Dec 25 is Saturday)
];

// Jamaican Public Holidays (2025–2027)
const JM_HOLIDAYS_2025 = [
  "2025-01-01", // New Year's Day
  "2025-02-24", // Bob Marley Day (observed)
  "2025-04-18", // Good Friday
  "2025-04-21", // Easter Monday
  "2025-05-23", // Labour Day
  "2025-08-06", // Emancipation Day
  "2025-08-07", // Independence Day (observed, Aug 6 is Wednesday)
  "2025-10-20", // National Heroes Day
  "2025-12-25", // Christmas Day
  "2025-12-26", // Boxing Day
];
const JM_HOLIDAYS_2026 = [
  "2026-01-01", // New Year's Day
  "2026-02-23", // Bob Marley Day (observed)
  "2026-04-03", // Good Friday
  "2026-04-06", // Easter Monday
  "2026-05-25", // Labour Day (observed, May 23 is Saturday)
  "2026-08-06", // Emancipation Day
  "2026-08-07", // Independence Day (observed)
  "2026-10-19", // National Heroes Day
  "2026-12-25", // Christmas Day
  "2026-12-28", // Boxing Day (observed, Dec 26 is Saturday)
];
const JM_HOLIDAYS_2027 = [
  "2027-01-01", // New Year's Day
  "2027-02-22", // Bob Marley Day (observed)
  "2027-03-26", // Good Friday
  "2027-03-29", // Easter Monday
  "2027-05-24", // Labour Day (observed)
  "2027-08-06", // Emancipation Day
  "2027-08-09", // Independence Day (observed, Aug 6 is Friday)
  "2027-10-18", // National Heroes Day
  "2027-12-24", // Christmas Day (observed)
  "2027-12-27", // Boxing Day (observed)
];

// UK Bank Holidays (2025–2027) — England & Wales
const GB_HOLIDAYS_2025 = [
  "2025-01-01", // New Year's Day
  "2025-04-18", // Good Friday
  "2025-04-21", // Easter Monday
  "2025-05-05", // Early May Bank Holiday
  "2025-05-26", // Spring Bank Holiday
  "2025-08-25", // Summer Bank Holiday
  "2025-12-25", // Christmas Day
  "2025-12-26", // Boxing Day
];
const GB_HOLIDAYS_2026 = [
  "2026-01-01", // New Year's Day
  "2026-04-03", // Good Friday
  "2026-04-06", // Easter Monday
  "2026-05-04", // Early May Bank Holiday
  "2026-05-25", // Spring Bank Holiday
  "2026-08-31", // Summer Bank Holiday
  "2026-12-25", // Christmas Day
  "2026-12-28", // Boxing Day (observed, Dec 26 is Saturday)
];
const GB_HOLIDAYS_2027 = [
  "2027-01-01", // New Year's Day
  "2027-03-26", // Good Friday
  "2027-03-29", // Easter Monday
  "2027-05-03", // Early May Bank Holiday
  "2027-05-31", // Spring Bank Holiday
  "2027-08-30", // Summer Bank Holiday
  "2027-12-27", // Christmas Day (observed, Dec 25 is Saturday)
  "2027-12-28", // Boxing Day (observed, Dec 26 is Sunday)
];

// Canadian Federal Holidays (2025–2027)
const CA_HOLIDAYS_2025 = [
  "2025-01-01", // New Year's Day
  "2025-02-17", // Family Day (most provinces)
  "2025-04-18", // Good Friday
  "2025-05-19", // Victoria Day
  "2025-07-01", // Canada Day
  "2025-09-01", // Labour Day
  "2025-10-13", // Thanksgiving
  "2025-11-11", // Remembrance Day
  "2025-12-25", // Christmas Day
  "2025-12-26", // Boxing Day
];
const CA_HOLIDAYS_2026 = [
  "2026-01-01", // New Year's Day
  "2026-02-16", // Family Day (most provinces)
  "2026-04-03", // Good Friday
  "2026-05-18", // Victoria Day
  "2026-07-01", // Canada Day
  "2026-09-07", // Labour Day
  "2026-10-12", // Thanksgiving
  "2026-11-11", // Remembrance Day
  "2026-12-25", // Christmas Day
  "2026-12-28", // Boxing Day (observed)
];
const CA_HOLIDAYS_2027 = [
  "2027-01-01", // New Year's Day
  "2027-02-15", // Family Day (most provinces)
  "2027-03-26", // Good Friday
  "2027-05-24", // Victoria Day
  "2027-07-01", // Canada Day
  "2027-09-06", // Labour Day
  "2027-10-11", // Thanksgiving
  "2027-11-11", // Remembrance Day
  "2027-12-24", // Christmas Day (observed)
  "2027-12-27", // Boxing Day (observed)
];

// Australian Public Holidays (2025–2027) — National (ACT/NSW basis)
const AU_HOLIDAYS_2025 = [
  "2025-01-01", // New Year's Day
  "2025-01-27", // Australia Day (observed, Jan 26 is Sunday)
  "2025-04-18", // Good Friday
  "2025-04-19", // Easter Saturday
  "2025-04-21", // Easter Monday
  "2025-04-25", // Anzac Day
  "2025-06-09", // King's Birthday (ACT/NSW/SA/TAS)
  "2025-12-25", // Christmas Day
  "2025-12-26", // Boxing Day
];
const AU_HOLIDAYS_2026 = [
  "2026-01-01", // New Year's Day
  "2026-01-26", // Australia Day
  "2026-04-03", // Good Friday
  "2026-04-04", // Easter Saturday
  "2026-04-06", // Easter Monday
  "2026-04-25", // Anzac Day (observed, Apr 25 is Saturday → Apr 27)
  "2026-06-08", // King's Birthday
  "2026-12-25", // Christmas Day
  "2026-12-28", // Boxing Day (observed)
];
const AU_HOLIDAYS_2027 = [
  "2027-01-01", // New Year's Day
  "2027-01-26", // Australia Day
  "2027-03-26", // Good Friday
  "2027-03-27", // Easter Saturday
  "2027-03-29", // Easter Monday
  "2027-04-26", // Anzac Day (observed, Apr 25 is Sunday)
  "2027-06-14", // King's Birthday
  "2027-12-27", // Christmas Day (observed)
  "2027-12-28", // Boxing Day (observed)
];

// Nigerian Public Holidays (2025–2027)
const NG_HOLIDAYS_2025 = [
  "2025-01-01", // New Year's Day
  "2025-03-31", // Eid al-Fitr (approx)
  "2025-04-18", // Good Friday
  "2025-04-21", // Easter Monday
  "2025-05-01", // Workers' Day
  "2025-06-06", // Eid al-Adha (approx)
  "2025-06-12", // Democracy Day
  "2025-10-01", // Independence Day
  "2025-12-25", // Christmas Day
  "2025-12-26", // Boxing Day
];
const NG_HOLIDAYS_2026 = [
  "2026-01-01", // New Year's Day
  "2026-03-20", // Eid al-Fitr (approx)
  "2026-04-03", // Good Friday
  "2026-04-06", // Easter Monday
  "2026-05-01", // Workers' Day
  "2026-05-27", // Eid al-Adha (approx)
  "2026-06-12", // Democracy Day
  "2026-10-01", // Independence Day
  "2026-12-25", // Christmas Day
  "2026-12-28", // Boxing Day (observed)
];
const NG_HOLIDAYS_2027 = [
  "2027-01-01", // New Year's Day
  "2027-03-09", // Eid al-Fitr (approx)
  "2027-03-26", // Good Friday
  "2027-03-29", // Easter Monday
  "2027-05-01", // Workers' Day
  "2027-05-16", // Eid al-Adha (approx)
  "2027-06-12", // Democracy Day
  "2027-10-01", // Independence Day
  "2027-12-24", // Christmas Day (observed)
  "2027-12-27", // Boxing Day (observed)
];

const HOLIDAYS_BY_COUNTRY: Record<string, Set<string>> = {
  US: new Set([...US_HOLIDAYS_2025, ...US_HOLIDAYS_2026, ...US_HOLIDAYS_2027]),
  JM: new Set([...JM_HOLIDAYS_2025, ...JM_HOLIDAYS_2026, ...JM_HOLIDAYS_2027]),
  GB: new Set([...GB_HOLIDAYS_2025, ...GB_HOLIDAYS_2026, ...GB_HOLIDAYS_2027]),
  CA: new Set([...CA_HOLIDAYS_2025, ...CA_HOLIDAYS_2026, ...CA_HOLIDAYS_2027]),
  AU: new Set([...AU_HOLIDAYS_2025, ...AU_HOLIDAYS_2026, ...AU_HOLIDAYS_2027]),
  NG: new Set([...NG_HOLIDAYS_2025, ...NG_HOLIDAYS_2026, ...NG_HOLIDAYS_2027]),
};

/**
 * Returns true if the given YYYY-MM-DD date string falls on a Sunday.
 */
function isSunday(dateStr: string): boolean {
  // Parse as local date (no timezone shift — we use property-local date strings)
  const [year, month, day] = dateStr.split("-").map(Number);
  const d = new Date(year, month - 1, day);
  return d.getDay() === 0;
}

/**
 * Returns true if the given YYYY-MM-DD date string is a national holiday
 * for the given country code.
 */
function isHoliday(dateStr: string, countryCode: string | null | undefined): boolean {
  if (!countryCode) return false;
  const holidays = HOLIDAYS_BY_COUNTRY[countryCode.toUpperCase()];
  return holidays ? holidays.has(dateStr) : false;
}

/**
 * Converts a UTC timestamp (ms) to a YYYY-MM-DD date string in the given IANA timezone.
 */
function toLocalDateStr(tsMs: number, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(tsMs));
}

/**
 * Returns the UTC timestamp (ms) for midnight at the start of a YYYY-MM-DD date
 * in the given IANA timezone.
 */
function localDateToUtcMs(dateStr: string, timezone: string): number {
  // Use Intl to find the UTC offset for midnight on that date in the given timezone
  const [year, month, day] = dateStr.split("-").map(Number);
  // Create a date at noon UTC to avoid DST edge cases, then find local midnight
  const noonUtc = Date.UTC(year, month - 1, day, 12, 0, 0);
  const localDateAtNoon = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(noonUtc));
  // If the local date at noon UTC matches our target, use it as anchor
  // Then find midnight by subtracting the local time offset
  const testDate = new Date(`${dateStr}T00:00:00`);
  // Use the timezone-aware formatter to find the UTC equivalent of local midnight
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  // Binary search for UTC ms where local time = midnight
  // Start with a rough estimate: UTC midnight on that date
  let estimate = Date.UTC(year, month - 1, day, 0, 0, 0);
  for (let i = 0; i < 3; i++) {
    const parts = formatter.formatToParts(new Date(estimate));
    const h = parseInt(parts.find(p => p.type === "hour")?.value ?? "0");
    const m = parseInt(parts.find(p => p.type === "minute")?.value ?? "0");
    const s = parseInt(parts.find(p => p.type === "second")?.value ?? "0");
    const localDayStr = `${parts.find(p => p.type === "year")?.value}-${parts.find(p => p.type === "month")?.value}-${parts.find(p => p.type === "day")?.value}`;
    // Adjust: subtract the local time offset from midnight
    const offsetMs = (h === 24 ? 0 : h) * 3600000 + m * 60000 + s * 1000;
    if (localDayStr === dateStr) {
      estimate = estimate - offsetMs;
      break;
    } else {
      // Off by a day — adjust
      const diff = localDayStr < dateStr ? 86400000 : -86400000;
      estimate = estimate + diff - offsetMs;
      break;
    }
  }
  return estimate;
}

/**
 * Determines which days in the cleaning window between two consecutive bookings
 * are blocked (Sunday or holiday) and returns block events to add to the ICS.
 *
 * The cleaning window is: [checkOutDate, checkInDate) — i.e. the days between
 * checkout of booking A and check-in of booking B.
 *
 * Rule: if ALL days in the cleaning window are Sundays or holidays, add a block
 * on the first such day. This prevents a new booking from starting on that day
 * when the only cleaning window is a Sunday/holiday.
 *
 * If the cleaning window has at least one non-Sunday non-holiday day, no block
 * is added (cleaning can happen on that day).
 */
function computeSundayHolidayBlocks(
  bookings: Array<{ checkIn: number; checkOut: number }>,
  prepRule: { blockSundays: boolean | null; blockNationalHolidays: boolean | null },
  propertyTimezone: string,
  countryCode: string | null | undefined,
): Array<{ start: Date; end: Date; reason: string }> {
  const blocks: Array<{ start: Date; end: Date; reason: string }> = [];

  if (!prepRule.blockSundays && !prepRule.blockNationalHolidays) return blocks;

  // Sort bookings by checkIn ascending
  const sorted = [...bookings].sort((a, b) => a.checkIn - b.checkIn);

  for (let i = 0; i < sorted.length - 1; i++) {
    const bookingA = sorted[i];
    const bookingB = sorted[i + 1];

    // Only consider back-to-back or near-back-to-back bookings
    // (cleaning window = 0 to 3 days between checkout A and checkin B)
    const checkOutDateStr = toLocalDateStr(bookingA.checkOut, propertyTimezone);
    const checkInDateStr = toLocalDateStr(bookingB.checkIn, propertyTimezone);

    if (checkOutDateStr >= checkInDateStr) {
      // Overlapping or same-day — conflict detection handles this separately
      continue;
    }

    // Enumerate days in the cleaning window: [checkOutDate, checkInDate)
    const windowDays: string[] = [];
    let cursor = bookingA.checkOut;
    const maxWindow = 3; // Only consider windows up to 3 days (beyond that, cleaning can be scheduled flexibly)
    let dayCount = 0;
    while (dayCount < maxWindow) {
      const dayStr = toLocalDateStr(cursor, propertyTimezone);
      if (dayStr >= checkInDateStr) break;
      windowDays.push(dayStr);
      const cursorDate = new Date(cursor);
      cursorDate.setUTCDate(cursorDate.getUTCDate() + 1);
      cursor = cursorDate.getTime();
      dayCount++;
    }

    if (windowDays.length === 0) continue;

    // Check if ALL days in the window are blocked (Sunday or holiday)
    const blockedDays = windowDays.filter(d => {
      const sundayBlocked = prepRule.blockSundays && isSunday(d);
      const holidayBlocked = prepRule.blockNationalHolidays && isHoliday(d, countryCode);
      return sundayBlocked || holidayBlocked;
    });

    if (blockedDays.length === windowDays.length && windowDays.length > 0) {
      // All cleaning window days are blocked — add a block on the first day
      const blockDay = windowDays[0];
      const reasons: string[] = [];
      if (prepRule.blockSundays && isSunday(blockDay)) reasons.push("Sunday");
      if (prepRule.blockNationalHolidays && isHoliday(blockDay, countryCode)) reasons.push("National Holiday");
      const reason = reasons.join(" + ") || "Blocked Day";

      const blockStart = localDateToUtcMs(blockDay, propertyTimezone);
      const blockEndDate = new Date(blockStart);
      blockEndDate.setUTCDate(blockEndDate.getUTCDate() + 1);
      const blockEnd = blockEndDate.getTime();

      blocks.push({
        start: new Date(blockStart),
        end: new Date(blockEnd),
        reason,
      });
    }
  }

  return blocks;
}

// ─── iCal Polling ────────────────────────────────────────────────────────────

/**
 * Fetches and parses an iCal URL, returning normalized booking entries.
 */
async function fetchAndParseICal(icalUrl: string, platform?: string): Promise<Array<{
  icalUid: string;
  summary: string;
  description: string;
  checkIn: number;
  checkOut: number;
  bookingType: "booking" | "block" | "unavailable";
}>> {
  // Add a 30-second timeout to prevent hanging when iCal URLs are unreachable
  const events = await Promise.race([
    fromURL(icalUrl),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`iCal fetch timed out after 30s: ${icalUrl}`)), 30000)),
  ]);
  const results: Array<{
    icalUid: string;
    summary: string;
    description: string;
    checkIn: number;
    checkOut: number;
    bookingType: "booking" | "block" | "unavailable";
  }> = [];

  for (const [, rawEvent] of Object.entries(events)) {
    if (!rawEvent || rawEvent.type !== "VEVENT") continue;
    const event = rawEvent as VEvent;
    const start = event.start instanceof Date ? event.start : new Date(String(event.start));
    const end = event.end instanceof Date ? event.end : new Date(String(event.end));
    if (!start || !end || isNaN(start.getTime()) || isNaN(end.getTime())) continue;

    let summary = String(event.summary || "");
    const description = String(event.description || "");

    // Classify booking type from summary/description keywords
    let bookingType: "booking" | "block" | "unavailable" = "booking";
    const lowerSummary = summary.toLowerCase();
    const lowerDesc = description.toLowerCase();

    if (platform === "booking_com") {
      // Booking.com iCal does not distinguish confirmed reservations from manual blocks —
      // all entries come through as "CLOSED - Not available". Treat every block as a
      // confirmed booking. Email scraping (Phase 2) will enrich with guest details.
      bookingType = "booking";
      // Normalise the generic "CLOSED - Not available" summary to something meaningful
      if (!summary || summary.toLowerCase().startsWith("closed") || summary.toLowerCase().includes("not available")) {
        summary = "Booking.com Reservation";
      }
    } else if (
      lowerSummary.includes("blocked") ||
      lowerSummary.includes("not available") ||
      lowerSummary.includes("unavailable") ||
      lowerDesc.includes("prep time") ||
      lowerDesc.includes("blackout")
    ) {
      bookingType = "unavailable";
    } else if (lowerSummary.includes("airbnb") || lowerSummary.includes("vrbo") || lowerSummary.includes("reserved")) {
      bookingType = "booking";
    }

    results.push({
      icalUid: String(event.uid || randomUUID()),
      summary,
      description,
      checkIn: start.getTime(),
      checkOut: end.getTime(),
      bookingType,
    });
  }

  return results;
}

// ─── Conflict Detection ───────────────────────────────────────────────────────

/**
 * Checks if a booking overlaps with any existing booking from a different platform.
 * Returns the conflicting booking ID if found, null otherwise.
 */
async function detectConflict(
  propertyId: string,
  platformId: string,
  checkIn: number,
  checkOut: number,
  excludeBookingId?: string,
): Promise<string | null> {
  const dc = await getDb();
  if (!dc) return null;
  const overlapping = await dc
    .select({ id: propertyBookings.id })
    .from(propertyBookings)
    .where(
      and(
        eq(propertyBookings.propertyId, propertyId),
        ne(propertyBookings.platformId, platformId),
        eq(propertyBookings.bookingType, "booking"),
        lt(propertyBookings.checkIn, checkOut),
        gt(propertyBookings.checkOut, checkIn),
        ...(excludeBookingId ? [ne(propertyBookings.id, excludeBookingId)] : []),
      )
    )
    .limit(1);

  return overlapping.length > 0 ? overlapping[0].id : null;
}

// ─── Main Aggregation ─────────────────────────────────────────────────────────

/**
 * Polls a single platform's iCal feed and upserts bookings into the DB.
 */
export async function aggregatePlatformICal(platformId: string): Promise<AggregationResult> {
  const d = await getDb();
  if (!d) throw new Error("Database not available");
  const [platform] = await d
    .select()
    .from(propertyPlatforms)
    .where(eq(propertyPlatforms.id, platformId))
    .limit(1);

  if (!platform) throw new Error(`Platform ${platformId} not found`);

  const result: AggregationResult = {
    propertyId: platform.propertyId,
    platformId,
    added: 0,
    updated: 0,
    conflicts: 0,
    errors: [],
  };

  let parsedEvents: Awaited<ReturnType<typeof fetchAndParseICal>> = [];
  try {
    parsedEvents = await fetchAndParseICal(platform.icalUrl, platform.platform);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(`Failed to fetch/parse iCal: ${msg}`);
    await d
      .update(propertyPlatforms)
      .set({ lastError: msg, updatedAt: new Date() })
      .where(eq(propertyPlatforms.id, platformId));
    return result;
  }

  for (const event of parsedEvents) {
    // Check if booking already exists by icalUid
    const existing = await d
      .select()
      .from(propertyBookings)
      .where(
        and(
          eq(propertyBookings.propertyId, platform.propertyId),
          eq(propertyBookings.platformId, platformId),
          ...(event.icalUid ? [eq(propertyBookings.icalUid, event.icalUid)] : []),
        )
      )
      .limit(1);

    const conflictId = await detectConflict(
      platform.propertyId,
      platformId,
      event.checkIn,
      event.checkOut,
      existing[0]?.id,
    );

    if (existing.length > 0) {
      // Update existing booking
      await d
        .update(propertyBookings)
        .set({
          summary: event.summary,
          description: event.description,
          checkIn: event.checkIn,
          checkOut: event.checkOut,
          bookingType: event.bookingType,
          hasConflict: !!conflictId,
          conflictWith: conflictId ?? undefined,
          updatedAt: new Date(),
        })
        .where(eq(propertyBookings.id, existing[0].id));
      result.updated++;
    } else {
      // Insert new booking
      await d.insert(propertyBookings).values({
        id: randomUUID(),
        propertyId: platform.propertyId,
        platformId,
        icalUid: event.icalUid,
        summary: event.summary,
        description: event.description,
        checkIn: event.checkIn,
        checkOut: event.checkOut,
        bookingType: event.bookingType,
        hasConflict: !!conflictId,
        conflictWith: conflictId ?? undefined,
      });
      result.added++;
    }

    if (conflictId) result.conflicts++;
  }

  // ─── Cancellation Detection ─────────────────────────────────────────────────
  //
  // Booking.com (and other platforms) do NOT use STATUS:CANCELLED in their iCal
  // feeds — they simply remove the VEVENT when a booking is cancelled.
  //
  // Strategy: after processing all live feed events, find any DB rows for this
  // platform whose icalUid is no longer present in the live feed. Those rows
  // represent cancellations. Mark them as bookingStatus='cancelled'.
  //
  // Only applies to rows with a non-null icalUid (anonymous blocks have no UID).
  const liveUids = parsedEvents
    .map((e) => e.icalUid)
    .filter((uid): uid is string => !!uid);

  if (liveUids.length > 0) {
    // Find confirmed bookings for this platform that have an icalUid NOT in the live feed
    const staleRows = await d
      .select()
      .from(propertyBookings)
      .where(
        and(
          eq(propertyBookings.platformId, platformId),
          eq(propertyBookings.bookingStatus, "confirmed"),
          notInArray(propertyBookings.icalUid, liveUids),
        )
      );

    if (staleRows.length > 0) {
      // P-31: 3-source cancellation flow
      // If the booking was also confirmed by email (dataSource='both'), we need
      // email to also confirm the cancellation before auto-cancelling.
      // If dataSource='ical_only', iCal removal alone is sufficient to auto-cancel.
      const autoCancelIds: string[] = [];
      const pendingIds: string[] = [];

      for (const row of staleRows) {
        const src = (row as any).dataSource as string | undefined;
        if (src === 'both') {
          // Email also confirmed this booking — require email cancellation signal too
          pendingIds.push(row.id);
        } else {
          // iCal-only booking — iCal removal is sufficient
          autoCancelIds.push(row.id);
        }
      }

      if (autoCancelIds.length > 0) {
        await d
          .update(propertyBookings)
          .set({
            bookingStatus: "cancelled",
            cancelledAt: Date.now(),
            cancellationSource: "ical_removal",
            hasConflict: false,
            conflictWith: undefined,
            updatedAt: new Date(),
          })
          .where(inArray(propertyBookings.id, autoCancelIds));
        (result as AggregationResult & { cancelled?: number }).cancelled =
          ((result as any).cancelled ?? 0) + autoCancelIds.length;
      }

      if (pendingIds.length > 0) {
        // Mark as pending cancellation — waiting for email confirmation
        await d
          .update(propertyBookings)
          .set({
            pendingCancellationSource: 'ical',
            pendingCancellationAt: Date.now(),
            updatedAt: new Date(),
          } as any)
          .where(inArray(propertyBookings.id, pendingIds));

        // Only notify owner for FUTURE bookings — past bookings naturally age out
        // of the iCal feed (Airbnb removes old events after ~6 months) and should be
        // silently kept without notification noise.
        // PERF: Send ONE batched notification per poll cycle (not one per booking) with 6h cooldown.
        const nowMs = Date.now();
        const pendingBookings = staleRows.filter(r => pendingIds.includes(r.id));
        const futureBookings = pendingBookings.filter(b => b.checkOut >= nowMs);
        if (futureBookings.length > 0) {
          // PERSISTENT DB-based cooldown that survives serverless cold starts
          let shouldSend = false;
          try {
            const { getDb } = await import('../db.js');
            const dbInst = await getDb();
            if (dbInst) {
              const { notificationSettings } = await import('../../drizzle/schema.js');
              const { eq: eqOp } = await import('drizzle-orm');
              const [setting] = await dbInst.select().from(notificationSettings).where(eqOp(notificationSettings.key, 'cancellation_pending')).limit(1);
              if (setting) {
                if (!setting.enabled) { shouldSend = false; }
                else {
                  const cooldownMs = setting.cooldownHours * 60 * 60 * 1000;
                  const lastNotified = setting.lastNotifiedAt ?? 0;
                  if (nowMs - lastNotified > cooldownMs) {
                    shouldSend = true;
                    await dbInst.update(notificationSettings).set({ lastNotifiedAt: nowMs }).where(eqOp(notificationSettings.key, 'cancellation_pending'));
                  }
                }
              } else {
                // No row yet — create one and allow first notification
                shouldSend = true;
                await dbInst.insert(notificationSettings).values({
                  key: 'cancellation_pending',
                  label: 'Cancellation Pending',
                  description: 'Notifications when bookings are removed from iCal feed but confirmed by email',
                  cooldownHours: 6,
                  enabled: true,
                  householdId: 'system',
                  lastNotifiedAt: nowMs,
                }).onDuplicateKeyUpdate({ set: { lastNotifiedAt: nowMs } });
              }
            }
          } catch { /* suppress on error */ }
          if (shouldSend) {
            const { notifyOwner } = await import('../_core/notification.js');
            const lines = futureBookings.map(b => {
              const checkIn = new Date(b.checkIn).toISOString().slice(0, 10);
              const checkOut = new Date(b.checkOut).toISOString().slice(0, 10);
              return `• "${b.summary || b.id}" (${checkIn}–${checkOut})`;
            });
            await notifyOwner({
              title: `Cancellation pending confirmation (${futureBookings.length} booking${futureBookings.length > 1 ? 's' : ''})`,
              content: `The following booking(s) were removed from the iCal feed but were also confirmed by email. Please confirm or dismiss in the Properties view:\n\n${lines.join('\n')}`,
            }).catch(() => {});
          }
        }
        (result as any).pendingCancellations = ((result as any).pendingCancellations ?? 0) + pendingIds.length;
      }
    }
  } else if (parsedEvents.length === 0) {
    // Edge case: if the feed returns 0 events (e.g., all bookings were cancelled),
    // mark ALL confirmed bookings for this platform as cancelled.
    const allConfirmed = await d
      .select()
      .from(propertyBookings)
      .where(
        and(
          eq(propertyBookings.platformId, platformId),
          eq(propertyBookings.bookingStatus, "confirmed"),
        )
      );

    if (allConfirmed.length > 0) {
      const autoCancelAll = allConfirmed.filter((r: any) => r.dataSource !== 'both').map((r: any) => r.id);
      const pendingAll    = allConfirmed.filter((r: any) => r.dataSource === 'both').map((r: any) => r.id);

      if (autoCancelAll.length > 0) {
        await d
          .update(propertyBookings)
          .set({
            bookingStatus: "cancelled",
            cancelledAt: Date.now(),
            cancellationSource: "ical_removal",
            hasConflict: false,
            conflictWith: undefined,
            updatedAt: new Date(),
          })
          .where(inArray(propertyBookings.id, autoCancelAll));
        (result as any).cancelled = autoCancelAll.length;
      }
      if (pendingAll.length > 0) {
        await d
          .update(propertyBookings)
          .set({ pendingCancellationSource: 'ical', pendingCancellationAt: Date.now(), updatedAt: new Date() } as any)
          .where(inArray(propertyBookings.id, pendingAll));
        (result as any).pendingCancellations = pendingAll.length;
      }
    }
  }

  // Mark platform as successfully polled
  await d
    .update(propertyPlatforms)
    .set({ lastPolledAt: Date.now(), lastError: null, updatedAt: new Date() })
    .where(eq(propertyPlatforms.id, platformId));

  return result;
}

/**
 * Aggregates all active platforms for a property.
 */
export async function aggregatePropertyICals(propertyId: string): Promise<AggregationResult[]> {
  const d2 = await getDb();
  if (!d2) throw new Error("Database not available");
  const platforms = await d2
    .select()
    .from(propertyPlatforms)
    .where(and(eq(propertyPlatforms.propertyId, propertyId), eq(propertyPlatforms.isActive, true)));

  return Promise.all(platforms.map((p: { id: string }) => aggregatePlatformICal(p.id)));
}

// ─── Outbound ICS Generation ──────────────────────────────────────────────────

/**
 * Generates an outbound ICS file for a property that includes:
 * - All existing bookings (as BUSY blocks)
 * - Prep time blocks (before/after each booking per rules)
 * - Sunday/Holiday blocks (when blockSundays or blockNationalHolidays is set and
 *   the cleaning window between consecutive bookings falls entirely on blocked days)
 * - Custom blackout dates
 *
 * Returns the raw ICS content string. Used by the live /api/ical endpoint
 * so external platforms always receive fresh, uncached availability data.
 */
export async function generateOutboundICSContent(propertyId: string): Promise<string> {
  const dg = await getDb();
  if (!dg) throw new Error("Database not available");
  const [property] = await dg
    .select()
    .from(properties)
    .where(eq(properties.id, propertyId))
    .limit(1);

  if (!property) throw new Error(`Property ${propertyId} not found`);

  // Fetch all confirmed bookings for this property (exclude cancelled)
  const bookings = await dg
    .select({ id: propertyBookings.id, platformId: propertyBookings.platformId, checkIn: propertyBookings.checkIn, checkOut: propertyBookings.checkOut, summary: propertyBookings.summary, bookingType: propertyBookings.bookingType, blockReason: propertyBookings.blockReason })
    .from(propertyBookings)
    .where(and(eq(propertyBookings.propertyId, propertyId), eq(propertyBookings.bookingStatus, "confirmed")));

  // Fetch prep rules
  const [prepRule] = await dg
    .select()
    .from(propertyPrepRules)
    .where(eq(propertyPrepRules.propertyId, propertyId))
    .limit(1);

  // Fetch platform names for descriptions
  type PlatformRow = { id: string; platform: string; displayName: string | null };
  const platforms = await dg
    .select({ id: propertyPlatforms.id, platform: propertyPlatforms.platform, displayName: propertyPlatforms.displayName })
    .from(propertyPlatforms)
    .where(eq(propertyPlatforms.propertyId, propertyId)) as PlatformRow[];

  const platformMap = new Map(platforms.map((p: PlatformRow) => [p.id, p]));

  const cal = new ICalCalendar({
    name: `${property.name} — Geeves.Life Availability`,
    description: `Managed availability calendar for ${property.name}. Blocked by Geeves.Life.`,
    timezone: "UTC",
  });

  const MS_PER_DAY = 86400000;
  const propertyTimezone = property.timezone ?? "America/New_York";

  for (const booking of bookings) {
    const platformInfo = platformMap.get(booking.platformId);
    const platformName = platformInfo?.displayName || platformInfo?.platform || "Unknown platform";

    if (booking.bookingType === "booking") {
      // Add the booking itself as BUSY
      cal.createEvent({
        start: new Date(booking.checkIn),
        end: new Date(booking.checkOut),
        summary: `BOOKED — ${platformName}`,
        description: `Booking from ${platformName}. Managed by Geeves.Life.`,
        busystatus: "BUSY" as any,
      });

      // Add prep time blocks if rules exist
      if (prepRule) {
        if (prepRule.blockDaysBefore > 0) {
          const prepStart = booking.checkIn - prepRule.blockDaysBefore * MS_PER_DAY;
          cal.createEvent({
            start: new Date(prepStart),
            end: new Date(booking.checkIn),
            summary: "PREP TIME — Geeves.Life",
            description: `Preparation time before booking from ${platformName}. Rule: ${prepRule.blockDaysBefore} day(s) before check-in. Managed by Geeves.Life.`,
          });
        }
        if (prepRule.blockDaysAfter > 0) {
          const prepEnd = booking.checkOut + prepRule.blockDaysAfter * MS_PER_DAY;
          cal.createEvent({
            start: new Date(booking.checkOut),
            end: new Date(prepEnd),
            summary: "PREP TIME — Geeves.Life",
            description: `Preparation time after booking from ${platformName}. Rule: ${prepRule.blockDaysAfter} day(s) after check-out. Managed by Geeves.Life.`,
          });
        }
      }
    } else if (booking.bookingType === "unavailable" || booking.bookingType === "block") {
      // Preserve blocks from platforms or manual blocks
      const reason = booking.blockReason || booking.summary || "Unavailable";
      cal.createEvent({
        start: new Date(booking.checkIn),
        end: new Date(booking.checkOut),
        summary: `BLOCKED — ${reason}`,
        description: `${reason}. Managed by Geeves.Life.`,
      });
    }
  }

  // ─── Sunday / Holiday Transition Blocks ─────────────────────────────────────
  //
  // Only applies when blockSundays or blockNationalHolidays is set on the prep rule.
  // Adds a 1-day block when the cleaning window between consecutive bookings falls
  // entirely on Sundays or national holidays (per property's country code).
  //
  if (prepRule && (prepRule.blockSundays || prepRule.blockNationalHolidays)) {
    const confirmedBookings = bookings
      .filter(b => b.bookingType === "booking")
      .map(b => ({ checkIn: b.checkIn, checkOut: b.checkOut }));

    const sundayHolidayBlocks = computeSundayHolidayBlocks(
      confirmedBookings,
      {
        blockSundays: prepRule.blockSundays,
        blockNationalHolidays: prepRule.blockNationalHolidays,
      },
      propertyTimezone,
      property.country,
    );

    for (const block of sundayHolidayBlocks) {
      cal.createEvent({
        start: block.start,
        end: block.end,
        summary: `NO SAME-DAY TURNOVER — ${block.reason}`,
        description: `Cleaning cannot be scheduled on this ${block.reason}. Back-to-back bookings requiring same-day turnover are blocked. Managed by Geeves.Life.`,
      });
    }
  }

  // Add custom blackout dates from prep rules
  if (prepRule?.customBlockDates) {
    const customDates = prepRule.customBlockDates as string[];
    for (const dateStr of customDates) {
      const start = new Date(dateStr);
      const end = new Date(start.getTime() + MS_PER_DAY);
      cal.createEvent({
        start,
        end,
        summary: "BLACKOUT — Geeves.Life",
        description: `Blackout date set by Geeves.Life owner. Date: ${dateStr}.`,
      });
    }
  }

  return String(cal.toString());
}

/**
 * Generates the outbound ICS and uploads a snapshot to S3 (legacy path).
 *
 * WARNING: The S3/CloudFront URL is aggressively cached by the CDN and may serve
 * stale content for weeks. External platforms MUST subscribe to the live endpoint
 * (/api/ical/:propertyId.ics) instead. This function is kept for backwards
 * compatibility and returns the live endpoint URL when APP_URL is available.
 */
export async function generateOutboundICS(propertyId: string): Promise<string> {
  const icsContent = await generateOutboundICSContent(propertyId);
  const fileKey = `property-ical/${propertyId}/availability.ics`;
  // Best-effort S3 snapshot (do not fail the caller if upload has issues)
  try {
    await storagePut(fileKey, Buffer.from(icsContent, "utf-8"), "text/calendar");
  } catch (e) {
    console.warn("[iCal] S3 snapshot upload failed (live endpoint unaffected):", e);
  }
  // Prefer the live, uncached endpoint URL
  const appUrl = process.env.APP_URL?.replace(/\/+$/, "");
  if (appUrl) {
    return `${appUrl}/api/ical/${propertyId}.ics`;
  }
  const { url } = await storagePut(fileKey, Buffer.from(icsContent, "utf-8"), "text/calendar");
  return url;
}
