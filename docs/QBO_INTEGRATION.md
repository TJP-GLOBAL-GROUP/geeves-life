# QBO Integration — QuickBooks Online Sync Architecture

**Status:** Design — approved-for-build pending owner review
**Author:** Kimi (senior full-stack partner)
**Date:** 2026-08-06
**Resumes:** Financial integration project (frozen 2026-07-10, Section 48 migration prep)

---

## 1. Context & Ground Truth (verified 2026-08-06)

The financial integration project paused at the exact boundary between **data model** and **integration**. Verified against the live repo (main @ b376dd1):

**No QBO code exists:**
- No Intuit/QuickBooks SDK in `package.json`
- No QBO router in `server/routers/` (20 routers audited)
- No QBO handler in `server/scheduledHandlers/` (15 handlers audited)
- No QBO env vars in `server/_core/env.ts`
- todo.md lines 2543–2544 ("Square Sync Failed", "QBO Sync Cron Job Failed") refer to alerts whose target was never built in this codebase. Any Cloud Scheduler job pointing at a QBO endpoint is an orphan and must be deleted (see §9).

**QBO-ready schema assets already live (Section 16 / Jul 5 overhaul):**

| Asset | Location | Purpose |
|---|---|---|
| `expenses.qboExportStatus` | enum: pending / exported / failed / not_applicable | Per-expense export lifecycle |
| `expenses.qboExportDate` / `qboTransactionId` | timestamp / varchar(255) | Write-back from QBO |
| `expenses.status` | pending / approved / rejected | **Only `approved` expenses are export-eligible** |
| `chart_of_accounts.qboAccountId` / `qboSyncStatus` | varchar(50) / enum | COA↔QBO account link state |
| `coa_mappings` | table | one_to_one / many_to_one / custom account mapping |
| `vertical_financial_configs` | table | Per-vertical currency/tolerance + QBO connection slot |
| 112 seeded COA accounts, split support (`splitGroupId`), exchange rates | DB | The export payload |

**Conclusion:** greenfield build on a prepared foundation. Nothing to migrate, nothing to unbreak.

---

## 2. Scope

**In scope (this project):**
- QBO OAuth 2.0 connect/disconnect (Intuit Developer app)
- COA mapping: pull QBO accounts, populate `coa_mappings`
- Expense export worker: approved expenses → QBO **Purchase** transactions
- Status write-back + failure classification + retry
- Settings → Integrations UI (connect card + export queue status)

**Explicitly deferred:**
- Revenue sync (property bookings → QBO SalesReceipt/Invoice) — Phase 4 candidate, needs its own design pass (tax remittance semantics differ per platform/jurisdiction; see todo §2054–2127)
- Square sync — separate integration, same orphan-alert status, no code exists
- Two-way sync (QBO → Geeves) — one-way push only for v1
- Bill-pay / payroll / bank feeds — out of scope entirely

---

## 3. Architecture

### 3.1 OAuth Connect Flow — `server/auth/qboOAuth.ts`

Modeled on `googleAccountConnect.ts` (established patterns are mandatory):

- Intuit OAuth 2.0, scope: `com.intuit.quickbooks.accounting` (the only accounting scope Intuit offers — least-privilege rule §13 satisfied by documentation, since no narrower variant exists)
- Mandatory nonce + session binding on `state` (P-14 / H-9 origin allowlist applies to the redirect)
- Token storage: **new table `qbo_connections`** (do NOT overload `oauth_tokens` — that table is Google-routed by `accountEmail`):

| Column | Type | Notes |
|---|---|---|
| id | varchar(36) PK | nanoid |
| householdId | varchar(36) FK | one connection per household per environment |
| realmId | varchar(64) | Intuit company ID |
| environment | enum(sandbox, production) | drives base URL |
| accessToken | text | encrypted at rest (same scheme as oauth_tokens) |
| refreshToken | text | encrypted; **Intuit refresh tokens live 100 days, rolling** |
| refreshTokenExpiresAt | bigint | UTC ms — alert at 7 days remaining |
| accessTokenExpiresAt | bigint | UTC ms (1h lifetime) |
| connectedByMemberId | varchar(36) FK | audit |
| status | enum(active, expired, revoked, error) | drives dashboard health |
| createdAt / updatedAt | timestamp | |

- **Rolling refresh rule:** every token refresh returns a NEW refresh token. Persist it atomically in the same transaction as the access token. Losing a refresh token = full reconnect (P-16-adjacent: silent staleness is the enemy).

### 3.2 QBO API Client — `server/services/qboClient.ts`

- Base URLs: `https://sandbox-quickbooks.api.intuit.com` / `https://quickbooks.api.intuit.com`, path `/v3/company/{realmId}/...`
- `minorversion` pinned (current: 75) in one constant
- Auto-refresh on 401 with **single-flight refresh** (concurrent sync must trigger exactly one refresh call — token refresh race is a known anti-pattern, see calendarWebhook.ts history)
- Typed wrappers only for what we use: `query`, `createPurchase`, `readAccount(list)`, `companyInfo`
- All calls `logAudit()` — category `qbo`, outcomes success/failure/denied

### 3.3 COA Mapping — `server/routers/qbo.ts` (procedures)

- `qbo.getConnectionStatus` — connection health for Settings UI
- `qbo.disconnect` — revoke + mark revoked (GDPR Art. 17 path must also revoke, per playbook precedent)
- `qbo.listQboAccounts` — pull QBO Chart of Accounts (for mapping UI)
- `qbo.upsertCoaMapping` — write `coa_mappings` rows (admin/EA only, reuse `requireExpenseAccess()` guard)
- `qbo.getExportQueue` — counts by qboExportStatus for the UI

