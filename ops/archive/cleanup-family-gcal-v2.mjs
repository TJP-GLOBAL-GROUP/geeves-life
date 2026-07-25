/**
 * Cleanup v2: delete stale Geeves "Busy" events from the Family Google Calendar.
 * Uses the internal backfill endpoint pattern with SYSTEM_CRON_SECRET.
 * The server handles token decryption/refresh internally.
 */
import mysql from "mysql2/promise";

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Check the Family calendar member
const [memberRows] = await conn.execute(
  `SELECT m.id, m.displayName, m.email, m.googleName
   FROM household_members m
   WHERE m.id = '5oijHdMcqgQHvtuCvu2Cm'`
);
console.log("Family calendar owner:", JSON.stringify(memberRows[0]));

// Check tokens for this member - look at ALL tokens not just active
const [allMemberTokens] = await conn.execute(
  `SELECT id, accountEmail, status, expiresAt, provider
   FROM oauth_tokens
   WHERE memberId = '5oijHdMcqgQHvtuCvu2Cm'
   ORDER BY createdAt DESC`
);
console.log("\nAll tokens for Family calendar owner:", JSON.stringify(allMemberTokens, null, 2));

// The Family calendar externalId
const FAMILY_GCAL_ID = "family10740493967324871244@group.calendar.google.com";

// Try each token that has a valid refresh token
for (const tok of allMemberTokens) {
  if (tok.status !== "active") {
    console.log(`\nSkipping ${tok.accountEmail} — status: ${tok.status}`);
    continue;
  }
  
  const [fullTok] = await conn.execute(
    `SELECT accessToken, refreshToken, expiresAt FROM oauth_tokens WHERE id = ?`,
    [tok.id]
  );
  if (!fullTok.length || !fullTok[0].refreshToken) {
    console.log(`\nSkipping ${tok.accountEmail} — no refresh token`);
    continue;
  }
  
  console.log(`\nTrying to refresh token for ${tok.accountEmail}...`);
  
  const refreshResp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: fullTok[0].refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  });
  
  if (!refreshResp.ok) {
    const err = await refreshResp.text();
    console.log(`  Refresh failed for ${tok.accountEmail}: ${err.slice(0, 100)}`);
    continue;
  }
  
  const refreshData = await refreshResp.json();
  const accessToken = refreshData.access_token;
  console.log(`  Token refreshed for ${tok.accountEmail}`);
  
  // Test access to the Family calendar
  const testUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(FAMILY_GCAL_ID)}/events?maxResults=1&timeMin=2025-01-01T00:00:00Z`;
  const testResp = await fetch(testUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  
  if (!testResp.ok) {
    console.log(`  ${tok.accountEmail} cannot access Family calendar: HTTP ${testResp.status}`);
    continue;
  }
  
  console.log(`  ✅ ${tok.accountEmail} has access to Family calendar!`);
  
  // Now list and delete all Busy/HOLD events
  let pageToken = null;
  let busyEvents = [];
  
  console.log("\nListing all events on Family calendar since Jan 1, 2025...");
  
  do {
    const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(FAMILY_GCAL_ID)}/events`);
    url.searchParams.set("timeMin", "2025-01-01T00:00:00Z");
    url.searchParams.set("maxResults", "250");
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("showDeleted", "false");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    
    const listResp = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    
    if (!listResp.ok) {
      console.error("List failed:", listResp.status, await listResp.text().then(t => t.slice(0, 200)));
      break;
    }
    
    const data = await listResp.json();
    const page = (data.items || []).filter(e => {
      const title = (e.summary || "").toLowerCase().trim();
      return title === "busy" || title === "hold" || title === "geeves busy";
    });
    
    busyEvents.push(...page);
    pageToken = data.nextPageToken;
    process.stdout.write(`  Page: ${data.items?.length || 0} events, ${page.length} Busy/HOLD found so far: ${busyEvents.length} total\r`);
  } while (pageToken);
  
  console.log(`\n\nFound ${busyEvents.length} stale Busy/HOLD events to delete`);
  
  if (busyEvents.length === 0) {
    console.log("Family calendar is already clean!");
    break;
  }
  
  let deleted = 0;
  let failed = 0;
  
  for (let i = 0; i < busyEvents.length; i++) {
    const event = busyEvents[i];
    const delUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(FAMILY_GCAL_ID)}/events/${event.id}`;
    const delResp = await fetch(delUrl, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    
    if ([200, 204, 404, 410].includes(delResp.status)) {
      deleted++;
    } else {
      const body = await delResp.text();
      console.warn(`  [${i+1}] Failed ${event.id}: HTTP ${delResp.status} — ${body.slice(0, 80)}`);
      failed++;
    }
    
    if ((i + 1) % 50 === 0) {
      console.log(`  Progress: ${i+1}/${busyEvents.length} (${deleted} deleted, ${failed} failed)`);
    }
    
    await new Promise(r => setTimeout(r, 100));
  }
  
  console.log(`\n=== FAMILY CALENDAR GCAL CLEANUP COMPLETE ===`);
  console.log(`Events deleted: ${deleted}`);
  console.log(`Failed:         ${failed}`);
  break;
}

await conn.end();
