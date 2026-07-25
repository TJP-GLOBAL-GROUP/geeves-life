# Geeves.life Chrome Extension — Invoice Capture & Categorization Architecture

**Version:** 1.0  
**Date:** Jul 7, 2026  
**Status:** Design Complete, Implementation Phase

---

## 1. Overview

The Geeves.life Chrome Extension is a vendor-agnostic browser extension that eliminates manual invoice downloads and data entry for major retail platforms. It bridges the user's authenticated browsing sessions with the Geeves.life backend, extracting line items and payment methods to facilitate accurate QBO accounting.

The extension operates as a companion to the Walmart Categorization Tool (and future Amazon/Target/Uber tools), adding invoice-level granularity to what is currently an order-level categorization system.

---

## 2. Architecture (Manifest V3)

### Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  BROWSER (Chrome/Edge)                                                       │
│                                                                              │
│  ┌──────────────────────┐    ┌──────────────────────┐                       │
│  │  Background Service  │    │  Content Scripts      │                       │
│  │  Worker              │    │  (per vendor page)    │                       │
│  │                      │    │                       │                       │
│  │  • OAuth token mgmt  │◄──►│  • DOM selector map  │                       │
│  │  • Download intercept│    │  • Invoice btn click  │                       │
│  │  • API communication │    │  • Page state detect  │                       │
│  │  • Tab lifecycle     │    │                       │                       │
│  └──────────┬───────────┘    └───────────────────────┘                       │
│             │                                                                │
│  ┌──────────▼───────────┐                                                    │
│  │  Popup UI            │                                                    │
│  │  (React + Tailwind)  │                                                    │
│  │                      │                                                    │
│  │  • Pending tasks     │                                                    │
│  │  • Page context      │                                                    │
│  │  • Quick actions     │                                                    │
│  └──────────────────────┘                                                    │
└───────────────────────────────────────────────────────────────────────────────┘
         │
         │  HTTPS (Bearer token)
         ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│  GEEVES.LIFE BACKEND                                                          │
│                                                                               │
│  ┌─────────────────────┐    ┌─────────────────────┐    ┌──────────────────┐  │
│  │  invoiceExtraction   │    │  LLM Extraction     │    │  S3 Storage      │  │
│  │  tRPC Router         │    │  Pipeline           │    │                  │  │
│  │                      │    │                      │    │  • Invoice PDFs  │  │
│  │  • getUploadUrl     │───►│  • PDF → JSON        │    │  • Pre-signed    │  │
│  │  • extract          │    │  • Schema validation │    │    URLs           │  │
│  │  • autoLinkPayment  │    │  • Error handling    │    │                  │  │
│  │  • getLineItems     │    │                      │    │                  │  │
│  └─────────────────────┘    └─────────────────────┘    └──────────────────┘  │
│                                                                               │
│  ┌─────────────────────┐    ┌─────────────────────┐                          │
│  │  Audit Logger        │    │  Financial Accounts  │                          │
│  │                      │    │  (auto-link)         │                          │
│  │  • actorType:       │    │                      │                          │
│  │    system_extension │    │  • Match last4       │                          │
│  │  • s3Url in meta   │    │  • Link to expense   │                          │
│  └─────────────────────┘    └─────────────────────┘                          │
└───────────────────────────────────────────────────────────────────────────────┘
```

### Permissions (manifest.json)

| Permission | Purpose |
|-----------|---------|
| `activeTab` | Access current tab for content script injection |
| `scripting` | Programmatic content script injection on vendor pages |
| `downloads` | Intercept PDF downloads before they hit disk |
| `storage` | Store OAuth tokens and extension state |

### Host Permissions

| Pattern | Purpose |
|---------|---------|
| `*://*.walmart.com/*` | Walmart order pages and invoice downloads |
| `*://*.amazon.com/*` | Amazon order pages and invoice downloads |
| `*://*.target.com/*` | Target order pages and invoice downloads |
| `*://*.geeves.life/*` | Communication with Geeves backend |

---

## 3. Database Schema

### New Table: `invoice_extractions`

| Column | Type | Description |
|--------|------|-------------|
| id | varchar(21) nanoid | Primary key |
| walmartOrderId | varchar(36) | FK to walmart_orders.id (nullable for future vendors) |
| vendorOrderId | varchar(36) | FK to vendor_orders.id (future) |
| vendorName | varchar(100) | Extracted vendor name |
| orderDate | varchar(30) | ISO8601 date from invoice |
| orderTotal | decimal(10,2) | Total from invoice |
| taxTotal | decimal(10,2) | Tax amount from invoice |
| paymentMethodType | varchar(50) | Card type (Visa, MasterCard, Gift Card) |
| paymentMethodLast4 | varchar(4) | Last 4 digits of payment method |
| paymentAccountId | varchar(21) | FK to financial_accounts (auto-linked or manual) |
| lineItems | JSON | Array of extracted line items |
| s3Url | text | S3 URL of source invoice PDF |
| extractionStatus | enum | 'pending', 'processing', 'completed', 'failed' |
| extractionError | text | Error message if extraction failed |
| householdId | varchar(36) | Household scope |
| createdAt | bigint | UTC timestamp |
| updatedAt | bigint | UTC timestamp |

