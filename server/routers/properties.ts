import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import * as db from "../db";
import { nanoid } from "nanoid";
import {
  assertHouseholdOwnership,
  assertResourceBelongsToHousehold,
} from "../auth/householdIsolation";
import { hasPermission } from "../auth/rbac";
import { aggregatePlatformICal, aggregatePropertyICals, generateOutboundICS } from "../services/icalAggregator";
import { detectConflictsForProperty } from "../services/conflictDetector";
import { scrapeBookingEmails, scrapeAllBookingEmails } from "../services/bookingEmailScraper";
import { scrapeMultiPlatformEmails, scrapeAllMultiPlatformEmails, getLatestScrapeJob } from "../services/multiPlatformEmailScraper";
import { bookingOverrides, properties } from "../../drizzle/schema";
import { generateBookingInvoicePDF } from "../services/invoiceGenerator";
import { eq } from "drizzle-orm";
import {
  stripArrayByPolicy,
  stripByPolicy,
  resolveRestrictedCategories,
  type DataCategory,
} from "../services/dataClassification";

/**
 * Resolves which data categories a viewer (identified by their userId) is
 * restricted from seeing for a given vertical.
 *
 * Returns an empty array (no restrictions) when:
 *  - The user has no member record (system-level call)
 *  - The vertical has no data policies configured
 *  - The member's role / ID is not in any policy's hidden lists
 */
async function resolveViewerPolicy(
  userId: number,
  verticalId: string | null | undefined
): Promise<DataCategory[]> {
  if (!verticalId) return [];
  const member = await db.getHouseholdMemberByUserId(userId);
  if (!member) return [];
  return resolveRestrictedCategories({
    memberId: member.id,
    verticalId,
    memberRole: member.role,
    isMemberRestricted: db.isMemberRestrictedFromDataCategory,
  });
}

/**
 * P-52: Returns the set of calendarIds this user is allowed to see within a vertical.
 * Returns null when there is no restriction (admin/EA or no access rule configured).
 * Returns a Set<string> when the user has an explicit allowedCalendarIds list.
 *
 * Usage: filter strProps to only those whose calendarId is in the returned Set.
 * If the returned value is null, no filtering is applied.
 */
async function resolveAllowedCalendarIds(
  userId: number,
  verticalId: string | null | undefined
): Promise<Set<string> | null> {
  if (!verticalId) return null;
  const member = await db.getHouseholdMemberByUserId(userId);
  if (!member) return null;
  // Admins and EAs always see all properties
  if (member.role === "household_admin" || member.role === "ea") return null;
  const accessRules = await db.getVerticalMemberAccess({
    householdId: member.householdId,
    memberId: member.id,
    verticalId,
  });
  if (!accessRules.length) return null; // no rule = no restriction
  const rule = accessRules[0];
  const allowed = (rule.allowedCalendarIds ?? []) as string[];
  if (!allowed.length) return null; // empty list = all calendars in vertical
  return new Set(allowed);
}

const PROPERTY_TYPES = ["primary_residence", "rental_str", "rental_ltr", "vacation", "commercial", "investment", "other"] as const;
const PLATFORM_TYPES = ["airbnb", "vrbo", "booking_com", "direct", "zillow", "apartments_com", "other"] as const;

/**
 * Ensures a composite iCal calendar row exists in the `calendars` table for a property.
 * If the property already has a calendarId, does nothing.
 * Otherwise creates a new calendar row and stores its ID on the property.
 */
async function ensurePropertyCalendar(propertyId: string): Promise<string> {
  const property = await db.getPropertyById(propertyId);
  if (!property) throw new TRPCError({ code: "NOT_FOUND", message: "Property not found" });
  if (property.calendarId) return property.calendarId;

  // Find the admin/owner member for this household to assign as calendar owner
  const members = await db.getHouseholdMembers(property.householdId);
  const ownerMember = members.find((m: any) => m.role === "admin" || m.role === "owner") || members[0];
  if (!ownerMember) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No household member found" });

  const calId = nanoid();
  await db.createCalendar({
    id: calId,
    householdId: property.householdId,
    memberId: ownerMember.id,
    verticalId: property.verticalId || undefined,
    provider: "ical",
    externalId: `property:${propertyId}`,
    name: `${property.name} (Bookings)`,
    color: "#6366f1",
    syncType: "poll",
    pollIntervalMinutes: 60,
    accessLevel: "read_write",
    isPrimary: false,
    isVisible: true,
    // iCal feeds are read-only — they must not receive shadow blocks from other verticals
    // (they can't be written to, so shadow blocks would be orphaned DB rows with no Google counterpart)
    shadowBlocking: false,
  });
  await db.updateProperty(propertyId, { calendarId: calId });
  return calId;
}

