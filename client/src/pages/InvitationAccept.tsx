import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Users, Star, CheckCircle2, XCircle, Sparkles } from "lucide-react";
import { GeevesConstellationMark } from "@/components/GeevesLogo";

/**
 * /invitation-accept?memberId=XXX
 *
 * Shown after a new user logs in and we detect a pending invitation by email.
 * They see:
 *   - The group type (e.g. "Constellation") and group name (e.g. "TJ Perkins Family")
 *   - Their constellation-assigned display name (e.g. "Grandma")
 *   - Accept / Decline buttons
 *
 * On Accept → links their account to the member record → redirects to dashboard
 * On Decline → shows a Geeves.Life stub (non-functional)
 */
export default function InvitationAccept() {
  const [, navigate] = useLocation();
  const params = new URLSearchParams(window.location.search);
  const memberId = params.get("memberId") ?? "";

  const [declined, setDeclined] = useState(false);

  const { data: invite, isLoading, error } = trpc.household.members.getByMemberId.useQuery(
    { memberId },
    { enabled: !!memberId, retry: false }
  );

  const accept = trpc.household.members.acceptByMemberId.useMutation({
    onSuccess: () => {
      // Small delay so the user sees the success state before redirect
      setTimeout(() => navigate("/dashboard"), 1200);
    },
  });

  const roleLabel: Record<string, string> = {
    household_admin: "Admin",
    ea: "Executive Assistant",
    member: "Member",
    caregiver: "Caregiver",
    child: "Child",
    elder: "Elder",
  };

  if (!memberId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-8 pb-8 text-center">
            <XCircle className="mx-auto mb-4 text-destructive" size={48} />
            <h2 className="text-xl font-semibold mb-2">Invalid Invitation Link</h2>
            <p className="text-muted-foreground mb-6">This invitation link is missing required information.</p>
            <Button onClick={() => navigate("/dashboard")}>Go Home</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="animate-spin text-primary" size={40} />
      </div>
    );
  }

  if (error || !invite) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-8 pb-8 text-center">
            <XCircle className="mx-auto mb-4 text-destructive" size={48} />
            <h2 className="text-xl font-semibold mb-2">Invitation Not Found</h2>
            <p className="text-muted-foreground mb-6">
              This invitation may have already been used or has expired. Ask the group admin to resend it.
            </p>
            <Button onClick={() => navigate("/dashboard")}>Go Home</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Declined state ──────────────────────────────────────────────────────────
  if (declined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full border-dashed border-2 border-primary/30">
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <div className="flex justify-center">
              <GeevesConstellationMark size={64} />
            </div>
            <h2 className="text-2xl font-bold">Start Your Own Geeves.Life</h2>
            <p className="text-muted-foreground">
              Create your own group — a Household, Village, Constellation, or whatever fits your life.
              Manage your calendars, family, properties, and more in one place.
            </p>
            <Badge variant="secondary" className="text-sm">Coming Soon</Badge>
            <div className="pt-2 space-y-2">
              <Button
                className="w-full"
                disabled
                title="Sign-up coming soon"
              >
                <Sparkles className="mr-2" size={16} />
                Get Your Own Geeves.Life
              </Button>
              <Button
                variant="ghost"
                className="w-full text-muted-foreground"
                onClick={() => setDeclined(false)}
              >
                ← Go back to the invitation
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Accepted state ──────────────────────────────────────────────────────────
  if (accept.isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <CheckCircle2 className="mx-auto text-green-500" size={56} />
            <h2 className="text-2xl font-bold">Welcome, {invite.displayName}!</h2>
            <p className="text-muted-foreground">
              You have joined the <strong>{invite.householdName}</strong> {invite.groupName}.
            </p>
            <Loader2 className="animate-spin mx-auto text-primary" size={24} />
            <p className="text-sm text-muted-foreground">Taking you to your dashboard…</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Main invitation screen ──────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      {/* Subtle brand gradient backdrop */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 60% 40% at 70% 20%, oklch(0.45 0.18 195 / 0.15) 0%, transparent 70%), " +
            "radial-gradient(ellipse 50% 40% at 30% 80%, oklch(0.45 0.18 280 / 0.12) 0%, transparent 70%)",
        }}
      />

      <Card className="max-w-md w-full relative z-10 shadow-xl">
        <CardContent className="pt-8 pb-8 space-y-6">
          {/* Logo + header */}
          <div className="text-center space-y-3">
            <div className="flex justify-center">
              <GeevesConstellationMark size={56} />
            </div>
            <div>
              <p className="text-sm text-muted-foreground uppercase tracking-wider font-medium">
                Invitation Found
              </p>
              <h1 className="text-2xl font-bold mt-1">
                Join the {invite.householdName} {invite.groupName}
              </h1>
            </div>
          </div>

          {/* Invitation details */}
          <div className="rounded-lg bg-muted/50 border p-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                <Users size={20} className="text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">You are known as</p>
                <p className="font-semibold text-lg leading-tight">{invite.displayName}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                <Star size={20} className="text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Your role</p>
                <p className="font-medium">{roleLabel[invite.role] ?? invite.role}</p>
              </div>
            </div>
          </div>

          <p className="text-sm text-muted-foreground text-center">
            By accepting, you will join <strong>{invite.householdName}</strong> and see the
            calendars, tasks, and features your group admin has shared with you.
          </p>

          {/* Accept / Decline */}
          <div className="space-y-2">
            <Button
              className="w-full"
              size="lg"
              onClick={() => accept.mutate({ memberId: invite.memberId })}
              disabled={accept.isPending}
            >
              {accept.isPending ? (
                <><Loader2 className="mr-2 animate-spin" size={16} /> Joining…</>
              ) : (
                <><CheckCircle2 className="mr-2" size={16} /> Yes, join the {invite.groupName}</>
              )}
            </Button>
            <Button
              variant="ghost"
              className="w-full text-muted-foreground"
              onClick={() => setDeclined(true)}
              disabled={accept.isPending}
            >
              No thanks — I want my own Geeves.Life
            </Button>
          </div>

          {accept.isError && (
            <p className="text-sm text-destructive text-center">
              {accept.error?.message ?? "Something went wrong. Please try again."}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
