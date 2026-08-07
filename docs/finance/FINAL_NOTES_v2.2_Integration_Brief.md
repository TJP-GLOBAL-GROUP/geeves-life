# Final Notes — Manus Review of the Correct v2.1 → v2.2 Integration Brief
**Date:** 2026-08-07 · **Source reviewed:** `docs/FINANCE_PLAN_REVIEW_V2.1.md` (repo, SHA e50f2ce4) — Manus's pre-implementation review of the CORRECT v2.1, verified against live repo code (schema.ts, rbac.ts, accessControl.ts, db.ts, AI_MEMORY.md, DATABASE_SCHEMA_LIVE.md)
**Status:** Integrated into Plan v2.2 (`docs/Geeves_Unified_Finance_Implementation_Plan_v2.2.md`). Owner decisions D7–D10 recorded 2026-08-07.

---

## 1. Verdict on the review

Manus's review of the correct v2.1 is **high quality and code-verified — accepted as the primary v2.2 input.** Its core verdict is fair: v2.1's accounting is sound, but it was not implementable as written because (a) the migration pack is SQLite staging-only and provisions zero production schema, and (b) the plan's data model diverged from the already-built production schema (two households, `chart_of_accounts` vs `gl_accounts`, UUID vertical identity, existing expense/OTA/property/receipt infrastructure).

Manus explicitly endorses — and v2.2 carries through unchanged — the §3.4 precedence matrix ("rails never swallow revenue" = "the single most valuable sentence in the document"), the 4-class dedupe, the interest retype, the decomposed anchors, and the sensitivity scrubbing. Our corrected anchor baselines were adopted into his Phase B checklist (B5/B6), replacing his earlier V17.26 figures.

## 2. Conflicts adjudicated

| Conflict | Resolution |
|---|---|
| Anchors: Manus V17.26 raw vs V18 deduped/decomposed | **Deduped/decomposed win.** Manus adopted MB 312,505.33 · MM 248,432.67 · BL 142,515.17 · PERS 200,349.33 · FAM 36,938.48 · GL 2,508.22 · SO 1,333.37 · BLab 11.19, decomposed, with the 65-conflict caveat (his B5/B6) |
| beneficiary_tag on journal_lines vs sidecar-only | **Sidecar wins** — his v2.1 review never proposes on-column tags; E7/B13 reinforce sidecar + query-time k-anonymity, citing the $17,399.36 single-line-leak evidence |
| Queue counts: 1,284 vs ~4,350 | **~4,350 adopted** (his HIGH-1) |
| 27 vs 17 H5 conflicts; 214 vs 286 overlaps | Resolved in v2.2 §1 canonical queue-population table (17 H5 staging-measured; 286 pair×attribution and 214 allocation∩attribution are overlapping but distinct sets) |
| TiDB vs Cloud SQL | Dead — Resolved per his traceability table |

## 3. The six v2.2 deltas (all decided)

1. **Production Drizzle migration** + staging→production transfer step; staging pack relabelled (v2.2 §2.6, §3).
2. **CoA convergence** — D8: `chart_of_accounts` canonical; staging `gl_accounts` = import source; line-overrides-account tax-form precedence; `glAccountId` gets a real FK.
3. **Vertical identity bridge** — `verticals.code` unique + registry `vertical_id`; seed TJPGG/BLab/GL/REV/MULTI with `isSystemBucket`; fix `tax_documents.verticalId` default `"pers"`; CRITICAL-1b fix (`sync_allowlisted`, GL qbo_entity → pending).
4. **Household scope** — D7: single ledger in TJ Perkins Global (tarik@tjperkinsfam.com); MB/MM migrate in; `householdId` stays the scope key.
5. **Access model** — D9: Manus Part 3 adopted wholesale (capabilities, resolver, corrected matrix incl. EA fix, routing, redaction, workbench fields).
6. **Square = explicit non-goal** (v2.2 §8).

## 4. Owner decisions D7–D10 (recorded 2026-08-07)

- **D7:** Single household layer belonging to tarik@tjperkinsfam.com (TJ Perkins Global).
- **D8:** `chart_of_accounts` canonical.
- **D9:** Part 3.4 access matrix approved.
- **D10:** G2 materiality floor $50, suspense residual, named owner Tarik, 90-day review.

## 5. Remaining work

1. **Brand-consistent UI/UX layer** on top of Manus Part 3 (vertical→color mapping from the 6-color palette, Outfit typography, dark-mode gradient rule) — `uiux_brand_review_v2.md` still owed.
2. **Drizzle production migration authoring** — the swarm implementation task (Phase A).
3. **Staging-side fixes:** `sync_allowlisted` seed amendment to `migration_pack.sql` §1 (CRITICAL-1b).
4. **Knowledge updates via the correct channel:** `project_knowledge` rows (`docs/finance/project_knowledge_inserts_20260807.sql`) — never hand-edit `docs/AI_MEMORY.md`.

*Bottom line: v2.2 = v2.1 accounting + production Drizzle migration + D7 household consolidation + D8 CoA + vertical-identity bridge + D9 Part 3 access model + Square non-goal + D10 G2 threshold. Phase 0 sign-offs recorded; ready for the implementation swarm.*
