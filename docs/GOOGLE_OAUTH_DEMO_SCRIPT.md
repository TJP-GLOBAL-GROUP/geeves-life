# Geeves.Life — Google OAuth Scope Justification & Demo Video Script (v3)

**Updated:** August 8, 2026
**Status:** Supersedes v2; retention story corrected to match privacy policy (Retention Option A).
**Scope under review:** `../auth/calendar.events` (sensitive)

---

## Part 1: "How Will the Scopes Be Used?" — Approved Scope Justification (paste-ready)

**For `calendar.events`:**

> Geeves.Life is a private household and small-business life-management platform ("Your life, orchestrated."). The calendar.events scope is used only for user-initiated calendar features: (1) reading events from the calendars a user explicitly connects, to display a unified personal/family/professional schedule with conflict detection; (2) creating events in Google Calendar when the user or an authorized household member schedules something in Geeves — family appointments, property bookings, vendor visits, and shared activities; (3) updating or deleting those events when they are changed in either direction, including recurring series; (4) receiving push notifications (events/watch) so sync is real-time without polling; and (5) creating privacy-preserving "busy" blocks that show household members availability without revealing event details. We do not modify calendar properties or share/delete calendars — only events. Calendar data is never sold, never shared with advertisers, and is protected with AES-256-GCM encryption at rest. Users can disconnect any calendar at any time from Settings → Integrations, which immediately stops syncing and removes the webhook; previously imported events remain until the user deletes them or deletes their account.

---

## Part 2: Demo Video Script (v3, ~2:30)

**Setup before recording:**
- A test Google account with 2 calendars (e.g., "Personal" + "Family"), a few existing events
- Geeves beta logged in as a test household with 2 members
- Clean browser profile, hide bookmarks bar, 1080p, show full URL bar (Google requires seeing the OAuth consent screen + your domain)

---

**SCENE 1 — The app (0:00–0:15)**
🎥 *Show the Geeves.Life dashboard.*
🎙 "This is Geeves.Life, a private life-management platform. I'll demonstrate how our Google Calendar integration uses the calendar.events scope."

**SCENE 2 — Connect flow (0:15–0:40)**
🎥 *Settings → Integrations → Connect Google Calendar. Let the Google consent screen be fully visible — linger 3–4 seconds so the scope list and your app name are readable. Complete the grant.*
🎙 "From Settings, the user connects a Google account. Google's consent screen shows exactly which permissions are requested — view and edit events. Nothing is accessed before the user explicitly authorizes."

**SCENE 3 — Read / unified view (0:40–1:05)**
🎥 *Show the Master Calendar with Google events now visible; switch day/week/month; point at a conflict detection indicator if available.*
🎙 "Existing Google events from the connected calendars appear in the unified household view — personal, family, and professional calendars together, with conflict detection. This is the read side of the scope."

**SCENE 4 — Write / create (1:05–1:30)**
🎥 *Create an event in Geeves (e.g., "Dentist — Friday 3pm"). Switch to calendar.google.com and show it appearing there.*
🎙 "When the user schedules something in Geeves — here, a family appointment — it's created on their Google Calendar. Here's the same event in Google Calendar itself."

**SCENE 5 — Two-way sync / edit + delete (1:30–1:55)**
🎥 *Edit the event time in Google Calendar → show it update in Geeves. Then delete it in Geeves → show it gone in Google. (If push/watch latency is slow, a manual refresh is fine — say so.)*
🎙 "Sync is bi-directional: edits made in Google flow back into Geeves via push notifications, and deletions in Geeves remove the event from Google — including recurring series."

**SCENE 6 — Shadow blocks (1:55–2:15)**
🎥 *Log in as / switch to the second household member's view. Show the busy block without event details.*
🎙 "Household members see privacy-preserving busy blocks — they know someone is unavailable, but never what they're doing. Event details stay private."

**SCENE 7 — Disconnect (2:15–2:35)**
🎥 *Settings → Integrations → Disconnect. Show events stopping sync (make one more Google-side edit, show it NOT appearing).*
🎙 "The user can disconnect at any time. Syncing stops immediately and tokens are revoked. Events already imported remain under the user's control in Geeves until they delete them or delete their account."

**CLOSE (2:35–2:45)**
🎥 *Brief shot of the privacy policy page on your domain.*
🎙 "Calendar data is never sold or used for advertising — our privacy policy, linked here, describes this in full."

---

### Recording checklist
- [ ] Consent screen legible (pause on it) — Google reviewers must see app name + scopes
- [ ] URL bar visible showing your domain and accounts.google.com
- [ ] Narrate the disconnect/retention line **exactly** as the policy states (Retention Option A — see Scene 7)
- [ ] Keep it under 3 minutes; no music bed needed; voiceover clear

---

*Document prepared for Google OAuth App Verification submission. Geeves.Life — TJP Global Group LLC.*
