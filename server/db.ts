import { eq, desc, and, or, sql, between, isNotNull, isNull, not, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2";
import {
  InsertUser, users,
  familyMembers, InsertFamilyMember,
  shoppingLists, InsertShoppingList,
  shoppingListItems, InsertShoppingListItem,
  bankAccounts, InsertBankAccount,
  transactions, InsertTransaction,
  orders, InsertOrder,
  exchangeRates, InsertExchangeRate,
  whatsappImports, InsertWhatsappImport,
  shoppingSessions, InsertShoppingSession,
  shoppingSessionItems, InsertShoppingSessionItem,
  platformCredentials, InsertPlatformCredential,
  chatMessages, InsertChatMessage,
  productMappings, InsertProductMapping,
  households, InsertHousehold,
  householdMembers, InsertHouseholdMember,
  verticals, InsertVertical,
  calendars, InsertCalendar,
  events, InsertEvent,
  shadowBlocks, InsertShadowBlock,
  properties, InsertProperty,
  devices, InsertDevice,
  notes, InsertNote,
  oauthTokens, InsertOAuthToken,
  subscriptions, InsertSubscription,
  webhookChannels, InsertWebhookChannel,
  syncLog, InsertSyncLogEntry,
  verticalOwners, InsertVerticalOwner,
  verticalIntegrations, InsertVerticalIntegration,
  verticalVisibility, InsertVerticalVisibility,
  bookingRequests, InsertBookingRequest,
  propertyPlatforms, InsertPropertyPlatform,
  propertyPrepRules, InsertPropertyPrepRule,
  propertyBookings, InsertPropertyBooking,
  shadowOverrides,
  auditLog, InsertAuditLog,
  projectKnowledge, InsertProjectKnowledge,
  projectTasks, InsertProjectTask,
  verticalMemberAccess, InsertVerticalMemberAccess,
  verticalDataPolicies, InsertVerticalDataPolicy,
  memberResources, InsertMemberResource,
  emailScrapeJobs,
  propertyEmailTokens,
  memberPermissionOverrides,
  scopeConsentPreferences,
  customRoles, InsertCustomRole,
  widgetLayouts, InsertWidgetLayout,
  propertyPhotos, InsertPropertyPhoto,
  propertyMemberOrder, InsertPropertyMemberOrder,
  ltrPayments, InsertLtrPayment,
  bookingScreenshots, InsertBookingScreenshot,
  platformExportImports, InsertPlatformExportImport,
  notificationSettings} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;
let _pool: ReturnType<typeof mysql.createPool> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      const dbUrl = process.env.DATABASE_URL;
      const instanceConnection = process.env.CLOUD_SQL_CONNECTION_NAME;

      if (instanceConnection) {
        // Cloud Run: connect via Cloud SQL Auth Proxy Unix socket.
        // DATABASE_URL format: mysql://user:pass@localhost/dbname
        // The Auth Proxy handles SSL automatically — no ssl param needed.
        const url = new URL(dbUrl);
        const socketPath = `/cloudsql/${instanceConnection}`;
        _pool = mysql.createPool({
          user: url.username,
          password: decodeURIComponent(url.password),
          database: url.pathname.replace("/", ""),
          socketPath,
          connectionLimit: 20,
        });
      } else {
        // External connection (dev, migration scripts): use TCP with auto-SSL.
        const needsSsl = !dbUrl.includes("ssl=") && !dbUrl.includes("ssl%3D");
        const separator = dbUrl.includes("?") ? "&" : "?";
        const extras = [
          "connectionLimit=20",
          ...(needsSsl ? ['ssl={"rejectUnauthorized":false}'] : []),
        ].join("&");
        _pool = mysql.createPool(dbUrl + separator + extras);
      }
      _db = drizzle(_pool);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── Users ───────────────────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot upsert user: database not available"); return; }
  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};
    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];
    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
    if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
    else if (user.openId === ENV.ownerOpenId) { values.role = 'system_admin'; updateSet.role = 'system_admin'; }
    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) { console.error("[Database] Failed to upsert user:", error); throw error; }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

/**
 * Stamp the users row with the resolved householdId + memberId so that
 * ctx.user.householdId / ctx.user.memberId are always populated after login.
 * Called after claimInvite, acceptByMemberId, and household.create.
 */
export async function updateUserHousehold(
  userId: number,
  householdId: string,
  memberId: string,
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ householdId, memberId }).where(eq(users.id, userId));
}

// ─── Family Members ──────────────────────────────────────────────────

export async function getFamilyMembers(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(familyMembers).where(eq(familyMembers.userId, userId)).orderBy(familyMembers.name);
}

export async function createFamilyMember(data: InsertFamilyMember) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(familyMembers).values(data);
  return { id: result[0].insertId };
}

export async function updateFamilyMember(id: number, userId: number, data: Partial<InsertFamilyMember>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(familyMembers).set(data).where(and(eq(familyMembers.id, id), eq(familyMembers.userId, userId)));
}

export async function deleteFamilyMember(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(familyMembers).where(and(eq(familyMembers.id, id), eq(familyMembers.userId, userId)));
}

// ─── Shopping Lists ──────────────────────────────────────────────────

export async function getShoppingLists(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(shoppingLists).where(eq(shoppingLists.userId, userId)).orderBy(desc(shoppingLists.updatedAt));
}

export async function getShoppingListById(id: number, userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(shoppingLists).where(and(eq(shoppingLists.id, id), eq(shoppingLists.userId, userId))).limit(1);
  return result[0];
}

export async function createShoppingList(data: InsertShoppingList) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(shoppingLists).values(data);
  return { id: result[0].insertId };
}

export async function updateShoppingList(id: number, userId: number, data: Partial<InsertShoppingList>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(shoppingLists).set(data).where(and(eq(shoppingLists.id, id), eq(shoppingLists.userId, userId)));
}

export async function deleteShoppingList(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(shoppingListItems).where(eq(shoppingListItems.listId, id));
  await db.delete(shoppingLists).where(and(eq(shoppingLists.id, id), eq(shoppingLists.userId, userId)));
}

// ─── Shopping List Items ─────────────────────────────────────────────

export async function getShoppingListItems(listId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(shoppingListItems).where(eq(shoppingListItems.listId, listId)).orderBy(shoppingListItems.createdAt);
}

export async function createShoppingListItem(data: InsertShoppingListItem) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(shoppingListItems).values(data);
  return { id: result[0].insertId };
}

export async function updateShoppingListItem(id: number, data: Partial<InsertShoppingListItem>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(shoppingListItems).set(data).where(eq(shoppingListItems.id, id));
}

export async function deleteShoppingListItem(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(shoppingListItems).where(eq(shoppingListItems.id, id));
}

export async function moveItemsToList(itemIds: number[], targetListId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (itemIds.length === 0) return { moved: 0 };
  await db.update(shoppingListItems)
    .set({ listId: targetListId })
    .where(sql`${shoppingListItems.id} IN (${sql.join(itemIds.map(id => sql`${id}`), sql`, `)})`);
  return { moved: itemIds.length };
}

// ─── Bank Accounts ───────────────────────────────────────────────────

export async function getBankAccounts(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(bankAccounts).where(eq(bankAccounts.userId, userId)).orderBy(bankAccounts.institution);
}

export async function getBankAccountsByHousehold(householdId: string | null | undefined) {
  const db = await getDb();
  if (!db || !householdId) return [];
  return db.select().from(bankAccounts).where(
    and(eq(bankAccounts.householdId, householdId), eq(bankAccounts.isActive, true))
  ).orderBy(bankAccounts.institution);
}

export async function createBankAccount(data: InsertBankAccount) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(bankAccounts).values(data);
  return { id: result[0].insertId };
}

export async function updateBankAccount(id: number, householdId: string | null | undefined, data: Partial<InsertBankAccount>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (!householdId) throw new Error("Household required");
  await db.update(bankAccounts).set(data).where(and(eq(bankAccounts.id, id), eq(bankAccounts.householdId, householdId)));
}

export async function deleteBankAccount(id: number, householdId: string | null | undefined) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (!householdId) throw new Error("Household required");
  await db.delete(bankAccounts).where(and(eq(bankAccounts.id, id), eq(bankAccounts.householdId, householdId)));
}

// ─── Transactions ────────────────────────────────────────────────────

export async function getTransactions(userId: number, filters?: { classification?: string; startDate?: Date; endDate?: Date; limit?: number }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(transactions.userId, userId)];
  if (filters?.classification) conditions.push(eq(transactions.classification, filters.classification as any));
  if (filters?.startDate && filters?.endDate) conditions.push(between(transactions.transactionDate, filters.startDate, filters.endDate));
  const query = db.select().from(transactions).where(and(...conditions)).orderBy(desc(transactions.transactionDate));
  if (filters?.limit) return query.limit(filters.limit);
  return query;
}

export async function createTransaction(data: InsertTransaction) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(transactions).values(data);
  return { id: result[0].insertId };
}

export async function updateTransaction(id: number, userId: number, data: Partial<InsertTransaction>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(transactions).set(data).where(and(eq(transactions.id, id), eq(transactions.userId, userId)));
}

export async function deleteTransaction(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(transactions).where(and(eq(transactions.id, id), eq(transactions.userId, userId)));
}

export async function getExpenseSummary(userId: number) {
  const db = await getDb();
  if (!db) return { personal: "0", business: "0", total: "0" };
  const result = await db.select({
    classification: transactions.classification,
    total: sql<string>`CAST(SUM(${transactions.amount}) AS CHAR)`,
  }).from(transactions).where(and(eq(transactions.userId, userId), eq(transactions.type, "expense"))).groupBy(transactions.classification);
  const personal = result.find(r => r.classification === "personal")?.total || "0";
  const business = result.find(r => r.classification === "business")?.total || "0";
  return { personal, business, total: (parseFloat(personal) + parseFloat(business)).toFixed(2) };
}

export async function getSpendingByCategory(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    category: transactions.expenseCategory,
    total: sql<string>`CAST(SUM(${transactions.amount}) AS CHAR)`,
    count: sql<number>`COUNT(*)`,
  }).from(transactions).where(and(eq(transactions.userId, userId), eq(transactions.type, "expense"))).groupBy(transactions.expenseCategory);
}

// ─── Orders ──────────────────────────────────────────────────────────

export async function getOrders(userId: number, limit?: number) {
  const db = await getDb();
  if (!db) return [];
  const query = db.select().from(orders).where(eq(orders.userId, userId)).orderBy(desc(orders.orderDate));
  if (limit) return query.limit(limit);
  return query;
}

export async function createOrder(data: InsertOrder) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(orders).values(data);
  return { id: result[0].insertId };
}

export async function updateOrder(id: number, userId: number, data: Partial<InsertOrder>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(orders).set(data).where(and(eq(orders.id, id), eq(orders.userId, userId)));
}

// ─── Exchange Rates ──────────────────────────────────────────────────

export async function getLatestExchangeRate(from: string, to: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(exchangeRates).where(and(eq(exchangeRates.fromCurrency, from), eq(exchangeRates.toCurrency, to))).orderBy(desc(exchangeRates.fetchedAt)).limit(1);
  return result[0];
}

export async function upsertExchangeRate(data: InsertExchangeRate) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(exchangeRates).values(data);
}

// ─── Order Search (for product matching) ────────────────────────────

