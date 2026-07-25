/**
 * Batch cleanup: delete all "Blocked time (managed by Geeves)" events
 * from the Team StartOut Google Calendar using Google Calendar API batch requests.
 *
 * Google Calendar batch API: up to 50 operations per multipart HTTP request.
 * This is ~50x faster than serial deletes.
 *
 * Usage: node scripts/cleanup-startout-batch.mjs
 */

import { createConnection } from "mysql2/promise";
import { createDecipheriv } from "crypto";
import dotenv from "dotenv";
dotenv.config();

const TEAM_STARTOUT_GOOGLE_CAL_ID =
  "startout.org_a7cm92hjbpfa0eanpk168mf99g@group.calendar.google.com";
const BATCH_SIZE = 50;
const GEEVES_MARKER = "managed by Geeves";

// ── helpers ──────────────────────────────────────────────────────────────────

function decrypt(encrypted) {
  const key = Buffer.from(process.env.ENCRYPTION_KEY || "", "hex");
  const [ivHex, authTagHex, ciphertext] = encrypted.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return (
    decipher.update(ciphertext, "hex", "utf8") + decipher.final("utf8")
  );
}

async function refreshAccessToken(refreshToken) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Token refresh failed: ${JSON.stringify(data)}`);
  return data.access_token;
}

/**
 * Send a multipart batch request to delete up to 50 events at once.
 * Returns { deleted: number, errors: string[] }
 */
async function batchDelete(accessToken, calendarId, eventIds) {
  const boundary = "batch_geeves_cleanup_" + Date.now();
  const parts = eventIds.map(
    (id) =>
      `--${boundary}\r\nContent-Type: application/http\r\nContent-Transfer-Encoding: binary\r\n\r\nDELETE /calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${id} HTTP/1.1\r\n\r\n`
  );
  const body = parts.join("") + `--${boundary}--`;

  const res = await fetch("https://www.googleapis.com/batch/calendar/v3", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/mixed; boundary=${boundary}`,
    },
    body,
  });

  const text = await res.text();
  // Parse multipart response — count 204 No Content responses
  const deleted = (text.match(/HTTP\/1\.1 204 No Content/g) || []).length;
  const errors = [];
  const errorMatches = text.matchAll(/HTTP\/1\.1 (\d{3}) (.+)\r\n([\s\S]*?)(?=--|\z)/g);
  for (const m of errorMatches) {
    if (m[1] !== "204") errors.push(`${m[1]} ${m[2]}`);
  }
  return { deleted, errors };
}

/**
 * Fetch all events from the calendar that contain the Geeves marker in their description.
 * Uses pagination to get all results.
 */
async function fetchGeevesEvents(accessToken, calendarId) {
  const events = [];
  let pageToken = null;
  let page = 0;

  do {
    page++;
    const params = new URLSearchParams({
      maxResults: "2500",
      singleEvents: "true",
      showDeleted: "false",
      timeMin: new Date("2020-01-01").toISOString(),
      timeMax: new Date("2030-01-01").toISOString(),
    });
    if (pageToken) params.set("pageToken", pageToken);

    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const data = await res.json();
    if (data.error) throw new Error(`Calendar list error: ${JSON.stringify(data.error)}`);

    const geevesEvents = (data.items || []).filter(
      (e) => e.description && e.description.includes(GEEVES_MARKER)
    );
    events.push(...geevesEvents);
    pageToken = data.nextPageToken || null;
    process.stdout.write(`  Page ${page}: ${data.items?.length || 0} events fetched, ${geevesEvents.length} Geeves-managed found (running total: ${events.length})\n`);
  } while (pageToken);

  return events;
}

// ── main ─────────────────────────────────────────────────────────────────────

const db = await createConnection(process.env.DATABASE_URL);

// Get the tarik.perkins@startout.org token
const [rows] = await db.execute(
  "SELECT accessToken, refreshToken, scopes FROM oauth_tokens WHERE accountEmail = ? ORDER BY expiresAt DESC LIMIT 1",
  ["tarik.perkins@startout.org"]
);
await db.end();

if (!rows.length) {
  console.error("No token found for tarik.perkins@startout.org");
  process.exit(1);
}

const { accessToken: access_token, refreshToken: refresh_token } = rows[0];
let accessToken;
try {
  accessToken = decrypt(access_token);
} catch {
  accessToken = access_token;
}
let refreshTokenDecrypted;
try {
  refreshTokenDecrypted = decrypt(refresh_token);
} catch {
  refreshTokenDecrypted = refresh_token;
}

// Refresh to ensure token is valid
console.log("Refreshing access token...");
accessToken = await refreshAccessToken(refreshTokenDecrypted);
console.log("Token refreshed.\n");

// Fetch all Geeves-managed events
console.log(`Fetching all events with "${GEEVES_MARKER}" from Team StartOut calendar...`);
const events = await fetchGeevesEvents(accessToken, TEAM_STARTOUT_GOOGLE_CAL_ID);
console.log(`\nFound ${events.length} Geeves-managed events to delete.\n`);

if (events.length === 0) {
  console.log("Nothing to delete. Calendar is clean.");
  process.exit(0);
}

// Batch delete in groups of BATCH_SIZE
const eventIds = events.map((e) => e.id);
let totalDeleted = 0;
let totalErrors = 0;
const batches = Math.ceil(eventIds.length / BATCH_SIZE);

console.log(`Deleting in ${batches} batches of up to ${BATCH_SIZE} each...\n`);

for (let i = 0; i < eventIds.length; i += BATCH_SIZE) {
  const batch = eventIds.slice(i, i + BATCH_SIZE);
  const batchNum = Math.floor(i / BATCH_SIZE) + 1;
  process.stdout.write(`  Batch ${batchNum}/${batches} (${batch.length} events)... `);

  try {
    const { deleted, errors } = await batchDelete(accessToken, TEAM_STARTOUT_GOOGLE_CAL_ID, batch);
    totalDeleted += deleted;
    totalErrors += errors.length;
    process.stdout.write(`✓ ${deleted} deleted${errors.length ? `, ${errors.length} errors` : ""}\n`);
    if (errors.length) errors.forEach((e) => console.error("    Error:", e));
  } catch (err) {
    totalErrors += batch.length;
    console.error(`  ✗ Batch failed: ${err.message}`);
    // Refresh token and retry once
    try {
      console.log("  Refreshing token and retrying...");
      accessToken = await refreshAccessToken(refreshTokenDecrypted);
      const { deleted, errors } = await batchDelete(accessToken, TEAM_STARTOUT_GOOGLE_CAL_ID, batch);
      totalDeleted += deleted;
      totalErrors -= batch.length;
      totalErrors += errors.length;
      console.log(`  Retry ✓ ${deleted} deleted`);
    } catch (retryErr) {
      console.error(`  Retry failed: ${retryErr.message}`);
    }
  }

  // Small delay between batches to respect rate limits (100 req/100s per user)
  if (i + BATCH_SIZE < eventIds.length) {
    await new Promise((r) => setTimeout(r, 200));
  }
}

console.log(`\n${"─".repeat(60)}`);
console.log(`CLEANUP COMPLETE`);
console.log(`  Total events found:   ${events.length}`);
console.log(`  Successfully deleted: ${totalDeleted}`);
console.log(`  Errors:               ${totalErrors}`);
console.log(`${"─".repeat(60)}`);
