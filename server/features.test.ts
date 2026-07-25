import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock db module
vi.mock("./db", () => ({
  getFamilyMembers: vi.fn().mockResolvedValue([
    { id: 1, userId: 1, name: "Marcus Jr.", relationship: "Child", clothingSizes: { top: "M", shoe: "6" }, dietaryRestrictions: [], preferences: {}, birthDate: "2015-03-10", avatarUrl: null, createdAt: new Date(), updatedAt: new Date() },
  ]),
  createFamilyMember: vi.fn().mockResolvedValue({ id: 2 }),
  updateFamilyMember: vi.fn().mockResolvedValue(undefined),
  deleteFamilyMember: vi.fn().mockResolvedValue(undefined),
  getShoppingLists: vi.fn().mockResolvedValue([
    { id: 1, userId: 1, name: "Weekly Groceries", description: null, category: "Groceries", status: "active", isRecurring: true, recurringSchedule: "weekly", createdAt: new Date(), updatedAt: new Date() },
  ]),
  getShoppingListById: vi.fn().mockResolvedValue(
    { id: 1, userId: 1, name: "Weekly Groceries", description: null, category: "Groceries", status: "active", isRecurring: true, recurringSchedule: "weekly", createdAt: new Date(), updatedAt: new Date() }
  ),
  createShoppingList: vi.fn().mockResolvedValue({ id: 2 }),
  updateShoppingList: vi.fn().mockResolvedValue(undefined),
  deleteShoppingList: vi.fn().mockResolvedValue(undefined),
  getShoppingListItems: vi.fn().mockResolvedValue([
    { id: 1, listId: 1, name: "Whole Milk", quantity: 2, unit: "gal", category: "Groceries", status: "pending", estimatedPrice: "4.99", currency: "USD", preferredStore: "Walmart", productUrl: null, forFamilyMemberId: null, notes: null, createdAt: new Date(), updatedAt: new Date() },
  ]),
  createShoppingListItem: vi.fn().mockResolvedValue({ id: 2 }),
  updateShoppingListItem: vi.fn().mockResolvedValue(undefined),
  deleteShoppingListItem: vi.fn().mockResolvedValue(undefined),
  moveItemsToList: vi.fn().mockResolvedValue({ moved: 3 }),
  getBankAccounts: vi.fn().mockResolvedValue([
    { id: 1, userId: 1, householdId: "test-household", institution: "Bank of America", accountName: "Personal Checking", accountType: "checking", category: "personal", currency: "USD", lastFourDigits: "1234", currentBalance: "5000.00", isActive: true, createdAt: new Date(), updatedAt: new Date() },
    { id: 2, userId: 1, householdId: "test-household", institution: "Scotiabank Jamaica", accountName: "JMD Savings", accountType: "savings", category: "personal", currency: "JMD", lastFourDigits: "5678", currentBalance: "250000.00", isActive: true, createdAt: new Date(), updatedAt: new Date() },
  ]),
  getBankAccountsByHousehold: vi.fn().mockResolvedValue([
    { id: 1, userId: 1, householdId: "test-household", institution: "Bank of America", accountName: "Personal Checking", accountType: "checking", category: "personal", currency: "USD", lastFourDigits: "1234", currentBalance: "5000.00", isActive: true, createdAt: new Date(), updatedAt: new Date() },
    { id: 2, userId: 1, householdId: "test-household", institution: "Scotiabank Jamaica", accountName: "JMD Savings", accountType: "savings", category: "personal", currency: "JMD", lastFourDigits: "5678", currentBalance: "250000.00", isActive: true, createdAt: new Date(), updatedAt: new Date() },
  ]),
  createBankAccount: vi.fn().mockResolvedValue({ id: 3 }),
  updateBankAccount: vi.fn().mockResolvedValue(undefined),
  deleteBankAccount: vi.fn().mockResolvedValue(undefined),
  getTransactions: vi.fn().mockResolvedValue([
    { id: 1, userId: 1, description: "Office supplies", amount: "45.99", currency: "USD", type: "expense", classification: "business", expenseCategory: "Office Supplies", vendor: "Staples", isTaxDeductible: true, taxCategory: "Business expense", transactionDate: new Date(), createdAt: new Date(), updatedAt: new Date() },
  ]),
  createTransaction: vi.fn().mockResolvedValue({ id: 2 }),
  updateTransaction: vi.fn().mockResolvedValue(undefined),
  deleteTransaction: vi.fn().mockResolvedValue(undefined),
  getExpenseSummary: vi.fn().mockResolvedValue({ personal: "1250.00", business: "3400.00", total: "4650.00" }),
  getSpendingByCategory: vi.fn().mockResolvedValue([
    { category: "Groceries", total: "800.00" },
    { category: "Office Supplies", total: "200.00" },
  ]),
  getHouseholdMemberByUserId: vi.fn().mockResolvedValue({ id: "test-member-1", userId: 1, householdId: "test-household", role: "household_admin", displayName: "Test Admin" }),
  getOwnedVerticalIds: vi.fn().mockResolvedValue(new Set(["v1"])),
  getOrders: vi.fn().mockResolvedValue([
    { id: 1, userId: 1, platform: "Amazon", orderNumber: "111-222-333", vendor: "Amazon.com", totalAmount: "89.99", currency: "USD", status: "delivered", items: [{ name: "Headphones", quantity: 1, price: "89.99" }], importSource: "email", orderDate: new Date(), trackingNumber: null, createdAt: new Date(), updatedAt: new Date() },
  ]),
  bulkCreateOrders: vi.fn().mockResolvedValue({ count: 5 }),
  createOrder: vi.fn().mockResolvedValue({ id: 2 }),
  updateOrder: vi.fn().mockResolvedValue(undefined),
  getLatestExchangeRate: vi.fn().mockResolvedValue({ from: "USD", to: "JMD", rate: "155.50", updatedAt: new Date() }),
  getWhatsappImports: vi.fn().mockResolvedValue([
    {
      id: 1, userId: 1, contactName: "Mom", rawMessage: "Get some milk and bread",
      parsedItems: [
        { name: "Milk", brand: "Horizon", quantity: 1, unit: "gal", size: null, category: "groceries", for_person: null, urgency: "soon", notes: null, search_keywords: ["horizon organic milk", "whole milk gallon"], pastPurchases: [{ platform: "Walmart", productName: "Horizon Organic Whole Milk 1 Gallon", price: "6.48", vendor: "Walmart.com", orderDate: "2025-12-01", matchScore: 85 }] },
      ],
      shoppingListId: null, importedAt: new Date(),
    },
  ]),
  createWhatsappImport: vi.fn().mockResolvedValue({ id: 2 }),
  createShoppingSession: vi.fn().mockResolvedValue({ id: 1 }),
  getShoppingSession: vi.fn().mockResolvedValue({
    id: 1, userId: 1, listId: 1, status: "shopping", walmartTotal: null, amazonTotal: null,
    overallTotal: null, deliveryInfo: null, notes: null, createdAt: new Date(), updatedAt: new Date(),
  }),
  getShoppingSessions: vi.fn().mockResolvedValue([{
    id: 1, userId: 1, listId: 1, listName: "Weekly Groceries", status: "ready", totalItems: 1, walmartTotal: null, amazonTotal: null,
    overallTotal: null, deliveryInfo: null, notifications: [], createdAt: new Date(), updatedAt: new Date(),
  }]),
  updateShoppingSession: vi.fn().mockResolvedValue(undefined),
  createShoppingSessionItem: vi.fn().mockResolvedValue({ id: 1 }),
  bulkCreateSessionItems: vi.fn().mockResolvedValue({ count: 3 }),
  getSessionItems: vi.fn().mockResolvedValue([
    { id: 1, sessionId: 1, originalItemId: 1, name: "Whole Milk", quantity: 2, unit: "gal", assignedPlatform: "walmart", status: "pending", searchQuery: "whole milk gallon", matchedProductName: null, matchedProductUrl: null, matchedPrice: null, substituteNote: null, createdAt: new Date(), updatedAt: new Date() },
  ]),
  updateSessionItem: vi.fn().mockResolvedValue(undefined),
  bulkUpdateSessionItems: vi.fn().mockResolvedValue(undefined),
  getPlatformCredentials: vi.fn().mockResolvedValue([
    { id: 1, userId: 1, platform: "Walmart", credentialData: { email: "user@test.com", password: "pass" }, createdAt: new Date(), updatedAt: new Date() },
  ]),
  getPlatformCredential: vi.fn().mockResolvedValue(
    { id: 1, userId: 1, platform: "Walmart", credentialData: { email: "user@test.com", password: "pass" }, createdAt: new Date(), updatedAt: new Date() }
  ),
  upsertPlatformCredential: vi.fn().mockResolvedValue({ id: 1 }),
  getChatMessages: vi.fn().mockResolvedValue([]),
  addChatMessage: vi.fn().mockResolvedValue({ id: 1 }),
  clearChatHistory: vi.fn().mockResolvedValue({ success: true }),
  getProductMappings: vi.fn().mockResolvedValue([
    { id: 1, userId: 1, itemName: "Great Value Large White Eggs", normalizedName: "great value large white eggs", platform: "walmart", productId: "945193065", productName: "Great Value Large White Eggs 12 Count", productUrl: "https://www.walmart.com/ip/945193065", lastPrice: "3.24", useCount: 5, confidence: 100, isVerified: true, createdAt: new Date(), updatedAt: new Date() },
    { id: 2, userId: 1, itemName: "Great Value 100% Apple Juice", normalizedName: "great value 100% apple juice", platform: "walmart", productId: "660768274", productName: "Great Value 100% Apple Juice 96 fl oz", productUrl: "https://www.walmart.com/ip/660768274", lastPrice: "3.98", useCount: 3, confidence: 100, isVerified: true, createdAt: new Date(), updatedAt: new Date() },
  ]),
  findProductMapping: vi.fn().mockResolvedValue(
    { id: 1, userId: 1, itemName: "Great Value Large White Eggs", normalizedName: "great value large white eggs", platform: "walmart", productId: "945193065", productName: "Great Value Large White Eggs 12 Count", productUrl: "https://www.walmart.com/ip/945193065", lastPrice: "3.24", useCount: 5, confidence: 100, isVerified: true, createdAt: new Date(), updatedAt: new Date() }
  ),
  bulkFindProductMappings: vi.fn().mockResolvedValue([
    { id: 1, userId: 1, itemName: "Great Value Large White Eggs", normalizedName: "great value large white eggs", platform: "walmart", productId: "945193065", productName: "Great Value Large White Eggs 12 Count", productUrl: "https://www.walmart.com/ip/945193065", lastPrice: "3.24", useCount: 5, confidence: 100, isVerified: true, createdAt: new Date(), updatedAt: new Date() },
  ]),
  upsertProductMapping: vi.fn().mockResolvedValue({ id: 1 }),
  deleteProductMapping: vi.fn().mockResolvedValue(undefined),
  searchOrderItems: vi.fn().mockResolvedValue([
    {
      orderId: 5,
      platform: "Walmart",
      vendor: "Walmart.com",
      orderDate: new Date("2025-12-15"),
      orderNumber: "WMT-555-666",
      item: { name: "Tide Pods Laundry Detergent 42ct", quantity: 1, price: "12.97" },
      matchedKeyword: "tide pods",
      matchScore: 90,
    },
    {
      orderId: 3,
      platform: "Amazon",
      vendor: "Amazon.com",
      orderDate: new Date("2025-11-20"),
      orderNumber: "111-333-444",
      item: { name: "Nike Revolution 6 Kids Sneakers Size 6", quantity: 1, price: "49.99" },
      matchedKeyword: "nike sneakers",
      matchScore: 75,
    },
    {
      orderId: 7,
      platform: "Amazon",
      vendor: "Amazon.com",
      orderDate: new Date("2025-10-05"),
      orderNumber: "111-777-888",
      item: { name: "Cheerios Original Cereal 18oz", quantity: 2, price: "4.29" },
      matchedKeyword: "cheerios cereal",
      matchScore: 85,
    },
  ]),
}));

