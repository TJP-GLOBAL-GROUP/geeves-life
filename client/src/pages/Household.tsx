import { useState } from "react";
import { GeeveNodeBadge } from "@/components/GeeveNode";
import { ResourcesWidget } from "@/components/ResourcesWidget";
import { usePresence } from "@/hooks/useRealtime";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Plus, Users, Settings, Shield, UserCog, User, Heart, Baby,
  Mail, RefreshCw, Copy, Link2, Layers, ChevronRight, Eye, EyeOff,
  CalendarDays, Lock, Unlock, Trash2,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

const ROLE_ICONS: Record<string, any> = {
  household_admin: Shield, ea: UserCog, member: User,
  caregiver: Heart, child: Baby, elder: User,
};

const ROLE_LABELS: Record<string, string> = {
  household_admin: "Admin",
  ea: "Executive Assistant",
  member: "Member",
  caregiver: "Caregiver",
  child: "Child",
  elder: "Elder",
};

const ROLE_COLORS: Record<string, string> = {
  household_admin: "bg-violet-500/10 text-violet-500 border-violet-500/20",
  ea: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  member: "bg-primary/10 text-primary border-primary/20",
  caregiver: "bg-pink-500/10 text-pink-500 border-pink-500/20",
  child: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  elder: "bg-slate-500/10 text-slate-500 border-slate-500/20",
};

const ACCESS_LEVEL_LABELS: Record<string, string> = {
  none: "No Access",
  read_only: "Read Only",
  blind: "Blind (Busy Only)",
  full: "Full Access",
};

const CALENDAR_ACCESS_LABELS: Record<string, string> = {
  availability_only: "Availability Only",
  default_vertical: "Default (Vertical Rules)",
  blind: "Blind (Busy Blocks)",
  read_write: "Full Read/Write",
};

const DATA_CATEGORIES = [
  { id: "financial", label: "Financial", description: "Revenue, commissions, payouts" },
  { id: "guest_pii", label: "Guest PII", description: "Guest names, contact details" },
  { id: "private", label: "Private", description: "Personal/private records" },
  { id: "operational", label: "Operational", description: "Internal ops data" },
] as const;

// ─── Single vertical checkbox (one hook per vertical, no hooks-in-loop) ─────────

function VerticalCheckbox({
  vertical,
  memberUserId,
}: {
  vertical: any;
  memberUserId: number;
}) {
  const utils = trpc.useUtils();
  const { data: owners = [] } = trpc.verticals.listOwners.useQuery(
    { verticalId: vertical.id },
    { enabled: true }
  );
  const isOwned = owners.some((o: any) => o.userId === memberUserId);

  const addOwner = trpc.verticals.addOwner.useMutation({
    onSuccess: () => utils.verticals.listOwners.invalidate(),
  });
  const removeOwner = trpc.verticals.removeOwner.useMutation({
    onSuccess: () => utils.verticals.listOwners.invalidate(),
  });
  const isPending = addOwner.isPending || removeOwner.isPending;

  return (
    <label
      className="flex items-center gap-2 p-2 rounded-md border border-border cursor-pointer hover:bg-secondary/40 transition-colors select-none"
      style={{ borderLeftColor: vertical.color, borderLeftWidth: "3px" }}
    >
      <Checkbox
        checked={isOwned}
        disabled={isPending}
        onCheckedChange={(checked) => {
          if (checked) {
            addOwner.mutate({ verticalId: vertical.id, userId: memberUserId, role: "member" });
          } else {
            removeOwner.mutate({ verticalId: vertical.id, userId: memberUserId });
          }
        }}
      />
      <span className="text-sm truncate">{vertical.name}</span>
    </label>
  );
}

// ─── Vertical assignment panel for a single member ───────────────────────────

function PendingVerticalCheckbox({ vertical, memberId, pendingVerticals, onToggle }: { vertical: any; memberId: string; pendingVerticals: string[]; onToggle: (id: string, checked: boolean) => void }) {
  const isChecked = pendingVerticals.includes(vertical.id);
  return (
    <label
      className="flex items-center gap-2 p-2 rounded-md border border-border cursor-pointer hover:bg-secondary/40 transition-colors select-none"
      style={{ borderLeftColor: vertical.color, borderLeftWidth: "3px" }}
    >
      <Checkbox checked={isChecked} onCheckedChange={(checked) => onToggle(vertical.id, !!checked)} />
      <span className="text-sm truncate">{vertical.name}</span>
    </label>
  );
}

