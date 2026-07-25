import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Shield, Eye, EyeOff, Lock, Users, DollarSign, UserX, Wrench, Info, Calendar, ChevronDown, ChevronUp } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
type AccessLevel = "full" | "read_only" | "blind" | "none";
type CalendarAccess = "availability_only" | "default_vertical" | "blind" | "read_write";
type DataCategory = "financial" | "private" | "guest_pii" | "operational";

const ACCESS_LEVEL_LABELS: Record<AccessLevel, { label: string; color: string; icon: React.ReactNode }> = {
  full:      { label: "Full Access",  color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", icon: <Eye className="w-3 h-3" /> },
  read_only: { label: "Read Only",    color: "bg-blue-500/20 text-blue-400 border-blue-500/30",          icon: <Eye className="w-3 h-3" /> },
  blind:     { label: "Blind",        color: "bg-amber-500/20 text-amber-400 border-amber-500/30",       icon: <EyeOff className="w-3 h-3" /> },
  none:      { label: "No Access",    color: "bg-red-500/20 text-red-400 border-red-500/30",             icon: <Lock className="w-3 h-3" /> },
};

const CALENDAR_ACCESS_LABELS: Record<CalendarAccess, string> = {
  availability_only: "Availability Only",
  default_vertical:  "Default (Vertical Rules)",
  blind:             "Blind (Time Blocks)",
  read_write:        "Read + Write",
};

const DATA_CATEGORY_INFO: Record<DataCategory, { label: string; icon: React.ReactNode; description: string }> = {
  financial:   { label: "Financial",   icon: <DollarSign className="w-4 h-4" />, description: "Revenue, commission, net payout, pricing" },
  private:     { label: "Private",     icon: <Lock className="w-4 h-4" />,       description: "Private notes, owner-only fields" },
  guest_pii:   { label: "Guest PII",   icon: <UserX className="w-4 h-4" />,      description: "Guest names, contact details, booking refs" },
  operational: { label: "Operational", icon: <Wrench className="w-4 h-4" />,     description: "Prep rules, cleaning schedules, maintenance" },
};

// ─── Main Component ───────────────────────────────────────────────────────────
export default function VerticalAccessMatrix() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.household.verticalAccess.getMatrix.useQuery();

  // Fetch all calendars for per-calendar picker
  const { data: allCalendars = [] } = trpc.calendar.list.useQuery(undefined, { enabled: !!data });

  const upsertAccessMutation = trpc.household.verticalAccess.upsertMemberAccess.useMutation({
    onSuccess: () => { utils.household.verticalAccess.getMatrix.invalidate(); toast.success("Access rule saved"); },
    onError: (e) => toast.error(e.message),
  });
  const removeAccessMutation = trpc.household.verticalAccess.removeMemberAccess.useMutation({
    onSuccess: () => { utils.household.verticalAccess.getMatrix.invalidate(); toast.success("Access rule removed"); },
    onError: (e) => toast.error(e.message),
  });
  const upsertPolicyMutation = trpc.household.verticalAccess.upsertDataPolicy.useMutation({
    onSuccess: () => { utils.household.verticalAccess.getMatrix.invalidate(); toast.success("Data policy saved"); },
    onError: (e) => toast.error(e.message),
  });

  const [selectedVertical, setSelectedVertical] = useState<string | null>(null);
  // Track which member rows have the calendar picker expanded
  const [expandedCalPicker, setExpandedCalPicker] = useState<Set<string>>(new Set());

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">Loading access matrix…</div>
        </div>
      </DashboardLayout>
    );
  }

  const { accessRules = [], dataPolicies = [], members = [], verticals = [] } = data ?? {};

  // Filter to non-admin members (admins always have full access)
  const restrictableMembers = members.filter(m =>
    m.status === "active" || m.status === "invited"
  );

  const activeVertical = selectedVertical
    ? verticals.find(v => v.id === selectedVertical)
    : verticals[0];

  // Calendars belonging to the active vertical
  const verticalCalendars = activeVertical
    ? (allCalendars as any[]).filter((c: any) => c.verticalId === activeVertical.id)
    : [];

  function getAccessRule(memberId: string, verticalId: string) {
    return accessRules.find(r => r.memberId === memberId && r.verticalId === verticalId);
  }

  function getDataPolicy(verticalId: string, category: DataCategory) {
    return dataPolicies.find(p => p.verticalId === verticalId && p.dataCategory === category);
  }

  /** Shared helper — fires upsertMemberAccess with all current values merged with the patch */
  function upsertRule(
    memberId: string,
    verticalId: string,
    patch: Partial<{
      accessLevel: AccessLevel;
      calendarAccess: CalendarAccess;
      allowedCalendarIds: string[];
      canRequestMeetings: boolean;
      excludeMultiDayEvents: boolean;
    }>
  ) {
    const existing = getAccessRule(memberId, verticalId);
    upsertAccessMutation.mutate({
      memberId,
      verticalId,
      accessLevel:          patch.accessLevel          ?? (existing?.accessLevel          as AccessLevel)  ?? "read_only",
      calendarAccess:       patch.calendarAccess       ?? (existing?.calendarAccess       as CalendarAccess) ?? "default_vertical",
      allowedCalendarIds:   patch.allowedCalendarIds   ?? (existing?.allowedCalendarIds   as string[])     ?? [],
      canRequestMeetings:   patch.canRequestMeetings   ?? existing?.canRequestMeetings                     ?? true,
      excludeMultiDayEvents: patch.excludeMultiDayEvents ?? (existing as any)?.excludeMultiDayEvents       ?? false,
    });
  }

  function toggleCalendarId(memberId: string, verticalId: string, calId: string, checked: boolean) {
    const existing = getAccessRule(memberId, verticalId);
    const current = (existing?.allowedCalendarIds as string[]) ?? [];
    const updated = checked
      ? Array.from(new Set([...current, calId]))
      : current.filter(id => id !== calId);
    upsertRule(memberId, verticalId, { allowedCalendarIds: updated });
  }

  function handleDataPolicyToggleMember(verticalId: string, category: DataCategory, memberId: string, hidden: boolean) {
    const existing = getDataPolicy(verticalId, category);
    const currentHiddenMembers = (existing?.hiddenFromMemberIds as string[]) ?? [];
    const newHiddenMembers = hidden
      ? Array.from(new Set([...currentHiddenMembers, memberId]))
      : currentHiddenMembers.filter(id => id !== memberId);
    upsertPolicyMutation.mutate({
      verticalId,
      dataCategory: category,
      hiddenFromRoles: (existing?.hiddenFromRoles as string[]) ?? [],
      hiddenFromMemberIds: newHiddenMembers,
    });
  }

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-teal-500/10 border border-teal-500/20">
            <Shield className="w-5 h-5 text-teal-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Vertical Access Control</h1>
            <p className="text-sm text-muted-foreground">
              Control what each constellation member can see and do within each vertical
            </p>
          </div>
        </div>

        {/* Info banner */}
        <div className="flex items-start gap-3 p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
          <Info className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
          <p className="text-sm text-blue-300">
            <strong>Household Admins</strong> always have full access to all verticals.
            Rules here apply to <strong>members, caregivers, children, and elders</strong> only.
            Changes take effect immediately on the next data request.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Vertical selector sidebar */}
          <div className="lg:col-span-1 space-y-2">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider px-1">Verticals</h2>
            {verticals.map(v => (
              <button
                key={v.id}
                onClick={() => setSelectedVertical(v.id)}
                className={`w-full text-left px-3 py-2.5 rounded-lg border transition-all ${
                  (activeVertical?.id === v.id)
                    ? "bg-teal-500/10 border-teal-500/40 text-teal-300"
                    : "bg-card border-border text-foreground hover:border-teal-500/30"
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: v.color ?? "#10b981" }} />
                  <span className="text-sm font-medium truncate">{v.name}</span>
                </div>
              </button>
            ))}
          </div>

          {/* Main panel */}
          <div className="lg:col-span-3 space-y-6">
            {activeVertical ? (
              <>
                {/* Member Access Matrix */}
                <Card className="bg-card border-border">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Users className="w-4 h-4 text-teal-400" />
                      Member Access — {activeVertical.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {restrictableMembers.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No members to configure yet.</p>
                    ) : (
                      <div className="space-y-4">
                        {restrictableMembers.map(member => {
                          const rule = getAccessRule(member.id, activeVertical.id);
                          const accessLevel = (rule?.accessLevel ?? "full") as AccessLevel;
                          const calendarAccess = (rule?.calendarAccess ?? "default_vertical") as CalendarAccess;
                          const canRequestMeetings = rule?.canRequestMeetings ?? true;
                          const excludeMultiDayEvents = (rule as any)?.excludeMultiDayEvents ?? false;
                          const allowedCalendarIds = (rule?.allowedCalendarIds as string[]) ?? [];
                          const levelInfo = ACCESS_LEVEL_LABELS[accessLevel];
                          const calPickerKey = `${member.id}:${activeVertical.id}`;
                          const isCalPickerOpen = expandedCalPicker.has(calPickerKey);

                          return (
                            <div key={member.id} className="p-4 rounded-lg bg-background/50 border border-border space-y-3">
                              {/* Member header */}
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-full bg-teal-500/20 flex items-center justify-center text-teal-400 text-sm font-semibold">
                                    {member.displayName.charAt(0).toUpperCase()}
                                  </div>
                                  <div>
                                    <p className="text-sm font-medium text-foreground">{member.displayName}</p>
                                    <p className="text-xs text-muted-foreground capitalize">{member.role.replace("_", " ")} · {member.status}</p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Badge className={`text-xs border ${levelInfo.color}`}>
                                    {levelInfo.icon}
                                    <span className="ml-1">{levelInfo.label}</span>
                                  </Badge>
                                  {rule && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 px-2"
                                      onClick={() => removeAccessMutation.mutate({ memberId: member.id, verticalId: activeVertical.id })}
                                    >
                                      Reset
                                    </Button>
                                  )}
                                </div>
                              </div>

                              {/* Access controls */}
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                  <Label className="text-xs text-muted-foreground">Vertical Access Level</Label>
                                  <Select
                                    value={accessLevel}
                                    onValueChange={(v) => upsertRule(member.id, activeVertical.id, { accessLevel: v as AccessLevel })}
                                  >
                                    <SelectTrigger className="h-8 text-xs bg-background">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="full">Full Access</SelectItem>
                                      <SelectItem value="read_only">Read Only</SelectItem>
                                      <SelectItem value="blind">Blind (Time Blocks Only)</SelectItem>
                                      <SelectItem value="none">No Access</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>

                                <div className="space-y-1.5">
                                  <Label className="text-xs text-muted-foreground">Calendar Access Type</Label>
                                  <Select
                                    value={calendarAccess}
                                    onValueChange={(v) => upsertRule(member.id, activeVertical.id, { calendarAccess: v as CalendarAccess })}
                                  >
                                    <SelectTrigger className="h-8 text-xs bg-background">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="availability_only">Availability Only (iCal/Property)</SelectItem>
                                      <SelectItem value="default_vertical">Default (Vertical Rules)</SelectItem>
                                      <SelectItem value="blind">Blind (All Events as Blocks)</SelectItem>
                                      <SelectItem value="read_write">Read + Write</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>

                              {/* Toggles row */}
                              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-1">
                                <div className="flex items-center gap-2">
                                  <Switch
                                    id={`meetings-${member.id}`}
                                    checked={canRequestMeetings}
                                    onCheckedChange={(v) => upsertRule(member.id, activeVertical.id, { canRequestMeetings: v })}
                                  />
                                  <Label htmlFor={`meetings-${member.id}`} className="text-xs text-muted-foreground cursor-pointer">
                                    Can request meetings
                                  </Label>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Switch
                                    id={`multiday-${member.id}`}
                                    checked={excludeMultiDayEvents}
                                    onCheckedChange={(v) => upsertRule(member.id, activeVertical.id, { excludeMultiDayEvents: v })}
                                  />
                                  <Label htmlFor={`multiday-${member.id}`} className="text-xs text-muted-foreground cursor-pointer">
                                    Exclude multi-day events from shadow blocks
                                  </Label>
                                </div>
                              </div>

                              {/* Per-calendar picker — only shown when vertical has multiple calendars */}
                              {verticalCalendars.length > 1 && (
                                <div className="pt-1">
                                  <button
                                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                                    onClick={() => setExpandedCalPicker(prev => {
                                      const next = new Set(prev);
                                      if (next.has(calPickerKey)) next.delete(calPickerKey);
                                      else next.add(calPickerKey);
                                      return next;
                                    })}
                                  >
                                    <Calendar className="w-3.5 h-3.5" />
                                    <span>
                                      {allowedCalendarIds.length === 0
                                        ? `All ${verticalCalendars.length} calendars visible`
                                        : `${allowedCalendarIds.length} of ${verticalCalendars.length} calendars selected`}
                                    </span>
                                    {isCalPickerOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                  </button>
                                  {isCalPickerOpen && (
                                    <div className="mt-2 p-3 rounded-lg bg-background border border-border space-y-2">
                                      <p className="text-xs text-muted-foreground">
                                        Leave all unchecked to allow access to all calendars in this vertical. Check specific ones to restrict access.
                                      </p>
                                      {verticalCalendars.map((cal: any) => {
                                        const isChecked = allowedCalendarIds.includes(cal.id);
                                        return (
                                          <div key={cal.id} className="flex items-center gap-2">
                                            <Checkbox
                                              id={`cal-${member.id}-${cal.id}`}
                                              checked={isChecked}
                                              onCheckedChange={(v) => toggleCalendarId(member.id, activeVertical.id, cal.id, !!v)}
                                            />
                                            <Label htmlFor={`cal-${member.id}-${cal.id}`} className="text-xs cursor-pointer">
                                              {cal.name}
                                              {cal.externalId && (
                                                <span className="ml-1 text-muted-foreground/60">(Google)</span>
                                              )}
                                            </Label>
                                          </div>
                                        );
                                      })}
                                      {allowedCalendarIds.length > 0 && (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="text-xs h-6 px-2 text-muted-foreground"
                                          onClick={() => upsertRule(member.id, activeVertical.id, { allowedCalendarIds: [] })}
                                        >
                                          Clear (allow all)
                                        </Button>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Data Policies */}
                <Card className="bg-card border-border">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Shield className="w-4 h-4 text-amber-400" />
                      Data Visibility Policies — {activeVertical.name}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                      Toggle which data categories are hidden from specific members in this vertical.
                    </p>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {(Object.keys(DATA_CATEGORY_INFO) as DataCategory[]).map(category => {
                        const info = DATA_CATEGORY_INFO[category];
                        const policy = getDataPolicy(activeVertical.id, category);
                        const hiddenMembers = (policy?.hiddenFromMemberIds as string[]) ?? [];

                        return (
                          <div key={category} className="p-4 rounded-lg bg-background/50 border border-border">
                            <div className="flex items-center gap-2 mb-3">
                              <span className="text-amber-400">{info.icon}</span>
                              <div>
                                <p className="text-sm font-medium text-foreground">{info.label}</p>
                                <p className="text-xs text-muted-foreground">{info.description}</p>
                              </div>
                            </div>
                            <div className="space-y-2">
                              {restrictableMembers.map(member => {
                                const isHidden = hiddenMembers.includes(member.id);
                                return (
                                  <div key={member.id} className="flex items-center justify-between py-1">
                                    <span className="text-xs text-muted-foreground">{member.displayName}</span>
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs text-muted-foreground">
                                        {isHidden ? "Hidden" : "Visible"}
                                      </span>
                                      <Switch
                                        checked={isHidden}
                                        onCheckedChange={(v) => handleDataPolicyToggleMember(activeVertical.id, category, member.id, v)}
                                      />
                                    </div>
                                  </div>
                                );
                              })}
                              {restrictableMembers.length === 0 && (
                                <p className="text-xs text-muted-foreground">No members to configure.</p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              </>
            ) : (
              <div className="flex items-center justify-center h-64 text-muted-foreground">
                No verticals found. Create a vertical first.
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
