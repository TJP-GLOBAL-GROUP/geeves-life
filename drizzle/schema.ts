export type GuardianConfig = typeof guardianConfig.$inferSelect;
export type InsertGuardianConfig = typeof guardianConfig.$inferInsert;


// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 1 — UNIFIED GENERAL LEDGER (v2.0)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Journal Entries — G.L. Header ────────────────────────────────────────────
// Every financial transaction has exactly one header row.
// Double-entry detail lives in journal_lines.
export const journalEntries = mysqlTable("journal_entries", {
  id: varchar("id", { length: 21 }).primaryKey(), // nanoid
  entryDate: date("entry_date").notNull(),
  fiscalYear: int("fiscal_year").notNull(),
  fiscalMonth: int("fiscal_month").notNull(),
  verticalId: varchar("verticalId", { length: 36 }).notNull(),
  propertyId: varchar("propertyId", { length: 21 }),
  entryType: mysqlEnum("entryType", [
    "revenue", "expense", "transfer", "adjustment", "dto", "journal",
  ]).notNull(),
  sourceTable: varchar("sourceTable", { length: 50 }),
  sourceId: varchar("sourceId", { length: 21 }),
  reference: varchar("reference", { length: 200 }),
  memo: text("memo"),
  totalDebit: decimal("total_debit", { precision: 15, scale: 2 }).notNull().default("0.00"),
  totalCredit: decimal("total_credit", { precision: 15, scale: 2 }).notNull().default("0.00"),
  currency: varchar("currency", { length: 3 }).notNull().default("USD"),
  exchangeRate: decimal("exchange_rate", { precision: 15, scale: 6 }).default("1.000000"),
  isPosted: boolean("is_posted").default(false),
  isLocked: boolean("is_locked").default(false),
  postedAt: timestamp("posted_at"),
  postedBy: varchar("postedBy", { length: 36 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (t) => ({
  verticalDateIdx: index("je_vertical_date_idx").on(t.verticalId, t.entryDate),
  fiscalYearIdx: index("je_fiscal_year_idx").on(t.fiscalYear, t.fiscalMonth),
  sourceIdx: index("je_source_idx").on(t.sourceTable, t.sourceId),
  propertyIdx: index("je_property_idx").on(t.propertyId),
  entryTypeIdx: index("je_entry_type_idx").on(t.verticalId, t.entryType),
}));
export type JournalEntry = typeof journalEntries.$inferSelect;
export type InsertJournalEntry = typeof journalEntries.$inferInsert;

// ─── Journal Lines — G.L. Detail ──────────────────────────────────────────────
// Double-entry lines. Every line references one G.L. account.
// debit + credit must balance per journal entry (enforced at application layer).
export const journalLines = mysqlTable("journal_lines", {
  id: varchar("id", { length: 21 }).primaryKey(), // nanoid
  journalEntryId: varchar("journalEntryId", { length: 21 }).notNull(),
  lineNumber: int("line_number").notNull(),
  glAccountId: varchar("glAccountId", { length: 21 }).notNull(),
  propertyId: varchar("propertyId", { length: 21 }),
  description: varchar("description", { length: 255 }),
  debit: decimal("debit", { precision: 15, scale: 2 }).default("0.00"),
  credit: decimal("credit", { precision: 15, scale: 2 }).default("0.00"),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(), // signed: + = revenue/asset, - = expense/liability
  currency: varchar("currency", { length: 3 }).notNull().default("USD"),
  exchangeRate: decimal("exchange_rate", { precision: 15, scale: 6 }).default("1.000000"),
  usdEquivalent: decimal("usd_equivalent", { precision: 15, scale: 2 }),
  taxFormLine: varchar("tax_form_line", { length: 50 }),
  isTaxRelevant: boolean("is_tax_relevant").default(false),
  receiptUrl: varchar("receipt_url", { length: 500 }),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  entryIdx: index("jl_entry_idx").on(t.journalEntryId),
  glAccountIdx: index("jl_gl_account_idx").on(t.glAccountId),
  propertyIdx: index("jl_property_idx").on(t.propertyId),
  taxFormIdx: index("jl_tax_form_idx").on(t.taxFormLine),
  verticalAccountYear: index("jl_va_year_idx").on(t.glAccountId, t.createdAt),
}));
export type JournalLine = typeof journalLines.$inferSelect;
export type InsertJournalLine = typeof journalLines.$inferInsert;

// ─── Transfer Pairs — Rails Never Hit P&L ─────────────────────────────────────
// Tracks Venmo, Zelle, ATM, owner draws, loan payments.
// Both sides reference journal entries; the pair ensures P&L neutrality.
export const transferPairs = mysqlTable("transfer_pairs", {
  id: varchar("id", { length: 21 }).primaryKey(), // nanoid
  fromEntryId: varchar("fromEntryId", { length: 21 }).notNull(),
  toEntryId: varchar("toEntryId", { length: 21 }).notNull(),
  fromAccountId: varchar("fromAccountId", { length: 21 }).notNull(),
  toAccountId: varchar("toAccountId", { length: 21 }).notNull(),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  transferType: mysqlEnum("transferType", [
    "venmo", "zelle", "atm", "owner_draw", "loan_payment",
    "credit_card_payment", "internal_transfer",
  ]).notNull(),
  description: varchar("description", { length: 255 }),
  isReconciled: boolean("is_reconciled").default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  fromIdx: index("tp_from_idx").on(t.fromEntryId),
  toIdx: index("tp_to_idx").on(t.toEntryId),
}));
export type TransferPair = typeof transferPairs.$inferSelect;
export type InsertTransferPair = typeof transferPairs.$inferInsert;

// ─── Tax Documents — Prior Year Returns Storage ─────────────────────────────────
// Stores prior-year tax returns and preparation guidance in GCS.
// Personal vertical houses all individual tax documents.
export const taxDocuments = mysqlTable("tax_documents", {
  id: varchar("id", { length: 21 }).primaryKey(), // nanoid
  verticalId: varchar("verticalId", { length: 36 }).notNull().default("pers"),
  householdId: varchar("householdId", { length: 36 }).notNull(),
  taxYear: int("tax_year").notNull(),
  documentType: mysqlEnum("documentType", [
    "form_1040", "schedule_c", "schedule_e", "schedule_d",
    "schedule_se", "form_4562", "form_4797", "form_4684",
    "form_8995", "form_1116", "form_5471", "form_8582",
    "preparation_guidance", "w2", "1099", "payslip",
    "bank_statement", "receipt", "other",
  ]).notNull(),
  documentLabel: varchar("documentLabel", { length: 100 }),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  gcsPath: varchar("gcsPath", { length: 500 }).notNull(),
  fileSizeBytes: int("file_size_bytes"),
  mimeType: varchar("mimeType", { length: 50 }).default("application/pdf"),
  isKeyDocument: boolean("is_key_document").default(false),
  extractedData: json("extracted_data"),
  uploadedBy: varchar("uploadedBy", { length: 36 }),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  yearTypeIdx: index("td_year_type_idx").on(t.taxYear, t.documentType),
  verticalIdx: index("td_vertical_idx").on(t.verticalId),
  keyDocIdx: index("td_key_doc_idx").on(t.verticalId, t.isKeyDocument),
}));
export type TaxDocument = typeof taxDocuments.$inferSelect;
export type InsertTaxDocument = typeof taxDocuments.$inferInsert;

