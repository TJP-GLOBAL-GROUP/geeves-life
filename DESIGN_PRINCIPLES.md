# Geeves Platform — Design Principles

This document codifies the foundational design decisions that **must persist across all phases** of development. Any contributor (human or AI) working on Geeves must read and adhere to these principles.

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

*This document was established during Phase 1 and must be referenced before any UI copy, data model change, or feature design in subsequent phases.*