// Mock LLM — return different responses based on the system prompt
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockImplementation(({ messages }: any) => {
    const systemContent = messages[0]?.content || "";

    // WhatsApp parser prompt
    if (systemContent.includes("expert shopping list parser")) {
      return Promise.resolve({
        choices: [{
          message: {
            content: JSON.stringify({
              items: [
                {
                  name: "Laundry Detergent Pods",
                  brand: "Tide",
                  quantity: 1,
                  unit: "pack",
                  size: "42ct",
                  category: "household",
                  for_person: null,
                  urgency: "soon",
                  notes: null,
                  search_keywords: ["tide pods 42 count", "tide laundry detergent pods"],
                },
                {
                  name: "Sneakers",
                  brand: "Nike",
                  quantity: 1,
                  unit: "pair",
                  size: "6",
                  category: "clothing",
                  for_person: "Marcus Jr.",
                  urgency: "soon",
                  notes: "Running shoes for school",
                  search_keywords: ["nike kids sneakers size 6", "nike revolution kids"],
                },
                {
                  name: "Cereal",
                  brand: "Cheerios",
                  quantity: 2,
                  unit: "box",
                  size: null,
                  category: "groceries",
                  for_person: null,
                  urgency: "whenever",
                  notes: "The kids' favorite",
                  search_keywords: ["cheerios original cereal", "cheerios cereal box"],
                },
                {
                  name: "Scotch Bonnet Peppers",
                  brand: null,
                  quantity: 6,
                  unit: "pieces",
                  size: null,
                  category: "groceries",
                  for_person: null,
                  urgency: "now",
                  notes: "Fresh hot peppers",
                  search_keywords: ["scotch bonnet peppers fresh", "hot peppers scotch bonnet"],
                },
              ],
            }),
          },
        }],
      });
    }

    // Expense categorization prompt
    if (systemContent.includes("categorize expenses")) {
      return Promise.resolve({
        choices: [{
          message: {
            content: JSON.stringify({
              classification: "business",
              expenseCategory: "Office Supplies",
              isTaxDeductible: true,
              taxCategory: "Business expense",
              confidence: 92,
            }),
          },
        }],
      });
    }

    // Email order parsing prompt
    if (systemContent.includes("parse order confirmation emails")) {
      return Promise.resolve({
        choices: [{
          message: {
            content: JSON.stringify({
              platform: "Amazon",
              orderNumber: "111-999-000",
              vendor: "Amazon.com",
              totalAmount: "34.99",
              currency: "USD",
              items: [{ name: "USB-C Cable 3-pack", quantity: 1, price: "34.99" }],
              orderDate: "2026-02-15T00:00:00Z",
              trackingNumber: "TBA123456789",
            }),
          },
        }],
      });
    }

    // Geeves chat prompt — tool-calling aware
    if (systemContent.includes("Geeves") || systemContent.includes("personal life management")) {
      // Check the last user message for cancel session intent
      const lastUserMsg = [...messages].reverse().find((m: any) => m.role === "user");
      const userText = typeof lastUserMsg?.content === "string" ? lastUserMsg.content : "";
      const cancelMatch = userText.match(/cancel session #?(\d+)/i);
      if (cancelMatch) {
        // If there's already a tool result in the messages, return the final text
        const hasToolResult = messages.some((m: any) => m.role === "tool");
        if (!hasToolResult) {
          return Promise.resolve({
            choices: [{
              message: {
                content: null,
                tool_calls: [{
                  id: "call_cancel_1",
                  type: "function",
                  function: {
                    name: "cancel_shopping_session",
                    arguments: JSON.stringify({ sessionId: Number(cancelMatch[1]) }),
                  },
                }],
              },
            }],
          });
        }
        return Promise.resolve({
          choices: [{ message: { content: `Session #${cancelMatch[1]} has been cancelled.` } }],
        });
      }
      return Promise.resolve({
        choices: [{ message: { content: "Good day! I'm Geeves, your personal assistant. How may I help you today?" } }],
      });
    }

    // Default fallback
    return Promise.resolve({
      choices: [{ message: { content: JSON.stringify({ classification: "personal", expenseCategory: "other", isTaxDeductible: false, taxCategory: null, confidence: 50 }) } }],
    });
  }),
}));

