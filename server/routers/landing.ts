/**
 * Landing Page Router — public procedures only.
 * Handles beta signup submissions and contact form messages.
 * No authentication required for submissions.
 * Admin read/update procedures are protected and system_admin-gated.
 */

import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { betaSignups, contactMessages } from "../../drizzle/schema";
import { eq, desc, and } from "drizzle-orm";
import { notifyOwner } from "../_core/notification";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  return db;
}

function assertSystemAdmin(role: string | undefined) {
  if (role !== "system_admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "System admin access required" });
  }
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const landingRouter = router({

  /**
   * Submit a beta signup application.
   * Public — no auth required.
   */
  betaSignup: publicProcedure
    .input(z.object({
      name: z.string().min(2).max(255),
      email: z.string().email().max(320),
      householdType: z.string().max(100).optional(),
      householdSize: z.string().max(50).optional(),
      primaryUseCase: z.string().max(255).optional(),
      referralSource: z.string().max(255).optional(),
      additionalNotes: z.string().max(2000).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await requireDb();

      // Check for duplicate email
      const existing = await db.select({ id: betaSignups.id })
        .from(betaSignups)
        .where(eq(betaSignups.email, input.email.toLowerCase().trim()))
        .limit(1);

      if (existing.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "This email address has already been registered for the beta.",
        });
      }

      await db.insert(betaSignups).values({
        name: input.name.trim(),
        email: input.email.toLowerCase().trim(),
        householdType: input.householdType ?? null,
        householdSize: input.householdSize ?? null,
        primaryUseCase: input.primaryUseCase ?? null,
        referralSource: input.referralSource ?? null,
        additionalNotes: input.additionalNotes ?? null,
        status: "pending",
      });

      // Notify owner (non-blocking)
      notifyOwner({
        title: "New Beta Signup",
        content: `${input.name} (${input.email}) has applied for beta access.\nHousehold: ${input.householdType ?? "—"} · Size: ${input.householdSize ?? "—"}\nUse case: ${input.primaryUseCase ?? "—"}`,
      }).catch(() => {});

      return { success: true };
    }),

  /**
   * Submit a contact form message.
   * Public — no auth required.
   */
  contactMessage: publicProcedure
    .input(z.object({
      name: z.string().min(2).max(255),
      email: z.string().email().max(320),
      subject: z.string().min(2).max(255),
      message: z.string().min(10).max(5000),
    }))
    .mutation(async ({ input }) => {
      const db = await requireDb();

      await db.insert(contactMessages).values({
        name: input.name.trim(),
        email: input.email.toLowerCase().trim(),
        subject: input.subject.trim(),
        message: input.message.trim(),
        isRead: false,
      });

      // Notify owner (non-blocking)
      notifyOwner({
        title: `Contact: ${input.subject}`,
        content: `From: ${input.name} <${input.email}>\n\n${input.message}`,
      }).catch(() => {});

      return { success: true };
    }),

  // ─── Admin procedures (system_admin only) ───────────────────────────────────

  /**
   * List all beta signups with optional status filter.
   */
  listBetaSignups: protectedProcedure
    .input(z.object({
      status: z.enum(["pending", "approved", "waitlisted", "rejected", "all"]).default("all"),
    }))
    .query(async ({ ctx, input }) => {
      assertSystemAdmin(ctx.user.role);
      const db = await requireDb();
      const rows = input.status === "all"
        ? await db.select().from(betaSignups).orderBy(desc(betaSignups.createdAt))
        : await db.select().from(betaSignups)
            .where(eq(betaSignups.status, input.status))
            .orderBy(desc(betaSignups.createdAt));
      return rows;
    }),

  /**
   * Update a beta signup's status and ICP score.
   */
  updateBetaSignup: protectedProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["pending", "approved", "waitlisted", "rejected"]).optional(),
      icpScore: z.number().min(1).max(5).optional(),
      adminNotes: z.string().max(2000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      assertSystemAdmin(ctx.user.role);
      const db = await requireDb();
      const { id, ...updates } = input;
      await db.update(betaSignups)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(betaSignups.id, id));
      return { success: true };
    }),

  /**
   * List all contact messages.
   */
  listContactMessages: protectedProcedure
    .input(z.object({
      unreadOnly: z.boolean().default(false),
    }))
    .query(async ({ ctx, input }) => {
      assertSystemAdmin(ctx.user.role);
      const db = await requireDb();
      const rows = input.unreadOnly
        ? await db.select().from(contactMessages)
            .where(eq(contactMessages.isRead, false))
            .orderBy(desc(contactMessages.createdAt))
        : await db.select().from(contactMessages)
            .orderBy(desc(contactMessages.createdAt));
      return rows;
    }),

  /**
   * Mark a contact message as read.
   */
  markContactRead: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      assertSystemAdmin(ctx.user.role);
      const db = await requireDb();
      await db.update(contactMessages)
        .set({ isRead: true })
        .where(eq(contactMessages.id, input.id));
      return { success: true };
    }),
});
