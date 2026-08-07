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
  platform: varchar("platform", { length: 100 }).notNull(),
  orderNumber: varchar("orderNumber", { length: 255 }),
  vendor: varchar("vendor", { length: 255 }),
  totalAmount: decimal("totalAmount", { precision: 12, scale: 2 }),
  currency: varchar("currency", { length: 3 }).default("USD"),
  status: mysqlEnum("status", ["pending", "shipped", "delivered", "cancelled", "returned"]).default("pending").notNull(),
  trackingNumber: varchar("trackingNumber", { length: 255 }),
  items: json("items"),
  importSource: mysqlEnum("importSource", ["email", "manual", "whatsapp"]).default("manual").notNull(),
  orderDate: timestamp("orderDate").notNull(),
  deliveryDate: timestamp("deliveryDate"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
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
  shoppingListId: int("shoppingListId"),
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
  sessionId: int("sessionId").notNull(),
  listItemId: int("listItemId"),
  name: varchar("name", { length: 500 }).notNull(),
  quantity: int("quantity").default(1),
  unit: varchar("unit", { length: 50 }),
  assignedPlatform: varchar("assignedPlatform", { length: 100 }).notNull(),
  originalPlatform: varchar("originalPlatform", { length: 100 }),
  status: mysqlEnum("status", ["queued", "searching", "found", "added_to_cart", "substituted", "unavailable", "transferred", "rejected"]).default("queued").notNull(),
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

export const platformCredentials = mysqlTable("platform_credentials", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  platform: varchar("platform", { length: 100 }).notNull(),
  credentialData: json("credentialData"),
  isActive: boolean("isActive").default(true),
  lastUsedAt: timestamp("lastUsedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type PlatformCredential = typeof platformCredentials.$inferSelect;
export type InsertPlatformCredential = typeof platformCredentials.$inferInsert;

export const chatMessages = mysqlTable("chat_messages", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  role: mysqlEnum("role", ["user", "assistant", "system"]).notNull(),
  content: text("content").notNull(),
  metadata: json("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type ChatMessage = typeof chatMessages.$inferSelect;
export type InsertChatMessage = typeof chatMessages.$inferInsert;

export const productMappings = mysqlTable("product_mappings", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  itemName: varchar("itemName", { length: 500 }).notNull(),
  normalizedName: varchar("normalizedName", { length: 500 }).notNull(),
  platform: varchar("platform", { length: 100 }).notNull(),
  productId: varchar("productId", { length: 255 }).notNull(),
  productName: varchar("productName", { length: 255 }),
  productUrl: text("productUrl"),
  lastPrice: decimal("lastPrice", { precision: 10, scale: 2 }),
  useCount: int("useCount").default(1),
  confidence: int("confidence").default(80),
  isVerified: boolean("isVerified").default(false),
  lastAvailable: timestamp("lastAvailable"),
  lastUsedAt: timestamp("lastUsedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ProductMapping = typeof productMappings.$inferSelect;
export type InsertProductMapping = typeof productMappings.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════
// GEEVES LIFE — MULTI-TENANT CALENDAR & HOUSEHOLD OS TABLES
// ═══════════════════════════════════════════════════════════════════════

export const households = mysqlTable("households", {
  id: varchar("id", { length: 36 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  createdByUserId: int("createdByUserId").notNull(),
  wakeWord: varchar("wakeWord", { length: 100 }).default("Geeves"),
  timezone: varchar("timezone", { length: 100 }).default("America/New_York").notNull(),
  groupName: varchar("groupName", { length: 100 }).default("Household"),
  settings: json("settings"),
  eaCanManageAccess: boolean("eaCanManageAccess").default(true).notNull(),
  /** v2.2 §2.5 (HIGH-4): reporting currency for the consolidated ledger. Global = USD. */
  reportingCurrency: varchar("reportingCurrency", { length: 3 }).default("USD").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Household = typeof households.$inferSelect;
export type InsertHousehold = typeof households.$inferInsert;

export const householdMembers = mysqlTable("household_members", {
  id: varchar("id", { length: 36 }).primaryKey(),
  householdId: varchar("householdId", { length: 36 }).notNull(),
  userId: int("userId"),
  displayName: varchar("displayName", { length: 255 }).notNull(),
  googleName: varchar("googleName", { length: 255 }),
  email: varchar("email", { length: 320 }),
  avatarUrl: text("avatarUrl"),
  photoUrl: text("photoUrl"),
  role: mysqlEnum("role", ["household_admin", "ea", "member", "caregiver", "child", "elder"]).default("member").notNull(),
  pronouns: varchar("pronouns", { length: 100 }),
  genderIdentity: varchar("genderIdentity", { length: 100 }),
  relationshipLabel: varchar("relationshipLabel", { length: 100 }),
  isBillingContact: boolean("isBillingContact").default(false),
  accessibilityMode: mysqlEnum("accessibilityMode", ["standard", "picture_board", "large_text", "voice_only"]).default("standard"),
  status: mysqlEnum("status", ["invited", "active", "inactive", "removed"]).default("invited").notNull(),
  inviteToken: varchar("inviteToken", { length: 128 }),
  inviteTokenExpiresAt: timestamp("inviteTokenExpiresAt"),
  invitedAt: timestamp("invitedAt"),
  joinedAt: timestamp("joinedAt"),
  invitedByMemberId: varchar("invitedByMemberId", { length: 36 }),
  customRoleId: varchar("customRoleId", { length: 36 }),
  pendingVerticals: json("pendingVerticals").$type<string[]>().default([]),
  geevesAccess: boolean("geevesAccess").default(true).notNull(),
  dob: varchar("dob", { length: 10 }),
  phoneNumbers: json("phoneNumbers").$type<Array<{ label: string; number: string }>>(),
  clothingSizes: json("clothingSizes").$type<{ top?: string; bottom?: string; shoe?: string; dress?: string }>(),
  dietaryRestrictions: text("dietaryRestrictions"),
  memberPreferences: json("memberPreferences").$type<{ favoriteColors?: string[]; favoriteBrands?: string[]; notes?: string }>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type HouseholdMember = typeof householdMembers.$inferSelect;
export type InsertHouseholdMember = typeof householdMembers.$inferInsert;

export const verticals = mysqlTable("verticals", {
  id: varchar("id", { length: 36 }).primaryKey(),
  householdId: varchar("householdId", { length: 36 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  icon: varchar("icon", { length: 100 }),
  color: varchar("color", { length: 20 }),
  description: text("description"),
  isActive: boolean("isActive").default(true),
  sortOrder: int("sortOrder").default(0),
  ownerMemberId: varchar("ownerMemberId", { length: 36 }),
  privacyLevel: mysqlEnum("privacyLevel", ["household", "admin_only", "private"]).default("household").notNull(),
  busyLabel: varchar("busyLabel", { length: 50 }).default("Busy"),
  /** v2.2 §2.3: canonical registry code (MB/MM/BL/PERS/FAM/GL/SO/BLab/TJPGG/REV/MULTI).
   *  Codes are the human/cross-document vocabulary; UUIDs remain storage keys (invariant 13). */
  code: varchar("code", { length: 16 }),
  /** v2.2 §2.3: REV + MULTI are system buckets — never user-selectable, never post. */
  isSystemBucket: boolean("isSystemBucket").default(false).notNull(),
  /** v2.2 §2.5 (HIGH-4): per-vertical reporting currency (e.g. BL = JMD, MM = USD). */
  reportingCurrency: varchar("reportingCurrency", { length: 3 }),
  /** v2.2 §4.4: cross-vertical redaction placeholder (shadow_blocks busyLabel precedent). */
  financeRedactedLabel: varchar("financeRedactedLabel", { length: 100 }).default("Internal — Personal"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  codeUniq: uniqueIndex("verticals_code_uniq").on(t.code),
}));
export type Vertical = typeof verticals.$inferSelect;
export type InsertVertical = typeof verticals.$inferInsert;

export const calendars = mysqlTable("calendars", {
  id: varchar("id", { length: 36 }).primaryKey(),
  householdId: varchar("householdId", { length: 36 }).notNull(),
  memberId: varchar("memberId", { length: 36 }).notNull(),
  verticalId: varchar("verticalId", { length: 36 }),
  provider: mysqlEnum("provider", ["google_workspace", "google_personal", "ical", "manual"]).notNull(),
  externalId: varchar("externalId", { length: 500 }),
  accountEmail: varchar("accountEmail", { length: 320 }),
  name: varchar("name", { length: 255 }).notNull(),
  color: varchar("color", { length: 20 }),
  syncType: mysqlEnum("syncType", ["push", "poll", "manual"]).default("push").notNull(),
  pollIntervalMinutes: int("pollIntervalMinutes").default(15),
  syncToken: text("syncToken"),
  lastSyncAt: timestamp("lastSyncAt"),
  syncStatus: mysqlEnum("syncStatus", ["active", "error", "paused"]).default("active"),
  syncError: text("syncError"),
  accessLevel: mysqlEnum("accessLevel", ["read_write", "read_only", "free_busy"]).default("read_write").notNull(),
  isPrimary: boolean("isPrimary").default(false),
  isVisible: boolean("isVisible").default(true),
  shadowBlocking: boolean("shadowBlocking").default(true),
  shadowSource: boolean("shadowSource").default(true),
  noGoogleWrite: boolean("noGoogleWrite").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Calendar = typeof calendars.$inferSelect;
export type InsertCalendar = typeof calendars.$inferInsert;

export const events = mysqlTable("events", {
  id: varchar("id", { length: 36 }).primaryKey(),
  householdId: varchar("householdId", { length: 36 }).notNull(),
  calendarId: varchar("calendarId", { length: 36 }).notNull(),
  externalId: varchar("externalId", { length: 500 }),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  location: varchar("location", { length: 500 }),
  startTime: bigint("startTime", { mode: "number" }).notNull(),
  endTime: bigint("endTime", { mode: "number" }).notNull(),
  isAllDay: boolean("isAllDay").default(false),
  recurrenceRule: text("recurrenceRule"),
  recurringEventId: varchar("recurringEventId", { length: 36 }),
  status: mysqlEnum("status", ["confirmed", "tentative", "cancelled"]).default("confirmed").notNull(),
  visibility: mysqlEnum("visibility", ["default", "public", "private", "confidential"]).default("default"),
  attendees: json("attendees"),
  reminders: json("reminders"),
  createdBy: varchar("createdBy", { length: 36 }),
  lastModifiedBy: varchar("lastModifiedBy", { length: 36 }),
  source: mysqlEnum("source", ["sync", "manual", "voice", "import", "shadow"]).default("sync"),
  isShadowBlock: boolean("isShadowBlock").default(false),
  version: int("version").default(1),
  etag: varchar("etag", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  householdTimeIdx: index("events_household_time_idx").on(t.householdId, t.startTime, t.endTime),
  calendarStartIdx: index("events_calendar_start_idx").on(t.calendarId, t.startTime),
  calendarExternalUniq: uniqueIndex("events_calendar_external_uniq").on(t.calendarId, t.externalId),
}));
export type Event = typeof events.$inferSelect;
export type InsertEvent = typeof events.$inferInsert;

export const shadowBlocks = mysqlTable("shadow_blocks", {
  id: varchar("id", { length: 36 }).primaryKey(),
  householdId: varchar("householdId", { length: 36 }).notNull(),
  sourceEventId: varchar("sourceEventId", { length: 36 }).notNull(),
  sourceCalendarId: varchar("sourceCalendarId", { length: 36 }).notNull(),
  targetCalendarId: varchar("targetCalendarId", { length: 36 }).notNull(),
  maskedTitle: varchar("maskedTitle", { length: 500 }).default("Busy"),
  startTime: bigint("startTime", { mode: "number" }),
  endTime: bigint("endTime", { mode: "number" }),
  isAllDay: boolean("isAllDay").default(false),
  isDismissed: boolean("isDismissed").default(false),
  dismissedAt: timestamp("dismissedAt"),
  externalEventId: varchar("externalEventId", { length: 500 }),
  syncStatus: mysqlEnum("sync_status", ["pending_sync", "synced", "sync_failed"]).notNull().default("pending_sync"),
  syncAttempts: int("sync_attempts").notNull().default(0),
  lastSyncError: text("last_sync_error"),
  lastSyncAttemptAt: bigint("last_sync_attempt_at", { mode: "number" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  uniqSourceTarget: uniqueIndex("shadow_blocks_source_target_uniq").on(t.sourceEventId, t.targetCalendarId),
  householdTimeIdx: index("sb_household_time_idx").on(t.householdId, t.startTime, t.endTime),
}));
export type ShadowBlock = typeof shadowBlocks.$inferSelect;
export type InsertShadowBlock = typeof shadowBlocks.$inferInsert;

export const properties = mysqlTable("properties", {
  id: varchar("id", { length: 36 }).primaryKey(),
  householdId: varchar("householdId", { length: 36 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  address: text("address"),
  type: mysqlEnum("type", ["primary_residence", "rental_str", "rental_ltr", "vacation", "commercial", "investment", "other"]).default("rental_str"),
  icalUrl: text("icalUrl"),
  calendarId: varchar("calendarId", { length: 36 }),
  verticalId: varchar("verticalId", { length: 36 }),
  propertyEmail: varchar("propertyEmail", { length: 320 }),
  outboundIcsKey: text("outboundIcsKey"),
  outboundIcsUrl: text("outboundIcsUrl"),
  leaseDocUrl: text("leaseDocUrl"),
  leaseDocKey: text("leaseDocKey"),
  monthlyRent: decimal("monthlyRent", { precision: 12, scale: 2 }),
  rentCurrency: varchar("rentCurrency", { length: 3 }).default("USD"),
  settings: json("settings"),
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  country: varchar("country", { length: 2 }),
  timezone: varchar("timezone", { length: 64 }).default("America/New_York"),
  isActive: boolean("isActive").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Property = typeof properties.$inferSelect;
export type InsertProperty = typeof properties.$inferInsert;

export const devices = mysqlTable("devices", {
  id: varchar("id", { length: 36 }).primaryKey(),
  householdId: varchar("householdId", { length: 36 }).notNull(),
  propertyId: varchar("propertyId", { length: 36 }),
  name: varchar("name", { length: 255 }).notNull(),
  type: mysqlEnum("type", ["lock", "camera", "thermostat", "hvac_puck", "light", "sensor", "other"]).notNull(),
  provider: mysqlEnum("provider", ["seam", "flair", "manual"]).default("seam"),
  externalId: varchar("externalId", { length: 255 }),
  location: varchar("location", { length: 255 }),
  currentState: json("currentState"),
  status: mysqlEnum("status", ["online", "offline", "error", "setup"]).default("setup"),
  lastSeenAt: timestamp("lastSeenAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Device = typeof devices.$inferSelect;
export type InsertDevice = typeof devices.$inferInsert;

export const notes = mysqlTable("notes", {
  id: varchar("id", { length: 36 }).primaryKey(),
  householdId: varchar("householdId", { length: 36 }).notNull(),
  memberId: varchar("memberId", { length: 36 }).notNull(),
  verticalId: varchar("verticalId", { length: 36 }),
  eventId: varchar("eventId", { length: 36 }),
  content: text("content").notNull(),
  source: mysqlEnum("source", ["voice", "text", "tablet", "phone"]).default("text").notNull(),
  reminderAt: bigint("reminderAt", { mode: "number" }),
  isCompleted: boolean("isCompleted").default(false),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Note = typeof notes.$inferSelect;
export type InsertNote = typeof notes.$inferInsert;

export const oauthTokens = mysqlTable("oauth_tokens", {
  id: varchar("id", { length: 36 }).primaryKey(),
  householdId: varchar("householdId", { length: 36 }).notNull(),
  memberId: varchar("memberId", { length: 36 }).notNull(),
  provider: varchar("provider", { length: 50 }).notNull(),
  accountEmail: varchar("accountEmail", { length: 320 }).notNull(),
  accessToken: text("accessToken").notNull(),
  refreshToken: text("refreshToken"),
  expiresAt: bigint("expiresAt", { mode: "number" }),
  scopes: text("scopes"),
  purposes: json("purposes").$type<string[]>().default([]),
  displayName: varchar("displayName", { length: 100 }),
  status: mysqlEnum("status", ["active", "expired", "revoked"]).default("active"),
  lastRefreshedAt: timestamp("lastRefreshedAt"),
  expiredNotifiedAt: timestamp("expiredNotifiedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type OAuthToken = typeof oauthTokens.$inferSelect;
export type InsertOAuthToken = typeof oauthTokens.$inferInsert;

export const subscriptions = mysqlTable("subscriptions", {
  id: varchar("id", { length: 36 }).primaryKey(),
  householdId: varchar("householdId", { length: 36 }).notNull(),
  plan: mysqlEnum("plan", ["free", "premium"]).default("free").notNull(),
  seatsIncluded: int("seatsIncluded").default(5),
  seatsUsed: int("seatsUsed").default(1),
  additionalSeats: int("additionalSeats").default(0),
  addOns: json("addOns"),
  stripeCustomerId: varchar("stripeCustomerId", { length: 255 }),
  stripeSubscriptionId: varchar("stripeSubscriptionId", { length: 255 }),
  status: mysqlEnum("status", ["active", "past_due", "cancelled", "trialing"]).default("trialing").notNull(),
  currentPeriodStart: bigint("currentPeriodStart", { mode: "number" }),
  currentPeriodEnd: bigint("currentPeriodEnd", { mode: "number" }),
  cancelledAt: timestamp("cancelledAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscription = typeof subscriptions.$inferInsert;

export const webhookChannels = mysqlTable("webhook_channels", {
  id: varchar("id", { length: 36 }).primaryKey(),
  householdId: varchar("householdId", { length: 36 }).notNull(),
  calendarId: varchar("calendarId", { length: 36 }).notNull(),
  resourceId: varchar("resourceId", { length: 255 }),
  resourceUri: text("resourceUri"),
  notificationUrl: varchar("notificationUrl", { length: 512 }),
  expiresAt: bigint("expiresAt", { mode: "number" }).notNull(),
  token: varchar("token", { length: 255 }),
  status: mysqlEnum("status", ["active", "expired", "stopped"]).default("active"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type WebhookChannel = typeof webhookChannels.$inferSelect;
export type InsertWebhookChannel = typeof webhookChannels.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════
// VERTICALS SYSTEM — Ownership, Integrations, Cross-Vertical Visibility
// ═══════════════════════════════════════════════════════════════════════

export const verticalOwners = mysqlTable("vertical_owners", {
  id: varchar("id", { length: 36 }).primaryKey(),
  verticalId: varchar("verticalId", { length: 36 }).notNull(),
  userId: int("userId").notNull(),
  role: mysqlEnum("role", ["owner", "member"]).default("owner").notNull(),
  /** v2.2 §4.1 (D9): vertical co-admin definition. Operational ownership and
   *  financial ownership are separable — a property manager can run BL calendars
   *  with zero P&L visibility. */
  isFinancialOwner: boolean("isFinancialOwner").default(false).notNull(),
  addedByUserId: int("addedByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type VerticalOwner = typeof verticalOwners.$inferSelect;
export type InsertVerticalOwner = typeof verticalOwners.$inferInsert;

export const verticalIntegrations = mysqlTable("vertical_integrations", {
  id: varchar("id", { length: 36 }).primaryKey(),
  verticalId: varchar("verticalId", { length: 36 }).notNull(),
  householdId: varchar("householdId", { length: 36 }).notNull(),
  memberId: varchar("memberId", { length: 36 }).notNull(),
  integrationType: mysqlEnum("integrationType", ["calendar", "email", "task", "security", "other"]).notNull(),
  provider: varchar("provider", { length: 100 }).notNull(),
  accountEmail: varchar("accountEmail", { length: 320 }),
  displayName: varchar("displayName", { length: 255 }),
  calendarId: varchar("calendarId", { length: 36 }),
  status: mysqlEnum("status", ["active", "pending", "error", "disconnected"]).default("active").notNull(),
  metadata: json("metadata"),
  lastSyncAt: timestamp("lastSyncAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type VerticalIntegration = typeof verticalIntegrations.$inferSelect;
export type InsertVerticalIntegration = typeof verticalIntegrations.$inferInsert;

export const verticalVisibility = mysqlTable("vertical_visibility", {
  id: varchar("id", { length: 36 }).primaryKey(),
  fromVerticalId: varchar("fromVerticalId", { length: 36 }).notNull(),
  toVerticalId: varchar("toVerticalId", { length: 36 }).notNull(),
  visibilityLevel: mysqlEnum("visibilityLevel", ["none", "busy_only", "full"]).default("busy_only").notNull(),
  busyLabel: varchar("busyLabel", { length: 50 }).default("Busy"),
  calendarExclusions: json("calendarExclusions").$type<string[]>().default([]),
  configuredByUserId: int("configuredByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type VerticalVisibility = typeof verticalVisibility.$inferSelect;
export type InsertVerticalVisibility = typeof verticalVisibility.$inferInsert;

export const shadowOverrides = mysqlTable("shadow_overrides", {
  id: varchar("id", { length: 36 }).primaryKey(),
  eventId: varchar("eventId", { length: 36 }).notNull(),
  calendarId: varchar("calendarId", { length: 36 }).notNull(),
  action: mysqlEnum("action", ["include", "exclude"]).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type ShadowOverride = typeof shadowOverrides.$inferSelect;
export type InsertShadowOverride = typeof shadowOverrides.$inferInsert;

export const bookingRequests = mysqlTable("booking_requests", {
  id: varchar("id", { length: 36 }).primaryKey(),
  householdId: varchar("householdId", { length: 36 }).notNull(),
  requestorMemberId: varchar("requestorMemberId", { length: 36 }).notNull(),
  targetVerticalId: varchar("targetVerticalId", { length: 36 }).notNull(),
  targetCalendarId: varchar("targetCalendarId", { length: 36 }),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  location: varchar("location", { length: 500 }),
  startTime: bigint("startTime", { mode: "number" }).notNull(),
  endTime: bigint("endTime", { mode: "number" }).notNull(),
  status: mysqlEnum("status", ["pending", "approved", "declined", "cancelled"]).default("pending").notNull(),
  createdEventId: varchar("createdEventId", { length: 36 }),
  responseNote: text("responseNote"),
  respondedByMemberId: varchar("respondedByMemberId", { length: 36 }),
  respondedAt: bigint("respondedAt", { mode: "number" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type BookingRequest = typeof bookingRequests.$inferSelect;
export type InsertBookingRequest = typeof bookingRequests.$inferInsert;

export const propertyPlatforms = mysqlTable("property_platforms", {
  id: varchar("id", { length: 36 }).primaryKey(),
  propertyId: varchar("propertyId", { length: 36 }).notNull(),
  platform: mysqlEnum("platform", ["airbnb", "vrbo", "booking_com", "direct", "zillow", "apartments_com", "other"]).notNull(),
  displayName: varchar("displayName", { length: 255 }),
  icalUrl: text("icalUrl").notNull(),
  notificationEmail: varchar("notificationEmail", { length: 320 }),
  emailScrapingEnabled: boolean("emailScrapingEnabled").default(false),
  lastEmailScrapedAt: bigint("lastEmailScrapedAt", { mode: "number" }),
  emailNotificationEmailPrev: varchar("emailNotificationEmailPrev", { length: 320 }),
  lastPolledAt: bigint("lastPolledAt", { mode: "number" }),
  lastError: text("lastError"),
  isActive: boolean("isActive").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type PropertyPlatform = typeof propertyPlatforms.$inferSelect;
export type InsertPropertyPlatform = typeof propertyPlatforms.$inferInsert;

export const propertyPrepRules = mysqlTable("property_prep_rules", {
  id: varchar("id", { length: 36 }).primaryKey(),
  propertyId: varchar("propertyId", { length: 36 }).notNull(),
  blockDaysBefore: int("blockDaysBefore").default(0).notNull(),
  blockDaysAfter: int("blockDaysAfter").default(1).notNull(),
  blockNationalHolidays: boolean("blockNationalHolidays").default(false),
  blockSundays: boolean("blockSundays").default(false),
  customBlockDates: json("customBlockDates"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type PropertyPrepRule = typeof propertyPrepRules.$inferSelect;
export type InsertPropertyPrepRule = typeof propertyPrepRules.$inferInsert;

export const propertyBookings = mysqlTable("property_bookings", {
  id: varchar("id", { length: 36 }).primaryKey(),
  propertyId: varchar("propertyId", { length: 36 }).notNull(),
  platformId: varchar("platformId", { length: 36 }).notNull(),
  icalUid: varchar("icalUid", { length: 500 }),
  bookingType: mysqlEnum("bookingType", ["booking", "block", "unavailable"]).default("booking").notNull(),
  blockReason: varchar("blockReason", { length: 50 }),
  summary: varchar("summary", { length: 500 }),
  description: text("description"),
  checkIn: bigint("checkIn", { mode: "number" }).notNull(),
  checkOut: bigint("checkOut", { mode: "number" }).notNull(),
  guestName: varchar("guestName", { length: 255 }),
  guestEmail: varchar("guestEmail", { length: 320 }),
  guestPhone: varchar("guestPhone", { length: 50 }),
  confirmationNumber: varchar("confirmationNumber", { length: 50 }),
  totalPrice: decimal("totalPrice", { precision: 12, scale: 2 }),
  commissionAmount: decimal("commissionAmount", { precision: 12, scale: 2 }),
  netAmount: decimal("netAmount", { precision: 12, scale: 2 }),
  currency: varchar("currency", { length: 3 }).default("USD"),
  taxRemittedByPlatform: decimal("taxRemittedByPlatform", { precision: 12, scale: 2 }),
  taxOwedByHost: decimal("taxOwedByHost", { precision: 12, scale: 2 }),
  taxJurisdiction: varchar("taxJurisdiction", { length: 50 }),
  passThroughTax: decimal("passThroughTax", { precision: 12, scale: 2 }),
  payoutDate: bigint("payoutDate", { mode: "number" }),
  payoutBankAccount: varchar("payoutBankAccount", { length: 100 }),
  financialSource: mysqlEnum("financialSource", [
    "email_scrape", "platform_export", "manual", "screenshot_ocr", "channex_api"
  ]),
  revenueAmount: decimal("revenueAmount", { precision: 12, scale: 2 }),
  revenueCurrency: varchar("revenueCurrency", { length: 3 }).default("USD"),
  guestCount: int("guestCount"),
  cleaningFee: decimal("cleaningFee", { precision: 12, scale: 2 }),
  platformBookingUrl: text("platformBookingUrl"),
  rawEmailSubject: varchar("rawEmailSubject", { length: 500 }),
  rawEmailDate: bigint("rawEmailDate", { mode: "number" }),
  emailScrapeSource: varchar("emailScrapeSource", { length: 64 }),
  scrapeConfidence: int("scrapeConfidence"),
  lastEnrichedAt: bigint("lastEnrichedAt", { mode: "number" }),
  bookingStatus: mysqlEnum("bookingStatus", ["confirmed", "cancelled"]).default("confirmed").notNull(),
  cancelledAt: bigint("cancelledAt", { mode: "number" }),
  cancellationSource: varchar("cancellationSource", { length: 64 }),
  hasConflict: boolean("hasConflict").default(false),
  conflictWith: varchar("conflictWith", { length: 36 }),
  dataSource: mysqlEnum("dataSource", ["ical_only", "email_only", "both"]).default("ical_only").notNull(),
  emailCheckIn: bigint("emailCheckIn", { mode: "number" }),
  emailCheckOut: bigint("emailCheckOut", { mode: "number" }),
  pendingCancellationSource: varchar("pendingCancellationSource", { length: 10 }),
  pendingCancellationAt: bigint("pendingCancellationAt", { mode: "number" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  propertyIdCheckInIdx: index("pb_propertyId_checkIn_idx").on(t.propertyId, t.checkIn),
  platformIdIdx: index("pb_platformId_idx").on(t.platformId),
  icalUidIdx: index("pb_icalUid_idx").on(t.icalUid),
}));
export type PropertyBooking = typeof propertyBookings.$inferSelect;
export type InsertPropertyBooking = typeof propertyBookings.$inferInsert;

export const syncLog = mysqlTable("sync_log", {
  id: int("id").autoincrement().primaryKey(),
  householdId: varchar("householdId", { length: 36 }).notNull(),
  calendarId: varchar("calendarId", { length: 36 }).notNull(),
  action: mysqlEnum("action", ["full_sync", "incremental_sync", "webhook_received", "event_created", "event_updated", "event_deleted", "shadow_created", "shadow_dismissed", "conflict_resolved", "error"]).notNull(),
  details: json("details"),
  eventsAffected: int("eventsAffected").default(0),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type SyncLogEntry = typeof syncLog.$inferSelect;
export type InsertSyncLogEntry = typeof syncLog.$inferInsert;

export const projectKnowledge = mysqlTable("project_knowledge", {
  id: int("id").autoincrement().primaryKey(),
  category: varchar("category", { length: 64 }).notNull(),
  key: varchar("key", { length: 128 }).notNull(),
  value: text("value").notNull(),
  sourceDoc: varchar("sourceDoc", { length: 256 }),
  notes: text("notes"),
  lastReviewedAt: timestamp("lastReviewedAt"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type ProjectKnowledge = typeof projectKnowledge.$inferSelect;
export type InsertProjectKnowledge = typeof projectKnowledge.$inferInsert;

export const bookingOverrides = mysqlTable("booking_overrides", {
  id: varchar("id", { length: 36 }).primaryKey(),
  bookingId: varchar("bookingId", { length: 36 }).notNull(),
  guestName: varchar("guestName", { length: 255 }),
  guestEmail: varchar("guestEmail", { length: 320 }),
  notes: text("notes"),
  createdBy: varchar("createdBy", { length: 36 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type BookingOverride = typeof bookingOverrides.$inferSelect;
export type InsertBookingOverride = typeof bookingOverrides.$inferInsert;

// NOTE (v2.2 HIGH-5): audit_log.category is varchar(64), not an enum as the Manus
// review assumed — 'financial' is therefore a valid category with NO schema change.
export const auditLog = mysqlTable("audit_log", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  actorUserId: int("actorUserId"),
  actorOpenId: varchar("actorOpenId", { length: 64 }),
  actorEmail: varchar("actorEmail", { length: 320 }),
  actorName: varchar("actorName", { length: 255 }),
  actorType: mysqlEnum("actorType", ["user", "system", "geeves_ai", "scheduled_job", "system_extension"]).default("user"),
  householdId: varchar("householdId", { length: 36 }),
  verticalId: varchar("verticalId", { length: 21 }),
  action: varchar("action", { length: 128 }).notNull(),
  category: varchar("category", { length: 64 }).notNull(),
  resourceType: varchar("resourceType", { length: 64 }),
  resourceId: varchar("resourceId", { length: 128 }),
  outcome: mysqlEnum("outcome", ["success", "failure", "denied"]).notNull().default("success"),
  metadata: json("metadata"),
  previousValue: text("previousValue"),
  newValue: text("newValue"),
  ipAddress: varchar("ipAddress", { length: 64 }),
  userAgent: text("userAgent"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  actorIdx: index("audit_log_actor_idx").on(t.actorUserId),
  householdIdx: index("audit_log_household_idx").on(t.householdId),
  actionIdx: index("audit_log_action_idx").on(t.action),
  createdAtIdx: index("audit_log_created_at_idx").on(t.createdAt),
  verticalIdx: index("audit_log_vertical_idx").on(t.verticalId, t.createdAt),
  resourceIdx: index("audit_log_resource_idx").on(t.resourceType, t.resourceId),
}));
export type AuditLog = typeof auditLog.$inferSelect;
export type InsertAuditLog = typeof auditLog.$inferInsert;

export const projectTasks = mysqlTable("project_tasks", {
  id: int("id").autoincrement().primaryKey(),
  phase: varchar("phase", { length: 32 }).notNull().default("1"),
  area: varchar("area", { length: 64 }).notNull(),
  bucket: varchar("bucket", { length: 128 }),
  title: varchar("title", { length: 512 }).notNull(),
  titleHash: varchar("titleHash", { length: 64 }).notNull(),
  status: mysqlEnum("status", ["todo", "in_progress", "done", "deferred", "blocked"]).notNull().default("todo"),
  priority: mysqlEnum("priority", ["critical", "high", "medium", "low"]).notNull().default("medium"),
  notes: text("notes"),
  deferredReason: varchar("deferredReason", { length: 512 }),
  sourceDoc: varchar("sourceDoc", { length: 256 }),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  titleHashIdx: uniqueIndex("project_tasks_title_hash_idx").on(t.titleHash),
  statusIdx: index("project_tasks_status_idx").on(t.status),
  areaIdx: index("project_tasks_area_idx").on(t.area),
  phaseIdx: index("project_tasks_phase_idx").on(t.phase),
}));
export type ProjectTask = typeof projectTasks.$inferSelect;
export type InsertProjectTask = typeof projectTasks.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════
// FINANCIAL MODULE — Chart of Accounts, Expenses, Vendor Orders
// ═══════════════════════════════════════════════════════════════════════

export const expenseCategorizationRules = mysqlTable("expense_categorization_rules", {
  id: varchar("id", { length: 21 }).primaryKey(),
  verticalId: varchar("verticalId", { length: 36 }),
  propertyId: varchar("propertyId", { length: 36 }),
  name: varchar("name", { length: 255 }).notNull(),
  pattern: varchar("pattern", { length: 255 }).notNull(),
  patternType: mysqlEnum("patternType", ["exact", "contains", "starts_with", "regex"]).notNull(),
  glAccountCode: varchar("glAccountCode", { length: 50 }),
  isActive: boolean("isActive").default(true),
  priority: int("priority").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ExpenseCategorizationRule = typeof expenseCategorizationRules.$inferSelect;
export type InsertExpenseCategorizationRule = typeof expenseCategorizationRules.$inferInsert;

export const vendorOrders = mysqlTable("vendor_orders", {
  id: varchar("id", { length: 21 }).primaryKey(),
  householdId: varchar("householdId", { length: 36 }).notNull(),
  memberId: varchar("memberId", { length: 36 }),
  vendor: varchar("vendor", { length: 255 }).notNull(),
  orderNumber: varchar("orderNumber", { length: 255 }),
  totalAmount: decimal("totalAmount", { precision: 12, scale: 2 }),
  currency: varchar("currency", { length: 3 }).default("USD"),
  taxAmount: decimal("taxAmount", { precision: 12, scale: 2 }),
  description: text("description"),
  sourceType: mysqlEnum("sourceType", ["email_scrape", "manual", "receipt_upload"]).notNull(),
  emailSubject: varchar("emailSubject", { length: 500 }),
  emailReceivedAt: timestamp("emailReceivedAt"),
  rawEmailBody: text("rawEmailBody"),
  lineItems: json("lineItems"),
  shippingAddress: text("shippingAddress"),
  trackingNumber: varchar("trackingNumber", { length: 255 }),
  status: mysqlEnum("status", ["pending_review", "approved", "rejected", "auto_categorized"]).default("pending_review").notNull(),
  glAccountCode: varchar("glAccountCode", { length: 50 }),
  verticalId: varchar("verticalId", { length: 36 }),
  propertyId: varchar("propertyId", { length: 36 }),
  categoryAppliedBy: mysqlEnum("categoryAppliedBy", ["manual", "rule", "ai"]),
  receiptUrl: varchar("receiptUrl", { length: 500 }),
  expenseId: varchar("expenseId", { length: 21 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type VendorOrder = typeof vendorOrders.$inferSelect;
export type InsertVendorOrder = typeof vendorOrders.$inferInsert;

export const expenses = mysqlTable("expenses", {
  id: varchar("id", { length: 21 }).primaryKey(),
  householdId: varchar("householdId", { length: 36 }).notNull(),
  memberId: varchar("memberId", { length: 36 }),
  vendorOrderId: varchar("vendorOrderId", { length: 21 }),
  bankAccountId: int("bankAccountId"),
  paymentAccountId: varchar("paymentAccountId", { length: 36 }),
  glAccountCode: varchar("glAccountCode", { length: 50 }),
  verticalId: varchar("verticalId", { length: 36 }),
  propertyId: varchar("propertyId", { length: 36 }),
  description: varchar("description", { length: 500 }).notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).default("USD").notNull(),
  exchangeRate: decimal("exchangeRate", { precision: 10, scale: 4 }),
  taxAmount: decimal("taxAmount", { precision: 12, scale: 2 }),
  taxCategory: varchar("taxCategory", { length: 100 }),
  vendor: varchar("vendor", { length: 255 }),
  expenseDate: timestamp("expenseDate").notNull(),
  receiptUrl: varchar("receiptUrl", { length: 500 }),
  notes: text("notes"),
  isTaxDeductible: boolean("isTaxDeductible").default(false),
  isReimbursable: boolean("isReimbursable").default(false),
  reimbursedAmount: decimal("reimbursedAmount", { precision: 12, scale: 2 }),
  reimbursementDate: timestamp("reimbursementDate"),
  qboExportStatus: mysqlEnum("qboExportStatus", ["pending", "exported", "failed", "not_applicable"]).default("not_applicable"),
  qboExportDate: timestamp("qboExportDate"),
  qboTransactionId: varchar("qboTransactionId", { length: 255 }),
  status: mysqlEnum("status", ["pending", "approved", "rejected"]).default("pending").notNull(),
  approvedBy: varchar("approvedBy", { length: 36 }),
  approvedAt: timestamp("approvedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Expense = typeof expenses.$inferSelect;
export type InsertExpense = typeof expenses.$inferInsert;

export const propertyExpenseRecords = mysqlTable("property_expense_records", {
  id: varchar("id", { length: 21 }).primaryKey(),
  householdId: varchar("householdId", { length: 36 }).notNull(),
  propertyId: varchar("propertyId", { length: 36 }).notNull(),
  memberId: varchar("memberId", { length: 36 }),
  description: varchar("description", { length: 500 }).notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).default("JMD").notNull(),
  exchangeRate: decimal("exchangeRate", { precision: 10, scale: 4 }),
  usdEquivalent: decimal("usdEquivalent", { precision: 12, scale: 2 }),
  expenseDate: timestamp("expenseDate").notNull(),
  vendor: varchar("vendor", { length: 255 }),
  receiptUrl: varchar("receiptUrl", { length: 500 }),
  notes: text("notes"),
  isTaxDeductible: boolean("isTaxDeductible").default(false),
  glAccountCode: varchar("glAccountCode", { length: 50 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type PropertyExpenseRecord = typeof propertyExpenseRecords.$inferSelect;
export type InsertPropertyExpenseRecord = typeof propertyExpenseRecords.$inferInsert;

// NOTE (v2.2 D8/CRITICAL-2): chart_of_accounts is the CANONICAL production chart.
// Staging gl_accounts is an import source only. Account-level tax columns below are
// DEFAULTS; journal_lines.taxFormLine/isTaxRelevant are line-level OVERRIDES.
// Precedence: line value wins; absent line value falls back to account default.
export const chartOfAccounts = mysqlTable("chart_of_accounts", {
  id: varchar("id", { length: 32 }).primaryKey(),
  verticalId: varchar("verticalId", { length: 36 }).notNull(),
  householdId: varchar("householdId", { length: 36 }).notNull(),
  accountType: mysqlEnum("accountType", [
    "asset", "liability", "equity", "income", "expense",
    "cost_of_goods_sold", "other_income", "other_expense",
    "accounts_receivable", "accounts_payable", "bank",
  ]).notNull(),
  accountName: varchar("accountName", { length: 255 }).notNull(),
  accountNumber: varchar("accountNumber", { length: 20 }).notNull(),
  displayOrder: int("displayOrder").default(0),
  isTaxRelevant: boolean("isTaxRelevant").default(false),
  taxFormLine: varchar("taxFormLine", { length: 100 }),
  taxJurisdiction: varchar("taxJurisdiction", { length: 50 }).default("us_federal"),
  qboAccountId: varchar("qboAccountId", { length: 50 }),
  qboSyncStatus: mysqlEnum("qboSyncStatus", ["synced", "pending", "error", "not_linked"]).default("not_linked"),
  parentAccountId: varchar("parentAccountId", { length: 32 }),
  isActive: boolean("isActive").default(true),
  isSystemAccount: boolean("isSystemAccount").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ChartOfAccount = typeof chartOfAccounts.$inferSelect;
export type InsertChartOfAccount = typeof chartOfAccounts.$inferInsert;

export const coaMappings = mysqlTable("coa_mappings", {
  id: varchar("id", { length: 21 }).primaryKey(),
  chartOfAccountId: varchar("chartOfAccountId", { length: 32 }).notNull(),
  qboAccountId: varchar("qboAccountId", { length: 50 }).notNull(),
  qboAccountName: varchar("qboAccountName", { length: 255 }),
  mappingType: mysqlEnum("mappingType", ["one_to_one", "many_to_one", "custom"]).default("one_to_one"),
  isActive: boolean("isActive").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type CoaMapping = typeof coaMappings.$inferSelect;
export type InsertCoaMapping = typeof coaMappings.$inferInsert;

export const airbnbPayoutRecords = mysqlTable("airbnb_payout_records", {
  id: varchar("id", { length: 21 }).primaryKey(),
  householdId: varchar("householdId", { length: 36 }).notNull(),
  propertyId: varchar("propertyId", { length: 36 }).notNull(),
  platformBookingId: varchar("platformBookingId", { length: 255 }),
  payoutDate: timestamp("payoutDate").notNull(),
  grossAmount: decimal("grossAmount", { precision: 12, scale: 2 }),
  hostFee: decimal("hostFee", { precision: 12, scale: 2 }),
  cleaningFee: decimal("cleaningFee", { precision: 12, scale: 2 }),
  occupancyTaxes: decimal("occupancyTaxes", { precision: 12, scale: 2 }),
  vat: decimal("vat", { precision: 12, scale: 2 }),
  netPayout: decimal("netPayout", { precision: 12, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).default("USD").notNull(),
  exchangeRate: decimal("exchangeRate", { precision: 10, scale: 4 }),
  payoutMethod: varchar("payoutMethod", { length: 100 }),
  transactionReference: varchar("transactionReference", { length: 255 }),
  status: mysqlEnum("status", ["pending", "confirmed", "failed"]).default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type AirbnbPayoutRecord = typeof airbnbPayoutRecords.$inferSelect;
export type InsertAirbnbPayoutRecord = typeof airbnbPayoutRecords.$inferInsert;

export const ltrPayments = mysqlTable("ltr_payments", {
  id: varchar("id", { length: 21 }).primaryKey(),
  householdId: varchar("householdId", { length: 36 }).notNull(),
  propertyId: varchar("propertyId", { length: 36 }).notNull(),
  tenantName: varchar("tenantName", { length: 255 }),
  paymentDate: timestamp("paymentDate").notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).default("USD").notNull(),
  paymentType: mysqlEnum("paymentType", ["rent", "deposit", "late_fee", "utility", "other"]).default("rent").notNull(),
  paymentMethod: varchar("paymentMethod", { length: 100 }),
  notes: text("notes"),
  receiptUrl: varchar("receiptUrl", { length: 500 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type LtrPayment = typeof ltrPayments.$inferSelect;
export type InsertLtrPayment = typeof ltrPayments.$inferInsert;

export const financialAccounts = mysqlTable("financial_accounts", {
  id: varchar("id", { length: 21 }).primaryKey(),
  householdId: varchar("householdId", { length: 36 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  accountType: mysqlEnum("accountType", ["checking", "savings", "credit_card", "investment", "loan", "other"]).notNull(),
  institution: varchar("institution", { length: 255 }),
  currentBalance: decimal("currentBalance", { precision: 12, scale: 2 }),
  currency: varchar("currency", { length: 3 }).default("USD").notNull(),
  verticalId: varchar("verticalId", { length: 36 }),
  isActive: boolean("isActive").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type FinancialAccount = typeof financialAccounts.$inferSelect;
export type InsertFinancialAccount = typeof financialAccounts.$inferInsert;

export const financialTransactions = mysqlTable("financial_transactions", {
  id: varchar("id", { length: 21 }).primaryKey(),
  householdId: varchar("householdId", { length: 36 }).notNull(),
  financialAccountId: varchar("financialAccountId", { length: 21 }).notNull(),
  description: varchar("description", { length: 500 }).notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).default("USD").notNull(),
  transactionType: mysqlEnum("transactionType", ["debit", "credit"]).notNull(),
  transactionDate: timestamp("transactionDate").notNull(),
  vendor: varchar("vendor", { length: 255 }),
  glAccountCode: varchar("glAccountCode", { length: 50 }),
  verticalId: varchar("verticalId", { length: 36 }),
  propertyId: varchar("propertyId", { length: 36 }),
  receiptUrl: varchar("receiptUrl", { length: 500 }),
  notes: text("notes"),
  isTaxDeductible: boolean("isTaxDeductible").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type FinancialTransaction = typeof financialTransactions.$inferSelect;
export type InsertFinancialTransaction = typeof financialTransactions.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════
// GOVERNANCE & FINANCIAL — Budget, Approvals, Financial Reports
// ═══════════════════════════════════════════════════════════════════════

export const budgets = mysqlTable("budgets", {
  id: varchar("id", { length: 21 }).primaryKey(),
  householdId: varchar("householdId", { length: 36 }).notNull(),
  verticalId: varchar("verticalId", { length: 36 }),
  propertyId: varchar("propertyId", { length: 36 }),
  name: varchar("name", { length: 255 }).notNull(),
  fiscalYear: int("fiscalYear").notNull(),
  fiscalMonth: int("fiscalMonth"),
  totalBudget: decimal("totalBudget", { precision: 12, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).default("USD").notNull(),
  status: mysqlEnum("status", ["draft", "active", "closed"]).default("draft").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Budget = typeof budgets.$inferSelect;
export type InsertBudget = typeof budgets.$inferInsert;

export const budgetLineItems = mysqlTable("budget_line_items", {
  id: varchar("id", { length: 21 }).primaryKey(),
  budgetId: varchar("budgetId", { length: 21 }).notNull(),
  glAccountCode: varchar("glAccountCode", { length: 50 }).notNull(),
  budgetedAmount: decimal("budgetedAmount", { precision: 12, scale: 2 }).notNull(),
  actualAmount: decimal("actualAmount", { precision: 12, scale: 2 }).default("0"),
  variance: decimal("variance", { precision: 12, scale: 2 }).default("0"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type BudgetLineItem = typeof budgetLineItems.$inferSelect;
export type InsertBudgetLineItem = typeof budgetLineItems.$inferInsert;

export const approvalWorkflows = mysqlTable("approval_workflows", {
  id: varchar("id", { length: 21 }).primaryKey(),
  householdId: varchar("householdId", { length: 36 }).notNull(),
  verticalId: varchar("verticalId", { length: 36 }),
  name: varchar("name", { length: 255 }).notNull(),
  triggerAmount: decimal("triggerAmount", { precision: 12, scale: 2 }),
  approverRole: mysqlEnum("approverRole", ["household_admin", "ea", "owner", "custom"]).notNull(),
  approverMemberId: varchar("approverMemberId", { length: 36 }),
  isActive: boolean("isActive").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ApprovalWorkflow = typeof approvalWorkflows.$inferSelect;
export type InsertApprovalWorkflow = typeof approvalWorkflows.$inferInsert;

export const financialReports = mysqlTable("financial_reports", {
  id: varchar("id", { length: 21 }).primaryKey(),
  householdId: varchar("householdId", { length: 36 }).notNull(),
  verticalId: varchar("verticalId", { length: 36 }),
  reportType: mysqlEnum("reportType", ["pl", "balance_sheet", "cash_flow", "budget_vs_actual", "custom"]).notNull(),
  fiscalYear: int("fiscalYear").notNull(),
  fiscalMonth: int("fiscalMonth"),
  reportData: json("reportData"),
  generatedBy: varchar("generatedBy", { length: 36 }),
  generatedAt: timestamp("generatedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type FinancialReport = typeof financialReports.$inferSelect;
export type InsertFinancialReport = typeof financialReports.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════
// GUARDIAN SYSTEM — Active monitoring, circuit breakers, health checks
// ═══════════════════════════════════════════════════════════════════════

export const guardianAlerts = mysqlTable("guardian_alerts", {
  id: varchar("id", { length: 21 }).primaryKey(),
  householdId: varchar("householdId", { length: 36 }).notNull(),
  memberId: varchar("memberId", { length: 36 }),
  alertType: mysqlEnum("alertType", [
    "calendar_sync_failure", "booking_conflict", "device_offline",
    "security_event", "financial_anomaly", "health_check_failure",
    "propagation_failure", "token_expiry",
  ]).notNull(),
  severity: mysqlEnum("severity", ["info", "warning", "critical"]).default("warning").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  resourceType: varchar("resourceType", { length: 64 }),
  resourceId: varchar("resourceId", { length: 128 }),
  acknowledgedBy: varchar("acknowledgedBy", { length: 36 }),
  acknowledgedAt: timestamp("acknowledgedAt"),
  resolvedAt: timestamp("resolvedAt"),
  autoResolved: boolean("autoResolved").default(false),
  metadata: json("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type GuardianAlert = typeof guardianAlerts.$inferSelect;
export type InsertGuardianAlert = typeof guardianAlerts.$inferInsert;

export const guardianConfig = mysqlTable("guardian_config", {
  id: varchar("id", { length: 21 }).primaryKey(),
  householdId: varchar("householdId", { length: 36 }).notNull(),
  isEnabled: boolean("isEnabled").default(true).notNull(),
  monitoringIntervalMinutes: int("monitoringIntervalMinutes").default(5),
  alertChannels: json("alertChannels").$type<string[]>().default(["in_app"]),
  emailNotifications: boolean("emailNotifications").default(false),
  smsNotifications: boolean("smsNotifications").default(false),
  pushNotifications: boolean("pushNotifications").default(true),
  customRules: json("customRules"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type GuardianConfig = typeof guardianConfig.$inferSelect;
export type InsertGuardianConfig = typeof guardianConfig.$inferInsert;


// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 1 — UNIFIED GENERAL LEDGER (v2.0)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Journal Entries — G.L. Header ────────────────────────────────────────────
// Every financial transaction has exactly one header row.
// Double-entry detail lives in journal_lines.
// v2.2 §2.5: posted entries are IMMUTABLE — mutation is forbidden at the
// application layer (postEntry) and corrections are reversal entries only.
// Double reversal is impossible by constraint (unique reversedByEntryId).
export const journalEntries = mysqlTable("journal_entries", {
  id: varchar("id", { length: 21 }).primaryKey(), // nanoid
  /** v2.2 D7/invariant 11: householdId is the top-level scope key. Nullable until
   *  the Phase B transfer backfills all rows to TJ Perkins Global (V8lk3KJatvxBTWURf4uo9). */
  householdId: varchar("householdId", { length: 36 }),
  entryDate: date("entry_date").notNull(),
  fiscalYear: int("fiscal_year").notNull(),
  fiscalMonth: int("fiscal_month").notNull(),
  verticalId: varchar("verticalId", { length: 36 }).notNull(),
  propertyId: varchar("propertyId", { length: 21 }),
  entryType: mysqlEnum("entryType", [
    "revenue", "expense", "transfer", "adjustment", "dto", "journal",
  ]).notNull(),
  sourceTable: varchar("sourceTable", { length: 50 }),
  sourceId: varchar("sourceId", { length: 21 }),
  reference: varchar("reference", { length: 200 }),
  memo: text("memo"),
  totalDebit: decimal("total_debit", { precision: 15, scale: 2 }).notNull().default("0.00"),
  totalCredit: decimal("total_credit", { precision: 15, scale: 2 }).notNull().default("0.00"),
  currency: varchar("currency", { length: 3 }).notNull().default("USD"),
  exchangeRate: decimal("exchange_rate", { precision: 15, scale: 6 }).default("1.000000"),
  isPosted: boolean("is_posted").default(false),
  isLocked: boolean("is_locked").default(false),
  postedAt: timestamp("posted_at"),
  postedBy: varchar("postedBy", { length: 36 }),
  // ── v2.2 §2.5 / CRITICAL-6: status + reversal mechanics ─────────────────────
  status: mysqlEnum("status", ["draft", "posted", "reversed", "reversal"]).notNull().default("draft"),
  /** Set on a 'reversal' entry: points at the original entry it reverses. */
  reversesEntryId: varchar("reversesEntryId", { length: 21 }),
  /** Set on a 'reversed' entry: points at the reversal entry. Unique → double reversal impossible. */
  reversedByEntryId: varchar("reversedByEntryId", { length: 21 }),
  reversalReason: text("reversalReason"),
  reversedBy: varchar("reversedBy", { length: 36 }),
  reversedAt: timestamp("reversedAt"),
  // ── v2.2 §2.5 / HIGH-3: reconciliation state ────────────────────────────────
  reconStatus: mysqlEnum("reconStatus", ["unreconciled", "matched", "verified", "disputed"]).notNull().default("unreconciled"),
  reconRef: varchar("reconRef", { length: 128 }),
  reconciledAt: timestamp("reconciledAt"),
  reconciledBy: varchar("reconciledBy", { length: 36 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (t) => ({
  verticalDateIdx: index("je_vertical_date_idx").on(t.verticalId, t.entryDate),
  fiscalYearIdx: index("je_fiscal_year_idx").on(t.fiscalYear, t.fiscalMonth),
  sourceIdx: index("je_source_idx").on(t.sourceTable, t.sourceId),
  propertyIdx: index("je_property_idx").on(t.propertyId),
  entryTypeIdx: index("je_entry_type_idx").on(t.verticalId, t.entryType),
  householdIdx: index("je_household_idx").on(t.householdId),
  statusIdx: index("je_status_idx").on(t.status),
  reversedByUniq: uniqueIndex("je_reversed_by_uniq").on(t.reversedByEntryId),
}));
export type JournalEntry = typeof journalEntries.$inferSelect;
export type InsertJournalEntry = typeof journalEntries.$inferInsert;

// ─── Journal Lines — G.L. Detail ──────────────────────────────────────────────
// Double-entry lines. Every line references one G.L. account.
// debit + credit must balance per journal entry (enforced at application layer).
export const journalLines = mysqlTable("journal_lines", {
  id: varchar("id", { length: 21 }).primaryKey(), // nanoid
  journalEntryId: varchar("journalEntryId", { length: 21 }).notNull(),
  lineNumber: int("line_number").notNull(),
  /** v2.2 D8: real FK to chart_of_accounts (widened 21→32 to match the target PK;
   *  FK constraint declared in migration 0053 — this schema file does not inline
   *  .references() anywhere, so the convention is preserved). Never dangles (inv. 12). */
  glAccountId: varchar("glAccountId", { length: 32 }).notNull(),
  propertyId: varchar("propertyId", { length: 21 }),
  /** v2.2 §2.5: line vertical denormalised (appears in every filter; P&L is computed
   *  from lines, not entry headers — cross-vertical redaction rule §4.4). */
  verticalId: varchar("verticalId", { length: 36 }),
  description: varchar("description", { length: 255 }),
  debit: decimal("debit", { precision: 15, scale: 2 }).default("0.00"),
  credit: decimal("credit", { precision: 15, scale: 2 }).default("0.00"),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(), // signed: + = revenue/asset, - = expense/liability
  currency: varchar("currency", { length: 3 }).notNull().default("USD"),
  /** v2.2 §2.5 FX rule: transaction-date rate from exchange_rates, stored IMMUTABLE;
   *  fallback = nearest prior rate (documented in postEntry). */
  exchangeRate: decimal("exchange_rate", { precision: 15, scale: 6 }).default("1.000000"),
  usdEquivalent: decimal("usd_equivalent", { precision: 15, scale: 2 }),
  /** v2.2 HIGH-4: currency-neutral supplement to usdEquivalent (which hardcodes USD). */
  reportingAmount: decimal("reporting_amount", { precision: 15, scale: 2 }),
  reportingCurrency: varchar("reporting_currency", { length: 3 }),
  taxFormLine: varchar("tax_form_line", { length: 50 }),
  isTaxRelevant: boolean("is_tax_relevant").default(false),
  receiptUrl: varchar("receipt_url", { length: 500 }),
  /** v2.2 HIGH-8: FK to receipt_images (constraint in migration 0053). */
  receiptId: varchar("receipt_id", { length: 21 }),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  entryIdx: index("jl_entry_idx").on(t.journalEntryId),
  glAccountIdx: index("jl_gl_account_idx").on(t.glAccountId),
  propertyIdx: index("jl_property_idx").on(t.propertyId),
  taxFormIdx: index("jl_tax_form_idx").on(t.taxFormLine),
  verticalAccountYear: index("jl_va_year_idx").on(t.glAccountId, t.createdAt),
  verticalIdx: index("jl_vertical_idx").on(t.verticalId),
  receiptIdx: index("jl_receipt_idx").on(t.receiptId),
}));
export type JournalLine = typeof journalLines.$inferSelect;
export type InsertJournalLine = typeof journalLines.$inferInsert;

// ─── Transfer Pairs — Rails Never Hit P&L ─────────────────────────────────────
// Tracks Venmo, Zelle, ATM, owner draws, loan payments.
// Both sides reference journal entries; the pair ensures P&L neutrality.
export const transferPairs = mysqlTable("transfer_pairs", {
  id: varchar("id", { length: 21 }).primaryKey(), // nanoid
  fromEntryId: varchar("fromEntryId", { length: 21 }).notNull(),
  toEntryId: varchar("toEntryId", { length: 21 }).notNull(),
  fromAccountId: varchar("fromAccountId", { length: 21 }).notNull(),
  toAccountId: varchar("toAccountId", { length: 21 }).notNull(),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  /** v2.2 HIGH-2: enum → varchar(50) validated against transfer_rail_types by the
   *  posting engine — new rails are configuration, not migration (invariant 15).
   *  NO 'square' value: Square is an explicit non-goal (v2.2 §8). */
  transferType: varchar("transferType", { length: 50 }).notNull(),
  description: varchar("description", { length: 255 }),
  isReconciled: boolean("is_reconciled").default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  fromIdx: index("tp_from_idx").on(t.fromEntryId),
  toIdx: index("tp_to_idx").on(t.toEntryId),
}));
export type TransferPair = typeof transferPairs.$inferSelect;
export type InsertTransferPair = typeof transferPairs.$inferInsert;

// ─── Transfer Rail Types — Rail Vocabulary Reference (v2.2 HIGH-2) ─────────────
// Reference table behind transfer_pairs.transferType. Seeded in migration 0053
// with the existing 7 enum values + stripe, ota_payout, card_funding, wire, ach,
// multi_clearing. NO 'square' row (v2.2 §8 — explicit non-goal).
export const transferRailTypes = mysqlTable("transfer_rail_types", {
  code: varchar("code", { length: 50 }).primaryKey(),
  label: varchar("label", { length: 255 }).notNull(),
  description: text("description"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type TransferRailType = typeof transferRailTypes.$inferSelect;
export type InsertTransferRailType = typeof transferRailTypes.$inferInsert;

// ─── Tax Documents — Prior Year Returns Storage ─────────────────────────────────
// Stores prior-year tax returns and preparation guidance in GCS.
// Personal vertical houses all individual tax documents.
export const taxDocuments = mysqlTable("tax_documents", {
  id: varchar("id", { length: 21 }).primaryKey(), // nanoid
  /** v2.2 CRITICAL-3 bug fix: was `.default("pers")` — a literal code, not a valid
   *  UUID. Default dropped in migration 0053; callers must resolve PERS via
   *  verticals.code before insert. */
  verticalId: varchar("verticalId", { length: 36 }).notNull(),
  householdId: varchar("householdId", { length: 36 }).notNull(),
  taxYear: int("tax_year").notNull(),
  documentType: mysqlEnum("documentType", [
    "form_1040", "schedule_c", "schedule_e", "schedule_d",
    "schedule_se", "form_4562", "form_4797", "form_4684",
    "form_8995", "form_1116", "form_5471", "form_8582",
    "preparation_guidance", "w2", "1099", "payslip",
    "bank_statement", "receipt", "other",
  ]).notNull(),
  documentLabel: varchar("documentLabel", { length: 100 }),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  gcsPath: varchar("gcsPath", { length: 500 }).notNull(),
  fileSizeBytes: int("file_size_bytes"),
  mimeType: varchar("mimeType", { length: 50 }).default("application/pdf"),
  isKeyDocument: boolean("is_key_document").default(false),
  extractedData: json("extracted_data"),
  uploadedBy: varchar("uploadedBy", { length: 36 }),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  yearTypeIdx: index("td_year_type_idx").on(t.taxYear, t.documentType),
  verticalIdx: index("td_vertical_idx").on(t.verticalId),
  keyDocIdx: index("td_key_doc_idx").on(t.verticalId, t.isKeyDocument),
}));
export type TaxDocument = typeof taxDocuments.$inferSelect;
export type InsertTaxDocument = typeof taxDocuments.$inferInsert;

// ─── Tax Line Items — TY2025 Draft Accumulator ──────────────────────────────────
// Populated by querying journal_lines; holds draft tax form line amounts.
// Confidence field tracks certainty: certain, estimated, gap.
export const taxLineItems = mysqlTable("tax_line_items", {
  id: varchar("id", { length: 21 }).primaryKey(), // nanoid
  taxYear: int("tax_year").notNull().default(2025),
  formName: mysqlEnum("formName", [
    "1040", "sch_c", "sch_e", "sch_d", "sch_se",
    "f4562", "f4797", "f4684", "f8995", "f1116",
    "f5471", "f8582",
  ]).notNull(),
  formLine: varchar("formLine", { length: 20 }).notNull(),
  lineDescription: varchar("lineDescription", { length: 255 }),
  verticalId: varchar("verticalId", { length: 36 }),
  propertyId: varchar("propertyId", { length: 20 }),
  amount: decimal("amount", { precision: 15, scale: 2 }),
  sourceType: mysqlEnum("sourceType", [
    "gl_sum", "owner_input", "prior_year_carryover", "gap",
  ]).default("gap"),
  sourceQuery: text("source_query"),
  confidence: mysqlEnum("confidence", ["certain", "estimated", "gap"]).default("gap"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (t) => ({
  formLineIdx: index("tli_form_line_idx").on(t.taxYear, t.formName, t.formLine),
  verticalIdx: index("tli_vertical_idx").on(t.verticalId),
  uniqueLine: uniqueIndex("tli_unique_line").on(
    t.taxYear, t.formName, t.formLine, t.verticalId, t.propertyId,
  ),
}));
export type TaxLineItem = typeof taxLineItems.$inferSelect;
export type InsertTaxLineItem = typeof taxLineItems.$inferInsert;

// ─── Workbench Queue — Unified Review Queue (v2.2 §2.5, A10) ───────────────────
// Every queue item carries verticalId (known vertical) OR tentativeVerticalId
// (vertical is the open question). Known-vertical items → finance.resolve_workbench
// holders; undetermined → Unassigned tab (finance.assign_vertical, admin-only).
export const workbenchQueue = mysqlTable("workbench_queue", {
  id: varchar("id", { length: 21 }).primaryKey(), // nanoid
  householdId: varchar("householdId", { length: 36 }).notNull(),
  verticalId: varchar("verticalId", { length: 36 }),
  tentativeVerticalId: varchar("tentativeVerticalId", { length: 36 }),
  queueType: mysqlEnum("queueType", [
    "uncategorised", "vertical_assignment", "dedupe_conflict",
    "allocation_conflict", "pair_attribution_overlap", "mis_paired_deposit",
    "rail_sweep", "unattributed",
  ]).notNull(),
  status: mysqlEnum("status", ["open", "in_progress", "resolved", "deferred"]).notNull().default("open"),
  /** Drives materiality ordering (default sort = |amount| desc, v2.2 §4.4). */
  amount: decimal("amount", { precision: 15, scale: 2 }),
  currency: varchar("currency", { length: 3 }).notNull().default("USD"),
  sourceTable: varchar("sourceTable", { length: 50 }),
  sourceId: varchar("sourceId", { length: 36 }),
  payload: json("payload"),
  assignedToMemberId: varchar("assignedToMemberId", { length: 36 }),
  resolvedByMemberId: varchar("resolvedByMemberId", { length: 36 }),
  resolvedAt: timestamp("resolvedAt"),
  resolutionNote: text("resolutionNote"),
  /** Set when resolution produces a posting — resolutions pass through postEntry()
   *  authorisation; the workbench is never a side door into the ledger (§4.4). */
  journalEntryId: varchar("journalEntryId", { length: 21 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  householdStatusIdx: index("wq_household_status_idx").on(t.householdId, t.status),
  verticalIdx: index("wq_vertical_idx").on(t.verticalId, t.status),
  tentativeIdx: index("wq_tentative_idx").on(t.tentativeVerticalId),
  queueTypeIdx: index("wq_queue_type_idx").on(t.queueType, t.status),
  materialityIdx: index("wq_materiality_idx").on(t.status, t.amount),
}));
export type WorkbenchQueueItem = typeof workbenchQueue.$inferSelect;
export type InsertWorkbenchQueueItem = typeof workbenchQueue.$inferInsert;

// ─── Receipt Images (v2.2 §2.5, A11/HIGH-8) ─────────────────────────────────────
// Bytes live in S3/GCS via storagePut — NEVER DB blobs. extractedText is
// access-gated and PII-scrubbed (receipts can carry card numbers / child-medical).
export const receiptImages = mysqlTable("receipt_images", {
  id: varchar("id", { length: 21 }).primaryKey(), // nanoid
  householdId: varchar("householdId", { length: 36 }).notNull(),
  verticalId: varchar("verticalId", { length: 36 }),
  storageKey: varchar("storageKey", { length: 500 }).notNull(),
  originalFileName: varchar("originalFileName", { length: 255 }),
  mimeType: varchar("mimeType", { length: 50 }),
  fileSizeBytes: int("file_size_bytes"),
  source: mysqlEnum("source", ["camera", "file"]).notNull().default("file"),
  uploadedByMemberId: varchar("uploadedByMemberId", { length: 36 }),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
  extractedText: text("extractedText"),
  extractionConfidence: int("extraction_confidence"),
  journalEntryId: varchar("journalEntryId", { length: 21 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  householdIdx: index("ri_household_idx").on(t.householdId),
  entryIdx: index("ri_entry_idx").on(t.journalEntryId),
}));
export type ReceiptImage = typeof receiptImages.$inferSelect;
export type InsertReceiptImage = typeof receiptImages.$inferInsert;

// ─── Period Locks (v2.2 §2.5, A12) ──────────────────────────────────────────────
// Unlock requires dual control (unlockedBy + unlockApprovedBy) and a mandatory
// reason. Unlocking a synced period enqueues QBO re-reconciliation (Phase D).
export const periodLocks = mysqlTable("period_locks", {
  id: varchar("id", { length: 21 }).primaryKey(), // nanoid
  householdId: varchar("householdId", { length: 36 }).notNull(),
  fiscalYear: int("fiscal_year").notNull(),
  fiscalMonth: int("fiscal_month").notNull(),
  lockedByMemberId: varchar("lockedByMemberId", { length: 36 }).notNull(),
  lockedAt: timestamp("locked_at").defaultNow().notNull(),
  unlockedByMemberId: varchar("unlockedByMemberId", { length: 36 }),
  unlockApprovedByMemberId: varchar("unlockApprovedByMemberId", { length: 36 }),
  unlockReason: text("unlockReason"),
  unlockedAt: timestamp("unlocked_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  householdPeriodUniq: uniqueIndex("pl_household_period_uniq").on(t.householdId, t.fiscalYear, t.fiscalMonth),
}));
export type PeriodLock = typeof periodLocks.$inferSelect;
export type InsertPeriodLock = typeof periodLocks.$inferInsert;

// ─── Vertical Code Map — Registry Bridge (v2.2 §2.3/§2.4, A12) ──────────────────
// Production (MySQL) twin of the staging registry. Bridges staging codes to
// production vertical UUIDs (vertical_id FK). sync_allowlisted enforces D6 by
// data: exactly MB + MM are true; Geeves.Life qbo_entity = 'pending' (§2.4).
export const verticalCodeMap = mysqlTable("vertical_code_map", {
  stagingCode: varchar("staging_code", { length: 16 }).primaryKey(),
  verticalId: varchar("vertical_id", { length: 36 }), // FK → verticals.id (migration 0053)
  docCode: varchar("doc_code", { length: 16 }),
  displayName: varchar("display_name", { length: 255 }).notNull(),
  docDisplayName: varchar("doc_display_name", { length: 255 }),
  accountPrefix: varchar("account_prefix", { length: 16 }).notNull(),
  isSystemBucket: boolean("is_system_bucket").default(false).notNull(),
  qboEntity: varchar("qbo_entity", { length: 255 }),
  syncAllowlisted: boolean("sync_allowlisted").default(false).notNull(),
  status: mysqlEnum("status", ["active", "retired", "merged"]).notNull().default("active"),
  mergedInto: varchar("merged_into", { length: 16 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  verticalIdx: index("vcm_vertical_idx").on(t.verticalId),
}));
export type VerticalCodeMapRow = typeof verticalCodeMap.$inferSelect;
export type InsertVerticalCodeMapRow = typeof verticalCodeMap.$inferInsert;

// ─── Migration Change Log (v2.2 §2.5, A12) ──────────────────────────────────────
// Production twin of the staging change log. Safeguard 5: summaries carry
// identifiers/hashes only — never raw descriptions, names, or amounts.
export const migrationChangeLog = mysqlTable("migration_change_log", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  batchId: varchar("batch_id", { length: 64 }).notNull(),
  snapshotId: varchar("snapshot_id", { length: 128 }).notNull(),
  tableName: varchar("table_name", { length: 128 }).notNull(),
  rowKey: varchar("row_key", { length: 128 }).notNull(),
  changeType: mysqlEnum("change_type", ["insert", "update", "delete", "move", "retype"]).notNull(),
  oldValueHash: varchar("old_value_hash", { length: 64 }),
  newValueHash: varchar("new_value_hash", { length: 64 }),
  oldValueSummary: varchar("old_value_summary", { length: 255 }),
  newValueSummary: varchar("new_value_summary", { length: 255 }),
  appliedBy: varchar("applied_by", { length: 128 }).notNull(),
  dryRun: boolean("dry_run").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  batchIdx: index("mcl_batch_idx").on(t.batchId),
  tableIdx: index("mcl_table_idx").on(t.tableName, t.rowKey),
}));
export type MigrationChangeLogRow = typeof migrationChangeLog.$inferSelect;
export type InsertMigrationChangeLogRow = typeof migrationChangeLog.$inferInsert;

// ─── Retired Transaction Map (v2.2 §2.5, A12) ───────────────────────────────────
// 4-class dedupe lineage: retired txn → surviving txn, per batch.
export const retiredTxnMap = mysqlTable("retired_txn_map", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  retiredTxnId: varchar("retired_txn_id", { length: 64 }).notNull(),
  survivingTxnId: varchar("surviving_txn_id", { length: 64 }),
  dedupeClass: varchar("dedupe_class", { length: 32 }).notNull(),
  batchId: varchar("batch_id", { length: 64 }).notNull(),
  reason: varchar("reason", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  retiredUniq: uniqueIndex("rtm_retired_uniq").on(t.retiredTxnId),
  survivingIdx: index("rtm_surviving_idx").on(t.survivingTxnId),
}));
export type RetiredTxnMapRow = typeof retiredTxnMap.$inferSelect;
export type InsertRetiredTxnMapRow = typeof retiredTxnMap.$inferInsert;

// ─── Anchor Cache (v2.2 §5, A12) ────────────────────────────────────────────────
// Self-busting memo for computed anchors: watermark = MAX(edit_log.id) at
// computation time; any later edit_log row invalidates the entry.
export const anchorCache = mysqlTable("anchor_cache", {
  cacheKey: varchar("cache_key", { length: 191 }).primaryKey(),
  householdId: varchar("householdId", { length: 36 }).notNull(),
  payload: json("payload").notNull(),
  watermark: bigint("watermark", { mode: "number" }).notNull(),
  computedAt: timestamp("computed_at").defaultNow().notNull(),
}, (t) => ({
  householdIdx: index("ac_household_idx").on(t.householdId),
}));
export type AnchorCacheRow = typeof anchorCache.$inferSelect;
export type InsertAnchorCacheRow = typeof anchorCache.$inferInsert;

// ─── Vertical Member Access ─────────────────────────────────────────────────────
export const verticalMemberAccess = mysqlTable("vertical_member_access", {
  id: varchar("id", { length: 36 }).primaryKey(),
  householdId: varchar("householdId", { length: 36 }).notNull(),
  verticalId: varchar("verticalId", { length: 36 }).notNull(),
  memberId: varchar("memberId", { length: 36 }).notNull(),
  accessLevel: mysqlEnum("accessLevel", ["full", "read_only", "blind", "none"]).notNull().default("read_only"),
  calendarAccess: mysqlEnum("calendarAccess", ["availability_only", "default_vertical", "blind", "read_write"]).notNull().default("default_vertical"),
  allowedCalendarIds: json("allowedCalendarIds"),
  canRequestMeetings: boolean("canRequestMeetings").notNull().default(true),
  excludeMultiDayEvents: boolean("excludeMultiDayEvents").notNull().default(false),
  configuredByMemberId: varchar("configuredByMemberId", { length: 36 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  memberVerticalUniq: uniqueIndex("vma_member_vertical_uniq").on(t.memberId, t.verticalId),
  householdIdx: index("vma_household_idx").on(t.householdId),
  verticalIdx: index("vma_vertical_idx").on(t.verticalId),
  memberIdx: index("vma_member_idx").on(t.memberId),
}));
export type VerticalMemberAccess = typeof verticalMemberAccess.$inferSelect;
export type InsertVerticalMemberAccess = typeof verticalMemberAccess.$inferInsert;

// ─── Vertical Data Policies ─────────────────────────────────────────────────────
export const verticalDataPolicies = mysqlTable("vertical_data_policies", {
  id: varchar("id", { length: 36 }).primaryKey(),
  householdId: varchar("householdId", { length: 36 }).notNull(),
  verticalId: varchar("verticalId", { length: 36 }).notNull(),
  dataCategory: mysqlEnum("dataCategory", ["financial", "private", "guest_pii", "operational"]).notNull(),
  hiddenFromRoles: json("hiddenFromRoles"),
  hiddenFromMemberIds: json("hiddenFromMemberIds"),
  configuredByMemberId: varchar("configuredByMemberId", { length: 36 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  verticalCategoryUniq: uniqueIndex("vdp_vertical_category_uniq").on(t.verticalId, t.dataCategory),
  householdIdx: index("vdp_household_idx").on(t.householdId),
  verticalIdx: index("vdp_vertical_idx").on(t.verticalId),
}));
export type VerticalDataPolicy = typeof verticalDataPolicies.$inferSelect;
export type InsertVerticalDataPolicy = typeof verticalDataPolicies.$inferInsert;

// ─── Member Resources ───────────────────────────────────────────────────────────
export const memberResources = mysqlTable("member_resources", {
  id: varchar("id", { length: 36 }).primaryKey(),
  householdId: varchar("householdId", { length: 36 }).notNull(),
  memberId: varchar("memberId", { length: 36 }).notNull(),
  verticalId: varchar("verticalId", { length: 36 }),
  title: varchar("title", { length: 255 }).notNull(),
  url: text("url").notNull(),
  description: text("description"),
  resourceType: mysqlEnum("resourceType", ["link", "form", "doc", "invoice", "template"]).notNull().default("link"),
  sortOrder: int("sortOrder").notNull().default(0),
  isActive: boolean("isActive").notNull().default(true),
  addedByMemberId: varchar("addedByMemberId", { length: 36 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  memberIdx: index("mr_member_idx").on(t.memberId),
  householdIdx: index("mr_household_idx").on(t.householdId),
  verticalIdx: index("mr_vertical_idx").on(t.verticalId),
  sortIdx: index("mr_sort_idx").on(t.memberId, t.sortOrder),
}));
export type MemberResource = typeof memberResources.$inferSelect;
export type InsertMemberResource = typeof memberResources.$inferInsert;

// ─── Email Scrape Jobs ──────────────────────────────────────────────────────────
export const emailScrapeJobs = mysqlTable("email_scrape_jobs", {
  id: varchar("id", { length: 36 }).primaryKey(),
  propertyId: varchar("propertyId", { length: 36 }).notNull(),
  emailAddress: varchar("emailAddress", { length: 320 }).notNull(),
  platformId: varchar("platformId", { length: 36 }),
  status: mysqlEnum("status", ["pending", "running", "done", "failed", "needs_reauth"]).notNull().default("pending"),
  startedAt: bigint("startedAt", { mode: "number" }),
  completedAt: bigint("completedAt", { mode: "number" }),
  emailsScanned: int("emailsScanned").default(0),
  bookingsEnriched: int("bookingsEnriched").default(0),
  bookingsCreated: int("bookingsCreated").default(0),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  propertyIdx: index("esj_property_idx").on(t.propertyId),
  statusIdx: index("esj_status_idx").on(t.status),
}));
export type EmailScrapeJob = typeof emailScrapeJobs.$inferSelect;
export type InsertEmailScrapeJob = typeof emailScrapeJobs.$inferInsert;

// ─── Property Email Tokens ──────────────────────────────────────────────────────
export const propertyEmailTokens = mysqlTable("property_email_tokens", {
  id: varchar("id", { length: 36 }).primaryKey(),
  propertyId: varchar("propertyId", { length: 36 }).notNull(),
  emailAddress: varchar("emailAddress", { length: 320 }).notNull(),
  provider: mysqlEnum("provider", ["gmail", "outlook"]).notNull().default("gmail"),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  tokenExpiry: bigint("tokenExpiry", { mode: "number" }),
  scope: varchar("scope", { length: 500 }),
  lastUsedAt: bigint("lastUsedAt", { mode: "number" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  propertyEmailUniq: uniqueIndex("pet_property_email_uniq").on(t.propertyId, t.emailAddress),
  propertyIdx: index("pet_property_idx").on(t.propertyId),
}));
export type PropertyEmailToken = typeof propertyEmailTokens.$inferSelect;
export type InsertPropertyEmailToken = typeof propertyEmailTokens.$inferInsert;

// ─── Member Permission Overrides ────────────────────────────────────────────────
export const memberPermissionOverrides = mysqlTable("member_permission_overrides", {
  id: varchar("id", { length: 36 }).primaryKey(),
  householdId: varchar("householdId", { length: 36 }).notNull(),
  memberId: varchar("memberId", { length: 36 }).notNull(),
  permission: varchar("permission", { length: 100 }).notNull(),
  granted: boolean("granted").notNull(),
  configuredByMemberId: varchar("configuredByMemberId", { length: 36 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  memberPermUniq: uniqueIndex("mpo_member_perm_uniq").on(t.memberId, t.permission),
  householdIdx: index("mpo_household_idx").on(t.householdId),
  memberIdx: index("mpo_member_idx").on(t.memberId),
}));
export type MemberPermissionOverride = typeof memberPermissionOverrides.$inferSelect;
export type InsertMemberPermissionOverride = typeof memberPermissionOverrides.$inferInsert;

// ─── Scope Consent Preferences ──────────────────────────────────────────────────
export const scopeConsentPreferences = mysqlTable("scope_consent_preferences", {
  id: varchar("id", { length: 36 }).primaryKey(),
  userId: int("userId").notNull(),
  scopeKey: varchar("scopeKey", { length: 128 }).notNull(),
  dismissedAt: bigint("dismissedAt", { mode: "number" }).notNull(),
}, (t) => ({
  userScopeUniq: uniqueIndex("scope_consent_user_scope_uniq").on(t.userId, t.scopeKey),
}));
export type ScopeConsentPreference = typeof scopeConsentPreferences.$inferSelect;
export type InsertScopeConsentPreference = typeof scopeConsentPreferences.$inferInsert;

// ─── Custom Roles ───────────────────────────────────────────────────────────────
export const customRoles = mysqlTable("custom_roles", {
  id: varchar("id", { length: 36 }).primaryKey(),
  householdId: varchar("householdId", { length: 36 }).notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  description: varchar("description", { length: 500 }),
  baseRole: varchar("baseRole", { length: 50 }).notNull().default("member"),
  permissions: json("permissions"),
  deniedPermissions: json("deniedPermissions"),
  allowedWidgets: json("allowedWidgets"),
  allowedVerticalIds: json("allowedVerticalIds"),
  color: varchar("color", { length: 20 }).default("#6B7280"),
  icon: varchar("icon", { length: 50 }).default("User"),
  createdByMemberId: varchar("createdByMemberId", { length: 36 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  householdIdx: index("cr_household_idx").on(t.householdId),
}));
export type CustomRole = typeof customRoles.$inferSelect;
export type InsertCustomRole = typeof customRoles.$inferInsert;

// ─── Widget Layouts ─────────────────────────────────────────────────────────────
export const widgetLayouts = mysqlTable("widget_layouts", {
  memberId: varchar("memberId", { length: 36 }).primaryKey(),
  householdId: varchar("householdId", { length: 36 }).notNull(),
  layout: json("layout").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  householdIdx: index("wl_household_idx").on(t.householdId),
}));
export type WidgetLayout = typeof widgetLayouts.$inferSelect;
export type InsertWidgetLayout = typeof widgetLayouts.$inferInsert;

// ─── Property Photos ────────────────────────────────────────────────────────────
export const propertyPhotos = mysqlTable("property_photos", {
  id: varchar("id", { length: 36 }).primaryKey(),
  propertyId: varchar("propertyId", { length: 36 }).notNull(),
  householdId: varchar("householdId", { length: 36 }).notNull(),
  url: text("url").notNull(),
  s3Key: text("s3Key").notNull(),
  caption: varchar("caption", { length: 255 }),
  sortOrder: int("sortOrder").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  propertyIdx: index("pp_property_idx").on(t.propertyId),
}));
export type PropertyPhoto = typeof propertyPhotos.$inferSelect;
export type InsertPropertyPhoto = typeof propertyPhotos.$inferInsert;

// ─── Property Member Order ──────────────────────────────────────────────────────
export const propertyMemberOrder = mysqlTable("property_member_order", {
  memberId: varchar("memberId", { length: 36 }).primaryKey(),
  householdId: varchar("householdId", { length: 36 }).notNull(),
  propertyOrder: json("propertyOrder").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  householdIdx: index("pmo_household_idx").on(t.householdId),
}));
export type PropertyMemberOrder = typeof propertyMemberOrder.$inferSelect;
export type InsertPropertyMemberOrder = typeof propertyMemberOrder.$inferInsert;

// ─── Booking Screenshots ────────────────────────────────────────────────────────
export const bookingScreenshots = mysqlTable("booking_screenshots", {
  id: varchar("id", { length: 36 }).primaryKey(),
  bookingId: varchar("bookingId", { length: 36 }).notNull(),
  householdId: varchar("householdId", { length: 36 }).notNull(),
  s3Url: text("s3Url").notNull(),
  s3Key: text("s3Key").notNull(),
  ocrExtractedData: json("ocrExtractedData"),
  ocrConfidence: int("ocrConfidence"),
  isConfirmed: boolean("isConfirmed").notNull().default(false),
  uploadedByMemberId: varchar("uploadedByMemberId", { length: 36 }),
  uploadedAt: timestamp("uploadedAt").defaultNow().notNull(),
}, (t) => ({
  bookingIdx: index("bs_booking_idx").on(t.bookingId),
  householdIdx: index("bs_household_idx").on(t.householdId),
}));
export type BookingScreenshot = typeof bookingScreenshots.$inferSelect;
export type InsertBookingScreenshot = typeof bookingScreenshots.$inferInsert;

// ─── Platform Export Imports ────────────────────────────────────────────────────
export const platformExportImports = mysqlTable("platform_export_imports", {
  id: varchar("id", { length: 36 }).primaryKey(),
  householdId: varchar("householdId", { length: 36 }).notNull(),
  platform: mysqlEnum("platform", ["airbnb", "vrbo", "booking_com"]).notNull(),
  filename: varchar("filename", { length: 255 }).notNull(),
  s3Url: text("s3Url").notNull(),
  s3Key: text("s3Key").notNull(),
  recordCount: int("recordCount"),
  matchedCount: int("matchedCount"),
  createdCount: int("createdCount"),
  importStatus: mysqlEnum("importStatus", ["processing", "completed", "failed", "partial"]).notNull().default("processing"),
  errorMessage: text("errorMessage"),
  uploadedByMemberId: varchar("uploadedByMemberId", { length: 36 }),
  importedAt: timestamp("importedAt").defaultNow().notNull(),
}, (t) => ({
  householdIdx: index("pei_household_idx").on(t.householdId),
  platformIdx: index("pei_platform_idx").on(t.platform),
}));
export type PlatformExportImport = typeof platformExportImports.$inferSelect;
export type InsertPlatformExportImport = typeof platformExportImports.$inferInsert;

// ─── Notification Settings ──────────────────────────────────────────────────────
export const notificationSettings = mysqlTable("notification_settings", {
  id: int("id").autoincrement().primaryKey(),
  key: varchar("key", { length: 100 }).notNull(),
  label: varchar("label", { length: 255 }).notNull(),
  description: text("description"),
  cooldownHours: int("cooldownHours").notNull().default(6),
  enabled: boolean("enabled").notNull().default(true),
  householdId: varchar("householdId", { length: 36 }).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastNotifiedAt: bigint("lastNotifiedAt", { mode: "number" }).default(0),
}, (t) => ({
  keyHouseholdIdx: uniqueIndex("ns_key_household_idx").on(t.key, t.householdId),
}));
export type NotificationSetting = typeof notificationSettings.$inferSelect;
export type InsertNotificationSetting = typeof notificationSettings.$inferInsert;

// ─── Beta Signups ───────────────────────────────────────────────────────────────
export const betaSignups = mysqlTable("beta_signups", {
  id: varchar("id", { length: 36 }).primaryKey(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  householdType: varchar("householdType", { length: 100 }),
  householdSize: varchar("householdSize", { length: 50 }),
  primaryUseCase: varchar("primaryUseCase", { length: 255 }),
  referralSource: varchar("referralSource", { length: 100 }),
  icpScore: int("icpScore"),
  status: mysqlEnum("status", ["pending", "approved", "waitlisted", "rejected"]).notNull().default("pending"),
  adminNotes: text("adminNotes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  emailIdx: index("bs_email_idx").on(t.email),
  statusIdx: index("bs_status_idx").on(t.status),
  createdAtIdx: index("bs_created_at_idx").on(t.createdAt),
}));
export type BetaSignup = typeof betaSignups.$inferSelect;
export type InsertBetaSignup = typeof betaSignups.$inferInsert;

// ─── Contact Messages ───────────────────────────────────────────────────────────
export const contactMessages = mysqlTable("contact_messages", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  subject: varchar("subject", { length: 255 }),
  message: text("message").notNull(),
  isRead: boolean("isRead").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  emailIdx: index("cm_email_idx").on(t.email),
  isReadIdx: index("cm_is_read_idx").on(t.isRead),
  createdAtIdx: index("cm_created_at_idx").on(t.createdAt),
}));
export type ContactMessage = typeof contactMessages.$inferSelect;
export type InsertContactMessage = typeof contactMessages.$inferInsert;

// ─── Invoice Extractions ────────────────────────────────────────────────────────
export const invoiceExtractions = mysqlTable("invoice_extractions", {
  id: varchar("id", { length: 21 }).primaryKey(),
  householdId: varchar("householdId", { length: 36 }).notNull(),
  vendorOrderId: varchar("vendorOrderId", { length: 21 }),
  walmartOrderId: varchar("walmartOrderId", { length: 36 }),
  vendorName: varchar("vendorName", { length: 200 }),
  orderDate_ie: varchar("orderDate_ie", { length: 30 }),
  orderTotal_ie: decimal("orderTotal_ie", { precision: 12, scale: 2 }),
  taxTotal_ie: decimal("taxTotal_ie", { precision: 12, scale: 2 }),
  paymentMethodType: varchar("paymentMethodType", { length: 50 }),
  paymentMethodLast4: varchar("paymentMethodLast4", { length: 4 }),
  paymentAccountId_ie: int("paymentAccountId_ie"),
  lineItems_ie: json("lineItems_ie"),
  s3Url_ie: text("s3Url_ie"),
  s3Key_ie: varchar("s3Key_ie", { length: 500 }),
  extractionStatus_ie: mysqlEnum("extractionStatus_ie", ["pending", "processing", "completed", "failed"]).notNull().default("pending"),
  extractionError_ie: text("extractionError_ie"),
  triggerSource_ie: mysqlEnum("triggerSource_ie", ["chrome_extension", "manual_upload", "email_attachment"]).notNull().default("chrome_extension"),
  createdAt_ie: bigint("createdAt_ie", { mode: "number" }).notNull(),
  updatedAt_ie: bigint("updatedAt_ie", { mode: "number" }).notNull(),
  status: varchar("status", { length: 20 }).default("pending"),
  convertedExpenseId: varchar("convertedExpenseId", { length: 36 }),
  convertedAt: timestamp("convertedAt"),
}, (t) => ({
  householdIdx: index("ie_household_idx").on(t.householdId),
  vendorOrderIdx: index("ie_vendor_order_idx").on(t.vendorOrderId),
  walmartOrderIdx: index("ie_walmart_order_idx").on(t.walmartOrderId),
  statusIdx: index("ie_status_idx").on(t.extractionStatus_ie),
  paymentLast4Idx: index("ie_payment_last4_idx").on(t.paymentMethodLast4),
}));
export type InvoiceExtraction = typeof invoiceExtractions.$inferSelect;
export type InsertInvoiceExtraction = typeof invoiceExtractions.$inferInsert;

// ─── OAuth Nonces ───────────────────────────────────────────────────────────────
export const oauthNonces = mysqlTable("oauth_nonces", {
  nonce: varchar("nonce", { length: 128 }).primaryKey(),
  expiresAt: bigint("expiresAt", { mode: "number" }).notNull(),
});
export type OauthNonce = typeof oauthNonces.$inferSelect;
export type InsertOauthNonce = typeof oauthNonces.$inferInsert;

// ─── Propagation Queue ──────────────────────────────────────────────────────────
export const propagationQueue = mysqlTable("propagation_queue", {
  id: varchar("id", { length: 36 }).primaryKey(),
  eventId: varchar("eventId", { length: 36 }).notNull(),
  householdId: varchar("householdId", { length: 36 }).notNull(),
  reason: mysqlEnum("reason", ["rate_limit", "circuit_breaker", "lock_conflict", "google_error", "network_error"]).notNull(),
  attempts: int("attempts").notNull().default(0),
  maxAttempts: int("maxAttempts").notNull().default(5),
  nextRetryAt: bigint("nextRetryAt", { mode: "number" }).notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  resolvedAt: bigint("resolvedAt", { mode: "number" }),
  status: mysqlEnum("status", ["pending", "resolved", "failed"]).notNull().default("pending"),
}, (t) => ({
  nextRetryIdx: index("pq_next_retry_idx").on(t.status, t.nextRetryAt),
  eventIdx: index("pq_event_idx").on(t.eventId),
}));
export type PropagationQueueItem = typeof propagationQueue.$inferSelect;
export type InsertPropagationQueueItem = typeof propagationQueue.$inferInsert;
