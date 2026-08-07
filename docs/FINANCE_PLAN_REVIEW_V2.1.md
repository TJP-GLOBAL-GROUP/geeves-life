# Geeves Unified Finance Implementation Plan v2.1 — Pre-Implementation Review

**Document under review:** `docs/Geeves_Unified_Finance_Implementation_Plan_v2.1.md` (dated 2026-08-07, self-described as "Swarm-Reviewed · Owner Decisions Locked · Implementation-Ready")
**Review date:** August 7, 2026
**Reviewer:** Manus AI (Product & Data Architecture Review)
**Audience:** Supah-T (Product Owner), Team Kimi (Implementation Lead)
**Supersedes:** `docs/FINANCE_PLAN_REVIEW.md` — that document reviewed the *July 29 Draft 1*, not v2.1. Its findings are re-tested here and each is marked Resolved, Partially Resolved, or Carried Forward.
**Verification basis:** Every claim below was checked against the live repository — `drizzle/schema.ts` (79 tables), `server/routers/rbac.ts`, `server/routers/accessControl.ts`, `server/db.ts`, `docs/AI_MEMORY.md`, and `docs/DATABASE_SCHEMA_LIVE.md`. Where the plan and the code disagree, the code is treated as the authority.

> **Mid-review update.** The three companion artifacts were committed while this review was being written — `migration_pack.sql` (72e98f9), `VERTICAL_GL_CATALOGS_v2.md` (df4cb11), and `uiux_review_g6_report.md` (cb6223b), followed by a header fix (f12722d). Every affected finding was re-tested against them before publication and the findings below reflect their actual contents. The headline consequence is that CRITICAL-1 changes character rather than closing: the artifacts exist, but `migration_pack.sql` targets the **SQLite staging database**, not production Cloud SQL, so no production table is provisioned by any committed artifact. The G6 report is substantive and is credited in detail in Part 3, but its role matrix places the Executive Assistant in the read-only tier, which is the specific defect behind the owner's objection.

---

## Executive Summary

Version 2.1 is a substantial improvement over Draft 1 and, on the accounting merits, is close to correct. The precedence matrix in §3.4 closes what was genuinely the largest hole in the previous draft — the absence of any rule governing what happens when a transaction is simultaneously a transfer and an attributed expense — and the recognition that **rails must never swallow revenue** is the single most valuable sentence in the document. The four-class dedupe rule replaces a naive "keep earliest" heuristic that would have double-posted 149 transaction pairs. The interest correction in §3.5 catches a genuine sign-and-type error that would have understated profit-and-loss. The decomposed anchor definition in §4 is the right response to the discovery that 63% of Maxfield Market's naive anchor is owner draws and rails rather than trading activity. These are the findings of reviewers who actually queried the database rather than reading the schema, and the plan deserves credit for that rigour.

The problem is not the accounting. The problem is that **v2.1 is not an implementable document in its current form**, for two structural reasons that no amount of accounting rigour compensates for.

First, the executable detail the plan defers to its companion artifacts does not reach production. The three companions now exist, having been committed during this review, and `migration_pack.sql` is a genuinely careful piece of work — idempotent, snapshot-guarded, change-logged, and explicit about which statements a migration runner must treat as benign skips. But its own header states its target: *"SQLite staging copy of `geeves_life_v2.db`."* It is written in SQLite dialect throughout, using `INSERT OR IGNORE`, `TEXT PRIMARY KEY`, `BEGIN IMMEDIATE`, and `TEXT`/`INTEGER` affinity rather than `VARCHAR` and `DECIMAL`. It is a **staging-cleanup pack, not a production migration**, and it provisions **no production table whatsoever**. Production is Cloud SQL MySQL 8.0. So the Phase 1 deliverables the plan requires in production — the workbench queue, the anchor cache, period locks, the production registry — remain unprovisioned by any committed artifact, and Team Kimi still cannot write a production `CREATE TABLE` from what exists.

Second, the plan describes a data model that does not reconcile with the one already built, and the migration pack deepens rather than closes the divergence. The pack runs `ALTER TABLE gl_accounts ADD COLUMN tax_form_line` and similar statements against a `gl_accounts` table that exists **only in the SQLite staging database**; production MySQL has `chart_of_accounts` and `coa_mappings`, which the pack never mentions, while `journal_lines.glAccountId` points at nothing. There are now two charts of accounts in two engines with no mapping between them. Vertical identity has the same shape of problem: the pack's `vertical_code_map` is well designed and seeds all twelve registry rows correctly, but it is keyed on a `TEXT` staging code, whereas the live `journal_entries.verticalId` is a `varchar(36)` UUID foreign key — and **no column anywhere maps one to the other**, while five of the eleven registry verticals have no row in the production `verticals` table at all. Most seriously, the pack contains **zero references to households**, confirming that the plan is unaware the production system contains two separate households whose verticals are split across them: Maxfield Bakery and Maxfield Market in one, Bohemian Lodges and all five properties in the other. The anchors the plan asks the team to foot against span both.

On access control, the owner's instinct that the user-experience work "didn't go deep enough" is correct, and the newly committed G6 report proves it from the artifact rather than from intuition. That report is strong on the mechanics of clearing a large queue — bulk-accept by rule with dry-run and collision warnings, a burndown chart doubling as the deprecation countdown, agent-versus-human attribution as bot chips so a specific agent's batch can be re-audited, no silent system edits, batch undo that preserves append-only lineage, and a comparison mode governed by the excellent rule that the application must never show an unexplained delta. Its accessibility work is better than most shipped products. It also independently identifies the same access gap this review found, stating in its own words that financial surfaces "must enforce it **per vertical, not globally** (plan gap)."

But its role matrix contains one line that undoes much of that: the column heading reads *"read_only (e.g., caregiver, EA)."* The Executive Assistant is bucketed with the caregiver in the read-only tier, and the matrix then specifies that the read-only tier gets the workbench in "read-only mode: browse queue, open lineage; all mutating controls disabled." **The G6 design therefore renders the EA structurally incapable of clearing a single one of the roughly 4,200 queue items**, leaving the entire burndown to the owner — who is the only person holding `full`. The report contains no concept of a vertical co-admin, no routing design, and no mention of `vertical_data_policies`, `member_permission_overrides`, or any resolver.

The code confirms the problem is not merely a documentation choice. The permission system contains exactly **two** financial permissions, `finance.view` and `finance.manage`, both global rather than vertical-scoped, and **the EA role is granted neither**. The experience the owner is asking about — a vertical co-admin or an assistant working inside one vertical's books — is not merely unspecified. As the code and the G6 matrix stand, it is impossible by construction.

Accordingly this review identifies **six CRITICAL** and **nine HIGH** severity items. Five of the six CRITICALs are new to v2.1 or newly discovered in the code; they are not restatements of the earlier review. Part 3 supplies the deepened role-and-experience design that the owner requested, and Part 5 supplies a post-implementation accountability checklist with executable verification for every line.

> **Recommended disposition:** v2.1 should not be handed to Team Kimi as "implementation-ready." It should be re-issued as **v2.2** after a pre-sprint design session that resolves CRITICAL-1 through CRITICAL-6, adds a production MySQL migration alongside the SQLite staging pack, and adopts the access model in Part 3. The accounting content of v2.1 and the tooling design in the G6 report both survive that revision essentially intact; what changes is that the plan becomes executable and the people who need to use it are permitted to.

---

## Scope Boundary: Square Is Explicitly Out of Scope

Before the findings, one scope decision is recorded here so that no reviewer, agent, or implementer re-opens it. **Square is not part of the Geeves.Life financial engine and no Square plumbing is to be built.** This is an owner decision taken on August 7, 2026, not an oversight in the plan and not a gap for Team Kimi to close.

The reason for stating it explicitly rather than silently is that the surrounding design invites speculative construction. The plan's rail and clearing architecture is deliberately generic, the merchant-processor pattern is already implemented once for Stripe, and a well-meaning implementer encountering "merchant clearing rail" in the precedence matrix could reasonably infer that every plausible processor deserves a connector. That inference must not be drawn. There is no Square account in scope, no Square settlement file to parse, and no Square row expected in any rail table.

If Square ever does come into scope, the work is not novel and should not be re-designed from first principles. It reuses the Stripe merchant-clearing pattern exactly: gross charges post to the relevant income account, refunds post as contra-revenue to that same account rather than as expense, processor fees post to a fee expense account, and the periodic net payout posts as a non-profit-and-loss asset transfer between the clearing account and the bank. That pattern is already articulated in §3.4 of the plan for Stripe and in the Geeves financial architecture document; a future Square integration is a configuration of it, not an extension of the design.

| Item | Status | Note |
|---|---|---|
| Square as a payment rail | **Out of scope — explicit non-goal** | No connector, no settlement parsing, no rail enum value |
| Square in `transfer_pairs` / rail vocabulary | **Not to be added** | Do not pre-seed a `square` value "for later" |
| Square in the chart of accounts | **Not to be seeded** | No clearing account, no fee account |
| Future re-entry path | Reuse Stripe merchant-clearing pattern | Gross income, contra-revenue refunds, fee expense, net payout as asset transfer |

---

## Part 1: CRITICAL Findings

### CRITICAL-1 — The migration pack targets SQLite staging and provisions no production schema

**Severity:** Critical · **Category:** Executability · **Status:** New in v2.1, re-scoped after the artifacts landed

When this review began, the three companion artifacts the plan depends on were absent from the repository. They were committed mid-review, which closes the availability question but exposes a more consequential one.

`migration_pack.sql` is 52 kilobytes of careful, well-disciplined SQL. Its idempotency contract is explicit, it enumerates exactly which statements a runner must treat as benign skips and why, it creates a compatibility view so that a table rename does not break the rest of the file, and it restates the six mandatory safeguards — snapshot, dry-run, same-transaction logging, no raw personally identifying information in logs, least-privilege role, per-batch transaction with post-commit validation — at the top of every section. This is the work of someone who has been burned by a migration before, and it should be preserved.

