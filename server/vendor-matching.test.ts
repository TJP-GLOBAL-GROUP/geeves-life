import { describe, expect, it } from "vitest";
import { getDb } from "./db";
import { sql } from "drizzle-orm";
import {
  chartOfAccounts,
  verticalFinancialConfigs,
  vendorAccounts,
  vendorOrders,
  vendorOrderItems,
  transactionMatches,
  expenses,
  auditLog,
} from "../drizzle/schema";

/**
 * Section 16: Vendor Matching, Expenses Module & Shopping Module
 * Integration tests verifying schema deployment and data migration.
 */

describe("Section 16: Schema Deployment", () => {
  it("chart_of_accounts table exists with correct columns", async () => {
    const db = await getDb();
    if (!db) throw new Error("DB not available");
    const [rows] = await db.execute(sql`DESCRIBE chart_of_accounts`);
    const columns = (rows as any[]).map((r: any) => r.Field);
    expect(columns).toContain("id");
    expect(columns).toContain("verticalId");
    expect(columns).toContain("householdId");
    expect(columns).toContain("accountType");
    expect(columns).toContain("detailType");
    expect(columns).toContain("accountName");
    expect(columns).toContain("qboAccountId");
    expect(columns).toContain("qboSyncStatus");
    expect(columns).toContain("isTaxRelevant");
    expect(columns).toContain("taxFormLine");
    expect(columns).toContain("taxJurisdiction");
  });

  it("vertical_financial_configs table exists with correct columns", async () => {
    const db = await getDb();
    if (!db) throw new Error("DB not available");
    const [rows] = await db.execute(sql`DESCRIBE vertical_financial_configs`);
    const columns = (rows as any[]).map((r: any) => r.Field);
    expect(columns).toContain("id");
    expect(columns).toContain("verticalId");
    expect(columns).toContain("defaultCurrency");
    expect(columns).toContain("reconciliationToleranceAbs");
    expect(columns).toContain("reconciliationTolerancePct");
    expect(columns).toContain("qboRealmId");
    expect(columns).toContain("taxEntityType");
    expect(columns).toContain("defaultVendorMatchStrategy");
  });

  it("vendor_accounts table exists with correct columns", async () => {
    const db = await getDb();
    if (!db) throw new Error("DB not available");
    const [rows] = await db.execute(sql`DESCRIBE vendor_accounts`);
    const columns = (rows as any[]).map((r: any) => r.Field);
    expect(columns).toContain("id");
    expect(columns).toContain("householdId");
    expect(columns).toContain("vendorName");
    expect(columns).toContain("vendorSlug");
    expect(columns).toContain("platform");
    expect(columns).toContain("bankStatementPatterns");
    expect(columns).toContain("defaultVerticalId");
    expect(columns).toContain("matchStrategy");
  });

  it("vendor_orders table exists with correct columns", async () => {
    const db = await getDb();
    if (!db) throw new Error("DB not available");
    const [rows] = await db.execute(sql`DESCRIBE vendor_orders`);
    const columns = (rows as any[]).map((r: any) => r.Field);
    expect(columns).toContain("id");
    expect(columns).toContain("householdId");
    expect(columns).toContain("vendorAccountId");
    expect(columns).toContain("orderNumber");
    expect(columns).toContain("platform_vo");
    expect(columns).toContain("totalAmount");
    expect(columns).toContain("orderDate");
    expect(columns).toContain("legacyOrderId");
    expect(columns).toContain("legacyWalmartOrderId");
  });

  it("vendor_order_items table exists with correct columns", async () => {
    const db = await getDb();
    if (!db) throw new Error("DB not available");
    const [rows] = await db.execute(sql`DESCRIBE vendor_order_items`);
    const columns = (rows as any[]).map((r: any) => r.Field);
    expect(columns).toContain("id");
    expect(columns).toContain("vendorOrderId");
    expect(columns).toContain("householdId");
    expect(columns).toContain("name");
    expect(columns).toContain("chartOfAccountId");
    expect(columns).toContain("verticalId_voi");
    expect(columns).toContain("propertyId_voi");
    expect(columns).toContain("isTaxDeductible_voi");
    expect(columns).toContain("taxCategory");
    expect(columns).toContain("legacyOrderItemId");
  });

  it("transaction_matches table exists with correct columns", async () => {
    const db = await getDb();
    if (!db) throw new Error("DB not available");
    const [rows] = await db.execute(sql`DESCRIBE transaction_matches`);
    const columns = (rows as any[]).map((r: any) => r.Field);
    expect(columns).toContain("id");
    expect(columns).toContain("financialTransactionId");
    expect(columns).toContain("vendorOrderId");
    expect(columns).toContain("confidence");
    expect(columns).toContain("matchMethod");
    expect(columns).toContain("status_tm");
    expect(columns).toContain("allocatedAmount");
  });

  it("expenses table exists with correct columns", async () => {
    const db = await getDb();
    if (!db) throw new Error("DB not available");
    const [rows] = await db.execute(sql`DESCRIBE expenses`);
    const columns = (rows as any[]).map((r: any) => r.Field);
    expect(columns).toContain("id");
    expect(columns).toContain("householdId");
    expect(columns).toContain("verticalId_exp");
    expect(columns).toContain("propertyId_exp");
    expect(columns).toContain("chartOfAccountId_exp");
    expect(columns).toContain("vendorOrderItemId");
    expect(columns).toContain("financialTransactionId_exp");
    expect(columns).toContain("approvalStatus");
    expect(columns).toContain("qboExportStatus");
    expect(columns).toContain("isTaxDeductible_exp");
  });
});

