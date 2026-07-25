import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Shield, ChevronDown, ChevronRight, Eye, EyeOff, Info, RotateCcw, Lock } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

const ROLE_LABELS: Record<string, string> = {
  household_admin: "Household Admin",
  ea: "Executive Assistant",
  member: "Member",
  caregiver: "Caregiver",
  child: "Child",
  elder: "Elder",
};

const ACCESS_LEVEL_LABELS: Record<string, string> = {
  full: "Full Access",
  read_only: "Read Only",
  blind: "Blind (busy only)",
  none: "No Access",
};

const CALENDAR_ACCESS_LABELS: Record<string, string> = {
  availability_only: "Availability Only",
  default_vertical: "Default (Vertical Setting)",
  blind: "Blind (busy only)",
  read_write: "Read & Write",
};

const DATA_CATEGORY_LABELS: Record<string, { label: string; description: string }> = {
  financial: { label: "Financial Data", description: "Revenue, commissions, payouts, pricing" },
  private: { label: "Private Notes", description: "Personal notes and owner-only fields" },
  guest_pii: { label: "Guest Information", description: "Guest names, contact details, booking references" },
  operational: { label: "Operational Details", description: "Prep rules, cleaning schedules, maintenance notes" },
};

const ROLE_COLORS: Record<string, string> = {
  household_admin: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  ea: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  member: "bg-green-500/20 text-green-300 border-green-500/30",
  caregiver: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  child: "bg-pink-500/20 text-pink-300 border-pink-500/30",
  elder: "bg-amber-500/20 text-amber-300 border-amber-500/30",
};

