/**
 * conflictDetector.ts
 * Detects double-booking conflicts across platforms for a property.
 *
 * Rules:
 * - booking vs booking (different platforms) → CONFLICT if date ranges overlap
 * - booking vs unavailable (any platform) → CONFLICT if date ranges overlap
 * - Same-day checkout/check-in is SAFE (checkout at midnight = check-in at midnight)
 * - back-to-back (no prep day between) is flagged as B2B but not a conflict
 */

import { getDb } from "../db";
import { propertyBookings, propertyPlatforms, bookingOverrides } from "../../drizzle/schema";
import { eq, and, gt, inArray } from "drizzle-orm";
import { notifyOwner } from "../../server/_core/cloudNotification";

export interface ConflictEntry {
  bookingAId: string;
  bookingBId: string;
  propertyId: string;
  propertyName: string;
  platformA: string;
  platformB: string;
  summaryA: string;
  summaryB: string;
  guestNameA: string | null;
  guestNameB: string | null;
  checkInA: number;     // ms timestamp — booking A check-in
  checkOutA: number;    // ms timestamp — booking A check-out
  checkInB: number;     // ms timestamp — booking B check-in
  checkOutB: number;    // ms timestamp — booking B check-out
  overlapStart: number; // ms timestamp — first conflicting day
  overlapEnd: number;   // ms timestamp — last conflicting day
  conflictDays: number; // number of overlapping days
}

export interface BackToBackEntry {
  bookingAId: string;
  bookingBId: string;
  propertyId: string;
  turnoverDate: number; // ms timestamp — the shared checkout/check-in day
  hasPrepDay: boolean;
}

export interface ConflictReport {
  conflicts: ConflictEntry[];
  backToBacks: BackToBackEntry[];
}

/**
 * Detect all conflicts and back-to-back entries for a given property.
 * Only looks at bookings with checkOut >= now (future + current).
 */
