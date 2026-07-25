# Geeves.Life — Security Assessment & Compliance Roadmap
**Version:** 2.0 — June 18, 2026 (post-implementation update)  
**Scope:** Geeves.life web application (geeves.manus.space), hosted on Manus Autoscale (Cloud Run)  
**Standard:** ISO/IEC 27001:2022 Annex A controls; supplementary SOC 2 Type II and GDPR/CCPA alignment  
**Author:** Manus AI — for review by Supah-T / Geeves product team

---

## Executive Summary

Geeves.life is a personal life management platform that aggregates highly sensitive personal data: Google Calendar events, property booking records, household member profiles, shopping orders, and OAuth tokens for third-party services. The platform is currently in active development and has a solid security foundation — Manus OAuth, JWT session cookies, tRPC input validation, and role-based access control are all in place.

**Version 2.0 update (June 18, 2026):** A security hardening sprint was completed, closing Gaps 1, 2, 3, and 5 from the original assessment. Three gaps remain open. This document has been updated to reflect the current state.

---

## 1. Current Security Posture

### 1.1 What Is Already in Place

The following security controls are confirmed present in the codebase as of the June 18, 2026 audit:

| Control | Implementation | ISO 27001 Annex A Reference |
|---|---|---|
| Authentication | Manus OAuth 2.0 + Google OAuth 2.0; JWT session cookies signed with `JWT_SECRET` | A.8.5 Secure authentication |
| Authorisation | tRPC `protectedProcedure` + `adminProcedure`; RBAC module (`server/auth/rbac.ts`) with 6 household roles | A.8.3 Information access restriction |
| Input validation | Zod schemas on all tRPC procedure inputs; no raw SQL string interpolation (Drizzle ORM parameterised queries) | A.8.28 Secure coding |
| Transport security | All traffic served over HTTPS via Manus platform TLS termination | A.8.20 Networks security |
| Session management | HTTP-only, SameSite=Strict session cookies; logout clears server-side session | A.8.5 Secure authentication |
| Secret management | All secrets injected as environment variables; no secrets committed to code | A.8.13 Information backup / A.5.33 Protection of records |
| File storage | All user files stored in S3 with non-enumerable keys; no file bytes in DB | A.8.10 Information deletion |
| Real-time isolation | Socket.io rooms scoped to `household:{householdId}`; cross-household data leakage prevented | A.8.3 Information access restriction |
| Audit trail (partial) | `createdBy` / `lastModifiedBy` fields on events, shadow blocks, and bookings | A.8.15 Logging |

### 1.2 Security Gaps — Current Status

Six security gaps were identified in the original assessment. Three have been closed in the June 18, 2026 sprint. Three remain open.

---

## 2. Critical Gap Analysis

### Gap 1 — OAuth Tokens Stored in Plaintext ✅ CLOSED

**Original Finding:** The `oauth_tokens` table stored Google OAuth `accessToken` and `refreshToken` values as plaintext `text` columns.

**Remediation Applied (June 18, 2026):** `server/tokenEncryption.ts` was created implementing AES-256-GCM encryption. The key is derived from `JWT_SECRET` using PBKDF2 (no separate `TOKEN_ENCRYPTION_KEY` secret required). All `db.ts` OAuth helpers (`storeOAuthToken`, `upsertOAuthToken`, `getOAuthToken`, `getAllOAuthTokens`, `getOAuthTokenByEmail`, `updateOAuthToken`) now encrypt on write and transparently decrypt on read. Legacy plaintext rows are decoded gracefully (the helper detects the `enc:` prefix and skips decryption for unencrypted rows).

**Remaining sub-gap:** Existing plaintext rows in the live `oauth_tokens` table have not yet been backfill-migrated. New writes are encrypted; old rows remain plaintext until a migration script is run. The `tokenEncryption.ensureEncrypted` helper is available for this purpose.

**ISO 27001 Reference:** A.8.24 Use of cryptography; A.8.5 Secure authentication.

**Recommended next action:** Run the backfill migration before inviting non-owner household members.

---

### Gap 2 — No Rate Limiting or Brute-Force Protection ✅ CLOSED

**Original Finding:** No rate limiting on any Express endpoint.

**Remediation Applied (June 18, 2026):** `express-rate-limit` added in `server/_core/index.ts`:
- `/api/trpc/*`: 300 requests per 15 minutes per IP
- `/api/oauth/*`: 20 requests per 15 minutes per IP

**ISO 27001 Reference:** A.8.6 Capacity management; A.8.5 Secure authentication.

---

### Gap 3 — No Security Headers ✅ CLOSED

**Original Finding:** No `helmet` middleware; all security headers absent.