Its header, however, states the target plainly: **"Target: SQLite staging copy of `geeves_life_v2.db` (NEVER run against the original; always cp to a throwaway file first)."** The dialect confirms it throughout — `INSERT OR IGNORE`, `TEXT PRIMARY KEY`, `BEGIN IMMEDIATE`, `AUTOINCREMENT`, and column types declared as `TEXT` and `INTEGER` rather than `VARCHAR` and `DECIMAL`. The seven tables it creates are `migration_change_log`, `retired_txn_map`, `vertical_code_map`, `_dedupe_work`, `dedupe_conflict_queue`, `h5_conflict_queue`, and `anchor_cache`, all in SQLite.

Production is Cloud SQL MySQL 8.0. The pack is therefore a **staging-cleanup pack, not a production migration**, and this distinction is nowhere acknowledged in v2.1, whose Phase 1 lists these same tables as production deliverables. The practical consequences are that no production `workbench_queue` exists — the two conflict queues the pack creates are SQLite-side and are not the unified workbench Phase 3 requires; no production `period_locks` exists, though Gate G5 requires a locked period before the first QuickBooks push; the production `anchor_cache` on which the plan's memoisation strategy depends does not exist; and the DECIMAL-versus-float requirement in §3.2 cannot be satisfied by a pack whose target engine has no true decimal type.

There is a second and quieter problem. The pack contains **zero references to households**, because the SQLite staging database has no household dimension at all. Every production financial table is household-scoped and every access-control table is keyed by `householdId`. A cleanup performed in a household-free schema cannot produce data that lands correctly in a household-scoped one without an explicit assignment step, and no such step exists.

**Required resolution.** Split the migration explicitly into two documents with two names, so that nobody mistakes one for the other. `migration_pack.sql` stays as it is and is relabelled unambiguously as **staging cleanup**, run against a disposable copy, producing a clean staging database. A second artifact — call it `production_migration.sql` or a Drizzle migration set, which is the more idiomatic choice given the project already uses Drizzle — provisions the production MySQL schema with correct types, creates the tables Phase 1 actually requires, and defines the **transfer step** that moves cleaned staging data into production with household assignment, vertical UUID resolution, and account mapping. Until that second artifact exists, Phase 1 has no deliverable and Gate G1 cannot be assessed.

---

### CRITICAL-1b — `VERTICAL_GL_CATALOGS_v2.md` and the registry are internally inconsistent with locked decision D6

**Severity:** High, recorded here for adjacency · **Category:** Internal consistency

The `vertical_code_map` seed is otherwise excellent — twelve rows matching §2 exactly, with `account_prefix` correctly carrying `TJP` for TJP Global Group per invariant 7, `is_system_bucket` set for the review and rail buckets, and `SELF` correctly recorded as `status='merged'` with `merged_into='PERS'` per decision D1. One row contradicts a locked decision: the Geeves.Life row carries `qbo_entity = 'Geeves.Life QBO (new)'` with `status='active'`, while decision D6 states that "Geeves.Life QBO does not exist yet" and restricts the sync allowlist to two realms. A future implementer reading the registry will conclude a third realm is expected.

**Required resolution.** Set the Geeves.Life `qbo_entity` to null or to an explicit `pending` marker, and add a `sync_allowlisted` boolean to the registry so that D6's two-realm restriction is enforced by data rather than by prose. This is a small change that prevents a class of error the plan is otherwise careful about.

---

### CRITICAL-2 — There are two charts of accounts in two database engines, with no mapping between them

**Severity:** Critical · **Category:** Schema divergence · **Status:** New in v2.1, worsened by the migration pack

Section 3.6 instructs the team to make "`gl_accounts` schema additions: `taxFormLine`, `isTaxRelevant`, `taxJurisdiction`," to add depreciation, mortgage-interest, and property-tax accounts to the Bohemian Lodges chart, and to resolve a design fork about whether Geeves.Life and Beta Lab spend posts to its own accounts or consolidates into TJP accounts. Invariant 3 and Gate G3 both depend on `gl_accounts` carrying a tax-form line.

The migration pack duly implements this. Section 10 runs `ALTER TABLE gl_accounts ADD COLUMN tax_form_line TEXT`, `is_tax_relevant INTEGER`, and `tax_jurisdiction TEXT`, then performs the interest retype with an `UPDATE gl_accounts` against the four money-in routing targets. So `gl_accounts` does exist — **in SQLite staging**.

It does not exist in production. Production MySQL implements the chart of accounts as **`chart_of_accounts`**, carrying `qboSyncStatus`, `parentAccountId`, and `isSystemAccount`, with a companion **`coa_mappings`** table that binds chart rows to QuickBooks account identifiers and is referenced by `qbo_account_map.master_account_id`. The string `chart_of_accounts` appears **zero times** in the migration pack. Meanwhile `journal_lines.glAccountId` is a `varchar(21)` in production that references no existing table — a dangling foreign key in a table already committed to the schema.

The result is two charts of accounts, in two engines, with different names, different type systems, and no mapping between them. The tax-form columns the plan considers essential are being added to the staging chart while the production chart, which is what the application and the QuickBooks integration actually read, does not receive them.

