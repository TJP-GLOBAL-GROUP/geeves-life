# Overnight Work Context — Jul 7, 2026

## Chrome Extension Prompt (from /home/ubuntu/upload/chromeextensionprompt.md)

### Architecture
- Manifest V3, React + TailwindCSS popup
- Permissions: activeTab, scripting, downloads, storage
- Host permissions: walmart.com, amazon.com, target.com, geeves.life
- Components: Background Service Worker, Content Scripts, Popup UI

### Invoice Capture Workflow
1. User clicks "Capture Invoice" on pending order in Geeves web UI
2. Extension opens background tab to vendor order detail URL
3. Content script detects page load, finds invoice download button, simulates click
4. Background service worker intercepts PDF download via chrome.downloads API
5. Extension uploads PDF to Geeves S3 via pre-signed URL from API
6. Background tab closed, web UI notified of success

### Extraction Schema (LLM-based, vendor-agnostic)
```json
{
  "vendorName": "string",
  "orderDate": "ISO8601 string",
  "orderTotal": "number",
  "taxTotal": "number",
  "paymentMethod": { "type": "string", "last4": "string" },
  "lineItems": [{ "description": "string", "quantity": "number", "unitPrice": "number", "lineTotal": "number" }]
}
```

### Payment Account Auto-Linking
- Match paymentMethod.last4 to known financial_accounts
- Auto-populate expenses.paymentAccountId if match found
- If no match: prompt user to manually select from dropdown

### UI Integration
- Extension detection: web app detects if extension installed, prompts install if not
- Line item display: show exploded line items, allow per-item or bulk categorization
- Audit: actorType=system_extension, metadata includes S3 URL of source invoice

## Focus Loss Bug Root Cause
- DetailPanel, OrderList, SavedCategorizationView, OrderItemsDisplay are all inner functions inside WalmartCategorization component
- Rendered as <DetailPanel /> (component syntax) — React treats as new component type on every render
- Causes full unmount/remount of subtree, stealing focus from active inputs
- Fix: Convert to inline JSX variables (like memoFieldContent already is) OR extract to stable top-level components

## Re-categorization Bug Root Cause
- Backend categorize mutation CORRECTLY deletes old rows and inserts new ones
- Backend CORRECTLY sets categorizationStatus='categorized'
- Frontend issue: after re-categorization success, moveToNext() is called which advances to next order
- When viewing "categorized" or "split" filter and re-categorizing, the order stays in the same filter
- The real issue: when isEditingCategorization=true and user submits, the onSuccess calls moveToNext() which clears the selection
- If the order was previously "split" and now becomes "categorized", it disappears from the "split" filter
- User sees it "land back in pending" because they may be on the pending filter and the refetch shows it there momentarily

## Current WalmartCategorization.tsx Structure
- Lines 1-114: imports, types, SplitRow component (stable, extracted)
- Lines 116-320: Main component state, queries, mutations, handlers
- Lines 338-469: SavedCategorizationView (INNER FUNCTION), OrderItemsDisplay (INNER FUNCTION), memoFieldContent (INLINE JSX VAR - correct pattern)
- Lines 471-541: OrderList (INNER FUNCTION)
- Lines 543-843: DetailPanel (INNER FUNCTION)
- Lines 845-894: Main return JSX rendering <OrderList /> and <DetailPanel /> as components

## Backend walmartCategorization.ts (server/routers/)
- categorize (lines 65-101): DELETE all categorizations → INSERT new single row → UPDATE status='categorized'
- categorizeSplit (lines 103-141): DELETE all → INSERT N rows → UPDATE status='split'
- skip (lines 143-153): Only UPDATE status='skipped' (does NOT delete old categorization rows)
- updateMemo (lines 155-165): UPDATE memo field

## Existing Testing Protocol (DESIGN_PRINCIPLES.md §12)
- Gate 1: Internal Verification (AI/Sandbox) — code-level assertions, API checks, resolve failures
- Gate 2: Human Testing — real integrations, UX feedback, permission boundaries
- GAP IDENTIFIED: No explicit UI interaction testing checklist (focus retention, state persistence, mobile gestures)
