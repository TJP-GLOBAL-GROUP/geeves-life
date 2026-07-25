# Expense Schema Comparison: Database vs. Spreadsheet

**Date:** July 5, 2026  
**Purpose:** Explain why the reconciliation report said "$0 expenses in DB" and provide a field-by-field comparison.

---

## Root Cause: Why the Reconciliation Reported $0

The reconciliation script (`scripts/full-reconciliation.ts`) had **two bugs** that caused it to report zero expenses:

### Bug 1: Wrong date filter type

The script filters expenses using:
```sql
WHERE expenseDate >= ? AND expenseDate < ?
```
with `startMs` and `endMs` as **Unix milliseconds** (bigint). But `property_expense_records.expenseDate` is a **TIMESTAMP** column, not a bigint. The comparison `TIMESTAMP >= 1704067200000` would never match any rows because MySQL interprets the bigint as a nonsensical date far in the future.

- `property_bookings.checkIn` → **bigint** (Unix ms) ✓ works with startMs/endMs
- `property_expense_records.expenseDate` → **TIMESTAMP** ✗ fails with Unix ms comparison

### Bug 2: Summing amountUSD (which is NULL for all rows)

The script sums `amountUSD`:
```sql
SUM(amountUSD) as totalAmount
```
But **all 258 expense rows have `amountUSD = NULL`**. The amounts are stored in `amountJMD` only. Even if the date filter worked, `SUM(NULL)` returns NULL, which gets coerced to `$0.00`.

### Summary

The data WAS in the correct location (`property_expense_records`). The reconciliation script simply couldn't see it due to a type mismatch on the date filter and summing the wrong currency column.

---

## Field-by-Field Schema Comparison

### Spreadsheet Expense Columns (from "2026 Expenses (Detail)" tab)

