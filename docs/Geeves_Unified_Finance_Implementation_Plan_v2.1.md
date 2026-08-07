# Geeves.Life — Financial Design Plan v2.1
## Swarm-Reviewed · Owner Decisions Locked · Implementation-Ready

**Version:** 2.1 (supersedes v2.0)
**Date:** 2026-08-07
**Review basis:** 5-specialist swarm review (Accounting/CPA, Database Design, Performance, Security, UI/UX), every finding independently verified against `geeves_life_v2.db`
**Companion artifacts:** `migration_pack.sql` (executable cleanup) · `VERTICAL_GL_CATALOGS_v2.md` (regenerated catalogs) · `uiux_review_g6_report.md` (screen specs)

---

## 0. Locked Owner Decisions

| # | Decision | Status |
|---|---|---|
| D1 | **SELF (Self / Tarik) vertical eliminated → maps into PERS.** SELF has zero rows anywhere in the DB — the fold is doc-side only. Post-fold, none of this spend is deductible (Form 2106/Sch A misc. deductions are federally suspended through TY2025). One-time scan of professional-development vendors before the fold: any spend that maintains skills for an *existing* business should be attributed to that business (MB/MM/TJPGG) instead of PERS. | 🔒 LOCKED |
| D2 | Staging vertical codes (`MB/MM/BL/PERS/FAM/GL/SO/BLab/TJPGG` + system buckets `REV/MULTI`) are canonical; doc codes live on in `vertical_code_map.doc_code`. Staging 3-digit account codes (`MB-100`) are the system of record; doc 4-digit codes (`BKY-1001`) retired. | 🔒 LOCKED (v2, confirmed) |
| D3 | GL collision: staging `GL` = Geeves.Life keeps the code (has data). Doc-side "Good Life" renamed `GDL` in regenerated catalogs (zero data). | 🔒 LOCKED (v2, confirmed) |
| D4 | Scotia Gold `month` mismatches (119 rows) are deliberate credit-card statement-cycle bucketing. **RESOLVED 2026-08-07: recompute `month` = fiscal calendar month (from date) for all rows.** Owner confirmed nothing compares against Scotia statements; the G.L. journal derives fiscalYear/Month from date anyway. Old values logged per-row in `migration_change_log`. | 🔒 LOCKED |
| D5 | Currency of the 2 NULL-currency owner_journal mirror rows (20057/20058, Director's Emoluments / therapy mirror). **RESOLVED 2026-08-07: USD.** | 🔒 LOCKED |
| D6 | Realm count. **RESOLVED 2026-08-07: 2 realms on the sync allowlist for now** (bakery `123145971566304`, MMG `9130350512376806`); may expand later (Geeves.Life QBO does not exist yet — possible future add-on). All other verticals stay `geeves_only` **but are kept to QBO-export standard** (clean mappings, export-ready) so a new realm can be added at any point without rework. PERS/FAM remain hard-excluded regardless. | 🔒 LOCKED |

---

## 1. Corrected Audit Baseline (swarm-verified)

v2's Part A numbers were confirmed ~90% exact. Corrections the swarm proved against the DB:

| Metric | v2 said | Corrected |
|---|---|---|
| `accounts` rows | 19 | 19 rows but 18 named + **1 ghost row with NULL id** ('owner_journal' shifted into `name`) — repair + NOT NULL constraint |
| `default_vertical`="Personal" | 15/18 | **16/18** (incl. boa_biz_checking, boa_biz_savings, stripe). Use existing `account_vertical_map` (17 rows, codes + confidence) as the re-derivation source — not attribution majority |
| pct units | 2,375 frac / 5,404 hundred | 2,375 frac / 5,404 hundred / **118 NULL (98 txns)** / 23 zero. Plus txn 18600 Σpct=200 (loan principal+interest on one Zelle) and 23 groups at 99.99 (float rounding) |
| In-use categories | 156 | **169** distinct in attribution_lines (194 union with transactions.category) |
| Duplicates | 251 groups / 285 extras | 251 groups but 2 already retired → **283 to retire**, in 4 classes (§3.1) |
| A.4 anchors | computed on raw data | **Inflated by duplicates**: 235 attribution lines sit on duplicate txns. Deduped pre-baseline: MB 312,505.33 · MM 248,432.67 · BL 142,515.17 · PERS 200,349.33 · FAM 36,938.48 · GL 2,508.22 · SO 1,333.37 · BLab 11.19 (subject to 65-conflict resolution) |
| edit_log lineage | "explains drift" | **87% of edit_log line_ids (3,047/3,506) no longer resolve** to current attribution lines — value-level evidence only, not row-level lineage |
| Drift composition | unexplained | **Largely mechanical**: MM/GL/SO/BLab drift equals the `interest_by_vertical` amounts *to the penny* (interest de-attribution into the rollup). Residuals needing explanation: MB −$318.77, BL −$1,066.68, FAM +$342.61 |

**New findings the swarm added:**
- **`MULTI` is an unregistered 11th vertical** — 7 transfer_pairs rows ($33,246.51) + stripe clearing in `account_vertical_map`.
- **TJPGG accounts use prefix `TJP-`, not `TJPGG-`** — any prefix→vertical derivation breaks without an `account_prefix` column.
- **286 transfer-paired txns also carry attribution lines**, including real income (`Sales:Easter Bun Sales` −$28,627.94, booking income −$1,387.65) and equity (Owner Investment 131 lines +$29,104.19) — no precedence rule existed (§3.4).
- **Interest is EXPENSE wired to INCOME accounts**: `interest_by_vertical` ($12,861.53) is card interest *charges*, but staging G.L. notes route it to money_in "Interest Earned" accounts (MB-420, MM-420, BL-420, TJP-410). The rollup also covers only ~42% of the $30,738.29 raw interest charges.
- **MB is an 83%-owned Jamaican limited company** (PERS-140 "Business Equity — Maxfield Bakery & Pastries Ltd 83%", GCT15 tax codes) — it is **not a Schedule C business**. Correct stack: Jamaican corporate return + GCT for the Ltd; **Form 5471 / CFC / GILTI** analysis for the US owner.
- **Child PII is baked into the taxonomy**: category strings "Autism & Child Therapy (Tahj)" / "Autism & Child Travel (Tahj)", 194 `beneficiary_tags` naming minors, 8 txn descriptions containing child names.
- **Aggregate = line leak**: 'Director's Emoluments (gross)' and 'Autism & Child Therapy (Tahj)' are each exactly 1 line at $17,399.36 — any category subtotal *is* an individual salary/therapy transaction.
- **No per-property dimension exists in staging data** — Schedule E per property cannot be produced from staging alone; OTA commissions (Airbnb/VRBO host fees) appear nowhere in BL expenses (payouts likely recorded net → gross rents and commission expense both understated).
- **`gl_accounts` has no tax-form-line column** — all Sch C/E line assignments live in the retired doc code system. Without adding `taxFormLine` during the code-map pass, invariant 3 dies in migration. BL chart lacks depreciation, mortgage-interest, and property-tax accounts (Sch E lines 12/16/18 unpopulatable).
- **Equity flows exist twice** (as transfer_pairs AND as equity-category attribution lines) with no reconciliation rule; `gl_category_map` types `Owner's Draw` and `Owner's Pay & Personal Expenses` as `Expense` (landmines); the $30,797.95 American General variable-annuity distribution is a **1099-R event**, not a pure rail.

---

## 2. Canonical Registry (Gate G1) — final design

One table is the single source of vertical truth (DDL in `migration_pack.sql` §1):

| staging_code | doc_code | display_name | account_prefix | bucket? | notes |
|---|---|---|---|---|---|
| MB | BKY | Maxfield Bakery | MB | — | Jamaican Ltd (83%) — see §5 tax amendments |
| MM | MKT | Maxfield Market | MM | — | |
| BL | BL | **Bohemian Lodges** (staging) / "Blue Lagoon" (docs) | BL | — | name collision — owner confirms display name |
| GL | GDL | Geeves.Life | GL | — | doc "Good Life" retired to GDL (no data) |
| SO | SO | StartOut | SO | — | |
| BLab | BLAB | Beta Lab | BLab | — | GL/BLab spend currently intended to post into **TJP** accounts (TJP-500 note) — design fork: create GL/BLab accounts vs keep TJP consolidation; needed before G3 |
| PERS | PERS | Personal | PERS | — | absorbs SELF (D1) |
| FAM | FAM | Family | FAM | — | staging-only |
| TJPGG | TJPGG | TJP Global Group | **TJP** | — | registered 2026-08-07 |
| SELF | SELF | Self / Tarik | — | merged→PERS | doc-side only (D1) |
| REV | REV | Needs Review | REV | **system** | queue — never posts to G.L. |
| MULTI | MULTI | Multi-Vertical Rail | MULTI | **system** | rails/clearing (stripe, 7 pairs) — never P&L |

SELF→PERS account-level fold (doc catalogs): SELF-2001/2002/2003/2004 → **PERS-2009 Education**; SELF-2005 Networking → **PERS-2011 Entertainment**; SELF-2006 Wellness & Mental Health → **PERS-2008 Medical & Health**; SELF-2008 Travel → **PERS-2018 Travel - Personal**; SELF-2007 Personal Branding has no clean home → **new PERS-2021 Professional Services - Personal**. QBO mappings follow the targets.

---

## 3. Cleanup Program v2.1 (replaces v2 Part B)

**Mandatory safeguards for every bulk step (security gate):** ① snapshot before each batch (ID recorded) · ② dry-run mode with row-count + sample-diff report, explicit `--apply` · ③ every change logged to `migration_change_log` (batch_id, table, row_id, field, old, new, script, actor, ts) in the same transaction · ④ scripts never log raw descriptions/card members/child names/amounts (IDs + hashes only) · ⑤ least-privilege DB user (migration role ≠ app runtime role) · ⑥ per-batch transaction with post-commit validation queries.

### 3.1 Dedupe (B.2) — 4-class rule (replaces "keep earliest, re-point")
| Class | Rows | Action |
|---|---|---|
| Both twins attributed, **identical** line-sets | 149 | **DELETE** retire-side lines (byte-identical dups), retire txn. Re-pointing would double-post. |
| Retire row attributed, keep has none | 4 | **MOVE** lines to keep_id |
| Both attributed, line-sets **differ** | 65 | 🔴 **Workbench owner-decision queue** (true vertical conflicts, e.g. PERS-transport vs BL-travel; zero edit_log recency signal). Retire only after owner picks surviving line-set. |
| Unattributed | rest | retire mechanically |
Re-point `transfer_pairs` (2 pairs), `refund_pairs`, `allocation_lines` (13) to keep ids; record all in `retired_txn_map`. **V18 anchor baseline is computed only after dedupe** (MySQL trap: PAD SPACE collation regroups dedupe — normalize keys with `TRIM(description)` first).

### 3.2 Normalization (B.2)
- **pct → 0–100:** per-txn-group unit detection (`SUM(pct) ≤ 1.000001` → fractional group, ×100); **118 NULL pcts derived from perfect amount footing**; txn 18600 recomputed from amounts (Σ=200 fix); 99.99 rounding groups absorbed into largest line. Post-validation: zero groups deviating >0.01, zero NULL/out-of-range. MySQL: `CHECK (pct BETWEEN 0 AND 100)`; per-txn Σ=100 enforced in the posting engine (CHECKs can't span rows).
- **date:** truncate 19-char timestamps (all end `00:00:00` — lossless); target column `DATE NOT NULL`.
- **month:** fiscal calendar month everywhere per D4 (119 Scotia statement-cycle rows recomputed with per-row old-value logging).
- **currency:** USD per D5.
- **`accounts` ghost row:** repair NULL-id row; NOT NULL + PK constraints.
- **Amounts:** staging REAL (float) → production **DECIMAL(15,2)** / integer cents so app-layer balance checks are exact.

### 3.3 H5 vehicle overlap — refined precedence
`allocation_lines` wins **only when** the attribution side is REV or PERS-default (the 162 REV + 35 PERS lines, flagged `superseded_by_allocation` **after** REV disposition — 132 overlap lines are `Vehicle (review)`). The **27 txns with non-REV business attribution contradicting the allocation split** (e.g. attr=MB 100% vs alloc=PERS 100%) go to the workbench. Posting-engine rule: `allocation_lines XOR attribution_lines` per txn, with a startup assertion the overlap set is empty. Anchor query must exclude superseded lines. **Vehicle tax layer added to Phase 5:** depreciation schedules per vehicle (none exist), §280F recapture on chevy_trax (business use fell 66.31%→25% in 2025 → ADS switch + excess-depreciation recapture), Form 4684 casualty split ($0 insurance payout; only business share deductible, personal share nondeductible post-TCJA), actual-vs-standard mileage method consistency (owner confirm).

### 3.4 Rail / attribution / refund precedence matrix (NEW — was the biggest P&L hole)
Posting engine applies, in order:
1. **Rail wins only when** the attribution category's disposition is `rail` (e.g. `Internal transfer (rail)` 38 lines) → post via transfer_pairs, suppress P&L arm.
2. **Income-category attribution on a paired txn = mis-paired deposit** → REVIEW workbench (absorb the existing 14 REVIEW pairs / $35,191.51). Real revenue must never be swallowed by a rail.
3. **Equity-category attribution on a paired txn** → post the equity leg only (DR/CR equity ↔ bank), not bank-to-bank; reconcile against the transfer_pairs representation so equity doesn't post twice (Owner Investment 211 lines net −$1,810.81 matches MM-300 note exactly — use that as the control).
4. **Refunds (222 pairs):** post both sides to the **same** category account (refund = contra-expense/contra-income), never rail. **4 pairs cross tax years** — cash-basis misstatement if both sides are simply excluded.
5. **H5:** allocation beats attribution per §3.3.
6. G2 counts all unresolved pair×attribution overlaps (286 txns) as open items.
Additional equity tax flags: $30,797.95 annuity distribution → 1099-R review before any rail sweep; 7 `MULTI` pairs need disposition after MULTI registration.

### 3.5 Interest correction (replaces v2 B.4.14)
Interest is **expense** (card interest charges: 148 positive txns, $30,738.29; interest income is $2.80 total). Retype the four routing targets from money_in "Interest Earned" to money_out interest-expense accounts before using `interest_by_vertical` as the answer key. Coverage gap: rollup = $12,861.53 of $30,738.29 raw (~42%) — owner must explain the uncovered cards (e.g. amex_biz raw $15,187.22 vs rollup $9,021.47) or the interest pass leaves P&L understated.

### 3.6 Mapping-bridge fill (B.3) — amended
- **Pre-step (security): scrub child-identifying category names** ("Autism & Child … (Tahj)" → neutral labels like "FAM — Medical/Therapy", "FAM — Medical Travel") **before** writing any `gl_category_map` rows; denylist lint on all QBO-visible strings. `beneficiary_tags` stays a sidecar — never in journal memos, QBO payloads, exports, or logs.
- **Merge master_coa before retiring:** it holds the only 2 valid bindings for H7 categories (Salary & Employment Income→PERS-400, Consultancy Income→MM-410) + the sole `is_suspense` marker; `qbo_account_map.master_account_id` FK-references it. Script: absorb valid bindings into `gl_category_map`, preserve `is_suspense`, rename to `master_coa_retired_20260807` (drop only after B.5 rebinds qbo_account_map on gl_code). *Then* invariant 6 (one bridge) holds.
- **Scope correction:** fill **169** in-use categories (not 156), plus disposition the **1,268 NULL-category lines / $485,795.89** (bigger than the 13 named gaps combined) — G3 cannot pass with NULLs.
- **13-category mapping table** (CPA-recommended, owner confirmations flagged) is in `migration_pack.sql` §4 comments; highlights: Salary & Employment Income→PERS-400 (1040 line 1; JMD withholding question); Consultancy Income→MM-410 (Sch C 1 + SE; confirm LLC classification); Director's Emoluments→PERS-400 mirror (Jamaica PAYE/NIS/NHT/EdTax/HEART compliance note); autism therapy/travel→FAM medical (Sch A §213 7.5% floor, medical-travel rules); Interest Expense→MB-65x (Jamaica corp deduction); Travel-Meals→dedicated meals account (**50% limitation** — must stay separable); equity trio→MM-300/MM-310/investment-asset rails (per-item contribution-vs-loan confirm); Internal transfer→rail only.
- **gl_accounts schema additions:** `taxFormLine`, `isTaxRelevant`, `taxJurisdiction` columns populated during the code-map pass (saves invariant 3); **add BL depreciation / mortgage-interest / property-tax accounts** (Sch E 12/16/18); add MB R&M + meals accounts; resolve GL/BLab-vs-TJP design fork (§2).
- Fix `gl_category_map` landmines: `Owner's Draw` / `Owner's Pay & Personal Expenses` retype from `Expense` to equity; `Personal`→gl_code `-` row repaired.

### 3.7 QBO binding (B.5) — security-hardened
- **Realm allowlist:** only the 2 documented realms are valid push targets until D6; delete/regenerate the 190×7 template keyed on gl_code so no PERS/FAM/BLab binding can exist.
- **Tokens:** OAuth refresh tokens in GCP Secret Manager/KMS envelope encryption — never in DB/env; per-realm least-privilege scopes.
- **Webhooks:** HMAC + timestamp/nonce replay protection (>5 min skew rejected, seen-nonce store); verifier-token rotation.
- **Idempotency:** `sync_state.sync_hash`/`doc_number` as dedupe keys, `UNIQUE(txn_id, realm)`; retried pushes never double-post.
- **Approval gate:** `qbo_sync_queue.approved_by` = authenticated household_admin; batch preview is PII-scrubbed; payload linter blocks child names/card numbers/member names. First push into a **sandbox realm** first.

---

## 4. Anchors & Acceptance Gates (amended)

**Anchor v2.1 definition — decomposed, not one number.** Per vertical, freeze at migration (post-dedupe): {P&L spend, income-side, equity, rail, REV} — because 63% of MM's naive positive anchor ($160,843.12 of $255,349.52) is Owner Draw/Investment/rail lines, not P&L spend; a P&L trial balance cannot foot to an un-decomposed anchor. **Add a PERS anchor** ($201,007.64 positive / −$325,780.22 negative — the largest vertical was outside the acceptance test). Decide whether card interest is in or out (V17.26 included it; v2's definition excluded it — pick one and document). Interest de-attribution explains most V17.26→V18 drift to the penny; residual drift ledger (MB −$318.77, BL −$1,066.68, FAM +$342.61) is explained by `edit_log` at **value level only** (87% of line_ids are stale).

| Gate | v2.1 criterion (amendments **bold**) | State |
|---|---|---|
| G1 Registry | vertical_code_map published **incl. MULTI + account_prefix (TJP-)**; GL collision resolved | 🔴→ buildable |
| G2 Coverage | every active txn attributed/paired/railed/allocation-posted; queue=0; **pair×attribution overlaps=0; Σpct=100 ∀ posted txns; no NULL pct** | 🔴 |
| G3 Mapping | 100% of **169** in-use categories + NULL-category set dispositioned → valid gl_code; **gl_accounts carry taxFormLine; BL chart complete for Sch E; GL/BLab fork resolved** | 🔴 |
| G4 Balance | trial balance foots to **decomposed** V18 anchors per vertical **incl. PERS** within $1.00; **edit_log hash-chain verification passes; anchor queries return only access-permitted scope per role** | 🟡 |
| G5 Sync | sync tables populated by real runs; queue drains; **≥1 locked period precedes first QBO push; webhook replay test + token-storage audit pass; PII payload linter active** | 🔴 |
| G6 UI parity | **9 capabilities** (v2 listed 6 — adds vehicle-allocation editor, beneficiary-tag family view, QBO sync status board); **drift-ledger UI with zero unexplained deltas; role-gating demoed under blind + read_only test accounts**; per `uiux_review_g6_report.md` | 🟡 |

Deprecation sequence unchanged: G1→G3 → backfill → G4 → QBO runs → G5 → G6 → 30-day read-only with in-app comparison mode → archive (frozen DB + this plan + all review reports) → remove.

---

## 5. Roadmap & Tax Amendments

| Phase | v2.1 amendment |
|---|---|
| 1 | Add: `vertical_code_map`, `is_system_bucket`, `account_prefix`, `migration_change_log`, `retired_txn_map`, `anchor_cache`, **edit_log hash-chain + append-only enforcement**, gl_accounts `taxFormLine/isTaxRelevant/taxJurisdiction`, indexes per perf review |
| 2 | 2A hygiene (safeguarded §3.1–3.2) → 2B precedence + rails (§3.4–3.5) → 2C mapping fill (§3.6) → 2D backfill per perf spec (500–1,000 entries/commit, `UNIQUE(source_table,source_id)` idempotency, checkpoint-resume, preloaded maps, in-memory integer-cent balance checks, quarantine-don't-abort) |
| 3 | Unified queue = REV 2,037 + 712 overlap `(review)` txns + 209 unattributed `(review)` + ~1,016 rail-sweep candidates + **65 dedupe conflicts + 27 H5 conflicts + 286 pair×attribution overlaps + mis-paired deposits** — one workbench, one burndown |
| 4 | Preconditions: §3.7 security controls; 2-realm allowlist per D6; sandbox realm first |
| 5 | **MB = Jamaican Ltd: corporate return + GCT; Form 5471/CFC/GILTI for the 83% US owner** (f5471 already in tax_documents types). Add vehicle depreciation/§280F/4684 layer (§3.3). Jamaica payroll withholding (PAYE/NIS/NHT/EdTax/HEART) on director's emoluments — payroll-provider confirm. Sch E per-property requires a property-assignment pass + OTA-commission gross-up (net-recorded payouts). Annuity 1099-R review |

**Performance non-negotiables (from perf review, measured):** covering indexes on `attribution_lines(vertical,amount)`, `(txn_id)`, `transactions(account_id,date,id)`, expression column `abs_amount` for rail-sweep (348× speedup; naive ±1-day self-join is quadratic — 10.1s at 1×, ~17min at 10×); round-dollar buckets ($50/$100/$10) route to REVIEW pairs not auto-confirm; `anchor_cache` memo table watermark = `MAX(edit_log.id)` (never `edited_at` — format-mixed); keyset pagination everywhere; MySQL 8 `utf8mb4_0900_ai_ci`, DECIMAL(15,2), `ANALYZE TABLE` after bulk load; TiDB→Cloud SQL: pre-cutover FK-orphan check (TiDB never enforced FKs), consistent-snapshot export, `time_zone='+00:00'`, `sql_mode` audit.

**Security non-negotiables:** per-level view rules — **blind**: zero financial rows AND zero aggregates; **read_only**: vertical totals/trends only, category breakdowns suppressed where line count <3 (k-anonymity), no memos; **full**: line detail in granted verticals; salary/child-medical attributes additionally require household_admin / `sensitive_finance` grant. edit_log → append-only (DB privileges + INSTEAD OF triggers), SHA-256 hash chain with periodic notarized anchors, actor = human ID + agent/run ID, dual-control reverts. period_locks: household_admin lock, dual-control unlock with mandatory reason; unlocking a synced period enqueues QBO re-reconciliation.

---

## 6. Invariants v2.1

1–5 from v1.0 stand. Plus:
6. **One bridge** — `gl_category_map` only (master_coa merged & archived).
7. **One vocabulary** — vertical codes are keys; `account_prefix` carried explicitly (TJP-); prose names are labels.
8. **Anchors are computed, not stored** — decomposed anchors via documented query; `anchor_cache` is a self-busting memo, never the system of record; query excludes superseded lines.
9. **Rails never swallow revenue** — precedence matrix §3.4; income on a paired txn is a review item, not a rail.
10. **Sensitive data is scrubbed before it is mapped** — no child-identifying or member-identifying strings in G.L. mappings, journal memos, QBO payloads, exports, or logs.

---

*Plan v2.1 integrates all five specialist verdicts: every FAIL/CONCERN is either resolved in the text above or converted to an explicit owner decision (D4–D6). Audit numbers in §1 were verified independently by at least two reviewers each.*
