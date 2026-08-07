# Geeves.Life — Unified Finance Implementation Plan v2.2
## Implementation-Ready · Owner Decisions D1–D10 Locked · Manus Review Integrated

**Version:** 2.2 (supersedes v2.1)
**Date:** 2026-08-07
**Basis:** v2.1 (5-specialist swarm, staging-DB-verified) + Manus Pre-Implementation Review of v2.1 (`docs/FINANCE_PLAN_REVIEW_V2.1.md`, code-verified against `drizzle/schema.ts`, `server/routers/rbac.ts`, `server/routers/accessControl.ts`, `server/db.ts`) + owner decisions D7–D10.
**Companions:** `docs/finance/migration_pack.sql` (staging cleanup) · `docs/finance/VERTICAL_GL_CATALOGS_v2.md` · `docs/finance/uiux_review_g6_report.md` (round-1; brand redo pending) · `docs/finance/FINAL_NOTES_v2.2_Integration_Brief.md` · `docs/finance/project_knowledge_inserts_20260807.sql`

**What changed v2.1 → v2.2 (six deltas, per Manus review + owner sign-off):**
1. Production Drizzle migration is now a required artifact alongside the SQLite staging pack, with a defined staging→production transfer step (§3).
2. Chart-of-accounts divergence resolved: `chart_of_accounts` is canonical (D8) (§2.2).
3. Vertical identity bridged: `verticals.code` unique + registry `vertical_id`; UUIDs storage, codes vocabulary (§2.3).
4. Ledger scope settled: single household, TJ Perkins Global / tarik@tjperkinsfam.com (D7) (§2.1).
5. Access model adopted from Manus Part 3 (D9): vertical-scoped capabilities, one fail-closed resolver, EA empowered, co-admin via `vertical_owners.isFinancialOwner` (§4).
6. Square recorded as explicit non-goal (§8).

v2.1's accounting content — the §3.4 precedence matrix, 4-class dedupe, interest retype, decomposed anchors, sensitivity scrubbing — is carried through **unchanged** (Manus endorsed it verbatim).

---

## 0. Locked Owner Decisions

| # | Decision | Status |
|---|---|---|
| D1 | **SELF → PERS fold** (doc-side only; zero DB rows; non-deductible post-fold; one-time vendor scan attributes business-skill spend to MB/MM/TJPGG) | 🔒 |
| D2 | **Staging vertical codes canonical**; 3-digit staging account codes are system of record; doc 4-digit codes retired to `vertical_code_map.doc_code` | 🔒 |
| D3 | **GL = Geeves.Life** keeps code; doc "Good Life" renamed GDL (zero data) | 🔒 |
| D4 | **month = fiscal calendar month** everywhere (119 Scotia statement-cycle rows recomputed, per-row logged) | 🔒 |
| D5 | **Mirror rows 20057/20058 = USD** | 🔒 |
| D6 | **2-realm QBO allowlist** (bakery `123145971566304`, MMG `9130350512376806`); others `geeves_only` but export-ready; PERS/FAM hard-excluded. Enforced by data: `vertical_code_map.sync_allowlisted` boolean | 🔒 |
| D7 | **Ledger scope: single household — TJ Perkins Global** (`V8lk3KJatvxBTWURf4uo9`, tarik@tjperkinsfam.com). MB/MM verticals migrate into it from TJ Perkins Fam (`YouIQoAP6nmcPNljVdUis`). `householdId` remains the top-level scope key on every financial table; no new `ledgerId`. Legacy household becomes non-financial. | 🔒 2026-08-07 |
| D8 | **`chart_of_accounts` canonical** in production (already QBO-bound via `coa_mappings`); staging `gl_accounts` is an import source only. Tax-form dimension lives on BOTH account (default) and journal line (override); precedence: **line overrides account**. `journal_lines.glAccountId` gets a real FK to `chart_of_accounts`. | 🔒 2026-08-07 |
| D9 | **Access model per Manus Part 3 approved** (§4): co-admin = `vertical_owners.isFinancialOwner`; 5 vertical-scoped + 2 global capabilities; single fail-closed resolver; EA empowered on assigned verticals, denied Unassigned queue; QBO export household-admin-only | 🔒 2026-08-07 |
| D10 | **Gate G2 = materiality threshold**, not strict zero: zero unresolved items > $50; zero in owner-judgement conflict classes (65 dedupe + 17 H5 + contested overlaps); residual < $50 parked in a suspense account with named owner (Tarik) and 90-day review | 🔒 2026-08-07 |
| — | **Square is an explicit non-goal** (§8) | 🔒 2026-08-07 |

