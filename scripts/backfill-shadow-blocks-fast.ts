/**
 * Fast shadow block backfill — DB-only mode.
 *
 * Uses onEventUpserted with skipGoogleWrite=true so it runs at full DB speed
 * without waiting for Google Calendar API round-trips. The Google Calendar sync
 * will catch up automatically via the next webhook poll cycle.
 *
 * Run: pnpm tsx scripts/backfill-shadow-blocks-fast.ts [householdId]
 */

import "dotenv/config";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { eq, and, sql } from "drizzle-orm";
import * as schema from "../drizzle/schema";
import { onEventUpserted } from "../server/services/eventPropagation";

const { events, householdMembers, users, shadowBlocks } = schema;

const DATABASE_URL = process.env.DATABASE_URL!;
const OWNER_OPEN_ID = process.env.OWNER_OPEN_ID!;

if (!DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const connection = await mysql.createConnection(DATABASE_URL);
const db = drizzle(connection, { schema, mode: "default" });

// ── 1. Resolve householdId ────────────────────────────────────────────────────
let householdId = process.argv[2] ?? null;

if (!householdId) {
  const [ownerUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.openId, OWNER_OPEN_ID))
    .limit(1);

  if (!ownerUser) {
    console.error("Owner user not found");
    await connection.end();
    process.exit(1);
  }

  const [membership] = await db
    .select({ householdId: householdMembers.householdId })
    .from(householdMembers)
    .where(
      and(
        eq(householdMembers.userId, ownerUser.id),
        eq(householdMembers.status, "active")
      )
    )
    .limit(1);

  if (!membership) {
    console.error("Owner has no active household membership");
    await connection.end();
    process.exit(1);
  }
  householdId = membership.householdId;
}

console.log(`[FastBackfill] householdId = ${householdId}`);

// ── 2. Find all events with NO shadow_blocks ─────────────────────────────────
const eventsToBackfill = await db
  .select({ id: events.id, title: events.title })
  .from(events)
  .where(
    and(
      eq(events.householdId, householdId),
      eq(events.isShadowBlock, false),
      sql`${events.status} != 'cancelled'`,
      sql`NOT EXISTS (SELECT 1 FROM shadow_blocks sb WHERE sb.sourceEventId = ${events.id})`
    )
  );

console.log(`[FastBackfill] ${eventsToBackfill.length} events need shadow blocks`);

if (eventsToBackfill.length === 0) {
  console.log("[FastBackfill] Nothing to do — all events already have shadow blocks.");
  await connection.end();
  process.exit(0);
}

// ── 3. Process in batches ────────────────────────────────────────────────────
const BATCH_SIZE = 50;
let processed = 0;
let failed = 0;

for (let i = 0; i < eventsToBackfill.length; i += BATCH_SIZE) {
  const batch = eventsToBackfill.slice(i, i + BATCH_SIZE);

  await Promise.all(
    batch.map(async (ev) => {
      try {
        await onEventUpserted(ev.id, householdId!, { skipGoogleWrite: true });
        processed++;
      } catch (err) {
        console.error(`[FastBackfill] ✗ Failed on event ${ev.id} ("${ev.title}"):`, err);
        failed++;
      }
    })
  );

  if ((i + BATCH_SIZE) % 500 === 0 || i + BATCH_SIZE >= eventsToBackfill.length) {
    console.log(
      `[FastBackfill] Progress: ${processed + failed}/${eventsToBackfill.length} ` +
      `(${processed} ok, ${failed} failed)`
    );
  }
}

console.log(`\n[FastBackfill] ✓ Complete.`);
console.log(`  Events processed: ${processed}`);
console.log(`  Failed: ${failed}`);

await connection.end();
