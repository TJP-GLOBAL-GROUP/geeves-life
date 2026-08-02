# Geeves.Life — Google OAuth Scope Justification & Demo Video Script (v2)

**Updated:** August 2, 2026
**Status:** Reflects the scope reduction applied in commit `53f626c` — the overly broad `calendar` scope has been removed.

---

## Part 1: "How Will the Scopes Be Used?" — Google Verification Form Text

### Sensitive Scopes Now Requested

| Scope URI | Console Description | Purpose in Geeves.Life |
|-----------|--------------------|-----------------------|
| `calendar.events` | "View and edit events on all your calendars" | Event CRUD, push notification webhooks, shadow block propagation |
| `calendar.calendarlist.readonly` | "See the list of Google calendars you're subscribed to" | Calendar discovery during onboarding |
| `gmail.send` | "Send email on your behalf" | Outbound notifications and calendar invites |
| `gmail.readonly` | "View your email messages and settings" | Booking confirmation email parsing |

### Scopes Removed (No Longer Requested)

| Scope URI | Console Description | Reason for Removal |
|-----------|--------------------|--------------------|
| `calendar` | "See, edit, share, and permanently delete all the calendars you can access" | Overly broad — Geeves never shares, deletes, or modifies calendar properties |
| `calendar.calendars` | "See and change the properties of Google calendars" | Implicitly included by `calendar` — also not needed |

---

### Form Field: "How will the scopes be used?" (1000 character limit)

**For `calendar.events` + `calendar.calendarlist.readonly`:**

> Geeves.Life is a household life management platform that synchronizes family members' Google Calendars into a unified view. We require `calendar.events` to: (1) read events from connected calendars via full and incremental sync, (2) create events when users add them in our app and write them back to Google, (3) update and delete events bi-directionally including recurring event series management, (4) register push notification webhooks (events/watch) for real-time sync without polling, and (5) create "shadow block" busy markers on family members' calendars for household schedule coordination. We require `calendar.calendarlist.readonly` to display the user's available calendars during onboarding so they can choose which ones to sync. We do not modify calendar properties, share calendars, or delete calendars — only events are managed. Users explicitly choose which calendars to connect and can disconnect at any time.

**Character count: 876 / 1000**

---

**For `gmail.send`:**

> Geeves.Life uses `gmail.send` to deliver calendar event invitations and household notifications from the user's own email address. When a household member creates a shared event, attendees receive an invitation email sent from the organizer's Gmail account (not a generic no-reply address). This provides a familiar, trusted sender identity. The scope is only requested when the user explicitly enables the "Send Email" integration in Settings → Integrations. We never read, modify, or delete emails — only send outbound messages initiated by the user's actions within the app.

**Character count: 588 / 1000**

---

**For `gmail.readonly`:**

> Geeves.Life uses `gmail.readonly` to parse booking confirmation emails from property management platforms (Airbnb, VRBO, Booking.com). When a user enables the "Email Scraping" integration, we scan their inbox for booking confirmations and automatically extract check-in dates, guest names, and property details to populate the household's property management calendar. This eliminates manual data entry for families managing vacation rentals. The scope is only requested when the user explicitly enables this feature. We never modify, send, or delete emails — only read specific booking-related messages identified by sender and subject filters.

**Character count: 628 / 1000**

---

## Part 2: Key Evidence — Why `calendar.events` Is Sufficient

A common misconception is that push notifications (`events/watch`) require the full `calendar` scope. This is incorrect. From the official Google Calendar API documentation for `events/watch`:

> **Authorization:** This request allows authorization with at least one of the following scopes:
> - `https://www.googleapis.com/auth/calendar.events` ← **This is sufficient**
> - `https://www.googleapis.com/auth/calendar.readonly`
> - `https://www.googleapis.com/auth/calendar`
> - (and several others)

The `calendar.events` scope explicitly supports:
- `GET /calendars/{id}/events` — list/read events
- `POST /calendars/{id}/events` — create events
- `PATCH /calendars/{id}/events/{id}` — update events
- `DELETE /calendars/{id}/events/{id}` — delete events
- `POST /calendars/{id}/events/watch` — register push notifications

The full `calendar` scope adds capabilities Geeves never uses: sharing calendars, permanently deleting calendars, changing calendar timezone/name/description, and managing ACLs.

---

## Part 3: Demo Video Script for Eniola

### Video Requirements

- **Length:** 3–5 minutes (Google recommends under 5 minutes)
- **Format:** Screen recording with voiceover (no face cam required, but face cam adds trust)
- **Resolution:** 1080p minimum
- **Upload:** Unlisted YouTube video (link shared in verification form)
- **Tool:** QuickTime screen recording, Loom, or OBS

