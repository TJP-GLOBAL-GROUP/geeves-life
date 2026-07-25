import { eq, or, and, sql } from "drizzle-orm";
import { getDb } from "../db";
import { bankAccounts } from "../../drizzle/schema";

/**
 * Card grouping — resolve a card/account number to its CANONICAL bank account.
 *
 * Reissued cards, replacement numbers, and virtual card variants must never spawn
 * duplicate bank_accounts rows. Resolution order:
 *   1. exact lastFourDigits match on an active account
 *   2. match inside cardNumberHistory (prior/replacement/virtual numbers)
 *   3. if the matched row is itself an alias (canonicalAccountId set), follow it
 * Returns the canonical account row, or null if the number is genuinely new.
 */
export async function resolveCanonicalAccountId(userId: number, lastFour: string | null | undefined) {
  if (!lastFour) return null;
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const direct = await db
    .select()
    .from(bankAccounts)
    .where(and(eq(bankAccounts.userId, userId), eq(bankAccounts.lastFourDigits, lastFour)))
    .limit(1);
  if (direct.length) return direct[0].canonicalAccountId ?? direct[0].id;

  const historical = await db
    .select()
    .from(bankAccounts)
    .where(
      and(
        eq(bankAccounts.userId, userId),
        sql`JSON_CONTAINS(${bankAccounts.cardNumberHistory}, JSON_QUOTE(${lastFour}))`
      )
    )
    .limit(1);
  if (historical.length) return historical[0].canonicalAccountId ?? historical[0].id;

  return null;
}

/** Record a replacement/reissued card number on an existing canonical account. */
export async function registerCardNumber(accountId: number, newLastFour: string, retireOld = false) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db.select().from(bankAccounts).where(eq(bankAccounts.id, accountId)).limit(1);
  if (!rows.length) throw new Error(`bank account ${accountId} not found`);
  const acct = rows[0];
  const history = new Set(acct.cardNumberHistory ?? []);
  if (acct.lastFourDigits && acct.lastFourDigits !== newLastFour) history.add(acct.lastFourDigits);
  await db
    .update(bankAccounts)
    .set({
      cardNumberHistory: Array.from(history),
      ...(retireOld ? {} : {}),
      lastFourDigits: newLastFour,
    })
    .where(eq(bankAccounts.id, accountId));
}
