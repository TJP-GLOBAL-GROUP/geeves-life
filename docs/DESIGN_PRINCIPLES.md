# Geeves Platform — Design Principles

**Version:** 1.1 — Updated June 17, 2026  
**Location:** `docs/DESIGN_PRINCIPLES.md` (moved from project root June 17, 2026)

This document codifies the foundational design decisions that **must persist across all phases** of development. Any contributor (human or AI) working on Geeves must read and adhere to these principles.

> **AI Agents:** Before making any UI, copy, or data model changes, also read `docs/AI_MEMORY.md` for brand colour, typography, and architectural constraints.

---

## 1. Inclusive Family Structures

Geeves is designed to serve **all family formations** without assumption or bias.

### Supported Configurations (non-exhaustive)

- Single parent households
- Two-parent households (any gender combination)
- Co-parenting across separate households
- Polyamorous families with multiple co-heads
- Blended families with step-parents and step-siblings
- Multigenerational households (grandparents, great-grandparents)
- Chosen family (non-biological bonds)
- Guardianship arrangements
- Foster families

### Rules

1. **Never hardcode relationship labels.** All relationship descriptors (parent, partner, child, etc.) are user-defined free-text fields. The system provides suggestions but never restricts.
2. **Never assume gender from role.** "Head of household" does not imply a gender. "Caregiver" does not imply a gender. No role in the system carries gendered assumptions.
3. **Never use gendered language in UI copy.** Replace "Mom/Dad" with "Parent," "husband/wife" with "partner," etc. — or better, use the person's name or their chosen relationship label.
4. **Store pronouns per member.** Every household member profile includes an optional pronouns field (free-text, not a dropdown). The system uses these pronouns in generated text (notifications, summaries, AI responses).
5. **Store gender identity per member.** Optional free-text field. Never used for logic or gating — only for the member's own profile display.
6. **Custom relationship labels.** Each member defines how they relate to others in the household using their own words (e.g., "Papa," "Daddy," "Baba," "Nana," "Auntie," "Big Sis").

---

## 2. Role Architecture

### Platform-Level Roles (users table)

| Role | Purpose |
|------|---------|
| `user` | Standard platform user |
| `system_admin` | Developer/platform operator with infrastructure access |

`system_admin` is invisible to end-user families. It exists for the developer (Supah-T) to manage the platform. End users never see or interact with this concept.

### Household-Level Roles (household_members table)

| Role | Purpose | Count |
|------|---------|-------|
| `household_admin` | Co-equal head of household. Full management rights. | **Multiple allowed** |
| `ea` | Executive Assistant. Manages calendars/tasks on behalf of admins. | Multiple allowed |
| `member` | Standard household member. Manages own calendars/tasks. | Multiple allowed |
| `caregiver` | External caregiver with limited access to specific members' schedules. | Multiple allowed |
| `child` | Minor member with age-appropriate simplified interface. | Multiple allowed |
| `elder` | Member who benefits from simplified/accessible interface. | Multiple allowed |

### Key Principles

1. **No single "owner" in the family-facing UX.** All `household_admin` members are co-equal. There is no hierarchy among them.
2. **`createdByUserId` is an audit field only.** It records who originally created the household for logging purposes. It grants zero additional privileges.
3. **`isBillingContact` is a flag, not a role.** One member is marked as the billing contact for subscription purposes. This can be changed by any `household_admin`.
4. **Roles are about access patterns, not family hierarchy.** A "child" role means "uses the simplified picture-board interface" — it does not imply biological relationship.

---

## 3. Accessibility Modes

Accessibility modes are about interface presentation, not identity:

| Mode | Description |
|------|-------------|
| `standard` | Full-featured interface |
| `picture_board` | Visual/icon-based interface for young children or non-readers |
| `large_text` | High-contrast, large typography for low-vision users |
| `voice_only` | Audio-first interface for hands-free or vision-impaired users |

These modes are **not tied to roles**. An `elder` might use `standard` mode. A `member` might use `large_text`. The mode is a personal preference, not an assumption.

---

## 4. Language & Copy Guidelines

### Do

- Use the person's name: "Jordan's calendar" not "your child's calendar"
- Use their chosen relationship label: "Papa's schedule" if that's what they set
- Use their pronouns in generated text: "They have a meeting at 3pm"
- Use neutral terms when relationship is unknown: "household member," "family member," "person"
- Offer inclusive placeholder examples: "e.g., Parent, Partner, Nana, Uncle, Big Sis"

