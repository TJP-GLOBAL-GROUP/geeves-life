/**
 * Google Cloud Pub/Sub notification wrapper — replaces Manus Forge notifyOwner
 * Sends notifications via Cloud Pub/Sub topic to owner's email
 */

import { PubSub } from "@google-cloud/pubsub";
import { Resend } from "resend";
import { ENV } from "./env";

let _pubsub: PubSub | null = null;
let _resend: Resend | null = null;

function getPubSub(): PubSub {
  if (_pubsub) return _pubsub;
  _pubsub = new PubSub({ projectId: ENV.gcpProjectId });
  return _pubsub;
}

function getResend(): Resend {
  if (_resend) return _resend;
  if (!ENV.resendApiKey) {
    throw new Error("RESEND_API_KEY environment variable is not set");
  }
  _resend = new Resend(ENV.resendApiKey);
  return _resend;
}

export type NotificationParams = {
  title: string;
  content: string;
  priority?: "low" | "normal" | "high";
  tags?: string[];
};

/**
 * Send notification to owner via email (using Resend)
 * Falls back to Pub/Sub for internal processing
 */
export async function notifyOwner(params: NotificationParams): Promise<boolean> {
  try {
    const ownerEmail = ENV.guardianAlertEmail || "tarik@geeves.life";

    // Primary: Send via Resend email service
    if (ENV.resendApiKey) {
      try {
        const resend = getResend();
        await resend.emails.send({
          from: "notifications@geeves.life",
          to: ownerEmail,
          subject: params.title,
          html: `
            <h2>${params.title}</h2>
            <p>${params.content}</p>
            ${params.tags ? `<p><strong>Tags:</strong> ${params.tags.join(", ")}</p>` : ""}
            <p style="color: #999; font-size: 12px;">Sent from Geeves.Life</p>
          `,
        });

        console.log(`[Notification] Email sent to ${ownerEmail}`);
        return true;
      } catch (emailError) {
        console.warn("[Notification] Email send failed, falling back to Pub/Sub:", emailError);
      }
    }

    // Fallback: Publish to Pub/Sub topic for async processing
    const pubsub = getPubSub();
    const topicName = "geeves-notifications";

    try {
      const topic = pubsub.topic(topicName);
      const messageData = JSON.stringify({
        title: params.title,
        content: params.content,
        priority: params.priority || "normal",
        tags: params.tags || [],
        timestamp: new Date().toISOString(),
        recipient: ownerEmail,
      });

      const messageId = await topic.publish(Buffer.from(messageData));
      console.log(`[Notification] Published to Pub/Sub: ${messageId}`);
      return true;
    } catch (pubsubError) {
      console.error("[Notification] Pub/Sub publish failed:", pubsubError);
      // If both fail, log but don't crash
      return false;
    }
  } catch (error) {
    console.error("[Notification] Error sending notification:", error);
    return false;
  }
}

/**
 * Batch send notifications
 */
export async function notifyOwnerBatch(notifications: NotificationParams[]): Promise<number> {
  let successCount = 0;

  for (const notification of notifications) {
    const success = await notifyOwner(notification);
    if (success) successCount++;
  }

  return successCount;
}
