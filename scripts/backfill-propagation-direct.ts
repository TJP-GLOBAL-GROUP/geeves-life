/**
 * Direct propagation backfill — imports the live propagation engine and
 * re-queues every event in the specified household that has no shadow blocks.
 *
 * Run: pnpm tsx scripts/backfill-propagation-direct.ts [householdId]
 * If no householdId is given, uses the OWNER_OPEN_ID to resolve the household.
 */

import "dotenv/config";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { eq, ne, and, notExists } from "drizzle-orm";
import * as schema from "../drizzle/schema";
import { onEventUpserted } from "../server/services/eventPropagation";

const { events, shadowBlocks, calendars, users, householdMembers } = schema;

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
  if (!OWNER_OPEN_ID) {
    console.error("Pass a householdId as argument or set OWNER_OPEN_ID");
    await connection.end();
    process.exit(1);
  }
  const [ownerUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.openId, OWNER_OPEN_ID))
    .limit(1);

  if (!ownerUser) {
    console.error(`No user found for OWNER_OPEN_ID=${OWNER_OPEN_ID}`);
    await connection.end();
    process.exit(1);
  }

  const [ownerMembership] = await db
    .select({ householdId: householdMembers.householdId })
    .from(householdMembers)
    .where(
      and(
        eq(householdMembers.userId, ownerUser.id),
        eq(householdMembers.status, "active")
      )
    )
    .limit(1);

  if (!ownerMembership) {
    console.error("Owner has no active household membership");
    await connection.end();
    process.exit(1);
  }
  householdId = ownerMembership.householdId;
}

console.log(`[Backfill] Target householdId = ${householdId}`);

// ── 2. Get all non-iCal calendars ────────────────────────────────────────────
const allCals = await db
  .select({ id: calendars.id, name: calendars.name })
  .from(calendars)
  .where(
    and(
      eq(calendars.householdId, householdId),
      ne(calendars.provider, "ical")
    )
  );

console.log(`[Backfill] ${allCals.length} non-iCal calendars in household`);

// ── 3. Find all events with NO shadow_blocks ─────────────────────────────────
const eventsToBackfill = await db
  .select({ id: events.id, calendarId: events.calendarId, title: events.title })
  .from(events)
  .where(
    and(
      eq(events.householdId, householdId),
      eq(events.isShadowBlock, false),
      ne(events.status, "cancelled"),
      notExists(
        db.select({ id: shadowBlocks.id })
          .from(shadowBlocks)
          .where(eq(shadowBlocks.sourceEventId, events.id))
      )
    )
  );

console.log(`[Backfill] ${eventsToBackfill.length} events have no shadow blocks — queuing propagation`);

if (eventsToBackfill.length === 0) {
  console.log("[Backfill] Nothing to do — all events already have shadow blocks.");
  await connection.end();
  process.exit(0);
}

// ── 4. Re-propagate in batches of 20 ─────────────────────────────────────────
const BATCH_SIZE = 20;
let processed = 0;
let failed = 0;

for (let i = 0; i < eventsToBackfill.length; i += BATCH_SIZE) {
  const batch = eventsToBackfill.slice(i, i + BATCH_SIZE);
  await Promise.all(
    batch.map(ev =>
      onEventUpserted(ev.id, householdId!).catch(e => {
        console.warn(`[Backfill] Failed for event ${ev.id} ("${ev.title}"): ${e.message}`);
        failed++;
      })
    )
  );
  processed += batch.length;
  console.log(`[Backfill] Progress: ${processed}/${eventsToBackfill.length} (${failed} failed)`);
  // Small delay to avoid overwhelming the DB
  await new Promise(r => setTimeout(r, 250));
}

console.log(`\n[Backfill] ✓ Complete. Processed: ${processed}, Failed: ${failed}`);
await connection.end();
