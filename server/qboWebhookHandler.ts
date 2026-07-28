/**
 * Intuit Webhook Handler
 *
 * Receives entity change events from QuickBooks Online.
 * Verifies HMAC-SHA256 signature using QBO_WEBHOOK_TOKEN secret.
 *
 * Events handled:
 *   - Account (Chart of Accounts changes)
 *   - Bill / Purchase (expense creation/update)
 *   - Class (vertical tracking changes)
 *   - Customer / Vendor (entity changes)
 *   - JournalEntry (manual journal entries)
 *
 * Each event is validated, queued for processing, and ack'd immediately.
 * Processing is async to avoid webhook timeouts.
 */

import type { Request, Response } from "express";
import { createHmac, timingSafeEqual } from "crypto";
import * as db from "./db";
import { syncChartOfAccounts } from "./qboApiClient";

// ─── Signature Verification ───────────────────────────────────────────────────

/**
 * Verify Intuit webhook signature.
 * Intuit sends: intuit-signature: sha256={hmac}
 * We compute HMAC-SHA256(payload, webhookToken) and compare.
 */
function verifyWebhookSignature(payload: string, signature: string): boolean {
  const token = process.env.QBO_WEBHOOK_TOKEN;
  if (!token) {
    console.warn("[QBO Webhook] QBO_WEBHOOK_TOKEN not set — rejecting webhook");
    return false;
  }

  const expected = `sha256=${createHmac("sha256", token).update(payload).digest("hex")}`;
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

// ─── Event Types ──────────────────────────────────────────────────────────────

interface IntuitWebhookEvent {
  name: string;        // e.g. "Account", "Bill", "Purchase", "Class"
  id: string;          // Entity ID
  operation: string;   // "Create", "Update", "Delete", "Void"
  lastUpdated: string; // ISO timestamp
  realmId: string;     // Company realm ID
}

interface IntuitWebhookPayload {
  eventNotifications: Array<{
    realmId: string;
    dataChangeEvent: {
      entities: IntuitWebhookEvent[];
    };
  }>;
}

// ─── Processing ───────────────────────────────────────────────────────────────

const processingQueue = new Map<string, Promise<void>>();

async function processEvent(event: IntuitWebhookEvent): Promise<void> {
  console.log(`[QBO Webhook] Processing ${event.operation} ${event.name} ${event.id} for realm ${event.realmId}`);

  try {
    switch (event.name) {
      case "Account":
        await handleAccountChange(event);
        break;
      case "Class":
        await handleClassChange(event);
        break;
      case "Bill":
      case "Purchase":
        await handlePurchaseChange(event);
        break;
      case "Customer":
      case "Vendor":
        await handleEntityChange(event);
        break;
      case "JournalEntry":
        await handleJournalEntryChange(event);
        break;
      default:
        console.log(`[QBO Webhook] Unhandled entity type: ${event.name}`);
    }
  } catch (err) {
    console.error(`[QBO Webhook] Failed to process ${event.name} ${event.id}:`, (err as Error)?.message);
  }
}

async function handleAccountChange(event: IntuitWebhookEvent): Promise<void> {
  // Sync the full Chart of Accounts when any account changes
  // This is a full sync (not incremental) to keep things simple and correct
  console.log(`[QBO Webhook] Account ${event.operation}: ${event.id}, triggering CoA sync`);
  await syncChartOfAccounts(event.realmId);
}

async function handleClassChange(event: IntuitWebhookEvent): Promise<void> {
  // Queue class sync — classes are used for vertical tracking
  console.log(`[QBO Webhook] Class ${event.operation}: ${event.id}`);
  // Incremental: just update this one class
  // (Full class sync happens less frequently)
}

async function handlePurchaseChange(event: IntuitWebhookEvent): Promise<void> {
  // Log the change for audit — purchases pushed from Geeves will have our trace IDs
  console.log(`[QBO Webhook] Purchase ${event.operation}: ${event.id}`);
  // Check if this was a Geeves-originated purchase (has our PrivateNote marker)
  // If so, update the sync queue status
  const dbInstance = await db.getDb();
  if (!dbInstance) return;
  const { qboTransactionSyncQueue } = await import("../drizzle/schema");
  const { eq } = await import("drizzle-orm");
  await dbInstance
    .update(qboTransactionSyncQueue)
    .set({ syncStatus: "confirmed_qbo", qboTxnId: event.id, updatedAt: new Date() })
    .where(eq(qboTransactionSyncQueue.qboTxnId, event.id));
}

async function handleEntityChange(event: IntuitWebhookEvent): Promise<void> {
  console.log(`[QBO Webhook] Entity ${event.operation}: ${event.name} ${event.id}`);
  // For now, just log — customer/vendor sync happens on-demand
}

async function handleJournalEntryChange(event: IntuitWebhookEvent): Promise<void> {
  console.log(`[QBO Webhook] JournalEntry ${event.operation}: ${event.id}`);
  // Journal entries are manual — log for audit, no auto-processing
}

// ─── Express Handler ──────────────────────────────────────────────────────────

export async function qboWebhookHandler(req: Request, res: Response): Promise<void> {
  const signature = req.headers["intuit-signature"] as string;
  if (!signature) {
    res.status(401).json({ error: "Missing intuit-signature header" });
    return;
  }

  const payload = JSON.stringify(req.body);
  if (!verifyWebhookSignature(payload, signature)) {
    console.warn("[QBO Webhook] Signature verification failed — possible forged request");
    res.status(401).json({ error: "Invalid signature" });
    return;
  }

  let data: IntuitWebhookPayload;
  try {
    data = req.body;
  } catch {
    res.status(400).json({ error: "Invalid JSON payload" });
    return;
  }

  // Ack immediately (Intuit requires 200 within 3 seconds)
  res.status(200).json({ received: true });

  // Process async
  const events: IntuitWebhookEvent[] = [];
  for (const notification of data.eventNotifications || []) {
    for (const entity of notification.dataChangeEvent?.entities || []) {
      events.push({ ...entity, realmId: notification.realmId });
    }
  }

  console.log(`[QBO Webhook] Received ${events.length} events from ${data.eventNotifications?.length} realms`);

  for (const event of events) {
    const key = `${event.realmId}-${event.name}-${event.id}-${event.operation}`;
    // Deduplicate in-flight processing
    if (processingQueue.has(key)) continue;

    const promise = processEvent(event).finally(() => {
      processingQueue.delete(key);
    });
    processingQueue.set(key, promise);
  }
}
