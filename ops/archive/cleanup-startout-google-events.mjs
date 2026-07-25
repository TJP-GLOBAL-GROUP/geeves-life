/**
 * Cleanup script: delete all "Blocked time (managed by Geeves)" events
 * from the Team StartOut Google Calendar.
 *
 * Run: node scripts/cleanup-startout-google-events.mjs
 */
import { createConnection } from "mysql2/promise";
import { createHash, createDecipheriv } from "crypto";
import * as dotenv from "dotenv";
dotenv.config();

const TEAM_STARTOUT_GCAL_ID = "startout.org_a7cm92hjbpfa0eanpk168mf99g@group.calendar.google.com";
const TEAM_STARTOUT_CAL_ID = "AKbGvGfoorcX6G9bOFQni";
const ACCOUNT_EMAIL = "tarik.perkins@startout.org";

// ── Token decryption (mirrors server/tokenEncryption.ts) ─────────────────────
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function getKey() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET not set");
  return createHash("sha256").update(secret).digest();
}

function decryptToken(stored) {
  if (!stored) return null;
  if (!stored.startsWith("enc:")) return stored; // legacy plaintext
  try {
    const key = getKey();
    const combined = Buffer.from(stored.slice(4), "base64");
    const iv = combined.subarray(0, IV_LENGTH);
    const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const ciphertext = combined.subarray(IV_LENGTH + TAG_LENGTH);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString("utf8");
  } catch (err) {
    console.error("Decryption failed:", err.message);
    return null;
  }
}

// ── Google Calendar API helpers ───────────────────────────────────────────────
async function refreshAccessToken(refreshToken, clientId, clientSecret) {
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(`Token refresh failed: ${JSON.stringify(data)}`);
  return data.access_token;
}

async function listAllEvents(accessToken, calendarId) {
  const events = [];
  let pageToken = null;
  do {
    const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
    url.searchParams.set("maxResults", "250");
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("showDeleted", "false");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const resp = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`List events failed (${resp.status}): ${err}`);
    }
    const data = await resp.json();
    events.push(...(data.items ?? []));
    pageToken = data.nextPageToken ?? null;
  } while (pageToken);
  return events;
}

async function deleteGoogleEvent(accessToken, calendarId, eventId) {
  const resp = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!resp.ok && resp.status !== 410) { // 410 = already deleted
    const err = await resp.text();
    throw new Error(`Delete event failed (${resp.status}): ${err}`);
  }
  return resp.status;
}

// ── Main ─────────────────────────────────────────────────────────────────────
const db = await createConnection(process.env.DATABASE_URL);

// 1. Get the token for tarik.perkins@startout.org
const [tokens] = await db.query(
  "SELECT id, accessToken, refreshToken, expiresAt FROM oauth_tokens WHERE accountEmail = ? ORDER BY expiresAt DESC LIMIT 1",
  [ACCOUNT_EMAIL]
);

if (!tokens.length) {
  console.error(`No token found for ${ACCOUNT_EMAIL}`);
  process.exit(1);
}

const tokenRow = tokens[0];
const rawRefreshToken = decryptToken(tokenRow.refreshToken);
const rawAccessToken = decryptToken(tokenRow.accessToken);

if (!rawRefreshToken) {
  console.error("Could not decrypt refresh token");
  process.exit(1);
}

// 2. Get a fresh access token
const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error("GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not set in env");
  process.exit(1);
}

console.log(`Refreshing access token for ${ACCOUNT_EMAIL}...`);
let accessToken;
try {
  accessToken = await refreshAccessToken(rawRefreshToken, clientId, clientSecret);
  console.log("✓ Got fresh access token");
} catch (err) {
  console.warn("Token refresh failed, trying existing access token:", err.message);
  accessToken = rawAccessToken;
}

// 3. List all events on Team StartOut Google Calendar
console.log(`\nListing all events on Team StartOut Google Calendar (${TEAM_STARTOUT_GCAL_ID})...`);
let allEvents;
try {
  allEvents = await listAllEvents(accessToken, TEAM_STARTOUT_GCAL_ID);
  console.log(`Found ${allEvents.length} total events`);
} catch (err) {
  console.error("Failed to list events:", err.message);
  process.exit(1);
}

// 4. Filter for Geeves-managed events
const geevesEvents = allEvents.filter(e =>
  e.description?.includes("managed by Geeves") ||
  e.description?.includes("Blocked time (managed by Geeves)")
);

console.log(`\nFound ${geevesEvents.length} Geeves-managed events to delete:`);
for (const e of geevesEvents) {
  console.log(`  - [${e.id}] "${e.summary}" on ${e.start?.date ?? e.start?.dateTime} (desc: ${e.description?.slice(0, 60)})`);
}

if (geevesEvents.length === 0) {
  console.log("\n✓ No Geeves-managed events found on Team StartOut Google Calendar. Nothing to delete.");
  await db.end();
  process.exit(0);
}

// 5. Delete them
console.log(`\nDeleting ${geevesEvents.length} events...`);
let deleted = 0;
let failed = 0;
for (const e of geevesEvents) {
  try {
    const status = await deleteGoogleEvent(accessToken, TEAM_STARTOUT_GCAL_ID, e.id);
    console.log(`  ✓ Deleted [${e.id}] "${e.summary}" (HTTP ${status})`);
    deleted++;
  } catch (err) {
    console.error(`  ✗ Failed to delete [${e.id}] "${e.summary}": ${err.message}`);
    failed++;
  }
}

console.log(`\n=== Done: ${deleted} deleted, ${failed} failed ===`);

// 6. Also delete the remaining shadow_blocks DB row
const [result] = await db.query(
  "DELETE FROM shadow_blocks WHERE targetCalendarId = ?",
  [TEAM_STARTOUT_CAL_ID]
);
console.log(`\nDeleted ${result.affectedRows} shadow_blocks DB row(s) for Team StartOut`);

await db.end();
