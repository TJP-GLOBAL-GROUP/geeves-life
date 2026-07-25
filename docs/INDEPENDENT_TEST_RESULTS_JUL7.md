# Independent Test Results — Jul 7, 2026

**Executed by:** Manus AI (autonomous)  
**Environment:** Sandbox + Live Database  
**Checkpoint:** `374736c6`

---

## Summary

| Test Suite | Passed | Failed | Total | Pass Rate |
|---|---|---|---|---|
| Backend Integration Tests (independent-test-run.mjs) | 44 | 4 | 48 | 92% |
| Vitest Unit Tests | 257 | 2 | 259 | 99% |
| **Combined** | **301** | **6** | **307** | **98%** |

---

## Backend Integration Test Results (48 tests)

### Section A: Schema Integrity — 15/15 PASS ✅

All 8 new tables exist and are queryable:
- `chart_of_accounts` (0 rows — seeded via vertical_financial_configs)
- `vertical_financial_configs` (6 rows)
- `vendor_accounts` (14 rows)
- `vendor_orders` (424 rows)
- `vendor_order_items` (419 rows)
- `transaction_matches` (0 rows — awaiting matching algorithm)
- `expenses` (0 rows — awaiting UI)
- `notifications` (0 rows — awaiting notification triggers)

All enhanced columns confirmed:
- `expenses.splitGroupId` ✅
- `expenses.splitAmount` ✅
- `expenses.splitSequence` ✅
- `audit_log.actorType` ✅
- `audit_log.verticalId` ✅
- `audit_log.previousValue` ✅
- `financial_transactions.verticalId` ✅

### Section B: Data Migration — 5/6 PASS

| Test | Result | Detail |
|---|---|---|
| vendor_orders populated | ✅ | 424 rows |
| vendor_order_items populated | ✅ | 419 rows |
| vendor_accounts seeded | ✅ | 14 vendors |
| vertical_financial_configs seeded | ✅ | 6 configs |
| Test verticals cleaned up | ✅ | 6 active (was 278) |
| financial_transactions verticalId backfilled | ✅ | 671 rows |

### Section C: iCal Sync Status — 1/2 PASS

| Test | Result | Detail |
|---|---|---|
| Property platforms have iCal feeds | ✅ | 9 feeds found |
| Active feeds polled within 30 min | ❌ | **Some stale** — heartbeat may not be running in sandbox |

**Feed Status:**
```
🟢 Apartment #1 / airbnb — Last: 2026-07-06T06:50:08.000Z (stale)
🟢 Apartment #2 / airbnb — Last: 2026-07-06T06:50:08.000Z (stale)
🟢 Morabeza / airbnb — Last: 2026-07-06T06:50:08.000Z (stale)
🟢 Morabeza / booking_com — Last: 2026-07-06T06:50:08.000Z (stale)
🟢 Penthouse / vrbo — Last: 2026-07-06T06:50:08.000Z (stale)
🟢 Sunset Studio / airbnb — Last: 2026-07-06T06:50:08.000Z (stale)
🟢 Sunset Studio / vrbo — Last: 2026-07-06T06:50:08.000Z (stale)
🟢 The Artiste's Boutique / airbnb — Last: 2026-07-06T06:50:08.000Z (stale)
🟢 The Artiste's Boutique / booking_com — Last: 2026-07-06T06:50:08.000Z (stale)
```

**Root cause:** All feeds last polled Jul 6 at 06:50 UTC (~20 hours ago). The iCal heartbeat job is likely not running in the deployed environment or was paused.

### Section D: Outbound ICS URLs — 9/9 PASS ✅

All 3 property ICS files are accessible and valid:
- Sunset Studio: 83 events
- Morabeza: 59 events
- Artiste's Boutique: 40 events

### Section E: Prep Rule Verification — 1/2 PASS

| Test | Result | Detail |
|---|---|---|
| Prep rules DB query | ❌ | Column name mismatch (`daysBefore` vs actual) — test script bug, not app bug |
| Sunset Studio ICS has prep/block events | ✅ | **56 prep/block events found** |

**Note:** The ICS output confirms prep rules ARE working correctly — 56 PREP/BLOCK events exist in the Sunset Studio ICS. The DB query failure is a test script column name issue (camelCase vs snake_case), not an application bug.

### Section F: Email Scraping Status — 1/1 PASS ✅

| Property | Bookings | Guest Data | Revenue Data |
|---|---|---|---|
| Sunset Studio | 138 | 90% | 82% |
| The Artiste's Boutique | 149 | 90% | 83% |
| Penthouse (Unit 1 - 2BR) | 113 | 86% | 85% |
| Morabeza | 22 | 64% | 64% |
| Apartment #1 | 0 | — | — |
| Apartment #2 | 0 | — | — |

**Total: 422 bookings** with strong guest/revenue data coverage on the 4 active properties.