export default function MemberPermissions() {
  const { user } = useAuth();
  const [selectedMemberId, setSelectedMemberId] = useState<string>("");
  const [selectedVerticalId, setSelectedVerticalId] = useState<string>("all");
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    household: true, calendar: true, bookings: true, content: false, admin: false,
  });

    // Get current user's effective permissions to check if they can access this page
  const { data: myPerms, isLoading: myPermsLoading } = trpc.accessControl.getMyEffectivePermissions.useQuery();
  // Get the matrix for the selected member
  const { data: matrix, isLoading, refetch } = trpc.accessControl.getMatrix.useQuery(
    {
      memberId: selectedMemberId,
      verticalId: selectedVerticalId === "all" ? undefined : selectedVerticalId,
    },
    { enabled: !!selectedMemberId }
  );

  const upsertOverride = trpc.accessControl.upsertPermissionOverride.useMutation({
    onSuccess: () => { refetch(); },
    onError: (err) => toast.error(err.message),
  });

  const removeOverride = trpc.accessControl.removePermissionOverride.useMutation({
    onSuccess: () => { refetch(); toast.success("Permission reset to role default"); },
    onError: (err) => toast.error(err.message),
  });

  const upsertVerticalAccess = trpc.accessControl.upsertVerticalAccess.useMutation({
    onSuccess: () => { refetch(); toast.success("Access rule updated"); },
    onError: (err) => toast.error(err.message),
  });

  const upsertDataPolicy = trpc.accessControl.upsertDataPolicy.useMutation({
    onSuccess: () => { refetch(); toast.success("Data policy updated"); },
    onError: (err) => toast.error(err.message),
  });

  const setEADelegation = trpc.accessControl.setEADelegation.useMutation({
    onSuccess: () => { refetch(); toast.success("EA delegation setting updated"); },
    onError: (err) => toast.error(err.message),
  });

  // Derive override map for quick lookup
  const overrideMap = useMemo(() => {
    const map: Record<string, boolean | null> = {};
    if (matrix?.overrides) {
      for (const o of matrix.overrides) {
        map[o.permission] = o.granted;
      }
    }
    return map;
  }, [matrix?.overrides]);

  // While permissions are loading, show a neutral loading state — never flash
  // "Access Restricted" before the server has responded (myPerms is undefined during load).
  if (myPermsLoading || myPerms === undefined) {
    return (
      <div className="container max-w-3xl py-12">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="animate-pulse text-muted-foreground text-sm">Loading permissions…</div>
        </div>
      </div>
    );
  }

  if (!myPerms.canManageAccess) {
    return (
      <div className="container max-w-3xl py-12">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
            <Lock className="w-8 h-8 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-semibold">Access Restricted</h2>
          <p className="text-muted-foreground max-w-sm">
            The household admin has restricted permission management to admins only.
            Contact your household admin to request access.
          </p>
        </div>
      </div>
    );
  }

  const handlePermissionToggle = (permission: string, currentEffective: boolean) => {
    const roleHasIt = matrix?.roleBaseline.includes(permission as any) ?? false;
    const override = overrideMap[permission];

    // Determine what the new state should be
    const newGranted = !currentEffective;

    // If the new state matches the role baseline, remove the override (revert to default)
    if (newGranted === roleHasIt && override !== undefined) {
      removeOverride.mutate({ memberId: selectedMemberId, permission });
    } else if (newGranted !== roleHasIt) {
      // Set an override
      upsertOverride.mutate({ memberId: selectedMemberId, permission, granted: newGranted });
    }
    // If newGranted === roleHasIt and no override exists, nothing to do
  };

  const handleResetPermission = (permission: string) => {
    removeOverride.mutate({ memberId: selectedMemberId, permission });
  };

  const toggleGroup = (group: string) => {
    setOpenGroups((prev) => ({ ...prev, [group]: !prev[group] }));
  };

  const getPermissionState = (permKey: string) => {
    const isEffective = matrix?.effectivePermissions.includes(permKey as any) ?? false;
    const isBaseline = matrix?.roleBaseline.includes(permKey as any) ?? false;
    const override = overrideMap[permKey];
    const hasOverride = override !== undefined;
    const overrideType = hasOverride ? (override ? "granted" : "revoked") : null;
    return { isEffective, isBaseline, hasOverride, overrideType };
  };

  const getVerticalAccessRule = (verticalId: string) => {
    return matrix?.accessRules.find((r: any) => r.verticalId === verticalId);
  };

  const getDataPolicy = (verticalId: string, category: string) => {
    return matrix?.dataPolicies.find((p: any) => p.verticalId === verticalId && p.dataCategory === category);
  };

  const isDataCategoryHiddenFromMember = (verticalId: string, category: string) => {
    if (!matrix?.targetMember) return false;
    const policy = getDataPolicy(verticalId, category);
    if (!policy) return false;
    const member = matrix.targetMember;
    if (policy.hiddenFromMemberIds?.includes(member.id)) return true;
    if (policy.hiddenFromRoles?.includes(member.role)) return true;
    return false;
  };

  const toggleDataCategoryForMember = (verticalId: string, category: string, currentlyHidden: boolean) => {
    if (!matrix?.targetMember) return;
    const policy = getDataPolicy(verticalId, category);
    const member = matrix.targetMember;
    const currentHiddenIds: string[] = policy?.hiddenFromMemberIds ?? [];
    const currentHiddenRoles: string[] = policy?.hiddenFromRoles ?? [];

    let newHiddenIds: string[];
    if (currentlyHidden) {
      // Unhide: remove from hiddenFromMemberIds
      newHiddenIds = currentHiddenIds.filter((id: string) => id !== member.id);
    } else {
      // Hide: add to hiddenFromMemberIds
      newHiddenIds = currentHiddenIds.includes(member.id) ? currentHiddenIds : [...currentHiddenIds, member.id];
    }

    upsertDataPolicy.mutate({
      verticalId,
      dataCategory: category as any,
      hiddenFromRoles: currentHiddenRoles,
      hiddenFromMemberIds: newHiddenIds,
    });
  };

  const verticalsToShow = useMemo(() => {
    if (!matrix) return [];
    if (selectedVerticalId !== "all") {
      return matrix.allVerticals.filter((v: any) => v.id === selectedVerticalId);
    }
    return matrix.allVerticals;
  }, [matrix, selectedVerticalId]);

  return (
    <TooltipProvider>
      <div className="container max-w-4xl py-6 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Shield className="w-6 h-6 text-primary" />
              Member Permissions
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Manage action permissions and data visibility for each household member.
            </p>
          </div>
          {/* EA Delegation toggle — HA only */}
          {myPerms?.role === "household_admin" && matrix && (
            <div className="flex items-center gap-3 bg-muted/50 rounded-lg px-4 py-2 border border-border">
              <div className="text-right">
                <p className="text-sm font-medium">EA Can Manage Permissions</p>
                <p className="text-xs text-muted-foreground">Allow EA to edit this page</p>
              </div>
              <Switch
                checked={matrix.eaCanManageAccess}
                onCheckedChange={(val) => setEADelegation.mutate({ eaCanManageAccess: val })}
              />
            </div>
          )}
        </div>

        {/* Selectors Row */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">Member</label>
            <Select value={selectedMemberId} onValueChange={setSelectedMemberId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a member…" />
              </SelectTrigger>
              <SelectContent>
                {(matrix?.allMembers ?? []).map((m: any) => (
                  <SelectItem key={m.id} value={m.id}>
                    <span className="flex items-center gap-2">
                      {m.displayName}
                      <span className={`text-xs px-1.5 py-0.5 rounded border ${ROLE_COLORS[m.role] ?? ""}`}>
                        {ROLE_LABELS[m.role] ?? m.role}
                      </span>
                    </span>
                  </SelectItem>
                ))}
                {!matrix && !isLoading && (
                  <SelectItem value="__placeholder__" disabled>Loading members…</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">Vertical Filter</label>
            <Select value={selectedVerticalId} onValueChange={setSelectedVerticalId}>
              <SelectTrigger>
                <SelectValue placeholder="All Verticals" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Verticals</SelectItem>
                {(matrix?.allVerticals ?? []).map((v: any) => (
                  <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Empty state */}
        {!selectedMemberId && (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <Shield className="w-12 h-12 text-muted-foreground/40" />
            <p className="text-muted-foreground">Select a member above to view and edit their permissions.</p>
          </div>
        )}

        {selectedMemberId && isLoading && (
          <div className="flex items-center justify-center py-16">
            <div className="animate-pulse text-muted-foreground text-sm">Loading permissions…</div>
          </div>
        )}

        {matrix && selectedMemberId && (
          <div className="space-y-6">
            {/* Member summary bar */}
            <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/40 border border-border">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-semibold text-sm">
                {matrix.targetMember.displayName.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium">{matrix.targetMember.displayName}</p>
                <p className="text-xs text-muted-foreground">{matrix.targetMember.email ?? "No email"}</p>
              </div>
              <Badge className={`${ROLE_COLORS[matrix.targetMember.role] ?? ""} border`}>
                {ROLE_LABELS[matrix.targetMember.role] ?? matrix.targetMember.role}
              </Badge>
              <Badge variant="outline" className="text-xs">
                {matrix.effectivePermissions.length} permissions
              </Badge>
            </div>

            {/* ── Section 1: Action Permissions ──────────────────────────── */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Shield className="w-4 h-4 text-primary" />
                  Action Permissions
                </CardTitle>
                <CardDescription>
                  Role baseline permissions, with per-member overrides. Overrides always take precedence.
                  {matrix.targetMember.role === "household_admin" && (
                    <span className="ml-2 text-amber-400">Household admin permissions cannot be overridden.</span>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {(matrix.permissionGroups as any[]).map((group) => {
                  // Filter permissions by vertical if a vertical is selected
                  const permsToShow = selectedVerticalId === "all"
                    ? group.permissions
                    : group.permissions.filter((p: any) => !p.globalOnly);

                  if (permsToShow.length === 0) return null;

                  return (
                    <Collapsible
                      key={group.group}
                      open={openGroups[group.group]}
                      onOpenChange={() => toggleGroup(group.group)}
                    >
                      <CollapsibleTrigger className="flex items-center justify-between w-full p-3 rounded-lg hover:bg-muted/50 transition-colors">
                        <div className="flex items-center gap-2">
                          {openGroups[group.group] ? (
                            <ChevronDown className="w-4 h-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-muted-foreground" />
                          )}
                          <span className="font-medium text-sm">{group.label}</span>
                          <span className="text-xs text-muted-foreground">— {group.description}</span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {permsToShow.filter((p: any) => getPermissionState(p.key).isEffective).length}/{permsToShow.length}
                        </span>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="ml-6 space-y-1 pb-2">
                          {permsToShow.map((perm: any) => {
                            const { isEffective, isBaseline, hasOverride, overrideType } = getPermissionState(perm.key);
                            const isAdmin = matrix.targetMember.role === "household_admin";

                            return (
                              <div
                                key={perm.key}
                                className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-muted/30 transition-colors"
                              >
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                  <span className="text-sm font-medium">{perm.label}</span>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help shrink-0" />
                                    </TooltipTrigger>
                                    <TooltipContent side="right" className="max-w-xs">
                                      <p className="text-xs">{perm.description}</p>
                                      <p className="text-xs text-muted-foreground mt-1">
                                        Role default: {isBaseline ? "✓ Granted" : "✗ Not granted"}
                                      </p>
                                    </TooltipContent>
                                  </Tooltip>
                                  {hasOverride && (
                                    <Badge
                                      variant="outline"
                                      className={`text-xs ml-1 ${overrideType === "granted" ? "border-green-500/50 text-green-400" : "border-red-500/50 text-red-400"}`}
                                    >
                                      {overrideType === "granted" ? "Override: Granted" : "Override: Revoked"}
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  {hasOverride && !isAdmin && (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                          onClick={() => handleResetPermission(perm.key)}
                                        >
                                          <RotateCcw className="w-3.5 h-3.5" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>Reset to role default</TooltipContent>
                                    </Tooltip>
                                  )}
                                  <Switch
                                    checked={isEffective}
                                    disabled={isAdmin}
                                    onCheckedChange={() => handlePermissionToggle(perm.key, isEffective)}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  );
                })}
              </CardContent>
            </Card>

            {/* ── Section 2: Data Visibility ──────────────────────────────── */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Eye className="w-4 h-4 text-primary" />
                  Data Visibility
                </CardTitle>
                <CardDescription>
                  Control what data categories and calendar events this member can see within each vertical.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {verticalsToShow.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    {selectedVerticalId === "all"
                      ? "No verticals configured for this household."
                      : "No access rules for this vertical yet."}
                  </p>
                )}
                {verticalsToShow.map((vertical: any) => {
                  const rule = getVerticalAccessRule(vertical.id);
                  return (
                    <div key={vertical.id} className="border border-border rounded-lg overflow-hidden">
                      {/* Vertical header */}
                      <div
                        className="flex items-center gap-3 px-4 py-3 bg-muted/30"
                        style={{ borderLeft: `3px solid ${vertical.color ?? "#6366f1"}` }}
                      >
                        <span className="text-lg">{vertical.icon ?? "📁"}</span>
                        <span className="font-medium text-sm">{vertical.name}</span>
                      </div>

                      <div className="p-4 space-y-4">
                        {/* Access Level */}
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                              Access Level
                            </label>
                            <Select
                              value={rule?.accessLevel ?? "none"}
                              onValueChange={(val) => {
                                upsertVerticalAccess.mutate({
                                  memberId: selectedMemberId,
                                  verticalId: vertical.id,
                                  accessLevel: val as any,
                                  calendarAccess: rule?.calendarAccess ?? "default_vertical",
                                  allowedCalendarIds: rule?.allowedCalendarIds ?? [],
                                  canRequestMeetings: rule?.canRequestMeetings ?? true,
                                  excludeMultiDayEvents: rule?.excludeMultiDayEvents ?? false,
                                });
                              }}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {Object.entries(ACCESS_LEVEL_LABELS).map(([val, label]) => (
                                  <SelectItem key={val} value={val} className="text-xs">{label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                              Calendar Access
                            </label>
                            <Select
                              value={rule?.calendarAccess ?? "default_vertical"}
                              onValueChange={(val) => {
                                upsertVerticalAccess.mutate({
                                  memberId: selectedMemberId,
                                  verticalId: vertical.id,
                                  accessLevel: rule?.accessLevel ?? "read_only",
                                  calendarAccess: val as any,
                                  allowedCalendarIds: rule?.allowedCalendarIds ?? [],
                                  canRequestMeetings: rule?.canRequestMeetings ?? true,
                                  excludeMultiDayEvents: rule?.excludeMultiDayEvents ?? false,
                                });
                              }}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {Object.entries(CALENDAR_ACCESS_LABELS).map(([val, label]) => (
                                  <SelectItem key={val} value={val} className="text-xs">{label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        {/* Toggles row */}
                        <div className="flex items-center gap-6">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <Switch
                              checked={rule?.canRequestMeetings ?? true}
                              onCheckedChange={(val) => {
                                upsertVerticalAccess.mutate({
                                  memberId: selectedMemberId,
                                  verticalId: vertical.id,
                                  accessLevel: rule?.accessLevel ?? "read_only",
                                  calendarAccess: rule?.calendarAccess ?? "default_vertical",
                                  allowedCalendarIds: rule?.allowedCalendarIds ?? [],
                                  canRequestMeetings: val,
                                  excludeMultiDayEvents: rule?.excludeMultiDayEvents ?? false,
                                });
                              }}
                            />
                            <span className="text-xs text-muted-foreground">Can Request Meetings</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <Switch
                              checked={rule?.excludeMultiDayEvents ?? false}
                              onCheckedChange={(val) => {
                                upsertVerticalAccess.mutate({
                                  memberId: selectedMemberId,
                                  verticalId: vertical.id,
                                  accessLevel: rule?.accessLevel ?? "read_only",
                                  calendarAccess: rule?.calendarAccess ?? "default_vertical",
                                  allowedCalendarIds: rule?.allowedCalendarIds ?? [],
                                  canRequestMeetings: rule?.canRequestMeetings ?? true,
                                  excludeMultiDayEvents: val,
                                });
                              }}
                            />
                            <span className="text-xs text-muted-foreground">Exclude Multi-Day Events</span>
                          </label>
                        </div>

                        <Separator />

                        {/* Data Categories */}
                        <div>
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                            Hidden Data Categories
                          </p>
                          <div className="grid grid-cols-2 gap-2">
                            {Object.entries(DATA_CATEGORY_LABELS).map(([cat, { label, description }]) => {
                              const hidden = isDataCategoryHiddenFromMember(vertical.id, cat);
                              return (
                                <label
                                  key={cat}
                                  className={`flex items-start gap-2.5 p-2.5 rounded-md border cursor-pointer transition-colors ${
                                    hidden
                                      ? "border-red-500/30 bg-red-500/5"
                                      : "border-border bg-transparent hover:bg-muted/30"
                                  }`}
                                >
                                  <Switch
                                    checked={hidden}
                                    onCheckedChange={() => toggleDataCategoryForMember(vertical.id, cat, hidden)}
                                    className="mt-0.5 shrink-0"
                                  />
                                  <div className="min-w-0">
                                    <p className="text-xs font-medium flex items-center gap-1">
                                      {hidden ? <EyeOff className="w-3 h-3 text-red-400" /> : <Eye className="w-3 h-3 text-muted-foreground" />}
                                      {label}
                                    </p>
                                    <p className="text-xs text-muted-foreground">{description}</p>
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
