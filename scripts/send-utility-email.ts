/**
 * One-off script to send the utility fee letter via the Resend API.
 * Runs within the Geeves project context so ENV vars are available.
 * 
 * Usage: cd /home/ubuntu/geeves-shopping && npx tsx scripts/send-utility-email.ts [test|final]
 *   test  → sends to tarikp@gmail.com (default)
 *   final → sends to hatonjenny@live.com
 */
import { ENV } from "../server/_core/env";

const mode = process.argv[2] || "test";
const TO_EMAIL = mode === "final" ? "hatonjenny@live.com" : "tarikp@gmail.com";

const subject = "Utility Fee Notice — Apartment #2, 4693 State Route 414";

const htmlBody = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body style="margin:0;padding:0;background:#f9fafb;font-family:'Georgia','Times New Roman',serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 20px;"><tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;"><tr><td style="padding:32px 40px;border-bottom:1px solid #e5e7eb;"><div style="font-size:14px;color:#6b7280;">July 5, 2026</div><h1 style="margin:8px 0 0;font-size:20px;font-weight:700;color:#111827;">Utility Fee Notice</h1><div style="font-size:14px;color:#6b7280;margin-top:4px;">Apartment #2, 4693 State Route 414, Burdett, NY 14818</div></td></tr><tr><td style="padding:32px 40px;font-size:15px;color:#374151;line-height:1.8;"><p style="margin:0 0 16px;">Dear Jennifer,</p><p style="margin:0 0 16px;">I hope this letter finds you well and that you are enjoying the apartment. I am writing to address an administrative oversight on my part regarding the monthly utility fee outlined in your lease agreement.</p><p style="margin:0 0 16px;">Per your lease dated January 10, 2026, a monthly utility fee of <strong>$150.00</strong> is due in addition to your base rent of $1,180.00. Due to an error on my end, this fee was not included when your recurring payment was set up through Zillow Rental Manager. I sincerely apologize for the confusion.</p><p style="margin:0 0 16px;">As of July 1, 2026, the outstanding utility balance is as follows:</p><table width="100%" cellpadding="8" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:6px;margin:0 0 20px;font-size:14px;"><tr style="background:#f3f4f6;"><th style="text-align:left;border-bottom:1px solid #e5e7eb;color:#374151;">Month</th><th style="text-align:right;border-bottom:1px solid #e5e7eb;color:#374151;">Utility Fee</th></tr><tr><td style="border-bottom:1px solid #f3f4f6;">February 2026</td><td style="text-align:right;border-bottom:1px solid #f3f4f6;">$150.00</td></tr><tr><td style="border-bottom:1px solid #f3f4f6;">March 2026</td><td style="text-align:right;border-bottom:1px solid #f3f4f6;">$150.00</td></tr><tr><td style="border-bottom:1px solid #f3f4f6;">April 2026</td><td style="text-align:right;border-bottom:1px solid #f3f4f6;">$150.00</td></tr><tr><td style="border-bottom:1px solid #f3f4f6;">May 2026</td><td style="text-align:right;border-bottom:1px solid #f3f4f6;">$150.00</td></tr><tr><td style="border-bottom:1px solid #e5e7eb;">June 2026</td><td style="text-align:right;border-bottom:1px solid #e5e7eb;">$150.00</td></tr><tr style="background:#f9fafb;"><td style="font-weight:700;color:#111827;">Total Outstanding</td><td style="text-align:right;font-weight:700;color:#111827;">$750.00</td></tr></table><p style="margin:0 0 16px;">To make this as convenient as possible for you, I would like to offer two options for resolving the balance:</p><div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px 20px;margin:0 0 12px;"><p style="margin:0 0 8px;font-weight:700;color:#166534;">Option A — One-Time Payment</p><p style="margin:0;font-size:14px;color:#374151;">Pay the full $750.00 balance now. I will send you a Stripe invoice for the total amount, which you can pay online via credit card or bank transfer at your convenience.</p></div><div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px 20px;margin:0 0 20px;"><p style="margin:0 0 8px;font-weight:700;color:#1e40af;">Option B — Divided Over Remaining Months</p><p style="margin:0;font-size:14px;color:#374151;">The $750.00 balance will be divided equally over the remaining 7 months of your lease (July 2026 through January 2027), adding approximately <strong>$107.14/month</strong> to your utility invoice. Beginning in July, you will receive a separate monthly Stripe invoice for the utility fee ($150.00) plus the catch-up amount ($107.14), totaling <strong>$257.14/month</strong> until the balance is cleared. After January 2027, the utility invoice will return to the standard $150.00/month.</p></div><p style="margin:0 0 16px;">Going forward, the $150.00 monthly utility fee will be invoiced separately via Stripe on the 1st of each month, beginning July 1, 2026. Your base rent of $1,180.00 will continue to be collected through Zillow as usual.</p><p style="margin:0 0 16px;">Please let me know which option works best for you by <strong>July 15, 2026</strong>, and I will set up the invoicing accordingly. If you have any questions or would like to discuss this further, please do not hesitate to reach out.</p><p style="margin:0 0 16px;">Thank you for your understanding, and again, I apologize for the oversight.</p><p style="margin:24px 0 0;">Warm regards,<br><br><strong>Tarik Perkins</strong><br><span style="color:#6b7280;">Landlord / Property Manager</span><br><span style="color:#6b7280;">4693 State Route 414, Burdett, NY 14818</span><br><span style="color:#6b7280;">tarik@tjperkinsfam.com</span></p></td></tr><tr><td style="padding:20px 40px;border-top:1px solid #e5e7eb;text-align:center;"><p style="margin:0;font-size:11px;color:#9ca3af;">This is a property management communication from Tarik Perkins regarding your lease at 4693 State Route 414, Apt #2.</p></td></tr></table></td></tr></table></body></html>`;

