/**
 * ScopeConsentModal — P-35: Trust-First Scope Consent
 *
 * Design Principle: Before Geeves.Life redirects the user to any Google OAuth
 * consent screen, we show this modal first. It explains in plain language:
 *   1. What access we are asking for
 *   2. Why we need it (specific to Geeves.Life, not generic)
 *   3. A concrete example of the benefit
 *   4. What will not be possible if the user declines
 *
 * The user can check "Do not show this again" to suppress the modal for this
 * specific scope in future. This preference is stored in the DB and respected
 * on the next connect attempt.
 *
 * This modal MUST be shown before any OAuth redirect that requests sensitive
 * scopes (calendar, gmail.readonly, gmail.send). It must never be bypassed.
 */

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import {
  Calendar,
  Mail,
  Send,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Sparkles,
  Lock,
} from "lucide-react";

// ─── Scope Definitions ────────────────────────────────────────────────────────
// Each entry defines the plain-language copy shown to the user before the
// Google consent screen. Add new scopes here as integrations are added.

export type ScopeKey =
  | "google.calendar"
  | "google.gmail.readonly"
  | "google.gmail.send";

interface ScopeDefinition {
  key: ScopeKey;
  icon: React.ReactNode;
  title: string;
  whatWeAccess: string;
  whyWeNeedIt: string;
  benefitExample: string;
  ifYouDecline: string;
  sensitivityLevel: "low" | "medium" | "high";
  sensitivityLabel: string;
}

const SCOPE_DEFINITIONS: Record<ScopeKey, ScopeDefinition> = {
  "google.calendar": {
    key: "google.calendar",
    icon: <Calendar className="w-6 h-6" style={{ color: "#2AAFA9" }} />,
    title: "Access your Google Calendar",
    whatWeAccess:
      "Your calendar events — titles, times, locations, and attendees — from the Google account you are connecting.",
    whyWeNeedIt:
      "Geeves.Life brings all your calendars into one view so you can see your entire life at a glance. To do that, we need to read your events and, when you ask us to, create or update events on your behalf.",
    benefitExample:
      "Example: When Eniola has a school event, Geeves automatically marks you as busy on your personal calendar — without you having to copy it manually. When you approve a booking request, it appears in your Google Calendar instantly.",
    ifYouDecline:
      "Without calendar access, Geeves cannot show your Google events, create events for you, or keep your household's schedule in sync. You can still use Geeves for shopping, tasks, and properties — but the calendar features will not work for this account.",
    sensitivityLevel: "medium",
    sensitivityLabel: "Calendar data",
  },
  "google.gmail.readonly": {
    key: "google.gmail.readonly",
    icon: <Mail className="w-6 h-6" style={{ color: "#2AAFA9" }} />,
    title: "Read your Gmail inbox (read-only)",
    whatWeAccess:
      "Booking confirmation emails from Airbnb, VRBO, and Booking.com that arrive in this inbox. We only read emails that match booking confirmation patterns — we do not read personal emails.",
    whyWeNeedIt:
      "iCal feeds from booking platforms only show dates and a basic title. To show you guest names, confirmation numbers, payout amounts, and cancellation details, Geeves needs to read the confirmation emails that the platforms send to your inbox.",
    benefitExample:
      "Example: Your Booking.com iCal shows a block from July 5–8 with no name. After connecting Gmail, Geeves reads the confirmation email and shows you the guest's name, their confirmation number, and your net payout — all without you doing anything.",
    ifYouDecline:
      "Without Gmail read access, your booking cards will show dates only — no guest names, no confirmation numbers, no financial details. iCal sync will still work, so bookings will still appear on the Gantt, just without the enriched data.",
    sensitivityLevel: "high",
    sensitivityLabel: "Email (read-only)",
  },
  "google.gmail.send": {
    key: "google.gmail.send",
    icon: <Send className="w-6 h-6" style={{ color: "#2AAFA9" }} />,
    title: "Send emails on your behalf",
    whatWeAccess:
      "The ability to send emails from your Google account. We only send emails that you explicitly trigger — household invites, booking confirmations, or notifications you ask Geeves to send.",
    whyWeNeedIt:
      "When you invite a family member to your constellation, or when you want Geeves to send a booking confirmation to a guest, the email needs to come from your address — not a generic no-reply address — so it feels personal and trusted.",
    benefitExample:
      "Example: You invite Cary to join your household. The invitation email arrives in his inbox from your address, not from a generic Geeves address — so he recognises it and trusts it.",
    ifYouDecline:
      "Without send access, household invitations and guest communications will be sent from a generic Geeves.Life address instead of yours. All functionality still works — the emails just won't come from your personal address.",
    sensitivityLevel: "high",
    sensitivityLabel: "Email (send only)",
  },
};

