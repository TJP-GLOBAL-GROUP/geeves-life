# Section 22 Work Context

## Issues Being Fixed (Jul 7 PM)

### Issue 1: Split UX Flow — FIXED ✅
- When "Add Split" is clicked, the first split defaults to 50% (not 100%)
- After adding a split, ALL selections are cleared (vertical, category, property) so user naturally picks the NEXT vertical
- User only needs to click "Add Split" again for a 3rd+ split
- The flow: select vertical → select category → click Add Split → row appears → select NEXT vertical → select category → click Add Split → done

### Issue 2: View on Walmart Button — INVESTIGATING
- The code at line 661-669 shows the button IS rendered when `walmartUrl` is truthy
- `getWalmartOrderUrl()` at line 387-396 constructs URL from `order.walmartUrl` or `order.walmartOrderId`
- The first order in the screenshot shows "Amount unknown" — likely has no walmartOrderId
- Need to check if most orders are missing the walmartOrderId field in the DB
- The button code is correct — the data is likely missing. Should add a fallback "View on Walmart" that opens walmart.com/account/orders

### Issue 3: Receipt Preview Broken + Manual Upload
- Receipt preview at lines 819-836 uses `<img src={currentOrder.receiptUrl}>`
- If receiptUrl points to a PDF (not an image), the img tag won't render it
- Need to: (1) detect if URL is PDF and use an iframe/embed, (2) add manual upload option
- Manual upload should use the existing `invoiceExtraction.uploadInvoice` + `invoiceExtraction.extract` procedures

### Issue 4: Chrome Extension Detection Not Working
- The bridge script (geeves-bridge.js) sets `window.__GEEVES_EXTENSION_INSTALLED = true`
- BUT content scripts run in an ISOLATED WORLD — they can't set properties on the page's window object
- The React app checks `window.__GEEVES_EXTENSION_INSTALLED` which will always be undefined
- FIX: Use a custom DOM event or data attribute on document.documentElement instead
- The bridge already sets `document.documentElement.dataset.geevesExtension = "active"` (line 14 of bridge)
- So the React app should check for `document.documentElement.dataset.geevesExtension === "active"` instead of window variable

## Key File Locations
- WalmartCategorization.tsx: `/home/ubuntu/geeves-shopping/client/src/pages/WalmartCategorization.tsx`
- Chrome Extension bridge: `/home/ubuntu/geeves-shopping/chrome-extension/content-scripts/geeves-bridge.js`
- Invoice extraction router: `/home/ubuntu/geeves-shopping/server/routers/invoiceExtraction.ts`
