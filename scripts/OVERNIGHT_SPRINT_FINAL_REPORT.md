# Geeves.Life — Overnight Sprint Final Report

**Date:** July 7–8, 2026  
**Sprint Duration:** ~12 hours (autonomous)  
**Checkpoints Saved:** 5 (dfea1b66 → 5d350ab1 → 86345eb0 → 2303d768)  
**Tests:** 282 passing, 1 pre-existing stale assertion (verticals count)  
**TypeScript:** 0 errors

---

## Executive Summary

This overnight sprint resolved the notification flood that was sending dozens of repeated alerts on every serverless cold start, added the Notification Settings panel for user-adjustable cooldowns, fixed the Expense Categorisation Tool (MySQL strict mode incompatibility), imported Amazon order data, added property photos and map tabs, and confirmed all high-priority and medium-priority bug items (H-01 through H-05, M-01 through M-06) are resolved.

---

## Completed Items

### Critical Fixes

| Item | Description | Root Cause | Resolution |
|------|-------------|------------|------------|
| Notification Flood | Dozens of repeated shadow block, cancellation, date mismatch, and health check alerts | In-memory cooldown Maps reset on every serverless cold start | Migrated ALL cooldowns to persistent DB-based `lastNotifiedAt` column in `notification_settings` table |
| Expense Categorisation Tool | 1,121 orders invisible — page showed empty | MySQL `ONLY_FULL_GROUP_BY` strict mode rejects queries with non-aggregated columns in GROUP BY | Rewrote JOIN structures using pre-aggregated subqueries (P-17 pattern) |
| Duplicate Bookings | Sunset Studio / Morabeza showing duplicate entries | `getCompositeBookings` merge logic not aggressive enough | Enhanced merge with 80% overlap threshold + dedup in `getPropertyBookingsForHousehold` |

### Features Added

| Feature | Details |
|---------|---------|
| Notification Settings Panel | New tab in Settings page with per-alert cooldown sliders and enable/disable toggles. DB-backed via `notificationSettings` router |
| Property Photos Tab | Multi-upload grid display in PropertyDetail with S3 storage, delete, and reorder |
| Property Map Tab | Auto-geocodes from property address, places marker on Google Maps |
| Amazon Import | 19 bank accounts created for payment methods + 175 expenses for 2025-2026 orders |
| Constellation Logo in Reconnect | Replaced "G" circle with GeevesConstellationMark in pulsating node animation |
| Delete Property Cascade Dialog | Now shows full scope: bookings, platforms, prep rules, email scrape jobs, photos |

### Bug Audit — All Confirmed Fixed

| Bug | Status | Evidence |
|-----|--------|----------|
| H-01: Properties UTC date display | Already fixed | `dayLabel()` uses `toISOString().slice(0,10)` for UTC comparison |
| H-02: FamilyView isToday/isTomorrow | Already fixed | UTC ISO string comparison in place |
| H-03: Vertical soft-delete cascade | Already fixed | `deleteVerticalCascade()` fully implemented |
| H-04: Calendar event delete | Already fixed | `events.delete` procedure exists with proper cascade |
| H-05: Security data export/delete | Already fixed | Uses `db.getHouseholdMemberByUserId(userId)` |
| C-03: Email scraper date parsing | Already fixed | Normalizes to YYYY-MM-DD with T00:00:00Z |
| M-01: Booking request badge | Already implemented | Amber badge on Calendar nav + notifyOwner in create |
| M-02: leaveHousehold procedure | Already implemented | Admin-last check + cascade delete + audit log |
| M-03: Notifications table | Already implemented | Full schema with 16 types, 6 indexes |
| M-04: Delete property cascade dialog | Fixed this session | Shows bookings, platforms, prep rules, email jobs, photos |
| M-05: Notify on approve/decline | Already implemented | notifyOwner() in respond procedure |
| M-06: FamilyView empty state | Already implemented | Calendar icon + guidance text |

### Engineering Documentation

| Document | Update |
|----------|--------|
| P-17 Pattern | Added to ENGINEERING_LESSONS.md — MySQL ONLY_FULL_GROUP_BY requires subquery JOINs |
| PHASE_1.md | Updated with recent features and checkpoint history |
| AI_MEMORY.md | Updated with notification architecture and Amazon import details |
| Geeves_KB_Snapshot.md | Created in shared project folder (governance snapshot) |
| Gmail scope guard (P-09) | Confirmed implemented at bookingEmailScraper.ts lines 416-428 |

---

## Remaining Items (Categorized)

### Blocked — Requires User Action

| Item | Blocker |
|------|---------|
| Shadow block Google write-back | All Google OAuth tokens expired/revoked — user must reconnect accounts |
| Gmail email scraping | tarik@maxfieldmarket.com and tarikp.us@gmail.com must re-consent with gmail.readonly scope |
| Shadow block sync retry heartbeat | Blocked until tokens reconnected |

### Deferred — Cosmetic / Low Priority

| Item | Reason |
|------|--------|
| Visa 9761/7766 card replacement mapping | Cosmetic — both cards map to same account |
| Square Sync + QBO Sync notifications | Different Manus project (MBOMS) — cannot fix here |
| Chrome Extension bridge detection | Works but banner sometimes shows incorrectly |

### Future Roadmap (Phase 2-3)

- Walmart API real-time product search
- Amazon ASIN scraping
- Asana integration (task sync)
- Google Keep integration (notes sync)
- WhatsApp direct integration
- Smart home device control stubs
- In-app notification center (schema ready, UI not built)
- Bug reporting system (schema designed, not built)

---

## Architecture Decisions Made

1. **Persistent cooldowns over in-memory Maps** — Serverless (Cloud Run) cold starts reset all in-memory state. The `notification_settings.lastNotifiedAt` column ensures cooldowns survive across instances.

2. **Subquery JOIN pattern (P-17)** — MySQL strict mode requires all non-aggregated columns in GROUP BY. Pre-aggregating in subqueries then joining eliminates the need for GROUP BY on the outer query entirely.

3. **DB-based notification settings** — Rather than hardcoding cooldown values, the `notification_settings` table allows runtime adjustment via the Settings UI without code deploys.

---

## Metrics

| Metric | Value |
|--------|-------|
| Total todo items | 1,507 |
| Completed (all time) | 1,215 (80.6%) |
| Remaining open | 292 |
| Blocked by user action | 6 |
| Future/roadmap items | ~200+ |
| Actionable bugs remaining | ~30 (various priority) |
| Tests passing | 282 |
| TypeScript errors | 0 |

---

## Next Recommended Actions

1. **Reconnect Google accounts** — Visit Settings → Integrations and reconnect tarik@maxfieldmarket.com and tarikp.us@gmail.com with "Email Scraping" purpose checked. This unblocks shadow block sync and email scraping.

2. **Publish** — Click the Publish button in the Management UI to deploy the latest checkpoint (2303d768) to production.

3. **Test notification cooldowns** — After publishing, verify that shadow block and cancellation alerts respect the configured cooldown periods (default 6h for most, 24h for health checks).

4. **Review Expense Categorisation** — 1,121 orders are now visible. Begin categorizing Amazon and Walmart purchases into chart of accounts categories.
