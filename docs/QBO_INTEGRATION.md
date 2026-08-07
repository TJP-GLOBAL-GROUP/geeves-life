# QBO Integration — QuickBooks Online Sync Architecture

**Status:** Design v2 — revised to sit *after* the Ledger Cleanup Program
**Author:** Kimi (senior full-stack partner)
**Date:** 2026-08-06 (v2 same date, post-FINANCIAL_DESIGN_PLAN review)
**Parent design:** [`FINANCIAL_DESIGN_PLAN.md`](./FINANCIAL_DESIGN_PLAN.md) — this doc covers **Phase 4** of that roadmap only

---

## 0. What Changed in v2 (and why)

v1 of this doc designed the QBO export to read from the `expenses` table directly. That was wrong. Per the Financial Design Plan:

- The **Unified General Ledger** (`journal_entries` / `journal_lines`, merged PR #5) is the **system of record**. `expenses` is an ingestion/categorization layer whose approved rows feed the posting engine.
- QBO is a **downstream ledger** for accountant collaboration. Exports must originate from **posted journal entries** — never from raw source tables.
- QBO sync is **Phase 4** of the financial roadmap. Phases 2–3 (posting engine + backfill + DTO rebuild + review-queue burn-down) are the **Ledger Cleanup Program** and must complete first: exporting an unfooted ledger to QBO would fossilize bad numbers in the accountant's books.

**Sequencing rule: no QBO feed until the trial balance foots to the V17.26 anchors ($775,524.01) on beta.**

---

## 1. Ground Truth (verified against main @ b376dd1, 2026-08-06)

**No QBO code exists:** no Intuit SDK in `package.json`; no QBO router (20 audited); no QBO handler (15 audited); no QBO env vars in `env.ts`. The todo.md "QBO/Square Sync Failed" alerts pointed at crons whose targets were never built — orphan scheduler jobs must be found and deleted (§9).

**Schema assets live on main:**
- G.L. core: `journal_entries`, `journal_lines`, `transfer_pairs`, `tax_documents`, `tax_line_items` (drizzle/schema.ts §"PHASE 1 — UNIFIED GENERAL LEDGER")
- Seed data: `drizzle/seed_gl_accounts.sql` (~120 per-vertical G.L. accounts)
- QBO link fields: `chart_of_accounts.qboAccountId` + `qboSyncStatus` (`synced/pending_create/pending_map/geeves_only/deprecated`), `coa_mappings` (one_to_one/many_to_one/custom — aligns with the mapping framework's exact/rollup/split/create)
- Per-vertical QBO config: `vertical_financial_configs.qboRealmId`, sync direction, export approval required, batch size 50
- Legacy expense-layer fields: `expenses.qboExportStatus/qboExportDate/qboTransactionId` (retained; the expense layer keeps its own export state for traceability, but the G.L. drives the actual sync)

**Open infra question:** whether the Phase 1 G.L. migration + seeds were applied to the **Cloud SQL** beta DB during the TiDB→Cloud SQL cutover. Verified before anything else (cleanup item C-1).

**Missing docs:** `VERTICAL_GL_CATALOGS.md`, `QBO_MAPPING_FRAMEWORK.md`, `COA_CHANGE_LOG.md` — not in repo; recovery tracked in the cleanup program.

---

## 2. Prerequisite — The Ledger Cleanup Program (Phases 2–3 of the parent roadmap)

These are the "existing financials reflect cleanly in beta" workstreams. Each is independently verifiable.

| # | Item | Acceptance test |
|---|---|---|
| C-1 | **G.L. migration + seed on beta DB** — create the 5 G.L. tables on Cloud SQL if absent; run `seed_gl_accounts.sql` | `SHOW TABLES` shows all 5; `chart_of_accounts` holds ~120 G.L. accounts across the 9 verticals |
| C-2 | **Posting engine** — `server/services/postingEngine.ts`: source rows (property_bookings, ltr_payments, expenses, financial_transactions, airbnb_payout_records) → balanced journal entries (Σdebit = Σcredit enforced at write; `sourceTable`+`sourceId` lineage; idempotent re-runs) | vitest: every source type posts balanced entries; re-run produces zero duplicates |
| C-3 | **Backfill + trial balance** — backfill from the recon staging DB (`geeves_life_v2.db`, source of truth) into the G.L.; trial balance report per vertical | Per-vertical totals foot to V17.26 anchors; grand total = **$775,524.01** |
| C-4 | **DTO footing rebuild** — Due-to-Owner pairs across verticals foot and eliminate on consolidation | DTO receivable sum = DTO payable sum; consolidated view nets to zero |
| C-5 | **Review-queue burn-down** — 2,037 unattributed recon rows triaged (auto-match where confidence ≥ 0.85, manual queue UI for the rest) | Queue = 0 or every remaining row has an owner decision |
| C-6 | **Docs recovery** — commit `VERTICAL_GL_CATALOGS.md`, `QBO_MAPPING_FRAMEWORK.md`, `COA_CHANGE_LOG.md` from the recon workspace | All three in `docs/` on main |

C-2's posting engine is also what makes financials *stay* clean: every new booking/payout/expense posts to the G.L. at creation time from Phase 2 onward.

---

## 3. QBO Scope (post-cleanup)

**In scope:**
- QBO OAuth 2.0 connect/disconnect (Intuit Developer app), per-vertical realm bindings via `vertical_financial_configs.qboRealmId`
- COA mapping execution: pull QBO accounts, populate `coa_mappings` per the framework (exact/rollup/split/create; `pending_create` accounts pushed on next sync)
- Export worker: **posted journal entries** → QBO transactions, approval-gated (per `vertical_financial_configs` export approval), batched (50)
- Status write-back + failure classification + retry
- Settings → Integrations UI (connect card + export queue status)

**Schema delta required (Phase 4 only):** add export lifecycle columns to `journal_entries` — `qboExportStatus` (pending/exported/failed/not_applicable), `qboExportDate`, `qboTransactionId`, `qboRealmId`. (An entry belongs to exactly one vertical → exactly one realm, so per-entry columns suffice; no link table needed.)

**Explicitly deferred:**
- Revenue-side nuance beyond what posting engine produces (tax remittance per platform/jurisdiction is handled *inside* journal lines, so QBO inherits it for free)
- Square sync — separate integration, same orphan-alert status, no code exists
- Two-way sync (QBO → Geeves) — one-way push only (`geeves_to_qbo` per config)
- Bill-pay / payroll / bank feeds — out of scope entirely

---

## 4. Architecture

### 4.1 OAuth Connect Flow — `server/auth/qboOAuth.ts`

Modeled on `googleAccountConnect.ts`:

- Intuit OAuth 2.0, scope: `com.intuit.quickbooks.accounting` (the only accounting scope Intuit offers — least-privilege rule §13 satisfied by documentation, since no narrower variant exists)
- Mandatory nonce + session binding on `state` (P-14 / H-9 origin allowlist applies to the redirect)
- Token storage: **new table `qbo_connections`** (do NOT overload `oauth_tokens` — that table is Google-routed by `accountEmail`):

| Column | Type | Notes |
|---|---|---|
| id | varchar(36) PK | nanoid |
| householdId | varchar(36) FK | |
| verticalId | varchar(36) FK | **per-vertical realm binding** — one connection per (vertical, environment) |
| realmId | varchar(64) | Intuit company ID |
| environment | enum(sandbox, production) | drives base URL |
| accessToken / refreshToken | text | encrypted at rest (same scheme as oauth_tokens) |
| refreshTokenExpiresAt | bigint | UTC ms — Intuit refresh = 100 days, **rolling**; alert at 7 days remaining |
| accessTokenExpiresAt | bigint | UTC ms (1h lifetime) |
| connectedByMemberId | varchar(36) FK | audit |
| status | enum(active, expired, revoked, error) | drives dashboard health |
| createdAt / updatedAt | timestamp | |

- **Rolling refresh rule:** every refresh returns a NEW refresh token. Persist atomically in the same transaction as the access token. Losing it = full reconnect.

### 4.2 QBO API Client — `server/services/qboClient.ts`

- Base URLs: `https://sandbox-quickbooks.api.intuit.com` / `https://quickbooks.api.intuit.com`, path `/v3/company/{realmId}/...`
- `minorversion` pinned (current: 75) in one constant
- Single-flight refresh on 401 (token-race pattern from calendarWebhook history)
- Typed wrappers only for what we use: `query`, `createPurchase`, `createJournalEntry`, `readAccount(list)`, `companyInfo`
- All calls `logAudit()` — category `qbo`

**Posting entity choice:** G.L. entries map to QBO **JournalEntry** entities by default (true double-entry passthrough — preserves our debit/credit lines exactly). `Purchase` is used only where QBO-side vendor reporting requires it (decision per mapping-framework review; default: JournalEntry).

### 4.3 COA Mapping — `server/routers/qbo.ts`

- `qbo.getConnectionStatus` — per-vertical connection health for Settings UI
- `qbo.disconnect` — revoke + mark revoked (GDPR path must also revoke)
- `qbo.listQboAccounts` — pull QBO Chart of Accounts for mapping UI
- `qbo.upsertCoaMapping` — write `coa_mappings` rows (exact/rollup/split; `requireExpenseAccess()` guard)
- `qbo.getExportQueue` — counts by export status per vertical

### 4.4 Export Worker — `server/scheduledHandlers/qboSync.ts`

Modeled on `shadowBlockSyncRetry.ts`:

- `POST /api/scheduled/qbo-sync`, `x-cron-secret` auth, localhost bypass — identical contract
- Cloud Scheduler: every 15 min
- Batch: 50 **posted, unlocked** journal entries where `qboExportStatus='pending'` **and the vertical's config has export approval granted** (approval is a UI action per batch; worker never exports unapproved batches)
- Per entry: resolve realm from `vertical_financial_configs`; map each journal line's `glAccountId` → QBO AccountRef via `coa_mappings` (rollup collapses N lines → 1; split fans 1 → N by class/property); build QBO JournalEntry; POST
- **Write-back (P-16 cardinal rule):** only a QBO 2xx with returned entity `Id` sets `exported` + `qboTransactionId`. Anything else = `failed` + error text.
- Error classification: 401 → connection `error` + owner notify (no entry retry burn); 400 validation → `failed`, surfaced for mapping fix; 429/5xx → stays `pending`, backoff; unmapped account → `skippedUnmapped` count, entry untouched
- Response: `{ processed, exported, failed, skippedUnmapped, perVertical: {...}, elapsed }`

### 4.5 UI

- Settings → Integrations: "QuickBooks Online" card — per-vertical connect/status, environment badge, realm company name, token health
- Finance/G.L. view: export status chip per journal entry; **export approval queue** (batch review → approve → worker picks up) — this is the approval gate from the parent design
- `financial` data category: all qbo router responses pass `stripByPolicy()` for restricted members (Cary model)

---

## 5. Environment & Secrets

| Env var | Secret name (GCP) | Notes |
|---|---|---|
| `QBO_CLIENT_ID` | `geeves-qbo-client-id` | From Intuit Developer app |
| `QBO_CLIENT_SECRET` | `geeves-qbo-client-secret` | Never logged |
| `QBO_ENVIRONMENT` | plain env | `sandbox` until cutover |
| `QBO_REDIRECT_URI` | plain env | `https://beta.geeves.life/api/auth/qbo/callback` |

Beta and live get separate connections — same secret names, per-service values.

---

## 6. Governance & Compliance Hooks

- **Audit:** `qbo.connect`, `qbo.disconnect`, `qbo.export.approved`, `qbo.export.success`, `qbo.export.failure` in `audit_log` (metadata: realmId + counts, never tokens)
- **Access:** all qbo procedures behind `requireExpenseAccess()` (household_admin or ea)
- **P-16 / P-12:** write-back only on verified 2xx; guard on ALL export paths including bulk/replay
- **G.L. invariants preserved:** export never mutates journal lines; posted+locked entries are read-only to the sync

---

## 7. Testing Plan

- vitest: qboClient (refresh single-flight, error mapping), qboSync (batching, rollup/split mapping, classification, write-back, approval gate), qboOAuth (nonce, state binding, origin allowlist)
- Suite health bar: 289+ passing, `tsc --noEmit` clean before merge
- Real-world (§12 testing principles): sandbox end-to-end — connect, map 3 accounts, approve + export 5 entries, verify in QBO sandbox UI, disconnect → revoked status + banner

---

## 8. Rollout Phases

| Phase | Deliverable | Gate |
|---|---|---|
| **0** | This doc + FINANCIAL_DESIGN_PLAN.md merged; orphan crons deleted | PR approved |
| **1** | **Cleanup C-1**: G.L. migration + seeds verified/applied on beta DB | 5 tables + ~120 accounts present |
| **2** | **Cleanup C-2 + C-6**: posting engine + docs recovery | vitest green; re-run idempotent |
| **3** | **Cleanup C-3 + C-4 + C-5**: backfill, DTO rebuild, review-queue burn-down | **Trial balance foots to $775,524.01; DTO nets zero; queue = 0** |
| **4** | Intuit app (owner action) + OAuth connect + `qbo_connections` + COA mapping UI | Connect/disconnect on beta sandbox; mappings populated |
| **5** | Export worker + scheduler + approval queue UI | 5-entry sandbox export verified in QBO UI |
| **6** | Production cutover: production Intuit keys, live realms connect | Owner sign-off + tax-prep dry run |

---

## 9. Housekeeping Tied to This Project

- `gcloud scheduler jobs list --project=geeves-495802` — find/delete orphan jobs pointing at QBO or Square endpoints
- todo.md 2543–2544: update once orphans confirmed dead

## 10. Open Decisions (owner)

1. **Intuit app ownership:** app under a business-controlled Intuit account
2. **Realms:** one QBO company with Classes per vertical vs. multiple companies (design supports both via per-vertical `qbo_connections` rows) — confirm QBO plan tier
3. **Historical export:** after Phase 5, export the backfilled historical G.L. to QBO? (Recommend: yes, batched, owner picks cutoff)
4. **JournalEntry vs Purchase** entity mapping (default JournalEntry; see §4.2)

---

*v2 corrects the export source to the Unified G.L. per FINANCIAL_DESIGN_PLAN.md and sequences QBO behind the Ledger Cleanup Program. Built on: PR #5 G.L. schema, Section 16 schema stack, Jul 5 Property Financial Overhaul, V17.26 recon baseline, shadowBlockSyncRetry production pattern (Aug 6, 2026).*
