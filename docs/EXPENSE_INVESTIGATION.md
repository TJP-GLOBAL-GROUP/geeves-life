# Expense Investigation — Jul 5, 2026

## Key Findings

1. **property_expense_records is NOT empty** — it has **258 rows** (the earlier session's finding was incorrect)
2. All 258 expense records are for **artistes_boutique** (Jamaica property only)
3. Source: 252 from `spreadsheet_import`, 6 from `manual`
4. Years covered: 2022 (1), 2023 (159), 2024 (94), 2025 (4) — no 2025/2026 data yet
5. All amounts are in **JMD** (Jamaican dollars)
6. **No expenses for Sunset Studio or Morabeza** — those still need importing

## Categories

| Category | Count | Total JMD |
|----------|-------|-----------|
| UTILITIES | 71 | 3,226,533 |
| FIXTURES AND FITTINGS | 55 | 366,759 |
| CLEANING FEE | 51 | 757,996 |
| MAINTENANCE | 49 | 1,802,117 |
| CLEANING SUPPLIES | 11 | 221,247 |
| REPAIR COST | 10 | 190,421 |
| ASSETS: EQUIPMENT | 4 | 548,969 |
| MAINTENANCE SUPPLIES | 2 | 5,772 |
| ASSETS: FURNITURE | 2 | 129,340 |
| VEHICLE EXPENSE | 1 | 17,900 |
| ADMINISTRATIVE EXPENSE | 1 | 5,600 |
| VEHICLE REPAIR COST | 1 | 3,500 |

## Commission Status

- **property_bookings.commissionAmount**: 257 bookings have commission data, total: $15,967.77
- **airbnb_payout_records.serviceFee**: column exists (from Airbnb payout export)
- Commissions are NOT double-counted as expenses — they're on the booking records

## Existing Columns

- `property_expense_records.supportingDocUrl` — exists but all NULL (never populated)
- `property_expense_records.documentId` — exists (for linking to uploaded docs)
- `property_expense_records.source` — exists (spreadsheet_import / manual)
- `property_bookings.cleaningFee` — already exists!
- **No sourceDocUrl or proofOfPaymentUrl on property_bookings** — need to add

## Action Items

1. ~~Add sourceDocUrl to property_expense_records~~ → already has `supportingDocUrl` (can reuse)
2. Add `sourceDocUrl` to property_bookings (for the spreadsheet "Source Doc Link" column)
3. Add `proofOfPaymentUrl` to property_bookings
4. Add `proofOfPaymentUrl` to property_expense_records (separate from supportingDocUrl)
5. Import Sunset Studio and Morabeza expenses from spreadsheet expense tabs
6. Import 2025-2026 Artiste's Boutique expenses from spreadsheet
