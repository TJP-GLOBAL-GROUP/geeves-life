import { Link } from "wouter";
import { GeevesConstellationMark } from "@/components/GeevesLogo";

const LAST_UPDATED = "July 25, 2026";
const EFFECTIVE_DATE = "July 25, 2026";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="font-display font-semibold text-xl text-foreground border-b border-border/40 pb-2">
        {title}
      </h2>
      <div className="space-y-3 text-foreground/80">{children}</div>
    </section>
  );
}

export default function QboEula() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/40 sticky top-0 z-10 bg-background/95 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <GeevesConstellationMark size={28} />
            <span className="font-display font-bold text-lg text-foreground">
              Geeves<span style={{ color: "#2AAFA9" }}>.Life</span>
            </span>
          </Link>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-foreground transition-colors">Terms of Service</Link>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-6 py-12">
        {/* Title block */}
        <div className="mb-10">
          <div
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium mb-4"
            style={{ backgroundColor: "rgba(42,175,169,0.12)", color: "#2AAFA9" }}
          >
            Legal · QuickBooks Integration
          </div>
          <h1 className="font-display font-bold text-4xl text-foreground mb-3">
            End-User Licence Agreement
          </h1>
          <p className="text-muted-foreground text-sm">
            <strong className="text-foreground">Geeves.Life — QuickBooks Online Integration</strong>
            {" "}· Effective {EFFECTIVE_DATE} · Last updated {LAST_UPDATED}
          </p>
          <p className="text-muted-foreground text-sm mt-1">
            Operated by <strong className="text-foreground">TJP Global Group LLC</strong>
            {" "}·{" "}
            <a href="mailto:legal@geeves.life" className="underline hover:opacity-80 transition-opacity" style={{ color: "#2AAFA9" }}>
              legal@geeves.life
            </a>
          </p>
        </div>

        <div className="prose prose-sm max-w-none space-y-8 text-foreground/90 leading-relaxed">
          {/* Intro callout */}
          <p className="text-base text-foreground/80 border-l-2 pl-4 italic" style={{ borderColor: "#2AAFA9" }}>
            By connecting your QuickBooks Online account to Geeves.Life, you agree to the terms below.
            This agreement governs how we access, use, and protect your QuickBooks data on your behalf.
          </p>

          <Section title="1. Acceptance of Terms">
            <p>
              By connecting your QuickBooks Online ("QBO") account to Geeves.Life, you ("User", "you", or "your")
              agree to be bound by this End-User Licence Agreement ("Agreement"). If you do not agree to these
              terms, do not connect your QBO account. This Agreement supplements, and does not replace, Intuit's
              own Terms of Service and Privacy Policy, which continue to govern your use of QuickBooks Online
              directly.
            </p>
          </Section>

          <Section title="2. Description of the Integration">
            <p>
              Geeves.Life is a household and property management platform that helps users track income, expenses,
              bookings, and financial reconciliation across multiple properties and business entities. The
              QuickBooks Online integration ("Integration") enables Geeves.Life to:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Read transaction data, accounts, classes, and categories from your connected QBO company file to populate and reconcile expense records within Geeves.Life.</li>
              <li>Write categorised, reconciled transactions back to QBO as journal entries or expense records, as directed by you.</li>
              <li>Synchronise vendor, property, and vertical classifications between Geeves.Life and QBO to maintain consistent bookkeeping across both platforms.</li>
            </ul>
            <p>
              The Integration operates on your explicit instruction. Geeves.Life does not initiate writes to your
              QBO company file without a user-confirmed action within the Geeves.Life interface.
            </p>
          </Section>

          <Section title="3. Licence Grant">
            <p>
              Subject to your compliance with this Agreement, TJP Global Group LLC grants you a limited,
              non-exclusive, non-transferable, revocable licence to use the Integration solely for your personal
              or internal business purposes in connection with your authorised use of Geeves.Life. This licence
              does not permit you to sublicence, resell, or otherwise make the Integration available to third
              parties.
            </p>
          </Section>

          <Section title="4. Data Access and Privacy">
            <p>
              <strong>4.1 Data Accessed.</strong> When you connect your QBO account, Geeves.Life requests access
              to the following QBO data scope: <code className="text-xs bg-muted px-1 py-0.5 rounded">com.intuit.quickbooks.accounting</code> (read
              and write access to your QBO company accounting data). Geeves.Life accesses only the data necessary
              to provide the reconciliation and categorisation features described in Section 2.
            </p>
            <p>
              <strong>4.2 Data Storage.</strong> QBO access tokens are stored encrypted in Geeves.Life's database
              using AES-256 encryption. Geeves.Life does not store your QBO username or password. Transaction data
              retrieved from QBO is stored in your Geeves.Life account and is subject to the{" "}
              <Link href="/privacy" className="underline hover:opacity-80" style={{ color: "#2AAFA9" }}>
                Geeves.Life Privacy Policy
              </Link>.
            </p>
            <p>
              <strong>4.3 Data Use.</strong> Geeves.Life uses data retrieved from QBO solely to provide the
              features of the Integration to you. We do not sell, share, or use your QBO data for advertising,
              profiling, or any purpose other than operating the Integration on your behalf.
            </p>
            <p>
              <strong>4.4 Intuit Data Governance.</strong> Your QBO data remains subject to Intuit's Privacy
              Statement and Terms of Service. You may revoke Geeves.Life's access to your QBO account at any time
              through your Intuit account settings at{" "}
              <a
                href="https://accounts.intuit.com/app/account-manager/connections"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:opacity-80"
                style={{ color: "#2AAFA9" }}
              >
                accounts.intuit.com/app/account-manager/connections
              </a>.
            </p>
          </Section>

          <Section title="5. User Responsibilities">
            <p>You are responsible for:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Maintaining the security of your Geeves.Life account credentials.</li>
              <li>Ensuring that your use of the Integration complies with applicable laws and your QBO subscription terms.</li>
              <li>Reviewing all data written to QBO by the Integration before submission to any tax authority or financial institution.</li>
              <li>Maintaining adequate backups of your QBO company file independently of Geeves.Life.</li>
            </ul>
          </Section>

          <Section title="6. Restrictions">
            <p>You may not:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Use the Integration to access QBO data belonging to a company file you are not authorised to access.</li>
              <li>Reverse-engineer, decompile, or attempt to extract the source code of the Integration.</li>
              <li>Use the Integration in any manner that violates Intuit's API Terms of Service or Developer Agreement.</li>
              <li>Use the Integration for any unlawful purpose, including but not limited to tax fraud, financial misrepresentation, or money laundering.</li>
            </ul>
          </Section>

          <Section title="7. Intellectual Property">
            <p>
              The Integration, including all software, algorithms, and associated documentation, is the proprietary
              property of TJP Global Group LLC and is protected by copyright, trade secret, and other intellectual
              property laws. QuickBooks and the QuickBooks logo are trademarks of Intuit Inc. Geeves.Life is not
              affiliated with, endorsed by, or sponsored by Intuit Inc.
            </p>
          </Section>

          <Section title="8. Disclaimer of Warranties">
            <p className="uppercase text-xs leading-relaxed text-foreground/70">
              The Integration is provided "as is" and "as available" without warranty of any kind, express or
              implied, including but not limited to warranties of merchantability, fitness for a particular purpose,
              and non-infringement. TJP Global Group LLC does not warrant that the Integration will be
              uninterrupted, error-free, or that data synchronised between Geeves.Life and QBO will be free of
              inaccuracies. You assume all risk associated with your use of the Integration and any financial
              decisions made in reliance on data provided by it.
            </p>
          </Section>

          <Section title="9. Limitation of Liability">
            <p className="uppercase text-xs leading-relaxed text-foreground/70">
              To the maximum extent permitted by applicable law, TJP Global Group LLC shall not be liable for any
              indirect, incidental, special, consequential, or punitive damages, including but not limited to loss
              of profits, loss of data, or financial loss, arising out of or in connection with your use of the
              Integration, even if advised of the possibility of such damages. In no event shall TJP Global Group
              LLC's total liability to you exceed the amount you paid for Geeves.Life in the twelve (12) months
              preceding the claim.
            </p>
          </Section>

          <Section title="10. Indemnification">
            <p>
              You agree to indemnify, defend, and hold harmless TJP Global Group LLC and its officers, directors,
              employees, and agents from and against any claims, liabilities, damages, losses, and expenses
              (including reasonable attorneys' fees) arising out of or in connection with: (a) your use of the
              Integration in violation of this Agreement; (b) your violation of any applicable law or regulation;
              or (c) any inaccuracy in data you provide to Geeves.Life or QBO.
            </p>
          </Section>

          <Section title="11. Term and Termination">
            <p>
              This Agreement is effective from the date you first connect your QBO account and continues until
              terminated. You may terminate this Agreement at any time by disconnecting your QBO account within
              Geeves.Life (Settings → Connected Accounts → QuickBooks → Disconnect) and deleting your Geeves.Life
              account. TJP Global Group LLC may terminate or suspend your access to the Integration immediately,
              without notice, if you breach any provision of this Agreement. Upon termination, Geeves.Life will
              delete your QBO access tokens within 30 days.
            </p>
          </Section>

          <Section title="12. Modifications">
            <p>
              TJP Global Group LLC reserves the right to modify this Agreement at any time. We will provide notice
              of material changes by posting the updated Agreement at this URL and updating the "Last Updated" date
              above. Your continued use of the Integration after the effective date of any modification constitutes
              your acceptance of the updated Agreement.
            </p>
          </Section>

          <Section title="13. Governing Law and Dispute Resolution">
            <p>
              This Agreement shall be governed by and construed in accordance with the laws of the State of
              Delaware, United States, without regard to its conflict of law provisions. Any dispute arising under
              this Agreement shall be resolved by binding arbitration administered by the American Arbitration
              Association under its Commercial Arbitration Rules, with proceedings conducted in English in
              Wilmington, Delaware. Notwithstanding the foregoing, either party may seek injunctive or other
              equitable relief in any court of competent jurisdiction to prevent irreparable harm.
            </p>
          </Section>

          <Section title="14. Entire Agreement">
            <p>
              This Agreement, together with the{" "}
              <Link href="/terms" className="underline hover:opacity-80" style={{ color: "#2AAFA9" }}>
                Geeves.Life Terms of Service
              </Link>{" "}
              and{" "}
              <Link href="/privacy" className="underline hover:opacity-80" style={{ color: "#2AAFA9" }}>
                Privacy Policy
              </Link>,
              constitutes the entire agreement between you and TJP Global Group LLC with respect to the
              Integration and supersedes all prior or contemporaneous understandings regarding its subject matter.
            </p>
          </Section>

          <Section title="15. Contact">
            <p>
              For questions about this Agreement or the Integration, contact:
            </p>
            <p>
              <strong>TJP Global Group LLC</strong><br />
              Email:{" "}
              <a href="mailto:legal@geeves.life" className="underline hover:opacity-80" style={{ color: "#2AAFA9" }}>
                legal@geeves.life
              </a><br />
              Website:{" "}
              <a href="https://geeves.life" className="underline hover:opacity-80" style={{ color: "#2AAFA9" }}>
                geeves.life
              </a>
            </p>
          </Section>
        </div>

        {/* Footer */}
        <div className="mt-16 pt-8 border-t border-border/40 flex items-center justify-between text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} TJP Global Group LLC. All rights reserved.</span>
          <div className="flex gap-4">
            <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-foreground transition-colors">Terms</Link>
          </div>
        </div>
      </main>
    </div>
  );
}
