# Geeves Unified Finance Implementation Plan v2.1 — Pre-Implementation Review

**Date:** August 7, 2026
**Reviewer:** Manus (Product Architecture Review)
**Document Under Review:** "Geeves Unified Finance Implementation Plan — Draft 1 (for External Review)", July 29, 2026
**Audience:** Supah-T (Product Owner), Team Kimi (Implementation Lead)

---

## Executive Summary

The Unified Finance Implementation Plan is architecturally sound in its core thesis: one posting layer, rails-not-categories, workbench-not-silent-buckets. The schema design is clean and the migration strategy (anchor-verified, cent-exact) is rigorous. However, the plan has **four CRITICAL gaps** and **six HIGH-severity concerns** that, if unaddressed before implementation, will result in either a failed sprint, a broken user experience, or a security exposure. Most critically, the plan is entirely silent on **who sees what** — there is no financial access control model, no vertical-scoped UI routing, and no consideration of how the existing RBAC system (`vertical_member_access`, `vertical_data_policies`, `custom_roles`) integrates with the new G.L. tables.

---

## Part 1: CRITICAL Concerns (Must Resolve Before Sprint Start)

### CRITICAL-1: No Financial Access Control Model

**Severity:** CRITICAL
**Impact:** Security exposure, data leakage between verticals, broken multi-tenant isolation

The plan introduces `gl_accounts`, `journal_entries`, `journal_lines`, `workbench_queue`, and `transfer_pairs` — none of which carry a `verticalId` foreign key on the journal entry level. The `gl_accounts` table has `verticalCode` (a string like "MB"), but journal entries only have `householdId`. This means:

- A query for "all journal entries" returns entries across ALL verticals in the household
- There is no mechanism to filter journal lines by the caller's `vertical_member_access.accessLevel`
- The existing `vertical_data_policies` table has a `dataCategory = "financial"` enum value, but the plan never references it
- A co-admin with `accessLevel = "read_only"` on the MB vertical and `accessLevel = "none"` on PERS would still see PERS journal lines in cross-vertical reports

**Required resolution:** Every `journal_entry` must carry a `primaryVerticalId` (FK to verticals), and the query layer must enforce `vertical_member_access` filtering. Cross-vertical entries (Due-to-Owner, inter-company) need a resolution strategy — either they appear in both verticals with appropriate redaction, or they appear only in the vertical of the debit side.

---

### CRITICAL-2: No Definition of "Who Can Post" vs "Who Can View"

**Severity:** CRITICAL
**Impact:** Unauthorized financial mutations, audit trail gaps

The plan defines `postEntry()` as the single write path but never specifies authorization. The existing role hierarchy is:

| Role | Expected Financial Access |
|------|--------------------------|
| `household_admin` | Full read/write across all verticals |
| `ea` (Executive Assistant) | Read/write on assigned verticals only |
| `member` | View-only on verticals where `accessLevel = "full"` or `"read_only"` |
| `caregiver` | No financial access unless explicitly granted |
| `child` | No financial access |
| `elder` | No financial access unless explicitly granted |

The plan's `postEntry` function takes `ctx.db` but never checks `ctx.user.role`, `ctx.user.memberId`, or the caller's vertical access level. The `createdBy` field on `journal_entries` is a passive stamp, not an authorization gate.

**Required resolution:** Define a `canPostToVertical(memberId, verticalCode)` guard that checks `vertical_member_access.accessLevel === "full"` AND `vertical_data_policies.dataCategory === "financial"` is not in `hiddenFromMemberIds`. Wire this into every mutation in the unified expense router.

---

### CRITICAL-3: OAuth Cutover Listed as "Team 0" but Already Completed

**Severity:** CRITICAL (process risk — sprint planning based on stale information)
**Impact:** Team allocation waste, incorrect dependency chain

Section 6 states: "OAUTH_SERVER_URL still points at decommissioned Manus auth; beta login fails." This was true on July 29 when the plan was written. As of August 5, 2026:

- Google OAuth is live and working on beta.geeves.life
- The OAuth scope reduction has been applied (commit `53f626c`)
- The deployment pipeline is green (commit `38a46d8`)
- Cloud SQL is connected via Auth Proxy
- All 13 Cloud Scheduler jobs are active