### Important Notes for Recording

- Google reviewers watch the video to confirm each scope is used for its stated purpose
- Every sensitive scope must be demonstrated in action
- Show the consent screen clearly — pause on it for 2–3 seconds
- Narrate what you are clicking as you click it (reviewers watch with and without sound)
- The video must show a real working app, not mockups or slides

---

### Script

---

**[SCENE 1 — Introduction] (0:00 – 0:25)**

*Show: beta.geeves.life landing page*

**Eniola (voiceover):**
"Hi, I'm Eniola. This is Geeves.Life — a household life management platform that helps families coordinate their schedules by synchronizing Google Calendars into a unified view. I'll walk through how we use each Google Calendar scope to power our core features. We request two calendar scopes: `calendar.events` for reading and writing events, and `calendar.calendarlist.readonly` for listing available calendars during setup."

---

**[SCENE 2 — Login with Identity-Only Scopes] (0:25 – 0:55)**

*Action: Click "Sign In with Google" → Show the Google consent screen*

**Eniola:**
"When a user first signs in, we only request identity scopes — email, profile, and OpenID. No calendar or Gmail permissions are requested at login. This follows Google's incremental authorization best practice."

*Action: Complete the login → Show the dashboard*

**Eniola:**
"I'm now logged in. Notice no calendar data is visible yet — because we haven't asked for calendar permissions."

---

**[SCENE 3 — Calendar Connection & Calendar List Discovery] (0:55 – 1:50)**

*Action: Navigate to Settings → Integrations → Click "Connect Google Calendar"*

**Eniola:**
"Calendar permissions are only requested when the user explicitly chooses to connect their Google Calendar. I'll click 'Connect Google Calendar' now."

*Action: Show the Google consent screen — PAUSE for 3 seconds so reviewers can read it*

**Eniola:**
"Here's the consent screen. It shows two calendar permissions: 'View and edit events on all your calendars' — that's `calendar.events` — and 'See the list of Google calendars you're subscribed to' — that's `calendar.calendarlist.readonly`. Notice we do NOT request the ability to share or delete calendars."

*Action: Grant permission → Show the calendar selection screen with multiple calendars listed*

**Eniola:**
"After authorization, we use `calendar.calendarlist.readonly` to call the CalendarList API. This displays all my available calendars — personal, work, and shared family calendars. I'll select my personal calendar and the family calendar to sync."

*Action: Select 2 calendars → Click "Connect"*

---

**[SCENE 4 — Event Sync & Bi-directional Write-back] (1:50 – 2:50)**

*Action: Navigate to the Calendar view → Show events populated from Google*

**Eniola:**
"Using `calendar.events`, we perform an initial sync that pulls events from my connected calendars. These now appear in our unified calendar view."

*Action: Create a new event in Geeves.Life (e.g., "Family Dinner, Saturday 6pm")*

**Eniola:**
"I'll create a new event — 'Family Dinner, Saturday at 6pm.' This is written back to my Google Calendar using the same `calendar.events` scope."

*Action: Open Google Calendar in a new browser tab → Show the event appears there*

**Eniola:**
"Here it is in Google Calendar — the sync is bi-directional. Now I'll edit this event's time in Google Calendar to demonstrate real-time sync."

*Action: In Google Calendar, drag the event to a different time → Switch back to Geeves.Life → Show it updates within seconds*

**Eniola:**
"I changed the time in Google Calendar, and within seconds Geeves.Life reflects the update. This works because we register push notification webhooks using the `events/watch` endpoint — which is authorized by the `calendar.events` scope — so we receive instant notifications instead of polling."

---

**[SCENE 5 — Shadow Block Propagation] (2:50 – 3:40)**

*Action: Show the calendar with events from multiple household members visible*

**Eniola:**
"Our signature feature is Shadow Block Propagation. When one household member has an event, a 'Busy' block automatically appears on the family calendar. This helps the family coordinate without sharing private event details."

*Action: Point to a personal event → Point to the corresponding "Busy" block on the family calendar*

**Eniola:**
"Here's my work meeting on my personal calendar. And here's the corresponding 'Busy' block on the family calendar — created automatically by Geeves.Life. This uses `calendar.events` to write the shadow block event to the family calendar."

*Action: Delete the personal event → Show the shadow block disappears*

**Eniola:**
"When I delete the source event, the shadow block is automatically removed from the family calendar."

---

**[SCENE 6 — Recurring Event Management] (3:40 – 4:20)**