### 3.4 Export Worker — `server/scheduledHandlers/qboSync.ts`

Modeled directly on `shadowBlockSyncRetry.ts` (the pattern proven in production today):

- Registered as `POST /api/scheduled/qbo-sync` in `server/_core/index.ts`
- Auth: `x-cron-secret` header === `ENV.systemCronSecret`, localhost bypass — identical contract
- Cloud Scheduler job: every 15 min (expense volume is low; no need for 2-min cadence)
- Batch: 50 expenses/run, `WHERE status='approved' AND qboExportStatus='pending'`
- Per expense: resolve `coa_mappings` → QBO AccountRef; resolve `bank_accounts` → QBO payment AccountRef; build Purchase entity (PaymentType: Cash/CreditCard by account type); POST
- **Write-back (P-16 cardinal rule):** only a QBO 2xx with a returned entity `Id` sets `qboExportStatus='exported'` + `qboTransactionId`. Any other outcome = `failed` + error text. No silent success, ever.
- Error classification (mirrors sync-retry handler):
  - 401/token-expired → mark connection `error`, notify owner, do NOT burn expense retry
  - 400 validation (bad mapping) → `failed`, surface in UI with the mapping that needs fixing
  - 429/5xx → leave `pending`, exponential backoff
  - Unmapped COA → skip, count as `unmapped` in response, do not mark failed
- Response shape: `{ processed, exported, failed, skippedUnmapped, elapsed }`

### 3.5 UI

- Settings → Integrations: "QuickBooks Online" card — Connect/Disconnect, environment badge (Sandbox/Production), realm company name, token health (mirrors the Google account health banner patterns)
- Expenses page: export status chip per expense (Pending/Exported/Failed), filter, "Retry failed" bulk action (admin/EA)
- No new nav item; both surfaces extend existing pages

---

## 4. Environment & Secrets

New env vars (via Secret Manager, same pattern as existing):

| Env var | Secret name (GCP) | Notes |
|---|---|---|
| `QBO_CLIENT_ID` | `geeves-qbo-client-id` | From Intuit Developer app |
| `QBO_CLIENT_SECRET` | `geeves-qbo-client-secret` | Never logged |
| `QBO_ENVIRONMENT` | plain env | `sandbox` until Phase 5 cutover |
| `QBO_REDIRECT_URI` | plain env | `https://beta.geeves.life/api/auth/qbo/callback` |

`env.ts` additions follow existing style. **Beta and live get separate connections** — same secret names, per-service values, matching the current cron-secret pattern.

---

## 5. Governance & Compliance Hooks

- **Audit:** `qbo.connect`, `qbo.disconnect`, `qbo.export.success`, `qbo.export.failure` in `audit_log` (actorType=user|system, metadata includes realmId + counts, never tokens)
- **Data classification:** QBO connection status and export queue are `financial` category — `stripByPolicy()` applies to any qbo router response visible to restricted members (Cary model)
- **Access:** all qbo procedures behind `requireExpenseAccess()` (household_admin or ea)
- **P-16 / P-12:** write-back only on verified 2xx; guard applied to ALL export paths including any future bulk/replay path
- **ENGINEERING_LESSONS:** new candidate pattern to document after build — "Rolling Refresh Token Loss" if the single-flight + atomic persist design changes

---

## 6. Testing Plan

- vitest: qboClient (refresh single-flight, minorversion pinning, error mapping), qboSync handler (batching, classification, write-back, unmapped skip), qboOAuth (nonce, state binding, origin allowlist)
- Target: matches current suite health (289+ tests passing, `tsc --noEmit` clean) before merge
- Real-world (DESIGN_PRINCIPLES §12): sandbox company end-to-end — connect, map 3 accounts, export 5 real expenses, verify in QBO sandbox UI, disconnect, verify revoked status + banner

---

## 7. Rollout Phases

| Phase | Deliverable | Gate |
|---|---|---|
| 0 | This doc + Intuit Developer app + sandbox company (owner action) | Doc approved |
| 1 | `qbo_connections` table, OAuth connect/callback, Settings card | Connect/disconnect works on beta, sandbox |
| 2 | COA pull + mapping UI + `coa_mappings` populated | 112 COA accounts mapped or explicitly skipped |
| 3 | Export worker + scheduler + status chips + retry | 5-expense sandbox export verified in QBO UI |
| 4 | (Separate design) Revenue sync from property_bookings | Phase 3 stable 2 weeks |
| 5 | Production cutover: `QBO_ENVIRONMENT=production`, production Intuit app keys, live company connect | Owner sign-off + tax-prep dry run |

---

## 8. Open Decisions (owner)

1. **Intuit app ownership:** app must live under an Intuit account the business controls (not a personal throwaway)
2. **Multi-vertical posting:** v1 posts all expenses to ONE QBO company using Class/Location per vertical — confirm QBO plan includes Classes (Plus+), else mapping falls back to account-level only
3. **Historical export:** after Phase 3, one-time backfill export of already-approved historical expenses? (Recommend: yes, batched 50/run, but owner chooses cutoff date)

---

## 9. Housekeeping Tied to This Project

- `gcloud scheduler jobs list --project=geeves-495802` — find and delete any orphan job pointing at `/api/scheduled/qbo-sync` or Square endpoints (source of the "Sync Failed" alerts; the endpoints never existed)
- todo.md 2543–2544: update once orphans confirmed dead

---

*Built on: Section 16 schema stack, Jul 5 Property Financial Overhaul, Section 18 QBO-compatibility design (6-phase migration + dual-write), shadowBlockSyncRetry production pattern (Aug 6, 2026 — engine live on geeves-beta-00039-sgl).*
