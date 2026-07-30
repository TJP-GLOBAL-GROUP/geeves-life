/**
 * Google Calendar Sync Service
 *
 * All accounts (personal Gmail, custom domains, external Workspace) use per-account OAuth.
 * Service account / domain-wide delegation is NOT used — it was deprecated in June 2026.
 */

import { GoogleAuth } from "google-auth-library";  // kept for potential future use
import { emitCalendarEvent, emitSyncStatus } from "../realtime";

// Types for Google Calendar API responses
interface GoogleCalendarEvent {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
  status: string;
  recurrence?: string[];
  recurringEventId?: string;
  attendees?: { email: string; responseStatus: string }[];
  organizer?: { email: string; displayName?: string };
  updated: string;
  htmlLink?: string;
}

interface GoogleCalendarList {
  id: string;
  summary: string;
  description?: string;
  primary?: boolean;
  backgroundColor?: string;
  foregroundColor?: string;
  accessRole: string;
}

// ─── Configuration Check ────────────────────────────────────────────

export function isGoogleCalendarConfigured(): boolean {
  return !!(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET
  );
}

// ─── Token Management ───────────────────────────────────────────────

interface TokenInfo {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
}

/**
 * Refresh an OAuth access token using the refresh token.
 */
export async function refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: number }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  let response: Response;
  try {
    response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
      signal: controller.signal,
    });
  } catch (err: any) {
    clearTimeout(timeout);
    if (err.name === "AbortError") throw new Error("Token refresh timed out after 10s");
    throw err;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token refresh failed: ${error}`);
  }

  const data = await response.json();
  return {
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in * 1000),
  };
}

// ─── Calendar API Calls ─────────────────────────────────────────────

const CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3";

/**
 * List all calendars for the authenticated user.
 */
export async function listGoogleCalendars(accessToken: string): Promise<GoogleCalendarList[]> {
  const response = await fetch(`${CALENDAR_API_BASE}/users/me/calendarList`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Failed to list calendars: ${response.status}`);
  }

  const data = await response.json();
  return data.items || [];
}

/**
 * Fetch events from a specific calendar within a time range.
 */
export async function fetchGoogleEvents(
  accessToken: string,
  calendarId: string,
  timeMin: Date,
  timeMax: Date,
  pageToken?: string
): Promise<{ events: GoogleCalendarEvent[]; nextPageToken?: string; nextSyncToken?: string }> {
  const params = new URLSearchParams({
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
  });
  if (pageToken) params.set("pageToken", pageToken);

  const response = await fetch(
    `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch events: ${response.status}`);
  }

  const data = await response.json();
  return {
    events: data.items || [],
    nextPageToken: data.nextPageToken,
    nextSyncToken: data.nextSyncToken,
  };
}

/**
 * Incremental sync using sync token (for efficient polling).
 */
export async function syncGoogleEvents(
  accessToken: string,
  calendarId: string,
  syncToken: string
): Promise<{ events: GoogleCalendarEvent[]; nextSyncToken?: string; fullSyncRequired: boolean }> {
  const params = new URLSearchParams({ syncToken });

  const response = await fetch(
    `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (response.status === 410) {
    // Sync token expired, full sync required
    return { events: [], fullSyncRequired: true };
  }

  if (!response.ok) {
    throw new Error(`Sync failed: ${response.status}`);
  }

  const data = await response.json();
  return {
    events: data.items || [],
    nextSyncToken: data.nextSyncToken,
    fullSyncRequired: false,
  };
}

/**
 * Create an event on Google Calendar.
 */
export async function createGoogleEvent(
  accessToken: string,
  calendarId: string,
  event: {
    summary: string;
    description?: string;
    location?: string;
    start: { dateTime?: string; date?: string; timeZone?: string };
    end: { dateTime?: string; date?: string; timeZone?: string };
  }
): Promise<GoogleCalendarEvent> {
  const response = await fetch(
    `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events`,
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
    throw new Error(`Failed to create event: ${response.status}`);
  }

  return response.json();
}

/**
 * Set up a webhook channel for push notifications (real-time sync).
 */
export async function setupWebhookChannel(
  accessToken: string,
  calendarId: string,
  webhookUrl: string,
  channelId: string
): Promise<{ id: string; resourceId: string; expiration: string }> {
  const response = await fetch(
    `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events/watch`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: channelId,
        type: "web_hook",
        address: webhookUrl,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to setup webhook: ${response.status}`);
  }

  return response.json();
}

// ─── Sync Orchestrator ──────────────────────────────────────────────

/**
 * Convert a Google Calendar event to our internal format.
 */