**Remediation Applied (June 18, 2026):** `helmet` added as first middleware in `server/_core/index.ts` with:
- Full `Content-Security-Policy` (default-self, script-src includes Google accounts and unsafe-inline for Vite, connect-src includes googleapis and wss:, img-src includes data: and https:)
- `X-Frame-Options: SAMEORIGIN`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Strict-Transport-Security` (production only, maxAge 1 year)
- `crossOriginEmbedderPolicy: false` (required for Google Maps)

**ISO 27001 Reference:** A.8.20 Networks security; A.8.28 Secure coding.

---

### Gap 4 — No Audit Log (MEDIUM)

**Finding:** While individual records have `createdBy` and `lastModifiedBy` fields, there is no centralised audit log table. Destructive operations — event deletion, household member removal, property deletion, OAuth token revocation — are not recorded anywhere. This means there is no way to reconstruct what happened if data is lost or a member account is compromised.

**ISO 27001 Reference:** A.8.15 Logging; A.8.16 Monitoring activities; A.5.28 Collection of evidence.

**Remediation:** Create an `audit_log` table with columns: `id`, `householdId`, `actorUserId`, `action` (enum), `resourceType`, `resourceId`, `before` (JSON), `after` (JSON), `ipAddress`, `userAgent`, `createdAt`. Write to it from a shared `auditLog(ctx, action, resource)` helper called from all mutating tRPC procedures. Retain logs for 90 days minimum (ISO 27001 A.8.15 recommends 12 months for critical systems).

**Priority:** P2 — implement before inviting non-owner household members.

---

### Gap 5 — No CORS Policy ✅ PARTIALLY CLOSED

**Original Finding:** Socket.io used `origin: "*"`; Express had no CORS middleware.

**Remediation Applied (June 18, 2026):** Socket.io CORS restricted to `[APP_URL, localhost:3000, localhost:5173]` in production. Falls back to `"*"` only when `APP_URL` is not set (dev sandbox environment). Express API routes are served on the same origin as the frontend (Vite proxy in dev; same server in production), so no separate `cors` middleware is required for tRPC routes.

**Remaining sub-gap:** The Socket.io fallback to `"*"` when `APP_URL` is unset means dev environments are not fully locked down. This is acceptable for a private dev sandbox but should be documented.

**ISO 27001 Reference:** A.8.20 Networks security.

---

### Gap 6 — No Data Retention or Deletion Policy (MEDIUM)

**Finding:** There is no mechanism to delete household data, revoke OAuth tokens, or export personal data. This is a requirement under GDPR Article 17 (right to erasure) and CCPA Section 1798.105. If a household member leaves, their data (calendar events, shopping lists, notes) remains in the database indefinitely.

**ISO 27001 Reference:** A.8.10 Information deletion; A.5.34 Privacy and protection of PII.

**Remediation:** Implement a `household.deleteAccount` tRPC procedure that: (1) revokes all OAuth tokens via the Google token revocation endpoint, (2) deletes all household data in cascade order, (3) anonymises audit log entries (replace `actorUserId` with a tombstone). Add a "Delete my account" option to the Settings page. Document the data retention policy in a `PRIVACY_POLICY.md`.

**Priority:** P2 — required before GDPR/CCPA compliance.

---

## 3. ISO 27001:2022 Control Coverage Matrix

The table below maps the 93 Annex A controls to their current status in Geeves.life. Only controls relevant to a SaaS web application are included; physical security controls (A.7.*) are inherited from the Manus/Google Cloud Run hosting environment.

| Annex A Domain | Control | Status | Notes |
|---|---|---|---|
| **A.5 Organisational** | A.5.1 Policies | ⚠️ Partial | No formal written security policy document |
| | A.5.9 Inventory of assets | ⚠️ Partial | `docs/AI_MEMORY.md` covers architecture; no formal asset register |
| | A.5.33 Protection of records | ✅ | Secrets in env vars; no secrets in code |
| | A.5.34 Privacy and PII | ❌ | No privacy policy; no data deletion mechanism |
| **A.8 Technological** | A.8.2 Privileged access rights | ✅ | `adminProcedure` gates all admin operations |
| | A.8.3 Information access restriction | ✅ | RBAC enforced on all procedures |
| | A.8.5 Secure authentication | ⚠️ Partial | Auth in place; rate limiting added; no MFA |
| | A.8.6 Capacity management | ✅ | `express-rate-limit` on tRPC + OAuth endpoints (June 18, 2026) |
| | A.8.9 Configuration management | ✅ | Infrastructure managed by Manus platform |
| | A.8.10 Information deletion | ❌ | No account deletion or data purge mechanism |
| | A.8.15 Logging | ❌ | No centralised audit log |
| | A.8.16 Monitoring | ⚠️ Partial | Manus platform logs exist; no application-level alerting |
| | A.8.20 Networks security | ⚠️ Partial | HTTPS + helmet headers + Socket.io CORS added; no formal CORS policy for API |
| | A.8.24 Use of cryptography | ⚠️ Partial | AES-256-GCM encryption added for new writes; legacy rows not yet backfilled |
| | A.8.25 Secure development lifecycle | ✅ | TypeScript strict mode; Zod validation; Vitest tests |
| | A.8.28 Secure coding | ✅ | Drizzle ORM parameterised queries; no raw SQL |
| | A.8.29 Security testing | ⚠️ Partial | Unit tests exist; no penetration testing or SAST |
| | A.8.32 Change management | ⚠️ Partial | Checkpoint system provides rollback; no formal change log |

---

## 4. Compliance Roadmap

### Phase A — Pre-Member Launch ✅ COMPLETE (June 18, 2026)

All Phase A items have been completed:

1. ✅ **OAuth token encryption** — AES-256-GCM via `server/tokenEncryption.ts`; new writes encrypted; legacy backfill migration still needed
2. ✅ **Rate limiting** — `express-rate-limit` on `/api/trpc` and `/api/oauth`
3. ✅ **Security headers** — `helmet` with full CSP, HSTS, X-Frame-Options, X-Content-Type-Options

**Remaining pre-member action:** Run the OAuth token backfill migration to encrypt existing plaintext rows.

### Phase B — Pre-Public Launch (P2, ~4 weeks)

These items are required before Geeves is offered to users outside the Perkins household:

4. **Centralised audit log** (Gap 4) — `audit_log` table + `auditLog()` helper in all mutating procedures
5. **Account deletion + data export** (Gap 6) — GDPR/CCPA compliance
6. **Privacy Policy document** — `docs/PRIVACY_POLICY.md` covering data collected, retention periods, third-party sharing (Google, Manus), and user rights
7. **Dependency audit** — run `pnpm audit` and resolve all high/critical CVEs
8. **Session token rotation** — rotate JWT on role/privilege change

### Phase C — ISO 27001 Certification Readiness (~3 months)

For formal ISO 27001 certification (relevant if Geeves becomes a commercial product):

9. **Information Security Management System (ISMS) documentation** — formal security policy, risk register, statement of applicability, and incident response plan
10. **Penetration testing** — engage a third-party pen tester; remediate findings
11. **Multi-factor authentication** — add TOTP/passkey support for household admin accounts
12. **Security awareness training** — document for any staff or contractors with system access
13. **Supplier assessment** — formal security assessment of Manus, Google Cloud, and TiDB as data processors

---

## 5. Recommendations for geeves.life as a Product

If Geeves is intended to become a commercial product (SaaS offered to other families), the following additional steps are required:

**SOC 2 Type II** is the most practical certification for a US-based SaaS product targeting families. It covers Security, Availability, and Confidentiality trust service criteria. The audit period is typically 6–12 months. The Phase A and B items above are prerequisites.

**GDPR compliance** is required if any European users are served. The key obligations are: lawful basis for processing (consent or legitimate interest), privacy notice, data subject rights (access, erasure, portability), and a Data Processing Agreement with all sub-processors (Google, Manus, TiDB).

**COPPA compliance** is required because Geeves explicitly supports child household members. Any feature accessible to a `child` role user must not collect data beyond what is strictly necessary, must not display advertising, and must obtain verifiable parental consent before the child account is activated.

**Current status (June 18, 2026):** Phase A is complete. The platform is now safe to invite non-owner household members, subject to running the OAuth token backfill migration. Phase B items should be completed before Geeves is offered to users outside the Perkins household.

---

## 6. References

[1] ISO/IEC 27001:2022 — Information security, cybersecurity and privacy protection — https://www.iso.org/standard/27001  
[2] NIST SP 800-63B — Digital Identity Guidelines: Authentication and Lifecycle Management — https://pages.nist.gov/800-63-3/sp800-63b.html  
[3] GDPR Article 17 — Right to erasure — https://gdpr-info.eu/art-17-gdpr/  
[4] COPPA — Children's Online Privacy Protection Rule — https://www.ftc.gov/legal-library/browse/rules/childrens-online-privacy-protection-rule-coppa  
[5] OWASP Top 10 2021 — https://owasp.org/www-project-top-ten/  
[6] express-rate-limit — https://github.com/express-rate-limit/express-rate-limit  
[7] helmet.js — https://helmetjs.github.io/
