import { Link } from "wouter";
import { GeevesConstellationMark } from "@/components/GeevesLogo";

const LAST_UPDATED = "June 24, 2026";

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border/40 sticky top-0 z-10 bg-background/95 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <GeevesConstellationMark size={28} />
            <span className="font-display font-bold text-lg text-foreground">
              Geeves<span style={{ color: "#2AAFA9" }}>.Life</span>
            </span>
          </Link>
          <Link href="/terms" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Terms of Service →
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-6 py-12">
        {/* Title block */}
        <div className="mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium mb-4"
            style={{ backgroundColor: "rgba(42,175,169,0.12)", color: "#2AAFA9" }}>
            Legal
          </div>
          <h1 className="font-display font-bold text-4xl text-foreground mb-3">Privacy Policy</h1>
          <p className="text-muted-foreground text-sm">
            Operated by <strong className="text-foreground">TJP Global Group</strong> · Last updated {LAST_UPDATED}
          </p>
        </div>

        <div className="prose prose-sm max-w-none space-y-8 text-foreground/90 leading-relaxed">

          <p className="text-base text-foreground/80 border-l-2 pl-4 italic" style={{ borderColor: "#2AAFA9" }}>
            We built Geeves to be the operating system for your household — a private, trusted space where your family's life comes together. That means we take your privacy seriously. This policy explains what information we collect, why we collect it, how we protect it, and what control you have over it. We've written it in plain language because legalese is not our style.
          </p>
          <p className="text-sm text-muted-foreground">
            Questions? Email us at <a href="mailto:privacy@geeves.life" className="underline" style={{ color: "#2AAFA9" }}>privacy@geeves.life</a>.
          </p>

          <Section title="1. Who We Are">
            <p>
              Geeves.Life is a private, invite-only household life-management platform developed and operated by <strong>TJP Global Group</strong>. You can only access it if a household administrator has invited you. We are not a public social network or advertising platform. <strong>Your data is never sold.</strong>
            </p>
          </Section>

          <Section title="2. What We Collect and Why">
            <p>We collect only what we need to make the platform work for your household.</p>

            <SubSection title="Account & Identity">
              <p>
                When you sign in with Google or Manus, we receive your name, email address, and profile picture from that provider. Your household profile also includes optional fields you choose to fill in: display name, pronouns, gender identity, and a relationship label (for example, "Papa," "Nana," or "Big Sis"). These fields are entirely yours to define — we never assume them.
              </p>
            </SubSection>

            <SubSection title="Calendar & Schedule Data">
              <p>
                If you connect a Google account for calendar synchronisation, we access your Google Calendar data — event titles, times, locations, descriptions, attendees, and recurrence rules. We use this to display your schedule, create events on your behalf, and generate privacy-preserving "busy" blocks that let other household members know you are unavailable without revealing what you are doing. We only request the calendar permissions you explicitly authorise.
              </p>
            </SubSection>

            <SubSection title="Property & Booking Data">
              <p>
                If you manage rental properties through Geeves, we collect booking data from the iCal feeds you connect (Airbnb, VRBO, Booking.com, and others). In future phases, we will optionally process confirmation emails from your connected email accounts to extract guest contact details and revenue figures. You control which email accounts are connected and for what purpose.
              </p>
            </SubSection>

            <SubSection title="Shopping & Commerce Data">
              <p>
                We store your shopping lists, item history, and — if you connect your Walmart or Amazon accounts — your order history. This data powers smart list suggestions, recurring purchase reminders, and the autonomous shopping agent. Order history is imported from your Gmail account only with your explicit authorisation. We do not share this data with retailers or advertisers.
              </p>
            </SubSection>

            <SubSection title="Financial Data">
              <p>
                We store bank account and credit card account names, transaction records you enter or import, and expense categories. Receipts you upload are stored in secure cloud storage. This data is used exclusively for your household's internal financial tracking. We do not connect to your bank directly and do not store card numbers or banking credentials.
              </p>
            </SubSection>

            <SubSection title="Notes & Tasks">
              <p>
                Notes you create in Geeves, tasks imported from connected services (such as Asana or Google Keep, in future phases), and any voice or image input you provide are stored and used to power the Geeves assistant and your household's shared knowledge base.
              </p>
            </SubSection>

            <SubSection title="AI Interaction Data">
              <p>
                When you use the "Ask Geeves" assistant, your messages and the assistant's responses are stored in your household's chat history. This history is used to provide context in future conversations. It is scoped to your household and is not used to train AI models without your explicit consent.
              </p>
            </SubSection>

            <SubSection title="Device & Usage Data">
              <p>
                We collect standard server logs — IP address, browser type, pages visited, and timestamps — for security monitoring, rate limiting, and debugging. We do not use this data for advertising profiling.
              </p>
            </SubSection>

            <SubSection title="Children's Data">
              <p>
                Geeves supports child and elder household members who interact with the platform directly, including through accessible interfaces designed for young children (picture-board mode) and users with special needs (large-text and voice modes). Where a child member is under 13, a household administrator must set up and manage their account. We do not knowingly collect personal information from children under 13 without verifiable parental or guardian consent. If you believe a child's data has been collected without appropriate consent, contact us at <a href="mailto:privacy@geeves.life" className="underline" style={{ color: "#2AAFA9" }}>privacy@geeves.life</a> and we will delete it promptly.
              </p>
            </SubSection>
          </Section>

          <Section title="3. How We Use Your Data">
            <p>We use your data only to operate and improve Geeves for your household. Specifically:</p>
            <ul className="list-disc pl-5 space-y-1 text-foreground/80">
              <li>To authenticate you and maintain your session securely.</li>
              <li>To display your calendars, events, bookings, shopping lists, notes, and financial data.</li>
              <li>To synchronise data with connected Google accounts and third-party services you authorise.</li>
              <li>To send household invitations and notifications via Gmail or email.</li>
              <li>To generate AI-assisted responses through the Geeves assistant.</li>
              <li>To detect conflicts in property bookings and alert you.</li>
              <li>To enforce the privacy and access rules your household administrators configure.</li>
              <li>To maintain an audit log of security-relevant actions within your household.</li>
              <li>To improve the platform — but only from users who have opted in to product improvement data sharing (see Section 7).</li>
            </ul>
          </Section>

          <Section title="4. Who We Share Your Data With">
            <p>We do not sell your data. We do not share it with advertisers. We share it only in the following limited circumstances.</p>
            <p><strong>Google.</strong> When you connect a Google account, data flows between Geeves and Google's APIs under the terms of your Google account agreement. We access only the scopes you authorise.</p>
            <p><strong>Manus.</strong> The Geeves platform is built on the Manus infrastructure platform. Manus processes operational data as a data processor on our behalf. Users who opt in to product improvement may have anonymised usage data shared with Manus for platform improvement purposes. This is strictly opt-in.</p>
            <p><strong>Third-party integrations you connect.</strong> When you connect Walmart, Amazon, Asana, Google Keep, WhatsApp Business, or any other future integration, data flows between Geeves and that service under the terms of your account with that service. We do not share your data with those services beyond what is necessary to operate the integration.</p>
            <p><strong>Legal requirements.</strong> We may disclose data if required by law, court order, or to protect the safety of our users or the public.</p>
            <p><strong>Business transfers.</strong> If TJP Global Group is acquired or merges with another entity, your data may be transferred as part of that transaction. We will notify you before your data is subject to a different privacy policy.</p>
          </Section>

          <Section title="5. How We Protect Your Data">
            <p>
              OAuth tokens are encrypted at rest using AES-256-GCM before being stored in the database. All data in transit is protected by TLS. We enforce HTTP security headers (including Content Security Policy and HSTS in production), rate limiting on all API endpoints, and household-level data isolation — meaning no member of one household can ever access another household's data, by design.
            </p>
            <p>
              Access within your household is governed by the role and permission system your administrators configure. Sensitive data categories (financial records, private calendar events, guest personal information) can be restricted to specific roles or individual members.
            </p>
            <p>
              No system is perfectly secure. If we become aware of a data breach that affects your personal information, we will notify you promptly.
            </p>
          </Section>

          <Section title="6. Your Rights">
            <p>You have meaningful control over your data.</p>
            <p><strong>Access.</strong> You can request a full export of your personal data at any time. We support GDPR Article 20 data portability — contact us at <a href="mailto:privacy@geeves.life" className="underline" style={{ color: "#2AAFA9" }}>privacy@geeves.life</a>.</p>
            <p><strong>Correction.</strong> You can update your profile information at any time in Settings.</p>
            <p><strong>Deletion.</strong> You can request deletion of your account and all associated personal data. We support GDPR Article 17 right to erasure. Contact <a href="mailto:privacy@geeves.life" className="underline" style={{ color: "#2AAFA9" }}>privacy@geeves.life</a> or use the account deletion function in Settings.</p>
            <p><strong>Disconnection.</strong> You can disconnect any connected Google account or third-party integration at any time from Settings → Integrations.</p>
            <p><strong>Opt-out of product improvement.</strong> If you have opted in to product improvement data sharing, you can withdraw that consent at any time in Settings.</p>
            <p><strong>Children's rights.</strong> Household administrators can review, correct, or delete data associated with child member profiles at any time.</p>
            <p>If you are in the European Economic Area, United Kingdom, or California, you have additional rights under GDPR, UK GDPR, and CCPA respectively. We honour these rights for all users regardless of location.</p>
          </Section>

          <Section title="7. Product Improvement & Analytics">
            <p>
              Geeves uses privacy-preserving analytics to understand how the platform is used. This is strictly opt-in. If you choose to participate, anonymised usage events (pages visited, features used, error rates) may be shared with Manus to improve the platform. No personally identifiable information is included. You can change this preference at any time in Settings.
            </p>
          </Section>

          <Section title="8. Data Retention">
            <p>
              We retain your data for as long as your account is active. If you delete your account, we delete your personal data within 30 days, except where retention is required by law or to protect the legitimate interests of other household members. Audit logs are retained for 12 months for security purposes.
            </p>
          </Section>

          <Section title="9. Cookies & Local Storage">
            <p>
              Geeves uses a session cookie to keep you signed in. This is a strictly necessary cookie — the platform cannot function without it. We do not use advertising cookies or third-party tracking cookies.
            </p>
          </Section>

          <Section title="10. International Data Transfers">
            <p>
              TJP Global Group operates across the United States and Jamaica. Your data may be processed in either jurisdiction. Where data is transferred internationally, we ensure appropriate safeguards are in place consistent with applicable data protection law.
            </p>
          </Section>

          <Section title="11. Changes to This Policy">
            <p>
              When we make material changes to this policy, we will notify you via the platform and update the "Last updated" date at the top of this page. Continued use of the platform after changes are notified constitutes acceptance of the updated policy.
            </p>
          </Section>

          <Section title="12. Contact">
            <p>
              <strong>TJP Global Group</strong><br />
              Email: <a href="mailto:privacy@geeves.life" className="underline" style={{ color: "#2AAFA9" }}>privacy@geeves.life</a>
            </p>
            <p>For data subject requests (access, deletion, portability), please email <a href="mailto:privacy@geeves.life" className="underline" style={{ color: "#2AAFA9" }}>privacy@geeves.life</a> with the subject line "Data Request."</p>
          </Section>

        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/40 mt-16">
        <div className="max-w-3xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <span>© {new Date().getFullYear()} TJP Global Group. All rights reserved.</span>
          <div className="flex items-center gap-6">
            <Link href="/privacy" className="hover:text-foreground transition-colors font-medium" style={{ color: "#2AAFA9" }}>Privacy Policy</Link>
            <Link href="/terms" className="hover:text-foreground transition-colors">Terms of Service</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="font-display font-bold text-xl text-foreground pt-2">{title}</h2>
      <div className="space-y-3 text-foreground/80">{children}</div>
    </section>
  );
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1 pl-4 border-l border-border/60">
      <h3 className="font-semibold text-foreground text-sm">{title}</h3>
      <div className="text-foreground/75 text-sm">{children}</div>
    </div>
  );
}
