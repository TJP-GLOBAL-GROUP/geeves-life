/**
 * Server-side OAuth nonce store — DB-backed
 *
 * PREVIOUS APPROACH: In-memory Map. This worked in dev but broke on Autoscale
 * (serverless) deployments where the OAuth redirect and callback can hit
 * different instances (each with empty memory), causing every login to fail
 * with "Invalid OAuth state / nonce mismatch."
 *
 * CURRENT APPROACH: MySQL table `oauth_nonces` (nonce PK, expiresAt BIGINT).
 * - registerNonce: INSERT the nonce with a 15-minute TTL
 * - verifyAndConsumeNonce: fetch + DELETE — atomic single-use consumption
 * - Expired nonces are swept lazily on each verify call (no background timer)
 *
 * Safe across any number of Autoscale instances because all reads/writes go
 * to the shared TiDB/MySQL database.
 */

import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { oauthNonces } from "../../drizzle/schema";
import { eq, lt } from "drizzle-orm";

/** TTL for each nonce: 15 minutes */
const NONCE_TTL_MS = 15 * 60 * 1000;

function getDb() {
  const pool = mysql.createPool(process.env.DATABASE_URL!);
  return drizzle(pool);
}

/**
 * Register a nonce. Call this when the login/connect redirect is initiated.
 */
export async function registerNonce(nonce: string): Promise<void> {
  const db = getDb();
  const expiresAt = Date.now() + NONCE_TTL_MS;
  try {
    await db.insert(oauthNonces).values({ nonce, expiresAt });
  } catch {
    // Ignore duplicate key — idempotent
  }
}

/**
 * Verify and consume a nonce. Returns true if the nonce was valid and has
 * been consumed (single-use). Returns false if missing, expired, or already used.
 */
export async function verifyAndConsumeNonce(nonce: string): Promise<boolean> {
  const db = getDb();
  const now = Date.now();

  // Sweep expired nonces lazily (fire-and-forget)
  db.delete(oauthNonces).where(lt(oauthNonces.expiresAt, now)).catch(() => {});

  // Fetch the nonce
  const rows = await db
    .select()
    .from(oauthNonces)
    .where(eq(oauthNonces.nonce, nonce))
    .limit(1);

  if (!rows.length) return false;
  const entry = rows[0];

  // Delete it (single-use consumption)
  await db.delete(oauthNonces).where(eq(oauthNonces.nonce, nonce));

  // Check expiry
  if (entry.expiresAt <= now) return false;

  return true;
}
