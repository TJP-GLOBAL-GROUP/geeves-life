import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import * as db from "./db";
import { writeAuditLog } from "./db";
import { invokeLLM } from "./_core/llm";
import { storagePut } from "./storage";
import { nanoid } from "nanoid";
import { householdRouter } from "./routers/household";
import { calendarRouter } from "./routers/calendar";
import { propertiesRouter } from "./routers/properties";
import { notesRouter } from "./routers/notes";
import { verticalsRouter } from "./routers/verticals";
import { geevesRouter } from "./routers/geeves";
import { bookingRequestsRouter } from "./routers/bookingRequests";
import { securityRouter } from "./routers/security";
import { superAdminRouter } from "./routers/superAdmin";
import { resourcesRouter, geevesAccessRouter } from "./routers/resources";
import { integrationsRouter } from "./routers/integrations";
import { accessControlRouter } from "./routers/accessControl";
import { landingRouter } from "./routers/landing";
import { customRolesRouter } from "./routers/customRoles";
import { expenseCategorisationRouter } from "./routers/expenseCategorisation";
import { invoiceExtractionRouter } from "./routers/invoiceExtraction";
import { notificationSettingsRouter } from "./routers/notificationSettings";

// ─── Google Token Revocation ─────────────────────────────────────────
/**
 * Non-blocking helper: revoke all Google refresh tokens for a user on logout.
 * Called fire-and-forget from auth.logout — a Google API failure must never
 * prevent the user from logging out of Geeves.
 *
 * RFC 6749 §1.5 — tokens should be revoked when the client no longer needs them.
 * This is especially important for a household platform where shared/family
 * devices may be used by multiple people.
 */
