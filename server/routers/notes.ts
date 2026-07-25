import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import * as db from "../db";
import { nanoid } from "nanoid";

export const notesRouter = router({
  list: protectedProcedure
    .input(z.object({
      householdId: z.string(),
      memberId: z.string().optional(),
      verticalId: z.string().optional(),
      eventId: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const { householdId, ...filters } = input;
      return db.getNotes(householdId, filters);
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const note = await db.getNoteById(input.id);
      if (!note) throw new TRPCError({ code: "NOT_FOUND", message: "Note not found" });
      return note;
    }),

  create: protectedProcedure
    .input(z.object({
      householdId: z.string(),
      memberId: z.string(),
      content: z.string().min(1),
      verticalId: z.string().optional(),
      eventId: z.string().optional(),
      source: z.enum(["voice", "text", "tablet", "phone"]).default("text"),
      reminderAt: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const id = nanoid();
      await db.createNote({
        id,
        householdId: input.householdId,
        memberId: input.memberId,
        content: input.content,
        verticalId: input.verticalId || null,
        eventId: input.eventId || null,
        source: input.source,
        reminderAt: input.reminderAt || null,
      });
      return { id };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.string(),
      content: z.string().min(1).optional(),
      verticalId: z.string().nullable().optional(),
      eventId: z.string().nullable().optional(),
      reminderAt: z.number().nullable().optional(),
      isCompleted: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      const existing = await db.getNoteById(id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Note not found" });
      
      const updateData: any = { ...data };
      // data.isCompleted comes from zod z.boolean() so it is a true JS boolean (safe to use ===).
      // However, use truthy/falsy to be consistent with P-10 and future-proof against DB reads.
      if (data.isCompleted === true) {
        updateData.completedAt = new Date();
      } else if (data.isCompleted === false) {
        updateData.completedAt = null;
      }
      
      await db.updateNote(id, updateData);
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const existing = await db.getNoteById(input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Note not found" });
      await db.deleteNote(input.id);
      return { success: true };
    }),

  toggleComplete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const existing = await db.getNoteById(input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Note not found" });
      const isCompleted = !existing.isCompleted;
      await db.updateNote(input.id, {
        isCompleted,
        completedAt: isCompleted ? new Date() : null,
      });
      return { isCompleted };
    }),
});
