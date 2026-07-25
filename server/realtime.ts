/**
 * Socket.io Real-Time Infrastructure for Geeves Life
 * 
 * Handles:
 * - Calendar event updates (create/update/delete)
 * - Household member presence
 * - Notification broadcasts
 * - Shadow block changes
 */

import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";

let io: Server | null = null;

// ── Presence tracking ────────────────────────────────────────────────────────────────────
// memberId → Set of socketIds (a member can have multiple tabs open)
const memberSockets = new Map<string, Set<string>>();
// socketId → { memberId, householdId } for cleanup on disconnect
const socketMeta = new Map<string, { memberId?: string; householdId?: string }>();

/** Returns the set of member IDs that currently have at least one socket open */
export function getOnlineMemberIds(): Set<string> {
  const online = new Set<string>();
  Array.from(memberSockets.entries()).forEach(([memberId, sockets]) => {
    if (sockets.size > 0) online.add(memberId);
  });
  return online;
}

export function setupRealtime(server: HttpServer) {
  // Restrict Socket.io CORS to the app's own origin.
  // In production, APP_URL is set by the platform; in dev, allow localhost ports.
  const allowedOrigins = process.env.APP_URL
    ? [process.env.APP_URL, "http://localhost:3000", "http://localhost:5173"]
    : ["*"];
  io = new Server(server, {
    cors: { origin: allowedOrigins, methods: ["GET", "POST"], credentials: true },
    path: "/socket.io",
    transports: ["websocket", "polling"],
  });

  io.on("connection", (socket: Socket) => {
    console.log(`[Realtime] Client connected: ${socket.id}`);
    socketMeta.set(socket.id, {});

    // Join household room
    socket.on("join:household", (householdId: string) => {
      socket.join(`household:${householdId}`);
      const meta = socketMeta.get(socket.id) ?? {};
      meta.householdId = householdId;
      socketMeta.set(socket.id, meta);
      console.log(`[Realtime] ${socket.id} joined household:${householdId}`);
    });

    // Join member-specific room (for personal notifications) + presence tracking
    socket.on("join:member", (memberId: string) => {
      socket.join(`member:${memberId}`);
      const meta = socketMeta.get(socket.id) ?? {};
      meta.memberId = memberId;
      socketMeta.set(socket.id, meta);
      // Track presence
      if (!memberSockets.has(memberId)) memberSockets.set(memberId, new Set());
      memberSockets.get(memberId)!.add(socket.id);
      // Broadcast presence update to the household
      if (meta.householdId && io) {
        io.to(`household:${meta.householdId}`).emit("presence:update", { memberId, online: true });
      }
    });

    // Leave rooms on disconnect — clean up presence
    socket.on("disconnect", () => {
      console.log(`[Realtime] Client disconnected: ${socket.id}`);
      const meta = socketMeta.get(socket.id);
      if (meta?.memberId) {
        const sockets = memberSockets.get(meta.memberId);
        if (sockets) {
          sockets.delete(socket.id);
          if (sockets.size === 0) {
            memberSockets.delete(meta.memberId);
            if (meta.householdId && io) {
              io.to(`household:${meta.householdId}`).emit("presence:update", { memberId: meta.memberId, online: false });
            }
          }
        }
      }
      socketMeta.delete(socket.id);
    });
  });

  console.log("[Realtime] Socket.io initialized");
  return io;
}

// ─── Emit Helpers ───────────────────────────────────────────────────

export function emitCalendarEvent(householdId: string, action: "created" | "updated" | "deleted", event: any) {
  if (!io) return;
  io.to(`household:${householdId}`).emit("calendar:event", { action, event });
}

export function emitShadowBlockChange(householdId: string, action: "created" | "dismissed", block: any) {
  if (!io) return;
  io.to(`household:${householdId}`).emit("calendar:shadow", { action, block });
}

export function emitMemberUpdate(householdId: string, action: "joined" | "updated" | "removed", member: any) {
  if (!io) return;
  io.to(`household:${householdId}`).emit("household:member", { action, member });
}

export function emitNotification(memberId: string, notification: { title: string; body: string; type: string; data?: any }) {
  if (!io) return;
  io.to(`member:${memberId}`).emit("notification", notification);
}

export function emitSyncStatus(householdId: string, calendarId: string, status: "syncing" | "synced" | "error", details?: string) {
  if (!io) return;
  io.to(`household:${householdId}`).emit("calendar:sync", { calendarId, status, details });
}

export function getIO(): Server | null {
  return io;
}
