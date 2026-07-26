import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, decimal, boolean, json, bigint, uniqueIndex, index } from "drizzle-orm/mysql-core";

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
  name: varchar("name", { length: 255 }).notNull(),
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
  itemsSubstituted: int("itemsSubstituted").default(0),
  itemsUnavailable: int("itemsUnavailable").default(0),
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
  transferReason: text("transferReason"),
  estimatedDelivery: varchar("estimatedDelivery", { length: 255 }),
  fulfillmentMethod: varchar("fulfillmentMethod", { length: 100 }),
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
  lastUsed: timestamp("lastUsed"),
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
  productName: varchar("productName", { length: 500 }).notNull(),
  productUrl: text("productUrl"),
  lastPrice: decimal("lastPrice", { precision: 10, scale: 2 }),
  useCount: int("useCount").default(1),
  confidence: int("confidence").default(80),
  isVerified: boolean("isVerified").default(false),
  lastAvailable: timestamp("lastAvailable"),
  lastUsed: timestamp("lastUsed"),
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
  // createdByUserId tracks who originally created the household (for audit),
  // but does NOT grant special privileges. All household_admins are co-equal.
  createdByUserId: int("createdByUserId").notNull(),
  wakeWord: varchar("wakeWord", { length: 100 }).default("Geeves"),
  timezone: varchar("timezone", { length: 100 }).default("America/New_York").notNull(),
  // groupName: how this household refers to itself — e.g. Household, Village, Constellation, Team, Studio, Crew
  groupName: varchar("groupName", { length: 100 }).default("Household"),
  settings: json("settings"),
  // Controls whether the EA role can open and edit the Member Permissions page.
  // Default: true (EA can manage access). Set to false to restrict permission management to HA only.
  eaCanManageAccess: boolean("eaCanManageAccess").default(true).notNull(),
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
  // googleName: the name from the user's Google account, stored on first join.
  // displayName is the constellation-assigned name (primary).
  // googleName is shown as an alias in parentheses to admins and the member themselves.
  googleName: varchar("googleName", { length: 255 }),
  email: varchar("email", { length: 320 }),
  avatarUrl: text("avatarUrl"),
  // P-46: Member-uploaded profile photo (self-service)
  photoUrl: text("photoUrl"),
  // Roles: household_admin (co-equal heads), ea, member, caregiver, child, elder
  // Note: "system_admin" is a platform-level role on the users table, not here
  role: mysqlEnum("role", ["household_admin", "ea", "member", "caregiver", "child", "elder"]).default("member").notNull(),
  // Inclusivity fields — all free-text, user-defined
  pronouns: varchar("pronouns", { length: 100 }),
  genderIdentity: varchar("genderIdentity", { length: 100 }),
  relationshipLabel: varchar("relationshipLabel", { length: 100 }),
  // Billing flag (not a role — just marks who receives invoices)
  isBillingContact: boolean("isBillingContact").default(false),
  accessibilityMode: mysqlEnum("accessibilityMode", ["standard", "picture_board", "large_text", "voice_only"]).default("standard"),
  status: mysqlEnum("status", ["invited", "active", "inactive", "removed"]).default("invited").notNull(),
  inviteToken: varchar("inviteToken", { length: 128 }),
  inviteTokenExpiresAt: timestamp("inviteTokenExpiresAt"),
  invitedAt: timestamp("invitedAt"),
  joinedAt: timestamp("joinedAt"),
  // P-38: Track which member invited this person (for EA-scoped remove permission)
  invitedByMemberId: varchar("invitedByMemberId", { length: 36 }),
  // P-40: Custom role assigned to this member (references custom_roles.id)
  customRoleId: varchar("customRoleId", { length: 36 }),
  // Pre-accept vertical assignments: verticalIds to assign when the member claims their invite.
  pendingVerticals: json("pendingVerticals").$type<string[]>().default([]),
  // Geeves AI access: whether this member can use the Geeves chat assistant.
  // Defaults to true for all roles. Set to false for members who should not have AI access
  // (e.g. external caregivers, children, property contacts).
  geevesAccess: boolean("geevesAccess").default(true).notNull(),
  // ─── Profile fields (migrated from family_members, Jul 2026) ───────────────
  // Date of birth (ISO date string YYYY-MM-DD)
  dob: varchar("dob", { length: 10 }),
  // Phone numbers: JSON array of { label: string, number: string }
  phoneNumbers: json("phoneNumbers").$type<Array<{ label: string; number: string }>>(),
  // Clothing sizes: { top, bottom, shoe, dress } — all free-text
  clothingSizes: json("clothingSizes").$type<{ top?: string; bottom?: string; shoe?: string; dress?: string }>(),
  // Dietary restrictions: free-text comma-separated or JSON array
  dietaryRestrictions: text("dietaryRestrictions"),
  // Preferences: { favoriteColors, favoriteBrands, notes } for shopping context
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
  // The member who owns/manages this vertical (can see connected account details, manage integrations).
  // NULL = owned by household admin. Viewer members see data but not account connection details.
  ownerMemberId: varchar("ownerMemberId", { length: 36 }),
  // Privacy level: household = all members, admin_only = household_admin only, private = named owners only
  privacyLevel: mysqlEnum("privacyLevel", ["household", "admin_only", "private"]).default("household").notNull(),
  // The label shown to others instead of event titles (e.g. "Busy", "OOO", "Focus Time")
  busyLabel: varchar("busyLabel", { length: 50 }).default("Busy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Vertical = typeof verticals.$inferSelect;
export type InsertVertical = typeof verticals.$inferInsert;

export const calendars = mysqlTable("calendars", {
  id: varchar("id", { length: 36 }).primaryKey(),
  householdId: varchar("householdId", { length: 36 }).notNull(),
  memberId: varchar("memberId", { length: 36 }).notNull(),
  verticalId: varchar("verticalId", { length: 36 }),
  provider: mysqlEnum("provider", ["google_workspace", "google_personal", "ical", "manual"]).notNull(),
  externalId: varchar("externalId", { length: 500 }),
  // Which Google account this calendar belongs to (for multi-account token routing)
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
  // When false, this calendar will NOT receive shadow blocks from other verticals.
  // Default true so all calendars participate in shadow blocking unless explicitly opted out.
  shadowBlocking: boolean("shadowBlocking").default(true),
  // When false, events on this calendar will NOT generate shadow blocks on other calendars.
  // Use for shared/team calendars (e.g. Team StartOut, Family shared calendar) that should
  // only RECEIVE availability context, not broadcast their events as busy signals elsewhere.
  // Default true so all calendars act as propagation sources unless explicitly opted out.
  shadowSource: boolean("shadowSource").default(true),
  // P-25: When true, Geeves will NEVER write events back to this Google Calendar via the API.
  // Use for external/work/shared calendars (e.g. startout.org) where writing could cause
  // rate-limit flags or admin alerts. Shadow blocks are still stored in DB for Geeves's
  // own view, but the Google Calendar write step is skipped entirely for this calendar.
  // Default false (writing is allowed) — set to true for any calendar you don't fully own.
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
  // Prevents shadow events synced back from Google from re-propagating
  isShadowBlock: boolean("isShadowBlock").default(false),
  version: int("version").default(1),
  etag: varchar("etag", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  householdTimeIdx: index("events_household_time_idx").on(t.householdId, t.startTime, t.endTime),
  calendarStartIdx: index("events_calendar_start_idx").on(t.calendarId, t.startTime),
  // P-21: Unique constraint prevents duplicate events from concurrent syncs.
  // externalId is nullable (manual events have no externalId), so the unique index
  // only applies when externalId is NOT NULL — MySQL allows multiple NULLs in unique indexes.
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
  // Cached start/end times from the source event (avoids join on every calendar query)
  startTime: bigint("startTime", { mode: "number" }),
  endTime: bigint("endTime", { mode: "number" }),
  isAllDay: boolean("isAllDay").default(false),
  isDismissed: boolean("isDismissed").default(false),
  dismissedAt: timestamp("dismissedAt"),
  externalEventId: varchar("externalEventId", { length: 500 }),
  // Sync tracking — P4: a shadow block is not complete until synced to Google
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
  // Revised type: str = short-term rental, ltr = long-term rental
  type: mysqlEnum("type", ["primary_residence", "rental_str", "rental_ltr", "vacation", "commercial", "investment", "other"]).default("rental_str"),
  // Legacy single iCal URL (replaced by property_platforms table for multi-platform)
  icalUrl: text("icalUrl"),
  // The merged calendar for this property (assigned to a vertical)
  calendarId: varchar("calendarId", { length: 36 }),
  // Vertical this property's calendar is assigned to
  verticalId: varchar("verticalId", { length: 36 }),
  // Dedicated property management email for email scraping (Phase 2)
  propertyEmail: varchar("propertyEmail", { length: 320 }),
  // Outbound ICS S3 key (hosted for platforms to subscribe to)
  outboundIcsKey: text("outboundIcsKey"),
  outboundIcsUrl: text("outboundIcsUrl"),
  // Long-term rental: lease document
  leaseDocUrl: text("leaseDocUrl"),
  leaseDocKey: text("leaseDocKey"),
  monthlyRent: decimal("monthlyRent", { precision: 12, scale: 2 }),
  rentCurrency: varchar("rentCurrency", { length: 3 }).default("USD"),
  settings: json("settings"),
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  // ISO 3166-1 alpha-2 country code for national holiday lookup (e.g. "US", "JM", "NG")
  country: varchar("country", { length: 2 }),
  // IANA timezone identifier for property-local date display (e.g. "America/New_York", "America/Jamaica")
  // Default: America/New_York (constellation home timezone = EST)
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
  // Purposes this account is authorised for in Geeves.
  // JSON array of: "calendar_sync" | "email_scraping" | "notes" | "tasks" | "gmail_send"
  // Determines which OAuth scopes are requested and which features auto-activate on connect.
  purposes: json("purposes").$type<string[]>().default([]),
  // Human-readable label for this account (e.g. "Personal", "Work")
  displayName: varchar("displayName", { length: 100 }),
  status: mysqlEnum("status", ["active", "expired", "revoked"]).default("active"),
  lastRefreshedAt: timestamp("lastRefreshedAt"),
  /** Set once when token is first marked expired — prevents duplicate owner notifications */
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
  // P-51: Store the notification URL so startup can detect stale channels pointing to old server URLs
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

// Vertical owners: can be any g.life subscriber (not necessarily a household member)
export const verticalOwners = mysqlTable("vertical_owners", {
  id: varchar("id", { length: 36 }).primaryKey(),
  verticalId: varchar("verticalId", { length: 36 }).notNull(),
  // userId references users.id — must be a g.life subscriber
  userId: int("userId").notNull(),
  role: mysqlEnum("role", ["owner", "member"]).default("owner").notNull(),
  addedByUserId: int("addedByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type VerticalOwner = typeof verticalOwners.$inferSelect;
export type InsertVerticalOwner = typeof verticalOwners.$inferInsert;

// Vertical integrations: calendars, email accounts, task apps, security apps connected to a vertical
export const verticalIntegrations = mysqlTable("vertical_integrations", {
  id: varchar("id", { length: 36 }).primaryKey(),
  verticalId: varchar("verticalId", { length: 36 }).notNull(),
  householdId: varchar("householdId", { length: 36 }).notNull(),
  memberId: varchar("memberId", { length: 36 }).notNull(),
  integrationType: mysqlEnum("integrationType", ["calendar", "email", "task", "security", "other"]).notNull(),
  provider: varchar("provider", { length: 100 }).notNull(), // e.g. google_workspace, google_personal, asana, seam
  accountEmail: varchar("accountEmail", { length: 320 }),
  displayName: varchar("displayName", { length: 255 }),
  // For calendar integrations, references calendars.id
  calendarId: varchar("calendarId", { length: 36 }),
  status: mysqlEnum("status", ["active", "pending", "error", "disconnected"]).default("active").notNull(),
  metadata: json("metadata"), // provider-specific config
  lastSyncAt: timestamp("lastSyncAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type VerticalIntegration = typeof verticalIntegrations.$inferSelect;
export type InsertVerticalIntegration = typeof verticalIntegrations.$inferInsert;

// Cross-vertical visibility: default is busy_only
// fromVertical can see toVertical at the configured level
export const verticalVisibility = mysqlTable("vertical_visibility", {
  id: varchar("id", { length: 36 }).primaryKey(),
  fromVerticalId: varchar("fromVerticalId", { length: 36 }).notNull(),
  toVerticalId: varchar("toVerticalId", { length: 36 }).notNull(),
  // none = fully private (shows as free — use with caution), busy_only = show as busy block, full = full event details
  visibilityLevel: mysqlEnum("visibilityLevel", ["none", "busy_only", "full"]).default("busy_only").notNull(),
  // Custom label shown on busy_only shadow blocks (e.g. "OOO", "Focus Time", "Personal")
  busyLabel: varchar("busyLabel", { length: 50 }).default("Busy"),
  // JSON array of calendar IDs excluded from shadow blocks by default for this rule.
  // Events can override this per-event via shadow_overrides.
  calendarExclusions: json("calendarExclusions").$type<string[]>().default([]),
  configuredByUserId: int("configuredByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type VerticalVisibility = typeof verticalVisibility.$inferSelect;
export type InsertVerticalVisibility = typeof verticalVisibility.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════
// SHADOW OVERRIDES — per-event calendar include/exclude overrides
// ═══════════════════════════════════════════════════════════════════════

export const shadowOverrides = mysqlTable("shadow_overrides", {
  id: varchar("id", { length: 36 }).primaryKey(),
  eventId: varchar("eventId", { length: 36 }).notNull(),
  calendarId: varchar("calendarId", { length: 36 }).notNull(),
  // include = force-include this calendar even if it's in calendarExclusions
  // exclude = force-exclude this calendar even if it's normally included
  action: mysqlEnum("action", ["include", "exclude"]).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type ShadowOverride = typeof shadowOverrides.$inferSelect;
export type InsertShadowOverride = typeof shadowOverrides.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════
// BOOKING REQUESTS — member requests free time from vertical owner/EA
// ═══════════════════════════════════════════════════════════════════════

export const bookingRequests = mysqlTable("booking_requests", {
  id: varchar("id", { length: 36 }).primaryKey(),
  householdId: varchar("householdId", { length: 36 }).notNull(),
  // The member making the request
  requestorMemberId: varchar("requestorMemberId", { length: 36 }).notNull(),
  // The vertical being requested (used to route to owner/EA)
  targetVerticalId: varchar("targetVerticalId", { length: 36 }).notNull(),
  // The calendar to create the event on (if approved)
  targetCalendarId: varchar("targetCalendarId", { length: 36 }),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  location: varchar("location", { length: 500 }),
  startTime: bigint("startTime", { mode: "number" }).notNull(),
  endTime: bigint("endTime", { mode: "number" }).notNull(),
  status: mysqlEnum("status", ["pending", "approved", "declined", "cancelled"]).default("pending").notNull(),
  // Set when approved — references the created event
  createdEventId: varchar("createdEventId", { length: 36 }),
  // Response from the approver
  responseNote: text("responseNote"),
  respondedByMemberId: varchar("respondedByMemberId", { length: 36 }),
  respondedAt: bigint("respondedAt", { mode: "number" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type BookingRequest = typeof bookingRequests.$inferSelect;
export type InsertBookingRequest = typeof bookingRequests.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════
// PROPERTIES — Multi-platform iCal aggregation
// ═══════════════════════════════════════════════════════════════════════

export const propertyPlatforms = mysqlTable("property_platforms", {
  id: varchar("id", { length: 36 }).primaryKey(),
  propertyId: varchar("propertyId", { length: 36 }).notNull(),
  // Platform type
  platform: mysqlEnum("platform", ["airbnb", "vrbo", "booking_com", "direct", "zillow", "apartments_com", "other"]).notNull(),
  displayName: varchar("displayName", { length: 255 }),
  // Inbound iCal URL (from the platform)
  icalUrl: text("icalUrl").notNull(),
  // Notification email for this platform — used to scrape booking confirmation emails
  // (e.g. the email address where Booking.com sends reservation confirmations)
  notificationEmail: varchar("notificationEmail", { length: 320 }),
  // Whether email scraping is enabled for this platform
  emailScrapingEnabled: boolean("emailScrapingEnabled").default(false),
  // Last time email scraping ran for this platform
  lastEmailScrapedAt: bigint("lastEmailScrapedAt", { mode: "number" }),
  // Previous notification email — used to detect email address changes and trigger full 2-year re-scrape
  emailNotificationEmailPrev: varchar("emailNotificationEmailPrev", { length: 320 }),
  // Last successful poll timestamp
  lastPolledAt: bigint("lastPolledAt", { mode: "number" }),
  // Last error message if poll failed
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
  // Days to block before each booking check-in
  blockDaysBefore: int("blockDaysBefore").default(0).notNull(),
  // Days to block after each booking check-out
  blockDaysAfter: int("blockDaysAfter").default(1).notNull(),
  // Block national holidays as check-in/check-out days
  blockNationalHolidays: boolean("blockNationalHolidays").default(false),
  // Block Sundays as check-in/check-out days
  blockSundays: boolean("blockSundays").default(false),
  // Custom block dates (JSON array of YYYY-MM-DD strings)
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
  // UID from the iCal VEVENT
  icalUid: varchar("icalUid", { length: 500 }),
  // Booking type: booking = guest stay, block = owner/prep block, unavailable = platform block
  bookingType: mysqlEnum("bookingType", ["booking", "block", "unavailable"]).default("booking").notNull(),
  // Block reason (for blocks and unavailable)
  blockReason: varchar("blockReason", { length: 50 }),
  summary: varchar("summary", { length: 500 }),
  description: text("description"),
  checkIn: bigint("checkIn", { mode: "number" }).notNull(),
  checkOut: bigint("checkOut", { mode: "number" }).notNull(),
  // Guest info (populated from email scraping)
  guestName: varchar("guestName", { length: 255 }),
  guestEmail: varchar("guestEmail", { length: 320 }),
  guestPhone: varchar("guestPhone", { length: 50 }),
  confirmationNumber: varchar("confirmationNumber", { length: 50 }),
  // Financial info (populated from email scraping or manual entry)
  // totalPrice  = what the guest paid (gross booking value)
  // commissionAmount = platform fee taken (e.g. Airbnb 3%, Booking.com 15%)
  // netAmount   = what you receive after commission (totalPrice - commissionAmount)
  totalPrice: decimal("totalPrice", { precision: 12, scale: 2 }),
  commissionAmount: decimal("commissionAmount", { precision: 12, scale: 2 }),
  netAmount: decimal("netAmount", { precision: 12, scale: 2 }),
  currency: varchar("currency", { length: 3 }).default("USD"),
  // ── Tax & Payout Fields ──────────────────────────────────────────────────
  // Tax remitted by platform on host's behalf (e.g. Airbnb remits NY occupancy tax for US properties)
  taxRemittedByPlatform: decimal("taxRemittedByPlatform", { precision: 12, scale: 2 }),
  // Tax still owed by host (e.g. Jamaica GART 10% + $1/night, or US Booking.com occupancy tax)
  taxOwedByHost: decimal("taxOwedByHost", { precision: 12, scale: 2 }),
  // Tax jurisdiction identifier (e.g. 'NY_OCCUPANCY', 'JM_GART', 'NONE')
  taxJurisdiction: varchar("taxJurisdiction", { length: 50 }),
  // Pass-through tax collected from guest (included in totalPrice but not host income)
  passThroughTax: decimal("passThroughTax", { precision: 12, scale: 2 }),
  // When the payout hit the bank account (cash-basis tax reporting)
  payoutDate: bigint("payoutDate", { mode: "number" }),
  // Which bank account received the payout (e.g. 'BoA Savings 0108')
  payoutBankAccount: varchar("payoutBankAccount", { length: 100 }),
  // ── Financial Provenance ────────────────────────────────────────────────────
  // Source of financial data — determines confidence level
  financialSource: mysqlEnum("financialSource", [
    "email_scrape", "platform_export", "manual", "screenshot_ocr", "channex_api"
  ]),
  // Legacy field kept for backward compat — maps to totalPrice going forward
  revenueAmount: decimal("revenueAmount", { precision: 12, scale: 2 }),
  revenueCurrency: varchar("revenueCurrency", { length: 3 }).default("USD"),
  // Additional enrichment fields from email scraping
  guestCount: int("guestCount"),
  cleaningFee: decimal("cleaningFee", { precision: 12, scale: 2 }),
  platformBookingUrl: text("platformBookingUrl"),
  // Email scrape provenance
  rawEmailSubject: varchar("rawEmailSubject", { length: 500 }),
  rawEmailDate: bigint("rawEmailDate", { mode: "number" }),
  emailScrapeSource: varchar("emailScrapeSource", { length: 64 }),
  scrapeConfidence: int("scrapeConfidence"), // 0-100
  lastEnrichedAt: bigint("lastEnrichedAt", { mode: "number" }),
  // Booking lifecycle status — 'confirmed' (active) or 'cancelled' (removed from iCal feed or detected via email)
  // Cancellation detection: iCal poll compares live feed UIDs against DB rows; missing UIDs are marked cancelled.
  // Email scraping: Booking.com cancellation emails also trigger this field.
  bookingStatus: mysqlEnum("bookingStatus", ["confirmed", "cancelled"]).default("confirmed").notNull(),
  cancelledAt: bigint("cancelledAt", { mode: "number" }),
  cancellationSource: varchar("cancellationSource", { length: 64 }), // 'ical_removal' | 'email_scrape' | 'manual'
  // Conflict flag — set when this booking overlaps with another platform booking
  hasConflict: boolean("hasConflict").default(false),
  conflictWith: varchar("conflictWith", { length: 36 }),
  // ── Dual-source provenance ──────────────────────────────────────────────────
  // dataSource tracks which sources have confirmed this booking:
  //   'ical_only'   — only seen in iCal feed, no email confirmation yet
  //   'email_only'  — created from email scraping, no iCal UID match yet
  //   'both'        — confirmed by both iCal and email (highest confidence)
  dataSource: mysqlEnum("dataSource", ["ical_only", "email_only", "both"]).default("ical_only").notNull(),
  // Email-reported dates — stored separately so we can detect iCal/email date mismatches.
  // When dataSource='both' and these differ from checkIn/checkOut by >1 day, a date-bug
  // notification is sent and email dates are used as the canonical dates.
  emailCheckIn: bigint("emailCheckIn", { mode: "number" }),
  emailCheckOut: bigint("emailCheckOut", { mode: "number" }),
  // ── Pending cancellation (3-source confirmation flow) ───────────────────────
  // Set when only ONE source (iCal or email) has signalled a cancellation.
  // Cleared when: (a) the second source confirms → auto-cancel, or
  //               (b) user confirms or dismisses via UI.
  pendingCancellationSource: varchar("pendingCancellationSource", { length: 10 }), // 'ical' | 'email'
  pendingCancellationAt: bigint("pendingCancellationAt", { mode: "number" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  // Index for the most common query pattern: filter by propertyId + date window
  propertyIdCheckInIdx: index("pb_propertyId_checkIn_idx").on(t.propertyId, t.checkIn),
  // Index for platformId lookups (conflict detection, platform-specific queries)
  platformIdIdx: index("pb_platformId_idx").on(t.platformId),
  // Index for icalUid lookups (upsert deduplication)
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

// ─── AI Memory Knowledge Base ─────────────────────────────────────────────────
// Persistent store of brand, design, and architectural decisions.
// A 24h heartbeat job reviews this table and regenerates docs/AI_MEMORY.md.
// AI agents working on this project MUST read this table at session start.
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

// ─── Booking Overrides ────────────────────────────────────────────────────────
// Manual guest name / note overlays for anonymous iCal blocks (e.g. Booking.com
// "CLOSED - Not available" entries that don't carry guest names in the iCal feed).
// Tap-to-edit on the Gantt writes here; the composite engine merges these in.
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

// ─── Audit Log ────────────────────────────────────────────────────────────────
// Structured audit trail for security-relevant actions (ISO 27001 compliance).
// Append-only: rows are never updated or deleted.
// action categories: auth, calendar, property, household, user, admin, data_export, data_delete
export const auditLog = mysqlTable("audit_log", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  // Who performed the action
  actorUserId: int("actorUserId"),
  actorOpenId: varchar("actorOpenId", { length: 64 }),
  actorEmail: varchar("actorEmail", { length: 320 }),
  actorName: varchar("actorName", { length: 255 }),
  /** Cardinal Standard: distinguishes human vs system vs AI vs scheduled job */
  actorType: mysqlEnum("actorType", ["user", "system", "geeves_ai", "scheduled_job", "system_extension"]).default("user"),
  // What household context
  householdId: varchar("householdId", { length: 36 }),
  /** Which vertical was affected (nullable — some actions are cross-vertical) */
  verticalId: varchar("verticalId", { length: 21 }),
  // What happened
  action: varchar("action", { length: 128 }).notNull(),
  category: varchar("category", { length: 64 }).notNull(),
  // Target resource (optional)
  resourceType: varchar("resourceType", { length: 64 }),
  resourceId: varchar("resourceId", { length: 128 }),
  // Outcome
  outcome: mysqlEnum("outcome", ["success", "failure", "denied"]).notNull().default("success"),
  // Structured metadata (request params, before/after state, etc.)
  metadata: json("metadata"),
  /** Cardinal Standard: JSON snapshot of changed fields BEFORE the mutation */
  previousValue: text("previousValue"),
  /** Cardinal Standard: JSON snapshot of changed fields AFTER the mutation */
  newValue: text("newValue"),
  // Request context
  ipAddress: varchar("ipAddress", { length: 64 }),
  userAgent: text("userAgent"),
  // Timestamp (UTC)
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

// ─── Project Tasks ────────────────────────────────────────────────────────────
// Persistent, DB-driven task tracker that extends the project_knowledge system.
// Every feature, bug, and deferred item from todo.md lives here as a DB row.
// The knowledge-review heartbeat syncs todo.md → this table on every run.
// The /admin/knowledge UI page queries this table for live project status.
export const projectTasks = mysqlTable("project_tasks", {
  id: int("id").autoincrement().primaryKey(),
  // Grouping / classification
  phase: varchar("phase", { length: 32 }).notNull().default("1"),
  area: varchar("area", { length: 64 }).notNull(),
  bucket: varchar("bucket", { length: 128 }),
  // Task identity — titleHash is SHA-256(title) used for idempotent upserts
  title: varchar("title", { length: 512 }).notNull(),
  titleHash: varchar("titleHash", { length: 64 }).notNull(),
  // Status
  status: mysqlEnum("status", ["todo", "in_progress", "done", "deferred", "blocked"]).notNull().default("todo"),
  priority: mysqlEnum("priority", ["critical", "high", "medium", "low"]).notNull().default("medium"),
  // Detail
  notes: text("notes"),
  deferredReason: varchar("deferredReason", { length: 512 }),
  sourceDoc: varchar("sourceDoc", { length: 256 }),
  // Lifecycle timestamps
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

// ─── Vertical Member Access ────────────────────────────────────────────────────
// Fine-grained per-member access control for a specific vertical.
// Overrides the coarse household-level vertical visibility for individual members.
//
// accessLevel:
//   full        — member sees everything the vertical allows (default for household_admin/ea)
//   read_only   — member can view but not create/edit/delete events or bookings
//   blind       — member sees only time blocks (no titles, descriptions, attendees)
//   none        — member has no access to this vertical at all
//
// calendarAccess (per-vertical calendar type override):
//   availability_only — iCal/property feed: check-in/check-out/duration only, no guest PII
//   default_vertical  — respects existing vertical_visibility rules for that calendar
//   blind             — all events show as opaque time blocks, no details
//   read_write        — full access + can create/edit events (reserved for admins/EAs)
//
// allowedCalendarIds: JSON array of calendar IDs the member can see within this vertical.
//   Empty array = all calendars in the vertical (subject to calendarAccess level).
//   Non-empty = only those specific calendar IDs are visible.
//
// canRequestMeetings: whether the member can submit booking requests for free slots.
export const verticalMemberAccess = mysqlTable("vertical_member_access", {
  id: varchar("id", { length: 36 }).primaryKey(),
  householdId: varchar("householdId", { length: 36 }).notNull(),
  verticalId: varchar("verticalId", { length: 36 }).notNull(),
  memberId: varchar("memberId", { length: 36 }).notNull(),
  // Coarse access level for the vertical
  accessLevel: mysqlEnum("accessLevel", ["full", "read_only", "blind", "none"]).notNull().default("read_only"),
  // Calendar-type-specific access level
  calendarAccess: mysqlEnum("calendarAccess", [
    "availability_only",
    "default_vertical",
    "blind",
    "read_write",
  ]).notNull().default("default_vertical"),
  // Specific calendars this member can see (empty = all calendars in the vertical)
  allowedCalendarIds: json("allowedCalendarIds").$type<string[]>().default([]),
  // Whether this member can submit booking requests for free slots in this vertical
  canRequestMeetings: boolean("canRequestMeetings").default(true).notNull(),
  // When true, multi-day all-day events are excluded from shadow block propagation to this member.
  // Use for members (e.g. children) who should see availability blocks but not long-running
  // all-day events (school terms, trips, etc.) that don't speak to moment-to-moment availability.
  excludeMultiDayEvents: boolean("excludeMultiDayEvents").default(false).notNull(),
  // Who configured this access rule
  configuredByMemberId: varchar("configuredByMemberId", { length: 36 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  // One access rule per member per vertical
  memberVerticalUniq: uniqueIndex("vma_member_vertical_uniq").on(t.memberId, t.verticalId),
  householdIdx: index("vma_household_idx").on(t.householdId),
  verticalIdx: index("vma_vertical_idx").on(t.verticalId),
  memberIdx: index("vma_member_idx").on(t.memberId),
}));
export type VerticalMemberAccess = typeof verticalMemberAccess.$inferSelect;
export type InsertVerticalMemberAccess = typeof verticalMemberAccess.$inferInsert;

// ─── Vertical Data Policies ────────────────────────────────────────────────────
// Data category visibility rules for a vertical.
// Controls which types of data are hidden from which roles or specific members.
//
// dataCategory:
//   financial   — revenue, commission, net payout, earnings, pricing data
//   private     — personal notes, private event descriptions, owner-only fields
//   guest_pii   — guest names, contact details, booking reference numbers
//   operational — prep rules, cleaning schedules, maintenance notes
//
// hiddenFromRoles: JSON array of household_members.role values that cannot see this category.
//   e.g. ["member", "child", "elder"] — hides financial data from non-admin members
//
// hiddenFromMemberIds: JSON array of specific household_members.id values.
//   Use for individual overrides (e.g. hide financial from Cary specifically).
//   Takes precedence over role-based rules.
export const verticalDataPolicies = mysqlTable("vertical_data_policies", {
  id: varchar("id", { length: 36 }).primaryKey(),
  householdId: varchar("householdId", { length: 36 }).notNull(),
  verticalId: varchar("verticalId", { length: 36 }).notNull(),
  // What type of data this policy controls
  dataCategory: mysqlEnum("dataCategory", [
    "financial",
    "private",
    "guest_pii",
    "operational",
  ]).notNull(),
  // Roles that cannot see this data category (e.g. ["member", "child", "elder"])
  hiddenFromRoles: json("hiddenFromRoles").$type<string[]>().default([]),
  // Specific member IDs that cannot see this data category (individual overrides)
  hiddenFromMemberIds: json("hiddenFromMemberIds").$type<string[]>().default([]),
  // Who configured this policy
  configuredByMemberId: varchar("configuredByMemberId", { length: 36 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  // One policy per data category per vertical
  verticalCategoryUniq: uniqueIndex("vdp_vertical_category_uniq").on(t.verticalId, t.dataCategory),
  householdIdx: index("vdp_household_idx").on(t.householdId),
  verticalIdx: index("vdp_vertical_idx").on(t.verticalId),
}));
export type VerticalDataPolicy = typeof verticalDataPolicies.$inferSelect;
export type InsertVerticalDataPolicy = typeof verticalDataPolicies.$inferInsert;

// ─── Member Resources ─────────────────────────────────────────────────────────
// Curated resource links assigned to a specific household member.
// Vertical owners and household admins can add/edit/remove resources.
// Members see their own resource list as a widget on their dashboard.
//
// resourceType:
//   link      — generic web link
//   form      — Google Form or other online form
//   doc       — Google Doc, PDF, or other document
//   invoice   — invoice template or submission link
//   template  — reusable template (contract, brief, etc.)
//
// verticalId: optional — tags the resource to a vertical for colour-coding.
//   null = household-level resource (no vertical colour).
export const memberResources = mysqlTable("member_resources", {
  id: varchar("id", { length: 36 }).primaryKey(),
  householdId: varchar("householdId", { length: 36 }).notNull(),
  // The member this resource is assigned to
  memberId: varchar("memberId", { length: 36 }).notNull(),
  // Optional vertical tag (for colour-coding and ownership context)
  verticalId: varchar("verticalId", { length: 36 }),
  // Resource details
  title: varchar("title", { length: 255 }).notNull(),
  url: text("url").notNull(),
  description: text("description"),
  resourceType: mysqlEnum("resourceType", ["link", "form", "doc", "invoice", "template"]).notNull().default("link"),
  // Display order within the member's resource list
  sortOrder: int("sortOrder").notNull().default(0),
  isActive: boolean("isActive").default(true).notNull(),
  // Who added this resource
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

// ─── Email Scrape Jobs ─────────────────────────────────────────────────────────────────────────────────
// Tracks the progress and outcome of each email scrape run per property.
// One job row per triggered scrape (manual or auto-triggered on email change).
export const emailScrapeJobs = mysqlTable("email_scrape_jobs", {
  id: varchar("id", { length: 36 }).primaryKey(),
  propertyId: varchar("propertyId", { length: 36 }).notNull(),
  emailAddress: varchar("emailAddress", { length: 320 }).notNull(),
  // Job lifecycle
  platformId: varchar("platformId", { length: 36 }),
  status: mysqlEnum("status", ["pending", "running", "done", "failed", "needs_reauth"]).notNull().default("pending"),
  startedAt: bigint("startedAt", { mode: "number" }),
  completedAt: bigint("completedAt", { mode: "number" }),
  // Progress counters
  emailsScanned: int("emailsScanned").default(0),
  bookingsEnriched: int("bookingsEnriched").default(0),
  bookingsCreated: int("bookingsCreated").default(0),
  // Error detail (if status = failed)
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  propertyIdx: index("esj_property_idx").on(t.propertyId),
  statusIdx: index("esj_status_idx").on(t.status),
}));
export type EmailScrapeJob = typeof emailScrapeJobs.$inferSelect;
export type InsertEmailScrapeJob = typeof emailScrapeJobs.$inferInsert;

// ─── Property Email Tokens ────────────────────────────────────────────────────────────────────────
// Stores Gmail OAuth tokens for property notification email addresses.
// Scope is read-only (gmail.readonly) — never write access.
// Tokens are AES-256-GCM encrypted at rest (same pattern as google_accounts).
export const propertyEmailTokens = mysqlTable("property_email_tokens", {
  id: varchar("id", { length: 36 }).primaryKey(),
  propertyId: varchar("propertyId", { length: 36 }).notNull(),
  emailAddress: varchar("emailAddress", { length: 320 }).notNull(),
  provider: mysqlEnum("provider", ["gmail", "outlook"]).notNull().default("gmail"),
  // Encrypted OAuth tokens (AES-256-GCM via tokenEncryption.ts)
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  tokenExpiry: bigint("tokenExpiry", { mode: "number" }),
  // Granted scopes (comma-separated)
  scope: varchar("scope", { length: 500 }),
  // Last successful use
  lastUsedAt: bigint("lastUsedAt", { mode: "number" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  // One token per property per email address
  propertyEmailUniq: uniqueIndex("pet_property_email_uniq").on(t.propertyId, t.emailAddress),
  propertyIdx: index("pet_property_idx").on(t.propertyId),
}));
export type PropertyEmailToken = typeof propertyEmailTokens.$inferSelect;
export type InsertPropertyEmailToken = typeof propertyEmailTokens.$inferInsert;

// ─── Member Permission Overrides ─────────────────────────────────────────────
// Per-member RBAC permission overrides on top of the role baseline.
// A granted=true override adds a permission the role doesn't have by default.
// A granted=false override removes a permission the role has by default.
// The effective permission set = role baseline + overrides (overrides win).
//
// Examples:
//   EA role has household.invite by default.
//   Setting granted=false for a specific EA member removes that permission for them only.
//
//   member role does NOT have booking.manage by default.
//   Setting granted=true for a specific member grants it to them only.
export const memberPermissionOverrides = mysqlTable("member_permission_overrides", {
  id: varchar("id", { length: 36 }).primaryKey(),
  householdId: varchar("householdId", { length: 36 }).notNull(),
  memberId: varchar("memberId", { length: 36 }).notNull(),
  // The permission key (must match a value in the Permission union type in rbac.ts)
  permission: varchar("permission", { length: 100 }).notNull(),
  // true = grant this permission (even if role doesn't have it)
  // false = revoke this permission (even if role has it)
  granted: boolean("granted").notNull(),
  // Who set this override
  configuredByMemberId: varchar("configuredByMemberId", { length: 36 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  // One override per member per permission
  memberPermUniq: uniqueIndex("mpo_member_perm_uniq").on(t.memberId, t.permission),
  householdIdx: index("mpo_household_idx").on(t.householdId),
  memberIdx: index("mpo_member_idx").on(t.memberId),
}));
export type MemberPermissionOverride = typeof memberPermissionOverrides.$inferSelect;
export type InsertMemberPermissionOverride = typeof memberPermissionOverrides.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════
// LANDING PAGE — BETA SIGNUPS & CONTACT MESSAGES
// ═══════════════════════════════════════════════════════════════════════

/**
 * beta_signups — captures interest from prospective beta testers.
 * ICP (Ideal Customer Profile) qualification fields allow the admin
 * to approve or reject applicants based on household fit.
 */
export const betaSignups = mysqlTable("beta_signups", {
  id: int("id").autoincrement().primaryKey(),
  /** Full name of the applicant */
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  /** ICP: what best describes their household/life structure */
  householdType: varchar("householdType", { length: 100 }),
  /** ICP: approximate number of people they manage logistics for */
  householdSize: varchar("householdSize", { length: 50 }),
  /** ICP: primary use case they're most excited about */
  primaryUseCase: varchar("primaryUseCase", { length: 255 }),
  /** ICP: how they heard about Geeves.Life */
  referralSource: varchar("referralSource", { length: 255 }),
  /** Free-text: anything else they want us to know */
  additionalNotes: text("additionalNotes"),
  /** Admin-assigned ICP score (1–5) after review */
  icpScore: int("icpScore"),
  /** Workflow status */
  status: mysqlEnum("status", ["pending", "approved", "waitlisted", "rejected"]).default("pending").notNull(),
  /** Admin notes on the application */
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

/**
 * contact_messages — general enquiries submitted via the landing page contact form.
 */
export const contactMessages = mysqlTable("contact_messages", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  subject: varchar("subject", { length: 255 }).notNull(),
  message: text("message").notNull(),
  /** Whether the message has been read/actioned by the admin */
  isRead: boolean("isRead").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  emailIdx: index("cm_email_idx").on(t.email),
  isReadIdx: index("cm_is_read_idx").on(t.isRead),
  createdAtIdx: index("cm_created_at_idx").on(t.createdAt),
}));
export type ContactMessage = typeof contactMessages.$inferSelect;
export type InsertContactMessage = typeof contactMessages.$inferInsert;


// ═══════════════════════════════════════════════════════════════════════
// FINANCIAL FILING MODULE
// Stores bank accounts, transactions, documents, and property expense records
// for the tarik@tjperkinsfam.com household. All JMD amounts stored as JMD,
// USD amounts stored as USD — currency field is always set explicitly.
// ═══════════════════════════════════════════════════════════════════════

/**
 * financial_accounts — one row per bank/credit account owned by a household member.
 * Covers personal and business accounts across all verticals.
 */
export const financialAccounts = mysqlTable("financial_accounts", {
  id: int("id").autoincrement().primaryKey(),
  householdId: varchar("householdId", { length: 36 }).notNull(),
  /** Human-readable name, e.g. "Scotia Day-to-Day Chequing #620505" */
  accountName: varchar("accountName", { length: 255 }).notNull(),
  institution: varchar("institution", { length: 100 }).notNull(),
  accountType: mysqlEnum("accountType", [
    "chequing", "savings", "credit_card", "business_chequing", "business_savings",
    "business_credit", "investment", "airbnb_payout",
  ]).notNull(),
  /** Last 4 digits or account suffix for display */
  lastFourDigits: varchar("lastFourDigits", { length: 10 }),
  /** Full account number — stored only when needed for reconciliation */
  accountNumber: varchar("accountNumber", { length: 50 }),
  currency: varchar("currency", { length: 3 }).default("JMD").notNull(),
  creditLimitJMD: decimal("creditLimitJMD", { precision: 14, scale: 2 }),
  /** Vertical this account primarily belongs to */
  vertical: mysqlEnum("vertical", [
    "personal", "artistes_boutique", "morabeza", "sunset_studio",
    "maxfield_bakery", "multi",
  ]).default("personal").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  /** S3 URL to the folder or most recent statement PDF */
  statementFolderUrl: text("statementFolderUrl"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  householdIdx: index("fa_household_idx").on(t.householdId),
  verticalIdx: index("fa_vertical_idx").on(t.vertical),
}));
export type FinancialAccount = typeof financialAccounts.$inferSelect;
export type InsertFinancialAccount = typeof financialAccounts.$inferInsert;

/**
 * financial_transactions — every parsed bank/credit card transaction row.
 * Source can be bank_statement (PDF parse), airbnb_csv, vrbo_csv, booking_csv, or manual.
 */
export const financialTransactions = mysqlTable("financial_transactions", {
  id: int("id").autoincrement().primaryKey(),
  householdId: varchar("householdId", { length: 36 }).notNull(),
  accountId: int("accountId").notNull(),
  /** Date the transaction occurred (from statement) */
  transactionDate: timestamp("transactionDate").notNull(),
  /** Date posted to account (may differ from transaction date) */
  postingDate: timestamp("postingDate"),
  description: varchar("description", { length: 500 }).notNull(),
  /** Bank/card reference number if present */
  referenceNumber: varchar("referenceNumber", { length: 100 }),
  /** Debit/charge amount (positive = money out) */
  debitAmount: decimal("debitAmount", { precision: 14, scale: 2 }),
  /** Credit/payment amount (positive = money in) */
  creditAmount: decimal("creditAmount", { precision: 14, scale: 2 }),
  /** Running balance after this transaction (from statement) */
  balance: decimal("balance", { precision: 14, scale: 2 }),
  currency: varchar("currency", { length: 3 }).default("JMD").notNull(),
  /** Which business/personal vertical this belongs to */
  vertical: mysqlEnum("vertical", [
    "personal", "artistes_boutique", "morabeza", "sunset_studio",
    "maxfield_bakery", "multi", "unclassified",
  ]).default("unclassified").notNull(),
  /** Expense category (mirrors spreadsheet categories) */
  expenseCategory: varchar("expenseCategory", { length: 100 }),
  /** AI auto-tag confidence 0–100 */
  aiConfidence: int("aiConfidence"),
  /** True if user has manually confirmed/overridden the vertical/category */
  isManualOverride: boolean("isManualOverride").default(false).notNull(),
  /** True if this transaction has been matched to an expense_record row */
  isReconciled: boolean("isReconciled").default(false).notNull(),
  /** Linked expense_record id if reconciled */
  expenseRecordId: int("expenseRecordId"),
  /** S3 URL of supporting receipt/invoice/email PDF */
  receiptUrl: text("receiptUrl"),
  /** Source of this transaction record */
  source: mysqlEnum("source", [
    "bank_statement", "airbnb_csv", "vrbo_csv", "booking_csv", "manual",
  ]).default("bank_statement").notNull(),
  /** Statement month/year for easy filtering */
  statementYear: int("statementYear"),
  statementMonth: int("statementMonth"),
  isTaxDeductible: boolean("isTaxDeductible").default(false).notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  householdIdx: index("ft_household_idx").on(t.householdId),
  accountIdx: index("ft_account_idx").on(t.accountId),
  dateIdx: index("ft_date_idx").on(t.transactionDate),
  verticalIdx: index("ft_vertical_idx").on(t.vertical),
  yearMonthIdx: index("ft_year_month_idx").on(t.statementYear, t.statementMonth),
  reconciledIdx: index("ft_reconciled_idx").on(t.isReconciled),
}));
export type FinancialTransaction = typeof financialTransactions.$inferSelect;
export type InsertFinancialTransaction = typeof financialTransactions.$inferInsert;

/**
 * financial_documents — every uploaded financial document (statement PDFs,
 * receipts, invoices, email evidence PDFs) stored in S3.
 */
export const financialDocuments = mysqlTable("financial_documents", {
  id: int("id").autoincrement().primaryKey(),
  householdId: varchar("householdId", { length: 36 }).notNull(),
  /** Linked transaction (nullable — statements link to account, not a single transaction) */
  transactionId: int("transactionId"),
  /** Linked account (for bank statements) */
  accountId: int("accountId"),
  documentType: mysqlEnum("documentType", [
    "bank_statement", "credit_card_statement", "receipt", "invoice",
    "email_evidence", "airbnb_report", "vrbo_report", "booking_report",
    "tax_document", "other",
  ]).notNull(),
  /** Date of the document (statement date, invoice date, etc.) */
  documentDate: timestamp("documentDate"),
  description: varchar("description", { length: 500 }).notNull(),
  /** S3 object key */
  s3Key: varchar("s3Key", { length: 500 }).notNull(),
  /** Public S3 URL */
  s3Url: text("s3Url").notNull(),
  /** Original filename */
  originalFilename: varchar("originalFilename", { length: 255 }),
  /** Which property/vertical this document belongs to */
  vertical: mysqlEnum("vertical", [
    "personal", "artistes_boutique", "morabeza", "sunset_studio",
    "maxfield_bakery", "multi",
  ]).default("personal").notNull(),
  statementYear: int("statementYear"),
  statementMonth: int("statementMonth"),
  currency: varchar("currency", { length: 3 }).default("JMD"),
  taxYear: int("taxYear"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  householdIdx: index("fd_household_idx").on(t.householdId),
  accountIdx: index("fd_account_idx").on(t.accountId),
  transactionIdx: index("fd_transaction_idx").on(t.transactionId),
  verticalIdx: index("fd_vertical_idx").on(t.vertical),
  yearIdx: index("fd_year_idx").on(t.taxYear),
}));
export type FinancialDocument = typeof financialDocuments.$inferSelect;
export type InsertFinancialDocument = typeof financialDocuments.$inferInsert;

/**
 * property_expense_records — imported from the Jamaican Properties spreadsheet.
 * Each row is one expense line item for a property, in JMD.
 * Can be linked to a financial_transaction for bank reconciliation
 * and to a financial_document for supporting evidence.
 */
export const propertyExpenseRecords = mysqlTable("property_expense_records", {
  id: int("id").autoincrement().primaryKey(),
  householdId: varchar("householdId", { length: 36 }).notNull(),
  /** Which property this expense belongs to */
  property: mysqlEnum("property", [
    "artistes_boutique", "morabeza", "sunset_studio",
  ]).notNull(),
  /** Date from spreadsheet */
  expenseDate: timestamp("expenseDate").notNull(),
  expenseYear: int("expenseYear").notNull(),
  expenseMonth: int("expenseMonth").notNull(),
  /** Description/name of the expense */
  expenseDescription: varchar("expenseDescription", { length: 500 }).notNull(),
  /** Category from spreadsheet (UTILITIES, MAINTENANCE, etc.) */
  category: varchar("category", { length: 100 }).notNull(),
  /** Amount in JMD */
  amountJMD: decimal("amountJMD", { precision: 14, scale: 2 }).notNull(),
  /** Who was paid (vendor/payee) */
  paidTo: varchar("paidTo", { length: 255 }),
  /** Who paid — TARIK, TAZ, HERMA, CASH, CBNA, MANNY */
  paidFrom: varchar("paidFrom", { length: 100 }),
  /** Linked bank transaction id (for reconciliation) */
  bankTransactionId: int("bankTransactionId"),
  /** Linked supporting document id */
  documentId: int("documentId"),
  /** S3 URL of supporting receipt/invoice/email PDF (denormalized for quick access) */
  supportingDocUrl: text("supportingDocUrl"),
  /** Notes or context */
  notes: text("notes"),
  /** True if this expense has been matched to a bank transaction */
  isReconciled: boolean("isReconciled").default(false).notNull(),
  isTaxDeductible: boolean("isTaxDeductible").default(true).notNull(),
  /** Amount in USD (for US properties or converted from JMD) */
  amountUSD: decimal("amountUSD", { precision: 14, scale: 2 }),
  /** Exchange rate used for JMD→USD conversion */
  exchangeRateUsed: decimal("exchangeRateUsed", { precision: 10, scale: 4 }),
  /** QuickBooks Online expense ID (when synced) */
  qboExpenseId: varchar("qboExpenseId", { length: 100 }),
  /** QBO sync status */
  qboSyncStatus: mysqlEnum("qboSyncStatus", ["pending", "synced", "failed", "skipped"]).default("pending").notNull(),
  /** When last synced to QBO */
  qboSyncedAt: timestamp("qboSyncedAt"),
  /** QBO error message if sync failed */
  qboSyncError: text("qboSyncError"),
  /** Linked order_items id (when expense originated from an order) */
  orderItemId: int("orderItemId"),
  /** Source of this record */
  source: mysqlEnum("source", ["spreadsheet_import", "manual", "email_scrape", "order_import"]).default("spreadsheet_import").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  householdIdx: index("per_household_idx").on(t.householdId),
  propertyIdx: index("per_property_idx").on(t.property),
  yearIdx: index("per_year_idx").on(t.expenseYear),
  categoryIdx: index("per_category_idx").on(t.category),
  reconciledIdx: index("per_reconciled_idx").on(t.isReconciled),
}));
export type PropertyExpenseRecord = typeof propertyExpenseRecords.$inferSelect;
export type InsertPropertyExpenseRecord = typeof propertyExpenseRecords.$inferInsert;

/**
 * airbnb_payout_records — imported from Airbnb transaction CSV exports.
 * Covers all three properties, 2024–2026. Currency is always USD.
 */
export const airbnbPayoutRecords = mysqlTable("airbnb_payout_records", {
  id: int("id").autoincrement().primaryKey(),
  householdId: varchar("householdId", { length: 36 }).notNull(),
  /** Which property */
  property: mysqlEnum("property", [
    "artistes_boutique", "morabeza", "sunset_studio",
  ]).notNull(),
  /** Date of payout or reservation */
  recordDate: timestamp("recordDate").notNull(),
  /** Airbnb row type: Payout, Reservation, Pass Through Tot, Resolution, etc. */
  recordType: varchar("recordType", { length: 100 }).notNull(),
  /** Airbnb confirmation code (for reservations) */
  confirmationCode: varchar("confirmationCode", { length: 50 }),
  /** Booking date */
  bookingDate: timestamp("bookingDate"),
  /** Check-in date */
  startDate: timestamp("startDate"),
  /** Check-out date */
  endDate: timestamp("endDate"),
  nights: int("nights"),
  guestName: varchar("guestName", { length: 255 }),
  listingName: varchar("listingName", { length: 255 }),
  details: varchar("details", { length: 500 }),
  referenceCode: varchar("referenceCode", { length: 100 }),
  currency: varchar("currency", { length: 3 }).default("USD").notNull(),
  /** Amount (positive = income, negative = adjustment) */
  amount: decimal("amount", { precision: 12, scale: 2 }),
  /** Actual payout amount (for Payout rows) */
  paidOut: decimal("paidOut", { precision: 12, scale: 2 }),
  serviceFee: decimal("serviceFee", { precision: 12, scale: 2 }),
  cleaningFee: decimal("cleaningFee", { precision: 12, scale: 2 }),
  managementFee: decimal("managementFee", { precision: 12, scale: 2 }),
  petFee: decimal("petFee", { precision: 12, scale: 2 }),
  grossEarnings: decimal("grossEarnings", { precision: 12, scale: 2 }),
  airbnbRemittedTax: decimal("airbnbRemittedTax", { precision: 12, scale: 2 }),
  earningsYear: int("earningsYear"),
  /** Linked bank transaction id if payout has been matched to a deposit */
  bankTransactionId: int("bankTransactionId"),
  /** Linked financial_document id (e.g. Airbnb CSV report) */
  documentId: int("documentId"),
  isReconciled: boolean("isReconciled").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  householdIdx: index("apr_household_idx").on(t.householdId),
  propertyIdx: index("apr_property_idx").on(t.property),
  yearIdx: index("apr_year_idx").on(t.earningsYear),
  confirmationIdx: index("apr_confirmation_idx").on(t.confirmationCode),
}));
export type AirbnbPayoutRecord = typeof airbnbPayoutRecords.$inferSelect;
export type InsertAirbnbPayoutRecord = typeof airbnbPayoutRecords.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════
// OAUTH NONCE STORE — DB-backed to survive Autoscale cold-start across instances
// ═══════════════════════════════════════════════════════════════════════

export const oauthNonces = mysqlTable("oauth_nonces", {
  nonce: varchar("nonce", { length: 128 }).primaryKey(),
  expiresAt: bigint("expiresAt", { mode: "number" }).notNull(),
});
export type OAuthNonce = typeof oauthNonces.$inferSelect;

// ─── Scope Consent Preferences ────────────────────────────────────────────────
// P-35: Stores "Do Not Show Again" preferences per user per scope.
// When a user checks "Do not show this again" on the ScopeConsentModal,
// a row is written here. The frontend checks this before showing the modal.
export const scopeConsentPreferences = mysqlTable("scope_consent_preferences", {
  id: varchar("id", { length: 36 }).primaryKey(),
  userId: int("userId").notNull(),
  scopeKey: varchar("scopeKey", { length: 128 }).notNull(), // e.g. "google.calendar", "google.gmail.readonly"
  dismissedAt: bigint("dismissedAt", { mode: "number" }).notNull(),
});
export type ScopeConsentPreference = typeof scopeConsentPreferences.$inferSelect;
// ═══════════════════════════════════════════════════════════════════════
// P-40: CUSTOM ROLES — fully manageable roles with per-permission,
// widget, and vertical-domain access control
// ═══════════════════════════════════════════════════════════════════════
export const customRoles = mysqlTable("custom_roles", {
  id: varchar("id", { length: 36 }).primaryKey(),
  householdId: varchar("householdId", { length: 36 }).notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  description: varchar("description", { length: 500 }),
  baseRole: varchar("baseRole", { length: 50 }).notNull().default("member"),
  permissions: json("permissions").$type<string[]>().default([]),
  deniedPermissions: json("deniedPermissions").$type<string[]>().default([]),
  allowedWidgets: json("allowedWidgets").$type<string[] | null>().default(null),
  allowedVerticalIds: json("allowedVerticalIds").$type<string[] | null>().default(null),
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

// ═══════════════════════════════════════════════════════════════════════
// P-45: WIDGET LAYOUT — per-member personalized widget order
// ═══════════════════════════════════════════════════════════════════════
export const widgetLayouts = mysqlTable("widget_layouts", {
  memberId: varchar("memberId", { length: 36 }).primaryKey(),
  householdId: varchar("householdId", { length: 36 }).notNull(),
  layout: json("layout").$type<string[]>().notNull().default([]),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  householdIdx: index("wl_household_idx").on(t.householdId),
}));
export type WidgetLayout = typeof widgetLayouts.$inferSelect;
export type InsertWidgetLayout = typeof widgetLayouts.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════
// PROPAGATION RETRY QUEUE — ensures shadow block updates are never lost
// ═══════════════════════════════════════════════════════════════════════
export const propagationQueue = mysqlTable("propagation_queue", {
  id: varchar("id", { length: 36 }).primaryKey(),
  eventId: varchar("eventId", { length: 36 }).notNull(),
  householdId: varchar("householdId", { length: 36 }).notNull(),
  reason: mysqlEnum("reason", [
    "rate_limit",
    "circuit_breaker",
    "lock_conflict",
    "google_error",
    "network_error",
  ]).notNull(),
  attempts: int("attempts").default(0).notNull(),
  maxAttempts: int("maxAttempts").default(5).notNull(),
  nextRetryAt: bigint("nextRetryAt", { mode: "number" }).notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  resolvedAt: bigint("resolvedAt", { mode: "number" }),
  status: mysqlEnum("status", ["pending", "resolved", "failed"]).default("pending").notNull(),
}, (t) => ({
  nextRetryIdx: index("pq_next_retry_idx").on(t.status, t.nextRetryAt),
  eventIdx: index("pq_event_idx").on(t.eventId),
}));
export type PropagationQueueItem = typeof propagationQueue.$inferSelect;
export type InsertPropagationQueueItem = typeof propagationQueue.$inferInsert;


/**
 * order_items — Normalized line items from orders (Amazon, Walmart, Wayfair, Home Depot, Lowe's, etc.)
 * Each row is one product/item from an order. Enables per-item categorization and property attribution.
 * Links back to the parent `orders` row and optionally to a `property_expense_records` row when
 * the item is confirmed as a property expense.
 */
export const orderItems = mysqlTable("order_items", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull(),
  /** Product name as it appeared on the receipt/email */
  name: varchar("name", { length: 500 }).notNull(),
  /** Quantity purchased */
  quantity: int("quantity").default(1).notNull(),
  /** Unit price (before tax) */
  unitPrice: decimal("unitPrice", { precision: 12, scale: 2 }),
  /** Line total (qty × unitPrice, or as stated on receipt) */
  lineTotal: decimal("lineTotal", { precision: 12, scale: 2 }),
  /** Currency */
  currency: varchar("currency", { length: 3 }).default("USD").notNull(),
  /** Product URL from the vendor */
  productUrl: text("productUrl"),
  /** Vendor SKU / product ID */
  vendorProductId: varchar("vendorProductId", { length: 255 }),
  /** ASIN for Amazon products */
  asin: varchar("asin", { length: 20 }),
  /** Expense category (FIXTURES AND FITTINGS, CLEANING SUPPLIES, MAINTENANCE, etc.) */
  expenseCategory: varchar("expenseCategory", { length: 100 }),
  /** Which property this item is attributed to (null = personal or unclassified) */
  propertyAttribution: mysqlEnum("propertyAttribution", [
    "artistes_boutique", "morabeza", "sunset_studio", "personal", "unclassified",
  ]).default("unclassified").notNull(),
  /** Is this item a tax-deductible business expense? */
  isTaxDeductible: boolean("isTaxDeductible").default(false).notNull(),
  /** AI confidence score for the categorization (0-100) */
  aiConfidence: int("aiConfidence"),
  /** True if user manually confirmed/overrode the AI categorization */
  isManualOverride: boolean("isManualOverride").default(false).notNull(),
  /** Linked property_expense_records id (when synced as an expense) */
  expenseRecordId: int("expenseRecordId"),
  /** Delivery address from the order (helps determine property attribution) */
  deliveryAddress: varchar("deliveryAddress", { length: 500 }),
  /** Tags for historical learning (e.g., "bedding", "kitchen", "bathroom") */
  tags: json("tags"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  orderIdx: index("oi_order_idx").on(t.orderId),
  propertyIdx: index("oi_property_idx").on(t.propertyAttribution),
  categoryIdx: index("oi_category_idx").on(t.expenseCategory),
  deductibleIdx: index("oi_deductible_idx").on(t.isTaxDeductible),
}));
export type OrderItem = typeof orderItems.$inferSelect;
export type InsertOrderItem = typeof orderItems.$inferInsert;

/**
 * expense_categorization_rules — Historical knowledge base for AI categorization.
 * Each rule maps a product name pattern to a category + property.
 * Built from confirmed categorizations (manual overrides or high-confidence AI matches).
 */
export const expenseCategorizationRules = mysqlTable("expense_categorization_rules", {
  id: int("id").autoincrement().primaryKey(),
  /** Pattern to match against item names (case-insensitive substring or regex) */
  namePattern: varchar("namePattern", { length: 255 }).notNull(),
  /** Matched expense category */
  category: varchar("category", { length: 100 }).notNull(),
  /** Default property attribution for this pattern */
  defaultProperty: mysqlEnum("defaultProperty", [
    "artistes_boutique", "morabeza", "sunset_studio", "personal",
  ]),
  /** How many times this rule has been applied */
  hitCount: int("hitCount").default(0).notNull(),
  /** Confidence threshold — only apply if AI confidence >= this */
  minConfidence: int("minConfidence").default(80).notNull(),
  /** Is this rule active? */
  isActive: boolean("isActive").default(true).notNull(),
  /** Source of this rule */
  source: mysqlEnum("source", ["ai_learned", "manual", "seed"]).default("ai_learned").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  patternIdx: index("ecr_pattern_idx").on(t.namePattern),
  categoryIdx: index("ecr_category_idx").on(t.category),
}));
export type ExpenseCategorizationRule = typeof expenseCategorizationRules.$inferSelect;
export type InsertExpenseCategorizationRule = typeof expenseCategorizationRules.$inferInsert;


// ═══════════════════════════════════════════════════════════════════════
// PROPERTY PHOTOS — up to 3 photos per property for carousel identification
// ═══════════════════════════════════════════════════════════════════════
export const propertyPhotos = mysqlTable("property_photos", {
  id: varchar("id", { length: 36 }).primaryKey(),
  propertyId: varchar("propertyId", { length: 36 }).notNull(),
  householdId: varchar("householdId", { length: 36 }).notNull(),
  /** S3 URL for the photo */
  url: text("url").notNull(),
  /** S3 key for deletion */
  s3Key: text("s3Key").notNull(),
  /** Optional caption */
  caption: varchar("caption", { length: 255 }),
  /** Sort order (0-based, lower = first) */
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  propertyIdx: index("pp_property_idx").on(t.propertyId),
}));
export type PropertyPhoto = typeof propertyPhotos.$inferSelect;
export type InsertPropertyPhoto = typeof propertyPhotos.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════
// PROPERTY MEMBER ORDER — per-member drag-and-drop ordering of properties
// ═══════════════════════════════════════════════════════════════════════
export const propertyMemberOrder = mysqlTable("property_member_order", {
  memberId: varchar("memberId", { length: 36 }).primaryKey(),
  householdId: varchar("householdId", { length: 36 }).notNull(),
  /** Ordered array of property IDs — first = top of list */
  propertyOrder: json("propertyOrder").$type<string[]>().notNull().default([]),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  householdIdx: index("pmo_household_idx").on(t.householdId),
}));
export type PropertyMemberOrder = typeof propertyMemberOrder.$inferSelect;
export type InsertPropertyMemberOrder = typeof propertyMemberOrder.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════
// LTR PAYMENTS — rent, utility fees, deposits for long-term rental properties
// ═══════════════════════════════════════════════════════════════════════
export const ltrPayments = mysqlTable("ltr_payments", {
  id: varchar("id", { length: 36 }).primaryKey(),
  propertyId: varchar("propertyId", { length: 36 }).notNull(),
  householdId: varchar("householdId", { length: 36 }).notNull(),
  /** Tenant name (e.g. 'Jennifer Ungberg', 'Nathan Doe') */
  tenantName: varchar("tenantName", { length: 255 }).notNull(),
  /** Payment type */
  paymentType: mysqlEnum("paymentType", ["rent", "utility_fee", "deposit", "late_fee", "other"]).notNull(),
  /** Amount received (or expected) */
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).default("USD").notNull(),
  /** Expected amount for this period (for tracking shortfalls) */
  expectedAmount: decimal("expectedAmount", { precision: 12, scale: 2 }),
  /** Due date (Unix ms) */
  dueDate: bigint("dueDate", { mode: "number" }).notNull(),
  /** Actual paid date (Unix ms, null if unpaid) */
  paidDate: bigint("paidDate", { mode: "number" }),
  /** Payment method (e.g. 'Zillow', 'Stripe', 'Cash', 'Venmo') */
  paymentMethod: varchar("paymentMethod", { length: 100 }),
  /** Payment status */
  status: mysqlEnum("status", ["paid", "pending", "overdue", "partial", "waived"]).default("pending").notNull(),
  /** Notes or context */
  notes: text("notes"),
  /** Linked bank transaction id (for reconciliation) */
  bankTransactionId: int("bankTransactionId"),
  /** Source of this record */
  source: mysqlEnum("source", ["manual", "stripe_webhook", "zillow_import", "email_scrape"]).default("manual").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  propertyIdx: index("ltr_property_idx").on(t.propertyId),
  householdIdx: index("ltr_household_idx").on(t.householdId),
  dueDateIdx: index("ltr_due_date_idx").on(t.dueDate),
  statusIdx: index("ltr_status_idx").on(t.status),
}));
export type LtrPayment = typeof ltrPayments.$inferSelect;
export type InsertLtrPayment = typeof ltrPayments.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════
// BOOKING SCREENSHOTS — Pulse app / Extranet screenshots for Booking.com OCR
// ═══════════════════════════════════════════════════════════════════════
export const bookingScreenshots = mysqlTable("booking_screenshots", {
  id: varchar("id", { length: 36 }).primaryKey(),
  bookingId: varchar("bookingId", { length: 36 }).notNull(),
  householdId: varchar("householdId", { length: 36 }).notNull(),
  /** S3 URL for the screenshot */
  s3Url: text("s3Url").notNull(),
  /** S3 key for deletion */
  s3Key: text("s3Key").notNull(),
  /** OCR-extracted data (JSON with gross, commission, net, dates, guestName, etc.) */
  ocrExtractedData: json("ocrExtractedData"),
  /** OCR confidence score 0-100 */
  ocrConfidence: int("ocrConfidence"),
  /** Whether the OCR data has been confirmed by user */
  isConfirmed: boolean("isConfirmed").default(false).notNull(),
  /** Who uploaded this screenshot */
  uploadedByMemberId: varchar("uploadedByMemberId", { length: 36 }),
  uploadedAt: timestamp("uploadedAt").defaultNow().notNull(),
}, (t) => ({
  bookingIdx: index("bs_booking_idx").on(t.bookingId),
  householdIdx: index("bs_household_idx").on(t.householdId),
}));
export type BookingScreenshot = typeof bookingScreenshots.$inferSelect;
export type InsertBookingScreenshot = typeof bookingScreenshots.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════
// PLATFORM EXPORT IMPORTS — track CSV/XLS uploads for reconciliation
// ═══════════════════════════════════════════════════════════════════════
export const platformExportImports = mysqlTable("platform_export_imports", {
  id: varchar("id", { length: 36 }).primaryKey(),
  householdId: varchar("householdId", { length: 36 }).notNull(),
  /** Platform this export came from */
  platform: mysqlEnum("platform", ["airbnb", "vrbo", "booking_com"]).notNull(),
  /** Original filename */
  filename: varchar("filename", { length: 255 }).notNull(),
  /** S3 URL of the uploaded file */
  s3Url: text("s3Url").notNull(),
  s3Key: text("s3Key").notNull(),
  /** Number of records in the file */
  recordCount: int("recordCount"),
  /** Number of records successfully matched to existing bookings */
  matchedCount: int("matchedCount"),
  /** Number of new bookings created from this import */
  createdCount: int("createdCount"),
  /** Import status */
  status: mysqlEnum("importStatus", ["processing", "completed", "failed", "partial"]).default("processing").notNull(),
  /** Error message if failed */
  errorMessage: text("errorMessage"),
  /** Who uploaded */
  uploadedByMemberId: varchar("uploadedByMemberId", { length: 36 }),
  importedAt: timestamp("importedAt").defaultNow().notNull(),
}, (t) => ({
  householdIdx: index("pei_household_idx").on(t.householdId),
  platformIdx: index("pei_platform_idx").on(t.platform),
}));
export type PlatformExportImport = typeof platformExportImports.$inferSelect;
export type InsertPlatformExportImport = typeof platformExportImports.$inferInsert;


// ═══════════════════════════════════════════════════════════════════════
// SECTION 16: VENDOR MATCHING, EXPENSES MODULE & SHOPPING MODULE
// ═══════════════════════════════════════════════════════════════════════

// ─── Chart of Accounts ───────────────────────────────────────────────
// QBO-mirrored hierarchy per vertical. Drives expense categorization,
// tax form mapping, and reconciliation.
export const chartOfAccounts = mysqlTable("chart_of_accounts", {
  id: varchar("id", { length: 21 }).primaryKey(), // nanoid
  verticalId: varchar("verticalId", { length: 36 }).notNull(),
  householdId: varchar("householdId", { length: 36 }).notNull(),
  accountType: mysqlEnum("accountType", [
    "income", "cost_of_goods_sold", "expense", "other_expense",
    "other_income", "asset", "liability", "equity",
    "accounts_receivable", "accounts_payable", "bank", "credit_card",
  ]).notNull(),
  detailType: varchar("detailType", { length: 100 }).notNull(),
  accountName: varchar("accountName", { length: 200 }).notNull(),
  accountNumber: varchar("accountNumber", { length: 20 }),
  description: varchar("description", { length: 500 }),
  parentAccountId: varchar("parentAccountId", { length: 21 }),
  displayOrder: int("displayOrder").default(0),
  qboAccountId: varchar("qboAccountId", { length: 50 }),
  qboFullyQualifiedName: varchar("qboFullyQualifiedName", { length: 300 }),
  qboSyncStatus: mysqlEnum("qboSyncStatus", [
    "synced", "pending_create", "pending_map", "geeves_only", "deprecated",
  ]).default("geeves_only"),
  lastSyncedAt: bigint("lastSyncedAt", { mode: "number" }),
  isActive: boolean("isActive").default(true),
  isDefault: boolean("isDefault").default(false),
  isSystemAccount: boolean("isSystemAccount").default(false),
  isTaxRelevant: boolean("isTaxRelevant").default(false),
  taxFormLine: varchar("taxFormLine", { length: 50 }),
  taxJurisdiction: mysqlEnum("taxJurisdiction", ["us_federal", "us_state", "jamaica"]),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
  createdBy: varchar("createdBy", { length: 36 }),
}, (t) => ({
  verticalIdx: index("coa_vertical_idx").on(t.verticalId),
  householdVerticalIdx: index("coa_household_vertical_idx").on(t.householdId, t.verticalId),
  accountTypeIdx: index("coa_account_type_idx").on(t.verticalId, t.accountType),
  qboAccountIdx: index("coa_qbo_account_idx").on(t.qboAccountId),
  uniqueNamePerVertical: uniqueIndex("coa_unique_name").on(t.verticalId, t.accountName),
}));
export type ChartOfAccount = typeof chartOfAccounts.$inferSelect;
export type InsertChartOfAccount = typeof chartOfAccounts.$inferInsert;

// ─── Vertical Financial Configs ──────────────────────────────────────
// Per-vertical financial settings: currency, reconciliation tolerance,
// QBO realm, tax jurisdiction, matching strategy.
export const verticalFinancialConfigs = mysqlTable("vertical_financial_configs", {
  id: varchar("id", { length: 21 }).primaryKey(), // nanoid
  verticalId: varchar("verticalId", { length: 36 }).notNull().unique(),
  householdId: varchar("householdId", { length: 36 }).notNull(),
  defaultCurrency: varchar("defaultCurrency", { length: 3 }).notNull().default("USD"),
  supportedCurrencies: varchar("supportedCurrencies", { length: 50 }).default("USD"),
  exchangeRateToUsd: decimal("exchangeRateToUsd", { precision: 12, scale: 6 }),
  exchangeRateLastUpdated: bigint("exchangeRateLastUpdated", { mode: "number" }),
  exchangeRateSource: varchar("exchangeRateSource", { length: 50 }).default("manual"),
  reconciliationToleranceAbs: decimal("reconciliationToleranceAbs", { precision: 10, scale: 2 }).default("1.00"),
  reconciliationTolerancePct: decimal("reconciliationTolerancePct", { precision: 5, scale: 2 }).default("2.00"),
  dateWindowDays: int("dateWindowDays").default(7),
  autoMatchMinConfidence: decimal("autoMatchMinConfidence", { precision: 5, scale: 2 }).default("0.85"),
  proposalMinConfidence: decimal("proposalMinConfidence", { precision: 5, scale: 2 }).default("0.60"),
  qboRealmId: varchar("qboRealmId", { length: 50 }),
  qboCompanyName: varchar("qboCompanyName", { length: 200 }),
  qboSyncEnabled: boolean("qboSyncEnabled").default(false),
  qboLastSyncAt: bigint("qboLastSyncAt", { mode: "number" }),
  qboSyncDirection: mysqlEnum("qboSyncDirection", [
    "geeves_to_qbo", "qbo_to_geeves", "bidirectional",
  ]).default("geeves_to_qbo"),
  qboDefaultClassId: varchar("qboDefaultClassId", { length: 50 }),
  qboDefaultClassName: varchar("qboDefaultClassName", { length: 100 }),
  exportFormat: mysqlEnum("exportFormat", ["api", "iif", "csv", "qbo_web_connector"]).default("api"),
  exportApprovalRequired: boolean("exportApprovalRequired").default(true),
  exportBatchSize: int("exportBatchSize").default(50),
  taxJurisdiction: mysqlEnum("taxJurisdiction_vfc", ["us_federal", "us_state_ny", "us_state_ca", "jamaica"]),
  taxEntityType: mysqlEnum("taxEntityType", ["sole_proprietor", "llc_single", "llc_multi", "corporation", "partnership", "personal"]),
  taxFormType: varchar("taxFormType", { length: 20 }),
  fiscalYearEnd: varchar("fiscalYearEnd", { length: 5 }).default("12-31"),
  accountingMethod: mysqlEnum("accountingMethod", ["cash", "accrual"]).default("cash"),
  defaultVendorMatchStrategy: mysqlEnum("defaultVendorMatchStrategy", [
    "strict", "moderate", "manual",
  ]).default("strict"),
  createdAt: bigint("createdAt_vfc", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt_vfc", { mode: "number" }).notNull(),
}, (t) => ({
  verticalIdx: index("vfc_vertical_idx").on(t.verticalId),
  householdIdx: index("vfc_household_idx").on(t.householdId),
  qboRealmIdx: index("vfc_qbo_realm_idx").on(t.qboRealmId),
}));
export type VerticalFinancialConfig = typeof verticalFinancialConfigs.$inferSelect;
export type InsertVerticalFinancialConfig = typeof verticalFinancialConfigs.$inferInsert;

// ─── Vendor Accounts ─────────────────────────────────────────────────
// Normalized vendor registry. Each vendor (Amazon, Walmart, etc.) has one
// row per household. Stores platform credentials, matching rules, and
// sync metadata.
export const vendorAccounts = mysqlTable("vendor_accounts", {
  id: varchar("id", { length: 21 }).primaryKey(), // nanoid
  householdId: varchar("householdId", { length: 36 }).notNull(),
  vendorName: varchar("vendorName", { length: 200 }).notNull(),
  vendorSlug: varchar("vendorSlug", { length: 50 }).notNull(),
  platform: mysqlEnum("platform", [
    "amazon", "walmart", "uber", "google", "apple", "paypal",
    "lowes", "target", "home_depot", "shopify", "wayfair",
    "costco", "sams_club", "instacart", "doordash", "grubhub",
    "other",
  ]).notNull(),
  /** How this vendor's name typically appears on bank statements */
  bankStatementPatterns: json("bankStatementPatterns").$type<string[]>(),
  /** Account email/username for this vendor */
  accountEmail: varchar("accountEmail", { length: 320 }),
  accountUsername: varchar("accountUsername", { length: 200 }),
  /** Default vertical for purchases from this vendor */
  defaultVerticalId: varchar("defaultVerticalId", { length: 36 }),
  /** Default chart of accounts category */
  defaultChartOfAccountId: varchar("defaultChartOfAccountId", { length: 21 }),
  /** Default property for purchases from this vendor */
  defaultPropertyId: varchar("defaultPropertyId", { length: 36 }),
  /** Matching strategy override (null = use vertical default) */
  matchStrategy: mysqlEnum("matchStrategy", ["strict", "moderate", "manual"]),
  /** Import method */
  importMethod: mysqlEnum("importMethod", [
    "email_scrape", "api", "csv_upload", "manual", "browser_extension",
  ]).default("manual"),
  /** Last successful import timestamp */
  lastImportAt: bigint("lastImportAt", { mode: "number" }),
  lastImportCount: int("lastImportCount"),
  isActive: boolean("isActive").default(true),
  notes: text("notes"),
  createdAt: bigint("createdAt_va", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt_va", { mode: "number" }).notNull(),
}, (t) => ({
  householdIdx: index("va_household_idx").on(t.householdId),
  platformIdx: index("va_platform_idx").on(t.platform),
  slugIdx: uniqueIndex("va_slug_household_idx").on(t.householdId, t.vendorSlug),
}));
export type VendorAccount = typeof vendorAccounts.$inferSelect;
export type InsertVendorAccount = typeof vendorAccounts.$inferInsert;

// ─── Vendor Orders ───────────────────────────────────────────────────
// Unified order-level records from all vendors. Replaces legacy `orders`
// and `walmart_orders` tables.
export const vendorOrders = mysqlTable("vendor_orders", {
  id: varchar("id", { length: 21 }).primaryKey(), // nanoid
  householdId: varchar("householdId", { length: 36 }).notNull(),
  vendorAccountId: varchar("vendorAccountId", { length: 21 }).notNull(),
  /** Order number as shown by vendor */
  orderNumber: varchar("orderNumber", { length: 255 }),
  /** Platform for quick filtering without join */
  platform: mysqlEnum("platform_vo", [
    "amazon", "walmart", "uber", "google", "apple", "paypal",
    "lowes", "target", "home_depot", "shopify", "wayfair",
    "costco", "sams_club", "instacart", "doordash", "grubhub",
    "other",
  ]).notNull(),
  /** Order status */
  status: mysqlEnum("status_vo", [
    "pending", "processing", "shipped", "delivered", "cancelled", "returned", "refunded",
  ]).default("pending").notNull(),
  /** Order total (pre-tax) */
  subtotal: decimal("subtotal", { precision: 12, scale: 2 }),
  /** Tax amount */
  taxAmount: decimal("taxAmount", { precision: 12, scale: 2 }),
  /** Shipping/delivery fee */
  shippingAmount: decimal("shippingAmount", { precision: 12, scale: 2 }),
  /** Total charged (subtotal + tax + shipping - discounts) */
  totalAmount: decimal("totalAmount", { precision: 12, scale: 2 }),
  /** Discount amount */
  discountAmount: decimal("discountAmount", { precision: 12, scale: 2 }),
  currency: varchar("currency_vo", { length: 3 }).default("USD").notNull(),
  /** Order date (UTC ms) */
  orderDate: bigint("orderDate", { mode: "number" }).notNull(),
  /** Delivery/completion date (UTC ms) */
  deliveryDate: bigint("deliveryDate", { mode: "number" }),
  /** Tracking number(s) — JSON array for multi-shipment */
  trackingNumbers: json("trackingNumbers").$type<string[]>(),
  /** Delivery address (for property attribution) */
  deliveryAddress: varchar("deliveryAddress", { length: 500 }),
  /** Payment method used */
  paymentMethod: varchar("paymentMethod", { length: 100 }),
  /** Card last 4 digits (for bank matching) */
  paymentCardLast4: varchar("paymentCardLast4", { length: 4 }),
  /** How this order was imported */
  importSource: mysqlEnum("importSource_vo", [
    "email_scrape", "api", "csv_upload", "manual", "browser_extension", "whatsapp",
  ]).default("manual").notNull(),
  /** Raw import data (JSON) for debugging/re-parse */
  rawImportData: json("rawImportData"),
  /** Link to legacy orders.id if migrated */
  legacyOrderId: int("legacyOrderId"),
  /** Link to legacy walmart_orders.id if migrated (UUID format) */
  legacyWalmartOrderId: varchar("legacyWalmartOrderId", { length: 36 }),
  notes: text("notes"),
  createdAt: bigint("createdAt_vo", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt_vo", { mode: "number" }).notNull(),
}, (t) => ({
  householdIdx: index("vo_household_idx").on(t.householdId),
  vendorAccountIdx: index("vo_vendor_account_idx").on(t.vendorAccountId),
  platformIdx: index("vo_platform_idx").on(t.platform),
  orderDateIdx: index("vo_order_date_idx").on(t.orderDate),
  orderNumberIdx: index("vo_order_number_idx").on(t.orderNumber),
  legacyOrderIdx: index("vo_legacy_order_idx").on(t.legacyOrderId),
}));
export type VendorOrder = typeof vendorOrders.$inferSelect;
export type InsertVendorOrder = typeof vendorOrders.$inferInsert;

// ─── Vendor Order Items ──────────────────────────────────────────────
// Line items from vendor orders. Each row = one product/item purchased.
// Carries item-level tax deductibility, vertical, property, and CoA classification.
export const vendorOrderItems = mysqlTable("vendor_order_items", {
  id: varchar("id", { length: 21 }).primaryKey(), // nanoid
  vendorOrderId: varchar("vendorOrderId", { length: 21 }).notNull(),
  householdId: varchar("householdId", { length: 36 }).notNull(),
  /** Product name as it appeared on receipt/email */
  name: varchar("name", { length: 500 }).notNull(),
  /** Quantity purchased */
  quantity: int("quantity").default(1).notNull(),
  /** Unit price (before tax) */
  unitPrice: decimal("unitPrice", { precision: 12, scale: 2 }),
  /** Line total (qty × unitPrice, or as stated on receipt) */
  lineTotal: decimal("lineTotal", { precision: 12, scale: 2 }),
  /** Tax on this item */
  itemTax: decimal("itemTax", { precision: 12, scale: 2 }),
  currency: varchar("currency_voi", { length: 3 }).default("USD").notNull(),
  /** Vendor SKU / product ID */
  vendorProductId: varchar("vendorProductId", { length: 255 }),
  /** ASIN for Amazon products */
  asin: varchar("asin", { length: 20 }),
  /** Product URL from the vendor */
  productUrl: text("productUrl"),
  /** Category from vendor (e.g., "Electronics", "Grocery") */
  vendorCategory: varchar("vendorCategory", { length: 200 }),
  // ─── Classification fields ────────────────────────────────────────
  /** Chart of accounts category */
  chartOfAccountId: varchar("chartOfAccountId", { length: 21 }),
  /** Which vertical this item belongs to */
  verticalId: varchar("verticalId_voi", { length: 36 }),
  /** Which property this item is attributed to (nullable) */
  propertyId: varchar("propertyId_voi", { length: 36 }),
  /** Is this item a tax-deductible business expense? */
  isTaxDeductible: boolean("isTaxDeductible_voi").default(false).notNull(),
  /** Tax category (e.g., "Office Supplies", "Cleaning Supplies") */
  taxCategory: varchar("taxCategory", { length: 100 }),
  /** Tax form line (e.g., "Schedule C Line 22") */
  taxFormLine: varchar("taxFormLine_voi", { length: 50 }),
  /** AI confidence score for the categorization (0-100) */
  aiConfidence: int("aiConfidence_voi"),
  /** True if user manually confirmed/overrode the AI categorization */
  isManualOverride: boolean("isManualOverride_voi").default(false).notNull(),
  /** Delivery address for this specific item (if different from order) */
  deliveryAddress: varchar("deliveryAddress_voi", { length: 500 }),
  /** Tags for historical learning */
  tags: json("tags_voi").$type<string[]>(),
  /** Link to legacy order_items.id if migrated */
  legacyOrderItemId: int("legacyOrderItemId"),
  createdAt: bigint("createdAt_voi", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt_voi", { mode: "number" }).notNull(),
}, (t) => ({
  vendorOrderIdx: index("voi_vendor_order_idx").on(t.vendorOrderId),
  householdIdx: index("voi_household_idx").on(t.householdId),
  verticalIdx: index("voi_vertical_idx").on(t.verticalId),
  propertyIdx: index("voi_property_idx").on(t.propertyId),
  chartOfAccountIdx: index("voi_coa_idx").on(t.chartOfAccountId),
  deductibleIdx: index("voi_deductible_idx").on(t.isTaxDeductible),
  legacyIdx: index("voi_legacy_idx").on(t.legacyOrderItemId),
}));
export type VendorOrderItem = typeof vendorOrderItems.$inferSelect;
export type InsertVendorOrderItem = typeof vendorOrderItems.$inferInsert;

// ─── Transaction Matches ─────────────────────────────────────────────
// Links bank transactions (financial_transactions) to vendor orders.
// Supports 1:1, 1:N (split), and N:1 (grouped) matching.
export const transactionMatches = mysqlTable("transaction_matches", {
  id: varchar("id", { length: 21 }).primaryKey(), // nanoid
  householdId: varchar("householdId", { length: 36 }).notNull(),
  /** The bank transaction being matched */
  financialTransactionId: int("financialTransactionId").notNull(),
  /** The vendor order being matched to */
  vendorOrderId: varchar("vendorOrderId", { length: 21 }).notNull(),
  /** Match confidence score (0.00 - 1.00) */
  confidence: decimal("confidence", { precision: 5, scale: 2 }).notNull(),
  /** How the match was determined */
  matchMethod: mysqlEnum("matchMethod", [
    "exact_amount", "fuzzy_amount", "date_vendor_amount",
    "manual", "ai_suggestion", "rule_based",
  ]).notNull(),
  /** Match status */
  status: mysqlEnum("status_tm", [
    "proposed", "confirmed", "rejected", "overridden",
  ]).default("proposed").notNull(),
  /** If overridden, who did it */
  confirmedBy: varchar("confirmedBy", { length: 36 }),
  confirmedAt: bigint("confirmedAt", { mode: "number" }),
  /** Amount allocated from this transaction to this order (for split matches) */
  allocatedAmount: decimal("allocatedAmount", { precision: 12, scale: 2 }),
  /** Explanation of why this match was proposed */
  matchReason: text("matchReason"),
  /** Vertical context */
  verticalId: varchar("verticalId_tm", { length: 36 }),
  createdAt: bigint("createdAt_tm", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt_tm", { mode: "number" }).notNull(),
}, (t) => ({
  householdIdx: index("tm_household_idx").on(t.householdId),
  transactionIdx: index("tm_transaction_idx").on(t.financialTransactionId),
  vendorOrderIdx: index("tm_vendor_order_idx").on(t.vendorOrderId),
  statusIdx: index("tm_status_idx").on(t.status),
  verticalIdx: index("tm_vertical_idx").on(t.verticalId),
}));
export type TransactionMatch = typeof transactionMatches.$inferSelect;
export type InsertTransactionMatch = typeof transactionMatches.$inferInsert;

// ─── Expenses ────────────────────────────────────────────────────────
// The accounting event table. Links items to bank transactions, payment
// accounts, approval status, and QBO export status.
// Two tables, two purposes:
//   vendor_order_items = what was purchased + how it's classified
//   expenses = the accounting event (links item → bank txn → QBO)
export const expenses = mysqlTable("expenses", {
  id: varchar("id", { length: 21 }).primaryKey(), // nanoid
  householdId: varchar("householdId", { length: 36 }).notNull(),
  /** Which vertical this expense belongs to */
  verticalId: varchar("verticalId_exp", { length: 36 }).notNull(),
  /** Which property (nullable — only for property-attributed expenses) */
  propertyId: varchar("propertyId_exp", { length: 36 }),
  /** Chart of accounts category */
  chartOfAccountId: varchar("chartOfAccountId_exp", { length: 21 }).notNull(),
  /** The vendor order item this expense is for (nullable for manual expenses) */
  vendorOrderItemId: varchar("vendorOrderItemId", { length: 21 }),
  /** The vendor order (denormalized for quick access) */
  vendorOrderId: varchar("vendorOrderId_exp", { length: 21 }),
  /** The matched bank transaction (nullable until matched) */
  financialTransactionId: int("financialTransactionId_exp"),
  /** Transaction match record */
  transactionMatchId: varchar("transactionMatchId", { length: 21 }),
  /** Expense amount */
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  currency: varchar("currency_exp", { length: 3 }).default("USD").notNull(),
  /** Description (auto-generated from item name or manual) */
  description: varchar("description_exp", { length: 500 }).notNull(),
  /** Expense date (UTC ms) */
  expenseDate: bigint("expenseDate", { mode: "number" }).notNull(),
  /** Payment method */
  paymentMethod: varchar("paymentMethod_exp", { length: 100 }),
  /** Payment account (FK to financial_accounts) */
  paymentAccountId: int("paymentAccountId"),
  /** Vendor name (denormalized) */
  vendorName: varchar("vendorName_exp", { length: 200 }),
  // ─── Tax fields ───────────────────────────────────────────────────
  isTaxDeductible: boolean("isTaxDeductible_exp").default(false).notNull(),
  taxCategory: varchar("taxCategory_exp", { length: 100 }),
  taxFormLine: varchar("taxFormLine_exp", { length: 50 }),
  // ─── Approval & Export ────────────────────────────────────────────
  approvalStatus: mysqlEnum("approvalStatus", [
    "auto_approved", "pending_review", "approved", "rejected",
  ]).default("pending_review").notNull(),
  approvedBy: varchar("approvedBy", { length: 36 }),
  approvedAt: bigint("approvedAt", { mode: "number" }),
  /** QBO export status */
  qboExportStatus: mysqlEnum("qboExportStatus", [
    "not_exported", "pending", "exported", "export_failed", "excluded",
  ]).default("not_exported").notNull(),
  qboExpenseId: varchar("qboExpenseId", { length: 50 }),
  qboExportedAt: bigint("qboExportedAt", { mode: "number" }),
  qboExportError: text("qboExportError"),
  /** Receipt/document URL */
  receiptUrl: text("receiptUrl_exp"),
  /** Source of this expense record */
  source: mysqlEnum("source_exp", [
    "vendor_order", "bank_transaction", "manual", "recurring",
  ]).default("vendor_order").notNull(),
  /** AI confidence for auto-categorization */
  aiConfidence: int("aiConfidence_exp"),
  isManualOverride: boolean("isManualOverride_exp").default(false).notNull(),
  notes: text("notes_exp"),
  // ─── Split Pattern (cross-vertical + cross-property) ────────────
  /** Groups all rows that represent one logical expense (nullable = unsplit) */
  splitGroupId: varchar("splitGroupId", { length: 21 }),
  /** Per-row allocation amount (nullable = unsplit, uses `amount` directly) */
  splitAmount: decimal("splitAmount", { precision: 14, scale: 2 }),
  /** Ordering within a split group */
  splitSequence: int("splitSequence"),
  createdAt: bigint("createdAt_exp", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt_exp", { mode: "number" }).notNull(),
  createdBy: varchar("createdBy_exp", { length: 36 }),
}, (t) => ({
  householdIdx: index("exp_household_idx").on(t.householdId),
  verticalIdx: index("exp_vertical_idx").on(t.verticalId),
  propertyIdx: index("exp_property_idx").on(t.propertyId),
  chartOfAccountIdx: index("exp_coa_idx").on(t.chartOfAccountId),
  vendorOrderItemIdx: index("exp_voi_idx").on(t.vendorOrderItemId),
  transactionIdx: index("exp_transaction_idx").on(t.financialTransactionId),
  dateIdx: index("exp_date_idx").on(t.expenseDate),
  approvalIdx: index("exp_approval_idx").on(t.approvalStatus),
  qboExportIdx: index("exp_qbo_export_idx").on(t.qboExportStatus),
  splitGroupIdx: index("exp_split_group_idx").on(t.splitGroupId),
}));
export type Expense = typeof expenses.$inferSelect;
export type InsertExpense = typeof expenses.$inferInsert;

// ─── Notifications ─────────────────────────────────────────────────────────────

export const notifications = mysqlTable("notifications", {
  id: varchar("id", { length: 21 }).primaryKey(), // nanoid
  householdId: varchar("householdId", { length: 36 }).notNull(),
  /** Target recipient (member ID or userId) */
  recipientMemberId: varchar("recipientMemberId", { length: 36 }).notNull(),
  recipientUserId: int("recipientUserId"),
  /** Notification type for filtering and rendering */
  type: mysqlEnum("type", [
    "member_joined", "member_left", "member_removed",
    "booking_new", "booking_cancelled", "booking_modified",
    "booking_request_new", "booking_request_approved", "booking_request_declined",
    "token_expired", "sync_failed",
    "expense_pending_review", "expense_approved", "expense_rejected",
    "bug_report_update",
    "account_deletion_warning",
    "system_announcement",
  ]).notNull(),
  /** Human-readable title */
  title: varchar("title", { length: 200 }).notNull(),
  /** Notification body (markdown supported) */
  body: text("body"),
  /** Deep link within the app (e.g., /calendar, /properties/123) */
  actionUrl: varchar("actionUrl", { length: 500 }),
  /** Action button label */
  actionLabel: varchar("actionLabel", { length: 50 }),
  /** Related entity for context */
  relatedEntityType: varchar("relatedEntityType", { length: 50 }),
  relatedEntityId: varchar("relatedEntityId", { length: 36 }),
  /** Delivery channels */
  deliveredViaEmail: boolean("deliveredViaEmail").default(false).notNull(),
  deliveredViaPush: boolean("deliveredViaPush").default(false).notNull(),
  deliveredInApp: boolean("deliveredInApp").default(true).notNull(),
  /** Read/dismissed state */
  isRead: boolean("isRead").default(false).notNull(),
  readAt: bigint("readAt", { mode: "number" }),
  isDismissed: boolean("isDismissed").default(false).notNull(),
  dismissedAt: bigint("dismissedAt", { mode: "number" }),
  /** Priority for ordering and urgency indicators */
  priority: mysqlEnum("priority", ["low", "normal", "high", "urgent"]).default("normal").notNull(),
  /** Metadata (JSON for type-specific data) */
  metadata: text("metadata"),
  /** Timestamps */
  createdAt: bigint("createdAt_notif", { mode: "number" }).notNull(),
  expiresAt: bigint("expiresAt_notif", { mode: "number" }),
}, (t) => ({
  recipientIdx: index("notif_recipient_idx").on(t.recipientMemberId),
  recipientUserIdx: index("notif_recipient_user_idx").on(t.recipientUserId),
  householdIdx: index("notif_household_idx").on(t.householdId),
  typeIdx: index("notif_type_idx").on(t.type),
  unreadIdx: index("notif_unread_idx").on(t.recipientMemberId, t.isRead),
  createdIdx: index("notif_created_idx").on(t.createdAt),
}));
export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;

// ─── Invoice Extractions ──────────────────────────────────────────────
// Stores extracted invoice data from the Chrome Extension capture pipeline.
export const invoiceExtractions = mysqlTable("invoice_extractions", {
  id: varchar("id", { length: 21 }).primaryKey(), // nanoid
  householdId: varchar("householdId", { length: 36 }).notNull(),
  vendorOrderId: varchar("vendorOrderId", { length: 21 }),
  walmartOrderId: varchar("walmartOrderId", { length: 36 }),
  vendorName: varchar("vendorName", { length: 200 }),
  orderDate: varchar("orderDate_ie", { length: 30 }),
  orderTotal: decimal("orderTotal_ie", { precision: 12, scale: 2 }),
  taxTotal: decimal("taxTotal_ie", { precision: 12, scale: 2 }),
  paymentMethodType: varchar("paymentMethodType", { length: 50 }),
  paymentMethodLast4: varchar("paymentMethodLast4", { length: 4 }),
  paymentAccountId: int("paymentAccountId_ie"),
  lineItems: json("lineItems_ie").$type<Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }>>(),
  s3Url: text("s3Url_ie"),
  s3Key: varchar("s3Key_ie", { length: 500 }),
  extractionStatus: mysqlEnum("extractionStatus_ie", [
    "pending", "processing", "completed", "failed",
  ]).default("pending").notNull(),
  extractionError: text("extractionError_ie"),
  triggerSource: mysqlEnum("triggerSource_ie", [
    "chrome_extension", "manual_upload", "email_attachment",
  ]).default("chrome_extension").notNull(),
  createdAt: bigint("createdAt_ie", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt_ie", { mode: "number" }).notNull(),
}, (t) => ({
  householdIdx: index("ie_household_idx").on(t.householdId),
  vendorOrderIdx: index("ie_vendor_order_idx").on(t.vendorOrderId),
  walmartOrderIdx: index("ie_walmart_order_idx").on(t.walmartOrderId),
  statusIdx: index("ie_status_idx").on(t.extractionStatus),
  paymentLast4Idx: index("ie_payment_last4_idx").on(t.paymentMethodLast4),
}));
export type InvoiceExtraction = typeof invoiceExtractions.$inferSelect;
export type InsertInvoiceExtraction = typeof invoiceExtractions.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════
// NOTIFICATION SETTINGS
// ═══════════════════════════════════════════════════════════════════════

export const notificationSettings = mysqlTable("notification_settings", {
  id: int("id").autoincrement().primaryKey(),
  /** Unique key identifying the notification type (e.g. "circuit_breaker", "rate_limit") */
  key: varchar("key", { length: 100 }).notNull().unique(),
  /** Human-readable label for the setting */
  label: varchar("label", { length: 255 }).notNull(),
  /** Description of what this notification does */
  description: text("description"),
  /** Cooldown duration in hours (0 = no cooldown / always send) */
  cooldownHours: int("cooldownHours").notNull().default(6),
  /** Whether this notification type is enabled at all */
  enabled: boolean("enabled").notNull().default(true),
  /** Household that owns this setting */
  householdId: varchar("householdId", { length: 36 }).notNull(),
  /** Last time a notification was actually sent for this key (epoch ms, for persistent cooldown) */
  lastNotifiedAt: bigint("lastNotifiedAt", { mode: "number" }).default(0),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  keyHouseholdIdx: uniqueIndex("ns_key_household_idx").on(t.key, t.householdId),
}));
export type NotificationSetting = typeof notificationSettings.$inferSelect;
export type InsertNotificationSetting = typeof notificationSettings.$inferInsert;

// ─── ICS Regeneration Queue ───────────────────────────────────────────────────
export const icsRegenerationQueue = mysqlTable("ics_regeneration_queue", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  propertyId: varchar("propertyId", { length: 36 }).notNull(),
  reason: varchar("reason", { length: 255 }).notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  processedAt: bigint("processedAt", { mode: "number" }),
}, (t) => ({
  propertyIdx: index("ics_rq_property_idx").on(t.propertyId),
  processedIdx: index("ics_rq_processed_idx").on(t.processedAt),
}));
export type IcsRegenerationQueue = typeof icsRegenerationQueue.$inferSelect;
export type InsertIcsRegenerationQueue = typeof icsRegenerationQueue.$inferInsert;

// ─── Edit Log (Reconciliation Explorer write-back audit trail) ────────────────
export const editLog = mysqlTable("edit_log", {
  id: int("id").autoincrement().primaryKey(),
  geeTxn: varchar("gee_txn", { length: 32 }).notNull(),
  field: varchar("field", { length: 32 }),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  editedBy: varchar("edited_by", { length: 64 }),
  reason: varchar("reason", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type EditLog = typeof editLog.$inferSelect;
export type InsertEditLog = typeof editLog.$inferInsert;

// ─── Platform Fee Configurations ─────────────────────────────────────────────
export const platformFeeConfigurations = mysqlTable("platform_fee_configurations", {
  id: varchar("id", { length: 36 }).primaryKey(),
  householdId: varchar("householdId", { length: 36 }).notNull(),
  platform: varchar("platform", { length: 50 }).notNull(),
  feeType: varchar("feeType", { length: 50 }).notNull().default("host_pays"),
  commissionPct: decimal("commissionPct", { precision: 5, scale: 2 }).default("0"),
  processingFeePct: decimal("processingFeePct", { precision: 5, scale: 2 }).default("0"),
  processingFeeFixed: decimal("processingFeeFixed", { precision: 10, scale: 2 }).default("0"),
  taxOnFees: boolean("taxOnFees").default(false),
  isDefault: boolean("isDefault").default(false),
  isActive: boolean("isActive").default(true),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow(),
});
export type PlatformFeeConfiguration = typeof platformFeeConfigurations.$inferSelect;
export type InsertPlatformFeeConfiguration = typeof platformFeeConfigurations.$inferInsert;

// ─── Vertical Expense Configs ─────────────────────────────────────────────────
export const verticalExpenseConfigs = mysqlTable("vertical_expense_configs", {
  id: varchar("id", { length: 36 }).primaryKey(),
  verticalId: varchar("verticalId", { length: 36 }).notNull(),
  householdId: varchar("householdId", { length: 36 }).notNull(),
  defaultCoaCategoryId: varchar("defaultCoaCategoryId", { length: 36 }),
  defaultQboClass: varchar("defaultQboClass", { length: 100 }),
  defaultQboCustomer: varchar("defaultQboCustomer", { length: 100 }),
  requireApproval: boolean("requireApproval").default(false),
  approvalThreshold: decimal("approvalThreshold", { precision: 14, scale: 2 }),
  receiptRequiredAbove: decimal("receiptRequiredAbove", { precision: 14, scale: 2 }).default("25.00"),
  isActive: boolean("isActive").default(true),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow(),
});
export type VerticalExpenseConfig = typeof verticalExpenseConfigs.$inferSelect;
export type InsertVerticalExpenseConfig = typeof verticalExpenseConfigs.$inferInsert;

// ─── Webhook Tokens ───────────────────────────────────────────────────────────
export const webhookTokens = mysqlTable("webhook_tokens", {
  channelId: varchar("channelId", { length: 100 }).primaryKey(),
  token: varchar("token", { length: 255 }).notNull(),
  calendarId: varchar("calendarId", { length: 36 }).notNull(),
  expiresAt: timestamp("expiresAt"),
  createdAt: timestamp("createdAt").defaultNow(),
});
export type WebhookToken = typeof webhookTokens.$inferSelect;
export type InsertWebhookToken = typeof webhookTokens.$inferInsert;

// ─── Guardian Audit Log ───────────────────────────────────────────────────────
export const guardianAuditLog = mysqlTable("guardian_audit_log", {
  id: varchar("id", { length: 36 }).primaryKey(),
  guardrailId: varchar("guardrailId", { length: 10 }).notNull(),
  severity: mysqlEnum("severity", ["info", "warning", "critical", "emergency"]).notNull().default("info"),
  action: varchar("action", { length: 50 }).notNull(),
  actorId: varchar("actorId", { length: 36 }),
  targetId: varchar("targetId", { length: 36 }),
  details: json("details"),
  resolvedAt: timestamp("resolvedAt"),
  resolvedBy: varchar("resolvedBy", { length: 36 }),
  createdAt: timestamp("createdAt").defaultNow(),
});
export type GuardianAuditLog = typeof guardianAuditLog.$inferSelect;
export type InsertGuardianAuditLog = typeof guardianAuditLog.$inferInsert;

// ─── Guardian Config ──────────────────────────────────────────────────────────
export const guardianConfig = mysqlTable("guardian_config", {
  householdId: varchar("householdId", { length: 36 }).primaryKey(),
  gr1Enabled: boolean("gr1Enabled").default(true),
  gr2Enabled: boolean("gr2Enabled").default(true),
  gr3Enabled: boolean("gr3Enabled").default(true),
  gr4Enabled: boolean("gr4Enabled").default(true),
  gr5Enabled: boolean("gr5Enabled").default(true),
  gr6Enabled: boolean("gr6Enabled").default(true),
  gr7Enabled: boolean("gr7Enabled").default(true),
  gr1AutoFix: boolean("gr1AutoFix").default(true),
  gr2AutoFix: boolean("gr2AutoFix").default(true),
  gr3AutoFix: boolean("gr3AutoFix").default(true),
  gr4AutoFix: boolean("gr4AutoFix").default(true),
  gr5AutoFix: boolean("gr5AutoFix").default(false),
  gr6AutoFix: boolean("gr6AutoFix").default(true),
  gr7AutoFix: boolean("gr7AutoFix").default(false),
  alertEmail: varchar("alertEmail", { length: 255 }).default("tarik@tjperkinsfam.com"),
  emergencyPhone: varchar("emergencyPhone", { length: 50 }),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow(),
});
export type GuardianConfig = typeof guardianConfig.$inferSelect;
export type InsertGuardianConfig = typeof guardianConfig.$inferInsert;