function MemberVerticalAssignment({
  member,
  verticals,
}: {
  member: any;
  verticals: any[];
}) {
  const utils = trpc.useUtils();
  const [localPending, setLocalPending] = useState<string[]>(() => (member.pendingVerticals as string[] | null) ?? []);
  const setPending = trpc.household.members.setPendingVerticals.useMutation({
    onSuccess: () => utils.household.members.list.invalidate(),
    onError: (err: any) => toast.error(err.message),
  });

  if (!member.userId) {
    // Pre-accept: show vertical checkboxes that store as pending
    const handleToggle = (verticalId: string, checked: boolean) => {
      const next = checked ? [...localPending, verticalId] : localPending.filter((id) => id !== verticalId);
      setLocalPending(next);
      setPending.mutate({ memberId: member.id, verticalIds: next });
    }
    return (
      <div className="mt-3 space-y-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Pre-assign Verticals
        </p>
        <p className="text-xs text-muted-foreground">
          These verticals will be activated automatically when the member accepts their invitation.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {verticals.map((v) => (
            <PendingVerticalCheckbox key={v.id} vertical={v} memberId={member.id} pendingVerticals={localPending} onToggle={handleToggle} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-2">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Vertical Access
      </p>
      <div className="grid grid-cols-2 gap-2">
        {verticals.map((v) => (
          <VerticalCheckbox key={v.id} vertical={v} memberUserId={member.userId} />
        ))}
      </div>
    </div>
  );
}

// ─── Single member row ────────────────────────────────────────────────────────

function MemberRow({
  m,
  isAdmin,
  myMemberId,
  verticals,
  resendInvite,
  resendingId,
  onlineMemberIds,
  onRefetch,
}: {
  m: any;
  isAdmin: boolean;
  myMemberId: string | null;
  verticals: any[];
  resendInvite: (memberId: string) => void;
  resendingId: string | null;
  onlineMemberIds: Set<string>;
  onRefetch: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const RoleIcon = ROLE_ICONS[m.role] || User;

  // P-38: Remove member mutation
  const utils = trpc.useUtils();
  const removeMember = trpc.household.members.remove.useMutation({
    onSuccess: () => {
      toast.success(`${m.displayName} removed from constellation`);
      onRefetch();
      utils.household.members.list.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  // P-38: Can this viewer remove this member?
  // Admin: can remove any non-admin member (not self)
  // EA: can remove members they personally invited (invitedByMemberId === myMemberId)
  const canRemove = m.role !== "household_admin" && m.id !== myMemberId && (
    isAdmin ||
    (!!myMemberId && (m as any).invitedByMemberId === myMemberId)
  );

  // Geeves access toggle (admin only)
  const toggleGeeves = trpc.geevesAccess.setAccess.useMutation({
    onSuccess: () => { onRefetch(); },
    onError: (err: any) => toast.error(err.message),
  });

  // A member is "pending join" if they have no userId yet (invite not completed)
  const isPendingJoin = !m.userId;
  const canResend = isAdmin && (m.status === "invited" || (m.status === "active" && isPendingJoin));
  const isResending = resendingId === m.id;

  return (
    <div className="rounded-lg bg-secondary/30 overflow-hidden">
      {/* Main row */}
      <div className="flex items-center gap-3 p-3">
        <Avatar className="h-10 w-10 shrink-0">
          <AvatarFallback className="text-sm font-medium">
            {m.displayName?.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">
            {m.displayName}
            {(m as any).googleName && (m as any).googleName !== m.displayName && (
              <span className="ml-1.5 text-xs text-muted-foreground font-normal">({(m as any).googleName})</span>
            )}
          </div>
          {m.email && <div className="text-xs text-muted-foreground truncate">{m.email}</div>}
          {isPendingJoin && (
            <div className="text-xs text-amber-500 mt-0.5">Invite not yet accepted</div>
          )}
        </div>
        <Badge variant="outline" className={ROLE_COLORS[m.role] || ""}>
          <RoleIcon className="h-3 w-3 mr-1" />
          {ROLE_LABELS[m.role] || m.role}
        </Badge>
        {/* Open/closed node: closed green = online, open green = active, open amber = invited */}
        <GeeveNodeBadge
          status={
            m.status === "active" && !isPendingJoin && onlineMemberIds.has(m.id)
              ? "online"
              : m.status === "active" && !isPendingJoin
              ? "active"
              : "invited"
          }
          label={
            m.status === "active" && !isPendingJoin && onlineMemberIds.has(m.id)
              ? "Online"
              : m.status === "active" && !isPendingJoin
              ? "Active"
              : isPendingJoin ? "Pending" : "Invited"
          }
          size={9}
        />

        {/* Resend invite — shown for invited OR active-but-unjoined members */}
        {canResend && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground shrink-0"
            title="Resend invitation"
            disabled={isResending}
            onClick={() => resendInvite(m.id)}
          >
            {isResending ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Mail className="h-4 w-4" />
            )}
          </Button>
        )}

        {/* P-38: Remove member — shown for admins and EAs who invited this member */}
        {canRemove && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive shrink-0"
                title="Remove from constellation"
                disabled={removeMember.isPending}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove {m.displayName}?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently remove <strong>{m.displayName}</strong> from the constellation and revoke all their access. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() => removeMember.mutate({ memberId: m.id })}
                  disabled={removeMember.isPending}
                >
                  Remove
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}

        {/* Expand/collapse vertical assignment */}
        {isAdmin && m.role !== "household_admin" && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground shrink-0"
            title={expanded ? "Hide vertical access" : "Manage vertical access"}
            onClick={() => setExpanded((v) => !v)}
          >
            <Layers className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Expanded panel: vertical assignment + Geeves toggle */}
      {expanded && isAdmin && (
        <div className="px-4 pb-4 border-t border-border/50 space-y-4">
          <MemberVerticalAssignment member={m} verticals={verticals} />
          <Separator />
          {/* Resources for this member — admin can add/edit/remove */}
          <ResourcesWidget
            memberId={m.id}
            memberName={m.displayName}
            isAdmin
            compact
          />
          <Separator />
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <span style={{ color: "#8B5CF6" }}>✦</span> Geeves AI Access
              </Label>
              <p className="text-xs text-muted-foreground">
                {m.geevesAccess ? "Can use Geeves assistant" : "No access to Geeves"}
              </p>
            </div>
            <Switch
              checked={!!m.geevesAccess}
              onCheckedChange={(val) => toggleGeeves.mutate({ memberId: m.id, geevesAccess: val })}
              disabled={toggleGeeves.isPending}
              aria-label="Geeves AI access"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Household page ──────────────────────────────────────────────────────

export default function Household() {
  const [showInvite, setShowInvite] = useState(false);
  const { data: householdData, isLoading, refetch } = trpc.household.getMyHousehold.useQuery();
  const { data: members = [], refetch: refetchMembers } = trpc.household.members.list.useQuery();
  const { data: verticals = [] } = trpc.household.verticals.list.useQuery();
  const { data: myPerms } = trpc.accessControl.getMyEffectivePermissions.useQuery();
  const onlineMemberIds = usePresence((householdData as any)?.household?.id);

  const [resendingId, setResendingId] = useState<string | null>(null);
  const resendInvite = trpc.household.members.resendInvite.useMutation({
    onSuccess: (data: any) => {
      if (data?.emailSent) {
        toast.success("Invitation email resent!");
      } else if (data?.joinUrl) {
        navigator.clipboard.writeText(data.joinUrl).catch(() => {});
        toast.success("Invite link copied to clipboard!", {
          description:
            "Re-login with Google to authorize Gmail sending, then resend. Share the copied link directly in the meantime.",
          duration: 8000,
          action: data?.mailtoLink
            ? { label: "Open Mail", onClick: () => window.open(data.mailtoLink, "_blank") }
            : undefined,
        });
      } else if (data?.mailtoLink) {
        toast("Gmail not authorized", {
          description: "Open your mail app to send the invite manually.",
          action: { label: "Open Mail", onClick: () => window.open(data.mailtoLink, "_blank") },
        });
      } else {
        toast.success("Invite resent!");
      }
      refetchMembers();
      setResendingId(null);
    },
    onError: (err: any) => { toast.error(err.message); setResendingId(null); },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse text-muted-foreground">Loading household...</div>
      </div>
    );
  }

  if (!householdData) {
    return <CreateHouseholdView onCreated={refetch} />;
  }

  const { household, isAdmin } = householdData;
  // canInvite: admins always can; EAs and other roles can if they have the household.invite permission
  const canInvite = isAdmin || (myPerms?.canInvite ?? false);

  return (
    <div className="container max-w-4xl py-6 space-y-6">
      {/* Household Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{household?.name}</h1>
          <p className="text-sm text-muted-foreground">
            Timezone: {household?.timezone} · Wake word: "{household?.wakeWord}"
          </p>
        </div>
        {isAdmin && (
          <Button variant="outline" size="sm" onClick={() => toast("Settings coming soon")}>
            <Settings className="h-4 w-4 mr-1" /> Settings
          </Button>
        )}
      </div>

      {/* Members Section */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" /> Members
            </CardTitle>
            <CardDescription>
              {members.length} member{members.length !== 1 ? "s" : ""}
              {isAdmin && (
                <span className="ml-2 text-xs text-muted-foreground">
                  · Click <Layers className="inline h-3 w-3" /> to assign verticals
                </span>
              )}
            </CardDescription>
          </div>
        {canInvite && (
          <Button size="sm" onClick={() => setShowInvite(true)}>
            <Plus className="h-4 w-4 mr-1" /> Invite
          </Button>
        )}
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {members.map((m: any) => (
              <MemberRow
                key={m.id}
                m={m}
                isAdmin={!!isAdmin}
                myMemberId={(householdData as any)?.member?.id ?? null}
                verticals={verticals}
                resendInvite={(memberId) => {
                  setResendingId(memberId);
                  resendInvite.mutate({ memberId, origin: window.location.origin });
                }}
                resendingId={resendingId}
                onlineMemberIds={onlineMemberIds}
                onRefetch={refetchMembers}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Verticals overview */}
      <Card>
        <CardHeader>
          <CardTitle>Life Verticals</CardTitle>
          <CardDescription>
            Organize your life into distinct areas. Use the <Layers className="inline h-3 w-3" /> button on each member to assign which verticals they can see.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {verticals.map((v: any) => (
              <div
                key={v.id}
                className="flex items-center gap-2 p-3 rounded-lg border border-border"
                style={{ borderLeftColor: v.color, borderLeftWidth: "3px" }}
              >
                <span className="text-sm font-medium">{v.name}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Invite Dialog */}
      <InviteMemberDialog
        open={showInvite}
        onOpenChange={setShowInvite}
        verticals={verticals}
        onInvited={() => {
          refetchMembers();
          setShowInvite(false);
        }}
      />
    </div>
  );
}

// ─── Create Household view ────────────────────────────────────────────────────

function CreateHouseholdView({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("America/New_York");
  const [wakeWord, setWakeWord] = useState("Geeves");

  const createHousehold = trpc.household.create.useMutation({
    onSuccess: () => {
      toast.success("Household created!");
      onCreated();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Create Your Household</CardTitle>
          <CardDescription>
            Set up your Geeves household to get started with the Master Calendar and life management.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="name">Household Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., The Perkins Household"
            />
          </div>
          <div>
            <Label htmlFor="timezone">Timezone</Label>
            <Select value={timezone} onValueChange={setTimezone}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="America/New_York">Eastern (New York)</SelectItem>
                <SelectItem value="America/Chicago">Central (Chicago)</SelectItem>
                <SelectItem value="America/Denver">Mountain (Denver)</SelectItem>
                <SelectItem value="America/Los_Angeles">Pacific (Los Angeles)</SelectItem>
                <SelectItem value="America/Jamaica">Jamaica (Kingston)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="wakeWord">Wake Word</Label>
            <Input
              id="wakeWord"
              value={wakeWord}
              onChange={(e) => setWakeWord(e.target.value)}
              placeholder="Geeves"
            />
            <p className="text-xs text-muted-foreground mt-1">The name your assistant responds to</p>
          </div>
          <Button
            className="w-full"
            onClick={() => createHousehold.mutate({ name, timezone, wakeWord })}
            disabled={!name.trim() || createHousehold.isPending}
          >
            {createHousehold.isPending ? "Creating..." : "Create Household"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Vertical access config state for the invite dialog ──────────────────────

type VerticalAccessConfig = {
  verticalId: string;
  accessLevel: "full" | "read_only" | "blind" | "none";
  calendarAccess: "availability_only" | "default_vertical" | "blind" | "read_write";
  canRequestMeetings: boolean;
  hiddenDataCategories: Array<"financial" | "private" | "guest_pii" | "operational">;
};

// ─── Per-vertical access row in the invite dialog ────────────────────────────

function VerticalAccessRow({
  vertical,
  config,
  onChange,
}: {
  vertical: any;
  config: VerticalAccessConfig;
  onChange: (updated: VerticalAccessConfig) => void;
}) {
  const isActive = config.accessLevel !== "none";

  return (
    <div
      className={`rounded-lg border transition-colors ${isActive ? "border-border bg-secondary/20" : "border-border/40 bg-secondary/10 opacity-60"}`}
    >
      {/* Header row: vertical name + access level toggle */}
      <div className="flex items-center gap-3 p-3">
        <div
          className="w-2 h-8 rounded-full shrink-0"
          style={{ backgroundColor: vertical.color }}
        />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{vertical.name}</div>
        </div>
        <Select
          value={config.accessLevel}
          onValueChange={(v) =>
            onChange({ ...config, accessLevel: v as VerticalAccessConfig["accessLevel"] })
          }
        >
          <SelectTrigger className="w-36 h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No Access</SelectItem>
            <SelectItem value="read_only">Read Only</SelectItem>
            <SelectItem value="blind">Blind (Busy Only)</SelectItem>
            <SelectItem value="full">Full Access</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Expanded controls when access is granted */}
      {isActive && (
        <div className="px-3 pb-3 space-y-3 border-t border-border/40 pt-3">
          {/* Calendar access */}
          <div className="flex items-center gap-2">
            <CalendarDays className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-xs text-muted-foreground w-24 shrink-0">Calendar</span>
            <Select
              value={config.calendarAccess}
              onValueChange={(v) =>
                onChange({ ...config, calendarAccess: v as VerticalAccessConfig["calendarAccess"] })
              }
            >
              <SelectTrigger className="flex-1 h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="availability_only">Availability Only</SelectItem>
                <SelectItem value="default_vertical">Default (Vertical Rules)</SelectItem>
                <SelectItem value="blind">Blind (Busy Blocks)</SelectItem>
                <SelectItem value="read_write">Full Read/Write</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Hidden data categories */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <EyeOff className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-xs text-muted-foreground">Hide data categories</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5 pl-5">
              {DATA_CATEGORIES.map((cat) => {
                const isHidden = config.hiddenDataCategories.includes(cat.id);
                return (
                  <label
                    key={cat.id}
                    className="flex items-center gap-1.5 cursor-pointer group"
                  >
                    <Checkbox
                      checked={isHidden}
                      onCheckedChange={(checked) => {
                        const next = checked
                          ? [...config.hiddenDataCategories, cat.id]
                          : config.hiddenDataCategories.filter((c) => c !== cat.id);
                        onChange({ ...config, hiddenDataCategories: next as VerticalAccessConfig["hiddenDataCategories"] });
                      }}
                    />
                    <span className="text-xs leading-tight">
                      <span className="font-medium">{cat.label}</span>
                      <span className="text-muted-foreground ml-1">— {cat.description}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Can request meetings */}
          <div className="flex items-center justify-between pl-5">
            <span className="text-xs text-muted-foreground">Can request meetings during free time</span>
            <Switch
              checked={config.canRequestMeetings}
              onCheckedChange={(v) => onChange({ ...config, canRequestMeetings: v })}
              className="scale-75"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Invite Member Dialog ─────────────────────────────────────────────────────

function InviteMemberDialog({
  open,
  onOpenChange,
  verticals,
  onInvited,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  verticals: any[];
  onInvited: () => void;
}) {
  // Step 1 fields
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [pronouns, setPronouns] = useState("");
  const [relationshipLabel, setRelationshipLabel] = useState("");
  const [accessMode, setAccessMode] = useState("standard");

  // Step tracking: "form" | "access" | "link"
  const [step, setStep] = useState<"form" | "access" | "link">("form");
  const [joinUrl, setJoinUrl] = useState<string | null>(null);
  const [mailtoLink, setMailtoLink] = useState<string | null>(null);

  // Step 2: vertical access configs — one entry per vertical, default = none
  const [verticalAccess, setVerticalAccess] = useState<VerticalAccessConfig[]>([]);
  // Geeves AI access toggle (default: on for all roles)
  const [geevesAccess, setGeevesAccess] = useState(true);

  // Initialise verticalAccess when verticals load or dialog opens
  const initAccess = () => {
    setVerticalAccess(
      verticals.map((v) => ({
        verticalId: v.id,
        accessLevel: "none",
        calendarAccess: "default_vertical",
        canRequestMeetings: true,
        hiddenDataCategories: [],
      }))
    );
  };

  const invite = trpc.household.members.invite.useMutation({
    onSuccess: (data: any) => {
      if (data?.emailSent) {
        toast.success(`Invitation sent to ${email}!`);
        onInvited();
      } else if (data?.joinUrl) {
        setJoinUrl(data.joinUrl);
        setMailtoLink(data.mailtoLink ?? null);
        navigator.clipboard.writeText(data.joinUrl).catch(() => {});
        toast.success("Invite link copied to clipboard!", {
          description:
            "Re-login with Google to authorize Gmail sending. Share the copied link directly with the invitee in the meantime.",
          duration: 8000,
          action: data?.mailtoLink
            ? { label: "Open Mail", onClick: () => window.open(data.mailtoLink, "_blank") }
            : undefined,
        });
        setStep("link");
      } else if (data?.mailtoLink) {
        toast("Invite created — Gmail not authorized", {
          description: "Open your mail app to send the invite manually.",
          action: { label: "Open Mail", onClick: () => window.open(data.mailtoLink, "_blank") },
        });
        onInvited();
      } else {
        toast.success("Member invited!");
        onInvited();
      }
    },
    onError: (err: any) => toast.error(err.message),
  });

  function handleClose(open: boolean) {
    if (!open) {
      setDisplayName("");
      setEmail("");
      setRole("member");
      setPronouns("");
      setRelationshipLabel("");
      setJoinUrl(null);
      setMailtoLink(null);
      setStep("form");
      setVerticalAccess([]);
      setGeevesAccess(true);
    }
    onOpenChange(open);
  }

  function handleNextToAccess() {
    if (!displayName.trim() || !email.trim()) return;
    initAccess();
    setStep("access");
  }

  function handleSendInvite() {
    // Filter out "none" entries — no row needed for those
    const accessPayload = verticalAccess.filter((va) => va.accessLevel !== "none");
    invite.mutate({
      displayName,
      email,
      role: role as any,
      pronouns: pronouns || undefined,
      relationshipLabel: relationshipLabel || undefined,
      accessibilityMode: accessMode as any,
      origin: window.location.origin,
      geevesAccess,
      verticalAccess: accessPayload.length > 0 ? accessPayload : undefined,
    });
  }

  // Count how many verticals have non-none access configured
  const configuredCount = verticalAccess.filter((va) => va.accessLevel !== "none").length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {step === "form" && <><Plus className="h-4 w-4" /> Add Member</>}
            {step === "access" && <><Lock className="h-4 w-4" /> Vertical Access</>}
            {step === "link" && <><Link2 className="h-4 w-4" /> Share Invite Link</>}
          </DialogTitle>
          {/* Step indicator */}
          {step !== "link" && (
            <div className="flex items-center gap-2 pt-1">
              <div className={`h-1.5 flex-1 rounded-full transition-colors ${step === "form" ? "bg-primary" : "bg-primary"}`} />
              <div className={`h-1.5 flex-1 rounded-full transition-colors ${step === "access" ? "bg-primary" : "bg-border"}`} />
            </div>
          )}
        </DialogHeader>

        {/* ── Step 3: invite created, show link ── */}
        {step === "link" && joinUrl && (
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Gmail is not yet authorized. Share this link directly with <strong>{displayName}</strong>:
            </p>
            <div className="flex items-center gap-2 p-3 rounded-lg bg-secondary/50 border border-border">
              <Link2 className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-xs font-mono break-all flex-1">{joinUrl}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => {
                  navigator.clipboard.writeText(joinUrl);
                  toast.success("Copied!");
                }}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
            {mailtoLink && (
              <Button variant="outline" className="w-full" onClick={() => window.open(mailtoLink, "_blank")}>
                <Mail className="h-4 w-4 mr-2" /> Open in Mail App
              </Button>
            )}
            <p className="text-xs text-muted-foreground">
              This link expires in 7 days. Re-login with Google to enable Gmail sending for future invites.
            </p>
            <Button className="w-full" onClick={() => handleClose(false)}>
              Done
            </Button>
          </div>
        )}

        {/* ── Step 1: basic info form ── */}
        {step === "form" && (
          <>
            <div className="space-y-4 py-2">
              <div>
                <Label>Display Name</Label>
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Name"
                  autoFocus
                />
              </div>
              <div>
                <Label>
                  Email <span className="text-destructive">*</span>
                </Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@example.com"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Required — an invitation link will be sent to this address.
                </p>
              </div>
              <div>
                <Label>Pronouns (optional)</Label>
                <Input
                  value={pronouns}
                  onChange={(e) => setPronouns(e.target.value)}
                  placeholder="e.g., he/him, she/her, they/them"
                />
              </div>
              <div>
                <Label>Relationship (optional)</Label>
                <Input
                  value={relationshipLabel}
                  onChange={(e) => setRelationshipLabel(e.target.value)}
                  placeholder="e.g., Papa, Co-parent, Nana, Son"
                />
              </div>
              <div>
                <Label>Role</Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="household_admin">Admin (Co-equal)</SelectItem>
                    <SelectItem value="ea">Executive Assistant</SelectItem>
                    <SelectItem value="member">Member</SelectItem>
                    <SelectItem value="caregiver">Caregiver</SelectItem>
                    <SelectItem value="child">Child</SelectItem>
                    <SelectItem value="elder">Elder</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Interface Mode</Label>
                <Select value={accessMode} onValueChange={setAccessMode}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="standard">Standard</SelectItem>
                    <SelectItem value="picture_board">Picture Board (Visual)</SelectItem>
                    <SelectItem value="large_text">Large Text (Accessibility)</SelectItem>
                    <SelectItem value="voice_only">Voice Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter className="gap-2">
              <DialogClose asChild>
                <Button variant="outline">Cancel</Button>
              </DialogClose>
              <Button
                variant="outline"
                onClick={() => {
                  // Skip access step — send invite with no vertical access config
                  invite.mutate({
                    displayName,
                    email,
                    role: role as any,
                    pronouns: pronouns || undefined,
                    relationshipLabel: relationshipLabel || undefined,
                    accessibilityMode: accessMode as any,
                    origin: window.location.origin,
                  });
                }}
                disabled={!displayName.trim() || !email.trim() || invite.isPending}
              >
                {invite.isPending ? "Inviting..." : "Invite (Skip Access)"}
              </Button>
              <Button
                onClick={handleNextToAccess}
                disabled={!displayName.trim() || !email.trim()}
              >
                Set Access <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </DialogFooter>
          </>
        )}

        {/* ── Step 2: vertical access configuration ── */}
        {step === "access" && (
          <>
            <div className="space-y-3 py-2">
              <p className="text-sm text-muted-foreground">
                Configure which verticals <strong>{displayName}</strong> can access and what data they can see. You can change this later from the Access Control page.
              </p>
              {verticals.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">No verticals set up yet. Invite will be sent with default access.</p>
              ) : (
                <div className="space-y-2">
                  {verticals.map((v: any) => {
                    const config = verticalAccess.find((va) => va.verticalId === v.id);
                    if (!config) return null;
                    return (
                      <VerticalAccessRow
                        key={v.id}
                        vertical={v}
                        config={config}
                        onChange={(updated) =>
                          setVerticalAccess((prev) =>
                            prev.map((va) => (va.verticalId === v.id ? updated : va))
                          )
                        }
                      />
                    );
                  })}
                </div>
              )}
              {configuredCount > 0 && (
                <p className="text-xs text-muted-foreground pt-1">
                  Access configured for {configuredCount} vertical{configuredCount !== 1 ? "s" : ""}.
                </p>
              )}

              {/* Geeves AI access toggle */}
              <Separator className="my-2" />
              <div className="flex items-center justify-between py-2">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium flex items-center gap-1.5">
                    <span style={{ color: "#8B5CF6" }}>✦</span> Geeves AI Access
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Allow {displayName || "this member"} to use the Geeves assistant. Disable for external contacts or members who don't need AI access.
                  </p>
                </div>
                <Switch
                  checked={geevesAccess}
                  onCheckedChange={setGeevesAccess}
                  aria-label="Geeves AI access"
                />
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setStep("form")}>
                Back
              </Button>
              <Button
                onClick={handleSendInvite}
                disabled={invite.isPending}
              >
                {invite.isPending ? "Sending..." : "Send Invite"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
