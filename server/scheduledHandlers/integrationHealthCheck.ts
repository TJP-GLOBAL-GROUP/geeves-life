/**
 * Integration Health Smoke Test — P-34
 *
 * Runs on a scheduled heartbeat to verify that all OAuth tokens with declared
 * purposes have the required scopes. Fires a notifyOwner alert for any account
 * that is misconfigured, turning a silent failure into an active alert.
 *
 * Schedule: every 6 hours (registered in server/_core/index.ts)
 *
 * Why this exists:
 *   P-20 + P-33 revealed that a token missing gmail.readonly silently blocks
 *   7 of 9 email scrape platforms. P-34 adds a proactive check so mismatches
 *   are caught immediately — at connect time AND on every health check run —
 *   rather than discovered only when enriched data fails to appear.
 */

import type { Request, Response } from "express";
import { getDb } from "../db";
import { oauthTokens } from "../../drizzle/schema";
import { notifyOwner } from "../_core/notification";
import { ENV } from "../_core/env";

// Notification cooldown — only send once per 24h even if the check runs every 6h
let lastHealthNotifyTs = 0;
const HEALTH_NOTIFY_COOLDOWN_MS = 24 * 60 * 60 * 1000;

// Required scopes per declared purpose
const SCOPE_REQUIREMENTS: Record<string, { scope: string; label: string }[]> = {
  email_scraping: [
    { scope: "https://www.googleapis.com/auth/gmail.readonly", label: "Gmail Read" },
  ],
  calendar_sync: [
    { scope: "https://www.googleapis.com/auth/calendar", label: "Google Calendar" },
  ],
};

export async function integrationHealthCheckHandler(req: Request, res: Response) {
  // Auth: x-cron-secret header must match SYSTEM_CRON_SECRET (sent by Google Cloud Scheduler).
  // Allow localhost for dev/test without auth.
  const ip = req.ip ?? "";
  const isInternal = ip === "127.0.0.1" || ip === "::1" || ip.startsWith("::ffff:127.");
  const secret = req.headers["x-cron-secret"];
  if (!isInternal && secret !== ENV.systemCronSecret) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const d = await getDb();
    if (!d) {
      res.json({ ok: false, error: "DB not available" });
      return;
    }

    const tokens = await d.select({
      id: oauthTokens.id,
      accountEmail: oauthTokens.accountEmail,
      purposes: oauthTokens.purposes,
      scopes: oauthTokens.scopes,
      status: oauthTokens.status,
    }).from(oauthTokens);

    const issues: string[] = [];

    for (const token of tokens) {
      if (!token.purposes || !token.scopes) continue;
      const purposes: string[] = Array.isArray(token.purposes)
        ? token.purposes
        : JSON.parse(token.purposes as string || "[]");
      const grantedScopes = (token.scopes as string).split(" ");

      for (const purpose of purposes) {
        const required = SCOPE_REQUIREMENTS[purpose] || [];
        for (const req of required) {
          if (!grantedScopes.includes(req.scope)) {
            issues.push(
              `${token.accountEmail} has purpose "${purpose}" but is missing scope "${req.label}" (${req.scope})`
            );
          }
        }
      }
    }

    if (issues.length > 0) {
      console.warn(`[IntegrationHealth] ⚠️ ${issues.length} scope mismatch(es) found:\n${issues.join("\n")}`);
      const now = Date.now();
      if (now - lastHealthNotifyTs > HEALTH_NOTIFY_COOLDOWN_MS) {
        lastHealthNotifyTs = now;
        await notifyOwner({
          title: `⚠️ Integration Health: ${issues.length} scope mismatch(es)`,
          content: `The following accounts are missing required scopes for their declared purposes:\n\n${issues.map(i => `• ${i}`).join("\n")}\n\nPlease reconnect these accounts via Settings → Integrations and approve all requested permissions.`,
        });
      }
    } else {
      console.log("[IntegrationHealth] ✓ All integration tokens have required scopes");
    }

    res.json({ ok: true, issuesFound: issues.length, issues });
  } catch (err: any) {
    console.error("[IntegrationHealth] Error:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
}
