import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import * as db from "../db";
import { getShadowBlocksInRange } from "../db";
import { onEventUpserted, onEventDeleted } from "../services/eventPropagation";
import { requirePermission, hasPermission } from "../auth/rbac";
import { nanoid } from "nanoid";
import { discoverGoogleCalendars, connectGoogleCalendar, performIncrementalSync, getAccessTokenForCalendar } from "../services/calendarWebhook";

/**
 * P-27: Safe-by-default calendar flags.
 * Determines shadowSource, shadowBlocking, and noGoogleWrite based on the
 * Google Calendar's accessRole and externalId. Prevents Geeves from writing
 * to read-only or managed calendars on integration.
 *
 * Rules:
 *  - group.v.calendar.google.com (holidays/managed): fully read-only
 *  - group.calendar.google.com (shared group): noGoogleWrite=true, no shadow blocking
 *  - accessRole reader/freeBusyReader: fully read-only
 *  - accessRole owner/writer: full participation (default)
 *  - iCal feeds: source only (read from, never write to)
 */
function safeCalendarFlags(gcId: string, accessRole?: string, syncType?: string): {
  shadowSource: boolean;
  shadowBlocking: boolean;
  noGoogleWrite: boolean;
} {
  const ext = gcId || '';
  const role = accessRole || 'owner';
  const sync = syncType || '';
  // Google-managed holiday/group calendars — fully read-only
  if (ext.includes('group.v.calendar.google.com')) {
    return { shadowSource: false, shadowBlocking: false, noGoogleWrite: true };
  }
  // Shared group calendars — no write-back, but can be shadow sources
  if (ext.includes('group.calendar.google.com')) {
    return { shadowSource: true, shadowBlocking: false, noGoogleWrite: true };
  }
  // iCal/webcal feeds — read from, never write to
  if (sync === 'ical' || ext.startsWith('http') || ext.startsWith('webcal')) {
    return { shadowSource: true, shadowBlocking: false, noGoogleWrite: true };
  }
  // Google Calendar read-only access roles
  if (role === 'reader' || role === 'freeBusyReader') {
    return { shadowSource: false, shadowBlocking: false, noGoogleWrite: true };
  }
  // Default: owner or writer — full participation
  return { shadowSource: true, shadowBlocking: true, noGoogleWrite: false };
}
import { isGoogleCalendarConfigured, createGoogleEvent, updateGoogleEvent, deleteGoogleEvent } from "../services/googleCalendarSync";
import { emitCalendarEvent } from "../realtime";
import { getMemberCalendarAccessBatch } from "../db";

/**
 * Apply vertical_member_access rules on top of the RBAC calendar sets.
 * For each vertical the member has a specific access rule, override the
 * fullAccess / busyOnly classification accordingly:
 *   - none            → remove from both sets
 *   - blind           → move to busyOnly (all events become opaque time blocks)
 *   - availability_only → stays in fullAccess but booking events will strip guest PII
 *   - default_vertical → no override (RBAC result stands)
 *   - read_write       → no override (RBAC result stands)
 */
async function applyVerticalMemberAccessOverrides(
  memberId: string,
  verticalCalendarMap: Map<string, string>, // calendarId → verticalId
  fullAccessCalendarIds: Set<string>,
  busyOnlyCalendarIds: Set<string>
): Promise<{ availabilityOnlyCalendarIds: Set<string> }> {
  const availabilityOnlyCalendarIds = new Set<string>();
  // Collect unique verticalIds that have calendars in either set
  const verticalIds = new Set<string>();
  for (const [calId, vId] of Array.from(verticalCalendarMap.entries())) {
    if (fullAccessCalendarIds.has(calId) || busyOnlyCalendarIds.has(calId)) {
      verticalIds.add(vId);
    }
  }
  // P-42: Single batch query replaces N+1 per-vertical queries
  const ruleMap = await getMemberCalendarAccessBatch(memberId, Array.from(verticalIds));
  for (const [verticalId, rule] of Array.from(ruleMap.entries())) {
    const verticalCalIds = Array.from(verticalCalendarMap.entries())
      .filter(([, vId]) => vId === verticalId)
      .map(([calId]) => calId);
    if (rule.accessLevel === "none") {
      for (const calId of verticalCalIds) {
        fullAccessCalendarIds.delete(calId);
        busyOnlyCalendarIds.delete(calId);
      }
    } else if (rule.calendarAccess === "blind") {
      for (const calId of verticalCalIds) {
        if (fullAccessCalendarIds.has(calId)) {
          fullAccessCalendarIds.delete(calId);
          busyOnlyCalendarIds.add(calId);
        }
      }
    } else if (rule.calendarAccess === "availability_only") {
      for (const calId of verticalCalIds) {
        if (fullAccessCalendarIds.has(calId)) {
          availabilityOnlyCalendarIds.add(calId);
        }
      }
      if (rule.allowedCalendarIds.length > 0) {
        const allowed = new Set(rule.allowedCalendarIds);
        for (const calId of verticalCalIds) {
          if (!allowed.has(calId)) {
            fullAccessCalendarIds.delete(calId);
            busyOnlyCalendarIds.delete(calId);
          }
        }
      }
    }
    // default_vertical and read_write: no override needed
  }
  return { availabilityOnlyCalendarIds };
}