There is a further wrinkle that cuts both ways. The two columns the plan asks to add to `gl_accounts` — `taxFormLine` and `isTaxRelevant` — **already exist on `journal_lines`**, complete with a `jl_tax_form_idx` index. So the tax-form dimension is half-built, but on the transaction line rather than on the account. That is a defensible design (a line can carry a different tax treatment than its account's default) but it is not the design the plan describes, and Gate G3's verification query would fail against the current schema while the capability it tests actually exists elsewhere.

**Required resolution.** Make an explicit, recorded decision on the production name: either rename `chart_of_accounts` to `gl_accounts` and repoint `coa_mappings` and `journal_lines.glAccountId`, or keep `chart_of_accounts` as canonical and rewrite every `gl_accounts` reference in the plan and the production migration. The former is cleaner conceptually; the latter is far cheaper, since `chart_of_accounts` already carries the QuickBooks binding columns the plan would otherwise have to rebuild. Whichever is chosen, three things must follow. `journal_lines.glAccountId` must be given a real foreign-key target before any migration writes a row. The production migration must carry the tax-form columns across, since the staging `ALTER` statements do not reach production. And the plan must state whether the tax-form dimension lives on the account, on the line, or on both, with a documented precedence if both — because it currently lives on the line in production and on the account in staging, which is the worst of the three options.

---

### CRITICAL-3 — Vertical identity is codes in the plan and UUIDs in the database, and five verticals have no live row

**Severity:** Critical · **Category:** Data model · **Status:** New in v2.1

Section 2 establishes a canonical registry of eleven verticals keyed by short string codes: `MB`, `MM`, `BL`, `GL`, `SO`, `BLab`, `PERS`, `FAM`, `TJPGG`, plus the system buckets `REV` and `MULTI`. Decision D2 makes those codes "canonical" and the invariants declare that "vertical codes are keys."

The migration pack implements this faithfully and, on its own terms, well. `vertical_code_map` carries `staging_code` as the primary key alongside `doc_code`, `display_name`, `doc_display_name`, `account_prefix`, `is_system_bucket`, `qbo_entity`, a `status` column constrained to `active`, `retired`, or `merged`, a self-referencing `merged_into`, and explanatory notes. All twelve registry rows are seeded correctly, including the `TJP` prefix that invariant 7 demands and the system-bucket flags on the review and rail buckets. This is a better registry than the plan text describes.

The production schema disagrees with it structurally. The `verticals` table uses a `varchar(36)` UUID primary key, and `journal_entries.verticalId` is a `varchar(36)` foreign key to it, whereas `vertical_code_map.staging_code` is `TEXT`. **No column in any artifact maps a staging code to a production vertical UUID.** The verticals that actually exist in the primary household are Home & Family, Maxfield Bakery, Maxfield Market, Personal, StartOut, and Bohemian Lodges — the last with identifier `c3pW-Cxhm9WAQZ17pTMb3`. There is **no row for TJP Global Group, Beta Lab, Geeves.Life, Needs Review, or Multi-Vertical Rail**. Five of the plan's eleven canonical verticals are documentation-only entities with nowhere to post.

The inconsistency is already leaking into committed code: `tax_documents.verticalId` is declared `varchar(36)` but defaults to the literal string `"pers"`, which is not and cannot be a valid UUID. That is exactly the class of bug this mismatch will generate at scale.

Two further consequences deserve attention. First, `REV` and `MULTI` are described as system buckets that "never post to the G.L." — but if they are rows in `verticals` they will appear in every vertical selector, every access-control matrix, and every report grouping in the product, because the existing UI enumerates verticals generically. They need either an `isSystemBucket` flag that every consumer respects, or a home outside the `verticals` table entirely. Second, the brand system permits only six rainbow colours and five foundation colours, and every vertical carries a colour and icon; three new business verticals must draw from that fixed palette, which is a real design constraint on any vertical selector rather than an afterthought.

**Required resolution.** Add a `code` column to the production `verticals` table with a unique constraint, and add a `vertical_id` column to `vertical_code_map` so the registry becomes a genuine bridge rather than a parallel identity system. Seed rows for the missing business verticals with brand colours and icons drawn from the approved palette. Keep UUIDs as storage keys with codes as the human-facing and cross-document vocabulary. Carry `is_system_bucket` into production as `isSystemBucket`, then audit every existing vertical enumeration — selectors, access matrices, report groupings, the constellation view — to confirm each honours it. Fix the `tax_documents.verticalId` default in the same migration.

---

### CRITICAL-4 — The plan assumes one household; production has two, and the verticals are split across them

**Severity:** Critical · **Category:** Multi-tenancy · **Status:** New in v2.1

Every table in the financial design is household-scoped, and every access-control table is keyed by `householdId`. The plan is written throughout as though there is one household ledger.

The project's own knowledge base records otherwise, and flags it as important. The migration pack corroborates the blind spot precisely: it contains **zero occurrences of the string `household`**, because the SQLite staging database from which all of this data originates has no household dimension at all. There are two production households. **TJ Perkins Fam** (`YouIQoAP6nmcPNljVdUis`, created by user 1, `tarik@maxfieldbakery.com`) contains the Maxfield Bakery and Maxfield Market verticals. **TJ Perkins Global** (`V8lk3KJatvxBTWURf4uo9`, created by user 1410001, `tarik@tjperkinsfam.com`) is described as the primary active household and contains Bohemian Lodges, all five properties, and all sixteen calendars. The guidance in `AI_MEMORY.md` is that new feature work should target the Global household and treat the other as secondary or legacy.

For a general ledger this is not a preference, it is a correctness problem. The plan's anchors span verticals that live in different households — Maxfield Bakery at 312,505.33 and Maxfield Market at 248,432.67 in one, Bohemian Lodges at 142,515.17 in the other. A trial balance scoped by `householdId`, which is how every query in the system is written, cannot foot to those anchors simultaneously. Inter-company entries between Maxfield Bakery and Maxfield Market happen to stay within one household, but any Bohemian Lodges to Maxfield entry crosses a household boundary, and household isolation is actively enforced by `server/auth/householdIsolation.ts` with `assertHouseholdOwnership` guards. The only sanctioned cross-household movement in the entire codebase is a super-admin property reassignment that requires typing a confirmation phrase.

Three resolutions are available and the choice is the owner's. The ledger can be consolidated into the Global household by migrating the Maxfield verticals across, which is the cleanest end state and makes every subsequent query trivially correct, but requires a careful data migration and a decision about what happens to the legacy household. Alternatively the ledger can be built as genuinely multi-household, with a consolidation layer above `householdId` for owner-level reporting — the most faithful to reality if the two constellations are meant to stay distinct, and the most work. Or the financial engine can be scoped to one household for the first release, with the other explicitly out of scope and its anchors excluded from the acceptance gates.

**Required resolution.** Decide before Phase 1, because the answer determines whether `householdId` or a new `ledgerId` is the top-level scope key on every financial table. Whichever is chosen, Gate G4 must state which household or households the anchors belong to, and the acceptance test must be runnable as written. Do not defer this to migration time: it is a schema decision disguised as a data question.

---

### CRITICAL-5 — There is no vertical-scoped financial permission, and the EA role has no financial permission at all

**Severity:** Critical · **Category:** Access control · **Status:** Carried forward from Draft 1 review CRITICAL-1 and CRITICAL-2, materially worsened by code findings

The earlier review's central objection was that the plan is silent on who sees what. The newly committed G6 report closes part of that gap and, in doing so, supplies the decisive evidence for the owner's pushback. Its role matrix (§d) opens by stating the principle correctly — access "inherits `vertical_member_access` (full / read_only / blind / none)" and financial surfaces "must enforce it **per vertical, not globally** (plan gap)." Its gate assessment (§f) then records "role gating of financial surfaces not in any gate" as a finding against the plan. So the G6 author reached the same conclusion independently.

The matrix itself, however, contains the error. Its second column is headed **"read_only (e.g., caregiver, EA)"** — the Executive Assistant is classified alongside the caregiver — and the corresponding workbench row reads "Read-only mode: browse queue, open lineage; **all mutating controls disabled** with tooltip reason." Applied literally, and it is written to be applied literally, this means the EA cannot resolve a single queue item, cannot confirm or repair a rail, cannot edit a vehicle allocation rule, and cannot post an expense. With approximately 4,200 items to clear and the owner as the sole holder of `full`, the entire burndown lands on the owner. That is not a small matrix error; it is the difference between a system an assistant can run and a system only its owner can run.

The report also contains no notion of a vertical co-admin at any point, no routing design, and no reference to `vertical_data_policies`, `member_permission_overrides`, or any resolver function. So while its tooling design is strong, the access design that Part 3 supplies remains almost entirely additive rather than corrective.

On the plan side, v2.1 answers the question partially: §5 defines three view levels with real substance — **blind** sees zero financial rows and zero aggregates; **read_only** sees vertical totals and trends with category breakdowns suppressed where the line count is under three, and no memos; **full** sees line detail within granted verticals — and it further requires household-admin status or a `sensitive_finance` grant for salary and child-medical attributes. Gate G4 requires that "anchor queries return only access-permitted scope per role," and G6 requires role-gating to be demonstrated under blind and read-only test accounts.

That is a good specification of intent. It is not connected to anything. The plan never names `vertical_member_access`, `vertical_data_policies`, or `member_permission_overrides`, though all three exist, are populated, and already govern calendar and data visibility elsewhere in the product. Its three levels are in fact an exact match for the existing `vertical_member_access.accessLevel` enum, which is `full | read_only | blind | none` — the vocabulary is already in the database, and the plan reinvents it in prose without binding to it.

The code then reveals something more serious. The permission union in `server/routers/rbac.ts` contains exactly two financial permissions, `finance.view` and `finance.manage`. Both are **global**: there is no per-vertical financial permission primitive anywhere in the system. And the role grants are as follows.

| Role | Level | `finance.view` | `finance.manage` |
|---|---:|:---:|:---:|
| `household_admin` | 100 | Granted | Granted |
| `ea` | 70 | **Not granted** | **Not granted** |
| `member` | 50 | Granted | Not granted |
| `caregiver` | 30 | Not granted | Not granted |
| `child` | 10 | Not granted | Not granted |
| `elder` | 20 | Not granted | Not granted |

The Executive Assistant — the role whose entire purpose is to do the operational work on the owner's behalf, and which the earlier review's access matrix confidently described as having "read/write on assigned verticals" — **cannot currently view financial data at all**, let alone post to it. Meanwhile an ordinary `member` can view financials globally, across every vertical, because the permission carries no vertical scope. The effective posture today is therefore both too restrictive for the role that needs access and too permissive for the role that does not.

There is also a structural oddity worth correcting while the area is open: in `PERMISSION_GROUPS`, the two financial permissions are filed under the group `content`, labelled "Content & Shopping." Financial access is presented to the owner in the permissions interface as a sibling of shopping lists and notes.

**Required resolution.** This is the design work in Part 3, which supplies a `canAccessFinancials(memberId, verticalId, action)` resolver, a vertical-scoped permission set to replace the two global flags, a corrected role-to-capability matrix that gives the EA a real and bounded financial role, and a dedicated Finance permission group. The resolver must be written and unit-tested **before** any financial tRPC procedure is built, because retrofitting authorisation onto a router that already works is how leaks happen.

---

### CRITICAL-6 — The posting engine has no authorisation, and no reversal mechanics

**Severity:** Critical · **Category:** Access control and audit integrity · **Status:** Carried forward from Draft 1 review CRITICAL-2 and HIGH-4

The plan is admirably strict about the integrity of the audit trail. Section 5 mandates an append-only `edit_log` enforced at the database-privilege level and with `INSTEAD OF` triggers, a SHA-256 hash chain with periodic notarised anchors, an actor recorded as both human identity and agent or run identifier, dual-control reverts, and period locks that a household admin sets and that require dual control and a mandatory reason to unlock. Section 3.7 requires that the QuickBooks approval gate be an authenticated household admin.

None of this is authorisation on the write path itself. The plan never states who may call the posting engine, against which vertical, in which period, and what happens when they may not. The `qbo_sync_queue.approved_by` gate governs export, which is the last step; the first step — creating a journal entry — is ungoverned. The committed `journal_entries` table reflects this: it has `postedBy` and `postedAt` as passive stamps, and `isPosted` and `isLocked` as booleans, but no notion of who was entitled to set them.

Reversal is the second half of the same gap. Standard practice in a ledger is that a posted entry is never mutated or deleted; it is reversed by a new entry carrying the opposite signs and a pointer back to the original. The plan's "dual-control reverts" implies this without specifying it, and the schema cannot express it: `journal_entries` has no status enum, no `voidedAt`, no `voidedBy`, no `voidReason`, and no `reversalEntryId`. With only an `isPosted` boolean available, the path of least resistance for an implementer is to flip the flag — which destroys the audit trail the rest of §5 works so hard to protect, and does so silently.

**Required resolution.** Define `postEntry()` to take an actor and to call `canAccessFinancials(actor, verticalId, "post")` as its first statement, rejecting unauthorised callers before validation rather than after. Reject posting into a locked period unless the caller holds the unlock capability and supplies a reason. Add `status` as an enum of `draft`, `posted`, `reversed`, and `reversal`, together with `reversedByEntryId`, `reversesEntryId`, `reversalReason`, `reversedBy`, and `reversedAt`; forbid mutation of any entry whose status is `posted` and require reversal instead; and make double reversal impossible by constraint rather than by convention. Write the audit row inside the same transaction as the entry, so a successful post with a missing audit row is not representable.

---

## Part 2: HIGH-Severity Findings

### HIGH-1 — The workbench carries roughly 4,350 opening items, and Gate G2 demands zero

**Status:** Carried forward from Draft 1 review HIGH-1; tooling now specified, throughput and access still unresolved

The earlier review warned that 1,284 opening workbench items risked becoming "a graveyard." Section 5 of v2.1 enumerates the unified queue far more honestly, and the total is much larger: 2,037 items in the review bucket, 712 overlap transactions marked for review, 209 unattributed review items, approximately 1,016 rail-sweep candidates, 65 dedupe conflicts requiring an owner decision, 27 vehicle-allocation conflicts, and 286 pair-versus-attribution overlaps. That is on the order of **4,350 opening items**, which the G6 report independently corroborates at "≈4,200 rows of work," and Gate G2 requires the queue to reach zero.

The **tooling** half of this concern is now largely answered, and the G6 report deserves credit for it. It specifies bulk-accept by rule or pattern with a dry-run modal showing affected count, a ten-row sample, and explicit collision warnings for rows already paired, rows carrying allocation lines, and rows in locked periods. It specifies a session undo stack plus batch revert from an activity view, with reverts themselves written as log entries so append-only lineage survives. It puts a burndown chart at the top of the workbench and reuses it on the anchors overview as the deprecation countdown. It renders agents as bot chips distinct from human avatars and makes "edited by" filterable across agents, so a specific agent's batch can be re-audited. It logs every auto-accept above the confidence threshold as `auto-rule:{ruleId}`, establishing that there are no silent system edits. And it recognises, correctly, that "burn-down of 4k rows is a motivation problem as much as a tooling problem."

Two problems remain. The first is the one identified in CRITICAL-5: the report's own role matrix locks the EA out of every mutating control, so the well-designed tooling is available only to the person with the least time to use it. The second is Gate G2's strict-zero requirement.

At a genuinely brisk sustained rate of thirty resolutions per hour, that is roughly 145 hours of concentrated human judgement. The queue composition makes matters harder rather than easier, because the 65 dedupe conflicts and 27 allocation conflicts are explicitly the cases where automation has already failed and the plan states there is "zero edit_log recency signal" to break the tie. These are irreducibly manual.

Gate G2 is a hard blocker on Gate G4, so the entire migration is gated behind a volume of manual work that has never been scheduled and that the G6 report itself notes has no throughput requirement attached — its own gate assessment flags the absence of an "interaction/performance parity bar" and asks for keyboard-complete triage and sub-second row rendering at four thousand rows to be added as acceptance criteria.

**Recommendation.** Treat the workbench as the critical path it is. Three things change the arithmetic. First, **grant the EA and vertical co-admins the ability to resolve items** in their own verticals, per the Part 3 matrix; this is the single largest lever, because it converts a one-person queue into a several-person queue. Second, **triage by materiality**, since a Pareto pass will show a small number of items carrying most of the dollar value; the G6 report's rule-based bulk-accept with dry-run is the right instrument for the long tail, and the existing `expense_categorization_rules` table is the natural persistence layer so that a resolved cohort becomes a standing rule. Third, **soften Gate G2** from a strict zero to a materiality threshold: zero unresolved items above a dollar floor, zero in the conflict classes that require owner judgement, and a documented residual below the floor parked in a suspense account with a named owner and a review date. A gate that cannot realistically be passed will either delay the release indefinitely or be quietly waived, and the second outcome is worse than a well-designed threshold.

One reconciliation is also needed: the plan counts 286 pair-versus-attribution overlaps and 27 vehicle conflicts, while the G6 report states that "214 txns have both allocation_lines and attribution_lines." Those figures describe overlapping but not identical populations, and the discrepancy should be resolved before either number is used as an acceptance criterion.

---

### HIGH-2 — The rail vocabulary is a hardcoded enum that cannot express the plan's own rails

**Status:** Carried forward from Draft 1 review HIGH-5, unresolved and now blocking

The committed `transfer_pairs.transferType` is a MySQL enum with exactly seven values: `venmo`, `zelle`, `atm`, `owner_draw`, `loan_payment`, `credit_card_payment`, and `internal_transfer`.

The precedence matrix in §3.4 and the audit in §1 require rails this enum cannot represent. Stripe clearing is central to the `MULTI` bucket and has no value. The seven `MULTI` transfer pairs totalling 33,246.51 have no value. Booking-platform payouts, card funding, wire, and ACH all appear in the surrounding design and none exists in the enum. The earlier review recommended converting this to a `varchar(50)` with a reference table; v2.1 does not mention the enum at all, which means an implementer building §3.4 will hit a schema wall on their first Stripe pair.

**Recommendation.** Convert `transferType` to `varchar(50)` backed by a `transfer_rail_types` reference table seeded with the current seven values plus `stripe`, `ota_payout`, `card_funding`, `wire`, `ach`, and `multi_clearing`, so that new rails become configuration rather than migration. Per the scope boundary above, **do not seed a `square` value.** Keep referential integrity by validating against the reference table in the posting engine rather than by re-introducing an enum.

---

### HIGH-3 — Reconciliation state is absent from the ledger

**Status:** Carried forward from Draft 1 review HIGH-6, unresolved

The plan treats reconciliation as a migration event: anchors are verified once, at cutover, and Gate G4 passes or fails. It provides no ongoing mechanism, and the schema offers only `transfer_pairs.isReconciled` as a boolean on the pair rather than on the entry.

After go-live the system will need to answer, per entry, whether it has been matched against a bank statement line, whether it has been exported to and acknowledged by QuickBooks, and whether the owner has affirmatively verified it. Section 3.7 introduces `sync_state.sync_hash` and a `UNIQUE(txn_id, realm)` constraint for export idempotency, which covers the QuickBooks half but not bank reconciliation and not owner verification.

**Recommendation.** Add `reconStatus` as an enum of `unreconciled`, `matched`, `verified`, and `disputed`, together with `reconRef` for the statement line identifier and `reconciledAt` and `reconciledBy`. Surface an unreconciled count per vertical in the finance overview, since a reconciliation figure nobody sees is a reconciliation figure nobody acts on.

---

### HIGH-4 — The reporting currency is undefined, and a real dual-currency ledger cannot be built without it

**Status:** Carried forward from Draft 1 review HIGH-3, partially resolved

The schema is in better shape than the earlier review found. Both `journal_entries` and `journal_lines` carry `currency` as not-null defaulting to USD, plus `exchangeRate` at six decimal places, and `journal_lines` additionally carries `usdEquivalent`. Decision D5 resolves the two null-currency mirror rows to USD. An `exchange_rates` table exists.

Three gaps remain. There is still **no `reportingCurrency`** on either the household or the vertical, so the system cannot express that Bohemian Lodges reports in Jamaican dollars while Maxfield Market reports in United States dollars — which is the actual state of affairs, and which the production QuickBooks realm confirms, since the connected company runs a JMD home currency. The plan never wires the existing `exchange_rates` table to the `exchangeRate` column, leaving unstated whether a line stores the rate at transaction date, at posting date, or at period close. And `usdEquivalent` hardcodes United States dollars as the reporting currency in a column name, which will read as a defect the first time consolidated reporting is requested in JMD.

**Recommendation.** Add `reportingCurrency` to `verticals` and to `households`, define the rate-selection rule explicitly as transaction-date rate sourced from `exchange_rates` with the stored `exchangeRate` as the immutable record of what was used, and rename or supplement `usdEquivalent` with a currency-neutral `reportingAmount` plus `reportingCurrency` on the line. Where a rate is unavailable for a date, the rule for falling back to the nearest prior rate must be stated rather than left to whichever developer writes the first query.

---

### HIGH-5 — The audit log cannot categorise financial events

**Status:** New in v2.1

The committed `audit_log.category` is an enum of `auth`, `data`, `admin`, `security`, `gdpr`, and `system`. There is no `financial` value. The earlier review's governance check proposed verifying that financial mutations accumulate under `category='financial'`, which would return zero rows forever, and §5's requirement that every financial mutation be audited has no natural home in the existing taxonomy.

The table is otherwise well-suited: it already carries `actorUserId`, `actorMemberId`, `householdId`, `action`, `resourceType`, `resourceId`, `outcome`, a JSON `metadata` column, `ipAddress`, and `userAgent`, which is more than adequate.

**Recommendation.** Add `financial` to the category enum in the Phase 1 migration. Given the sensitivity rules in §5, also confirm that the `metadata` JSON is covered by the same scrubbing denylist as journal memos and QuickBooks payloads — an audit row that helpfully records the description of a redacted transaction defeats the redaction.

---

### HIGH-6 — Existing expense infrastructure overlaps the new posting layer with no stated migration path

**Status:** Carried forward from Draft 1 review item C7, unresolved

The repository already contains an operating expense subsystem: the `expenses` table, `expense_categorization_rules`, `vendor_orders`, `property_expense_records`, an `expenseCategorisation` tRPC router, and an `invoiceExtraction` router. v2.1 introduces the unified posting layer without once stating what becomes of any of it.

This matters on both correctness and product grounds. If both paths remain writable, the ledger will silently diverge from the expense tool and there will be no single source of truth — precisely the condition the plan exists to end. If the old path is closed abruptly, whatever user-facing flows depend on it break. And `expense_categorization_rules` is genuinely valuable: it is the natural persistence layer for the vendor auto-suggest behaviour the plan wants and for the batch rules the workbench needs, so it should be adopted rather than orphaned.

**Recommendation.** State the disposition of each artifact explicitly in v2.2 — retired, read-only, or adopted. The recommended posture is that `expenses` becomes read-only at cutover with new writes routed to the posting engine, `expense_categorization_rules` is adopted as the rule store for both vendor suggestions and workbench batch operations, `property_expense_records` is reconciled into the ledger with `propertyId` preserved, and `invoiceExtraction` is retained as an input adapter that produces draft entries rather than final postings.

---

### HIGH-7 — The plan understates existing infrastructure for per-property reporting and OTA commissions

**Status:** New in v2.1 — a positive correction, but one that changes the work plan

Section 1 asserts that "no per-property dimension exists in staging data," that Schedule E per-property reporting "cannot be produced from staging alone," and that OTA commissions "appear nowhere in BL expenses," inferring that payouts were recorded net so that both gross rents and commission expense are understated. Phase 5 accordingly schedules a property-assignment pass and a commission gross-up as new work.

The staging observation is correct; the conclusion about the production system is not. The committed schema already carries `propertyId` on both `journal_entries` and `journal_lines`, each with its own index. `property_expense_records` exists. Most directly, **`airbnb_payout_records` already decomposes payouts** into `grossAmount`, `hostFee`, `cleaningFee`, `occupancyTaxes`, `vat`, and `netPayout`, with currency and exchange rate — that is, the OTA commission the plan says is missing is already modelled, per payout. `ltr_payments` covers the long-term rental side, and `property_bookings` carries `totalPrice`, `commissionAmount`, `netAmount`, and `confirmationNumber`, populated in part by the Booking.com email scraper.

**Recommendation.** Rewrite the Phase 5 property work from "build" to "join." The gross-up pass should read `airbnb_payout_records` and `property_bookings` rather than reconstruct commissions from bank deposits, and the property-assignment pass should reconcile against existing property records rather than start from staging descriptions. This is a genuine reduction in scope, but it must be reflected in the plan or the team will duplicate infrastructure that exists — and worse, produce a second, disagreeing commission figure.

---

### HIGH-8 — Receipt capture has no storage model

**Status:** Carried forward from Draft 1 review item C1, unresolved

Receipt capture with optical character recognition is a headline capability and is inherently mobile-first. The storage model is a single `receiptUrl` varchar on `journal_lines`, mirrored on `ltr_payments`. There is no receipt table, so there is nowhere to record the extracted text, the confidence of extraction, the uploader, the upload time, the original filename, or the relationship between one receipt and the several journal lines a split expense produces. A one-to-many relationship is being modelled as a string.

**Recommendation.** Add a `receipt_images` table holding the storage key, uploader, upload timestamp, source (camera or file), extracted text, extraction confidence, and an optional link to the resulting journal entry, and reference it from `journal_lines` by identifier. Store bytes in S3 via the existing `storagePut` and `storageGet` helpers, never in the database, per the project's standing architecture rule. Because receipts routinely contain card numbers and, in this household's case, potentially child-identifying medical information, they fall squarely under §5's sensitivity rules and the same scrubbing and access gates must apply to extracted text.

---

### HIGH-9 — Invariant enforcement is specified but not monitored at runtime

**Status:** Carried forward from Draft 1 review item F1, partially addressed

The plan states its invariants clearly and adds a genuinely good one — a startup assertion that the allocation-versus-attribution overlap set is empty. What it lacks is continuous enforcement. The balance invariant, that debits equal credits on every posted entry, is enforced "at the application layer" per the schema comment, which means a direct database write, a migration script, or a bug bypasses it silently and nothing notices.

The infrastructure for this already exists and the project's rules require using it: server-side scheduled work runs through the heartbeat mechanism with thirteen Cloud Scheduler jobs already active, and `setInterval` and `node-cron` are explicitly disallowed.

**Recommendation.** Add a scheduled invariant monitor that verifies, on each run, that every posted entry balances to the cent, that the sum of allocation percentages is 100 for every posted transaction group, that the allocation-attribution overlap set is empty, that no posted entry sits in a locked period, and that the `edit_log` hash chain verifies. Alert the owner on any violation. Include the resulting figures in the weekly report so that a healthy ledger is visible rather than merely assumed.

---

## Part 3: The Access and Experience Design the Plan Is Missing

This part responds directly to the owner's objection that the previous user-experience review "didn't go deep enough to provide a good user experience for a vertical co-admin or executive assistant who has access to vertical-specific financials." That objection is well founded, and the reason is diagnosable rather than a matter of taste. The earlier review proposed a role matrix and three sidebar sketches. It did not define the permission primitives those roles would resolve against, did not define what a vertical co-admin *is* in a system that has no such role, did not specify how a cross-vertical entry appears to somebody entitled to only one side of it, and did not reconcile any of it with the RBAC system already running in production. A matrix without a resolver is a diagram, not a design.

The `uiux_review_g6_report.md` that landed during this review changes the picture but does not close it. What that report does well is worth stating precisely, both to be fair to it and because Team Kimi should build on it rather than around it. Its bulk-accept design — rule creation from a selection, a dry-run modal showing affected count and a ten-row sample, and explicit collision warnings for rows already paired, rows carrying allocation lines, and rows in locked periods — is the correct answer to a four-thousand-row queue. Its treatment of provenance is better than most production systems achieve: agents render as bot chips distinct from human avatars, the "edited by" filter includes agents so that a specific agent's batch can be re-audited, and every automatic acceptance is logged as `auto-rule:{ruleId}` so that there are no silent system edits. Its undo model preserves append-only lineage by writing reverts as log entries rather than deletions. Its comparison mode is governed by the right rule — the application must never show an unexplained delta — and it names the exact failure that would break owner confidence. Its beneficiary-privacy defaults are thoughtful: chips visible only at full access, read-only sees "Family — 2 beneficiaries" aggregates, no beneficiary names in exports unless explicitly toggled, and purpose tags as the shareable layer. And its accessibility work is genuinely strong, including the observation that eight vertical hues cannot be distinguished colourblind-safely and that colour chips must therefore always be paired with the code text, plus a designed screen-reader path for workbench triage rather than an emergent one.

What it does not do is define who may use any of it. Its role matrix classifies the Executive Assistant in the read-only tier alongside the caregiver and disables every mutating control for that tier, which as noted in CRITICAL-5 makes the EA unable to clear a single item. It contains no concept of a vertical co-admin. It specifies no routing. It does not mention `vertical_data_policies`, `member_permission_overrides`, or any resolver. Its own gate assessment concedes the point, listing "role gating of financial surfaces not in any gate" as an open finding.

What follows therefore complements the G6 report rather than replacing it: the report specifies the surfaces, and this specifies who reaches them. It is built on the primitives that already exist, because the fastest way to a leak is to invent a parallel authorisation system alongside a working one.

### 3.1 The vertical co-admin does not exist yet, and that is the first decision

The owner's question presupposes a role the system does not have. The `household_members.role` enum is `household_admin`, `ea`, `member`, `caregiver`, `child`, and `elder`. There is no vertical co-admin. Someone like a bakery manager who should run Maxfield Bakery's books completely and see nothing else has no role to occupy.

Three constructions are possible and they are not equivalent. The role enum could be extended with `vertical_admin`, which is explicit and self-documenting but touches the enum, the hierarchy, the permission map, and every switch statement on role. Alternatively — and this is the recommended path — the existing `vertical_owners` table can be promoted from a visibility helper into the definition of vertical co-administration: a member whose base role is `member` or `ea` and who holds a `vertical_owners` row for a given vertical is that vertical's co-admin, with full authority inside it and nothing outside it. That table already exists precisely to name who is responsible for `admin_only` and `private` verticals, `canSeeVertical()` already consults ownership, and no enum changes. The third option, a `custom_roles` entry, is the most flexible and the least predictable, since two households could define "co-admin" differently and support conversations become unanswerable.

The recommendation is the second, with one addition: a `vertical_owners.isFinancialOwner` boolean, so that operational responsibility for a vertical and financial responsibility for it can be separated. A property manager may legitimately run the Bohemian Lodges calendar and guest communications while having no business seeing the profit and loss.

### 3.2 Replace two global flags with five vertical-scoped capabilities

The present model — `finance.view` and `finance.manage`, both global — cannot express any of the situations the owner describes. The following replaces them. Each is resolved **per vertical**, not globally, and the two legacy permissions are retained only as deprecated aliases during transition so that nothing breaks mid-migration.

| Capability | Meaning | Default holders |
|---|---|---|
| `finance.view_aggregate` | Vertical totals, trends, and report headlines. No line detail, no memos, category breakdown suppressed below the k-anonymity floor. | `member` with `read_only` access; EA on verticals where the floor rule applies |
| `finance.view_detail` | Individual journal entries and lines, including memos, within the granted vertical. | `household_admin`; vertical financial owner; EA with `full` access on that vertical |
| `finance.post` | Create draft and posted entries in the granted vertical. Implies `view_detail`. | `household_admin`; vertical financial owner; EA with `full` access on that vertical |
| `finance.resolve_workbench` | Resolve queue items whose vertical is the granted vertical. Implies `post`. | `household_admin`; vertical financial owner; EA with `full` access |
| `finance.export_qbo` | Approve and push a batch to a QuickBooks realm. | `household_admin` only, non-delegable by default |

Two capabilities remain deliberately global rather than vertical-scoped, because they are inherently cross-cutting and granting them per vertical would be misleading. `finance.assign_vertical` allows resolving an item whose *vertical is itself the open question*, which requires seeing candidate verticals the holder may not otherwise be entitled to and therefore belongs to `household_admin` alone. `finance.view_sensitive` gates the attributes §5 singles out — salary and director's emoluments, child medical and therapy lines — and should be granted sparingly and audited on every use, matching the plan's `sensitive_finance` grant.

Alongside this, `finance.view` and `finance.manage` should be moved out of the `content` permission group into a dedicated `finance` group in `PERMISSION_GROUPS`, so that the owner configuring permissions encounters financial access as its own concern rather than as a footnote to shopping lists.

### 3.3 One resolver, called first, everywhere

Every financial procedure resolves access through a single function, and no procedure is permitted to reason about roles directly. The resolution order matters and should be implemented in exactly this sequence.

The resolver first establishes the member from the authenticated user, rejecting anyone who is not an active member of the household that owns the vertical. It then checks the household boundary, which given CRITICAL-4 is the point at which the two-household question becomes concrete: a member of the Global household has no standing whatsoever in the Fam household's ledger unless the consolidation decision says otherwise. It then reads the explicit override in `member_permission_overrides` for the requested capability, and if a row exists it is decisive in both directions — an explicit denial outranks a role grant, which is what makes a targeted revocation possible without restructuring roles. Absent an override, it reads `vertical_member_access` for the member and vertical pair; an access level of `none` or `blind`, or the absence of any row, ends the matter for detail-level requests, and `blind` additionally suppresses aggregates, exactly as §5 requires. It then consults `vertical_data_policies` for the `financial` category on that vertical, honouring `hiddenFromRoles` and `hiddenFromMemberIds`, which is the mechanism by which the owner can hide Personal financials from every EA without touching anyone's role. Only then does it apply the role-and-ownership grant from the capability table above, and finally, for sensitive attributes, it requires `finance.view_sensitive` as an additional gate rather than an alternative one.

Two properties of this resolver are non-negotiable. It must **fail closed**: any unexpected state — a missing row, an unrecognised role, a null vertical — denies rather than permits. And it must be the *first* statement in every procedure, before input validation, so that an unauthorised caller cannot learn anything from the shape of a validation error. A denial should be an opaque `FORBIDDEN`; a co-admin probing another vertical should not be able to distinguish "no such entry" from "not yours."

### 3.4 The corrected role and capability matrix

The following is what the owner should sign off on. It differs from the earlier review's matrix in three material respects: the EA gains a real financial role rather than an assumed one, the vertical co-admin is defined via financial ownership, and every row is vertical-scoped rather than global.

| Role | Verticals in scope | Aggregate view | Line detail | Post entries | Resolve workbench | Unassigned queue | QBO export | Sensitive attributes |
|---|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **Household admin** (owner) | All, both households subject to CRITICAL-4 | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| **EA** with `full` on assigned verticals | Assigned only | Yes | Yes | Yes | Yes | No | No | Only with explicit grant |
| **EA** with `read_only` on a vertical | That vertical | Yes | No | No | No | No | No | No |
| **Vertical co-admin** (`vertical_owners.isFinancialOwner`) | Own vertical only | Yes | Yes | Yes | Yes | No | Only if explicitly granted | Only with explicit grant |
| **Member** with `read_only` | Granted verticals only | Yes | No | No | No | No | No | No |
| **Member** with `full` | Granted verticals only | Yes | Yes | No | No | No | No | No |
| **Member** with `blind` or no row | None | No | No | No | No | No | No | No |
| **Caregiver / child / elder** | None by default | No | No | No | No | No | No | No |

Four points deserve emphasis. A `member` with `full` vertical access gets line detail but **not** posting rights, because in this product `full` describes visibility rather than authority; posting is a capability that must be granted deliberately. The EA is **denied the unassigned queue** even at full access, because deciding which vertical an ambiguous expense belongs to requires cross-vertical visibility that the EA does not have by design — this is the single most important boundary in the matrix, and it is also why the workbench needs a separate tab rather than a filter. QuickBooks export stays with the household admin, since it is the irreversible step that writes to an external system of record. And the caregiver, child, and elder roles are denied by default but remain grantable by override, which matters for an adult child managing an elder's affairs.

### 3.5 Routing: the vertical belongs in the URL

The earlier review proposed `/finance/:verticalCode/journal` and that instinct is right, but the reasoning needs stating because it determines the component hierarchy. Putting the vertical in the path rather than in client state means every financial view is independently addressable and bookmarkable, the server can authorise from the route parameter alone, a shared link either works for the recipient or cleanly fails closed, and browser history behaves correctly when an EA moves between two verticals. Vertical-in-state produces a single ambiguous URL whose meaning depends on invisible context, which is unshareable and untestable.

The structure should therefore be a consolidated set of routes at `/finance/overview`, `/finance/unassigned`, `/finance/export`, and `/finance/accounts`, all household-admin only, alongside a vertical-scoped set at `/finance/:verticalCode/overview`, `/finance/:verticalCode/journal`, `/finance/:verticalCode/workbench`, `/finance/:verticalCode/entry`, `/finance/:verticalCode/reports`, and `/finance/:verticalCode/reconcile`. A bare `/finance` should not render a dashboard; it should redirect according to entitlement — to the consolidated overview for a household admin, to the single vertical's overview for anyone entitled to exactly one, and to a chooser for anyone entitled to several. Codes in the path must be validated against `vertical_code_map` and resolved to a UUID server-side, and an unrecognised or unentitled code returns the same opaque forbidden response.

### 3.6 What each role actually sees

**The household admin** lands on a consolidated overview: profit and loss across all verticals with the decomposed anchor breakdown of spend, income, equity, rails, and review; a workbench badge showing the total with a per-vertical split; unreconciled counts; and QuickBooks sync status per realm. The sidebar shows Finance with children for Overview, Workbench, Unassigned, Journal, Accounts, Reports, Reconcile, and QBO Export, and a vertical switcher that includes an "All verticals" option.

**An EA assigned to two verticals** experiences something deliberately narrower. The Finance section appears with a vertical switcher containing exactly the verticals they hold, and no "All" option, because a consolidated view would necessarily leak the existence and magnitude of verticals they cannot see. Their overview is that vertical's profit and loss only. Their workbench badge counts only that vertical's items, and the Unassigned tab is absent rather than disabled — a disabled tab advertises the existence of work they cannot see and invites a support conversation. Expense entry pre-selects the vertical from the route rather than asking, which removes an entire class of misposting. Reports are that vertical only, and export is absent.

**A vertical co-admin** sees the same shape as the EA but with a single vertical and therefore no switcher at all. Finance reads simply as their vertical's books. This is the cleanest experience in the product and should be treated as the reference case, because a bakery manager who sees one coherent set of books is a manager who will actually use the system.

**A read-only member** sees aggregate figures and reports, with no journal, no entry, and no workbench. Category breakdowns are suppressed wherever the underlying line count falls below three, per §5's k-anonymity rule — which in this household is not a theoretical concern, since the plan itself records that "Director's Emoluments (gross)" and "Autism & Child Therapy (Tahj)" are each **exactly one line at 17,399.36**, meaning any category subtotal *is* an individual salary or a child's medical record. Suppression must therefore be computed from the line count at query time and never from a static category denylist.

**Caregivers, children, and elders** see no Finance section in the sidebar at all. The section is absent rather than empty: an empty financial section is a confusing and slightly alarming thing for a child's interface to contain.

### 3.7 Cross-vertical entries: the redaction rule

This is the question the earlier review raised and left open, and it is the hardest one in the design. A due-to-owner entry touches Personal and Maxfield Bakery. An inter-company entry touches Maxfield Bakery and Maxfield Market. An EA holding only Maxfield Bakery must be able to do their job without learning about the other side.

The rule should be that such an entry appears in **every vertical it touches**, but each viewer sees only the lines belonging to verticals they are entitled to, with the counterparty rendered as a **role-appropriate placeholder** rather than being hidden entirely. The Maxfield-only EA reviewing a due-to-owner entry sees the bakery expense line in full, and sees the funding side as "Owner-funded" with the amount but with no account, no memo, and no indication of which personal account or card was used. The amount must be shown, because concealing it would leave a visibly unbalanced entry and destroy the viewer's ability to verify anything; the identity of the counterparty is what is protected.

This is not a new invention. It is exactly the `shadow_blocks` pattern already shipped for calendars, where an event propagates to another vertical as a block titled "Busy" that proves the time is committed while revealing nothing about why. The `verticals.busyLabel` column is the existing precedent for a per-vertical placeholder string, and the financial analogue should follow it: a `financeRedactedLabel` on the vertical, defaulting to something neutral like "Internal — Personal" or "Inter-company," configurable by the household admin.

Two consequences follow. Vertical-scoped profit and loss must be computed from lines rather than from entries, since an entry-level aggregation would either double-count a cross-vertical entry in both verticals or arbitrarily attribute it to one. And `journal_lines` needs a resolvable vertical of its own: today the vertical lives on the entry header while the line carries only `glAccountId`, so the line's vertical must be derived through the account. That derivation should be made explicit — either denormalise `verticalId` onto the line, which is the pragmatic choice given it will appear in every filter, or guarantee it through the account with an index that makes the join cheap.

### 3.8 The workbench, per vertical

The workbench is where this design either works or fails, both because it is the highest-volume surface and because it is the one place where an item's vertical may be undetermined and therefore where the access model is genuinely tested rather than merely applied.

Every queue item must carry two distinct fields: `verticalId` for items whose vertical is known, and `tentativeVerticalId` for items where the vertical is the open question. Items with a known vertical are visible to anyone holding `finance.resolve_workbench` on it. Items whose vertical is undetermined are visible **only** to holders of the global `finance.assign_vertical` capability, which in practice means the household admin, and they live in the Unassigned tab that other roles do not see at all. This is what makes the 286 pair-versus-attribution overlaps and the 65 dedupe conflicts safe to expose: those are precisely the items where the vertical is contested, and contested items are owner work by definition.

The queue types should be explicit rather than inferred — uncategorised, vertical assignment, dedupe conflict, allocation conflict, pair-versus-attribution overlap, mis-paired deposit, rail sweep candidate, and unattributed — because each needs different resolution affordances and different batching, and a single generic "review" type will collapse into an undifferentiated list.

Given the roughly 4,350 opening items, three interface behaviours are load-bearing rather than nice to have. **Grouping** must be first-class, so that a vendor, an amount pattern, a date range, or a source account collapses a cohort into one decision. **Batch resolution** must write a persistent rule, not just the rows, using the existing `expense_categorization_rules` table, so that the same pattern arriving next month resolves itself. And **materiality ordering** must be the default sort, so the first hour of work addresses the largest dollars rather than the oldest rows. Every resolution writes an audit row and, where it creates a posting, passes through the same `postEntry()` authorisation as manual entry — the workbench must not become a side door into the ledger.

### 3.9 Mobile

Receipt capture is mobile-first by nature and the plan says nothing about it. The flow that matters is camera to extraction to review to post, and on a phone the vertical must come from the route rather than a picker, the account and category suggestions must come from `expense_categorization_rules` so that the common case is one confirmation rather than four selections, and the offline case must be handled by queueing a draft rather than failing. The existing accessibility modes — `picture_board` for children and `large_text` for elders — are irrelevant here only because those roles have no financial access; if an override ever grants an elder aggregate visibility, the large-text variant must be honoured on financial screens too, which is worth building once rather than retrofitting.

---

## Part 4: Traceability Against the July 29 Review

The owner asked specifically which concerns from the earlier review remain relevant. The following table is the audit. "Resolved" means the concern is closed in v2.1 or in committed code and needs no further action. "Carried forward" means it must appear in v2.2.

| Draft 1 finding | Verdict against v2.1 and the committed artifacts | Evidence | Where it now lives |
|---|---|---|---|
| CRITICAL-1 No financial access control model | **Carried forward (half resolved)** | `journal_entries.verticalId` exists and is indexed, so the *column* complaint is closed; but no resolver, and v2.1 never names the RBAC tables | CRITICAL-5, Part 3 |
| CRITICAL-2 No definition of who can post | **Carried forward, unresolved** | v2.1 gates QBO export on household admin but leaves `postEntry()` ungoverned | CRITICAL-6, Part 3.3 |
| CRITICAL-3 OAuth listed as Team 0 but already done | **Resolved** | OAuth is live; production credentials issued and stored; v2.1 does not contain a Team 0 | — |
| CRITICAL-4 Database engine mismatch | **Resolved** | v2.1 §5 explicitly targets Cloud SQL with TiDB-to-Cloud-SQL cutover checks | — |
| HIGH-1 Workbench has no UI specification | **Partially resolved** | G6 report now specifies bulk-accept with dry-run, undo, burndown, and agent attribution; but volume rises from 1,284 to roughly 4,350 and the EA is locked out of every mutating control | HIGH-1, CRITICAL-5, Part 3.8 |
| HIGH-2 `entryDate` column type | **Resolved** | `journal_entries.entryDate` is `date()`; separate `postedAt` timestamp exists | — |
| HIGH-3 Currency handling inconsistent | **Carried forward (partly resolved)** | Line-level `currency`, `exchangeRate`, `usdEquivalent` all exist; `reportingCurrency` still absent, `exchange_rates` still unwired | HIGH-4 |
| HIGH-4 No soft-delete or void audit trail | **Carried forward, unresolved** | No status enum, no void or reversal columns; only `isPosted` / `isLocked` booleans | CRITICAL-6 |
| HIGH-5 Transfer-pair schema too rigid | **Carried forward, unresolved and now blocking** | `transferType` still a seven-value enum that cannot express Stripe or MULTI clearing | HIGH-2 |
| HIGH-6 No reconciliation status | **Carried forward, unresolved** | No `reconStatus` or `reconRef`; only `transfer_pairs.isReconciled` | HIGH-3 |
| Part 3 UI/UX pushback | **Carried forward, substantially deepened** | v2.1 defers all screens to a missing report; roles, routing, and redaction were never specified | Part 3 in full |
| Item C7 Old `expenses` table read-only | **Carried forward, unresolved** | v2.1 never mentions the existing expense subsystem | HIGH-6 |
| Item C1 Receipt OCR storage | **Carried forward, unresolved** | No `receipt_images` table; only a `receiptUrl` string | HIGH-8 |
| Item F1 Guardian balance invariant | **Carried forward (partly addressed)** | v2.1 adds a startup assertion but no runtime monitor | HIGH-9 |
| Item F3 Audit log financial category | **Carried forward, newly diagnosed** | `audit_log.category` enum has no `financial` value | HIGH-5 |
| Item B2 Anchor figures | **Superseded** | v2.1 §1 proves the Draft 1 anchors were inflated by duplicates and supplies deduped replacements; the checklist below uses v2.1's figures | Part 5, Phase B |

One further point of process. The earlier review's Phase B checklist asked Team Kimi to verify anchors of 332,614.01 for Maxfield Bakery, 256,196.86 for Maxfield Market, and so on. Section 1 of v2.1 demonstrates those figures were **inflated by 235 attribution lines sitting on duplicate transactions**, and supplies corrected post-dedupe baselines. Any checklist still carrying the Draft 1 numbers will fail against a correctly migrated database. The checklist below uses v2.1's corrected figures, with the explicit caveat the plan itself attaches — that they remain subject to the resolution of 65 conflicts.

---

## Part 5: Post-Implementation Accountability Checklist

This checklist supersedes the one in `FINANCE_PLAN_REVIEW.md`. It is organised so that the gating items come first, and no phase opens until the prior phase's gate items pass. Every line has an executable verification; a line whose verification is "manual inspection" is a line that will be quietly skipped, so those have been kept to the two cases where no alternative exists.

Sign-off convention: each item requires the implementing team to record the verification output and the owner to counter-sign the phase gate. An unsigned gate blocks the next phase.

### Phase 0 — Pre-Sprint Gate (blocks all implementation)

| # | Item | Verification | Owner |
|---|---|---|---|
| 0.1 | Production migration artifact exists, separate from the SQLite staging pack | A Drizzle migration set or `production_migration.sql` provisions every Phase 1 table in MySQL with `DECIMAL`/`VARCHAR` types | Team Kimi |
| 0.2 | `migration_pack.sql` relabelled unambiguously as staging cleanup, and the staging-to-production transfer step is specified | Header states staging-only; a documented transfer step covers household assignment, vertical UUID resolution, and account mapping | Team Kimi |
| 0.3 | G6 role matrix corrected: the EA is removed from the read-only tier and mapped to the Part 3.4 matrix | Revised matrix shows EA with full access holding mutating controls on assigned verticals | Team Kimi |
| 0.3b | Registry inconsistency fixed: Geeves.Life `qbo_entity` cleared or marked pending, `sync_allowlisted` added | Query shows exactly two allowlisted realms | Team Kimi |
| 0.4 | Chart-of-accounts naming decision recorded (`gl_accounts` vs `chart_of_accounts`) | Written decision in v2.2; `journal_lines.glAccountId` has a declared FK target | Owner |
| 0.5 | Household consolidation decision recorded (CRITICAL-4) | Written decision naming the scope key and which anchors apply to which ledger | Owner |
| 0.6 | Vertical identity decision recorded: `verticals.code` added, UUIDs remain storage keys | Written decision; migration script drafted | Owner |
| 0.7 | Access model in Part 3 approved, including the EA capability grant | Owner sign-off on the Part 3.4 matrix | Owner |
| 0.8 | Square recorded as an explicit non-goal in v2.2 | v2.2 contains the scope-boundary statement | Owner |
| 0.9 | Gate G2 materiality threshold agreed in place of strict zero | Written threshold with dollar floor and named residual owner | Owner |

### Phase A — Schema and Core Engine

| # | Item | Verification | Owner |
|---|---|---|---|
| A1 | Canonical account table exists with `taxFormLine`, `isTaxRelevant`, `taxJurisdiction`; precedence versus the line-level columns documented | `DESCRIBE` returns the columns; a unit test asserts the documented precedence | Team 1 |
| A2 | `verticals.code` unique; `isSystemBucket` present; review and rail buckets flagged | `SELECT code, isSystemBucket FROM verticals` returns all eleven registry codes | Team 1 |
| A3 | Every existing vertical enumeration honours `isSystemBucket` | Automated scan: no selector, matrix, or report includes a flagged bucket | Team 1 |
| A4 | `tax_documents.verticalId` default corrected from the literal `"pers"` | `SHOW CREATE TABLE` shows no invalid UUID default | Team 1 |
| A5 | `transfer_pairs.transferType` is `varchar(50)` with a populated `transfer_rail_types` table; **no `square` row** | `SELECT code FROM transfer_rail_types` returns the agreed set and excludes `square` | Team 1 |
| A6 | `journal_entries` carries `status`, `reversesEntryId`, `reversedByEntryId`, `reversalReason`, `reversedBy`, `reversedAt` | `DESCRIBE` confirms; unit test proves a posted entry cannot be mutated | Team 1 |
| A7 | `journal_entries` carries `reconStatus`, `reconRef`, `reconciledAt`, `reconciledBy` | `DESCRIBE` confirms | Team 1 |
| A8 | `reportingCurrency` on `verticals` and `households`; rate-selection rule implemented against `exchange_rates` | Unit test: a JMD line converts using the transaction-date rate and stores it immutably | Team 1 |
| A9 | `audit_log.category` includes `financial` | `SHOW COLUMNS LIKE 'category'` includes the value | Team 1 |
| A10 | `workbench_queue` exists with `verticalId`, `tentativeVerticalId`, and an explicit `queueType` | `DESCRIBE` confirms all three | Team 1 |
| A11 | `receipt_images` exists; bytes in S3 via `storagePut`, never in the database | Upload test: row created, storage key resolves, no BLOB column exists | Team 1 |
| A12 | `vertical_code_map`, `migration_change_log`, `retired_txn_map`, `anchor_cache`, `period_locks` all created | `SHOW TABLES` returns all five | Team 1 |
| A13 | `canAccessFinancials(memberId, verticalId, capability)` implemented and fails closed | Unit suite covers all eight roles times all five capabilities times {no row, none, blind, read_only, full}; every unexpected state denies | Team 1 |
| A14 | `postEntry()` calls the resolver as its first statement | Unit test: an unauthorised caller is rejected before input validation, with an opaque error | Team 1 |
| A15 | `postEntry()` rejects unbalanced entries to the cent | Unit test: a one-cent imbalance throws | Team 1 |
| A16 | `postEntry()` rejects posting into a locked period absent the unlock capability and a reason | Unit test: locked-period post throws; unlock requires dual control plus reason | Team 1 |
| A17 | `postEntry()` writes the audit row in the same transaction as the entry | Unit test: forced audit failure rolls back the entry | Team 1 |
| A18 | Per-transaction allocation percentages sum to 100, enforced in the engine | Unit test: a group summing to 99 or 200 is rejected | Team 1 |
| A19 | Unique constraint prevents duplicate accounts per ledger scope | Unit test: duplicate insert throws | Team 1 |
| A20 | Deprecated `finance.view` / `finance.manage` aliases resolve to the new capabilities; a dedicated `finance` permission group exists | Unit test on alias resolution; `PERMISSION_GROUPS` contains a `finance` group | Team 1 |

### Phase B — Migration

| # | Item | Verification | Owner |
|---|---|---|---|
| B1 | Snapshot taken before every batch, identifier recorded | `migration_change_log` shows a snapshot ID per `batch_id`; no batch lacks one | Team 2 |
| B2 | Dry-run mode produced a row-count and sample-diff report for every batch before `--apply` | Dry-run artifacts archived per batch | Team 2 |
| B3 | Dedupe executed by the four-class rule; 283 rows retired, not 285 | 149 delete-class, 4 move-class, 65 queued, remainder mechanical; counts match | Team 2 |
| B4 | The 65 line-set conflicts are queued for owner decision, **not** auto-resolved | `SELECT COUNT(*) FROM workbench_queue WHERE queueType='dedupe_conflict'` = 65 | Team 2 |
| B5 | Anchors foot to the **v2.1 deduped** baselines within $1.00, decomposed per vertical | MB 312,505.33 · MM 248,432.67 · BL 142,515.17 · PERS 200,349.33 · FAM 36,938.48 · GL 2,508.22 · SO 1,333.37 · BLab 11.19, each split into spend / income / equity / rail / review | Team 2 |
| B6 | A PERS anchor is included in the acceptance test | PERS appears in the anchor report with both positive and negative sides | Team 2 |
| B7 | Card-interest in-or-out decision applied consistently and documented | Anchor query comment states the treatment; totals reconcile either way | Team 2 |
| B8 | Percentage normalisation complete: none null, none out of range, no group deviating by more than 0.01 | Validation query returns zero rows on all three conditions | Team 2 |
| B9 | Transaction 18600 corrected from a 200 percentage sum | That group now sums to 100 | Team 2 |
| B10 | Scotia month values recomputed to fiscal calendar month with per-row old values logged | 119 rows present in `migration_change_log` with old and new values | Team 2 |
| B11 | The `accounts` ghost row with a null identifier repaired; NOT NULL applied | `SELECT COUNT(*) FROM accounts WHERE id IS NULL` = 0; constraint present | Team 2 |
| B12 | Child-identifying strings scrubbed **before** any mapping row was written | Denylist lint passes on `gl_category_map`, all memos, and all QBO-visible strings; zero matches for child names | Team 2 |
| B13 | Beneficiary tags retained as a sidecar only — never in memos, payloads, exports, or logs | Tags queryable in the sidecar; lint proves absence everywhere else | Team 2 |
| B14 | All 169 in-use categories mapped, plus the 1,268 null-category lines dispositioned | Zero unmapped categories; zero null-category posted lines | Team 2 |
| B15 | Interest retyped as expense before `interest_by_vertical` was used | The four routing targets are money-out accounts; coverage gap documented or explained | Team 2 |
| B16 | `master_coa` merged then renamed, not dropped; `is_suspense` preserved | `master_coa_retired_20260807` exists; both H7 bindings present in `gl_category_map` | Team 2 |
| B17 | `Owner's Draw` and `Owner's Pay & Personal Expenses` retyped from Expense to equity | Type query confirms | Team 2 |
| B18 | No profit-and-loss account name contains "Uncategorized" | Query returns zero rows | Team 2 |
| B19 | Allocation-versus-attribution overlap set empty for posted transactions; startup assertion active | Assertion passes on boot; the 27 conflicts are in the queue, not posted | Team 2 |
| B20 | Refund pairs post to the same category account, never to a rail; the 4 cross-year pairs are flagged | Query confirms both sides share an account; 4 pairs carry a cross-year flag | Team 2 |
| B21 | No income-category attribution was swallowed by a rail | Every such case appears in the queue as `mis_paired_deposit` | Team 2 |
| B22 | Equity does not post twice; the Owner Investment control reconciles | 211 lines net to −1,810.81 against the MM-300 note | Team 2 |
| B23 | `edit_log` hash chain verifies end to end; append-only enforced at the privilege level | Chain verification passes; a direct UPDATE attempt is refused by the database | Team 2 |
| B24 | Migration ran under a least-privilege role distinct from the application runtime role | Grants audit shows two distinct roles | Team 2 |
| B25 | Scripts logged no raw descriptions, card members, child names, or amounts | Log sample audit: identifiers and hashes only | Team 2 |

### Phase C — Unified Expense Tool

| # | Item | Verification | Owner |
|---|---|---|---|
| C1 | Receipt capture stores the image in S3 and a `receipt_images` row; extracted text is access-gated | Upload test end to end; a read-only member cannot retrieve extracted text | Team 3 |
| C2 | Manual entry produces a balanced entry | Lines sum to zero | Team 3 |
| C3 | An owner-paid company expense posts the due-to-owner leg correctly | Personal-funded bakery expense credits the bakery due-to-owner account | Team 3 |
| C4 | Vendor auto-suggest reads `expense_categorization_rules` rather than a hardcoded seed | Suggestion changes when the rule row changes | Team 3 |
| C5 | Split expenses produce a multi-line balanced entry | 60/40 split yields three lines summing to zero | Team 3 |
| C6 | Entry is refused for a vertical the caller lacks `finance.post` on | An EA without that vertical is rejected with an opaque error | Team 3 |
| C7 | The legacy `expenses` table is read-only; new writes are routed to the posting engine | INSERT attempt is refused or redirected; the disposition is documented | Team 3 |
| C8 | Mobile capture completes offline by queueing a draft | Airplane-mode test: draft persists and posts on reconnect | Team 3 |

### Phase D — QuickBooks Export

| # | Item | Verification | Owner |
|---|---|---|---|
| D1 | Only the two allowlisted realms are valid push targets | A third realm is rejected by configuration, not by convention | Team 4 |
| D2 | Personal and Family are structurally excluded from export | Export query returns zero for both under all inputs | Team 4 |
| D3 | Only entries whose accounts are export-ready are eligible | No local-only account appears in an export batch | Team 4 |
| D4 | Idempotency holds: a retried push never double-posts | Same batch pushed twice yields one QuickBooks entity; `UNIQUE(txn_id, realm)` enforced | Team 4 |
| D5 | Export approval requires an authenticated household admin | An EA with full vertical access is refused | Team 4 |
| D6 | The batch preview is PII-scrubbed and the payload linter blocks child names, member names, and card numbers | Linter test with a seeded violation fails the batch | Team 4 |
| D7 | Webhook replay protection: skew beyond five minutes and seen nonces are rejected | Replay test returns rejection | Team 4 |
| D8 | Refresh tokens live in Secret Manager, never in the database or environment | Secret audit; grep of the database and environment finds none | Team 4 |
| D9 | At least one locked period precedes the first push | `period_locks` shows a locked period earlier than the first export timestamp | Team 4 |
| D10 | First push targeted a sandbox realm before any production realm | Sync log ordering confirms | Team 4 |
| D11 | `markExported` records realm and entity identifiers | Both populated on every exported entry | Team 4 |
| D12 | Inter-company entries land in both realms | The bakery-to-market pair appears in each | Team 4 |

### Phase E — Interface and Access Control

| # | Item | Verification | Owner |
|---|---|---|---|
| E1 | Finance is absent from the sidebar for caregiver, child, and elder — absent, not empty | Login as each: no Finance node in the DOM | Team 5 |
| E2 | The vertical switcher lists exactly the caller's entitled verticals, with no "All" option below household admin | EA with two verticals sees two entries and no All | Team 5 |
| E3 | Every financial route authorises from the route parameter server-side | Direct URL to an unentitled vertical returns an opaque forbidden response | Team 5 |
| E4 | `/finance` redirects by entitlement: consolidated, single vertical, or chooser | Three role tests produce the three behaviours | Team 5 |
| E5 | Vertical profit and loss is computed from lines, not entry headers | A cross-vertical entry appears once in each vertical at the correct amount, and totals do not double-count | Team 5 |
| E6 | Cross-vertical counterparties are redacted to a label with the amount retained | Bakery-only EA sees the amount and the placeholder, and no counterparty account or memo | Team 5 |
| E7 | Category breakdowns are suppressed below three lines, computed at query time | The Director's Emoluments and child-therapy single-line categories are suppressed for read-only viewers | Team 5 |
| E8 | Sensitive attributes require `finance.view_sensitive`, and each access is audited | Access without the grant is refused; with it, an audit row appears | Team 5 |
| E9 | The Unassigned tab is absent for every role lacking `finance.assign_vertical` | EA with full access does not see the tab at all | Team 5 |
| E10 | Workbench badges count only entitled verticals | Badge total for an EA equals the sum over their verticals only | Team 5 |
| E11 | Batch resolution writes a persistent rule as well as the rows | Resolving a cohort creates an `expense_categorization_rules` row that matches the next arrival | Team 5 |
| E12 | Workbench resolution passes through `postEntry()` authorisation | A resolution attempt on an unentitled vertical is refused | Team 5 |
| E13 | Materiality is the default workbench sort | Default view is descending by absolute amount | Team 5 |
| E14 | Reports foot to the Phase B decomposed anchors per vertical | Report output matches B5 within $1.00 | Team 5 |
| E15 | Role gating demonstrated live under blind and read-only test accounts | Recorded walkthrough of both, per Gate G6 | Team 5 |
| E16 | Mobile capture works end to end on a phone browser | Camera, extraction, review, post | Team 5 |
| E17 | All nine G6 capabilities are present, including the vehicle-allocation editor, the beneficiary-tag family view, and the QBO status board | Each demonstrated against the committed G6 report | Team 5 |
| E18 | New vertical colours drawn only from the approved brand palette | Colour audit against the six rainbow and five foundation values | Team 5 |

### Phase F — Governance and Monitoring

| # | Item | Verification | Owner |
|---|---|---|---|
| F1 | A scheduled invariant monitor runs via the heartbeat, never `setInterval` or `node-cron` | Job registered; a seeded unbalanced entry alerts within one cycle | All |
| F2 | The monitor covers balance, percentage sum, allocation overlap, locked-period posting, and hash-chain integrity | Five seeded violations produce five distinct alerts | All |
| F3 | Every financial mutation writes an audit row under `category='financial'` | Count grows with each posting; audit metadata passes the scrubbing lint | All |
| F4 | The weekly report includes ledger health: unreconciled count, queue depth, and last anchor check | Triggered report contains all three | All |
| F5 | Period lock and dual-control unlock both work, and unlocking a synced period enqueues re-reconciliation | Lock, attempt post, unlock with reason, confirm the re-reconciliation job | All |
| F6 | No regression in calendar, property, shopping, or notes | Full regression suite passes | All |
| F7 | The thirty-day read-only comparison mode runs before the staging database is archived | Comparison mode live; discrepancy log empty or explained | All |

---

## Part 6: Recommendations for Team Kimi

**Do not open the sprint on v2.1.** Spend the first session producing v2.2, which differs from v2.1 in six specific ways: it commits the three missing companion artifacts, resolves the chart-of-accounts naming collision, settles the vertical identity model, settles the two-household question, adopts the access design in Part 3, and records Square as an explicit non-goal. Every one of those is a decision rather than an implementation, and none of them takes long — but each of them, left open, invalidates work done downstream.

**Write the authorisation resolver before the first financial procedure.** `canAccessFinancials()` is the load-bearing component of the entire module and it is far easier to build correctly on day one than to retrofit onto a working router. Give it an exhaustive unit suite that covers every role against every capability against every access level, and make its failure mode denial rather than permission. Every financial procedure calls it first, and no procedure reasons about roles directly.

**Treat the workbench as the critical path, not as reporting.** Roughly 4,350 opening items sits between the migration and Gate G4, and a meaningful fraction of them are irreducibly manual. Build grouping, batch-to-rule resolution, and materiality ordering before building a single report, because reports can wait and the queue cannot.

**Sequence the schema decisions that everything else depends on.** The account table name, the vertical identity model, and the ledger scope key all propagate into every subsequent table, query, and component. Resolve them in Phase 0 and treat any later change as a migration rather than an edit.

**Preserve v2.1's accounting work intact.** Nothing in this review disputes the precedence matrix, the four-class dedupe rule, the interest retyping, the decomposed anchors, or the sensitivity scrubbing. Those are the plan's genuine contributions and they should carry into v2.2 unchanged. What is being added is the executability and the access model that would let a co-admin or an assistant actually use the thing.

---

*Review prepared by Manus AI, August 7, 2026, against commit state of `TJP-GLOBAL-GROUP/geeves-life` as of this date. Every schema, permission, and role claim was verified against the repository rather than inferred from documentation. This document should be circulated to Team Kimi together with v2.1, and the Phase 0 gate should be counter-signed by the owner before implementation begins.*