// Mock storage
vi.mock("./storage", () => ({
  storagePut: vi.fn().mockResolvedValue({ url: "https://s3.example.com/receipt.png", key: "receipts/1/1-abc.png" }),
}));

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user-001",
    email: "supah@example.com",
    name: "Supah-T",
    loginMethod: "manus",
    role: "admin",
    householdId: "test-household",
    memberId: "test-member-001",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

// ─── Family Members ──────────────────────────────────────────────────

describe("Family Members", () => {
  it("lists family members for authenticated user", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.family.list();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Marcus Jr.");
    expect(result[0].relationship).toBe("Child");
  });

  it("creates a family member with clothing sizes and preferences", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.family.create({
      name: "Mom",
      relationship: "Parent",
      clothingSizes: { top: "L", shoe: "8" },
      dietaryRestrictions: ["low sodium"],
      preferences: { favoriteColors: ["blue"], brands: ["Nike"] },
    });
    expect(result).toEqual({ id: 2 });
  });

  it("deletes a family member", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.family.delete({ id: 1 })).resolves.not.toThrow();
  });
});

// ─── Shopping Lists ──────────────────────────────────────────────────

describe("Shopping Lists", () => {
  it("lists shopping lists", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.shoppingLists.list();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Weekly Groceries");
    expect(result[0].status).toBe("active");
  });

  it("creates a recurring shopping list", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.shoppingLists.create({
      name: "Kids School Supplies",
      category: "Kids",
      isRecurring: true,
      recurringSchedule: "monthly",
    });
    expect(result).toEqual({ id: 2 });
  });

  it("gets a shopping list by ID", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.shoppingLists.getById({ id: 1 });
    expect(result?.name).toBe("Weekly Groceries");
  });
});

// ─── Shopping List Items ─────────────────────────────────────────────

describe("Shopping List Items", () => {
  it("lists items for a shopping list", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.shoppingItems.list({ listId: 1 });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Whole Milk");
    expect(result[0].preferredStore).toBe("Walmart");
  });

  it("creates an item with store preference and price estimate", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.shoppingItems.create({
      listId: 1,
      name: "Chicken Breast",
      quantity: 3,
      unit: "lbs",
      category: "Groceries",
      preferredStore: "Walmart",
      estimatedPrice: "12.99",
    });
    expect(result).toEqual({ id: 2 });
  });
});

// ─── Bank Accounts ───────────────────────────────────────────────────

describe("Bank Accounts", () => {
  it("lists bank accounts with multi-currency", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.bankAccounts.list();
    expect(result).toHaveLength(2);
    const usdAccount = result.find((a: any) => a.currency === "USD");
    const jmdAccount = result.find((a: any) => a.currency === "JMD");
    expect(usdAccount?.institution).toBe("Bank of America");
    expect(jmdAccount?.institution).toBe("Scotiabank Jamaica");
  });

  it("creates a business bank account", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.bankAccounts.create({
      institution: "American Express",
      accountName: "Business Amex",
      accountType: "business_credit",
      category: "business",
      currency: "USD",
      lastFourDigits: "9999",
    });
    expect(result).toEqual({ id: 3 });
  });
});

