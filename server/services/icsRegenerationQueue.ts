import { getDb } from "../db";
import { icsRegenerationQueue, properties } from "../../drizzle/schema";
import { eq, isNull } from "drizzle-orm";
import { generateOutboundICS } from "./icalAggregator";

/**
 * Process pending ICS regeneration jobs from the queue.
 * Called at the end of every icalPollHandler run (every 10 minutes).
 * De-duplicates by propertyId so each property is regenerated at most once per cycle.
 */
export async function processIcsRegenerationQueue(): Promise<{
  processed: number;
  failed: number;
  details: string[];
}> {
  const db = await getDb();
  if (!db) return { processed: 0, failed: 0, details: ["DB not available"] };

  const pending = await db
    .select()
    .from(icsRegenerationQueue)
    .where(isNull(icsRegenerationQueue.processedAt))
    .limit(20);

  if (pending.length === 0) {
    return { processed: 0, failed: 0, details: [] };
  }

  const processed: string[] = [];
  const failed: string[] = [];

  // De-duplicate by propertyId — process each property once
  const propertyIds = Array.from(new Set(pending.map((p) => p.propertyId)));

  for (const propertyId of propertyIds) {
    try {
      const url = await generateOutboundICS(propertyId);
      await db
        .update(properties)
        .set({ outboundIcsUrl: url })
        .where(eq(properties.id, propertyId));
      processed.push(propertyId);
    } catch (err) {
      failed.push(`${propertyId}: ${(err as Error).message}`);
    }
  }

  // Mark all items for processed properties as done
  const now = Date.now();
  for (const item of pending) {
    if (processed.includes(item.propertyId)) {
      await db
        .update(icsRegenerationQueue)
        .set({ processedAt: now })
        .where(eq(icsRegenerationQueue.id, item.id));
    }
  }

  return {
    processed: processed.length,
    failed: failed.length,
    details: [...processed.map((p) => `OK: ${p}`), ...failed],
  };
}

/**
 * Manually queue a property for ICS regeneration.
 * Use this after any raw SQL update to propertyBookings.
 */
export async function queueIcsRegeneration(
  propertyId: string,
  reason: string
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(icsRegenerationQueue).values({
    propertyId,
    reason,
    createdAt: Date.now(),
  });
}
