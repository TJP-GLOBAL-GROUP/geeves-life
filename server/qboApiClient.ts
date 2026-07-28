/**
 * QuickBooks Online API Client
 *
 * Thin wrapper around the QBO v3 API with:
 *   - Rate limiting (500 requests/minute per realm)
 *   - 429 exponential backoff
 *   - Automatic token injection via getValidAccessToken()
 *   - Strongly typed helpers for common entities
 *
 * Base URL: https://quickbooks.api.intuit.com/v3/company/{realmId}
 *
 * All write operations are journaled to qbo_write_audit for rollback support.
 */

import { getValidAccessToken } from "./intuitOAuth";
import { QBO_API_BASE } from "./intuitOAuth";
import * as db from "./db";

// ─── Rate Limiting ────────────────────────────────────────────────────────────

/** Intuit rate limit: 500 requests per minute per realm */
const RATE_LIMIT_PER_MINUTE = 500;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(realmId: string): boolean {
  const now = Date.now();
  const bucket = rateLimitBuckets.get(realmId);
  if (!bucket || now > bucket.resetAt) {
    rateLimitBuckets.set(realmId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (bucket.count >= RATE_LIMIT_PER_MINUTE) return false;
  bucket.count++;
  return true;
}

async function withRateLimit<T>(realmId: string, fn: () => Promise<T>): Promise<T> {
  if (!checkRateLimit(realmId)) {
    const bucket = rateLimitBuckets.get(realmId)!;
    const waitMs = bucket.resetAt - Date.now();
    console.warn(`[QBO API] Rate limit hit for realm ${realmId}, waiting ${waitMs}ms`);
    await new Promise((r) => setTimeout(r, waitMs));
    return withRateLimit(realmId, fn);
  }
  return fn();
}

// ─── Core Request ─────────────────────────────────────────────────────────────

async function qboRequest(
  realmId: string,
  method: string,
  endpoint: string,
  body?: unknown,
  retries = 3
): Promise<any> {
  return withRateLimit(realmId, async () => {
    const accessToken = await getValidAccessToken(realmId);
    const url = `${QBO_API_BASE}/${realmId}${endpoint}`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    };

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (response.status === 429 && retries > 0) {
      const delay = Math.pow(2, 3 - retries) * 1000 + Math.random() * 1000;
      console.warn(`[QBO API] 429 for ${endpoint}, retrying in ${delay}ms (${retries} left)`);
      await new Promise((r) => setTimeout(r, delay));
      return qboRequest(realmId, method, endpoint, body, retries - 1);
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`QBO API ${method} ${endpoint} failed (${response.status}): ${text}`);
    }

    // Some endpoints return 204 No Content
    if (response.status === 204) return null;

    return response.json();
  });
}

// ─── Query ────────────────────────────────────────────────────────────────────

/**
 * Execute a QBO query using QBO's SQL-like query language.
 * Example: query(realmId, "SELECT * FROM Account MAXRESULTS 1000")
 */
export async function query(realmId: string, queryStr: string): Promise<any> {
  const encoded = encodeURIComponent(queryStr);
  const result = await qboRequest(realmId, "GET", `/query?query=${encoded}`);
  return result?.QueryResponse || result;
}

/**
 * Get a single entity by ID.
 */
export async function getEntity(realmId: string, entityType: string, id: string): Promise<any> {
  return qboRequest(realmId, "GET", `/${entityType.toLowerCase()}/${id}`);
}

/**
 * Create an entity.
 */
export async function createEntity(realmId: string, entityType: string, data: any): Promise<any> {
  const result = await qboRequest(realmId, "POST", `/${entityType.toLowerCase()}`, data);
  // Journal the write
  await journalWrite(realmId, "create", entityType, result?.Id || "unknown", data);
  return result;
}

/**
 * Update an entity.
 */
export async function updateEntity(realmId: string, entityType: string, id: string, data: any): Promise<any> {
  const result = await qboRequest(realmId, "POST", `/${entityType.toLowerCase()}?operation=update`, { ...data, Id: id });
  await journalWrite(realmId, "update", entityType, id, data);
  return result;
}

