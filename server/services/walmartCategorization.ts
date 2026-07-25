import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { sql } from "drizzle-orm";

export const walmartCategorizationRouter = router({
  getOrders: protectedProcedure
    .input(
      z.object({
        status: z.enum(["pending", "categorized", "split", "skipped", "all"]).default("all"),
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(20),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      const offset = (input.page - 1) * input.pageSize;
      const statusFilter = input.status !== "all" ? sql`AND categorizationStatus = ${input.status}` : sql``;

      const orders = await db.execute(sql`
        SELECT * FROM walmart_orders
        WHERE householdId = '1S9K7Jw7DtkJJTP2Jgtr6' ${statusFilter}
        ORDER BY orderDate DESC
        LIMIT ${input.pageSize} OFFSET ${offset}
      `);

      const countResult = await db.execute(sql`
        SELECT COUNT(*) as total FROM walmart_orders
        WHERE householdId = '1S9K7Jw7DtkJJTP2Jgtr6' ${statusFilter}
      `);

      const rows = Array.isArray(orders) ? (orders as any)[0] : orders;
      const countRows = Array.isArray(countResult) ? (countResult as any)[0] : countResult;

      return {
        orders: (rows as any[]).map((o: any) => ({
          ...o,
          totalAmount: o.totalAmount ? Number(o.totalAmount) : null,
          thumbnailUrls: o.thumbnailUrls ? (typeof o.thumbnailUrls === "string" ? JSON.parse(o.thumbnailUrls) : o.thumbnailUrls) : [],
          itemNames: o.itemNames ? (typeof o.itemNames === "string" ? JSON.parse(o.itemNames) : o.itemNames) : [],
        })),
        total: (countRows as any[])[0]?.total || 0,
        page: input.page,
        pageSize: input.pageSize,
      };
    }),

  getCategorization: protectedProcedure
    .input(z.object({ orderId: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      const rows = await db.execute(sql`
        SELECT * FROM walmart_order_categorizations
        WHERE walmartOrderId = ${input.orderId}
        ORDER BY createdAt
      `);
      const result = Array.isArray(rows) ? (rows as any)[0] : rows;
      return result as any[];
    }),

  categorize: protectedProcedure
    .input(
      z.object({
        orderId: z.string(),
        verticalId: z.string(),
        verticalName: z.string(),
        category: z.string().nullable(),
        customCategory: z.string().nullable(),
        propertyName: z.string().nullable(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      await db.execute(sql`
        DELETE FROM walmart_order_categorizations WHERE walmartOrderId = ${input.orderId}
      `);

      const orderRows = await db.execute(sql`
        SELECT totalAmount FROM walmart_orders WHERE id = ${input.orderId}
      `);
      const orderData = Array.isArray(orderRows) ? (orderRows as any)[0] : orderRows;
      const orderAmount = (orderData as any[])[0]?.totalAmount;

      const id = crypto.randomUUID();
      await db.execute(sql`
        INSERT INTO walmart_order_categorizations (id, walmartOrderId, verticalId, verticalName, category, customCategory, propertyName, splitPercentage, splitAmount)
        VALUES (${id}, ${input.orderId}, ${input.verticalId}, ${input.verticalName}, ${input.category}, ${input.customCategory}, ${input.propertyName}, 100.00, ${orderAmount})
      `);

      await db.execute(sql`
        UPDATE walmart_orders SET categorizationStatus = 'categorized' WHERE id = ${input.orderId}
      `);

      return { success: true };
    }),

  categorizeSplit: protectedProcedure
    .input(
      z.object({
        orderId: z.string(),
        splits: z.array(
          z.object({
            verticalId: z.string(),
            verticalName: z.string(),
            category: z.string().nullable(),
            customCategory: z.string().nullable(),
            propertyName: z.string().nullable(),
            splitPercentage: z.number().min(0).max(100),
            splitAmount: z.number().nullable(),
          })
        ),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      await db.execute(sql`
        DELETE FROM walmart_order_categorizations WHERE walmartOrderId = ${input.orderId}
      `);

      for (const split of input.splits) {
        const id = crypto.randomUUID();
        await db.execute(sql`
          INSERT INTO walmart_order_categorizations (id, walmartOrderId, verticalId, verticalName, category, customCategory, propertyName, splitPercentage, splitAmount)
          VALUES (${id}, ${input.orderId}, ${split.verticalId}, ${split.verticalName}, ${split.category}, ${split.customCategory}, ${split.propertyName}, ${split.splitPercentage}, ${split.splitAmount})
        `);
      }

      await db.execute(sql`
        UPDATE walmart_orders SET categorizationStatus = 'split' WHERE id = ${input.orderId}
      `);

      return { success: true };
    }),

  skip: protectedProcedure
    .input(z.object({ orderId: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      await db.execute(sql`
        UPDATE walmart_orders SET categorizationStatus = 'skipped' WHERE id = ${input.orderId}
      `);
      return { success: true };
    }),

  updateMemo: protectedProcedure
    .input(z.object({ orderId: z.string(), memo: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      await db.execute(sql`
        UPDATE walmart_orders SET memo = ${input.memo} WHERE id = ${input.orderId}
      `);
      return { success: true };
    }),

  getStats: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");

    const rows = await db.execute(sql`
      SELECT categorizationStatus, COUNT(*) as count, COALESCE(SUM(totalAmount), 0) as total
      FROM walmart_orders
      WHERE householdId = '1S9K7Jw7DtkJJTP2Jgtr6'
      GROUP BY categorizationStatus
    `);
    const result = Array.isArray(rows) ? (rows as any)[0] : rows;
    return result as any[];
  }),

  getConfig: protectedProcedure.query(async () => {
    return {
      verticals: [
        { id: "UfmDSlxi_mQy-VJFKz-HE", name: "Home & Family", icon: "home", color: "#E8624A", categoryKey: "Home_Family" },
        { id: "m7Qxr9EAWhUZpwu7v1ksM", name: "Maxfield Bakery", icon: "briefcase", color: "#4F7EC4", categoryKey: "Maxfield_Bakery" },
        { id: "DoaIiOvcamX4S-I5-avVf", name: "Maxfield Market", icon: "shopping-cart", color: "#D4A017", categoryKey: "Maxfield_Market" },
        { id: "oEgAguztpOHxUryoPTC6I", name: "Personal", icon: "user", color: "#8B5CF6", categoryKey: "Personal" },
        { id: "CEwJqO2UxReljXLbLKLry", name: "StartOut", icon: "globe", color: "#E8943A", categoryKey: "StartOut" },
        { id: "bohemian-lodges", name: "Bohemian Lodges", icon: "building", color: "#2DD4BF", categoryKey: "Bohemian_Lodges" },
      ],
      categories: {
        Home_Family: ["Home: Mortgage/Rent", "Home: Property Tax", "Home: Home Insurance", "Home: Maintenance & Repairs", "Home: Utilities", "Home: Furnishings", "Home: Groceries", "Home: Childcare & Education", "Home: Family Activities", "Home: Pet Care", "Home: Miscellaneous"],
        Maxfield_Bakery: ["Bakery: Sales", "Bakery: Cost of Goods Sold", "Bakery: Supplies", "Bakery: Equipment & Supplies", "Bakery: Cleaning & Maintenance", "Bakery: Utilities", "Bakery: Bank and Service Fees", "Bakery: Wages and Salaries", "Bakery: Motor Vehicle Expenses", "Bakery: Product Liability Insurance Expense", "Bakery: Property Insurance Expense"],
        Maxfield_Market: ["Market: Cleaning Expense (Rental Property)", "Market: Cost of Goods Sold", "Market: Repairs & Maintenance", "Market: Repairs & Maintenance:Repairs & Maintenance - Cleaning", "Market: Repairs & Maintenance:Repairs & Maintenance - Labor", "Market: Advertising & Marketing", "Market: Job Supplies", "Market: Insurance", "Market: Utilities", "Market: Contractors", "Market: Freight Costs", "Market: Legal & Professional Services"],
        Personal: ["Personal: Housing", "Personal: Transportation", "Personal: Food & Groceries", "Personal: Healthcare", "Personal: Insurance", "Personal: Utilities", "Personal: Entertainment", "Personal: Education", "Personal: Savings & Investments", "Personal: Debt Payments", "Personal: Clothing", "Personal: Gifts & Donations", "Personal: Subscriptions", "Personal: Childcare", "Personal: Miscellaneous"],
        StartOut: ["StartOut: Program Expenses", "StartOut: Travel", "StartOut: Marketing", "StartOut: Technology", "StartOut: Professional Services", "StartOut: Events", "StartOut: Miscellaneous"],
        Bohemian_Lodges: ["Bohemian: Cleaning Expense (Rental Property)", "Bohemian: Repairs & Maintenance", "Bohemian: Repairs & Maintenance:Repairs & Maintenance - Cleaning", "Bohemian: Repairs & Maintenance:Repairs & Maintenance - Labor", "Bohemian: Advertising & Marketing", "Bohemian: Job Supplies", "Bohemian: Insurance", "Bohemian: Interest Paid:Mortgage Interest Paid", "Bohemian: Taxes & Licenses", "Bohemian: Travel", "Bohemian: Utilities", "Bohemian: Contractors", "Bohemian: Freight Costs", "Bohemian: Short Term Rental Income", "Bohemian: Short Term Rental Income:Airbnb Rental Income"],
      },
      properties: ["Morabeza", "Sunset Studio", "The Artiste's Boutique", "Penthouse", "Sunset Studio + Morabeza", "All Properties"],
    };
  }),
});
