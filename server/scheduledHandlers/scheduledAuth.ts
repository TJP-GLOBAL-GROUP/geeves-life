// Shared auth guard for all /api/scheduled/* (and /api/internal/*) heartbeat handlers.
//
// Google Cloud Scheduler authenticates by sending the header:
//     x-cron-secret: <SYSTEM_CRON_SECRET>
//
// The secret MUST match the SYSTEM_CRON_SECRET env var on the Cloud Run service.
// On Cloud Run that env var is injected from GCP Secret Manager secret
// "geeves-live-cron-secret" (see .github/workflows/deploy-cloudrun.yml). The
// scheduler jobs must be created/updated with the SAME secret value — see
// ops/setup-cloud-scheduler.sh, which reads geeves-live-cron-secret and sets
// the x-cron-secret header on every job.
//
// Fail-closed: if SYSTEM_CRON_SECRET is unset/empty, every non-localhost
// request is rejected with 401 and a loud boot-time log explains why.
import type { Request, Response } from "express";
import crypto from "crypto";
import { ENV } from "../_core/env";

let warnedMissingSecret = false;

/** Call once at server boot so a missing secret is visible in Cloud Run logs. */
export function warnIfCronSecretMissing(): void {
  if (!ENV.systemCronSecret && !warnedMissingSecret) {
    warnedMissingSecret = true;
    console.error(
      "[ScheduledAuth] SYSTEM_CRON_SECRET is NOT set. " +
        "ALL /api/scheduled/* endpoints will return 401 Unauthorized. " +
        "Set SYSTEM_CRON_SECRET on the Cloud Run service (GCP Secret Manager: " +
        "geeves-live-cron-secret) and configure Cloud Scheduler jobs to send " +
        "the same value as the x-cron-secret header (see ops/setup-cloud-scheduler.sh)."
    );
  }
}

function isInternalIp(ip: string): boolean {
  return ip === "127.0.0.1" || ip === "::1" || ip.startsWith("::ffff:127.");
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/**
 * Returns true if the request is authorized; otherwise sends a 401 response
 * and returns false. Localhost is always allowed for dev/test.
 */
export function requireCronAuth(req: Request, res: Response, label = "ScheduledAuth"): boolean {
  if (isInternalIp(req.ip ?? "")) return true;

  if (!ENV.systemCronSecret) {
    warnIfCronSecretMissing();
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }

  const header = req.headers["x-cron-secret"];
  const provided = Array.isArray(header) ? header[0] : header;
  if (!provided || !safeEqual(provided, ENV.systemCronSecret)) {
    console.warn(
      `[${label}] 401 Unauthorized ${req.method} ${req.originalUrl} — ` +
        (provided ? "x-cron-secret mismatch" : "missing x-cron-secret header")
    );
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }

  return true;
}
