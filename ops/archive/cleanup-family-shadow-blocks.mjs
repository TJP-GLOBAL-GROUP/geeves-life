/**
 * Cleanup script: delete all shadow_blocks targeting the Family calendar (3G4xLGLPqNy_xLasJlO-l)
 * and remove the corresponding Google Calendar events.
 *
 * The Family calendar has shadowBlocking=false (opted out) but received 4,187 erroneous
 * shadow block rows before the P-12 fix was deployed. 926 of those were written to
 * Google Calendar and need to be deleted via the API.
 *
 * Run: node scripts/cleanup-family-shadow-blocks.mjs
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const mysql = require('mysql2/promise');

const FAMILY_CAL_ID = '3G4xLGLPqNy_xLasJlO-l';
const FAMILY_GCAL_ID = 'family10740493967324871244@group.calendar.google.com';
const MEMBER_ID = '5oijHdMcqgQHvtuCvu2Cm';
const BATCH_SIZE = 50;
const DELAY_MS = 200; // 200ms between Google API calls to avoid rate limiting

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// ─── Step 1: Get the access token for the Family calendar ─────────────────────
const [tokenRows] = await conn.execute(
  `SELECT id, accessToken, refreshToken, expiresAt, accountEmail
   FROM oauth_tokens
   WHERE memberId = ? AND provider = 'google' AND status = 'active'
   ORDER BY createdAt DESC LIMIT 1`,
  [MEMBER_ID]
);

if (!tokenRows.length) {
  console.error('No active Google token found for Family calendar member. Cannot delete Google Calendar events.');
  console.log('Will still clean up DB rows...');
}

let accessToken = tokenRows[0]?.accessToken;
const expiresAt = tokenRows[0]?.expiresAt ? Number(tokenRows[0].expiresAt) : 0;

// Refresh token if expired
if (accessToken && expiresAt < Date.now() + 60_000) {
  console.log('Token expired — refreshing...');
  const refreshToken = tokenRows[0]?.refreshToken;
  if (!refreshToken) {
    console.error('No refresh token available. Cannot refresh. Will skip Google Calendar deletions.');
    accessToken = null;
  } else {
    const resp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
      }),
    });
    if (resp.ok) {
      const data = await resp.json();
      accessToken = data.access_token;
      const newExpiry = Date.now() + data.expires_in * 1000;
      await conn.execute(
        'UPDATE oauth_tokens SET accessToken = ?, expiresAt = ?, lastRefreshedAt = NOW() WHERE id = ?',
        [accessToken, newExpiry, tokenRows[0].id]
      );
      console.log(`Token refreshed for ${tokenRows[0].accountEmail}`);
    } else {
      const err = await resp.text();
      console.error('Token refresh failed:', err);
      accessToken = null;
    }
  }
}

// ─── Step 2: Get all shadow blocks targeting the Family calendar ───────────────
const [allBlocks] = await conn.execute(
  `SELECT id, externalEventId FROM shadow_blocks WHERE targetCalendarId = ?`,
  [FAMILY_CAL_ID]
);

console.log(`\nFound ${allBlocks.length} shadow_blocks rows targeting Family calendar`);
const withGoogleEvent = allBlocks.filter(b => b.externalEventId);
const dbOnly = allBlocks.filter(b => !b.externalEventId);
console.log(`  ${withGoogleEvent.length} have externalEventId (need Google Calendar deletion)`);
console.log(`  ${dbOnly.length} are DB-only (no Google Calendar event)`);

// ─── Step 3: Delete Google Calendar events ────────────────────────────────────
let gcalDeleted = 0;
let gcalFailed = 0;
let gcalSkipped = 0;

if (accessToken && withGoogleEvent.length > 0) {
  console.log(`\nDeleting ${withGoogleEvent.length} Google Calendar events from Family calendar...`);
  
  for (let i = 0; i < withGoogleEvent.length; i++) {
    const block = withGoogleEvent[i];
    try {
      const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(FAMILY_GCAL_ID)}/events/${block.externalEventId}`;
      const resp = await fetch(url, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      
      if (resp.status === 204 || resp.status === 200) {
        gcalDeleted++;
      } else if (resp.status === 404) {
        // Already deleted or never existed — treat as success
        gcalDeleted++;
      } else if (resp.status === 410) {
        // Gone — already deleted
        gcalDeleted++;
      } else {
        const body = await resp.text();
        console.warn(`  [${i+1}/${withGoogleEvent.length}] Failed to delete ${block.externalEventId}: HTTP ${resp.status} — ${body.slice(0, 100)}`);
        gcalFailed++;
      }
      
      if ((i + 1) % 50 === 0) {
        console.log(`  Progress: ${i+1}/${withGoogleEvent.length} (${gcalDeleted} deleted, ${gcalFailed} failed)`);
      }
      
      // Rate limit: 200ms between calls
      await new Promise(r => setTimeout(r, DELAY_MS));
    } catch (err) {
      console.warn(`  Error deleting ${block.externalEventId}:`, err.message);
      gcalFailed++;
    }
  }
  
  console.log(`\nGoogle Calendar cleanup: ${gcalDeleted} deleted, ${gcalFailed} failed`);
} else if (!accessToken) {
  console.log('\nSkipping Google Calendar deletions (no valid access token)');
  gcalSkipped = withGoogleEvent.length;
} else {
  console.log('\nNo Google Calendar events to delete');
}

// ─── Step 4: Delete all DB rows ───────────────────────────────────────────────
console.log(`\nDeleting ${allBlocks.length} shadow_blocks DB rows targeting Family calendar...`);

const [deleteResult] = await conn.execute(
  'DELETE FROM shadow_blocks WHERE targetCalendarId = ?',
  [FAMILY_CAL_ID]
);

console.log(`Deleted ${deleteResult.affectedRows} DB rows`);

// ─── Step 5: Verify ───────────────────────────────────────────────────────────
const [remaining] = await conn.execute(
  'SELECT COUNT(*) as cnt FROM shadow_blocks WHERE targetCalendarId = ?',
  [FAMILY_CAL_ID]
);
console.log(`\nVerification: ${remaining[0].cnt} shadow_blocks rows remaining for Family calendar`);

console.log('\n=== CLEANUP SUMMARY ===');
console.log(`DB rows deleted:          ${deleteResult.affectedRows}`);
console.log(`Google Calendar deleted:  ${gcalDeleted}`);
console.log(`Google Calendar failed:   ${gcalFailed}`);
console.log(`Google Calendar skipped:  ${gcalSkipped}`);
console.log(`Remaining DB rows:        ${remaining[0].cnt}`);

await conn.end();