---

## 1. Audit Baseline (staging-verified; production-corrected)

The v2.1 staging baseline stands (full table in v2.1 §1). Headline corrected anchors (deduped, pre-65-conflict-resolution): **MB 312,505.33 · MM 248,432.67 · BL 142,515.17 · PERS 200,349.33 · FAM 36,938.48 · GL 2,508.22 · SO 1,333.37 · BLab 11.19** — decomposed per vertical into {P&L spend, income, equity, rail, REV} (§5). These figures were adopted by the Manus review's Phase B checklist; any older V17.26-era numbers are void.

**Production corrections from the Manus review (v2.2 amends v2.1 §1 wording):**
- **Per-property dimension EXISTS in production** (`propertyId` on `journal_entries`/`journal_lines`, indexed; `property_expense_records`). The "no per-property dimension" finding is **staging-only**. Phase 5 property work = **join, not build**.
- **OTA commissions are already modelled**: `airbnb_payout_records` decomposes `grossAmount`/`hostFee`/`cleaningFee`/`occupancyTaxes`/`vat`/`netPayout` + currency/FX; `property_bookings` carries `commissionAmount`/`netAmount`. The gross-up pass reads these tables — it must NOT reconstruct commissions from bank deposits (that would produce a second, disagreeing figure).
- **Existing expense subsystem dispositioned** (§6 Phase notes): `expenses` → read-only at cutover; `expense_categorization_rules` → adopted as the rule store (vendor suggestions + workbench batch rules); `property_expense_records` → reconciled into the ledger with `propertyId` preserved; `invoiceExtraction` → retained as draft-entry input adapter.
- **Live bug to fix in the Phase A migration:** `tax_documents.verticalId` is `varchar(36)` defaulting to the literal string `"pers"` — invalid UUID, exactly the bug class the code/UUID mismatch generates.

**Queue-population canon (reconciles all prior counts — v2.1, G6 report, Manus HIGH-1):**

| Segment | Count | Definition |
|---|---|---|
| REV queue | 2,037 | `vertical='REV'` attribution lines |
| `(review)` overlap txns | 712 | txns whose only categories are `(review)`-suffixed |
| Unattributed `(review)` | 209 | `(review)` txns with no attribution lines |
| Rail-sweep candidates | ~1,016 | transfer-type + card-payment txns, unattributed |
| Dedupe conflicts (owner) | 65 | 4-class dedupe, differing line-sets |
| H5 vehicle conflicts (owner) | 17 | non-REV business attribution contradicting allocation split (10 BL + 7 MB; staging-measured) |
| Pair×attribution overlaps | 286 | transfer-paired txns also carrying attribution lines |
| Allocation∩attribution txns | 214 | txns with both allocation_lines and attribution_lines (overlaps the H5 set; NOT identical to the 286) |

Total opening workbench ≈ **4,350 items** ("≈4,200" in the G6 report is the same population minus rounding of the rail-sweep estimate). G2 governed by D10.

---

## 2. Production Architecture Decisions

### 2.1 Ledger scope (D7) — single household: TJ Perkins Global
- All financial tables are scoped `householdId = V8lk3KJatvxBTWURf4uo9` (TJ Perkins Global, tarik@tjperkinsfam.com).
- **Vertical migration:** MB and MM verticals (+ their access rows, vertical_owners, data policies) move from TJ Perkins Fam into Global via a scripted, logged migration (same safeguards as staging: snapshot, dry-run, change log). `householdIsolation.ts` guards mean NOTHING financial may remain queryable in the legacy household after cutover; the legacy household keeps non-financial data only.
- All anchors (§1) belong to the Global ledger; G4's acceptance test runs scoped to that one `householdId`.
- The only cross-household movement precedent (super-admin property reassignment with typed confirmation) is the template for this one-time move.