**Required resolution:** Remove Team 0 from the sprint plan. Update the "Current-State Audit" (§1) to reflect the actual state as of August 2026. The sprint can begin immediately with Teams 1–6 in parallel.

---

### CRITICAL-4: Database Engine Mismatch (O6 Resolved but Plan Doesn't Know)

**Severity:** CRITICAL (implementation will target wrong database)
**Impact:** Schema syntax errors, connection failures

Open Decision O6 asks "TiDB vs Cloud SQL for the G.L." — this is now resolved. The production database is **Cloud SQL (MySQL 8.0)** at `geeves-495802:us-east4:geeves-primary`, connected via Cloud SQL Auth Proxy. The schema in §4 uses `date()` (which requires an explicit import — we already fixed this in commit `38a46d8`). The plan must be updated to confirm Cloud SQL as the target and remove any TiDB-specific considerations.

**Required resolution:** Update O6 to "RESOLVED — Cloud SQL MySQL 8.0 via Auth Proxy." Confirm that the schema uses no TiDB-specific features (it doesn't — already verified during migration).

---

## Part 2: HIGH-Severity Concerns

### HIGH-1: Workbench Queue Has No UI Specification

The plan correctly identifies that uncategorized items must route to `workbench_queue` and never to P&L. However, there is no specification for:
- How the workbench is accessed (sidebar item? notification badge? dedicated page?)
- Who can resolve workbench items (admin only? EA? any member with vertical access?)
- What "conversational categorization" means in practice (LLM-assisted? rule-based? manual dropdown?)
- How the 1,284 seed items from migration will be presented without overwhelming the user

**Recommendation:** Define the workbench as a dedicated page accessible from the Finance section of the sidebar, with a badge count. Resolution should be restricted to members with `accessLevel = "full"` on the item's vertical. Batch resolution (select multiple → apply same category) is essential for the 1,284 migration items.

---

### HIGH-2: No Consideration of the `entryDate` Column Type

The schema uses `timestamp("entry_date")` for journal entries, but the plan discusses dates like "Dec 2022" and "Jan 2026" — historical entries that predate the system. MySQL `TIMESTAMP` has a range of 1970-01-01 to 2038-01-19 and stores in UTC. For a financial ledger that must represent historical dates accurately (not datetime-of-posting), this should be `date("entry_date")` — a DATE column, not a TIMESTAMP. The plan's own recon engine uses dates, not timestamps, for transaction attribution.

**Recommendation:** Change `entryDate` from `timestamp` to `date` in the schema. Add a separate `postedAt: timestamp` for the audit trail of when the entry was created in the system.

---

### HIGH-3: Currency Handling is Inconsistent

The plan mentions "JMD dual-life support" and includes `fxRate` on journal lines, but:
- `amountCents` is a single integer — which currency's cents?
- There's no `reportingCurrency` on the household or vertical level
- The exchange rate table already exists (`exchange_rates`) but isn't referenced
- The recon engine's anchors are in USD (MB 332,614.01) but Scotiabank transactions are in JMD

**Recommendation:** Add `currency` as NOT NULL on `journal_lines` (already in the schema but defaulting to USD). Add `reportingCurrency` to the `verticals` table. Define the conversion rule: store in transaction currency, convert to reporting currency for display using the `fxRate` on the line or the nearest `exchange_rates` entry.

---

### HIGH-4: No Soft-Delete or Void Audit Trail

Journal entries have `status: ["draft","posted","voided"]` but there's no mechanism to:
- Record WHY an entry was voided
- Prevent re-voiding
- Create a reversing entry (standard accounting practice — you don't delete, you post a reversal)
- Track who voided and when

**Recommendation:** Add `voidedAt: timestamp`, `voidedBy: varchar`, `voidReason: text`, and `reversalEntryId: varchar` to `journal_entries`. Voiding should create a reversing entry (same lines, opposite signs) rather than simply flipping a status flag.

---

### HIGH-5: Transfer Pairs Schema is Too Rigid

The `rail` enum (`zelle, venmo, cashapp, paypal, atm, ach, wire, card_funding, internal`) is hardcoded. New payment rails emerge frequently (e.g., Wise, Remitly, cryptocurrency). Adding a new rail requires a schema migration.

**Recommendation:** Change `rail` from `mysqlEnum` to `varchar(50)` with a separate `transfer_rail_types` reference table. Seed it with the current values but allow admin-added rails without migrations.

---

### HIGH-6: No Reconciliation Status on Journal Entries

The plan discusses anchor verification during migration but provides no ongoing reconciliation mechanism. After go-live, how does the system know if a journal entry has been:
- Reconciled against a bank statement?
- Matched to a QBO export?
- Verified by the owner?

**Recommendation:** Add `reconStatus: mysqlEnum(["unreconciled","matched","verified","disputed"])` and `reconRef: varchar` (bank statement line ID) to `journal_entries`.

---

## Part 3: UI/UX Pushback — Vertical-Scoped Financial Access

### The Problem with the Current Plan's Silence on UI

The plan specifies a "Reporting surfaces" team (Team 5) that will build "P&L by Year + Mini Balance Sheet by Year" — but says nothing about:

1. **How does a vertical co-admin navigate to their vertical's financials?**
2. **What does the EA see when they manage finances for 3 of 7 verticals?**
3. **How does the workbench present items that span multiple verticals?**
4. **Where does the financial module live in the existing sidebar navigation?**

This is not a "later" concern — it's a **structural architecture decision** that affects the router design, the tRPC procedure signatures, and the component hierarchy.

---

### Proposed User Access Matrix

| User Type | Verticals Visible | Financial Actions | Workbench Access | QBO Export | Reports |
|-----------|-------------------|-------------------|------------------|------------|---------|
| **Household Admin** (Tarik) | ALL | Full CRUD on all verticals | All items | Yes | All verticals, consolidated |
| **EA** (assigned to MB + MM) | MB, MM only | Post expenses, resolve workbench items for MB/MM | MB + MM items only | No (admin only) | MB + MM only |
| **Vertical Co-Admin** (e.g., Janieze for MB) | MB only | Full CRUD on MB | MB items only | MB only (if granted) | MB only |
| **Member** (read_only on MB) | MB (read-only) | View journal entries, view reports | No access | No | MB view-only |
| **Caregiver / Child / Elder** | None (unless overridden) | None | None | None | None |

---

### How the Workbench Must Work Per Vertical

The current plan treats the workbench as a single household-wide queue. This is wrong for multi-vertical households. The workbench must be **vertical-scoped**:

1. **Navigation:** Finance → Workbench shows a vertical selector (tabs or dropdown) filtered to verticals the user has `accessLevel = "full"` on
2. **Items:** Each workbench item must carry a `verticalId` (or `tentativeVerticalId` for items where vertical assignment IS the question)
3. **Queue type "vertical_assignment":** These items appear in a special "Unassigned" tab visible only to household_admin, since determining which vertical an expense belongs to requires cross-vertical visibility
4. **Resolution:** Resolving a workbench item creates a journal entry — the resolver must have write access to the target vertical

---

### How the Financial Module Should Be Accessed

The existing sidebar has: Home, Calendar, Household, Properties, Shopping, Notes, Settings. The financial module needs to integrate as follows:

**For Household Admin:**
```
Sidebar:
  ...
  💰 Finance
    ├── Overview (consolidated P&L, balance sheet)
    ├── Workbench (badge: 47 items)
    ├── Journal (searchable ledger)
    ├── Accounts (chart of accounts)
    ├── Reports
    │   ├── P&L by Vertical
    │   ├── Balance Sheet
    │   └── Due-to-Owner Statement
    └── QBO Export
```

**For EA / Vertical Co-Admin:**
```
Sidebar:
  ...
  💰 Finance
    ├── [Vertical Selector: MB ▾]
    ├── Overview (vertical-specific P&L)
    ├── Workbench (badge: 12 items for this vertical)
    ├── Journal (filtered to this vertical)
    ├── Expense Entry (post to this vertical)
    └── Reports (this vertical only)
```

**For Member (read-only):**
```
Sidebar:
  ...
  💰 Finance (view only)
    ├── [Vertical: MB]
    ├── Overview
    └── Reports
```

---

### Critical UX Questions the Plan Must Answer

1. **Vertical context switching:** When an EA manages finances for MB and MM, do they switch verticals via a top-bar selector, a sidebar sub-menu, or separate routes (`/finance/mb/journal` vs `/finance/mm/journal`)?

2. **Cross-vertical entries:** A Due-to-Owner entry touches both PERS and MB. Does it appear in both vertical views? If so, is the PERS side redacted for an EA who only has MB access?

3. **Expense entry default vertical:** When an EA clicks "New Expense," which vertical is pre-selected? The last-used vertical? The only vertical they have access to? A required selection step?

4. **Workbench notification routing:** When a new uncategorized item lands in the workbench, who gets notified? The vertical owner? All members with full access? Only household_admin?

5. **Mobile experience:** The plan mentions no mobile considerations. Receipt capture (OCR) is inherently mobile-first. How does the expense entry flow work on a phone for an EA in the field?

---

## Part 4: Post-Implementation Accountability Checklist

This checklist must be completed in sequence. Each item has a verification method. The implementation is not considered complete until ALL items are checked.

### Phase A: Schema & Core (Team 1)

| # | Item | Verification Method | Owner |
|---|------|--------------------:|-------|
| A1 | `gl_accounts` table created with all columns from §4 + `verticalId` FK | `DESCRIBE gl_accounts` returns all columns | Team 1 |
| A2 | `journal_entries` table includes `primaryVerticalId` NOT NULL | `DESCRIBE journal_entries` confirms column | Team 1 |
| A3 | `journal_lines` table created with `currency` NOT NULL | `DESCRIBE journal_lines` confirms | Team 1 |
| A4 | `transfer_pairs` table created with `rail` as VARCHAR not ENUM | `DESCRIBE transfer_pairs` confirms | Team 1 |
| A5 | `workbench_queue` table includes `verticalId` column | `DESCRIBE workbench_queue` confirms | Team 1 |
| A6 | `postEntry()` enforces balanced entries (sum = 0) | Unit test: unbalanced entry throws | Team 1 |
| A7 | `postEntry()` checks caller's vertical write access | Unit test: unauthorized caller rejected | Team 1 |
| A8 | `postEntry()` writes to `audit_log` on every call | Unit test: audit row created | Team 1 |
| A9 | Catalog seed (103 accounts + D1–D10 deltas) loads without error | Seed script exits 0; `SELECT COUNT(*) FROM gl_accounts` = expected | Team 1 |
| A10 | Unique constraint on `(householdId, code)` prevents duplicate accounts | Unit test: duplicate insert throws | Team 1 |

### Phase B: Migration (Team 2)

| # | Item | Verification Method | Owner |
|---|------|--------------------:|-------|
| B1 | All 7,897 attribution lines migrated to journal entries | `SELECT COUNT(*) FROM journal_entries WHERE source='migration'` = 7,897 (or grouped equivalent) | Team 2 |
| B2 | Anchor verification passes for ALL verticals | Script output: MB 332,614.01 · MM 256,196.86 · BL 145,817.98 · GL 2,627.77 · SO 1,396.85 · FAM 36,858.79 · BLab 11.75 | Team 2 |
| B3 | 1,284 uncategorized lines in workbench_queue | `SELECT COUNT(*) FROM workbench_queue WHERE queue_type='uncategorized'` = 1,284 | Team 2 |
| B4 | Transfer pairs created for all 80 rail legs | `SELECT COUNT(*) FROM transfer_pairs WHERE matched_by='ruling'` = 40 (pairs) | Team 2 |
| B5 | Beneficiary tags preserved | `SELECT DISTINCT beneficiary_tag FROM journal_lines WHERE beneficiary_tag IS NOT NULL` includes 'Tahj-autism', 'Tiago' | Team 2 |
| B6 | No P&L account has "Uncategorized" in its name | `SELECT * FROM gl_accounts WHERE name LIKE '%ncategorized%'` returns 0 rows | Team 2 |
| B7 | edit_log backfilled to audit_log | `SELECT COUNT(*) FROM audit_log WHERE source='migration'` > 0 | Team 2 |

### Phase C: Unified Expense Tool (Team 3)

| # | Item | Verification Method | Owner |
|---|------|--------------------:|-------|
| C1 | Receipt OCR captures and stores image in GCS | Upload test receipt → image URL resolves → `receipt_images` row exists | Team 3 |
| C2 | Manual expense entry creates balanced journal entry | Create expense → `SELECT * FROM journal_entries WHERE source='manual_entry'` → lines sum to 0 | Team 3 |
| C3 | Owner-paid company expense triggers Due-to-Owner posting | Pay with PERS account for MB expense → credit line hits MB-220 | Team 3 |
| C4 | Vendor auto-suggest returns D8 seed rules | Enter "Ellis" → suggests MB-660 @100% | Team 3 |
| C5 | Split expense creates multi-line journal entry | Split $100 between MB-500 (60%) and MB-510 (40%) → 3 lines (2 debit, 1 credit), sum = 0 | Team 3 |
| C6 | Expense entry respects vertical access | EA without MM access cannot post to MM accounts | Team 3 |
| C7 | Old `expenses` table is read-only (no new inserts) | Attempt INSERT into expenses → rejected or redirected | Team 3 |

### Phase D: QBO Export (Team 4)

| # | Item | Verification Method | Owner |
|---|------|--------------------:|-------|
| D1 | `qbo.exportReady` returns only entries with both accounts `extState='qbo'` | Query returns non-empty list; no `extState='local'` accounts in results | Team 4 |
| D2 | FAM and PERS entries are structurally excluded | `qbo.exportReady` with FAM/PERS entries in DB → returns 0 for those verticals | Team 4 |
| D3 | Export creates correct entity type in QBO (Purchase/Deposit/JE) | Manual verification in QBO sandbox | Team 4 |
| D4 | `markExported` records realm ID and QBO entity ID | `SELECT realmId, qboEntityId FROM journal_entries WHERE exported=true` → populated | Team 4 |
| D5 | Inter-company entries export to both realms | MB-120/MM-210 pair → entries in Realm A AND Realm B | Team 4 |

### Phase E: UI & Access Control

| # | Item | Verification Method | Owner |
|---|------|--------------------:|-------|
| E1 | Finance sidebar section visible only to users with financial access | Login as child role → Finance not in sidebar | Team 5 |
| E2 | Vertical selector filters all financial views | Select "MB" → journal shows only MB entries | Team 5 |
| E3 | EA sees only assigned verticals in the selector | EA with MB+MM access → selector shows MB, MM only | Team 5 |
| E4 | Workbench badge shows count per vertical | Badge updates when items are added/resolved | Team 5 |
| E5 | P&L report matches anchor totals for each vertical | Compare report output to B2 anchors | Team 5 |
| E6 | Cross-vertical entries show appropriate redaction | EA with MB-only access viewing Due-to-Owner → PERS side shows amount but not account details | Team 5 |
| E7 | Mobile receipt capture flow works end-to-end | Phone browser: camera → OCR → review → post | Team 5 |

### Phase F: Governance & Monitoring

| # | Item | Verification Method | Owner |
|---|------|--------------------:|-------|
| F1 | Guardian monitors G.L. balance invariant | Manually create unbalanced entry (bypass) → guardian alert fires within 5 min | All |
| F2 | Weekly report includes financial summary | Trigger weekly report → email contains G.L. stats | All |
| F3 | Audit log captures all financial mutations | `SELECT COUNT(*) FROM audit_log WHERE category='financial'` grows with each expense entry | All |
| F4 | No regression in existing calendar/property/shopping features | Full regression test suite passes | All |

---

## Part 5: Recommendations for Team Kimi

1. **Start with CRITICAL-1 and CRITICAL-2 before writing any code.** Define the access control model as a design document, get owner sign-off, THEN implement. The schema changes (adding `primaryVerticalId` to journal entries, adding `verticalId` to workbench_queue) affect everything downstream.

2. **Update the plan to reflect current state.** OAuth is done. Cloud SQL is done. The sprint starts at Team 1, not Team 0.

3. **Design the UI routing before building components.** The question "how does an EA access MB financials vs MM financials" must be answered in a wireframe before any React code is written. Propose: `/finance/:verticalCode/journal`, `/finance/:verticalCode/workbench`, etc.

4. **Write the `canAccessFinancials(memberId, verticalId, action)` utility FIRST.** Every tRPC procedure in the financial module should call this. It should check: (a) member's role, (b) `vertical_member_access` for that vertical, (c) `vertical_data_policies` for financial data category, (d) `member_permission_overrides` for explicit grants/denials.

5. **The workbench is the make-or-break UX.** 1,284 items on day one is daunting. Design batch operations, smart grouping (by vendor, by date range, by amount pattern), and LLM-assisted suggestions. Without this, the workbench becomes a graveyard.

---

*Review completed August 7, 2026. This document should be shared with Team Kimi alongside the original plan, and the CRITICAL items must be resolved in a pre-sprint design session before any implementation begins.*