async function revokeGoogleTokensForUser(userId: number): Promise<void> {
  const member = await db.getHouseholdMemberByUserId(userId);
  if (!member) return;
  const tokens = await db.getAllOAuthTokens(member.id, "google");
  for (const token of tokens) {
    if (token.refreshToken) {
      try {
        await fetch(
          `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token.refreshToken)}`,
          { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" } }
        );
        // Mark as revoked in DB regardless of Google's response
        // (Google returns 200 even for already-revoked tokens)
        await db.revokeOAuthToken(token.id);
      } catch (err) {
        console.warn(`[Auth] Failed to revoke token for ${token.accountEmail}:`, err);
      }
    }
  }
}

// ─── URL Parser for Product IDs ─────────────────────────────────────
function parseProductUrl(url: string): { platform: string; productId: string; productName?: string } | null {
  try {
    const u = new URL(url);
    
    // Walmart: walmart.com/ip/PRODUCT-NAME/123456789 or walmart.com/ip/123456789
    if (u.hostname.includes("walmart.com")) {
      const ipMatch = u.pathname.match(/\/ip\/(?:[^\/]+\/)?([0-9]+)/);
      if (ipMatch) {
        // Extract product name from URL path if available
        const nameMatch = u.pathname.match(/\/ip\/([^\/]+)\/[0-9]+/);
        const productName = nameMatch ? nameMatch[1].replace(/-/g, " ") : undefined;
        return { platform: "walmart", productId: ipMatch[1], productName };
      }
      // Also handle ?items= format from Add To Cart URLs
      const itemsParam = u.searchParams.get("items");
      if (itemsParam) {
        const firstId = itemsParam.split(",")[0].split("_")[0];
        if (/^[0-9]+$/.test(firstId)) {
          return { platform: "walmart", productId: firstId };
        }
      }
      return null;
    }
    
    // Amazon: amazon.com/dp/ASIN or amazon.com/gp/product/ASIN
    if (u.hostname.includes("amazon.com") || u.hostname.includes("amzn.com")) {
      const dpMatch = u.pathname.match(/\/dp\/([A-Z0-9]{10})/);
      if (dpMatch) return { platform: "amazon", productId: dpMatch[1] };
      const gpMatch = u.pathname.match(/\/gp\/product\/([A-Z0-9]{10})/);
      if (gpMatch) return { platform: "amazon", productId: gpMatch[1] };
      // ASIN in query params
      const asin = u.searchParams.get("ASIN") || u.searchParams.get("asin");
      if (asin && /^[A-Z0-9]{10}$/.test(asin)) {
        return { platform: "amazon", productId: asin };
      }
      return null;
    }
    
    return null;
  } catch {
    return null;
  }
}

export const appRouter = router({
  system: systemRouter,
  household: householdRouter,
  calendar: calendarRouter,
  properties: propertiesRouter,
  notes: notesRouter,
  verticals: verticalsRouter,
  bookingRequests: bookingRequestsRouter,
  security: securityRouter,
  superAdmin: superAdminRouter,
  resources: resourcesRouter,
  geevesAccess: geevesAccessRouter,
  integrations: integrationsRouter,
  accessControl: accessControlRouter,
  landing: landingRouter,
  customRoles: customRolesRouter,
  expenseCategorisation: expenseCategorisationRouter,
  invoiceExtraction: invoiceExtractionRouter,
  notificationSettings: notificationSettingsRouter,
  onboarding: onboardingRouter,
  platformConfig: platformConfigRouter,
  dashboard: router({
    getLayout: protectedProcedure.query(async ({ ctx }) => {
      const member = await db.getHouseholdMemberByUserId(ctx.user.id);
      if (!member) return { layout: null };
      const layout = await db.getWidgetLayout(member.id);
      return { layout };
    }),
    saveLayout: protectedProcedure
      .input(z.object({ layout: z.array(z.string()) }))
      .mutation(async ({ ctx, input }) => {
        const member = await db.getHouseholdMemberByUserId(ctx.user.id);
        if (!member) throw new Error("No household member");
        await db.saveWidgetLayout(member.id, member.householdId, input.layout);
        return { success: true };
      }),
    syncHealth: protectedProcedure.query(async ({ ctx }) => {
      const member = await db.getHouseholdMemberByUserId(ctx.user.id);
      if (!member) return { total: 0, synced: 0, pending: 0, failed: 0, permanentFailed: 0, status: 'healthy' as const, percentComplete: 100, etaHours: 0, blocksPerHour: 240, lastSyncAt: null as number | null, expiredTokens: 0, allTokensExpired: false };
      const { getDb } = await import("./db");
      const dbInstance = await getDb();
      if (!dbInstance) return { total: 0, synced: 0, pending: 0, failed: 0, permanentFailed: 0, status: 'healthy' as const, percentComplete: 100, etaHours: 0, blocksPerHour: 240, lastSyncAt: null as number | null, expiredTokens: 0, allTokensExpired: false };
      const { sql: rawSql } = await import("drizzle-orm");
      const statsResult = await dbInstance.execute(
        rawSql`SELECT
          COUNT(*) as total,
          SUM(CASE WHEN sync_status = 'synced' THEN 1 ELSE 0 END) as synced,
          SUM(CASE WHEN sync_status = 'pending_sync' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN sync_status = 'sync_failed' AND sync_attempts < 5 THEN 1 ELSE 0 END) as failed,
          SUM(CASE WHEN sync_status = 'sync_failed' AND sync_attempts >= 5 THEN 1 ELSE 0 END) as permanentFailed,
          MAX(CASE WHEN sync_status = 'synced' THEN last_sync_attempt_at ELSE NULL END) as lastSyncAt
        FROM shadow_blocks
        WHERE householdId = ${member.householdId}`
      );
      const rawStats = Array.isArray(statsResult) ? (statsResult as any)[0] : statsResult;
      const stats = (Array.isArray(rawStats) ? rawStats[0] : rawStats) as any;
      // Count blocks synced in the last hour to calculate rate
      const oneHourAgo = Date.now() - 3600000;
      const rateResult = await dbInstance.execute(
        rawSql`SELECT COUNT(*) as recentSynced
        FROM shadow_blocks
        WHERE householdId = ${member.householdId}
          AND sync_status = 'synced'
          AND last_sync_attempt_at > ${oneHourAgo}`
      );
      const rawRate = Array.isArray(rateResult) ? (rateResult as any)[0] : rateResult;
      const rateStats = (Array.isArray(rawRate) ? rawRate[0] : rawRate) as any;
      const total = Number(stats?.total ?? 0);
      const synced = Number(stats?.synced ?? 0);
      const pending = Number(stats?.pending ?? 0);
      const failed = Number(stats?.failed ?? 0);
      const permanentFailed = Number(stats?.permanentFailed ?? 0);
      const lastSyncAt = stats?.lastSyncAt ? Number(stats.lastSyncAt) : null;
      const recentSynced = Number(rateStats?.recentSynced ?? 0);
      // Rate: blocks synced per hour (use actual rate if available, otherwise estimate 240/hr)
      const blocksPerHour = recentSynced > 0 ? recentSynced : 240;
      const actionableTotal = total - permanentFailed;
      const percentComplete = actionableTotal > 0 ? Math.round((synced / actionableTotal) * 100) : 100;
      const etaHours = pending > 0 ? Math.round((pending / blocksPerHour) * 10) / 10 : 0;
      // Check token health — if all tokens are expired, sync is blocked
      const tokenResult = await dbInstance.execute(
        rawSql`SELECT
          COUNT(*) as totalTokens,
          SUM(CASE WHEN status = 'expired' OR status = 'revoked' THEN 1 ELSE 0 END) as expiredTokens
        FROM oauth_tokens
        WHERE memberId = ${member.id} AND provider = 'google'`
      );
      const rawTokens = Array.isArray(tokenResult) ? (tokenResult as any)[0] : tokenResult;
      const tokenStats = (Array.isArray(rawTokens) ? rawTokens[0] : rawTokens) as any;
      const totalTokens = Number(tokenStats?.totalTokens ?? 0);
      const expiredTokens = Number(tokenStats?.expiredTokens ?? 0);
      const allTokensExpired = totalTokens > 0 && expiredTokens === totalTokens;

      let status: 'healthy' | 'warning' | 'critical' | 'syncing' | 'blocked' = 'healthy';
      if (allTokensExpired && pending > 0) status = 'blocked';
      else if (pending > 0) status = 'syncing';
      else if (failed > 50) status = 'critical';
      else if (failed > 0) status = 'warning';
      return { total, synced, pending, failed, permanentFailed, status, percentComplete, etaHours, blocksPerHour, lastSyncAt, expiredTokens, allTokensExpired };
    }),
  }),

  auth: router({
    me: publicProcedure.query(async ({ ctx }) => {
      if (!ctx.user) return null;
      // Self-healing: if householdId/memberId are missing on the users row,
      // resolve them from household_members and stamp the row so future
      // requests don't loop back to onboarding.
      if (!ctx.user.householdId || !ctx.user.memberId) {
        try {
          const member = await db.getHouseholdMemberByUserId(ctx.user.id);
          if (member) {
            await db.updateUserHousehold(ctx.user.id, member.householdId, member.id);
            return { ...ctx.user, householdId: member.householdId, memberId: member.id };
          }
        } catch (e) {
          // Non-fatal — return the user as-is; onboarding will handle it
          console.warn('[auth.me] self-heal lookup failed:', e);
        }
      }
      return ctx.user;
    }),

    /**
     * Called on every app load to persist the user's device IANA timezone and
     * optional city name. Used for server-side date math (fromTs, etc.).
     * See /docs/DATETIME_MODEL.md.
     */
    updateDeviceLocation: protectedProcedure
      .input(z.object({
        timezone: z.string().min(1).max(64),
        city: z.string().max(128).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await import("./db").then(m => m.getDb());
        if (!db) return { success: false };
        const { eq } = await import("drizzle-orm");
        const { users } = await import("../drizzle/schema");
        await db.update(users)
          .set({
            deviceTimezone: input.timezone,
            ...(input.city ? { deviceCity: input.city } : {}),
          })
          .where(eq(users.id, ctx.user.id));
        return { success: true };
      }),

    logout: publicProcedure.mutation(async ({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      if (ctx.user) {
        await writeAuditLog({
          actorUserId: ctx.user.id,
          actorOpenId: ctx.user.openId,
          actorEmail: ctx.user.email ?? undefined,
          actorName: ctx.user.name ?? undefined,
          action: "auth.logout",
          category: "auth",
          outcome: "success",
          ipAddress: ctx.req.ip,
          userAgent: ctx.req.headers["user-agent"],
        });

        // Non-blocking: revoke all Google refresh tokens for this user.
        // RFC 6749 §1.5 — tokens should be revoked when no longer needed.
        // Fire-and-forget so a Google API failure never blocks the logout response.
        revokeGoogleTokensForUser(ctx.user.id).catch(err => {
          console.warn("[Auth] Google token revocation failed on logout:", err);
        });
      }
      return { success: true } as const;
    }),
  }),

  // ─── Family Members ──────────────────────────────────────────────
  family: router({
    list: protectedProcedure.query(({ ctx }) => db.getFamilyMembers(ctx.user.id)),

    create: protectedProcedure.input(z.object({
      name: z.string().min(1),
      relationship: z.string().min(1),
      avatarUrl: z.string().nullable().optional(),
      clothingSizes: z.any().optional(),
      dietaryRestrictions: z.any().optional(),
      preferences: z.any().optional(),
      birthDate: z.string().nullable().optional(),
    })).mutation(({ ctx, input }) => db.createFamilyMember({ ...input, userId: ctx.user.id })),

    update: protectedProcedure.input(z.object({
      id: z.number(),
      name: z.string().min(1).optional(),
      relationship: z.string().min(1).optional(),
      avatarUrl: z.string().nullable().optional(),
      clothingSizes: z.any().optional(),
      dietaryRestrictions: z.any().optional(),
      preferences: z.any().optional(),
      birthDate: z.string().nullable().optional(),
    })).mutation(({ ctx, input }) => {
      const { id, ...data } = input;
      return db.updateFamilyMember(id, ctx.user.id, data);
    }),

    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ ctx, input }) =>
      db.deleteFamilyMember(input.id, ctx.user.id)
    ),
  }),

  // ─── Shopping Lists ────────────────────────────────────────────────
  shoppingLists: router({
    list: protectedProcedure.query(({ ctx }) => db.getShoppingLists(ctx.user.id)),

    getById: protectedProcedure.input(z.object({ id: z.number() })).query(({ ctx, input }) =>
      db.getShoppingListById(input.id, ctx.user.id)
    ),

    create: protectedProcedure.input(z.object({
      name: z.string().min(1),
      description: z.string().nullable().optional(),
      category: z.string().nullable().optional(),
      isRecurring: z.boolean().optional(),
      recurringSchedule: z.string().nullable().optional(),
    })).mutation(({ ctx, input }) => db.createShoppingList({ ...input, userId: ctx.user.id })),

    update: protectedProcedure.input(z.object({
      id: z.number(),
      name: z.string().min(1).optional(),
      description: z.string().nullable().optional(),
      category: z.string().nullable().optional(),
      status: z.enum(["active", "completed", "archived"]).optional(),
      isRecurring: z.boolean().optional(),
      recurringSchedule: z.string().nullable().optional(),
    })).mutation(({ ctx, input }) => {
      const { id, ...data } = input;
      return db.updateShoppingList(id, ctx.user.id, data);
    }),

    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ ctx, input }) =>
      db.deleteShoppingList(input.id, ctx.user.id)
    ),
  }),

  // ─── Shopping List Items ───────────────────────────────────────────
  shoppingItems: router({
    list: protectedProcedure.input(z.object({ listId: z.number() })).query(({ input }) =>
      db.getShoppingListItems(input.listId)
    ),

    create: protectedProcedure.input(z.object({
      listId: z.number(),
      name: z.string().min(1),
      quantity: z.number().optional(),
      unit: z.string().nullable().optional(),
      category: z.string().nullable().optional(),
      notes: z.string().nullable().optional(),
      estimatedPrice: z.string().nullable().optional(),
      currency: z.string().optional(),
      preferredStore: z.string().nullable().optional(),
      productUrl: z.string().nullable().optional(),
      forFamilyMemberId: z.number().nullable().optional(),
    })).mutation(({ input }) => db.createShoppingListItem(input)),

    update: protectedProcedure.input(z.object({
      id: z.number(),
      name: z.string().min(1).optional(),
      quantity: z.number().optional(),
      unit: z.string().nullable().optional(),
      category: z.string().nullable().optional(),
      notes: z.string().nullable().optional(),
      estimatedPrice: z.string().nullable().optional(),
      currency: z.string().optional(),
      preferredStore: z.string().nullable().optional(),
      productUrl: z.string().nullable().optional(),
      status: z.enum(["pending", "purchased", "skipped"]).optional(),
      forFamilyMemberId: z.number().nullable().optional(),
    })).mutation(({ input }) => {
      const { id, ...data } = input;
      return db.updateShoppingListItem(id, data);
    }),

    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) =>
      db.deleteShoppingListItem(input.id)
    ),

    moveToList: protectedProcedure.input(z.object({
      itemIds: z.array(z.number()).min(1),
      targetListId: z.number(),
    })).mutation(async ({ ctx, input }) => {
      // Verify the target list belongs to the user
      const targetList = await db.getShoppingListById(input.targetListId, ctx.user.id);
      if (!targetList) throw new Error("Target list not found or access denied");
      return db.moveItemsToList(input.itemIds, input.targetListId);
    }),
  }),

  // ─── Bank Accounts ─────────────────────────────────────────────────
  bankAccounts: router({
    list: protectedProcedure.query(({ ctx }) => db.getBankAccountsByHousehold(ctx.user.householdId)),

    create: protectedProcedure.input(z.object({
      institution: z.string().min(1),
      accountName: z.string().min(1),
      accountType: z.enum(["checking", "savings", "credit_card", "business_checking", "business_savings", "business_credit"]),
      category: z.enum(["personal", "business"]),
      currency: z.string().default("USD"),
      lastFourDigits: z.string().max(4).nullable().optional(),
      currentBalance: z.string().nullable().optional(),
    })).mutation(({ ctx, input }) => db.createBankAccount({ ...input, userId: ctx.user.id, householdId: ctx.user.householdId })),

    update: protectedProcedure.input(z.object({
      id: z.number(),
      institution: z.string().min(1).optional(),
      accountName: z.string().min(1).optional(),
      accountType: z.enum(["checking", "savings", "credit_card", "business_checking", "business_savings", "business_credit"]).optional(),
      category: z.enum(["personal", "business"]).optional(),
      currency: z.string().optional(),
      lastFourDigits: z.string().max(4).nullable().optional(),
      currentBalance: z.string().nullable().optional(),
      isActive: z.boolean().optional(),
    })).mutation(({ ctx, input }) => {
      const { id, ...data } = input;
      return db.updateBankAccount(id, ctx.user.householdId, data);
    }),

    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ ctx, input }) =>
      db.deleteBankAccount(input.id, ctx.user.householdId)
    ),
  }),

  // ─── Transactions / Expenses ───────────────────────────────────────
  transactions: router({
    list: protectedProcedure.input(z.object({
      classification: z.enum(["personal", "business"]).optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      limit: z.number().optional(),
    }).optional()).query(async ({ ctx, input }) => {
      // P-39: Financial data access guard
      // Transactions are personal to the user (userId-scoped) so non-admin
      // members only see their own. However, the Finance nav item and the
      // Expenses page should only be accessible to admins, EAs, and members
      // who have been assigned to at least one vertical that grants finance access.
      // Here we return an empty array for members with no vertical assignments
      // so the page shows an empty state rather than leaking household data.
      const member = await db.getHouseholdMemberByUserId(ctx.user.id);
      if (member && member.role !== "household_admin" && member.role !== "ea") {
        // Check if member has any vertical assignments
        if (member.householdId && member.userId) {
          const assignedVerticals = await db.getOwnedVerticalIds(member.householdId, member.userId);
          if (assignedVerticals.size === 0) {
            // No vertical assignments — return empty (no financial data visible)
            return [];
          }
        }
      }
      const filters = input ? {
        classification: input.classification,
        startDate: input.startDate ? new Date(input.startDate) : undefined,
        endDate: input.endDate ? new Date(input.endDate) : undefined,
        limit: input.limit,
      } : undefined;
      return db.getTransactions(ctx.user.id, filters);
    }),

    create: protectedProcedure.input(z.object({
      bankAccountId: z.number().nullable().optional(),
      description: z.string().min(1),
      amount: z.string(),
      currency: z.string().default("USD"),
      exchangeRate: z.string().nullable().optional(),
      type: z.enum(["expense", "income", "transfer"]).default("expense"),
      expenseCategory: z.string().nullable().optional(),
      classification: z.enum(["personal", "business"]).default("personal"),
      vendor: z.string().nullable().optional(),
      platform: z.string().nullable().optional(),
      notes: z.string().nullable().optional(),
      isTaxDeductible: z.boolean().optional(),
      taxCategory: z.string().nullable().optional(),
      transactionDate: z.string(),
    })).mutation(({ ctx, input }) => db.createTransaction({
      ...input,
      userId: ctx.user.id,
      transactionDate: new Date(input.transactionDate),
    })),

    update: protectedProcedure.input(z.object({
      id: z.number(),
      description: z.string().min(1).optional(),
      amount: z.string().optional(),
      currency: z.string().optional(),
      type: z.enum(["expense", "income", "transfer"]).optional(),
      expenseCategory: z.string().nullable().optional(),
      classification: z.enum(["personal", "business"]).optional(),
      isManualOverride: z.boolean().optional(),
      vendor: z.string().nullable().optional(),
      platform: z.string().nullable().optional(),
      notes: z.string().nullable().optional(),
      isTaxDeductible: z.boolean().optional(),
      taxCategory: z.string().nullable().optional(),
      receiptUrl: z.string().nullable().optional(),
    })).mutation(({ ctx, input }) => {
      const { id, ...data } = input;
      return db.updateTransaction(id, ctx.user.id, data);
    }),

    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ ctx, input }) =>
      db.deleteTransaction(input.id, ctx.user.id)
    ),

    summary: protectedProcedure.query(({ ctx }) => db.getExpenseSummary(ctx.user.id)),

    byCategory: protectedProcedure.query(({ ctx }) => db.getSpendingByCategory(ctx.user.id)),

    monthlyTrend: protectedProcedure
      .input(z.object({ months: z.number().min(1).max(24).default(6) }).optional())
      .query(({ ctx, input }) => db.getMonthlySpendingTrend(ctx.user.id, input?.months ?? 6)),

    topMerchants: protectedProcedure
      .input(z.object({ limit: z.number().min(1).max(20).default(5) }).optional())
      .query(({ ctx, input }) => db.getTopMerchants(ctx.user.id, input?.limit ?? 5)),
  }),

  // ─── Orders ────────────────────────────────────────────────────────
  orders: router({
    list: protectedProcedure.input(z.object({ limit: z.number().optional() }).optional()).query(({ ctx, input }) =>
      db.getOrders(ctx.user.id, input?.limit)
    ),

    create: protectedProcedure.input(z.object({
      platform: z.string().min(1),
      orderNumber: z.string().nullable().optional(),
      vendor: z.string().nullable().optional(),
      totalAmount: z.string().nullable().optional(),
      currency: z.string().optional(),
      status: z.enum(["pending", "shipped", "delivered", "cancelled", "returned"]).optional(),
      trackingNumber: z.string().nullable().optional(),
      items: z.any().optional(),
      importSource: z.enum(["email", "manual", "whatsapp"]).optional(),
      orderDate: z.string(),
    })).mutation(({ ctx, input }) => db.createOrder({
      ...input,
      userId: ctx.user.id,
      orderDate: new Date(input.orderDate),
    })),

    update: protectedProcedure.input(z.object({
      id: z.number(),
      status: z.enum(["pending", "shipped", "delivered", "cancelled", "returned"]).optional(),
      trackingNumber: z.string().nullable().optional(),
    })).mutation(({ ctx, input }) => {
      const { id, ...data } = input;
      return db.updateOrder(id, ctx.user.id, data);
    }),

    bulkImport: protectedProcedure.input(z.object({
      orders: z.array(z.object({
        platform: z.string(),
        orderNumber: z.string().nullable().optional(),
        vendor: z.string().nullable().optional(),
        totalAmount: z.string().nullable().optional(),
        currency: z.string().optional(),
        status: z.enum(["pending", "shipped", "delivered", "cancelled", "returned"]).optional(),
        items: z.any(),
        importSource: z.enum(["email", "manual", "whatsapp"]).optional(),
        orderDate: z.string(),
      })),
    })).mutation(async ({ ctx, input }) => {
      const ordersData = input.orders.map(o => ({
        userId: ctx.user.id,
        platform: o.platform,
        orderNumber: o.orderNumber || null,
        vendor: o.vendor || null,
        totalAmount: o.totalAmount || null,
        currency: o.currency || "USD",
        status: o.status || ("delivered" as const),
        items: o.items || [],
        importSource: o.importSource || ("email" as const),
        orderDate: new Date(o.orderDate),
      }));
      return db.bulkCreateOrders(ordersData);
    }),
  }),

  // ─── Exchange Rates ────────────────────────────────────────────────
  exchangeRates: router({
    get: protectedProcedure.input(z.object({
      from: z.string().default("USD"),
      to: z.string().default("JMD"),
    })).query(({ input }) => db.getLatestExchangeRate(input.from, input.to)),
  }),

  // ─── WhatsApp Import (Smart Parser + Order Matching) ──────────────
  whatsapp: router({
    list: protectedProcedure.query(({ ctx }) => db.getWhatsappImports(ctx.user.id)),

    parse: protectedProcedure.input(z.object({
      contactName: z.string().optional(),
      rawMessage: z.string().min(1),
      targetListId: z.number().optional(),
    })).mutation(async ({ ctx, input }) => {
      // Get family context for size/preference awareness
      const familyMembers = await db.getFamilyMembers(ctx.user.id);
      const familyContext = familyMembers.map(f => ({
        name: f.name,
        relationship: f.relationship,
        sizes: f.clothingSizes,
        dietary: f.dietaryRestrictions,
        preferences: f.preferences,
      }));

      // Step 1: Deep AI parsing with brand extraction and search keyword generation
      const parseResponse = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `You are Geeve's, an expert shopping list parser. Extract every shopping item from WhatsApp messages with maximum detail.

Rules:
- Extract brand names when mentioned (e.g., "Tide detergent" -> brand: "Tide", name: "Laundry Detergent")
- Infer brands from context when possible
- Parse quantities precisely (e.g., "2 lbs chicken" -> quantity: 2, unit: "lbs")
- For clothing, extract size info if mentioned (e.g., "size 6 shoes for Marcus")
- Understand casual language, abbreviations, slang, and Jamaican patois/Creole
- Generate search keywords that would find this exact product on Amazon or Walmart
- For each item, generate 2-3 search_keywords that are specific product search terms
- If a family member is mentioned by name or relationship, map them to the family context

Family context for reference:
${JSON.stringify(familyContext)}

Return structured JSON with detailed item data.`,
          },
          { role: "user", content: input.rawMessage },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "parsed_shopping_items",
            strict: true,
            schema: {
              type: "object",
              properties: {
                items: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string", description: "Clean product name" },
                      brand: { type: ["string", "null"], description: "Brand name if identifiable" },
                      quantity: { type: "number" },
                      unit: { type: ["string", "null"] },
                      size: { type: ["string", "null"], description: "Size for clothing/shoes or product size" },
                      category: { type: "string", description: "One of: groceries, clothing, household, electronics, personal_care, baby, pets, office, other" },
                      for_person: { type: ["string", "null"], description: "Family member name if item is for someone specific" },
                      urgency: { type: "string", description: "One of: now, soon, whenever" },
                      notes: { type: ["string", "null"] },
                      search_keywords: {
                        type: "array",
                        items: { type: "string" },
                        description: "2-3 specific search terms to find this product on Amazon/Walmart",
                      },
                    },
                    required: ["name", "brand", "quantity", "unit", "size", "category", "for_person", "urgency", "notes", "search_keywords"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["items"],
              additionalProperties: false,
            },
          },
        },
      });

      const parseContent = parseResponse.choices[0]?.message?.content;
      const parsed = typeof parseContent === "string" ? JSON.parse(parseContent) : { items: [] };

      // Step 2: Search order history for matches using extracted keywords
      const allKeywords: string[] = parsed.items.flatMap((item: any) => [
        item.name,
        ...(item.search_keywords || []),
        item.brand ? `${item.brand} ${item.name}` : null,
      ].filter(Boolean));

      const orderMatches = await db.searchOrderItems(ctx.user.id, allKeywords);

      // Step 3: Map matches back to each parsed item
      const itemsWithMatches = parsed.items.map((item: any) => {
        const itemKeywords = [
          item.name.toLowerCase(),
          ...(item.search_keywords || []).map((k: string) => k.toLowerCase()),
          item.brand ? `${item.brand} ${item.name}`.toLowerCase() : null,
        ].filter(Boolean) as string[];

        const matches = orderMatches.filter(m =>
          itemKeywords.some(kw =>
            m.matchedKeyword.toLowerCase() === kw ||
            m.item.name.toLowerCase().includes(kw) ||
            kw.includes(m.matchedKeyword.toLowerCase())
          )
        ).slice(0, 5); // Top 5 matches per item

        return {
          ...item,
          pastPurchases: matches.map(m => ({
            platform: m.platform,
            productName: m.item.name,
            price: m.item.price,
            vendor: m.vendor,
            orderDate: m.orderDate,
            matchScore: m.matchScore,
          })),
        };
      });

      // Save the import with enriched data
      const importResult = await db.createWhatsappImport({
        userId: ctx.user.id,
        contactName: input.contactName || null,
        rawMessage: input.rawMessage,
        parsedItems: itemsWithMatches,
        shoppingListId: input.targetListId || null,
      });

      // If a target list was specified, add items with enriched data
      if (input.targetListId) {
        for (const item of itemsWithMatches) {
          const bestMatch = item.pastPurchases?.[0];
          await db.createShoppingListItem({
            listId: input.targetListId,
            name: item.brand ? `${item.brand} ${item.name}` : item.name,
            quantity: item.quantity,
            unit: item.unit,
            category: item.category,
            notes: [
              item.notes,
              item.size ? `Size: ${item.size}` : null,
              item.for_person ? `For: ${item.for_person}` : null,
            ].filter(Boolean).join(" | ") || null,
            preferredStore: bestMatch?.platform || null,
            estimatedPrice: bestMatch?.price || null,
          });
        }
      }

      return { id: importResult.id, items: itemsWithMatches };
    }),
  }),

  // ─── Order Preparation (Convert List → Cart) ─────────────────────
  orderPrep: router({
    prepare: protectedProcedure.input(z.object({
      listId: z.number(),
    })).mutation(async ({ ctx, input }) => {
      // 1. Get the list and its items
      const list = await db.getShoppingListById(input.listId, ctx.user.id);
      if (!list) throw new Error("Shopping list not found");
      const items = await db.getShoppingListItems(input.listId);
      const pendingItems = items.filter((i: any) => i.status === "pending");
      if (pendingItems.length === 0) throw new Error("No pending items to order");

      // 2. Search order history for each item to find best product matches
      const allKeywords: string[] = pendingItems.flatMap((item: any) => {
        const words = [item.name];
        // Extract brand from name if it looks like "Brand Product"
        const nameParts = item.name.split(" ");
        if (nameParts.length >= 2) words.push(nameParts[0]); // brand guess
        if (item.notes) words.push(item.notes);
        return words;
      });

      const orderMatches = await db.searchOrderItems(ctx.user.id, allKeywords);

      // 3. Build store-grouped items with product matches and cart URLs
      type PreparedItem = {
        id: number;
        name: string;
        quantity: number;
        unit: string | null;
        category: string | null;
        notes: string | null;
        estimatedPrice: string | null;
        preferredStore: string | null;
        bestMatch: {
          productName: string;
          platform: string;
          price: string;
          lastOrderDate: string;
          matchScore: number;
        } | null;
        walmartSearchUrl: string;
        amazonSearchUrl: string;
      };

      const preparedItems: PreparedItem[] = pendingItems.map((item: any) => {
        // Find best match from order history
        const itemNameLower = item.name.toLowerCase();
        const itemMatches = orderMatches.filter(m => {
          const mNameLower = m.item.name.toLowerCase();
          return mNameLower.includes(itemNameLower) ||
            itemNameLower.includes(mNameLower.split(" ").slice(0, 3).join(" ")) ||
            itemNameLower.split(" ").some((w: string) => w.length > 3 && mNameLower.includes(w));
        }).sort((a, b) => b.matchScore - a.matchScore);

        const bestMatch = itemMatches[0] || null;
        const searchTerm = encodeURIComponent(item.name);

        return {
          id: item.id,
          name: item.name,
          quantity: item.quantity || 1,
          unit: item.unit,
          category: item.category,
          notes: item.notes,
          estimatedPrice: item.estimatedPrice || bestMatch?.item.price || null,
          preferredStore: item.preferredStore || bestMatch?.platform || null,
          bestMatch: bestMatch ? {
            productName: bestMatch.item.name,
            platform: bestMatch.platform,
            price: bestMatch.item.price,
            lastOrderDate: bestMatch.orderDate.toISOString(),
            matchScore: bestMatch.matchScore,
          } : null,
          walmartSearchUrl: `https://www.walmart.com/search?q=${searchTerm}`,
          amazonSearchUrl: `https://www.amazon.com/s?k=${searchTerm}`,
        };
      });

      // 4. Group by store
      const walmartItems = preparedItems.filter(i => i.preferredStore === "Walmart" || (!i.preferredStore && !i.bestMatch));
      const amazonItems = preparedItems.filter(i => i.preferredStore === "Amazon");
      const otherItems = preparedItems.filter(i => i.preferredStore && i.preferredStore !== "Walmart" && i.preferredStore !== "Amazon");

      // 5. Generate aggregate search URLs (Walmart multi-item search)
      const walmartCartUrl = walmartItems.length > 0
        ? `https://www.walmart.com/search?q=${encodeURIComponent(walmartItems.map(i => i.name).join(", "))}`
        : null;
      const amazonCartUrl = amazonItems.length > 0
        ? `https://www.amazon.com/s?k=${encodeURIComponent(amazonItems.map(i => i.name).join(", "))}`
        : null;

      // 6. Calculate estimated total
      const estimatedTotal = preparedItems.reduce((sum, item) => {
        const price = parseFloat(item.estimatedPrice || "0");
        return sum + (price * item.quantity);
      }, 0).toFixed(2);

      return {
        listId: input.listId,
        listName: list.name,
        totalItems: preparedItems.length,
        estimatedTotal,
        stores: {
          walmart: { items: walmartItems, cartUrl: walmartCartUrl, count: walmartItems.length },
          amazon: { items: amazonItems, cartUrl: amazonCartUrl, count: amazonItems.length },
          other: { items: otherItems, count: otherItems.length },
        },
        allItems: preparedItems,
      };
    }),

    markPurchased: protectedProcedure.input(z.object({
      itemIds: z.array(z.number()).min(1),
      platform: z.string(),
      orderNumber: z.string().optional(),
      totalAmount: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      // Mark items as purchased
      for (const itemId of input.itemIds) {
        await db.updateShoppingListItem(itemId, {
          status: "purchased" as any,
          purchasedAt: new Date(),
        });
      }

      // Get item details for order record
      const itemDetails: Array<{ name: string; quantity: number; price: string }> = [];
      for (const itemId of input.itemIds) {
        // We'll use a simple approach - get all items from any list
        // The items are already validated by the frontend
      }

      // Create an order record
      const order = await db.createOrder({
        userId: ctx.user.id,
        platform: input.platform,
        orderNumber: input.orderNumber || null,
        vendor: input.platform === "Walmart" ? "Walmart.com" : input.platform === "Amazon" ? "Amazon.com" : input.platform,
        totalAmount: input.totalAmount || null,
        currency: "USD",
        status: "pending",
        items: [],
        importSource: "manual",
        orderDate: new Date(),
      });

      return { orderId: order.id, markedCount: input.itemIds.length };
    }),
  }),

  // ─── AI Features ───────────────────────────────────────────────────
  ai: router({
    recommend: protectedProcedure.input(z.object({
      context: z.string(),
      familyMemberIds: z.array(z.number()).optional(),
    })).mutation(async ({ ctx, input }) => {
      const recentOrders = await db.getOrders(ctx.user.id, 20);
      const familyMembers = await db.getFamilyMembers(ctx.user.id);

      const orderHistory = recentOrders.map(o => ({
        platform: o.platform,
        vendor: o.vendor,
        items: o.items,
        date: o.orderDate,
        amount: o.totalAmount,
      }));

      const familyContext = familyMembers.map(f => ({
        name: f.name,
        relationship: f.relationship,
        sizes: f.clothingSizes,
        dietary: f.dietaryRestrictions,
        preferences: f.preferences,
      }));

      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `You are Geeve's, a smart shopping assistant. Based on the user's purchase history and family profiles, provide personalized shopping recommendations. Consider seasonal needs, family member sizes, dietary restrictions, and purchasing patterns. Format your response as helpful, actionable recommendations in markdown.`,
          },
          {
            role: "user",
            content: `Context: ${input.context}\n\nRecent order history: ${JSON.stringify(orderHistory)}\n\nFamily members: ${JSON.stringify(familyContext)}`,
          },
        ],
      });

      return { recommendation: response.choices[0]?.message?.content || "No recommendations available." };
    }),

    categorizeExpense: protectedProcedure.input(z.object({
      description: z.string(),
      vendor: z.string().optional(),
      amount: z.string(),
    })).mutation(async ({ input }) => {
      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `You categorize expenses as personal or business, and assign an expense category. Return JSON with fields: classification ("personal" or "business"), expenseCategory (string like "groceries", "office_supplies", "clothing", "utilities", "travel", "meals", "software", "equipment", etc.), isTaxDeductible (boolean), taxCategory (string or null), confidence (number 0-100).`,
          },
          {
            role: "user",
            content: `Description: ${input.description}\nVendor: ${input.vendor || "Unknown"}\nAmount: ${input.amount}`,
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "expense_categorization",
            strict: true,
            schema: {
              type: "object",
              properties: {
                classification: { type: "string", enum: ["personal", "business"] },
                expenseCategory: { type: "string" },
                isTaxDeductible: { type: "boolean" },
                taxCategory: { type: ["string", "null"] },
                confidence: { type: "number" },
              },
              required: ["classification", "expenseCategory", "isTaxDeductible", "taxCategory", "confidence"],
              additionalProperties: false,
            },
          },
        },
      });

      const content = response.choices[0]?.message?.content;
      return typeof content === "string" ? JSON.parse(content) : { classification: "personal", expenseCategory: "other", isTaxDeductible: false, taxCategory: null, confidence: 0 };
    }),

    parseEmailOrder: protectedProcedure.input(z.object({
      emailContent: z.string().min(1),
    })).mutation(async ({ ctx, input }) => {
      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `You parse order confirmation emails and extract order details.

For Walmart emails: the total is usually labelled "Estimated total", "Order total", "Total", or "Subtotal" — use the LARGEST total figure that represents the full charge (including tax). Walmart often shows amounts like "$47.83" — strip the dollar sign and return only the numeric value (e.g. "47.83").

For Amazon emails: look for "Order Total", "Grand Total", or "Charged to" amounts.

Return JSON with:
- platform (string - e.g. "Amazon", "Walmart", "Target")
- orderNumber (string or null)
- vendor (string)
- totalAmount (string - NUMERIC ONLY, no currency symbols, e.g. "47.83" not "$47.83")
- currency (string - "USD" or "JMD")
- items (array of {name: string, quantity: number, price: string})
- orderDate (ISO date string)
- trackingNumber (string or null)`,
          },
          { role: "user", content: input.emailContent },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "parsed_order",
            strict: true,
            schema: {
              type: "object",
              properties: {
                platform: { type: "string" },
                orderNumber: { type: ["string", "null"] },
                vendor: { type: "string" },
                totalAmount: { type: "string" },
                currency: { type: "string" },
                items: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      quantity: { type: "number" },
                      price: { type: "string" },
                    },
                    required: ["name", "quantity", "price"],
                    additionalProperties: false,
                  },
                },
                orderDate: { type: "string" },
                trackingNumber: { type: ["string", "null"] },
              },
              required: ["platform", "orderNumber", "vendor", "totalAmount", "currency", "items", "orderDate", "trackingNumber"],
              additionalProperties: false,
            },
          },
        },
      });

      const content = response.choices[0]?.message?.content;
      const parsed = typeof content === "string" ? JSON.parse(content) : null;

      // Post-process: strip any currency symbols the LLM may have included in totalAmount
      // e.g. "$47.83" → "47.83", "USD 47.83" → "47.83", "47.83 USD" → "47.83"
      if (parsed?.totalAmount && typeof parsed.totalAmount === "string") {
        const cleaned = parsed.totalAmount.replace(/[^0-9.]/g, "").trim();
        if (cleaned && !isNaN(parseFloat(cleaned))) {
          parsed.totalAmount = cleaned;
        }
      }

      if (parsed) {
        const order = await db.createOrder({
          userId: ctx.user.id,
          platform: parsed.platform,
          orderNumber: parsed.orderNumber,
          vendor: parsed.vendor,
          totalAmount: parsed.totalAmount,
          currency: parsed.currency,
          items: parsed.items,
          importSource: "email",
          orderDate: new Date(parsed.orderDate),
          trackingNumber: parsed.trackingNumber,
        });
        return { ...parsed, id: order.id };
      }

      return parsed;
    }),
  }),

  // ─── Receipt Upload ────────────────────────────────────────────────
  receipts: router({
    upload: protectedProcedure.input(z.object({
      transactionId: z.number(),
      fileBase64: z.string(),
      fileName: z.string(),
      mimeType: z.string(),
    })).mutation(async ({ ctx, input }) => {
      const buffer = Buffer.from(input.fileBase64, "base64");
      const fileKey = `receipts/${ctx.user.id}/${input.transactionId}-${nanoid(8)}-${input.fileName}`;
      const { url } = await storagePut(fileKey, buffer, input.mimeType);
      await db.updateTransaction(input.transactionId, ctx.user.id, { receiptUrl: url });
      return { url };
    }),
  }),

  // ─── Shopping Agent (Autonomous Shopping) ──────────────────────────
  shopAgent: router({
    // Create a new shopping session from a list
    createSession: protectedProcedure.input(z.object({
      listId: z.number(),
    })).mutation(async ({ ctx, input }) => {
      const list = await db.getShoppingListById(input.listId, ctx.user.id);
      if (!list) throw new Error("Shopping list not found");
      const items = await db.getShoppingListItems(input.listId);
      const pendingItems = items.filter((i: any) => i.status === "pending");
      if (pendingItems.length === 0) throw new Error("No pending items to shop");

      // Check if platform credentials exist
      const credentials = await db.getPlatformCredentials(ctx.user.id);
      const hasWalmart = credentials.some((c: any) => c.platform === "Walmart");
      const hasAmazon = credentials.some((c: any) => c.platform === "Amazon");
      const hasAnyCredentials = hasWalmart || hasAmazon;

      // Search order history for best platform assignment
      const allKeywords = pendingItems.flatMap((item: any) => {
        const words = [item.name];
        const parts = item.name.split(" ");
        if (parts.length >= 2) words.push(parts[0]);
        return words;
      });
      const orderMatches = await db.searchOrderItems(ctx.user.id, allKeywords);

      // Determine initial status based on credentials
      const initialStatus = hasAnyCredentials ? "ready" : "pending_credentials";

      // Create the session
      const session = await db.createShoppingSession({
        userId: ctx.user.id,
        listId: input.listId,
        listName: list.name,
        status: initialStatus,
        totalItems: pendingItems.length,
        notifications: [{
          type: "info",
          message: hasAnyCredentials
            ? "Session created. Geeves is ready to shop — tell Geeves to begin when you're ready."
            : "Session created. Please add your Walmart or Amazon login credentials before Geeves can shop.",
          timestamp: new Date().toISOString(),
        }],
      });

      // Create session items with platform assignment
      const sessionItems = pendingItems.map((item: any) => {
        const itemNameLower = item.name.toLowerCase();
        const itemMatches = orderMatches.filter(m => {
          const mNameLower = m.item.name.toLowerCase();
          return mNameLower.includes(itemNameLower) ||
            itemNameLower.includes(mNameLower.split(" ").slice(0, 3).join(" ")) ||
            itemNameLower.split(" ").some((w: string) => w.length > 3 && mNameLower.includes(w));
        }).sort((a, b) => b.matchScore - a.matchScore);

        const bestMatch = itemMatches[0];
        // Assign platform: use preferred store, or best match platform, or default to Walmart
        const assignedPlatform = item.preferredStore || bestMatch?.platform || "Walmart";

        return {
          sessionId: session.id,
          listItemId: item.id,
          name: item.name,
          quantity: item.quantity || 1,
          unit: item.unit,
          assignedPlatform,
          originalPlatform: assignedPlatform,
          status: "queued" as const,
          matchedProductName: bestMatch?.item.name || null,
          matchedPrice: bestMatch?.item.price || item.estimatedPrice || null,
          matchConfidence: bestMatch?.matchScore || null,
        };
      });

      await db.bulkCreateSessionItems(sessionItems);

      // Session stays in ready/pending_credentials — does NOT auto-advance to "shopping"

      return {
        sessionId: session.id,
        status: initialStatus,
        hasWalmart,
        hasAmazon,
      };
    }),

    // Get session with all items
    getSession: protectedProcedure.input(z.object({
      sessionId: z.number(),
    })).query(async ({ ctx, input }) => {
      const session = await db.getShoppingSession(input.sessionId, ctx.user.id);
      if (!session) throw new Error("Session not found");
      const items = await db.getSessionItems(input.sessionId);

      // Group items by platform
      const walmartItems = items.filter(i => i.assignedPlatform === "Walmart");
      const amazonItems = items.filter(i => i.assignedPlatform === "Amazon");

      // Calculate totals
      const walmartTotal = walmartItems.reduce((sum, i) => sum + parseFloat(String(i.matchedPrice || "0")) * (i.quantity || 1), 0);
      const amazonTotal = amazonItems.reduce((sum, i) => sum + parseFloat(String(i.matchedPrice || "0")) * (i.quantity || 1), 0);

      return {
        ...session,
        items,
        platforms: {
          walmart: { items: walmartItems, total: walmartTotal.toFixed(2), count: walmartItems.length },
          amazon: { items: amazonItems, total: amazonTotal.toFixed(2), count: amazonItems.length },
        },
        overallTotal: (walmartTotal + amazonTotal).toFixed(2),
      };
    }),

    // List all sessions
    listSessions: protectedProcedure.query(({ ctx }) => db.getShoppingSessions(ctx.user.id)),

    // Update a single session item (for when Geeves finds/adds/substitutes items)
    updateItem: protectedProcedure.input(z.object({
      itemId: z.number(),
      status: z.enum(["queued", "searching", "found", "added_to_cart", "substituted", "unavailable", "transferred", "rejected"]).optional(),
      matchedProductName: z.string().nullable().optional(),
      matchedProductUrl: z.string().nullable().optional(),
      matchedPrice: z.string().nullable().optional(),
      matchConfidence: z.number().nullable().optional(),
      substitutionReason: z.string().nullable().optional(),
      originalProductName: z.string().nullable().optional(),
      transferReason: z.string().nullable().optional(),
      assignedPlatform: z.string().optional(),
      estimatedDelivery: z.string().nullable().optional(),
      fulfillmentMethod: z.string().nullable().optional(),
    })).mutation(async ({ input }) => {
      const { itemId, ...data } = input;
      await db.updateSessionItem(itemId, data as any);
      return { success: true };
    }),

    // Transfer unavailable items from one platform to another
    transferItems: protectedProcedure.input(z.object({
      itemIds: z.array(z.number()),
      fromPlatform: z.string(),
      toPlatform: z.string(),
      reason: z.string(),
    })).mutation(async ({ input }) => {
      await db.bulkUpdateSessionItems(input.itemIds, {
        assignedPlatform: input.toPlatform,
        status: "transferred" as any,
        transferReason: input.reason,
      });
      return { transferred: input.itemIds.length };
    }),

    // Update session status and totals
    updateSession: protectedProcedure.input(z.object({
      sessionId: z.number(),
      status: z.enum(["pending_credentials", "ready", "preparing", "shopping", "awaiting_review", "approved", "completed", "cancelled"]).optional(),
      walmartTotal: z.string().optional(),
      amazonTotal: z.string().optional(),
      overallTotal: z.string().optional(),
      deliveryInfo: z.any().optional(),
      itemsFound: z.number().optional(),
      itemsSubstituted: z.number().optional(),
      itemsUnavailable: z.number().optional(),
      itemsCrossTransferred: z.number().optional(),
    })).mutation(async ({ input }) => {
      const { sessionId, ...data } = input;
      await db.updateShoppingSession(sessionId, data as any);
      return { success: true };
    }),

    // Add a notification to the session log
    addNotification: protectedProcedure.input(z.object({
      sessionId: z.number(),
      type: z.enum(["info", "warning", "error", "success"]),
      message: z.string(),
    })).mutation(async ({ ctx, input }) => {
      const session = await db.getShoppingSession(input.sessionId, ctx.user.id);
      if (!session) throw new Error("Session not found");
      const notifications = (session.notifications as any[] || []);
      notifications.push({
        type: input.type,
        message: input.message,
        timestamp: new Date().toISOString(),
      });
      await db.updateShoppingSession(input.sessionId, { notifications });
      return { success: true };
    }),

    // Finalize session — mark as awaiting review with final report
    finalize: protectedProcedure.input(z.object({
      sessionId: z.number(),
      walmartTotal: z.string(),
      amazonTotal: z.string(),
      deliveryInfo: z.any(),
    })).mutation(async ({ ctx, input }) => {
      const session = await db.getShoppingSession(input.sessionId, ctx.user.id);
      if (!session) throw new Error("Session not found");
      const items = await db.getSessionItems(input.sessionId);

      const overallTotal = (parseFloat(input.walmartTotal) + parseFloat(input.amazonTotal)).toFixed(2);
      const itemsFound = items.filter(i => i.status === "added_to_cart" || i.status === "found").length;
      const itemsSubstituted = items.filter(i => i.status === "substituted").length;
      const itemsUnavailable = items.filter(i => i.status === "unavailable").length;
      const itemsCrossTransferred = items.filter(i => i.status === "transferred").length;

      await db.updateShoppingSession(input.sessionId, {
        status: "awaiting_review",
        walmartTotal: input.walmartTotal,
        amazonTotal: input.amazonTotal,
        overallTotal,
        deliveryInfo: input.deliveryInfo,
        itemsFound,
        itemsSubstituted,
        itemsUnavailable,
        itemsCrossTransferred,
      });

      return {
        sessionId: input.sessionId,
        status: "awaiting_review",
        walmartTotal: input.walmartTotal,
        amazonTotal: input.amazonTotal,
        overallTotal,
        itemsFound,
        itemsSubstituted,
        itemsUnavailable,
        itemsCrossTransferred,
        totalItems: items.length,
      };
    }),

    // Approve session — user confirms checkout
    approve: protectedProcedure.input(z.object({
      sessionId: z.number(),
    })).mutation(async ({ ctx, input }) => {
      const session = await db.getShoppingSession(input.sessionId, ctx.user.id);
      if (!session) throw new Error("Session not found");
      if (session.status !== "awaiting_review") throw new Error("Session is not awaiting review");  
      await db.updateShoppingSession(input.sessionId, { status: "approved" });
      return { success: true, message: "Session approved. Geeve's will proceed with checkout." };
    }),

    // Reject/cancel session — can cancel from any non-terminal state
    cancel: protectedProcedure.input(z.object({
      sessionId: z.number(),
    })).mutation(async ({ ctx, input }) => {
      const session = await db.getShoppingSession(input.sessionId, ctx.user.id);
      if (!session) throw new Error("Session not found");
      if (["completed", "cancelled"].includes(session.status)) {
        throw new Error("Session is already " + session.status);
      }
      await db.updateShoppingSession(input.sessionId, { status: "cancelled" });
      return { success: true };
    }),

    // Platform credentials management
    credentials: router({
      list: protectedProcedure.query(({ ctx }) => db.getPlatformCredentials(ctx.user.id)),

      get: protectedProcedure.input(z.object({
        platform: z.string(),
      })).query(({ ctx, input }) => db.getPlatformCredential(ctx.user.id, input.platform)),

      upsert: protectedProcedure.input(z.object({
        platform: z.string(),
        credentialData: z.any(),
      })).mutation(({ ctx, input }) => db.upsertPlatformCredential({
        userId: ctx.user.id,
        platform: input.platform,
        credentialData: input.credentialData,
      })),
    }),

    // ─── One-Click Add To Cart URL Generator ──────────────────────
    generateCartUrl: protectedProcedure.input(z.object({
      sessionId: z.number(),
      platform: z.enum(["walmart", "amazon"]).default("walmart"),
    })).mutation(async ({ ctx, input }) => {
      const session = await db.getShoppingSession(input.sessionId, ctx.user.id);
      if (!session) throw new Error("Session not found");
      const items = await db.getSessionItems(input.sessionId);
      const platformItems = items.filter(i =>
        i.assignedPlatform?.toLowerCase() === input.platform
      );
      if (platformItems.length === 0) throw new Error(`No ${input.platform} items in this session`);

      // Look up product mappings for all items
      const itemNames = platformItems.map(i => i.name);
      const mappings = await db.bulkFindProductMappings(ctx.user.id, itemNames, input.platform);

      // Also try individual fuzzy lookups for items not found in bulk
      const mappingsByNormalized = new Map(mappings.map(m => [m.normalizedName, m]));
      const resolvedItems: Array<{
        name: string;
        quantity: number;
        productId: string | null;
        productName: string | null;
        productUrl: string | null;
        lastPrice: string | null;
        matched: boolean;
      }> = [];

      for (const item of platformItems) {
        const normalized = item.name.toLowerCase().trim();
        let mapping = mappingsByNormalized.get(normalized);
        if (!mapping) {
          // Try fuzzy lookup
          mapping = await db.findProductMapping(ctx.user.id, item.name, input.platform) || undefined;
        }
        resolvedItems.push({
          name: item.name,
          quantity: item.quantity || 1,
          productId: mapping?.productId || null,
          productName: mapping?.productName || null,
          productUrl: mapping?.productUrl || null,
          lastPrice: mapping?.lastPrice?.toString() || null,
          matched: !!mapping,
        });
      }

      const matchedItems = resolvedItems.filter(i => i.matched);
      const unmatchedItems = resolvedItems.filter(i => !i.matched);

      // Generate the Add To Cart URL
      let cartUrl = "";
      if (input.platform === "walmart") {
        // Walmart format: walmart.com/sc/cart/addToCart?items=ID1_qty,ID2_qty,...
        const itemParams = matchedItems.map(i => {
          if ((i.quantity || 1) > 1) return `${i.productId}_${i.quantity}`;
          return i.productId;
        }).join(",");
        cartUrl = `https://www.walmart.com/sc/cart/addToCart?items=${itemParams}`;
      } else if (input.platform === "amazon") {
        // Amazon format: amazon.com/gp/aws/cart/add.html?ASIN.1=X&Quantity.1=Y&...
        const params = matchedItems.map((item, idx) => {
          const n = idx + 1;
          return `ASIN.${n}=${item.productId}&Quantity.${n}=${item.quantity || 1}`;
        }).join("&");
        cartUrl = `https://www.amazon.com/gp/aws/cart/add.html?${params}`;
      }

      // Estimate total from cached prices
      const estimatedTotal = matchedItems.reduce((sum, i) => {
        return sum + (parseFloat(i.lastPrice || "0") * (i.quantity || 1));
      }, 0);

      return {
        cartUrl,
        platform: input.platform,
        matchedCount: matchedItems.length,
        unmatchedCount: unmatchedItems.length,
        totalItems: resolvedItems.length,
        matchedItems: matchedItems.map(i => ({
          name: i.name,
          quantity: i.quantity,
          productName: i.productName,
          lastPrice: i.lastPrice,
        })),
        unmatchedItems: unmatchedItems.map(i => ({
          name: i.name,
          quantity: i.quantity,
        })),
        estimatedTotal: estimatedTotal.toFixed(2),
        message: unmatchedItems.length > 0
          ? `${matchedItems.length} of ${resolvedItems.length} items matched. ${unmatchedItems.length} items need manual search.`
          : `All ${matchedItems.length} items matched! Click the link to add them all to your ${input.platform} cart.`,
      };
    }),

    // ─── Product Mappings Management ──────────────────────────────
    mappings: router({
      list: protectedProcedure.input(z.object({
        platform: z.string().optional(),
      }).optional()).query(({ ctx, input }) =>
        db.getProductMappings(ctx.user.id, input?.platform)
      ),

      find: protectedProcedure.input(z.object({
        itemName: z.string(),
        platform: z.string(),
      })).query(({ ctx, input }) =>
        db.findProductMapping(ctx.user.id, input.itemName, input.platform)
      ),

      upsert: protectedProcedure.input(z.object({
        itemName: z.string(),
        platform: z.string(),
        productId: z.string(),
        productName: z.string(),
        productUrl: z.string().optional(),
        lastPrice: z.string().optional(),
        confidence: z.number().optional(),
        isVerified: z.boolean().optional(),
      })).mutation(({ ctx, input }) =>
        db.upsertProductMapping({ ...input, userId: ctx.user.id })
      ),

      delete: protectedProcedure.input(z.object({
        id: z.number(),
      })).mutation(({ ctx, input }) =>
        db.deleteProductMapping(input.id, ctx.user.id)
      ),

      stats: protectedProcedure.query(async ({ ctx }) => {
        const allMappings = await db.getProductMappings(ctx.user.id);
        const walmart = allMappings.filter(m => m.platform === "walmart");
        const amazon = allMappings.filter(m => m.platform === "amazon");
        const verified = allMappings.filter(m => m.isVerified);
        return {
          total: allMappings.length,
          walmart: walmart.length,
          amazon: amazon.length,
          verified: verified.length,
          topItems: allMappings.slice(0, 10).map(m => ({
            name: m.itemName,
            platform: m.platform,
            productName: m.productName,
            useCount: m.useCount,
            lastPrice: m.lastPrice,
          })),
        };
      }),
    }),

    // ─── Auto-Learn from URLs ─────────────────────────────────────
    learnFromUrls: protectedProcedure.input(z.object({
      items: z.array(z.object({
        itemName: z.string(),
        productUrl: z.string(),
        productName: z.string().optional(),
        price: z.string().optional(),
      })),
    })).mutation(async ({ ctx, input }) => {
      const results: Array<{
        itemName: string;
        platform: string;
        productId: string;
        productName: string;
        status: "learned" | "failed";
        reason?: string;
      }> = [];

      for (const item of input.items) {
        try {
          const parsed = parseProductUrl(item.productUrl);
          if (!parsed) {
            results.push({
              itemName: item.itemName,
              platform: "unknown",
              productId: "",
              productName: item.productName || item.itemName,
              status: "failed",
              reason: "Could not parse product ID from URL",
            });
            continue;
          }

          await db.upsertProductMapping({
            userId: ctx.user.id,
            itemName: item.itemName,
            platform: parsed.platform,
            productId: parsed.productId,
            productName: item.productName || parsed.productName || item.itemName,
            productUrl: item.productUrl,
            lastPrice: item.price,
            confidence: 100,
            isVerified: true,
          });

          results.push({
            itemName: item.itemName,
            platform: parsed.platform,
            productId: parsed.productId,
            productName: item.productName || parsed.productName || item.itemName,
            status: "learned",
          });
        } catch (e) {
          results.push({
            itemName: item.itemName,
            platform: "unknown",
            productId: "",
            productName: item.productName || item.itemName,
            status: "failed",
            reason: e instanceof Error ? e.message : "Unknown error",
          });
        }
      }

      const learned = results.filter(r => r.status === "learned").length;
      const failed = results.filter(r => r.status === "failed").length;

      return {
        results,
        summary: {
          total: input.items.length,
          learned,
          failed,
          message: failed === 0
            ? `Successfully learned ${learned} product mappings!`
            : `Learned ${learned} of ${input.items.length} products. ${failed} could not be parsed.`,
        },
      };
    }),

    // ─── Auto-Learn from Session (post-checkout) ─────────────────
    learnFromSession: protectedProcedure.input(z.object({
      sessionId: z.number(),
    })).mutation(async ({ ctx, input }) => {
      const session = await db.getShoppingSession(input.sessionId, ctx.user.id);
      if (!session) throw new Error("Session not found");

      const items = await db.getSessionItems(input.sessionId);
      const learnableItems = items.filter(i =>
        i.matchedProductName && i.assignedPlatform &&
        (i.status === "added_to_cart" || i.status === "found" || i.status === "substituted")
      );

      let learned = 0;
      let skipped = 0;
      const newMappings: Array<{ itemName: string; productName: string; platform: string }> = [];

      for (const item of learnableItems) {
        // Try to extract product ID from the matched product URL or name
        let productId: string | null = null;
        let platform = (item.assignedPlatform || "walmart").toLowerCase();

        // If item has a product URL, parse the ID from it
        if (item.matchedProductUrl) {
          const parsed = parseProductUrl(item.matchedProductUrl);
          if (parsed) {
            productId = parsed.productId;
            platform = parsed.platform;
          }
        }

        // If we still don't have a product ID, try to extract from matchedProductName
        // Some session items may have been updated with product IDs directly
        if (!productId && item.matchedProductName) {
          // Check if there's already a mapping for this item
          const existing = await db.findProductMapping(ctx.user.id, item.name, platform);
          if (existing) {
            skipped++;
            continue;
          }
        }

        if (!productId) {
          skipped++;
          continue;
        }

        await db.upsertProductMapping({
          userId: ctx.user.id,
          itemName: item.name,
          platform,
          productId,
          productName: item.matchedProductName || item.name,
          productUrl: item.matchedProductUrl || undefined,
          lastPrice: item.matchedPrice?.toString() || undefined,
          confidence: item.status === "substituted" ? 70 : 100,
          isVerified: item.status !== "substituted",
        });

        learned++;
        newMappings.push({
          itemName: item.name,
          productName: item.matchedProductName || item.name,
          platform,
        });
      }

      return {
        sessionId: input.sessionId,
        totalItems: items.length,
        learnableItems: learnableItems.length,
        learned,
        skipped,
        newMappings,
        message: learned > 0
          ? `Learned ${learned} new product mappings from this session!`
          : "No new products to learn from this session.",
      };
    }),
  }),

  // ─── Geeves Chat ──────────────────────────────────────────────────
  geeves: geevesRouter,
  // ─── Receipt Upload (v2) ────────────────────────────────────────────
  receipts2: router({
    upload: protectedProcedure.input(z.object({
      transactionId: z.number(),
      fileBase64: z.string(),
      fileName: z.string(),
      mimeType: z.string(),
    })).mutation(async ({ ctx, input }) => {
      const buffer = Buffer.from(input.fileBase64, "base64");
      const fileKey = `receipts/${ctx.user.id}/${input.transactionId}-${nanoid(8)}-${input.fileName}`;
      const { url } = await storagePut(fileKey, buffer, input.mimeType);
      await db.updateTransaction(input.transactionId, ctx.user.id, { receiptUrl: url });
      return { url };
    }),
  }),

  // ─── Handwritten List Scanner ─────────────────────────────────────
  listScanner: router({
    // Upload image and parse handwritten shopping list using AI vision
    scan: protectedProcedure.input(z.object({
      imageBase64: z.string(),
      fileName: z.string(),
      mimeType: z.string(),
    })).mutation(async ({ ctx, input }) => {
      // 1. Upload image to S3
      const buffer = Buffer.from(input.imageBase64, "base64");
      const fileKey = `list-scans/${ctx.user.id}/${nanoid(12)}-${input.fileName}`;
      const { url: imageUrl } = await storagePut(fileKey, buffer, input.mimeType);

      // 2. Use LLM vision to read the handwritten list
      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `You are a shopping list reader. You receive an image of a handwritten shopping list. Extract every item from the list and return structured JSON. For each item, determine:
- name: the product name (be specific, include brand if visible)
- quantity: number (default 1 if not specified)
- unit: unit of measurement if specified (e.g., "lb", "oz", "pack", "gallon") or null
- category: one of "groceries", "household", "personal_care", "clothing", "electronics", "kids", "office", "other"
- notes: any additional context written next to the item, or null

Be thorough — capture every item even if handwriting is difficult to read. Make your best guess for unclear words based on common grocery/shopping items. If a quantity is written (like "x2" or "3" next to an item), capture it.`,
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Please read this handwritten shopping list and extract all items:" },
              { type: "image_url", image_url: { url: imageUrl, detail: "high" } },
            ],
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "scanned_shopping_list",
            strict: true,
            schema: {
              type: "object",
              properties: {
                items: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string", description: "Product name" },
                      quantity: { type: "number", description: "Quantity needed" },
                      unit: { type: ["string", "null"], description: "Unit of measurement" },
                      category: { type: "string", description: "Item category" },
                      notes: { type: ["string", "null"], description: "Additional notes" },
                    },
                    required: ["name", "quantity", "unit", "category", "notes"],
                    additionalProperties: false,
                  },
                },
                confidence: { type: "number", description: "Overall confidence in reading accuracy 0-100" },
                rawText: { type: "string", description: "Best attempt at raw transcription of the handwritten text" },
              },
              required: ["items", "confidence", "rawText"],
              additionalProperties: false,
            },
          },
        },
      });

      const content = response.choices[0]?.message?.content;
      const parsed = typeof content === "string" ? JSON.parse(content) : { items: [], confidence: 0, rawText: "" };

      return {
        imageUrl,
        items: parsed.items,
        confidence: parsed.confidence,
        rawText: parsed.rawText,
      };
    }),

    // Add scanned items to a shopping list
    addToList: protectedProcedure.input(z.object({
      listId: z.number(),
      items: z.array(z.object({
        name: z.string().min(1),
        quantity: z.number().default(1),
        unit: z.string().nullable().optional(),
        category: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
      })),
    })).mutation(async ({ ctx, input }) => {
      // Verify list belongs to user
      const list = await db.getShoppingListById(input.listId, ctx.user.id);
      if (!list) throw new Error("Shopping list not found or access denied");

      // Add each item to the list
      const created = [];
      for (const item of input.items) {
        const result = await db.createShoppingListItem({
          listId: input.listId,
          name: item.name,
          quantity: item.quantity,
          unit: item.unit || null,
          category: item.category || null,
          notes: item.notes || null,
        });
        created.push(result);
      }

      return { addedCount: created.length, listId: input.listId };
    }),
  }),
});

export type AppRouter = typeof appRouter;
import { onboardingRouter } from "./routers/onboarding";
import { platformConfigRouter } from "./routers/platformConfig";
