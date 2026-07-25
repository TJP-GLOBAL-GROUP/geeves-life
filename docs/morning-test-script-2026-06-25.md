# Morning Test Script — Jun 25, 2026

> **Publish first:** Click Publish in the Management UI on checkpoint `d779bcfa` before running these tests. All tests should be run on **geeves.life** (not the sandbox preview URL).

---

## 1. iCal Sync — Verify Heartbeat Is Working

**Where:** SuperAdmin → Sync Status tab

**Steps:**
1. Navigate to `/super-admin` and click the **Sync Status** tab.
2. Confirm the matrix shows all 9 platform/property pairs.
3. Check that **Last Polled** timestamps are within the last 10–15 minutes (the heartbeat runs every 10 minutes).
4. Confirm **Seneca Sunset Studios / VRBO** row shows a `⚠️ CRITICAL` badge (inactive listing pushing blocks).
5. Confirm all other rows show green sync status with booking counts > 0 where expected.

**Pass criteria:** All 9 feeds show a recent `lastPolledAt`; no rows show "Never polled" or timestamps older than 30 minutes.

---

## 2. Gantt Financial Summary Row

**Where:** Dashboard → Properties widget → any property Gantt

**Steps:**
1. Navigate to `/dashboard`.
2. Scroll to the Properties widget.
3. On any property that has bookings with financial data (Morabeza, Artiste's Boutique), look below the Gantt bar.
4. Confirm you see a row like: `2bk · Rev $450 · Comm −$45 · Net $405` in a muted bordered container.
5. The Net value should be in **Golden Yellow**.
6. On a property with no financial data, confirm the row is absent (no empty container shown).

**Pass criteria:** Financial row visible with all three values; Net in Golden Yellow; absent when no data.

---

## 3. Stale Data Banner — Dismiss Fix

**Where:** Dashboard → Properties widget

**Steps:**
1. If a stale data warning banner appears at the top of the Properties widget, click **Refresh**.
2. Confirm the banner disappears after the refresh completes.
3. Confirm it does NOT reappear immediately after dismissal.

**Pass criteria:** Banner dismisses cleanly after a successful refresh and stays dismissed.

---

## 4. MonthView +N Overflow Chip

**Where:** Calendar → Month view

**Steps:**
1. Navigate to `/calendar` and switch to **Month** view.
2. Find a day that has more than 3 all-day events (or property booking bars stacked).
3. Confirm a `+N more` chip appears below the visible events.
4. Click the chip and confirm it expands to show all events for that day.

**Pass criteria:** +N chip visible on overflow days; expands on click.

---

## 5. Settings — Property Booking Calendars Section

**Where:** Settings → Calendars tab

**Steps:**
1. Navigate to `/settings?tab=calendars`.
2. Scroll down past the Google account calendar groups.
3. Confirm a new **"Property Booking Calendars"** section appears with an amber `iCal` badge.
4. Expand it and confirm you see: Morabeza (Bookings), Sunset Studio (Bookings), The Artiste's Boutique (Bookings).
5. Confirm each has a vertical assignment dropdown showing "Bohemian Lodges".
6. Confirm the old "Legacy / Other Calendars" section no longer contains these iCal feeds.

**Pass criteria:** All 3 property booking calendars in the dedicated section; none in Legacy.

---

## 6. Landing Page Logo — Mobile

**Where:** geeves.life on mobile browser

**Steps:**
1. Open `https://geeves.life` on your phone.
2. Confirm the constellation mark logo appears in the top-left of the navbar (not a broken image icon).
3. Confirm the hero section shows the full Geeves.Life wordmark logo.
4. Confirm no white/dark background box is visible around the logo.

**Pass criteria:** Logo renders correctly on mobile; no broken image icons; no background box.

---

## 7. VRBO Inactive Listing — Sync Matrix Audit

**Where:** SuperAdmin → Sync Status tab + Properties page

**Steps:**
1. In the Sync Status matrix, click on the **Seneca Sunset Studios / VRBO** row.
2. Note the number of VRBO blocks listed (these are `VFREEBUSY` platform blocks, not real bookings).
3. Navigate to `/properties` → Seneca Sunset Studios → Platforms tab.
4. Confirm VRBO is listed with `isActive = false` and a red/inactive GeeveNode.
5. Check the main calendar (Month view) for any VRBO blocks appearing as bookings — these should NOT appear as guest bookings.

**Pass criteria:** VRBO blocks correctly identified as platform blocks (not guest bookings); property shows inactive status.

---

## 8. SuperAdmin — Sync Status Tab (Full Matrix)

**Where:** SuperAdmin → Sync Status tab

**Expected matrix (property × platform):**

| Property | Airbnb | VRBO | Booking.com | Direct |
|---|---|---|---|---|
| Morabeza | ✅ Syncing | ✅ Syncing | ✅ Syncing | — |
| Seneca Sunset Studios | ✅ Syncing | ⚠️ CRITICAL (inactive) | — | — |
| The Artiste's Boutique | ✅ Syncing | ✅ Syncing | ✅ Syncing | — |
| Seneca Sunset Suites | ✅ Syncing | — | — | — |
| Morabeza Apt 2 | ✅ Syncing | — | — | — |

**Pass criteria:** Matrix matches the above; VRBO Seneca Studio shows critical badge; all active feeds show recent poll timestamps.

---

## Known Issues (Not Blocking)

These are documented open items that are **not** expected to be fixed yet:

- `tarik.perkins@startout.org` OAuth token is expired — reconnect via Settings → Integrations → Reconnect button. This causes calendar sync warnings in the server logs but does not affect property booking sync.
- Duplicate calendar records for `tarik.perkins@startout.org` and `tarikp@gmail.com` exist in the DB — these are harmless (all have correct verticalIds) but will be cleaned up in the next sprint.
- VRBO VFREEBUSY blocks from the inactive Seneca Sunset Studios listing may appear on the main calendar as "Blocked" entries — investigation and filter pending.

---

*Test script generated by autonomous overnight session. All 182 tests passing, 0 TypeScript errors at time of checkpoint.*
