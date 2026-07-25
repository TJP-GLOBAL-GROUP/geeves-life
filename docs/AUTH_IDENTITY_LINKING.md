# Auth Identity Linking — Hard Design Rules

## Problem Statement

Geeves.Life supports multiple OAuth providers (Google OAuth, Manus OAuth). When the same person logs in via different providers, the system previously created separate user records because the `users.openId` column is the unique key, and each provider generates a different openId format:

| Provider | openId Format | Example |
|----------|--------------|---------|
| Google OAuth | `google:{googleId}` | `google:110249062760050116863` |
| Manus OAuth | Manus-assigned UUID | `Rce2ghCZxYDAg6N4ESTmwN` |

This caused duplicate user records for the same person, breaking household membership, role assignments, and data continuity.

## Solution: Email-Based Identity Dedup

The fix uses email as the canonical identity anchor. On every OAuth callback, before creating or upserting a user record, the system checks if a user with the incoming email already exists in the database.

### Decision Flow

```
1. OAuth callback receives profile (openId, email, name)
2. Call getUserByEmail(profile.email)
3. IF existing user found AND existing.openId !== incoming.openId:
     → UPDATE existing user's openId to the new provider's openId
     → Log the identity link event
     → Issue session token for the NEW openId
4. ELSE:
     → Normal upsert by openId (create or update)
     → Issue session token for the openId
```

### Key Invariant

> **The most recent OAuth provider's openId wins.** When a user switches providers, their `users.openId` is updated to match the new provider. This ensures `getUserFromSession()` in `sdk.ts` always resolves correctly on subsequent requests.

## Hard Rules (MUST follow for all future auth work)

1. **Every OAuth callback MUST call `getUserByEmail()` before `upsertUser()`** — no exceptions.

2. **Email is the dedup key** — if two providers return the same email, they represent the same person.

3. **The openId column is mutable** — it reflects the current/last-used provider, not a permanent identity.

4. **Session tokens use the resolved openId** — after dedup, the session token must use the openId that is actually stored on the user row.

5. **`sdk.ts` getUserFromSession auto-creation** — this path also calls `upsertUser` by openId. Since we update the user's openId during dedup, this path will find the user correctly on subsequent requests.

6. **Never create a user without checking email first** — this applies to scheduled handlers, API imports, and any future auth provider integrations.

## Files Implementing This Pattern

| File | Role |
|------|------|
| `server/db.ts` → `getUserByEmail()` | Email lookup helper |
| `server/auth/googleOAuth.ts` | Google OAuth callback with dedup (lines 91-119) |
| `server/_core/oauth.ts` | Manus OAuth callback with dedup (lines 31-66) |
| `server/_core/sdk.ts` → `getUserFromSession()` | Session resolution (relies on openId being correct) |

## Edge Cases

**Multiple users with same email:** The current schema does not enforce email uniqueness at the DB level. The `getUserByEmail()` helper returns the first match (LIMIT 1). If duplicates already exist, manual cleanup is required (merge the records, keeping the one with household/member associations).

**User with no email:** If the OAuth provider does not return an email, dedup is skipped and normal upsert proceeds. This is acceptable because email-less accounts cannot be linked.

**Provider switch after long inactivity:** If a user logged in via Manus OAuth months ago and now uses Google OAuth, the dedup will find their old record by email, update the openId, and preserve all their data (household, role, settings).

## Cleanup of Existing Duplicates

For the known duplicate (tarik@maxfieldbakery.com), the fix was applied manually:
- Promoted the correct user record (userId=64080002) to `system_admin`
- Set `householdId` and created `household_member` record
- The old Manus OAuth record will be superseded on next Google login via the dedup logic

---

*Last updated: July 8, 2026*
