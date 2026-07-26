// Email Scrape Heartbeat Handler
// Endpoint: POST /api/scheduled/email-scrape
// Auth:     x-cron-secret header (SYSTEM_CRON_SECRET) — Google Cloud Scheduler compatible
// Schedule: Every 6 hours — cron 6-field: 0 0 */6 * * *
//
// Scrapes booking confirmation emails from Gmail for all active property platforms
// that have emailScrapingEnabled=true and a notificationEmail configured.
// Enriches property_bookings rows with guestName, guestEmail, totalPrice, netAmount.
// Idempotent — scrapeMultiPlatformEmails skips bookings that already have guestName.

import type { Request, Response } from "express";
import { scrapeAllMultiPlatformEmails } from "../services/multiPlatformEmailScraper";
import { ENV } from "../_core/env";
import { getDb } from "../db";
import { emailScrapeJobs } from "../../drizzle/schema";
import { and, lt, eq } from "drizzle-orm";

export async function emailScrapeHandler(req: Request, res: Response) {
  const startedAt = Date.now();

  // Auth: x-cron-secret header must match SYSTEM_CRON_SECRET (sent by Google Cloud Scheduler).
  // Allow localhost for dev/test without auth.
  const ip = req.ip ?? "";
  const isInternal = ip === "127.0.0.1" || ip === "::1" || ip.startsWith("::ffff:127.");
  const secret = req.headers["x-cron-secret"];
  if (!isInternal && secret !== ENV.systemCronSecret) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  }

  // DB-03: Stale job sweep — mark any jobs stuck in 'running' for >15 min as failed.
  // Prevents the dashboard from showing perpetual "running" states after a server
  // restart or crash mid-scrape. Runs before every scrape to keep the table clean.
  try {
    const d = await getDb();
    if (d) {
      const staleThreshold = Date.now() - (15 * 60 * 1000);
      const staleResult = await d.update(emailScrapeJobs)
        .set({
          status: "failed" as any,
          completedAt: Date.now(),
          errorMessage: "Job timed out — marked failed by startup sweep. Was stuck in running state for >15 min.",
        })
        .where(and(eq(emailScrapeJobs.status, "running" as any), lt(emailScrapeJobs.startedAt, staleThreshold)));
      const swept = (staleResult as any)?.rowsAffected ?? 0;
      if (swept > 0) {
        console.log(`[EmailScrape] Startup sweep: reset ${swept} stale running job(s) to failed`);
      }
    }
  } catch (sweepErr) {
    // Non-fatal — log and continue with the scrape
    console.warn("[EmailScrape] Stale job sweep failed (non-fatal):", (sweepErr as Error)?.message);
  }

  try {
    console.log("[EmailScrape] Starting scheduled email scrape for all platforms");

    const results = await scrapeAllMultiPlatformEmails();

    let totalEnriched = 0;
    let totalEmails = 0;
    let totalErrors = 0;
    const errorDetails: string[] = [];

    for (const r of results) {
      totalEnriched += r.bookingsEnriched ?? 0;
      totalEmails += r.emailsProcessed ?? 0;
      if (r.errors && r.errors.length > 0) {
        totalErrors += r.errors.length;
        errorDetails.push(...r.errors.map((e: string) => `[${r.platformId ?? "?"}] ${e}`));
      }
    }

    const durationMs = Date.now() - startedAt;
    console.log(`[EmailScrape] Complete: ${results.length} platforms, ${totalEnriched} enriched, ${totalEmails} emails processed, ${totalErrors} errors, ${durationMs}ms`);

    return res.json({
      ok: true,
      platforms: results.length,
      bookingsEnriched: totalEnriched,
      emailsProcessed: totalEmails,
      errors: totalErrors,
      durationMs,
      ...(errorDetails.length > 0 ? { errorDetails } : {}),
    });
  } catch (err) {
    const error = (err as Error)?.message ?? String(err);
    console.error("[EmailScrape] Fatal error:", err);
    return res.status(500).json({
      error,
      stack: (err as Error)?.stack,
      context: { url: req.url },
      timestamp: new Date().toISOString(),
    });
  }
}