// ─── Transactions / Expenses ─────────────────────────────────────────

describe("Transactions / Expenses", () => {
  it("lists transactions", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.transactions.list();
    expect(result).toHaveLength(1);
    expect(result[0].classification).toBe("business");
    expect(result[0].isTaxDeductible).toBe(true);
  });

  it("creates a business expense with tax info", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.transactions.create({
      description: "Software subscription",
      amount: "29.99",
      currency: "USD",
      type: "expense",
      classification: "business",
      expenseCategory: "Software",
      vendor: "Adobe",
      isTaxDeductible: true,
      taxCategory: "Business software",
      transactionDate: new Date().toISOString(),
    });
    expect(result).toEqual({ id: 2 });
  });

  it("returns expense summary with personal/business split", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.transactions.summary();
    expect(result.personal).toBe("1250.00");
    expect(result.business).toBe("3400.00");
    expect(result.total).toBe("4650.00");
  });

  it("returns spending by category", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.transactions.byCategory();
    expect(result).toHaveLength(2);
    expect(result[0].category).toBe("Groceries");
  });
});

// ─── Orders ──────────────────────────────────────────────────────────

describe("Orders", () => {
  it("lists orders across platforms", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.orders.list();
    expect(result).toHaveLength(1);
    expect(result[0].platform).toBe("Amazon");
    expect(result[0].importSource).toBe("email");
  });

  it("creates a manual order", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.orders.create({
      platform: "Walmart",
      vendor: "Walmart.com",
      totalAmount: "156.78",
      currency: "USD",
      orderDate: new Date().toISOString(),
      importSource: "manual",
    });
    expect(result).toEqual({ id: 2 });
  });
});

// ─── AI Features ─────────────────────────────────────────────────────

describe("AI Features", () => {
  it("categorizes an expense using AI", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.ai.categorizeExpense({
      description: "Office supplies from Staples",
      vendor: "Staples",
      amount: "45.99",
    });
    expect(result.classification).toBe("business");
    expect(result.expenseCategory).toBe("Office Supplies");
    expect(result.isTaxDeductible).toBe(true);
    expect(result.confidence).toBeGreaterThan(80);
  });
});

// ─── Exchange Rates ──────────────────────────────────────────────────

describe("Exchange Rates", () => {
  it("gets USD to JMD exchange rate", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.exchangeRates.get({ from: "USD", to: "JMD" });
    expect(result?.rate).toBe("155.50");
  });
});

// ─── WhatsApp Import (Enhanced) ──────────────────────────────────────

describe("WhatsApp Import — Smart Parser", () => {
  it("lists previous imports with enriched parsed data", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.whatsapp.list();
    expect(result).toHaveLength(1);
    expect(result[0].contactName).toBe("Mom");
    const items = result[0].parsedItems as any[];
    expect(items[0].brand).toBe("Horizon");
    expect(items[0].pastPurchases).toHaveLength(1);
    expect(items[0].pastPurchases[0].platform).toBe("Walmart");
  });

  it("parses a WhatsApp message and extracts brands, sizes, quantities", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.whatsapp.parse({
      contactName: "Wife",
      rawMessage: "Babe can you pick up some Tide pods, size 6 Nike sneakers for Marcus, and the Cheerios the kids like. Get some scotch bonnet peppers too 🌶️",
    });

    expect(result.items).toHaveLength(4);

    // Check Tide pods extraction
    const tide = result.items.find((i: any) => i.brand === "Tide");
    expect(tide).toBeDefined();
    expect(tide.name).toBe("Laundry Detergent Pods");
    expect(tide.category).toBe("household");
    expect(tide.size).toBe("42ct");
    expect(tide.search_keywords).toBeDefined();
    expect(tide.search_keywords.length).toBeGreaterThanOrEqual(1);

    // Check Nike sneakers for Marcus
    const nike = result.items.find((i: any) => i.brand === "Nike");
    expect(nike).toBeDefined();
    expect(nike.size).toBe("6");
    expect(nike.for_person).toBe("Marcus Jr.");
    expect(nike.category).toBe("clothing");

    // Check Cheerios
    const cheerios = result.items.find((i: any) => i.brand === "Cheerios");
    expect(cheerios).toBeDefined();
    expect(cheerios.quantity).toBe(2);
    expect(cheerios.category).toBe("groceries");

    // Check scotch bonnet peppers (no brand)
    const peppers = result.items.find((i: any) => i.name === "Scotch Bonnet Peppers");
    expect(peppers).toBeDefined();
    expect(peppers.brand).toBeNull();
    expect(peppers.urgency).toBe("now");
    expect(peppers.quantity).toBe(6);
  });

  it("matches parsed items to past order history", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.whatsapp.parse({
      rawMessage: "Get Tide pods, Nike sneakers for Marcus, and Cheerios",
    });

    // Tide should match Walmart order
    const tide = result.items.find((i: any) => i.brand === "Tide");
    expect(tide.pastPurchases).toBeDefined();
    expect(tide.pastPurchases.length).toBeGreaterThanOrEqual(1);
    const tideMatch = tide.pastPurchases.find((p: any) => p.platform === "Walmart");
    expect(tideMatch).toBeDefined();
    expect(tideMatch.productName).toContain("Tide");
    expect(tideMatch.price).toBe("12.97");

    // Nike should match Amazon order
    const nike = result.items.find((i: any) => i.brand === "Nike");
    expect(nike.pastPurchases).toBeDefined();
    const nikeMatch = nike.pastPurchases.find((p: any) => p.platform === "Amazon");
    expect(nikeMatch).toBeDefined();
    expect(nikeMatch.productName).toContain("Nike");

    // Cheerios should match Amazon order
    const cheerios = result.items.find((i: any) => i.brand === "Cheerios");
    expect(cheerios.pastPurchases).toBeDefined();
    const cheeriosMatch = cheerios.pastPurchases.find((p: any) => p.productName.includes("Cheerios"));
    expect(cheeriosMatch).toBeDefined();
    expect(cheeriosMatch.price).toBe("4.29");
  });

  it("adds parsed items to a shopping list with enriched data when targetListId is provided", async () => {
    const { createShoppingListItem } = await import("./db");
    const mockCreate = createShoppingListItem as ReturnType<typeof vi.fn>;
    mockCreate.mockClear();

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await caller.whatsapp.parse({
      rawMessage: "Get Tide pods and Cheerios",
      targetListId: 1,
    });

    // Should have been called for each parsed item (4 items from mock)
    expect(mockCreate).toHaveBeenCalled();
    const calls = mockCreate.mock.calls;

    // Check that items were added with enriched data
    const tideCall = calls.find((c: any) => c[0].name.includes("Tide"));
    expect(tideCall).toBeDefined();
    expect(tideCall[0].listId).toBe(1);
    expect(tideCall[0].preferredStore).toBe("Walmart"); // from best match

    // Nike sneakers should have notes with size and person
    const nikeCall = calls.find((c: any) => c[0].name.includes("Nike"));
    expect(nikeCall).toBeDefined();
    expect(nikeCall[0].notes).toContain("Size: 6");
    expect(nikeCall[0].notes).toContain("For: Marcus Jr.");
  });

});