*Action: Show a recurring event → Click delete → Choose "This and all following events"*

**Eniola:**
"For recurring events, we support all standard deletion modes. I'll delete 'this and all following events' from this weekly series."

*Action: Show the event and all following instances disappear from both Geeves.Life and Google Calendar*

**Eniola:**
"The deletion is synced back to Google Calendar — we modify the master event's recurrence rule to truncate the series. This is all handled through the `calendar.events` scope."

---

**[SCENE 7 — User Control & Disconnection] (4:20 – 4:45)**

*Action: Navigate to Settings → Integrations → Show connected calendars with "Disconnect" button*

**Eniola:**
"Users maintain full control over their data. They can disconnect any calendar at any time, which immediately stops syncing and removes the push notification webhook. No calendar data is retained after disconnection."

---

**[SCENE 8 — Closing] (4:45 – 5:00)**

*Show: Geeves.Life dashboard*

**Eniola:**
"To summarize: we use `calendar.calendarlist.readonly` for calendar discovery during onboarding, and `calendar.events` for bi-directional event sync, push notification webhooks, shadow block propagation, and recurring event management. All access is user-initiated, transparent, and revocable at any time. Thank you for reviewing."

---

### Demo Preparation Checklist

Before recording, ensure:

- [ ] beta.geeves.life is accessible and OAuth login is working
- [ ] Your Google account has at least 2 calendars (personal + shared/family)
- [ ] There are some existing events on the calendars (for sync demo)
- [ ] Shadow blocking is enabled in calendar settings
- [ ] You have Google Calendar open in another browser tab for the bi-directional demo
- [ ] A recurring event exists that you can delete during the demo
- [ ] Screen recording software is set to 1080p
- [ ] Microphone is tested and clear
- [ ] Browser zoom is at 100%
- [ ] Close any notifications/popups that might appear during recording
- [ ] Clear browser tab bar of anything unrelated
- [ ] Disconnect and reconnect your Google Calendar before recording (to ensure fresh token with new reduced scopes)

### Tips for a Smooth Recording

1. **Rehearse once** without recording to identify any loading delays or issues
2. **Pause on the consent screen** for at least 3 seconds — reviewers need to read it
3. **Narrate what you're clicking** as you click it — Google reviewers watch with and without sound
4. **If something fails** (e.g., sync delay), just say "Let me refresh" naturally — it shows real usage
5. **Keep the energy conversational** — this is a technical demonstration, not a sales pitch
6. **Show the scope names** when demonstrating each feature — say "using `calendar.events`" or "using `calendarlist.readonly`" so reviewers can map actions to scopes
7. **Do not skip any scope** — every sensitive scope listed must be demonstrated or the review will be rejected

### Upload Instructions

1. Upload the video as **Unlisted** on YouTube
2. Copy the YouTube URL
3. Paste it in the Google OAuth verification form under "Demo video link"
4. Ensure the video remains accessible (do not delete or make private) until verification is complete

---

## Part 4: Google Console Cleanup Steps

After the code deployment (commit `53f626c` is already pushed to `main`):

1. Go to **Google Cloud Console → APIs & Services → OAuth consent screen → Data Access**
2. Click **"Add or remove scopes"**
3. **Remove:** `https://www.googleapis.com/auth/calendar`
4. **Remove:** `https://www.googleapis.com/auth/calendar.calendars` (if separately listed)
5. **Add:** `https://www.googleapis.com/auth/calendar.calendarlist.readonly`
6. **Ensure these remain:** `calendar.events`, `gmail.send`, `gmail.readonly`
7. **Save** and re-submit for verification with the updated demo video

---

## Part 5: What Changed from v1

| Aspect | v1 (Before) | v2 (After) |
|--------|-------------|------------|
| Calendar scopes requested | `calendar` + `calendar.events` | `calendar.events` + `calendar.calendarlist.readonly` |
| Consent screen shows | "See, edit, share, and permanently delete all calendars" | "View and edit events" + "See the list of calendars" |
| Justification complexity | Had to justify share/delete access (never used) | Only justify what we actually do |
| Verification risk | High — overly broad scope triggers extra scrutiny | Lower — narrower scopes are easier to justify |
| Demo video focus | Tried to justify cross-calendar writes needing full scope | Correctly shows `calendar.events` handles everything |
| Shadow block explanation | Incorrectly claimed full `calendar` scope needed | Correctly shows `calendar.events` is sufficient for cross-calendar event writes |

---

*Document prepared for Google OAuth App Verification submission. Geeves.Life — TJP Global Group LLC.*