export function convertGoogleEvent(gEvent: GoogleCalendarEvent, calendarId: string): {
  externalId: string;
  title: string;
  description: string | null;
  location: string | null;
  startTime: number;
  endTime: number;
  isAllDay: boolean;
  status: string;
  recurrenceRule: string | null;
  recurringEventId: string | null;
} {
  const isAllDay = !gEvent.start.dateTime;
  let startTime: number;
  let endTime: number;
  if (isAllDay) {
    // Google all-day events use date strings (YYYY-MM-DD) in UTC.
    // start.date is inclusive first day, end.date is EXCLUSIVE (day after last day).
    // Store startTime as UTC midnight of start.date.
    // Store endTime as 23:59:59 UTC of the last inclusive day (end.date - 1 day).
    startTime = Date.UTC(
      parseInt(gEvent.start.date!.slice(0, 4)),
      parseInt(gEvent.start.date!.slice(5, 7)) - 1,
      parseInt(gEvent.start.date!.slice(8, 10)),
      0, 0, 0, 0
    );
    // end.date is exclusive — subtract 1 day to get the last inclusive day
    const endDateExclusive = new Date(gEvent.end.date! + "T00:00:00Z");
    const lastInclusiveDay = new Date(endDateExclusive.getTime() - 86400000);
    endTime = Date.UTC(
      lastInclusiveDay.getUTCFullYear(),
      lastInclusiveDay.getUTCMonth(),
      lastInclusiveDay.getUTCDate(),
      23, 59, 59, 0
    );
  } else {
    startTime = new Date(gEvent.start.dateTime!).getTime();
    endTime = new Date(gEvent.end.dateTime!).getTime();
  }

  return {
    externalId: gEvent.id,
    title: gEvent.summary || "(No title)",
    description: gEvent.description || null,
    location: gEvent.location || null,
    startTime,
    endTime,
    isAllDay,
    status: gEvent.status === "cancelled" ? "cancelled" : "confirmed",
    recurrenceRule: gEvent.recurrence?.join("\n") || null,
    recurringEventId: gEvent.recurringEventId || null,
  };
}

/**
 * Full sync: fetch all events and upsert into our database.
 * This is the main entry point for syncing a calendar.
 */
export async function performFullSync(
  accessToken: string,
  googleCalendarId: string,
  internalCalendarId: string,
  householdId: string,
  dbHelpers: {
    upsertEvent: (event: any) => Promise<any>;
    updateSyncToken: (calendarId: string, token: string) => Promise<void>;
  }
): Promise<{ synced: number; errors: number }> {
  if (!isGoogleCalendarConfigured()) {
    console.log("[GoogleSync] Skipped — credentials not configured");
    return { synced: 0, errors: 0 };
  }

  emitSyncStatus(householdId, internalCalendarId, "syncing");

  let synced = 0;
  let errors = 0;
  let pageToken: string | undefined;
  let nextSyncToken: string | undefined;

  const timeMin = new Date();
  timeMin.setMonth(timeMin.getMonth() - 3); // 3 months back
  const timeMax = new Date();
  timeMax.setMonth(timeMax.getMonth() + 12); // 12 months forward

  try {
    do {
      const result = await fetchGoogleEvents(accessToken, googleCalendarId, timeMin, timeMax, pageToken);
      
      for (const gEvent of result.events) {
        try {
          const converted = convertGoogleEvent(gEvent, internalCalendarId);
          await dbHelpers.upsertEvent({
            ...converted,
            calendarId: internalCalendarId,
            householdId,
          });
          // A4: Emit calendar event via WebSocket so connected clients update in real-time
          const action = gEvent.status === "cancelled" ? "deleted" : "updated";
          emitCalendarEvent(householdId, action, { ...converted, calendarId: internalCalendarId });
          synced++;
        } catch (e) {
          errors++;
          console.error(`[GoogleSync] Error syncing event ${gEvent.id}:`, e);
        }
      }

      pageToken = result.nextPageToken;
      nextSyncToken = result.nextSyncToken;
    } while (pageToken);

    if (nextSyncToken) {
      await dbHelpers.updateSyncToken(internalCalendarId, nextSyncToken);
    }

    emitSyncStatus(householdId, internalCalendarId, "synced");
  } catch (e) {
    emitSyncStatus(householdId, internalCalendarId, "error", String(e));
    throw e;
  }

  return { synced, errors };
}

/**
 * Update (PATCH) an existing Google Calendar event.
 */
export async function updateGoogleEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  patch: {
    summary?: string;
    description?: string | null;
    location?: string | null;
    start?: { dateTime?: string; date?: string; timeZone?: string };
    end?: { dateTime?: string; date?: string; timeZone?: string };
  }
): Promise<GoogleCalendarEvent> {
  const response = await fetch(
    `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(patch),
    }
  );
  if (!response.ok) {
    throw new Error(`Failed to update Google event: ${response.status}`);
  }
  return response.json();
}

/**
 * Delete a Google Calendar event.
 */
export async function deleteGoogleEvent(
  accessToken: string,
  calendarId: string,
  eventId: string
): Promise<void> {
  const response = await fetch(
    `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!response.ok && response.status !== 410) {
    // 410 Gone means already deleted — treat as success
    throw new Error(`Failed to delete Google event: ${response.status}`);
  }
}
