// Exchange Rate Daily Fetch Heartbeat Handler
// Endpoint: POST /api/scheduled/exchange-rate-fetch
// Auth:     x-cron-secret header (SYSTEM_CRON_SECRET) — Google Cloud Scheduler compatible
// Schedule: Daily at 06:00 UTC - cron 6-field: 0 0 6 * * *
// Fetches today's exchange rates for all active currency pairs and stores them
// in the global exchange_rates table. Also backfills any missing recent dates.
// Idempotent - uses INSERT IGNORE to avoid duplicates.

import type { Request, Response } from "express";
import { getDb } from "../db";
import { ENV } from "../_core/env";
import { sql } from "drizzle-orm";

const API_BASE = "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api";

// Active currency pairs to maintain
const CURRENCY_PAIRS = [
  { base: "USD", target: "JMD" },
  // Add more pairs here as households onboard with different currencies
];

async function fetchRate(date: string, base: string, target: string): Promise<number | null> {
  const url = `${API_BASE}@${date}/v1/currencies/${base.toLowerCase()}.json`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json() as Record<string, any>;
    const rates = data[base.toLowerCase()];
    return rates?.[target.toLowerCase()] ?? null;
  } catch {
    return null;
  }
}

export async function exchangeRateFetchHandler(req: Request, res: Response) {
  const startedAt = Date.now();

  // Auth: x-cron-secret header must match SYSTEM_CRON_SECRET (sent by Google Cloud Scheduler).
  // Allow localhost for dev/test without auth.
  const ip = req.ip ?? "";
  const isInternal = ip === "127.0.0.1" || ip === "::1" || ip.startsWith("::ffff:127.");
  const secret = req.headers["x-cron-secret"];
  if (!isInternal && secret !== ENV.systemCronSecret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: "Database not available" });
    }

    // Check for any gaps in the last 7 days (weekends/holidays may have been missed)
    const datesToCheck: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      datesToCheck.push(d.toISOString().slice(0, 10));
    }

    let inserted = 0;
    let skipped = 0;

    for (const pair of CURRENCY_PAIRS) {
      for (const date of datesToCheck) {
        // Check if rate already exists
        const existing = await db.execute(
          sql`SELECT id FROM exchange_rates WHERE rateDate = ${date} AND baseCurrency = ${pair.base} AND targetCurrency = ${pair.target} LIMIT 1`
        );

        if (existing.length > 0) {
          skipped++;
          continue;
        }

        // Fetch from API
        const rate = await fetchRate(date, pair.base, pair.target);
        if (rate && rate > 0) {
          const inverseRate = parseFloat((1 / rate).toFixed(8));
          await db.execute(
            sql`INSERT IGNORE INTO exchange_rates (rateDate, baseCurrency, targetCurrency, rate, inverseRate, source) VALUES (${date}, ${pair.base}, ${pair.target}, ${rate}, ${inverseRate}, 'fawazahmed0')`
          );
          inserted++;
        } else {
          // Use nearest prior rate as fallback (for weekends)
          const nearest = await db.execute(
            sql`SELECT rate, inverseRate FROM exchange_rates WHERE baseCurrency = ${pair.base} AND targetCurrency = ${pair.target} AND rateDate < ${date} ORDER BY rateDate DESC LIMIT 1`
          );

          if (nearest.length > 0) {
            const row = nearest[0] as any;
            await db.execute(
              sql`INSERT IGNORE INTO exchange_rates (rateDate, baseCurrency, targetCurrency, rate, inverseRate, source) VALUES (${date}, ${pair.base}, ${pair.target}, ${row.rate}, ${row.inverseRate}, 'fawazahmed0')`
            );
            inserted++;
          }
        }
      }
    }

    const elapsed = Date.now() - startedAt;
    return res.json({
      ok: true,
      inserted,
      skipped,
      pairs: CURRENCY_PAIRS.length,
      datesChecked: datesToCheck.length,
      elapsed: `${elapsed}ms`,
    });
  } catch (error: any) {
    console.error("[exchange-rate-fetch] Error:", error);
    return res.status(500).json({
      error: error.message,
      stack: error.stack?.split("\n").slice(0, 5),
      context: { url: req.url },
      timestamp: new Date().toISOString(),
    });
  }
}