### 2.2 Chart of accounts (D8) — `chart_of_accounts` canonical
- Production chart = `chart_of_accounts` (carries `qboSyncStatus`, `parentAccountId`, `isSystemAccount`) + `coa_mappings` (QBO bindings). NOT renamed.
- Staging `gl_accounts` (139 rows post-§10, incl. tax columns and the 6 new accounts) is the **import source**: the transfer step maps staging codes → `chart_of_accounts` rows (create-or-match by code), then binds categories via the one bridge (`gl_category_map` equivalent — see §2.4 naming).
- `journal_lines.glAccountId` (`varchar(21)`, currently dangling) receives a real FK to `chart_of_accounts` in Phase A.
- **Tax-form dimension:** account-level `taxFormLine`/`isTaxRelevant`/`taxJurisdiction` added to `chart_of_accounts` as defaults; the existing `journal_lines.taxFormLine`/`isTaxRelevant` (+ `jl_tax_form_idx`) are line-level overrides. **Precedence: line value wins; absent line value falls back to account default.** G3's verification queries both layers accordingly.

### 2.3 Vertical identity — codes ↔ UUIDs bridged
- `verticals.code` added, `VARCHAR(16)`, unique — codes remain the human/cross-document vocabulary; UUIDs remain storage keys (invariant 7 preserved).
- `vertical_code_map.vertical_id` added (FK to `verticals.id`) so the registry bridges staging codes → production UUIDs.
- Seed missing verticals in production: **TJPGG, BLab, GL, REV, MULTI** (MB/MM/BL/PERS/SO exist; FAM to confirm at migration). Brand colors/icons for new verticals drawn ONLY from the approved palette (6 rainbow + 5 foundation — verified in the UI/UX brand layer; audited by checklist E18).
- `verticals.isSystemBucket` added; REV + MULTI flagged. **Every** vertical enumeration (selectors, access matrices, report groupings, constellation view) is audited to honour it — system buckets never appear as user-selectable verticals and never post (checklist A3).
- Fix `tax_documents.verticalId` default `"pers"` (§1).

### 2.4 Registry amendment (CRITICAL-1b fix, applies to `migration_pack.sql` §1 too)
- Geeves.Life row: `qbo_entity` → `pending` (D6: realm does not exist yet).
- Registry gains `sync_allowlisted BOOLEAN NOT NULL DEFAULT 0`; exactly two rows set true (MB, MM) — D6 enforced by data, not prose.

### 2.5 Production schema deltas (Phase A Drizzle migration; MySQL 8.0, `DECIMAL(15,2)`, `utf8mb4_0900_ai_ci`)
| Table | Delta |
|---|---|
| `journal_entries` | `status` ENUM('draft','posted','reversed','reversal') NOT NULL DEFAULT 'draft'; `reversesEntryId`, `reversedByEntryId` (self-FKs); `reversalReason`, `reversedBy`, `reversedAt`; `reconStatus` ENUM('unreconciled','matched','verified','disputed') DEFAULT 'unreconciled'; `reconRef`, `reconciledAt`, `reconciledBy`. **Posted entries immutable** — mutation forbidden, reversal-only; double reversal impossible by constraint (unique `reversedByEntryId`). `entryDate` DATE + `postedAt` TIMESTAMP already exist (Manus-verified Resolved). |
| `journal_lines` | `glAccountId` → real FK (D8); currency NOT NULL DEFAULT 'USD' + `exchangeRate` + `usdEquivalent` exist; add `reportingAmount` DECIMAL + `reportingCurrency` CHAR(3) (currency-neutral supplement to `usdEquivalent`); `receiptId` FK → `receipt_images`. Line vertical: denormalise `verticalId` onto the line (pragmatic — appears in every filter; indexed) |
| `verticals` | `code` unique, `isSystemBucket`, `reportingCurrency` CHAR(3) (e.g. BL=JMD, MM=USD), `financeRedactedLabel` (cross-vertical placeholder, defaults 'Internal — Personal'/'Inter-company', admin-configurable — shadow_blocks `busyLabel` precedent) |
| `households` | `reportingCurrency` CHAR(3) DEFAULT 'USD' |
| `transfer_pairs` | `transferType` enum → `varchar(50)`; new `transfer_rail_types` reference table seeded: existing 7 + `stripe`, `ota_payout`, `card_funding`, `wire`, `ach`, `multi_clearing`. **NO `square` row (§8).** Engine validates against the table |
| `vertical_owners` | `isFinancialOwner` BOOLEAN DEFAULT 0 (co-admin definition, D9) |
| `audit_log` | `category` enum += `'financial'`; `metadata` JSON covered by the PII-scrub denylist |
| `workbench_queue` (new) | `verticalId` NULL-able, `tentativeVerticalId` NULL-able, `queueType` ENUM('uncategorised','vertical_assignment','dedupe_conflict','allocation_conflict','pair_attribution_overlap','mis_paired_deposit','rail_sweep','unattributed'), status, payload refs |
| `receipt_images` (new) | storage key (S3 via `storagePut` — never DB blobs), uploader, uploadedAt, source (camera/file), extractedText (access-gated + scrubbed), extractionConfidence, optional `journalEntryId` |
| `period_locks` (new) | householdId, period, lockedBy, lockedAt, unlock requires dual control + mandatory reason; unlocking a synced period enqueues QBO re-reconciliation |
| `vertical_code_map`, `migration_change_log`, `retired_txn_map`, `anchor_cache` | created in production (MySQL dialect), seeded from staging post-transfer |
| FX rule | Line rate = transaction-date rate from `exchange_rates`, stored in `exchangeRate` **immutable**; fallback = nearest prior rate, documented in the posting engine |

