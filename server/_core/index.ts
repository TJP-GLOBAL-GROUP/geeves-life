import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { setupGoogleOAuth } from "../auth/googleOAuth";
import { setupGoogleAccountConnect } from "../auth/googleAccountConnect";
import { setupIntuitOAuth } from "../intuitOAuth";
import { setupRealtime } from "../realtime";
import { setupCalendarWebhook, registerAllWebhooks } from "../services/calendarWebhook";
import { knowledgeReviewHandler } from "../scheduledHandlers/knowledgeReview";
import { icalPollHandler } from "../scheduledHandlers/icalPoll";
import { shadowBlockBackfillHandler } from "../scheduledHandlers/shadowBlockBackfill";
import { familyCalendarCleanupHandler } from "../scheduledHandlers/familyCalendarCleanup";
import { weeklyReportHandler } from "../scheduledHandlers/weeklyReport";
import { emailScrapeHandler } from "../scheduledHandlers/emailScrape";
import { tokenRefreshHandler } from "../scheduledHandlers/tokenRefresh";
import { integrationHealthCheckHandler } from "../scheduledHandlers/integrationHealthCheck";
import { orphanSweepHandler } from "../scheduledHandlers/orphanSweep";
import { propagationRetryHandler } from "../scheduledHandlers/propagationRetry";
import { shadowBlockSyncRetryHandler } from "../scheduledHandlers/shadowBlockSyncRetry";
import { exchangeRateFetchHandler } from "../scheduledHandlers/exchangeRateFetch";
import { guardianMonitorHandler } from "../scheduledHandlers/guardianMonitor";
import { guardianDailyDigestHandler } from "../scheduledHandlers/guardianDailyDigest";
import { guardianFinancialSweepHandler } from "../scheduledHandlers/guardianFinancialSweep";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { editsApiRouter } from "../editsApi";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Trust the first proxy hop (Cloud Run / Manus load balancer) so express-rate-limit
  // can correctly read the real client IP from X-Forwarded-For without throwing
  // ERR_ERL_UNEXPECTED_X_FORWARDED_FOR in production.
  app.set("trust proxy", 1);

  // ── Security headers (Helmet) ──────────────────────────────────────────
  // Relaxed CSP: Vite HMR and tRPC need script-src 'self' + 'unsafe-inline'.
  // In production, tighten script-src to remove 'unsafe-inline' and add nonces.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          fontSrc: ["'self'", "https://fonts.gstatic.com"],
          imgSrc: ["'self'", "data:", "blob:", "https:"],
          connectSrc: ["'self'", "wss:", "ws:", "https:"],
          frameSrc: ["'none'"],
          objectSrc: ["'none'"],
          upgradeInsecureRequests: process.env.NODE_ENV === "production" ? [] : null,
        },
      },
      // Disable COEP — Google Maps and third-party iframes need cross-origin resources
      crossOriginEmbedderPolicy: false,
    })
  );

  // ── Rate limiting ──────────────────────────────────────────────────────
  // General API: 1500 req / 15 min per IP (dashboard makes many tRPC calls)
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1500,
    standardHeaders: true,
    legacyHeaders: false,
    // Must return tRPC-shaped error so superjson client can parse it
    handler: (_req, res) => {
      res.status(429).json({
        error: {
          json: {
            message: "Too many requests, please try again later.",
            code: -32603,
            data: { code: "TOO_MANY_REQUESTS", httpStatus: 429 },
          },
        },
      });
    },
  });
  // Auth endpoints: 20 req / 15 min per IP (brute-force protection)
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({
        error: {
          json: {
            message: "Too many authentication attempts, please try again later.",
            code: -32603,
            data: { code: "TOO_MANY_REQUESTS", httpStatus: 429 },
          },
        },
      });
    },
  });
  app.use("/api/trpc", apiLimiter);

  // Configure body parser — 10 MB for regular JSON, 50 MB for file upload endpoints
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ limit: "10mb", extended: true }));

  // ── Health check endpoint (used by GitHub Actions smoke test + Cloud Run) ──
  app.get("/api/health", (_req, res) => {
    res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Google OAuth routes (skips if credentials not configured)
  setupGoogleOAuth(app);
  // Google account connect routes (add additional Google accounts to existing session)
  setupGoogleAccountConnect(app);
  // Intuit/QBO OAuth routes (skips if QBO_CLIENT_ID not configured)
  setupIntuitOAuth(app);
  // Google Calendar webhook endpoint
  setupCalendarWebhook(app);
  // Scheduled: 24h knowledge base review (heartbeat cron)
  app.post("/api/scheduled/knowledge-review", knowledgeReviewHandler);
  // Scheduled: 10-min iCal polling for all property platforms
  app.post("/api/scheduled/ical-poll", icalPollHandler);

  // Reconciliation Explorer write-back API (CORS-open, secret-gated)
  app.use("/api", editsApiRouter);
  app.post("/api/scheduled/email-scrape", emailScrapeHandler);
  // P-25: Proactive token refresh — runs every 45 min to prevent expiry-between-syncs failures
  app.post("/api/scheduled/token-refresh", tokenRefreshHandler);
  // P-34: Integration health smoke test — verifies all tokens have required scopes for their purposes
  app.post("/api/scheduled/integration-health", integrationHealthCheckHandler);
  // DB-05: Weekly orphan sweep — removes events/shadow_blocks with no parent calendar
  app.post("/api/scheduled/orphan-sweep", orphanSweepHandler);
  app.post("/api/internal/shadow-block-backfill", shadowBlockBackfillHandler);
  // Propagation retry queue — drains pending items every 2 min
  app.post("/api/scheduled/propagation-retry", propagationRetryHandler);
  // P4: Shadow block sync retry — writes pending_sync/sync_failed blocks to Google Calendar
  app.post("/api/scheduled/shadow-block-sync-retry", shadowBlockSyncRetryHandler);
  app.post("/api/internal/family-calendar-cleanup", familyCalendarCleanupHandler);
  // FX-01: Daily exchange rate fetch — populates exchange_rates table for multi-currency reporting
  app.post("/api/scheduled/exchange-rate-fetch", exchangeRateFetchHandler);
  // Guardian: Active Guardian system — GR-1 through GR-7
  app.post("/api/scheduled/guardian-monitor", guardianMonitorHandler);     // Every 5 min
  app.post("/api/scheduled/guardian-digest", guardianDailyDigestHandler);  // Daily at 08:00
  app.post("/api/scheduled/guardian-financial", guardianFinancialSweepHandler); // Every 30 min
  // Admin: reset the shadow block circuit breaker (requires SYSTEM_CRON_SECRET header)
  app.post("/api/internal/reset-circuit-breaker", async (req, res) => {
    const cronSecret = process.env.SYSTEM_CRON_SECRET;
    if (cronSecret && req.headers["x-cron-secret"] !== cronSecret) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const { resetCircuitBreaker } = await import("../services/eventPropagation");
    resetCircuitBreaker();
    return res.json({ ok: true, message: "Circuit breaker reset" });
  });
  // Admin: Force re-propagate a single event (deletes stale SBs and re-creates with current times)
  app.post("/api/internal/repropagate-event", async (req, res) => {
    const cronSecret = process.env.SYSTEM_CRON_SECRET;
    if (cronSecret && req.headers["x-cron-secret"] !== cronSecret) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const { eventId, householdId } = req.body ?? {};
    if (!eventId) return res.status(400).json({ error: "eventId required" });
    const { onEventUpserted } = await import("../services/eventPropagation");
    const db = await import("../db");
    let hId = householdId;
    if (!hId) {
      const event = await db.getEvent(eventId);
      if (!event) return res.status(404).json({ error: "Event not found" });
      const cal = await db.getCalendar(event.calendarId);
      hId = cal?.householdId;
    }
    if (!hId) return res.status(400).json({ error: "Could not determine householdId" });
    try {
      await onEventUpserted(eventId, hId, { skipGoogleWrite: true, skipRateLimit: true });
      return res.json({ ok: true, message: `Re-propagated event ${eventId}` });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });
  // Admin: Send ad-hoc email via Resend (internal use — requires x-cron-secret)
  app.post("/api/internal/send-email", async (req, res) => {
    const cronSecret = process.env.SYSTEM_CRON_SECRET;
    if (cronSecret && req.headers["x-cron-secret"] !== cronSecret) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const { to, subject, html, text, fromName, fromEmail } = req.body ?? {};
    if (!to || !subject || !html) {
      return res.status(400).json({ error: "to, subject, and html are required" });
    }
    const { ENV } = await import("./env");
    if (!ENV.resendApiKey) {
      return res.status(500).json({ error: "RESEND_API_KEY not configured" });
    }
    const from = fromEmail
      ? `${fromName || "Geeves.Life"} <${fromEmail}>`
      : `${fromName || "Tarik Perkins"} <invites@geeves.life>`;
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ENV.resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ from, to: [to], subject, html, text: text || "" }),
      });
      const body = await response.json();
      if (!response.ok) {
        return res.status(502).json({ error: "Resend API error", status: response.status, detail: body });
      }
      return res.json({ ok: true, resendId: body.id, to, subject });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });
  // Admin: weekly governance report delivery via Resend
  // Auth: x-cron-secret header must match SYSTEM_CRON_SECRET env var
  app.post("/api/admin/system-reports/weekly", weeklyReportHandler);
  // Socket.io real-time
  setupRealtime(server);
  // GCS storage proxy (must be registered before tRPC)
  registerStorageProxy(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ── Global error handler ───────────────────────────────────────────────
  // Must be the LAST middleware. Catches any uncaught errors from above.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("[Express Error]", err?.message || err, err?.stack);
    res.status(500).json({ error: "Internal server error", message: err?.message });
  });

  // Cloud Run fix: in production bind exactly 0.0.0.0:$PORT (no port probing —
  // the probe race can steal the port from the startup probe or shift us to
  // 8081, which Cloud Run does not forward to). Dev keeps the probing behavior.
  const isProd = process.env.NODE_ENV === "production";
  const preferredPort = parseInt(process.env.PORT || (isProd ? "8080" : "3000"));
  const port = isProd ? preferredPort : await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${port}/`);
    // Register Google Calendar push webhooks for all calendars after server is up
    setTimeout(() => registerAllWebhooks().catch(console.warn), 5000);
  });
}

startServer().catch(console.error);