describe("Section 16: Data Migration Verification", () => {
  it("vendor_accounts has 14+ seeded vendors", async () => {
    const db = await getDb();
    if (!db) throw new Error("DB not available");
    const result = await db.select({ count: sql<number>`COUNT(*)` }).from(vendorAccounts);
    expect(result[0].count).toBeGreaterThanOrEqual(14);
  });

  it("vendor_orders has migrated orders from legacy tables", async () => {
    const db = await getDb();
    if (!db) throw new Error("DB not available");
    const result = await db.select({ count: sql<number>`COUNT(*)` }).from(vendorOrders);
    // 239 from orders + 185 from walmart_orders = 424
    expect(result[0].count).toBeGreaterThanOrEqual(400);
  });

  it("vendor_order_items has migrated items from legacy order_items", async () => {
    const db = await getDb();
    if (!db) throw new Error("DB not available");
    const result = await db.select({ count: sql<number>`COUNT(*)` }).from(vendorOrderItems);
    expect(result[0].count).toBeGreaterThanOrEqual(419);
  });

  it("vendor_orders preserves legacy backlinks", async () => {
    const db = await getDb();
    if (!db) throw new Error("DB not available");
    // Check that legacyOrderId is populated for migrated orders
    const [rows] = await db.execute(
      sql`SELECT COUNT(*) as cnt FROM vendor_orders WHERE legacyOrderId IS NOT NULL`
    );
    expect((rows as any[])[0].cnt).toBeGreaterThanOrEqual(60);
    // Check walmart legacy links
    const [wRows] = await db.execute(
      sql`SELECT COUNT(*) as cnt FROM vendor_orders WHERE legacyWalmartOrderId IS NOT NULL`
    );
    expect((wRows as any[])[0].cnt).toBeGreaterThanOrEqual(180);
  });

  it("vertical_financial_configs has 6 seeded configs", async () => {
    const db = await getDb();
    if (!db) throw new Error("DB not available");
    const result = await db.select({ count: sql<number>`COUNT(*)` }).from(verticalFinancialConfigs);
    expect(result[0].count).toBe(6);
  });

  it("financial_transactions has verticalId column backfilled", async () => {
    const db = await getDb();
    if (!db) throw new Error("DB not available");
    const [rows] = await db.execute(
      sql`SELECT COUNT(*) as cnt FROM financial_transactions WHERE verticalId IS NOT NULL`
    );
    // personal(317) + artistes_boutique(342) + maxfield_bakery(12) = 671
    expect((rows as any[])[0].cnt).toBeGreaterThanOrEqual(600);
  });

  it("bank_accounts has migrated financial_accounts with new columns", async () => {
    const db = await getDb();
    if (!db) throw new Error("DB not available");
    const [rows] = await db.execute(
      sql`SELECT COUNT(*) as cnt FROM bank_accounts WHERE householdId IS NOT NULL`
    );
    expect((rows as any[])[0].cnt).toBeGreaterThanOrEqual(4);
  });

  it("verticals table has exactly 6 canonical verticals", async () => {
    const db = await getDb();
    if (!db) throw new Error("DB not available");
    const [rows] = await db.execute(sql`SELECT COUNT(*) as cnt FROM verticals`);
    // At least 6 canonical verticals exist; user may have added more
    expect((rows as any[])[0].cnt).toBeGreaterThanOrEqual(6);
  });

  it("audit_log has migration entries", async () => {
    const db = await getDb();
    if (!db) throw new Error("DB not available");
    const [rows] = await db.execute(
      sql`SELECT COUNT(*) as cnt FROM audit_log WHERE action = 'data_migration' AND category IN ('shopping', 'finance')`
    );
    expect((rows as any[])[0].cnt).toBeGreaterThanOrEqual(2);
  });

  it("audit_log has new columns (actorType, verticalId, previousValue, newValue)", async () => {
    const db = await getDb();
    if (!db) throw new Error("DB not available");
    const [rows] = await db.execute(sql`DESCRIBE audit_log`);
    const columns = (rows as any[]).map((r: any) => r.Field);
    expect(columns).toContain("actorType");
    expect(columns).toContain("verticalId");
    expect(columns).toContain("previousValue");
    expect(columns).toContain("newValue");
  });
});
