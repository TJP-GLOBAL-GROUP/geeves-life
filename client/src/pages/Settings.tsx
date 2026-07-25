import { useState, useEffect } from "react";
import { ScopeConsentModal, type ScopeKey } from "@/components/ScopeConsentModal";
import { useLocation } from "wouter";
import { ReconnectSequenceModal, useReconnectSequenceResume, hasActiveSequence } from "@/components/ReconnectSequenceModal";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Settings as SettingsIcon,
  User,
  Calendar,
  Home,
  RefreshCw,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Link2,
  Plus,
  Mail,
  Trash2,
  ChevronDown,
  ChevronRight,
  Building2,
  Globe,
  Tag,
  Eye,
  EyeOff,
  Layers,
  ArrowLeftRight,
  X,
  Bell,
  BellOff,
  ShieldCheck,
  ShieldOff,
  ShieldX,
  Plug,
  FileText,
  CheckSquare,
  Send,
  ExternalLink,
  AlertTriangle,
  Info,
  Edit2,
  Wrench,
  CreditCard,
  Users,
  Zap,
  Star,
} from "lucide-react";
import React from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { getGoogleConnectAccountUrl } from "@/const";
import { GeeveNode, GeeveNodeBadge } from "@/components/GeeveNode";

export default function Settings() {
  const { user } = useAuth();
  const [location] = useLocation();
  const householdQuery = trpc.household.getMyHousehold.useQuery();
  const household = householdQuery.data?.household;
  const member = householdQuery.data?.member;
  const isAdmin = householdQuery.data?.isAdmin;

  // Read tab from URL query param
  const urlParams = new URLSearchParams(window.location.search);
  const defaultTab = urlParams.get("tab") || "profile";
  const [activeTab, setActiveTab] = useState(defaultTab);

  // Handle connect_success / reconnect_success / connect_error from Google account connect callback.
  // IMPORTANT: reconnect_success / connect_error are only handled here when there is NO active
  // reconnect sequence in sessionStorage. If a sequence is active, useReconnectSequenceResume
  // (called below) owns the URL param and will advance the sequence. Consuming it here first
  // would clear the URL before the hook can read it, leaving the modal stuck on amber.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connectSuccess = params.get("connect_success");
    const reconnectSuccess = params.get("reconnect_success");
    const connectError = params.get("connect_error");
    if (reconnectSuccess) {
      if (!hasActiveSequence()) {
        // Standalone reconnect (not part of a multi-account sequence)
        toast.success(`Account reconnected — all settings preserved: ${reconnectSuccess}`);
        window.history.replaceState({}, "", "/settings?tab=integrations");
        setActiveTab("integrations");
      }
      // If hasActiveSequence() is true, leave the URL param intact so
      // useReconnectSequenceResume can read and advance the sequence.
    } else if (connectSuccess) {
      toast.success(`Account connected: ${connectSuccess}`);
      window.history.replaceState({}, "", "/settings?tab=integrations");
      setActiveTab("integrations");
    } else if (connectError) {
      if (!hasActiveSequence()) {
        // Standalone error — sequence errors are handled by the hook
        toast.error(`Failed to connect account: ${connectError}`);
        window.history.replaceState({}, "", "/settings?tab=integrations");
        setActiveTab("integrations");
      }
    }
  }, []);

  if (householdQuery.isLoading) {
    return (
      <div className="p-6">
        <div className="space-y-4">
          <div className="h-8 bg-muted rounded w-48 animate-pulse" />
          <div className="h-64 bg-muted rounded animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Manage your profile, connected services, and household preferences.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="profile" className="gap-2">
            <User className="h-4 w-4" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="integrations" className="gap-2">
            <Plug className="h-4 w-4" />
            Integrations
          </TabsTrigger>
          <TabsTrigger value="calendars" className="gap-2">
            <Calendar className="h-4 w-4" />
            Calendars
          </TabsTrigger>
        {household && (
          <TabsTrigger value="household" className="gap-2">
            <Home className="h-4 w-4" />
            {household.groupName || "Household"}
          </TabsTrigger>
        )}
        {isAdmin && (
          <TabsTrigger value="subscription" className="gap-2">
            <CreditCard className="h-4 w-4" />
            Plan
          </TabsTrigger>
        )}
        {isAdmin && (
          <TabsTrigger value="notifications" className="gap-2">
            <Bell className="h-4 w-4" />
            Notifications
          </TabsTrigger>
        )}
      </TabsList>

        <TabsContent value="profile">
          <ProfileTab member={member} />
        </TabsContent>

        <TabsContent value="integrations">
          <IntegrationsTab />
        </TabsContent>

        <TabsContent value="calendars">
          <CalendarsTab />
        </TabsContent>

        {household && (
          <TabsContent value="household">
            <HouseholdTab household={household} isAdmin={isAdmin} />
          </TabsContent>
        )}
        {isAdmin && (
          <TabsContent value="subscription">
            <SubscriptionTab householdId={household?.id} />
          </TabsContent>
        )}
        {isAdmin && (
          <TabsContent value="notifications">
            <NotificationSettingsTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function ProfileTab({ member }: { member: any }) {
  const [displayName, setDisplayName] = useState(member?.displayName || "");
  const [pronouns, setPronouns] = useState(member?.pronouns || "");
  const [genderIdentity, setGenderIdentity] = useState(member?.genderIdentity || "");
  const [relationshipLabel, setRelationshipLabel] = useState(member?.relationshipLabel || "");

  const utils = trpc.useUtils();
  const updateMutation = trpc.household.members.update.useMutation({
    onSuccess: () => {
      utils.household.getMyHousehold.invalidate();
      toast.success("Profile updated");
    },
    onError: (err) => toast.error(err.message),
  });

  useEffect(() => {
    if (member) {
      setDisplayName(member.displayName || "");
      setPronouns(member.pronouns || "");
      setGenderIdentity(member.genderIdentity || "");
      setRelationshipLabel(member.relationshipLabel || "");
    }
  }, [member]);

  function handleSave() {
    if (!member) return;
    updateMutation.mutate({
      memberId: member.id,
      displayName: displayName || undefined,
      pronouns: pronouns || null,
      genderIdentity: genderIdentity || null,
      relationshipLabel: relationshipLabel || null,
    });
  }

  if (!member) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-muted-foreground">
            Join a household to configure your profile.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your Profile</CardTitle>
        <CardDescription>
          How you appear to other household members. All fields are optional and self-defined.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="displayName">Display Name</Label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="How you'd like to be called"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pronouns">Pronouns</Label>
            <Input
              id="pronouns"
              value={pronouns}
              onChange={(e) => setPronouns(e.target.value)}
              placeholder="e.g. they/them, he/him, she/her"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="genderIdentity">Gender Identity</Label>
            <Input
              id="genderIdentity"
              value={genderIdentity}
              onChange={(e) => setGenderIdentity(e.target.value)}
              placeholder="Self-described (optional)"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="relationshipLabel">Relationship Label</Label>
            <Input
              id="relationshipLabel"
              value={relationshipLabel}
              onChange={(e) => setRelationshipLabel(e.target.value)}
              placeholder="e.g. Parent, Partner, Caregiver"
            />
            <p className="text-xs text-muted-foreground">
              How you describe your role in the household. No assumptions made.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 pt-2">
          <Badge variant="outline" className="text-xs">
            Role: {member.role?.replace("_", " ")}
          </Badge>
          {member.email && (
            <Badge variant="secondary" className="text-xs">
              {member.email}
            </Badge>
          )}
        </div>
        <div className="pt-2">
          <Button onClick={handleSave} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? "Saving..." : "Save Profile"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Calendars Tab ────────────────────────────────────────────────────────────

// ─── Cross-vertical shadow label configuration ──────────────────────────────
function CrossVerticalShadowConfig({ verticals, allCalendars }: { verticals: any[]; allCalendars: any[] }) {
  const utils = trpc.useUtils();
  const [expanded, setExpanded] = useState(false);

  // For each vertical, load its outgoing visibility rules
  const [selectedFrom, setSelectedFrom] = useState<string>("");
  const [selectedTo, setSelectedTo] = useState<string>("");
  const [visLevel, setVisLevel] = useState<"none" | "busy_only" | "full">("busy_only");
  const [busyLabel, setBusyLabel] = useState("Busy");
  const [calendarExclusions, setCalendarExclusions] = useState<string[]>([]);

  const visibilityQuery = trpc.verticals.listVisibility.useQuery(
    { verticalId: selectedFrom },
    { enabled: !!selectedFrom }
  );
  const rules = visibilityQuery.data || [];

  const setVisibilityMutation = trpc.verticals.setVisibility.useMutation({
    onSuccess: () => {
      toast.success("Visibility rule saved.");
      utils.verticals.listVisibility.invalidate({ verticalId: selectedFrom });
    },
    onError: (err) => toast.error(err.message),
  });


  const deleteVisibilityMutation = trpc.verticals.deleteVisibility.useMutation({
    onSuccess: () => {
      toast.success("Rule deleted.");
      utils.verticals.listVisibility.invalidate({ verticalId: selectedFrom });
    },
    onError: (err) => toast.error(err.message),
  });

  // When a rule already exists for the selected pair, pre-fill the form
  const fromVertical = verticals.find((v: any) => v.id === selectedFrom);
  const toVertical = verticals.find((v: any) => v.id === selectedTo);

  function handleSave() {
    if (!selectedFrom || !selectedTo || selectedFrom === selectedTo) {
      toast.error("Select two different verticals.");
      return;
    }
    setVisibilityMutation.mutate({ fromVerticalId: selectedFrom, toVerticalId: selectedTo, visibilityLevel: visLevel, busyLabel, calendarExclusions });
  }

  if (verticals.length < 2) return null;

  return (
    <Card>
      <CardHeader
        className="cursor-pointer select-none"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Cross-Vertical Shadow Labels</CardTitle>
          </div>
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </div>
        <CardDescription className="text-xs">
          Control what label appears on other calendars when an event is created in a vertical. For example, when you add something to your Personal calendar, your StartOut calendar can show "OOO" to block that time.
        </CardDescription>
      </CardHeader>
      {expanded && (
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Source vertical (event lives here)</Label>
              <Select value={selectedFrom} onValueChange={v => { setSelectedFrom(v); setSelectedTo(""); }}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Choose vertical…" />
                </SelectTrigger>
                <SelectContent>
                  {verticals.map((v: any) => (
                    <SelectItem key={v.id} value={v.id} className="text-xs">{v.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Target vertical (blocker appears here)</Label>
              <Select value={selectedTo} onValueChange={v => { setSelectedTo(v); const r = rules.find((x: any) => x.toVerticalId === v); if (r) { setVisLevel(r.visibilityLevel); setBusyLabel(r.busyLabel || "Busy"); setCalendarExclusions(Array.isArray(r.calendarExclusions) ? r.calendarExclusions : []); } else { setCalendarExclusions([]); } }}>
                <SelectTrigger className="h-8 text-xs" disabled={!selectedFrom}>
                  <SelectValue placeholder="Choose vertical…" />
                </SelectTrigger>
                <SelectContent>
                  {verticals.filter((v: any) => v.id !== selectedFrom).map((v: any) => (
                    <SelectItem key={v.id} value={v.id} className="text-xs">{v.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {selectedFrom && selectedTo && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Visibility level</Label>
                  <Select value={visLevel} onValueChange={v => setVisLevel(v as any)}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none" className="text-xs">None (fully private)</SelectItem>
                      <SelectItem value="busy_only" className="text-xs">Busy only (show blocker label)</SelectItem>
                      <SelectItem value="full" className="text-xs">Full (show event title)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Blocker label (shown on target calendar)</Label>
                  <Input
                    className="h-8 text-xs"
                    value={busyLabel}
                    onChange={e => setBusyLabel(e.target.value)}
                    placeholder="e.g. Busy, OOO, Focus Time"
                    maxLength={50}
                    disabled={visLevel === "none" || visLevel === "full"}
                  />
                </div>
              </div>
              {/* Calendar exclusions: pick calendars in the TARGET vertical to exclude from shadow blocks */}
              {visLevel !== "none" && (() => {
                const targetCals = allCalendars.filter((c: any) => c.verticalId === selectedTo && c.provider !== "ical");
                if (targetCals.length === 0) return null;
                return (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Exclude specific calendars from shadow blocks</Label>
                    <p className="text-xs text-muted-foreground">Selected calendars will NOT receive shadow blocks from {fromVertical?.name} events.</p>
                    <div className="flex flex-wrap gap-2">
                      {targetCals.map((c: any) => {
                        const excluded = calendarExclusions.includes(c.id);
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => setCalendarExclusions(prev =>
                              excluded ? prev.filter(id => id !== c.id) : [...prev, c.id]
                            )}
                            className={`px-2 py-1 rounded text-xs border transition-colors ${
                              excluded
                                ? "bg-destructive/20 border-destructive text-destructive"
                                : "bg-muted border-border text-muted-foreground hover:bg-muted/80"
                            }`}
                          >
                            {excluded ? "✕ " : ""}{c.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {visLevel === "none" && `Events in ${fromVertical?.name} will NOT appear on ${toVertical?.name} at all.`}
                  {visLevel === "busy_only" && `Events in ${fromVertical?.name} will appear as "${busyLabel || 'Busy'}" on ${toVertical?.name}.`}
                  {visLevel === "full" && `Events in ${fromVertical?.name} will appear with their full title on ${toVertical?.name}.`}
                </p>
                <Button size="sm" className="h-7 text-xs" onClick={handleSave} disabled={setVisibilityMutation.isPending}>
                  {setVisibilityMutation.isPending ? "Saving…" : "Save rule"}
                </Button>
              </div>
            </>
          )}

          {/* Existing visibility rules */}
          {selectedFrom && rules.length > 0 && (
            <div className="border rounded-md divide-y">
              {rules.map((r: any) => {
                const tgt = verticals.find((v: any) => v.id === r.toVerticalId);
                return (
                  <div key={r.id}>
                    <div className="flex items-center justify-between px-3 py-2 text-xs">
                      <span className="text-muted-foreground">{fromVertical?.name} → {tgt?.name || r.toVerticalId}</span>
                      <div className="flex items-center gap-2">
                        {r.visibilityLevel === "none" && <EyeOff className="h-3 w-3" />}
                        {r.visibilityLevel === "busy_only" && <Eye className="h-3 w-3" />}
                        {r.visibilityLevel === "full" && <Eye className="h-3 w-3 text-green-500" />}
                        <Badge variant="outline" className="text-xs h-5">
                          {r.visibilityLevel === "busy_only" ? (r.busyLabel || "Busy") : r.visibilityLevel}
                        </Badge>
                        {Array.isArray(r.calendarExclusions) && r.calendarExclusions.length > 0 && (
                          <Badge variant="secondary" className="text-xs h-5" title={`${r.calendarExclusions.length} calendar(s) excluded from shadow blocks`}>
                            ✕ {r.calendarExclusions.length} excluded
                          </Badge>
                        )}
                        <button
                          className="text-muted-foreground hover:text-destructive transition-colors"
                          title="Delete rule"
                          onClick={() => deleteVisibilityMutation.mutate({ ruleId: r.id })}
                          disabled={deleteVisibilityMutation.isPending}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// ─── Account-Admin Backfill Panel ───────────────────────────────────────────
function BackfillPanel({
  calendars,
  verticals,
  householdGroupName,
}: {
  calendars: any[];
  verticals: any[];
  householdGroupName: string;
}) {
  const [scope, setScope] = React.useState<"all" | "vertical" | "calendar">("all");
  const [selectedVerticalIds, setSelectedVerticalIds] = React.useState<string[]>([]);
  const [selectedCalendarIds, setSelectedCalendarIds] = React.useState<string[]>([]);
  const [windowDays, setWindowDays] = React.useState(90);
  const [result, setResult] = React.useState<{ totalQueued: number; calendarsProcessed: number } | null>(null);

  const backfillMutation = trpc.calendar.backfillShadowBlocks.useMutation({
    onSuccess: (data) => {
      setResult(data);
      statsQuery.refetch();
      toast.success(`Backfill queued: ${data.totalQueued} events across ${data.calendarsProcessed} calendars`);
    },
    onError: (err) => toast.error(`Backfill failed: ${err.message}`),
  });

  const statsQuery = trpc.calendar.backfillStats.useQuery(undefined, { staleTime: 30_000 });
  const stats = statsQuery.data ?? [];

  // Non-iCal calendars only (iCal feeds are read-only, no shadow blocks to backfill)
  const eligibleCalendars = calendars.filter((c: any) => c.provider !== "ical");

  const canRun = (() => {
    if (scope === "all") return true;
    if (scope === "vertical") return selectedVerticalIds.length > 0;
    return selectedCalendarIds.length > 0;
  })();

  const handleRun = () => {
    setResult(null);
    backfillMutation.mutate({
      scope,
      verticalIds: scope === "vertical" ? selectedVerticalIds : undefined,
      calendarIds: scope === "calendar" ? selectedCalendarIds : undefined,
      windowDays,
    });
  };

  const toggleVertical = (id: string) =>
    setSelectedVerticalIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const toggleCalendar = (id: string) =>
    setSelectedCalendarIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  return (
    <Card className="border-amber-500/20 bg-amber-500/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Wrench className="h-4 w-4 text-amber-400" />
          Maintenance
        </CardTitle>
        <CardDescription className="text-xs">
          Advanced tools for repairing calendar data. Run these if shadow blocks are missing after a sync issue.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-sm font-medium mb-0.5">Backfill Shadow Blocks</p>
          <p className="text-xs text-muted-foreground">
            Re-propagates missing shadow blocks for events that have none. Idempotent — safe to run multiple times.
            Only processes non-iCal calendars within the selected window.
          </p>
        </div>

        {/* Scope selector */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Scope</p>
          <div className="flex gap-2 flex-wrap">
            {([
              { value: "all", label: `All ${householdGroupName}` },
              { value: "vertical", label: "Select Verticals" },
              { value: "calendar", label: "Select Calendars" },
            ] as const).map(opt => (
              <button
                key={opt.value}
                onClick={() => { setScope(opt.value); setSelectedVerticalIds([]); setSelectedCalendarIds([]); }}
                className={`text-xs px-3 py-1 rounded-md border transition-colors ${
                  scope === opt.value
                    ? "bg-amber-500/20 border-amber-500/40 text-amber-300"
                    : "bg-card border-border text-muted-foreground hover:border-amber-500/30"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Vertical picker */}
        {scope === "vertical" && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Verticals ({selectedVerticalIds.length} selected)
            </p>
            {verticals.length === 0 ? (
              <p className="text-xs text-muted-foreground">No verticals configured.</p>
            ) : (
              <div className="max-h-36 overflow-y-auto rounded-md border border-border/50 divide-y divide-border/30">
                {verticals.map((v: any) => (
                  <label key={v.id} className="flex items-center gap-2 px-3 py-2 hover:bg-muted/20 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedVerticalIds.includes(v.id)}
                      onChange={() => toggleVertical(v.id)}
                      className="h-3 w-3 accent-amber-400"
                    />
                    <span
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ backgroundColor: v.color || "#94a3b8" }}
                    />
                    <span className="text-sm truncate">{v.name}</span>
                    <span className="text-xs text-muted-foreground ml-auto shrink-0">{v.calendarCount} cal{v.calendarCount !== 1 ? "s" : ""}</span>
                  </label>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => setSelectedVerticalIds(verticals.map((v: any) => v.id))} className="text-xs text-amber-400 hover:underline">Select all</button>
              <span className="text-xs text-muted-foreground">·</span>
              <button onClick={() => setSelectedVerticalIds([])} className="text-xs text-muted-foreground hover:underline">Clear</button>
            </div>
          </div>
        )}

        {/* Calendar picker */}
        {scope === "calendar" && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Calendars ({selectedCalendarIds.length} selected)
            </p>
            {eligibleCalendars.length === 0 ? (
              <p className="text-xs text-muted-foreground">No calendars available.</p>
            ) : (
              <div className="max-h-40 overflow-y-auto rounded-md border border-border/50 divide-y divide-border/30">
                {eligibleCalendars.map((cal: any) => (
                  <label key={cal.id} className="flex items-center gap-2 px-3 py-2 hover:bg-muted/20 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedCalendarIds.includes(cal.id)}
                      onChange={() => toggleCalendar(cal.id)}
                      className="h-3 w-3 accent-amber-400"
                    />
                    <span
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ backgroundColor: cal.color || "#94a3b8" }}
                    />
                    <span className="text-sm truncate">{cal.name}</span>
                    {cal.accountEmail && (
                      <span className="text-xs text-muted-foreground ml-auto shrink-0 truncate max-w-[140px]">{cal.accountEmail}</span>
                    )}
                  </label>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => setSelectedCalendarIds(eligibleCalendars.map((c: any) => c.id))} className="text-xs text-amber-400 hover:underline">Select all</button>
              <span className="text-xs text-muted-foreground">·</span>
              <button onClick={() => setSelectedCalendarIds([])} className="text-xs text-muted-foreground hover:underline">Clear</button>
            </div>
          </div>
        )}

        {/* Window days */}
        <div className="flex items-center gap-3">
          <p className="text-xs text-muted-foreground shrink-0">Look-back window:</p>
          {[30, 60, 90, 180].map(d => (
            <button
              key={d}
              onClick={() => setWindowDays(d)}
              className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                windowDays === d
                  ? "bg-amber-500/20 border-amber-500/40 text-amber-300"
                  : "border-border text-muted-foreground hover:border-amber-500/30"
              }`}
            >{d}d</button>
          ))}
        </div>

        {/* Run button */}
        <Button
          onClick={handleRun}
          disabled={backfillMutation.isPending || !canRun}
          variant="outline"
          size="sm"
          className="w-full border-amber-500/30 text-amber-300 hover:bg-amber-500/20 hover:text-amber-200 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${backfillMutation.isPending ? "animate-spin" : ""}`} />
          {backfillMutation.isPending
            ? "Running backfill…"
            : scope === "all"
              ? `Run Backfill — All ${householdGroupName} (${windowDays}d)`
              : scope === "vertical"
                ? `Run Backfill — ${selectedVerticalIds.length} Vertical${selectedVerticalIds.length !== 1 ? "s" : ""} (${windowDays}d)`
                : `Run Backfill — ${selectedCalendarIds.length} Calendar${selectedCalendarIds.length !== 1 ? "s" : ""} (${windowDays}d)`
          }
        </Button>

        {/* Per-calendar stats table */}
        {stats.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Calendar Health</p>
            <div className="max-h-44 overflow-y-auto rounded-md border border-border/50 divide-y divide-border/30 text-xs">
              {stats.map((s: any) => {
                const hasIssue = s.eventCount > 0 && s.shadowCount === 0;
                return (
                  <div key={s.calendarId} className="flex items-center gap-2 px-3 py-1.5">
                    <span
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ backgroundColor: s.color || "#94a3b8" }}
                    />
                    <span className="truncate flex-1 text-foreground/80">{s.calendarName}</span>
                    <span className={`shrink-0 tabular-nums ${hasIssue ? "text-amber-400" : "text-muted-foreground"}`}>
                      {s.eventCount} ev / {s.shadowCount} sb
                    </span>
                    <span className="shrink-0 text-muted-foreground/60 hidden sm:block">
                      {s.lastPropagatedAt
                        ? new Date(s.lastPropagatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })
                        : hasIssue ? <span className="text-amber-400">never</span> : "—"
                      }
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground/60">ev = events · sb = shadow blocks · amber = needs backfill</p>
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="rounded-md bg-primary/10 border border-primary/20 p-3">
            <p className="text-sm text-primary font-medium">
              ✓ Backfill queued: {result.totalQueued} events across {result.calendarsProcessed} calendars
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Shadow blocks are being written asynchronously. Allow 1–2 minutes for all blocks to propagate.
            </p>
          </div>
        )}
        {backfillMutation.isError && (
          <p className="text-xs text-red-400">Error: {backfillMutation.error.message}</p>
        )}
      </CardContent>
    </Card>
  );
}

function CalendarsTab() {
  const utils = trpc.useUtils();

  // Household (for dynamic groupName labeling in maintenance panel)
  const householdQuery = trpc.household.getMyHousehold.useQuery();
  const householdGroupName = householdQuery.data?.household?.groupName || "Household";

  // Connected Google accounts (read-only here — management moved to Integrations tab)
  const accountsQuery = trpc.integrations.list.useQuery();
  const accounts = accountsQuery.data || [];

  // All calendars (for the "all calendars" flat list view)
  const calendarsQuery = trpc.calendar.list.useQuery();
  const calendars = calendarsQuery.data || [];

  // Verticals for assignment dropdown
  const verticalsQuery = trpc.verticals.list.useQuery();
  const verticals = verticalsQuery.data || [];

  const syncStatusQuery = trpc.calendar.syncStatus.useQuery();
  const syncStatus = syncStatusQuery.data;

  // Track which account sections are expanded
  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set());

  // Track per-calendar sync loading
  const [syncingCalendarId, setSyncingCalendarId] = useState<string | null>(null);

  // Track per-account discovery loading
  const [discoveringAccount, setDiscoveringAccount] = useState<string | null>(null);

  const updateCalendarMutation = trpc.calendar.update.useMutation({
    onSuccess: () => utils.calendar.list.invalidate(),
    onError: (err) => toast.error(err.message),
  });

  const removeAccountMutation = trpc.calendar.removeGoogleAccount.useMutation({
    onSuccess: (_, vars) => {
      toast.success(`Disconnected ${vars.accountEmail}`);
      utils.calendar.listGoogleAccounts.invalidate();
      utils.calendar.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const discoverForAccountMutation = trpc.calendar.discoverForAccount.useMutation({
    onMutate: ({ accountEmail }) => setDiscoveringAccount(accountEmail),
    onSuccess: (result, vars) => {
      if (result.error) {
        toast.error(result.error);
      } else if (result.discovered === 0) {
        toast.info(`All calendars for ${vars.accountEmail} are already synced.`);
      } else {
        toast.success(`Found ${result.discovered} new calendar${result.discovered !== 1 ? "s" : ""} from ${vars.accountEmail}.`);
      }
      utils.calendar.list.invalidate();
    },
    onError: (err) => toast.error(`Discovery failed: ${err.message}`),
    onSettled: () => setDiscoveringAccount(null),
  });

  const deleteCalendarMutation = trpc.calendar.delete.useMutation({
    onSuccess: (_, vars) => {
      toast.success("Calendar removed.");
      utils.calendar.list.invalidate();
      utils.calendar.listGoogleAccounts.invalidate();
    },
    onError: (err) => toast.error(`Delete failed: ${err.message}`),
  });

  const reregisterWebhooksMutation = trpc.calendar.reregisterWebhooks.useMutation({
    onSuccess: () => toast.success("Webhook channels re-registered for all calendars."),
    onError: (err) => toast.error(`Webhook registration failed: ${err.message}`),
  });

  const syncCalendarMutation = trpc.calendar.syncCalendar.useMutation({
    onMutate: ({ calendarId }) => setSyncingCalendarId(calendarId),
    onSuccess: (result: any) => {
      toast.success(`Synced ${result.synced ?? 0} events.`);
      utils.calendar.list.invalidate();
    },
    onError: (err) => toast.error(`Sync failed: ${err.message}`),
    onSettled: () => setSyncingCalendarId(null),
  });

  const [forceFullSyncCalendarId, setForceFullSyncCalendarId] = useState<string | null>(null);
  const forceFullSyncMutation = trpc.calendar.forceFullSync.useMutation({
    onMutate: ({ calendarId }) => setForceFullSyncCalendarId(calendarId),
    onSuccess: (result: any) => {
      toast.success(`Full re-sync complete: ${result.synced ?? 0} event(s) synced. Shadow blocks updated.`);
      utils.calendar.list.invalidate();
    },
    onError: (err) => toast.error(`Force sync failed: ${err.message}`),
    onSettled: () => setForceFullSyncCalendarId(null),
  });

  const [repropagatingCalendarId, setRepropagatingCalendarId] = useState<string | null>(null);
  const repropagateMutation = trpc.calendar.repropagate.useMutation({
    onMutate: ({ calendarId }) => setRepropagatingCalendarId(calendarId),
    onSuccess: (result: any) => {
      toast.success(`Re-propagation queued for ${result.queued ?? 0} event(s). Shadow blocks will update shortly.`);
    },
    onError: (err) => toast.error(`Re-propagation failed: ${err.message}`),
    onSettled: () => setRepropagatingCalendarId(null),
  });

  function toggleAccount(email: string) {
    setExpandedAccounts(prev => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  }

  function handleAddAccount() {
    // Account management moved to Integrations tab
    window.location.href = "/settings?tab=integrations";
  }

  // Calendar row with vertical assignment
  function CalendarRow({ cal, compact = false }: { cal: any; compact?: boolean }) {
    const currentVertical = verticals.find((v: any) => v.id === cal.verticalId);
    return (
      <div className={`flex items-center justify-between gap-3 ${compact ? "px-4 py-2.5" : "p-3 rounded-lg border"}`}>
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="h-2.5 w-2.5 rounded-full shrink-0"
            style={{ backgroundColor: cal.color || "#6366f1" }}
          />
          <div className="min-w-0">
            <p className="text-sm truncate">{cal.name}</p>
            {!compact && (
              <p className="text-xs text-muted-foreground">
                {cal.isPrimary ? "Primary" : "Google Calendar"}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Vertical assignment */}
          <Select
            value={cal.verticalId || "none"}
            onValueChange={(val) => {
              updateCalendarMutation.mutate({
                id: cal.id,
                verticalId: val === "none" ? null : val,
              });
            }}
          >
            <SelectTrigger className="h-6 w-auto min-w-[90px] max-w-[130px] text-xs border-dashed">
              <Tag className="h-3 w-3 mr-1 shrink-0" />
              <SelectValue placeholder="Vertical" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No vertical</SelectItem>
              {verticals.map((v: any) => (
                <SelectItem key={v.id} value={v.id}>
                  <span className="flex items-center gap-1.5">
                    <span
                      className="inline-block h-2 w-2 rounded-full shrink-0"
                      style={{ backgroundColor: v.color || "#6366f1" }}
                    />
                    {v.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <GeeveNode
            status={cal.isVisible ? "connected" : "inactive"}
            size={10}
            title={cal.isVisible ? "Visible on calendar" : "Hidden from calendar"}
          />
          {/* Shadow blocking controls: source (generates) + target (receives) */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={`h-6 w-6 ${
                  (cal as any).shadowSource !== false && cal.shadowBlocking !== false
                    ? "text-primary"
                    : (cal as any).shadowSource === false && cal.shadowBlocking === false
                    ? "text-muted-foreground"
                    : "text-amber-400"
                }`}
                title="Availability sharing settings"
              >
                {(cal as any).shadowSource !== false && cal.shadowBlocking !== false ? (
                  <ShieldCheck className="h-3 w-3" />
                ) : (cal as any).shadowSource === false && cal.shadowBlocking === false ? (
                  <ShieldX className="h-3 w-3" />
                ) : (
                  <ShieldOff className="h-3 w-3" />
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 text-sm space-y-3" side="left" align="start">
              <p className="font-semibold text-sm">Availability Sharing</p>
              <p className="text-xs text-muted-foreground">
                Control how <strong>{cal.name}</strong> participates in Busy block propagation.
              </p>
              {/* Generates Busy blocks (shadowSource) */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium">Generates Busy blocks</p>
                    <p className="text-xs text-muted-foreground">Events here create Busy blocks on other calendars</p>
                  </div>
                  <Button
                    variant={(cal as any).shadowSource !== false ? "default" : "outline"}
                    size="sm"
                    className="h-6 text-xs px-2 shrink-0"
                    onClick={() => updateCalendarMutation.mutate({
                      id: cal.id,
                      shadowSource: (cal as any).shadowSource === false ? true : false,
                    })}
                  >
                    {(cal as any).shadowSource !== false ? "On" : "Off"}
                  </Button>
                </div>
              </div>
              {/* Receives Busy blocks (shadowBlocking) */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium">Receives Busy blocks</p>
                    <p className="text-xs text-muted-foreground">Other calendars' events appear as Busy here</p>
                  </div>
                  <Button
                    variant={cal.shadowBlocking !== false ? "default" : "outline"}
                    size="sm"
                    className="h-6 text-xs px-2 shrink-0"
                    onClick={() => updateCalendarMutation.mutate({
                      id: cal.id,
                      shadowBlocking: cal.shadowBlocking === false ? true : false,
                    })}
                  >
                    {cal.shadowBlocking !== false ? "On" : "Off"}
                  </Button>
                </div>
              </div>
              <div className="rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">
                {(cal as any).shadowSource !== false && cal.shadowBlocking !== false &&
                  "Personal calendar — events flow both ways."}
                {(cal as any).shadowSource === false && cal.shadowBlocking !== false &&
                  "Shared/team calendar — receives availability context but does not broadcast events."}
                {(cal as any).shadowSource === false && cal.shadowBlocking === false &&
                  "Isolated calendar — fully independent, no Busy blocks in either direction."}
                {(cal as any).shadowSource !== false && cal.shadowBlocking === false &&
                  "Outbound only — events here create Busy blocks elsewhere but this calendar stays clean."}
              </div>
            </PopoverContent>
          </Popover>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            title="Sync now (incremental)"
            disabled={syncingCalendarId === cal.id}
            onClick={() => syncCalendarMutation.mutate({ calendarId: cal.id })}
          >
            <RefreshCw className={`h-3 w-3 ${syncingCalendarId === cal.id ? "animate-spin" : ""}`} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-amber-500"
            title="Force full re-sync — use when an edited event is missing from Geeves. Clears the sync token and re-fetches all events from Google, re-creating any that were previously deleted and re-running shadow block propagation."
            disabled={forceFullSyncCalendarId === cal.id}
            onClick={() => {
              if (confirm(`Force full re-sync for "${cal.name}"?\n\nThis will re-fetch ALL events from Google and re-create any missing shadow blocks. Use this when an edited event is not showing up in Geeves.`)) {
                forceFullSyncMutation.mutate({ calendarId: cal.id });
              }
            }}
          >
            <RotateCcw className={`h-3 w-3 ${forceFullSyncCalendarId === cal.id ? "animate-spin" : ""}`} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-primary"
            title="Re-propagate shadow blocks for all events on this calendar"
            disabled={repropagatingCalendarId === cal.id}
            onClick={() => {
              if (confirm(`Re-propagate shadow blocks for all events on "${cal.name}"? This will update Busy blocks on all other calendars.`)) {
                repropagateMutation.mutate({ calendarId: cal.id });
              }
            }}
          >
            <Layers className={`h-3 w-3 ${repropagatingCalendarId === cal.id ? "animate-pulse" : ""}`} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-destructive"
            title="Delete calendar"
            disabled={deleteCalendarMutation.isPending}
            onClick={() => {
              if (confirm(`Remove "${cal.name}" from Geeves? This will delete all synced events for this calendar.`)) {
                deleteCalendarMutation.mutate({ id: cal.id });
              }
            }}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
    );
  }

  // Group calendars by accountEmail
  const calendarsByAccount: Record<string, typeof calendars> = {};
  const propertyBookingCalendars: typeof calendars = []; // provider=ical, no accountEmail
  const unassignedCalendars: typeof calendars = [];     // other legacy calendars

  for (const cal of calendars) {
    if (cal.accountEmail) {
      if (!calendarsByAccount[cal.accountEmail]) calendarsByAccount[cal.accountEmail] = [];
      calendarsByAccount[cal.accountEmail].push(cal);
    } else if ((cal as any).provider === 'ical') {
      propertyBookingCalendars.push(cal);
    } else {
      unassignedCalendars.push(cal);
    }
  }

  function getAccountIcon(email: string) {
    const domain = email.split("@")[1]?.toLowerCase();
    if (domain === "gmail.com") return <Mail className="h-4 w-4 text-red-400" />;
    return <Globe className="h-4 w-4 text-purple-400" />;
  }

  function getAccountBadge(email: string) {
    const domain = email.split("@")[1]?.toLowerCase();
    if (domain === "gmail.com") return <Badge variant="secondary" className="text-xs">Personal</Badge>;
    return <Badge variant="outline" className="text-xs">Google Account</Badge>;
  }

  return (
    <div className="space-y-4">
      {/* Connected accounts summary banner — management moved to Integrations tab */}
      <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
        <div className="flex items-center gap-3">
          <Plug className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">
              {accounts.length === 0
                ? "No accounts connected"
                : `${accounts.length} account${accounts.length !== 1 ? "s" : ""} connected`
              }
            </p>
            <p className="text-xs text-muted-foreground">
              Account management has moved to the Integrations tab.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 shrink-0"
          onClick={() => window.location.href = "/settings?tab=integrations"}
        >
          <Plug className="h-3.5 w-3.5" />
          Manage Accounts
        </Button>
      </div>

      {/* Calendars grouped by account */}
      {accounts.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <CardTitle>Calendars by Account</CardTitle>
                <CardDescription>Manage sync settings and vertical assignments for each calendar.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {accounts.map(account => {
                const isExpanded = expandedAccounts.has(account.accountEmail);
                const accountCalendars = calendarsByAccount[account.accountEmail] || [];
                const isDiscovering = discoveringAccount === account.accountEmail;

                return (
                  <div key={account.id} className="rounded-lg border overflow-hidden">
                    {/* Account header row */}
                    <div
                      className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => toggleAccount(account.accountEmail)}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {isExpanded
                          ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                          : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                        }
                        {getAccountIcon(account.accountEmail)}
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <GeeveNode
                              status={isDiscovering ? "syncing" : "connected"}
                              size={8}
                              title={isDiscovering ? "Syncing…" : "Connected"}
                            />
                            <p className="text-sm font-medium truncate">{account.accountEmail}</p>
                            {account.displayName && (
                              <Badge variant="outline" className="text-xs">{account.displayName}</Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {accountCalendars.length} calendar{accountCalendars.length !== 1 ? "s" : ""} synced
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
                        {getAccountBadge(account.accountEmail)}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 gap-1 text-xs"
                          disabled={isDiscovering}
                          onClick={() => discoverForAccountMutation.mutate({ accountEmail: account.accountEmail })}
                          title="Discover new calendars for this account"
                        >
                          <RefreshCw className={`h-3.5 w-3.5 ${isDiscovering ? "animate-spin" : ""}`} />
                          <span className="hidden sm:inline">{isDiscovering ? "Discovering…" : "Discover"}</span>
                        </Button>
                      </div>
                    </div>

                    {/* Expanded calendar list */}
                    {isExpanded && (
                      <div className="border-t bg-muted/20">
                        {accountCalendars.length === 0 ? (
                          <div className="p-4 text-center">
                            <p className="text-xs text-muted-foreground mb-2">No calendars discovered yet.</p>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={isDiscovering}
                              onClick={() => discoverForAccountMutation.mutate({ accountEmail: account.accountEmail })}
                              className="gap-1.5"
                            >
                              <RefreshCw className={`h-3.5 w-3.5 ${isDiscovering ? "animate-spin" : ""}`} />
                              {isDiscovering ? "Discovering…" : "Discover Calendars"}
                            </Button>
                          </div>
                        ) : (
                          <div className="divide-y">
                            {accountCalendars.map(cal => (
                              <CalendarRow key={cal.id} cal={cal} compact />
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Property Booking Calendars (iCal feeds — one per property) */}
              {propertyBookingCalendars.length > 0 && (
                <div className="rounded-lg border border-amber-500/30 overflow-hidden">
                  <div
                    className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => toggleAccount("__property_ical__")}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {expandedAccounts.has("__property_ical__")
                        ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                        : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      }
                      <Building2 className="h-4 w-4 text-amber-400" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium">Property Booking Calendars</p>
                        <p className="text-xs text-muted-foreground">
                          {propertyBookingCalendars.length} calendar{propertyBookingCalendars.length !== 1 ? "s" : ""} — iCal feeds from Airbnb, VRBO, Booking.com
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-xs shrink-0 border-amber-500/50 text-amber-400">iCal</Badge>
                  </div>
                  {expandedAccounts.has("__property_ical__") && (
                    <div className="border-t bg-muted/20 divide-y">
                      {propertyBookingCalendars.map(cal => (
                        <CalendarRow key={cal.id} cal={cal} compact />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Unassigned calendars (legacy / pre-multi-account) */}
              {unassignedCalendars.length > 0 && (
                <div className="rounded-lg border overflow-hidden">
                  <div
                    className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => toggleAccount("__unassigned__")}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {expandedAccounts.has("__unassigned__")
                        ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                        : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      }
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium">Other Calendars</p>
                        <p className="text-xs text-muted-foreground">
                          {unassignedCalendars.length} calendar{unassignedCalendars.length !== 1 ? "s" : ""} (no account assigned)
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-xs shrink-0">Legacy</Badge>
                  </div>
                  {expandedAccounts.has("__unassigned__") && (
                    <div className="border-t bg-muted/20 divide-y">
                      {unassignedCalendars.map(cal => (
                        <CalendarRow key={cal.id} cal={cal} compact />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sync configuration status */}
      {syncStatus && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sync Configuration</CardTitle>
            <CardDescription className="text-xs">Technical status of your Google Calendar integration.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Google OAuth</span>
              <Badge variant={syncStatus.googleOAuthConfigured ? "default" : "outline"}>
                {syncStatus.googleOAuthConfigured ? "Configured" : "Not configured"}
              </Badge>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span>Connected accounts</span>
              <Badge variant="secondary">{accounts.length} / 5</Badge>
            </div>
            <div className="pt-2 border-t">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs w-full"
                onClick={() => reregisterWebhooksMutation.mutate()}
                disabled={reregisterWebhooksMutation.isPending}
              >
                <RefreshCw className={`h-3 w-3 mr-1.5 ${reregisterWebhooksMutation.isPending ? "animate-spin" : ""}`} />
                {reregisterWebhooksMutation.isPending ? "Registering…" : "Re-register Push Webhooks"}
              </Button>
              <p className="text-xs text-muted-foreground mt-1.5">Force Google to send real-time notifications to Geeves for all calendars. Use this if shadow blocks are not appearing after creating events in Google Calendar.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Cross-vertical shadow label configuration */}
      <CrossVerticalShadowConfig verticals={verticals} allCalendars={calendars} />

      {/* ── Maintenance ── */}
      <BackfillPanel calendars={calendars} verticals={verticals} householdGroupName={householdGroupName} />

      {/* How it works guide */}
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="text-base">How Calendar Sync Works</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <div className="flex gap-3">
            <Mail className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-foreground">Personal Gmail</p>
              <p>Gmail accounts (e.g. <code className="text-xs">tarikp@gmail.com</code>) require a one-time authorisation. Tokens are refreshed automatically.</p>
            </div>
          </div>
          <div className="flex gap-3">
            <Globe className="h-4 w-4 text-purple-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-foreground">Custom Domain Accounts</p>
              <p>Accounts on any domain (e.g. <code className="text-xs">tarik@maxfieldbakery.com</code>, <code className="text-xs">tarik@tjperkinsfam.com</code>) also use standard OAuth — authorise once and tokens refresh automatically.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function HouseholdTab({ household, isAdmin }: { household: any; isAdmin: boolean | undefined }) {
  const [name, setName] = useState(household?.name || "");
  const [timezone, setTimezone] = useState(household?.timezone || "America/New_York");
  const [wakeWord, setWakeWord] = useState(household?.wakeWord || "Geeves");
  const [groupName, setGroupName] = useState(household?.groupName || "Household");

  const utils = trpc.useUtils();
  const updateMutation = trpc.household.update.useMutation({
    onSuccess: () => {
      utils.household.getMyHousehold.invalidate();
      toast.success("Settings updated");
    },
    onError: (err) => toast.error(err.message),
  });

  useEffect(() => {
    if (household) {
      setName(household.name || "");
      setTimezone(household.timezone || "America/New_York");
      setWakeWord(household.wakeWord || "Geeves");
      setGroupName(household.groupName || "Household");
    }
  }, [household]);

  function handleSave() {
    updateMutation.mutate({ name, timezone, wakeWord, groupName });
  }

  const GROUP_NAME_PRESETS = [
    "Household",
    "Village",
    "Constellation",
    "Family",
    "Team",
    "Studio",
    "Crew",
    "Circle",
    "Collective",
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Group Settings</CardTitle>
          <CardDescription>
            {isAdmin
              ? "Configure shared preferences for your group."
              : "View group settings. Only admins can make changes."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="householdName">{groupName || "Household"} Name</Label>
              <Input
                id="householdName"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!isAdmin}
                placeholder="e.g. The Perkins Family"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="groupName">Group Type</Label>
              <div className="flex gap-2">
                <Select
                  value={GROUP_NAME_PRESETS.includes(groupName) ? groupName : "custom"}
                  onValueChange={(val) => {
                    if (val !== "custom") setGroupName(val);
                  }}
                  disabled={!isAdmin}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GROUP_NAME_PRESETS.map((p) => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                    <SelectItem value="custom">Custom…</SelectItem>
                  </SelectContent>
                </Select>
                {(!GROUP_NAME_PRESETS.includes(groupName) || groupName === "") && (
                  <Input
                    className="flex-1"
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    disabled={!isAdmin}
                    placeholder="e.g. Constellation"
                  />
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                How Geeves refers to your group — shown in the sidebar and throughout the app.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="wakeWord">Wake Word</Label>
              <Input
                id="wakeWord"
                value={wakeWord}
                onChange={(e) => setWakeWord(e.target.value)}
                disabled={!isAdmin}
                placeholder="Geeves"
              />
              <p className="text-xs text-muted-foreground">
                The name your group uses to address the assistant.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="timezone">Timezone</Label>
              <Input
                id="timezone"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                disabled={!isAdmin}
                placeholder="America/New_York"
              />
            </div>
          </div>
          {isAdmin && (
            <div className="pt-2">
              <Button onClick={handleSave} disabled={updateMutation.isPending}>
                {updateMutation.isPending ? "Saving..." : "Save Settings"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Start your own Geeves — stub for non-admin members */}
      {!isAdmin && (
        <Card className="border-dashed border-2 border-muted-foreground/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-5 w-5 text-[var(--color-teal)]" />
              Start Your Own Geeves.Life
            </CardTitle>
            <CardDescription>
              Want your own household, village, or constellation? Geeves lets you create a separate group — for your own family, business, or personal life — with its own members, calendars, and verticals.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => toast.info("Geeves.Life standalone accounts are coming soon. We'll notify you when sign-up opens.", { duration: 6000 })}
              >
                <Globe className="h-4 w-4" />
                Get Your Own Geeves.Life
              </Button>
              <p className="text-xs text-muted-foreground self-center">
                Free trial · No credit card required · Your own group, your own Geeves.Life
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Purpose metadata (mirrors server/routers/integrations.ts) ─────────────

const PURPOSE_META: Record<string, { label: string; description: string; icon: React.ReactNode; color: string }> = {
  calendar_sync: {
    label: "Calendar Sync",
    description: "Read and write calendar events",
    icon: <Calendar className="h-3.5 w-3.5" />,
    color: "bg-blue-500/10 text-blue-600 border-blue-200",
  },
  email_scraping: {
    label: "Email Scraping",
    description: "Read emails to extract booking confirmations",
    icon: <Mail className="h-3.5 w-3.5" />,
    color: "bg-amber-500/10 text-amber-600 border-amber-200",
  },
  notes: {
    label: "Notes",
    description: "Access Google Keep notes",
    icon: <FileText className="h-3.5 w-3.5" />,
    color: "bg-yellow-500/10 text-yellow-600 border-yellow-200",
  },
  tasks: {
    label: "Tasks",
    description: "Read Google Tasks",
    icon: <CheckSquare className="h-3.5 w-3.5" />,
    color: "bg-green-500/10 text-green-600 border-green-200",
  },
  gmail_send: {
    label: "Send Email",
    description: "Send emails on your behalf",
    icon: <Send className="h-3.5 w-3.5" />,
    color: "bg-purple-500/10 text-purple-600 border-purple-200",
  },
};

const ALL_PURPOSES = Object.keys(PURPOSE_META);

// ─── Add Account Dialog ──────────────────────────────────────────────────────

function AddAccountDialog({ onConnect }: { onConnect: (purposes: string[], displayName: string) => void }) {
  const [open, setOpen] = useState(false);
  const [selectedPurposes, setSelectedPurposes] = useState<Set<string>>(new Set(["calendar_sync"]));
  const [displayName, setDisplayName] = useState("");

  function togglePurpose(p: string) {
    setSelectedPurposes(prev => {
      const next = new Set(prev);
      if (next.has(p)) {
        if (next.size === 1) return prev; // must keep at least one
        next.delete(p);
      } else {
        next.add(p);
      }
      return next;
    });
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} className="gap-2">
        <Plus className="h-4 w-4" />
        Add Account
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background border rounded-xl shadow-xl w-full max-w-md mx-4 p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Connect a Google Account</h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Choose what you want Geeves to access from this account.
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-2">
              <Label>Display Name <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input
                placeholder="e.g. Personal, Work, Tarik US"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                maxLength={100}
              />
            </div>

            <div className="space-y-2">
              <Label>Purposes</Label>
              <p className="text-xs text-muted-foreground">
                Select what this account will be used for. Only the required permissions will be requested.
              </p>
              <div className="space-y-2 mt-1">
                {ALL_PURPOSES.map(p => {
                  const meta = PURPOSE_META[p];
                  const selected = selectedPurposes.has(p);
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => togglePurpose(p)}
                      className={`w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-colors ${
                        selected
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-muted-foreground/40"
                      }`}
                    >
                      <div className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center ${
                        selected ? "bg-primary border-primary" : "border-muted-foreground/40"
                      }`}>
                        {selected && <CheckCircle2 className="h-3 w-3 text-primary-foreground" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">{meta.icon}</span>
                          <span className="text-sm font-medium">{meta.label}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{meta.description}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-start gap-2 p-3 bg-muted/50 rounded-lg">
              <Info className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
              <p className="text-xs text-muted-foreground">
                You'll be redirected to Google to authorise the selected permissions. You can add or change purposes later from this page.
              </p>
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button
                disabled={selectedPurposes.size === 0}
                onClick={() => {
                  setOpen(false);
                  onConnect(Array.from(selectedPurposes), displayName);
                }}
                className="gap-2"
              >
                <ExternalLink className="h-4 w-4" />
                Authorise with Google
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Edit Purposes Dialog ────────────────────────────────────────────────────

function EditPurposesDialog({
  account,
  onSave,
  onClose,
}: {
  account: { accountEmail: string; purposes: string[]; displayName: string | null };
  onSave: (purposes: string[], displayName: string) => void;
  onClose: () => void;
}) {
  const [selectedPurposes, setSelectedPurposes] = useState<Set<string>>(new Set(account.purposes));
  const [displayName, setDisplayName] = useState(account.displayName || "");

  function togglePurpose(p: string) {
    setSelectedPurposes(prev => {
      const next = new Set(prev);
      if (next.has(p)) {
        if (next.size === 1) return prev;
        next.delete(p);
      } else {
        next.add(p);
      }
      return next;
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background border rounded-xl shadow-xl w-full max-w-md mx-4 p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Edit Account Purposes</h2>
            <p className="text-sm text-muted-foreground mt-0.5 truncate max-w-xs">{account.accountEmail}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-2">
          <Label>Display Name <span className="text-muted-foreground font-normal">(optional)</span></Label>
          <Input
            placeholder="e.g. Personal, Work"
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            maxLength={100}
          />
        </div>

        <div className="space-y-2">
          <Label>Purposes</Label>
          <div className="space-y-2">
            {ALL_PURPOSES.map(p => {
              const meta = PURPOSE_META[p];
              const selected = selectedPurposes.has(p);
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => togglePurpose(p)}
                  className={`w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-colors ${
                    selected ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/40"
                  }`}
                >
                  <div className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center ${
                    selected ? "bg-primary border-primary" : "border-muted-foreground/40"
                  }`}>
                    {selected && <CheckCircle2 className="h-3 w-3 text-primary-foreground" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">{meta.icon}</span>
                      <span className="text-sm font-medium">{meta.label}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{meta.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={selectedPurposes.size === 0}
            onClick={() => onSave(Array.from(selectedPurposes), displayName)}
          >
            Save Changes
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Integrations Tab ────────────────────────────────────────────────────────

function IntegrationsTab() {
  const utils = trpc.useUtils();

  // ── Primary data source: unified health (accounts + email warnings) ──────────
  const healthQuery = trpc.integrations.getUnifiedHealth.useQuery(undefined, {
    staleTime: 30000,
    refetchInterval: 60000,
  });
  const health = healthQuery.data;
  const accounts = health?.accounts ?? [];
  const emailWarnings = health?.emailWarnings ?? [];
  const totalIssues = health?.totalIssues ?? 0;

  // ── Mutations ─────────────────────────────────────────────────────────────────
  const getConnectUrlMutation = trpc.integrations.getConnectUrl.useMutation({
    onSuccess: (data) => { window.location.href = data.url; },
    onError: (err) => toast.error(err.message),
  });
  const updatePurposesMutation = trpc.integrations.updatePurposes.useMutation({
    onSuccess: () => {
      utils.integrations.getUnifiedHealth.invalidate();
      utils.integrations.list.invalidate();
      utils.calendar.listGoogleAccounts.invalidate();
      setEditingAccount(null);
      toast.success("Account purposes updated");
    },
    onError: (err) => toast.error(err.message),
  });
  const removeMutation = trpc.integrations.remove.useMutation({
    onSuccess: () => {
      utils.integrations.getUnifiedHealth.invalidate();
      utils.integrations.list.invalidate();
      utils.calendar.listGoogleAccounts.invalidate();
      toast.success("Account disconnected");
    },
    onError: (err) => toast.error(err.message),
  });
  const getReconnectUrlMutation = trpc.integrations.getReconnectUrl.useMutation({
    onSuccess: (data) => { window.location.href = data.url; },
    onError: (err) => toast.error(`Reconnect failed: ${err.message}`),
  });
  const getEmailReconnectUrlMutation = trpc.integrations.getEmailReconnectUrl.useMutation({
    onSuccess: (data) => { window.location.href = data.url; },
    onError: (err) => toast.error(`Reconnect failed: ${err.message}`),
  });

  // ── Local state ───────────────────────────────────────────────────────────────
  const [editingAccount, setEditingAccount] = useState<typeof accounts[0] | null>(null);
  const [showReconnectModal, setShowReconnectModal] = useState(false);
  const { shouldOpen: reconnectShouldOpen } = useReconnectSequenceResume();

  // Open modal when page-level hook detects returning OAuth redirect or saved sequence
  useEffect(() => {
    if (reconnectShouldOpen) setShowReconnectModal(true);
  }, [reconnectShouldOpen]);

  // ── Helpers ───────────────────────────────────────────────────────────────────
  // P-35: Scope consent modal state
  const [pendingConsent, setPendingConsent] = useState<{
    scopeKey: ScopeKey;
    accountEmail?: string;
    onConfirm: () => void;
  } | null>(null);
  const dismissConsentMutation = trpc.integrations.dismissScopeConsent.useMutation();
  const { data: consentPrefs } = trpc.integrations.getScopeConsentPreferences.useQuery();
  const dismissedScopes = new Set(consentPrefs?.dismissed ?? []);

  // P-35: Map purposes to the most sensitive undismissed scope key
  function getScopeKeyForPurposes(purposes: string[]): ScopeKey | null {
    if (purposes.includes("gmail_send") && !dismissedScopes.has("google.gmail.send"))
      return "google.gmail.send";
    if (purposes.includes("email_scraping") && !dismissedScopes.has("google.gmail.readonly"))
      return "google.gmail.readonly";
    if (purposes.includes("calendar_sync") && !dismissedScopes.has("google.calendar"))
      return "google.calendar";
    return null;
  }

  // P-35: Intercept any OAuth redirect with a consent modal if needed
  function withScopeConsent(
    purposes: string[],
    accountEmail: string | undefined,
    proceed: () => void
  ) {
    const scopeKey = getScopeKeyForPurposes(purposes);
    if (!scopeKey) { proceed(); return; }
    setPendingConsent({ scopeKey, accountEmail, onConfirm: proceed });
  }

  function handleConnect(purposes: string[], displayName: string) {
    withScopeConsent(purposes, undefined, () => {
      getConnectUrlMutation.mutate({
        provider: "google",
        purposes: purposes as any,
        origin: window.location.origin,
        returnPath: "/settings?tab=integrations",
        displayName: displayName || undefined,
      });
    });
  }
  function handleSavePurposes(purposes: string[], displayName: string) {
    if (!editingAccount) return;
    updatePurposesMutation.mutate({
      tokenId: editingAccount.id,
      purposes: purposes as any,
      displayName: displayName || null,
    });
  }
  function handleReconnect(accountEmail: string) {
    const account = accounts.find(a => a.accountEmail === accountEmail);
    const purposes = account?.purposes ?? ["calendar_sync"];
    withScopeConsent(purposes, accountEmail, () => {
      getReconnectUrlMutation.mutate({
        accountEmail,
        origin: window.location.origin,
        returnPath: "/settings?tab=integrations",
      });
    });
  }
  function handleEmailReconnect(accountEmail: string) {
    withScopeConsent(["email_scraping"], accountEmail, () => {
      getEmailReconnectUrlMutation.mutate({
        accountEmail,
        origin: window.location.origin,
        returnPath: "/settings?tab=integrations",
      });
    });
  }

  // All accounts that need any kind of reconnect (expired/revoked OR missing gmail scope)
  const needsReconnect = accounts.filter(a => a.health !== "connected");
  // The reconnect sequence has one OAuth step per unique Google account that needs fixing.
  // Multiple property platforms sharing the same notification email = 1 OAuth step, not N.
  const allBrokenEmails = new Set([
    ...needsReconnect.map(a => a.accountEmail),
    ...emailWarnings.map((w: any) => w.notificationEmail),
  ]);
  // oauthStepCount = number of OAuth consent screens the user will go through
  const oauthStepCount = allBrokenEmails.size;

  return (
    <div className="space-y-6">
      {/* Edit purposes dialog */}
      {editingAccount && (
        <EditPurposesDialog
          account={editingAccount}
          onSave={handleSavePurposes}
          onClose={() => setEditingAccount(null)}
        />
      )}
      {/* Reconnect sequence modal */}
      {showReconnectModal && (
        <ReconnectSequenceModal
          onClose={() => setShowReconnectModal(false)}
          onAllDone={() => {
            setShowReconnectModal(false);
            utils.integrations.getUnifiedHealth.invalidate();
            utils.integrations.list.invalidate();
            toast.success("All accounts reconnected — sync is active");
          }}
        />
      )}
      {/* P-35: Scope consent modal — shown before any OAuth redirect */}
      {pendingConsent && (
        <ScopeConsentModal
          open={!!pendingConsent}
          scopeKey={pendingConsent.scopeKey}
          accountEmail={pendingConsent.accountEmail}
          onConfirm={(doNotShowAgain) => {
            if (doNotShowAgain) {
              dismissConsentMutation.mutate({ scopeKey: pendingConsent.scopeKey });
            }
            const proceed = pendingConsent.onConfirm;
            setPendingConsent(null);
            proceed();
          }}
          onCancel={() => setPendingConsent(null)}
        />
      )}

      {/* ── Attention banner ─────────────────────────────────────────────────── */}
      {totalIssues > 0 && (
        <div className="flex items-center gap-4 p-4 rounded-lg border border-amber-500/40 bg-amber-500/10">
          <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
              {totalIssues === 1 ? "1 integration needs attention" : `${totalIssues} integrations need attention`}
            </p>
            <p className="text-xs text-amber-600/80 dark:text-amber-400/70 mt-0.5">
              {needsReconnect.map(a => a.displayName || a.accountEmail).join(", ")}
              {emailWarnings.length > 0 && needsReconnect.length > 0 && " · "}
              {emailWarnings.length > 0 && `${emailWarnings.length} email scraping issue${emailWarnings.length > 1 ? "s" : ""}`}
            </p>
          </div>
          {oauthStepCount > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="flex-shrink-0 border-amber-500/50 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10"
              onClick={() => setShowReconnectModal(true)}
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              {oauthStepCount === 1
                ? "Reconnect (1 account)"
                : `Reconnect All (${oauthStepCount} accounts)`}
            </Button>
          )}
        </div>
      )}

      {/* ── Connected Accounts ───────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Plug className="h-5 w-5" />
                Connected Accounts
              </CardTitle>
              <CardDescription className="mt-1">
                Connect external accounts to Geeves. Each account can serve one or more purposes — only the permissions required for your chosen purposes will be requested.
              </CardDescription>
            </div>
            <AddAccountDialog onConnect={handleConnect} />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {healthQuery.isLoading ? (
            <div className="space-y-3">
              {[1, 2].map(i => (
                <div key={i} className="h-20 bg-muted rounded-lg animate-pulse" />
              ))}
            </div>
          ) : accounts.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Plug className="h-8 w-8 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">No accounts connected</p>
              <p className="text-xs mt-1">Connect a Google account to get started.</p>
            </div>
          ) : (
            accounts.map(account => {
              const purposes = account.purposes || [];
              const isExpiredOrRevoked = account.health === "expired";
              const needsEmailReconnect = account.needsEmailReconnect;
              const healthColor =
                account.health === "connected" ? "bg-green-500" :
                account.health === "needs_attention" ? "bg-amber-500" :
                "bg-red-500";
              const healthTitle =
                account.health === "connected" ? "Connected" :
                account.health === "needs_attention" ? "Needs attention — missing permissions" :
                "Expired or revoked — reconnect required";

              return (
                <div
                  key={account.id}
                  className={`flex items-start gap-4 p-4 border rounded-lg bg-card ${
                    isExpiredOrRevoked ? "border-destructive/40" :
                    needsEmailReconnect ? "border-amber-500/40" : ""
                  }`}
                >
                  {/* Google icon with health dot */}
                  <div className="relative flex-shrink-0 mt-0.5">
                    <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">
                      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                      </svg>
                    </div>
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background ${healthColor}`}
                      title={healthTitle}
                    />
                  </div>

                  {/* Account info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium truncate">{account.accountEmail}</span>
                      {account.displayName && (
                        <Badge variant="outline" className="text-xs">{account.displayName}</Badge>
                      )}
                      {/* Health badge */}
                      {account.health === "connected" ? (
                        <Badge className="text-xs bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30 hover:bg-green-500/15">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Connected
                        </Badge>
                      ) : account.health === "needs_attention" ? (
                        <Badge variant="outline" className="text-xs border-amber-500/60 text-amber-600 dark:text-amber-400 bg-amber-500/10">
                          <AlertCircle className="h-3 w-3 mr-1" />
                          Needs Attention
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="text-xs">
                          <AlertCircle className="h-3 w-3 mr-1" />
                          Expired
                        </Badge>
                      )}
                    </div>

                    {/* Purpose badges */}
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {purposes.length === 0 ? (
                        <span className="text-xs text-muted-foreground italic">No purposes assigned</span>
                      ) : (
                        purposes.map(p => {
                          const meta = PURPOSE_META[p];
                          if (!meta) return null;
                          return (
                            <span
                              key={p}
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border font-medium ${meta.color}`}
                            >
                              {meta.icon}
                              {meta.label}
                            </span>
                          );
                        })
                      )}
                    </div>

                    {/* Email scraping sub-warning */}
                    {needsEmailReconnect && account.health === "needs_attention" && (
                      <div className="flex items-center gap-1.5 mt-2 text-xs text-amber-600 dark:text-amber-400">
                        <Mail className="h-3 w-3 flex-shrink-0" />
                        <span>Missing <code className="font-mono text-xs">gmail.readonly</code> permission — reconnect to grant email access</span>
                      </div>
                    )}

                    {account.lastRefreshedAt && (
                      <p className="text-xs text-muted-foreground mt-1.5">
                        Last refreshed {new Date(account.lastRefreshedAt).toLocaleDateString()}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {/* Reconnect button — shown for expired/revoked OR missing-scope accounts */}
                    {(isExpiredOrRevoked || needsEmailReconnect) && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs border-amber-500/50 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10"
                        title="Reconnect this account — all settings preserved"
                        onClick={() => needsEmailReconnect && !isExpiredOrRevoked
                          ? handleEmailReconnect(account.accountEmail)
                          : handleReconnect(account.accountEmail)
                        }
                        disabled={getReconnectUrlMutation.isPending || getEmailReconnectUrlMutation.isPending}
                      >
                        {(getReconnectUrlMutation.isPending || getEmailReconnectUrlMutation.isPending) ? (
                          <RefreshCw className="h-3 w-3 animate-spin mr-1" />
                        ) : (
                          <RotateCcw className="h-3 w-3 mr-1" />
                        )}
                        Reconnect
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      title="Edit purposes"
                      onClick={() => setEditingAccount(account)}
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          title="Disconnect account"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Disconnect Account</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will revoke Geeves' access to <strong>{account.accountEmail}</strong>. Any calendars from this account will stop syncing but won't be deleted.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => removeMutation.mutate({ tokenId: account.id })}
                          >
                            Disconnect
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* ── Email Scraping Issues ─────────────────────────────────────────────── */}
      {emailWarnings.length > 0 && (
        <Card className="border-amber-500/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <Mail className="h-4 w-4" />
              Email Scraping Issues
            </CardTitle>
            <CardDescription>
              The following property platforms need Gmail access to import booking confirmations from email.
              Reconnect the affected account to grant <code className="text-xs font-mono">gmail.readonly</code> permission.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {emailWarnings.map((w: any) => (
              <div
                key={w.platformId}
                className="flex items-center gap-3 p-3 rounded-lg border border-amber-500/30 bg-amber-500/5"
              >
                <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">
                    {w.propertyName} — <span className="capitalize">{w.platform.replace("_", ".")}</span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Account: <span className="font-mono">{w.notificationEmail}</span>
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-shrink-0 h-8 text-xs border-amber-500/50 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10"
                  onClick={() => handleEmailReconnect(w.notificationEmail)}
                  disabled={getEmailReconnectUrlMutation.isPending}
                >
                  {getEmailReconnectUrlMutation.isPending ? (
                    <RefreshCw className="h-3 w-3 animate-spin mr-1" />
                  ) : (
                    <RotateCcw className="h-3 w-3 mr-1" />
                  )}
                  Reconnect
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ── Purpose reference card ────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Info className="h-4 w-4" />
            About Purposes & Permissions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            {ALL_PURPOSES.map(p => {
              const meta = PURPOSE_META[p];
              return (
                <div key={p} className="flex items-start gap-3 p-3 rounded-lg bg-muted/40">
                  <span className={`mt-0.5 flex-shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-full border ${meta.color}`}>
                    {meta.icon}
                  </span>
                  <div>
                    <p className="text-sm font-medium">{meta.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{meta.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground mt-4">
            <AlertTriangle className="h-3.5 w-3.5 inline mr-1" />
            Changing purposes on an existing account updates the metadata only. If you add a purpose that requires new permissions not yet granted, you'll need to reconnect the account to re-authorise with the expanded scope.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Subscription Tab ─────────────────────────────────────────────────────────

function SubscriptionTab({ householdId }: { householdId?: string }) {
  const householdQuery = trpc.household.getMyHousehold.useQuery();
  const household = householdQuery.data?.household;

  // Subscription is now returned directly from getMyHousehold
  const sub = householdQuery.data?.subscription;

  const planLabel = sub?.plan === "premium" ? "Premium" : sub?.plan === "free" ? "Free" : "Trialing";
  const statusLabel = sub?.status === "active" ? "Active" : sub?.status === "trialing" ? "Trial" : sub?.status === "past_due" ? "Past Due" : sub?.status === "cancelled" ? "Cancelled" : "Unknown";
  const statusColor = sub?.status === "active" ? "text-primary" : sub?.status === "trialing" ? "text-amber-400" : sub?.status === "past_due" ? "text-red-400" : "text-muted-foreground";
  const seatsUsed = sub?.seatsUsed ?? 1;
  const seatsIncluded = sub?.seatsIncluded ?? 5;
  const additionalSeats = sub?.additionalSeats ?? 0;
  const totalSeats = seatsIncluded + additionalSeats;

  const periodEnd = sub?.currentPeriodEnd ? new Date(sub.currentPeriodEnd).toLocaleDateString() : null;

  if (householdQuery.isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-32 bg-muted rounded animate-pulse" />
        <div className="h-24 bg-muted rounded animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Plan Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-teal-400" />
            Current Plan
          </CardTitle>
          <CardDescription>Your Geeves.Life subscription details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {sub?.plan === "premium" ? (
                <Star className="h-8 w-8 text-amber-400" />
              ) : (
                <Zap className="h-8 w-8 text-teal-400" />
              )}
              <div>
                <p className="text-xl font-bold">{planLabel}</p>
                <p className={`text-sm font-medium ${statusColor}`}>{statusLabel}</p>
              </div>
            </div>
            {periodEnd && (
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Period ends</p>
                <p className="text-sm font-medium">{periodEnd}</p>
              </div>
            )}
          </div>

          {sub?.plan !== "premium" && (
            <div className="rounded-lg border border-teal-500/30 bg-teal-500/5 p-4">
              <p className="text-sm font-medium text-teal-400 flex items-center gap-2">
                <Star className="h-4 w-4" />
                Upgrade to Premium
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Unlock unlimited seats, advanced access controls, and priority support.
                Contact us at <span className="text-teal-400">hello@geeves.life</span> to upgrade.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Seats */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-teal-400" />
            Constellation Seats
          </CardTitle>
          <CardDescription>Members who can access your Geeves.Life constellation</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Seats used</span>
            <span className="text-sm font-medium">{seatsUsed} / {totalSeats}</span>
          </div>
          <div className="w-full bg-muted rounded-full h-2">
            <div
              className="bg-teal-500 h-2 rounded-full transition-all"
              style={{ width: `${Math.min(100, (seatsUsed / Math.max(totalSeats, 1)) * 100)}%` }}
            />
          </div>
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground">Included seats</p>
              <p className="text-lg font-bold">{seatsIncluded}</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground">Additional seats</p>
              <p className="text-lg font-bold">{additionalSeats}</p>
            </div>
          </div>
          {seatsUsed >= totalSeats && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
              <p className="text-xs text-amber-400 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" />
                You've reached your seat limit. Contact us to add more seats.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add-ons */}
      {Array.isArray(sub?.addOns) && (sub.addOns as string[]).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-teal-400" />
              Active Add-ons
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {(sub.addOns as string[]).map((addon: string) => (
                <Badge key={addon} variant="secondary" className="capitalize">
                  {addon.replace(/_/g, " ")}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Billing Contact */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-teal-400" />
            Billing
          </CardTitle>
          <CardDescription>Billing and subscription management</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {sub?.stripeCustomerId ? (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Stripe Customer ID</span>
              <code className="text-xs bg-muted px-2 py-1 rounded">{sub.stripeCustomerId}</code>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No billing account linked yet. Contact <span className="text-teal-400">hello@geeves.life</span> to set up billing.
            </p>
          )}
          <div className="pt-2 border-t border-border">
            <p className="text-xs text-muted-foreground">
              <Info className="h-3.5 w-3.5 inline mr-1" />
              To change your plan, add seats, or manage billing, email us at{" "}
              <a href="mailto:hello@geeves.life" className="text-teal-400 hover:underline">
                hello@geeves.life
              </a>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


// ─── Notification Settings Tab ───────────────────────────────────────────────

function NotificationSettingsTab() {
  const { data, isLoading } = trpc.notificationSettings.getAll.useQuery();
  const utils = trpc.useUtils();
  const updateMutation = trpc.notificationSettings.update.useMutation({
    onSuccess: () => {
      utils.notificationSettings.getAll.invalidate();
      toast.success("Notification setting updated");
    },
    onError: (err) => toast.error(err.message),
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-2 text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Loading notification settings...
          </div>
        </CardContent>
      </Card>
    );
  }

  const settings = data?.settings || [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notification Cooldowns
          </CardTitle>
          <CardDescription>
            Control how often each notification type can fire. Set a cooldown period to prevent repeated alerts from flooding your inbox. Set to 0 to receive every notification, or disable entirely with the toggle.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {settings.map((setting: any) => (
            <div key={setting.key} className="flex flex-col gap-3 p-4 rounded-lg border border-border/50 bg-muted/20">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-medium">{setting.label}</h4>
                    {!setting.enabled && (
                      <Badge variant="secondary" className="text-xs">Disabled</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{setting.description}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className={`h-8 w-8 p-0 ${setting.enabled ? "text-emerald-500" : "text-muted-foreground"}`}
                  onClick={() => updateMutation.mutate({ key: setting.key, enabled: !setting.enabled })}
                  disabled={updateMutation.isPending}
                >
                  {setting.enabled ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
                </Button>
              </div>
              {setting.enabled && (
                <div className="flex items-center gap-4">
                  <span className="text-xs text-muted-foreground w-24 shrink-0">
                    Cooldown:
                  </span>
                  <div className="flex-1 flex items-center gap-3">
                    <input
                      type="range"
                      min={0}
                      max={72}
                      step={1}
                      value={setting.cooldownHours}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        updateMutation.mutate({ key: setting.key, cooldownHours: val });
                      }}
                      className="flex-1 h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                    />
                    <span className="text-sm font-mono w-16 text-right">
                      {setting.cooldownHours === 0
                        ? "Always"
                        : setting.cooldownHours === 1
                        ? "1 hr"
                        : `${setting.cooldownHours} hrs`}
                    </span>
                  </div>
                </div>
              )}
            </div>
          ))}
          {settings.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              No notification settings configured yet. They will appear here after the first notification fires.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">How Cooldowns Work</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="text-xs text-muted-foreground space-y-1.5 list-disc list-inside">
            <li><strong>0 hours (Always)</strong> — Every occurrence sends a notification immediately</li>
            <li><strong>6 hours (default)</strong> — After the first alert, suppress duplicates for 6 hours</li>
            <li><strong>24 hours</strong> — At most one notification per day for this type</li>
            <li><strong>72 hours</strong> — Maximum cooldown; one notification every 3 days</li>
            <li><strong>Disabled</strong> — No notifications of this type will be sent at all</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
