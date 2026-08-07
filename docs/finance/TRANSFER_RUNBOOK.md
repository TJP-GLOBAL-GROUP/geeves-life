# Staging → Production Transfer Runbook (Plan v2.2 §2.6)

**Artifacts:** `docs/finance/migration_pack.sql` (staging cleanup, validated) · `docs/finance/staging_to_production_transfer.sql` (this transfer, T0–T7)
**Status:** scripts only — no production writes authorised in this stage.
**Owner decisions applied:** D6 (2-realm allowlist by data), D7 (single household TJ Perkins Global `V8lk3KJatvxBTWURf4uo9`), D8 (`chart_of_accounts` canonical), D10 (G2 materiality $50).
**Schema ground truth:** `drizzle/0053_finance_v22_phase_a.sql` + `drizzle/schema.ts` on `finance/v2.2-phase-a`, plus patch migration **0054** (`journal_lines.householdId` indexed varchar; `UNIQUE(householdId, accountNumber)` on `chart_of_accounts`). The transfer script was verified against these in 2026 (verifier fix pass, 10 blocking defects resolved — see "Schema-conformance notes" below).

---

## Preconditions (all must be green before step 1)

- [ ] Phase 0 gates counter-signed (checklist below, gates 0.1–0.9)
- [ ] Phase A production Drizzle migration applied and verified (T0.1) — **including patch 0054** (`journal_lines.householdId`, CoA unique key)
- [ ] `migration_pack.sql` run on a **disposable copy** of staging; all POST validations match EXPECT comments — **never run anything against the original staging DB (copy-only)**
- [ ] 65 dedupe conflicts + 17 H5 conflicts disposition plan agreed (anchors carry documented deviations while open)
- [ ] QBO sync disabled for the duration; least-privilege migration role created
- [ ] Production PITR/backup verified restorable

## Ordered steps

1. **Snapshot.** Production PITR checkpoint; record checkpoint id. Staging: `cp` the cleaned copy — export from the copy only.
2. **Load scratch schema `stg`** from the cleaned staging copy (CSV/dump load). **Exclude `beneficiary_tags`** from the export set entirely (sidecar, invariant 10). Required tables are enumerated in T0.4 (includes `dedupe_conflict_queue`, `h5_conflict_queue`, `transfer_pairs`, `allocation_lines`, `gl_category_map`).
3. **Set session constants** (`@global_household`, `@legacy_household`, `@transfer_actor`, `@snapshot_id`).
4. **Dry-run T0–T6** (default `ROLLBACK` blocks). Capture every PRE/POST SELECT; compare to EXPECT values. Fix and re-run until clean. Dry-run output doubles as the row-count report. T5's PRE guard count must equal POST T5e (`vertical_assignment` workbench routes) — a mismatch means unmatched-vertical txns were neither posted nor queued.
5. **Apply T0** (log table) — commit.
6. **Apply T1–T6 one batch at a time**, in order: fresh snapshot per batch → uncomment COMMIT for that batch only → run → verify POST checks → next batch. Abort on first mismatch.
7. **Run T7 verification suite** post-apply: 8 anchors within $1.00 of canon, queue segments reconcile to ≈4,350, Σpct=100 (checked on the staging mirror — `pct` is not a `journal_lines` column), D6 gate (2 allowlisted), zero legacy-household financial rows.
8. **Hash-chain / edit_log verification** (v2.1 §5) on transferred lineage.
9. **Sign-off** (below), then proceed to Phase B remaining items (rail/pair transfer, QBO sandbox per Phase D).

## Schema-conformance notes (verifier fix pass)

Decisions locked while aligning the transfer script to the real Phase A schema:

- **Registry cosmetics convergence (canonical = Phase A 0053 seed, because it is production):** FAM `display_name` = **`Home & Family`**; BLab `account_prefix` = **`BLAB`**; `qbo_entity` canonical string forms = `geeves_only` (BL/SO/BLab/TJPGG), `pending` (GL), full realm strings (MB/MM), **NULL** for PERS/FAM/SELF/REV/MULTI. Staging-side spellings (`n/a`, etc.) are normalised during T1; T0.6 therefore gates allowlist semantics only, and POST T1d verifies convergence (EXPECT 0 drift).
- **Journal ids** are varchar(21) nanoid columns; the transfer generates `CONCAT('t', LEFT(REPLACE(UUID(),'-',''),20))`. `chart_of_accounts.id` (varchar 32) uses `REPLACE(UUID(),'-','')`.
- **`journal_entries.entryType`** is NOT NULL with no default; staging transfers post as `'journal'` (single-sided attribution postings must not be mislabelled `revenue`/`expense`).
- **Provenance key:** `journal_entries.sourceTable = 'staging_transfer'`, `sourceId = CONCAT('stg-txn-', t.id)` — this is the T5 lines/T7 join key (no `externalRef` column exists).
- **`pct` is not a `journal_lines` column.** Lines that cannot map to a chart account are routed to `workbench_queue` with their `pct` preserved in the `payload` JSON; the Σpct = 100 invariant (T7.3) is verified against the staging mirror.
- **NULL-into-NOT-NULL guards:** T5 entry and line inserts use INNER JOINs to the resolved vertical / category bridge so `journal_entries.verticalId` and `journal_lines.glAccountId` can never receive NULL; unmatched rows go to `workbench_queue` (`vertical_assignment` / `uncategorised`) instead of aborting the batch.
- **Household ownership:** `vertical_owners` has no `householdId` column — ownership and access rows follow `verticalId`, so T2 moves only the `verticals` row.
- **Account type enum:** staging `money_in` → `'income'` (there is no `'revenue'` value); equity codes (`x-300`/`x-310`) → `'equity'`.
- **Staging change-log values** cross into production `migration_change_log` as SHA-256 hashes only (`old_value_hash`/`new_value_hash`), per safeguard 4; `snapshot_id` is stamped with the transfer-batch checkpoint (staging rows predate production snapshots), and dedupe lineage lands in `retired_txn_map` under batch `stg-dedupe`.

## Rollback

- **Pre-commit (any batch):** automatic — the batch `ROLLBACK` leaves no trace except dry-run output.
- **Post-commit, single batch:** restore PITR to that batch's snapshot id; `transfer_log` identifies exactly which batches committed (IDs + hashes only, no PII).
- **Full abort:** PITR to step-1 checkpoint; drop scratch schema `stg`; legacy household untouched because T2 is the only household mutation and is reversible via its logged rows.
- **Never** hand-patch production rows to "fix" a failed batch — rollback, fix the script, re-run from snapshot.

## Sign-off checklist (Phase 0 gates 0.1–0.9 counter-signed)

| Gate | Item | Sign-off |
|---|---|---|
| 0.1 | Production migration artifact exists (Phase A Drizzle + patch 0054) | ☐ owner / ☐ verifier |
| 0.2 | Staging pack relabelled + this transfer step documented | ☐ / ☐ |
| 0.3 | G6 role matrix corrected (§4.3 EA fix) | ☐ / ☐ |
| 0.3b | Registry §2.4 fix applied — `sync_allowlisted` data flag (commit on `finance/v2.2-staging`) | ☐ / ☐ |
| 0.4 | CoA decision D8 — `chart_of_accounts` canonical | ✔ locked |
| 0.5 | Household decision D7 — Global `V8lk3KJatvxBTWURf4uo9` | ✔ locked |
| 0.6 | Vertical identity §2.3 (codes ↔ UUIDs bridge) | ✔ locked |
| 0.7 | Access model D9 adopted | ✔ locked |
| 0.8 | Square non-goal §8 | ✔ locked |
| 0.9 | G2 threshold D10 ($50 materiality, suspense residual, 90-day review) | ✔ locked |

**Transfer acceptance:** T7 anchors within $1.00 · queue ≈ 4,350 reconciled · D6 gate green · legacy household financially empty · hash chain verifies.

Owner: ____________ (Tarik) &nbsp; Verifier: ____________ (Manus) &nbsp; Date: ______
