# Geeves.Life — Financial Design Plan
## Wiring Up Accounts, Properties & Vertical Finances

**Version:** 1.0 (consolidated for cross-workspace sharing)
**Date:** 2026-08-02
**Status:** Phase 1 (Unified G.L. schema) merged to `main` 2026-07-30 · Phases 2–4 in design
**Repo:** TJP-GLOBAL-GROUP/geeves-life · **Beta:** beta.geeves.life (Cloud Run, GCP project geeves-495802)

> **Repo note (2026-08-06):** committed from the cross-workspace copy to close the docs gap. The three source docs referenced in §13 (`VERTICAL_GL_CATALOGS.md`, `QBO_MAPPING_FRAMEWORK.md`, `COA_CHANGE_LOG.md`) are still **not in this repo** — recovery tracked in the cleanup program. `drizzle/seed_gl_accounts.sql` and the schema §"PHASE 1 — UNIFIED GENERAL LEDGER" are present on main.

---

## 1. Purpose

Geeves.Life runs one household operating system containing multiple businesses and personal life. The financial layer must:

1. Give **each vertical** (business or life area) its own clean P&L and balance sheet view.
2. Give **each property** its own rental P&L (Schedule E-ready) inside the lodging vertical.
3. Roll everything up into a **Unified General Ledger** with true double-entry accounting.
4. Feed **tax preparation** (Schedule C per business, Schedule E per property, Form 1040 personal) without year-end archaeology.
5. Stay **QBO-compatible** so any vertical can sync/export to QuickBooks Online without remapping.

