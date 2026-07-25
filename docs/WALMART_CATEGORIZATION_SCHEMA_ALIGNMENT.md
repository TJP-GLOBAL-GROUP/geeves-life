# Walmart Categorization Tool — Design Overview, Schema & QBO Compatibility

**Date:** 2026-07-07  
**Status:** Gap analysis complete, migration path defined

---

## 0. Design Overview — How the Tool Works

### Purpose

The Walmart Categorization Tool is a **queue-based expense classification interface** that allows the household administrator to review imported Walmart orders and assign each one to a business vertical, expense category, and (optionally) a property. It transforms raw purchase data into structured, QBO-compatible accounting records.

### User Workflow

The tool presents a two-panel layout: a scrollable order queue on the left and a detail/action panel on the right.

```
┌─────────────────────────────────────────────────────────────────────┐
│  Progress Bar: 72/185 categorized (39%)                             │
├──────────────────────┬──────────────────────────────────────────────┤
│  ORDER QUEUE         │  DETAIL PANEL                                │
│                      │                                              │
│  [●] $142.30 Jun 12 │  Order #200-4829-1234                        │
│      Store purchase  │  Store purchase · Walmart Supercenter         │
│      3 items         │  Jun 12, 2026 · $142.30 JMD                  │
│                      │                                              │
│  [○] $89.50 Jun 10  │  ┌─ Items ─────────────────────────────────┐ │
│      Delivery        │  │ Clorox Bleach, Paper Towels, Mop Head   │ │
│                      │  └────────────────────────────────────────┘ │
│  [✓] $203.00 Jun 8  │                                              │
│      Categorized     │  ┌─ Assign Vertical ──────────────────────┐ │
│                      │  │ [Home & Family] [Maxfield Bakery]       │ │
│  [↗] $45.00 Jun 7   │  │ [Maxfield Market] [Personal]            │ │
│      Split           │  │ [StartOut] [Bohemian Lodges]            │ │
│                      │  └────────────────────────────────────────┘ │
│                      │                                              │
│                      │  ┌─ Category ─────────────────────────────┐ │
│                      │  │ [Bakery: Supplies ▼]                    │ │
│                      │  └────────────────────────────────────────┘ │
│                      │                                              │
│                      │  ┌─ Property (if Bohemian Lodges) ────────┐ │
│                      │  │ [Morabeza ▼]                            │ │
│                      │  └────────────────────────────────────────┘ │
│                      │                                              │
│                      │  ┌─ Notes / Memo ─────────────────────────┐ │
│                      │  │ "Cleaning supplies for Morabeza guest   │ │
│                      │  │  turnover this week"                    │ │
│                      │  └────────────────────────────────────────┘ │
│                      │                                              │
│                      │  [✓ Assign] [↗ Split Mode] [⏭ Skip]        │
├──────────────────────┴──────────────────────────────────────────────┤
│  Filter: [All] [Pending] [Categorized] [Split] [Skipped]            │
└─────────────────────────────────────────────────────────────────────┘
```

**Step-by-step flow:**

1. **Import** — Walmart orders are imported into `walmart_orders` (currently via email scraping or manual CSV upload). Each order has a date, total, item names (JSON array), thumbnails, and a `categorizationStatus` of `pending`.

2. **Queue Review** — The user opens the tool and sees all pending orders sorted by date (newest first). A progress bar shows overall completion. Filter tabs let the user view orders by status.

3. **Order Inspection** — Clicking an order shows its full detail: order type (store/delivery/curbside), item thumbnails, item names, total amount, currency, receipt URL, and Walmart order link.

4. **Single Assignment** — The user selects one vertical (business unit), one category from that vertical's chart of accounts, and optionally a property (for Bohemian Lodges). Clicking "Assign" saves the categorization.

5. **Split Mode** — For orders that span multiple verticals (e.g., a Home Depot run buying both personal items and bakery supplies), the user toggles "Split Mode". They then:
   - Select a vertical + category + property
   - Click "Add Split" (adds a row with remaining % or $ auto-calculated)
   - Repeat for each allocation
   - Adjust percentages or dollar amounts per row
   - Save when splits total 100%

6. **Annotation (Memo/Notes)** — A textarea allows the user to add free-text notes to any order. This is saved directly on the `walmart_orders.memo` column. Notes persist across sessions and are visible when reviewing categorized orders.