| Position | Spreadsheet Column | Example Value |
|----------|-------------------|---------------|
| A | Date | 2026-01-01 |
| B | Type | Contractor Payment |
| C | Paid To | RACQUEL STEER |
| D | Description | (empty or booking ref) |
| E | Category | cleaning |
| F | Amount | $225.00 |
| G | Property | Morabeza |
| H | Reference | (booking confirmation #) |
| I | Payment Platform | Zelle |
| J | Source Documentation | (URL or description) |
| K | Proof of Payment (TXN ID) | BOA-20260102-005 |
| L | Currency | (USD implied) |

### Database Schema (`property_expense_records`)

| Column | Type | Maps to Spreadsheet | Notes |
|--------|------|--------------------|----|
| id | int (PK, auto) | — | Internal |
| householdId | varchar(36) | — | Multi-tenant |
| **property** | enum(17) | **G: Property** | ⚠️ Only `artistes_boutique` populated; Sunset Studio/Morabeza missing |
| **expenseDate** | timestamp | **A: Date** | ⚠️ TIMESTAMP type vs bigint in bookings — caused the reconciliation bug |
| expenseYear | int | derived from A | Redundant but indexed for fast filtering |
| expenseMonth | int | derived from A | Redundant |
| **expenseDescription** | varchar(500) | **D: Description** | |
| **category** | varchar(100) | **E: Category** | DB uses UPPERCASE (e.g. "CLEANING FEE"), spreadsheet uses lowercase (e.g. "cleaning") |
| **amountJMD** | decimal(14,2) | — | ⚠️ All 258 rows are JMD only; spreadsheet uses USD |
| **amountUSD** | decimal(14,2) | **F: Amount** | ⚠️ NULL for all rows — never populated |
| exchangeRateUsed | decimal(10,4) | — | Never populated |
| **paidTo** | varchar(255) | **C: Paid To** | |
| **paidFrom** | varchar(100) | — | Who paid (e.g. "TARIK") — not in spreadsheet |
| bankTransactionId | int | — | FK to bank transaction (never populated) |
| documentId | int | — | FK to financial_documents (never populated) |
| **supportingDocUrl** | text | **J: Source Documentation** | Some rows have S3 URLs |
| **proofOfPaymentUrl** | varchar(1000) | **K: Proof of Payment** | ⚠️ NEW column (added today) — not yet populated |
| notes | text | — | |
| isReconciled | tinyint(1) | — | Default 0 |
| isTaxDeductible | tinyint(1) | — | Default 1 |
| source | enum(18) | — | `spreadsheet_import` or `manual` |
| qboExpenseId | varchar(100) | — | QuickBooks Online sync |
| qboSyncStatus | enum(7) | — | `pending` default |
| qboSyncedAt | timestamp | — | |
| qboSyncError | text | — | |
| orderItemId | int | — | FK to order_items |
| createdAt | timestamp | — | |
| updatedAt | timestamp | — | |

---

## Gap Analysis

### Fields in Spreadsheet NOT in DB

| Spreadsheet Field | Status | Recommendation |
|-------------------|--------|----------------|
| **B: Type** (e.g. "Contractor Payment", "Platform Commission") | ❌ No direct column | Could map to `category` or add a new `expenseType` column |
| **H: Reference** (booking confirmation #) | ❌ No column | Add `referenceNumber` or `bookingConfirmation` column |
| **I: Payment Platform** (Zelle, VRBO, etc.) | ❌ No column | Add `paymentMethod` column |
| **L: Currency** | ⚠️ Implicit | DB has both amountJMD and amountUSD but no explicit currency field |

### Fields in DB NOT in Spreadsheet

| DB Column | In Spreadsheet? | Notes |
|-----------|-----------------|-------|
| householdId | No | Multi-tenant, not needed in spreadsheet |
| expenseYear / expenseMonth | No | Derived from date |
| paidFrom | No | Could be useful for spreadsheet |
| bankTransactionId | No | Internal FK |
| documentId | No | Internal FK |
| isReconciled | No | Internal flag |
| isTaxDeductible | No | Could be useful for spreadsheet |
| qbo* columns | No | QuickBooks sync metadata |
| orderItemId | No | Shopping order link |

---

## Data Coverage Gaps

| Property | DB Expense Rows | Spreadsheet Expense Rows | Gap |
|----------|----------------|--------------------------|-----|
| Artiste's Boutique | 258 (JMD, 2022-2025) | Present in older tabs | ✓ Covered |
| Sunset Studio | **0** | Present (USD, 2024-2026) | ❌ Not imported |
| Morabeza | **0** | Present (USD, 2024-2026) | ❌ Not imported |
| Penthouse | **0** | Unknown | ❌ Not imported |

### Currency Mismatch

- **DB (Artiste's Boutique):** All amounts in JMD, `amountUSD` is NULL
- **Spreadsheet (Sunset Studio, Morabeza):** All amounts in USD
- The `amountUSD` column exists but was never populated for the JMD imports
- The spreadsheet 2026 expenses are all USD (Sunset Studio + Morabeza)

---

## Recommendations

1. **Import Sunset Studio + Morabeza expenses** from spreadsheet detail tabs into DB (these are USD)
2. **Add missing columns** to `property_expense_records`:
   - `expenseType` (varchar) — maps to spreadsheet column B
   - `referenceNumber` (varchar) — maps to spreadsheet column H (booking confirmation)
   - `paymentMethod` (varchar) — maps to spreadsheet column I (Zelle, VRBO, etc.)
3. **Backfill `amountUSD`** for Artiste's Boutique rows using exchange rate at time of expense
4. **Fix the reconciliation script** to use `expenseYear = ?` instead of timestamp comparison
5. **Populate `proofOfPaymentUrl`** from spreadsheet column K (TXN IDs like "BOA-20260102-005")
6. **Normalize category values** — DB uses UPPERCASE, spreadsheet uses lowercase (e.g. "cleaning" vs "CLEANING FEE")
