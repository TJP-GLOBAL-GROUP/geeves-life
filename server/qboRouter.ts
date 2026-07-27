/**
 * QBO tRPC Router
 *
 * Endpoints:
 *   qbo.connections.list           → List connected QBO realms
 *   qbo.connections.getConnectUrl  → Get OAuth URL for new connection
 *   qbo.connections.disconnect     → Disconnect a realm
 *   qbo.accounts.list              → List QBO accounts (perspective-filtered)
 *   qbo.accounts.sync              → Trigger CoA sync
 *   qbo.classes.list               → List QBO classes
 *   qbo.reports.profitAndLoss      → P&L report
 *   qbo.reports.balanceSheet       → Balance sheet
 *   qbo.purchases.create           → Push expense to QBO
 *   qbo.webhook.receive            → Intuit webhook receiver
 *
 * All endpoints require household membership (via ctx.householdId).
 */

import { z } from "zod";
import { router, publicProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import {
  listConnectedRealms,
  getConnectUrl,
  disconnectRealm,
  refreshTokensIfNeeded,
  QBO_PURPOSES,
  type QBOPurpose,
} from "../intuitOAuth";
import {
  syncChartOfAccounts,
  getChartOfAccounts,
  getClasses,
  getCustomers,
  getVendors,
  getProfitAndLoss,
  getBalanceSheet,
  createPurchase,
} from "../qboApiClient";
import * as db from "../db";

export const qboRouter = router({
  // ─── Connections ────────────────────────────────────────────────────────────

  connections: router({
    list: publicProcedure
      .query(async ({ ctx }) => {
        if (!ctx.householdId) throw new TRPCError({ code: "UNAUTHORIZED" });
        return listConnectedRealms(ctx.householdId);
      }),

    getConnectUrl: publicProcedure
      .input(z.object({
        origin: z.string().url(),
        returnPath: z.string().default("/settings?tab=integrations"),
        purposes: z.array(z.enum(["qbo_read", "qbo_write"] as [string, string])).default(["qbo_read"]),
      }))
      .query(async ({ input }) => {
        const url = getConnectUrl(input.origin, input.returnPath, input.purposes as QBOPurpose[]);
        return { url };
      }),

    disconnect: publicProcedure
      .input(z.object({ realmId: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.householdId) throw new TRPCError({ code: "UNAUTHORIZED" });
        await disconnectRealm(input.realmId);
        return { success: true };
      }),
  }),

  // ─── Accounts ───────────────────────────────────────────────────────────────

  accounts: router({
    list: publicProcedure
      .input(z.object({
        realmId: z.string().min(1),
        perspective: z.enum(["all", "income", "expense", "asset", "liability", "equity"]).optional(),
      }))
      .query(async ({ input }) => {
        const accounts = await getChartOfAccounts(input.realmId);
        if (!input.perspective || input.perspective === "all") return accounts;
        // Filter by QBO classification mapping to perspective
        const classificationMap: Record<string, string> = {
          income: "Revenue", expense: "Expense", asset: "Asset",
          liability: "Liability", equity: "Equity",
        };
        return accounts.filter((a) =>
          a.classification?.toLowerCase() === classificationMap[input.perspective!]?.toLowerCase()
        );
      }),

    sync: publicProcedure
      .input(z.object({ realmId: z.string().min(1) }))
      .mutation(async ({ input }) => {
        return syncChartOfAccounts(input.realmId);
      }),
  }),

  // ─── Classes ────────────────────────────────────────────────────────────────

  classes: router({
    list: publicProcedure
      .input(z.object({ realmId: z.string().min(1) }))
      .query(async ({ input }) => {
        return getClasses(input.realmId);
      }),
  }),

  // ─── Customers ───────────────────────────────────────────────────────────────

  customers: router({
    list: publicProcedure
      .input(z.object({ realmId: z.string().min(1), limit: z.number().max(1000).default(1000) }))
      .query(async ({ input }) => {
        return getCustomers(input.realmId, input.limit);
      }),
  }),

  // ─── Vendors ─────────────────────────────────────────────────────────────────

  vendors: router({
    list: publicProcedure
      .input(z.object({ realmId: z.string().min(1), limit: z.number().max(1000).default(1000) }))
      .query(async ({ input }) => {
        return getVendors(input.realmId, input.limit);
      }),
  }),

  // ─── Reports ─────────────────────────────────────────────────────────────────

  reports: router({
    profitAndLoss: publicProcedure
      .input(z.object({
        realmId: z.string().min(1),
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      }))
      .query(async ({ input }) => {
        return getProfitAndLoss(input.realmId, input.startDate, input.endDate);
      }),

    balanceSheet: publicProcedure
      .input(z.object({
        realmId: z.string().min(1),
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      }))
      .query(async ({ input }) => {
        return getBalanceSheet(input.realmId, input.startDate, input.endDate);
      }),
  }),

  // ─── Purchases ───────────────────────────────────────────────────────────────

  purchases: router({
    create: publicProcedure
      .input(z.object({
        realmId: z.string().min(1),
        accountRef: z.string().min(1),
        paymentType: z.enum(["Cash", "Check", "CreditCard"]).default("Cash"),
        lines: z.array(z.object({
          amount: z.number().positive(),
          accountRef: z.string().min(1),
          classRef: z.string().optional(),
          customerRef: z.string().optional(),
        })).min(1),
        txnDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        privateNote: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const result = await createPurchase(input.realmId, {
          accountRef: input.accountRef,
          paymentType: input.paymentType,
          lines: input.lines,
          txnDate: input.txnDate,
          privateNote: input.privateNote,
        });
        return { success: true, qboId: result?.Id };
      }),
  }),

  // ─── Token Refresh ───────────────────────────────────────────────────────────

  refresh: router({
    token: publicProcedure
      .input(z.object({ realmId: z.string().min(1) }))
      .mutation(async ({ input }) => {
        const result = await refreshTokensIfNeeded(input.realmId);
        return result;
      }),
  }),
});