### 2.6 Staging cleanup pack — relabelled
`migration_pack.sql` is **staging cleanup only** (SQLite, disposable copy). Its §1 seed gets the §2.4 amendment. The **transfer step** (staging→production) is a separate documented artifact: household assignment (all rows → Global, D7), vertical code→UUID resolution (§2.3), account mapping (§2.2), DECIMAL conversion, executed with the same six safeguards.

---

## 3. Cleanup Program (unchanged from v2.1 §3 — staging side)

Carried verbatim: mandatory six safeguards; **3.1** 4-class dedupe (149 delete / 4 move / 65 owner-conflict queue / rest mechanical; `retired_txn_map`; TRIM-normalized keys against PAD SPACE); **3.2** normalization (pct per-group ×100 + 118 NULL derive + txn 18600 + 99.99 absorb; date truncation; D4 fiscal month; D5 USD; ghost-row repair; DECIMAL in production); **3.3** H5 refined precedence (allocation wins only vs REV/PERS-default; 197 superseded after REV disposition; 17 conflicts to workbench; `allocation_lines XOR attribution_lines` with startup assertion; vehicle tax layer §280F/4684 in Phase 5); **3.4** rail/attribution/refund precedence matrix (rail-wins-only-if-disposition=rail; income-on-paired-txn → REVIEW; equity leg only, Owner Investment 211-line −$1,810.81 control; refunds same-account contra, 4 cross-year pairs flagged; $30,797.95 annuity = 1099-R review before any rail sweep); **3.5** interest is expense (retype 4 accounts; ~42% coverage gap owner-explained); **3.6** mapping-bridge fill (PII scrub FIRST; master_coa merge-then-retire; 169 categories + 1,268 NULL-category lines / $485,795.89 dispositioned; 13-category bridge with owner-confirmation flags; landmine retypes); **3.7** QBO binding hardened (2-realm allowlist by data per §2.4; tokens in Secret Manager; webhook HMAC + nonce replay protection; `UNIQUE(txn_id, realm)` idempotency; household_admin approval gate; PII-scrubbed batch preview + payload linter; sandbox realm first).

---

## 4. Access Model (D9 — adopted from Manus Part 3)

### 4.1 Primitives
- **Vertical co-admin** = member (base role `member` or `ea`) holding `vertical_owners.isFinancialOwner = 1` for that vertical. No role-enum change. Operational ownership and financial ownership are separable (a property manager can run BL calendars with zero P&L visibility).
- **Five vertical-scoped capabilities** (replace global `finance.view`/`finance.manage`, retained only as deprecated aliases during transition):

