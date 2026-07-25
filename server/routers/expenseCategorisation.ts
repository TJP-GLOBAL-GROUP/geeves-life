import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import * as dbModule from "../db";

/**
 * Helper: resolve the user's householdId and verify they have admin or EA access.
 * Returns the householdId or throws FORBIDDEN.
 */
async function requireExpenseAccess(userId: number): Promise<string> {
  const member = await dbModule.getHouseholdMemberByUserId(userId);
  if (!member) {
    throw new TRPCError({ code: "FORBIDDEN", message: "You must be a household member to access expenses." });
  }
  if (member.role !== "household_admin" && member.role !== "ea") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Expense categorisation is restricted to household admins and executive assistants." });
  }
  return member.householdId;
}

export const expenseCategorisationRouter = router({
  /**
   * Get vendor orders for categorisation.
   * Now reads from vendor_orders + checks expenses table for categorization status.
   * Status is derived: if an expense row exists for this order → categorized/split, else pending.
   */
  getOrders: protectedProcedure
    .input(
      z.object({
        status: z.enum(["pending", "categorized", "split", "skipped", "all"]).default("all"),
        platform: z.enum(["all", "walmart", "amazon", "wayfair", "home_depot", "other"]).default("all"),
        hideDeadLinks: z.boolean().default(true),
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const householdId = await requireExpenseAccess(ctx.user.id);
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      const offset = (input.page - 1) * input.pageSize;
      const platformFilter = input.platform !== "all" ? sql`AND vo.platform_vo = ${input.platform}` : sql``;
      // Filter out Walmart orders with dead links (UUID-only legacyWalmartOrderId, no proper orderNumber)
      const deadLinkFilter = input.hideDeadLinks
        ? sql`AND NOT (vo.platform_vo = 'walmart' AND vo.orderNumber IS NULL AND vo.legacyWalmartOrderId IS NOT NULL)`
        : sql``;

      // Determine categorization status by checking expenses table
      let statusCondition = sql``;
      if (input.status === "pending") {
        statusCondition = sql`AND eFirst.firstExpId IS NULL AND (vo.notes IS NULL OR vo.notes NOT LIKE '%[skipped]%')`;
      } else if (input.status === "categorized") {
        statusCondition = sql`AND eFirst.firstExpId IS NOT NULL AND COALESCE(sg.splitCount, 0) = 1`;
      } else if (input.status === "split") {
        statusCondition = sql`AND eFirst.firstExpId IS NOT NULL AND COALESCE(sg.splitCount, 0) > 1`;
      } else if (input.status === "skipped") {
        statusCondition = sql`AND vo.notes LIKE '%[skipped]%'`;
      }

      const orders = await db.execute(sql`
        SELECT vo.id, vo.orderNumber, vo.platform_vo as platform, vo.status_vo as orderStatus,
               vo.totalAmount, vo.orderDate, vo.currency_vo as currency, vo.deliveryAddress,
               vo.paymentMethod, vo.paymentCardLast4, vo.importSource_vo as importSource,
               vo.notes, vo.legacyWalmartOrderId,
               va.vendorName,
               CASE
                 WHEN vo.platform_vo = 'walmart' AND vo.orderNumber IS NULL AND vo.legacyWalmartOrderId IS NOT NULL THEN 1
                 ELSE 0
               END as hasDeadLink,
               CASE
                 WHEN vo.notes LIKE '%[skipped]%' THEN 'skipped'
                 WHEN e.id IS NOT NULL AND COALESCE(sg.splitCount, 0) > 1 THEN 'split'
                 WHEN e.id IS NOT NULL THEN 'categorized'
                 ELSE 'pending'
               END as categorizationStatus,
               COALESCE(sg.splitCount, 0) as splitCount,
               (SELECT GROUP_CONCAT(voi.name SEPARATOR ', ')
                FROM vendor_order_items voi WHERE voi.vendorOrderId = vo.id) as itemSummary
        FROM vendor_orders vo
        LEFT JOIN vendor_accounts va ON va.id = vo.vendorAccountId
        LEFT JOIN (
          SELECT vendorOrderId_exp, MIN(id) as firstExpId
          FROM expenses
          WHERE householdId = ${householdId}
          GROUP BY vendorOrderId_exp
        ) eFirst ON eFirst.vendorOrderId_exp = vo.id
        LEFT JOIN expenses e ON e.id = eFirst.firstExpId
        LEFT JOIN (
          SELECT vendorOrderId_exp, COUNT(DISTINCT id) as splitCount
          FROM expenses
          WHERE householdId = ${householdId}
          GROUP BY vendorOrderId_exp
        ) sg ON sg.vendorOrderId_exp = vo.id
        WHERE vo.householdId = ${householdId}
          AND vo.totalAmount IS NOT NULL AND vo.totalAmount > 0
          AND vo.status_vo != 'cancelled'
          ${platformFilter}
          ${deadLinkFilter}
          ${statusCondition}
        ORDER BY vo.orderDate DESC
        LIMIT ${input.pageSize} OFFSET ${offset}
      `);

      const countResult = await db.execute(sql`
        SELECT COUNT(DISTINCT vo.id) as total
        FROM vendor_orders vo
        LEFT JOIN (
          SELECT vendorOrderId_exp, MIN(id) as firstExpId
          FROM expenses
          WHERE householdId = ${householdId}
          GROUP BY vendorOrderId_exp
        ) eFirst ON eFirst.vendorOrderId_exp = vo.id
        LEFT JOIN expenses e ON e.id = eFirst.firstExpId
        LEFT JOIN (
          SELECT vendorOrderId_exp, COUNT(DISTINCT id) as splitCount
          FROM expenses
          WHERE householdId = ${householdId}
          GROUP BY vendorOrderId_exp
        ) sg ON sg.vendorOrderId_exp = vo.id
        WHERE vo.householdId = ${householdId}
          AND vo.totalAmount IS NOT NULL AND vo.totalAmount > 0
          AND vo.status_vo != 'cancelled'
          ${platformFilter}
          ${deadLinkFilter}
          ${statusCondition}
      `);

      const rows = Array.isArray(orders) ? (orders as any)[0] : orders;
      const countRows = Array.isArray(countResult) ? (countResult as any)[0] : countResult;

      return {
        orders: (rows as any[]).map((o: any) => ({
          ...o,
          totalAmount: o.totalAmount ? Number(o.totalAmount) : null,
          orderDate: o.orderDate ? Number(o.orderDate) : null,
          hasDeadLink: !!o.hasDeadLink,
        })),
        total: Number((countRows as any[])[0]?.total || 0),
        page: input.page,
        pageSize: input.pageSize,
      };
    }),

  /**
   * Get the categorization (expenses) for a specific vendor order.
   */
  getCategorization: protectedProcedure
    .input(z.object({ orderId: z.string() }))
    .query(async ({ ctx, input }) => {
      await requireExpenseAccess(ctx.user.id);
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      const rows = await db.execute(sql`
        SELECT e.*, coa.accountName as categoryName, coa.accountNumber,
               v.name as verticalName
        FROM expenses e
        LEFT JOIN chart_of_accounts coa ON coa.id = e.chartOfAccountId_exp
        LEFT JOIN verticals v ON v.id = e.verticalId_exp
        WHERE e.vendorOrderId_exp = ${input.orderId}
        ORDER BY e.splitSequence ASC, e.createdAt_exp ASC
      `);
      const result = Array.isArray(rows) ? (rows as any)[0] : rows;
      return (result as any[]).map((r: any) => ({
        id: r.id,
        verticalId: r.verticalId_exp,
        verticalName: r.verticalName,
        chartOfAccountId: r.chartOfAccountId_exp,
        categoryName: r.categoryName,
        accountNumber: r.accountNumber,
        propertyId: r.propertyId_exp,
        amount: r.amount ? Number(r.amount) : 0,
        splitAmount: r.splitAmount ? Number(r.splitAmount) : null,
        splitPercentage: r.splitAmount && r.amount ? Math.round((Number(r.splitAmount) / Number(r.amount)) * 10000) / 100 : 100,
        paymentAccountId: r.paymentAccountId,
        notes: r.notes_exp,
        approvalStatus: r.approvalStatus,
        createdAt: r.createdAt_exp,
      }));
    }),

  /**
   * Categorize a vendor order (single vertical assignment).
   * Creates an expense row linking to chart_of_accounts.
   */
  categorize: protectedProcedure
    .input(
      z.object({
        orderId: z.string(),
        verticalId: z.string(),
        chartOfAccountId: z.string(),
        propertyId: z.string().nullable().optional(),
        bankAccountId: z.number().nullable().optional(),
        vendorAccountId: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const householdId = await requireExpenseAccess(ctx.user.id);
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      // Delete existing expenses for this order (re-categorization)
      await db.execute(sql`
        DELETE FROM expenses WHERE vendorOrderId_exp = ${input.orderId} AND householdId = ${householdId}
      `);

      // Get order amount and date
      const orderRows = await db.execute(sql`
        SELECT totalAmount, orderDate, platform_vo FROM vendor_orders WHERE id = ${input.orderId} AND householdId = ${householdId}
      `);
      const orderData = Array.isArray(orderRows) ? (orderRows as any)[0] : orderRows;
      const order = (orderData as any[])[0];
      if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Order not found" });

      const amount = order.totalAmount ? Number(order.totalAmount) : 0;
      const orderDate = Number(order.orderDate);

      // Get COA account name for description
      const coaRows = await db.execute(sql`
        SELECT accountName FROM chart_of_accounts WHERE id = ${input.chartOfAccountId}
      `);
      const coaData = Array.isArray(coaRows) ? (coaRows as any)[0] : coaRows;
      const coaName = (coaData as any[])[0]?.accountName || "Uncategorized";

      // Get vendor name
      const vendorName = order.platform_vo ? order.platform_vo.charAt(0).toUpperCase() + order.platform_vo.slice(1) : "Unknown";

      const now = Date.now();
      const id = crypto.randomUUID().replace(/-/g, "").slice(0, 21);

      await db.execute(sql`
        INSERT INTO expenses (id, householdId, verticalId_exp, propertyId_exp, chartOfAccountId_exp,
          vendorOrderId_exp, amount, currency_exp, description_exp, expenseDate,
          paymentAccountId, vendorName_exp, isTaxDeductible_exp, approvalStatus,
          source_exp, isManualOverride_exp, notes_exp, createdAt_exp, updatedAt_exp, createdBy_exp)
        VALUES (${id}, ${householdId}, ${input.verticalId}, ${input.propertyId || null}, ${input.chartOfAccountId},
          ${input.orderId}, ${amount}, 'USD', ${coaName}, ${orderDate},
          ${input.bankAccountId || null}, ${vendorName}, 0, 'approved',
          'vendor_order', 1, ${input.notes || null}, ${now}, ${now}, ${String(ctx.user.id)})
      `);

      return { success: true, expenseId: id };
    }),

  /**
   * Categorize a vendor order with splits across multiple verticals.
   */
  categorizeSplit: protectedProcedure
    .input(
      z.object({
        orderId: z.string(),
        bankAccountId: z.number().nullable().optional(),
        vendorAccountId: z.string().nullable().optional(),
        splits: z.array(
          z.object({
            verticalId: z.string(),
            chartOfAccountId: z.string(),
            propertyId: z.string().nullable().optional(),
            splitPercentage: z.number().min(0).max(100),
            splitAmount: z.number().nullable(),
            notes: z.string().nullable().optional(),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const householdId = await requireExpenseAccess(ctx.user.id);
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      // Delete existing expenses for this order
      await db.execute(sql`
        DELETE FROM expenses WHERE vendorOrderId_exp = ${input.orderId} AND householdId = ${householdId}
      `);

      // Get order info
      const orderRows = await db.execute(sql`
        SELECT totalAmount, orderDate, platform_vo FROM vendor_orders WHERE id = ${input.orderId} AND householdId = ${householdId}
      `);
      const orderData = Array.isArray(orderRows) ? (orderRows as any)[0] : orderRows;
      const order = (orderData as any[])[0];
      if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Order not found" });

      const orderAmount = order.totalAmount ? Number(order.totalAmount) : 0;
      const orderDate = Number(order.orderDate);
      const vendorName = order.platform_vo ? order.platform_vo.charAt(0).toUpperCase() + order.platform_vo.slice(1) : "Unknown";

      const now = Date.now();
      const splitGroupId = crypto.randomUUID().replace(/-/g, "").slice(0, 21);

      for (let i = 0; i < input.splits.length; i++) {
        const split = input.splits[i];
        const id = crypto.randomUUID().replace(/-/g, "").slice(0, 21);
        const amount = split.splitAmount ?? (orderAmount * (split.splitPercentage / 100));

        // Get COA name
        const coaRows = await db.execute(sql`
          SELECT accountName FROM chart_of_accounts WHERE id = ${split.chartOfAccountId}
        `);
        const coaData = Array.isArray(coaRows) ? (coaRows as any)[0] : coaRows;
        const coaName = (coaData as any[])[0]?.accountName || "Uncategorized";

        await db.execute(sql`
          INSERT INTO expenses (id, householdId, verticalId_exp, propertyId_exp, chartOfAccountId_exp,
            vendorOrderId_exp, amount, currency_exp, description_exp, expenseDate,
            paymentAccountId, vendorName_exp, isTaxDeductible_exp, approvalStatus,
            source_exp, isManualOverride_exp, notes_exp,
            splitGroupId, splitAmount, splitSequence,
            createdAt_exp, updatedAt_exp, createdBy_exp)
          VALUES (${id}, ${householdId}, ${split.verticalId}, ${split.propertyId || null}, ${split.chartOfAccountId},
            ${input.orderId}, ${orderAmount}, 'USD', ${coaName}, ${orderDate},
            ${input.bankAccountId || null}, ${vendorName}, 0, 'approved',
            'vendor_order', 1, ${split.notes || null},
            ${splitGroupId}, ${amount}, ${i + 1},
            ${now}, ${now}, ${String(ctx.user.id)})
        `);
      }

      return { success: true };
    }),

  /**
   * Skip a vendor order (mark as skipped in notes).
   */
  skip: protectedProcedure
    .input(z.object({ orderId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const householdId = await requireExpenseAccess(ctx.user.id);
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      await db.execute(sql`
        UPDATE vendor_orders
        SET notes = CONCAT(COALESCE(notes, ''), ' [skipped]')
        WHERE id = ${input.orderId} AND householdId = ${householdId}
      `);
      return { success: true };
    }),

  /**
   * Update memo/notes on a vendor order.
   */
  updateMemo: protectedProcedure
    .input(z.object({ orderId: z.string(), memo: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const householdId = await requireExpenseAccess(ctx.user.id);
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      await db.execute(sql`
        UPDATE vendor_orders SET notes = ${input.memo}
        WHERE id = ${input.orderId} AND householdId = ${householdId}
      `);
      return { success: true };
    }),

  /**
   * Get stats for the categorization dashboard.
   */
  getStats: protectedProcedure.query(async ({ ctx }) => {
    const householdId = await requireExpenseAccess(ctx.user.id);
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");

    const rows = await db.execute(sql`
      SELECT
        CASE
          WHEN vo.notes LIKE '%[skipped]%' THEN 'skipped'
          WHEN eFirst.firstExpId IS NOT NULL AND COALESCE(sg.splitCount, 0) > 1 THEN 'split'
          WHEN eFirst.firstExpId IS NOT NULL THEN 'categorized'
          ELSE 'pending'
        END as categorizationStatus,
        COUNT(DISTINCT vo.id) as count,
        COALESCE(SUM(vo.totalAmount), 0) as total
      FROM vendor_orders vo
      LEFT JOIN (
        SELECT vendorOrderId_exp, MIN(id) as firstExpId
        FROM expenses
        WHERE householdId = ${householdId}
        GROUP BY vendorOrderId_exp
      ) eFirst ON eFirst.vendorOrderId_exp = vo.id
      LEFT JOIN (
        SELECT vendorOrderId_exp, COUNT(DISTINCT id) as splitCount
        FROM expenses
        WHERE householdId = ${householdId}
        GROUP BY vendorOrderId_exp
      ) sg ON sg.vendorOrderId_exp = vo.id
      WHERE vo.householdId = ${householdId}
        AND vo.totalAmount IS NOT NULL AND vo.totalAmount > 0
        AND vo.status_vo != 'cancelled'
      GROUP BY categorizationStatus
    `);
    const result = Array.isArray(rows) ? (rows as any)[0] : rows;
    return result as any[];
  }),

  /**
   * Get chart of accounts for a specific vertical (replaces hardcoded categories).
   */
  getChartOfAccounts: protectedProcedure
    .input(z.object({ verticalId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const householdId = await requireExpenseAccess(ctx.user.id);
      const db = await getDb();
      if (!db) return [];

      const verticalFilter = input.verticalId
        ? sql`AND verticalId = ${input.verticalId}`
        : sql``;

      const rows = await db.execute(sql`
        SELECT id, verticalId, accountType, accountName, accountNumber, description,
               parentAccountId, isTaxRelevant, taxFormLine, taxJurisdiction
        FROM chart_of_accounts
        WHERE householdId = ${householdId} AND isActive = 1
          ${verticalFilter}
        ORDER BY verticalId, accountNumber
      `);
      const result = Array.isArray(rows) ? (rows as any)[0] : rows;
      return result as any[];
    }),

  /**
   * Get vendor accounts for the dropdown.
   */
  getVendorAccounts: protectedProcedure.query(async ({ ctx }) => {
    const householdId = await requireExpenseAccess(ctx.user.id);
    const db = await getDb();
    if (!db) return [];
    const rows = await db.execute(sql`
      SELECT id, vendorName, platform FROM vendor_accounts
      WHERE householdId = ${householdId} AND isActive = 1
      ORDER BY vendorName
    `);
    const result = Array.isArray(rows) ? (rows as any)[0] : rows;
    return result as { id: string; vendorName: string; platform: string }[];
  }),

  /**
   * Get bank/financial accounts for payment assignment.
   * Uses bank_accounts table (the active one with verticalId).
   */
  getFinancialAccounts: protectedProcedure.query(async ({ ctx }) => {
    const householdId = await requireExpenseAccess(ctx.user.id);
    const db = await getDb();
    if (!db) return [];
    const rows = await db.execute(sql`
      SELECT id, accountName, institution, lastFourDigits, currency, verticalId
      FROM bank_accounts
      WHERE householdId = ${householdId} AND isActive = 1
      ORDER BY accountName
    `);
    const result = Array.isArray(rows) ? (rows as any)[0] : rows;
    return result as { id: number; accountName: string; institution: string; lastFourDigits: string | null; currency: string; verticalId: string | null }[];
  }),

  /**
   * Get order line items from vendor_order_items.
   */
  getOrderItems: protectedProcedure
    .input(z.object({ orderId: z.string() }))
    .query(async ({ ctx, input }) => {
      await requireExpenseAccess(ctx.user.id);
      const db = await getDb();
      if (!db) return [];

      const rows = await db.execute(sql`
        SELECT id, name, quantity, unitPrice, lineTotal, itemTax, vendorCategory,
               chartOfAccountId, verticalId_voi as verticalId, propertyId_voi as propertyId
        FROM vendor_order_items
        WHERE vendorOrderId = ${input.orderId}
        ORDER BY name
      `);
      const result = Array.isArray(rows) ? (rows as any)[0] : rows;
      return (result as any[]).map((item: any) => ({
        ...item,
        unitPrice: item.unitPrice ? Number(item.unitPrice) : null,
        lineTotal: item.lineTotal ? Number(item.lineTotal) : null,
        itemTax: item.itemTax ? Number(item.itemTax) : null,
      }));
    }),

  /**
   * Get expenses by property (for property expense reports).
   */
  getExpensesByProperty: protectedProcedure
    .input(z.object({
      propertyId: z.string(),
      fromTs: z.number().optional(),
      toTs: z.number().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const householdId = await requireExpenseAccess(ctx.user.id);
      const db = await getDb();
      if (!db) return { total: 0, count: 0, byCategory: [] };

      const dateFilter = input.fromTs && input.toTs
        ? sql`AND e.expenseDate >= ${input.fromTs} AND e.expenseDate <= ${input.toTs}`
        : sql``;

      const rows = await db.execute(sql`
        SELECT coa.accountName as category, COALESCE(SUM(COALESCE(e.splitAmount, e.amount)), 0) as total, COUNT(*) as count
        FROM expenses e
        LEFT JOIN chart_of_accounts coa ON coa.id = e.chartOfAccountId_exp
        WHERE e.householdId = ${householdId}
          AND e.propertyId_exp = ${input.propertyId}
          ${dateFilter}
        GROUP BY coa.accountName
        ORDER BY total DESC
      `);
      const result = Array.isArray(rows) ? (rows as any)[0] : rows;
      const byCategory = (result as any[]).map((r: any) => ({
        category: r.category || "Uncategorized",
        total: Number(r.total),
        count: Number(r.count),
      }));
      return {
        total: byCategory.reduce((s, c) => s + c.total, 0),
        count: byCategory.reduce((s, c) => s + c.count, 0),
        byCategory,
      };
    }),

  /**
   * Get expenses by bank account (for account-level expense reports).
   */
  getExpensesByAccount: protectedProcedure
    .input(z.object({
      fromTs: z.number().optional(),
      toTs: z.number().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const householdId = await requireExpenseAccess(ctx.user.id);
      const db = await getDb();
      if (!db) return [];

      const dateFilter = input.fromTs && input.toTs
        ? sql`AND e.expenseDate >= ${input.fromTs} AND e.expenseDate <= ${input.toTs}`
        : sql``;

      const rows = await db.execute(sql`
        SELECT
          ba.id as accountId,
          ba.accountName,
          ba.institution,
          ba.lastFourDigits,
          ba.currency,
          COALESCE(SUM(COALESCE(e.splitAmount, e.amount)), 0) as totalExpenses,
          COUNT(DISTINCT e.vendorOrderId_exp) as orderCount
        FROM expenses e
        JOIN bank_accounts ba ON ba.id = e.paymentAccountId
        WHERE e.householdId = ${householdId}
          ${dateFilter}
        GROUP BY ba.id, ba.accountName, ba.institution, ba.lastFourDigits, ba.currency
        ORDER BY totalExpenses DESC
      `);
      const result = Array.isArray(rows) ? (rows as any)[0] : rows;
      return (result as any[]).map((r: any) => ({
        accountId: r.accountId,
        accountName: r.accountName,
        institution: r.institution,
        lastFourDigits: r.lastFourDigits,
        currency: r.currency,
        totalExpenses: Number(r.totalExpenses),
        orderCount: Number(r.orderCount),
      }));
    }),

  /**
   * Get config — now dynamically pulls verticals and COA from DB.
   */
  getConfig: protectedProcedure.query(async ({ ctx }) => {
    const householdId = await requireExpenseAccess(ctx.user.id);
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");

    // Get verticals
    const vertRows = await db.execute(sql`
      SELECT id, name FROM verticals WHERE householdId = ${householdId} ORDER BY name
    `);
    const vertResult = Array.isArray(vertRows) ? (vertRows as any)[0] : vertRows;

    // Get COA grouped by vertical
    const coaRows = await db.execute(sql`
      SELECT id, verticalId, accountName, accountNumber, accountType, parentAccountId, isTaxRelevant
      FROM chart_of_accounts
      WHERE householdId = ${householdId} AND isActive = 1
      ORDER BY verticalId, accountNumber
    `);
    const coaResult = Array.isArray(coaRows) ? (coaRows as any)[0] : coaRows;

    // Build categories by vertical
    const categoriesByVertical: Record<string, any[]> = {};
    for (const coa of coaResult as any[]) {
      if (!categoriesByVertical[coa.verticalId]) {
        categoriesByVertical[coa.verticalId] = [];
      }
      categoriesByVertical[coa.verticalId].push({
        id: coa.id,
        name: coa.accountName,
        accountNumber: coa.accountNumber,
        accountType: coa.accountType,
        parentAccountId: coa.parentAccountId,
        isTaxRelevant: coa.isTaxRelevant,
      });
    }

    // Vertical icon/color mapping
    const VERTICAL_STYLES: Record<string, { icon: string; color: string }> = {
      "tjpfam-vert-home": { icon: "home", color: "#E8624A" },
      "tjpfam-vert-bakery": { icon: "briefcase", color: "#4F7EC4" },
      "tjpfam-vert-market": { icon: "shopping-cart", color: "#D4A017" },
      "tjpfam-vert-self": { icon: "user", color: "#8B5CF6" },
      "tjpfam-vert-startout": { icon: "globe", color: "#E8943A" },
      "c3pW-Cxhm9WAQZ17pTMb3": { icon: "building", color: "#2DD4BF" },
    };

    const verticals = (vertResult as any[]).map((v: any) => ({
      id: v.id,
      name: v.name,
      icon: VERTICAL_STYLES[v.id]?.icon || "folder",
      color: VERTICAL_STYLES[v.id]?.color || "#6B7280",
    }));

    // Get properties for Bohemian Lodges
    const propRows = await db.execute(sql`
      SELECT id, name FROM properties WHERE householdId = ${householdId} ORDER BY name
    `);
    const propResult = Array.isArray(propRows) ? (propRows as any)[0] : propRows;
    const properties = (propResult as any[]).map((p: any) => ({ id: p.id, name: p.name }));

    return {
      verticals,
      categoriesByVertical,
      properties,
    };
  }),
});
