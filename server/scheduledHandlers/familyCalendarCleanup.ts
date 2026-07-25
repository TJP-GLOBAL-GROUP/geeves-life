/**
 * Family Calendar GCal Cleanup Handler
 *
 * Deletes stale "Busy" / "HOLD" events from the Family Google Calendar that were
 * written before the P-12/P-15 shadow block fixes. Uses the server's own token
 * infrastructure (decryption + refresh) so it works with encrypted tokens.
 *
 * Protected by x-cron-secret header.
 * POST /api/internal/family-calendar-cleanup
 */
import type { Request, Response } from "express";
import { ENV } from "../_core/env";
import { getAccessTokenForCalendar } from "../services/calendarWebhook";

const FAMILY_CAL_ID = "3G4xLGLPqNy_xLasJlO-l";
const FAMILY_GCAL_ID = "family10740493967324871244@group.calendar.google.com";
const FAMILY_MEMBER_ID = "5oijHdMcqgQHvtuCvu2Cm";
const SINCE = "2024-01-01T00:00:00Z";
const DELAY_MS = 100;

export async function familyCalendarCleanupHandler(req: Request, res: Response) {
  const secret = req.headers["x-cron-secret"];
  if (!secret || secret !== ENV.systemCronSecret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // Get a valid access token via the server's decryption infrastructure
  const accessToken = await getAccessTokenForCalendar(FAMILY_CAL_ID, FAMILY_MEMBER_ID);
  if (!accessToken) {
    return res.status(503).json({
      error: "No valid access token for Family calendar. Please reconnect the account.",
    });
  }

  // List all events on the Family calendar since Jan 2024
  let pageToken: string | undefined;
  const busyEvents: { id: string; summary: string }[] = [];

  try {
    do {
      const url = new URL(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(FAMILY_GCAL_ID)}/events`
      );
      url.searchParams.set("timeMin", SINCE);
      url.searchParams.set("maxResults", "250");
      url.searchParams.set("singleEvents", "true");
      url.searchParams.set("showDeleted", "false");
      if (pageToken) url.searchParams.set("pageToken", pageToken);

      const listResp = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!listResp.ok) {
        const err = await listResp.text();
        return res.status(502).json({ error: `GCal list failed: HTTP ${listResp.status}`, detail: err.slice(0, 200) });
      }

      const data = (await listResp.json()) as { items?: { id: string; summary?: string }[]; nextPageToken?: string };
      const page = (data.items || []).filter((e) => {
        const title = (e.summary || "").toLowerCase().trim();
        return title === "busy" || title === "hold" || title === "geeves busy";
      });

      busyEvents.push(...page.map((e) => ({ id: e.id, summary: e.summary || "" })));
      pageToken = data.nextPageToken;
    } while (pageToken);
  } catch (err) {
    return res.status(500).json({ error: `Failed to list events: ${String(err)}` });
  }

  console.log(`[FamilyCalendarCleanup] Found ${busyEvents.length} stale Busy/HOLD events to delete`);

  // Respond immediately so the HTTP request doesn't time out, then delete in background
  res.json({ ok: true, found: busyEvents.length, message: "Deletion running in background" });

  // Delete in background
  let deleted = 0;
  let failed = 0;

  for (let i = 0; i < busyEvents.length; i++) {
    const event = busyEvents[i];
    try {
      const delUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(FAMILY_GCAL_ID)}/events/${event.id}`;
      const delResp = await fetch(delUrl, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if ([200, 204, 404, 410].includes(delResp.status)) {
        deleted++;
      } else {
        const body = await delResp.text();
        console.warn(`[FamilyCalendarCleanup] Failed to delete ${event.id}: HTTP ${delResp.status} — ${body.slice(0, 100)}`);
        failed++;
      }

      if ((i + 1) % 50 === 0) {
        console.log(`[FamilyCalendarCleanup] Progress: ${i + 1}/${busyEvents.length} (${deleted} deleted, ${failed} failed)`);
      }

      await new Promise((r) => setTimeout(r, DELAY_MS));
    } catch (err) {
      console.warn(`[FamilyCalendarCleanup] Error deleting ${event.id}:`, err);
      failed++;
    }
  }

  console.log(`[FamilyCalendarCleanup] Complete — deleted: ${deleted}, failed: ${failed}`);
}