7. **Skip** — Orders that don't need categorization (personal small purchases, etc.) can be skipped. They move to `skipped` status and don't count toward the "pending" queue.

8. **Re-edit** — Already-categorized orders show a read-only summary with an "Edit" button. Clicking edit re-opens the categorization form, allowing the user to change the assignment.

### Data Flow Diagram

```
┌──────────────────┐     ┌───────────────────────┐     ┌──────────────────────┐
│  Email Scraper   │────▶│   walmart_orders      │────▶│  Categorization UI   │
│  (import source) │     │   (185 rows)          │     │  (this tool)         │
└──────────────────┘     │                       │     └──────────┬───────────┘
                         │  • id (UUID)          │                │
                         │  • orderDate          │                │
                         │  • totalAmount        │                │ User assigns:
                         │  • itemNames (JSON)   │                │ • vertical
                         │  • categorizationStatus│               │ • category
                         │  • memo               │                │ • property
                         │  • receiptUrl         │                │ • split %/$
                         └───────────────────────┘                │
                                                                  ▼
                         ┌───────────────────────────────────────────────────┐
                         │  walmart_order_categorizations                    │
                         │  (one row per single assignment, N rows per split)│
                         │                                                   │
                         │  • id (UUID)                                      │
                         │  • walmartOrderId → FK to walmart_orders.id       │
                         │  • verticalId (FK to verticals table)             │
                         │  • verticalName (denormalized)                    │
                         │  • category (free-text, e.g. "Bakery: Supplies")  │
                         │  • customCategory (user override)                 │
                         │  • propertyName (free-text, e.g. "Morabeza")      │
                         │  • splitPercentage (0-100)                        │
                         │  • splitAmount (dollar value)                     │
                         │  • notes (per-categorization notes)               │
                         └───────────────────────────────────────────────────┘
```

### Where Each Piece of Data is Stored

| Data | Table | Column | Notes |
|------|-------|--------|-------|
| Order metadata (date, total, items, type) | `walmart_orders` | Various | Immutable after import |
| Order status | `walmart_orders` | `categorizationStatus` | Updated on categorize/split/skip |
| User memo/notes on the order | `walmart_orders` | `memo` | Free-text, editable anytime |
| Vertical assignment | `walmart_order_categorizations` | `verticalId`, `verticalName` | One row = single, N rows = split |
| Expense category | `walmart_order_categorizations` | `category`, `customCategory` | Free-text string matching QBO account names |
| Property attribution | `walmart_order_categorizations` | `propertyName` | Free-text ("Morabeza", "Sunset Studio", etc.) |
| Split allocation | `walmart_order_categorizations` | `splitPercentage`, `splitAmount` | Always sums to 100% / order total |
| Per-categorization notes | `walmart_order_categorizations` | `notes` | Separate from order-level memo |

### Key Design Decisions

1. **Order-level vs. item-level categorization** — The tool categorizes at the ORDER level, not the item level. A $142 Walmart order with 3 items gets one vertical assignment (or one split across verticals). Individual items are not separately classified in this tool.

2. **Destructive re-categorization** — When a user re-categorizes an order, all previous `walmart_order_categorizations` rows for that order are DELETED and replaced. There is no version history at this layer (audit_log captures the mutation).

3. **Hardcoded config** — Verticals, categories, and properties are returned from `getConfig` as hardcoded arrays in the router. They are NOT dynamically queried from the `verticals` or `properties` tables. This was a Phase 1 shortcut.

4. **Household scoping** — The tool is hardcoded to household `1S9K7Jw7DtkJJTP2Jgtr6` (TJ Perkins household). No multi-household support yet.

5. **No QBO export** — The categorization output stays in `walmart_order_categorizations`. There is no automated pipeline to push these to QuickBooks Online. That is the gap this document addresses.

---

## 1. Current State (Legacy Tables)

The Walmart Categorization tool currently writes to **two raw SQL tables** that are NOT managed by Drizzle ORM:

### `walmart_orders` (185 rows)