export async function detectConflictsForProperty(
  propertyId: string,
  propertyName: string
): Promise<ConflictReport> {
  const db = await getDb();
  if (!db) return { conflicts: [], backToBacks: [] };

  const now = Date.now();

  // Get all platforms for this property
  const platforms = (await db
    .select()
    .from(propertyPlatforms)
    .where(eq(propertyPlatforms.propertyId, propertyId))) as Array<{
    id: string; platform: string; propertyId: string;
  }>;

  if (platforms.length === 0) return { conflicts: [], backToBacks: [] };

  const platformIds = platforms.map((p) => p.id);
  const platformMap = new Map(platforms.map((p) => [p.id, p]));

  // Get all CONFIRMED bookings for this property that haven't ended yet
  // Cancelled bookings (iCal removal or email) must be excluded to prevent
  // stale double-booking warnings after a Booking.com cancellation.
  const bookings = (await db
    .select()
    .from(propertyBookings)
    .where(
      and(
        inArray(propertyBookings.platformId, platformIds),
        gt(propertyBookings.checkOut, now),
        eq(propertyBookings.bookingStatus, "confirmed"),
      )
    )) as Array<{
    id: string; platformId: string; bookingType: string; summary: string | null;
    guestName: string | null; checkIn: number; checkOut: number;
  }>;

  // Get overrides for guest names
  const bookingIds = bookings.map((b) => b.id);
  const overrides = (bookingIds.length > 0
    ? await db
        .select()
        .from(bookingOverrides)
        .where(inArray(bookingOverrides.bookingId, bookingIds))
    : []) as Array<{ bookingId: string; guestName: string | null }>;
  const overrideMap = new Map(overrides.map((o) => [o.bookingId, o]));

  const conflicts: ConflictEntry[] = [];
  const backToBacks: BackToBackEntry[] = [];

  // Compare every pair of bookings
  for (let i = 0; i < bookings.length; i++) {
    for (let j = i + 1; j < bookings.length; j++) {
      const a = bookings[i];
      const b = bookings[j];

      // Skip if both are from the same platform (same-platform blocks are expected)
      if (a.platformId === b.platformId) continue;

      // Skip if neither is a booking or unavailable
      const aIsRelevant = a.bookingType === "booking" || a.bookingType === "unavailable";
      const bIsRelevant = b.bookingType === "booking" || b.bookingType === "unavailable";
      if (!aIsRelevant || !bIsRelevant) continue;

      // Normalize all timestamps to UTC day boundaries (midnight) to handle
      // mixed noon/midnight conventions from iCal vs email sources.
      // This ensures same-day checkout/check-in is detected correctly regardless
      // of whether the source used noon (iCal DATE) or midnight (email) convention.
      const DAY_MS = 86400000;
      const toDay = (ts: number) => Math.floor(ts / DAY_MS) * DAY_MS;
      const aStart = toDay(a.checkIn);
      const aEnd = toDay(a.checkOut);
      const bStart = toDay(b.checkIn);
      const bEnd = toDay(b.checkOut);

      // Same-day checkout/check-in is SAFE: aEnd === bStart or bEnd === aStart
      const overlapStart = Math.max(aStart, bStart);
      const overlapEnd = Math.min(aEnd, bEnd);

      if (overlapStart < overlapEnd) {
        // Real overlap — this is a conflict
        const conflictDays = Math.ceil((overlapEnd - overlapStart) / 86400000);
        const platformA = platformMap.get(a.platformId);
        const platformB = platformMap.get(b.platformId);
        const overrideA = overrideMap.get(a.id);
        const overrideB = overrideMap.get(b.id);

        conflicts.push({
          bookingAId: a.id,
          bookingBId: b.id,
          propertyId,
          propertyName,
          platformA: platformA?.platform ?? "unknown",
          platformB: platformB?.platform ?? "unknown",
          summaryA: a.summary ?? "Booking",
          summaryB: b.summary ?? "Booking",
          guestNameA: overrideA?.guestName ?? a.guestName ?? null,
          guestNameB: overrideB?.guestName ?? b.guestName ?? null,
          checkInA: a.checkIn,
          checkOutA: a.checkOut,
          checkInB: b.checkIn,
          checkOutB: b.checkOut,
          overlapStart,
          overlapEnd,
          conflictDays,
        });
      } else if (overlapStart === overlapEnd) {
        // Same-day turnover — back-to-back, check if there's a prep day
        // A prep day exists if there's a "prep" type booking on that day from either platform
        // For now we flag it as B2B with hasPrepDay = false (prep days are computed separately)
        backToBacks.push({
          bookingAId: a.id,
          bookingBId: b.id,
          propertyId,
          turnoverDate: overlapStart,
          hasPrepDay: false,
        });
      }
    }
  }

  return { conflicts, backToBacks };
}

/**
 * Run conflict detection across ALL properties and notify owner of any NEW conflicts.
 * Called by the iCal sync service after each poll.
 */
export async function detectAndNotifyAllConflicts(
  propertyList: Array<{ id: string; name: string }>
): Promise<ConflictReport> {
  const allConflicts: ConflictEntry[] = [];
  const allBackToBacks: BackToBackEntry[] = [];

  for (const prop of propertyList) {
    const report = await detectConflictsForProperty(prop.id, prop.name);
    allConflicts.push(...report.conflicts);
    allBackToBacks.push(...report.backToBacks);
  }

  if (allConflicts.length > 0) {
    const lines = allConflicts.map(
      (c) =>
        `• **${c.propertyName}**: ${c.platformA} (${c.guestNameA ?? c.summaryA}) ↔ ${c.platformB} (${c.guestNameB ?? c.summaryB}) — ${c.conflictDays} day(s) overlap starting ${new Date(c.overlapStart).toLocaleDateString()}`
    );
    await notifyOwner({
      title: `⚠️ ${allConflicts.length} Double-Booking Conflict${allConflicts.length > 1 ? "s" : ""} Detected`,
      content: `The following booking conflicts require your attention:\n\n${lines.join("\n")}`,
    });
  }

  return { conflicts: allConflicts, backToBacks: allBackToBacks };
}
