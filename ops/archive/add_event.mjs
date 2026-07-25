/**
 * Add a recurring event to tarik@tjperkinsfam.com Google Calendar
 * Event: Neurodivergent Music Makers (Ages 5-10)
 * Every Wednesday for 4 weeks starting Jul 8, 2026 at 6:00 PM EDT
 * Location: 10359 B Democracy Lane, Fairfax, VA, USA
 * Staff: Mark Sawasky
 */

import mysql from "mysql2/promise";

const DATABASE_URL = process.env.DATABASE_URL;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

async function refreshAccessToken(refreshToken) {
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(`Refresh failed: ${JSON.stringify(data)}`);
  return {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

async function main() {
  const conn = await mysql.createConnection(DATABASE_URL);
  
  // Find the calendar
  const [calendars] = await conn.execute(
    "SELECT id, name, externalId, memberId, accountEmail FROM calendars WHERE externalId = 'tarik@tjperkinsfam.com' LIMIT 1"
  );
  
  if (calendars.length === 0) {
    console.log("Calendar tarik@tjperkinsfam.com not found");
    await conn.end();
    return;
  }
  
  const calendar = calendars[0];
  console.log("Found calendar:", calendar.name, "| ID:", calendar.id, "| Member:", calendar.memberId);
  
  // Get OAuth token for this account email
  const accountEmail = calendar.accountEmail || "tarik@tjperkinsfam.com";
  const [tokens] = await conn.execute(
    "SELECT id, accessToken, refreshToken, expiresAt, status FROM oauth_tokens WHERE memberId = ? AND provider = 'google' AND accountEmail = ? LIMIT 1",
    [calendar.memberId, accountEmail]
  );
  
  if (tokens.length === 0) {
    // Fallback: try any google token for this member
    const [allTokens] = await conn.execute(
      "SELECT id, accessToken, refreshToken, expiresAt, status, accountEmail FROM oauth_tokens WHERE memberId = ? AND provider = 'google'",
      [calendar.memberId]
    );
    if (allTokens.length === 0) {
      console.log("No OAuth token found for member:", calendar.memberId);
      await conn.end();
      return;
    }
    console.log("Using fallback token for:", allTokens[0].accountEmail);
    tokens.push(allTokens[0]);
  }
  
  const token = tokens[0];
  console.log("Token status:", token.status, "| Expires:", new Date(Number(token.expiresAt)).toISOString());
  
  // Always refresh to ensure valid token
  let accessToken;
  if (token.refreshToken) {
    console.log("Refreshing token...");
    try {
      const refreshed = await refreshAccessToken(token.refreshToken);
      accessToken = refreshed.accessToken;
      await conn.execute(
        "UPDATE oauth_tokens SET accessToken = ?, expiresAt = ?, status = 'active', lastRefreshedAt = NOW() WHERE id = ?",
        [accessToken, refreshed.expiresAt, token.id]
      );
      console.log("Token refreshed successfully");
    } catch (e) {
      console.error("Token refresh failed:", e.message);
      await conn.end();
      return;
    }
  } else {
    accessToken = token.accessToken;
    console.log("No refresh token, using stored access token");
  }
  
  // Create the recurring event
  const event = {
    summary: "Neurodivergent Music Makers (Ages 5-10)",
    description: "Music Love Academy session\nStaff: Mark Sawasky\nClient: Tarik Perkins\n\nContact: 5716682550 | info@musicloveacademy.com",
    location: "10359 B Democracy Lane, Fairfax, VA, USA",
    start: {
      dateTime: "2026-07-08T18:00:00",
      timeZone: "America/New_York",
    },
    end: {
      dateTime: "2026-07-08T19:00:00",
      timeZone: "America/New_York",
    },
    recurrence: [
      "RRULE:FREQ=WEEKLY;BYDAY=WE;COUNT=4"
    ],
    reminders: {
      useDefault: false,
      overrides: [
        { method: "popup", minutes: 60 },
        { method: "popup", minutes: 30 },
      ],
    },
  };
  
  console.log("\nCreating event:", event.summary);
  console.log("Start:", event.start.dateTime, event.start.timeZone);
  console.log("Recurrence:", event.recurrence[0]);
  console.log("Location:", event.location);
  
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendar.externalId)}/events`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
    }
  );
  
  if (!response.ok) {
    const errText = await response.text();
    console.error(`Failed to create event: ${response.status}`, errText);
    await conn.end();
    return;
  }
  
  const created = await response.json();
  console.log("\n✅ Event created successfully!");
  console.log("Google Event ID:", created.id);
  console.log("HTML Link:", created.htmlLink);
  console.log("Recurrence:", created.recurrence);
  console.log("Dates: Jul 8, 15, 22, 29 — every Wednesday at 6:00 PM EDT");
  
  await conn.end();
}

main().catch(e => { console.error(e); process.exit(1); });
