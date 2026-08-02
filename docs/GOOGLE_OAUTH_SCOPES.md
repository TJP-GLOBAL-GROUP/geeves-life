# Geeves.Life — Corrected Google OAuth Scope Analysis

## The Three Flagged Sensitive Scopes (from Google Console)

| # | Scope URI | Console Description (exact) | Sensitivity |
|---|-----------|----------------------------|-------------|
| 1 | `https://www.googleapis.com/auth/calendar.calendars` | "See and change the properties of Google calendars you have access to, and create secondary calendars" | Sensitive |
| 2 | `https://www.googleapis.com/auth/calendar` | "See, edit, share, and permanently delete all the calendars you can access using Google Calendar" | Sensitive |
| 3 | `https://www.googleapis.com/auth/calendar.events` | "View and edit events on all your calendars" | Sensitive |

---

## What the Codebase Actually Requests

In `server/auth/providers.ts`:

```typescript
CALENDAR: [
  "https://www.googleapis.com/auth/calendar",        // ← THE FULL SCOPE
  "https://www.googleapis.com/auth/calendar.events",  // ← Events read/write
],
```

**The code requests only 2 scopes**, but the Google Console shows **3 flagged scopes** because:
- `https://www.googleapis.com/auth/calendar` is a **superset** that implicitly includes the capabilities of both `calendar.calendars` and `calendar.events`
- Google's Console surfaces all the granular scopes that are *covered by* the broad scope you registered

---

## What the App Actually Does with Google Calendar API

| Operation | API Endpoint | Minimum Scope Required |
|-----------|-------------|----------------------|
| List user's calendars | `GET /users/me/calendarList` | `calendar.calendarlist.readonly` |
| Read events (full sync) | `GET /calendars/{id}/events` | `calendar.events.readonly` |
| Create events (write-back + shadow blocks) | `POST /calendars/{id}/events` | `calendar.events` |
| Update events (RRULE edits, time changes) | `PATCH /calendars/{id}/events/{id}` | `calendar.events` |
| Delete events (single/following/all) | `DELETE /calendars/{id}/events/{id}` | `calendar.events` |
| Register push notifications | `POST /calendars/{id}/events/watch` | `calendar.events` ← **confirmed in official docs** |

### What the App Does NOT Do:
- ❌ Does NOT share calendars with other users
- ❌ Does NOT permanently delete calendars
- ❌ Does NOT change calendar properties (name, timezone, description)
- ❌ Does NOT create secondary calendars on Google
- ❌ Does NOT modify calendar ACLs (access control lists)

The `calendar.update` and `calendar.delete` procedures in the router **only modify local database records** — they do not call any Google Calendar API endpoints.

---

## Verdict: YES, We Are Over-Requesting

**`https://www.googleapis.com/auth/calendar` is overly aggressive.** This scope grants the ability to:
- Share calendars ← NOT NEEDED
- Permanently delete calendars ← NOT NEEDED  
- Change calendar properties ← NOT NEEDED
- Create secondary calendars ← NOT NEEDED

The app only needs to:
1. **List** available calendars (read-only)
2. **Read/write events** (CRUD + watch)

---

## Recommended Minimum Scopes

Replace the current `CALENDAR` scopes in `server/auth/providers.ts`:

```typescript
// BEFORE (overly aggressive):
CALENDAR: [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/calendar.events",
],

// AFTER (minimum necessary):
CALENDAR: [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
],
```

### What this achieves:

| Scope | Grants | Covers |
|-------|--------|--------|
| `calendar.events` | View and edit events on all calendars | Event CRUD, push notifications (watch), shadow block writes |
| `calendar.calendarlist.readonly` | See the list of Google calendars you're subscribed to | Calendar discovery during onboarding |

### What gets removed from the consent screen:
- ~~"See, edit, share, and permanently delete all the calendars"~~ → GONE
- ~~"See and change the properties of Google calendars"~~ → GONE

### What remains on the consent screen:
- "View and edit events on all your calendars" (still sensitive, but justified)
- "See the list of Google calendars you're subscribed to" (sensitive but read-only — much easier to justify)

---

## Key Evidence: `events/watch` Does NOT Require Full Calendar Scope

From the official Google documentation at `https://developers.google.com/workspace/calendar/api/v3/reference/events/watch`:

> **Authorization:** This request allows authorization with at least one of the following scopes:
> - `https://www.googleapis.com/auth/calendar.readonly`
> - `https://www.googleapis.com/auth/calendar`
> - `https://www.googleapis.com/auth/calendar.events.readonly`
> - **`https://www.googleapis.com/auth/calendar.events`** ← This is sufficient
> - `https://www.googleapis.com/auth/calendar.app.created`
> - `https://www.googleapis.com/auth/calendar.events.freebusy`
> - `https://www.googleapis.com/auth/calendar.events.owned`
> - `https://www.googleapis.com/auth/calendar.events.owned.readonly`
> - `https://www.googleapis.com/auth/calendar.events.public.readonly`

**The full `calendar` scope was never required for push notifications.** `calendar.events` is explicitly listed as sufficient.

---

## Code Change Required

**File:** `server/auth/providers.ts`

**Change:**
```diff
  CALENDAR: [
-   "https://www.googleapis.com/auth/calendar",
-   "https://www.googleapis.com/auth/calendar.events",
+   "https://www.googleapis.com/auth/calendar.events",
+   "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  ],
```

**After this change:**
1. Remove `calendar` and `calendar.calendars` from the Google Console Data Access page
2. Only `calendar.events` and `calendar.calendarlist.readonly` will remain as sensitive scopes
3. The verification process becomes significantly easier — no "share/delete calendars" justification needed
4. Users see a less intimidating consent screen

---

## Google Console Cleanup Steps

After deploying the code change:

1. Go to **Google Auth Platform → Data Access**
2. Click **"Add or remove scopes"**
3. Remove: `https://www.googleapis.com/auth/calendar`
4. Remove: `https://www.googleapis.com/auth/calendar.calendars` (if separately listed)
5. Add: `https://www.googleapis.com/auth/calendar.calendarlist.readonly`
6. Ensure `https://www.googleapis.com/auth/calendar.events` remains
7. Save and re-submit for verification

---

## Impact on Existing Users

Users who previously authorized with the full `calendar` scope will continue to work — their tokens already have broader permissions than needed. New users will see a less aggressive consent screen. No re-authorization is required for existing users.

---

## Updated Demo Video Script Justification Text

For the "How will the scopes be used?" field (after scope reduction):

> Geeves.Life is a household life management platform that synchronizes family members' Google Calendars into a unified view. We require `calendar.events` to read, create, update, and delete events bi-directionally between our app and Google Calendar, register push notification webhooks for real-time sync, and create "shadow block" busy markers on family members' calendars for household coordination. We require `calendar.calendarlist.readonly` to display the user's available calendars during onboarding so they can choose which ones to sync. We do not modify calendar properties, share calendars, or delete calendars — only events are managed.

*(Character count: 648 / 1000 limit)*