### Line Items JSON Schema

```json
[
  {
    "description": "Clorox Bleach 128oz",
    "quantity": 2,
    "unitPrice": 8.97,
    "lineTotal": 17.94
  }
]
```

---

## 4. Backend Procedures (tRPC)

### `invoiceExtraction.getUploadUrl`

Generates a pre-signed S3 URL for the extension to upload the intercepted PDF directly.

**Input:** `{ orderId: string, filename: string, mimeType: string }`  
**Output:** `{ uploadUrl: string, s3Key: string }`  
**Auth:** Protected (requires valid session)

### `invoiceExtraction.extract`

Triggers LLM-based extraction of the uploaded PDF. Uses the built-in `invokeLLM` with a structured JSON schema response format.

**Input:** `{ extractionId: string }`  
**Output:** `{ success: boolean, lineItems: LineItem[], paymentMethod: PaymentMethod }`  
**Auth:** Protected

### `invoiceExtraction.autoLinkPayment`

Attempts to match the extracted `paymentMethod.last4` against known `financial_accounts` in the household.

**Input:** `{ extractionId: string }`  
**Output:** `{ linked: boolean, accountId?: string, accountName?: string }`  
**Auth:** Protected

### `invoiceExtraction.getLineItems`

Returns the extracted line items for display in the categorization UI.

**Input:** `{ orderId: string }`  
**Output:** `{ lineItems: LineItem[], paymentMethod: PaymentMethod, linked: boolean, accountName?: string }`  
**Auth:** Protected

---

## 5. Frontend Integration

### Extension Detection

The web app communicates with the extension via `window.postMessage` or a custom DOM element that the extension's content script reads. Detection flow:

1. Web app sets `window.__GEEVES_EXTENSION_CHECK = true`
2. Extension content script (injected on geeves.life) responds by setting `window.__GEEVES_EXTENSION_INSTALLED = true`
3. Web app checks after 500ms timeout; if not set, shows install banner

### Categorization UI Changes

When an invoice extraction exists for an order:

1. **Line Item Panel** appears below the order detail card showing individual items with quantities and prices
2. **Per-Item Categorization** toggle allows assigning different verticals/categories to individual line items (future enhancement)
3. **Bulk Categorization** (default) applies the chosen vertical/category to all line items
4. **Payment Account Badge** shows the auto-linked account or a dropdown for manual selection

### Capture Button

A "Capture Invoice" button appears on each pending order row when:
- The extension is detected as installed
- The order has a `walmartUrl` or vendor URL available
- No extraction already exists for this order

---

## 6. Audit Compliance

All extraction and auto-linking events emit audit logs per the Cardinal Audit Standard:

| Event | actorType | metadata |
|-------|-----------|----------|
| Invoice uploaded | `system_extension` | `{ s3Url, orderId, vendorName }` |
| Extraction completed | `system` | `{ s3Url, lineItemCount, orderTotal }` |
| Payment auto-linked | `system` | `{ s3Url, last4, accountId, accountName }` |
| Payment manually linked | `user` | `{ s3Url, last4, accountId }` |

---

## 7. Implementation Phases

### Phase 1: Backend Infrastructure (This Sprint)
- Add `invoice_extractions` table to schema
- Implement `getUploadUrl`, `extract`, `autoLinkPayment`, `getLineItems` procedures
- Add extension detection logic to categorization UI
- Add line item display panel (reads from extraction data)
- Add payment account auto-link display

### Phase 2: Chrome Extension Build (Next Sprint)
- Manifest V3 scaffold with React + TailwindCSS popup
- Background service worker with OAuth token management
- Walmart content script (DOM selectors for invoice download)
- Download interception and S3 upload flow
- Popup UI with pending tasks and status

### Phase 3: Multi-Vendor Expansion
- Amazon content script
- Target content script
- Uber content script
- Unified extraction pipeline with vendor-specific prompt tuning

---

## 8. Relationship to Existing Schema

This feature **extends** the existing Walmart Categorization Tool without replacing it:

- `walmart_orders` remains the source of truth for order metadata
- `walmart_order_categorizations` remains the destination for vertical/category assignments
- `invoice_extractions` adds a new layer of invoice-level detail (line items, payment method)
- The categorization UI gains optional line-item visibility when an extraction exists
- Orders without extractions continue to work exactly as before (order-level categorization)

---

*This document was created Jul 7, 2026 as part of Issue 0: Design Document Review.*
