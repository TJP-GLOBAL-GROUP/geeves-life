// Webhook Channel Health Sweep Handler
// Endpoint: POST /api/scheduled/webhook-channel-health
// Auth:     x-cron-secret header (SYSTEM_CRON_SECRET) — Google Cloud Scheduler compatible
// Schedule: Every 6 hours - cron 6-field: 0 0 */6 * * *
//
// Sweeps all Google calendars and (re)registers push webhook channels that are
// missing, expired, expiring within 24h, or pointing at a stale notification URL.
//
// Why this exists (Aug 7 2026): before the reconnect-recovery fix, channels were
// only registered at server startup (registerAllWebhooks). Any channel that died
// between deploys/restarts — natural ~7 day expiry, token churn, account
// reconnects — left the calendar with no live push channel, so inbound sync went
// silent and shadow blocks stopped propagating until the next deploy. This sweep
// makes the system self-healing without requiring a reconnect or a restart.
//
// All the heavy lifting and guards live in registerWebhookChannelForCalendar:
//   - skips Google-managed read-only calendars (group.v.calendar.google.com)
//   - skips calendars with a healthy, non-expiring channel and matching URL
//   - detects P-51 stale notification URLs and re-registers
//   - skips calendars with no usable access token (expired OAuth)
// This handler is just the sweep loop + summary + cron auth.
import type { Request, Response } from "express";
import * as db from "../db";
import { registerWebhookChannelForCalendar } from "../services/calendarWebhook";

export async function webhookChannelHealthHandler(req: Request, res: Response) {
  const startedAt = Date.now();

  // Kill switch (default: enabled)
  if (process.env.WEBHOOK_CHANNEL_HEALTH_ENABLED === "false") {
    console.log("[WebhookChannelHealth] Disabled (WEBHOOK_CHANNEL_HEALTH_ENABLED=false) — skipping");
    return res.status(200).json({ skipped: true, reason: "webhook_channel_health_disabled" });
  }

  // Auth: x-cron-secret header must match SYSTEM_CRON_SECRET (sent by Google Cloud Scheduler).
  // Allow localhost for dev/test without auth.
  const ip = req.ip ?? "";
  const isInternal = ip === "127.0.0.1" || ip === "::1" || ip.startsWith("::ffff:127.");
  const cronSecret = process.env.SYSTEM_CRON_SECRET;
  if (!isInternal && cronSecret && req.headers["x-cron-secret"] !== cronSecret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const appUrl = process.env.APP_URL || process.env.VITE_APP_URL;
  if (!appUrl) {
    console.log("[WebhookChannelHealth] APP_URL not set — cannot register channels, skipping");
    return res.status(200).json({ skipped: true, reason: "app_url_not_set" });
  }

  try {
    const allCalendars = await db.getAllGoogleCalendars();
    let registered = 0;
    let skipped = 0;
    let failed = 0;
    const failures: Array<{ calendarId: string; error: string }> = [];

    for (const calendar of allCalendars) {
      try {
        // Per-calendar error isolation — one bad calendar must not block the sweep
        const didRegister = await registerWebhookChannelForCalendar(calendar.id);
        if (didRegister) registered++;
        else skipped++;
      } catch (err) {
        failed++;
        const msg = (err as Error)?.message ?? String(err);
        console.warn(`[WebhookChannelHealth] Failed for calendar ${calendar.id}:`, err);
        failures.push({ calendarId: calendar.id, error: msg.slice(0, 500) });
      }
    }

    console.log(
      `[WebhookChannelHealth] Sweep complete: ${allCalendars.length} calendars — ` +
      `${registered} (re)registered, ${skipped} healthy/skipped, ${failed} failed (${Date.now() - startedAt}ms)`
    );

    return res.json({
      total: allCalendars.length,
      registered,
      skipped,
      failed,
      failures: failures.length > 0 ? failures : undefined,
      elapsed: Date.now() - startedAt,
    });
  } catch (err) {
    console.error("[WebhookChannelHealth] Handler error:", err);
    return res.status(500).json({ error: (err as Error)?.message });
  }
}
