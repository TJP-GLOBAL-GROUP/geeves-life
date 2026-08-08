# Privacy Policy

**Geeves.Life** — operated by **TJP Global Group**  
**Effective date:** June 24, 2026  
**Updated:** August 8, 2026

---

We built Geeves to be the operating system for your household — a private, trusted space where your family's life comes together. That means we take your privacy seriously. This policy explains what information we collect, why we collect it, how we protect it, and what control you have over it. We've written it in plain language because legalese is not our style.

If you have questions, email us at **privacy@geeves.life**.

---

## 1. Who We Are

Geeves.Life is a household life-management platform developed and operated by **TJP Global Group**. The platform is invite-only — you can only access it if a household administrator has invited you. We are not a public social network or advertising platform. Your data is never sold.

---

## 2. What We Collect and Why

We collect only what we need to make the platform work for your household. Here is a plain account of each category.

### Account & Identity

When you sign in with Google or Manus, we receive your name, email address, and profile picture from that provider. We store this to identify you within your household and to send you notifications and invitations. Your household profile also includes optional fields you choose to fill in: display name, pronouns, gender identity, and a relationship label (for example, "Papa," "Nana," or "Big Sis"). These fields are entirely yours to define — we never assume them.

### Calendar & Schedule Data

If you connect a Google account for calendar synchronisation, we access your Google Calendar data — event titles, times, locations, descriptions, attendees, and recurrence rules. We use this to display your schedule, create events on your behalf, and generate privacy-preserving "busy" blocks that let other household members know you are unavailable without revealing what you are doing. We only request the calendar permissions you explicitly authorise, and only for the purposes you select (calendar sync, task management, email-based features, or sending invitations). Unified calendar views include conflict detection across your connected calendars.

### Property & Booking Data

If you manage short-term or long-term rental properties through Geeves, we collect booking data from the iCal feeds you connect (Airbnb, VRBO, Booking.com, and others). This includes booking dates, platform identifiers, and — where the platform provides it — guest first names. In future phases, we will optionally process confirmation emails from your connected email accounts to extract guest contact details and revenue figures. You control which email accounts are connected and for what purpose.

### Shopping & Commerce Data

We store your shopping lists, item history, and — if you connect your Walmart or Amazon accounts — your order history. This data is used to power smart list suggestions, recurring purchase reminders, and the autonomous shopping agent. Order history is imported from your Gmail account only with your explicit authorisation and only for the purpose of building your purchase history. We do not share this data with retailers or advertisers.

### Financial Data

We store bank account and credit card account names, transaction records you enter or import, and expense categories. Receipts you upload are stored in secure cloud storage. This data is used exclusively for your household's internal financial tracking. We do not connect to your bank directly and do not store card numbers or banking credentials.

### Notes & Tasks

Notes you create in Geeves, tasks imported from connected services (such as Asana or Google Keep, in future phases), and any voice or image input you provide are stored and used to power the Geeves assistant and your household's shared knowledge base.

### AI Interaction Data

When you use the "Ask Geeves" assistant, your messages and the assistant's responses are stored in your household's chat history. This history is used to provide context in future conversations. It is scoped to your household and is not used to train AI models without your explicit consent.

### Device & Usage Data

We collect standard server logs — IP address, browser type, pages visited, and timestamps — for security monitoring, rate limiting, and debugging. We do not use this data for advertising profiling.

### Children's Data

Geeves supports child and elder household members who interact with the platform directly, including through accessible interfaces designed for young children (picture-board mode) and users with special needs (large-text and voice modes). Where a child member is under 13, a household administrator must set up and manage their account. We do not knowingly collect personal information from children under 13 without verifiable parental or guardian consent. If you believe a child's data has been collected without appropriate consent, contact us at **privacy@geeves.life** and we will delete it promptly.

---

## 3. How We Use Your Data

We use your data only to operate and improve Geeves for your household. Specifically:

- To authenticate you and maintain your session securely.
- To display your calendars, events, bookings, shopping lists, notes, and financial data.
- To synchronise data with connected Google accounts and third-party services you authorise.
- To send household invitations and notifications via Gmail or email.
- To generate AI-assisted responses through the Geeves assistant.
- To detect conflicts in property bookings and alert you.
- To enforce the privacy and access rules your household administrators configure (vertical privacy levels, member access controls).
- To maintain an audit log of security-relevant actions within your household (for your household's own security review).
- To improve the platform — but only from users who have opted in to product improvement data sharing (see Section 7).

---

## 4. Who We Share Your Data With

We do not sell your data. We do not share it with advertisers. We share it only in the following limited circumstances.

**Google.** When you connect a Google account, data flows between Geeves and Google's APIs under the terms of your Google account agreement. We access only the scopes you authorise.

**Manus.** The Geeves platform is built on the Manus infrastructure platform. Manus processes operational data (server logs, authentication events) as a data processor on our behalf. Users who opt in to product improvement may have anonymised usage data shared with Manus for platform improvement purposes. This is strictly opt-in.

**Third-party integrations you connect.** When you connect Walmart, Amazon, Asana, Google Keep, WhatsApp Business, or any other future integration, data flows between Geeves and that service under the terms of your account with that service. We do not share your data with those services beyond what is necessary to operate the integration.

**Legal requirements.** We may disclose data if required by law, court order, or to protect the safety of our users or the public.

**Business transfers.** If TJP Global Group is acquired or merges with another entity, your data may be transferred as part of that transaction. We will notify you before your data is subject to a different privacy policy.

---

## 5. How We Protect Your Data

We take security seriously and have built multiple layers of protection into the platform.

OAuth tokens (the credentials that allow Geeves to access your Google accounts) are encrypted at rest using AES-256-GCM before being stored in the database. All data in transit is protected by TLS. We enforce HTTP security headers (including Content Security Policy and HSTS in production), rate limiting on all API endpoints, and household-level data isolation — meaning no member of one household can ever access another household's data, by design.

Access within your household is governed by the role and permission system your administrators configure. Sensitive data categories (financial records, private calendar events, guest personal information) can be restricted to specific roles or individual members.

We maintain an audit log of security-relevant actions (logins, invitations, privilege changes) for your household's own review.

No system is perfectly secure. If we become aware of a data breach that affects your personal information, we will notify you promptly.

---

## 6. Your Rights

You have meaningful control over your data.

**Access.** You can request a full export of your personal data at any time. We support GDPR Article 20 data portability — contact us at **privacy@geeves.life** or use the data export function in Settings (when available).

**Correction.** You can update your profile information at any time in Settings.

**Deletion.** You can request deletion of your account and all associated personal data. We support GDPR Article 17 right to erasure. Household administrators can also remove individual members. Contact **privacy@geeves.life** or use the account deletion function in Settings (when available). Note that some data may be retained for legal compliance or to protect the rights of other household members.

**Disconnection.** You can disconnect any connected Google account or third-party integration at any time from Settings → Integrations. Disconnecting an account stops future data access but does not delete historical data already imported. Disconnecting immediately stops syncing, removes push-notification webhooks, and revokes and purges stored OAuth tokens. Previously imported calendar events remain under your control until you delete them or delete your account; after account deletion, they are purged within 30 days.

**Opt-out of product improvement.** If you have opted in to product improvement data sharing, you can withdraw that consent at any time in Settings.

**Children's rights.** Household administrators can review, correct, or delete data associated with child member profiles at any time.

If you are in the European Economic Area, United Kingdom, or California, you have additional rights under GDPR, UK GDPR, and CCPA respectively. We honour these rights for all users regardless of location.

---

## 7. Product Improvement & Analytics

Geeves uses privacy-preserving analytics to understand how the platform is used. This is strictly opt-in. If you choose to participate, anonymised usage events (pages visited, features used, error rates) may be shared with Manus to improve the platform. No personally identifiable information is included. You can change this preference at any time in Settings.

---

## 8. Data Retention

We retain your data for as long as your account is active. If you delete your account, we delete your personal data within 30 days, except where retention is required by law or to protect the legitimate interests of other household members (for example, shared financial records).

Audit logs are retained for 12 months for security purposes.

---

## 9. Cookies & Local Storage

Geeves uses a session cookie to keep you signed in. This is a strictly necessary cookie — the platform cannot function without it. We do not use advertising cookies or third-party tracking cookies.

---

## 10. International Data Transfers

TJP Global Group operates across the United States and Jamaica. Your data may be processed in either jurisdiction. Where data is transferred internationally, we ensure appropriate safeguards are in place consistent with applicable data protection law.

---

## 11. Changes to This Policy

When we make material changes to this policy, we will notify you via the platform and update the "Last updated" date at the top of this page. Continued use of the platform after changes are notified constitutes acceptance of the updated policy.

---

## 12. Contact

**TJP Global Group**  
Email: **privacy@geeves.life**

For data subject requests (access, deletion, portability), please email **privacy@geeves.life** with the subject line "Data Request."
