// Proactive OAuth Token Refresh Heartbeat Handler
// Endpoint: POST /api/scheduled/token-refresh
// Auth:     x-cron-secret header (SYSTEM_CRON_SECRET) — Google Cloud Scheduler compatible
// Schedule: Every 45 minutes - cron 6-field: 0 */45 * * * *
//
// P-25: Proactively refreshes all Google OAuth tokens that will expire within
// the next 30 minutes. This prevents the "expired between syncs" failure mode
// where a token expires between calendar sync runs and the next sync fails,
// marking the token as expired and showing a reconnect banner to the user.
//
// Key design:
// - Only refreshes tokens with status = "active" (not already expired/revoked)
// - Only refreshes tokens expiring within REFRESH_WINDOW_MS (30 min)
// - Skips tokens with no refresh token (can't refresh without one)
// - On refresh failure: marks token expired and notifies owner (same as on-demand path)
// - Idempotent: safe to run multiple times

import type { Request, Response } from "express";
import { getDb } from "../db";
import { oauthTokens } from "../../drizzle/schema";
import { and, eq, lt, gt, isNotNull } from "drizzle-orm";
import { refreshAccessToken } from "../services/googleCalendarSync";
import { requireCronAuth } from "./scheduledAuth";

const REFRESH_WINDOW_MS = 30 * 60 * 1000; // 30 minutes

export async function tokenRefreshHandler(req: Request, res: Response) {
  const startedAt = Date.now();

  // Auth: x-cron-secret header must match SYSTEM_CRON_SECRET (sent by Google Cloud Scheduler).
  // Allow localhost for dev/test without auth.
  if (!requireCronAuth(req, res, "TokenRefresh")) return;

  const db = await getDb();
  if (!db) return res.status(503).json({ error: "DB unavailable" });

  const stats = { checked: 0, refreshed: 0, skipped: 0, failed: 0 };

  try {
    const cutoff = Date.now() + REFRESH_WINDOW_MS;

    // Find all active Google tokens expiring within the refresh window
    // expiresAt is stored as bigint (milliseconds since epoch)
    const tokensToRefresh = await db
      .select()
      .from(oauthTokens)
      .where(
        and(
          eq(oauthTokens.provider, "google"),
          eq(oauthTokens.status, "active"),
          isNotNull(oauthTokens.refreshToken),
          lt(oauthTokens.expiresAt, cutoff),
          gt(oauthTokens.expiresAt, 0) // exclude null/zero expiry
        )
      );

    stats.checked = tokensToRefresh.length;
    console.log(`[TokenRefresh] Found ${tokensToRefresh.length} token(s) expiring within 30 min`);

    for (const token of tokensToRefresh) {
      if (!token.refreshToken) {
        stats.skipped++;
        continue;
      }

      try {
        const refreshed = await refreshAccessToken(token.refreshToken);
        await db.update(oauthTokens)
          .set({
            accessToken: refreshed.accessToken,
            expiresAt: refreshed.expiresAt, // already a number (ms since epoch)
            lastRefreshedAt: new Date(),
            status: "active",
          })
          .where(eq(oauthTokens.id, token.id));

        stats.refreshed++;
        console.log(`[TokenRefresh] ✓ Refreshed token for ${token.accountEmail ?? token.memberId}`);
      } catch (err) {
        // Refresh token revoked or expired — mark it so the UI shows reconnect banner
        stats.failed++;
        console.warn(`[TokenRefresh] ✗ Failed to refresh token for ${token.accountEmail ?? token.memberId}:`, (err as Error)?.message);
        try {
          await db.update(oauthTokens)
            .set({ status: "expired" })
            .where(eq(oauthTokens.id, token.id));
        } catch (dbErr) {
          console.error(`[TokenRefresh] Failed to mark token expired:`, dbErr);
        }
      }
    }

    const elapsed = Date.now() - startedAt;
    console.log(`[TokenRefresh] Done in ${elapsed}ms — refreshed: ${stats.refreshed}, failed: ${stats.failed}, skipped: ${stats.skipped}`);

    return res.json({
      ok: true,
      elapsed,
      stats,
    });
  } catch (err) {
    console.error("[TokenRefresh] Fatal error:", err);
    return res.status(500).json({ error: "Internal error", message: (err as Error)?.message });
  }
}
