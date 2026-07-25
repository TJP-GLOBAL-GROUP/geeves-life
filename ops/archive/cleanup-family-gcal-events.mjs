/**
 * Cleanup: delete the 926 stale "Busy" events from the Family Google Calendar.
 * These were written before the P-12/P-15 fixes and need to be removed.
 * Run after all calendars have been reconnected.
 */
import mysql from "mysql2/promise";

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// ─── Step 1: Find the Family calendar and its owner ──────────────────────────
const [calRows] = await conn.execute(
  `SELECT c.id, c.name, c.externalId, c.memberId, c.shadowBlocking, c.shadowSource
   FROM calendars c WHERE c.id = '3G4xLGLPqNy_xLasJlO-l'`
);

if (!calRows.length) {
  console.error("Family calendar not found in DB");
  process.exit(1);
}

const familyCal = calRows[0];
console.log("Family calendar:", JSON.stringify(familyCal, null, 2));

const FAMILY_GCAL_ID = familyCal.externalId;
const MEMBER_ID = familyCal.memberId;

// ─── Step 2: Get all active tokens for this member ───────────────────────────
const [tokenRows] = await conn.execute(
  `SELECT id, accountEmail, accessToken, refreshToken, expiresAt, status
   FROM oauth_tokens
   WHERE memberId = ? AND provider = 'google' AND status = 'active'
   ORDER BY expiresAt DESC LIMIT 1`,
  [MEMBER_ID]
);

// Also check all tokens in case the member changed
const [allTokens] = await conn.execute(
  `SELECT id, accountEmail, status, expiresAt FROM oauth_tokens WHERE provider = 'google' AND status = 'active' ORDER BY accountEmail`
);
console.log("\nAll active Google tokens:");
allTokens.forEach(t => console.log(`  ${t.accountEmail} (expires: ${new Date(Number(t.expiresAt)).toISOString()})`));

if (!tokenRows.length) {
  console.error(`\nNo active Google token found for memberId=${MEMBER_ID}`);
  // Try to find which account might have access to this calendar
  console.log("\nSearching all tokens for access to Family calendar...");
  
  for (const tok of allTokens) {
    const [fullTok] = await conn.execute(
      `SELECT accessToken, refreshToken, expiresAt FROM oauth_tokens WHERE id = ?`,
      [tok.id]
    );
    if (!fullTok.length) continue;
    
    let accessToken = fullTok[0].accessToken;
    const expiresAt = Number(fullTok[0].expiresAt);
    
    if (expiresAt < Date.now() + 60_000 && fullTok[0].refreshToken) {
      const resp = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: fullTok[0].refreshToken,
          client_id: process.env.GOOGLE_CLIENT_ID,
          client_secret: process.env.GOOGLE_CLIENT_SECRET,
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        accessToken = data.access_token;
      }
    }
    
    // Test if this token can list events on the Family calendar
    const testUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(FAMILY_GCAL_ID)}/events?maxResults=1`;
    const testResp = await fetch(testUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    
    if (testResp.ok) {
      console.log(`\n✅ Token for ${tok.accountEmail} has access to Family calendar!`);
      await runCleanup(accessToken, FAMILY_GCAL_ID, conn);
      await conn.end();
      process.exit(0);
    } else {
      console.log(`  ${tok.accountEmail}: no access (HTTP ${testResp.status})`);
    }
  }
  
  console.error("\nNo token found with access to Family calendar. Please reconnect the account that owns it.");
  await conn.end();
  process.exit(1);
}

// ─── Step 3: Get/refresh the token ───────────────────────────────────────────
let accessToken = tokenRows[0].accessToken;
const expiresAt = Number(tokenRows[0].expiresAt);

if (expiresAt < Date.now() + 60_000) {
  console.log(`\nToken for ${tokenRows[0].accountEmail} expired — refreshing...`);
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: tokenRows[0].refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  });
  if (resp.ok) {
    const data = await resp.json();
    accessToken = data.access_token;
    const newExpiry = Date.now() + data.expires_in * 1000;
    await conn.execute(
      "UPDATE oauth_tokens SET accessToken = ?, expiresAt = ?, lastRefreshedAt = NOW() WHERE id = ?",
      [accessToken, newExpiry, tokenRows[0].id]
    );
    console.log(`Token refreshed for ${tokenRows[0].accountEmail}`);
  } else {
    const err = await resp.text();
    console.error("Token refresh failed:", err);
    process.exit(1);
  }
}

await runCleanup(accessToken, FAMILY_GCAL_ID, conn);
await conn.end();

// ─── Cleanup function ─────────────────────────────────────────────────────────
async function runCleanup(accessToken, calendarId, conn) {
  // Find all shadow blocks that were written to this calendar (externalEventId set)
  // These are from the shadow_blocks table - but we already deleted the DB rows in P-15 cleanup.
  // We need to find the stale GCal events directly by querying Google Calendar for "Busy" events
  // created by Geeves (they have a specific description or title pattern).
  
  console.log(`\nSearching for stale Geeves "Busy" events on Family calendar...`);
  
  let pageToken = null;
  let allEvents = [];
  const since = new Date("2024-01-01T00:00:00Z").toISOString();
  
  do {
    const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
    url.searchParams.set("timeMin", since);
    url.searchParams.set("maxResults", "250");
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("showDeleted", "false");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    
    const resp = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    
    if (!resp.ok) {
      const err = await resp.text();
      console.error("Failed to list events:", resp.status, err.slice(0, 200));
      return;
    }
    
    const data = await resp.json();
    const busyEvents = (data.items || []).filter(e => {
      const title = (e.summary || "").toLowerCase();
      const desc = (e.description || "").toLowerCase();
      // Geeves shadow blocks are titled "Busy", "HOLD", or have a geeves description marker
      return title === "busy" || title === "hold" || desc.includes("geeves") || desc.includes("shadow block");
    });
    
    allEvents.push(...busyEvents);
    pageToken = data.nextPageToken;
    
    if (data.items?.length) {
      console.log(`  Fetched page: ${data.items.length} events, ${busyEvents.length} Busy/HOLD events found`);
    }
  } while (pageToken);
  
  console.log(`\nFound ${allEvents.length} stale Geeves events to delete`);
  
  if (allEvents.length === 0) {
    console.log("Nothing to delete — Family calendar is already clean!");
    return;
  }
  
  let deleted = 0;
  let failed = 0;
  
  for (let i = 0; i < allEvents.length; i++) {
    const event = allEvents[i];
    try {
      const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${event.id}`;
      const resp = await fetch(url, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      
      if (resp.status === 204 || resp.status === 200 || resp.status === 404 || resp.status === 410) {
        deleted++;
      } else {
        const body = await resp.text();
        console.warn(`  [${i+1}] Failed ${event.id}: HTTP ${resp.status} — ${body.slice(0, 100)}`);
        failed++;
      }
      
      if ((i + 1) % 50 === 0) {
        console.log(`  Progress: ${i+1}/${allEvents.length} (${deleted} deleted, ${failed} failed)`);
      }
      
      await new Promise(r => setTimeout(r, 150));
    } catch (err) {
      console.warn(`  Error deleting ${event.id}:`, err.message);
      failed++;
    }
  }
  
  console.log(`\n=== FAMILY CALENDAR CLEANUP COMPLETE ===`);
  console.log(`Events deleted from Google Calendar: ${deleted}`);
  console.log(`Failed:                              ${failed}`);
}
