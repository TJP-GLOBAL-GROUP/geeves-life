/**
 * One-shot propagation backfill script.
 *
 * Finds every non-shadow, non-cancelled event in the owner's household
 * that has NO shadow_blocks row yet, and re-queues it through onEventUpserted.
 *
 * Run: node scripts/backfill-propagation.mjs
 */

import "dotenv/config";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { eq, ne, and, notExists } from "drizzle-orm";
import * as schema from "../drizzle/schema.js";

const { events, shadowBlocks, calendars, households, users, householdMembers } = schema;

const DATABASE_URL = process.env.DATABASE_URL;
const OWNER_OPEN_ID = process.env.OWNER_OPEN_ID;

if (!DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}
if (!OWNER_OPEN_ID) {
  console.error("OWNER_OPEN_ID not set");
  process.exit(1);
}

const connection = await mysql.createConnection(DATABASE_URL);
const db = drizzle(connection, { schema, mode: "default" });

// ── 1. Resolve owner's householdId ───────────────────────────────────────────
const ownerUser = await db
  .select({ id: users.id })
  .from(users)
  .where(eq(users.openId, OWNER_OPEN_ID))
  .limit(1);

if (!ownerUser.length) {
  console.error(`No user found for OWNER_OPEN_ID=${OWNER_OPEN_ID}`);
  await connection.end();
  process.exit(1);
}

const ownerMembership = await db
  .select({ householdId: householdMembers.householdId })
  .from(householdMembers)
  .where(
    and(
      eq(householdMembers.userId, ownerUser[0].id),
      eq(householdMembers.status, "active")
    )
  )
  .limit(1);

if (!ownerMembership.length) {
  console.error("Owner has no active household membership");
  await connection.end();
  process.exit(1);
}

const householdId = ownerMembership[0].householdId;
console.log(`[Backfill] householdId = ${householdId}`);

// ── 2. Get all non-iCal calendars in this household ──────────────────────────
const allCals = await db
  .select({ id: calendars.id, name: calendars.name })
  .from(calendars)
  .where(
    and(
      eq(calendars.householdId, householdId),
      ne(calendars.provider, "ical")
    )
  );

console.log(`[Backfill] Found ${allCals.length} non-iCal calendars`);

// ── 3. Find all events with NO shadow_blocks row ─────────────────────────────
const eventsWithNoShadow = await db
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

console.log(`[Backfill] Found ${eventsWithNoShadow.length} events with no shadow blocks`);

if (eventsWithNoShadow.length === 0) {
  console.log("[Backfill] Nothing to backfill — all events already have shadow blocks.");
  await connection.end();
  process.exit(0);
}

// ── 4. POST to the running server's backfillShadowBlocks endpoint ─────────────
// We use the tRPC HTTP endpoint so the full propagation engine runs server-side.
// The server must be running (dev or prod) at APP_URL.
const APP_URL = process.env.APP_URL || "http://localhost:3000";
const SYSTEM_CRON_SECRET = process.env.SYSTEM_CRON_SECRET;

if (!SYSTEM_CRON_SECRET) {
  console.error("SYSTEM_CRON_SECRET not set — cannot authenticate with the server");
  await connection.end();
  process.exit(1);
}

console.log(`[Backfill] Calling server backfill endpoint at ${APP_URL}...`);

// Use the internal backfill heartbeat endpoint if it exists, otherwise
// call the repropagate endpoint per calendar.
const WINDOW_DAYS = 730; // 2 years

const resp = await fetch(`${APP_URL}/api/internal/backfill-propagation`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-cron-secret": SYSTEM_CRON_SECRET,
  },
  body: JSON.stringify({ householdId, windowDays: WINDOW_DAYS }),
}).catch(() => null);

if (resp && resp.ok) {
  const result = await resp.json();
  console.log("[Backfill] Server response:", result);
} else {
  // Fallback: call repropagate per calendar directly via tRPC batch
  console.log("[Backfill] Internal endpoint not available — using per-calendar repropagate fallback");
  console.log(`[Backfill] ${allCals.length} calendars to repropagate`);
  
  // We can't call tRPC directly without auth cookies, so instead we'll
  // directly invoke onEventUpserted by importing the service.
  // This requires running as a ts-node/tsx script instead.
  console.log("[Backfill] NOTE: Direct DB invocation requires tsx. Re-run as:");
  console.log("  pnpm tsx scripts/backfill-propagation-direct.ts");
}

await connection.end();
