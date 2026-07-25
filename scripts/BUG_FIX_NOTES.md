# Bug Fix Notes — Jul 8, 2026

## H-01: Properties upcoming widget UTC date display
**Status:** Already fixed! The `dayLabel()` function at line 927-936 already uses `d.toISOString().slice(0, 10)` for UTC comparison.
The todo item says to fix lines 869,880 but those lines are now about form handling (openEdit function).
The actual date display at lines 980-981 uses `new Date(b.checkIn)` where b.checkIn is a UTC epoch timestamp.
The `dayLabel()` already compares ISO date strings (UTC) correctly.
The `utcDateStr()` helper is also used for display.
**Conclusion:** H-01 appears to have been fixed in a prior session. Mark as complete.

## H-02: FamilyView isToday/isTomorrow UTC comparison
**File:** client/src/pages/FamilyView.tsx lines 63-76
**Fix:** Replace `d.getDate() === now.getDate()` with `d.toISOString().slice(0,10) === new Date().toISOString().slice(0,10)`
**Need to read:** FamilyView.tsx around lines 63-76

## H-03: Vertical soft-delete cascade
**File:** server/routers/ (verticals router)
**Fix:** On verticals.delete, null out calendars.verticalId for linked calendars, soft-delete vertical_member_access, vertical_visibility, vertical_owners rows
**Need to find:** The verticals delete procedure

## H-05: security.ts data export/delete
**File:** server/routers/security.ts lines 126-127, 207-208
**Fix:** Replace `ctx.user.memberId ?? ""` with `(await db.getHouseholdMemberByUserId(ctx.user.id))?.id`

## C-03: bookingEmailScraper date parsing
**File:** server/services/bookingEmailScraper.ts
**Fix:** Normalise all parsed date strings to YYYY-MM-DD and append T00:00:00Z before new Date()

## M-04: deleteProperty confirmation dialog
**File:** client/src/pages/Properties.tsx (delete property section)
**Fix:** Show cascade scope: "This will permanently delete [N] bookings, [N] platforms, and associated data"

## M-06: FamilyView booking request empty state
**File:** client/src/pages/FamilyView.tsx
**Fix:** Add empty state: "No booking requests yet. Tap + to request time on a shared calendar."

## Scope guard for email scraping
**File:** server/services/ (scrapeMultiPlatformEmails or similar)
**Fix:** Check token.scopes.includes("gmail.readonly") before calling gmailGet; fail fast with actionable error
