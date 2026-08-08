// Propagation Retry Queue Heartbeat Handler
// Endpoint: POST /api/scheduled/propagation-retry
// Auth:     x-cron-secret header (SYSTEM_CRON_SECRET) — Google Cloud Scheduler compatible
// Schedule: Every 2 minutes - cron 6-field: 0 */2 * * * *
//
// Drains the propagation_queue table: picks up pending items whose nextRetryAt
// has passed, re-invokes onEventUpserted with skipRateLimit=true, and marks
// them resolved or bumps attempts with exponential backoff.
import type { Request, Response } from "express";
import { getDb } from "../db";
import { propagationQueue, shadowBlocks } from "../../drizzle/schema";
import { eq, and, lte, count } from "drizzle-orm";
import { onEventUpserted } from "../services/eventPropagation";
import { requireCronAuth } from "./scheduledAuth";

const BATCH_SIZE = 200; // increased from 50 to speed up backfill drain

export async function propagationRetryHandler(req: Request, res: Response) {
  const startedAt = Date.now();

  // Auth: x-cron-secret header must match SYSTEM_CRON_SECRET (sent by Google Cloud Scheduler).
  // Allow localhost for dev/test without auth.
  if (!requireCronAuth(req, res, "PropagationRetry")) return;

  const db = await getDb();
  if (!db) {
    return res.status(500).json({ error: "Database unavailable" });
  }

  try {
    const now = Date.now();

    // Fetch pending items ready for retry
    const items = await db
      .select()
      .from(propagationQueue)
      .where(
        and(
          eq(propagationQueue.status, "pending"),
          lte(propagationQueue.nextRetryAt, now),
        )
      )
      .limit(BATCH_SIZE);

    if (items.length === 0) {
      return res.json({ processed: 0, elapsed: Date.now() - startedAt });
    }

    let resolved = 0;
    let failed = 0;
    let retried = 0;

    for (const item of items) {
      try {
        // Re-propagate with skipRateLimit to bypass the in-memory limiter
        await onEventUpserted(item.eventId, item.householdId, {
          skipGoogleWrite: false,
          skipRateLimit: true,
        });

        // RC-3: don't trust a non-throwing return — onEventUpserted records
        // Google-write failures as sync_failed block rows rather than throwing.
        // Verify the outcome; if blocks are still failed, treat as a failed attempt.
        const [failedRow] = await db
          .select({ n: count() })
          .from(shadowBlocks)
          .where(
            and(
              eq(shadowBlocks.sourceEventId, item.eventId),
              eq(shadowBlocks.syncStatus, "sync_failed"),
            )
          );
        if ((failedRow?.n ?? 0) > 0) {
          throw new Error(`${failedRow!.n} shadow block(s) still sync_failed after retry`);
        }

        // Mark resolved
        await db
          .update(propagationQueue)
          .set({ status: "resolved", resolvedAt: Date.now() })
          .where(eq(propagationQueue.id, item.id));
        resolved++;
      } catch (err) {
        const newAttempts = item.attempts + 1;
        if (newAttempts >= item.maxAttempts) {
          // Mark as permanently failed
          await db
            .update(propagationQueue)
            .set({ status: "failed", attempts: newAttempts, resolvedAt: Date.now() })
            .where(eq(propagationQueue.id, item.id));
          failed++;
        } else {
          // Exponential backoff: 1min, 4min, 9min, 16min, 25min
          const backoffMs = Math.pow(newAttempts + 1, 2) * 60_000;
          await db
            .update(propagationQueue)
            .set({
              attempts: newAttempts,
              nextRetryAt: Date.now() + backoffMs,
            })
            .where(eq(propagationQueue.id, item.id));
          retried++;
        }
        console.warn(
          `[PropagationRetry] Event ${item.eventId} attempt ${newAttempts} failed:`,
          (err as Error)?.message,
        );
      }
    }

    console.log(
      `[PropagationRetry] Processed ${items.length} items: ${resolved} resolved, ${retried} retried, ${failed} failed (${Date.now() - startedAt}ms)`,
    );

    return res.json({
      processed: items.length,
      resolved,
      retried,
      failed,
      elapsed: Date.now() - startedAt,
    });
  } catch (err) {
    console.error("[PropagationRetry] Handler error:", err);
    return res.status(500).json({ error: (err as Error)?.message });
  }
}