| Column | Type | Description |
|--------|------|-------------|
| id | varchar(36) UUID | Primary key |
| householdId | varchar(36) | Hard-coded to `1S9K7Jw7DtkJJTP2Jgtr6` |
| orderDate | date | Order date (YYYY-MM-DD format) |
| orderType | varchar | "Store purchase", "Delivery from store", "Curbside pickup", etc. |
| totalAmount | decimal | Order total |
| currency | varchar(3) | "JMD" or "USD" |
| walmartOrderId | varchar | Walmart's order ID |
| location | varchar | Store location |
| seller | varchar | Seller name |
| isRefund | boolean | Whether this is a refund |
| thumbnailUrls | JSON | Array of product thumbnail URLs |
| itemNames | JSON | Array of item name strings |
| rawDescription | text | Raw order description |
| walmartUrl | text | Link to Walmart order page |
| categorizationStatus | enum | "pending", "categorized", "split", "skipped" |
| receiptUrl | text | Receipt image URL |
| memo | text | User notes |
| createdAt | timestamp | |
| updatedAt | timestamp | |

### `walmart_order_categorizations` (linked to walmart_orders)

| Column | Type | Description |
|--------|------|-------------|
| id | varchar(36) UUID | Primary key |
| walmartOrderId | varchar(36) | FK to walmart_orders.id |
| verticalId | varchar(36) | Which vertical (business unit) |
| verticalName | varchar | Denormalized vertical name |
| category | varchar | QBO category string (e.g., "Bakery: Supplies") |
| customCategory | varchar | User-defined category override |
| propertyName | varchar | Property name string (e.g., "Morabeza") |
| splitPercentage | decimal | Percentage allocation (0-100) |
| splitAmount | decimal | Dollar allocation |
| notes | text | Per-categorization notes |
| createdAt | timestamp | |
| updatedAt | timestamp | |

---

## 2. Target State (New QBO-Compatible Schema)

The new schema (deployed in Section 16) provides a **three-table model** that is fully QBO-compatible:

### `vendor_orders` → replaces `walmart_orders`

| Column | Type | Description | Tax Relevance |
|--------|------|-------------|---------------|
| id | varchar(21) nanoid | Primary key | — |
| householdId | varchar(36) | Household scope | — |
| vendorAccountId | varchar(21) | FK to vendor_accounts | Vendor identification |
| orderNumber | varchar(255) | Vendor's order number | Receipt matching |
| platform | enum | "walmart", "amazon", etc. | Source identification |
| status | enum | Order lifecycle status | — |
| subtotal | decimal(12,2) | Pre-tax amount | Net expense |
| taxAmount | decimal(12,2) | Tax charged | Sales tax deduction |
| shippingAmount | decimal(12,2) | Shipping/delivery fee | Deductible if business |
| totalAmount | decimal(12,2) | Total charged | Gross expense |
| discountAmount | decimal(12,2) | Discounts applied | Net expense adjustment |
| currency | varchar(3) | Currency code | Multi-currency support |
| orderDate | bigint (UTC ms) | When ordered | Tax year attribution |
| deliveryDate | bigint (UTC ms) | When delivered | — |
| trackingNumbers | JSON string[] | Shipping tracking | — |
| deliveryAddress | varchar(500) | Where delivered | Property attribution |
| paymentMethod | varchar(100) | How paid | Bank matching |
| paymentCardLast4 | varchar(4) | Card last 4 | Bank transaction matching |
| importSource | enum | How imported | Audit trail |
| rawImportData | JSON | Original import payload | Re-parse capability |
| legacyOrderId | int | Link to old `orders` table | Migration |
| legacyWalmartOrderId | varchar(36) | Link to old `walmart_orders` | Migration |
| notes | text | User notes | — |

### `vendor_order_items` → replaces per-item data (currently in `itemNames` JSON)

| Column | Type | Description | Tax Relevance |
|--------|------|-------------|---------------|
| id | varchar(21) nanoid | Primary key | — |
| vendorOrderId | varchar(21) | FK to vendor_orders | — |
| householdId | varchar(36) | Household scope | — |
| name | varchar(500) | Product name | Expense description |
| quantity | int | Qty purchased | — |
| unitPrice | decimal(12,2) | Per-unit price | — |
| lineTotal | decimal(12,2) | Line total | Item-level expense |
| itemTax | decimal(12,2) | Tax on this item | Item-level tax |
| currency | varchar(3) | Currency | — |
| vendorProductId | varchar(255) | Vendor SKU | Product matching |
| asin | varchar(20) | Amazon ASIN | Product matching |
| productUrl | text | Product page URL | — |
| vendorCategory | varchar(200) | Vendor's own category | AI hint |
| **chartOfAccountId** | varchar(21) | **FK to chart_of_accounts** | **QBO category mapping** |
| **verticalId** | varchar(36) | **FK to verticals** | **Business unit** |
| **propertyId** | varchar(36) | **FK to properties** | **Property attribution** |
| **isTaxDeductible** | boolean | **Business expense flag** | **Tax deduction** |
| **taxCategory** | varchar(100) | **Tax category** | **Schedule C/E line** |
| **taxFormLine** | varchar(50) | **IRS form line** | **Direct tax filing** |
| aiConfidence | int (0-100) | AI categorization score | — |
| isManualOverride | boolean | User confirmed/changed | Audit trail |
| deliveryAddress | varchar(500) | Item-specific delivery | Property attribution |
| tags | JSON string[] | Learning tags | — |

