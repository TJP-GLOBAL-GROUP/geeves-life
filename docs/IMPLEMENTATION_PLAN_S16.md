# Section 16 Implementation Plan — Full Reference

> Source: DEV_TASK_RESPONSE_ROUND_2.md (user's directive)
> Date: Jul 6, 2026

## Current State Summary

### Tables to Keep/Modify
- `financial_transactions` (1,309 rows) — add: matchStatus, vendorAccountId, bankDescriptionRaw, paymentMethodLast4, verticalId FK
- `bank_accounts` (0 rows) — add: cardLast4, cardNetwork; receive 4 migrated accounts from financial_accounts
- `audit_log` — ALREADY EXISTS (bigint PK, actorUserId, actorOpenId, actorEmail, actorName, householdId, action, category, resourceType, resourceId, outcome, metadata, ipAddress, userAgent, createdAt)
- `verticals` (6 canonical in household V8lk3KJatvxBTWURf4uo9)

### Tables to Create
1. `chart_of_accounts` — per-vertical QBO-compatible COA (nanoid PK)
2. `vertical_financial_configs` — per-vertical financial settings (nanoid PK)
3. `vendor_accounts` — Amazon, Walmart, etc. (nanoid PK)
4. `vendor_orders` — unified order table (nanoid PK)
5. `vendor_order_items` — line items with item-level tax fields (nanoid PK)
6. `properties` — sub-entities of Bohemian Lodges (nanoid PK)
7. `transaction_matches` — links bank txns to vendor orders
8. `expenses` — the accounting event record

### Tables to Deprecate
- `transactions` (0 rows) — dead
- `financial_accounts` (4 rows) — migrate to bank_accounts
- `orders` (61 rows) — migrate to vendor_orders
- `order_items` (419 rows) — migrate to vendor_order_items
- `walmart_orders` (185 rows, raw SQL) — migrate to vendor_orders
- `walmart_order_categorizations` (3 rows) — absorbed into new model

### Canonical Verticals
| ID | Name |
|---|---|
| tjpfam-vert-bakery | Maxfield Bakery |
| tjpfam-vert-market | Maxfield Market |
| c3pW-Cxhm9WAQZ17pTMb3 | Bohemian Lodges |
| tjpfam-vert-home | Home & Family |
| tjpfam-vert-self | Personal |
| tjpfam-vert-start | StartOut |

Household ID: V8lk3KJatvxBTWURf4uo9

## Step 0: Audit Log Enhancement

The existing audit_log table needs to be enhanced to match the Cardinal Standard:

### Current schema (already deployed):
```
id: bigint autoincrement PK
actorUserId: int
actorOpenId: varchar(64)
actorEmail: varchar(320)
actorName: varchar(255)
householdId: varchar(36)
action: varchar(128)
category: varchar(64)
resourceType: varchar(64)
resourceId: varchar(128)
outcome: enum('success','failure','denied')
metadata: json
ipAddress: varchar(64)
userAgent: text
createdAt: timestamp
```

### Required additions (from Cardinal Standard):
```
actorType: enum('user','system','geeves_ai','scheduled_job') — MISSING
entityType: varchar(50) — maps to existing resourceType
entityId: varchar(50) — maps to existing resourceId
verticalId: varchar(21) — MISSING (which vertical was affected)
previousValue: text — MISSING (JSON snapshot before)
newValue: text — MISSING (JSON snapshot after)
```

### Decision: The existing table already covers most needs. We need to ADD:
- `actorType` enum column
- `verticalId` varchar column
- `previousValue` text column
- `newValue` text column

The existing `resourceType`/`resourceId` already serve as `entityType`/`entityId`.
The existing `metadata` JSON can store additional context.

## Step 1: chart_of_accounts Schema (from user's PDF)

```typescript
export const chartOfAccounts = mysqlTable('chart_of_accounts', {
  id: varchar('id', { length: 21 }).primaryKey(), // nanoid
  verticalId: varchar('vertical_id', { length: 21 }).notNull(),
  householdId: varchar('household_id', { length: 21 }).notNull(),
  accountType: mysqlEnum('account_type', [
    'income', 'cost_of_goods_sold', 'expense', 'other_expense',
    'other_income', 'asset', 'liability', 'equity',
    'accounts_receivable', 'accounts_payable', 'bank', 'credit_card',
  ]).notNull(),
  detailType: varchar('detail_type', { length: 100 }).notNull(),
  accountName: varchar('account_name', { length: 200 }).notNull(),
  accountNumber: varchar('account_number', { length: 20 }),
  description: varchar('description', { length: 500 }),
  parentAccountId: varchar('parent_account_id', { length: 21 }),
  displayOrder: int('display_order').default(0),
  qboAccountId: varchar('qbo_account_id', { length: 50 }),
  qboFullyQualifiedName: varchar('qbo_fully_qualified_name', { length: 300 }),
  qboSyncStatus: mysqlEnum('qbo_sync_status', [
    'synced', 'pending_create', 'pending_map', 'geeves_only', 'deprecated',
  ]).default('geeves_only'),
  lastSyncedAt: bigint('last_synced_at', { mode: 'number' }),
  isActive: boolean('is_active').default(true),
  isDefault: boolean('is_default').default(false),
  isSystemAccount: boolean('is_system_account').default(false),
  isTaxRelevant: boolean('is_tax_relevant').default(false),
  taxFormLine: varchar('tax_form_line', { length: 50 }),
  taxJurisdiction: mysqlEnum('tax_jurisdiction', ['us_federal', 'us_state', 'jamaica']),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
  createdBy: varchar('created_by', { length: 21 }),
}, (table) => ({
  verticalIdx: index('coa_vertical_idx').on(table.verticalId),
  householdVerticalIdx: index('coa_household_vertical_idx').on(table.householdId, table.verticalId),
  accountTypeIdx: index('coa_account_type_idx').on(table.verticalId, table.accountType),
  qboAccountIdx: index('coa_qbo_account_idx').on(table.qboAccountId),
  uniqueNamePerVertical: uniqueIndex('coa_unique_name').on(table.verticalId, table.accountName),
}));
```

## Step 1: vertical_financial_configs Schema (from user's PDF)

```typescript
export const verticalFinancialConfigs = mysqlTable('vertical_financial_configs', {
  id: varchar('id', { length: 21 }).primaryKey(), // nanoid
  verticalId: varchar('vertical_id', { length: 21 }).notNull().unique(),
  householdId: varchar('household_id', { length: 21 }).notNull(),
  defaultCurrency: varchar('default_currency', { length: 3 }).notNull().default('USD'),
  supportedCurrencies: varchar('supported_currencies', { length: 50 }).default('USD'),
  exchangeRateToUsd: decimal('exchange_rate_to_usd', { precision: 12, scale: 6 }),
  exchangeRateLastUpdated: bigint('exchange_rate_last_updated', { mode: 'number' }),
  exchangeRateSource: varchar('exchange_rate_source', { length: 50 }).default('manual'),
  reconciliationToleranceAbs: decimal('reconciliation_tolerance_abs', { precision: 10, scale: 2 }).default('1.00'),
  reconciliationTolerancePct: decimal('reconciliation_tolerance_pct', { precision: 5, scale: 2 }).default('2.00'),
  dateWindowDays: int('date_window_days').default(7),
  autoMatchMinConfidence: decimal('auto_match_min_confidence', { precision: 5, scale: 2 }).default('0.85'),
  proposalMinConfidence: decimal('proposal_min_confidence', { precision: 5, scale: 2 }).default('0.60'),
  qboRealmId: varchar('qbo_realm_id', { length: 50 }),
  qboCompanyName: varchar('qbo_company_name', { length: 200 }),
  qboSyncEnabled: boolean('qbo_sync_enabled').default(false),
  qboLastSyncAt: bigint('qbo_last_sync_at', { mode: 'number' }),
  qboSyncDirection: mysqlEnum('qbo_sync_direction', [
    'geeves_to_qbo', 'qbo_to_geeves', 'bidirectional',
  ]).default('geeves_to_qbo'),
  qboDefaultClassId: varchar('qbo_default_class_id', { length: 50 }),
  qboDefaultClassName: varchar('qbo_default_class_name', { length: 100 }),
  exportFormat: mysqlEnum('export_format', ['api', 'iif', 'csv', 'qbo_web_connector']).default('api'),
  exportApprovalRequired: boolean('export_approval_required').default(true),
  exportBatchSize: int('export_batch_size').default(50),
  taxJurisdiction: mysqlEnum('tax_jurisdiction', ['us_federal', 'us_state_ny', 'us_state_ca', 'jamaica']),
  taxEntityType: mysqlEnum('tax_entity_type', ['sole_proprietor', 'llc_single', 'llc_multi', 'corporation', 'partnership', 'personal']),
  taxFormType: varchar('tax_form_type', { length: 20 }),
  fiscalYearEnd: varchar('fiscal_year_end', { length: 5 }).default('12-31'),
  accountingMethod: mysqlEnum('accounting_method', ['cash', 'accrual']).default('cash'),
  defaultVendorMatchStrategy: mysqlEnum('default_vendor_match_strategy', [
    'strict', 'moderate', 'manual',
  ]).default('strict'),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
}, (table) => ({
  verticalIdx: index('vfc_vertical_idx').on(table.verticalId),
  householdIdx: index('vfc_household_idx').on(table.householdId),
  qboRealmIdx: index('vfc_qbo_realm_idx').on(table.qboRealmId),
}));
```

## Step 2: vendor_order_items Additional Columns (from Round 2)

Beyond the original design doc, add these item-level fields:
```typescript
chartOfAccountId: varchar('chart_of_account_id', { length: 21 }), // FK → chart_of_accounts.id
verticalId: varchar('vertical_id', { length: 21 }),               // FK → verticals.id
propertyId: varchar('property_id', { length: 21 }),               // FK → properties.id (nullable)
isTaxDeductible: boolean('is_tax_deductible').default(false),
taxCategory: varchar('tax_category', { length: 100 }),
taxFormLine: varchar('tax_form_line', { length: 50 }),
```

## Step 2: properties Table Schema (from Round 2)

```typescript
export const properties = mysqlTable('properties', {
  id: varchar('id', { length: 21 }).primaryKey(),
  verticalId: varchar('vertical_id', { length: 21 }).notNull(),
  householdId: varchar('household_id', { length: 21 }).notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  slug: varchar('slug', { length: 50 }).notNull(),
  address: varchar('address', { length: 300 }),
  qboLocationId: varchar('qbo_location_id', { length: 50 }),
  qboSubClassName: varchar('qbo_sub_class_name', { length: 100 }),
  isActive: boolean('is_active').default(true),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
});
```

## Vertical-to-QBO Seed Data

| Vertical | QBO Company | Tax Form | Entity Type | Currency |
|---|---|---|---|---|
| Maxfield Bakery | Maxfield Bakery | Schedule C | sole_proprietor | USD |
| Maxfield Market | Maxfield Market Global LLC | 1065 | llc_multi | USD |
| Bohemian Lodges | Maxfield Market Global LLC | Schedule E | llc_multi | USD,JMD |
| Home & Family | — (Geeves only) | 1040 | personal | USD,JMD |
| Personal | — (Geeves only) | 1040 | personal | USD |
| StartOut | — (Geeves only) | W-2 | personal | USD |

## Migration Mapping: financial_transactions.vertical enum → verticalId

```
'personal' → tjpfam-vert-self
'artistes_boutique' → c3pW-Cxhm9WAQZ17pTMb3 (Bohemian Lodges)
'morabeza' → c3pW-Cxhm9WAQZ17pTMb3 (Bohemian Lodges)
'sunset_studio' → c3pW-Cxhm9WAQZ17pTMb3 (Bohemian Lodges)
'maxfield_bakery' → tjpfam-vert-bakery
'multi' → null (needs manual review)
'unclassified' → null
```

## Properties Seed Data (Bohemian Lodges sub-entities)

| slug | name | verticalId |
|---|---|---|
| artistes_boutique | Artistes Boutique | c3pW-Cxhm9WAQZ17pTMb3 |
| morabeza | Morabeza | c3pW-Cxhm9WAQZ17pTMb3 |
| sunset_studio | Sunset Studio | c3pW-Cxhm9WAQZ17pTMb3 |

## Vendor Accounts Seed Data

Amazon, Walmart, Uber, Google, Apple, PayPal, Lowe's, Target, Home Depot, Shopify