| Capability | Meaning | Default holders |
|---|---|---|
| `finance.view_aggregate` | Vertical totals/trends/headlines; no lines, no memos; category breakdown suppressed < 3 lines (k-anonymity at query time) | `member` read_only; EA where floor applies |
| `finance.view_detail` | Line detail incl. memos, granted vertical | household_admin; financial owner; EA with `full` |
| `finance.post` | Create/post entries, granted vertical (implies view_detail) | household_admin; financial owner; EA with `full` |
| `finance.resolve_workbench` | Resolve queue items in granted vertical (implies post) | household_admin; financial owner; EA with `full` |
| `finance.export_qbo` | Approve/push QBO batches | household_admin only, non-delegable |

- **Two global capabilities:** `finance.assign_vertical` (items whose vertical IS the open question — household_admin only; this is why the Unassigned tab exists separately) and `finance.view_sensitive` (salary/emoluments/child-medical; audited on every use).
- Permissions UI: dedicated `finance` group in `PERMISSION_GROUPS` (out of `content`).

### 4.2 The resolver — `canAccessFinancials(memberId, verticalId, capability)`
One function; called **first** in every financial procedure (before input validation); no procedure reasons about roles directly. Resolution order: ① active member of the vertical's household (D7 boundary) → ② `member_permission_overrides` row (decisive both directions; explicit denial outranks role grant) → ③ `vertical_member_access` level (`none`/`blind`/no row → deny detail; `blind` also suppresses aggregates) → ④ `vertical_data_policies` `financial` category (`hiddenFromRoles`/`hiddenFromMemberIds`) → ⑤ role/ownership grant per §4.3 → ⑥ sensitive attributes require `finance.view_sensitive` as an ADDITIONAL gate. **Fails closed** on any unexpected state; denial is an opaque `FORBIDDEN` (indistinguishable from "does not exist"). Exhaustive unit suite: 8 roles × capabilities × {no row, none, blind, read_only, full}, written **before the first financial procedure**.

### 4.3 Role/capability matrix (owner-signed, D9)

| Role | Scope | Aggregate | Detail | Post | Resolve | Unassigned | QBO export | Sensitive |
|---|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Household admin (owner) | All (Global ledger, D7) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| EA, `full` on assigned verticals | Assigned only | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | explicit grant |
| EA, `read_only` vertical | That vertical | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Vertical co-admin (`isFinancialOwner`) | Own vertical | ✅ | ✅ | ✅ | ✅ | ❌ | only if granted | explicit grant |
| Member `full` | Granted verticals | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Member `read_only` | Granted verticals | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Member `blind`/no row · caregiver · child · elder | None | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

`member` + `full` = visibility, not authority — posting is always a deliberate grant. Caregiver/child/elder deny-by-default but grantable by override (elder-care scenario).

### 4.4 Routing & surfaces
- Vertical in the URL: `/finance/:verticalCode/{overview,journal,workbench,entry,reports,reconcile}` + admin-only `/finance/{overview,unassigned,export,accounts}`. Codes validated against the registry and resolved to UUIDs server-side; unknown/unentitled → same opaque forbidden. Bare `/finance` redirects by entitlement (admin → consolidated; one vertical → that overview; several → chooser).
- **Cross-vertical redaction:** entries appear in every vertical they touch; viewers see only their entitled lines; counterparty renders as `financeRedactedLabel` + amount (never account/memo). P&L computed from **lines**, not entry headers (no double-count).
- **Workbench:** item carries `verticalId` OR `tentativeVerticalId` + explicit `queueType` (§2.5). Known-vertical items → `finance.resolve_workbench` holders; undetermined → Unassigned tab (`finance.assign_vertical`, admin-only, **absent not disabled** for others). Grouping first-class (vendor/amount/date/account cohorts), batch resolution writes a persistent `expense_categorization_rules` row (cohort → standing rule), default sort = materiality (|amount| desc). Workbench resolutions pass through `postEntry()` authorisation — no side door.
- **Role experiences:** admin = consolidated overview w/ decomposed anchors, workbench badge per vertical, unreconciled counts, QBO status per realm. EA = switcher with exactly their verticals, no "All", entry form pre-selects vertical from route. Co-admin = single vertical, no switcher — the reference experience. Read-only = aggregates + k-anonymity suppression (query-time line count; the $17,399.36 single-line categories are the canonical test). Caregiver/child/elder = Finance **absent** from the sidebar, not empty.
- **Mobile receipt capture:** camera → extraction → review → post; vertical from route not picker; suggestions from `expense_categorization_rules`; offline = queued draft. Extracted text is access-gated and PII-scrubbed (receipts can carry card numbers / child-medical info).
- **Brand layer:** all finance surfaces follow BRANDING.md — vertical colors from the 6-color palette paired with code text (colorblind rule), Outfit display typography, dark-mode <10% brand tint on Deep Charcoal, constellation mark usage per lockup rules. The pending brand-consistent UI/UX revision (`uiux_brand_review_v2.md`) layers visual tokens onto Manus Part 3's access structure; G6's tooling design (bulk-accept w/ dry-run + collision warnings, burndown-as-deprecation-countdown, bot chips, no silent edits, batch undo preserving append-only lineage, compare mode with zero-unexplained-delta rule, screen-reader focus mode) stands.

