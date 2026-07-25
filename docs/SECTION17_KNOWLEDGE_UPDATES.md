# Section 17 Knowledge Updates for AI_MEMORY.md

These entries need to be inserted into the project_knowledge DB table so the next heartbeat regenerates AI_MEMORY.md with them.

## New Tables Deployed (Section 16-17)

### 1. chart_of_accounts
- Per-vertical QBO-compatible chart of accounts
- 21 columns, nanoid PK
- Hierarchy: accountType → detailType → accountName
- QBO sync fields: qboAccountId, qboFullyQualifiedName, qboSyncStatus, lastSyncedAt
- Unique constraint: per vertical/account name

### 2. vertical_financial_configs
- 1:1 with verticals — every vertical has exactly one financial config
- Stores: currency, reconciliation tolerances, QBO connection, tax config, match strategy
- Seeded for all 6 canonical verticals

### 3. vendor_accounts
- Represents external vendors (Amazon, Walmart, Uber, etc.)
- 14 vendors seeded
- Fields: platform, displayName, websiteUrl, matchPatterns (JSON for bank description matching)

### 4. vendor_orders
- Unified order table replacing orders + walmart_orders
- 25 columns with legacyOrderId + legacyWalmartOrderId backlinks
- 424 rows migrated (239 from orders + 185 from walmart_orders)

### 5. vendor_order_items
- Line items with item-level tax fields
- 26 columns including verticalId, propertyId, chartOfAccountId
- 419 rows migrated from order_items

### 6. transaction_matches
- Links bank transactions to vendor orders
- 14 columns, 5 indexes
- matchMethod: auto_exact, auto_fuzzy, manual, ai_proposed

### 7. expenses
- The accounting event record (35 columns, 9 indexes)
- Approval workflow: draft → pending_approval → approved → exported
- QBO export tracking: qboDocId, qboExportedAt, qboExportBatchId
- **Split pattern (Addendum)**: splitGroupId, splitAmount, splitSequence for cross-vertical + cross-property allocation
- Key rules: splitGroupId groups rows of one logical expense; each row has own verticalId + propertyId; splitAmounts must sum to original transaction amount

### 8. notifications
- Household-scoped notification system
- Types: info, warning, success, error, action_required
- Channels: in_app, email, push
- Read/dismissed tracking per notification

## New Procedures (Section 17)

### household.removeMember
- Admin-only, full cascade + audit
- Prevents self-removal (use leaveHousehold instead)
- Prevents admin-on-admin removal (must demote first)
- Cascade: revoke tokens, remove access, cancel pending requests, soft-delete member

### household.leaveHousehold
- Member-initiated, same cascade
- Prevents last-admin departure (must transfer role first)

### properties.getDeleteImpact
- Returns cascade scope counts before deletion confirmation
- Counts: bookings, platforms, prepRules, devices, emailJobs

## New Components (Section 17)

### PropertyAllocationPicker
- Multi-vertical, multi-property expense split component
- Dollar/percentage entry mode toggle
- Even-split helper
- Balance indicator (green when balanced, amber when not)
- Per-row: vertical selector + property selector (only shown if vertical has properties)
- Queries verticals and properties from tRPC

## Bug Fixes Applied

- C-03: bookingEmailScraper date parsing — last-resort path re-normalises to UTC midnight
- H-01: Properties upcoming widget — utcDateStr() helper, timeZone:UTC on all date displays
- H-05: security.ts data export/delete — replaced ctx.user.memberId with db lookup
- M-01: Booking request notification badge on sidebar + notifyOwner on create
- M-04: getDeleteImpact procedure for property deletion confirmation
- M-05: notifyOwner on booking request approve/decline
- M-06: Enhanced empty state for FamilyView booking requests

## Deprecated Tables (Updated)

- `orders` (61 rows) → migrated to vendor_orders, DEPRECATED
- `order_items` (419 rows) → migrated to vendor_order_items, DEPRECATED
- `walmart_orders` (185 rows, raw SQL) → migrated to vendor_orders, DEPRECATED
- `walmart_order_categorizations` (3 rows) → absorbed into new model, DEPRECATED
- `financial_accounts` (4 rows) → migrated to bank_accounts, DEPRECATED
- `transactions` (0 rows) → dead, DEPRECATED

## Architecture Updates

### Expense Split Pattern (Cross-Vertical + Cross-Property)
- A single expense can be split across verticals AND properties simultaneously
- splitGroupId groups ALL rows representing one logical expense
- Each row has own verticalId (splits are cross-vertical)
- Each row has own propertyId (nullable)
- splitAmount values across group MUST sum to original transaction amount
- QBO export: group by splitGroupId → sub-group by verticalId → export to respective QBO company

### Cardinal Audit Standard
- All mutating tRPC procedures must call writeAuditLog() before returning success
- audit_log is append-only (no UPDATE/DELETE at application level)
- AI actors: actorType = 'geeves_ai' with confidence scores in metadata
- Financial mutations require previousValue + newValue JSON snapshots
- 12-month minimum retention
- Enhanced columns: actorType (enum: user/system/geeves_ai/heartbeat/migration), verticalId, previousValue, newValue
