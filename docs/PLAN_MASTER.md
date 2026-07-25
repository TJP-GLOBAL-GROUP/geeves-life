# Geeves.Life Master Implementation Plan
## Three Components: Expense Review + Codebase Revision + Governance Redesign

---

## COMPONENT 1: Expense Categorization Deep Code Review
**Goal:** Comprehensive review of the expense categorization tool from DB to frontend, identifying all gaps preventing it from achieving audit-ready QBO integration.

**Key Files Analyzed:**
- expenseCategorisation.ts (642 lines) — tRPC router
- ExpenseCategorisation.tsx (1000+ lines) — Frontend
- Expenses.tsx (360 lines) — Manual expense tracker
- invoiceExtraction.ts (443 lines) — Chrome extension + LLM extraction
- vendor-matching.test.ts (226 lines) — Schema tests
- superAdmin.ts (428 lines) — Admin router
- schema.ts — chart_of_accounts, expenses, vendor_orders, invoice_extractions tables

**Major Issues Identified:**
1. Two separate expense systems (transactions vs expenses tables) — no unification
2. No OCR receipt capture for manual expense creation
3. Hardcoded EXPENSE_CATEGORIES in Expenses.tsx — should use chart_of_accounts
4. Chrome extension workflow is fragile (extension detection, message passing)
5. No bulk categorization capability
6. No auto-suggest from vendor categorization history
7. QBO fields exist but no actual sync code
8. Skip mechanism uses notes [skipped] — hacky
9. Missing audit trail for categorization decisions
10. Invoice extraction is vendor-order-only, not general receipt

---

## COMPONENT 2: Comprehensive Codebase Revision
**Goal:** Implement all shadow block fixes (concessions + prevailing pushbacks) + governance redesign

### 2A: Shadow Block Fixes (Revised Priority)
- Surgical fixes first (Week 1): loud errors, DB constraints, batch queries
- Feature-flagged rewrites second (Week 2): distributed lock, eventPropagation v2
- Outbox pattern deferred to Month 2+
- Webhook HMAC validation — prevailing on 10% rejection
- Origin allowlist — prevailing as defense-in-depth

### 2B: Governance Redesign — Active Guardian
Replace librarian model with enforcement model:
- Active guardrails layer (DB constraints enforce documented rules)
- Code-vs-docs verification in heartbeat
- Per-concern AI_MEMORY files
- Escalating health check (auto-create tasks, escalate after N days)
- Super-admin dashboard as primary communication channel

### 2C: Super-Admin Guardian Integration
- Guardian dashboard panel in SuperAdmin.tsx
- Automated issue flagging with severity + implications
- Development blocking gates for critical issues
- User-facing explanation of each concern with fix plan

---

## COMPONENT 3: Unified Expense Tool Redesign
**Goal:** Merge expense creation + categorization into cohesive tool with OCR receipt capture

### 3A: Unified Expense Schema
- Single expense entry point (receipt OCR + manual + vendor order)
- Common expense table with all QBO-ready fields
- Receipt image storage with S3 linkage
- OCR pipeline for receipt extraction

### 3B: Snap Receipt → Auto-Fill Flow
1. User snaps photo of receipt
2. OCR extracts: vendor, date, amount, items, tax, payment method
3. Auto-match vendor from vendor_accounts
4. Suggest COA from vendor history + item descriptions
5. Pre-fill all categorization fields
6. User reviews and confirms

### 3C: Unified Frontend
- Single Expenses page with three entry modes: Receipt (OCR), Manual, Vendor Order
- Auto-suggest from history
- Bulk categorization
- Proper audit trail
- QBO export ready

---

## Implementation Tracks (Parallel)
Track A: Expense Review Report (Component 1) — 1 writer
Track B: Shadow Block Surgical Fixes (Component 2A) — 1 implementer  
Track C: Governance Redesign (Component 2B+2C) — 1 implementer
Track D: Unified Expense Tool (Component 3) — 1 implementer

## Deliverables
- geeves_expense_review.docx — Deep review report
- geeves_comprehensive_revision.zip — All code changes
  - track_shadowblock/ — Surgical fixes + feature-flagged rewrites
  - track_governance/ — Active guardian architecture
  - track_expense/ — Unified expense tool
  - HANDOVER.md — Complete deployment guide
