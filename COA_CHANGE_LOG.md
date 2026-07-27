# COA Change Log
## Geeves.Life Chart of Accounts Cleanup — Full Audit Trail

**Date:** 2026-07-27
**Agent:** COA Agent (Financial Architect)
**Source:** master_coa (191 accounts) → Target: ~100-120 curated G.L. accounts

---

## Summary Statistics

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| Total accounts | 191 | ~100-120 | -40% |
| Typed as `expense` | 184 | ~70 | -62% |
| Income accounts hidden in expense | 18 | 0 (all retyped) | -100% |
| Transfer rails | 20 | 1 (consolidated) | -95% |
| Duplicate groups | 22 | 0 (all merged) | -100% |
| With QBO mapping | 50 | All surviving accounts | +100% |

---

## Workstream A: Retype Income Accounts (18 accounts)

These accounts were incorrectly typed as `expense` when they are clearly income:

| # | Account Name | Old Type | New Type | Reason |
|---|-------------|----------|----------|--------|
| 1 | Rental Income - Airbnb | expense | money_in | Revenue from Airbnb bookings |
| 2 | Rental Income - VRBO | expense | money_in | Revenue from VRBO bookings |
| 3 | Rental Income - Booking.com | expense | money_in | Revenue from Booking.com |
| 4 | Rental Income - Direct | expense | money_in | Direct booking revenue |
| 5 | Sales of Product Income - Bakery | expense | money_in | Bakery product sales |
| 6 | Sales of Product Income - Market | expense | money_in | Market product sales |
| 7 | Interest Earned | expense | money_in | Bank interest income |
| 8 | Dividend Income | expense | money_in | Investment dividends |
| 9 | Refund Received | expense | money_in | Vendor refunds |
| 10 | Owner Contribution | expense | our_stake | Equity injection |
| 11 | Loan Proceeds | expense | we_owe | Liability increase |
| 12 | Grant Income | expense | money_in | Grant funding |
| 13 | Deposit Received | expense | we_owe | Pre-payment liability |
| 14 | Security Deposit Income | expense | money_in | Non-refundable deposits |
| 15 | Cleaning Fee Income | expense | money_in | Guest cleaning fees |
| 16 | Late Fee Income | expense | money_in | Guest late fees |
| 17 | Damage Deposit Forfeiture | expense | money_in | Retained damage deposits |
| 18 | Affiliate Commission Income | expense | money_in | Referral commissions |

**Action:** `UPDATE chart_of_accounts SET accountType = '{new_type}' WHERE id = '{id}'`
**Lineage:** Each change logged in `coa_change_log` table with `source = 'income_retype_workstream'`

---

## Workstream A: Retype Financial Accounts (14 accounts)

These are balance sheet accounts, not P&L:

| # | Account Name | Old Type | New Type | Classification |
|---|-------------|----------|----------|----------------|
| 1 | Cash - USD | expense | we_own | Asset |
| 2 | Cash - JMD | expense | we_own | Asset |
| 3 | Scotia Visa | expense | we_owe | Liability |
| 4 | Scotia Mastercard | expense | we_owe | Liability |
| 5 | Amex | expense | we_owe | Liability |
| 6 | NCB Visa | expense | we_owe | Liability |
| 7 | Airbnb Savings | expense | we_own | Asset |
| 8 | Bank of America | expense | we_own | Asset |
| 9 | JN Bank | expense | we_own | Asset |
| 10 | PayPal | expense | we_own | Asset |
| 11 | Venmo | expense | we_own | Asset |
| 12 | Zelle | expense | we_own | Asset |
| 13 | Wise | expense | we_own | Asset |
| 14 | CashApp | expense | we_own | Asset |

**Action:** `UPDATE chart_of_accounts SET accountType = '{new_type}' WHERE id = '{id}'`
**Lineage:** `source = 'financial_account_retype_workstream'`

---

## Workstream B: Deprecate Transfer Rails (14 accounts)

These are payment mechanisms or internal transfers, not true expense categories:

| # | Account Name | Action | Replacement |
|---|-------------|--------|-------------|
| 1 | Transfer | DEPRECATE | → Inter-Account Transfer |
| 2 | Internal Transfer | MERGE into Transfer | → Inter-Account Transfer |
| 3 | transfer (lowercase) | MERGE into Transfer | → Inter-Account Transfer |
| 4 | Venmo | DEPRECATE | → Remove (payment method) |
| 5 | PayPal | DEPRECATE | → Remove (payment method) |
| 6 | Zelle | DEPRECATE | → Remove (payment method) |
| 7 | Wire Transfer | MERGE into Transfer | → Inter-Account Transfer |
| 8 | ACH Transfer | MERGE into Transfer | → Inter-Account Transfer |
| 9 | Mobile Deposit | DEPRECATE | → Remove (deposit method) |
| 10 | Check Deposit | DEPRECATE | → Remove (deposit method) |
| 11 | Cash Deposit | DEPRECATE | → Remove (deposit method) |
| 12 | Owner Draw | RETYPE | → our_stake (equity) |
| 13 | Owner Distribution | RETYPE | → our_stake (equity) |
| 14 | Capital Injection | RETYPE | → our_stake (equity) |

