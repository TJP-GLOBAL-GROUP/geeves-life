# Section 23: Vendor-Agnostic Refactoring Work Context

## Files to Rename
- `client/src/pages/WalmartCategorization.tsx` → `client/src/pages/ExpenseCategorisation.tsx`
- `server/routers/walmartCategorization.ts` → `server/routers/expenseCategorisation.ts`

## Key Changes Needed

### 1. Categories (in server/routers/walmartCategorization.ts → expenseCategorisation.ts)
The `getConfig` procedure returns a `categories` array. Need to add to ALL verticals (except Maxfield Bakery):
- "Auto Maintenance & Repair"
- "Credit Card Interest Charges"
- "Bank Fees" (check if already exists)
- "Traveling/Mileage Expense" (check if already exists)

### 2. Router Registration (server/routers.ts)
- Currently imports `walmartCategorizationRouter` from `./routers/walmartCategorization`
- Change to `expenseCategorisationRouter` from `./routers/expenseCategorisation`
- Change the router key from `walmartCategorization` to `expenseCategorisation`

### 3. Frontend Route (client/src/App.tsx)
- Currently: `/walmart-categorization` → `WalmartCategorization` component
- Change to: `/expense-categorisation` → `ExpenseCategorisation` component

### 4. Sidebar Menu (client/src/components/DashboardLayout.tsx)
- Currently has "Shopping" menu with sub-items
- Need to add "Expenses" menu item with sub-item "Expense Categorisation Tool"
- Restrict visibility to owner (OWNER_OPEN_ID) and Eniola (member with EA role or specific member ID)

### 5. Access Control
- Eniola's member role is "ea" (executive assistant)
- The tool should be visible to: household_admin + ea roles
- Check: `member.role === 'household_admin' || member.role === 'ea'`

### 6. Receipt Preview
- Currently shows `currentOrder.receiptUrl` which may be a non-S3 URL
- Should only display if URL contains S3 bucket domain or is from our storagePut
- Add manual upload that calls storagePut then updates the order record

### 7. View on Vendor Site
- Currently `getWalmartOrderUrl(order)` generates Walmart-specific URLs
- Change to `getVendorUrl(order)` that checks `order.vendorType` or `order.vendor`:
  - walmart → walmart.com/orders/{orderId}
  - amazon → amazon.com/gp/your-account/order-details?orderID={orderId}
  - uber → (TBD)
  - fallback → null (hide button)

### 8. Database
- `vendor_orders` table has a `vendor` column (currently all "walmart")
- No schema change needed for vendorType — it's already there as `vendor`
- The `walmartOrderId` column can be renamed conceptually to `vendorOrderId` but keep DB column name for now

### 9. Chrome Extension
- Keep extension name as "Geeves Invoice Capture" (vendor-agnostic already)
- The extension directory can stay as `chrome-extension/` (already generic)
- Only the walmart.js content script is Walmart-specific (that's fine — we'll add amazon.js later)
