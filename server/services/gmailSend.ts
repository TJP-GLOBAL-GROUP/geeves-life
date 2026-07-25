/**
 * Email delivery service for Geeves.Life
 *
 * Send order:
 *   1. Resend API (branded "invites@geeves.life") — requires RESEND_API_KEY env var.
 *      When the key is present, all invite emails are sent from the branded domain,
 *      independent of any individual admin's Google account.
 *   2. Gmail API fallback — uses the admin's stored OAuth access token with the
 *      gmail.send scope. Falls back automatically when Resend is unavailable.
 *   3. mailto: fallback — returns a pre-filled mailto: link + raw joinUrl so the
 *      UI can copy the link to clipboard as a last resort.
 *
 * To enable Resend: add RESEND_API_KEY to the project secrets.
 * Resend free tier: 100 emails/day, 3,000/month — sufficient for invite volume.
 * Docs: https://resend.com/docs/api-reference/emails/send-email
 */
import * as db from "../db";
import { refreshAccessToken } from "./googleCalendarSync";
import { ENV } from "../_core/env";

export interface SendEmailOptions {
  to: string;
  subject: string;
  htmlBody: string;
  textBody: string;
  fromName?: string;
  fromEmail?: string;
  /** Raw join URL — returned in result so UI can copy to clipboard on fallback */
  joinUrl?: string;
  /** Invitee display name — used in fallback messaging */
  inviteeName?: string;
}

export interface SendEmailResult {
  success: boolean;
  method: "resend_api" | "gmail_api" | "fallback_mailto";
  /** Pre-filled mailto: link for manual fallback */
  mailtoLink?: string;
  /** Raw join URL for clipboard copy on fallback */
  joinUrl?: string;
  error?: string;
}

/**
 * Send an email via the Resend API (resend.com).
 *
 * Returns null if RESEND_API_KEY is not configured, allowing the caller
 * to fall through to the Gmail API path.
 *
 * Resend API reference:
 *   POST https://api.resend.com/emails
 *   Authorization: Bearer <RESEND_API_KEY>
 *   Body: { from, to, subject, html, text }
 */
async function sendEmailViaResend(
  opts: SendEmailOptions
): Promise<SendEmailResult | null> {
  const apiKey = ENV.resendApiKey;
  if (!apiKey) return null; // Not configured — fall through to Gmail

  const fromAddress = `Geeves.Life <invites@geeves.life>`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    let response: Response;
    try {
      response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromAddress,
          to: [opts.to],
          subject: opts.subject,
          html: opts.htmlBody,
          text: opts.textBody,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`[Resend] API error ${response.status}: ${errorText.slice(0, 200)}`);
      return null; // Fall through to Gmail
    }

    const body = await response.json() as { id?: string };
    console.log(`[Resend] Email sent to ${opts.to} (id: ${body.id ?? "unknown"})`);
    return { success: true, method: "resend_api" };
  } catch (err: any) {
    console.warn(`[Resend] Send failed for ${opts.to}: ${err.message}`);
    return null; // Fall through to Gmail
  }
}

/**
 * Build a RFC 2822 email message encoded as base64url for the Gmail API.
 */
