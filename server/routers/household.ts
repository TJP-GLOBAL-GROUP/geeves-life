import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, publicProcedure } from "../_core/trpc";
import * as db from "../db";
import { writeAuditLog } from "../db";
import { requirePermission, canManageRole } from "../auth/rbac";
import { nanoid } from "nanoid";
import { randomBytes } from "crypto";
import { sendEmailViaGmail, buildInviteEmailHtml } from "../services/gmailSend";

const INVITE_EXPIRY_DAYS = 7;

export const householdRouter = router({
  getMyHousehold: protectedProcedure.query(async ({ ctx }) => {
    // First check if user has a member record (the canonical way to find their household)
    const member = await db.getHouseholdMemberByUserId(ctx.user.id);
    if (member) {
      const household = await db.getHousehold(member.householdId);
      const subscription = await db.getSubscription(member.householdId);
      return { household, member, isAdmin: member.role === "household_admin", subscription };
    }
    // Fallback: check if they created a household (legacy path)
    const household = await db.getHouseholdByCreator(ctx.user.id);
    if (household) {
      const subscription = await db.getSubscription(household.id);
      return { household, member: null, isAdmin: true, subscription };
    }
    return null;
  }),
  getMembers: protectedProcedure.query(async ({ ctx }) => {
    const member = await db.getHouseholdMemberByUserId(ctx.user.id);
    if (!member) return [];
    return db.getHouseholdMembers(member.householdId);
  }),


  create: protectedProcedure.input(z.object({
    name: z.string().min(1).max(255),
    timezone: z.string().default("America/New_York"),
    wakeWord: z.string().max(100).default("Geeves"),
    groupName: z.string().max(100).default("Household"),
  })).mutation(async ({ ctx, input }) => {
    const existing = await db.getHouseholdByCreator(ctx.user.id);
    if (existing) throw new TRPCError({ code: "CONFLICT", message: "You already have a household" });

    const householdId = nanoid();
    const memberId = nanoid();

    await db.createHousehold({ id: householdId, name: input.name, createdByUserId: ctx.user.id, timezone: input.timezone, wakeWord: input.wakeWord, groupName: input.groupName });
    // Creator becomes a household_admin (co-equal with any other admins added later)
    await db.createHouseholdMember({
      id: memberId, householdId, userId: ctx.user.id,
      displayName: ctx.user.name || "Admin",
      email: ctx.user.email || undefined,
      role: "household_admin",
      isBillingContact: true, // First creator is billing contact by default
      status: "active",
    });

    // Brand-aligned default verticals (brand rainbow palette, Jun 17 2026)
    // For TJ Perkins / Geeves.Life: domain-specific verticals with correct brand colours.
    // New users who are not TJ Perkins will see these as a starting point and can rename/recolour.
    const defaultVerticals = [
      { name: "Home & Family",    icon: "home",          color: "#E8624A", description: "Home, family, and household management",    sortOrder: 0 },
      { name: "Maxfield Bakery",  icon: "briefcase",     color: "#4F7EC4", description: "Maxfield Bakery business operations",        sortOrder: 1 },
      { name: "Maxfield Market",  icon: "shopping-cart", color: "#D4A017", description: "Maxfield Market business operations",         sortOrder: 2 },
      { name: "Personal",         icon: "user",          color: "#8B5CF6", description: "Personal life and self-care",                 sortOrder: 3 },
      { name: "StartOut",         icon: "globe",         color: "#E8943A", description: "StartOut community and leadership",           sortOrder: 4 },
    ];
    for (const v of defaultVerticals) {
      await db.createVertical({ id: nanoid(), householdId, name: v.name, icon: v.icon, color: v.color, sortOrder: v.sortOrder });
    }

    await db.createSubscription({ id: nanoid(), householdId, plan: "free", seatsIncluded: 5, seatsUsed: 1, status: "trialing", currentPeriodStart: Date.now(), currentPeriodEnd: Date.now() + 30 * 24 * 60 * 60 * 1000 });

    // ✅ Stamp users.householdId + users.memberId so ctx.user is fully populated on next request
    await db.updateUserHousehold(ctx.user.id, householdId, memberId);

    return { householdId, memberId };
  }),

  update: protectedProcedure.input(z.object({
    name: z.string().min(1).max(255).optional(),
    timezone: z.string().optional(),
    wakeWord: z.string().max(100).optional(),
    groupName: z.string().max(100).optional(),
  })).mutation(async ({ ctx, input }) => {
    const member = await db.getHouseholdMemberByUserId(ctx.user.id);
    if (!member) throw new TRPCError({ code: "NOT_FOUND", message: "Household not found" });
    requirePermission(member, "household.manage");
    await db.updateHousehold(member.householdId, input);
    return { success: true };
  }),

  members: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const member = await db.getHouseholdMemberByUserId(ctx.user.id);
      if (!member) return [];
      requirePermission(member, "member.view_all");
      return db.getHouseholdMembers(member.householdId);
    }),

    invite: protectedProcedure.input(z.object({
      displayName: z.string().min(1).max(255),
      email: z.string().email(),
      role: z.enum(["household_admin", "ea", "member", "caregiver", "child", "elder"]),
      pronouns: z.string().max(100).optional(),
      relationshipLabel: z.string().max(100).optional(),
      accessibilityMode: z.enum(["standard", "picture_board", "large_text", "voice_only"]).default("standard"),
      origin: z.string().url(),
      // Geeves AI access — defaults to true; set false for external contacts, children, etc.
      geevesAccess: z.boolean().default(true),
      // Optional vertical access configuration — applied atomically with member creation
      verticalAccess: z.array(z.object({
        verticalId: z.string(),
        accessLevel: z.enum(["full", "read_only", "blind", "none"]),
        calendarAccess: z.enum(["availability_only", "default_vertical", "blind", "read_write"]),
        canRequestMeetings: z.boolean().optional(),
        hiddenDataCategories: z.array(z.enum(["financial", "private", "guest_pii", "operational"])).optional(),
      })).optional(),
    })).mutation(async ({ ctx, input }) => {
      const actorMember = await db.getHouseholdMemberByUserId(ctx.user.id);
      if (!actorMember) throw new TRPCError({ code: "FORBIDDEN", message: "Not a household member" });
      requirePermission(actorMember, "household.invite");
      // CRITICAL FIX: Only household_admin can invite other household_admin
      if (input.role === "household_admin" && actorMember.role !== "household_admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only household admins can invite other household admins" });
      }
      if (input.role !== "household_admin" && !canManageRole(actorMember.role, input.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Cannot invite someone with a higher role" });
      }

      const household = await db.getHousehold(actorMember.householdId);
      if (!household) throw new TRPCError({ code: "NOT_FOUND", message: "Household not found" });

      // Generate a secure invite token (48 hex chars = 192 bits entropy)
      const inviteToken = randomBytes(24).toString("hex");
      const inviteTokenExpiresAt = new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

      const memberId = nanoid();
      await db.createHouseholdMember({
        id: memberId,
        householdId: actorMember.householdId,
        displayName: input.displayName,
        email: input.email,
        role: input.role,
        pronouns: input.pronouns,
        relationshipLabel: input.relationshipLabel,
        accessibilityMode: input.accessibilityMode,
        geevesAccess: input.geevesAccess,
        status: "invited",
        inviteToken,
        inviteTokenExpiresAt,
        invitedAt: new Date(),
        // P-38: Track who invited this member for EA-scoped remove permission
        invitedByMemberId: actorMember.id,
      });

      // Send invite email (uses admin's Google account as sender)
      const joinUrl = `${input.origin}/join?token=${inviteToken}`;
      const { html, text } = buildInviteEmailHtml({
        inviteeName: input.displayName,
        householdName: household.name,
        inviterName: actorMember.displayName,
        joinUrl,
        role: input.role,
        expiresAt: inviteTokenExpiresAt,
      });

      const emailResult = await sendEmailViaGmail(actorMember.id, {
        to: input.email,
        subject: `You're invited to ${household.name} on Geeves.Life`,
        htmlBody: html,
        textBody: text,
        joinUrl,
        inviteeName: input.displayName,
      });

      // Apply optional vertical access rules atomically with member creation
      if (input.verticalAccess && input.verticalAccess.length > 0) {
        for (const va of input.verticalAccess) {
          if (va.accessLevel === "none") continue; // "none" = no row needed
          await db.upsertVerticalMemberAccess({
            id: nanoid(),
            householdId: actorMember.householdId,
            verticalId: va.verticalId,
            memberId,
            accessLevel: va.accessLevel,
            calendarAccess: va.calendarAccess,
            allowedCalendarIds: [],
            canRequestMeetings: va.canRequestMeetings ?? true,
            configuredByMemberId: actorMember.id,
          });
          // Write data policy rows for each hidden category
          if (va.hiddenDataCategories && va.hiddenDataCategories.length > 0) {
            for (const cat of va.hiddenDataCategories) {
              // Fetch existing policy to merge hiddenFromMemberIds
              const existing = await db.getVerticalDataPolicies({ householdId: actorMember.householdId, verticalId: va.verticalId });
              const existingPolicy = existing.find((p: any) => p.dataCategory === cat);
              const existingIds: string[] = existingPolicy ? (existingPolicy.hiddenFromMemberIds as string[] ?? []) : [];
              const merged = Array.from(new Set([...existingIds, memberId]));
              await db.upsertVerticalDataPolicy({
                id: existingPolicy?.id ?? nanoid(),
                householdId: actorMember.householdId,
                verticalId: va.verticalId,
                dataCategory: cat,
                hiddenFromRoles: existingPolicy?.hiddenFromRoles as string[] ?? [],
                hiddenFromMemberIds: merged,
                configuredByMemberId: actorMember.id,
              });
            }
          }
        }
      }

      // Audit: member invited
      await writeAuditLog({
        actorUserId: ctx.user.id,
        actorOpenId: ctx.user.openId,
        actorEmail: ctx.user.email ?? undefined,
        actorName: ctx.user.name ?? undefined,
        householdId: actorMember.householdId,
        action: "household.members.invite",
        category: "household",
        resourceType: "household_member",
        resourceId: memberId,
        outcome: "success",
        metadata: { inviteeEmail: input.email, role: input.role, emailSent: emailResult.success },
        ipAddress: ctx.req.ip,
        userAgent: ctx.req.headers["user-agent"],
      });

      return {
        memberId,
        emailSent: emailResult.success,
        emailMethod: emailResult.method,
        // Return mailto link as fallback so the UI can offer "Open in mail app"
        mailtoLink: emailResult.mailtoLink,
        joinUrl,
      };
    }),

    resendInvite: protectedProcedure.input(z.object({
      memberId: z.string(),
      origin: z.string().url(),
    })).mutation(async ({ ctx, input }) => {
      const actorMember = await db.getHouseholdMemberByUserId(ctx.user.id);
      if (!actorMember) throw new TRPCError({ code: "FORBIDDEN", message: "Not a household member" });
      requirePermission(actorMember, "household.invite");

      const targetMember = await db.getHouseholdMember(input.memberId);
      if (!targetMember || targetMember.householdId !== actorMember.householdId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Member not found" });
      }
      // Allow resend for:
      // 1. Members with status "invited" (normal case)
      // 2. Members with status "active" but no userId linked (they were set active
      //    without completing the join flow, e.g. a previous partial login)
      const canResend = targetMember.status === "invited" ||
        (targetMember.status === "active" && !targetMember.userId);
      if (!canResend) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Member has already accepted their invitation" });
      }
      // Reset back to invited so the join flow works cleanly
      if (targetMember.status === "active" && !targetMember.userId) {
        await db.updateHouseholdMember(input.memberId, { status: "invited" });
      }
      if (!targetMember.email) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No email address on file for this member" });
      }

      const household = await db.getHousehold(actorMember.householdId);
      if (!household) throw new TRPCError({ code: "NOT_FOUND", message: "Household not found" });

      // Refresh the token and expiry
      const inviteToken = randomBytes(24).toString("hex");
      const inviteTokenExpiresAt = new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
      await db.updateHouseholdMember(input.memberId, { inviteToken, inviteTokenExpiresAt, invitedAt: new Date() });

      const joinUrl = `${input.origin}/join?token=${inviteToken}`;
      const { html, text } = buildInviteEmailHtml({
        inviteeName: targetMember.displayName,
        householdName: household.name,
        inviterName: actorMember.displayName,
        joinUrl,
        role: targetMember.role,
        expiresAt: inviteTokenExpiresAt,
      });

      const emailResult = await sendEmailViaGmail(actorMember.id, {
        to: targetMember.email,
        subject: `Reminder: You're invited to ${household.name} on Geeves.Life`,
        htmlBody: html,
        textBody: text,
        joinUrl,
        inviteeName: targetMember.displayName,
      });

      return {
        emailSent: emailResult.success,
        emailMethod: emailResult.method,
        mailtoLink: emailResult.mailtoLink,
        joinUrl,
      };
    }),

    // Public procedure — anyone with a valid token can look up the invite details
    getInviteDetails: publicProcedure.input(z.object({
      token: z.string(),
    })).query(async ({ input }) => {
      const member = await db.getHouseholdMemberByInviteToken(input.token);
      if (!member) throw new TRPCError({ code: "NOT_FOUND", message: "Invitation not found or expired" });
      // Accept the token if status is "invited" OR if status is "active" but no userId
      const canView = member.status === "invited" ||
        (member.status === "active" && !member.userId);
      if (!canView) throw new TRPCError({ code: "BAD_REQUEST", message: "This invitation has already been used" });
      if (member.inviteTokenExpiresAt && new Date(member.inviteTokenExpiresAt) < new Date()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This invitation has expired. Please ask to be re-invited." });
      }
      const household = await db.getHousehold(member.householdId);
      return {
        memberId: member.id,
        displayName: member.displayName,
        role: member.role,
        householdName: household?.name ?? "Your Household",
        email: member.email,
      };
    }),

    // Protected — the logged-in user claims the invite and links their account
    claimInvite: protectedProcedure.input(z.object({
      token: z.string(),
    })).mutation(async ({ ctx, input }) => {
      const member = await db.getHouseholdMemberByInviteToken(input.token);
      if (!member) throw new TRPCError({ code: "NOT_FOUND", message: "Invitation not found or expired" });

      // Fast-path: already claimed by this exact user — idempotent success
      if (member.userId === ctx.user.id && member.status === "active") {
        await db.updateUserHousehold(ctx.user.id, member.householdId, member.id);
        return { success: true, householdId: member.householdId, memberId: member.id };
      }

      // Allow claiming if status is "invited" OR if status is "active" but no userId
      // (the latter covers the case where a previous partial login set status=active
      // before the user actually completed the join flow)
      const canClaim = member.status === "invited" ||
        (member.status === "active" && !member.userId);
      if (!canClaim) throw new TRPCError({ code: "BAD_REQUEST", message: "This invitation has already been used" });
      if (member.inviteTokenExpiresAt && new Date(member.inviteTokenExpiresAt) < new Date()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This invitation has expired" });
      }

      // Link the logged-in user to this member record
      await db.updateHouseholdMember(member.id, {
        userId: ctx.user.id,
        status: "active",
        joinedAt: new Date(),
        inviteToken: null,
        inviteTokenExpiresAt: null,
      });

      // ✅ Stamp users.householdId + users.memberId so ctx.user is fully populated on next request
      await db.updateUserHousehold(ctx.user.id, member.householdId, member.id);

      // Apply any pre-assigned pending verticals
      const pendingVerticals = (member as any).pendingVerticals as string[] | null;
      if (pendingVerticals && pendingVerticals.length > 0) {
        for (const verticalId of pendingVerticals) {
          const alreadyOwner = await db.isVerticalOwner(verticalId, ctx.user.id);
          if (!alreadyOwner) {
            await db.addVerticalOwner({ id: nanoid(), verticalId, userId: ctx.user.id, role: "member", addedByUserId: null });
          }
        }
        await db.updateHouseholdMember(member.id, { pendingVerticals: [] } as any);
      }

      // Audit: invite claimed (user joined household)
      await writeAuditLog({
        actorUserId: ctx.user.id,
        actorOpenId: ctx.user.openId,
        actorEmail: ctx.user.email ?? undefined,
        actorName: ctx.user.name ?? undefined,
        householdId: member.householdId,
        action: "household.members.claimInvite",
        category: "auth",
        resourceType: "household_member",
        resourceId: member.id,
        outcome: "success",
        metadata: { role: member.role },
        ipAddress: ctx.req.ip,
        userAgent: ctx.req.headers["user-agent"],
      });

      return { success: true, householdId: member.householdId, memberId: member.id };
    }),

    update: protectedProcedure.input(z.object({
      memberId: z.string(),
      displayName: z.string().min(1).max(255).optional(),
      role: z.enum(["household_admin", "ea", "member", "caregiver", "child", "elder"]).optional(),
      pronouns: z.string().max(100).nullable().optional(),
      genderIdentity: z.string().max(100).nullable().optional(),
      relationshipLabel: z.string().max(100).nullable().optional(),
      accessibilityMode: z.enum(["standard", "picture_board", "large_text", "voice_only"]).optional(),
      avatarUrl: z.string().nullable().optional(),
      // Profile fields (migrated from family_members)
      dob: z.string().max(10).nullable().optional(),
      phoneNumbers: z.array(z.object({ label: z.string(), number: z.string() })).nullable().optional(),
      clothingSizes: z.object({
        top: z.string().optional(),
        bottom: z.string().optional(),
        shoe: z.string().optional(),
        dress: z.string().optional(),
      }).nullable().optional(),
      dietaryRestrictions: z.string().nullable().optional(),
      memberPreferences: z.object({
        favoriteColors: z.array(z.string()).optional(),
        favoriteBrands: z.array(z.string()).optional(),
        notes: z.string().optional(),
      }).nullable().optional(),
    })).mutation(async ({ ctx, input }) => {
      const actorMember = await db.getHouseholdMemberByUserId(ctx.user.id);
      if (!actorMember) throw new TRPCError({ code: "FORBIDDEN", message: "Not a household member" });
      const targetMember = await db.getHouseholdMember(input.memberId);
      if (!targetMember || targetMember.householdId !== actorMember.householdId) throw new TRPCError({ code: "NOT_FOUND", message: "Member not found" });

      const isSelf = targetMember.id === actorMember.id;
      const isAdminOrEa = actorMember.role === "household_admin" || actorMember.role === "ea";
      if (isSelf && input.role && input.role !== actorMember.role) throw new TRPCError({ code: "FORBIDDEN", message: "Cannot change your own role" });
      // EAs can edit members they invited; admins can edit anyone
      if (!isSelf && !isAdminOrEa) throw new TRPCError({ code: "FORBIDDEN", message: "Only household admins or EAs can edit other members" });
      // EAs cannot edit household_admin cards
      if (!isSelf && actorMember.role === "ea" && targetMember.role === "household_admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "EAs cannot edit the admin owner's card" });
      }
      // CRITICAL FIX: Prevent role promotion beyond actor's management level
      if (input.role && !canManageRole(actorMember.role, input.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Cannot promote member to a higher or equal role" });
      }

      const updateData: any = {};
      if (input.displayName) updateData.displayName = input.displayName;
      if (input.role) updateData.role = input.role;
      if (input.pronouns !== undefined) updateData.pronouns = input.pronouns;
      if (input.genderIdentity !== undefined) updateData.genderIdentity = input.genderIdentity;
      if (input.relationshipLabel !== undefined) updateData.relationshipLabel = input.relationshipLabel;
      if (input.accessibilityMode) updateData.accessibilityMode = input.accessibilityMode;
      if (input.avatarUrl !== undefined) updateData.avatarUrl = input.avatarUrl;
      // Profile fields
      if (input.dob !== undefined) updateData.dob = input.dob;
      if (input.phoneNumbers !== undefined) updateData.phoneNumbers = input.phoneNumbers;
      if (input.clothingSizes !== undefined) updateData.clothingSizes = input.clothingSizes;
      if (input.dietaryRestrictions !== undefined) updateData.dietaryRestrictions = input.dietaryRestrictions;
      if (input.memberPreferences !== undefined) updateData.memberPreferences = input.memberPreferences;
      await db.updateHouseholdMember(input.memberId, updateData);
      return { success: true };
    }),

    // Get invite details by memberId (for the /invitation-accept page — no token needed)
    getByMemberId: publicProcedure.input(z.object({
      memberId: z.string(),
    })).query(async ({ input }) => {
      const member = await db.getHouseholdMember(input.memberId);
      if (!member || member.userId) throw new TRPCError({ code: "NOT_FOUND", message: "Invitation not found" });
      const household = await db.getHousehold(member.householdId);
      return {
        memberId: member.id,
        displayName: member.displayName,
        role: member.role,
        householdName: household?.name ?? "Your Group",
        groupName: household?.groupName ?? "Household",
        email: member.email,
      };
    }),

    // Accept an invite by memberId (for users who logged in without a token)
    acceptByMemberId: protectedProcedure.input(z.object({
      memberId: z.string(),
    })).mutation(async ({ ctx, input }) => {
      const member = await db.getHouseholdMember(input.memberId);
      if (!member) throw new TRPCError({ code: "NOT_FOUND", message: "Invitation not found" });

      // Fast-path: already accepted by this exact user — idempotent success
      if (member.userId === ctx.user.id && member.status === "active") {
        await db.updateUserHousehold(ctx.user.id, member.householdId, member.id);
        return { success: true, householdId: member.householdId, memberId: member.id };
      }

      if (member.userId) throw new TRPCError({ code: "BAD_REQUEST", message: "This invitation has already been used" });
      // Verify the logged-in user's email matches the invite email
      const user = await db.getUserById(ctx.user.id);
      if (user?.email && member.email && user.email.toLowerCase() !== member.email.toLowerCase()) {
        throw new TRPCError({ code: "FORBIDDEN", message: "This invitation is for a different email address" });
      }
      // Store the Google account name as an alias (googleName).
      // The constellation-assigned displayName stays as the primary name.
      const googleName = user?.name ?? null;
      await db.updateHouseholdMember(member.id, {
        userId: ctx.user.id,
        status: "active",
        joinedAt: new Date(),
        inviteToken: null,
        inviteTokenExpiresAt: null,
        ...(googleName ? { googleName } : {}),
      });

      // ✅ Stamp users.householdId + users.memberId so ctx.user is fully populated on next request
      await db.updateUserHousehold(ctx.user.id, member.householdId, member.id);

      // Apply any pre-assigned pending verticals
      const pendingVerticals2 = (member as any).pendingVerticals as string[] | null;
      if (pendingVerticals2 && pendingVerticals2.length > 0) {
        for (const verticalId of pendingVerticals2) {
          const alreadyOwner = await db.isVerticalOwner(verticalId, ctx.user.id);
          if (!alreadyOwner) {
            await db.addVerticalOwner({ id: nanoid(), verticalId, userId: ctx.user.id, role: "member", addedByUserId: null });
          }
        }
        await db.updateHouseholdMember(member.id, { pendingVerticals: [] } as any);
      }
      return { success: true, householdId: member.householdId, memberId: member.id };
    }),

    // Deactivate a member (sets status to 'inactive' without deleting)
    deactivate: protectedProcedure.input(z.object({ memberId: z.string() })).mutation(async ({ ctx, input }) => {
      const actorMember = await db.getHouseholdMemberByUserId(ctx.user.id);
      if (!actorMember) throw new TRPCError({ code: "FORBIDDEN", message: "Not a household member" });
      requirePermission(actorMember, "household.remove");
      const targetMember = await db.getHouseholdMember(input.memberId);
      if (!targetMember || targetMember.householdId !== actorMember.householdId) throw new TRPCError({ code: "NOT_FOUND", message: "Member not found" });
      if (targetMember.role === "household_admin") throw new TRPCError({ code: "FORBIDDEN", message: "Cannot deactivate a household admin" });
      if (!canManageRole(actorMember.role, targetMember.role) && actorMember.role !== "household_admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Cannot deactivate member with equal or higher role" });
      }
      await db.updateHouseholdMember(input.memberId, { status: "inactive" } as any);
      return { success: true };
    }),

    // Reactivate a previously deactivated member
    reactivate: protectedProcedure.input(z.object({ memberId: z.string() })).mutation(async ({ ctx, input }) => {
      const actorMember = await db.getHouseholdMemberByUserId(ctx.user.id);
      if (!actorMember) throw new TRPCError({ code: "FORBIDDEN", message: "Not a household member" });
      requirePermission(actorMember, "household.invite");
      const targetMember = await db.getHouseholdMember(input.memberId);
      if (!targetMember || targetMember.householdId !== actorMember.householdId) throw new TRPCError({ code: "NOT_FOUND", message: "Member not found" });
      await db.updateHouseholdMember(input.memberId, { status: "active" } as any);
      return { success: true };
    }),

    remove: protectedProcedure.input(z.object({ memberId: z.string() })).mutation(async ({ ctx, input }) => {
      const actorMember = await db.getHouseholdMemberByUserId(ctx.user.id);
      if (!actorMember) throw new TRPCError({ code: "FORBIDDEN", message: "Not a household member" });
      requirePermission(actorMember, "household.remove");
      const targetMember = await db.getHouseholdMember(input.memberId);
      if (!targetMember || targetMember.householdId !== actorMember.householdId) throw new TRPCError({ code: "NOT_FOUND", message: "Member not found" });
      // household_admins cannot remove other household_admins (co-equal protection)
      if (targetMember.role === "household_admin" && actorMember.id !== targetMember.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Cannot remove a co-equal household admin. They must leave voluntarily." });
      }
      if (!canManageRole(actorMember.role, targetMember.role) && actorMember.role !== "household_admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Cannot remove member with equal or higher role" });
      }
      await db.deleteHouseholdMember(input.memberId);
      return { success: true };
    }),

    // ── Pre-accept vertical assignment ─────────────────────────────────────────
    // Allows an admin to assign verticals to an invited member before they accept.
    // Stored as pendingVerticals on the member record, applied when they claim.
    setPendingVerticals: protectedProcedure.input(z.object({
      memberId: z.string(),
      verticalIds: z.array(z.string()),
    })).mutation(async ({ ctx, input }) => {
      const actorMember = await db.getHouseholdMemberByUserId(ctx.user.id);
      if (!actorMember) throw new TRPCError({ code: "FORBIDDEN", message: "Not a household member" });
      requirePermission(actorMember, "household.invite");
      const targetMember = await db.getHouseholdMember(input.memberId);
      if (!targetMember || targetMember.householdId !== actorMember.householdId)
        throw new TRPCError({ code: "NOT_FOUND", message: "Member not found" });
      // If member already has a userId, apply verticals immediately
      if (targetMember.userId) {
        for (const verticalId of input.verticalIds) {
          const alreadyOwner = await db.isVerticalOwner(verticalId, targetMember.userId);
          if (!alreadyOwner) {
            await db.addVerticalOwner({ id: nanoid(), verticalId, userId: targetMember.userId, role: "member", addedByUserId: ctx.user.id });
          }
        }
        return { applied: true };
      }
      // Otherwise store as pending — will be applied when member claims their invite
      await db.updateHouseholdMember(input.memberId, { pendingVerticals: input.verticalIds } as any);
      return { applied: false };
    }),
  }),

  verticals: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const member = await db.getHouseholdMemberByUserId(ctx.user.id);
      if (!member) return [];
      return db.getVerticals(member.householdId);
    }),

    create: protectedProcedure.input(z.object({
      name: z.string().min(1).max(255),
      icon: z.string().max(100).optional(),
      color: z.string().max(20).optional(),
      description: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      const member = await db.getHouseholdMemberByUserId(ctx.user.id);
      if (!member) throw new TRPCError({ code: "FORBIDDEN", message: "Not a household member" });
      requirePermission(member, "vertical.manage");
      const id = nanoid();
      await db.createVertical({ id, householdId: member.householdId, name: input.name, icon: input.icon, color: input.color, description: input.description });
      return { id };
    }),

    update: protectedProcedure.input(z.object({
      id: z.string(),
      name: z.string().min(1).max(255).optional(),
      icon: z.string().max(100).optional(),
      color: z.string().max(20).optional(),
      isActive: z.boolean().optional(),
    })).mutation(async ({ ctx, input }) => {
      const member = await db.getHouseholdMemberByUserId(ctx.user.id);
      if (!member) throw new TRPCError({ code: "FORBIDDEN", message: "Not a household member" });
      requirePermission(member, "vertical.manage");
      const { id, ...data } = input;
      await db.updateVertical(id, data);
      return { success: true };
    }),
  }),

  // ─── Vertical Access Control ─────────────────────────────────────────────────
  verticalAccess: router({
    // Get the current member's own vertical access assignments (used for nav filtering)
    // Returns a simple array of access rules (unlike getMyAccess which includes data policies)
    getMyAssignments: protectedProcedure.query(async ({ ctx }) => {
      const member = await db.getHouseholdMemberByUserId(ctx.user.id);
      if (!member) return [];
      return db.getVerticalMemberAccess({ householdId: member.householdId, memberId: member.id });
    }),
    // Get the full access matrix: all members × all verticals for this household
    getMatrix: protectedProcedure.query(async ({ ctx }) => {
      const member = await db.getHouseholdMemberByUserId(ctx.user.id);
      if (!member) throw new TRPCError({ code: "FORBIDDEN", message: "Not a household member" });
      requirePermission(member, "household.invite");
      const [accessRules, dataPolicies, members, verticals] = await Promise.all([
        db.getVerticalMemberAccess({ householdId: member.householdId }),
        db.getVerticalDataPolicies({ householdId: member.householdId }),
        db.getHouseholdMembers(member.householdId),
        db.getVerticals(member.householdId),
      ]);
      return { accessRules, dataPolicies, members, verticals };
    }),

    // Upsert a member's access rule for a specific vertical
    upsertMemberAccess: protectedProcedure.input(z.object({
      memberId: z.string(),
      verticalId: z.string(),
      accessLevel: z.enum(["full", "read_only", "blind", "none"]),
      calendarAccess: z.enum(["availability_only", "default_vertical", "blind", "read_write"]),
      allowedCalendarIds: z.array(z.string()).optional(),
      canRequestMeetings: z.boolean().optional(),
      excludeMultiDayEvents: z.boolean().optional(),
    })).mutation(async ({ ctx, input }) => {
      const member = await db.getHouseholdMemberByUserId(ctx.user.id);
      if (!member) throw new TRPCError({ code: "FORBIDDEN", message: "Not a household member" });
      requirePermission(member, "household.invite");
      const id = nanoid();
      await db.upsertVerticalMemberAccess({
        id,
        householdId: member.householdId,
        verticalId: input.verticalId,
        memberId: input.memberId,
        accessLevel: input.accessLevel,
        calendarAccess: input.calendarAccess,
        allowedCalendarIds: input.allowedCalendarIds ?? [],
        canRequestMeetings: input.canRequestMeetings ?? true,
        excludeMultiDayEvents: input.excludeMultiDayEvents ?? false,
        configuredByMemberId: member.id,
      });
      await writeAuditLog({
        actorUserId: ctx.user.id,
        actorOpenId: ctx.user.openId,
        actorEmail: ctx.user.email ?? undefined,
        actorName: ctx.user.name ?? undefined,
        householdId: member.householdId,
        action: "vertical_access.upsert",
        category: "household",
        resourceType: "vertical_member_access",
        resourceId: `${input.memberId}:${input.verticalId}`,
        outcome: "success",
        metadata: { accessLevel: input.accessLevel, calendarAccess: input.calendarAccess },
      });
      return { success: true };
    }),

    // Remove a member's access rule (reverts to household default)
    removeMemberAccess: protectedProcedure.input(z.object({
      memberId: z.string(),
      verticalId: z.string(),
    })).mutation(async ({ ctx, input }) => {
      const member = await db.getHouseholdMemberByUserId(ctx.user.id);
      if (!member) throw new TRPCError({ code: "FORBIDDEN", message: "Not a household member" });
      requirePermission(member, "household.invite");
      await db.deleteVerticalMemberAccess(input.memberId, input.verticalId);
      return { success: true };
    }),

    // Upsert a data policy for a vertical
    upsertDataPolicy: protectedProcedure.input(z.object({
      verticalId: z.string(),
      dataCategory: z.enum(["financial", "private", "guest_pii", "operational"]),
      hiddenFromRoles: z.array(z.string()).optional(),
      hiddenFromMemberIds: z.array(z.string()).optional(),
    })).mutation(async ({ ctx, input }) => {
      const member = await db.getHouseholdMemberByUserId(ctx.user.id);
      if (!member) throw new TRPCError({ code: "FORBIDDEN", message: "Not a household member" });
      requirePermission(member, "household.invite");
      const id = nanoid();
      await db.upsertVerticalDataPolicy({
        id,
        householdId: member.householdId,
        verticalId: input.verticalId,
        dataCategory: input.dataCategory,
        hiddenFromRoles: input.hiddenFromRoles ?? [],
        hiddenFromMemberIds: input.hiddenFromMemberIds ?? [],
        configuredByMemberId: member.id,
      });
      await writeAuditLog({
        actorUserId: ctx.user.id,
        actorOpenId: ctx.user.openId,
        actorEmail: ctx.user.email ?? undefined,
        actorName: ctx.user.name ?? undefined,
        householdId: member.householdId,
        action: "vertical_data_policy.upsert",
        category: "household",
        resourceType: "vertical_data_policies",
        resourceId: `${input.verticalId}:${input.dataCategory}`,
        outcome: "success",
        metadata: { dataCategory: input.dataCategory },
      });
      return { success: true };
    }),

    // Remove a data policy
    removeDataPolicy: protectedProcedure.input(z.object({
      verticalId: z.string(),
      dataCategory: z.enum(["financial", "private", "guest_pii", "operational"]),
    })).mutation(async ({ ctx, input }) => {
      const member = await db.getHouseholdMemberByUserId(ctx.user.id);
      if (!member) throw new TRPCError({ code: "FORBIDDEN", message: "Not a household member" });
      requirePermission(member, "household.invite");
      await db.deleteVerticalDataPolicy(input.verticalId, input.dataCategory);
      return { success: true };
    }),

    // Get the current user's own vertical access rules and applicable data policies.
    // Used by the frontend to conditionally hide financial columns and render blind events.
    // Returns empty arrays for household_admin users (they always have full access).
    getMyAccess: protectedProcedure.query(async ({ ctx }) => {
      const member = await db.getHouseholdMemberByUserId(ctx.user.id);
      if (!member) return { accessRules: [], restrictedCategories: [], memberId: null, isAdmin: false, isEa: false };
      // Admins always have full access — no restrictions apply
      if (member.role === "household_admin") {
        return { accessRules: [], restrictedCategories: [], memberId: member.id, isAdmin: true, isEa: false };
      }
      if (member.role === "ea") {
        return { accessRules: [], restrictedCategories: [], memberId: member.id, isAdmin: false, isEa: true };
      }
      const [accessRules, dataPolicies] = await Promise.all([
        db.getVerticalMemberAccess({ householdId: member.householdId, memberId: member.id }),
        db.getVerticalDataPolicies({ householdId: member.householdId }),
      ]);
      // Collect data categories that are restricted for this specific member
      const restrictedCategories = dataPolicies
        .filter(p => {
          const roles = (p.hiddenFromRoles as string[]) ?? [];
          const memberIds = (p.hiddenFromMemberIds as string[]) ?? [];
          return roles.includes(member.role) || memberIds.includes(member.id);
        })
        .map(p => ({ verticalId: p.verticalId, dataCategory: p.dataCategory as string }));
      return { accessRules, restrictedCategories, memberId: member.id, isAdmin: false, isEa: false };
    }),
  }),

  uploadMemberPhoto: protectedProcedure
    .input(z.object({
      memberId: z.string(),
      /** Base64-encoded image data URI, e.g. "data:image/jpeg;base64,..." */
      dataUri: z.string().max(5_000_000), // ~3.75 MB raw → ~5 MB base64
    }))
    .mutation(async ({ ctx, input }) => {
      const member = await db.getHouseholdMemberByUserId(ctx.user.id);
      if (!member) throw new TRPCError({ code: "UNAUTHORIZED" });
      // Only allow uploading your own photo unless you are a household_admin
      if (member.id !== input.memberId && member.role !== "household_admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "You can only update your own photo" });
      }
      // Decode base64 data URI
      const match = input.dataUri.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/);
      if (!match) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid image format" });
      const [, mimeType, base64Data] = match;
      const buffer = Buffer.from(base64Data, "base64");
      if (buffer.length > 4_000_000) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Image too large (max 4 MB)" });
      }
      const ext = mimeType.split("/")[1];
      const { nanoid } = await import("nanoid");
      const fileKey = `member-photos/${input.memberId}-${nanoid(8)}.${ext}`;
      const { storagePut } = await import("../storage");
      const { url } = await storagePut(fileKey, buffer, mimeType);
      await db.updateMemberPhoto(input.memberId, url);
      return { photoUrl: url };
    }),

    /**
     * Remove a member from the household (admin-only).
     * Full cascade: revokes tokens, removes access, cancels pending requests, soft-deletes member.
     * Cannot remove yourself (use leaveHousehold) or another admin.
     */
    removeMember: protectedProcedure.input(z.object({
      memberId: z.string(),
      reason: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      const actor = await db.getHouseholdMemberByUserId(ctx.user.id);
      if (!actor) throw new TRPCError({ code: "FORBIDDEN", message: "Not a household member" });
      requirePermission(actor, "household.invite"); // admin-level permission

      // Cannot remove yourself
      if (actor.id === input.memberId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot remove yourself. Use 'Leave Household' instead." });
      }

      // Fetch target member
      const target = await db.getHouseholdMember(input.memberId);
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "Member not found" });
      if (target.householdId !== actor.householdId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Member is not in your household" });
      }

      // Cannot remove another admin (must demote first)
      if (target.role === "household_admin" && actor.role === "household_admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Cannot remove another admin. Demote them first." });
      }

      // Execute cascade deletion
      await db.deleteHouseholdMember(input.memberId);

      // Audit log
      await writeAuditLog({
        actorUserId: ctx.user.id,
        actorOpenId: ctx.user.openId,
        actorEmail: ctx.user.email ?? undefined,
        actorName: ctx.user.name ?? undefined,
        householdId: actor.householdId,
        action: "household.member_removed",
        category: "household",
        resourceType: "household_members",
        resourceId: input.memberId,
        outcome: "success",
        metadata: {
          targetName: target.displayName,
          targetEmail: target.email,
          targetRole: target.role,
          reason: input.reason ?? null,
        },
      });

      return { success: true, removedMemberId: input.memberId };
    }),

    /**
     * Leave the household voluntarily (member-initiated).
     * Same cascade as removeMember but self-directed.
     * The last admin cannot leave (must transfer ownership first).
     */
    leaveHousehold: protectedProcedure.mutation(async ({ ctx }) => {
      const member = await db.getHouseholdMemberByUserId(ctx.user.id);
      if (!member) throw new TRPCError({ code: "FORBIDDEN", message: "Not a household member" });

      // Prevent last admin from leaving
      if (member.role === "household_admin") {
        const allMembers = await db.getHouseholdMembers(member.householdId);
        const activeAdmins = allMembers.filter(
          (m) => m.role === "household_admin" && m.status === "active" && m.id !== member.id
        );
        if (activeAdmins.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "You are the last admin. Transfer admin role to another member before leaving.",
          });
        }
      }

      // Execute cascade deletion
      await db.deleteHouseholdMember(member.id);

      // Audit log
      await writeAuditLog({
        actorUserId: ctx.user.id,
        actorOpenId: ctx.user.openId,
        actorEmail: ctx.user.email ?? undefined,
        actorName: ctx.user.name ?? undefined,
        householdId: member.householdId,
        action: "household.member_left",
        category: "household",
        resourceType: "household_members",
        resourceId: member.id,
        outcome: "success",
        metadata: {
          memberName: member.displayName,
          memberEmail: member.email,
          memberRole: member.role,
        },
      });

      return { success: true };
    }),
});
