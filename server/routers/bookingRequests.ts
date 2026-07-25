import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import * as db from "../db";
import { requirePermission, hasPermission } from "../auth/rbac";
import { nanoid } from "nanoid";

export const bookingRequestsRouter = router({
  /**
   * Submit a booking request for a free slot.
   * Available to: member, caregiver, child, elder (anyone with booking.request permission).
   * The slot must not overlap with any existing event on the target vertical's calendars.
   */
  create: protectedProcedure.input(z.object({
    targetVerticalId: z.string(),
    title: z.string().min(1).max(500),
    description: z.string().optional(),
    location: z.string().max(500).optional(),
    startTime: z.number(),
    endTime: z.number(),
  })).mutation(async ({ ctx, input }) => {
    const member = await db.getHouseholdMemberByUserId(ctx.user.id);
    if (!member) throw new TRPCError({ code: "FORBIDDEN", message: "Not a household member" });
    requirePermission(member, "booking.request");

    if (input.endTime <= input.startTime) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "End time must be after start time" });
    }

    // Verify the target vertical exists and belongs to this household
    const allVerticals = await db.getVerticals(member.householdId);
    const targetVertical = allVerticals.find(v => v.id === input.targetVerticalId);
    if (!targetVertical) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Target vertical not found" });
    }

    // P-54: Check canRequestMeetings for this member's vertical access rule
    if (member.role !== "household_admin" && member.role !== "ea") {
      const accessRuleMap = await db.getMemberCalendarAccessBatch(member.id, [input.targetVerticalId]);
      const rule = accessRuleMap.get(input.targetVerticalId);
      if (rule && rule.canRequestMeetings === false) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have permission to request time on this vertical's calendar",
        });
      }
    }

    // Check the slot is actually free — no existing events in that time range on the vertical's calendars
    const verticalCalendars = await db.getCalendarsByVertical(input.targetVerticalId);
    const calendarIds = verticalCalendars.map(c => c.id);
    if (calendarIds.length > 0) {
      const existingEvents = await db.getEvents(member.householdId, input.startTime, input.endTime);
      const conflicting = existingEvents.filter(e =>
        calendarIds.includes(e.calendarId) &&
        e.startTime < input.endTime &&
        e.endTime > input.startTime
      );
      if (conflicting.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "That time slot is not available — there is already an event in that window",
        });
      }
    }

    const id = nanoid();
    await db.createBookingRequest({
      id,
      householdId: member.householdId,
      requestorMemberId: member.id,
      targetVerticalId: input.targetVerticalId,
      title: input.title,
      description: input.description ?? null,
      location: input.location ?? null,
      startTime: input.startTime,
      endTime: input.endTime,
      status: "pending",
      createdEventId: null,
      responseNote: null,
      respondedByMemberId: null,
      respondedAt: null,
    });

    // M-01: Notify owner of new booking request
    try {
      const { notifyOwner } = await import("../_core/notification");
      const allVerticals = await db.getVerticals(member.householdId);
      const verticalName = allVerticals.find(v => v.id === input.targetVerticalId)?.name ?? "Unknown";
      await notifyOwner({
        title: `New Booking Request: ${input.title}`,
        content: `${member.displayName} requested time on ${verticalName} (${new Date(input.startTime).toISOString().slice(0, 10)})`,
      });
    } catch { /* non-blocking */ }

    return { id, success: true };
  }),

  /**
   * List booking requests.
   * - household_admin / ea: see all pending requests for the household
   * - member and below: see only their own requests
   */
  list: protectedProcedure.input(z.object({
    status: z.enum(["pending", "approved", "declined", "cancelled", "all"]).default("pending"),
  })).query(async ({ ctx, input }) => {
    const member = await db.getHouseholdMemberByUserId(ctx.user.id);
    if (!member) return [];

    const canManage = hasPermission(member.role, "booking.manage");
    const requests = await db.getBookingRequests(
      member.householdId,
      canManage ? null : member.id,
      input.status === "all" ? null : input.status,
    );

    // Enrich with requestor display name and vertical name
    const allMembers = await db.getHouseholdMembers(member.householdId);
    const allVerticals = await db.getVerticals(member.householdId);
    const memberMap = new Map(allMembers.map(m => [m.id, m]));
    const verticalMap = new Map(allVerticals.map(v => [v.id, v]));

    return requests.map(r => ({
      ...r,
      requestorName: memberMap.get(r.requestorMemberId)?.displayName ?? "Unknown",
      requestorAvatarUrl: memberMap.get(r.requestorMemberId)?.avatarUrl ?? null,
      verticalName: verticalMap.get(r.targetVerticalId)?.name ?? "Unknown",
      verticalColor: verticalMap.get(r.targetVerticalId)?.color ?? "#6b7280",
      verticalIcon: verticalMap.get(r.targetVerticalId)?.icon ?? "calendar",
      respondedByName: r.respondedByMemberId ? (memberMap.get(r.respondedByMemberId)?.displayName ?? null) : null,
    }));
  }),

  /**
   * Approve or decline a booking request.
   * Available to: household_admin, ea (booking.manage permission).
   * On approval: creates a calendar event on the target vertical's primary calendar.
   */
  respond: protectedProcedure.input(z.object({
    requestId: z.string(),
    decision: z.enum(["approved", "declined"]),
    responseNote: z.string().max(1000).optional(),
    targetCalendarId: z.string().optional(), // which calendar to create the event on (if approving)
  })).mutation(async ({ ctx, input }) => {
    const member = await db.getHouseholdMemberByUserId(ctx.user.id);
    if (!member) throw new TRPCError({ code: "FORBIDDEN", message: "Not a household member" });
    requirePermission(member, "booking.manage");

    const request = await db.getBookingRequest(input.requestId);
    if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "Booking request not found" });
    if (request.householdId !== member.householdId) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized" });
    }
    if (request.status !== "pending") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "This request has already been responded to" });
    }

    let createdEventId: string | null = null;

    if (input.decision === "approved") {
      // Create the calendar event
      const verticalCalendars = await db.getCalendarsByVertical(request.targetVerticalId);
      const calendarId = input.targetCalendarId
        ?? verticalCalendars.find(c => c.accessLevel === "read_write")?.id
        ?? verticalCalendars[0]?.id;

      if (!calendarId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No writable calendar found for this vertical" });
      }

      createdEventId = nanoid();
      await db.createEvent({
        id: createdEventId,
        householdId: member.householdId,
        calendarId,
        title: request.title,
        description: request.description,
        location: request.location,
        startTime: request.startTime,
        endTime: request.endTime,
        isAllDay: false,
        status: "confirmed",
        visibility: "default",
        source: "manual",
        createdBy: member.id,
        lastModifiedBy: member.id,
        externalId: null,
        recurrenceRule: null,
        attendees: null,
        reminders: null,
      });

      // Propagate blocker events to all target Google Calendars
      const { onEventUpserted } = await import("../services/eventPropagation");
      await onEventUpserted(createdEventId, member.householdId);
    }

    await db.updateBookingRequest(input.requestId, {
      status: input.decision,
      responseNote: input.responseNote ?? null,
      respondedByMemberId: member.id,
      respondedAt: Date.now(),
      createdEventId,
    });

    // M-05: Notify owner when booking request is approved/declined
    try {
      const { notifyOwner } = await import("../_core/notification");
      const decision = input.decision === "approved" ? "Approved" : "Declined";
      await notifyOwner({
        title: `Booking Request ${decision}: ${request.title}`,
        content: `${member.displayName} ${decision.toLowerCase()} the request for ${new Date(request.startTime).toISOString().slice(0, 10)}${input.responseNote ? ` — Note: ${input.responseNote}` : ""}`,
      });
    } catch { /* non-blocking */ }

    return { success: true, createdEventId };
  }),

  /**
   * Cancel a pending booking request (requestor only).
   */
  cancel: protectedProcedure.input(z.object({
    requestId: z.string(),
  })).mutation(async ({ ctx, input }) => {
    const member = await db.getHouseholdMemberByUserId(ctx.user.id);
    if (!member) throw new TRPCError({ code: "FORBIDDEN", message: "Not a household member" });

    const request = await db.getBookingRequest(input.requestId);
    if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "Booking request not found" });
    if (request.requestorMemberId !== member.id) {
      throw new TRPCError({ code: "FORBIDDEN", message: "You can only cancel your own requests" });
    }
    if (request.status !== "pending") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Only pending requests can be cancelled" });
    }

    await db.updateBookingRequest(input.requestId, { status: "cancelled" });
    return { success: true };
  }),
});