export const propertiesRouter = router({
  // ─── Property CRUD ────────────────────────────────────────────────────────

  list: protectedProcedure
    .input(z.object({ householdId: z.string() }))
    .query(async ({ ctx, input }) => {
      // P-39: Enforce vertical access — non-admin members only see properties
      // whose verticalId is in their assigned verticals. Members with no
      // vertical assignments see no properties at all.
      const member = await db.getHouseholdMemberByUserId(ctx.user.id);
      if (!member) return [];

      const isAdmin = member.role === "household_admin";
      const isEA = member.role === "ea";

      // Admins and EAs see all properties
      if (isAdmin || isEA) {
        return db.getProperties(input.householdId);
      }

      // For all other roles: filter to only properties in their assigned verticals
      const allProperties = await db.getProperties(input.householdId);
      if (!member.userId) return [];

      // Get the verticals this member has been assigned to
      const allowedVerticalIds = await db.getOwnedVerticalIds(input.householdId, member.userId);

      // A property with no verticalId is considered household-level (admin/EA only)
      const verticalProps = allProperties.filter((p: any) => p.verticalId && allowedVerticalIds.has(p.verticalId));

      // P-52: Further filter by allowedCalendarIds — if the member has an explicit
      // allowedCalendarIds list for this vertical, only show matching properties.
      // Group by verticalId and apply per-vertical calendar filter.
      const verticalIds = Array.from(new Set(verticalProps.map((p: any) => p.verticalId).filter(Boolean))) as string[];
      const accessRuleMap = await db.getMemberCalendarAccessBatch(member.id, verticalIds);
      return verticalProps.filter((p: any) => {
        const rule = accessRuleMap.get(p.verticalId);
        if (!rule) return true; // no rule = no restriction
        const allowed = rule.allowedCalendarIds;
        if (!allowed.length) return true; // empty = all calendars
        return p.calendarId && allowed.includes(p.calendarId);
      });
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const property = await db.getPropertyById(input.id);
      if (!property) throw new TRPCError({ code: "NOT_FOUND", message: "Property not found" });
      // Access check: verify member can see this property's vertical
      const member = await db.getHouseholdMemberByUserId(ctx.user.id);
      if (!member) throw new TRPCError({ code: "FORBIDDEN", message: "Not a household member" });
      if (hasPermission(member.role, "household.manage")) return property; // admin sees all
      if ((property as any).verticalId) {
        const accessRuleMap = await db.getMemberCalendarAccessBatch(member.id, [(property as any).verticalId]);
        const rule = accessRuleMap.get((property as any).verticalId);
        if (rule && rule.accessLevel === "none") {
          throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to this property" });
        }
        if (rule && rule.allowedCalendarIds.length > 0 && (property as any).calendarId) {
          if (!rule.allowedCalendarIds.includes((property as any).calendarId)) {
            throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to this property" });
          }
        }
      }
      return property;
    }),

  create: protectedProcedure
    .input(z.object({
      householdId: z.string(),
      name: z.string().min(1),
      address: z.string().optional(),
      type: z.enum(PROPERTY_TYPES).default("rental_str"),
      verticalId: z.string().optional(),
      propertyEmail: z.string().email().optional().or(z.literal("")),
      monthlyRent: z.string().optional(),
      rentCurrency: z.string().optional(),
      latitude: z.string().optional(),
      longitude: z.string().optional(),
      settings: z.any().optional(),
      country: z.string().max(10).optional(),
      timezone: z.string().max(64).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Household isolation: verify caller belongs to the target household
      const member = await assertHouseholdOwnership(ctx.user.id);
      assertResourceBelongsToHousehold(input.householdId, member.householdId, "Household");
      const id = nanoid();
      await db.createProperty({
        id,
        householdId: input.householdId,
        name: input.name,
        address: input.address || null,
        type: input.type,
        icalUrl: null,
        verticalId: input.verticalId || null,
        propertyEmail: input.propertyEmail || null,
        monthlyRent: input.monthlyRent || null,
        rentCurrency: input.rentCurrency || "USD",
        latitude: input.latitude || null,
        longitude: input.longitude || null,
        settings: input.settings || null,
        country: input.country || null,
        timezone: input.timezone || "America/New_York",
      });
      // Immediately create the composite calendar so it appears in Settings → Calendars
      // for vertical assignment, even before any iCal platform is added.
      try {
        await ensurePropertyCalendar(id);
      } catch (e) {
        console.warn("[Properties] ensurePropertyCalendar on create failed:", e);
      }
      return { id };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.string(),
      name: z.string().min(1).optional(),
      address: z.string().optional(),
      type: z.enum(PROPERTY_TYPES).optional(),
      verticalId: z.string().optional(),
      propertyEmail: z.string().email().optional().or(z.literal("")),
      monthlyRent: z.string().optional(),
      rentCurrency: z.string().optional(),
      latitude: z.string().optional(),
      longitude: z.string().optional(),
      isActive: z.boolean().optional(),
      settings: z.any().optional(),
      country: z.string().max(10).optional(),
      timezone: z.string().max(64).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;
      const existing = await db.getPropertyById(id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Property not found" });
      // Household isolation: verify caller owns this property's household
      const member = await assertHouseholdOwnership(ctx.user.id);
      assertResourceBelongsToHousehold(existing.householdId, member.householdId, "Property");
      // householdId is immutable — strip it from the update payload
      const { householdId: _ignored, ...safeData } = data as any;
      await db.updateProperty(id, safeData as Parameters<typeof db.updateProperty>[1]);
      return { success: true };
    }),

  /**
   * M-04: Get cascade impact counts before deleting a property.
   * Returns counts of related records that will be deleted.
   */
  getDeleteImpact: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      const existing = await db.getPropertyById(input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Property not found" });
      const member = await assertHouseholdOwnership(ctx.user.id);
      assertResourceBelongsToHousehold(existing.householdId, member.householdId, "Property");
      const impact = await db.getPropertyDeleteImpact(input.id);
      return impact;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const existing = await db.getPropertyById(input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Property not found" });
      // Household isolation: verify caller owns this property's household
      const member = await assertHouseholdOwnership(ctx.user.id);
      assertResourceBelongsToHousehold(existing.householdId, member.householdId, "Property");
      await db.deleteProperty(input.id);
      return { success: true };
    }),

  // ─── Platform Feeds ───────────────────────────────────────────────────────

  listPlatforms: protectedProcedure
    .input(z.object({ propertyId: z.string() }))
    .query(async ({ input }) => {
      return db.getPropertyPlatforms(input.propertyId);
    }),

  /** Check if a given email address is already authenticated in Geeves (for email scraping auth status) */
  checkEmailAuthStatus: protectedProcedure
    .input(z.object({ email: z.string().email() }))
    .query(async ({ ctx, input }) => {
      const member = await db.getHouseholdMemberByUserId(ctx.user.id);
      if (!member) return { linked: false, accountEmail: input.email };
      const token = await db.getOAuthTokenByEmail(member.id, "google", input.email);
      return {
        linked: !!token,
        accountEmail: input.email,
        scopes: token?.scopes ?? null,
        hasGmailScope: token?.scopes ? token.scopes.includes("https://www.googleapis.com/auth/gmail.readonly") : false,
      };
    }),

  addPlatform: protectedProcedure
    .input(z.object({
      propertyId: z.string(),
      platform: z.enum(PLATFORM_TYPES),
      displayName: z.string().optional(),
      icalUrl: z.string().url("Must be a valid URL"),
      notificationEmail: z.string().email().optional(),
      emailScrapingEnabled: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Household isolation: verify caller owns the property
      const property = await db.getPropertyById(input.propertyId);
      if (!property) throw new TRPCError({ code: "NOT_FOUND", message: "Property not found" });
      const member = await assertHouseholdOwnership(ctx.user.id);
      assertResourceBelongsToHousehold(property.householdId, member.householdId, "Property");
      const id = nanoid();
      await db.createPropertyPlatform({
        id,
        propertyId: input.propertyId,
        platform: input.platform,
        displayName: input.displayName || null,
        icalUrl: input.icalUrl,
        notificationEmail: input.notificationEmail || null,
        emailScrapingEnabled: input.emailScrapingEnabled ?? false,
        isActive: true,
      });
      // Ensure the property has a composite calendar in the calendars table
      try {
        await ensurePropertyCalendar(input.propertyId);
      } catch (e) {
        console.warn("[Properties] ensurePropertyCalendar failed:", e);
      }
      // Immediately aggregate the new feed
      try {
        await aggregatePlatformICal(id);
      } catch (e) {
        console.warn("[Properties] Initial iCal poll failed:", e);
      }
      return { id };
    }),

  updatePlatform: protectedProcedure
    .input(z.object({
      id: z.string(),
      displayName: z.string().optional(),
      icalUrl: z.string().url().optional(),
      isActive: z.boolean().optional(),
      notificationEmail: z.string().email().nullable().optional(),
      emailScrapingEnabled: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;

      // Detect email address change to trigger a fresh 2-year backfill
      const prevPlatform = await db.getPropertyPlatformById(id);
      const emailChanged = data.notificationEmail != null &&
        prevPlatform?.notificationEmail !== data.notificationEmail;

      await db.updatePropertyPlatform(id, data);

      // If email was added or changed and scraping is enabled, trigger scrape in background
      const scrapingEnabled = data.emailScrapingEnabled ?? prevPlatform?.emailScrapingEnabled ?? false;
      if (emailChanged && scrapingEnabled && data.notificationEmail) {
        scrapeMultiPlatformEmails(id).catch(err =>
          console.warn(`[Properties] Background scrape failed for platform ${id}:`, err)
        );
      }

      return { success: true, emailChanged, scrapingTriggered: emailChanged && scrapingEnabled };
    }),

  deletePlatform: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      // Household isolation: verify caller owns the platform's property
      const platform = await db.getPropertyPlatformById(input.id);
      if (platform) {
        const property = await db.getPropertyById(platform.propertyId);
        if (property) {
          const member = await assertHouseholdOwnership(ctx.user.id);
          assertResourceBelongsToHousehold(property.householdId, member.householdId, "Property");
        }
      }
      await db.deletePropertyPlatform(input.id);
      return { success: true };
    }),

  syncPlatform: protectedProcedure
    .input(z.object({ platformId: z.string() }))
    .mutation(async ({ input }) => {
      const result = await aggregatePlatformICal(input.platformId);
      return result;
    }),

  syncAllPlatforms: protectedProcedure
    .input(z.object({ propertyId: z.string() }))
    .mutation(async ({ input }) => {
      // Ensure composite calendar exists before syncing
      try {
        await ensurePropertyCalendar(input.propertyId);
      } catch (e) {
        console.warn("[Properties] ensurePropertyCalendar failed:", e);
      }
      const results = await aggregatePropertyICals(input.propertyId);
      return results;
    }),

  // ─── Email Scraping ──────────────────────────────────────────────────────

  scrapeBookingEmails: protectedProcedure
    .input(z.object({ platformId: z.string() }))
    .mutation(async ({ input }) => {
      return scrapeBookingEmails(input.platformId);
    }),

  scrapeAllBookingEmails: protectedProcedure
    .input(z.object({ propertyId: z.string().optional() }))
    .mutation(async ({ input }) => {
      const results = await scrapeAllBookingEmails();
      if (input.propertyId) {
        return results.filter((r: any) => r.propertyId === input.propertyId);
      }
      return results;
    }),

  /**
   * Trigger a multi-platform email scrape for a single platform.
   * Checks for an existing Gmail token first — only initiates OAuth if none found.
   * Returns the scrape result synchronously (may take 10-60s for large inboxes).
   */
  triggerEmailScrape: protectedProcedure
    .input(z.object({ platformId: z.string() }))
    .mutation(async ({ input }) => {
      return scrapeMultiPlatformEmails(input.platformId);
    }),

  /**
   * Trigger scrape for all platforms of a property.
   */
  triggerPropertyEmailScrape: protectedProcedure
    .input(z.object({ propertyId: z.string() }))
    .mutation(async ({ input }) => {
      return scrapeAllMultiPlatformEmails(input.propertyId);
    }),

  /**
   * Get the latest email scrape job status for a property.
   * Used by the frontend to show scrape progress indicator.
   */
  getEmailScrapeStatus: protectedProcedure
    .input(z.object({ propertyId: z.string() }))
    .query(async ({ input }) => {
      return getLatestScrapeJob(input.propertyId);
    }),

  /**
   * Check whether a Gmail token already exists for a given email address.
   * Returns { connected: true } if a valid token is found so the frontend
   * can skip showing the OAuth connect button.
   */
  checkEmailTokenStatus: protectedProcedure
    .input(z.object({ propertyId: z.string(), emailAddress: z.string() }))
    .query(async ({ input, ctx }) => {
      const { resolveGmailToken } = await import("../services/multiPlatformEmailScraper") as any;
      // resolveGmailToken is not exported — check via db directly
      const member = await db.getHouseholdMemberByUserId(ctx.user.id);
      if (!member) return { connected: false };
      const token = await db.getOAuthTokenByEmail(member.id, "google", input.emailAddress);
      if (token?.accessToken) {
        const expiresAt = token.expiresAt ? new Date(token.expiresAt).getTime() : 0;
        const isValid = expiresAt > Date.now() + 5 * 60 * 1000;
        const hasRefresh = !!token.refreshToken;
        return { connected: isValid || hasRefresh, hasRefreshToken: hasRefresh };
      }
      return { connected: false };
    }),

  /**
   * Get all platforms with needs_reauth scrape status — used by the dashboard
   * to surface actionable warnings for accounts missing gmail.readonly scope.
   * Returns one entry per unique (emailAddress, platform) combination.
   */
  getScrapeAuthWarnings: protectedProcedure
    .query(async ({ ctx }) => {
      const member = await db.getHouseholdMemberByUserId(ctx.user.id);
      if (!member) return [];
      const d = await db.getDb();
      if (!d) return [];

      // Get latest needs_reauth job per platform using sql template literal
      const { sql } = await import("drizzle-orm");

      // Get all platforms with a needs_reauth job
      const warnings = await d.execute(
        sql`SELECT DISTINCT pp.id as platformId, pp.platform, pp.notificationEmail,
                p.id as propertyId, p.name as propertyName,
                esj.errorMessage, esj.completedAt
         FROM email_scrape_jobs esj
         JOIN property_platforms pp ON pp.id = esj.platformId
         JOIN properties p ON p.id = pp.propertyId
         WHERE esj.status = 'needs_reauth'
           AND p.householdId = ${member.householdId}
           AND esj.completedAt = (
             SELECT MAX(esj2.completedAt) FROM email_scrape_jobs esj2
             WHERE esj2.platformId = esj.platformId AND esj2.status = 'needs_reauth'
           )
         ORDER BY p.name, pp.platform`
      ) as any;

      return (Array.isArray(warnings) ? warnings[0] ?? warnings : warnings) as Array<{
        platformId: string;
        platform: string;
        notificationEmail: string;
        propertyId: string;
        propertyName: string;
        errorMessage: string | null;
        completedAt: number | null;
      }>;
    }),

  // ─── Prep Rules ───────────────────────────────────────────────────────────

  getPrepRule: protectedProcedure
    .input(z.object({ propertyId: z.string() }))
    .query(async ({ input }) => {
      return db.getPropertyPrepRule(input.propertyId);
    }),

  savePrepRule: protectedProcedure
    .input(z.object({
      propertyId: z.string(),
      blockDaysBefore: z.number().int().min(0).max(30).default(0),
      blockDaysAfter: z.number().int().min(0).max(30).default(1),
      blockNationalHolidays: z.boolean().default(false),
      blockSundays: z.boolean().default(false),
      customBlockDates: z.array(z.string()).optional(),
    }))
    .mutation(async ({ input }) => {
      const id = nanoid();
      await db.upsertPropertyPrepRule({
        id,
        propertyId: input.propertyId,
        blockDaysBefore: input.blockDaysBefore,
        blockDaysAfter: input.blockDaysAfter,
        blockNationalHolidays: input.blockNationalHolidays,
        blockSundays: input.blockSundays,
        customBlockDates: input.customBlockDates || [],
      });
      // Regenerate outbound ICS after rule change
      try {
        await generateOutboundICS(input.propertyId);
      } catch (e) {
        console.warn("[Properties] Outbound ICS regeneration failed:", e);
      }
      return { success: true };
    }),

  // ─── Bookings ─────────────────────────────────────────────────────────────

  listBookings: protectedProcedure
    .input(z.object({
      propertyId: z.string(),
      fromTs: z.number().optional(),
      toTs: z.number().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const property = await db.getPropertyById(input.propertyId);
      const restrictedCats = await resolveViewerPolicy(ctx.user.id, property?.verticalId);
      const bookings = await db.getPropertyBookings(input.propertyId, input.fromTs, input.toTs);
      return stripArrayByPolicy(bookings as Record<string, unknown>[], "property_bookings", restrictedCats);
    }),

  // ─── Revenue Summary ───────────────────────────────────────────────────────────
  getRevenueSummary: protectedProcedure
    .input(z.object({
      householdId: z.string(),
      fromTs: z.number().optional(),
      toTs: z.number().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const allProperties = await db.getProperties(input.householdId);
      // P-52: Filter by allowedCalendarIds for restricted members
      const callerMember = await db.getHouseholdMemberByUserId(ctx.user.id);
      let properties = allProperties;
      if (callerMember && callerMember.role !== "household_admin" && callerMember.role !== "ea") {
        const verticalIds = Array.from(new Set(allProperties.map((p: any) => p.verticalId).filter(Boolean))) as string[];
        if (verticalIds.length > 0) {
          const accessRuleMap = await db.getMemberCalendarAccessBatch(callerMember.id, verticalIds);
          properties = allProperties.filter((p: any) => {
            const rule = accessRuleMap.get(p.verticalId);
            if (!rule) return true;
            const allowed = rule.allowedCalendarIds;
            if (!allowed.length) return true;
            return p.calendarId && allowed.includes(p.calendarId);
          });
        }
      }
      const results = await Promise.all(
        properties.map(async (prop: any) => {
          // Resolve per-property policy — each property may belong to a different vertical
          const restrictedCats = await resolveViewerPolicy(ctx.user.id, prop.verticalId);
          const isFinancialRestricted = restrictedCats.includes("financial");
          if (isFinancialRestricted) {
            // Return a redacted summary — no revenue figures, just booking count
            const bookings = await db.getPropertyBookings(prop.id, input.fromTs, input.toTs);
            return {
              propertyId: prop.id,
              propertyName: prop.name ?? prop.id,
              revenue: null,
              commission: null,
              net: null,
              currency: null,
              bookingCount: (bookings as any[]).length,
              _restricted: true,
            };
          }
          // Enhanced revenue with tax breakdown
          const revSummary = await db.getPropertyRevenueSummaryWithTax(prop.id, input.fromTs, input.toTs);
          // LTR revenue for this property
          const ltrSummary = await db.getLtrRevenueSummary(prop.id, input.fromTs, input.toTs);
          // Property photos for carousel
          const photos = await db.getPropertyPhotos(prop.id);
          return {
            propertyId: prop.id,
            propertyName: prop.name ?? prop.id,
            revenue: revSummary?.revenue ?? 0,
            commission: revSummary?.commission ?? 0,
            net: revSummary?.net ?? 0,
            taxRemittedByPlatform: revSummary?.taxRemittedByPlatform ?? 0,
            taxOwedByHost: revSummary?.taxOwedByHost ?? 0,
            passThroughTax: revSummary?.passThroughTax ?? 0,
            taxJurisdiction: revSummary?.taxJurisdiction,
            currency: revSummary?.currency ?? "USD",
            bookingCount: revSummary?.bookingCount ?? 0,
            sourceBreakdown: revSummary?.sourceBreakdown,
            ltr: ltrSummary,
            photos: photos.map((p: any) => ({ id: p.id, url: p.url, caption: p.caption, sortOrder: p.sortOrder })),
            _restricted: false,
          };
        })
      );
      // Totals only include non-restricted properties
      const unrestricted = results.filter((r: any) => !r._restricted);
      const totals = unrestricted.reduce(
        (acc: any, r: any) => ({
          revenue: acc.revenue + (r.revenue ?? 0),
          commission: acc.commission + (r.commission ?? 0),
          net: acc.net + (r.net ?? 0),
          taxRemittedByPlatform: acc.taxRemittedByPlatform + (r.taxRemittedByPlatform ?? 0),
          taxOwedByHost: acc.taxOwedByHost + (r.taxOwedByHost ?? 0),
          passThroughTax: acc.passThroughTax + (r.passThroughTax ?? 0),
          currency: r.currency || acc.currency,
          bookingCount: acc.bookingCount + r.bookingCount,
          ltrTotalReceived: acc.ltrTotalReceived + (r.ltr?.totalReceived ?? 0),
          ltrTotalOverdue: acc.ltrTotalOverdue + (r.ltr?.totalOverdue ?? 0),
        }),
        { revenue: 0, commission: 0, net: 0, taxRemittedByPlatform: 0, taxOwedByHost: 0, passThroughTax: 0, currency: "USD", bookingCount: 0, ltrTotalReceived: 0, ltrTotalOverdue: 0 }
      );
      return { properties: results, totals };
    }),

  // ─── Composite Bookings ───────────────────────────────────────────────────

  /**
   * Returns a composite, deduplicated view of all bookings for a property.
   * Merges overlapping blocks from multiple platforms, applies prep rules,
   * and returns typed entries: checkin | checkout | block | unavailable | prep.
   */
  getCompositeBookings: protectedProcedure
    .input(z.object({
      propertyId: z.string(),
      fromTs: z.number().optional(),
      toTs: z.number().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const property = await db.getPropertyById(input.propertyId);
      const restrictedCats = await resolveViewerPolicy(ctx.user.id, property?.verticalId);
      const entries = await db.getCompositeBookings(input.propertyId, input.fromTs, input.toTs);
      // Attach property timezone to every entry so the frontend can do property-local date comparisons
      const propertyTimezone = (property as any)?.timezone || "America/New_York";
      // Apply policy stripping to financial enrichment fields if needed
      const isFinancialRestricted = restrictedCats.includes("financial");
      return (entries as any[]).map(entry => {
        const mapped = { ...entry, propertyTimezone };
        if (isFinancialRestricted) {
          // Redact financial fields for restricted viewers
          mapped.totalPrice = null;
          mapped.cleaningFee = null;
          mapped.commissionAmount = null;
          mapped.netAmount = null;
          mapped.currency = null;
        }
        return mapped;
      });
    }),

  // ─── Upcoming Events (cross-property) ───────────────────────────────────────────

  /**
   * Returns upcoming check-ins and check-outs across ALL STR properties for a household.
   * Used by the dashboard Properties widget upcoming events section.
   */
  getUpcomingEvents: protectedProcedure
    .input(z.object({
      householdId: z.string(),
      daysAhead: z.number().default(14),
      /**
       * IANA timezone of the user's device (e.g. "Asia/Shanghai").
       * Used to compute start-of-today in the user's local timezone.
       * Falls back to America/New_York (constellation home) if not provided.
       * See /docs/DATETIME_MODEL.md.
       */
      deviceTimezone: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      // Use start-of-today in the user's device timezone (primary reference).
      // Falls back to constellation home (America/New_York) if no device timezone provided.
      const tz = input.deviceTimezone || "America/New_York";
      const nowDate = new Date();
      const localDateStr = new Intl.DateTimeFormat("en-CA", {
        timeZone: tz,
        year: "numeric", month: "2-digit", day: "2-digit",
      }).format(nowDate); // "YYYY-MM-DD" in device tz — used for date-string comparison
      // Compute UTC ms for midnight in the device timezone
      // by finding the UTC offset at that approximate point
      const approxUtc = new Date(localDateStr + "T00:00:00Z").getTime();
      const offsetStr = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        timeZoneName: "shortOffset",
      }).formatToParts(approxUtc).find((p: Intl.DateTimeFormatPart) => p.type === "timeZoneName")?.value ?? "GMT+0";
      const offsetMatch = offsetStr.match(/GMT([+-])(\d+)(?::(\d+))?/);
      let fromTs = approxUtc;
      if (offsetMatch) {
        const sign = offsetMatch[1] === "+" ? 1 : -1;
        const hours = parseInt(offsetMatch[2], 10);
        const minutes = parseInt(offsetMatch[3] ?? "0", 10);
        fromTs = approxUtc - sign * (hours * 60 + minutes) * 60 * 1000;
      }
      const toTs = fromTs + input.daysAhead * 86400000;
      const props = await db.getProperties(input.householdId);
      let strProps = props.filter((p: any) => ["rental_str", "vacation"].includes(p.type));

      // P-52: Filter by allowedCalendarIds for the caller's vertical access rules
      const member = await db.getHouseholdMemberByUserId(ctx.user.id);
      if (member && member.role !== "household_admin" && member.role !== "ea") {
        const verticalIds = Array.from(new Set(strProps.map((p: any) => p.verticalId).filter(Boolean))) as string[];
        if (verticalIds.length > 0) {
          const accessRuleMap = await db.getMemberCalendarAccessBatch(member.id, verticalIds);
          strProps = strProps.filter((p: any) => {
            const rule = accessRuleMap.get(p.verticalId);
            if (!rule) return true;
            const allowed = rule.allowedCalendarIds;
            if (!allowed.length) return true;
            return p.calendarId && allowed.includes(p.calendarId);
          });
        }
      }

      const results = await Promise.all(
        strProps.map(async (prop: any) => {
          // Run composite bookings and conflict detection in parallel
          const [entries, conflictReport] = await Promise.all([
            db.getCompositeBookings(prop.id, fromTs, toTs),
            detectConflictsForProperty(prop.id, prop.name).catch(() => ({ conflicts: [], backToBacks: [] })),
          ]);

          // Build a map from bookingId -> conflict detail for fast lookup
          // A booking can appear in multiple conflicts; we keep the first (most severe)
          const conflictMap = new Map<string, {
            conflictingPlatform: string;
            conflictingSummary: string;
            conflictingGuestName: string | null;
            overlapStart: number;
            overlapEnd: number;
            conflictDays: number;
          }>();
          for (const c of conflictReport.conflicts) {
            if (!conflictMap.has(c.bookingAId)) {
              conflictMap.set(c.bookingAId, {
                conflictingPlatform: c.platformB,
                conflictingSummary: c.summaryB,
                conflictingGuestName: c.guestNameB,
                overlapStart: c.overlapStart,
                overlapEnd: c.overlapEnd,
                conflictDays: c.conflictDays,
              });
            }
            if (!conflictMap.has(c.bookingBId)) {
              conflictMap.set(c.bookingBId, {
                conflictingPlatform: c.platformA,
                conflictingSummary: c.summaryA,
                conflictingGuestName: c.guestNameA,
                overlapStart: c.overlapStart,
                overlapEnd: c.overlapEnd,
                conflictDays: c.conflictDays,
              });
            }
          }

          // For conflict entries: also include the raw (non-composite) conflicting bookings
          // so both sides of the conflict are visible in the upcoming list
          const conflictEntries: any[] = [];
          for (const c of conflictReport.conflicts) {
            // Only include if the conflict overlaps with our date window
            if (c.overlapEnd < fromTs || c.overlapStart > toTs) continue;
            // Add a synthetic "conflict pair" entry for each conflict
            conflictEntries.push({
              key: `conflict-${c.bookingAId}-${c.bookingBId}`,
              type: "conflict_pair",
              date: new Date(c.overlapStart).toISOString().slice(0, 10),
              summary: `Double booking: ${c.platformA} ↔ ${c.platformB}`,
              platform: c.platformA,
              platformDisplay: c.platformA,
              platformB: c.platformB,
              summaryA: c.summaryA || "Guest arrival",
              summaryB: c.summaryB || "Guest arrival",
              guestNameA: c.guestNameA,
              guestNameB: c.guestNameB,
              checkInA: c.checkInA,
              checkOutA: c.checkOutA,
              checkInB: c.checkInB,
              checkOutB: c.checkOutB,
              overlapStart: c.overlapStart,
              overlapEnd: c.overlapEnd,
              conflictDays: c.conflictDays,
              checkIn: c.overlapStart,
              checkOut: c.overlapEnd,
              hasConflict: true,
              propertyId: prop.id,
              propertyName: prop.name,
            });
          }

          const propTimezone = (prop as any).timezone || "America/New_York";
          const regularEntries = entries
            .filter((e: any) => {
              if (e.type !== "checkin" && e.type !== "checkout") return false;
              if (e.type === "checkout") {
                // Checkout entries: use the canonical UTC-based date string (e.date) computed
                // in getCompositeBookings via getUTCFullYear/Month/Date. This is the correct
                // checkout date regardless of device timezone. Bookings are stored as midnight
                // UTC of the checkout day, so the UTC date is always correct.
                // Example: checkOut = 2026-06-20T00:00:00Z → e.date = "2026-06-20" ✓
                // Converting to local timezone (EDT = UTC-4) would give "2026-06-19" ✗
                return e.date >= localDateStr;
              }
              // For check-in entries, use the timestamp comparison (check-ins are always
              // stored at midnight UTC of the check-in day, so this is fine)
              return (e.sortTs ?? e.checkIn) >= fromTs;
            })
            .map((e: any) => {
              const conflictDetail = conflictMap.get(e.id);
              return {
                ...e,
                propertyId: prop.id,
                propertyName: prop.name,
                propertyTimezone: propTimezone,
                ...(conflictDetail ? { conflictDetail } : {}),
              };
            });

          return [...regularEntries, ...conflictEntries];
        })
      );

      // Sort by effective date: checkout entries sort by checkOut (sortTs), check-in by checkIn
      return results.flat()
        .sort((a: any, b: any) => (a.sortTs ?? a.checkIn) - (b.sortTs ?? b.checkIn))
        .slice(0, 15);
    }),

  // ─── Outbound ICS ─────────────────────────────────────────────────────────

  generateOutboundICS: protectedProcedure
    .input(z.object({ propertyId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const drizzleDb = await db.getDb();
      if (!drizzleDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const url = await generateOutboundICS(input.propertyId);
      // Persist the URL so it can be displayed in the UI and used by platforms
      await drizzleDb.update(properties).set({ outboundIcsUrl: url }).where(eq(properties.id, input.propertyId));
      return { url };
    }),

  // ─── Conflict Detection ───────────────────────────────────────────────────

  /**
   * Detects double-bookings and back-to-back situations for a property.
   * Returns conflict pairs with overlapping date ranges and severity.
   */
  getConflicts: protectedProcedure
    .input(z.object({ propertyId: z.string() }))
    .query(async ({ input }) => {
      const property = await db.getPropertyById(input.propertyId);
      if (!property) throw new TRPCError({ code: "NOT_FOUND", message: "Property not found" });
      return detectConflictsForProperty(input.propertyId, (property as any).name ?? input.propertyId);
    }),

  // ─── Booking Overrides (guest name annotation for anonymous iCal blocks) ──

  setBookingOverride: protectedProcedure
    .input(z.object({
      bookingId: z.string(),
      guestName: z.string().max(200).optional(),
      notes: z.string().max(1000).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Household isolation: verify caller owns the booking's property
      const booking = await db.getPropertyBookingById(input.bookingId);
      if (booking) {
        const property = await db.getPropertyById(booking.propertyId);
        if (property) {
          const member = await assertHouseholdOwnership(ctx.user.id);
          assertResourceBelongsToHousehold(property.householdId, member.householdId, "Property");
        }
      }
      const drizzleDb = await db.getDb();
      if (!drizzleDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await (drizzleDb as any).delete(bookingOverrides).where(eq(bookingOverrides.bookingId, input.bookingId));
      if (input.guestName || input.notes) {
        await (drizzleDb as any).insert(bookingOverrides).values({
          id: nanoid(),
          bookingId: input.bookingId,
          guestName: input.guestName ?? null,
          notes: input.notes ?? null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
      return { success: true };
    }),

  /**
   * Consolidated dashboard procedure — returns composite bookings, conflicts, platforms,
   * and a financial summary for a single property in one round-trip.
   * Replaces the 3-query pattern (getCompositeBookings + getConflicts + listPlatforms) used
   * by PropertyBookingTimeline on the Home dashboard.
   */
  getPropertyDashboard: protectedProcedure
    .input(z.object({
      propertyId: z.string(),
      fromTs: z.number().optional(),
      toTs: z.number().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const property = await db.getPropertyById(input.propertyId);
      if (!property) throw new TRPCError({ code: "NOT_FOUND", message: "Property not found" });

      const restrictedCats = await resolveViewerPolicy(ctx.user.id, (property as any).verticalId);
      const isFinancialRestricted = restrictedCats.includes("financial");
      const propertyTimezone = (property as any).timezone || "America/New_York";

      // Run all data fetches in parallel
      const [entries, conflictData, platforms, bookingsForFinancials] = await Promise.all([
        db.getCompositeBookings(input.propertyId, input.fromTs, input.toTs),
        detectConflictsForProperty(input.propertyId, (property as any).name ?? input.propertyId),
        db.getPropertyPlatforms(input.propertyId),
        isFinancialRestricted ? Promise.resolve([]) : db.getPropertyBookings(input.propertyId, input.fromTs, input.toTs),
      ]);

      // Attach propertyTimezone and strip restricted fields from each entry
      const enrichedEntries = (entries as any[]).map(entry => ({
        ...entry,
        propertyTimezone,
        booking: entry.booking
          ? stripByPolicy(entry.booking as Record<string, unknown>, "property_bookings", restrictedCats)
          : entry.booking,
      }));

      // Financial summary for the visible window
      let financials: { revenue: number; commission: number; net: number; currency: string; bookingCount: number } | null = null;
      if (!isFinancialRestricted) {
        const withFin = (bookingsForFinancials as any[]).filter((b: any) => b.totalPrice || b.netAmount);
        financials = {
          revenue: Math.round(withFin.reduce((s: number, b: any) => s + parseFloat(b.totalPrice || "0"), 0) * 100) / 100,
          commission: Math.round(withFin.reduce((s: number, b: any) => s + parseFloat(b.commissionAmount || "0"), 0) * 100) / 100,
          net: Math.round(withFin.reduce((s: number, b: any) => s + parseFloat(b.netAmount || "0"), 0) * 100) / 100,
          currency: (withFin[0] as any)?.currency ?? "USD",
          bookingCount: withFin.length,
        };
      }

      // Inactive platform warning: flag platforms that have an iCal URL but isActive=false
      const inactivePlatforms = (platforms as any[]).filter((p: any) => !p.isActive && p.icalUrl);

      return {
        entries: enrichedEntries,
        conflicts: conflictData,
        platforms: platforms as any[],
        financials,
        inactivePlatforms,
        propertyTimezone,
      };
    }),

  getBookingOverride: protectedProcedure
    .input(z.object({ bookingId: z.string() }))
    .query(async ({ input }) => {
      const drizzleDb = await db.getDb();
      if (!drizzleDb) return null;
      const rows = await (drizzleDb as any)
        .select()
        .from(bookingOverrides)
        .where(eq(bookingOverrides.bookingId, input.bookingId))
        .limit(1);
      return rows[0] ?? null;
    }),

  // ─── Create a manual (direct) booking ─────────────────────────────────────────
  createManualBooking: protectedProcedure
    .input(z.object({
      propertyId: z.string(),
      guestName: z.string().min(1).max(200),
      guestEmail: z.string().email().max(320).optional().nullable(),
      guestPhone: z.string().max(50).optional().nullable(),
      checkIn: z.number(),
      checkOut: z.number(),
      totalPrice: z.number().min(0).optional().nullable(),
      cleaningFee: z.number().min(0).optional().nullable(),
      commissionAmount: z.number().min(0).optional().nullable(),
      netAmount: z.number().min(0).optional().nullable(),
      currency: z.string().max(3).default("USD"),
      guestCount: z.number().int().min(1).max(100).optional().nullable(),
      notes: z.string().max(2000).optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const member = await assertHouseholdOwnership(ctx.user.id);
      const property = await db.getPropertyById(input.propertyId);
      if (!property) throw new TRPCError({ code: "NOT_FOUND", message: "Property not found" });
      await assertResourceBelongsToHousehold(property.householdId, member.householdId, "Property");

      if (input.checkIn >= input.checkOut) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Check-out must be after check-in" });
      }

      // Ensure a direct platform exists for this property
      const platforms = await db.getPropertyPlatforms(input.propertyId);
      let directPlatform = (platforms as any[]).find((p: any) => p.platform === "direct");
      if (!directPlatform) {
        const newPlatform = {
          id: nanoid(),
          propertyId: input.propertyId,
          platform: "direct" as const,
          displayName: "Direct Booking",
          icalUrl: "",
          isActive: true,
        };
        await db.createPropertyPlatform(newPlatform as any);
        directPlatform = newPlatform;
      }

      // Conflict check
      const allBookings = await db.getPropertyBookings(input.propertyId);
      const conflict = (allBookings as any[]).find((b: any) =>
        b.bookingStatus === "confirmed" &&
        b.checkIn < input.checkOut &&
        b.checkOut > input.checkIn
      );
      if (conflict) {
        const ciDate = new Date(conflict.checkIn).toLocaleDateString();
        const coDate = new Date(conflict.checkOut).toLocaleDateString();
        throw new TRPCError({
          code: "CONFLICT",
          message: `Date conflict: an existing booking overlaps these dates (${ciDate} – ${coDate})`,
        });
      }

      const bookingId = nanoid();
      await db.createManualPropertyBooking({
        id: bookingId,
        propertyId: input.propertyId,
        platformId: directPlatform.id,
        icalUid: `geeves-direct-${bookingId}`,
        bookingType: "booking",
        summary: `Direct Booking — ${input.guestName}`,
        description: input.notes ?? null,
        checkIn: input.checkIn,
        checkOut: input.checkOut,
        guestName: input.guestName,
        guestEmail: input.guestEmail ?? null,
        guestPhone: input.guestPhone ?? null,
        guestCount: input.guestCount ?? null,
        totalPrice: input.totalPrice != null ? String(input.totalPrice) : null,
        cleaningFee: input.cleaningFee != null ? String(input.cleaningFee) : null,
        commissionAmount: input.commissionAmount != null ? String(input.commissionAmount) : null,
        netAmount: input.netAmount != null ? String(input.netAmount) : null,
        currency: input.currency ?? "USD",
        bookingStatus: "confirmed",
      } as any);

      try { await generateOutboundICS(input.propertyId); } catch (e) {
        console.warn("[Properties] Failed to regenerate outbound ICS:", e);
      }

      return { bookingId, success: true };
    }),

  // ─── Cancel a manual booking ────────────────────────────────────────────────
  cancelManualBooking: protectedProcedure
    .input(z.object({ bookingId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const booking = await db.getPropertyBookingById(input.bookingId);
      if (!booking) throw new TRPCError({ code: "NOT_FOUND", message: "Booking not found" });
      const property = await db.getPropertyById(booking.propertyId);
      if (!property) throw new TRPCError({ code: "NOT_FOUND", message: "Property not found" });
      const member = await assertHouseholdOwnership(ctx.user.id);
      await assertResourceBelongsToHousehold(property.householdId, member.householdId, "Property");
      await db.cancelPropertyBooking(input.bookingId);
      try { await generateOutboundICS(booking.propertyId); } catch (e) {
        console.warn("[Properties] Failed to regenerate outbound ICS after cancel:", e);
      }
      return { success: true };
    }),

  // ─── P-31: 3-source cancellation management ────────────────────────────────

  /** Return cancelled bookings for a property (soft-deleted, restorable) */
  getCancelledBookings: protectedProcedure
    .input(z.object({ propertyId: z.string() }))
    .query(async ({ ctx, input }) => {
      const member = await assertHouseholdOwnership(ctx.user.id);
      const property = await db.getPropertyById(input.propertyId);
      if (!property) throw new TRPCError({ code: 'NOT_FOUND', message: 'Property not found' });
      await assertResourceBelongsToHousehold(property.householdId, member.householdId, 'Property');
      return db.getCancelledBookings(input.propertyId);
    }),

  /** Return all bookings with a pending cancellation for the current household */
  getPendingCancellations: protectedProcedure
    .query(async ({ ctx }) => {
      const member = await assertHouseholdOwnership(ctx.user.id);
      const rows = await db.getPendingCancellations(member.householdId);
      return rows;
    }),

  /** Confirm a pending cancellation — marks the booking as cancelled */
  confirmCancellation: protectedProcedure
    .input(z.object({ bookingId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const booking = await db.getPropertyBookingById(input.bookingId);
      if (!booking) throw new TRPCError({ code: 'NOT_FOUND', message: 'Booking not found' });
      const property = await db.getPropertyById(booking.propertyId);
      if (!property) throw new TRPCError({ code: 'NOT_FOUND', message: 'Property not found' });
      const member = await assertHouseholdOwnership(ctx.user.id);
      await assertResourceBelongsToHousehold(property.householdId, member.householdId, 'Property');
      await db.confirmBookingCancellation(input.bookingId);
      return { success: true };
    }),

  /** Dismiss a pending cancellation — keeps the booking as confirmed */
  dismissPendingCancellation: protectedProcedure
    .input(z.object({ bookingId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const booking = await db.getPropertyBookingById(input.bookingId);
      if (!booking) throw new TRPCError({ code: 'NOT_FOUND', message: 'Booking not found' });
      const property = await db.getPropertyById(booking.propertyId);
      if (!property) throw new TRPCError({ code: 'NOT_FOUND', message: 'Property not found' });
      const member = await assertHouseholdOwnership(ctx.user.id);
      await assertResourceBelongsToHousehold(property.householdId, member.householdId, 'Property');
      await db.dismissBookingCancellation(input.bookingId);
      return { success: true };
    }),

  /** Restore a cancelled booking back to confirmed */
  restoreBooking: protectedProcedure
    .input(z.object({ bookingId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const booking = await db.getPropertyBookingById(input.bookingId);
      if (!booking) throw new TRPCError({ code: 'NOT_FOUND', message: 'Booking not found' });
      const property = await db.getPropertyById(booking.propertyId);
      if (!property) throw new TRPCError({ code: 'NOT_FOUND', message: 'Property not found' });
      const member = await assertHouseholdOwnership(ctx.user.id);
      await assertResourceBelongsToHousehold(property.householdId, member.householdId, 'Property');
      await db.restorePropertyBooking(input.bookingId);
      return { success: true };
    }),

  // ─── Manual financial entry for bookings ─────────────────────────────────
  updateBookingFinancials: protectedProcedure
    .input(
      z.object({
        bookingId: z.string(),
        guestName: z.string().max(200).nullable().optional(),
        guestCount: z.number().int().min(1).max(100).nullable().optional(),
        guestEmail: z.string().email().max(200).nullable().optional(),
        guestPhone: z.string().max(50).nullable().optional(),
        checkIn: z.number().optional(),
        checkOut: z.number().optional(),
        notes: z.string().max(2000).nullable().optional(),
        totalPrice: z.number().min(0).nullable().optional(),
        cleaningFee: z.number().min(0).nullable().optional(),
        commissionAmount: z.number().min(0).nullable().optional(),
        netAmount: z.number().min(0).nullable().optional(),
        currency: z.string().max(3).nullable().optional(),
        confirmationNumber: z.string().max(100).nullable().optional(),
        platformBookingUrl: z.string().url().max(500).nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { bookingId, notes, checkIn, checkOut, ...data } = input;
      // Verify the booking belongs to the user's household
      const booking = await db.getPropertyBookingById(bookingId);
      if (!booking) throw new TRPCError({ code: "NOT_FOUND", message: "Booking not found" });
      const property = await db.getPropertyById(booking.propertyId);
      if (!property) throw new TRPCError({ code: "NOT_FOUND", message: "Property not found" });
      const member = await assertHouseholdOwnership(ctx.user.id);
      await assertResourceBelongsToHousehold(property.householdId, member.householdId, "Property");

      // Build update payload including dates and notes if provided
      const updatePayload: any = { ...data };
      if (notes !== undefined) updatePayload.description = notes;
      if (checkIn !== undefined) updatePayload.checkIn = checkIn;
      if (checkOut !== undefined) updatePayload.checkOut = checkOut;

      // Validate dates if both provided
      if (checkIn !== undefined && checkOut !== undefined && checkIn >= checkOut) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Check-out must be after check-in" });
      }

      await db.updatePropertyBookingFinancials(bookingId, updatePayload);

      // Regenerate outbound ICS if dates changed
      if (checkIn !== undefined || checkOut !== undefined) {
        try { await generateOutboundICS(booking.propertyId); } catch (e) {
          console.warn("[Properties] Failed to regenerate outbound ICS after date update:", e);
        }
      }

      return { success: true };
    }),

  // ─── Generate invoice PDF for a booking ────────────────────────────────────
  generateInvoice: protectedProcedure
    .input(z.object({ bookingId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const booking = await db.getPropertyBookingById(input.bookingId);
      if (!booking) throw new TRPCError({ code: "NOT_FOUND", message: "Booking not found" });
      const property = await db.getPropertyById(booking.propertyId);
      if (!property) throw new TRPCError({ code: "NOT_FOUND", message: "Property not found" });
      const member = await assertHouseholdOwnership(ctx.user.id);
      await assertResourceBelongsToHousehold(property.householdId, member.householdId, "Property");

      const checkIn = (booking as any).checkIn as number;
      const checkOut = (booking as any).checkOut as number;
      const nights = Math.max(1, Math.round((checkOut - checkIn) / 86400000));
      const invoiceNumber = `GVS-${Date.now().toString(36).toUpperCase()}`;

      const invoiceUrl = await generateBookingInvoicePDF({
        bookingId: booking.id,
        propertyName: property.name,
        propertyAddress: (property as any).address ?? null,
        guestName: (booking as any).guestName || "Guest",
        guestEmail: (booking as any).guestEmail ?? null,
        guestPhone: (booking as any).guestPhone ?? null,
        checkIn,
        checkOut,
        nights,
        totalPrice: (booking as any).totalPrice ? parseFloat((booking as any).totalPrice) : null,
        cleaningFee: (booking as any).cleaningFee ? parseFloat((booking as any).cleaningFee) : null,
        commissionAmount: (booking as any).commissionAmount ? parseFloat((booking as any).commissionAmount) : null,
        netAmount: (booking as any).netAmount ? parseFloat((booking as any).netAmount) : null,
        currency: (booking as any).currency || "USD",
        guestCount: (booking as any).guestCount ?? null,
        notes: (booking as any).description ?? null,
        invoiceNumber,
        issuedAt: Date.now(),
      });

      return { invoiceUrl, invoiceNumber };
    }),

  // ═══════════════════════════════════════════════════════════════════════
  // PROPERTY PHOTOS
  // ═══════════════════════════════════════════════════════════════════════

  getPropertyPhotos: protectedProcedure
    .input(z.object({ propertyId: z.string() }))
    .query(async ({ input }) => {
      return db.getPropertyPhotos(input.propertyId);
    }),

  uploadPropertyPhoto: protectedProcedure
    .input(z.object({
      propertyId: z.string(),
      householdId: z.string(),
      /** Base64-encoded image data URI, e.g. "data:image/jpeg;base64,..." */
      dataUri: z.string().max(10_000_000), // ~7.5 MB raw → ~10 MB base64
      caption: z.string().optional(),
      sortOrder: z.number().default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertHouseholdOwnership(ctx.user.id);
      // Decode base64 data URI
      const match = input.dataUri.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/);
      if (!match) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid image format. Must be JPEG, PNG, WebP, or GIF." });
      const [, mimeType, base64Data] = match;
      const buffer = Buffer.from(base64Data, "base64");
      if (buffer.length > 8_000_000) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Image too large (max 8 MB)" });
      }
      const ext = mimeType.split("/")[1];
      const id = nanoid();
      const s3Key = `property-photos/${input.propertyId}/${id}.${ext}`;
      const { storagePut } = await import("../storage");
      const { url } = await storagePut(s3Key, buffer, mimeType);
      await db.addPropertyPhoto({ id, propertyId: input.propertyId, householdId: input.householdId, url, s3Key, caption: input.caption ?? null, sortOrder: input.sortOrder });
      return { id, url, s3Key };
    }),

  deletePropertyPhoto: protectedProcedure
    .input(z.object({ id: z.string(), householdId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertHouseholdOwnership(ctx.user.id);
      await db.deletePropertyPhoto(input.id, input.householdId);
      return { success: true };
    }),

  reorderPropertyPhotos: protectedProcedure
    .input(z.object({ propertyId: z.string(), photoIds: z.array(z.string()) }))
    .mutation(async ({ input }) => {
      await db.reorderPropertyPhotos(input.propertyId, input.photoIds);
      return { success: true };
    }),

  // ═══════════════════════════════════════════════════════════════════════
  // PROPERTY MEMBER ORDER (drag-and-drop reordering)
  // ═══════════════════════════════════════════════════════════════════════

  getPropertyOrder: protectedProcedure
    .input(z.object({ memberId: z.string() }))
    .query(async ({ input }) => {
      const order = await db.getPropertyMemberOrder(input.memberId);
      return order?.propertyOrder ?? [];
    }),

  updatePropertyOrder: protectedProcedure
    .input(z.object({
      memberId: z.string(),
      householdId: z.string(),
      propertyOrder: z.array(z.string()),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertHouseholdOwnership(ctx.user.id);
      await db.upsertPropertyMemberOrder(input.memberId, input.householdId, input.propertyOrder);
      return { success: true };
    }),

  // ═══════════════════════════════════════════════════════════════════════
  // BOOKING SCREENSHOTS (Booking.com Pulse/Extranet OCR)
  // ═══════════════════════════════════════════════════════════════════════

  getBookingScreenshots: protectedProcedure
    .input(z.object({ bookingId: z.string() }))
    .query(async ({ input }) => {
      return db.getBookingScreenshots(input.bookingId);
    }),

  uploadBookingScreenshot: protectedProcedure
    .input(z.object({
      bookingId: z.string(),
      householdId: z.string(),
      s3Url: z.string(),
      s3Key: z.string(),
      ocrExtractedData: z.any().optional(),
      ocrConfidence: z.number().optional(),
      uploadedByMemberId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertHouseholdOwnership(ctx.user.id);
      const id = nanoid();
      await db.addBookingScreenshot({ id, ...input });
      return { id };
    }),

  confirmScreenshotOcr: protectedProcedure
    .input(z.object({ id: z.string(), householdId: z.string(), bookingId: z.string(), financialData: z.object({
      totalPrice: z.number().optional(),
      commissionAmount: z.number().optional(),
      netAmount: z.number().optional(),
      taxRemittedByPlatform: z.number().optional(),
      taxOwedByHost: z.number().optional(),
    }) }))
    .mutation(async ({ ctx, input }) => {
      await assertHouseholdOwnership(ctx.user.id);
      // Mark screenshot as confirmed
      await db.confirmBookingScreenshot(input.id, input.householdId);
      // Update the booking with confirmed financial data
      const dbInstance = await db.getDb();
      if (!dbInstance) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { propertyBookings } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const updateData: any = { financialSource: "screenshot_ocr" };
      if (input.financialData.totalPrice !== undefined) updateData.totalPrice = String(input.financialData.totalPrice);
      if (input.financialData.commissionAmount !== undefined) updateData.commissionAmount = String(input.financialData.commissionAmount);
      if (input.financialData.netAmount !== undefined) updateData.netAmount = String(input.financialData.netAmount);
      if (input.financialData.taxRemittedByPlatform !== undefined) updateData.taxRemittedByPlatform = String(input.financialData.taxRemittedByPlatform);
      if (input.financialData.taxOwedByHost !== undefined) updateData.taxOwedByHost = String(input.financialData.taxOwedByHost);
      await dbInstance.update(propertyBookings).set(updateData).where(eq(propertyBookings.id, input.bookingId));
      return { success: true };
    }),

  // ═══════════════════════════════════════════════════════════════════════
  // LTR PAYMENTS
  // ═══════════════════════════════════════════════════════════════════════

  getLtrPayments: protectedProcedure
    .input(z.object({
      propertyId: z.string(),
      fromTs: z.number().optional(),
      toTs: z.number().optional(),
    }))
    .query(async ({ input }) => {
      return db.getLtrPayments(input.propertyId, input.fromTs, input.toTs);
    }),

  addLtrPayment: protectedProcedure
    .input(z.object({
      propertyId: z.string(),
      householdId: z.string(),
      tenantName: z.string(),
      paymentType: z.enum(["rent", "utility_fee", "deposit", "late_fee", "other"]),
      amount: z.string(),
      currency: z.string().default("USD"),
      expectedAmount: z.string().optional(),
      dueDate: z.number(),
      paidDate: z.number().optional(),
      paymentMethod: z.string().optional(),
      status: z.enum(["paid", "pending", "overdue", "partial", "waived"]).default("pending"),
      notes: z.string().optional(),
      source: z.enum(["manual", "stripe_webhook", "zillow_import", "email_scrape"]).default("manual"),
    }))
    .mutation(async ({ ctx, input }) => {
            await assertHouseholdOwnership(ctx.user.id);
      const id = nanoid();
      await db.addLtrPayment({ id, ...input });
      return { id };
    }),
  updateLtrPayment: protectedProcedure
    .input(z.object({
      id: z.string(),
      householdId: z.string(),
      status: z.enum(["paid", "pending", "overdue", "partial", "waived"]).optional(),
      paidDate: z.number().optional(),
      amount: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertHouseholdOwnership(ctx.user.id);
      const { id, householdId, ...data } = input;
      await db.updateLtrPayment(id, householdId, data as any);
      return { success: true };
    }),
  // ═══════════════════════════════════════════════════════════════════════
  // PLATFORM EXPORT IMPORTS
  // ═══════════════════════════════════════════════════════════════════════
  getPlatformExportImports: protectedProcedure
    .input(z.object({ householdId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertHouseholdOwnership(ctx.user.id);
      return db.getPlatformExportImports(input.householdId);
    }),
  uploadPlatformExport: protectedProcedure
    .input(z.object({
      householdId: z.string(),
      platform: z.enum(["airbnb", "vrbo", "booking_com"]),
      filename: z.string(),
      s3Url: z.string(),
      s3Key: z.string(),
      uploadedByMemberId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertHouseholdOwnership(ctx.user.id);
      const id = nanoid();
      await db.createPlatformExportImport({ id, ...input });
      // TODO: trigger async processing of the export file
      return { id, status: "processing" };
    }),
});
