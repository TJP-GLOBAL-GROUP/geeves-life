# Notification Audit — Jul 8, 2026

## Noisy notifications flooding inbox (from screenshot):
1. **Square Sync Failed** — NOT in our codebase; likely from another Manus project or external
2. **Geeves Shadow Block Circuit Breaker** (21 emails) — from `server/services/eventPropagation.ts` line 121
3. **Geeves Shadow Block Rate Limit** (4 emails) — from `server/services/eventPropagation.ts` line 146
4. **QBO Sync Cron Job Failed** (6 emails) — NOT in our codebase; likely from another Manus project
5. **Cancellation pending confirmation** (80 emails!) — from `server/services/icalAggregator.ts` line 753
6. **Booking date mismatch detected** (45 emails) — NOT found as a notifyOwner call in our codebase

## Notifications we CAN silence in our code:
- Shadow Block Circuit Breaker → `server/services/eventPropagation.ts` line 121
- Shadow Block Rate Limit → `server/services/eventPropagation.ts` line 146
- Cancellation pending confirmation → `server/services/icalAggregator.ts` line 753

## Fix approach:
1. Add a "notification suppression" flag or cooldown to prevent repeated notifications
2. For circuit breaker: already trips once, but the notification fires every time the breaker is checked
3. For cancellation pending: the fix to skip past bookings was already applied, but 80 emails already sent
4. For rate limit: fires per-calendar per-hour, can flood if many calendars hit the limit

## Heartbeat jobs (all active):
- geeves-shadow-block-sync-retry: every 5 min
- geeves-token-refresh: every 45 min
- geeves-email-scrape: every 6 hours
- geeves-ical-poll: every 10 min
- geeves-knowledge-review: daily 6 AM UTC

## Manus schedule (from manus-config):
- Geeves KB Governance: daily 9 AM ET