### `expenses` → replaces `walmart_order_categorizations` (the accounting event)

| Column | Type | Description | Tax Relevance |
|--------|------|-------------|---------------|
| id | varchar(21) nanoid | Primary key | — |
| householdId | varchar(36) | Household scope | — |
| **verticalId** | varchar(36) | **Business unit** | **QBO company routing** |
| **propertyId** | varchar(36) | **Property** | **QBO Location tag** |
| **chartOfAccountId** | varchar(21) | **CoA category** | **QBO account mapping** |
| vendorOrderItemId | varchar(21) | FK to vendor_order_items | Source linkage |
| vendorOrderId | varchar(21) | FK to vendor_orders | Source linkage |
| financialTransactionId | int | FK to financial_transactions | Bank reconciliation |
| transactionMatchId | varchar(21) | FK to transaction_matches | Match audit |
| **amount** | decimal(12,2) | **Expense amount** | **Deduction amount** |
| currency | varchar(3) | Currency | — |
| **description** | varchar(500) | **Expense description** | **QBO memo** |
| **expenseDate** | bigint (UTC ms) | **When incurred** | **Tax year** |
| paymentMethod | varchar(100) | How paid | — |
| paymentAccountId | int | FK to financial_accounts | Bank account |
| vendorName | varchar(200) | Vendor name | QBO payee |
| **isTaxDeductible** | boolean | **Deductible flag** | **Tax return** |
| **taxCategory** | varchar(100) | **Tax category** | **Schedule C/E** |
| **taxFormLine** | varchar(50) | **IRS form line** | **Direct filing** |
| **approvalStatus** | enum | **Approval workflow** | **Audit trail** |
| approvedBy | varchar(36) | Who approved | Audit |
| approvedAt | bigint | When approved | Audit |
| **qboExportStatus** | enum | **QBO sync status** | **Reconciliation** |
| qboExpenseId | varchar(50) | QBO entity ID | Cross-reference |
| qboExportedAt | bigint | When exported | Audit |
| qboExportError | text | Export failure reason | Debugging |
| receiptUrl | text | Receipt/doc URL | Documentation |
| source | enum | How created | Audit |
| aiConfidence | int | AI score | — |
| isManualOverride | boolean | User override | Audit |
| notes | text | Notes | — |
| **splitGroupId** | varchar(21) | **Cross-vertical split group** | **Multi-vertical allocation** |
| **splitAmount** | decimal(14,2) | **Per-row allocation** | **Split deduction** |
| **splitSequence** | int | **Order within group** | — |

---

## 3. Gap Analysis: What the Categorization Tool is Missing

| Field | Legacy Has | New Schema Has | Gap |
|-------|-----------|----------------|-----|
| chartOfAccountId | ❌ (uses free-text `category`) | ✅ FK to chart_of_accounts | Must map category strings → CoA IDs |
| propertyId | ❌ (uses free-text `propertyName`) | ✅ FK to properties table | Must resolve name → ID |
| isTaxDeductible | ❌ | ✅ | Must be set during categorization |
| taxCategory | ❌ | ✅ | Must derive from CoA or manual |
| taxFormLine | ❌ | ✅ | Must derive from vertical + CoA |
| splitGroupId | ❌ (uses per-row splitPercentage) | ✅ | Must generate nanoid for split groups |
| splitAmount | ✅ (on categorization row) | ✅ (on expenses row) | Compatible |
| vendorOrderItemId | ❌ (items stored as JSON array) | ✅ FK | Items must be exploded into rows |
| financialTransactionId | ❌ | ✅ | Bank matching happens downstream |
| transactionMatchId | ❌ | ✅ | Matching happens downstream |
| approvalStatus | ❌ | ✅ | Workflow not yet built |
| qboExportStatus | ❌ | ✅ | Export not yet built |
| paymentCardLast4 | ❌ | ✅ (on vendor_orders) | For bank matching |