// ─── Chart of Accounts ────────────────────────────────────────────────────────

/**
 * Pull the full Chart of Accounts from QBO.
 * Returns all active accounts with their metadata.
 */
export async function getChartOfAccounts(realmId: string): Promise<QBOAccount[]> {
  const result = await query(realmId, "SELECT * FROM Account MAXRESULTS 1000");
  const accounts = result?.Account || [];
  return accounts.map((a: any) => ({
    id: a.Id,
    name: a.Name,
    fullyQualifiedName: a.FullyQualifiedName,
    accountType: a.AccountType,
    accountSubType: a.AccountSubType,
    classification: a.Classification,
    active: a.active !== false,
    currentBalance: a.CurrentBalance || 0,
    currentBalanceWithSubAccounts: a.CurrentBalanceWithSubAccounts || 0,
    currencyRef: a.CurrencyRef?.value || "USD",
    parentRef: a.ParentRef?.value || null,
    description: a.Description || null,
    metadata: a.MetaData,
  }));
}

/**
 * Sync Chart of Accounts into the local qbo_accounts table.
 * Called after OAuth connection and periodically.
 */
export async function syncChartOfAccounts(realmId: string): Promise<{ inserted: number; updated: number }> {
  const accounts = await getChartOfAccounts(realmId);
  const dbInstance = await db.getDb();
  if (!dbInstance) throw new Error("Database not available");

  const { qboAccounts } = await import("./drizzle/schema");
  const { eq, and } = await import("drizzle-orm");
  let inserted = 0;
  let updated = 0;

  for (const account of accounts) {
    const existing = await dbInstance
      .select()
      .from(qboAccounts)
      .where(and(eq(qboAccounts.realmId, realmId), eq(qboAccounts.qboAccountId, account.id)))
      .limit(1);

    const row = {
      realmId,
      qboAccountId: account.id,
      name: account.name,
      fullyQualifiedName: account.fullyQualifiedName,
      accountType: account.accountType,
      accountSubType: account.accountSubType,
      classification: account.classification,
      active: account.active,
      currentBalance: String(account.currentBalance),
      currencyRef: account.currencyRef,
      parentRef: account.parentRef,
      description: account.description,
      lastSyncedAt: new Date(),
      updatedAt: new Date(),
    };

    if (existing.length > 0) {
      await dbInstance.update(qboAccounts).set(row).where(eq(qboAccounts.id, existing[0].id));
      updated++;
    } else {
      await dbInstance.insert(qboAccounts).values({ ...row, createdAt: new Date() });
      inserted++;
    }
  }

  console.log(`[QBO CoA Sync] Realm ${realmId}: ${inserted} inserted, ${updated} updated`);
  return { inserted, updated };
}

// ─── Classes ──────────────────────────────────────────────────────────────────

/**
 * Pull QBO Classes (used for vertical tracking).
 */
export async function getClasses(realmId: string): Promise<QBOClass[]> {
  const result = await query(realmId, "SELECT * FROM Class MAXRESULTS 1000");
  return (result?.Class || []).map((c: any) => ({
    id: c.Id,
    name: c.Name,
    fullyQualifiedName: c.FullyQualifiedName,
    active: c.Active !== false,
    parentRef: c.ParentRef?.value || null,
    subClass: c.SubClass || false,
  }));
}

// ─── Customers ────────────────────────────────────────────────────────────────

export async function getCustomers(realmId: string, limit = 1000): Promise<QBOCustomer[]> {
  const result = await query(realmId, `SELECT * FROM Customer MAXRESULTS ${limit}`);
  return (result?.Customer || []).map((c: any) => ({
    id: c.Id,
    displayName: c.DisplayName,
    fullyQualifiedName: c.FullyQualifiedName,
    active: c.Active !== false,
    balance: c.Balance || 0,
    preferredDeliveryMethod: c.PreferredDeliveryMethod,
  }));
}

// ─── Vendors ──────────────────────────────────────────────────────────────────

