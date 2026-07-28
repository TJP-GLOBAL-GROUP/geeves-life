import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb, writeAuditLog } from "../db";
import { invoiceExtractions, bankAccounts, expenses } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { storagePut } from "../storage";
import { invokeLLM } from "../_core/vertexAi";
import { nanoid } from "nanoid";
import { sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

export const invoiceExtractionRouter = router({
  /**
   * Create an extraction record for the extension to upload against.
   */
  createExtraction: protectedProcedure
    .input(z.object({
      orderId: z.string().min(1),
      orderType: z.enum(["vendor_order", "walmart_order"]).default("walmart_order"),
      filename: z.string().min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      const id = nanoid();
      const now = Date.now();
      const householdId = ctx.user.householdId || "default";

      const drizzle = await getDb();
      if (!drizzle) throw new Error("Database unavailable");

      await drizzle.insert(invoiceExtractions).values({
        id,
        householdId,
        vendorOrderId: input.orderType === "vendor_order" ? input.orderId : null,
        walmartOrderId: input.orderType === "walmart_order" ? input.orderId : null,
        extractionStatus: "pending",
        triggerSource: "chrome_extension",
        createdAt: now,
        updatedAt: now,
      });

      return { extractionId: id };
    }),

  /**
   * Upload invoice PDF bytes (base64 encoded) and store in S3.
   */
  uploadInvoice: protectedProcedure
    .input(z.object({
      extractionId: z.string().min(1),
      fileBase64: z.string().min(1),
      filename: z.string().min(1),
      mimeType: z.string().default("application/pdf"),
    }))
    .mutation(async ({ input, ctx }) => {
      const householdId = ctx.user.householdId || "default";

      const drizzle = await getDb();
      if (!drizzle) throw new Error("Database unavailable");

      const [extraction] = await drizzle
        .select()
        .from(invoiceExtractions)
        .where(and(
          eq(invoiceExtractions.id, input.extractionId),
          eq(invoiceExtractions.householdId, householdId),
        ));

      if (!extraction) {
        throw new Error("Extraction not found");
      }

      // Upload to S3
      const fileBuffer = Buffer.from(input.fileBase64, "base64");
      const s3Key = `invoices/${householdId}/${input.extractionId}-${nanoid(6)}-${input.filename}`;
      const { url } = await storagePut(s3Key, fileBuffer, input.mimeType);

      // Update extraction record with S3 info
      await drizzle
        .update(invoiceExtractions)
        .set({
          s3Url: url,
          s3Key: s3Key,
          updatedAt: Date.now(),
        })
        .where(eq(invoiceExtractions.id, input.extractionId));

      // Write audit log
      await writeAuditLog({
        actorUserId: ctx.user.id,
        actorOpenId: ctx.user.openId,
        actorName: ctx.user.name || undefined,
        actorType: "system_extension",
        householdId,
        action: "invoice_uploaded",
        category: "invoice_extraction",
        resourceType: "invoice_extraction",
        resourceId: input.extractionId,
        outcome: "success",
        metadata: { s3Url: url, orderId: extraction.vendorOrderId || extraction.walmartOrderId, filename: input.filename },
      });

      return { success: true, s3Url: url };
    }),

  /**
   * Trigger LLM-based extraction of the uploaded invoice PDF.
   */
  extract: protectedProcedure
    .input(z.object({
      extractionId: z.string().min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      const householdId = ctx.user.householdId || "default";

      const drizzle = await getDb();
      if (!drizzle) throw new Error("Database unavailable");

      const [extraction] = await drizzle
        .select()
        .from(invoiceExtractions)
        .where(and(
          eq(invoiceExtractions.id, input.extractionId),
          eq(invoiceExtractions.householdId, householdId),
        ));

      if (!extraction) {
        throw new Error("Extraction not found");
      }

      if (!extraction.s3Url) {
        throw new Error("No invoice file uploaded yet");
      }

      // Mark as processing
      await drizzle
        .update(invoiceExtractions)
        .set({ extractionStatus: "processing", updatedAt: Date.now() })
        .where(eq(invoiceExtractions.id, input.extractionId));

      try {
        // Use LLM to extract structured data from the invoice PDF
        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `You are an invoice data extraction assistant. Extract structured data from the provided invoice document. Be precise with numbers and dates. If a field cannot be determined, use null.`,
            },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Extract the following information from this invoice: vendor name, order date, order total, tax total, payment method (type and last 4 digits), and all line items (description, quantity, unit price, line total).",
                },
                {
                  type: "file_url",
                  file_url: {
                    url: extraction.s3Url!,
                    mime_type: "application/pdf",
                  },
                },
              ] as any,
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "invoice_extraction",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  vendorName: { type: ["string", "null"], description: "Name of the vendor/retailer" },
                  orderDate: { type: ["string", "null"], description: "Order date in ISO8601 format" },
                  orderTotal: { type: ["number", "null"], description: "Total order amount" },
                  taxTotal: { type: ["number", "null"], description: "Total tax amount" },
                  paymentMethodType: { type: ["string", "null"], description: "Payment method type (Visa, MasterCard, etc.)" },
                  paymentMethodLast4: { type: ["string", "null"], description: "Last 4 digits of payment method" },
                  lineItems: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        description: { type: "string", description: "Item description" },
                        quantity: { type: "number", description: "Quantity purchased" },
                        unitPrice: { type: "number", description: "Price per unit" },
                        lineTotal: { type: "number", description: "Total for this line item" },
                      },
                      required: ["description", "quantity", "unitPrice", "lineTotal"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["vendorName", "orderDate", "orderTotal", "taxTotal", "paymentMethodType", "paymentMethodLast4", "lineItems"],
                additionalProperties: false,
              },
            },
          },
        });

        const content = response.choices?.[0]?.message?.content;
        if (!content) {
          throw new Error("LLM returned empty response");
        }

        const extracted = JSON.parse(content as string);

        // Update extraction record with extracted data
        await drizzle
          .update(invoiceExtractions)
          .set({
            vendorName: extracted.vendorName,
            orderDate: extracted.orderDate,
            orderTotal: extracted.orderTotal?.toString(),
            taxTotal: extracted.taxTotal?.toString(),
            paymentMethodType: extracted.paymentMethodType,
            paymentMethodLast4: extracted.paymentMethodLast4,
            lineItems: extracted.lineItems,
            extractionStatus: "completed",
            updatedAt: Date.now(),
          })
          .where(eq(invoiceExtractions.id, input.extractionId));

        // Audit log
        await writeAuditLog({
          actorUserId: ctx.user.id,
          actorOpenId: ctx.user.openId,
          actorName: ctx.user.name || undefined,
          actorType: "system",
          householdId,
          action: "invoice_extracted",
          category: "invoice_extraction",
          resourceType: "invoice_extraction",
          resourceId: input.extractionId,
          outcome: "success",
          metadata: {
            s3Url: extraction.s3Url,
            lineItemCount: extracted.lineItems?.length || 0,
            orderTotal: extracted.orderTotal,
          },
        });

        return {
          success: true,
          lineItems: extracted.lineItems || [],
          paymentMethod: {
            type: extracted.paymentMethodType,
            last4: extracted.paymentMethodLast4,
          },
        };
      } catch (error: any) {
        // Mark as failed
        await drizzle
          .update(invoiceExtractions)
          .set({
            extractionStatus: "failed",
            extractionError: error.message || "Unknown extraction error",
            updatedAt: Date.now(),
          })
          .where(eq(invoiceExtractions.id, input.extractionId));

        throw new Error(`Extraction failed: ${error.message}`);
      }
    }),

  /**
   * Auto-link payment method to a known financial account by matching last4.
   */
  autoLinkPayment: protectedProcedure
    .input(z.object({
      extractionId: z.string().min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      const householdId = ctx.user.householdId || "default";

      const drizzle = await getDb();
      if (!drizzle) throw new Error("Database unavailable");

      const [extraction] = await drizzle
        .select()
        .from(invoiceExtractions)
        .where(and(
          eq(invoiceExtractions.id, input.extractionId),
          eq(invoiceExtractions.householdId, householdId),
        ));

      if (!extraction || !extraction.paymentMethodLast4) {
        return { linked: false };
      }

      // Find matching bank account by last 4 digits
      const matchingAccounts = await drizzle
        .select()
        .from(bankAccounts)
        .where(and(
          ctx.user.householdId ? eq(bankAccounts.householdId, ctx.user.householdId) : eq(bankAccounts.userId, ctx.user.id),
          eq(bankAccounts.lastFourDigits, extraction.paymentMethodLast4),
          eq(bankAccounts.isActive, true),
        ));

      if (matchingAccounts.length === 0) {
        return { linked: false };
      }

      const account = matchingAccounts[0];

      await drizzle
        .update(invoiceExtractions)
        .set({
          paymentAccountId: account.id,
          updatedAt: Date.now(),
        })
        .where(eq(invoiceExtractions.id, input.extractionId));

      // Audit log
      await writeAuditLog({
        actorUserId: ctx.user.id,
        actorOpenId: ctx.user.openId,
        actorName: ctx.user.name || undefined,
        actorType: "system",
        householdId,
        action: "payment_auto_linked",
        category: "invoice_extraction",
        resourceType: "invoice_extraction",
        resourceId: input.extractionId,
        outcome: "success",
        metadata: {
          s3Url: extraction.s3Url,
          last4: extraction.paymentMethodLast4,
          accountId: account.id,
          accountName: account.accountName,
        },
      });

      return {
        linked: true,
        accountId: account.id,
        accountName: account.accountName,
      };
    }),

  /**
   * Get extracted line items for display in the categorization UI.
   */
  getLineItems: protectedProcedure
    .input(z.object({
      orderId: z.string().min(1),
      orderType: z.enum(["vendor_order", "walmart_order"]).default("walmart_order"),
    }))
    .query(async ({ input, ctx }) => {
      const householdId = ctx.user.householdId || "default";

      const drizzle = await getDb();
      if (!drizzle) throw new Error("Database unavailable");

      const condition = input.orderType === "walmart_order"
        ? eq(invoiceExtractions.walmartOrderId, input.orderId)
        : eq(invoiceExtractions.vendorOrderId, input.orderId);

      const extractions = await drizzle
        .select()
        .from(invoiceExtractions)
        .where(and(
          condition,
          eq(invoiceExtractions.householdId, householdId),
          eq(invoiceExtractions.extractionStatus, "completed"),
        ))
        .limit(1);

      if (extractions.length === 0) {
        return { hasExtraction: false, lineItems: [], paymentMethod: null, linked: false, accountName: null };
      }

      const extraction = extractions[0];
      let accountName: string | null = null;

      if (extraction.paymentAccountId) {
        const [account] = await drizzle
          .select({ accountName: bankAccounts.accountName })
          .from(bankAccounts)
          .where(eq(bankAccounts.id, extraction.paymentAccountId));
        accountName = account?.accountName || null;
      }

      return {
        hasExtraction: true,
        extractionId: extraction.id,
        lineItems: extraction.lineItems || [],
        paymentMethod: extraction.paymentMethodType
          ? { type: extraction.paymentMethodType, last4: extraction.paymentMethodLast4 }
          : null,
        linked: !!extraction.paymentAccountId,
        accountName,
        s3Url: extraction.s3Url,
        vendorName: extraction.vendorName,
        orderTotal: extraction.orderTotal,
        taxTotal: extraction.taxTotal,
      };
    }),

  /**
   * Manually link a payment account to an extraction.
   */
  manualLinkPayment: protectedProcedure
    .input(z.object({
      extractionId: z.string().min(1),
      accountId: z.number().int().positive(),
    }))
    .mutation(async ({ input, ctx }) => {
      const householdId = ctx.user.householdId || "default";

      const drizzle = await getDb();
      if (!drizzle) throw new Error("Database unavailable");

      await drizzle
        .update(invoiceExtractions)
        .set({
          paymentAccountId: input.accountId,
          updatedAt: Date.now(),
        })
        .where(and(
          eq(invoiceExtractions.id, input.extractionId),
          eq(invoiceExtractions.householdId, householdId),
        ));

      // Audit log
      await writeAuditLog({
        actorUserId: ctx.user.id,
        actorOpenId: ctx.user.openId,
        actorName: ctx.user.name || undefined,
        actorType: "user",
        householdId,
        action: "payment_manually_linked",
        category: "invoice_extraction",
        resourceType: "invoice_extraction",
        resourceId: input.extractionId,
        outcome: "success",
        metadata: {
          accountId: input.accountId,
        },
      });

      return { success: true };
    }),

  /**
   * List invoice extractions for a household (bridge: makes captured invoices visible in the expense tool).
   */
  list: protectedProcedure
    .input(z.object({
      householdId: z.string().min(1),
      status: z.enum(["pending", "converted", "ignored"]).optional(),
      limit: z.number().min(1).max(100).default(50),
    }))
    .query(async ({ input, ctx }) => {
      const drizzle = await getDb();
      if (!drizzle) throw new Error("Database unavailable");
      const rows = await drizzle.execute(sql`
        SELECT * FROM invoice_extractions
        WHERE householdId = ${input.householdId}
        ${input.status ? sql`AND status = ${input.status}` : sql``}
        ORDER BY createdAt DESC
        LIMIT ${input.limit}
      `);
      const result = Array.isArray(rows) ? rows[0] : rows;
      return (result as unknown as any[]) || [];
    }),

  /**
   * Convert a captured invoice extraction into a proper expense record.
   */
  convertToExpense: protectedProcedure
    .input(z.object({
      extractionId: z.string().min(1),
      propertyId: z.string().optional(),
      memberId: z.string().optional(),
      verticalId: z.string().min(1),
      coaCategoryId: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const drizzle = await getDb();
      if (!drizzle) throw new Error("Database unavailable");

      const [extraction] = await drizzle
        .select()
        .from(invoiceExtractions)
        .where(eq(invoiceExtractions.id, input.extractionId));

      if (!extraction) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invoice extraction not found" });
      }

      const expenseId = nanoid();
      const householdId = extraction.householdId;
      const amount = Number(extraction.orderTotal || 0);
      const vendor = extraction.vendorName || "Unknown";
      const description = `Invoice from ${vendor}`;
      const expenseDate = extraction.orderDate
        ? new Date(extraction.orderDate).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10);

      await drizzle.execute(sql`
        INSERT INTO expenses (
          id, householdId, amount, currency, description, expenseDate,
          vendor, propertyId_exp, memberId, verticalId, coaCategoryId,
          source, status, createdAt
        ) VALUES (
          ${expenseId}, ${householdId}, ${amount}, 'USD',
          ${description}, ${expenseDate}, ${vendor},
          ${input.propertyId || null}, ${input.memberId || null},
          ${input.verticalId}, ${input.coaCategoryId || null},
          'invoice_capture', 'uncategorized', NOW()
        )
      `);

      await drizzle.execute(sql`
        UPDATE invoice_extractions
        SET status = 'converted', convertedExpenseId = ${expenseId}, convertedAt = NOW()
        WHERE id = ${input.extractionId}
      `);

      await writeAuditLog({
        actorUserId: ctx.user.id,
        actorOpenId: ctx.user.openId,
        actorName: ctx.user.name || undefined,
        actorType: "user",
        householdId,
        action: "invoice_converted_to_expense",
        category: "invoice_extraction",
        resourceType: "expense",
        resourceId: expenseId,
        outcome: "success",
        metadata: { extractionId: input.extractionId, amount, vendor },
      });

      return { success: true, expenseId };
    }),
});