### 4.5 Posting engine authorisation & audit integrity (CRITICAL-6)
`postEntry(actor, …)`: first statement = `canAccessFinancials(actor, verticalId, 'post')`; rejects locked periods absent unlock capability + reason; rejects imbalance to the cent; enforces per-txn Σpct = 100; writes the audit row (`category='financial'`) **in the same transaction** (a post without audit is not representable). Posted entries immutable; corrections = reversal entries (`reversesEntryId`/`reversalReason`); double reversal blocked by constraint. edit_log hash chain (SHA-256, notarized anchors) + append-only (DB privileges + INSTEAD OF triggers) per v2.1 §5.

---

## 5. Anchors & Acceptance Gates (v2.2)

Anchors: decomposed per vertical {P&L spend, income, equity, rail, REV}, computed post-dedupe post-transfer, scoped `householdId` = Global (D7), PERS included, card-interest treatment documented in the anchor query. Baselines per §1 (subject to 65-conflict resolution). `anchor_cache` = self-busting memo, watermark = `MAX(edit_log.id)`.

| Gate | v2.2 criterion | State |
|---|---|---|
| G0 Executability (NEW) | Production Drizzle migration provisions every Phase 1 table (§2.5); transfer step documented; Phase 0 checklist 0.1–0.9 counter-signed | 🔴 |
| G1 Registry | vertical_code_map bridged to production UUIDs (§2.3), `sync_allowlisted` enforcing D6, GL qbo_entity pending | 🔴→ buildable |
| G2 Coverage | **D10 materiality**: zero unresolved > $50; zero in owner-judgement classes; documented suspense residual w/ 90-day review; pair×attribution overlaps resolved; Σpct=100 ∀ posted; no NULL pct | 🔴 |
| G3 Mapping | 169 categories + NULL-category set dispositioned; `chart_of_accounts` carries tax defaults, lines carry overrides (D8 precedence documented); BL chart complete for Sch E; GL/BLab fork resolved | 🔴 |
| G4 Balance | Trial balance foots to decomposed anchors per vertical incl. PERS within $1.00, scoped to the Global household; hash-chain verification passes; anchor queries return only access-permitted scope per role | 🟡 |
| G5 Sync | ≥1 locked period precedes first push; sandbox first; 2-realm allowlist by data; webhook replay test + token audit + PII linter pass | 🔴 |
| G6 UI parity | 9 capabilities; EA matrix corrected (§4.3) and demoed under blind + read_only test accounts; drift-ledger zero unexplained deltas; brand audit (E18) passes | 🟡 |

Deprecation sequence: G0–G3 → backfill/transfer → G4 → QBO runs → G5 → G6 → 30-day read-only comparison mode → archive → remove.

---

## 6. Roadmap (phases mapped to the Manus accountability checklist)