export async function getVendors(realmId: string, limit = 1000): Promise<QBOVendor[]> {
  const result = await query(realmId, `SELECT * FROM Vendor MAXRESULTS ${limit}`);
  return (result?.Vendor || []).map((v: any) => ({
    id: v.Id,
    displayName: v.DisplayName,
    fullyQualifiedName: v.FullyQualifiedName,
    active: v.Active !== false,
    balance: v.Balance || 0,
  }));
}

// ─── Reports ──────────────────────────────────────────────────────────────────

export async function getProfitAndLoss(realmId: string, startDate: string, endDate: string): Promise<any> {
  return qboRequest(realmId, "GET", `/reports/ProfitAndLoss?start_date=${startDate}&end_date=${endDate}`);
}

export async function getBalanceSheet(realmId: string, startDate: string, endDate: string): Promise<any> {
  return qboRequest(realmId, "GET", `/reports/BalanceSheet?start_date=${startDate}&end_date=${endDate}`);
}

// ─── Write Operations ─────────────────────────────────────────────────────────

/**
 * Push an expense (Bill or Purchase) to QBO.
 * Journaled for rollback support.
 */
export async function createPurchase(
  realmId: string,
  data: QBOPurchaseInput
): Promise<any> {
  const body = {
    AccountRef: { value: data.accountRef },
    PaymentType: data.paymentType || "Cash",
    EntityRef: data.entityRef ? { value: data.entityRef.value, type: data.entityRef.type } : undefined,
    Line: data.lines.map((line) => ({
      Amount: line.amount,
      DetailType: "AccountBasedExpenseLineDetail",
      AccountBasedExpenseLineDetail: {
        AccountRef: { value: line.accountRef },
        ClassRef: line.classRef ? { value: line.classRef } : undefined,
        CustomerRef: line.customerRef ? { value: line.customerRef } : undefined,
      },
    })),
    TxnDate: data.txnDate,
    PrivateNote: data.privateNote,
  };
  return createEntity(realmId, "purchase", body);
}

// ─── Write Audit ──────────────────────────────────────────────────────────────

interface QBOWriteAuditEntry {
  realmId: string;
  operation: "create" | "update" | "delete";
  entityType: string;
  entityId: string;
  payload: any;
  status: "pending" | "completed" | "failed" | "rolled_back";
}

async function journalWrite(
  realmId: string,
  operation: "create" | "update" | "delete",
  entityType: string,
  entityId: string,
  payload: any
): Promise<void> {
  try {
    const dbInstance = await db.getDb();
    if (!dbInstance) return;
    const { qboWriteAudit } = await import("./drizzle/schema");
    await dbInstance.insert(qboWriteAudit).values({
      id: crypto.randomUUID(),
      realmId,
      operation,
      entityType,
      entityId,
      payload: JSON.stringify(payload),
      status: "completed",
      createdAt: new Date(),
    });
  } catch (err) {
    console.warn("[QBO Audit] Failed to journal write:", (err as Error)?.message);
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface QBOAccount {
  id: string;
  name: string;
  fullyQualifiedName: string;
  accountType: string;
  accountSubType?: string;
  classification?: string;
  active: boolean;
  currentBalance: number;
  currentBalanceWithSubAccounts?: number;
  currencyRef: string;
  parentRef: string | null;
  description: string | null;
  metadata?: any;
}

export interface QBOClass {
  id: string;
  name: string;
  fullyQualifiedName: string;
  active: boolean;
  parentRef: string | null;
  subClass: boolean;
}

export interface QBOCustomer {
  id: string;
  displayName: string;
  fullyQualifiedName: string;
  active: boolean;
  balance: number;
  preferredDeliveryMethod?: string;
}

export interface QBOVendor {
  id: string;
  displayName: string;
  fullyQualifiedName: string;
  active: boolean;
  balance: number;
}

export interface QBOPurchaseInput {
  accountRef: string;
  paymentType?: string;
  entityRef?: { value: string; type: string };
  lines: Array<{
    amount: number;
    accountRef: string;
    classRef?: string;
    customerRef?: string;
  }>;
  txnDate: string;
  privateNote?: string;
}