// ─── Tax Line Items — TY2025 Draft Accumulator ──────────────────────────────────
// Populated by querying journal_lines; holds draft tax form line amounts.
// Confidence field tracks certainty: certain, estimated, gap.
export const taxLineItems = mysqlTable("tax_line_items", {
  id: varchar("id", { length: 21 }).primaryKey(), // nanoid
  taxYear: int("tax_year").notNull().default(2025),
  formName: mysqlEnum("formName", [
    "1040", "sch_c", "sch_e", "sch_d", "sch_se",
    "f4562", "f4797", "f4684", "f8995", "f1116",
    "f5471", "f8582",
  ]).notNull(),
  formLine: varchar("formLine", { length: 20 }).notNull(),
  lineDescription: varchar("lineDescription", { length: 255 }),
  verticalId: varchar("verticalId", { length: 36 }),
  propertyId: varchar("propertyId", { length: 20 }),
  amount: decimal("amount", { precision: 15, scale: 2 }),
  sourceType: mysqlEnum("sourceType", [
    "gl_sum", "owner_input", "prior_year_carryover", "gap",
  ]).default("gap"),
  sourceQuery: text("source_query"),
  confidence: mysqlEnum("confidence", ["certain", "estimated", "gap"]).default("gap"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (t) => ({
  formLineIdx: index("tli_form_line_idx").on(t.taxYear, t.formName, t.formLine),
  verticalIdx: index("tli_vertical_idx").on(t.verticalId),
  uniqueLine: uniqueIndex("tli_unique_line").on(
    t.taxYear, t.formName, t.formLine, t.verticalId, t.propertyId,
  ),
}));
export type TaxLineItem = typeof taxLineItems.$inferSelect;
export type InsertTaxLineItem = typeof taxLineItems.$inferInsert;
