# Walmart Categorizer — Comprehensive Test Script

**Prepared for:** Eniola (QA Tester)
**Date:** July 7, 2026
**Version:** 1.0
**Check-in deadline:** 5:30 AM ET

---

## Pre-Test Setup

1. Log in to Geeves.Life at https://geeves.life
2. Navigate to **Expenses → Walmart Categorization** from the sidebar
3. Confirm you see the stats bar at the top (Pending / Categorized / Split / Skipped counts)
4. Confirm the filter tabs are visible: All, Pending, Categorized, Split, Skipped
5. Ensure at least 3 orders exist in "Pending" status for testing

---

## Section A: Single-Vertical Categorization with Fixed Category

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| A1 | Click on a **Pending** order from the list | Detail panel opens showing order date, total, items, and thumbnails | | |
| A2 | Confirm the "Single Vertical" button is active (highlighted) by default | Button shows filled/default variant, "Split Across Verticals" shows outline | | |
| A3 | Click **Home & Family** vertical tile | Tile highlights with ring, QBO Category dropdown appears below | | |
| A4 | Open the QBO Category dropdown | Shows categories: "Home: Mortgage/Rent", "Home: Groceries", etc. (11 options) | | |
| A5 | Select **"Home: Groceries"** from the dropdown | Dropdown closes, selected value shown in trigger | | |
| A6 | Click **"Assign & Next"** button | Toast: "Order assigned to vertical." Order advances to next pending order | | |
| A7 | Switch filter to **"Categorized"** tab | Previously categorized order appears in the list | | |
| A8 | Click on the just-categorized order | Detail panel shows green "Assigned" card with Home & Family icon, "Home: Groceries" label | | |

---

## Section B: Single-Vertical Categorization with Custom Category

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| B1 | Switch filter back to **"Pending"**, select an order | Detail panel opens with categorization form | | |
| B2 | Click **Maxfield Bakery** vertical tile | Tile highlights, QBO Category dropdown appears | | |
| B3 | **Do NOT select from dropdown.** Instead, click the "Or type a custom category..." input field | Input field receives focus, cursor blinks | | |
| B4 | Type **"Bakery: Special Event Supplies"** — type the FULL string without pausing | **CRITICAL:** Text should appear character by character without losing focus. You should NOT need to re-click the field between characters | | |
| B5 | Delete what you typed and retype it slowly, one character at a time | Each character appears, cursor stays in the field, no focus loss | | |
| B6 | Click **"Assign & Next"** | Toast: "Order assigned to vertical." Advances to next order | | |
| B7 | Find the order in "Categorized" tab and click it | Shows "Assigned" with Maxfield Bakery icon and "Bakery: Special Event Supplies" as category | | |

---

## Section C: Bohemian Lodges with Property Selector

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| C1 | Select a **Pending** order | Detail panel opens | | |
| C2 | Click **Bohemian Lodges** vertical tile | Tile highlights, QBO Category dropdown AND Property dropdown both appear | | |
| C3 | Select **"Bohemian: Repairs & Maintenance"** from QBO Category | Category selected | | |
| C4 | Open the Property dropdown | Shows: Morabeza, Sunset Studio, The Artiste's Boutique, Penthouse, Sunset Studio + Morabeza, All Properties | | |
| C5 | Select **"Morabeza"** | Property selected, shown in trigger | | |
| C6 | Click **"Assign & Next"** | Toast success, advances | | |
| C7 | Verify in Categorized tab | Shows Bohemian Lodges icon, "Bohemian: Repairs & Maintenance", and "Morabeza" property label | | |

---