const SENSITIVITY_COLORS: Record<string, string> = {
  low: "bg-green-500/10 text-green-400 border-green-500/20",
  medium: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  high: "bg-orange-500/10 text-orange-400 border-orange-500/20",
};

// ─── Component ────────────────────────────────────────────────────────────────

interface ScopeConsentModalProps {
  scopeKey: ScopeKey;
  accountEmail?: string;
  open: boolean;
  onConfirm: (doNotShowAgain: boolean) => void;
  onCancel: () => void;
}

export function ScopeConsentModal({
  scopeKey,
  accountEmail,
  open,
  onConfirm,
  onCancel,
}: ScopeConsentModalProps) {
  const [doNotShowAgain, setDoNotShowAgain] = useState(false);
  const def = SCOPE_DEFINITIONS[scopeKey];
  if (!def) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
              style={{ background: "rgba(42,175,169,0.12)" }}
            >
              {def.icon}
            </div>
            <div>
              <DialogTitle className="text-base leading-snug">{def.title}</DialogTitle>
              {accountEmail && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  for <span className="font-medium text-foreground">{accountEmail}</span>
                </p>
              )}
            </div>
          </div>
          <DialogDescription className="sr-only">
            Plain language explanation of the access Geeves.Life is requesting.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          {/* Sensitivity badge */}
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="text-muted-foreground text-xs">Access level:</span>
            <Badge
              variant="outline"
              className={`text-xs px-2 py-0.5 ${SENSITIVITY_COLORS[def.sensitivityLevel]}`}
            >
              {def.sensitivityLabel}
            </Badge>
          </div>

          {/* What we access */}
          <div className="rounded-lg border border-border p-3 space-y-1 bg-muted/20">
            <p className="text-xs font-semibold text-foreground uppercase tracking-wide">
              What Geeves will access
            </p>
            <p className="text-muted-foreground leading-relaxed">{def.whatWeAccess}</p>
          </div>

          {/* Why we need it */}
          <div className="space-y-1">
            <p className="text-xs font-semibold text-foreground uppercase tracking-wide">
              Why we need it
            </p>
            <p className="text-muted-foreground leading-relaxed">{def.whyWeNeedIt}</p>
          </div>

          {/* Benefit example */}
          <div className="rounded-lg border p-3 space-y-1" style={{ borderColor: "rgba(42,175,169,0.3)", background: "rgba(42,175,169,0.05)" }}>
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 shrink-0" style={{ color: "#2AAFA9" }} />
              <p className="text-xs font-semibold" style={{ color: "#2AAFA9" }}>
                What becomes possible
              </p>
            </div>
            <p className="text-muted-foreground leading-relaxed">{def.benefitExample}</p>
          </div>

          {/* If you decline */}
          <div className="rounded-lg border border-border p-3 space-y-1 bg-muted/10">
            <div className="flex items-center gap-1.5">
              <XCircle className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <p className="text-xs font-semibold text-muted-foreground">
                If you choose not to grant access
              </p>
            </div>
            <p className="text-muted-foreground leading-relaxed">{def.ifYouDecline}</p>
          </div>

          {/* Trust note */}
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <Lock className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              Geeves.Life never sells your data and never accesses content beyond what is
              described above. You can revoke this access at any time from{" "}
              <a
                href="https://myaccount.google.com/permissions"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-foreground transition-colors"
              >
                Google Account Settings
              </a>
              .
            </span>
          </div>

          {/* Do Not Show Again */}
          <div className="flex items-center gap-2 pt-1">
            <Checkbox
              id="doNotShowAgain"
              checked={doNotShowAgain}
              onCheckedChange={(v) => setDoNotShowAgain(v === true)}
            />
            <Label
              htmlFor="doNotShowAgain"
              className="text-xs text-muted-foreground cursor-pointer select-none"
            >
              Don't show this explanation again for this type of access
            </Label>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2 flex-col sm:flex-row">
          <Button variant="outline" onClick={onCancel} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button
            onClick={() => onConfirm(doNotShowAgain)}
            className="w-full sm:w-auto gap-2"
            style={{ background: "#2AAFA9", color: "#fff" }}
          >
            <CheckCircle2 className="w-4 h-4" />
            Continue to Google
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
// Use this hook to check if the consent modal should be shown for a given scope,
// and to dismiss it persistently.

export function useScopeConsent(scopeKey: ScopeKey) {
  const dismissMutation = trpc.integrations.dismissScopeConsent.useMutation();

  const dismiss = (doNotShowAgain: boolean) => {
    if (doNotShowAgain) {
      dismissMutation.mutate({ scopeKey });
    }
  };

  return { dismiss, isDismissing: dismissMutation.isPending };
}