// ─── Move Items Between Lists ───────────────────────────────────────

describe("Move Items Between Lists", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("moves items to a target list", async () => {
    const { moveItemsToList, getShoppingListById } = await import("./db");
    const mockMove = moveItemsToList as ReturnType<typeof vi.fn>;
    const mockGetList = getShoppingListById as ReturnType<typeof vi.fn>;
    mockMove.mockResolvedValue({ moved: 2 });
    mockGetList.mockResolvedValue({ id: 2, userId: 1, name: "Target List" });

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.shoppingItems.moveToList({
      itemIds: [1, 3],
      targetListId: 2,
    });

    expect(result.moved).toBe(2);
    expect(mockMove).toHaveBeenCalledWith([1, 3], 2);
  });

  it("rejects move to a list that doesn't belong to user", async () => {
    const { getShoppingListById } = await import("./db");
    const mockGetList = getShoppingListById as ReturnType<typeof vi.fn>;
    mockGetList.mockResolvedValue(undefined); // list not found for this user

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.shoppingItems.moveToList({ itemIds: [1], targetListId: 999 })
    ).rejects.toThrow("Target list not found or access denied");
  });

  it("requires at least one item to move", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.shoppingItems.moveToList({ itemIds: [], targetListId: 2 })
    ).rejects.toThrow(); // Zod validation: min(1)
  });
});

// ─── WhatsApp Enhanced Parser (continued) ───────────────────────────

describe("WhatsApp Enhanced Parser (continued)", () => {
  it("saves the import record with enriched parsed data", async () => {
    const { createWhatsappImport } = await import("./db");
    const mockImport = createWhatsappImport as ReturnType<typeof vi.fn>;
    mockImport.mockClear();

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await caller.whatsapp.parse({
      contactName: "Mom",
      rawMessage: "Buy some groceries",
    });

    expect(mockImport).toHaveBeenCalledOnce();
    const importData = mockImport.mock.calls[0][0];
    expect(importData.userId).toBe(1);
    expect(importData.contactName).toBe("Mom");
    expect(importData.rawMessage).toBe("Buy some groceries");
    expect(importData.parsedItems).toBeDefined();
    expect(Array.isArray(importData.parsedItems)).toBe(true);
    // Each item should have pastPurchases field
    importData.parsedItems.forEach((item: any) => {
      expect(item).toHaveProperty("pastPurchases");
      expect(Array.isArray(item.pastPurchases)).toBe(true);
    });
  });
});

// ─── Order Preparation (Convert List → Cart) ────────────────────────

describe("Order Preparation", () => {
  beforeEach(async () => {
    // Reset mocks that may have been changed by previous tests
    const { getShoppingListById, getShoppingListItems } = await import("./db");
    (getShoppingListById as ReturnType<typeof vi.fn>).mockResolvedValue(
      { id: 1, userId: 1, name: "Weekly Groceries", description: null, category: "Groceries", status: "active", isRecurring: true, recurringSchedule: "weekly", createdAt: new Date(), updatedAt: new Date() }
    );
    (getShoppingListItems as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 1, listId: 1, name: "Whole Milk", quantity: 2, unit: "gal", category: "Groceries", status: "pending", estimatedPrice: "4.99", currency: "USD", preferredStore: "Walmart", productUrl: null, forFamilyMemberId: null, notes: null, createdAt: new Date(), updatedAt: new Date() },
    ]);
  });

  it("prepares an order from a shopping list with store grouping and product matches", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.orderPrep.prepare({ listId: 1 });

    expect(result.listId).toBe(1);
    expect(result.listName).toBe("Weekly Groceries");
    expect(result.totalItems).toBeGreaterThan(0);
    expect(result.stores).toBeDefined();
    expect(result.stores.walmart).toBeDefined();
    expect(result.stores.amazon).toBeDefined();
    expect(result.allItems).toBeDefined();
    expect(result.allItems.length).toBeGreaterThan(0);

    // Each item should have search URLs
    result.allItems.forEach((item: any) => {
      expect(item.walmartSearchUrl).toContain("walmart.com/search");
      expect(item.amazonSearchUrl).toContain("amazon.com/s");
    });
  });

  it("marks items as purchased and creates an order record", async () => {
    const { createOrder, updateShoppingListItem } = await import("./db");
    const mockCreateOrder = createOrder as ReturnType<typeof vi.fn>;
    const mockUpdateItem = updateShoppingListItem as ReturnType<typeof vi.fn>;
    mockCreateOrder.mockClear();
    mockUpdateItem.mockClear();

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.orderPrep.markPurchased({
      itemIds: [1, 2, 3],
      platform: "Walmart",
      orderNumber: "WMT-123-456",
      totalAmount: "45.99",
    });

    expect(result.markedCount).toBe(3);
    expect(result.orderId).toBeDefined();
    expect(mockUpdateItem).toHaveBeenCalledTimes(3);
    expect(mockCreateOrder).toHaveBeenCalledOnce();
    const orderData = mockCreateOrder.mock.calls[0][0];
    expect(orderData.platform).toBe("Walmart");
    expect(orderData.orderNumber).toBe("WMT-123-456");
    expect(orderData.totalAmount).toBe("45.99");
  });

  it("throws error when list has no pending items (orderPrep)", async () => {
    const { getShoppingListById, getShoppingListItems } = await import("./db");
    (getShoppingListById as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      { id: 1, userId: 1, name: "Weekly Groceries", description: null, category: "Groceries", status: "active", isRecurring: true, recurringSchedule: "weekly", createdAt: new Date(), updatedAt: new Date() }
    );
    const mockGetItems = getShoppingListItems as ReturnType<typeof vi.fn>;
    mockGetItems.mockResolvedValueOnce([
      { id: 1, listId: 1, name: "Already Bought", quantity: 1, status: "purchased", estimatedPrice: null, currency: "USD", preferredStore: null, productUrl: null, forFamilyMemberId: null, notes: null, unit: null, category: null, createdAt: new Date(), updatedAt: new Date() },
    ]);

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.orderPrep.prepare({ listId: 1 })).rejects.toThrow("No pending items to order");
  });
});

