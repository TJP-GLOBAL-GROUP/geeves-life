/**
 * Guardian Daily Digest — Runs every day at 08:00
 * Sends a summary email of all guardrail activity in the last 24 hours.
 */
import type { Request, Response } from "express";
import { sdk } from "../_core/sdk";
import { getDb } from "../db";
import { sql } from "drizzle-orm";
import { ENV } from "../_core/env";

function isInternalIp(ip: string) {
  return ip === "127.0.0.1" || ip === "::1" || ip.startsWith("::ffff:127.");
}

export async function guardianDailyDigestHandler(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!(user as any).isCron && !isInternalIp(req.ip ?? "")) {
      return res.status(403).json({ error: "cron-only endpoint" });
    }
  } catch {
    if (!isInternalIp(req.ip ?? "")) return res.status(401).json({ error: "Unauthorized" });
  }

  if (!ENV.guardianEnabled) return res.json({ status: "disabled", skipped: true });

  const db = await getDb();
  if (!db) return res.status(500).json({ error: "Database unavailable" });

  try {
    // 24h activity summary
    const [summaryRows] = await db.execute(sql`
      SELECT guardrailId, action, severity, COUNT(*) as count
      FROM guardian_audit_log
      WHERE createdAt > NOW() - INTERVAL 24 HOUR
      GROUP BY guardrailId, action, severity
      ORDER BY count DESC
    `) as any;
    const summary = (summaryRows as any[]) ?? [];

    // Unresolved critical issues (last 7 days)
    const [criticalRows] = await db.execute(sql`
      SELECT id, guardrailId, details, createdAt
      FROM guardian_audit_log
      WHERE severity IN ('critical', 'emergency')
        AND resolvedAt IS NULL
        AND createdAt > NOW() - INTERVAL 7 DAY
      ORDER BY createdAt DESC
      LIMIT 20
    `) as any;
    const critical = (criticalRows as any[]) ?? [];

    const totalEvents = summary.reduce((acc: number, r: any) => acc + Number(r.count), 0);
    const criticalCount = summary.filter((r: any) => r.severity === "critical" || r.severity === "emergency")
      .reduce((acc: number, r: any) => acc + Number(r.count), 0);

    // Send digest email
    const resendKey = ENV.resendApiKey;
    if (resendKey) {
      const rows = summary.map((r: any) =>
        `<tr><td>${r.guardrailId}</td><td>${r.action}</td><td>${r.severity}</td><td>${r.count}</td></tr>`
      ).join("");
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "Geeves.Life Guardian <alerts@geeves.life>",
          to: [ENV.guardianAlertEmail],
          subject: `📊 Geeves Guardian Daily Digest — ${new Date().toLocaleDateString()}`,
          html: `
            <h2>Guardian Daily Digest</h2>
            <p><strong>${totalEvents}</strong> events in last 24h | <strong>${criticalCount}</strong> critical</p>
            <table border="1" cellpadding="4" style="border-collapse:collapse">
              <thead><tr><th>Guardrail</th><th>Action</th><th>Severity</th><th>Count</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
            ${critical.length > 0 ? `<h3>⚠ Unresolved Critical Issues (${critical.length})</h3><pre>${JSON.stringify(critical, null, 2)}</pre>` : ""}
            <p><a href="https://beta.geeves.life/super-admin?tab=guardian">View Guardian Dashboard</a></p>
          `,
        }),
      });
    }

    return res.json({ sent: !!resendKey, totalEvents, criticalCount, unresolvedCritical: critical.length });
  } catch (err) {
    console.error("[GuardianDigest] Error:", err);
    return res.status(500).json({ error: (err as Error)?.message });
  }
}