export async function searchOrderItems(userId: number, keywords: string[]) {
  const db = await getDb();
  if (!db) return [];
  const allOrders = await db.select().from(orders).where(eq(orders.userId, userId)).orderBy(desc(orders.orderDate));

  type MatchResult = {
    orderId: number;
    platform: string;
    vendor: string | null;
    orderDate: Date;
    orderNumber: string | null;
    item: { name: string; quantity: number; price: string };
    matchedKeyword: string;
    matchScore: number;
  };

  const matches: MatchResult[] = [];

  for (const order of allOrders) {
    const items = (order.items || []) as Array<{ name: string; quantity: number; price: string }>;
    for (const item of items) {
      const itemNameLower = (item.name || "").toLowerCase();
      for (const keyword of keywords) {
        const kwLower = keyword.toLowerCase();
        let score = 0;
        if (itemNameLower === kwLower) score = 100;
        else if (itemNameLower.includes(kwLower)) score = 80;
        else {
          const kwWords = kwLower.split(/\s+/);
          const itemWords = itemNameLower.split(/\s+/);
          const matchedWords = kwWords.filter(w => itemWords.some(iw => iw.includes(w) || w.includes(iw)));
          if (matchedWords.length > 0) score = Math.round((matchedWords.length / kwWords.length) * 60);
        }
        if (score > 30) {
          matches.push({
            orderId: order.id,
            platform: order.platform,
            vendor: order.vendor,
            orderDate: order.orderDate,
            orderNumber: order.orderNumber,
            item,
            matchedKeyword: keyword,
            matchScore: score,
          });
        }
      }
    }
  }

  matches.sort((a, b) => b.matchScore - a.matchScore);
  const seen = new Set<string>();
  return matches.filter(m => {
    const key = `${m.item.name.toLowerCase()}|${m.platform}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── WhatsApp Imports ────────────────────────────────────────────────

export async function getWhatsappImports(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(whatsappImports).where(eq(whatsappImports.userId, userId)).orderBy(desc(whatsappImports.importedAt));
}

export async function bulkCreateOrders(ordersData: InsertOrder[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (ordersData.length === 0) return { count: 0 };
  // Insert in batches of 10 to avoid query size limits
  let count = 0;
  for (let i = 0; i < ordersData.length; i += 10) {
    const batch = ordersData.slice(i, i + 10);
    await db.insert(orders).values(batch);
    count += batch.length;
  }
  return { count };
}

export async function createWhatsappImport(data: InsertWhatsappImport) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(whatsappImports).values(data);
  return { id: result[0].insertId };
}

// ─── Shopping Sessions ───────────────────────────────────────────

export async function createShoppingSession(data: InsertShoppingSession) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(shoppingSessions).values(data);
  return { id: result[0].insertId };
}

export async function getShoppingSession(id: number, userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(shoppingSessions)
    .where(and(eq(shoppingSessions.id, id), eq(shoppingSessions.userId, userId))).limit(1);
  return result[0];
}

export async function getShoppingSessions(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(shoppingSessions)
    .where(eq(shoppingSessions.userId, userId))
    .orderBy(desc(shoppingSessions.createdAt));
}

export async function updateShoppingSession(id: number, data: Partial<InsertShoppingSession>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(shoppingSessions).set(data).where(eq(shoppingSessions.id, id));
}

// ─── Shopping Session Items ──────────────────────────────────────

export async function createShoppingSessionItem(data: InsertShoppingSessionItem) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(shoppingSessionItems).values(data);
  return { id: result[0].insertId };
}

export async function bulkCreateSessionItems(items: InsertShoppingSessionItem[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (items.length === 0) return { count: 0 };
  await db.insert(shoppingSessionItems).values(items);
  return { count: items.length };
}

export async function getSessionItems(sessionId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(shoppingSessionItems)
    .where(eq(shoppingSessionItems.sessionId, sessionId))
    .orderBy(shoppingSessionItems.assignedPlatform, shoppingSessionItems.name);
}

export async function updateSessionItem(id: number, data: Partial<InsertShoppingSessionItem>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(shoppingSessionItems).set(data).where(eq(shoppingSessionItems.id, id));
}

export async function bulkUpdateSessionItems(ids: number[], data: Partial<InsertShoppingSessionItem>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (ids.length === 0) return;
  await db.update(shoppingSessionItems).set(data)
    .where(sql`${shoppingSessionItems.id} IN (${sql.join(ids.map(id => sql`${id}`), sql`, `)})`);
}

// ─── Platform Credentials ───────────────────────────────────────

export async function getPlatformCredentials(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(platformCredentials)
    .where(eq(platformCredentials.userId, userId))
    .orderBy(platformCredentials.platform);
}

export async function getPlatformCredential(userId: number, platform: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(platformCredentials)
    .where(and(eq(platformCredentials.userId, userId), eq(platformCredentials.platform, platform))).limit(1);
  return result[0];
}

export async function upsertPlatformCredential(data: InsertPlatformCredential) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db.select().from(platformCredentials)
    .where(and(eq(platformCredentials.userId, data.userId), eq(platformCredentials.platform, data.platform))).limit(1);
  if (existing.length > 0) {
    await db.update(platformCredentials)
      .set({ credentialData: data.credentialData, isActive: true })
      .where(eq(platformCredentials.id, existing[0].id));
    return { id: existing[0].id };
  }
  const result = await db.insert(platformCredentials).values(data);
  return { id: result[0].insertId };
}


// ─── Chat Messages ──────────────────────────────────────────────────

export async function getChatMessages(userId: number, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(chatMessages)
    .where(eq(chatMessages.userId, userId))
    .orderBy(chatMessages.createdAt)
    .limit(limit);
}

export async function addChatMessage(data: InsertChatMessage) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(chatMessages).values(data);
  return { id: result[0].insertId };
}

export async function clearChatHistory(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(chatMessages).where(eq(chatMessages.userId, userId));
  return { success: true };
}

// ─── Product Mappings ──────────────────────────────────────────────

export async function getProductMappings(userId: number, platform?: string) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(productMappings.userId, userId)];
  if (platform) conditions.push(eq(productMappings.platform, platform));
  return db.select().from(productMappings)
    .where(and(...conditions))
    .orderBy(desc(productMappings.useCount));
}

export async function findProductMapping(userId: number, itemName: string, platform: string) {
  const db = await getDb();
  if (!db) return undefined;
  const normalized = itemName.toLowerCase().trim();
  // Try exact normalized match first
  const exact = await db.select().from(productMappings)
    .where(and(
      eq(productMappings.userId, userId),
      eq(productMappings.platform, platform),
      eq(productMappings.normalizedName, normalized)
    )).limit(1);
  if (exact.length > 0) return exact[0];
  // Try LIKE match for partial matches
  const partial = await db.select().from(productMappings)
    .where(and(
      eq(productMappings.userId, userId),
      eq(productMappings.platform, platform),
      sql`${productMappings.normalizedName} LIKE ${`%${normalized}%`}`
    ))
    .orderBy(desc(productMappings.useCount))
    .limit(1);
  return partial.length > 0 ? partial[0] : undefined;
}

export async function upsertProductMapping(data: {
  userId: number;
  itemName: string;
  platform: string;
  productId: string;
  productName: string;
  productUrl?: string;
  lastPrice?: string;
  confidence?: number;
  isVerified?: boolean;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const normalized = data.itemName.toLowerCase().trim();
  // Check if mapping already exists
  const existing = await db.select().from(productMappings)
    .where(and(
      eq(productMappings.userId, data.userId),
      eq(productMappings.platform, data.platform),
      eq(productMappings.productId, data.productId)
    )).limit(1);
  if (existing.length > 0) {
    // Update existing mapping
    await db.update(productMappings).set({
      itemName: data.itemName,
      normalizedName: normalized,
      productName: data.productName,
      productUrl: data.productUrl || existing[0].productUrl,
      lastPrice: data.lastPrice || existing[0].lastPrice,
      useCount: sql`${productMappings.useCount} + 1`,
      confidence: data.confidence || existing[0].confidence,
      isVerified: data.isVerified ?? existing[0].isVerified,
      lastAvailable: sql`now()`,
      lastUsed: sql`now()`,
    }).where(eq(productMappings.id, existing[0].id));
    return { id: existing[0].id, isNew: false };
  }
  // Insert new mapping
  const result = await db.insert(productMappings).values({
    userId: data.userId,
    itemName: data.itemName,
    normalizedName: normalized,
    platform: data.platform,
    productId: data.productId,
    productName: data.productName,
    productUrl: data.productUrl,
    lastPrice: data.lastPrice,
    confidence: data.confidence || 80,
    isVerified: data.isVerified || false,
    lastAvailable: sql`now()`,
    lastUsed: sql`now()`,
  });
  return { id: result[0].insertId, isNew: true };
}

export async function bulkFindProductMappings(userId: number, itemNames: string[], platform: string) {
  const db = await getDb();
  if (!db) return [];
  const normalizedNames = itemNames.map(n => n.toLowerCase().trim());
  return db.select().from(productMappings)
    .where(and(
      eq(productMappings.userId, userId),
      eq(productMappings.platform, platform),
      sql`${productMappings.normalizedName} IN (${sql.join(normalizedNames.map(n => sql`${n}`), sql`, `)})`
    ));
}

export async function deleteProductMapping(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(productMappings).where(and(eq(productMappings.id, id), eq(productMappings.userId, userId)));
}

// ═══════════════════════════════════════════════════════════════════════
// GEEVES LIFE — HOUSEHOLD & CALENDAR DATABASE HELPERS
// ═══════════════════════════════════════════════════════════════════════

// ─── Households ─────────────────────────────────────────────────────

export async function createHousehold(data: InsertHousehold) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(households).values(data);
  return data;
}

export async function getHousehold(id: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(households).where(eq(households.id, id)).limit(1);
  return rows[0] || null;
}

// Legacy name kept as alias for backward compatibility during migration
export async function getHouseholdByOwner(userId: number) {
  return getHouseholdByCreator(userId);
}

export async function getHouseholdByCreator(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(households).where(eq(households.createdByUserId, userId)).limit(1);
  return rows[0] || null;
}

export async function updateHousehold(id: string, data: Partial<InsertHousehold>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(households).set(data).where(eq(households.id, id));
}

// ─── Household Members ──────────────────────────────────────────────

export async function createHouseholdMember(data: InsertHouseholdMember) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(householdMembers).values(data);
  return data;
}

export async function getHouseholdMember(id: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(householdMembers).where(eq(householdMembers.id, id)).limit(1);
  return rows[0] || null;
}

export async function getHouseholdMemberByUserId(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(householdMembers).where(and(eq(householdMembers.userId, userId), eq(householdMembers.status, "active"))).limit(1);
  return rows[0] || null;
}

export async function getHouseholdMembers(householdId: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(householdMembers).where(eq(householdMembers.householdId, householdId));
}

export async function updateHouseholdMember(id: string, data: Partial<InsertHouseholdMember>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(householdMembers).set(data).where(eq(householdMembers.id, id));
}

export async function updateMemberPhoto(memberId: string, photoUrl: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(householdMembers).set({ photoUrl }).where(eq(householdMembers.id, memberId));
}

export async function deleteHouseholdMember(id: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // C-02: Cascade cleanup on member removal
  // 1. Revoke all OAuth tokens for this member
  await db.update(oauthTokens).set({ status: "revoked" }).where(eq(oauthTokens.memberId, id));
  // 2. Remove vertical access grants
  await db.delete(verticalMemberAccess).where(eq(verticalMemberAccess.memberId, id));
  // 3. Remove permission overrides
  await db.delete(memberPermissionOverrides).where(eq(memberPermissionOverrides.memberId, id));
  // 4. Remove member resources
  await db.delete(memberResources).where(eq(memberResources.memberId, id));
  // 5. Cancel pending booking requests made by this member
  await db.update(bookingRequests)
    .set({ status: "cancelled" })
    .where(and(eq(bookingRequests.requestorMemberId, id), eq(bookingRequests.status, "pending")));
  // 6. Soft-delete the member row itself
  await db.update(householdMembers).set({ status: "removed" }).where(eq(householdMembers.id, id));
  // Note: shadow_blocks and events are retained for audit/history purposes.
  // OAuth tokens are revoked (not deleted) to preserve audit trail.
  // booking_requests.respondedByMemberId is left intact (historical record).
}

export async function getHouseholdMemberByInviteToken(token: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(householdMembers)
    .where(eq(householdMembers.inviteToken, token))
    .limit(1);
  return rows[0] || null;
}

/**
 * Find a pending (invited or active-but-unlinked) household member by email.
 * Used by the OAuth callback to detect invitations without a token.
 */
export async function getPendingInviteByEmail(email: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(householdMembers)
    .where(
      and(
        eq(householdMembers.email, email),
        // Only match members who haven't linked a user account yet
        isNull(householdMembers.userId)
      )
    )
    .limit(1);
  return rows[0] || null;
}

// ─── Verticals ──────────────────────────────────────────────────────

export async function createVertical(data: InsertVertical) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(verticals).values(data);
  return data;
}

export async function getVerticals(householdId: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(verticals).where(
    and(eq(verticals.householdId, householdId), eq(verticals.isActive, true))
  );
}

export async function updateVertical(id: string, data: Partial<InsertVertical>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(verticals).set(data).where(eq(verticals.id, id));
}

// ─── Vertical Owners ────────────────────────────────────────────────


// ─── Vertical Cascade Delete ──────────────────────────────────────────────────

/**
 * H-03: Soft-delete a vertical and cascade cleanup to all dependent tables.
 * Vertical rows are soft-deleted (isActive=false) not hard-deleted to preserve audit history.
 */
export async function deleteVerticalCascade(verticalId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // 1. Unlink calendars from this vertical (null out verticalId)
  await db.update(calendars).set({ verticalId: null }).where(eq(calendars.verticalId, verticalId));
  // 2. Remove member access grants
  await db.delete(verticalMemberAccess).where(eq(verticalMemberAccess.verticalId, verticalId));
  // 3. Remove vertical owners
  await db.delete(verticalOwners).where(eq(verticalOwners.verticalId, verticalId));
  // 4. Remove visibility rules (both directions)
  await db.delete(verticalVisibility).where(
    or(eq(verticalVisibility.fromVerticalId, verticalId), eq(verticalVisibility.toVerticalId, verticalId))
  );
  // 5. Remove vertical integrations
  await db.delete(verticalIntegrations).where(eq(verticalIntegrations.verticalId, verticalId));
  // 6. Remove data policies
  await db.delete(verticalDataPolicies).where(eq(verticalDataPolicies.verticalId, verticalId));
  // 7. Soft-delete the vertical itself
  await db.update(verticals).set({ isActive: false }).where(eq(verticals.id, verticalId));
}

export async function getVerticalOwners(verticalId: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(verticalOwners).where(eq(verticalOwners.verticalId, verticalId));
}

export async function addVerticalOwner(data: InsertVerticalOwner) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(verticalOwners).values(data);
  return data;
}

export async function removeVerticalOwner(verticalId: string, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(verticalOwners).where(and(eq(verticalOwners.verticalId, verticalId), eq(verticalOwners.userId, userId)));
}

export async function isVerticalOwner(verticalId: string, userId: number) {
  const db = await getDb();
  if (!db) return false;
  const rows = await db.select().from(verticalOwners)
    .where(and(eq(verticalOwners.verticalId, verticalId), eq(verticalOwners.userId, userId))).limit(1);
  return rows.length > 0;
}

/**
 * Batch: return all vertical IDs that a given user owns within a household.
 * Replaces the N+1 loop of isVerticalOwner() per vertical.
 */
export async function getOwnedVerticalIds(householdId: string, userId: number): Promise<Set<string>> {
  const db = await getDb();
  if (!db) return new Set();
  const rows = await db
    .select({ verticalId: verticalOwners.verticalId })
    .from(verticalOwners)
    .innerJoin(verticals, eq(verticals.id, verticalOwners.verticalId))
    .where(and(eq(verticals.householdId, householdId), eq(verticalOwners.userId, userId)));
  return new Set(rows.map(r => r.verticalId));
}

/**
 * Batch: return all vertical_visibility rules for all verticals in a household.
 * Replaces the N+1 loop of getVerticalVisibility() per fromVerticalId.
 * Returns a Map<fromVerticalId, rule[]>.
 */
export async function getAllVerticalVisibilityForHousehold(
  householdId: string
): Promise<Map<string, Array<{ fromVerticalId: string; toVerticalId: string; visibilityLevel: string; busyLabel: string | null }>>> {
  const db = await getDb();
  if (!db) return new Map();
  const rows = await db
    .select()
    .from(verticalVisibility)
    .innerJoin(verticals, eq(verticals.id, verticalVisibility.fromVerticalId))
    .where(eq(verticals.householdId, householdId));
  const map = new Map<string, Array<{ fromVerticalId: string; toVerticalId: string; visibilityLevel: string; busyLabel: string | null }>>();
  for (const row of rows) {
    const vv = row.vertical_visibility;
    if (!map.has(vv.fromVerticalId)) map.set(vv.fromVerticalId, []);
    map.get(vv.fromVerticalId)!.push(vv);
  }
  return map;
}

// ─── Vertical Integrations ───────────────────────────────────────────

export async function getVerticalIntegrations(verticalId: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(verticalIntegrations).where(eq(verticalIntegrations.verticalId, verticalId));
}

export async function createVerticalIntegration(data: InsertVerticalIntegration) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(verticalIntegrations).values(data);
  return data;
}

export async function updateVerticalIntegration(id: string, data: Partial<InsertVerticalIntegration>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(verticalIntegrations).set(data).where(eq(verticalIntegrations.id, id));
}

export async function deleteVerticalIntegration(id: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(verticalIntegrations).where(eq(verticalIntegrations.id, id));
}

// ─── Vertical Visibility ─────────────────────────────────────────────

export async function getVerticalVisibility(fromVerticalId: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(verticalVisibility).where(eq(verticalVisibility.fromVerticalId, fromVerticalId));
}

export async function setVerticalVisibility(data: InsertVerticalVisibility) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Upsert: update if exists, insert if not
  const existing = await db.select().from(verticalVisibility)
    .where(and(eq(verticalVisibility.fromVerticalId, data.fromVerticalId), eq(verticalVisibility.toVerticalId, data.toVerticalId))).limit(1);
  if (existing.length > 0) {
    await db.update(verticalVisibility).set({
      visibilityLevel: data.visibilityLevel,
      configuredByUserId: data.configuredByUserId,
      busyLabel: data.busyLabel ?? "Busy",
      calendarExclusions: data.calendarExclusions ?? [],
    })
      .where(and(eq(verticalVisibility.fromVerticalId, data.fromVerticalId), eq(verticalVisibility.toVerticalId, data.toVerticalId)));
  } else {
    await db.insert(verticalVisibility).values(data);
  }
}

export async function deleteVerticalVisibility(ruleId: string) {
  const db = await getDb();
  if (!db) return;
  await db.delete(verticalVisibility).where(eq(verticalVisibility.id, ruleId));
}

// ─── Calendars ──────────────────────────────────────────────────────

export async function createCalendar(data: InsertCalendar) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(calendars).values(data);
  return data;
}

export async function getCalendar(id: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(calendars).where(eq(calendars.id, id)).limit(1);
  return rows[0] || null;
}

export async function getCalendars(householdId: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(calendars).where(eq(calendars.householdId, householdId));
}

export async function getCalendarsByMember(memberId: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(calendars).where(eq(calendars.memberId, memberId));
}

export async function getCalendarsByVertical(verticalId: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(calendars).where(eq(calendars.verticalId, verticalId));
}

export async function updateCalendar(id: string, data: Partial<InsertCalendar>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(calendars).set(data).where(eq(calendars.id, id));
}

export async function deleteCalendar(id: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(calendars).where(eq(calendars.id, id));
}

// ─── Events ─────────────────────────────────────────────────────────

export async function createEvent(data: InsertEvent) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(events).values(data);
  return data;
}

export async function getEvent(id: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(events).where(eq(events.id, id)).limit(1);
  return rows[0] || null;
}

export async function getEvents(householdId: string, startTime: number, endTime: number) {
  const db = await getDb();
  if (!db) return [];
  // Use overlap query: event overlaps [startTime, endTime] if event.startTime < endTime AND event.endTime > startTime
  // This correctly returns multi-day all-day events that START before the window but OVERLAP it
  const { lt, gt } = await import("drizzle-orm");
  return db.select().from(events).where(
    and(
      eq(events.householdId, householdId),
      lt(events.startTime, endTime),
      gt(events.endTime, startTime),
    )
  );
}

export async function getEventsByCalendar(calendarId: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(events).where(eq(events.calendarId, calendarId));
}

export async function updateEvent(id: string, data: Partial<InsertEvent>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(events).set(data).where(eq(events.id, id));
}

export async function deleteEvent(id: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(events).where(eq(events.id, id));
}

/** Get all instances of a recurring series by the master event's externalId (recurringEventId). */
export async function getEventsByRecurringId(recurringEventId: string, householdId: string) {
  const db = await getDb();
  if (!db) return [];
  const { or } = await import("drizzle-orm");
  return db.select().from(events).where(
    and(
      eq(events.householdId, householdId),
      or(eq(events.recurringEventId, recurringEventId), eq(events.externalId, recurringEventId))
    )
  );
}

/** Delete all instances of a recurring series at or after a given startTime. */
export async function deleteEventsByRecurringIdFrom(recurringEventId: string, householdId: string, fromStartTime: number) {
  const db = await getDb();
  if (!db) return;
  const { gte, or } = await import("drizzle-orm");
  await db.delete(events).where(
    and(
      eq(events.householdId, householdId),
      or(eq(events.recurringEventId, recurringEventId), eq(events.externalId, recurringEventId)),
      gte(events.startTime, fromStartTime)
    )
  );
}

/** Update all instances of a recurring series. */
export async function updateEventsByRecurringId(recurringEventId: string, householdId: string, data: Partial<InsertEvent>) {
  const db = await getDb();
  if (!db) return;
  const { or } = await import("drizzle-orm");
  await db.update(events).set(data).where(
    and(
      eq(events.householdId, householdId),
      or(eq(events.recurringEventId, recurringEventId), eq(events.externalId, recurringEventId))
    )
  );
}

/** Delete shadow blocks for all events in a recurring series at or after a given startTime. */
export async function deleteShadowBlocksForRecurringFrom(recurringEventId: string, householdId: string, fromStartTime: number) {
  const db = await getDb();
  if (!db) return;
  const { gte, or, inArray } = await import("drizzle-orm");
  // Find all event IDs in the series at or after fromStartTime
  const seriesEvents = await db.select({ id: events.id }).from(events).where(
    and(
      eq(events.householdId, householdId),
      or(eq(events.recurringEventId, recurringEventId), eq(events.externalId, recurringEventId)),
      gte(events.startTime, fromStartTime)
    )
  );
  if (seriesEvents.length === 0) return;
  const ids = seriesEvents.map(e => e.id);
  await db.delete(shadowBlocks).where(inArray(shadowBlocks.sourceEventId, ids));
}

// ─── Shadow Blocks ──────────────────────────────────────────────────

export async function getShadowBlocks(householdId: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(shadowBlocks).where(
    and(eq(shadowBlocks.householdId, householdId), eq(shadowBlocks.isDismissed, false))
  );
}

export async function dismissShadowBlock(id: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(shadowBlocks).set({ isDismissed: true, dismissedAt: sql`now()` }).where(eq(shadowBlocks.id, id));
}

/**
 * Look up a shadow block by the Google event ID it created on a target calendar.
 * Used by the webhook handler to detect when a shadow block event is deleted/modified
 * externally so we can skip re-propagation (avoids the delete-triggers-create loop).
 */
export async function getShadowBlockByExternalId(externalEventId: string, targetCalendarId: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(shadowBlocks).where(
    and(
      eq(shadowBlocks.externalEventId, externalEventId),
      eq(shadowBlocks.targetCalendarId, targetCalendarId)
    )
  ).limit(1);
  return rows[0] ?? null;
}

/**
 * Look up an existing shadow block by (sourceEventId, targetCalendarId).
 * Used by eventPropagation to check if a Google Calendar event was already written
 * before making a new write call — prevents duplicate Google events on re-propagation.
 * Returns the existing block (with its externalEventId) if found, null otherwise.
 */
export async function getShadowBlockBySourceAndTarget(sourceEventId: string, targetCalendarId: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(shadowBlocks).where(
    and(
      eq(shadowBlocks.sourceEventId, sourceEventId),
      eq(shadowBlocks.targetCalendarId, targetCalendarId)
    )
  ).limit(1);
  return rows[0] ?? null;
}

// ─── OAuth Tokens ───────────────────────────────────────────────────

import { encryptToken, decryptToken } from "./tokenEncryption";

function encryptOAuthData(data: Partial<InsertOAuthToken>): Partial<InsertOAuthToken> {
  const result = { ...data };
  if (result.accessToken) result.accessToken = encryptToken(result.accessToken);
  if (result.refreshToken) result.refreshToken = encryptToken(result.refreshToken);
  return result;
}

function decryptOAuthRow<T extends { accessToken?: string | null; refreshToken?: string | null }>(row: T): T {
  return {
    ...row,
    accessToken: row.accessToken ? (decryptToken(row.accessToken) ?? row.accessToken) : row.accessToken,
    refreshToken: row.refreshToken ? (decryptToken(row.refreshToken) ?? row.refreshToken) : row.refreshToken,
  };
}

export async function storeOAuthToken(data: InsertOAuthToken) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(oauthTokens).values(encryptOAuthData(data) as InsertOAuthToken);
  return data;
}

export async function getOAuthToken(memberId: string, provider: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(oauthTokens).where(
    and(eq(oauthTokens.memberId, memberId), eq(oauthTokens.provider, provider), eq(oauthTokens.status, "active"))
  ).limit(1);
  return rows[0] ? decryptOAuthRow(rows[0]) : null;
}

export async function updateOAuthToken(id: string, data: Partial<InsertOAuthToken>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(oauthTokens).set(encryptOAuthData(data) as Partial<InsertOAuthToken>).where(eq(oauthTokens.id, id));
}

/** Get ALL OAuth tokens for a member (all statuses — active, expired, revoked).
 * P-36-B: Deduplication guard — if multiple rows exist for the same accountEmail, return only the most
 * recent active row and suppress any superseded revoked/expired rows for that email. This prevents the
 * integrations page from showing a duplicate amber warning for an account that has already been reconnected.
 */
export async function getAllOAuthTokens(memberId: string, provider: string) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(oauthTokens).where(
    and(eq(oauthTokens.memberId, memberId), eq(oauthTokens.provider, provider))
  ).orderBy(desc(oauthTokens.createdAt));
  const decrypted = rows.map(decryptOAuthRow);
  // P-36-B: Group by accountEmail; if an active row exists for an email, suppress all revoked/expired rows for it
  const activeEmails = new Set(decrypted.filter(r => r.status === "active").map(r => r.accountEmail));
  return decrypted.filter(r => {
    if (r.status === "active") return true;
    // Keep revoked/expired only if there is no active row for the same email
    return !activeEmails.has(r.accountEmail);
  });
}

/** Get a specific OAuth token by member + provider + accountEmail (any status) */
export async function getOAuthTokenByEmail(memberId: string, provider: string, accountEmail: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(oauthTokens).where(
    and(
      eq(oauthTokens.memberId, memberId),
      eq(oauthTokens.provider, provider),
      eq(oauthTokens.accountEmail, accountEmail)
    )
  ).limit(1);
  return rows[0] ? decryptOAuthRow(rows[0]) : null;
}

/** Get a specific OAuth token by its UUID (P-11: use this for unambiguous token operations) */
export async function getOAuthTokenById(id: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(oauthTokens).where(eq(oauthTokens.id, id)).limit(1);
  return rows[0] ? decryptOAuthRow(rows[0]) : null;
}

/** Upsert an OAuth token — updates if accountEmail already exists for this member+provider, otherwise inserts.
 * P-36: Also deletes stale revoked/expired rows for the same account so the integrations page never
 * shows duplicate entries. Handles the pending_ memberId case where memberId changed after household join.
 */
export async function upsertOAuthToken(data: InsertOAuthToken) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await getOAuthTokenByEmail(data.memberId, data.provider, data.accountEmail);
  if (existing) {
    await db.update(oauthTokens).set(encryptOAuthData({
      accessToken: data.accessToken,
      refreshToken: data.refreshToken || existing.refreshToken,
      expiresAt: data.expiresAt,
      scopes: data.scopes || existing.scopes,
      status: "active",
      lastRefreshedAt: new Date(),
    }) as Partial<InsertOAuthToken>).where(eq(oauthTokens.id, existing.id));
    // P-36: Belt-and-suspenders: delete any other stale rows for the same account (shouldn't exist but prevents future duplicates)
    await db.delete(oauthTokens).where(
      and(
        eq(oauthTokens.memberId, data.memberId),
        eq(oauthTokens.provider, data.provider),
        eq(oauthTokens.accountEmail, data.accountEmail),
        not(eq(oauthTokens.id, existing.id))
      )
    );
    return { ...existing, ...data, id: existing.id };
  }
  // P-36: Before inserting, delete orphan revoked/expired rows for same provider+accountEmail
  // (handles pending_ memberId case: old row had memberId="pending_xyz", new login resolves real memberId)
  await db.delete(oauthTokens).where(
    and(
      eq(oauthTokens.provider, data.provider),
      eq(oauthTokens.accountEmail, data.accountEmail),
      inArray(oauthTokens.status, ["revoked", "expired"])
    )
  );
  await db.insert(oauthTokens).values(encryptOAuthData(data) as InsertOAuthToken);
  return data;
}

/** Revoke a specific OAuth token by ID */
export async function revokeOAuthToken(id: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(oauthTokens).set({ status: "revoked" }).where(eq(oauthTokens.id, id));
}

/** Update the purposes array and optional displayName for an OAuth token */
export async function updateOAuthTokenPurposes(
  id: string,
  purposes: string[],
  displayName?: string | null,
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const update: Partial<InsertOAuthToken> = { purposes };
  if (displayName !== undefined) update.displayName = displayName ?? undefined;
  await db.update(oauthTokens).set(update).where(eq(oauthTokens.id, id));
}

/**
 * Get all active OAuth tokens for a member that include a specific purpose.
 * Uses JSON_CONTAINS to filter by purpose value inside the JSON array.
 */
export async function getOAuthTokensByPurpose(memberId: string, purpose: string) {
  const db = await getDb();
  if (!db) return [];
  // JSON_CONTAINS(purposes, '"calendar_sync"') — note the double-quoted JSON string
  const rows = await db.select().from(oauthTokens).where(
    and(
      eq(oauthTokens.memberId, memberId),
      eq(oauthTokens.status, "active"),
    )
  );
  // Filter in JS since TiDB JSON_CONTAINS syntax varies; purposes arrays are small
  return rows
    .filter(r => Array.isArray(r.purposes) && r.purposes.includes(purpose))
    .map(decryptOAuthRow);
}

// ─── Subscriptions ──────────────────────────────────────────────────

export async function createSubscription(data: InsertSubscription) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(subscriptions).values(data);
  return data;
}

export async function getSubscription(householdId: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(subscriptions).where(eq(subscriptions.householdId, householdId)).limit(1);
  return rows[0] || null;
}

// ─── Calendar Sync Helpers ──────────────────────────────────────────

export async function upsertEvent(data: InsertEvent) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  if (data.externalId && data.calendarId) {
    // P-21: Use atomic INSERT ... ON DUPLICATE KEY UPDATE to prevent race-condition duplicates.
    // The unique index events_calendar_external_uniq on (calendarId, externalId) ensures
    // that concurrent syncs cannot create multiple rows for the same Google event.
    const { sql: rawSql } = await import("drizzle-orm");
    await db.execute(rawSql`
      INSERT INTO events (
        id, householdId, calendarId, externalId, title, description, location,
        startTime, endTime, isAllDay, recurrenceRule, recurringEventId, status,
        visibility, attendees, reminders, createdBy, lastModifiedBy, source,
        isShadowBlock, version, etag
      ) VALUES (
        ${data.id}, ${data.householdId}, ${data.calendarId}, ${data.externalId},
        ${data.title}, ${data.description ?? null}, ${data.location ?? null},
        ${data.startTime}, ${data.endTime}, ${data.isAllDay ?? false},
        ${data.recurrenceRule ?? null}, ${data.recurringEventId ?? null},
        ${data.status ?? 'confirmed'}, ${data.visibility ?? 'default'},
        ${data.attendees ? JSON.stringify(data.attendees) : null},
        ${data.reminders ? JSON.stringify(data.reminders) : null},
        ${data.createdBy ?? null}, ${data.lastModifiedBy ?? null},
        ${data.source ?? 'sync'}, ${data.isShadowBlock ?? false},
        ${data.version ?? 1}, ${data.etag ?? null}
      )
      ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        description = VALUES(description),
        location = VALUES(location),
        startTime = VALUES(startTime),
        endTime = VALUES(endTime),
        isAllDay = VALUES(isAllDay),
        recurrenceRule = VALUES(recurrenceRule),
        recurringEventId = VALUES(recurringEventId),
        status = VALUES(status),
        visibility = VALUES(visibility),
        attendees = VALUES(attendees),
        reminders = VALUES(reminders),
        lastModifiedBy = VALUES(lastModifiedBy),
        source = VALUES(source),
        isShadowBlock = VALUES(isShadowBlock),
        version = VALUES(version),
        etag = VALUES(etag),
        updatedAt = NOW()
    `);
    // Return the canonical row (either the newly inserted or the updated existing row)
    const canonical = await db.select().from(events).where(
      and(eq(events.externalId, data.externalId), eq(events.calendarId, data.calendarId))
    ).limit(1);
    return canonical[0] ?? data;
  } else {
    // Manual events (no externalId) — plain insert
    await db.insert(events).values(data);
    return data;
  }
}

export async function updateCalendarSyncToken(calendarId: string, syncToken: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(calendars).set({ syncToken, lastSyncAt: new Date(), syncStatus: "active" }).where(eq(calendars.id, calendarId));
}

export async function getCalendarSyncToken(calendarId: string): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select({ syncToken: calendars.syncToken }).from(calendars).where(eq(calendars.id, calendarId)).limit(1);
  return rows[0]?.syncToken || null;
}

export async function setCalendarSyncError(calendarId: string, error: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(calendars).set({ syncStatus: "error", syncError: error }).where(eq(calendars.id, calendarId));
}

// ─── Webhook Channels ──────────────────────────────────────────────

export async function createWebhookChannel(data: InsertWebhookChannel) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(webhookChannels).values(data);
  return data;
}

export async function getWebhookChannel(calendarId: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(webhookChannels).where(
    and(eq(webhookChannels.calendarId, calendarId), eq(webhookChannels.status, "active"))
  ).limit(1);
  return rows[0] || null;
}

export async function getWebhookChannelByResourceId(resourceId: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(webhookChannels).where(
    and(eq(webhookChannels.resourceId, resourceId), eq(webhookChannels.status, "active"))
  ).limit(1);
  return rows[0] || null;
}

export async function expireWebhookChannel(id: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(webhookChannels).set({ status: "expired" }).where(eq(webhookChannels.id, id));
}

// ─── Sync Log ──────────────────────────────────────────────────────

export async function createSyncLogEntry(data: InsertSyncLogEntry) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(syncLog).values(data);
  return data;
}


// ─── Properties ──────────────────────────────────────────────────────
export async function getProperties(householdId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(properties).where(eq(properties.householdId, householdId)).orderBy(desc(properties.createdAt));
}

export async function getPropertyById(id: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db.select().from(properties).where(eq(properties.id, id)).limit(1);
  return rows[0] || null;
}

export async function createProperty(data: InsertProperty) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(properties).values(data);
  return data;
}

export async function updateProperty(id: string, data: Partial<InsertProperty>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(properties).set(data).where(eq(properties.id, id));
}

/**
 * M-04: Get cascade impact counts for property deletion confirmation dialog.
 */
export async function getPropertyDeleteImpact(propertyId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [bookingsCount] = await db.select({ count: sql<number>`count(*)` }).from(propertyBookings).where(eq(propertyBookings.propertyId, propertyId));
  const [platformsCount] = await db.select({ count: sql<number>`count(*)` }).from(propertyPlatforms).where(eq(propertyPlatforms.propertyId, propertyId));
  const [prepRulesCount] = await db.select({ count: sql<number>`count(*)` }).from(propertyPrepRules).where(eq(propertyPrepRules.propertyId, propertyId));
  const [devicesCount] = await db.select({ count: sql<number>`count(*)` }).from(devices).where(eq(devices.propertyId, propertyId));
  const [emailJobsCount] = await db.select({ count: sql<number>`count(*)` }).from(emailScrapeJobs).where(eq(emailScrapeJobs.propertyId, propertyId));
  return {
    bookings: bookingsCount?.count ?? 0,
    platforms: platformsCount?.count ?? 0,
    prepRules: prepRulesCount?.count ?? 0,
    devices: devicesCount?.count ?? 0,
    emailJobs: emailJobsCount?.count ?? 0,
  };
}

export async function deleteProperty(id: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // C-01: Cascade delete all child records before removing the property row
  // Order matters: delete leaf tables first, then parent tables
  await db.delete(emailScrapeJobs).where(eq(emailScrapeJobs.propertyId, id));
  await db.delete(propertyEmailTokens).where(eq(propertyEmailTokens.propertyId, id));
  await db.delete(propertyBookings).where(eq(propertyBookings.propertyId, id));
  await db.delete(propertyPrepRules).where(eq(propertyPrepRules.propertyId, id));
  await db.delete(propertyPlatforms).where(eq(propertyPlatforms.propertyId, id));
  await db.delete(devices).where(eq(devices.propertyId, id));
  await db.delete(properties).where(eq(properties.id, id));
}

// ─── Notes ───────────────────────────────────────────────────────────
export async function getNotes(householdId: string, filters?: { memberId?: string; verticalId?: string; eventId?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const conditions = [eq(notes.householdId, householdId)];
  if (filters?.memberId) conditions.push(eq(notes.memberId, filters.memberId));
  if (filters?.verticalId) conditions.push(eq(notes.verticalId, filters.verticalId));
  if (filters?.eventId) conditions.push(eq(notes.eventId, filters.eventId));
  return db.select().from(notes).where(and(...conditions)).orderBy(desc(notes.createdAt));
}

export async function getNoteById(id: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db.select().from(notes).where(eq(notes.id, id)).limit(1);
  return rows[0] || null;
}

export async function createNote(data: InsertNote) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(notes).values(data);
  return data;
}

export async function updateNote(id: string, data: Partial<InsertNote>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(notes).set(data).where(eq(notes.id, id));
}

export async function deleteNote(id: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(notes).where(eq(notes.id, id));
}

// ─── Shadow Block Propagation ─────────────────────────────────────────────────

/**
 * @deprecated Use onEventUpserted() from server/services/eventPropagation.ts instead.
 * This legacy function only handles same-vertical siblings and does not write to Google Calendar.
 * Kept as dead code with safety guards in case it is accidentally re-used.
 *
 * After creating or updating an event, create shadow blocks on all other
 * calendars in the same vertical so household members see "Busy" blocks.
 * - Only propagates if the source calendar has a verticalId.
 * - maskedTitle: "Busy" for other members' calendars; full title for same member.
 * - Idempotent: deletes existing blocks for this event first, then re-inserts.
 * - P-10 + P-12: shadowBlocking guard applied — opted-out calendars (shadowBlocking=0/false) are skipped.
 */
export async function propagateShadowBlocks(
  eventId: string,
  sourceCalendarId: string,
  householdId: string,
  eventTitle: string,
) {
  const db = await getDb();
  if (!db) return;

  const srcRows = await db.select().from(calendars).where(eq(calendars.id, sourceCalendarId)).limit(1);
  const srcCal = srcRows[0];
  if (!srcCal || !srcCal.verticalId) return; // no vertical → no propagation

  const siblings = await db.select().from(calendars).where(
    and(eq(calendars.verticalId, srcCal.verticalId), eq(calendars.householdId, householdId))
  );

  // Remove stale blocks for this event (idempotent on update)
  await db.delete(shadowBlocks).where(eq(shadowBlocks.sourceEventId, eventId));

  const blocks: InsertShadowBlock[] = siblings
    .filter(c => c.id !== sourceCalendarId)
    // P-10 + P-12: MySQL returns TINYINT(1) as 0/1; Drizzle coerces to boolean.
    // Use truthy check (!!val) to handle both representations.
    // Opted-out calendars (shadowBlocking=0/false) must never receive shadow blocks.
    .filter(c => !!(c as any).shadowBlocking)
    .map(c => ({
      id: nanoid(),
      householdId,
      sourceEventId: eventId,
      sourceCalendarId,
      targetCalendarId: c.id,
      maskedTitle: c.memberId === srcCal.memberId ? eventTitle : "Busy",
      isDismissed: false,
    }));

  if (blocks.length > 0) {
    await db.insert(shadowBlocks).values(blocks);
  }
}

/**
 * Remove all shadow blocks for a deleted event.
 */
export async function deleteShadowBlocksForEvent(eventId: string) {
  const db = await getDb();
  if (!db) return;
  await db.delete(shadowBlocks).where(eq(shadowBlocks.sourceEventId, eventId));
}

/**
 * Return shadow blocks in a time range as synthetic event-like objects.
 * Joins with the source event to get start/end times.
 */
export async function getShadowBlocksInRange(
  householdId: string,
  startTime: number,
  endTime: number,
) {
  const db = await getDb();
  if (!db) return [];

  // Use cached startTime/endTime/isAllDay columns on shadow_blocks (no JOIN needed)
  // Use overlap query: block overlaps [startTime, endTime] if block.startTime < endTime AND block.endTime > startTime
  const { lt: ltSb, gt: gtSb, isNotNull } = await import("drizzle-orm");
  const rows = await db
    .select({
      id: shadowBlocks.id,
      sourceEventId: shadowBlocks.sourceEventId,
      sourceCalendarId: shadowBlocks.sourceCalendarId,
      targetCalendarId: shadowBlocks.targetCalendarId,
      maskedTitle: shadowBlocks.maskedTitle,
      isDismissed: shadowBlocks.isDismissed,
      startTime: shadowBlocks.startTime,
      endTime: shadowBlocks.endTime,
      isAllDay: shadowBlocks.isAllDay,
    })
    .from(shadowBlocks)
    .where(
      and(
        eq(shadowBlocks.householdId, householdId),
        eq(shadowBlocks.isDismissed, false),
        isNotNull(shadowBlocks.startTime),
        ltSb(shadowBlocks.startTime, endTime),
        gtSb(shadowBlocks.endTime, startTime),
      )
    );

  return rows;
}

/** Get all Google calendars that have an externalId (needed for webhook registration). */
export async function getAllGoogleCalendars() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(calendars).where(
    and(
      or(eq(calendars.provider, "google_workspace"), eq(calendars.provider, "google_personal")),
      isNotNull(calendars.externalId),
    )
  );
}

// ─── Booking Requests ────────────────────────────────────────────────

export async function createBookingRequest(data: InsertBookingRequest) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(bookingRequests).values(data);
  return data;
}

export async function getBookingRequest(id: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(bookingRequests).where(eq(bookingRequests.id, id)).limit(1);
  return rows[0] || null;
}

export async function getBookingRequests(
  householdId: string,
  requestorMemberId: string | null,
  status: "pending" | "approved" | "declined" | "cancelled" | null,
) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(bookingRequests.householdId, householdId)];
  if (requestorMemberId) conditions.push(eq(bookingRequests.requestorMemberId, requestorMemberId));
  if (status) conditions.push(eq(bookingRequests.status, status));
  return db.select().from(bookingRequests).where(and(...conditions)).orderBy(bookingRequests.startTime);
}

export async function updateBookingRequest(id: string, data: Partial<InsertBookingRequest>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(bookingRequests).set(data).where(eq(bookingRequests.id, id));
}

// ─── Property Platforms ──────────────────────────────────────────────────────

export async function getPropertyPlatforms(propertyId: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(propertyPlatforms).where(eq(propertyPlatforms.propertyId, propertyId)).orderBy(propertyPlatforms.createdAt);
}

export async function getPropertyPlatformById(id: string) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select().from(propertyPlatforms).where(eq(propertyPlatforms.id, id)).limit(1);
  return row || null;
}

export async function createPropertyPlatform(data: InsertPropertyPlatform) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(propertyPlatforms).values(data);
  return data;
}

export async function updatePropertyPlatform(id: string, data: Partial<InsertPropertyPlatform>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(propertyPlatforms).set(data).where(eq(propertyPlatforms.id, id));
}

export async function deletePropertyPlatform(id: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(propertyPlatforms).where(eq(propertyPlatforms.id, id));
}

// ─── Property Prep Rules ─────────────────────────────────────────────────────

export async function getPropertyPrepRule(propertyId: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(propertyPrepRules).where(eq(propertyPrepRules.propertyId, propertyId)).limit(1);
  return rows[0] || null;
}

export async function upsertPropertyPrepRule(data: InsertPropertyPrepRule) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await getPropertyPrepRule(data.propertyId);
  if (existing) {
    await db.update(propertyPrepRules).set({ ...data, updatedAt: new Date() }).where(eq(propertyPrepRules.propertyId, data.propertyId));
  } else {
    await db.insert(propertyPrepRules).values(data);
  }
}

// ─── Property Bookings ───────────────────────────────────────────────────────

export async function getPropertyBookingById(bookingId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(propertyBookings).where(eq(propertyBookings.id, bookingId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updatePropertyBookingFinancials(
  bookingId: string,
  data: {
    guestName?: string | null;
    guestCount?: number | null;
    guestEmail?: string | null;
    guestPhone?: string | null;
    totalPrice?: number | null;
    cleaningFee?: number | null;
    commissionAmount?: number | null;
    netAmount?: number | null;
    currency?: string | null;
    confirmationNumber?: string | null;
    platformBookingUrl?: string | null;
    notes?: string | null;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(propertyBookings).set({
    ...data,
    lastEnrichedAt: Date.now(),
  } as any).where(eq(propertyBookings.id, bookingId));
}

export async function createManualPropertyBooking(data: InsertPropertyBooking) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(propertyBookings).values(data);
  return data;
}

export async function cancelPropertyBooking(bookingId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(propertyBookings).set({
    bookingStatus: "cancelled",
    cancelledAt: Date.now(),
    cancellationSource: "manual",
  }).where(eq(propertyBookings.id, bookingId));
}

/** P-31: Restore a cancelled booking back to confirmed */
export async function restorePropertyBooking(bookingId: string) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  await db.update(propertyBookings).set({
    bookingStatus: 'confirmed',
    cancelledAt: null,
    cancellationSource: null,
    pendingCancellationSource: null,
    pendingCancellationAt: null,
    updatedAt: new Date(),
  } as any).where(eq(propertyBookings.id, bookingId));
}

/** P-31: Confirm a pending cancellation — finalise as cancelled */
export async function confirmBookingCancellation(bookingId: string) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  await db.update(propertyBookings).set({
    bookingStatus: 'cancelled',
    cancelledAt: Date.now(),
    cancellationSource: 'user_confirmed',
    pendingCancellationSource: null,
    pendingCancellationAt: null,
    updatedAt: new Date(),
  } as any).where(eq(propertyBookings.id, bookingId));
}

/** P-31: Dismiss a pending cancellation — keep booking as confirmed */
export async function dismissBookingCancellation(bookingId: string) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  await db.update(propertyBookings).set({
    pendingCancellationSource: null,
    pendingCancellationAt: null,
    updatedAt: new Date(),
  } as any).where(eq(propertyBookings.id, bookingId));
}

/** P-31: Return cancelled bookings for a property (soft-deleted, restorable) */
export async function getCancelledBookings(propertyId: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(propertyBookings)
    .where(and(
      eq(propertyBookings.propertyId, propertyId),
      eq(propertyBookings.bookingStatus, 'cancelled'),
    ))
    .orderBy(propertyBookings.checkIn);
}

/** P-31: Return all bookings with a pending cancellation for a given household */
export async function getPendingCancellations(householdId: string) {
  const db = await getDb();
  if (!db) return [];
  // Join through properties to filter by household
  const rows = await db
    .select({
      id: propertyBookings.id,
      propertyId: propertyBookings.propertyId,
      summary: propertyBookings.summary,
      checkIn: propertyBookings.checkIn,
      checkOut: propertyBookings.checkOut,
      guestName: propertyBookings.guestName,
      pendingCancellationSource: sql<string>`${propertyBookings}.pending_cancellation_source`,
      pendingCancellationAt: sql<number>`${propertyBookings}.pending_cancellation_at`,
      dataSource: sql<string>`${propertyBookings}.data_source`,
    })
    .from(propertyBookings)
    .innerJoin(properties, eq(propertyBookings.propertyId, properties.id))
    .where(
      and(
        eq(properties.householdId, householdId),
        eq(propertyBookings.bookingStatus, 'confirmed'),
        sql`${propertyBookings}.pending_cancellation_source IS NOT NULL`,
      )
    )
    .orderBy(propertyBookings.checkIn);
  return rows;
}

export async function getPropertyBookings(propertyId: string, fromTs?: number, toTs?: number) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [
    eq(propertyBookings.propertyId, propertyId),
    // Only return confirmed bookings — cancelled rows (iCal removal or email) are excluded
    eq(propertyBookings.bookingStatus, "confirmed"),
  ];
  if (fromTs) conditions.push(sql`${propertyBookings.checkOut} >= ${fromTs}`);
  if (toTs) conditions.push(sql`${propertyBookings.checkIn} <= ${toTs}`);
  return db.select().from(propertyBookings).where(and(...conditions)).orderBy(propertyBookings.checkIn);
}

// ─── Composite Bookings (merged + deduplicated across platforms) ─────────────

export interface CompositeBookingEntry {
  /** Unique key for this composite entry (stable across re-renders) */
  key: string;
  /** Entry type — drives the Gantt marker */
  type: "checkin" | "checkout" | "block" | "unavailable" | "prep" | "back_to_back";
  /** ISO date string YYYY-MM-DD for the day this entry starts */
  date: string;
  /** Human-readable label */
  summary: string;
  /** Normalised platform key for colour lookup (e.g. 'airbnb', 'vrbo', 'booking_com') */
  platform: string;
  /** Human-readable platform display name (e.g. 'Airbnb', 'VRBO') */
  platformDisplay: string;
  /** Unix ms timestamp for check-in (start of stay) */
  checkIn: number;
  /** Unix ms timestamp for check-out (end of stay) */
  checkOut: number;
  /** Whether this entry has a cross-platform conflict */
  hasConflict?: boolean;
  /** Source booking row ID (for override mutations) */
  id?: string;
  /** Guest name override (from booking_overrides table) */
  guestName?: string;
  /**
   * Effective sort/filter timestamp.
   * For check-out entries this is set to checkOut so the entry sorts and filters
   * by the actual departure date rather than the check-in date.
   * For all other entry types this field is absent and checkIn is used.
   */
  sortTs?: number;
  // ── Enrichment fields from property_bookings (populated by email scraping) ──
  guestEmail?: string | null;
  guestPhone?: string | null;
  guestCount?: number | null;
  totalPrice?: number | null;
  cleaningFee?: number | null;
  commissionAmount?: number | null;
  netAmount?: number | null;
  currency?: string | null;
  confirmationNumber?: string | null;
  platformBookingUrl?: string | null;
  emailScrapeSource?: string | null;
  scrapeConfidence?: number | null;
  lastEnrichedAt?: Date | null;
}

/**
 * Returns a composite, deduplicated view of all bookings for a property.
 *
 * Algorithm:
 * 1. Fetch all raw `property_bookings` rows in the window (across all platforms).
 * 2. Fetch the platform map so we can attach platform names.
 * 3. Deduplicate: if two platforms report an overlapping block for the same
 *    date range, keep the one with the highest-priority bookingType
 *    (booking > block > unavailable). Overlap is defined as >50% date overlap.
 * 4. For each surviving `booking` type entry, apply prep rules:
 *    - blockDaysBefore → inject `prep` entries before check-in
 *    - blockDaysAfter  → inject `prep` entries after check-out
 * 5. Return all entries sorted by checkIn.
 */
export async function getCompositeBookings(
  propertyId: string,
  fromTs?: number,
  toTs?: number,
): Promise<CompositeBookingEntry[]> {
  const db = await getDb();
  if (!db) return [];

  const MS_PER_DAY = 86_400_000;

  // 1. Fetch raw bookings in window.
  // IMPORTANT: Extend the fetch window backward by 1 day (86400s) so that bookings
  // whose checkOut is stored as midnight UTC on the requested date are still fetched.
  // Example: checkOut = 2026-06-20T00:00:00Z (midnight UTC = 8 PM EDT Jun 19).
  // If fromTs = 2026-06-20T04:00:00Z (midnight EDT), the raw checkOut < fromTs, so
  // the booking would be excluded. Fetching from (fromTs - 1 day) ensures it is
  // included; the per-entry date-string filter in the router then correctly decides
  // whether to show it based on the device timezone.
  const fetchFromTs = fromTs ? fromTs - MS_PER_DAY : undefined;
  const conditions = [
    eq(propertyBookings.propertyId, propertyId),
    // Only include confirmed bookings — cancelled rows are excluded from composite views
    eq(propertyBookings.bookingStatus, "confirmed"),
  ];
  if (fetchFromTs) conditions.push(sql`${propertyBookings.checkOut} >= ${fetchFromTs}`);
  if (toTs)        conditions.push(sql`${propertyBookings.checkIn}  <= ${toTs}`);
  const rawRows = await db
    .select()
    .from(propertyBookings)
    .where(and(...conditions))
    .orderBy(propertyBookings.checkIn);

  // 2. Fetch platform map (id → { platform, displayName })
  const platformRows = await db
    .select({ id: propertyPlatforms.id, platform: propertyPlatforms.platform, displayName: propertyPlatforms.displayName })
    .from(propertyPlatforms)
    .where(eq(propertyPlatforms.propertyId, propertyId));
  const platformMap = new Map(platformRows.map((p: { id: string; platform: string; displayName: string | null }) => [p.id, p]));

  // 3. Deduplicate: group by date-range fingerprint, keep highest-priority type
  const BOOKING_PRIORITY: Record<string, number> = { booking: 3, block: 2, unavailable: 1 };

  // Build a map from a normalised date-range key to the best booking row.
  // Two rows are considered "same block" if they overlap by >50% of the shorter span.
  //
  // Merge rules (P-31 unified booking record model):
  // 1. Enrichment fields (guestName, guestEmail, totalPrice etc.) always survive — prefer
  //    the row that has lastEnrichedAt set (email-scraped data).
  // 2. When dataSource='both' and emailCheckIn/emailCheckOut differ from iCal dates by
  //    >1 day, email dates win and a notification is queued.
  // 3. dataSource is promoted: ical_only + email_only → 'both'.
  const MS_PER_DAY_MERGE = 86_400_000;
  const merged: Array<typeof rawRows[0]> = [];
  // Track date-mismatch notifications to fire after the loop (avoid duplicate notifs)
  const dateMismatchNotifs: Array<{ bookingId: string; icalIn: number; icalOut: number; emailIn: number; emailOut: number }> = [];

  for (const row of rawRows) {
    let absorbed = false;
    for (const existing of merged) {
      const overlapStart = Math.max(row.checkIn, existing.checkIn);
      const overlapEnd   = Math.min(row.checkOut, existing.checkOut);
      const overlapMs    = Math.max(0, overlapEnd - overlapStart);
      const shorterSpan  = Math.min(row.checkOut - row.checkIn, existing.checkOut - existing.checkIn);

      // ── P-38 Enhanced merge: same-platform bookings with near-identical dates ──
      // If two rows share the same platformId AND overlap by >80%, always merge.
      // This catches: iCal generic "Booking.com Reservation" + email-scraped guest name,
      // Airbnb "Reserved" + email-enriched booking, etc.
      const samePlatform = row.platformId && existing.platformId && row.platformId === existing.platformId;
      const highOverlap = shorterSpan > 0 && overlapMs / shorterSpan > 0.8;
      // Also merge if dates are within 1 day tolerance on both ends (same booking, slight tz drift)
      const nearExactDates = Math.abs(row.checkIn - existing.checkIn) <= MS_PER_DAY_MERGE &&
                             Math.abs(row.checkOut - existing.checkOut) <= MS_PER_DAY_MERGE;
      const shouldMerge = (shorterSpan > 0 && overlapMs / shorterSpan > 0.5) ||
                          (samePlatform && (highOverlap || nearExactDates));

      if (shouldMerge) {
        // ── 1. Booking type priority ──────────────────────────────────────────
        const existingPriority = BOOKING_PRIORITY[existing.bookingType] ?? 0;
        const rowPriority      = BOOKING_PRIORITY[row.bookingType] ?? 0;
        if (rowPriority > existingPriority) {
          existing.bookingType = row.bookingType;
          existing.summary     = row.summary || existing.summary;
          existing.platformId  = row.platformId;
        }
        // ── 2. Enrichment fields — prefer the email-scraped row ───────────────
        // The row with lastEnrichedAt set is the email-enriched one; its guest
        // data, financials, and confirmation number take priority.
        const incomingIsEnriched = !!row.lastEnrichedAt && (!existing.lastEnrichedAt || row.lastEnrichedAt > (existing.lastEnrichedAt as any));
        if (incomingIsEnriched) {
          if (row.guestName)          existing.guestName          = row.guestName;
          if (row.guestEmail)         existing.guestEmail         = row.guestEmail;
          if (row.guestPhone)         existing.guestPhone         = row.guestPhone;
          if (row.guestCount)         existing.guestCount         = row.guestCount;
          if (row.totalPrice)         existing.totalPrice         = row.totalPrice;
          if (row.cleaningFee)        existing.cleaningFee        = row.cleaningFee;
          if (row.commissionAmount)   existing.commissionAmount   = row.commissionAmount;
          if (row.netAmount)          existing.netAmount          = row.netAmount;
          if (row.currency)           existing.currency           = row.currency;
          if (row.confirmationNumber) existing.confirmationNumber = row.confirmationNumber;
          if (row.platformBookingUrl) existing.platformBookingUrl = row.platformBookingUrl;
          if (row.emailScrapeSource)  existing.emailScrapeSource  = row.emailScrapeSource;
          if (row.scrapeConfidence)   existing.scrapeConfidence   = row.scrapeConfidence;
          existing.lastEnrichedAt = row.lastEnrichedAt;
        }
        // ── 3. dataSource promotion ───────────────────────────────────────────
        const existingSource = (existing as any).dataSource as string | undefined;
        const rowSource      = (row as any).dataSource as string | undefined;
        if (existingSource !== rowSource) {
          (existing as any).dataSource = 'both';
        }
        // ── 4. Email dates win; detect iCal/email date mismatches ─────────────
        const emailIn  = (row as any).emailCheckIn  || (existing as any).emailCheckIn;
        const emailOut = (row as any).emailCheckOut || (existing as any).emailCheckOut;
        if (emailIn)  (existing as any).emailCheckIn  = emailIn;
        if (emailOut) (existing as any).emailCheckOut = emailOut;
        if (emailIn && emailOut) {
          const icalIn  = existing.checkIn;
          const icalOut = existing.checkOut;
          const inDiff  = Math.abs(emailIn  - icalIn);
          const outDiff = Math.abs(emailOut - icalOut);
          if (inDiff > MS_PER_DAY_MERGE || outDiff > MS_PER_DAY_MERGE) {
            // Email dates win — update canonical dates
            existing.checkIn  = emailIn;
            existing.checkOut = emailOut;
            dateMismatchNotifs.push({ bookingId: existing.id, icalIn, icalOut, emailIn, emailOut });
          }
        }
        // ── 5. Expand date range (iCal-only fallback) ─────────────────────────
        if (!(emailIn && emailOut)) {
          existing.checkIn  = Math.min(existing.checkIn, row.checkIn);
          existing.checkOut = Math.max(existing.checkOut, row.checkOut);
        }
        if (row.hasConflict) existing.hasConflict = true;
        absorbed = true;
        break;
      }
    }
    if (!absorbed) merged.push({ ...row });
  }

  // Fire date-mismatch notifications asynchronously (do not block the query)
  // PERF: Batch into one notification with configurable cooldown to prevent flooding
  if (dateMismatchNotifs.length > 0) {
    // PERSISTENT DB-based cooldown that survives serverless cold starts
    let shouldSendMismatch = false;
    const now = Date.now();
    try {
      const [setting] = await db.select().from(notificationSettings).where(eq(notificationSettings.key, 'date_mismatch')).limit(1);
      if (setting) {
        if (!setting.enabled) { shouldSendMismatch = false; }
        else {
          const cooldownMs = setting.cooldownHours * 60 * 60 * 1000;
          const lastNotifiedAt = setting.lastNotifiedAt ?? 0;
          if (now - lastNotifiedAt > cooldownMs) {
            shouldSendMismatch = true;
            await db.update(notificationSettings).set({ lastNotifiedAt: now }).where(eq(notificationSettings.key, 'date_mismatch'));
          }
        }
      } else {
        // No row yet — create one and allow first notification
        shouldSendMismatch = true;
        await db.insert(notificationSettings).values({
          key: 'date_mismatch',
          label: 'Date Mismatch',
          description: 'Notifications when iCal and email booking dates differ',
          cooldownHours: 6,
          enabled: true,
          householdId: 'system',
          lastNotifiedAt: now,
        }).onDuplicateKeyUpdate({ set: { lastNotifiedAt: now } });
      }
    } catch { /* suppress on error */ }
    if (shouldSendMismatch) {
      import('./_core/notification.js').then(({ notifyOwner }) => {
        const fmt = (ts: number) => new Date(ts).toISOString().slice(0, 10);
        const lines = dateMismatchNotifs.map(n =>
          `• ${n.bookingId}: iCal ${fmt(n.icalIn)}–${fmt(n.icalOut)} vs email ${fmt(n.emailIn)}–${fmt(n.emailOut)}`
        );
        notifyOwner({
          title: `Booking date mismatch detected (${dateMismatchNotifs.length})`,
          content: `The following bookings have iCal/email date discrepancies (email dates applied as canonical):\n\n${lines.join('\n')}\n\nPlease verify the iCal feeds for potential date bugs.`,
        }).catch(() => {});
      }).catch(() => {});
    }
  }

  // 4. Fetch prep rules
  const prepRuleRows = await db
    .select()
    .from(propertyPrepRules)
    .where(eq(propertyPrepRules.propertyId, propertyId))
    .limit(1);
  const prepRule = prepRuleRows[0] || null;

  // 5. Build composite entries
  const entries: CompositeBookingEntry[] = [];

  for (const row of merged) {
    const platformInfo = platformMap.get(row.platformId);
    // platformKey: normalised lowercase key used for colour lookup in the UI
    const platformKey   = platformInfo?.platform || "other";
    // platformLabel: human-readable short name shown in tooltips and upcoming list
    // Use canonical short names — NOT the full displayName (which includes property name prefix)
    const PLATFORM_SHORT: Record<string, string> = {
      airbnb: "Airbnb",
      vrbo: "VRBO",
      booking_com: "Booking.com",
      direct: "Direct",
      zillow: "Zillow",
      apartments_com: "Apartments.com",
      other: "Other",
    };
    const platformLabel = PLATFORM_SHORT[platformKey] || platformInfo?.displayName || platformKey;
    const checkInDate  = new Date(row.checkIn);
    const checkOutDate = new Date(row.checkOut);
    const checkInDateStr  = `${checkInDate.getUTCFullYear()}-${String(checkInDate.getUTCMonth()+1).padStart(2,"0")}-${String(checkInDate.getUTCDate()).padStart(2,"0")}`;
    const checkOutDateStr = `${checkOutDate.getUTCFullYear()}-${String(checkOutDate.getUTCMonth()+1).padStart(2,"0")}-${String(checkOutDate.getUTCDate()).padStart(2,"0")}`;

    if (row.bookingType === "booking") {
      // Build a human-readable summary.
      // Airbnb iCal exports use "Reserved" (no guest name) — show a friendlier label.
      // VRBO exports use "Reserved - <Name>" — keep as-is.
      // Booking.com uses "Booking.com Reservation" — shorten it.
      const rawSummary = row.summary || "";
      let displaySummary: string;
      if (row.guestName) {
        // Manual override takes priority
        displaySummary = row.guestName;
      } else if (rawSummary.toLowerCase() === "reserved" && platformKey === "airbnb") {
        displaySummary = "Airbnb Guest";
      } else if (rawSummary.toLowerCase().startsWith("booking.com reservation")) {
        displaySummary = "Booking.com Guest";
      } else if (rawSummary.toLowerCase().startsWith("reserved - ")) {
        // VRBO: "Reserved - Name" → extract the name
        displaySummary = rawSummary.slice("reserved - ".length).trim() || "Guest";
      } else {
        displaySummary = rawSummary || "Guest";
      }

      // Shared enrichment fields extracted from the raw booking row
      const enrichment = {
        guestEmail: row.guestEmail ?? null,
        guestPhone: row.guestPhone ?? null,
        guestCount: row.guestCount ?? null,
        totalPrice: row.totalPrice ? parseFloat(row.totalPrice as any) : null,
        cleaningFee: row.cleaningFee ? parseFloat(row.cleaningFee as any) : null,
        commissionAmount: row.commissionAmount ? parseFloat(row.commissionAmount as any) : null,
        netAmount: row.netAmount ? parseFloat(row.netAmount as any) : null,
        currency: row.currency ?? null,
        confirmationNumber: row.confirmationNumber ?? null,
        platformBookingUrl: row.platformBookingUrl ?? null,
        emailScrapeSource: row.emailScrapeSource ?? null,
        scrapeConfidence: row.scrapeConfidence ?? null,
        lastEnrichedAt: row.lastEnrichedAt ? new Date(row.lastEnrichedAt as any) : null,
      };

      // Check-in marker
      entries.push({
        key: `${row.id}-checkin`,
        type: "checkin",
        date: checkInDateStr,
        summary: displaySummary,
        platform: platformKey,
        platformDisplay: platformLabel,
        checkIn: row.checkIn,
        checkOut: row.checkOut,
        hasConflict: row.hasConflict ?? false,
        id: row.id,
        guestName: row.guestName || undefined,
        ...enrichment,
      });
      // Check-out marker
      // IMPORTANT: sortTs uses checkOut (not checkIn) so checkout entries sort and filter by their actual date
      entries.push({
        key: `${row.id}-checkout`,
        type: "checkout",
        date: checkOutDateStr,
        summary: displaySummary,
        platform: platformKey,
        platformDisplay: platformLabel,
        checkIn: row.checkIn,
        checkOut: row.checkOut,
        sortTs: row.checkOut,  // used for filtering and sorting in getUpcomingEvents
        hasConflict: row.hasConflict ?? false,
        id: row.id,
        guestName: row.guestName || undefined,
        ...enrichment,
      });

      // Prep days before check-in
      // Rule: skip a prep day if it falls inside another booking/block/unavailable period
      if (prepRule && prepRule.blockDaysBefore > 0) {
        for (let d = prepRule.blockDaysBefore; d >= 1; d--) {
          const prepTs = row.checkIn - d * MS_PER_DAY;
          const prepDayEnd = prepTs + MS_PER_DAY;
          // Check if this prep day overlaps with any other merged booking
          const occupied = merged.some(other =>
            other.id !== row.id &&
            other.checkIn < prepDayEnd &&
            other.checkOut > prepTs
          );
          if (occupied) continue; // booking/block already covers this day — skip prep marker
          const prepDate = new Date(prepTs);
          const prepDateStr = `${prepDate.getUTCFullYear()}-${String(prepDate.getUTCMonth()+1).padStart(2,"0")}-${String(prepDate.getUTCDate()).padStart(2,"0")}`;
          entries.push({
            key: `${row.id}-prep-before-${d}`,
            type: "prep",
            date: prepDateStr,
            summary: `Prep day (${d}d before check-in)`,
            platform: "prep",
            platformDisplay: "Prep",
            checkIn: prepTs,
            checkOut: prepTs + MS_PER_DAY,
          });
        }
      }
      // Prep days after check-out
      // Rule: skip a prep day if it falls inside another booking/block/unavailable period
      if (prepRule && prepRule.blockDaysAfter > 0) {
        for (let d = 0; d < prepRule.blockDaysAfter; d++) {
          const prepTs = row.checkOut + d * MS_PER_DAY;
          const prepDayEnd = prepTs + MS_PER_DAY;
          // Check if this prep day overlaps with any other merged booking
          const occupied = merged.some(other =>
            other.id !== row.id &&
            other.checkIn < prepDayEnd &&
            other.checkOut > prepTs
          );
          if (occupied) continue; // booking/block already covers this day — skip prep marker
          const prepDate = new Date(prepTs);
          const prepDateStr = `${prepDate.getUTCFullYear()}-${String(prepDate.getUTCMonth()+1).padStart(2,"0")}-${String(prepDate.getUTCDate()).padStart(2,"0")}`;
          entries.push({
            key: `${row.id}-prep-after-${d}`,
            type: "prep",
            date: prepDateStr,
            summary: `Prep day (${d+1}d after check-out)`,
            platform: "prep",
            platformDisplay: "Prep",
            checkIn: prepTs,
            checkOut: prepTs + MS_PER_DAY,
          });
        }
      }
    } else {
      // block / unavailable
      // Airbnb iCal exports unavailable periods as "Airbnb (Not available)" — shorten to "Blocked"
      const blockSummary = (() => {
        const s = row.summary || "";
        if (s.toLowerCase().includes("not available") || s.toLowerCase() === "airbnb (not available)") return "Blocked";
        if (s.toLowerCase().startsWith("airbnb")) return "Airbnb Block";
        return s || (row.bookingType === "block" ? "Owner block" : "Unavailable");
      })();
      entries.push({
        key: `${row.id}-block`,
        type: row.bookingType === "block" ? "block" : "unavailable",
        date: checkInDateStr,
        summary: blockSummary,
        platform: platformKey,
        platformDisplay: platformLabel,
        checkIn: row.checkIn,
        checkOut: row.checkOut,
        hasConflict: row.hasConflict ?? false,
      });
    }
  }

  // 6. Detect back-to-back: booking A checkout == booking B check-in (same day, different bookings)
  // A same-day checkout/check-in is safe (not a conflict) but should show the ↔ symbol
  const bookingRows = merged.filter(r => r.bookingType === "booking");
  for (const a of bookingRows) {
    for (const b of bookingRows) {
      if (a.id === b.id) continue;
      // checkOut of A == checkIn of B (same UTC day)
      const aOutDate = new Date(a.checkOut);
      const bInDate  = new Date(b.checkIn);
      const aOutDay = `${aOutDate.getUTCFullYear()}-${String(aOutDate.getUTCMonth()+1).padStart(2,"0")}-${String(aOutDate.getUTCDate()).padStart(2,"0")}`;
      const bInDay  = `${bInDate.getUTCFullYear()}-${String(bInDate.getUTCMonth()+1).padStart(2,"0")}-${String(bInDate.getUTCDate()).padStart(2,"0")}`;
      if (aOutDay === bInDay) {
        const alreadyAdded = entries.some(e => e.type === "back_to_back" && e.date === aOutDay);
        if (!alreadyAdded) {
          const platA = platformMap.get(a.platformId);
          const platB = platformMap.get(b.platformId);
          entries.push({
            key: `b2b-${a.id}-${b.id}`,
            type: "back_to_back",
            date: aOutDay,
            summary: `Back-to-back: ${platA?.displayName || platA?.platform || "guest"} out / ${platB?.displayName || platB?.platform || "guest"} in`,
            platform: "back_to_back",
            platformDisplay: "Back-to-back",
            checkIn: a.checkOut,
            checkOut: b.checkIn + MS_PER_DAY,
          });
        }
      }
    }
  }

  // Sort by checkIn
  entries.sort((a, b) => a.checkIn - b.checkIn);
  return entries;
}

// ─── Shadow Overrides ────────────────────────────────────────────────────────

export async function getShadowOverridesForEvent(eventId: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(shadowOverrides).where(eq(shadowOverrides.eventId, eventId));
}

export async function setShadowOverride(
  eventId: string,
  calendarId: string,
  action: "include" | "exclude" | null,
) {
  const db = await getDb();
  if (!db) return;
  if (action === null) {
    await db
      .delete(shadowOverrides)
      .where(and(eq(shadowOverrides.eventId, eventId), eq(shadowOverrides.calendarId, calendarId)));
  } else {
    const existing = await db
      .select()
      .from(shadowOverrides)
      .where(and(eq(shadowOverrides.eventId, eventId), eq(shadowOverrides.calendarId, calendarId)));
    if (existing.length > 0) {
      await db
        .update(shadowOverrides)
        .set({ action })
        .where(and(eq(shadowOverrides.eventId, eventId), eq(shadowOverrides.calendarId, calendarId)));
    } else {
      await db.insert(shadowOverrides).values({ id: nanoid(), eventId, calendarId, action });
    }
  }
}



// ─── Property Bookings for Calendar Injection ────────────────────────────────
/**
 * Returns all property bookings for all properties in a household within a
 * time window. Used to inject bookings as all-day events on the main calendar.
 */
export async function getPropertyBookingsForHousehold(
  householdId: string,
  fromTs: number,
  toTs: number,
) {
  const db = await getDb();
  if (!db) return [];
  const rawRows = await db
    .select({
      id: propertyBookings.id,
      propertyId: propertyBookings.propertyId,
      platformId: propertyBookings.platformId,
      bookingType: propertyBookings.bookingType,
      summary: propertyBookings.summary,
      checkIn: propertyBookings.checkIn,
      checkOut: propertyBookings.checkOut,
      hasConflict: propertyBookings.hasConflict,
      propertyName: properties.name,
      propertyCalendarId: properties.calendarId,
      dataSource: propertyBookings.dataSource,
      guestName: propertyBookings.guestName,
    })
    .from(propertyBookings)
    .innerJoin(properties, eq(propertyBookings.propertyId, properties.id))
    .where(
      and(
        eq(properties.householdId, householdId),
        eq(propertyBookings.bookingStatus, "confirmed"),
        sql`${propertyBookings.checkOut} >= ${fromTs}`,
        sql`${propertyBookings.checkIn} <= ${toTs}`,
      )
    )
    .orderBy(propertyBookings.checkIn);

  // P-38: Deduplicate bookings that represent the same stay
  // (e.g. iCal generic "Booking.com Reservation" + email-scraped guest name)
  const MS_PER_DAY = 86_400_000;
  const merged: typeof rawRows = [];
  for (const row of rawRows) {
    let absorbed = false;
    for (const existing of merged) {
      // Must be same property
      if (row.propertyId !== existing.propertyId) continue;
      // Check date overlap
      const overlapStart = Math.max(row.checkIn, existing.checkIn);
      const overlapEnd = Math.min(row.checkOut, existing.checkOut);
      const overlapMs = Math.max(0, overlapEnd - overlapStart);
      const shorterSpan = Math.min(row.checkOut - row.checkIn, existing.checkOut - existing.checkIn);
      // Same platform + near-exact dates → always merge
      const samePlatform = row.platformId && existing.platformId && row.platformId === existing.platformId;
      const nearExactDates = Math.abs(row.checkIn - existing.checkIn) <= MS_PER_DAY &&
                             Math.abs(row.checkOut - existing.checkOut) <= MS_PER_DAY;
      const highOverlap = shorterSpan > 0 && overlapMs / shorterSpan > 0.8;
      const shouldMerge = (samePlatform && (highOverlap || nearExactDates)) ||
                          (shorterSpan > 0 && overlapMs / shorterSpan > 0.5 && nearExactDates);
      if (shouldMerge) {
        // Keep the richer record (prefer one with guest name or summary)
        if (row.guestName && !existing.guestName) existing.guestName = row.guestName;
        if (row.summary && (!existing.summary || existing.summary.includes('Reservation') || existing.summary === 'Reserved')) {
          existing.summary = row.summary;
        }
        if (row.hasConflict) existing.hasConflict = true;
        // Expand date range to cover both
        existing.checkIn = Math.min(existing.checkIn, row.checkIn);
        existing.checkOut = Math.max(existing.checkOut, row.checkOut);
        absorbed = true;
        break;
      }
    }
    if (!absorbed) merged.push({ ...row });
  }
  return merged;
}

// ─── Audit Log ────────────────────────────────────────────────────────────────

export async function writeAuditLog(entry: Omit<InsertAuditLog, "id" | "createdAt">): Promise<void> {
  const db = await getDb();
  if (!db) return; // non-blocking — audit failure must never break the request
  try {
    await db.insert(auditLog).values(entry);
  } catch (err) {
    console.error("[AuditLog] Failed to write audit entry:", err);
  }
}

export async function getAuditLog(opts: {
  householdId?: string;
  actorUserId?: number;
  actorType?: string;
  category?: string;
  action?: string;
  verticalId?: string;
  resourceType?: string;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (opts.householdId) conditions.push(eq(auditLog.householdId, opts.householdId));
  if (opts.actorUserId) conditions.push(eq(auditLog.actorUserId, opts.actorUserId));
  if (opts.actorType) conditions.push(eq(auditLog.actorType, opts.actorType as "user" | "system" | "geeves_ai" | "scheduled_job"));
  if (opts.category) conditions.push(eq(auditLog.category, opts.category));
  if (opts.action) conditions.push(eq(auditLog.action, opts.action));
  if (opts.verticalId) conditions.push(eq(auditLog.verticalId, opts.verticalId));
  if (opts.resourceType) conditions.push(eq(auditLog.resourceType, opts.resourceType));
  const query = db
    .select()
    .from(auditLog)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(auditLog.createdAt))
    .limit(opts.limit ?? 100)
    .offset(opts.offset ?? 0);
  return query;
}

export async function countAuditLog(opts: { householdId?: string; category?: string }): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const conditions = [];
  if (opts.householdId) conditions.push(eq(auditLog.householdId, opts.householdId));
  if (opts.category) conditions.push(eq(auditLog.category, opts.category));
  const result = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(auditLog)
    .where(conditions.length > 0 ? and(...conditions) : undefined);
  return result[0]?.count ?? 0;
}

// ─── Project Knowledge ────────────────────────────────────────────────────────

export async function getAllKnowledge(opts?: {
  category?: string;
  search?: string;
  includeDeprecated?: boolean;
}) {
  const db = await getDb();
  if (!db) return [];
  const conditions: ReturnType<typeof eq>[] = [];
  if (opts?.category) {
    conditions.push(eq(projectKnowledge.category, opts.category));
  }
  if (opts?.includeDeprecated === false) {
    const { not, like } = await import("drizzle-orm");
    conditions.push(not(like(projectKnowledge.category, "%deprecated%")));
  }
  const rows = await db
    .select()
    .from(projectKnowledge)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(projectKnowledge.category, projectKnowledge.key);
  if (opts?.search) {
    const term = opts.search.toLowerCase();
    return rows.filter(
      (r) =>
        r.key.toLowerCase().includes(term) ||
        r.value.toLowerCase().includes(term) ||
        (r.category ?? "").toLowerCase().includes(term) ||
        (r.sourceDoc ?? "").toLowerCase().includes(term)
    );
  }
  return rows;
}

export async function upsertKnowledge(data: InsertProjectKnowledge) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(projectKnowledge).values(data).onDuplicateKeyUpdate({
    set: { value: data.value, notes: data.notes, sourceDoc: data.sourceDoc, updatedAt: new Date() },
  });
}

export async function deleteKnowledge(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(projectKnowledge).where(eq(projectKnowledge.id, id));
}

export async function bulkDeleteKnowledge(ids: number[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { inArray } = await import("drizzle-orm");
  await db.delete(projectKnowledge).where(inArray(projectKnowledge.id, ids));
  return { deleted: ids.length };
}

export async function markKnowledgeDeprecated(id: number, reason?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db.select().from(projectKnowledge).where(eq(projectKnowledge.id, id)).limit(1);
  if (!existing.length) throw new Error("Knowledge entry not found");
  const entry = existing[0];
  const deprecationNote = reason
    ? `⚠️ DEPRECATED (${new Date().toISOString().slice(0, 10)}): ${reason}`
    : `⚠️ DEPRECATED (${new Date().toISOString().slice(0, 10)})`;
  await db.update(projectKnowledge).set({
    category: entry.category?.startsWith("deprecated") ? entry.category : `deprecated_${entry.category}`,
    notes: deprecationNote,
    updatedAt: new Date(),
  }).where(eq(projectKnowledge.id, id));
  return { ok: true };
}

export async function getKnowledgeCategories() {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({ category: projectKnowledge.category, count: sql<number>`COUNT(*)` })
    .from(projectKnowledge)
    .groupBy(projectKnowledge.category)
    .orderBy(projectKnowledge.category);
  return rows;
}

// ─── Project Tasks ────────────────────────────────────────────────────────────

export async function getProjectTasks(opts?: {
  status?: string;
  area?: string;
  phase?: string;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (opts?.status) conditions.push(eq(projectTasks.status, opts.status as any));
  if (opts?.area) conditions.push(eq(projectTasks.area, opts.area));
  if (opts?.phase) conditions.push(eq(projectTasks.phase, opts.phase));
  return db
    .select()
    .from(projectTasks)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(projectTasks.area, projectTasks.title)
    .limit(opts?.limit ?? 500)
    .offset(opts?.offset ?? 0);
}

export async function getProjectTaskStats() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      area: projectTasks.area,
      status: projectTasks.status,
      count: sql<number>`COUNT(*)`,
    })
    .from(projectTasks)
    .groupBy(projectTasks.area, projectTasks.status)
    .orderBy(projectTasks.area);
}

export async function updateProjectTaskStatus(id: number, status: "todo" | "in_progress" | "done" | "deferred" | "blocked", notes?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const completedAt = status === "done" ? new Date() : null;
  await db
    .update(projectTasks)
    .set({ status, completedAt, notes: notes ?? undefined, updatedAt: new Date() })
    .where(eq(projectTasks.id, id));
}

export async function createProjectTask(data: InsertProjectTask) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(projectTasks).values(data);
  return { id: result[0].insertId };
}

export async function deleteProjectTask(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(projectTasks).where(eq(projectTasks.id, id));
}

// ─── Vertical Member Access ───────────────────────────────────────────────────

export async function getVerticalMemberAccess(opts: {
  householdId: string;
  memberId?: string;
  verticalId?: string;
}) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(verticalMemberAccess.householdId, opts.householdId)];
  if (opts.memberId) conditions.push(eq(verticalMemberAccess.memberId, opts.memberId));
  if (opts.verticalId) conditions.push(eq(verticalMemberAccess.verticalId, opts.verticalId));
  return db.select().from(verticalMemberAccess).where(and(...conditions));
}

export async function upsertVerticalMemberAccess(data: InsertVerticalMemberAccess) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(verticalMemberAccess).values(data).onDuplicateKeyUpdate({
    set: {
      accessLevel: data.accessLevel,
      calendarAccess: data.calendarAccess,
      allowedCalendarIds: data.allowedCalendarIds,
      canRequestMeetings: data.canRequestMeetings,
      excludeMultiDayEvents: data.excludeMultiDayEvents ?? false,
      configuredByMemberId: data.configuredByMemberId,
      updatedAt: new Date(),
    },
  });
}

export async function deleteVerticalMemberAccess(memberId: string, verticalId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(verticalMemberAccess).where(
    and(eq(verticalMemberAccess.memberId, memberId), eq(verticalMemberAccess.verticalId, verticalId))
  );
}

// ─── Vertical Data Policies ───────────────────────────────────────────────────

export async function getVerticalDataPolicies(opts: {
  householdId: string;
  verticalId?: string;
}) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(verticalDataPolicies.householdId, opts.householdId)];
  if (opts.verticalId) conditions.push(eq(verticalDataPolicies.verticalId, opts.verticalId));
  return db.select().from(verticalDataPolicies).where(and(...conditions));
}

export async function upsertVerticalDataPolicy(data: InsertVerticalDataPolicy) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(verticalDataPolicies).values(data).onDuplicateKeyUpdate({
    set: {
      hiddenFromRoles: data.hiddenFromRoles,
      hiddenFromMemberIds: data.hiddenFromMemberIds,
      configuredByMemberId: data.configuredByMemberId,
      updatedAt: new Date(),
    },
  });
}

export async function deleteVerticalDataPolicy(verticalId: string, dataCategory: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(verticalDataPolicies).where(
    and(
      eq(verticalDataPolicies.verticalId, verticalId),
      eq(verticalDataPolicies.dataCategory, dataCategory as any)
    )
  );
}

/**
 * Check if a member is restricted from seeing a specific data category in a vertical.
 * Returns true if the member should NOT see the data.
 */
export async function isMemberRestrictedFromDataCategory(opts: {
  memberId: string;
  verticalId: string;
  memberRole: string;
  /** Any data category string — see DataCategory in dataClassification.ts */
  dataCategory: string;
}): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const policies = await db
    .select()
    .from(verticalDataPolicies)
    .where(
      and(
        eq(verticalDataPolicies.verticalId, opts.verticalId),
        eq(verticalDataPolicies.dataCategory, opts.dataCategory as any)
      )
    )
    .limit(1);
  if (!policies.length) return false;
  const policy = policies[0];
  const hiddenRoles = (policy.hiddenFromRoles ?? []) as string[];
  const hiddenMembers = (policy.hiddenFromMemberIds ?? []) as string[];
  return hiddenRoles.includes(opts.memberRole) || hiddenMembers.includes(opts.memberId);
}

/**
 * Get the effective calendar access level for a member in a vertical.
 * Falls back to "default_vertical" if no specific rule exists.
 */
export async function getMemberCalendarAccess(opts: {
  memberId: string;
  verticalId: string;
}): Promise<{
  accessLevel: "full" | "read_only" | "blind" | "none";
  calendarAccess: "availability_only" | "default_vertical" | "blind" | "read_write";
  allowedCalendarIds: string[];
  canRequestMeetings: boolean;
  excludeMultiDayEvents: boolean;
} | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(verticalMemberAccess)
    .where(
      and(
        eq(verticalMemberAccess.memberId, opts.memberId),
        eq(verticalMemberAccess.verticalId, opts.verticalId)
      )
    )
    .limit(1);
  if (!rows.length) return null;
  const row = rows[0];
  return {
    accessLevel: row.accessLevel,
    calendarAccess: row.calendarAccess,
    allowedCalendarIds: (row.allowedCalendarIds ?? []) as string[],
    canRequestMeetings: row.canRequestMeetings,
    excludeMultiDayEvents: row.excludeMultiDayEvents ?? false,
  };
}


// ─── getMemberCalendarAccessBatch ────────────────────────────────────────────
/**
 * Batch version of getMemberCalendarAccess.
 * Returns a Map<verticalId, access rule> for all verticals in the given array.
 * Verticals with no rule are omitted from the map.
 */
export async function getMemberCalendarAccessBatch(
  memberId: string,
  verticalIds: string[]
): Promise<Map<string, {
  accessLevel: "full" | "read_only" | "blind" | "none";
  calendarAccess: "availability_only" | "default_vertical" | "blind" | "read_write";
  allowedCalendarIds: string[];
  canRequestMeetings: boolean;
  excludeMultiDayEvents: boolean;
}>> {
  const result = new Map<string, {
    accessLevel: "full" | "read_only" | "blind" | "none";
    calendarAccess: "availability_only" | "default_vertical" | "blind" | "read_write";
    allowedCalendarIds: string[];
    canRequestMeetings: boolean;
    excludeMultiDayEvents: boolean;
  }>();
  if (!verticalIds.length) return result;
  const db = await getDb();
  if (!db) return result;
  const rows = await db
    .select()
    .from(verticalMemberAccess)
    .where(
      and(
        eq(verticalMemberAccess.memberId, memberId),
        inArray(verticalMemberAccess.verticalId, verticalIds)
      )
    );
  for (const row of rows) {
    result.set(row.verticalId, {
      accessLevel: row.accessLevel,
      calendarAccess: row.calendarAccess,
      allowedCalendarIds: (row.allowedCalendarIds ?? []) as string[],
      canRequestMeetings: row.canRequestMeetings,
      excludeMultiDayEvents: row.excludeMultiDayEvents ?? false,
    });
  }
  return result;
}

// ─── getAllMemberCalendarAccessForHousehold ───────────────────────────────────
/**
 * B2: Load ALL member-vertical access rules for a household in a single query.
 * Used by eventPropagation to avoid N sequential DB round-trips (one per target calendar).
 */
export async function getAllMemberCalendarAccessForHousehold(
  householdId: string
): Promise<Array<{ memberId: string; verticalId: string; excludeMultiDayEvents: boolean }>> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      memberId: verticalMemberAccess.memberId,
      verticalId: verticalMemberAccess.verticalId,
      excludeMultiDayEvents: verticalMemberAccess.excludeMultiDayEvents,
    })
    .from(verticalMemberAccess)
    .where(eq(verticalMemberAccess.householdId, householdId));
  return rows.map(r => ({
    memberId: r.memberId,
    verticalId: r.verticalId,
    excludeMultiDayEvents: r.excludeMultiDayEvents ?? false,
  }));
}

// ─── getWebhookToken ──────────────────────────────────────────────────────────
/**
 * B4: Look up the stored token for a Google Calendar webhook channel.
 * Returns null if no token is stored (token check disabled or channel not found).
 */
export async function getWebhookToken(channelId: string): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.execute(sql`
    SELECT token FROM webhook_tokens WHERE channelId = ${channelId} LIMIT 1
  `);
  const result = (Array.isArray(rows) ? rows[0] : rows) as unknown as any[];
  return result?.[0]?.token ?? null;
}

// ─── Member Resources ─────────────────────────────────────────────────────────

export async function getMemberResources(opts: {
  householdId: string;
  memberId: string;
  verticalId?: string;
  includeInactive?: boolean;
}) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [
    eq(memberResources.householdId, opts.householdId),
    eq(memberResources.memberId, opts.memberId),
  ];
  if (opts.verticalId) conditions.push(eq(memberResources.verticalId, opts.verticalId));
  if (!opts.includeInactive) conditions.push(eq(memberResources.isActive, true));
  return db
    .select()
    .from(memberResources)
    .where(and(...conditions))
    .orderBy(memberResources.sortOrder, memberResources.createdAt);
}

export async function createMemberResource(data: InsertMemberResource) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(memberResources).values(data);
}

export async function updateMemberResource(id: string, data: Partial<InsertMemberResource>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(memberResources).set(data).where(eq(memberResources.id, id));
}

export async function deleteMemberResource(id: string) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(memberResources).where(eq(memberResources.id, id));
}

export async function getMemberResourceById(id: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(memberResources).where(eq(memberResources.id, id)).limit(1);
  return rows[0] ?? null;
}

// ─── Geeves Access ────────────────────────────────────────────────────────────

export async function setMemberGeevesAccess(memberId: string, geevesAccess: boolean) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(householdMembers).set({ geevesAccess }).where(eq(householdMembers.id, memberId));
}

// ─── Analytics ────────────────────────────────────────────────────────────────
/**
 * Returns monthly spending totals for the last N months (default 6).
 * Produces { month: "Jan 25", personal: number, business: number }[]
 */
export async function getMonthlySpendingTrend(userId: number, months = 6) {
  const db = await getDb();
  if (!db) return [];
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months + 1);
  cutoff.setDate(1);
  cutoff.setHours(0, 0, 0, 0);
  const rows = await db.select({
    year: sql<number>`YEAR(${transactions.transactionDate})`,
    month: sql<number>`MONTH(${transactions.transactionDate})`,
    classification: transactions.classification,
    total: sql<string>`CAST(SUM(${transactions.amount}) AS CHAR)`,
  })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.type, "expense"),
        sql`${transactions.transactionDate} >= ${cutoff}`,
      )
    )
    .groupBy(
      sql`YEAR(${transactions.transactionDate})`,
      sql`MONTH(${transactions.transactionDate})`,
      transactions.classification,
    )
    .orderBy(
      sql`YEAR(${transactions.transactionDate})`,
      sql`MONTH(${transactions.transactionDate})`,
    );
  const monthMap = new Map<string, { month: string; personal: number; business: number }>();
  for (const row of rows) {
    const key = `${row.year}-${String(row.month).padStart(2, "0")}`;
    if (!monthMap.has(key)) {
      const d = new Date(row.year, row.month - 1, 1);
      monthMap.set(key, {
        month: d.toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
        personal: 0,
        business: 0,
      });
    }
    const entry = monthMap.get(key)!;
    if (row.classification === "personal") entry.personal = parseFloat(row.total || "0");
    else if (row.classification === "business") entry.business = parseFloat(row.total || "0");
  }
  return Array.from(monthMap.values());
}

/**
 * Returns top N vendors by total spend for the given user.
 */
export async function getTopMerchants(userId: number, limit = 5) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    vendor: transactions.vendor,
    total: sql<string>`CAST(SUM(${transactions.amount}) AS CHAR)`,
    count: sql<number>`COUNT(*)`,
  })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.type, "expense"),
        isNotNull(transactions.vendor),
      )
    )
    .groupBy(transactions.vendor)
    .orderBy(sql`SUM(${transactions.amount}) DESC`)
    .limit(limit);
}


// ─── Widget Layout (Dashboard Personalisation) ───────────────────────────────

export async function getWidgetLayout(memberId: string): Promise<string[] | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(widgetLayouts)
    .where(eq(widgetLayouts.memberId, memberId))
    .limit(1);
  if (!rows.length) return null;
  return rows[0].layout as string[];
}

export async function saveWidgetLayout(
  memberId: string,
  householdId: string,
  layout: string[]
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .insert(widgetLayouts)
    .values({ memberId, householdId, layout })
    .onDuplicateKeyUpdate({ set: { layout, updatedAt: new Date() } });
}

// ─── P-37: OAuth Account Purge ───────────────────────────────────────────────

/**
 * P-37-B: Delete all calendars (and their events, shadow_blocks, webhook_channels)
 * that belong to a given accountEmail for a specific member.
 * Used by purgeOAuthAccount to cascade-clean all calendar data before removing the token.
 */
export async function deleteCalendarsForOAuthAccount(memberId: string, accountEmail: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Find all calendars belonging to this member+accountEmail
  const cals = await db.select({ id: calendars.id })
    .from(calendars)
    .where(and(eq(calendars.memberId, memberId), eq(calendars.accountEmail, accountEmail)));

  for (const cal of cals) {
    // 1. Delete shadow_blocks sourced from this calendar's events
    const calEvents = await db.select({ id: events.id }).from(events).where(eq(events.calendarId, cal.id));
    for (const ev of calEvents) {
      await db.delete(shadowBlocks).where(eq(shadowBlocks.sourceEventId, ev.id));
    }
    // 2. Delete shadow_blocks targeting this calendar
    await db.delete(shadowBlocks).where(eq(shadowBlocks.sourceCalendarId, cal.id));
    await db.delete(shadowBlocks).where(eq(shadowBlocks.targetCalendarId, cal.id));
    // 3. Delete events
    await db.delete(events).where(eq(events.calendarId, cal.id));
    // 4. Delete webhook channels
    await db.delete(webhookChannels).where(eq(webhookChannels.calendarId, cal.id));
    // 5. Delete the calendar itself
    await db.delete(calendars).where(eq(calendars.id, cal.id));
  }

  return cals.length;
}

/**
 * P-37-A: Full purge of an OAuth account — revokes the token AND deletes all linked data.
 * Cascade order: calendars (events + shadow_blocks + webhooks) → scope_consent_preferences → token row.
 * Returns the number of calendars deleted.
 */
export async function purgeOAuthAccount(tokenId: string, memberId: string, accountEmail: string, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // 1. Delete all calendars + cascade
  const calCount = await deleteCalendarsForOAuthAccount(memberId, accountEmail);

  // 2. Delete scope consent preferences for this user (keyed by userId, not accountEmail)
  // Scope consent is per-user, so removing the account means they should re-consent on reconnect
  await db.delete(scopeConsentPreferences).where(eq(scopeConsentPreferences.userId, userId));

  // 3. Hard-delete the token row (not just revoke — account is being fully removed)
  await db.delete(oauthTokens).where(eq(oauthTokens.id, tokenId));

  return { calendarCount: calCount };
}

// ─── Custom Roles (P-40) ─────────────────────────────────────────────────────

export async function getCustomRoles(householdId: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(customRoles)
    .where(eq(customRoles.householdId, householdId))
    .orderBy(customRoles.name);
}

export async function getCustomRoleById(id: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(customRoles).where(eq(customRoles.id, id)).limit(1);
  return result[0];
}

export async function createCustomRole(data: InsertCustomRole) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(customRoles).values(data);
  return data;
}

export async function updateCustomRole(id: string, householdId: string, data: Partial<InsertCustomRole>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(customRoles).set(data).where(and(eq(customRoles.id, id), eq(customRoles.householdId, householdId)));
}

export async function deleteCustomRole(id: string, householdId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(customRoles).where(and(eq(customRoles.id, id), eq(customRoles.householdId, householdId)));
}


// ═══════════════════════════════════════════════════════════════════════
// PROPERTY PHOTOS
// ═══════════════════════════════════════════════════════════════════════

export async function getPropertyPhotos(propertyId: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(propertyPhotos).where(eq(propertyPhotos.propertyId, propertyId)).orderBy(propertyPhotos.sortOrder);
}

export async function addPropertyPhoto(data: InsertPropertyPhoto) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(propertyPhotos).values(data);
  return data;
}

export async function deletePropertyPhoto(id: string, householdId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(propertyPhotos).where(and(eq(propertyPhotos.id, id), eq(propertyPhotos.householdId, householdId)));
}

export async function reorderPropertyPhotos(propertyId: string, photoIds: string[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  for (let i = 0; i < photoIds.length; i++) {
    await db.update(propertyPhotos).set({ sortOrder: i }).where(eq(propertyPhotos.id, photoIds[i]));
  }
}

// ═══════════════════════════════════════════════════════════════════════
// PROPERTY MEMBER ORDER (drag-and-drop)
// ═══════════════════════════════════════════════════════════════════════

export async function getPropertyMemberOrder(memberId: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(propertyMemberOrder).where(eq(propertyMemberOrder.memberId, memberId));
  return rows[0] ?? null;
}

export async function upsertPropertyMemberOrder(memberId: string, householdId: string, order: string[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(propertyMemberOrder).values({ memberId, householdId, propertyOrder: order })
    .onDuplicateKeyUpdate({ set: { propertyOrder: order } });
}

// ═══════════════════════════════════════════════════════════════════════
// BOOKING SCREENSHOTS (Booking.com Pulse/Extranet OCR)
// ═══════════════════════════════════════════════════════════════════════

export async function getBookingScreenshots(bookingId: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(bookingScreenshots).where(eq(bookingScreenshots.bookingId, bookingId)).orderBy(desc(bookingScreenshots.uploadedAt));
}

export async function addBookingScreenshot(data: InsertBookingScreenshot) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(bookingScreenshots).values(data);
  return data;
}

export async function confirmBookingScreenshot(id: string, householdId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(bookingScreenshots).set({ isConfirmed: true }).where(and(eq(bookingScreenshots.id, id), eq(bookingScreenshots.householdId, householdId)));
}

// ═══════════════════════════════════════════════════════════════════════
// PLATFORM EXPORT IMPORTS (CSV/XLS upload tracking)
// ═══════════════════════════════════════════════════════════════════════

export async function createPlatformExportImport(data: InsertPlatformExportImport) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(platformExportImports).values(data);
  return data;
}

export async function updatePlatformExportImport(id: string, data: Partial<InsertPlatformExportImport>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(platformExportImports).set(data).where(eq(platformExportImports.id, id));
}

export async function getPlatformExportImports(householdId: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(platformExportImports).where(eq(platformExportImports.householdId, householdId)).orderBy(desc(platformExportImports.importedAt));
}

// ═══════════════════════════════════════════════════════════════════════
// LTR PAYMENTS (rent, utility fees, deposits)
// ═══════════════════════════════════════════════════════════════════════

export async function getLtrPayments(propertyId: string, fromTs?: number, toTs?: number) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(ltrPayments.propertyId, propertyId)];
  if (fromTs) conditions.push(sql`${ltrPayments.dueDate} >= ${fromTs}`);
  if (toTs) conditions.push(sql`${ltrPayments.dueDate} <= ${toTs}`);
  return db.select().from(ltrPayments).where(and(...conditions)).orderBy(desc(ltrPayments.dueDate));
}

export async function getLtrPaymentsForHousehold(householdId: string, fromTs?: number, toTs?: number) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(ltrPayments.householdId, householdId)];
  if (fromTs) conditions.push(sql`${ltrPayments.dueDate} >= ${fromTs}`);
  if (toTs) conditions.push(sql`${ltrPayments.dueDate} <= ${toTs}`);
  return db.select().from(ltrPayments).where(and(...conditions)).orderBy(desc(ltrPayments.dueDate));
}

export async function addLtrPayment(data: InsertLtrPayment) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(ltrPayments).values(data);
  return data;
}

export async function updateLtrPayment(id: string, householdId: string, data: Partial<InsertLtrPayment>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(ltrPayments).set(data).where(and(eq(ltrPayments.id, id), eq(ltrPayments.householdId, householdId)));
}

// ═══════════════════════════════════════════════════════════════════════
// ENHANCED REVENUE SUMMARY (with tax breakdown)
// ═══════════════════════════════════════════════════════════════════════

export async function getPropertyRevenueSummaryWithTax(propertyId: string, fromTs?: number, toTs?: number) {
  const db = await getDb();
  if (!db) return null;
  const conditions = [
    eq(propertyBookings.propertyId, propertyId),
    eq(propertyBookings.bookingStatus, "confirmed"),
  ];
  if (fromTs) conditions.push(sql`${propertyBookings.checkOut} >= ${fromTs}`);
  if (toTs) conditions.push(sql`${propertyBookings.checkIn} <= ${toTs}`);
  
  const bookings = await db.select().from(propertyBookings).where(and(...conditions)).orderBy(propertyBookings.checkIn);
  const withFin = bookings.filter((b: any) => b.totalPrice || b.netAmount);
  
  const revenue = withFin.reduce((s: number, b: any) => s + parseFloat(b.totalPrice || "0"), 0);
  const commission = withFin.reduce((s: number, b: any) => s + parseFloat(b.commissionAmount || "0"), 0);
  const net = withFin.reduce((s: number, b: any) => s + parseFloat(b.netAmount || "0"), 0);
  const taxRemitted = withFin.reduce((s: number, b: any) => s + parseFloat(b.taxRemittedByPlatform || "0"), 0);
  const taxOwed = withFin.reduce((s: number, b: any) => s + parseFloat(b.taxOwedByHost || "0"), 0);
  const passThroughTax = withFin.reduce((s: number, b: any) => s + parseFloat(b.passThroughTax || "0"), 0);
  
  // Count by financial source
  const sourceBreakdown = {
    platform_export: withFin.filter((b: any) => b.financialSource === "platform_export").length,
    email_scrape: withFin.filter((b: any) => b.financialSource === "email_scrape").length,
    manual: withFin.filter((b: any) => b.financialSource === "manual").length,
    screenshot_ocr: withFin.filter((b: any) => b.financialSource === "screenshot_ocr").length,
    unverified: withFin.filter((b: any) => !b.financialSource).length,
  };
  
  return {
    revenue: Math.round(revenue * 100) / 100,
    commission: Math.round(commission * 100) / 100,
    net: Math.round(net * 100) / 100,
    taxRemittedByPlatform: Math.round(taxRemitted * 100) / 100,
    taxOwedByHost: Math.round(taxOwed * 100) / 100,
    passThroughTax: Math.round(passThroughTax * 100) / 100,
    currency: (withFin[0] as any)?.currency ?? "USD",
    bookingCount: withFin.length,
    taxJurisdiction: (withFin[0] as any)?.taxJurisdiction ?? null,
    sourceBreakdown,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// LTR REVENUE SUMMARY (for widget cards)
// ═══════════════════════════════════════════════════════════════════════

export async function getLtrRevenueSummary(propertyId: string, fromTs?: number, toTs?: number) {
  const db = await getDb();
  if (!db) return null;
  const conditions = [eq(ltrPayments.propertyId, propertyId)];
  if (fromTs) conditions.push(sql`${ltrPayments.dueDate} >= ${fromTs}`);
  if (toTs) conditions.push(sql`${ltrPayments.dueDate} <= ${toTs}`);
  
  const payments = await db.select().from(ltrPayments).where(and(...conditions));
  
  const totalReceived = payments
    .filter((p: any) => p.status === "paid")
    .reduce((s: number, p: any) => s + parseFloat(p.amount || "0"), 0);
  const totalExpected = payments
    .reduce((s: number, p: any) => s + parseFloat(p.expectedAmount || p.amount || "0"), 0);
  const totalOverdue = payments
    .filter((p: any) => p.status === "overdue" || p.status === "pending")
    .reduce((s: number, p: any) => s + parseFloat(p.expectedAmount || p.amount || "0"), 0);
  
  const byType = {
    rent: payments.filter((p: any) => p.paymentType === "rent" || p.type === "rent").reduce((s: number, p: any) => s + parseFloat(p.amount || "0"), 0),
    utility_fee: payments.filter((p: any) => p.paymentType === "utility_fee" || p.type === "utility").reduce((s: number, p: any) => s + parseFloat(p.amount || "0"), 0),
    deposit: payments.filter((p: any) => p.paymentType === "deposit" || p.type === "deposit").reduce((s: number, p: any) => s + parseFloat(p.amount || "0"), 0),
    other: payments.filter((p: any) => p.paymentType === "other" || p.type === "other").reduce((s: number, p: any) => s + parseFloat(p.amount || "0"), 0),
  };
  
  return {
    totalReceived: Math.round(totalReceived * 100) / 100,
    totalExpected: Math.round(totalExpected * 100) / 100,
    totalOverdue: Math.round(totalOverdue * 100) / 100,
    paymentCount: payments.length,
    paidCount: payments.filter((p: any) => p.status === "paid").length,
    overdueCount: payments.filter((p: any) => p.status === "overdue").length,
    byType,
    currency: "USD",
  };
}