// ─── Shop Agent ──────────────────────────────────────────────────────

describe("Shop Agent", () => {
  it("creates a session in 'ready' state when credentials exist", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.shopAgent.createSession({ listId: 1 });
    expect(result.sessionId).toBeDefined();
    expect(result.status).toBe("ready");
    expect(result.hasWalmart).toBe(true);
  });

  it("creates a session in 'pending_credentials' state when no credentials", async () => {
    const { getPlatformCredentials } = await import("./db");
    (getPlatformCredentials as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.shopAgent.createSession({ listId: 1 });
    expect(result.sessionId).toBeDefined();
    expect(result.status).toBe("pending_credentials");
    expect(result.hasWalmart).toBe(false);
    expect(result.hasAmazon).toBe(false);
  });

  it("does NOT auto-advance session to 'shopping' status", async () => {
    const { updateShoppingSession, createShoppingSession } = await import("./db");
    const mockUpdate = updateShoppingSession as ReturnType<typeof vi.fn>;
    mockUpdate.mockClear();

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await caller.shopAgent.createSession({ listId: 1 });

    // createShoppingSession should be called with "ready" (not "shopping")
    const mockCreate = createShoppingSession as ReturnType<typeof vi.fn>;
    const createCall = mockCreate.mock.calls[mockCreate.mock.calls.length - 1][0];
    expect(createCall.status).toBe("ready");

    // updateShoppingSession should NOT be called to set status to "shopping"
    const shoppingUpdates = mockUpdate.mock.calls.filter(
      (call: any[]) => call[1]?.status === "shopping"
    );
    expect(shoppingUpdates).toHaveLength(0);
  });

  it("retrieves a shopping session by id with platform grouping", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.shopAgent.getSession({ sessionId: 1 });
    expect(result.items).toBeDefined();
    expect(result.platforms).toBeDefined();
    expect(result.platforms.walmart).toBeDefined();
    expect(result.platforms.amazon).toBeDefined();
  });

  it("lists all shopping sessions", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.shopAgent.listSessions();
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("ready");
  });

  it("updates a session item status", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.shopAgent.updateItem({
      itemId: 1,
      status: "found",
      matchedProductName: "Great Value Whole Milk 1 Gallon",
      matchedPrice: "3.24",
    });
    expect(result.success).toBe(true);
  });

  it("finalizes a session with totals and delivery info", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.shopAgent.finalize({
      sessionId: 1,
      walmartTotal: "67.43",
      amazonTotal: "23.99",
      deliveryInfo: { walmart: "Today by 8pm", amazon: "Tomorrow by 5pm" },
    });
    expect(result.status).toBe("awaiting_review");
    expect(result.overallTotal).toBe("91.42");
  });

  it("approves a session for checkout", async () => {
    const { getShoppingSession } = await import("./db");
    (getShoppingSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 1, userId: 1, listId: 1, listName: "Weekly Groceries", status: "awaiting_review",
      walmartTotal: "67.43", amazonTotal: "23.99", overallTotal: "91.42",
      deliveryInfo: null, notifications: [], totalItems: 3, createdAt: new Date(), updatedAt: new Date(),
    });
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.shopAgent.approve({ sessionId: 1 });
    expect(result.success).toBe(true);
  });

  it("cancels a session from any active state", async () => {
    const { getShoppingSession } = await import("./db");
    (getShoppingSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 1, userId: 1, listId: 1, listName: "Weekly Groceries", status: "ready",
      walmartTotal: null, amazonTotal: null, overallTotal: null,
      deliveryInfo: null, notifications: [], totalItems: 3, createdAt: new Date(), updatedAt: new Date(),
    });
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.shopAgent.cancel({ sessionId: 1 });
    expect(result.success).toBe(true);
  });

  it("rejects cancellation of already-cancelled session", async () => {
    const { getShoppingSession } = await import("./db");
    (getShoppingSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 1, userId: 1, listId: 1, listName: "Weekly Groceries", status: "cancelled",
      walmartTotal: null, amazonTotal: null, overallTotal: null,
      deliveryInfo: null, notifications: [], totalItems: 3, createdAt: new Date(), updatedAt: new Date(),
    });
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.shopAgent.cancel({ sessionId: 1 })).rejects.toThrow("already");
  });

  it("saves platform credentials", async () => {
    const { upsertPlatformCredential } = await import("./db");
    const mockUpsert = upsertPlatformCredential as ReturnType<typeof vi.fn>;
    mockUpsert.mockClear();

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.shopAgent.credentials.upsert({
      platform: "Walmart",
      credentialData: { email: "test@example.com", password: "secret" },
    });
    expect(result).toBeDefined();
    expect(mockUpsert).toHaveBeenCalledWith({
      userId: 1,
      platform: "Walmart",
      credentialData: { email: "test@example.com", password: "secret" },
    });
  });
});