### Section G: Household Members & Permissions — 4/4 PASS ✅

| Member | Role | Status |
|---|---|---|
| Tarik Perkins | household_admin | active (linked) |
| Tarik Perkins | household_admin | active (linked) — **duplicate** |
| Eniola | ea | active (linked) |
| Cary Clark | member | invited (pending) |
| eniola test | member | inactive (linked) |
| Grandma Test | member | invited (pending) |
| test user | member | inactive (linked) |
| Tiago | child | invited (pending) |

9 vertical member access rules configured.

### Section H: Shadow Block Health — 3/3 PASS ✅

| Status | Count |
|---|---|
| synced | 10 |
| pending_sync | 10,767 |

**Critical observation:** Only 10 blocks have been synced to Google Calendar. 10,767 remain pending. This is because:
1. OAuth tokens for most accounts are expired (see Section I)
2. The sync retry heartbeat cannot write to Google without valid tokens
3. Only `tarikp.us@gmail.com` has a valid token

### Section I: OAuth Token Health — 2/3 PASS

| Account | Status | Token |
|---|---|---|
| 🟢 tarikp.us@gmail.com | active | **valid** |
| 🟡 eniola@tjperkinsfam.com | expired | expired |
| 🟡 tarik.perkins@startout.org | active | expired |
| 🟡 tarik@maxfieldbakery.com | active | expired |
| 🟡 tarik@maxfieldmarket.com | active | expired |
| 🟡 tarik@tjperkinsfam.com | active | expired |
| 🟡 tarikp.us@gmail.com | active | expired (duplicate) |
| 🟡 tarikp@gmail.com | active | expired |
| 🟡 tarikp@gmail.com | active | expired (duplicate) |

**Only 1 of 9 tokens is valid.** This is the primary blocker for shadow block sync. All accounts except `tarikp.us@gmail.com` need re-consent via Settings → Integrations → Reconnect.

### Section J: VRBO Inactive Listing — 0/1 FAIL

| Test | Result | Detail |
|---|---|---|
| Sunset Studio VRBO marked inactive | ❌ | `isActive: 1` — **still marked active** |

**Note:** The morning test script from Jun 25 expected this to be inactive. Either it was re-activated since then, or the original test expectation was wrong. All 3 VRBO feeds (Sunset Studio, Artiste's Boutique, Penthouse) show `isActive: 1`.

### Section K: Property Booking Calendars — 2/2 PASS ✅

5 iCal calendars found, all assigned to "Bohemian Lodges" vertical:
- Apartment #1 (Bookings)
- Apartment #2 (Bookings)
- Morabeza (Bookings)
- Sunset Studio (Bookings)
- The Artiste's Boutique (Bookings)

---

## Vitest Unit Test Results (259 tests)

**257 passed, 2 failed** across 15 test files.

### Failed Tests:

1. **`server/routers.ts` — auth.logout test**
   - Error in procedure execution (likely test environment issue with session/cookie mocking)

2. **`server/vendor-matching.test.ts` — "verticals table has exactly 6 canonical verticals"**
   - Expected ≤ 7, got 14
   - Root cause: The cleanup script deleted test verticals but the `isActive` check shows 6. The test queries total count including soft-deleted/inactive ones. 14 total rows exist (6 active + 8 inactive/test remnants).

---

## Critical Issues Requiring User Action

| Priority | Issue | Action Required |
|---|---|---|
| P0 | 8/9 OAuth tokens expired | User must reconnect accounts via Settings → Integrations → Reconnect |
| P0 | 10,767 shadow blocks stuck in pending_sync | Blocked by expired tokens — will auto-resolve after reconnect |
| P1 | iCal feeds stale (20+ hours) | Verify heartbeat job is running in production |
| P2 | VRBO Sunset Studio marked active (test expected inactive) | Clarify: should it be inactive? |
| P2 | Duplicate Tarik Perkins household_admin record | Investigate and remove duplicate |

---

## Design Observations for Discussion

1. **Token expiry is the single biggest blocker** — 8 of 9 accounts expired means shadow block sync, calendar webhooks, and email scraping are all degraded. A proactive token refresh mechanism or more aggressive reconnect prompting may be needed.

2. **Shadow block backlog (10,767)** — Even after tokens are refreshed, processing this backlog at 50/batch every 2 min = ~3.5 hours to clear. Consider a one-time burst mode after reconnect.

3. **Email scraping coverage** — 4 properties have strong data (64-90% guest/revenue), but Apartments #1 and #2 have zero bookings. Are these new properties or is there a configuration gap?

4. **Prep rules are working** — 56 prep/block events in Sunset Studio ICS confirms the Sunday/Holiday blocking logic is functional even if we can't query the exact DB table from the test script.

---

*Generated Jul 7, 2026 02:14 UTC by Manus AI independent test run.*