function buildRawMessage(opts: {
  from: string;
  to: string;
  subject: string;
  htmlBody: string;
  textBody: string;
}): string {
  const boundary = `boundary_${Date.now()}`;
  const message = [
    `From: ${opts.from}`,
    `To: ${opts.to}`,
    `Subject: ${opts.subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/plain; charset=UTF-8`,
    ``,
    opts.textBody,
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset=UTF-8`,
    ``,
    opts.htmlBody,
    ``,
    `--${boundary}--`,
  ].join("\r\n");

  return Buffer.from(message).toString("base64url");
}

/**
 * Build a mailto: fallback link and return a failed result.
 */
function buildFallback(opts: SendEmailOptions, reason: string): SendEmailResult {
  const subject = encodeURIComponent(opts.subject);
  const body = encodeURIComponent(opts.textBody);
  return {
    success: false,
    method: "fallback_mailto",
    mailtoLink: `mailto:${opts.to}?subject=${subject}&body=${body}`,
    joinUrl: opts.joinUrl,
    error: reason,
  };
}

/**
 * Send an email using the Gmail API.
 *
 * Falls back to a mailto: link + raw joinUrl if:
 *  - No valid OAuth token is stored for this member
 *  - The token lacks the gmail.send scope (admin needs to re-login)
 *  - Any other Gmail API error occurs
 *
 * @param memberId  Household member ID of the sending admin
 * @param opts      Email options
 */
export async function sendEmailViaGmail(
  memberId: string,
  opts: SendEmailOptions
): Promise<SendEmailResult> {
  // ── 1. Try Resend first (branded sender) ──────────────────────────────────
  // When RESEND_API_KEY is configured, send from invites@geeves.life.
  // Falls back to Gmail if Resend is not configured or returns an error.
  const resendResult = await sendEmailViaResend(opts);
  if (resendResult) return resendResult;

  // ── 2. Gmail API fallback ─────────────────────────────────────────────────
  // Retrieve all stored Google OAuth tokens for this member
  const tokens = await db.getAllOAuthTokens(memberId, "google");

  const defaultSenderEmail =
    tokens.find((t) => t.accountEmail)?.accountEmail ?? "noreply@geeves.life";

  let accessToken: string | null = null;
  let senderEmail = opts.fromEmail || defaultSenderEmail;
  const senderName = opts.fromName || "Geeves.Life";

  for (const token of tokens) {
    if (!token.refreshToken) continue;
    try {
      const refreshed = await refreshAccessToken(token.refreshToken);
      accessToken = refreshed.accessToken;
      if (token.accountEmail) senderEmail = token.accountEmail;
      break;
    } catch {
      // Try next token
    }
  }

  if (!accessToken) {
    console.warn(
      `[Gmail] No valid OAuth token for member ${memberId} — returning mailto fallback. ` +
      `Admin must re-login with Google to grant the gmail.send scope.`
    );
    return buildFallback(opts, "No valid Google OAuth token — re-login required to grant gmail.send scope");
  }

  const raw = buildRawMessage({
    from: `${senderName} <${senderEmail}>`,
    to: opts.to,
    subject: opts.subject,
    htmlBody: opts.htmlBody,
    textBody: opts.textBody,
  });

  try {
    const gmailController = new AbortController();
    const gmailTimeout = setTimeout(() => gmailController.abort(), 15_000);
    let response: Response;
    try {
      response = await fetch(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ raw }),
          signal: gmailController.signal,
        }
      );
    } finally {
      clearTimeout(gmailTimeout);
    }

    if (!response.ok) {
      const errorText = await response.text();
      if (response.status === 403 || response.status === 401) {
        console.warn(
          `[Gmail] Scope/auth error (${response.status}) for member ${memberId} — ` +
          `admin must re-login to grant gmail.send scope. Error: ${errorText}`
        );
        return buildFallback(
          opts,
          `Gmail API scope error (${response.status}) — re-login required`
        );
      }
      throw new Error(`Gmail API error ${response.status}: ${errorText}`);
    }

    console.log(`[Gmail] Email sent successfully to ${opts.to} via ${senderEmail}`);
    return { success: true, method: "gmail_api" };
  } catch (err: any) {
    console.warn(`[Gmail] Send failed for ${opts.to}: ${err.message}`);
    return buildFallback(opts, err.message);
  }
}

/**
 * Build the HTML invite email body.
 */
export function buildInviteEmailHtml(opts: {
  inviteeName: string;
  householdName: string;
  inviterName: string;
  joinUrl: string;
  role: string;
  expiresAt: Date;
}): { html: string; text: string } {
  const expiryStr = opts.expiresAt.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const roleLabel: Record<string, string> = {
    household_admin: "Household Admin",
    ea: "Executive Assistant",
    member: "Member",
    caregiver: "Caregiver",
    child: "Child",
    elder: "Elder",
  };

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>You're invited to ${opts.householdName} on Geeves.Life</title>
</head>
<body style="margin:0;padding:0;background:#0F1117;font-family:'Inter',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0F1117;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#1A1C20;border-radius:16px;overflow:hidden;border:1px solid #2D3748;">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#1A1C20 0%,#1E2028 100%);padding:32px 40px;text-align:center;border-bottom:1px solid #2D3748;">
              <div style="font-size:28px;font-weight:700;color:#F8F9FA;letter-spacing:-0.5px;">
                <span style="color:#2AAFA9;">✦</span> Geeves.Life
              </div>
              <div style="font-size:13px;color:#9CA3AF;margin-top:4px;">Your Personal Life Management System</div>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#F8F9FA;">
                You're invited, ${opts.inviteeName}!
              </h1>
              <p style="margin:0 0 24px;font-size:16px;color:#9CA3AF;line-height:1.6;">
                <strong style="color:#F8F9FA;">${opts.inviterName}</strong> has invited you to join
                <strong style="color:#2AAFA9;">${opts.householdName}</strong> on Geeves.Life as a
                <strong style="color:#F8F9FA;">${roleLabel[opts.role] || opts.role}</strong>.
              </p>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:8px 0 32px;">
                    <a href="${opts.joinUrl}"
                       style="display:inline-block;background:#2AAFA9;color:#FFFFFF;font-size:16px;font-weight:600;text-decoration:none;padding:14px 40px;border-radius:10px;letter-spacing:0.2px;">
                      Accept Invitation →
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Info box -->
              <div style="background:#0F1117;border:1px solid #2D3748;border-radius:10px;padding:20px;margin-bottom:24px;">
                <p style="margin:0 0 8px;font-size:13px;color:#9CA3AF;">
                  <strong style="color:#F8F9FA;">What is Geeves.Life?</strong>
                </p>
                <p style="margin:0;font-size:13px;color:#9CA3AF;line-height:1.6;">
                  Geeves.Life is a unified life management platform — bringing together calendars,
                  shopping, finances, household tasks, and family coordination in one place.
                </p>
              </div>

              <!-- Expiry notice -->
              <p style="margin:0;font-size:12px;color:#6B7280;text-align:center;">
                This invitation expires on <strong style="color:#9CA3AF;">${expiryStr}</strong>.<br>
                If you didn't expect this invitation, you can safely ignore this email.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px;border-top:1px solid #2D3748;text-align:center;">
              <p style="margin:0;font-size:11px;color:#4B5563;">
                Geeves.Life · Sent by ${opts.inviterName}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `You're invited to ${opts.householdName} on Geeves.Life

${opts.inviterName} has invited you to join ${opts.householdName} as a ${roleLabel[opts.role] || opts.role}.

Accept your invitation here:
${opts.joinUrl}

This invitation expires on ${expiryStr}.

If you didn't expect this invitation, you can safely ignore this email.

— The Geeves.Life Team`;

  return { html, text };
}
