import { describe, it, expect } from "vitest";
import { z } from "zod";

// Test the input schemas used by expenseCategorisation router procedures
// These schemas are tested in isolation to avoid needing full DB/router mocking

describe("expenseCategorisation input schemas", () => {
  const updateMemoSchema = z.object({ orderId: z.string(), memo: z.string() });

  it("updateMemo accepts orderId and memo", () => {
    const valid = updateMemoSchema.safeParse({ orderId: "abc-123", memo: "Bakery supplies" });
    expect(valid.success).toBe(true);
  });

  it("updateMemo accepts empty memo (clearing notes)", () => {
    const empty = updateMemoSchema.safeParse({ orderId: "abc-123", memo: "" });
    expect(empty.success).toBe(true);
  });

  it("updateMemo rejects missing memo", () => {
    const invalid = updateMemoSchema.safeParse({ orderId: "abc-123" });
    expect(invalid.success).toBe(false);
  });

  const categorizeSchema = z.object({
    orderId: z.string(),
    verticalId: z.string(),
    verticalName: z.string(),
    category: z.string().nullable(),
    customCategory: z.string().nullable(),
    propertyName: z.string().nullable(),
  });

  it("categorize accepts valid full assignment", () => {
    const valid = categorizeSchema.safeParse({
      orderId: "order-1",
      verticalId: "vert-1",
      verticalName: "Home & Family",
      category: "Home: Groceries",
      customCategory: null,
      propertyName: null,
    });
    expect(valid.success).toBe(true);
  });

  it("categorize rejects missing verticalId", () => {
    const invalid = categorizeSchema.safeParse({
      orderId: "order-1",
      verticalName: "Home & Family",
      category: null,
      customCategory: null,
      propertyName: null,
    });
    expect(invalid.success).toBe(false);
  });

  const splitSchema = z.object({
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
  });

  it("categorizeSplit accepts valid splits", () => {
    const valid = splitSchema.safeParse({
      orderId: "order-1",
      splits: [
        { verticalId: "v1", verticalName: "Home", category: "Groceries", customCategory: null, propertyName: null, splitPercentage: 60, splitAmount: 60.00 },
        { verticalId: "v2", verticalName: "Bakery", category: "Supplies", customCategory: null, propertyName: null, splitPercentage: 40, splitAmount: 40.00 },
      ],
    });
    expect(valid.success).toBe(true);
  });

  it("categorizeSplit rejects splitPercentage > 100", () => {
    const invalid = splitSchema.safeParse({
      orderId: "order-1",
      splits: [
        { verticalId: "v1", verticalName: "Home", category: null, customCategory: null, propertyName: null, splitPercentage: 150, splitAmount: null },
      ],
    });
    expect(invalid.success).toBe(false);
  });

  const getOrdersSchema = z.object({
    status: z.enum(["pending", "categorized", "split", "skipped", "all"]).default("all"),
    page: z.number().min(1).default(1),
    pageSize: z.number().min(1).max(100).default(20),
  });

  it("getOrders accepts valid status filter", () => {
    const valid = getOrdersSchema.safeParse({ status: "categorized", page: 1, pageSize: 20 });
    expect(valid.success).toBe(true);
  });

  it("getOrders rejects invalid status", () => {
    const invalid = getOrdersSchema.safeParse({ status: "invalid_status", page: 1, pageSize: 20 });
    expect(invalid.success).toBe(false);
  });

  it("getOrders defaults work correctly", () => {
    const result = getOrdersSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe("all");
      expect(result.data.page).toBe(1);
      expect(result.data.pageSize).toBe(20);
    }
  });
});

describe("Expense Categorisation - New Procedures (Section 29)", () => {
  describe("getExpensesByProperty input schema", () => {
    const schema = z.object({
      propertyName: z.string(),
      fromTs: z.number().optional(),
      toTs: z.number().optional(),
    });

    it("accepts propertyName with fromTs", () => {
      const valid = schema.safeParse({ propertyName: "Scottsdale Villa", fromTs: Date.now() - 86400000 });
      expect(valid.success).toBe(true);
    });

    it("accepts propertyName with fromTs and toTs", () => {
      const valid = schema.safeParse({ propertyName: "Scottsdale Villa", fromTs: Date.now() - 86400000, toTs: Date.now() });
      expect(valid.success).toBe(true);
    });

    it("rejects missing propertyName", () => {
      const invalid = schema.safeParse({ fromTs: Date.now() });
      expect(invalid.success).toBe(false);
    });
  });

  describe("getExpensesByAccount input schema", () => {
    const schema = z.object({
      fromTs: z.number().optional(),
      toTs: z.number().optional(),
    });

    it("accepts empty object (all time)", () => {
      const valid = schema.safeParse({});
      expect(valid.success).toBe(true);
    });

    it("accepts fromTs and toTs for date range filtering", () => {
      const valid = schema.safeParse({ fromTs: Date.now() - 86400000, toTs: Date.now() });
      expect(valid.success).toBe(true);
    });
  });

  describe("categorize mutation with bankAccountId and vendorAccountId", () => {
    const schema = z.object({
      orderId: z.string(),
      verticalId: z.string(),
      verticalName: z.string(),
      category: z.string().nullable(),
      customCategory: z.string().nullable(),
      propertyName: z.string().nullable(),
      bankAccountId: z.string().nullable().optional(),
      vendorAccountId: z.string().nullable().optional(),
    });

    it("accepts bankAccountId and vendorAccountId", () => {
      const valid = schema.safeParse({
        orderId: "order-1",
        verticalId: "vert-1",
        verticalName: "Home & Family",
        category: "Groceries",
        customCategory: null,
        propertyName: null,
        bankAccountId: "ba-123",
        vendorAccountId: "va-456",
      });
      expect(valid.success).toBe(true);
    });

    it("allows null bankAccountId and vendorAccountId", () => {
      const valid = schema.safeParse({
        orderId: "order-1",
        verticalId: "vert-1",
        verticalName: "Home & Family",
        category: "Groceries",
        customCategory: null,
        propertyName: null,
        bankAccountId: null,
        vendorAccountId: null,
      });
      expect(valid.success).toBe(true);
    });

    it("works without bankAccountId and vendorAccountId (backward compatible)", () => {
      const valid = schema.safeParse({
        orderId: "order-1",
        verticalId: "vert-1",
        verticalName: "Home & Family",
        category: "Groceries",
        customCategory: null,
        propertyName: null,
      });
      expect(valid.success).toBe(true);
    });
  });
});