## Section D: Split by Percentage (Two Verticals)

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| D1 | Select a **Pending** order (note the total amount, e.g. $47.82) | Detail panel opens | | |
| D2 | Click **"Split Across Verticals"** button | Button highlights, "%" toggle is active by default, "+ Add Split" button appears | | |
| D3 | Click **Home & Family** vertical tile | Tile highlights | | |
| D4 | Select a category (e.g. "Home: Groceries") | Category selected | | |
| D5 | Click **"+ Add Split"** button | A split row appears showing "Home & Family" with 50% default and calculated dollar amount | | |
| D6 | Click **Personal** vertical tile | Personal tile highlights | | |
| D7 | Select **"Personal: Food & Groceries"** category | Category selected | | |
| D8 | Click **"+ Add Split"** again | Second split row appears. Both rows show 50% each | | |
| D9 | In the first split row, change percentage from 50 to **70** | Dollar amount updates to 70% of order total. Total line shows 120% (over-allocation warning expected) | | |
| D10 | In the second split row, change percentage to **30** | Dollar amounts recalculate. Total shows 100%. Dollar total matches order total | | |
| D11 | Click **"Save Split & Next"** | Toast: "Order split across verticals." Advances to next order | | |
| D12 | Switch to **"Split"** filter tab | The split order appears in the list | | |
| D13 | Click the split order | Shows "Split Assignment" card with both verticals, percentages, and dollar amounts | | |

---

## Section E: Split by Dollar Amount (Three Verticals)

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| E1 | Select a **Pending** order (note total, e.g. $125.00) | Detail panel opens | | |
| E2 | Click **"Split Across Verticals"** | Split mode activates | | |
| E3 | Click the **"$"** toggle button (next to the "%" button) | Dollar entry mode activates ($ button highlighted) | | |
| E4 | Select **Maxfield Bakery**, category "Bakery: Supplies", click "+ Add Split" | Split row appears with dollar input field | | |
| E5 | Type **50.00** in the dollar amount field | Shows $50.00 with percentage calculated (e.g. 40%) | | |
| E6 | Select **Maxfield Market**, category "Market: Job Supplies", click "+ Add Split" | Second split row appears | | |
| E7 | Type **45.00** in dollar field | Shows $45.00 with percentage | | |
| E8 | Select **Home & Family**, category "Home: Miscellaneous", click "+ Add Split" | Third split row appears | | |
| E9 | Type **30.00** in dollar field | Total line shows: $125.00 of $125.00 (100%) | | |
| E10 | Click **"Save Split & Next"** | Toast success, advances | | |
| E11 | Verify in Split tab | Shows 3-way split with correct dollar amounts and percentages | | |

---

## Section F: Re-categorization (Single → Single)

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| F1 | Go to **"Categorized"** tab and select an order previously categorized as Home & Family | Detail shows green "Assigned" card with current assignment | | |
| F2 | Click the **"Re-categorize"** pencil button | Amber "Re-categorizing this order" banner appears above the form. Form is empty/ready for new assignment | | |
| F3 | Select **Personal** vertical | Personal tile highlights | | |
| F4 | Select **"Personal: Entertainment"** category | Category selected | | |
| F5 | Click **"Assign & Next"** | Toast: "Order assigned to vertical." **Order stays selected** (does NOT advance to next) | | |
| F6 | Verify the green card now shows **Personal** with "Personal: Entertainment" | Old Home & Family assignment is gone, replaced by new one | | |
| F7 | Confirm the order is still in the **"Categorized"** tab (not moved to Pending) | Order remains in Categorized with new assignment | | |

---

## Section G: Re-categorization (Split → Single)

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| G1 | Go to **"Split"** tab and select a previously split order | Detail shows "Split Assignment" card with multiple verticals | | |
| G2 | Click **"Re-categorize"** pencil button | Amber banner appears, form ready for new assignment | | |
| G3 | Confirm **"Single Vertical"** is the default mode | Single Vertical button is highlighted | | |
| G4 | Select **StartOut** vertical, category **"StartOut: Technology"** | Selections made | | |
| G5 | Click **"Assign & Next"** | Toast success. **Order stays selected.** | | |
| G6 | Verify green card now shows **StartOut** only — no split | Single assignment, old split is completely gone | | |
| G7 | Confirm the order has moved from "Split" tab to **"Categorized"** tab | Status changed from 'split' to 'categorized' | | |

---

