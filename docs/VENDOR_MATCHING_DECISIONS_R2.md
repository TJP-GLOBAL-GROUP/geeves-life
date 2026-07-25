# Vendor Matching Implementation — Round 2 Decisions

> Reference: User's definitive answers to all 7 clarifying questions + audit trail requirement.
> Date: Jul 6, 2026

## Decision Summary

| # | Question | Decision |
|---|---|---|
| 1 | `order_items` expense fields | Keep `isTaxDeductible` + `taxCategory` + `verticalId` + `chartOfAccountId` + `propertyId` at the **item level** on `vendor_order_items`. Also create `expenses` records for the accounting event. |
| 2 | `orders` + `walmart_orders` | Both merge into `vendor_orders`; they're parallel, not parent-child |
| 3 | `financial_accounts` FK migration | Migrate 4 accounts to user-scoped `bank_accounts`, backfill 1,309 FKs |
| 4 | Property-level attribution | Add nullable `propertyId` FK on both `expenses` and `vendor_order_items`; create `properties` table |
| 5 | 272 test verticals | Delete now (after checking for orphaned FKs) |
| 6 | `financial_transactions.vertical` enum | Replace with `verticalId` FK → `verticals.id`, backfill, drop enum |
| 7 | Implementation order | Confirmed. Expenses migration in this pass. |

## Revised Implementation Order (11 steps)

| Step | Action | Audit Requirement |
|------|--------|-------------------|
| **0** | Deploy `audit_log` table + `writeAuditLog()` helper | Foundation — everything depends on this |
| 1 | Deploy `chart_of_accounts` + `vertical_financial_configs` | Log: account creation/modification |
| 2 | Deploy `vendor_accounts` + `vendor_orders` + `vendor_order_items` | Log: vendor account creation, order import |
| 3 | Migrate `orders` (61) + `walmart_orders` (185) → `vendor_orders` | Log: migration event with source/count metadata |
| 4 | Migrate `order_items` (419) → `vendor_order_items` | Log: migration event |
| 5 | Deploy `transaction_matches` | Log: every match/unmatch/override |
| 6 | Deploy enhanced `expenses` table | Log: every categorisation, approval, export |
| 7 | Migrate `financial_accounts` → user-scoped `bank_accounts` | Log: account migration |
| 8 | Replace `financial_transactions.vertical` enum → `verticalId` FK | Log: vertical reassignment |
| 9 | Clean up 272 test verticals | Log: bulk deletion with entity list |
| 10 | Deploy `properties` table + wire `propertyId` FKs | Log: property creation |

## Key Architectural Decisions

### Item-Level Tax Deductibility
Tax deductibility is an item-level attribute. A single order can contain deductible and non-deductible items. QBO handles this at the line-item level.

### Two Tables, Two Purposes
- `vendor_order_items` = **what was purchased** + **how it's classified for tax** (item-level truth)
- `expenses` = **the accounting event** (links item to bank transaction, payment account, approval status, QBO export status)

### Properties Table
Properties (artistes_boutique, morabeza, sunset_studio) are sub-entities of the Bohemian Lodges vertical. Both `expenses` and `vendor_order_items` get a nullable `propertyId` FK.

### Audit Trail — Cardinal Standard
- Append-only table, no UPDATE/DELETE
- Every financial mutation must call writeAuditLog()
- AI actors explicitly identified with confidence scores
- 12-month minimum retention
- Every new module must include audit logging in its Definition of Done
