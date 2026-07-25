import { useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, Loader2, Users } from "lucide-react";

const ROLE_LABELS: Record<string, string> = {
  household_admin: "Household Admin",
  ea: "Executive Assistant",
  member: "Member",
  caregiver: "Caregiver",
  child: "Child",
  elder: "Elder",
};

function getGoogleSignInUrl(returnPath: string): string {
  const origin = window.location.origin;
  // Use the Google login route (not connect-account which requires an existing session)
  const params = new URLSearchParams({
    origin,
    returnPath,
  });
  return `/api/auth/google/login?${params.toString()}`;
}

export default function JoinHousehold() {
  const [, navigate] = useLocation();
  const { user, loading: authLoading } = useAuth();

  // Extract token from URL
  const token = new URLSearchParams(window.location.search).get("token") ?? "";

  const inviteQuery = trpc.household.members.getInviteDetails.useQuery(
    { token },
    { enabled: !!token, retry: false }
  );

  const claimMutation = trpc.household.members.claimInvite.useMutation({
    onSuccess: () => {
      // Redirect to dashboard after claiming
      setTimeout(() => navigate("/dashboard"), 1500);
    },
  });

  // Auto-claim once the user is logged in and invite is loaded
  useEffect(() => {
    if (user && inviteQuery.data && !claimMutation.isPending && !claimMutation.isSuccess && !claimMutation.isError) {
      claimMutation.mutate({ token });
    }
  }, [user, inviteQuery.data]);

  // ── No token ──────────────────────────────────────────────────────────
  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-8 pb-8 text-center">
            <XCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Invalid Invitation</h2>
            <p className="text-muted-foreground text-sm">This invitation link is missing a token. Please check the email you received and try again.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Loading invite details ─────────────────────────────────────────────
  if (inviteQuery.isLoading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-[#2AAFA9] mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">Loading invitation…</p>
        </div>
      </div>
    );
  }

  // ── Invite error ───────────────────────────────────────────────────────
  if (inviteQuery.isError) {
    const msg = (inviteQuery.error as any)?.message ?? "Invitation not found or expired";
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-8 pb-8 text-center">
            <XCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Invitation Unavailable</h2>
            <p className="text-muted-foreground text-sm mb-6">{msg}</p>
            <Button variant="outline" onClick={() => navigate("/dashboard")}>Go to Geeves.Life</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const invite = inviteQuery.data!;

  // ── Successfully claimed ───────────────────────────────────────────────
  if (claimMutation.isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-8 pb-8 text-center">
            <CheckCircle className="w-12 h-12 text-[#2AAFA9] mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Welcome to {invite.householdName}!</h2>
            <p className="text-muted-foreground text-sm mb-2">Your account has been linked. Redirecting to your dashboard…</p>
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground mx-auto" />
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Claim error ────────────────────────────────────────────────────────
  if (claimMutation.isError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-8 pb-8 text-center">
            <XCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Could Not Join</h2>
            <p className="text-muted-foreground text-sm mb-6">{(claimMutation.error as any)?.message ?? "Something went wrong. Please try again."}</p>
            <Button onClick={() => claimMutation.mutate({ token })}>Try Again</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Main invite card ───────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-4">
        {/* Geeves.Life header */}
        <div className="text-center mb-6">
          <div className="text-2xl font-bold tracking-tight" style={{ fontFamily: "'Outfit', sans-serif" }}>
            <span style={{ color: "#2AAFA9" }}>✦</span> Geeves.Life
          </div>
          <p className="text-muted-foreground text-sm mt-1">Your Personal Life Management System</p>
        </div>

        <Card className="border-border">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: "rgba(42,175,169,0.15)" }}>
                <Users className="w-6 h-6" style={{ color: "#2AAFA9" }} />
              </div>
              <div>
                <h1 className="text-xl font-semibold">You're invited!</h1>
                <p className="text-muted-foreground text-sm">Join <strong>{invite.householdName}</strong> on Geeves.Life</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Invite details */}
            <div className="rounded-lg border border-border p-4 space-y-2 bg-muted/30">
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Invited as</span>
                <span className="font-medium">{invite.displayName}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Role</span>
                <Badge variant="secondary">{ROLE_LABELS[invite.role] ?? invite.role}</Badge>
              </div>
              {invite.email && (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Email</span>
                  <span className="font-medium text-xs">{invite.email}</span>
                </div>
              )}
            </div>

            {/* Sign in / claim */}
            {user ? (
              /* User is already logged in — auto-claiming, show spinner */
              <div className="text-center py-4">
                <Loader2 className="w-6 h-6 animate-spin text-[#2AAFA9] mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Linking your account…</p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground text-center">
                  Sign in with Google to accept this invitation.
                </p>
                <a
                  href={getGoogleSignInUrl(`/join?token=${token}`)}
                  className="flex items-center justify-center gap-3 w-full rounded-lg border border-border px-4 py-3 text-sm font-medium hover:bg-muted/50 transition-colors"
                >
                  {/* Google G logo */}
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                    <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
                    <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
                    <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
                  </svg>
                  Continue with Google
                </a>
                <p className="text-xs text-muted-foreground text-center">
                  You'll be asked to sign in with your Google account, then automatically joined to the household.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
