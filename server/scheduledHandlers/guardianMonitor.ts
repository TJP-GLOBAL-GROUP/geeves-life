/**
 * Guardian Monitor — Runs every 5 minutes
 * Checks GR-3 (shadow block backlog), GR-4 (calendar sync health), GR-5 (financial anomaly).
 * Records results to guardian_audit_log and escalates via email if critical.
 */
import type { Request, Response } from "express";
import { getDb } from "../db";
import { sql } from "drizzle-orm";
import { ENV } from "../_core/env";

function isInternalIp(ip: string) {
  return ip === "127.0.0.1" || ip === "::1" || ip.startsWith("::ffff:127.");
}

function authCronRequest(req: Request, res: Response): boolean {
  // Auth: x-cron-secret header must match SYSTEM_CRON_SECRET (sent by Google Cloud Scheduler).
  // Allow localhost for dev/test without auth.
  const secret = req.headers["x-cron-secret"];
  if (isInternalIp(req.ip ?? "") || secret === ENV.systemCronSecret) return true;
  res.status(401).json({ error: "Unauthorized" });
  return false;
}

async function escalateCriticalAlert(results: Record<string, any>) {
  const resendKey = ENV.resendApiKey;
  if (!resendKey) return;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Geeves.Life Guardian <alerts@geeves.life>",
        to: [ENV.guardianAlertEmail],
        subject: "🚨 Geeves Guardian: Critical Issues Detected",
        html: `<h2>Guardian Critical Alert</h2><pre>${JSON.stringify(results, null, 2)}</pre><p>Dashboard: <a href="https://beta.geeves.life/super-admin?tab=guardian">View Details</a></p>`,
      }),
    });
  } catch (e) {
    console.error("[GuardianMonitor] Failed to send alert email:", e);
  }
}

export async function guardianMonitorHandler(req: Request, res: Response) {
  if (!(await authCronRequest(req, res))) return;
  if (!ENV.guardianEnabled) return res.json({ status: "disabled", skipped: true });

  const db = await getDb();
  if (!db) return res.status(500).json({ error: "Database unavailable" });

  const results: Record<string, { status: string; issues: number; details?: any }> = {};

  try {
    // GR-3: Shadow block backlog
    const [backlogRows] = await db.execute(sql`
      SELECT
        COUNT(*) as total_pending,
        SUM(CASE WHEN syncStatus = 'sync_failed' THEN 1 ELSE 0 END) as failed_count,
        SUM(CASE WHEN createdAt < NOW() - INTERVAL 24 HOUR THEN 1 ELSE 0 END) as stale_count
      FROM shadow_blocks
      WHERE syncStatus IN ('pending_sync', 'sync_failed')
    `) as any;
    const backlog = (backlogRows as any[])?.[0] ?? {};
    results["GR-3"] = {
      status: Number(backlog.stale_count) > 10000 ? "critical" : Number(backlog.stale_count) > 0 ? "warning" : "healthy",
      issues: Number(backlog.stale_count || 0),
      details: { totalPending: Number(backlog.total_pending || 0), failedCount: Number(backlog.failed_count || 0) },
    };

    // GR-4: Calendar sync health
    const [tokenRows] = await db.execute(sql`
      SELECT
        COUNT(*) as total_tokens,
        SUM(CASE WHEN status != 'active' THEN 1 ELSE 0 END) as expired_tokens,
        MAX(lastSyncedAt) as last_sync
      FROM oauth_tokens
      WHERE provider = 'google'
    `) as any;
    const tokenHealth = (tokenRows as any[])?.[0] ?? {};
    const hoursSinceSync = tokenHealth.last_sync
      ? (Date.now() - new Date(tokenHealth.last_sync).getTime()) / 3600000
      : 999;
    results["GR-4"] = {
      status: hoursSinceSync > 24 ? "critical" : Number(tokenHealth.expired_tokens) > 0 ? "warning" : "healthy",
      issues: Number(tokenHealth.expired_tokens || 0),
      details: { hoursSinceSync: Math.round(hoursSinceSync), totalTokens: Number(tokenHealth.total_tokens || 0) },
    };

    // GR-5: Financial anomaly (bookings where payout > 95% of total — suspicious)
    const [anomalyRows] = await db.execute(sql`
      SELECT COUNT(*) as anomaly_count
      FROM property_bookings b
      WHERE b.hostPayout IS NOT NULL
        AND b.totalAmount IS NOT NULL
        AND b.totalAmount > 0
        AND b.hostPayout > b.totalAmount * 0.95
        AND b.createdAt > NOW() - INTERVAL 7 DAY
    `) as any;
    const anomaly = (anomalyRows as any[])?.[0] ?? {};
    results["GR-5"] = {
      status: Number(anomaly.anomaly_count) > 0 ? "warning" : "healthy",
      issues: Number(anomaly.anomaly_count || 0),
    };

    // Record health check
    const overallSeverity = Object.values(results).some(r => r.status === "critical") ? "critical" : "info";
    await db.execute(sql`
      INSERT INTO guardian_audit_log (id, guardrailId, severity, action, details, createdAt)
      VALUES (UUID(), 'SYSTEM', ${overallSeverity}, 'monitor_check', ${JSON.stringify(results)}, NOW())
    `);

    const hasCritical = overallSeverity === "critical";
    if (hasCritical) await escalateCriticalAlert(results);

    return res.json({ status: hasCritical ? "critical" : "healthy", guardrails: results, checkedAt: new Date().toISOString() });
  } catch (err) {
    console.error("[GuardianMonitor] Error:", err);
    return res.status(500).json({ error: (err as Error)?.message });
  }
}