// ─── Geeves Chat ──────────────────────────────────────────────────────
describe("Geeves Chat", () => {
  it("returns chat history", async () => {
    const { getChatMessages } = await import("./db");
    const mockGet = getChatMessages as ReturnType<typeof vi.fn>;
    mockGet.mockResolvedValueOnce([
      { id: 1, userId: 1, role: "user", content: "Hello", metadata: null, createdAt: new Date() },
      { id: 2, userId: 1, role: "assistant", content: "Good day!", metadata: null, createdAt: new Date() },
    ]);
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.geeves.history();
    expect(result).toHaveLength(2);
    expect(result[0].role).toBe("user");
    expect(result[1].role).toBe("assistant");
  });

  it("sends a message and gets a response", async () => {
    const { addChatMessage, getChatMessages } = await import("./db");
    const mockAdd = addChatMessage as ReturnType<typeof vi.fn>;
    const mockGetMsgs = getChatMessages as ReturnType<typeof vi.fn>;
    mockAdd.mockClear();
    mockGetMsgs.mockResolvedValue([]);
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.geeves.chat({ message: "Hello Geeves" });
    expect(result.role).toBe("assistant");
    expect(result.content).toBeTruthy();
    expect(typeof result.content).toBe("string");
    // Should have saved both user and assistant messages
    expect(mockAdd).toHaveBeenCalledTimes(2);
    expect(mockAdd).toHaveBeenCalledWith(expect.objectContaining({
      userId: 1,
      role: "user",
      content: "Hello Geeves",
    }));
    expect(mockAdd).toHaveBeenCalledWith(expect.objectContaining({
      userId: 1,
      role: "assistant",
    }));
  });

  it("handles cancel command", async () => {
    const { updateShoppingSession, getShoppingSession, addChatMessage, getChatMessages } = await import("./db");
    const mockUpdate = updateShoppingSession as ReturnType<typeof vi.fn>;
    const mockGetSession = getShoppingSession as ReturnType<typeof vi.fn>;
    const mockAdd = addChatMessage as ReturnType<typeof vi.fn>;
    const mockGetMsgs = getChatMessages as ReturnType<typeof vi.fn>;
    mockUpdate.mockClear();
    mockAdd.mockClear();
    mockGetMsgs.mockResolvedValue([]);
    mockGetSession.mockResolvedValueOnce({
      id: 1, userId: 1, listId: 1, listName: "Weekly Groceries", status: "ready",
      totalItems: 5, notifications: [], createdAt: new Date(), updatedAt: new Date(),
    });
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.geeves.chat({ message: "Cancel session #1" });
    expect(result.role).toBe("assistant");
    expect(mockUpdate).toHaveBeenCalledWith(1, { status: "cancelled" });
  });

  it("handles status check command", async () => {
    const { addChatMessage, getChatMessages } = await import("./db");
    const mockAdd = addChatMessage as ReturnType<typeof vi.fn>;
    const mockGetMsgs = getChatMessages as ReturnType<typeof vi.fn>;
    mockAdd.mockClear();
    mockGetMsgs.mockResolvedValue([]);
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.geeves.chat({ message: "What's the status of my shopping sessions?" });
    expect(result.role).toBe("assistant");
    expect(result.content).toBeTruthy();
  });

  it("clears chat history", async () => {
    const { clearChatHistory } = await import("./db");
    const mockClear = clearChatHistory as ReturnType<typeof vi.fn>;
    mockClear.mockClear();
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.geeves.clearHistory();
    expect(result).toEqual({ success: true });
    expect(mockClear).toHaveBeenCalledWith(1);
  });
});


// ─── One-Click Cart URL Tests ──────────────────────────────────────
describe("shopAgent.generateCartUrl", () => {
  it("generates a Walmart Add To Cart URL with matched items", async () => {
    const { getShoppingSession, getSessionItems, bulkFindProductMappings, findProductMapping } = await import("./db");
    const mockGetSession = getShoppingSession as ReturnType<typeof vi.fn>;
    const mockGetItems = getSessionItems as ReturnType<typeof vi.fn>;
    const mockBulkFind = bulkFindProductMappings as ReturnType<typeof vi.fn>;
    const mockFindMapping = findProductMapping as ReturnType<typeof vi.fn>;

    mockGetSession.mockResolvedValueOnce({
      id: 1, userId: 1, listId: 1, status: "ready", createdAt: new Date(), updatedAt: new Date(),
    });
    mockGetItems.mockResolvedValueOnce([
      { id: 1, sessionId: 1, name: "Great Value Large White Eggs", quantity: 1, assignedPlatform: "walmart", status: "pending" },
      { id: 2, sessionId: 1, name: "Great Value 100% Apple Juice", quantity: 3, assignedPlatform: "walmart", status: "pending" },
      { id: 3, sessionId: 1, name: "Some Unknown Item", quantity: 1, assignedPlatform: "walmart", status: "pending" },
    ]);
    mockBulkFind.mockResolvedValueOnce([
      { normalizedName: "great value large white eggs", productId: "945193065", productName: "Great Value Large White Eggs 12 Count", lastPrice: "3.24" },
    ]);
    // Fuzzy lookup finds apple juice but not the unknown item
    mockFindMapping
      .mockResolvedValueOnce({ normalizedName: "great value 100% apple juice", productId: "660768274", productName: "Great Value 100% Apple Juice 96 fl oz", lastPrice: "3.98" })
      .mockResolvedValueOnce(null);

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.shopAgent.generateCartUrl({ sessionId: 1, platform: "walmart" });

    expect(result.matchedCount).toBe(2);
    expect(result.unmatchedCount).toBe(1);
    expect(result.totalItems).toBe(3);
    expect(result.cartUrl).toContain("walmart.com/sc/cart/addToCart");
    expect(result.cartUrl).toContain("945193065");
    expect(result.cartUrl).toContain("660768274_3");
    expect(result.unmatchedItems[0].name).toBe("Some Unknown Item");
    expect(parseFloat(result.estimatedTotal)).toBeGreaterThan(0);
  });

  it("generates an Amazon Add To Cart URL", async () => {
    const { getShoppingSession, getSessionItems, bulkFindProductMappings, findProductMapping } = await import("./db");
    const mockGetSession = getShoppingSession as ReturnType<typeof vi.fn>;
    const mockGetItems = getSessionItems as ReturnType<typeof vi.fn>;
    const mockBulkFind = bulkFindProductMappings as ReturnType<typeof vi.fn>;
    const mockFindMapping = findProductMapping as ReturnType<typeof vi.fn>;

    mockGetSession.mockResolvedValueOnce({
      id: 1, userId: 1, listId: 1, status: "ready", createdAt: new Date(), updatedAt: new Date(),
    });
    mockGetItems.mockResolvedValueOnce([
      { id: 1, sessionId: 1, name: "Beeswax Wraps", quantity: 2, assignedPlatform: "amazon", status: "pending" },
    ]);
    mockBulkFind.mockResolvedValueOnce([
      { normalizedName: "beeswax wraps", productId: "B07CQ6Q52H", productName: "Bee's Wrap Reusable Beeswax Food Wraps", lastPrice: "18.00" },
    ]);

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.shopAgent.generateCartUrl({ sessionId: 1, platform: "amazon" });

    expect(result.matchedCount).toBe(1);
    expect(result.cartUrl).toContain("amazon.com/gp/aws/cart/add.html");
    expect(result.cartUrl).toContain("ASIN.1=B07CQ6Q52H");
    expect(result.cartUrl).toContain("Quantity.1=2");
  });

  it("throws error when no items for the platform", async () => {
    const { getShoppingSession, getSessionItems } = await import("./db");
    const mockGetSession = getShoppingSession as ReturnType<typeof vi.fn>;
    const mockGetItems = getSessionItems as ReturnType<typeof vi.fn>;

    mockGetSession.mockResolvedValueOnce({
      id: 1, userId: 1, listId: 1, status: "ready", createdAt: new Date(), updatedAt: new Date(),
    });
    mockGetItems.mockResolvedValueOnce([
      { id: 1, sessionId: 1, name: "Eggs", quantity: 1, assignedPlatform: "walmart", status: "pending" },
    ]);

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.shopAgent.generateCartUrl({ sessionId: 1, platform: "amazon" })).rejects.toThrow("No amazon items");
  });
});