### Do Not

- Use "Mom/Dad" as defaults or placeholders
- Use "husband/wife" anywhere in the system
- Assume two-parent structures in onboarding flows
- Use "his/her" — use "their" or the stored pronoun
- Use age-based assumptions ("elderly" = needs help, "young" = can't manage)
- Use "head of household" as a singular concept

---

## 5. Data Model Contracts

These fields and their semantics are **locked** and must not be removed or repurposed in future phases:

```
household_members.pronouns       — varchar(100), free-text, optional
household_members.genderIdentity — varchar(100), free-text, optional
household_members.relationshipLabel — varchar(100), free-text, optional
household_members.isBillingContact — boolean, default false
household_members.role           — enum: household_admin, ea, member, caregiver, child, elder
users.role                       — enum: user, system_admin
households.createdByUserId       — int, audit-only, no privilege implications
```

---

## 6. AI & Generated Content Rules

When Geeves generates text (notifications, summaries, suggestions):

1. Use stored pronouns. If none set, use "they/them."
2. Use stored relationship labels. If none set, use the person's display name.
3. Never assume family structure in generated suggestions.
4. Never generate gendered greetings unless the user has explicitly set a preference.

---

## 7. Future Phase Considerations

As new features are built, apply these principles:

- **Onboarding flow:** Ask "Who lives in your household?" not "Who is in your family?" — chosen family is valid.
- **Notifications:** "Jordan has a dentist appointment" not "Your son has a dentist appointment" (unless the user configured that label).
- **Voice interface:** Use the wake word + name, never assume titles.
- **Child interfaces:** Designed for cognitive accessibility, not gendered aesthetics. No "blue for boys, pink for girls."
- **Calendar sharing:** Allow any member to share with any other member regardless of role hierarchy.

---

---

## 8. Interaction Design Conventions (Jul 2026)

These conventions govern how gestures, navigation, and data-loading behave across all views. They are **non-negotiable** — any new view or widget must comply.

### Gesture System (`useGestures.ts`)

All touch-driven navigation MUST use the centralised `useGestures` hook (`client/src/hooks/useGestures.ts`). Inline `onTouchStart`/`onTouchEnd` handlers are forbidden.

| Gesture | Meaning | Applied In |
|---------|---------|------------|
| Swipe left / right | Advance to next / previous unit | CalendarWidget, PropertiesWidget carousel, CalendarView |
| Pinch in (fingers apart) | Zoom out to larger time unit (day → week → month) | CalendarView |
| Pinch out (fingers together) | Zoom in to smaller time unit (month → week → day) | CalendarView |
| Long-press | Activate drag-reorder mode | WidgetGrid (mobile) |

### View Navigation Convention

> **Rule:** In any view that has a time unit (day, 2-day, week, month), **swiping advances to the next/previous unit of that same view**. Changing the unit itself (e.g. day → week) is done via the view-type selector toolbar, NOT by swiping.

This means:
- Day view: swipe left = next day, swipe right = previous day
- Week view: swipe left = next week, swipe right = previous week
- Month view: swipe left = next month, swipe right = previous month
- Pinch changes the view type (zoom in/out of the time scale)

### Stale-While-Revalidate

All queries that back time-navigable views (calendar events, property bookings, Gantt windows) MUST use:
```ts
staleTime: 30_000,
placeholderData: keepPreviousData,
```
This ensures navigating between periods never shows a blank/loading state — the previous period's data stays visible until the new data arrives.

### Carousel Pattern

When a widget shows one item at a time from a list (e.g. Properties carousel):
- Left/right arrow buttons are always visible on desktop
- Swipe gesture is always wired via `useGestures`
- Dot pagination indicator is shown when `items.length > 1`
- The current index is local state (not persisted)
- Per-item data (e.g. upcoming events) is anchored below the carousel and scrollable independently

---

## 9. Brand & Visual Design Contracts

The following visual decisions are **locked** and must not be changed without an explicit brand update:

| Element | Locked Value | Source |
|---------|-------------|--------|
| Primary brand colour | `#2AAFA9` Vivid Teal | `docs/BRANDING.md` |
| Wordmark font weight | Bold 700 (Outfit) | `docs/BRANDING.md` |
| Tagline text | "OPERATING SYSTEM" | `docs/BRANDING.md` |
| Permitted accent colours | 6 brand rainbow colours only | `docs/BRANDING.md` |
| Dark mode background | `#1A1C20` Deep Charcoal | `docs/BRANDING.md` |
| Vertical colour assignments | See `docs/BRANDING.md §5` | `docs/BRANDING.md` |
| Constellation node geometry | See `docs/BRANDING.md §2` | `docs/BRANDING.md` |

Any change to these values requires updating `docs/BRANDING.md`, `docs/AI_MEMORY.md`, and the `project_knowledge` database table simultaneously.

---

## 10. Documentation Standards (Jul 2026)

These rules govern how this project's documentation is maintained. **Any AI agent or contributor must follow them.**

### Bug Pattern Log (`docs/patterns/ENGINEERING_LESSONS.md`)

- **P## identifiers are reserved exclusively for bug patterns.** A bug pattern is a class of defect that has actually occurred in the codebase and been resolved.
- Feature requests, design decisions, and architectural choices are **never** assigned a P## identifier.
- Each new bug pattern entry must include: Pattern ID, Title, Root Cause, Symptoms, Fix, and Prevention rule.
- The Pattern Index at the top of the file must be updated whenever a new pattern is added.

### AI Memory (`docs/AI_MEMORY.md`)

- `AI_MEMORY.md` is **auto-generated** by the 24h heartbeat (`knowledgeReview.ts`). Never edit it manually.
- To add a new architectural or design decision: insert a row into the `project_knowledge` DB table, then trigger the heartbeat (Schedules panel → Run Now) or wait for the 24h cycle.
- After any significant sprint, insert new `project_knowledge` rows immediately — do not wait.

### Design & Architecture Docs

- `docs/GLOBAL_DESIGN.md` — updated after any sprint that changes the dashboard layout, widget behaviour, or page-level UX. Sections must reflect the **current** implementation, not the original spec.
- `docs/PHASE_1.md` — updated after any sprint that completes a previously deferred item. Move items from the Known Gaps table to ✅ Complete with the sprint date.
- `docs/DESIGN_PRINCIPLES.md` — updated when a new interaction convention, accessibility rule, or brand contract is established.
- `docs/BRANDING.md` — updated only when brand colours, typography, or logo geometry change. Requires simultaneous update to `project_knowledge`.

### Consistency Checks (Self-Enforcing)

Before delivering any sprint, the AI agent must verify:
1. All P## entries in `ENGINEERING_LESSONS.md` are genuine bug patterns (not features).
2. `GLOBAL_DESIGN.md` sections for any changed feature reflect the new implementation.
3. `PHASE_1.md` Known Gaps table is updated for any newly completed items.
4. New interaction conventions are documented in §8 of this file.
5. New architectural decisions have a corresponding `project_knowledge` DB row.

---

## 11. Shadow Block & Propagation Cardinal Rules (Jul 2026)

These three rules are **absolute and non-negotiable**. They override any convenience, any batch-processing shortcut, and any "best-effort" implementation pattern. Every propagation-related feature, bug fix, or refactor must be evaluated against all three.

### Rule 1: Calendar Owner Sovereignty

> A calendar owner’s decision about their own calendar data is sovereign. No vertical rule, no other owner’s preference, no system default can override it.

If a member sets `shadowBlocking = false` on their calendar, no propagation rule — same-vertical, cross-vertical, or default-busy — can write to that calendar. If a member opts out of Google Calendar writes (`inboundGoogleWrite = false` in the future propagation preferences model), the system must respect that even if a vertical rule says "propagate to all members."

### Rule 2: Household Independence

> Households are completely independent of each other. They only intersect insofar as members of each household can be in a shared vertical of another — in that case the vertical is the domain and sphere of access, not the household.

A propagation rule in Household A can never write to a calendar owned by Household B. Cross-household visibility does not exist. If two households share a vertical (e.g., StartOut.org), the vertical is the access domain — each household’s internal propagation rules remain isolated.

### Rule 3: Shadow Block Completeness

> A shadow block is not functionally complete until it exists on the target Google Calendar. DB-only blocks must be retried until synced.

The database row is an implementation detail. The Google Calendar event is what the user sees and relies on. Any system that marks a shadow block as "done" or "resolved" without confirming the Google Calendar write has violated this rule. The `sync_status` field (`pending_sync` → `synced` / `sync_failed`) enforces this at the data layer.

---

## 12. Test Script Development Standard

> No test script reaches a human tester until it has been verified clean at the code and API level.

Test scripts follow a **two-gate process**:

### Gate 1: Internal Verification (AI/Sandbox)

Before any test script is shared with a human tester, the AI must:

1. **Run all assertions at the code level** — verify that procedures exist, schemas are correct, access control logic is wired, and data flows are connected by inspecting source code and running vitest.
2. **Execute API-level checks from the sandbox** — query the live database, call tRPC procedures directly, verify data integrity, confirm that expected rows exist and relationships are valid.
3. **Resolve all failures** — any bug discovered during Gate 1 must be fixed before the script advances. The test script is not a bug-discovery tool for the AI; it is a UX-validation tool for the human.

Gate 1 produces a **clean internal test report** confirming all code-verifiable assertions pass.

### Gate 2: Human Testing (Live Accounts + UX Feedback)

Once Gate 1 passes cleanly, the test script is shared with a human tester. The human test focuses on:

1. **Real-world integration** — OAuth flows with real accounts, actual calendar sync, real email delivery, live platform API responses that cannot be simulated in sandbox.
2. **Areas of suspected fragility** — flows the AI identifies as likely to fail in production despite passing at the code level (timing issues, race conditions, third-party API quirks, token expiry edge cases).
3. **UX design feedback** — interaction quality, visual clarity, mobile responsiveness, cognitive load, workflow efficiency, and any friction points that only emerge through actual human use.
4. **Permission boundary testing** — verifying that restricted members actually see/don't see what the access model dictates, from a real browser session with real credentials.

### Principle

The human tester's time is expensive. Every bug that could have been caught by reading the code or querying the database is a waste of their attention. The AI's job is to exhaust all machine-verifiable checks first, so the human can focus exclusively on what only a human can evaluate: real integrations, UX quality, and edge cases that require live accounts.

---

*This document was established during Phase 1 and must be referenced before any UI copy, data model change, or feature design in subsequent phases.*

*Last updated: Jul 7, 2026 by Manus AI — Added §12 Test Script Development Standard*

---

## 13. Google OAuth Scope Policy

All Google OAuth scopes requested by Geeves.Life must follow the **principle of least privilege**. This section is mandatory reading for any contributor adding or modifying Google API integrations.

### Rules

1. **Never request the full `calendar` scope** (`https://www.googleapis.com/auth/calendar`). It grants share/permanently-delete access to all calendars — capabilities Geeves never uses. Use `calendar.events` + `calendar.calendarlist.readonly` instead.
2. **Request scopes incrementally.** Identity-only scopes at login; sensitive scopes only when the user explicitly connects an integration (Settings → Integrations → Add Account).
3. **Justify every sensitive scope.** Before adding a new scope, document in `docs/GOOGLE_OAUTH_SCOPES.md` exactly which API endpoints require it and why no narrower scope suffices.
4. **Never bundle scopes.** Each integration (Calendar, Gmail, Sheets, Drive) has its own scope set. Only request the set relevant to the operation being performed.
5. **Prefer read-only variants** unless write access is demonstrably required (e.g., `calendar.calendarlist.readonly` over `calendar.calendarlist`).

### Current Approved Scopes

| Integration | Scopes | Justification |
|-------------|--------|---------------|
| Sign-in | `openid`, `email`, `profile` | Identity only — no sensitive access |
| Calendar | `calendar.events`, `calendar.calendarlist.readonly` | Event CRUD + push notifications; calendar list for onboarding |
| Gmail Send | `gmail.send` | Outbound notifications/invites only |
| Gmail Read | `gmail.readonly` | Booking confirmation email parsing |
| Sheets | `spreadsheets` | Tax workbook + expense classification |
| Drive | `drive` | File management and uploads |

### Reference

Full analysis and justification: [`docs/GOOGLE_OAUTH_SCOPES.md`](./GOOGLE_OAUTH_SCOPES.md)

*Added: Aug 2, 2026 — OAuth scope reduction (removed overly broad `calendar` scope)*
