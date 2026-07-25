/**
 * POST /api/admin/system-reports/weekly
 *
 * Accepts a JSON body with a `markdownBody` field, converts it to HTML,
 * and sends it via Resend from reports@geeves.life to tarik@tjperkinsfam.com.
 *
 * Authentication: requires the `x-cron-secret` header to match SYSTEM_CRON_SECRET.
 *
 * Designed to be called by the Manus governance schedule (or any external cron).
 */

import type { Request, Response } from "express";
import { Resend } from "resend";
import { marked } from "marked";
import { ENV } from "../_core/env";

const REPORT_RECIPIENT = "tarik@tjperkinsfam.com";
const REPORT_SENDER = "Geeves.Life Reports <reports@geeves.life>";
const REPORT_SUBJECT_PREFIX = "Geeves.Life Weekly Governance Report";

/**
 * Wraps the converted HTML in a branded email shell.
 */
function buildEmailHtml(bodyHtml: string, reportDate: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Geeves.Life Weekly Governance Report</title>
  <style>
    body { margin: 0; padding: 0; background: #0f0f1a; font-family: 'Segoe UI', Arial, sans-serif; color: #e2e8f0; }
    .wrapper { max-width: 720px; margin: 0 auto; padding: 32px 16px; }
    .header { border-bottom: 2px solid #00B5A5; padding-bottom: 20px; margin-bottom: 28px; }
    .logo { font-size: 22px; font-weight: 700; color: #ffffff; letter-spacing: -0.5px; }
    .logo span { color: #00B5A5; }
    .badge { display: inline-block; margin-top: 8px; background: #1a1a2e; border: 1px solid #00B5A5; color: #00B5A5; font-size: 11px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; padding: 3px 10px; border-radius: 4px; }
    .report-date { font-size: 12px; color: #94a3b8; margin-top: 4px; }
    .body { line-height: 1.7; }
    .body h1 { color: #00B5A5; font-size: 20px; margin-top: 32px; margin-bottom: 8px; border-bottom: 1px solid #1e293b; padding-bottom: 6px; }
    .body h2 { color: #C9A84C; font-size: 17px; margin-top: 24px; margin-bottom: 6px; }
    .body h3 { color: #e2e8f0; font-size: 15px; margin-top: 18px; margin-bottom: 4px; }
    .body p { margin: 0 0 14px; }
    .body ul, .body ol { padding-left: 20px; margin: 0 0 14px; }
    .body li { margin-bottom: 4px; }
    .body table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 13px; }
    .body th { background: #1a1a2e; color: #00B5A5; text-align: left; padding: 8px 10px; border: 1px solid #2d3748; }
    .body td { padding: 7px 10px; border: 1px solid #2d3748; color: #cbd5e1; }
    .body tr:nth-child(even) td { background: #111827; }
    .body code { background: #1e293b; color: #C9A84C; padding: 2px 5px; border-radius: 3px; font-size: 12px; }
    .body pre { background: #1e293b; padding: 14px; border-radius: 6px; overflow-x: auto; margin-bottom: 14px; }
    .body pre code { background: none; padding: 0; color: #e2e8f0; }
    .body blockquote { border-left: 3px solid #00B5A5; margin: 0 0 14px; padding: 8px 16px; background: #111827; color: #94a3b8; }
    .body a { color: #00B5A5; text-decoration: none; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #1e293b; font-size: 11px; color: #475569; text-align: center; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <div class="logo">Geeves<span>.Life</span></div>
      <div class="badge">Weekly Governance Report</div>
      <div class="report-date">${reportDate}</div>
    </div>
    <div class="body">
      ${bodyHtml}
    </div>
    <div class="footer">
      This report was automatically generated and delivered by Geeves.Life.<br />
      Sent from reports@geeves.life · geeves.life
    </div>
  </div>
</body>
</html>`;
}

export async function weeklyReportHandler(req: Request, res: Response): Promise<void> {
  // ── 1. Authenticate ────────────────────────────────────────────────────
  const cronSecret = process.env.SYSTEM_CRON_SECRET;
  if (!cronSecret) {
    res.status(503).json({ error: "SYSTEM_CRON_SECRET is not configured on this server." });
    return;
  }

  const providedSecret = req.headers["x-cron-secret"];
  if (!providedSecret || providedSecret !== cronSecret) {
    res.status(401).json({ error: "Unauthorized: invalid or missing x-cron-secret header." });
    return;
  }

  // ── 2. Validate body ───────────────────────────────────────────────────
  const { markdownBody, subject } = req.body as { markdownBody?: string; subject?: string };
  if (!markdownBody || typeof markdownBody !== "string" || markdownBody.trim().length === 0) {
    res.status(400).json({ error: "Request body must include a non-empty `markdownBody` string field." });
    return;
  }

  // ── 3. Convert markdown → HTML ─────────────────────────────────────────
  let bodyHtml: string;
  try {
    bodyHtml = await marked.parse(markdownBody, { async: true });
  } catch (err) {
    console.error("[weeklyReport] markdown parse error:", err);
    res.status(500).json({ error: "Failed to parse markdownBody as markdown." });
    return;
  }

  // ── 4. Build email ─────────────────────────────────────────────────────
  const reportDate = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "America/New_York",
  });

  const emailSubject = subject
    ? `${REPORT_SUBJECT_PREFIX} — ${subject}`
    : `${REPORT_SUBJECT_PREFIX} — ${reportDate}`;

  const html = buildEmailHtml(bodyHtml, reportDate);

  // ── 5. Send via Resend ─────────────────────────────────────────────────
  if (!ENV.resendApiKey) {
    res.status(503).json({ error: "RESEND_API_KEY is not configured on this server." });
    return;
  }

  const resend = new Resend(ENV.resendApiKey);

  try {
    const { data, error } = await resend.emails.send({
      from: REPORT_SENDER,
      to: [REPORT_RECIPIENT],
      subject: emailSubject,
      html,
    });

    if (error) {
      console.error("[weeklyReport] Resend API error:", error);
      res.status(502).json({ error: "Resend API returned an error.", detail: error });
      return;
    }

    console.log(`[weeklyReport] Report sent successfully. Resend ID: ${data?.id}`);
    res.status(200).json({
      success: true,
      resendId: data?.id,
      to: REPORT_RECIPIENT,
      from: REPORT_SENDER,
      subject: emailSubject,
      sentAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[weeklyReport] Unexpected error sending via Resend:", err);
    res.status(500).json({ error: "Unexpected error sending report email." });
  }
}