## Section H: Re-categorization (Single → Split)

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| H1 | Go to **"Categorized"** tab, select an order with single assignment | Shows single vertical assignment | | |
| H2 | Click **"Re-categorize"** | Amber banner, form ready | | |
| H3 | Click **"Split Across Verticals"** button | Split mode activates | | |
| H4 | Add two splits: Home & Family 60%, Maxfield Bakery 40% | Both split rows visible with correct percentages | | |
| H5 | Click **"Save Split & Next"** | Toast success. Order stays selected. | | |
| H6 | Verify green card now shows **"Split Assignment"** with both verticals | Split is saved correctly | | |
| H7 | Confirm order moved from "Categorized" to **"Split"** tab | Status changed from 'categorized' to 'split' | | |

---

## Section I: Memo/Notes Field

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| I1 | Select any order (Pending or Categorized) | Detail panel opens | | |
| I2 | Find the memo/notes text area (below the order details) | Textarea visible with placeholder or existing memo | | |
| I3 | Click into the memo field | Cursor appears, field has focus | | |
| I4 | Type a full sentence: **"This order includes items for the July 4th party at Morabeza"** | **CRITICAL:** Text appears smoothly without focus loss. You should NOT need to re-click between characters | | |
| I5 | Click outside the memo field (blur) | Toast: "Memo saved." — memo auto-saves on blur | | |
| I6 | Navigate away to another order, then come back | Memo text persists — shows the saved text | | |

---

## Section J: Skip Functionality

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| J1 | Select a **Pending** order | Detail panel opens | | |
| J2 | Click **"Skip"** button (bottom right of form) | Toast: "Order skipped." Advances to next order | | |
| J3 | Switch to **"Skipped"** tab | Skipped order appears in the list | | |
| J4 | Click the skipped order | Detail shows order info but no "Assigned" card (it was skipped, not categorized) | | |

---

## Section K: Navigation and Pagination

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| K1 | Switch to **"All"** tab | All orders shown regardless of status | | |
| K2 | If more than 20 orders exist, check for pagination controls | Next/Previous page buttons visible at bottom | | |
| K3 | Click next page | New set of orders loads | | |
| K4 | Click an order, then use the **← →** navigation arrows in the detail panel header | Navigates between orders in the current list without going back to list view | | |

---

## Section L: Mobile Responsiveness

| # | Step | Expected Result | Pass/Fail | Notes |
|---|------|-----------------|-----------|-------|
| L1 | Resize browser to mobile width (< 768px) or use phone | Layout switches to single-column: list view only | | |
| L2 | Tap an order | Transitions to detail view (list hidden) | | |
| L3 | Tap the **back arrow** at top of detail view | Returns to list view | | |
| L4 | In detail view, test the custom category input field | Focus retained, can type full text without issues | | |
| L5 | In detail view, test the memo field | Focus retained, can type full text without issues | | |

---

## Section M: Chrome Extension Integration (PLANNED — Not Yet Testable)

> **Note:** The following features have backend support but no frontend UI yet. These tests are deferred until the Chrome Extension UI integration is complete.

| # | Feature | Status |
|---|---------|--------|
| M1 | Extension detection banner on Walmart Categorization page | Not yet built |
| M2 | "Capture Invoice" button on pending orders | Not yet built |
| M3 | Line item display from extracted invoice PDF | Not yet built |
| M4 | Per-item categorization (assign individual line items to different verticals) | Not yet built |
| M5 | Payment account auto-link badge | Not yet built |
| M6 | Manual payment account fallback dropdown | Not yet built |

---

## Known Issues (Fixed in This Release)

1. **Focus loss in custom category field** — Previously, typing would lose focus after each character. Fixed by converting inner components to inline JSX.
2. **Focus loss in memo/notes field** — Same root cause as above. Fixed.
3. **Re-categorization failure (split → single)** — Previously, re-categorizing a split order to a single vertical would land it back in Pending with old split intact. Fixed: order now stays selected and new categorization is applied correctly.

---

## Reporting Instructions

For each test case:
- Mark **Pass** if behavior matches expected result exactly
- Mark **Fail** if behavior deviates, and add a note describing what actually happened
- Include screenshots for any failures
- Note the order ID (visible in the URL or detail panel) for any failed tests

**Priority failures to escalate immediately:**
- Any focus loss (Sections B4-B5, I4, L4-L5)
- Any re-categorization data loss (Sections F-H)
- Any order landing in wrong status tab after categorization

**Submit results to:** Supah-T before the 5:30 AM ET check-in call