// ─── Product Mappings Tests ────────────────────────────────────────
describe("shopAgent.mappings", () => {
  it("lists product mappings", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.shopAgent.mappings.list();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toHaveProperty("productId");
    expect(result[0]).toHaveProperty("platform");
  });

  it("upserts a product mapping", async () => {
    const { upsertProductMapping } = await import("./db");
    const mockUpsert = upsertProductMapping as ReturnType<typeof vi.fn>;
    mockUpsert.mockClear();

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.shopAgent.mappings.upsert({
      itemName: "Whole Milk",
      platform: "walmart",
      productId: "123456789",
      productName: "Great Value Whole Milk 1 Gallon",
      lastPrice: "3.48",
    });
    expect(result).toHaveProperty("id");
    expect(mockUpsert).toHaveBeenCalledWith(expect.objectContaining({
      userId: 1,
      itemName: "Whole Milk",
      platform: "walmart",
      productId: "123456789",
    }));
  });

  it("returns mapping stats", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.shopAgent.mappings.stats();
    expect(result).toHaveProperty("total");
    expect(result).toHaveProperty("walmart");
    expect(result).toHaveProperty("amazon");
    expect(result).toHaveProperty("verified");
    expect(result.total).toBe(2);
  });

  it("deletes a product mapping", async () => {
    const { deleteProductMapping } = await import("./db");
    const mockDelete = deleteProductMapping as ReturnType<typeof vi.fn>;
    mockDelete.mockClear();

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await caller.shopAgent.mappings.delete({ id: 1 });
    expect(mockDelete).toHaveBeenCalledWith(1, 1);
  });
});


// ─── Auto-Learn Product IDs ───────────────────────────────────────
describe("shopAgent.learnFromSession", () => {
  it("learns product IDs from session items with matched URLs", async () => {
    const { getShoppingSession, getSessionItems, upsertProductMapping } = await import("./db");
    const mockGetSession = getShoppingSession as ReturnType<typeof vi.fn>;
    const mockGetItems = getSessionItems as ReturnType<typeof vi.fn>;
    const mockUpsert = upsertProductMapping as ReturnType<typeof vi.fn>;

    mockGetSession.mockResolvedValueOnce({
      id: 1, userId: 1, listId: 1, listName: "Weekly Walmart Shopping", status: "approved",
      totalItems: 2, createdAt: new Date(), updatedAt: new Date(),
    });
    mockGetItems.mockResolvedValueOnce([
      {
        id: 1, sessionId: 1, name: "Great Value Eggs", quantity: 1, assignedPlatform: "walmart",
        status: "added_to_cart", matchedProductName: "Great Value Large White Eggs 12 Count",
        matchedProductUrl: "https://www.walmart.com/ip/Great-Value-Large-White-Eggs/945193065",
        matchedPrice: "3.24", createdAt: new Date(), updatedAt: new Date(),
      },
      {
        id: 2, sessionId: 1, name: "Beeswax Wraps", quantity: 1, assignedPlatform: "amazon",
        status: "added_to_cart", matchedProductName: "Bee's Wrap Reusable Food Wraps",
        matchedProductUrl: "https://www.amazon.com/dp/B07CQ6Q52H",
        matchedPrice: "17.99", createdAt: new Date(), updatedAt: new Date(),
      },
    ]);
    mockUpsert.mockClear();

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.shopAgent.learnFromSession({ sessionId: 1 });

    expect(result.learned).toBeGreaterThanOrEqual(0);
    expect(result).toHaveProperty("message");
    expect(result).toHaveProperty("newMappings");
  });
});

describe("shopAgent.learnFromUrls", () => {
  it("parses Walmart and Amazon URLs and creates mappings", async () => {
    const { upsertProductMapping } = await import("./db");
    const mockUpsert = upsertProductMapping as ReturnType<typeof vi.fn>;
    mockUpsert.mockClear();

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.shopAgent.learnFromUrls({
      items: [
        {
          itemName: "Eggs",
          productUrl: "https://www.walmart.com/ip/Great-Value-Large-White-Eggs/945193065",
        },
        {
          itemName: "Beeswax Wraps",
          productUrl: "https://www.amazon.com/dp/B07CQ6Q52H",
        },
        {
          itemName: "Bad URL",
          productUrl: "https://www.google.com/search?q=eggs",
        },
      ],
    });

    expect(result.summary.total).toBe(3);
    expect(result.summary.learned).toBe(2);
    expect(result.summary.failed).toBe(1);
    expect(result.results).toHaveLength(3);

    // Walmart URL parsed correctly
    const walmartResult = result.results.find((r: any) => r.itemName === "Eggs");
    expect(walmartResult?.status).toBe("learned");
    expect(walmartResult?.platform).toBe("walmart");
    expect(walmartResult?.productId).toBe("945193065");

    // Amazon URL parsed correctly
    const amazonResult = result.results.find((r: any) => r.itemName === "Beeswax Wraps");
    expect(amazonResult?.status).toBe("learned");
    expect(amazonResult?.platform).toBe("amazon");
    expect(amazonResult?.productId).toBe("B07CQ6Q52H");

    // Bad URL fails gracefully
    const badResult = result.results.find((r: any) => r.itemName === "Bad URL");
    expect(badResult?.status).toBe("failed");
    expect(badResult?.reason).toBeTruthy();

    // Upsert called for the 2 valid URLs
    expect(mockUpsert).toHaveBeenCalledTimes(2);
  });
});
