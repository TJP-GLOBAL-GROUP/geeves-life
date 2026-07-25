# Migration Notes — Section 31 Categorization Tool Migration

## Current State (Jul 8, 2026)

### Completed
1. **Chart of Accounts seeded**: 112 accounts across 6 verticals
2. **Walmart migration**: All 185 walmart_orders linked to existing vendor_orders (via legacyWalmartOrderId)
3. **Expenses created**: 6 expense rows from the 7 categorizations (1 skipped due to null category)
4. **Router rewritten**: expenseCategorisation.ts now reads from vendor_orders, writes to expenses, uses chart_of_accounts

### Key Schema Facts
- `vendor_orders` columns use suffixes: `platform_vo`, `status_vo`, `currency_vo`, `importSource_vo`, `createdAt_vo`, `updatedAt_vo`
- `vendor_order_items` columns: `currency_voi`, `verticalId_voi`, `propertyId_voi`, `isTaxDeductible_voi`, `taxFormLine_voi`, `aiConfidence_voi`, `isManualOverride_voi`, `deliveryAddress_voi`, `tags_voi`, `createdAt_voi`, `updatedAt_voi`
- `expenses` columns: `verticalId_exp`, `propertyId_exp`, `chartOfAccountId_exp`, `vendorOrderId_exp`, `financialTransactionId_exp`, `currency_exp`, `description_exp`, `paymentMethod_exp`, `vendorName_exp`, `isTaxDeductible_exp`, `taxCategory_exp`, `taxFormLine_exp`, `receiptUrl_exp`, `source_exp`, `aiConfidence_exp`, `isManualOverride_exp`, `notes_exp`, `createdAt_exp`, `updatedAt_exp`, `createdBy_exp`
- `chart_of_accounts` columns: `id`, `verticalId`, `householdId`, `accountType`, `detailType`, `accountName`, `accountNumber`, `description`, `parentAccountId`, `displayOrder`, `isActive`, `isDefault`, `isSystemAccount`, `isTaxRelevant`, `taxFormLine`, `taxJurisdiction`, `createdAt`, `updatedAt`, `createdBy`

### Verticals
- `tjpfam-vert-home` → Home & Family
- `tjpfam-vert-bakery` → Maxfield Bakery
- `tjpfam-vert-market` → Maxfield Market
- `tjpfam-vert-self` → Personal
- `tjpfam-vert-startout` → StartOut
- `c3pW-Cxhm9WAQZ17pTMb3` → Bohemian Lodges

### Data Counts
- `vendor_orders`: 424 total (293 walmart, 128 amazon, 2 wayfair, 1 home_depot)
- `vendor_order_items`: 419
- `expenses`: 6 (from migration)
- `chart_of_accounts`: 112
- `walmart_orders`: 185 (to be dropped)
- `walmart_order_categorizations`: 7 (to be dropped)
- `bank_accounts`: 4 (Scotia Chequing, Scotia Gold MC, Scotia Aero Plat MC, Airbnb Savings)
- `vendor_accounts`: 10+ (Walmart=GEF7Vzw1_jDc1lmsRKfNS, Amazon=1xodoVrwoqtTF1GfMUyQc, etc.)

### Remaining Tasks
1. **Update UI** (ExpenseCategorisation.tsx) to use new router shape (COA dropdown instead of free-text)
2. **Fix Amazon import script** — currently uses old column names (`platform` instead of `platform_vo`)
3. **Test categorization end-to-end** for both Walmart and Amazon orders
4. **Drop legacy tables**: walmart_orders, walmart_order_categorizations
5. **Morabeza booking investigation** — user's 3-night booking (Jul 10-13 Thu-Sun) not showing
6. **Shadow block propagation audit** — was at 11%, check progress and speed up

### UI Changes Needed
The ExpenseCategorisation.tsx currently:
- Uses `config.categories[categoryKey]` (hardcoded string arrays)
- Needs to switch to `config.categoriesByVertical[verticalId]` (COA objects with id, name, accountNumber)
- The `categorize` mutation now takes `chartOfAccountId` instead of `category`/`customCategory`/`verticalName`
- The `categorizeSplit` mutation splits now take `chartOfAccountId` instead of `category`/`customCategory`/`verticalName`
- `getConfig` now returns `{ verticals, categoriesByVertical, properties }` instead of `{ verticals, categories, properties }`

### Properties table
- Need to check if `properties` table exists for the getConfig query