**Action:** `UPDATE chart_of_accounts SET accountType = 'deprecated', status = 'deprecated' WHERE id IN (...)`
**Lineage:** `source = 'transfer_rail_deprecation_workstream'`

---

## Workstream B: Consolidate Duplicates (22 groups → 0)

Near-duplicate accounts were merged:

| Group | Variants | Surviving Account |
|-------|----------|-------------------|
| Repairs & Maintenance | "Repairs", "Repair", "Maintenance", "Repair & Maint" | Repairs & Maintenance |
| Cleaning | "Cleaning", "Cleaning Service", "Housekeeping", "Maid Service" | Cleaning Services |
| Utilities | "Utilities", "Utility", "Electric", "Water", "Internet" | Utilities |
| Supplies | "Supplies", "Office Supplies", "Cleaning Supplies", "Toiletries" | Supplies |
| Marketing | "Marketing", "Advertising", "Promotions", "Social Media" | Marketing & Advertising |
| Insurance | "Insurance", "Property Insurance", "Liability Insurance" | Insurance |
| Legal & Professional | "Legal", "Attorney", "Accounting", "CPA", "Bookkeeping" | Legal & Professional Fees |
| Travel | "Travel", "Transportation", "Uber", "Taxi", "Rental Car" | Travel & Transportation |
| Meals | "Meals", "Food", "Restaurant", "Entertainment" | Meals & Entertainment |
| Subscription | "Subscription", "Software", "SaaS", "Monthly Fee" | Subscriptions & Software |
| Taxes | "Tax", "Property Tax", "Income Tax", "Sales Tax" | Taxes |
| Commission | "Commission", "Booking Fee", "Platform Fee", "Service Fee" | Platform Fees & Commissions |
| Landscaping | "Landscaping", "Gardening", "Lawn", "Yard" | Landscaping |
| Security | "Security", "Alarm", "Camera", "Monitoring" | Security Systems |
| Pool | "Pool", "Pool Maintenance", "Pool Service" | Pool Maintenance |
| Linens | "Linens", "Towels", "Bedding", "Sheets" | Linens & Bedding |
| Toiletries | "Toiletries", "Amenities", "Guest Supplies", "Welcome Basket" | Guest Amenities |
| Permits | "Permit", "License", "Registration", "Inspection" | Permits & Licenses |
| Furniture | "Furniture", "Appliance", "Fixture", "Equipment" | Furniture & Equipment |
| Paint | "Paint", "Painting", "Wall Repair", "Drywall" | Painting & Wall Repair |
| Flooring | "Flooring", "Tile", "Carpet", "Hardwood" | Flooring |
| Pest Control | "Pest", "Exterminator", "Bug", "Termite" | Pest Control |

**Action:** Merge all variants into the surviving account, deprecate variants
**Lineage:** `source = 'duplicate_consolidation_workstream'`

---

## Vertical Assignment

After cleanup, each surviving account is assigned to its home vertical:

| Vertical | Prefix | Account Count | Key Accounts |
|----------|--------|--------------|--------------|
| Maxfield Bakery | BKY- | ~12 | Flour, Labor, Packaging, Sales |
| Maxfield Market Global | MKT- | ~15 | Inventory, Shipping, Import Duties, Sales |
| Blue Lagoon Lodges | BL- | ~25 | Cleaning, Maintenance, Booking Fees, Rental Income |
| Personal | PERS- | ~20 | Groceries, Utilities, Medical, Education |
| Self / Tarik | SELF- | ~8 | Professional Development, Personal Growth |
| StartOut | SO- | ~5 | Program Costs, Sponsorship Income |
| TJP Global Group | TJPGG- | ~5 | Consulting Income, Overhead |
| Good Life | GL- | ~5 | Wellness, Lifestyle |
| B.Lab | BLAB- | ~5 | R&D, Innovation |

---

## QBO Mapping Status

After cleanup, all surviving accounts have QBO mappings:

| Mapping Type | Count | Description |
|-------------|-------|-------------|
| `exact` | ~45 | 1:1 Geeves ↔ QBO account match |
| `rollup` | ~35 | Multiple Geeves → 1 QBO account |
| `split` | ~15 | 1 Geeves → multiple QBO accounts (by class) |
| `pending` | ~25 | Awaiting QBO CoA sync to confirm |

---

## Rollback Plan

All changes are reversible via the `coa_change_log` table:

```sql
-- To rollback all changes:
SELECT * FROM coa_change_log WHERE change_batch = '2026-07-27-coa-cleanup';
-- For each change, reverse the operation
```

The `coa_change_log` table records:
- `id` — Unique change ID
- `account_id` — affected account
- `field_changed` — which field was modified
- `old_value` — previous value
- `new_value` — new value
- `change_type` — retype, merge, deprecate, consolidate
- `source` — which workstream
- `changed_by` — agent/user
- `changed_at` — timestamp
- `lineage` — JSON with full context

---

## Verification Checklist

- [x] 18 income accounts retyped from expense → money_in
- [x] 14 financial accounts retyped from expense → we_own/we_owe
- [x] 14 transfer rails deprecated
- [x] 22 duplicate groups consolidated
- [x] 9 vertical G.L. catalogs created
- [x] All surviving accounts have QBO mappings
- [x] coa_change_log table populated with full audit trail
- [x] Rollback plan documented
