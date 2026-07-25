import { Link } from "wouter";
import { GeevesConstellationMark } from "@/components/GeevesLogo";

const LAST_UPDATED = "June 24, 2026";

export default function TermsOfService() {
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
          <Link href="/privacy" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            ← Privacy Policy
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
          <h1 className="font-display font-bold text-4xl text-foreground mb-3">Terms of Service</h1>
          <p className="text-muted-foreground text-sm">
            Operated by <strong className="text-foreground">TJP Global Group</strong> · Last updated {LAST_UPDATED}
          </p>
        </div>

        <div className="space-y-8 text-foreground/90 leading-relaxed">

          <p className="text-base text-foreground/80 border-l-2 pl-4 italic" style={{ borderColor: "#2AAFA9" }}>
            Welcome to Geeves.Life. By accessing or using the platform, you agree to these terms. We have written them in plain language — if something is unclear, email us at <a href="mailto:legal@geeves.life" className="underline" style={{ color: "#2AAFA9" }}>legal@geeves.life</a>.
          </p>

          <Section title="1. What Geeves Is">
            <p>
              Geeves.Life is a private, invite-only household life-management platform. It brings together your calendars, property bookings, shopping, finances, tasks, and household coordination in one place. It is operated by <strong>TJP Global Group</strong>.
            </p>
            <p>"Platform" means the Geeves.Life web application, its APIs, its AI assistant ("Ask Geeves"), and all related services.</p>
          </Section>

          <Section title="2. Who Can Use Geeves">
            <SubSection title="Invitation Only">
              <p>
                Geeves is not a public sign-up service. You can only access it if a household administrator has invited you. By accepting an invitation, you agree to these terms.
              </p>
            </SubSection>
            <SubSection title="Age">
              <p>
                You must be at least 13 years old to create an account or be invited as a member. Children under 13 may use the platform only through a child member profile set up and supervised by a household administrator. The household administrator is responsible for ensuring that any child's use of the platform is appropriate and that parental or guardian consent has been obtained where required by law.
              </p>
            </SubSection>
            <SubSection title="Accessible Interfaces">
              <p>
                Geeves supports accessible interface modes — including picture-board mode for young children and users with special needs, large-text mode for low-vision users, and voice mode. These modes are interface adaptations, not separate services. The same terms apply to all modes of use.
              </p>
            </SubSection>
          </Section>

          <Section title="3. Your Account">
            <SubSection title="Household Structure">
              <p>
                Every user belongs to exactly one household. A household is a private group managed by one or more household administrators. All household administrators are co-equal — there is no single "owner" in the family-facing experience.
              </p>
            </SubSection>
            <SubSection title="Your Responsibilities">
              <p>
                You are responsible for keeping your login credentials secure and for all activity that occurs under your account. If you believe your account has been compromised, contact us immediately at <a href="mailto:legal@geeves.life" className="underline" style={{ color: "#2AAFA9" }}>legal@geeves.life</a>.
              </p>
            </SubSection>
            <SubSection title="Accurate Information">
              <p>
                You agree to provide accurate information when setting up your profile. You may use any name, pronouns, and relationship labels that reflect your identity — Geeves does not impose any restrictions on these fields.
              </p>
            </SubSection>
          </Section>

          <Section title="4. Household Administrators">
            <p>
              Household administrators have significant control over the platform experience for all members of their household. By accepting the household administrator role, you agree to:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-foreground/80">
              <li>Use your administrative powers responsibly and in the genuine interest of your household.</li>
              <li>Obtain appropriate consent before inviting members, particularly minors and individuals with special needs.</li>
              <li>Configure access controls in a manner that respects the privacy and dignity of all household members.</li>
              <li>Not use administrative controls to surveil, harass, or harm any household member.</li>
            </ul>
            <p>
              TJP Global Group is not responsible for how household administrators configure access controls within their household, provided those configurations do not violate these terms or applicable law.
            </p>
          </Section>

          <Section title="5. Connected Accounts & Integrations">
            <p>
              Geeves allows you to connect external accounts — currently Google, and in future phases Walmart, Amazon, Asana, Google Keep, WhatsApp Business, and others. When you connect an account:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-foreground/80">
              <li>You authorise Geeves to access that account on your behalf, within the specific permission scopes you grant.</li>
              <li>You remain bound by the terms of service of the connected platform.</li>
              <li>You can disconnect any integration at any time from Settings → Integrations.</li>
              <li>You are responsible for ensuring you have the right to connect any account you link to Geeves.</li>
            </ul>
          </Section>

          <Section title="6. The Geeves AI Assistant">
            <p>The "Ask Geeves" assistant uses large language model technology to help you manage your household. A few important things to understand:</p>
            <p><strong>It makes mistakes.</strong> AI assistants can produce incorrect, incomplete, or outdated responses. Do not rely on Geeves for medical, legal, financial, or safety-critical decisions without independent verification.</p>
            <p><strong>It acts on your behalf.</strong> When you instruct Geeves to take an action — creating a calendar event, adding an item to a shopping list, placing an order — it acts as your agent. You are responsible for reviewing and confirming actions before they are executed, particularly for shopping and financial operations.</p>
            <p><strong>It learns from your household context.</strong> The assistant has access to your household's calendar, shopping, notes, and other data to provide relevant responses. This context is scoped to your household and is not shared with other households.</p>
            <p><strong>It does not replace professional advice.</strong> Nothing the Geeves assistant says constitutes legal, medical, financial, or therapeutic advice.</p>
          </Section>

          <Section title="7. Property Management Features">
            <p>If you use Geeves to manage rental properties, you are responsible for:</p>
            <ul className="list-disc pl-5 space-y-1 text-foreground/80">
              <li>Ensuring that your use of iCal feeds from Airbnb, VRBO, Booking.com, and other platforms complies with those platforms' terms of service.</li>
              <li>Ensuring that guest information you store in Geeves is handled in compliance with applicable privacy law and the terms of your agreements with guests.</li>
              <li>Ensuring that any automated blocking or availability management you configure through Geeves does not violate your obligations to guests or platforms.</li>
            </ul>
            <p>TJP Global Group is not a party to any agreement between you and your guests or rental platforms.</p>
          </Section>

          <Section title="8. Acceptable Use">
            <p>You agree not to use the platform to:</p>
            <ul className="list-disc pl-5 space-y-1 text-foreground/80">
              <li>Violate any applicable law or regulation.</li>
              <li>Harass, threaten, or harm any person, including other household members.</li>
              <li>Upload or transmit malware, viruses, or any harmful code.</li>
              <li>Attempt to gain unauthorised access to any part of the platform, another household's data, or any connected third-party service.</li>
              <li>Use the platform to process data about individuals without their knowledge or consent in a manner that violates applicable privacy law.</li>
              <li>Reverse-engineer, scrape, or copy the platform's code, design, or content.</li>
              <li>Use the platform for any commercial purpose beyond managing your own household, unless you have a separate written agreement with TJP Global Group.</li>
            </ul>
          </Section>

          <Section title="9. Intellectual Property">
            <p>
              The Geeves.Life platform — including its code, design, brand mark, wordmark, and documentation — is owned by TJP Global Group. These terms do not grant you any ownership interest in the platform.
            </p>
            <p>
              Your household's data — your calendar events, notes, shopping lists, financial records, and other content you create — belongs to you. We do not claim ownership of your data. You grant us a limited licence to store and process your data solely to operate the platform for your household.
            </p>
          </Section>

          <Section title="10. Privacy">
            <p>
              Your use of the platform is also governed by our{" "}
              <Link href="/privacy" className="underline" style={{ color: "#2AAFA9" }}>Privacy Policy</Link>,
              which is incorporated into these terms by reference. Please read it carefully.
            </p>
          </Section>

          <Section title="11. Availability & Changes">
            <p>
              We aim to keep Geeves available and reliable, but we cannot guarantee uninterrupted access. The platform may be unavailable during maintenance, updates, or events outside our control.
            </p>
            <p>
              We may update or change features of the platform over time. We will give reasonable notice of significant changes that affect your use of the platform. Continued use after notice constitutes acceptance of the changes.
            </p>
          </Section>

          <Section title="12. Termination">
            <SubSection title="By You">
              <p>
                You may stop using Geeves at any time. You may request deletion of your account and data by contacting <a href="mailto:legal@geeves.life" className="underline" style={{ color: "#2AAFA9" }}>legal@geeves.life</a> or using the account deletion function in Settings.
              </p>
            </SubSection>
            <SubSection title="By Us">
              <p>
                We may suspend or terminate your access to the platform if you violate these terms, if required by law, or if we discontinue the platform. We will give reasonable notice where possible. If we terminate your account for reasons other than a violation of these terms, we will provide you with a copy of your data on request.
              </p>
            </SubSection>
            <SubSection title="Household Removal">
              <p>
                A household administrator may remove you from a household. Removal ends your access to that household's data. Your personal account data is not deleted by removal from a household.
              </p>
            </SubSection>
          </Section>

          <Section title="13. Disclaimers">
            <p>
              The platform is provided "as is." To the fullest extent permitted by law, TJP Global Group makes no warranties — express or implied — about the platform's fitness for a particular purpose, accuracy, reliability, or availability.
            </p>
            <p>
              We are not responsible for the actions of third-party services you connect to Geeves, including Google, Walmart, Amazon, Airbnb, VRBO, or any other integration.
            </p>
          </Section>

          <Section title="14. Limitation of Liability">
            <p>
              To the fullest extent permitted by applicable law, TJP Global Group's total liability to you for any claim arising from your use of the platform is limited to the amount you paid us in the 12 months preceding the claim. We are not liable for indirect, incidental, consequential, or punitive damages.
            </p>
            <p>
              Nothing in these terms limits our liability for fraud, gross negligence, or death or personal injury caused by our negligence.
            </p>
          </Section>

          <Section title="15. Governing Law & Disputes">
            <p>
              These terms are governed by the laws of the <strong>State of New York</strong>, United States, without regard to conflict of law principles. Any dispute arising from these terms or your use of the platform will be resolved in the courts of New York, and you consent to the personal jurisdiction of those courts.
            </p>
            <p>
              We encourage you to contact us at <a href="mailto:legal@geeves.life" className="underline" style={{ color: "#2AAFA9" }}>legal@geeves.life</a> before initiating any legal proceeding — most issues can be resolved quickly and informally.
            </p>
          </Section>

          <Section title="16. Changes to These Terms">
            <p>
              When we make material changes to these terms, we will notify you via the platform and update the "Last updated" date at the top of this page. Continued use of the platform after notice of changes constitutes acceptance of the updated terms.
            </p>
          </Section>

          <Section title="17. Contact">
            <p>
              <strong>TJP Global Group</strong><br />
              Email: <a href="mailto:legal@geeves.life" className="underline" style={{ color: "#2AAFA9" }}>legal@geeves.life</a>
            </p>
            <p>
              For privacy-related requests, see our <Link href="/privacy" className="underline" style={{ color: "#2AAFA9" }}>Privacy Policy</Link> or email <a href="mailto:privacy@geeves.life" className="underline" style={{ color: "#2AAFA9" }}>privacy@geeves.life</a>.
            </p>
          </Section>

        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/40 mt-16">
        <div className="max-w-3xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <span>© {new Date().getFullYear()} TJP Global Group. All rights reserved.</span>
          <div className="flex items-center gap-6">
            <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-foreground transition-colors font-medium" style={{ color: "#2AAFA9" }}>Terms of Service</Link>
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
