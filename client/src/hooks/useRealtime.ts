import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { trpc } from "@/lib/trpc";

let socket: Socket | null = null;

function getSocket(): Socket {
  if (!socket) {
    socket = io(window.location.origin, {
      path: "/socket.io",
      transports: ["websocket", "polling"],
      autoConnect: true,
    });
  }
  return socket;
}

/**
 * Join a household room and listen for real-time calendar events.
 * Returns a disconnect function.
 */
export function useRealtimeCalendar(householdId: string | undefined) {
  const utils = trpc.useUtils();
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!householdId) return;

    const s = getSocket();
    socketRef.current = s;

    s.emit("join:household", householdId);

    // Listen for calendar event changes
    const handleCalendarEvent = (data: { action: string; event: any }) => {
      // Invalidate calendar queries to refetch
      utils.calendar.events.list.invalidate();
    };

    const handleShadowBlock = (data: { action: string; block: any }) => {
      utils.calendar.events.list.invalidate();
    };

    const handleMemberUpdate = (data: { action: string; member: any }) => {
      utils.household.members.list.invalidate();
    };

    s.on("calendar:event", handleCalendarEvent);
    s.on("calendar:shadow", handleShadowBlock);
    s.on("household:member", handleMemberUpdate);

    return () => {
      s.off("calendar:event", handleCalendarEvent);
      s.off("calendar:shadow", handleShadowBlock);
      s.off("household:member", handleMemberUpdate);
    };
  }, [householdId, utils]);
}

/**
 * Listen for personal notifications directed at a specific member.
 * Also registers the member's socket for presence tracking.
 */
export function useRealtimeNotifications(
  memberId: string | undefined,
  householdIdOrCallback?: string | ((n: any) => void),
  onNotification?: (n: any) => void,
) {
  // Support legacy 2-arg signature: useRealtimeNotifications(memberId, onNotification)
  const householdId = typeof householdIdOrCallback === "string" ? householdIdOrCallback : undefined;
  const cb = typeof householdIdOrCallback === "function" ? householdIdOrCallback : onNotification;

  useEffect(() => {
    if (!memberId) return;
    const s = getSocket();
    if (householdId) s.emit("join:household", householdId);
    s.emit("join:member", memberId);
    const handler = (notification: any) => { cb?.(notification); };
    s.on("notification", handler);
    return () => { s.off("notification", handler); };
  }, [memberId, householdId, cb]);
}

/**
 * Track which household members are currently online (have an active socket).
 * Returns a Set of member IDs that are online.
 */
export function usePresence(householdId: string | undefined): Set<string> {
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!householdId) return;
    const s = getSocket();
    const handler = (data: { memberId: string; online: boolean }) => {
      setOnlineIds(prev => {
        const next = new Set(prev);
        if (data.online) next.add(data.memberId);
        else next.delete(data.memberId);
        return next;
      });
    };
    s.on("presence:update", handler);
    return () => { s.off("presence:update", handler); };
  }, [householdId]);
  return onlineIds;
}

/**
 * Listen for calendar sync status updates.
 */
export function useRealtimeSyncStatus(householdId: string | undefined, onSyncUpdate?: (data: any) => void) {
  useEffect(() => {
    if (!householdId) return;

    const s = getSocket();
    const handler = (data: any) => { onSyncUpdate?.(data); };
    s.on("calendar:sync", handler);
    return () => { s.off("calendar:sync", handler); };
  }, [householdId, onSyncUpdate]);
}
