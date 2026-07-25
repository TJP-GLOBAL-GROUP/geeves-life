/**
 * cleanup-startout-force.mjs
 * 
 * Attempts to refresh the tarik.perkins@startout.org access token using the stored
 * refresh token, then batch-deletes all "Blocked time (managed by Geeves)" events
 * from the Team StartOut Google Calendar.
 * 
 * Uses Google Calendar batch API (50 deletes per HTTP call) per P-13.
 */

import mysql from 'mysql2/promise';
import crypto from 'crypto';

const DATABASE_URL = process.env.DATABASE_URL;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const ENCRYPTION_KEY = process.env.JWT_SECRET; // used as encryption key

// ── Decrypt token (mirrors server/tokenEncryption.ts exactly) ──────────────
// Format: "enc:" + base64(iv[12] || authTag[16] || ciphertext)
// Key: SHA-256 of JWT_SECRET
function decrypt(stored) {
  if (!stored) return null;
  // Not encrypted (legacy plaintext)
  if (!stored.startsWith('enc:')) return stored;
  try {
    const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
    const combined = Buffer.from(stored.slice(4), 'base64');
    const IV_LENGTH = 12;
    const TAG_LENGTH = 16;
    const iv = combined.subarray(0, IV_LENGTH);
    const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const ciphertext = combined.subarray(IV_LENGTH + TAG_LENGTH);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (err) {
    console.error('Decryption failed:', err.message);
    return null;
  }
}

// ── Refresh the access token ────────────────────────────────────────────────
async function refreshAccessToken(refreshToken) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Token refresh failed: ${JSON.stringify(data)}`);
  }
  return data.access_token;
}

// ── List all Geeves-managed events on a calendar ────────────────────────────
async function listGeevesEvents(accessToken, calendarId) {
  const events = [];
  let pageToken = null;
  let page = 0;
  do {
    page++;
    const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
    url.searchParams.set('maxResults', '2500');
    url.searchParams.set('q', 'managed by Geeves');
    url.searchParams.set('showDeleted', 'false');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`List events failed (${res.status}): ${err}`);
    }
    const data = await res.json();
    const geevesEvents = (data.items || []).filter(e => 
      e.description && e.description.includes('managed by Geeves')
    );
    events.push(...geevesEvents);
    pageToken = data.nextPageToken;
    console.log(`  Page ${page}: found ${geevesEvents.length} Geeves events (total so far: ${events.length})`);
  } while (pageToken);
  return events;
}

// ── Batch delete events (50 per HTTP call, per P-13) ────────────────────────
async function batchDelete(accessToken, calendarId, eventIds) {
  const boundary = 'batch_geeves_' + Date.now();
  const parts = eventIds.map(id =>
    `--${boundary}\r\nContent-Type: application/http\r\n\r\nDELETE /calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${id} HTTP/1.1\r\n\r\n`
  );
  const body = parts.join('') + `--${boundary}--`;
  
  const res = await fetch('https://www.googleapis.com/batch/calendar/v3', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/mixed; boundary=${boundary}`,
    },
    body,
  });
  const text = await res.text();
  const successes = (text.match(/HTTP\/1\.1 204 No Content/g) || []).length;
  const notFound = (text.match(/HTTP\/1\.1 404/g) || []).length;
  return { successes, notFound };
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const conn = await mysql.createConnection(DATABASE_URL);
  
  try {
    // 1. Get the token for tarik.perkins@startout.org
    console.log('Fetching token for tarik.perkins@startout.org...');
    const [rows] = await conn.execute(
      `SELECT id, accountEmail, accessToken, refreshToken, expiresAt, status, scopes 
       FROM oauth_tokens 
       WHERE accountEmail = 'tarik.perkins@startout.org' 
       ORDER BY createdAt DESC LIMIT 1`
    );
    
    if (!rows.length) {
      throw new Error('No token found for tarik.perkins@startout.org');
    }
    
    const tokenRow = rows[0];
    console.log(`Token ID: ${tokenRow.id}`);
    console.log(`Status: ${tokenRow.status}`);
    console.log(`Expires: ${tokenRow.expiresAt}`);
    console.log(`Scopes: ${tokenRow.scopes}`);
    
    // 2. Decrypt the refresh token
    const refreshToken = decrypt(tokenRow.refreshToken);
    if (!refreshToken) {
      throw new Error('No refresh token available — account must be reconnected via Settings');
    }
    console.log(`Refresh token: ${refreshToken.substring(0, 20)}...`);
    
    // 3. Get a fresh access token
    console.log('\nRefreshing access token...');
    const accessToken = await refreshAccessToken(refreshToken);
    console.log('Access token obtained successfully.');
    
    // 4. Get the Team StartOut Google Calendar ID
    // The calendar syncs from Google Calendar ID stored in the calendars table
    const [calRows] = await conn.execute(
      `SELECT id, name, externalId, accountEmail 
       FROM calendars 
       WHERE id = 'AKbGvGfoorcX6G9bOFQni'`
    );
    
    if (!calRows.length) {
      throw new Error('Team StartOut calendar not found in DB');
    }
    
    const teamCal = calRows[0];
    console.log(`\nTeam StartOut calendar:`);
    console.log(`  Geeves ID: ${teamCal.id}`);
    console.log(`  Name: ${teamCal.name}`);
    console.log(`  Google Calendar externalId: ${teamCal.externalId}`);
    console.log(`  Account: ${teamCal.accountEmail}`);
    
    const googleCalId = teamCal.externalId;
    if (!googleCalId) {
      throw new Error('No Google Calendar ID on Team StartOut — cannot query Google Calendar API');
    }
    
    // 5. List all Geeves-managed events
    console.log(`\nListing Geeves-managed events on ${googleCalId}...`);
    const events = await listGeevesEvents(accessToken, googleCalId);
    console.log(`\nTotal Geeves-managed events found: ${events.length}`);
    
    if (events.length === 0) {
      console.log('Nothing to delete. Calendar is already clean.');
      return;
    }
    
    // 6. Dry run — show sample
    console.log('\nSample events to delete:');
    events.slice(0, 5).forEach(e => {
      console.log(`  - ${e.summary || '(no title)'} | ${e.start?.date || e.start?.dateTime} | id: ${e.id}`);
    });
    
    // 7. Batch delete
    console.log(`\nDeleting ${events.length} events in batches of 50...`);
    const eventIds = events.map(e => e.id);
    let totalDeleted = 0;
    let totalNotFound = 0;
    
    for (let i = 0; i < eventIds.length; i += 50) {
      const batch = eventIds.slice(i, i + 50);
      const { successes, notFound } = await batchDelete(accessToken, googleCalId, batch);
      totalDeleted += successes;
      totalNotFound += notFound;
      console.log(`  Batch ${Math.floor(i/50) + 1}: deleted ${successes}, not found ${notFound} (total deleted: ${totalDeleted})`);
      if (i + 50 < eventIds.length) {
        await new Promise(r => setTimeout(r, 200)); // rate limit: 200ms between batches
      }
    }
    
    console.log(`\n✅ Cleanup complete.`);
    console.log(`   Deleted: ${totalDeleted}`);
    console.log(`   Already gone: ${totalNotFound}`);
    console.log(`   Total processed: ${events.length}`);
    
  } finally {
    await conn.end();
  }
}

main().catch(e => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