const textBody = `Utility Fee Notice
Apartment #2, 4693 State Route 414, Burdett, NY 14818
Date: July 5, 2026

Dear Jennifer,

I hope this letter finds you well and that you are enjoying the apartment. I am writing to address an administrative oversight on my part regarding the monthly utility fee outlined in your lease agreement.

Per your lease dated January 10, 2026, a monthly utility fee of $150.00 is due in addition to your base rent of $1,180.00. Due to an error on my end, this fee was not included when your recurring payment was set up through Zillow Rental Manager. I sincerely apologize for the confusion.

As of July 1, 2026, the outstanding utility balance is as follows:

  February 2026: $150.00
  March 2026: $150.00
  April 2026: $150.00
  May 2026: $150.00
  June 2026: $150.00
  TOTAL OUTSTANDING: $750.00

To make this as convenient as possible for you, I would like to offer two options:

OPTION A — ONE-TIME PAYMENT
Pay the full $750.00 balance now. I will send you a Stripe invoice for the total amount, which you can pay online via credit card or bank transfer at your convenience.

OPTION B — DIVIDED OVER REMAINING MONTHS
The $750.00 balance will be divided equally over the remaining 7 months of your lease (July 2026 through January 2027), adding approximately $107.14/month to your utility invoice. Beginning in July, you will receive a separate monthly Stripe invoice for the utility fee ($150.00) plus the catch-up amount ($107.14), totaling $257.14/month until the balance is cleared. After January 2027, the utility invoice will return to the standard $150.00/month.

Going forward, the $150.00 monthly utility fee will be invoiced separately via Stripe on the 1st of each month, beginning July 1, 2026. Your base rent of $1,180.00 will continue to be collected through Zillow as usual.

Please let me know which option works best for you by July 15, 2026, and I will set up the invoicing accordingly.

Thank you for your understanding, and again, I apologize for the oversight.

Warm regards,

Tarik Perkins
Landlord / Property Manager
4693 State Route 414, Burdett, NY 14818
tarik@tjperkinsfam.com`;

async function main() {
  console.log(`Mode: ${mode}`);
  console.log(`Sending to: ${TO_EMAIL}`);
  console.log(`Subject: ${subject}`);
  console.log("---");

  const apiKey = ENV.resendApiKey;
  if (!apiKey) {
    console.error("ERROR: RESEND_API_KEY not configured in environment");
    process.exit(1);
  }
  console.log(`Resend API key found (${apiKey.slice(0, 8)}...)`);

  const from = "Tarik Perkins <invites@geeves.life>";

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [TO_EMAIL],
      subject,
      html: htmlBody,
      text: textBody,
    }),
  });

  const body = await response.json();

  if (!response.ok) {
    console.error(`FAILED (HTTP ${response.status}):`);
    console.error(JSON.stringify(body, null, 2));
    process.exit(1);
  }

  console.log(`\n✓ SUCCESS! Email sent.`);
  console.log(`  Resend ID: ${(body as any).id}`);
  console.log(`  Recipient: ${TO_EMAIL}`);
  console.log(`\n  Check ${TO_EMAIL} inbox for the utility fee notice.`);
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
