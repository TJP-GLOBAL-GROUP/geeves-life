/**
 * notification.ts — GCP migration shim
 * Re-exports from cloudNotification.ts with legacy type aliases preserved.
 */
import { notifyOwner as _notifyOwner, type NotificationParams } from "./cloudNotification";
export type { NotificationParams };
/** Legacy alias — all callers used NotificationPayload */
export type NotificationPayload = NotificationParams;
export { notifyOwner } from "./cloudNotification";