- **Phase 0 (pre-sprint gate, owner counter-signs):** 0.1 production migration artifact · 0.2 staging-pack relabel + transfer step · 0.3 G6 role matrix corrected · 0.3b registry §2.4 fix · 0.4 CoA decision (D8 ✔) · 0.5 household decision (D7 ✔) · 0.6 vertical identity (✔ §2.3) · 0.7 access model (D9 ✔) · 0.8 Square non-goal (✔ §8) · 0.9 G2 threshold (D10 ✔)
- **Phase A (schema & core engine, checklist A1–A20):** §2.5 deltas; resolver + unit suite FIRST; posting engine §4.5; alias resolution; `finance` permission group
- **Phase B (migration, B1–B25):** vertical migration into Global (D7) → staging cleanup pack → transfer step → anchors B5/B6 foot; all safeguards; PII scrub before mapping; hash chain verifies
- **Phase C (unified expense tool, C1–C8):** receipt pipeline (S3 + `receipt_images`), DTO leg, vendor suggest from rules, split entries, legacy `expenses` read-only, offline mobile drafts
- **Phase D (QBO export, D1–D12):** allowlist by data, PERS/FAM structurally excluded, idempotency, admin-only approval, linter, replay protection, Secret Manager, locked-period-first, sandbox-first, inter-company lands in both realms
- **Phase E (interface & access, E1–E18):** §4.4 surfaces incl. absence-not-empty for child/caregiver/elder, switcher scoping, line-based P&L, redaction, k-anonymity at query time, Unassigned absence, materiality sort, brand palette audit
- **Phase F (governance & monitoring, F1–F7):** heartbeat-scheduled invariant monitor (balance, Σpct, overlap, locked-period, hash chain — seeded-violation alerts; NEVER setInterval/node-cron); weekly ledger-health report (unreconciled count, queue depth, last anchor check); period-lock dual control; full regression; 30-day comparison mode
- **Phase 5 tax (join-not-build per §1):** MB Jamaican Ltd (corp return + GCT; 5471/CFC/GILTI); vehicle depreciation/§280F/4684; Jamaica payroll withholding confirm; Sch E per property via `propertyId` + `airbnb_payout_records`/`property_bookings` gross-up; annuity 1099-R review

**Owner-attention items (open):** 65 dedupe conflicts · 17 H5 conflicts · MM $1,000 anchor reconciliation (during conflict resolution) · interest coverage gap (~42%; e.g. amex_biz $15,187.22 raw vs $9,021.47 rollup) · $30,797.95 annuity 1099-R · per-item contribution-vs-loan confirmations (§3.6 flags) · GL/BLab-vs-TJP account fork · BL display name confirm (Bohemian Lodges vs Blue Lagoon) · betalabpro.com status.

---

## 7. Invariants v2.2

1–5 from v1.0 stand. 6–10 from v2.1 stand (one bridge; one vocabulary; anchors computed not stored; rails never swallow revenue; scrub before mapping). Plus:
11. **One ledger, one household** — all financial rows scoped to TJ Perkins Global (D7); no financial data remains queryable in the legacy household.
12. **One chart** — `chart_of_accounts` canonical (D8); staging charts are import sources; `glAccountId` never dangles.
13. **Codes are vocabulary, UUIDs are keys** — every vertical reference resolves through `vertical_code_map`; system buckets never render as user verticals.
14. **Authorisation precedes validation** — every financial procedure calls the resolver first and fails closed; posted entries are immutable, corrections are reversals; a post without its audit row is not representable.
15. **No speculative rails** — new rail types are configuration in `transfer_rail_types` (§8: no Square).

---

## 8. Scope Boundary — Square Is Explicitly Out of Scope

Owner decision, 2026-08-07. **Square is not part of the Geeves.Life financial engine; no Square plumbing is to be built.** No connector, no settlement parsing, no `square` row in `transfer_rail_types`, no clearing/fee accounts in the chart. The merchant-clearing pattern is deliberately generic; do not infer that every processor deserves a connector. If Square ever enters scope, it reuses the Stripe pattern exactly (gross charges → income; refunds → contra-revenue; fees → fee expense; net payout → non-P&L asset transfer) — a configuration, not new design.

---

## 9. Document Governance (standing rule)

All project documents and plans live in this repo (`docs/`, finance workpapers `docs/finance/`). After every key document update or completed review: push to the repo AND insert knowledge into the **`project_knowledge` DB table** — `docs/AI_MEMORY.md` is auto-generated by `knowledgeReview.ts` from that table every 24h; **never hand-edit it**. Session-generated artifacts never remain workspace-only.

---

*v2.2 = v2.1 accounting (endorsed intact by the Manus review) + production executability + household/CoA/vertical-identity decisions + the Part 3 access model + Square non-goal + D10 materiality gate. Phase 0 sign-offs D7–D10 recorded 2026-08-07. Implementation proceeds under the Manus accountability checklist with owner counter-signature per phase gate.*
