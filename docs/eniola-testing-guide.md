# Geeves.Life — QA Testing Guide for Eniola
**Date:** June 20, 2026  
**Prepared by:** Supah-T / Geeves.Life  
**Tester:** Eniola (Executive Assistant)  
**Environment:** [https://geeves.manus.space](https://geeves.manus.space)

---

## Overview

This document covers five testing areas in sequence. Please complete them in order, as some later tests depend on setup done in earlier ones. For each test, note the result (Pass / Fail / Partial) and any screenshots or observations.

**Your role:** You are logged in as an **Executive Assistant (EA)**. This role gives you full calendar access, the ability to manage bookings, and — as of this build — the ability to invite new household members. You will use this invite capability in Section 4 to set up Cary's account.

---

## Section 1 — Outbound iCal Setup (All Three Properties)

### Background

Each property has a **Geeves.Life Outbound ICS URL** — a live `.ics` file hosted on S3 that contains all confirmed bookings plus prep-day blocks. This URL must be subscribed to in Airbnb, VRBO, and Booking.com so those platforms block the correct dates automatically.

All three URLs have now been generated. Your first task is to paste them into each platform's iCal import field.

### Outbound ICS URLs

| Property | Outbound ICS URL |
|---|---|
| **Sunset Studio** | `https://d2xsxph8kpxj0f.cloudfront.net/310519663295472478/mhfpBZgGttr5P7pgfv7LpQ/property-ical/Ln-_SMF7Nrt1uXsQcdP9C/availability.ics` |
| **Morabeza** | `https://d2xsxph8kpxj0f.cloudfront.net/310519663295472478/mhfpBZgGttr5P7pgfv7LpQ/property-ical/nJnk4hr3AxZJZ-RkwhRJy/availability.ics` |
| **The Artiste's Boutique** | `https://d2xsxph8kpxj0f.cloudfront.net/310519663295472478/mhfpBZgGttr5P7pgfv7LpQ/property-ical/ZI2Zy7OuLGYF-vmWOAII-/availability.ics` |

> You can also copy these URLs from within the app: go to **Properties → [Property Name] → Platforms tab → "Copy URL"** button next to "Outbound ICS."

### Steps per Platform

**Airbnb:**
1. Log in to Airbnb Host → Listings → [Property] → Availability → Sync Calendars
2. Click **"Export Calendar"** to get the Airbnb inbound URL (paste this into Geeves.Life as the inbound feed)
3. Click **"Import Calendar"** → paste the Geeves.Life Outbound ICS URL above
4. Repeat for all three properties

**VRBO / Vrbo:**
1. Log in to VRBO Owner → [Property] → Calendars → Import Calendar
2. Paste the Geeves.Life Outbound ICS URL
3. Repeat for all three properties

**Booking.com:**
1. Log in to Booking.com Extranet → [Property] → Calendar → iCal Sync
2. Under "Import Calendar" paste the Geeves.Life Outbound ICS URL
3. Note: Booking.com may show "Activating" for up to 30 minutes after pasting — this is normal
4. Repeat for all three properties

### Verification

After setup, open each ICS URL directly in a browser — it should download a `.ics` file. Open it in a text editor or import it into Google Calendar temporarily to confirm it contains `BOOKED` and `PREP TIME` events.

| Test | Expected | Result |
|---|---|---|
| Sunset Studio ICS URL is accessible | Downloads a `.ics` file with events | |
| Morabeza ICS URL is accessible | Downloads a `.ics` file with events | |
| Artiste's Boutique ICS URL is accessible | Downloads a `.ics` file with events | |
| Airbnb shows Geeves.Life calendar as imported | Status: Active (not "Activating") | |
| VRBO shows Geeves.Life calendar as imported | Status: Active | |
| Booking.com shows Geeves.Life calendar as imported | Status: Active (may take 30 min) | |

---

## Section 2 — Sunday & Holiday Prep Rule Verification

### The Rule (as designed)

The Sunday and Holiday prep rules do **not** block all Sundays or all holidays as check-in days. They are narrowly scoped:

> **If the cleaning window between two consecutive bookings falls entirely on a Sunday or national holiday, a blocking event is automatically added to prevent a same-day turnover that would force cleaning on those days.**

The rule does **not** prevent guests from checking in on Sundays or holidays in general — it only triggers when a checkout creates a cleaning obligation on those days.

### Current Rule Settings

| Property | Days Before | Days After | Block Sundays | Block Holidays | Country |
|---|---|---|---|---|---|
| Sunset Studio | 1 | 1 | ✅ Yes | ✅ Yes | US |
| Morabeza | 1 | 1 | ✅ Yes | ✅ Yes | US |
| The Artiste's Boutique | 1 | 1 | ✅ Yes | ❌ No | JM |

### How to Verify a Block

1. Open the property's Outbound ICS URL in a browser (download the `.ics` file)
2. Import it into Google Calendar (temporary import is fine)
3. Navigate to the specific date in question
4. Confirm a `PREP TIME` or `BLOCKED` event covers that date

### Test Cases — Sunset Studio (US, blockSundays + blockNationalHolidays)

| # | Guest | Checkout | Checkout Day | Rule Triggered | Block Expected On | First Valid Check-in |
|---|---|---|---|---|---|---|
| 1 | Reserved - Carol | Jul 26, 2026 | **Sunday** | Checkout on Sunday | Jul 26–27 | Jul 28 (Mon) |
| 2 | Reserved - Earnest | Jul 19, 2026 | **Sunday** | Checkout on Sunday | Jul 19–20 | Jul 21 (Mon) |
| 3 | Reserved - Nancy | Jul 12, 2026 | **Sunday** | Checkout on Sunday | Jul 12–13 | Jul 14 (Mon) |
| 4 | Reserved - Josh | Jul 5, 2026 | **Sunday** | Checkout on Sunday | Jul 5–6 | Jul 7 (Mon) |
| 5 | Reserved - Boryana | Jun 7, 2026 | **Sunday** | Checkout on Sunday | Jun 7–8 | Jun 9 (Mon) |
| 6 | Reserved - Daniel | Oct 11, 2026 | **Sunday** | Checkout on Sunday + prep day falls on Columbus Day (Oct 12) | Oct 11–13 | Oct 13 (Tue) |
| 7 | Reserved - Arianna | May 10, 2026 | **Sunday** | Checkout on Sunday | May 10–11 | May 12 (Mon) |
| 8 | Reserved - Ciara | May 3, 2026 | **Sunday** | Checkout on Sunday | May 3–4 | May 5 (Mon) |

### Test Cases — Morabeza (US, blockSundays + blockNationalHolidays)

| # | Guest | Checkout | Checkout Day | Rule Triggered | Block Expected On | First Valid Check-in |
|---|---|---|---|---|---|---|
| 1 | Booking.com Reservation | Jun 28, 2026 | **Sunday** | Checkout on Sunday | Jun 28–29 | Jun 30 (Mon) |
| 2 | Booking.com Reservation | Jun 21, 2026 | **Sunday** | Checkout on Sunday | Jun 21–22 | Jun 23 (Mon) |
| 3 | Booking.com Reservation | Jul 26, 2026 | **Sunday** | Checkout on Sunday | Jul 26–27 | Jul 28 (Mon) |
| 4 | Reserved - Angie | Jul 12, 2026 | **Sunday** | Checkout on Sunday | Jul 12–13 | Jul 14 (Mon) |
| 5 | Reserved - Xing | May 24, 2026 | **Sunday** | Checkout on Sunday + prep day falls on Memorial Day (May 25) | May 24–26 | May 26 (Tue) |
| 6 | Booking.com Reservation | Aug 22, 2026 | Saturday | Prep day (Aug 23) falls on **Sunday** | Aug 23 blocked | Aug 24 (Mon) |

### Test Cases — The Artiste's Boutique (JM, blockSundays only)

| # | Guest | Checkout | Checkout Day | Rule Triggered | Block Expected On | First Valid Check-in |
|---|---|---|---|---|---|---|
| 1 | Reserved - Lisa | Jun 20, 2026 | Saturday | Prep day (Jun 21) falls on **Sunday** | Jun 21 blocked | Jun 22 (Mon) |
| 2 | Reserved (Jul booking) | Jul 25, 2026 | Saturday | Prep day (Jul 26) falls on **Sunday** | Jul 26 blocked | Jul 27 (Mon) |
| 3 | Reserved (Aug booking) | Aug 1, 2026 | Saturday | Prep day (Aug 2) falls on **Sunday** | Aug 2 blocked | Aug 3 (Mon) |

### Pass Criteria

For each test case: open the outbound ICS and confirm a `PREP TIME` or `BLOCKED` event covers the "Block Expected On" date range. If the block is missing, mark as **Fail** and note the case number.

---

## Section 3 — Email Scraping Status Check

### Current Status

Before testing the full member flow, verify that email scraping is working so guest and financial data is visible in the app.

| Property | Property Email | Total Bookings | Guest Data | Revenue Data | Status |
|---|---|---|---|---|---|
| Sunset Studio | tarikp.us@gmail.com | 27 | 0 (0%) | 0 (0%) | ❌ Not scraped |
| Morabeza | tarikp.us@gmail.com | 18 | 0 (0%) | 0 (0%) | ❌ Not scraped |
| The Artiste's Boutique | tarikp.us@gmail.com | 12 | 1 (8%) | 0 (0%) | ⚠️ Partial |
| Apartment #1 | (not set) | 0 | — | — | ⚠️ No email configured |
| Apartment #2 | (not set) | 0 | — | — | ⚠️ No email configured |

**Email scrape jobs run to date: 0** — no scraping has been triggered yet.

### Steps to Trigger Scraping

1. Log in to Geeves.Life as the owner
2. Go to **Properties → [Property Name] → Platforms tab**
3. Click **"Scrape Emails"** (or equivalent button) to trigger a scrape job for that property
4. Wait for the job to complete (progress shown in the UI)
5. Refresh the bookings list — guest names, emails, and revenue should now populate

### Verification

| Test | Expected | Result |
|---|---|---|
| Scrape job starts without error | Status changes to "running" | |
| Scrape job completes | Status changes to "done"; emails scanned > 0 | |
| Sunset Studio bookings show guest names | At least some bookings have guestName populated | |
| Morabeza bookings show guest names | At least some bookings have guestName populated | |
| Revenue data appears | At least some bookings show totalPrice or netAmount | |
| No financial data visible to member accounts | Verified in Section 4 below | |

> **If scraping fails:** Note the error message shown in the UI and report back. The most likely cause is that the Gmail OAuth token for `tarikp.us@gmail.com` needs to be re-authorized.

---

## Section 4 — New Member Flow (Full End-to-End)

This section tests the complete lifecycle of creating a new household member, verifying their access, and confirming that privacy rules are enforced.

### 4A — Invite a New Member (as Eniola / EA)

As an Executive Assistant, you have permission to send member invites. You do **not** need to log in as the owner for this step.

1. Log in to Geeves.Life as yourself (Eniola)
2. Go to **Household Members** in the left sidebar (the Constellation screen)
3. Click **"Invite Member"**
4. Fill in:
   - Name: `Cary` (use Cary's actual email address so he can receive the invite)
   - Role: `Member`
   - Relationship: `Friend` (or appropriate)
5. Click **"Send Invite"**

**Expected:** The invite button shows a spinner briefly, then a success toast appears. An email arrives at Cary's inbox with an invitation link.

| Test | Expected | Result |
|---|---|---|
| Invite button is visible to Eniola (EA role) | "Invite Member" button appears on the Constellation screen | |
| Invite sends without spinning forever | Completes within 10 seconds | |
| Invite email received by Cary | Email arrives within 2 minutes | |
| Invite email contains a valid link | Link is clickable and goes to Geeves.Life | |

### 4B — Accept the Invite and Log In (as Cary)

1. Cary opens the invite email
2. Cary clicks the invite link
3. Cary logs in using his Google account (the email used for the invite)
4. He should land on the Geeves.Life member dashboard

| Test | Expected | Result |
|---|---|---|
| Invite link works | Redirects to Geeves.Life login | |
| Login completes | Member dashboard loads | |
| Member name shown correctly | Shows "Cary" or his name | |

### 4C — Calendar Access Verification (as Cary)

As the new member (Cary), verify the calendar shows the correct information.

1. Go to **Calendar** in the member dashboard
2. Observe what is visible

**Expected behavior:**
- Owner's calendar shows as **all blocked out** (availability blocks only — no event titles, descriptions, or details)
- Property arrival and departure dates are visible
- Multi-day ongoing stays (e.g., a guest staying for 7 days) are **not** shown unless the "Exclude multi-day events" toggle is off
- No financial data (revenue, pricing) is visible anywhere on the calendar
- No guest personal information (guest names, emails, phone numbers) is visible

| Test | Expected | Result |
|---|---|---|
| Calendar loads for member | Calendar view renders without error | |
| Owner's time shows as blocked | Busy blocks visible, no event details | |
| Property arrivals/departures visible | Check-in/check-out markers shown | |
| No financial data visible | No revenue, pricing, or commission figures | |
| No guest PII visible | No guest names, emails, or phone numbers | |
| Member cannot edit or delete events | Edit/delete buttons absent or disabled | |

### 4D — Property Gantt Chart Access (as Cary)

As the new member (Cary), verify the Property Gantt chart shows limited details.

1. Go to **Properties** in the member dashboard (if visible)
2. Open the Gantt/timeline view for a property that has been approved for this member

**Expected behavior:**
- Gantt chart shows booking bars (dates blocked)
- No guest names on the bars (or anonymized as "Guest")
- No revenue figures
- No platform-specific booking details
- Member cannot click through to booking details

| Test | Expected | Result |
|---|---|---|
| Properties section accessible to member | Properties tab visible in navigation | |
| Gantt chart loads | Timeline renders with booking bars | |
| Guest names anonymized | Bars show "Guest" or no name, not real guest names | |
| No financial data on Gantt | No revenue, pricing, or commission figures | |
| Booking detail click disabled | Clicking a bar does not open full booking details | |

### 4E — Meeting/Booking Request (as Cary)

As the new member (Cary), test the ability to request free time with the owner.

1. Go to **Calendar**
2. Find a time slot that appears free (not blocked)
3. Click on the free slot or use the "Request Time" button
4. Fill in the request details and submit

**Expected behavior:**
- Member can see which times are free (owner's busy blocks are visible, free slots are clear)
- Member can submit a meeting request for a free slot
- Owner receives a notification of the request
- Member cannot see the reason why a slot is busy (no event details, just "Busy")

| Test | Expected | Result |
|---|---|---|
| Free slots are identifiable | Some time slots appear unblocked | |
| Meeting request form opens | Dialog/form appears on click | |
| Request submits successfully | Success toast appears | |
| Owner receives notification | Check owner account for notification | |
| Busy slot details hidden | Clicking a busy slot shows "Busy" only, no details | |

### 4F — Member Permissions Verification (Owner Side)

Switch back to the owner account and verify the Member Permissions settings for Cary.

1. Log in as owner (Supah-T)
2. Go to **Member Permissions** in the left sidebar
3. Select **Cary** from the Member dropdown
4. Leave the Vertical Filter set to **All Verticals** to see the full picture

**Expected — Action Permissions section:**
- Cary's role (Member) is shown with a badge
- Permission groups are collapsible (Household, Calendar, Bookings, etc.)
- Role-default permissions are toggled on; non-default are off
- You can toggle any permission on/off; an "Override" badge appears when a permission differs from the role default
- The reset (↺) button reverts a permission back to the role default

**Expected — Data Visibility section:**
- Each vertical Cary has access to shows access level and calendar access dropdowns
- Four data category toggles appear per vertical (Financial, Private, Guest Information, Operational)
- Toggling "Financial Data" to hidden means Cary cannot see revenue figures

**Expected — EA Delegation toggle (top right, owner only):**
- Toggle labelled "EA Can Manage Permissions" is visible
- When turned off, Eniola can no longer access this page

| Test | Expected | Result |
|---|---|---|
| Cary appears in the Member dropdown | Selectable with "Member" role badge | |
| Action Permissions section loads | Permission groups visible and collapsible | |
| Permission toggle saves | Toggle a permission, refresh — change persists | |
| Override badge appears | Badge shows "Override: Granted" or "Override: Revoked" | |
| Reset button reverts override | Click ↺, badge disappears, permission returns to role default | |
| Data Visibility section loads | Verticals listed with access level dropdowns | |
| Financial data toggle saves | Toggle off, refresh — persists | |
| EA Delegation toggle visible to owner | Toggle shown in top-right of page | |
| EA Delegation toggle hidden from Eniola | Eniola does not see the EA delegation toggle | |

---

## Section 5 — Known Issues & Gaps to Note

The following items are known gaps that are **not** expected to pass in this testing round. Please note them as "Known Gap" rather than "Fail."

| Item | Status | Notes |
|---|---|---|
| Email scraping not yet triggered | ❌ No jobs run | Guest names and revenue data will be absent until scraping is triggered manually. |
| Apartment #1 and #2 have no property email | ⚠️ Config gap | Email scraping cannot run for these properties until a property email is set. |

---

## Reporting

Please complete this document by filling in the **Result** column for each test table. Use:
- ✅ **Pass** — works as expected
- ❌ **Fail** — does not work; describe what happened
- ⚠️ **Partial** — partially works; describe what is missing
- 🔵 **Known Gap** — listed in Section 5 above

Return the completed document to Supah-T when done. Screenshots are helpful for any Fail or Partial results.

---

*Document prepared by Geeves.Life system — June 20, 2026*