This document consolidates the design from: `DESIGN_PRINCIPLES.md`, `VERTICAL_GL_CATALOGS.md`, `QBO_MAPPING_FRAMEWORK.md`, `COA_CHANGE_LOG.md`, the Phase 1 Unified G.L. schema (merged PR #5), and the live reconciliation baseline (V17.26).

---

## 2. The Structural Model — How Everything Wires Together

```
HOUSEHOLD (the family / entity container)
│
├── MEMBERS (household_members) ── roles: household_admin (co-equal), ea, member,
│                                   caregiver, child, elder
│
├── VERTICALS (verticals) ── business or life areas, each with:
│   ├── Chart of Accounts (chart_of_accounts)     — per-vertical G.L. accounts
│   ├── Financial Config (vertical_financial_configs) — currency, tax jurisdiction,
│   │                                                  QBO realm, recon tolerances
│   ├── Expense Config (vertical_expense_configs) — categorization behavior
│   ├── Calendars / Events / Shadow Blocks        — scheduling side
│   └── Member Access (vertical_member_access)    — full / read_only / blind / none
│
├── ACCOUNTS (money containers)
│   ├── financial_accounts  — bank/credit/investment accounts (statement-level)
│   ├── bank_accounts       — app-level account registry
│   └── vendor_accounts     — normalized vendor registry (Amazon, Walmart…)
│
├── PROPERTIES (properties) ── rental real estate, each with:
│   ├── Platforms (property_platforms)     — Airbnb / VRBO / Booking.com / Direct…
│   ├── Bookings (property_bookings)       — unified iCal + email-scraped records
│   ├── LTR Payments (ltr_payments)        — long-term rent / utilities / deposits
│   ├── Expenses (property_expense_records)
│   ├── Prep Rules (property_prep_rules)   — turnover blocking
│   └── Platform Fee Configs (platform_fee_configurations)
│
└── UNIFIED GENERAL LEDGER (Phase 1)
    ├── journal_entries  — G.L. header (one per financial event)
    ├── journal_lines    — double-entry detail (debit/credit per G.L. account)
    ├── transfer_pairs   — money movement that never touches P&L
    ├── tax_documents    — prior-year returns & source docs (GCS-backed)
    └── tax_line_items   — TY2025 draft form-line accumulator
```

**Key wiring rules:**

- Every financial row carries **householdId + verticalId**. Optional **propertyId** adds the property dimension.
- `journal_entries.propertyId` is a first-class column — a rental expense posts to the vertical (Blue Lagoon Lodges) *and* the property simultaneously. Schedule E per property falls out of one query.
- Verticals own their chart of accounts; the Unified G.L. references accounts by `glAccountId` and never duplicates the chart.
- Access to financial data inherits `vertical_member_access`: `blind` = calendar-only, `read_only` = view, `full` = transact.

---

## 3. The Verticals

| Vertical | Code | Color | Income Focus | Expense Focus | Tax Treatment |
|----------|------|-------|--------------|---------------|---------------|
| Maxfield Bakery | BKY | Orange | Product/Catering/Wholesale Sales | COGS (flour, sugar, packaging), Labor, Rent | Sch C |
| Maxfield Market Global | MKT | Green | Product Sales | Inventory, Shipping | Sch C |
| Blue Lagoon Lodges | BL | Blue | Rental Income (Airbnb/VRBO/B.com/Direct) | Cleaning, Maintenance, Platform Fees | Sch E (per property) |
| Personal | PERS | Purple | — | Groceries, Utilities, Medical | Form 1040 |
| Self / Tarik | SELF | Teal | — | Professional Development | Sch A/2106 as applicable |
| StartOut | SO | Pink | Sponsorship | Program Costs | Nonprofit tracking |
| TJP Global Group | TJPGG | Gold | Consulting | Overhead | Sch C / Corp |
| Good Life | GL | Silver | — | Wellness, Lifestyle | Personal |
| B.Lab | BLAB | Coral | — | R&D, Innovation | R&D tracking |

Each vertical's accounts are prefixed with its code (`BKY-1001 Sales of Product Income`, `BL-2001 Cleaning Services`). Per-vertical catalogs are complete in `VERTICAL_GL_CATALOGS.md` (~120 seed accounts, `drizzle/seed_gl_accounts.sql`).

---

## 4. Chart of Accounts Architecture

### 4.1 Cleanup baseline (2026-07-27, `COA_CHANGE_LOG.md`)

The inherited master COA (191 accounts) was curated to ~100–120:

- **18 income accounts retyped** out of `expense` (rental income by platform, product sales, interest, grants, cleaning/late fees…).
- **14 balance-sheet accounts retyped** (`we_own` assets, `we_owe` liabilities, `our_stake` equity).
- **22 duplicate groups merged**, **20 transfer rails consolidated to 1**, **100% of survivors QBO-mapped**.

### 4.2 Account typing model

`chart_of_accounts.accountType` supports both QBO-style types (`income`, `cost_of_goods_sold`, `expense`, `asset`, `liability`, `equity`, `bank`, `credit_card`, `accounts_receivable/payable`…) and the reconciliation shorthand used in the Maxfield recon engine (`money_in`, `money_out`, `we_own`, `we_owe`, `our_stake`). Every account carries:

- `accountNumber` (vertical-prefixed code), `parentAccountId` (hierarchy), `displayOrder`
- `qboAccountId` + `qboSyncStatus` (`synced / pending_create / pending_map / geeves_only / deprecated`)
- `isTaxRelevant` + `taxFormLine` + `taxJurisdiction` (`us_federal / us_state / jamaica`)

### 4.3 Invariants

1. One canonical account per economic concept per vertical — no vendor-specific accounts (vendors live in `vendor_accounts`).
2. Transfers between accounts are **never** P&L accounts (see §6.3).
3. Every tax-relevant account names its form line at creation, not at tax time.

---

## 5. Accounts Layer (Money Containers & Feeds)

### 5.1 `financial_accounts` — statement-level registry

One row per real-world account: institution, type (`chequing / savings / credit_card / business_* / investment / airbnb_payout`), last-four, currency, primary vertical, statement folder URL (GCS). This is the anchor for statement ingestion and reconciliation.

### 5.2 Transaction feeds

- **Bank statements** (PDF parse → `financial_transactions` / `boa_transactions` / `capital_one_transactions` / `biz_account_transactions` legacy silos — being unified).
- **Platform payouts** (`airbnb_payout_records`, `stripe_transactions`).
- **Orders** (`orders`, `vendor_orders`, `vendor_order_items`) — purchase-side detail for COGS and expense categorization.
- **Manual entry.**

### 5.3 Vendor normalization

`vendor_accounts` maps bank-statement description patterns → canonical vendor → platform. Drives auto-categorization proposals with confidence scores; `autoMatchMinConfidence` (default 0.85) auto-accepts, `proposalMinConfidence` (0.60) queues for review.

### 5.4 Reconciliation engine (operational baseline, V17.26)

The Maxfield/Geeves reconciliation project maintains verified account anchors (staging DB `geeves_life_v2.db` is the source of truth):

| Account | Anchor |
|---|---|
| Maxfield Bakery (MB) | $332,614.01 |
| Maxfield Market (MM) | $256,196.86 |
| Blue Lagoon (BL) | $145,817.98 |
| Good Life (GL) | $2,627.77 |
| StartOut (SO) | $1,396.85 |
| Family (FAM) | $36,858.79 |
| B.Lab | $11.75 |
| **GRAND TOTAL** | **$775,524.01** |

Review queue: 2,037 rows pending attribution. These anchors are the acceptance targets for the G.L. migration — post-migration trial balance must foot to them.

---

## 6. Unified General Ledger (Phase 1 — merged 2026-07-30)

### 6.1 `journal_entries` — G.L. header

Every financial event = exactly one header: `entryDate`, `fiscalYear/Month`, `verticalId`, optional `propertyId`, `entryType` (`revenue / expense / transfer / adjustment / dto / journal`), `sourceTable`+`sourceId` (full lineage back to the booking/transaction/payment row), `totalDebit`/`totalCredit`, `currency`+`exchangeRate`, posting lifecycle (`isPosted / isLocked / postedAt / postedBy`).

### 6.2 `journal_lines` — double-entry detail

Each line: `glAccountId`, optional `propertyId`, `debit`/`credit`, signed `amount`, `usdEquivalent`, `taxFormLine`, `isTaxRelevant`, `receiptUrl`. **Balance enforced at the application layer** (Σdebit = Σcredit per entry).

### 6.3 `transfer_pairs` — rails never hit P&L

Venmo, Zelle, ATM, owner draws, loan payments, credit-card payments, internal transfers: both sides are journal entries linked by a `transfer_pairs` row (`isReconciled` flag). The pair guarantees P&L neutrality — money movement is visible on the balance sheet and invisible on the income statement. This codifies the recon engine's hardest-won rule.

### 6.4 `dto` entry type — Due-to-Owner

Inter-vertical funding (personal card pays a bakery bill) posts as `dto` entries creating Due-to-Owner receivable/payable pairs between verticals. The DTO footing rebuild is an open workstream from the recon project.

---

## 7. Properties Layer (Blue Lagoon Lodges)

### 7.1 Booking record model (P-31/P-38 unified)

`property_bookings` merges **iCal feeds** and **email-scraped confirmations** into one canonical row per stay:

- Merge rules: same-platform + >80% overlap or near-exact dates (±1 day) always merge; cross-platform >50% overlap dedupes by priority (`booking > block > unavailable`).
- **Enrichment wins**: email-scraped fields (guest name/email/phone, totalPrice, cleaningFee, commissionAmount, netAmount, currency, confirmationNumber) override iCal generics.
- **Email dates win** when iCal/email disagree >1 day; mismatch fires a (cooldown-throttled) notification.
- `dataSource` promotes `ical_only + email_only → both`; `bookingStatus` soft-cancels (restorable); `financialSource` tracks provenance (`platform_export / email_scrape / manual / screenshot_ocr`).

### 7.2 Revenue recognition

`getPropertyRevenueSummaryWithTax`: revenue, commission, net, **tax remitted by platform vs. tax owed by host vs. pass-through**, per property, with source breakdown. `platform_fee_configurations` holds per-platform commission/fee rates. Airbnb payout reconciliation uses `airbnb_payout_records`.

### 7.3 LTR (long-term rental)

`ltr_payments`: rent / utility_fee / deposit / other with `paid / pending / overdue` status — feeds the LTR revenue summary widget and the same G.L. posting path as STR bookings.

### 7.4 Property → G.L. wiring

Booking confirmed → `revenue` journal entry (DR platform receivable / CR rental income, CR tax collected).
Payout received → `transfer` (DR bank / CR platform receivable) + `expense` (DR platform fees / CR receivable).
Cleaning/maintenance → `expense` with `propertyId` + `glAccountId` from the BL catalog (`BL-2001` Cleaning, `BL-2009` Pool Maintenance…).
Schedule E per property = `journal_lines` grouped by `propertyId` + `taxFormLine`.

---

## 8. Vertical Financial Configs

`vertical_financial_configs` (one row per vertical):

- **Currency**: default + supported currencies, exchange rate (manual/source-stamped), USD conversion.
- **Reconciliation**: absolute/pct tolerances ($1.00 / 2% defaults), date window (7 days), auto-match thresholds.
- **QBO**: `qboRealmId`, sync direction (`geeves_to_qbo` default), default class, export format (`api / iif / csv`), **export approval required** (default true), batch size 50.
- **Tax**: jurisdiction, entity type (`sole_proprietor / llc_single / llc_multi / corporation / partnership / personal`), form type, fiscal year end, cash/accrual.

`vertical_expense_configs` (3 rows live) hold per-vertical expense behavior; `platform_fee_configurations` (4 rows live) hold platform fee schedules.

---

## 9. Tax Layer

- `tax_documents`: prior-year returns and source docs in GCS — typed by form (`form_1040, schedule_c, schedule_e, schedule_d, schedule_se, f4562, f4797, f4684, f8995, f1116, f5471, f8582`, w2/1099/payslip/receipt…), `isKeyDocument`, `extractedData` JSON.
- `tax_line_items`: TY2025 draft accumulator — one row per (year, form, line, vertical, property); `sourceType` (`gl_sum / owner_input / prior_year_carryover / gap`); `confidence` (`certain / estimated / gap`). Populated by querying `journal_lines.taxFormLine`; gaps are first-class citizens, not silent zeros.
- Personal vertical is the default home for individual tax documents.

---

## 10. QBO Mapping Framework

Three mapping types (`QBO_MAPPING_FRAMEWORK.md`):

1. **exact (1:1)** — ~45 accounts. Geeves account ↔ single QBO account.
2. **rollup (N:1)** — several Geeves accounts (e.g. `BL-2001` Cleaning, `BL-2009` Pool, `BL-2010` Pest) → one QBO account (Maintenance & Repairs).
3. **split (1:N)** — one Geeves account fans out to multiple QBO accounts by class/property.
4. **create** — `pending_create` accounts pushed to QBO on next sync.

Sync is **geeves_to_qbo by default**, approval-gated, batched (50), with per-vertical realm bindings. Geeves remains the system of record; QBO is a downstream ledger for accountant collaboration.

---

## 11. Data Flows (End-to-End)

**STR booking:** iCal/email → `property_bookings` (merged/enriched) → payout in `airbnb_payout_records`/`stripe_transactions` → journal entries (revenue + fee expense + transfer) → BL vertical P&L + property Schedule E lines.

**Bank statement:** PDF → parse → `financial_transactions` → vendor normalization → COA proposal (confidence-scored) → auto-accept or review queue (2,037 rows outstanding) → journal entry → vertical P&L.

**Owner funding across verticals:** `dto` journal entries → Due-to-Owner pairs → eliminated on consolidated view, preserved per vertical.

**Tax time:** `journal_lines.taxFormLine` → `tax_line_items` (with confidence) + `tax_documents` prior-year context → draft 1040/Sch C/Sch E package.

---

## 12. Phased Roadmap & Current State

| Phase | Scope | Status |
|---|---|---|
| **1** | Unified G.L. schema: journal_entries, journal_lines, transfer_pairs, tax_documents, tax_line_items + ~120 seed G.L. accounts | ✅ Merged 2026-07-30 (PR #5). **Note:** migration not yet run on live DB — tables absent from live TiDB as of 2026-08-02 snapshot |
| **2** | Posting engine: source rows → balanced journal entries; backfill from recon staging DB; trial balance must foot to V17.26 anchors ($775,524.01) | Design complete, blocked on TiDB→Cloud SQL cutover (in flight) |
| **3** | DTO footing rebuild + review-queue burn-down (2,037 rows) | Pending |
| **4** | QBO sync execution (export approval workflow) | Framework designed — see `QBO_INTEGRATION.md` |
| **5** | TY2025 tax package generation from tax_line_items | Schema ready |

**Infra note (2026-08-06 update):** the TiDB→Cloud SQL cutover referenced above is now **complete** — beta runs on Cloud SQL (`geeves-primary`, MySQL 8.0). Whether the Phase 1 G.L. migration + seed accounts were applied to Cloud SQL during cutover must be verified before Phase 2 (cleanup program item C-1).

---

## 13. Source Documents (in repo)

| Doc | Content |
|---|---|
| `VERTICAL_GL_CATALOGS.md` | Full per-vertical chart of accounts (~120 accounts) — ⚠️ not yet in repo |
| `QBO_MAPPING_FRAMEWORK.md` | exact / rollup / split / create mapping design — ⚠️ not yet in repo |
| `COA_CHANGE_LOG.md` | 191→~120 account cleanup audit trail — ⚠️ not yet in repo |
| `DESIGN_PRINCIPLES.md` | Household/role/accessibility invariants (must-read for contributors) |
| `drizzle/schema.ts` §"PHASE 1 — UNIFIED GENERAL LEDGER" | journal_entries / journal_lines / transfer_pairs / tax_documents / tax_line_items |
| `drizzle/seed_gl_accounts.sql` | G.L. account seed data, all verticals |

---

*Prepared for cross-workspace sharing. The financial invariants that must survive any implementation: double-entry balance per journal entry · transfers never hit P&L · propertyId is a first-class G.L. dimension · tax form lines declared at account creation · Geeves is the system of record, QBO is downstream.*
