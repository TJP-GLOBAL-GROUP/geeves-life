/**
 * Security Router — ISO 27001 / GDPR / CCPA compliance procedures
 *
 * Procedures:
 *  - audit.list       — paginated audit log (admin only)
 *  - audit.export     — full audit log export as JSON (admin only)
 *  - gdpr.exportData  — export all personal data for a user (GDPR Art. 20)
 *  - gdpr.deleteAccount — hard-delete all personal data for the requesting user (GDPR Art. 17)
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import * as db from "../db";
import { writeAuditLog } from "../db";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import {
  users, householdMembers,
  oauthTokens, chatMessages, notes, bookingRequests,
  shoppingLists, shoppingListItems, orders, transactions, familyMembers,
  bankAccounts, auditLog,
} from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";

// ─── Helper: require admin role ──────────────────────────────────────────────

function requireAdmin(ctx: { user: { role: string; id: number } }) {
  if (ctx.user.role !== "system_admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
}

// ─── Router ──────────────────────────────────────────────────────────────────

export const securityRouter = router({

  // ── Audit Log ──────────────────────────────────────────────────────────────

  audit: router({
    list: protectedProcedure
      .input(z.object({
        householdId: z.string().optional(),
        category: z.string().optional(),
        action: z.string().optional(),
        limit: z.number().min(1).max(500).default(100),
        offset: z.number().min(0).default(0),
      }))
      .query(async ({ ctx, input }) => {
        requireAdmin(ctx);
        const [rows, total] = await Promise.all([
          db.getAuditLog({
            householdId: input.householdId,
            category: input.category,
            action: input.action,
            limit: input.limit,
            offset: input.offset,
          }),
          db.countAuditLog({
            householdId: input.householdId,
            category: input.category,
          }),
        ]);
        return { rows, total };
      }),

    export: protectedProcedure
      .input(z.object({
        householdId: z.string().optional(),
        category: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        requireAdmin(ctx);
        const rows = await db.getAuditLog({
          householdId: input.householdId,
          category: input.category,
          limit: 10000,
          offset: 0,
        });
        await writeAuditLog({
          actorUserId: ctx.user.id,
          actorOpenId: ctx.user.openId,
          actorEmail: ctx.user.email ?? undefined,
          actorName: ctx.user.name ?? undefined,
          action: "audit.export",
          category: "admin",
          outcome: "success",
          metadata: { rowCount: rows.length, filter: input },
          ipAddress: ctx.req.ip,
          userAgent: ctx.req.headers["user-agent"],
        });
        return { data: rows, exportedAt: new Date().toISOString() };
      }),
  }),

  // ── GDPR / CCPA ────────────────────────────────────────────────────────────

  gdpr: router({
    /**
     * Export all personal data for the requesting user (GDPR Art. 20 — data portability).
     * Returns a JSON blob with all tables that contain the user's data.
     */
    exportData: protectedProcedure
      .query(async ({ ctx }) => {
        const userId = ctx.user.id;
        const dbConn = await getDb();
        if (!dbConn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

        // H-05: Resolve memberId from DB instead of relying on ctx.user.memberId
        const member = await db.getHouseholdMemberByUserId(userId);
        const memberId = member?.id ?? "";

        const [
          userRow,
          familyMembersData,
          shoppingListsData,
          ordersData,
          transactionsData,
          chatMessagesData,
          notesData,
          bookingRequestsData,
          auditLogData,
          bankAccountsData,
        ] = await Promise.all([
          dbConn.select().from(users).where(eq(users.id, userId)).limit(1),
          dbConn.select().from(familyMembers).where(eq(familyMembers.userId, userId)),
          dbConn.select().from(shoppingLists).where(eq(shoppingLists.userId, userId)),
          dbConn.select().from(orders).where(eq(orders.userId, userId)),
          dbConn.select().from(transactions).where(eq(transactions.userId, userId)),
          dbConn.select().from(chatMessages).where(eq(chatMessages.userId, userId)),
          dbConn.select().from(notes).where(eq(notes.memberId, memberId)),
          dbConn.select().from(bookingRequests).where(eq(bookingRequests.requestorMemberId, memberId)),
          dbConn.select().from(auditLog).where(eq(auditLog.actorUserId, userId)),
          dbConn.select().from(bankAccounts).where(eq(bankAccounts.userId, userId)),
        ]);

        await writeAuditLog({
          actorUserId: userId,
          actorOpenId: ctx.user.openId,
          actorEmail: ctx.user.email ?? undefined,
          actorName: ctx.user.name ?? undefined,
          action: "gdpr.exportData",
          category: "data_export",
          outcome: "success",
          metadata: { userId },
          ipAddress: ctx.req.ip,
          userAgent: ctx.req.headers["user-agent"],
        });

        return {
          exportedAt: new Date().toISOString(),
          user: userRow[0] ?? null,
          familyMembers: familyMembersData,
          shoppingLists: shoppingListsData,
          orders: ordersData,
          transactions: transactionsData,
          chatMessages: chatMessagesData,
          notes: notesData,
          bookingRequests: bookingRequestsData,
          auditLog: auditLogData,
          bankAccounts: bankAccountsData,
        };
      }),

    /**
     * Hard-delete all personal data for the requesting user (GDPR Art. 17 — right to erasure).
     * Requires explicit confirmation string.
     * Household data (calendars, properties) is NOT deleted — only user-personal rows.
     */
    deleteAccount: protectedProcedure
      .input(z.object({
        confirmationPhrase: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (input.confirmationPhrase !== "DELETE MY ACCOUNT") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Confirmation phrase must be exactly: DELETE MY ACCOUNT",
          });
        }

        const userId = ctx.user.id;
        const dbConn = await getDb();
        if (!dbConn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

        // H-05: Resolve memberId from DB instead of relying on ctx.user.memberId
        const member = await db.getHouseholdMemberByUserId(userId);
        const memberId = member?.id ?? "";

        // Write audit entry BEFORE deletion (so the record exists)
        await writeAuditLog({
          actorUserId: userId,
          actorOpenId: ctx.user.openId,
          actorEmail: ctx.user.email ?? undefined,
          actorName: ctx.user.name ?? undefined,
          action: "gdpr.deleteAccount",
          category: "data_delete",
          outcome: "success",
          metadata: { userId, deletedAt: new Date().toISOString() },
          ipAddress: ctx.req.ip,
          userAgent: ctx.req.headers["user-agent"],
        });

        // Delete personal data in dependency order
        await dbConn.delete(chatMessages).where(eq(chatMessages.userId, userId));
        // Delete shopping list items — get list IDs first, then delete items for those lists only
        const userLists = await dbConn.select({ id: shoppingLists.id }).from(shoppingLists).where(eq(shoppingLists.userId, userId));
        for (const list of userLists) {
          await dbConn.delete(shoppingListItems).where(eq(shoppingListItems.listId, list.id));
        }
        await dbConn.delete(shoppingLists).where(eq(shoppingLists.userId, userId));
        await dbConn.delete(orders).where(eq(orders.userId, userId));
        await dbConn.delete(transactions).where(eq(transactions.userId, userId));
        await dbConn.delete(familyMembers).where(eq(familyMembers.userId, userId));
        await dbConn.delete(bankAccounts).where(eq(bankAccounts.userId, userId));
        await dbConn.delete(notes).where(eq(notes.memberId, memberId));
        await dbConn.delete(oauthTokens).where(eq(oauthTokens.memberId, memberId));
        // Remove household membership (but don't delete the household itself)
        await dbConn.delete(householdMembers).where(eq(householdMembers.userId, userId));
        // Anonymise the user record (don't hard-delete to preserve FK integrity)
        await dbConn.update(users).set({
          name: "[Deleted User]",
          email: null,
          loginMethod: null,
        }).where(eq(users.id, userId));

        return { success: true, deletedAt: new Date().toISOString() };
      }),
  }),
});
