import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, decimal, boolean, json, bigint, uniqueIndex, index, date } from "drizzle-orm/mysql-core";

// ═══════════════════════════════════════════════════════════════════════
// EXISTING SHOPPING MODULE TABLES
// ═══════════════════════════════════════════════════════════════════════

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "system_admin"]).default("user").notNull(),
  householdId: varchar("householdId", { length: 36 }),
  memberId: varchar("memberId", { length: 36 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  /** IANA timezone string from the user's device (e.g. "America/New_York"). Updated on every login/app load. */
  deviceTimezone: varchar("deviceTimezone", { length: 64 }),
  /** Human-readable city name resolved from device geolocation (optional). */
  deviceCity: varchar("deviceCity", { length: 128 }),
});
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const familyMembers = mysqlTable("family_members", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  relationship: varchar("relationship", { length: 100 }).notNull(),
  avatarUrl: text("avatarUrl"),
  clothingSizes: json("clothingSizes"),
  dietaryRestrictions: json("dietaryRestrictions"),
  preferences: json("preferences"),
  birthDate: varchar("birthDate", { length: 10 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type FamilyMember = typeof familyMembers.$inferSelect;
export type InsertFamilyMember = typeof familyMembers.$inferInsert;

export const shoppingLists = mysqlTable("shopping_lists", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 100 }),
  status: mysqlEnum("status", ["active", "completed", "archived"]).default("active").notNull(),
  isRecurring: boolean("isRecurring").default(false),
  recurringSchedule: varchar("recurringSchedule", { length: 100 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ShoppingList = typeof shoppingLists.$inferSelect;
export type InsertShoppingList = typeof shoppingLists.$inferInsert;

export const shoppingListItems = mysqlTable("shopping_list_items", {
  id: int("id").autoincrement().primaryKey(),
  listId: int("listId").notNull(),
  name: varchar("name", { length: 500 }).notNull(),
  quantity: int("quantity").default(1),
  unit: varchar("unit", { length: 50 }),
  category: varchar("category", { length: 100 }),
  notes: text("notes"),
  estimatedPrice: decimal("estimatedPrice", { precision: 10, scale: 2 }),
  currency: varchar("currency", { length: 3 }).default("USD"),
  preferredStore: varchar("preferredStore", { length: 100 }),
  productUrl: text("productUrl"),
  status: mysqlEnum("status", ["pending", "purchased", "skipped"]).default("pending").notNull(),
  forFamilyMemberId: int("forFamilyMemberId"),
  purchasedAt: timestamp("purchasedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ShoppingListItem = typeof shoppingListItems.$inferSelect;
export type InsertShoppingListItem = typeof shoppingListItems.$inferInsert;

export const bankAccounts = mysqlTable("bank_accounts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  householdId: varchar("householdId", { length: 36 }),
  institution: varchar("institution", { length: 255 }).notNull(),
  accountName: varchar("accountName", { length: 255 }).notNull(),
  accountType: mysqlEnum("accountType", ["checking", "savings", "credit_card", "business_checking", "business_savings", "business_credit"]).notNull(),
  category: mysqlEnum("category", ["personal", "business"]).default("personal").notNull(),
  currency: varchar("currency", { length: 3 }).default("USD").notNull(),
  lastFourDigits: varchar("lastFourDigits", { length: 4 }),
  currentBalance: decimal("currentBalance", { precision: 12, scale: 2 }).default("0"),
  verticalId: varchar("verticalId", { length: 36 }),
  isActive: boolean("isActive").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type BankAccount = typeof bankAccounts.$inferSelect;
export type InsertBankAccount = typeof bankAccounts.$inferInsert;

export const transactions = mysqlTable("transactions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  bankAccountId: int("bankAccountId"),
  description: varchar("description", { length: 500 }).notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).default("USD").notNull(),
  exchangeRate: decimal("exchangeRate", { precision: 10, scale: 4 }),
  type: mysqlEnum("type", ["expense", "income", "transfer"]).default("expense").notNull(),
  expenseCategory: varchar("expenseCategory", { length: 100 }),
  classification: mysqlEnum("classification", ["personal", "business"]).default("personal").notNull(),
  aiConfidence: int("aiConfidence"),
  isManualOverride: boolean("isManualOverride").default(false),
  vendor: varchar("vendor", { length: 255 }),
  platform: varchar("platform", { length: 100 }),
  receiptUrl: text("receiptUrl"),
  notes: text("notes"),
  isTaxDeductible: boolean("isTaxDeductible").default(false),
  taxCategory: varchar("taxCategory", { length: 100 }),
  transactionDate: timestamp("transactionDate").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = typeof transactions.$inferInsert;

export const orders = mysqlTable("orders", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  platform: varchar("platform", { length: 100 }),
  orderNumber: varchar("orderNumber", { length: 255 }),
  vendor: varchar("vendor", { length: 255 }),
  totalAmount: decimal("totalAmount", { precision: 12, scale: 2 }),
  currency: varchar("currency", { length: 3 }).default("USD"),
  status: mysqlEnum("status", ["pending", "shipped", "delivered", "cancelled"]).default("pending").notNull(),
  trackingNumber: varchar("trackingNumber", { length: 255 }),
  items: json("items"),
  importSource: mysqlEnum("importSource", ["email", "manual", "whatsapp"]).default("manual").notNull(),
  orderDate: timestamp("orderDate").notNull(),
  deliveryDate: timestamp("deliveryDate").defaultNow().notNull(),
});
export type Order = typeof orders.$inferSelect;
export type InsertOrder = typeof orders.$inferInsert;

export const exchangeRates = mysqlTable("exchange_rates", {
  id: int("id").autoincrement().primaryKey(),
  fromCurrency: varchar("fromCurrency", { length: 3 }).notNull(),
  toCurrency: varchar("toCurrency", { length: 3 }).notNull(),
  rate: decimal("rate", { precision: 10, scale: 4 }).notNull(),
  fetchedAt: timestamp("fetchedAt").defaultNow().notNull(),
});
export type ExchangeRate = typeof exchangeRates.$inferSelect;
export type InsertExchangeRate = typeof exchangeRates.$inferInsert;

export const whatsappImports = mysqlTable("whatsapp_imports", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  contactName: varchar("contactName", { length: 255 }),
  rawMessage: text("rawMessage").notNull(),
  parsedItems: json("parsedItems"),
  shoppingListId: varchar("shoppingListId"),
  importedAt: timestamp("importedAt").defaultNow().notNull(),
});
export type WhatsappImport = typeof whatsappImports.$inferSelect;
export type InsertWhatsappImport = typeof whatsappImports.$inferInsert;

export const shoppingSessions = mysqlTable("shopping_sessions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  listId: int("listId").notNull(),
  listName: varchar("listName", { length: 255 }).notNull(),
  status: mysqlEnum("status", ["pending_credentials", "ready", "preparing", "shopping", "awaiting_review", "approved", "completed", "cancelled"]).default("ready").notNull(),
  walmartTotal: decimal("walmartTotal", { precision: 12, scale: 2 }).default("0"),
  amazonTotal: decimal("amazonTotal", { precision: 12, scale: 2 }).default("0"),
  overallTotal: decimal("overallTotal", { precision: 12, scale: 2 }).default("0"),
  deliveryInfo: json("deliveryInfo"),
  totalItems: int("totalItems").default(0),
  itemsFound: int("itemsFound").default(0),
  itemsUnavailable: int("itemsUnavailable").default(0),
  itemsSubstituted: int("itemsSubstituted").default(0),
  itemsCrossTransferred: int("itemsCrossTransferred").default(0),
  notifications: json("notifications"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ShoppingSession = typeof shoppingSessions.$inferSelect;
export type InsertShoppingSession = typeof shoppingSessions.$inferInsert;

export const shoppingSessionItems = mysqlTable("shopping_session_items", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: varchar("sessionId", { length: 21 }).notNull(),
  listItemId: int("listItemId"),
  name: varchar("name", { length: 500 }).notNull(),
  quantity: int("quantity").default(1),
  unit: varchar("unit", { length: 50 }),
  category: varchar("category", { length: 100 }),
  notes: text("notes"),
  assignedPlatform: varchar("assignedPlatform", { length: 100 }).notNull(),
  sourcePlatform: varchar("sourcePlatform", { length: 100 }).notNull(),
  status: mysqlEnum("status", ["queued", "searching", "found", "added_to_cart", "unavailable", "substituted", "unavailable", "rejected"]).default("queued").notNull(),
  matchedProductName: varchar("matchedProductName", { length: 500 }),
  matchedProductUrl: text("matchedProductUrl"),
  matchedPrice: decimal("matchedPrice", { precision: 10, scale: 2 }),
  matchConfidence: int("matchConfidence"),
  substitutionReason: text("substitutionReason"),
  originalProductName: varchar("originalProductName", { length: 500 }),
  transferReason: varchar("transferReason", { length: 255 }),
  estimatedDelivery: varchar("estimatedDelivery", { length: 255 }),
  fulfillmentMethod: varchar("fulfillmentMethod", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ShoppingSessionItem = typeof shoppingSessionItems.$inferSelect;
export type InsertShoppingSessionItem = typeof shoppingSessionItems.$inferInsert;