---

## 4. Migration Path (Categorization Tool → New Schema)

The categorization tool's output must eventually produce:

1. **`vendor_orders`** row (one per walmart order) — already migrated (185 rows with `legacyWalmartOrderId` backlink)
2. **`vendor_order_items`** rows (one per item in the order) — requires exploding `itemNames` JSON into individual rows with classification
3. **`expenses`** rows (one per vertical/property allocation) — replaces `walmart_order_categorizations`

The categorization tool's current output (`walmart_order_categorizations`) maps to `expenses` like this:

```
walmart_order_categorizations.verticalId     → expenses.verticalId
walmart_order_categorizations.category       → expenses.chartOfAccountId (needs lookup)
walmart_order_categorizations.propertyName   → expenses.propertyId (needs lookup)
walmart_order_categorizations.splitPercentage → (used to compute splitAmount)
walmart_order_categorizations.splitAmount    → expenses.splitAmount
(generated)                                  → expenses.splitGroupId
```

---

## 5. Fields Required by Tax Preparation Task

For the tax preparation task to have everything it needs, the categorized output must include:

| Field | Source | Notes |
|-------|--------|-------|
| verticalId | User selection | Maps to QBO company |
| chartOfAccountId | Derived from category string → CoA table | Maps to QBO account |
| propertyId | Derived from propertyName → properties table | Maps to QBO Location |
| isTaxDeductible | Derived from vertical (business = yes) | Schedule C/E flag |
| taxCategory | Derived from CoA.taxCategory or manual | IRS category |
| taxFormLine | Derived from CoA.taxFormLine | e.g., "Schedule C Line 22" |
| amount | From order total or split allocation | Dollar amount |
| expenseDate | From order date | Tax year attribution |
| vendorName | "Walmart" | QBO payee |
| splitGroupId | Generated when splitting | Groups multi-vertical splits |
| splitAmount | Computed from percentage × total | Per-vertical allocation |
| description | From item names or order type | QBO memo |
| receiptUrl | From walmart_orders.receiptUrl | Documentation |
| paymentMethod | Not currently captured | Needed for bank matching |

---

## 6. Recommended Next Steps

1. **Phase 1 (Current):** UX fixes deployed (focus + split). Schema alignment documented.
2. **Phase 2:** Update `walmartCategorization.categorize` and `categorizeSplit` to ALSO write to `expenses` table (dual-write during transition).
3. **Phase 3:** Add `chartOfAccountId` resolution (category string → CoA FK lookup).
4. **Phase 4:** Add `propertyId` resolution (property name → properties table FK lookup).
5. **Phase 5:** Add tax fields derivation (from CoA + vertical context).
6. **Phase 6:** Retire `walmart_order_categorizations` table once all data flows through `expenses`.

---

## 7. Verticals → QBO Company Mapping

| Vertical | QBO Company | Tax Form |
|----------|-------------|----------|
| Home & Family | Personal (no QBO) | N/A |
| Maxfield Bakery | Maxfield Bakery & Confectionery | Schedule C |
| Maxfield Market | Maxfield Market | Schedule C |
| Personal | Personal (no QBO) | N/A |
| StartOut | StartOut | Schedule C |
| Bohemian Lodges | Bohemian Lodges | Schedule E |

---

## 8. Properties → QBO Location Mapping (Bohemian Lodges)

| Property Name | Property ID | QBO Location |
|---------------|-------------|--------------|
| Morabeza | (in properties table) | Morabeza |
| Sunset Studio | (in properties table) | Sunset Studio |
| The Artiste's Boutique | (in properties table) | The Artiste's Boutique |
| Penthouse | (in properties table) | Penthouse |
| Sunset Studio + Morabeza | (combo allocation) | Split across both |
| All Properties | (all) | Split evenly |

---

## 9. Chart of Accounts Categories (Current Tool → CoA Mapping Needed)

The tool currently uses free-text category strings like:
- "Bakery: Supplies" → needs mapping to `chart_of_accounts.id` where `name = 'Supplies'` AND vertical context = Maxfield Bakery
- "Bohemian: Cleaning Expense (Rental Property)" → needs mapping to CoA where `name = 'Cleaning Expense (Rental Property)'` AND vertical = Bohemian Lodges

This mapping will be built as a lookup function that resolves the legacy category string to the canonical `chartOfAccountId`.