export const calendarRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const member = await db.getHouseholdMemberByUserId(ctx.user.id);
    if (!member) return [];
    if (hasPermission(member.role, "calendar.view_all")) {
      // household_admin — all calendars
      return db.getCalendars(member.householdId);
    }
    if (hasPermission(member.role, "calendar.view_vertical")) {
      // ea/member — apply vertical_member_access overrides to determine visible calendars
      const allCalendars = await db.getCalendars(member.householdId);
      // Build calendarId → verticalId map
      const calVerticalIdMap = new Map<string, string>();
      for (const cal of allCalendars) {
        if (cal.verticalId) calVerticalIdMap.set(cal.id, cal.verticalId);
      }
      // Start with all calendars as full access, then let overrides restrict
      const fullAccessCalendarIds = new Set(allCalendars.map(c => c.id));
      const busyOnlyCalendarIds = new Set<string>();
      await applyVerticalMemberAccessOverrides(
        member.id,
        calVerticalIdMap,
        fullAccessCalendarIds,
        busyOnlyCalendarIds
      );
      // Return only calendars the member has any access to (full or busy_only)
      const visibleCalendarIds = new Set([...Array.from(fullAccessCalendarIds), ...Array.from(busyOnlyCalendarIds)]);
      return allCalendars.filter(c => visibleCalendarIds.has(c.id));
    }
    // caregiver, child, elder — own calendars only
    return db.getCalendarsByMember(member.id);
  }),

  /** Returns only calendars assigned to a vertical ("synced" calendars for event creation). */
  listSynced: protectedProcedure.query(async ({ ctx }) => {
    const member = await db.getHouseholdMemberByUserId(ctx.user.id);
    if (!member) return [];
    if (hasPermission(member.role, "calendar.view_all") || hasPermission(member.role, "calendar.view_vertical")) {
      const all = await db.getCalendars(member.householdId);
      return all.filter(c => c.verticalId != null && c.accessLevel !== "free_busy");
    }
    const own = await db.getCalendarsByMember(member.id);
    return own.filter(c => c.verticalId != null && c.accessLevel !== "free_busy");
  }),

  create: protectedProcedure.input(z.object({
    name: z.string().min(1).max(255),
    // google_workspace kept for backward compat with existing DB rows; new calendars always use google_personal
    provider: z.enum(["google_workspace", "google_personal", "ical", "manual"]),
    externalId: z.string().optional(),
    accountEmail: z.string().email().optional(),
    color: z.string().max(20).optional(),
    syncType: z.enum(["push", "poll", "manual"]).default("manual"),
    accessLevel: z.enum(["read_write", "read_only", "free_busy"]).default("read_write"),
    isPrimary: z.boolean().default(false),
    verticalId: z.string().optional(),
    // Shadow blocking configuration — set during onboarding
    // shadowBlocking: false = this calendar will NOT receive Busy blocks from other calendars
    // shadowSource: false = events on this calendar will NOT generate Busy blocks on other calendars
    shadowBlocking: z.boolean().default(true),
    shadowSource: z.boolean().default(true),
  })).mutation(async ({ ctx, input }) => {
    const member = await db.getHouseholdMemberByUserId(ctx.user.id);
    if (!member) throw new TRPCError({ code: "FORBIDDEN", message: "Not a household member" });
    requirePermission(member, "calendar.manage");
    const id = nanoid();
    // P-50: iCal feeds are read-only — apply safe defaults regardless of what the caller sends.
    // safeCalendarFlags already handles ical/webcal externalIds, but provider=ical must also be caught.
    const safeFlags = input.provider === "ical"
      ? { shadowBlocking: false, shadowSource: false, noGoogleWrite: true }
      : {};
    await db.createCalendar({ id, householdId: member.householdId, memberId: member.id, ...input, ...safeFlags });
    return { id };
  }),

  update: protectedProcedure.input(z.object({
    id: z.string(),
    name: z.string().min(1).max(255).optional(),
    color: z.string().max(20).optional(),
    isVisible: z.boolean().optional(),
    shadowBlocking: z.boolean().optional(),
    shadowSource: z.boolean().optional(),
    syncType: z.enum(["push", "poll", "manual"]).optional(),
    accessLevel: z.enum(["read_write", "read_only", "free_busy"]).optional(),
    verticalId: z.string().nullable().optional(),
  })).mutation(async ({ ctx, input }) => {
    const member = await db.getHouseholdMemberByUserId(ctx.user.id);
    if (!member) throw new TRPCError({ code: "FORBIDDEN", message: "Not a household member" });
    requirePermission(member, "calendar.manage");
    const { id, ...data } = input;
    await db.updateCalendar(id, data);
    return { success: true };
  }),

  delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const member = await db.getHouseholdMemberByUserId(ctx.user.id);
    if (!member) throw new TRPCError({ code: "FORBIDDEN", message: "Not a household member" });
    requirePermission(member, "calendar.manage");
    await db.deleteCalendar(input.id);
    return { success: true };
  }),

  events: router({
    list: protectedProcedure.input(z.object({
      startTime: z.number(),
      endTime: z.number(),
      calendarIds: z.array(z.string()).optional(),
      // P-22: perspectiveCalendarId — when set, show shadow blocks as if viewing from that specific
      // calendar's perspective (e.g. Stardout, Maxfield). When omitted (master/global view),
      // shadow blocks are suppressed entirely because the master view already sees all source events
      // directly and uses color-coding to indicate the originating calendar.
      perspectiveCalendarId: z.string().optional(),
    })).query(async ({ ctx, input }) => {
      const member = await db.getHouseholdMemberByUserId(ctx.user.id);
      if (!member) return [];

      // ── Hoist all DB fetches to top — run in parallel where possible ─────────────────────
      const canViewAll = hasPermission(member.role, "calendar.view_all");
      const canViewVertical = hasPermission(member.role, "calendar.view_vertical");
      const needsVerticals = canViewVertical;
      const needsPropertyBookings = canViewAll || canViewVertical;

      const [allCalendars, allVerticals, memberCalendarsForRbac, ownedVerticalIds, allVisibilityRules] = await Promise.all([
        db.getCalendars(member.householdId),
        needsVerticals ? db.getVerticals(member.householdId) : Promise.resolve([] as Awaited<ReturnType<typeof db.getVerticals>>),
        (canViewVertical || (!canViewAll)) ? db.getCalendarsByMember(member.id) : Promise.resolve([] as Awaited<ReturnType<typeof db.getCalendarsByMember>>),
        canViewVertical ? db.getOwnedVerticalIds(member.householdId, ctx.user.id) : Promise.resolve(new Set<string>()),
        canViewVertical ? db.getAllVerticalVisibilityForHousehold(member.householdId) : Promise.resolve(new Map<string, Awaited<ReturnType<typeof db.getAllVerticalVisibilityForHousehold>> extends Map<string, infer V> ? V : never>()),
      ]);

      const calendarAccessMap = new Map(allCalendars.map(c => [c.id, c.accessLevel]));

      // ── LAYER 1: Determine which calendar IDs this member can see at all ──────────────────
      let fullAccessCalendarIds: Set<string>;
      // busyOnlyCalendarIds: calendars where we show events as "Busy" blocks only
      let busyOnlyCalendarIds: Set<string> = new Set();

      if (canViewAll) {
        // household_admin — sees everything, no filtering
        fullAccessCalendarIds = new Set(allCalendars.map(c => c.id));
      } else if (canViewVertical) {
        // ea or member — apply vertical privacy + cross-vertical visibility rules
        // (allVerticals, ownedVerticalIds, allVisibilityRules already fetched above in parallel)

        // Build calendarId → vertical map
        const calendarVerticalMap = new Map<string, typeof allVerticals[0]>();
        for (const cal of allCalendars) {
          if (cal.verticalId) {
            const v = allVerticals.find(v => v.id === cal.verticalId);
            if (v) calendarVerticalMap.set(cal.id, v);
          }
        }

        // For ea: get all vertical visibility rules to know which verticals are accessible
        // For member: only their assigned verticals get full access
        // (memberCalendarsForRbac already fetched above in parallel)
        const memberCalendars = memberCalendarsForRbac;
        const memberCalendarIds = new Set(memberCalendars.map(c => c.id));

        // Determine member's assigned verticals (verticals that have at least one of their calendars)
        const memberVerticalIds = new Set<string>();
        for (const cal of memberCalendars) {
          if (cal.verticalId) memberVerticalIds.add(cal.verticalId);
        }
        // Also include verticals they own
        for (const vid of Array.from(ownedVerticalIds)) memberVerticalIds.add(vid);

        fullAccessCalendarIds = new Set<string>();

        for (const v of allVerticals) {
          const privacy = (v.privacyLevel ?? "household") as "household" | "admin_only" | "private";
          const isOwner = ownedVerticalIds.has(v.id);
          const isMemberVertical = memberVerticalIds.has(v.id);

          // ── LAYER 2: Vertical privacy check ────────────────────────────────────────────────
          let verticalAccess: "full" | "busy_only" | "none";
          if (privacy === "private") {
            verticalAccess = isOwner ? "full" : "none";
          } else if (privacy === "admin_only") {
            // EA gets busy_only floor; member and below get none
            verticalAccess = member.role === "ea" ? "busy_only" : "none";
          } else {
            // household privacy
            if (member.role === "ea") {
              verticalAccess = "full";
            } else if (isMemberVertical) {
              // ── LAYER 3: Cross-vertical visibility rules ──────────────────────────────────
              // For member's own verticals: full access
              verticalAccess = "full";
            } else {
              // For other verticals: check cross-vertical visibility rules
              // We need to check: for each of the member's verticals, what visibility do they have to this vertical?
              // Take the highest visibility level across all their verticals
              // Batch visibility map is loaded once above (replaces N+1 getVerticalVisibility loop)
              let bestVisibility: "none" | "busy_only" | "full" = "none";
              for (const fromVerticalId of Array.from(memberVerticalIds)) {
                const rules = allVisibilityRules.get(fromVerticalId) ?? [];
                const rule = rules.find(r => r.toVerticalId === v.id);
                const level = (rule?.visibilityLevel ?? "busy_only") as "none" | "busy_only" | "full";
                if (level === "full") { bestVisibility = "full"; break; }
                if (level === "busy_only") bestVisibility = "busy_only";
              }
              verticalAccess = bestVisibility;
            }
          }

          // Add calendars to appropriate sets based on verticalAccess
          const verticalCalendars = allCalendars.filter(c => c.verticalId === v.id);
          if (verticalAccess === "full") {
            for (const c of verticalCalendars) fullAccessCalendarIds.add(c.id);
          } else if (verticalAccess === "busy_only") {
            for (const c of verticalCalendars) busyOnlyCalendarIds.add(c.id);
          }
        }

        // Always include calendars directly assigned to this member (even without a vertical)
        for (const calId of Array.from(memberCalendarIds)) {
          if (!busyOnlyCalendarIds.has(calId)) fullAccessCalendarIds.add(calId);
        }
      } else {
        // caregiver, child, elder — own calendars only (memberCalendarsForRbac already fetched above)
        fullAccessCalendarIds = new Set(memberCalendarsForRbac.map(c => c.id));
      }

      // ── LAYER 4: Apply vertical_member_access overrides (Cary-style restricted members) ───────
      // Build calendarId → verticalId map for the override function
      const calVerticalIdMap = new Map<string, string>();
      for (const cal of allCalendars) {
        if (cal.verticalId) calVerticalIdMap.set(cal.id, cal.verticalId);
      }
      const { availabilityOnlyCalendarIds } = await applyVerticalMemberAccessOverrides(
        member.id,
        calVerticalIdMap,
        fullAccessCalendarIds,
        busyOnlyCalendarIds
      );

      // Apply optional calendarIds filter from the client
      if (input.calendarIds && input.calendarIds.length > 0) {
        const requested = new Set(input.calendarIds);
        fullAccessCalendarIds = new Set(Array.from(fullAccessCalendarIds).filter(id => requested.has(id)));
        busyOnlyCalendarIds = new Set(Array.from(busyOnlyCalendarIds).filter(id => requested.has(id)));
      }

      // ── Fetch events + shadow blocks + property bookings in parallel ────────────────────────
      // (allVerticals already fetched above — no redundant call)
      const [allEvents, shadowBlockRows, rawBookings] = await Promise.all([
        db.getEvents(member.householdId, input.startTime, input.endTime),
        getShadowBlocksInRange(member.householdId, input.startTime, input.endTime),
        needsPropertyBookings
          ? db.getPropertyBookingsForHousehold(member.householdId, input.startTime, input.endTime)
          : Promise.resolve([] as Awaited<ReturnType<typeof db.getPropertyBookingsForHousehold>>),
      ]);
      // Full-access events
      const visibleEvents = allEvents.filter(e => fullAccessCalendarIds.has(e.calendarId));
      const busyOnlyEvents = allEvents
        .filter(e => busyOnlyCalendarIds.has(e.calendarId))
        .map(e => {
          const cal = allCalendars.find(c => c.id === e.calendarId);
          const vertical = cal?.verticalId ? allVerticals.find(v => v.id === cal.verticalId) : null;
          // Find the busyLabel from visibility rules if available
          // For now use a default; Phase 2 will wire per-vertical-pair labels
          const busyLabel = "Busy";
          return {
            ...e,
            id: `busy_${e.id}`,
            title: busyLabel,
            description: null,
            location: null,
            attendees: null,
            isBusyOnly: true,
          };
        });

      // Deduplicate full-access events by externalId (prefer organizer/read_write copy)
      const deduped = new Map<string, typeof visibleEvents[0]>();
      for (const event of visibleEvents) {
        const key = event.externalId || event.id;
        if (!deduped.has(key)) {
          deduped.set(key, event);
        } else {
          const existing = deduped.get(key)!;
          const existingAccess = calendarAccessMap.get(existing.calendarId) ?? "read_only";
          const newAccess = calendarAccessMap.get(event.calendarId) ?? "read_only";
          if (existingAccess !== "read_write" && newAccess === "read_write") {
            deduped.set(key, event);
          }
        }
      }
      const dedupedEvents = Array.from(deduped.values());
      // Build a map of eventId → calendarId for dedup: only suppress a shadow block when the
      // source event is already on the SAME calendar as the shadow block target. This prevents
      // the admin-view bug where all shadow blocks were silently dropped because the admin can
      // see all source events across all calendars (which is not a duplicate — a Bakery event
      // and its shadow block on StartOut are two different things the user needs to see).
      const dedupedEventCalendarMap = new Map(dedupedEvents.map(e => [e.id, e.calendarId]));

      // ── Shadow blocks (fetched above in parallel) ─────────────────────────────────────────
      // P-22: In the master/global view (no perspectiveCalendarId), shadow blocks are NEVER shown.
      // The master view already sees all source events directly and uses color-coding to identify
      // the originating calendar. Shadow blocks only make sense when viewing from the perspective
      // of a specific sub-calendar (e.g. Stardout, Maxfield) that can't see events on other calendars.
      // When a future per-calendar perspective switcher is added, pass perspectiveCalendarId to
      // enable shadow block display for that specific calendar's view.
      const shadowEvents = input.perspectiveCalendarId
        ? (() => {
            // P-21: Deduplicate shadow blocks by (targetCalendarId, startTime, endTime) as a safety net.
            const shadowBlockDedupeMap = new Map<string, typeof shadowBlockRows[0]>();
            for (const sb of shadowBlockRows) {
              const key = `${sb.targetCalendarId}|${sb.startTime}|${sb.endTime}`;
              if (!shadowBlockDedupeMap.has(key)) {
                shadowBlockDedupeMap.set(key, sb);
              }
            }
            return Array.from(shadowBlockDedupeMap.values())
              // Show a shadow block when:
              //   1. The viewer has full access to the TARGET calendar (they can see the busy block)
              //   2. The source event is NOT already on the target calendar (that would be a true duplicate)
              //   3. The target calendar is not in busyOnlyCalendarIds (already handled as busy-only)
              .filter(sb =>
                fullAccessCalendarIds.has(sb.targetCalendarId) &&
                dedupedEventCalendarMap.get(sb.sourceEventId) !== sb.targetCalendarId &&
                !busyOnlyCalendarIds.has(sb.targetCalendarId)
              )
              .map(sb => ({
                id: `shadow_${sb.id}`,
                calendarId: sb.targetCalendarId,
                title: sb.maskedTitle ?? "Busy",
                startTime: sb.startTime,
                endTime: sb.endTime,
                isAllDay: sb.isAllDay,
                isShadow: true,
                sourceEventId: sb.sourceEventId,
                householdId: member.householdId,
                description: null,
                location: null,
                externalId: null,
                status: "confirmed" as const,
                visibility: "default" as const,
                recurrenceRule: null,
                attendees: null,
                reminders: null,
                createdBy: null,
                lastModifiedBy: null,
                source: "import" as const,
                createdAt: new Date(),
                updatedAt: new Date(),
              }));
          })()
        : []; // Master view: no shadow blocks — all events are visible directly with color-coding

      // Enrich all events with verticalColor for the dashboard calendar widget
      const calVerticalColorMap = new Map<string, { color: string; verticalId: string }>();
      for (const cal of allCalendars) {
        if (cal.verticalId) {
          const v = allVerticals.find(v => v.id === cal.verticalId);
          if (v) calVerticalColorMap.set(cal.id, { color: v.color || "#2AAFA9", verticalId: v.id });
        }
      }
      // ── PROPERTY BOOKINGS: inject as all-day calendar events ──────────────────────────────
      // rawBookings was fetched above in the parallel Promise.all block (needsPropertyBookings guard).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let propertyBookingEvents: any[] = [];
      if (needsPropertyBookings) {
        propertyBookingEvents = rawBookings
          .filter(b => b.bookingType === "booking" || b.bookingType === "block")
          .map(b => {
            // Use the property's calendarId if available, else a synthetic ID
            const calId = b.propertyCalendarId ?? `prop_${b.propertyId}`;
            const isAvailabilityOnly = availabilityOnlyCalendarIds.has(calId);
            // availability_only: show check-in/check-out only, strip guest PII (summary/guestName)
            const label = b.bookingType === "booking"
              ? (isAvailabilityOnly
                  ? `${b.propertyName} — Guest Stay` // no guest name
                  : (b.summary ? `${b.propertyName}: ${b.summary}` : `${b.propertyName} — Guest Stay`))
              : `${b.propertyName} — Blocked`;
            // checkIn/checkOut are already UTC midnight timestamps from iCal
            return {
              id: `booking_${b.id}`,
              calendarId: calId,
              title: label,
              description: null,
              startTime: b.checkIn,
              endTime: b.checkOut,
              isAllDay: true as const,
              isShadow: false,
              sourceEventId: null,
              householdId: member.householdId,
              location: null,
              externalId: null,
              status: "confirmed" as const,
              visibility: "default" as const,
              recurrenceRule: null,
              attendees: null,
              reminders: null,
              createdBy: null,
              lastModifiedBy: null,
              source: "import" as const,
              createdAt: new Date(),
              updatedAt: new Date(),
              // Extra fields for the calendar to render check-in/out nodes
              isPropertyBooking: true,
              bookingType: b.bookingType,
              hasConflict: b.hasConflict,
              propertyId: b.propertyId,
              propertyName: b.propertyName,
              // availability_only: strip guest PII fields (guestName not in booking row — stripped at title level above)
              verticalColor: calVerticalColorMap.get(calId)?.color ?? "#E8624A",
              verticalId: calVerticalColorMap.get(calId)?.verticalId ?? null,
            };
          });
      }

      const enriched = [...dedupedEvents, ...busyOnlyEvents, ...shadowEvents].map(e => ({
        ...e,
        verticalColor: calVerticalColorMap.get(e.calendarId)?.color ?? null,
        verticalId: calVerticalColorMap.get(e.calendarId)?.verticalId ?? null,
      }));
      return [...enriched, ...propertyBookingEvents];
    }),

    create: protectedProcedure.input(z.object({
      calendarId: z.string(),
      title: z.string().min(1).max(500),
      description: z.string().optional(),
      location: z.string().optional(),
      startTime: z.number(),
      endTime: z.number(),
      isAllDay: z.boolean().default(false),
      recurrenceRule: z.string().optional(),
      visibility: z.enum(["default", "public", "private", "confidential"]).default("default"),
      attendees: z.any().optional(),
      reminders: z.any().optional(),
    })).mutation(async ({ ctx, input }) => {
      const member = await db.getHouseholdMemberByUserId(ctx.user.id);
      if (!member) throw new TRPCError({ code: "FORBIDDEN", message: "Not a household member" });
      requirePermission(member, "calendar.edit");
      const id = nanoid();
            await db.createEvent({ id, householdId: member.householdId, ...input, createdBy: member.id, lastModifiedBy: member.id, source: "manual" });

      // Propagate to all target Google Calendars via the central propagation service
      onEventUpserted(id, member.householdId).catch(e =>
        console.warn("[Calendar] Event propagation failed:", e)
      );

      // Write-back to Google Calendar
      const calendarForCreate = await db.getCalendar(input.calendarId);
      if (calendarForCreate?.externalId && (calendarForCreate.provider === "google_workspace" || calendarForCreate.provider === "google_personal") && calendarForCreate.accessLevel === "read_write") {
        try {
          const accessToken = await getAccessTokenForCalendar(calendarForCreate.id, member.id);
          if (accessToken) {
            const tz = "America/New_York";
            const gEvent = await createGoogleEvent(accessToken, calendarForCreate.externalId, {
              summary: input.title,
              description: input.description,
              location: input.location,
              start: input.isAllDay
                ? { date: new Date(input.startTime).toISOString().slice(0, 10) }
                : { dateTime: new Date(input.startTime).toISOString(), timeZone: tz },
              end: input.isAllDay
                // Google all-day end.date is EXCLUSIVE — add 1 day to the last inclusive day
                ? { date: new Date(input.endTime + 86400000).toISOString().slice(0, 10) }
                : { dateTime: new Date(input.endTime).toISOString(), timeZone: tz },
              ...(input.recurrenceRule ? { recurrence: [input.recurrenceRule] } : {}),
            });
            await db.updateEvent(id, { externalId: gEvent.id, source: "sync" });
          }
        } catch (gcalErr) {
          console.warn("[Calendar] Google write-back failed for create:", gcalErr);
        }
      }

      // Emit real-time update to all household members
      emitCalendarEvent(member.householdId, "created", {
        id,
        calendarId: input.calendarId,
        title: input.title,
        startTime: input.startTime,
        endTime: input.endTime,
        isAllDay: input.isAllDay,
      });
      return { id };
    }),
    update: protectedProcedure.input(z.object({
      id: z.string(),
      title: z.string().min(1).max(500).optional(),
      description: z.string().nullable().optional(),
      location: z.string().nullable().optional(),
      startTime: z.number().optional(),
      endTime: z.number().optional(),
      isAllDay: z.boolean().optional(),
      status: z.enum(["confirmed", "tentative", "cancelled"]).optional(),
      visibility: z.enum(["default", "public", "private", "confidential"]).optional(),
      /** Recurring event scope: single (this only), following (this + future), all (entire series) */
      scope: z.enum(["single", "following", "all"]).default("single"),
    })).mutation(async ({ ctx, input }) => {
      const member = await db.getHouseholdMemberByUserId(ctx.user.id);
      if (!member) throw new TRPCError({ code: "FORBIDDEN", message: "Not a household member" });
      requirePermission(member, "calendar.edit");
      const { id, scope, ...data } = input;
      const existingForUpdate = await db.getEvent(id);
      if (!existingForUpdate) throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });

      const isRecurring = !!(existingForUpdate.recurringEventId || existingForUpdate.recurrenceRule);
      const tz = "America/New_York";

      if (!isRecurring || scope === "single") {
        // ── Single instance update (or non-recurring) ──
        // Detach from series if it was part of one
        const detachData: Record<string, unknown> = { ...data, lastModifiedBy: member.id };
        if (isRecurring && scope === "single") {
          detachData.recurringEventId = null;
          detachData.recurrenceRule = null;
        }
        await db.updateEvent(id, detachData as any);
        onEventUpserted(id, member.householdId).catch(e => console.warn("[Calendar] Re-propagation failed:", e));

        // Google write-back: PATCH the specific instance
        if (existingForUpdate.externalId && existingForUpdate.calendarId) {
          const cal = await db.getCalendar(existingForUpdate.calendarId);
          if (cal?.externalId && (cal.provider === "google_personal" || cal.provider === "google_workspace") && cal.accessLevel === "read_write") {
            try {
              const token = await getAccessTokenForCalendar(cal.id, member.id);
              if (token) {
                const patch: Parameters<typeof updateGoogleEvent>[3] = {};
                if (data.title) patch.summary = data.title;
                if (data.description !== undefined) patch.description = data.description;
                if (data.location !== undefined) patch.location = data.location;
                if (data.startTime !== undefined) patch.start = data.isAllDay ? { date: new Date(data.startTime).toISOString().slice(0, 10) } : { dateTime: new Date(data.startTime).toISOString(), timeZone: tz };
                if (data.endTime !== undefined) patch.end = data.isAllDay ? { date: new Date(data.endTime + 86400000).toISOString().slice(0, 10) } : { dateTime: new Date(data.endTime).toISOString(), timeZone: tz };
                await updateGoogleEvent(token, cal.externalId, existingForUpdate.externalId, patch);
              }
            } catch (e) { console.warn("[Calendar] Google update write-back failed:", e); }
          }
        }

      } else if (scope === "following") {
        // ── This and following: split the series ──
        const masterExternalId = existingForUpdate.recurringEventId || existingForUpdate.externalId;
        const fromTime = existingForUpdate.startTime;

        // Update all instances from this one onwards in DB
        if (masterExternalId) {
          await db.deleteEventsByRecurringIdFrom(masterExternalId, member.householdId, fromTime);
          await db.deleteShadowBlocksForRecurringFrom(masterExternalId, member.householdId, fromTime);
        }
        // Create a new standalone event (or new series) from this instance with updated data
        const newId = nanoid();
        const newStart = data.startTime ?? existingForUpdate.startTime;
        const newEnd = data.endTime ?? existingForUpdate.endTime;
        await db.createEvent({
          id: newId,
          householdId: member.householdId,
          calendarId: existingForUpdate.calendarId,
          title: data.title ?? existingForUpdate.title,
          description: data.description !== undefined ? data.description : existingForUpdate.description,
          location: data.location !== undefined ? data.location : existingForUpdate.location,
          startTime: newStart,
          endTime: newEnd,
          isAllDay: data.isAllDay ?? existingForUpdate.isAllDay ?? false,
          recurrenceRule: existingForUpdate.recurrenceRule ?? undefined,
          source: "manual",
          createdBy: member.id,
          lastModifiedBy: member.id,
        });
        onEventUpserted(newId, member.householdId).catch(e => console.warn("[Calendar] Re-propagation failed:", e));

        // Google write-back: truncate RRULE UNTIL on master, create new event from this date
        if (masterExternalId && existingForUpdate.calendarId) {
          const cal = await db.getCalendar(existingForUpdate.calendarId);
          if (cal?.externalId && (cal.provider === "google_personal" || cal.provider === "google_workspace") && cal.accessLevel === "read_write") {
            try {
              const token = await getAccessTokenForCalendar(cal.id, member.id);
              if (token) {
                // Truncate the original series UNTIL the day before this instance
                const untilDate = new Date(fromTime - 86400000).toISOString().slice(0, 10).replace(/-/g, "") + "T000000Z";
                const masterEvent = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.externalId)}/events/${encodeURIComponent(masterExternalId)}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
                if (masterEvent.recurrence) {
                  const truncatedRecurrence = masterEvent.recurrence.map((r: string) =>
                    r.startsWith("RRULE:") ? r.replace(/UNTIL=[^;]*/g, "").replace(/;$/, "") + `;UNTIL=${untilDate}` : r
                  );
                  await updateGoogleEvent(token, cal.externalId, masterExternalId, { recurrence: truncatedRecurrence } as any);
                }
                // Create new event from this date with updated data
                const gEvent = await createGoogleEvent(token, cal.externalId, {
                  summary: data.title ?? existingForUpdate.title,
                  description: data.description !== undefined ? (data.description ?? undefined) : (existingForUpdate.description ?? undefined),
                  location: data.location !== undefined ? (data.location ?? undefined) : (existingForUpdate.location ?? undefined),
                  start: (data.isAllDay ?? existingForUpdate.isAllDay) ? { date: new Date(newStart).toISOString().slice(0, 10) } : { dateTime: new Date(newStart).toISOString(), timeZone: tz },
                  end: (data.isAllDay ?? existingForUpdate.isAllDay) ? { date: new Date(newEnd + 86400000).toISOString().slice(0, 10) } : { dateTime: new Date(newEnd).toISOString(), timeZone: tz },
                });
                await db.updateEvent(newId, { externalId: gEvent.id, source: "sync" });
              }
            } catch (e) { console.warn("[Calendar] Google following-update write-back failed:", e); }
          }
        }

      } else {
        // ── All events in series ──
        const masterExternalId = existingForUpdate.recurringEventId || existingForUpdate.externalId;
        if (masterExternalId) {
          await db.updateEventsByRecurringId(masterExternalId, member.householdId, { ...data, lastModifiedBy: member.id } as any);
          // Re-propagate all instances
          const allInstances = await db.getEventsByRecurringId(masterExternalId, member.householdId);
          for (const inst of allInstances) {
            onEventUpserted(inst.id, member.householdId).catch(e => console.warn("[Calendar] Re-propagation failed:", e));
          }
        } else {
          await db.updateEvent(id, { ...data, lastModifiedBy: member.id });
          onEventUpserted(id, member.householdId).catch(e => console.warn("[Calendar] Re-propagation failed:", e));
        }

        // Google write-back: update the master recurring event
        const masterIdForGcal = masterExternalId || existingForUpdate.externalId;
        if (masterIdForGcal && existingForUpdate.calendarId) {
          const cal = await db.getCalendar(existingForUpdate.calendarId);
          if (cal?.externalId && (cal.provider === "google_personal" || cal.provider === "google_workspace") && cal.accessLevel === "read_write") {
            try {
              const token = await getAccessTokenForCalendar(cal.id, member.id);
              if (token) {
                const patch: Parameters<typeof updateGoogleEvent>[3] = {};
                if (data.title) patch.summary = data.title;
                if (data.description !== undefined) patch.description = data.description;
                if (data.location !== undefined) patch.location = data.location;
                if (data.startTime !== undefined) patch.start = data.isAllDay ? { date: new Date(data.startTime).toISOString().slice(0, 10) } : { dateTime: new Date(data.startTime).toISOString(), timeZone: tz };
                if (data.endTime !== undefined) patch.end = data.isAllDay ? { date: new Date(data.endTime + 86400000).toISOString().slice(0, 10) } : { dateTime: new Date(data.endTime).toISOString(), timeZone: tz };
                await updateGoogleEvent(token, cal.externalId, masterIdForGcal, patch);
              }
            } catch (e) { console.warn("[Calendar] Google all-update write-back failed:", e); }
          }
        }
      }

      emitCalendarEvent(member.householdId, "updated", {
        id,
        calendarId: existingForUpdate.calendarId,
        title: input.title ?? existingForUpdate.title,
        startTime: input.startTime ?? existingForUpdate.startTime,
        endTime: input.endTime ?? existingForUpdate.endTime,
      });
      return { success: true };
    }),

    delete: protectedProcedure.input(z.object({
      id: z.string(),
      /** Recurring event scope: single (this only), following (this + future), all (entire series) */
      scope: z.enum(["single", "following", "all"]).default("single"),
    })).mutation(async ({ ctx, input }) => {
      const member = await db.getHouseholdMemberByUserId(ctx.user.id);
      if (!member) throw new TRPCError({ code: "FORBIDDEN", message: "Not a household member" });
      requirePermission(member, "calendar.edit");
      const existingForDelete = await db.getEvent(input.id);
      if (!existingForDelete) throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });

      const isRecurring = !!(existingForDelete.recurringEventId || existingForDelete.recurrenceRule);
      const masterExternalId = existingForDelete.recurringEventId || existingForDelete.externalId;

      if (!isRecurring || input.scope === "single") {
        // ── Delete single instance ──
        await db.deleteEvent(input.id);
        onEventDeleted(input.id).catch(e => console.warn("[Calendar] Deletion propagation failed:", e));

        // Google write-back: add EXDATE to master event to exclude this instance
        if (existingForDelete.externalId && existingForDelete.calendarId) {
          const cal = await db.getCalendar(existingForDelete.calendarId);
          if (cal?.externalId && (cal.provider === "google_personal" || cal.provider === "google_workspace") && cal.accessLevel === "read_write") {
            try {
              const token = await getAccessTokenForCalendar(cal.id, member.id);
              if (token) {
                if (isRecurring && masterExternalId && masterExternalId !== existingForDelete.externalId) {
                  // This is an instance of a recurring event — add EXDATE to master
                  const exdate = new Date(existingForDelete.startTime).toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
                  const masterEvent = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.externalId)}/events/${encodeURIComponent(masterExternalId)}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
                  const existingExdates = (masterEvent.recurrence || []).filter((r: string) => r.startsWith("EXDATE"));
                  const newExdate = `EXDATE;TZID=America/New_York:${exdate}`;
                  await updateGoogleEvent(token, cal.externalId, masterExternalId, { recurrence: [...(masterEvent.recurrence || []).filter((r: string) => !r.startsWith("EXDATE")), ...existingExdates, newExdate] } as any);
                } else {
                  // Non-recurring or master event itself — just delete it
                  await deleteGoogleEvent(token, cal.externalId, existingForDelete.externalId);
                }
              }
            } catch (e) { console.warn("[Calendar] Google single-delete write-back failed:", e); }
          }
        }

      } else if (input.scope === "following") {
        // ── Delete this and all following ──
        const fromTime = existingForDelete.startTime;
        if (masterExternalId) {
          await db.deleteShadowBlocksForRecurringFrom(masterExternalId, member.householdId, fromTime);
          await db.deleteEventsByRecurringIdFrom(masterExternalId, member.householdId, fromTime);
        } else {
          await db.deleteEvent(input.id);
          onEventDeleted(input.id).catch(e => console.warn("[Calendar] Deletion propagation failed:", e));
        }

        // Google write-back: truncate RRULE UNTIL to day before this instance
        if (masterExternalId && existingForDelete.calendarId) {
          const cal = await db.getCalendar(existingForDelete.calendarId);
          if (cal?.externalId && (cal.provider === "google_personal" || cal.provider === "google_workspace") && cal.accessLevel === "read_write") {
            try {
              const token = await getAccessTokenForCalendar(cal.id, member.id);
              if (token) {
                const untilDate = new Date(fromTime - 86400000).toISOString().slice(0, 10).replace(/-/g, "") + "T000000Z";
                const masterEvent = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.externalId)}/events/${encodeURIComponent(masterExternalId)}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
                if (masterEvent.recurrence) {
                  const truncated = masterEvent.recurrence.map((r: string) =>
                    r.startsWith("RRULE:") ? r.replace(/UNTIL=[^;]*/g, "").replace(/;$/, "") + `;UNTIL=${untilDate}` : r
                  );
                  await updateGoogleEvent(token, cal.externalId, masterExternalId, { recurrence: truncated } as any);
                }
              }
            } catch (e) { console.warn("[Calendar] Google following-delete write-back failed:", e); }
          }
        }

      } else {
        // ── Delete entire series ──
        if (masterExternalId) {
          // Delete all shadow blocks first
          const allInstances = await db.getEventsByRecurringId(masterExternalId, member.householdId);
          for (const inst of allInstances) {
            onEventDeleted(inst.id).catch(e => console.warn("[Calendar] Deletion propagation failed:", e));
          }
          await db.deleteEventsByRecurringIdFrom(masterExternalId, member.householdId, 0);
        } else {
          await db.deleteEvent(input.id);
          onEventDeleted(input.id).catch(e => console.warn("[Calendar] Deletion propagation failed:", e));
        }

        // Google write-back: delete the master event (all instances cascade)
        const masterIdForGcal = masterExternalId || existingForDelete.externalId;
        if (masterIdForGcal && existingForDelete.calendarId) {
          const cal = await db.getCalendar(existingForDelete.calendarId);
          if (cal?.externalId && (cal.provider === "google_personal" || cal.provider === "google_workspace") && cal.accessLevel === "read_write") {
            try {
              const token = await getAccessTokenForCalendar(cal.id, member.id);
              if (token) await deleteGoogleEvent(token, cal.externalId, masterIdForGcal);
            } catch (e) { console.warn("[Calendar] Google all-delete write-back failed:", e); }
          }
        }
      }

      emitCalendarEvent(member.householdId, "deleted", {
        id: input.id,
        calendarId: existingForDelete.calendarId,
      });
      return { success: true };
    }),
  }),

  // ─── Google Calendar Sync Procedures ───────────────────────────────

  syncStatus: protectedProcedure.query(async () => {
    return {
      googleOAuthConfigured: isGoogleCalendarConfigured(),
    };
  }),

  discoverGoogle: protectedProcedure.mutation(async ({ ctx }) => {
    const member = await db.getHouseholdMemberByUserId(ctx.user.id);
    if (!member) throw new TRPCError({ code: "FORBIDDEN", message: "Not a household member" });
    requirePermission(member, "calendar.manage");
    return discoverGoogleCalendars(member.id);
  }),

  connectGoogle: protectedProcedure.input(z.object({
    googleCalendarId: z.string(),
    name: z.string(),
    color: z.string().default("#4285f4"),
    isPrimary: z.boolean().default(false),
    provider: z.enum(["google_personal"]).default("google_personal").optional(),
    // Shadow blocking configuration set during onboarding
    shadowBlocking: z.boolean().default(true),
    shadowSource: z.boolean().default(true),
  })).mutation(async ({ ctx, input }) => {
    const member = await db.getHouseholdMemberByUserId(ctx.user.id);
    if (!member) throw new TRPCError({ code: "FORBIDDEN", message: "Not a household member" });
    requirePermission(member, "calendar.manage");
    return connectGoogleCalendar({
      householdId: member.householdId,
      memberId: member.id,
      ...input,
    });
  }),

  syncCalendar: protectedProcedure.input(z.object({
    calendarId: z.string(),
  })).mutation(async ({ ctx, input }) => {
    const member = await db.getHouseholdMemberByUserId(ctx.user.id);
    if (!member) throw new TRPCError({ code: "FORBIDDEN", message: "Not a household member" });
    requirePermission(member, "calendar.manage");
    const calendar = await db.getCalendar(input.calendarId);
    if (!calendar || calendar.householdId !== member.householdId) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Calendar not found" });
    }
    if (!calendar.externalId) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Calendar has no external ID (not a synced calendar)" });
    }
    return performIncrementalSync(calendar.id, calendar.householdId, calendar.externalId, calendar.memberId);
  }),

  /**
   * Force a full re-sync of a calendar from Google, bypassing the incremental sync token.
   * This is the correct fix when:
   *  - An event was edited in Google but the Geeves DB record was previously deleted
   *  - Shadow blocks are missing for events that should have them
   *  - The sync token is stale or the calendar is out of sync
   *
   * The full sync will:
   *  1. Clear the stored sync token so a full fetch is performed
   *  2. Re-upsert ALL events from Google (creating new DB rows for any that were deleted)
   *  3. Call onEventUpserted for every confirmed event, which creates shadow blocks
   *     for all target calendars per visibility rules (DB rows are always written,
   *     even if Google Calendar write fails due to missing token)
   */
  forceFullSync: protectedProcedure.input(z.object({
    calendarId: z.string(),
  })).mutation(async ({ ctx, input }) => {
    const member = await db.getHouseholdMemberByUserId(ctx.user.id);
    if (!member) throw new TRPCError({ code: "FORBIDDEN", message: "Not a household member" });
    requirePermission(member, "calendar.manage");

    const calendar = await db.getCalendar(input.calendarId);
    if (!calendar || calendar.householdId !== member.householdId) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Calendar not found" });
    }
    if (!calendar.externalId) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Calendar has no external ID (not a synced calendar)" });
    }

    // Clear the sync token so performIncrementalSync falls back to full sync
    await db.updateCalendarSyncToken(input.calendarId, "");
    console.log(`[ForceFullSync] Cleared sync token for calendar ${input.calendarId} (${calendar.name})`);

    // performIncrementalSync will see no sync token and call performFullSyncForCalendar
    // which re-upserts all events and calls onEventUpserted for each confirmed event
    return performIncrementalSync(calendar.id, calendar.householdId, calendar.externalId, calendar.memberId);
  }),

  // Re-trigger full calendar discovery for the current user — useful if they were already logged in
  // before auto-sync was added, or if they want to pick up newly created calendars
  rediscoverAll: protectedProcedure.mutation(async ({ ctx }) => {
    const member = await db.getHouseholdMemberByUserId(ctx.user.id);
    if (!member) throw new TRPCError({ code: "FORBIDDEN", message: "Not a household member" });
    requirePermission(member, "calendar.manage");

    const oauthToken = await db.getOAuthToken(member.id, "google");
    if (!oauthToken) {
      return { discovered: 0, error: "No Google account connected. Please sign in with Google first." };
    }

    const { listGoogleCalendars, performFullSync, refreshAccessToken } =
      await import("../services/googleCalendarSync");
    const { emitSyncStatus } = await import("../realtime");
    const { randomUUID } = await import("crypto");
    const { nanoid: nid } = await import("nanoid");

    let accessToken: string;
    if (oauthToken.expiresAt && oauthToken.expiresAt < Date.now() + 60_000) {
      if (!oauthToken.refreshToken) {
        return { discovered: 0, error: "Google token expired. Please sign in with Google again to reconnect." };
      }
      const refreshed = await refreshAccessToken(oauthToken.refreshToken);
      await db.updateOAuthToken(oauthToken.id, {
        accessToken: refreshed.accessToken,
        expiresAt: refreshed.expiresAt,
        lastRefreshedAt: new Date(),
      });
      accessToken = refreshed.accessToken;
    } else {
      accessToken = oauthToken.accessToken;
    }

    const googleCalendars = await listGoogleCalendars(accessToken);
    const existingCalendars = await db.getCalendarsByMember(member.id);
    const existingExternalIds = new Set(existingCalendars.map(c => c.externalId));

    let discovered = 0;
    for (const gc of googleCalendars) {
      if (existingExternalIds.has(gc.id)) continue;
      const calendarId = nid();
      await db.createCalendar({
        id: calendarId,
        householdId: member.householdId,
        memberId: member.id,
        provider: "google_personal",
        externalId: gc.id,
        name: gc.summary || gc.id,
        color: gc.backgroundColor || "#4285f4",
        syncType: "push",
        isPrimary: gc.primary || false,
        isVisible: true,
        accessLevel: gc.accessRole === "owner" || gc.accessRole === "writer" ? "read_write" : "read_only",
        // P-27: Apply safe-by-default flags based on calendar type and access role
        ...safeCalendarFlags(gc.id, gc.accessRole),
      });
      discovered++;
      try {
        emitSyncStatus(member.householdId, calendarId, "syncing");
        await performFullSync(accessToken, gc.id, calendarId, member.householdId, {
          upsertEvent: async (event) => { await db.upsertEvent({ id: randomUUID(), ...event, source: "sync" }); },
          updateSyncToken: async (calId, token) => { await db.updateCalendarSyncToken(calId, token); },
        });
        emitSyncStatus(member.householdId, calendarId, "synced");
      } catch (syncError) {
        emitSyncStatus(member.householdId, calendarId, "error", String(syncError));
      }
    }

    return { discovered, total: googleCalendars.length };
  }),

  // ─── Multi-Account Google Management ─────────────────────────────

  /** List all connected Google accounts for the current member */
  listGoogleAccounts: protectedProcedure.query(async ({ ctx }) => {
    const member = await db.getHouseholdMemberByUserId(ctx.user.id);
    if (!member) return [];
    const tokens = await db.getAllOAuthTokens(member.id, "google");
    // Return safe subset (no access/refresh tokens)
    return tokens.map(t => ({
      id: t.id,
      accountEmail: t.accountEmail,
      status: t.status,
      scopes: t.scopes,
      lastRefreshedAt: t.lastRefreshedAt,
      createdAt: t.createdAt,
    }));
  }),

  /** Disconnect a Google account (revoke token + remove its calendars) */
  removeGoogleAccount: protectedProcedure.input(z.object({
    // P-11: tokenId preferred; accountEmail kept as fallback for backwards compat
    tokenId: z.string().uuid().optional(),
    accountEmail: z.string().email().optional(),
  })).mutation(async ({ ctx, input }) => {
    const member = await db.getHouseholdMemberByUserId(ctx.user.id);
    if (!member) throw new TRPCError({ code: "FORBIDDEN", message: "Not a household member" });
    requirePermission(member, "calendar.manage");
    let token;
    if (input.tokenId) {
      token = await db.getOAuthTokenById(input.tokenId);
      if (!token) throw new TRPCError({ code: "NOT_FOUND", message: "Google account not connected" });
      if (token.memberId !== member.id) throw new TRPCError({ code: "FORBIDDEN", message: "Not your account" });
    } else if (input.accountEmail) {
      token = await db.getOAuthTokenByEmail(member.id, "google", input.accountEmail);
      if (!token) throw new TRPCError({ code: "NOT_FOUND", message: "Google account not connected" });
    } else {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Either tokenId or accountEmail is required" });
    }
    await db.revokeOAuthToken(token.id);
    return { success: true };
  }),

  /** Re-discover calendars for a specific connected Google account */
  discoverForAccount: protectedProcedure.input(z.object({
    accountEmail: z.string().email(),
  })).mutation(async ({ ctx, input }) => {
    const member = await db.getHouseholdMemberByUserId(ctx.user.id);
    if (!member) throw new TRPCError({ code: "FORBIDDEN", message: "Not a household member" });
    requirePermission(member, "calendar.manage");

    const token = await db.getOAuthTokenByEmail(member.id, "google", input.accountEmail);
    if (!token) {
      return { discovered: 0, error: `No connected account for ${input.accountEmail}. Please add it first.` };
    }

    const { listGoogleCalendars, performFullSync, refreshAccessToken } =
      await import("../services/googleCalendarSync");
    const { emitSyncStatus } = await import("../realtime");
    const { randomUUID: rUUID } = await import("crypto");
    const { nanoid: nid } = await import("nanoid");

    let accessToken: string;
    if (token.expiresAt && token.expiresAt < Date.now() + 60_000) {
      if (!token.refreshToken) {
        return { discovered: 0, error: `Token expired for ${input.accountEmail}. Please reconnect.` };
      }
      const refreshed = await refreshAccessToken(token.refreshToken);
      await db.updateOAuthToken(token.id, {
        accessToken: refreshed.accessToken,
        expiresAt: refreshed.expiresAt,
        lastRefreshedAt: new Date(),
      });
      accessToken = refreshed.accessToken;
    } else {
      accessToken = token.accessToken;
    }

    const googleCalendars = await listGoogleCalendars(accessToken);
    const existingCalendars = await db.getCalendarsByMember(member.id);
    const existingExternalIds = new Set(existingCalendars.map(c => c.externalId));

    let discovered = 0;
    for (const gc of googleCalendars) {
      if (existingExternalIds.has(gc.id)) continue;
      const calendarId = nid();
      await db.createCalendar({
        id: calendarId,
        householdId: member.householdId,
        memberId: member.id,
        provider: "google_personal",
        externalId: gc.id,
        accountEmail: input.accountEmail,
        name: gc.summary || gc.id,
        color: gc.backgroundColor || "#4285f4",
        syncType: "push",
        isPrimary: gc.primary || false,
        isVisible: true,
        accessLevel: gc.accessRole === "owner" || gc.accessRole === "writer" ? "read_write" : "read_only",
        // P-27: Apply safe-by-default flags based on calendar type and access role
        ...safeCalendarFlags(gc.id, gc.accessRole),
      });
      discovered++;
      try {
        emitSyncStatus(member.householdId, calendarId, "syncing");
        await performFullSync(accessToken, gc.id, calendarId, member.householdId, {
          upsertEvent: async (event) => { await db.upsertEvent({ id: rUUID(), ...event, source: "sync" }); },
          updateSyncToken: async (calId, tkn) => { await db.updateCalendarSyncToken(calId, tkn); },
        });
        emitSyncStatus(member.householdId, calendarId, "synced");
      } catch (syncError) {
        emitSyncStatus(member.householdId, calendarId, "error", String(syncError));
      }
    }

    return { discovered, total: googleCalendars.length };
  }),

  /** Admin: manually re-register Google push webhooks for all calendars */
  reregisterWebhooks: protectedProcedure.mutation(async ({ ctx }) => {
    const member = await db.getHouseholdMemberByUserId(ctx.user.id);
    if (!member) throw new TRPCError({ code: "FORBIDDEN", message: "Not a household member" });
    requirePermission(member, "calendar.manage");
    const { registerAllWebhooks } = await import("../services/calendarWebhook");
    await registerAllWebhooks();
    return { success: true };
  }),

  // ─── Shadow Override Procedures ─────────────────────────────────
  shadows: router({
    /** Get all shadow overrides for a specific event */
    getOverrides: protectedProcedure
      .input(z.object({ eventId: z.string() }))
      .query(async ({ ctx, input }) => {
        const member = await db.getHouseholdMemberByUserId(ctx.user.id);
        if (!member) return [];
        return db.getShadowOverridesForEvent(input.eventId);
      }),

    /** Set (upsert) a shadow override for a specific event + calendar */
    setOverride: protectedProcedure
      .input(z.object({
        eventId: z.string(),
        calendarId: z.string(),
        action: z.enum(["include", "exclude"]),
      }))
      .mutation(async ({ ctx, input }) => {
        const member = await db.getHouseholdMemberByUserId(ctx.user.id);
        if (!member) throw new TRPCError({ code: "FORBIDDEN", message: "Not a household member" });
        await db.setShadowOverride(input.eventId, input.calendarId, input.action);
        // Re-propagate the event with the new override applied
        const member2 = await db.getHouseholdMemberByUserId(ctx.user.id);
        if (member2) {
          onEventUpserted(input.eventId, member2.householdId).catch(e =>
            console.warn("[Calendar] Shadow override re-propagation failed:", e)
          );
        }
        return { success: true };
      }),

    /** Remove a shadow override (revert to default rule behaviour) */
    removeOverride: protectedProcedure
      .input(z.object({ eventId: z.string(), calendarId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const member = await db.getHouseholdMemberByUserId(ctx.user.id);
        if (!member) throw new TRPCError({ code: "FORBIDDEN", message: "Not a household member" });
        // Delete the specific override row
        const overrides = await db.getShadowOverridesForEvent(input.eventId);
        const match = overrides.find((o: { id: string; calendarId: string }) => o.calendarId === input.calendarId);
        if (match) {
          // Use raw db to delete by id
          const { getDb } = await import("../db");
          const conn = await getDb();
          if (conn) {
            const { shadowOverrides } = await import("../../drizzle/schema");
            const { eq } = await import("drizzle-orm");
            await conn.delete(shadowOverrides).where(eq(shadowOverrides.id, match.id));
          }
        }
        // Re-propagate
        onEventUpserted(input.eventId, member.householdId).catch(e =>
          console.warn("[Calendar] Shadow override re-propagation failed:", e)
        );
        return { success: true };
      }),
  }),

  /**
   * Account-admin backfill: re-propagate missing shadow blocks for the caller's
   * own household. Scoped to the member's householdId — cannot touch other households.
   *
   * scope="all"      — all non-iCal calendars in the household
   * scope="vertical" — all calendars in the selected verticals
   * scope="calendar" — explicit list of calendarIds
   *
   * Only processes events with no existing shadow blocks (idempotent).
   */
  backfillShadowBlocks: protectedProcedure
    .input(z.object({
      scope: z.enum(["all", "vertical", "calendar"]).default("all"),
      verticalIds: z.array(z.string()).optional(),
      calendarIds: z.array(z.string()).optional(),
      windowDays: z.number().min(7).max(730).default(90),
    }))
    .mutation(async ({ ctx, input }) => {
      const member = await db.getHouseholdMemberByUserId(ctx.user.id);
      if (!member) throw new TRPCError({ code: "FORBIDDEN", message: "Not a household member" });
      requirePermission(member, "calendar.manage");

      const { getDb } = await import("../db");
      const conn = await getDb();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const { events, shadowBlocks, calendars } = await import("../../drizzle/schema");
      const { and, eq, ne, gte, lte, notExists, inArray } = await import("drizzle-orm");

      const householdId = member.householdId;
      const windowStart = Date.now() - input.windowDays * 24 * 60 * 60 * 1000;
      const windowEnd = Date.now() + input.windowDays * 24 * 60 * 60 * 1000;

      // Resolve the list of calendarIds to process
      let targetCalendarIds: string[];

      if (input.scope === "all") {
        const allCals = await conn
          .select({ id: calendars.id })
          .from(calendars)
          .where(and(eq(calendars.householdId, householdId), ne(calendars.provider, "ical")));
        targetCalendarIds = allCals.map(c => c.id);
      } else if (input.scope === "vertical") {
        if (!input.verticalIds?.length) throw new TRPCError({ code: "BAD_REQUEST", message: "verticalIds required for scope=vertical" });
        const vertCals = await conn
          .select({ id: calendars.id })
          .from(calendars)
          .where(and(
            eq(calendars.householdId, householdId),
            ne(calendars.provider, "ical"),
            inArray(calendars.verticalId, input.verticalIds)
          ));
        targetCalendarIds = vertCals.map(c => c.id);
      } else {
        // scope === "calendar"
        if (!input.calendarIds?.length) throw new TRPCError({ code: "BAD_REQUEST", message: "calendarIds required for scope=calendar" });
        // Security: verify all requested calendars belong to this household
        const ownedCals = await conn
          .select({ id: calendars.id })
          .from(calendars)
          .where(and(
            eq(calendars.householdId, householdId),
            ne(calendars.provider, "ical"),
            inArray(calendars.id, input.calendarIds)
          ));
        targetCalendarIds = ownedCals.map(c => c.id);
      }

      let totalQueued = 0;
      for (const calId of targetCalendarIds) {
        const calEvents = await conn
          .select({ id: events.id })
          .from(events)
          .where(
            and(
              eq(events.calendarId, calId),
              eq(events.isShadowBlock, false),
              ne(events.status, "cancelled"),
              gte(events.startTime, windowStart),
              lte(events.startTime, windowEnd),
              notExists(
                conn.select({ id: shadowBlocks.id })
                  .from(shadowBlocks)
                  .where(eq(shadowBlocks.sourceEventId, events.id))
              )
            )
          );

        for (const ev of calEvents) {
          onEventUpserted(ev.id, householdId).catch(e =>
            console.warn(`[BackfillShadowBlocks] Failed for event ${ev.id}:`, e)
          );
          totalQueued++;
        }
      }

      console.log(`[BackfillShadowBlocks] household=${householdId} scope=${input.scope} queued=${totalQueued} calendars=${targetCalendarIds.length}`);
      return { totalQueued, calendarsProcessed: targetCalendarIds.length };
    }),

  /** Re-run propagation for all confirmed events on a calendar.
   * Useful after adding new verticals or changing visibility rules. */
  repropagate: protectedProcedure
    .input(z.object({ calendarId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const member = await db.getHouseholdMemberByUserId(ctx.user.id);
      if (!member) throw new TRPCError({ code: "FORBIDDEN", message: "Not a household member" });
      requirePermission(member, "calendar.manage");

      const calendar = await db.getCalendar(input.calendarId);
      if (!calendar || calendar.householdId !== member.householdId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Calendar not found" });
      }

      const { getDb } = await import("../db");
      const conn = await getDb();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const { events } = await import("../../drizzle/schema");
      const { and, eq, ne } = await import("drizzle-orm");
      const calEvents = await conn
        .select({ id: events.id })
        .from(events)
        .where(and(eq(events.calendarId, input.calendarId), ne(events.status, "cancelled")));

      let queued = 0;
      for (const ev of calEvents) {
        onEventUpserted(ev.id, member.householdId).catch(e =>
          console.warn(`[Repropagate] Failed for event ${ev.id}:`, e)
        );
        queued++;
      }

      console.log(`[Repropagate] Queued ${queued} events for calendar ${input.calendarId}`);
      return { queued };
    }),

  /** Per-calendar and per-vertical event + shadow block stats for the backfill panel. */
  backfillStats: protectedProcedure.query(async ({ ctx }) => {
    const member = await db.getHouseholdMemberByUserId(ctx.user.id);
    if (!member) throw new TRPCError({ code: "FORBIDDEN", message: "Not a household member" });
    requirePermission(member, "calendar.manage");

    const { getDb } = await import("../db");
    const conn = await getDb();
    if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

    const { events, shadowBlocks, calendars } = await import("../../drizzle/schema");
    const { and, eq, ne, sql, max } = await import("drizzle-orm");

    const householdId = member.householdId;

    // Get all non-iCal calendars for this household
    const householdCals = await conn
      .select({ id: calendars.id, name: calendars.name, verticalId: calendars.verticalId, color: calendars.color })
      .from(calendars)
      .where(and(eq(calendars.householdId, householdId), ne(calendars.provider, "ical")));

    // Event counts per calendar
    const eventCounts = await conn
      .select({
        calendarId: events.calendarId,
        eventCount: sql<number>`count(*)`,
      })
      .from(events)
      .where(and(eq(events.householdId, householdId), eq(events.isShadowBlock, false), ne(events.status, "cancelled")))
      .groupBy(events.calendarId);

    // Shadow block counts and last propagated timestamp per source calendar
    const shadowStats = await conn
      .select({
        calendarId: events.calendarId,
        shadowCount: sql<number>`count(${shadowBlocks.id})`,
        lastPropagatedAt: max(shadowBlocks.createdAt),
      })
      .from(shadowBlocks)
      .innerJoin(events, eq(events.id, shadowBlocks.sourceEventId))
      .where(eq(events.householdId, householdId))
      .groupBy(events.calendarId);

    const eventCountMap = new Map(eventCounts.map(r => [r.calendarId, Number(r.eventCount)]));
    const shadowMap = new Map(shadowStats.map(r => [r.calendarId, { shadowCount: Number(r.shadowCount), lastPropagatedAt: r.lastPropagatedAt }]));

    return householdCals.map(cal => ({
      calendarId: cal.id,
      calendarName: cal.name,
      verticalId: cal.verticalId,
      color: cal.color,
      eventCount: eventCountMap.get(cal.id) ?? 0,
      shadowCount: shadowMap.get(cal.id)?.shadowCount ?? 0,
      lastPropagatedAt: shadowMap.get(cal.id)?.lastPropagatedAt ?? null,
    }));
  }),

  shadowBlocks: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const member = await db.getHouseholdMemberByUserId(ctx.user.id);
      if (!member) return [];
      requirePermission(member, "shadow.manage");
      return db.getShadowBlocks(member.householdId);
    }),

    dismiss: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
      const member = await db.getHouseholdMemberByUserId(ctx.user.id);
      if (!member) throw new TRPCError({ code: "FORBIDDEN", message: "Not a household member" });
      requirePermission(member, "shadow.manage");
      await db.dismissShadowBlock(input.id);
      return { success: true };
    }),
  }),
});
