# Geeves.Life — Date & Time Model

**Last updated:** Jun 20, 2026  
**Status:** Authoritative — all new date/time code must follow this document.

---

## Core Principle

Geeves.Life is a global life operating system. The user may be in New York, Jamaica, or China. All time-sensitive displays must be grounded in **where the user physically is right now**, not where their home base is.

> **Device timezone = primary reference. Constellation home timezone = secondary anchor.**

---

## Timezone Hierarchy

| Layer | Source | Purpose |
|---|---|---|
| **Device timezone** | `Intl.DateTimeFormat().resolvedOptions().timeZone` on the client, stored in `users.deviceTimezone` | Primary: "what time is it for me right now" |
| **Constellation home timezone** | `America/New_York` (EST/EDT) — stored in `household.homeTimezone` | Secondary: "what time is it at home" |
| **Property timezone** | `properties.timezone` (IANA string per property) | Used only for property-specific date math (check-in/out day boundaries) |
| **Storage timezone** | UTC (Unix milliseconds) | All DB timestamps are UTC ms — never store local time |

---

## Acquisition

On every app load (before the user interacts with anything):

1. **IANA timezone string** — read synchronously from `Intl.DateTimeFormat().resolvedOptions().timeZone`. No permission required. Always available.
2. **Geolocation** (optional, best-effort) — request `navigator.geolocation.getCurrentPosition()` for lat/lng. Use only to resolve a human-readable city name for display. Never block the UI on this.
3. **Persist to DB** — call `trpc.auth.updateDeviceLocation` with `{ timezone, city? }` on every app load so the server can use the device timezone in server-side date math.

---

## Display Rules

### Rule 1 — Single timezone display (device = home)

When `deviceTimezone === homeTimezone`, show only one clock/date/gutter. No redundant dual display. Home column collapses entirely.

### Rule 2 — Dual timezone display (device ≠ home)

When the user is away from home, every time-sensitive element shows **both** times:

| Element | Primary (device) | Secondary (home) |
|---|---|---|
| Greeting bar clock | Large, prominent device local time | Small "HOME · NEW YORK · 11:08 PM" row below |
| Greeting bar date | Device local date | Home date in muted text if it differs |
| Calendar time gutter | "LOCAL" column (full brightness) | "HOME" column (muted, 50% opacity, smaller) — collapses when same tz |
| Calendar today highlight | **Vivid Teal** `#2AAFA9` filled pill | **Bold Violet** `#8B5CF6` outline ring on home today — only when home today ≠ device today |
| Calendar now-line | Single line with both times: `"3:00 PM · 10:00 AM home"` in a pill at the line end | No second line — one line, two times |
| Calendar event block | Event title + time in device tz | Small badge in bottom-right corner of event block showing home time (e.g. `"3 PM home"`) — only when tz differ |
| Upcoming events date label | Device-local "Today" / "Tomorrow" / "Sat Jun 21" | Home date on second line in muted violet text if it differs, with `↑` (home ahead) or `↓` (home behind) arrow |

### Rule 3 — "Today" / "Tomorrow" anchoring

`fromTs` (the server-side window start for upcoming events) is computed from **device midnight**, not UTC midnight and not home midnight. The client passes `deviceTimezone` in the query input. The server derives midnight in that timezone using `Intl.DateTimeFormat("en-CA", { timeZone: deviceTimezone })`.

### Rule 4 — Property date math

Check-in/check-out day boundaries use the **property's own timezone** (stored in `properties.timezone`). A guest checking in at Artiste's Boutique in Jamaica checks in on Jamaica time, regardless of where the owner is viewing the dashboard.

The upcoming events list shows the date label in **device timezone** (Rule 2), but the underlying date comparison for "is this booking today?" uses the property timezone. Both are shown when they differ.

### Rule 5 — Storage

All timestamps stored in the database are **UTC Unix milliseconds**. No local time strings. No timezone-shifted values. Conversion to local time happens exclusively at the display layer.

---

## Calendar UI Spec (Confirmed)

### Time Gutter

```
LOCAL   HOME
 9 AM   2 PM
10 AM   3 PM
11 AM   4 PM
```

- Two labelled sub-columns: "LOCAL" (left, full brightness) and "HOME" (right, 50% opacity, smaller font).
- When `deviceTimezone === homeTimezone`: HOME column collapses, single gutter only.
- Column headers are small caps, muted, 8px.
- LOCAL times use device IANA timezone. HOME times use `household.homeTimezone`.

### Today Highlight

- **Device today**: Vivid Teal `#2AAFA9` filled pill on the date number in the day header.
- **Home today** (only when different from device today): Bold Violet `#8B5CF6` outline ring around the date number — no fill, 1.5px border.
- When same day: Teal fill only, no violet ring.

### Now-Line

Single horizontal line spanning the calendar grid. At the right end, a small pill label:

```
[ 3:00 PM · 10:00 AM home ]
```

- Teal colour for the line and pill.
- "home" time only shown when timezones differ.
- When same tz: `[ 3:00 PM ]` only.

### Event Corner Badge

Each event block (when device ≠ home tz):

```
┌─────────────────────┐
│ Team Standup        │
│ 10:00 AM            │
│                3 PM▸│  ← home time badge, bottom-right
└─────────────────────┘
```

- Badge: `"3 PM home"` or just `"3 PM▸"` — 8px, muted violet, bottom-right corner.
- Only shown when device tz ≠ home tz.
- All-day events: no badge.

---

## Stale Data Warning

The stale data banner appears when the last iCal sync is older than the configured threshold. Clicking "Refresh" triggers a re-sync. The banner must dismiss immediately on click (optimistic) and re-appear only if the re-sync fails or the data is still stale after the response.

**Bug (fixed Jun 20 2026):** The dismiss state was not being reset after a successful refresh, causing the banner to persist even after fresh data was loaded.

---

## Examples

### Example A — Owner in New York (device = home)

Device: `America/New_York` = Home: `America/New_York`  
→ Single clock. No dual display. Single gutter. Teal today pill only.

### Example B — Owner in London (BST = UTC+1)

Home: `America/New_York` (EDT = UTC-4, 5h behind London)  
→ Dual clock. Gutter shows LOCAL and HOME columns.  
→ A Jun 21 check-in at Morabeza: device shows "Sat Jun 21", home shows "Sat Jun 21" (same day) — no second line needed.  
→ A midnight Jun 21 check-in: device "Sat Jun 21 1:00 AM", home "Fri Jun 20 8:00 PM" — second line shows "↑ Fri Jun 20 home".

### Example C — Owner in Beijing (CST = UTC+8)

Home: `America/New_York` (EDT = UTC-4, 12h behind Beijing)  
→ 12-hour difference. Saturday in Beijing = Friday in New York.  
→ Calendar shows Saturday as Teal (device today), Friday as Violet ring (home today).  
→ Now-line pill: `"3:00 PM · 3:00 AM home"`.
