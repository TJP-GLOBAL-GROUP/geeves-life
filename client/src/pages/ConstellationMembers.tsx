/**
 * ConstellationMembers — Unified Constellation Members Screen
 * ─────────────────────────────────────────────────────────────
 * Consolidates:
 *   • /family          — member profile data (clothing sizes, dietary, preferences, DOB)
 *   • /member-permissions — vertical access and permission overrides
 *
 * Access: household_admin and ea roles only.
 * EAs cannot edit the household_admin owner's card.
 *
 * Member detail sheet tabs:
 *   1. Info        — display name, role, pronouns, relationship, accessibility
 *   2. Profile     — DOB, phone numbers, clothing sizes, dietary restrictions, preferences
 *   3. Permissions — vertical access matrix + permission overrides (migrated from MemberPermissions)
 *   4. Resources   — [STUB] future: member-specific resources and views
 *   5. Comms       — [STUB] future: email, WhatsApp, Slack, video notes
 *   6. Activity    — [STUB] future: recent activity log
 */

import { useState, useMemo } from "react";
import { ResourcesWidget } from "@/components/ResourcesWidget";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import {
  Users, Plus, Shield, UserCheck, UserX, Trash2, ChevronDown, ChevronRight,
  Eye, EyeOff, Info, RotateCcw, Lock, Shirt, Utensils, Heart, Phone, Calendar,
  MessageSquare, Activity, Package, Star, AlertTriangle,
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// ─── Constants ────────────────────────────────────────────────────────────────
const ROLE_LABELS: Record<string, string> = {
  household_admin: "Household Admin",
  ea: "Executive Assistant",
  member: "Member",
  caregiver: "Caregiver",
  child: "Child",
  elder: "Elder",
};
const ROLE_COLORS: Record<string, string> = {
  household_admin: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  ea: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  member: "bg-green-500/20 text-green-300 border-green-500/30",
  caregiver: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  child: "bg-pink-500/20 text-pink-300 border-pink-500/30",
  elder: "bg-amber-500/20 text-amber-300 border-amber-500/30",
};
const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-500/20 text-green-300 border-green-500/30",
  invited: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  inactive: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  removed: "bg-red-500/20 text-red-300 border-red-500/30",
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

// ─── Member Avatar ─────────────────────────────────────────────────────────────
function MemberAvatar({ member, size = "md" }: { member: any; size?: "sm" | "md" | "lg" }) {
  const sizeClass = size === "sm" ? "h-8 w-8 text-xs" : size === "lg" ? "h-16 w-16 text-xl" : "h-10 w-10 text-sm";
  const initials = member.displayName?.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2) ?? "?";
  return (
    <Avatar className={sizeClass}>
      <AvatarImage src={member.photoUrl || member.avatarUrl || ""} alt={member.displayName} />
      <AvatarFallback className="bg-primary/20 text-primary font-semibold">{initials}</AvatarFallback>
    </Avatar>
  );
}

// ─── Invite Member Dialog ──────────────────────────────────────────────────────
function InviteMemberDialog({ open, onClose, onSuccess }: { open: boolean; onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({
    displayName: "", email: "", role: "member" as any,
    pronouns: "", relationshipLabel: "", geevesAccess: true,
  });
  const invite = trpc.household.members.invite.useMutation({
    onSuccess: () => { toast.success(`Invitation sent to ${form.email}`); onSuccess(); onClose(); },
    onError: (err) => toast.error(err.message),
  });
  const handleSubmit = () => {
    if (!form.displayName || !form.email) { toast.error("Name and email are required"); return; }
    invite.mutate({ ...form, origin: window.location.origin });
  };
  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Plus className="w-5 h-5 text-primary" /> Invite Constellation Member
          </SheetTitle>
        </SheetHeader>
        <div className="space-y-4 mt-6">
          <div className="space-y-1.5">
            <Label>Display Name *</Label>
            <Input placeholder="e.g. Marcus Jr." value={form.displayName} onChange={(e) => setForm(f => ({ ...f, displayName: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Email Address *</Label>
            <Input type="email" placeholder="member@example.com" value={form.email} onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={form.role} onValueChange={(v) => setForm(f => ({ ...f, role: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(ROLE_LABELS).filter(([k]) => k !== "household_admin").map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Pronouns</Label>
            <Input placeholder="e.g. he/him, she/her, they/them" value={form.pronouns} onChange={(e) => setForm(f => ({ ...f, pronouns: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Relationship</Label>
            <Input placeholder="e.g. Son, Mother, Partner" value={form.relationshipLabel} onChange={(e) => setForm(f => ({ ...f, relationshipLabel: e.target.value }))} />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <p className="text-sm font-medium">Geeves AI Access</p>
              <p className="text-xs text-muted-foreground">Allow this member to use the Geeves assistant</p>
            </div>
            <Switch checked={form.geevesAccess} onCheckedChange={(v) => setForm(f => ({ ...f, geevesAccess: v }))} />
          </div>
          <Button className="w-full" onClick={handleSubmit} disabled={invite.isPending}>
            {invite.isPending ? "Sending Invitation…" : "Send Invitation"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Info Tab ─────────────────────────────────────────────────────────────────
function InfoTab({ member, canEdit, onSaved }: { member: any; canEdit: boolean; onSaved: () => void }) {
  const [form, setForm] = useState({
    displayName: member.displayName ?? "",
    role: member.role ?? "member",
    pronouns: member.pronouns ?? "",
    genderIdentity: member.genderIdentity ?? "",
    relationshipLabel: member.relationshipLabel ?? "",
    accessibilityMode: member.accessibilityMode ?? "standard",
    geevesAccess: member.geevesAccess ?? true,
  });
  const update = trpc.household.members.update.useMutation({
    onSuccess: () => { toast.success("Member updated"); onSaved(); },
    onError: (err) => toast.error(err.message),
  });
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Display Name</Label>
        <Input value={form.displayName} disabled={!canEdit} onChange={(e) => setForm(f => ({ ...f, displayName: e.target.value }))} />
      </div>
      <div className="space-y-1.5">
        <Label>Role</Label>
        {canEdit && member.role !== "household_admin" ? (
          <Select value={form.role} onValueChange={(v) => setForm(f => ({ ...f, role: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(ROLE_LABELS).filter(([k]) => k !== "household_admin").map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <div className={`inline-flex items-center px-2 py-1 rounded border text-xs font-medium ${ROLE_COLORS[member.role] ?? ""}`}>
            {ROLE_LABELS[member.role] ?? member.role}
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Pronouns</Label>
          <Input placeholder="he/him" value={form.pronouns} disabled={!canEdit} onChange={(e) => setForm(f => ({ ...f, pronouns: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <Label>Gender Identity</Label>
          <Input placeholder="Optional" value={form.genderIdentity} disabled={!canEdit} onChange={(e) => setForm(f => ({ ...f, genderIdentity: e.target.value }))} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Relationship</Label>
        <Input placeholder="e.g. Son, Mother, Partner" value={form.relationshipLabel} disabled={!canEdit} onChange={(e) => setForm(f => ({ ...f, relationshipLabel: e.target.value }))} />
      </div>
      <div className="space-y-1.5">
        <Label>Accessibility Mode</Label>
        <Select value={form.accessibilityMode} disabled={!canEdit} onValueChange={(v) => setForm(f => ({ ...f, accessibilityMode: v }))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="standard">Standard</SelectItem>
            <SelectItem value="picture_board">Picture Board</SelectItem>
            <SelectItem value="large_text">Large Text</SelectItem>
            <SelectItem value="voice_only">Voice Only</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center justify-between rounded-lg border border-border p-3">
        <div>
          <p className="text-sm font-medium">Geeves AI Access</p>
          <p className="text-xs text-muted-foreground">Allow this member to use the Geeves assistant</p>
        </div>
        <Switch checked={form.geevesAccess} disabled={!canEdit} onCheckedChange={(v) => setForm(f => ({ ...f, geevesAccess: v }))} />
      </div>
      {canEdit && (
        <Button className="w-full" onClick={() => update.mutate({ memberId: member.id, ...form })} disabled={update.isPending}>
          {update.isPending ? "Saving…" : "Save Changes"}
        </Button>
      )}
    </div>
  );
}

// ─── Profile Tab (migrated from Family screen) ────────────────────────────────
function ProfileTab({ member, canEdit, onSaved }: { member: any; canEdit: boolean; onSaved: () => void }) {
  const [dob, setDob] = useState<string>(member.dob ?? "");
  const [phones, setPhones] = useState<Array<{ label: string; number: string }>>(member.phoneNumbers ?? []);
  const [sizes, setSizes] = useState<{ top: string; bottom: string; shoe: string; dress: string }>({
    top: member.clothingSizes?.top ?? "",
    bottom: member.clothingSizes?.bottom ?? "",
    shoe: member.clothingSizes?.shoe ?? "",
    dress: member.clothingSizes?.dress ?? "",
  });
  const [dietary, setDietary] = useState<string>(member.dietaryRestrictions ?? "");
  const [prefs, setPrefs] = useState<{ favoriteColors: string; favoriteBrands: string; notes: string }>({
    favoriteColors: (member.memberPreferences?.favoriteColors ?? []).join(", "),
    favoriteBrands: (member.memberPreferences?.favoriteBrands ?? []).join(", "),
    notes: member.memberPreferences?.notes ?? "",
  });

  const update = trpc.household.members.update.useMutation({
    onSuccess: () => { toast.success("Profile saved"); onSaved(); },
    onError: (err) => toast.error(err.message),
  });

  const handleSave = () => {
    update.mutate({
      memberId: member.id,
      dob: dob || null,
      phoneNumbers: phones.length > 0 ? phones : null,
      clothingSizes: (sizes.top || sizes.bottom || sizes.shoe || sizes.dress) ? sizes : null,
      dietaryRestrictions: dietary || null,
      memberPreferences: (prefs.favoriteColors || prefs.favoriteBrands || prefs.notes) ? {
        favoriteColors: prefs.favoriteColors ? prefs.favoriteColors.split(",").map(s => s.trim()).filter(Boolean) : [],
        favoriteBrands: prefs.favoriteBrands ? prefs.favoriteBrands.split(",").map(s => s.trim()).filter(Boolean) : [],
        notes: prefs.notes || undefined,
      } : null,
    });
  };

  const addPhone = () => setPhones(p => [...p, { label: "Mobile", number: "" }]);
  const removePhone = (i: number) => setPhones(p => p.filter((_, idx) => idx !== i));
  const updatePhone = (i: number, field: "label" | "number", val: string) => {
    setPhones(p => p.map((ph, idx) => idx === i ? { ...ph, [field]: val } : ph));
  };

  return (
    <div className="space-y-5">
      {/* Date of Birth */}
      <div className="space-y-1.5">
        <Label className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> Date of Birth</Label>
        <Input type="date" value={dob} disabled={!canEdit} onChange={(e) => setDob(e.target.value)} />
      </div>

      {/* Phone Numbers */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" /> Phone Numbers</Label>
          {canEdit && <Button variant="ghost" size="sm" onClick={addPhone} className="h-7 text-xs">+ Add</Button>}
        </div>
        {phones.map((ph, i) => (
          <div key={i} className="flex gap-2">
            <Input className="w-24 flex-shrink-0" placeholder="Label" value={ph.label} disabled={!canEdit} onChange={(e) => updatePhone(i, "label", e.target.value)} />
            <Input className="flex-1" placeholder="+1 555 000 0000" value={ph.number} disabled={!canEdit} onChange={(e) => updatePhone(i, "number", e.target.value)} />
            {canEdit && <Button variant="ghost" size="icon" className="h-9 w-9 flex-shrink-0" onClick={() => removePhone(i)}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>}
          </div>
        ))}
        {phones.length === 0 && <p className="text-xs text-muted-foreground">No phone numbers added</p>}
      </div>

      <Separator />

      {/* Clothing Sizes */}
      <div className="space-y-2">
        <Label className="flex items-center gap-1.5"><Shirt className="w-3.5 h-3.5" /> Clothing Sizes</Label>
        <div className="grid grid-cols-2 gap-2">
          {(["top", "bottom", "shoe", "dress"] as const).map((field) => (
            <div key={field} className="space-y-1">
              <p className="text-xs text-muted-foreground capitalize">{field}</p>
              <Input placeholder={field === "top" ? "M" : field === "bottom" ? "32" : field === "shoe" ? "10" : "8"}
                value={sizes[field]} disabled={!canEdit}
                onChange={(e) => setSizes(s => ({ ...s, [field]: e.target.value }))} />
            </div>
          ))}
        </div>
      </div>

      <Separator />

      {/* Dietary Restrictions */}
      <div className="space-y-1.5">
        <Label className="flex items-center gap-1.5"><Utensils className="w-3.5 h-3.5" /> Dietary Restrictions</Label>
        <Input placeholder="e.g. gluten-free, nut allergy (comma separated)" value={dietary} disabled={!canEdit}
          onChange={(e) => setDietary(e.target.value)} />
      </div>

      {/* Preferences */}
      <div className="space-y-2">
        <Label className="flex items-center gap-1.5"><Heart className="w-3.5 h-3.5" /> Preferences</Label>
        <div className="space-y-2">
          <Input placeholder="Favorite colors (comma separated)" value={prefs.favoriteColors} disabled={!canEdit}
            onChange={(e) => setPrefs(p => ({ ...p, favoriteColors: e.target.value }))} />
          <Input placeholder="Favorite brands (comma separated)" value={prefs.favoriteBrands} disabled={!canEdit}
            onChange={(e) => setPrefs(p => ({ ...p, favoriteBrands: e.target.value }))} />
          <Textarea placeholder="Other notes…" value={prefs.notes} disabled={!canEdit} rows={3}
            onChange={(e) => setPrefs(p => ({ ...p, notes: e.target.value }))} />
        </div>
      </div>

      {canEdit && (
        <Button className="w-full" onClick={handleSave} disabled={update.isPending}>
          {update.isPending ? "Saving…" : "Save Profile"}
        </Button>
      )}
    </div>
  );
}

// ─── Permissions Tab (migrated from MemberPermissions) ────────────────────────
function PermissionsTab({ member, myRole }: { member: any; myRole: string }) {
  const [selectedVerticalId, setSelectedVerticalId] = useState("all");
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({ household: true, calendar: true, bookings: true });

  const { data: matrix, isLoading, refetch } = trpc.accessControl.getMatrix.useQuery(
    { memberId: member.id, verticalId: selectedVerticalId === "all" ? undefined : selectedVerticalId },
    { enabled: true }
  );
  const { data: myPerms } = trpc.accessControl.getMyEffectivePermissions.useQuery();

  const upsertOverride = trpc.accessControl.upsertPermissionOverride.useMutation({ onSuccess: () => refetch(), onError: (e) => toast.error(e.message) });
  const removeOverride = trpc.accessControl.removePermissionOverride.useMutation({ onSuccess: () => { refetch(); toast.success("Reset to role default"); }, onError: (e) => toast.error(e.message) });
  const upsertVerticalAccess = trpc.accessControl.upsertVerticalAccess.useMutation({ onSuccess: () => { refetch(); toast.success("Access rule updated"); }, onError: (e) => toast.error(e.message) });
  const upsertDataPolicy = trpc.accessControl.upsertDataPolicy.useMutation({ onSuccess: () => { refetch(); toast.success("Data policy updated"); }, onError: (e) => toast.error(e.message) });

  const overrideMap = useMemo(() => {
    const map: Record<string, boolean | null> = {};
    if (matrix?.overrides) for (const o of matrix.overrides) map[o.permission] = o.granted;
    return map;
  }, [matrix?.overrides]);

  const canManage = myPerms?.canManageAccess ?? false;

  const getPermissionState = (permKey: string) => {
    const isEffective = matrix?.effectivePermissions.includes(permKey as any) ?? false;
    const isBaseline = matrix?.roleBaseline.includes(permKey as any) ?? false;
    const override = overrideMap[permKey];
    return { isEffective, isBaseline, hasOverride: override !== undefined, overrideType: override !== undefined ? (override ? "granted" : "revoked") : null };
  };

  const handlePermissionToggle = (permission: string, currentEffective: boolean) => {
    const roleHasIt = matrix?.roleBaseline.includes(permission as any) ?? false;
    const override = overrideMap[permission];
    const newGranted = !currentEffective;
    if (newGranted === roleHasIt && override !== undefined) removeOverride.mutate({ memberId: member.id, permission });
    else if (newGranted !== roleHasIt) upsertOverride.mutate({ memberId: member.id, permission, granted: newGranted });
  };

  const getVerticalAccessRule = (verticalId: string) => matrix?.accessRules.find((r: any) => r.verticalId === verticalId);
  const getDataPolicy = (verticalId: string, category: string) => matrix?.dataPolicies.find((p: any) => p.verticalId === verticalId && p.dataCategory === category);

  const isDataCategoryHiddenFromMember = (verticalId: string, category: string) => {
    const policy = getDataPolicy(verticalId, category);
    if (!policy) return false;
    if (policy.hiddenFromMemberIds?.includes(member.id)) return true;
    if (policy.hiddenFromRoles?.includes(member.role)) return true;
    return false;
  };

  const toggleDataCategory = (verticalId: string, category: string, currentlyHidden: boolean) => {
    const policy = getDataPolicy(verticalId, category);
    const currentHiddenIds: string[] = policy?.hiddenFromMemberIds ?? [];
    const currentHiddenRoles: string[] = policy?.hiddenFromRoles ?? [];
    const newHiddenIds = currentlyHidden
      ? currentHiddenIds.filter((id: string) => id !== member.id)
      : currentHiddenIds.includes(member.id) ? currentHiddenIds : [...currentHiddenIds, member.id];
    upsertDataPolicy.mutate({ verticalId, dataCategory: category as any, hiddenFromRoles: currentHiddenRoles, hiddenFromMemberIds: newHiddenIds });
  };

  const verticalsToShow = useMemo(() => {
    if (!matrix) return [];
    if (selectedVerticalId !== "all") return matrix.allVerticals.filter((v: any) => v.id === selectedVerticalId);
    return matrix.allVerticals;
  }, [matrix, selectedVerticalId]);

  if (!canManage) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <Lock className="w-8 h-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Permission management is restricted to admins.</p>
      </div>
    );
  }

  if (isLoading) return <div className="py-8 text-center text-sm text-muted-foreground animate-pulse">Loading permissions…</div>;

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Vertical filter */}
        <div className="space-y-1.5">
          <Label>Vertical Filter</Label>
          <Select value={selectedVerticalId} onValueChange={setSelectedVerticalId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Verticals</SelectItem>
              {(matrix?.allVerticals ?? []).map((v: any) => (
                <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Permission groups */}
        {matrix && (
          <div className="space-y-2">
            {Object.entries(matrix.permissionGroups ?? {}).map(([groupKey, group]: [string, any]) => (
              <Collapsible key={groupKey} open={openGroups[groupKey] ?? false} onOpenChange={(v) => setOpenGroups(p => ({ ...p, [groupKey]: v }))}>
                <CollapsibleTrigger className="flex items-center gap-2 w-full text-left py-2 px-3 rounded-lg hover:bg-muted/50 transition-colors">
                  {openGroups[groupKey] ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  <span className="text-sm font-medium">{group.label}</span>
                  <span className="text-xs text-muted-foreground ml-auto">{group.permissions.length} permissions</span>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="space-y-1 pl-4 pb-2">
                    {group.permissions.map((perm: any) => {
                      const state = getPermissionState(perm.key);
                      return (
                        <div key={perm.key} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/30">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <span className="text-sm truncate">{perm.label}</span>
                            {state.hasOverride && (
                              <Tooltip>
                                <TooltipTrigger>
                                  <Badge variant="outline" className={`text-xs ${state.overrideType === "granted" ? "border-green-500/50 text-green-400" : "border-red-500/50 text-red-400"}`}>
                                    {state.overrideType === "granted" ? "Granted" : "Revoked"}
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent>Override applied — differs from role default</TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {state.hasOverride && (
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeOverride.mutate({ memberId: member.id, permission: perm.key })}>
                                <RotateCcw className="w-3 h-3" />
                              </Button>
                            )}
                            <Switch checked={state.isEffective} onCheckedChange={() => handlePermissionToggle(perm.key, state.isEffective)} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            ))}
          </div>
        )}

        {/* Vertical access rules */}
        {verticalsToShow.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Vertical Access</h4>
            {verticalsToShow.map((v: any) => {
              const rule = getVerticalAccessRule(v.id);
              return (
                <Card key={v.id} className="border-border/50">
                  <CardContent className="p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{v.name}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Access Level</p>
                        <Select value={rule?.accessLevel ?? "none"}
                          onValueChange={(val) => upsertVerticalAccess.mutate({ memberId: member.id, verticalId: v.id, accessLevel: val as any, calendarAccess: rule?.calendarAccess ?? "default_vertical" })}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {Object.entries(ACCESS_LEVEL_LABELS).map(([k, label]) => <SelectItem key={k} value={k}>{label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Calendar Access</p>
                        <Select value={rule?.calendarAccess ?? "default_vertical"}
                          onValueChange={(val) => upsertVerticalAccess.mutate({ memberId: member.id, verticalId: v.id, accessLevel: rule?.accessLevel ?? "none", calendarAccess: val as any })}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {Object.entries(CALENDAR_ACCESS_LABELS).map(([k, label]) => <SelectItem key={k} value={k}>{label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    {/* Data visibility */}
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Data Visibility</p>
                      <div className="flex flex-wrap gap-1.5">
                        {Object.entries(DATA_CATEGORY_LABELS).map(([cat, { label }]) => {
                          const hidden = isDataCategoryHiddenFromMember(v.id, cat);
                          return (
                            <button key={cat} onClick={() => toggleDataCategory(v.id, cat, hidden)}
                              className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded border transition-colors ${hidden ? "border-red-500/40 text-red-400 bg-red-500/10" : "border-green-500/40 text-green-400 bg-green-500/10"}`}>
                              {hidden ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

// ─── Stub Tab ─────────────────────────────────────────────────────────────────
function StubTab({ icon: Icon, title, description, futureItems }: { icon: React.ElementType; title: string; description: string; futureItems: string[] }) {
  return (
    <div className="flex flex-col items-center gap-4 py-8 text-center">
      <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
        <Icon className="w-7 h-7 text-muted-foreground" />
      </div>
      <div>
        <h3 className="font-semibold text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground mt-1 max-w-xs">{description}</p>
      </div>
      <div className="w-full max-w-sm text-left bg-muted/30 rounded-lg p-3 border border-border/50">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Planned for future builds</p>
        <ul className="space-y-1">
          {futureItems.map((item, i) => (
            <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
              <span className="text-primary mt-0.5">•</span> {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ─── Member Detail Sheet ───────────────────────────────────────────────────────
function MemberDetailSheet({ member, myRole, open, onClose, onSaved }: {
  member: any; myRole: string; open: boolean; onClose: () => void; onSaved: () => void;
}) {
  const [confirmAction, setConfirmAction] = useState<"deactivate" | "remove" | null>(null);

  const deactivate = trpc.household.members.deactivate.useMutation({
    onSuccess: () => { toast.success(`${member.displayName} deactivated`); onSaved(); onClose(); },
    onError: (e) => toast.error(e.message),
  });
  const reactivate = trpc.household.members.reactivate.useMutation({
    onSuccess: () => { toast.success(`${member.displayName} reactivated`); onSaved(); },
    onError: (e) => toast.error(e.message),
  });
  const remove = trpc.household.members.remove.useMutation({
    onSuccess: () => { toast.success(`${member.displayName} removed from constellation`); onSaved(); onClose(); },
    onError: (e) => toast.error(e.message),
  });

  const isAdminOwner = member.role === "household_admin";
  const canEdit = myRole === "household_admin" || (myRole === "ea" && !isAdminOwner);

  return (
    <>
      <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <div className="flex items-center gap-3">
              <MemberAvatar member={member} size="lg" />
              <div className="flex-1 min-w-0">
                <SheetTitle className="text-lg leading-tight">{member.displayName}</SheetTitle>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${ROLE_COLORS[member.role] ?? ""}`}>
                    {ROLE_LABELS[member.role] ?? member.role}
                  </span>
                  <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${STATUS_COLORS[member.status] ?? ""}`}>
                    {member.status}
                  </span>
                </div>
                {member.email && <p className="text-xs text-muted-foreground mt-0.5 truncate">{member.email}</p>}
              </div>
            </div>
          </SheetHeader>

          <Tabs defaultValue="info" className="mt-5">
            <TabsList className="w-full grid grid-cols-4 h-auto">
              <TabsTrigger value="info" className="text-xs py-1.5">Info</TabsTrigger>
              <TabsTrigger value="profile" className="text-xs py-1.5">Profile</TabsTrigger>
              <TabsTrigger value="permissions" className="text-xs py-1.5">Permissions</TabsTrigger>
              <TabsTrigger value="more" className="text-xs py-1.5">More</TabsTrigger>
            </TabsList>

            <TabsContent value="info" className="mt-4">
              <InfoTab member={member} canEdit={canEdit} onSaved={onSaved} />
            </TabsContent>

            <TabsContent value="profile" className="mt-4">
              <ProfileTab member={member} canEdit={canEdit} onSaved={onSaved} />
            </TabsContent>

            <TabsContent value="permissions" className="mt-4">
              <PermissionsTab member={member} myRole={myRole} />
            </TabsContent>

            <TabsContent value="more" className="mt-4">
              <Tabs defaultValue="resources">
                <TabsList className="w-full grid grid-cols-3 h-auto">
                  <TabsTrigger value="resources" className="text-xs py-1">Resources</TabsTrigger>
                  <TabsTrigger value="comms" className="text-xs py-1">Comms</TabsTrigger>
                  <TabsTrigger value="activity" className="text-xs py-1">Activity</TabsTrigger>
                </TabsList>
                <TabsContent value="resources" className="mt-3">
                  <ResourcesWidget
                    memberId={member.id}
                    memberName={member.displayName}
                    isAdmin={canEdit}
                  />
                </TabsContent>
                <TabsContent value="comms" className="mt-3">
                  <StubTab icon={MessageSquare} title="Member Communications"
                    description="Communicate directly with this member from their card."
                    futureItems={[
                      "Email composition and thread history",
                      "WhatsApp and SMS integration",
                      "Voice notes and video messages",
                      "Slack and social media integration",
                      "Video call initiation (Zoom, Google Meet)",
                    ]} />
                </TabsContent>
                <TabsContent value="activity" className="mt-3">
                  <StubTab icon={Activity} title="Activity Log"
                    description="Track recent activity and interactions for this member."
                    futureItems={[
                      "Recent login and access history",
                      "Shopping and order activity",
                      "Calendar event interactions",
                      "Permission change audit trail",
                    ]} />
                </TabsContent>
              </Tabs>
            </TabsContent>
          </Tabs>

          {/* Danger zone */}
          {canEdit && !isAdminOwner && (
            <div className="mt-6 pt-4 border-t border-border/50 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Actions</p>
              <div className="flex gap-2">
                {member.status === "active" ? (
                  <Button variant="outline" size="sm" className="flex-1 border-orange-500/30 text-orange-400 hover:bg-orange-500/10"
                    onClick={() => setConfirmAction("deactivate")}>
                    <UserX className="w-3.5 h-3.5 mr-1.5" /> Deactivate
                  </Button>
                ) : member.status === "inactive" ? (
                  <Button variant="outline" size="sm" className="flex-1 border-green-500/30 text-green-400 hover:bg-green-500/10"
                    onClick={() => reactivate.mutate({ memberId: member.id })}>
                    <UserCheck className="w-3.5 h-3.5 mr-1.5" /> Reactivate
                  </Button>
                ) : null}
                {myRole === "household_admin" && (
                  <Button variant="outline" size="sm" className="flex-1 border-destructive/30 text-destructive hover:bg-destructive/10"
                    onClick={() => setConfirmAction("remove")}>
                    <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Remove
                  </Button>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Confirm dialogs */}
      <AlertDialog open={confirmAction !== null} onOpenChange={(v) => !v && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              {confirmAction === "deactivate" ? "Deactivate Member?" : "Remove Member?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction === "deactivate"
                ? `${member.displayName} will lose access to the constellation but their data will be preserved. You can reactivate them later.`
                : `This will permanently remove ${member.displayName} from the constellation. This action cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={confirmAction === "remove" ? "bg-destructive hover:bg-destructive/90" : "bg-orange-500 hover:bg-orange-600"}
              onClick={() => {
                if (confirmAction === "deactivate") deactivate.mutate({ memberId: member.id });
                else if (confirmAction === "remove") remove.mutate({ memberId: member.id });
                setConfirmAction(null);
              }}>
              {confirmAction === "deactivate" ? "Deactivate" : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function ConstellationMembers() {
  const { user } = useAuth();
  const [selectedMember, setSelectedMember] = useState<any>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "invited" | "inactive">("active");

  const { data: members = [], isLoading, refetch } = trpc.household.getMembers.useQuery();
  const { data: myPerms } = trpc.accessControl.getMyEffectivePermissions.useQuery();

  // Role-gate: only household_admin and ea can access this page
  const myMember = members.find((m: any) => m.userId === user?.id);
  const myRole = myMember?.role ?? "";
  const canAccess = myRole === "household_admin" || myRole === "ea";

  if (isLoading) {
    return (
      <div className="container max-w-4xl py-12 flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground text-sm">Loading constellation…</div>
      </div>
    );
  }

  if (!canAccess && members.length > 0) {
    return (
      <div className="container max-w-3xl py-12">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
            <Lock className="w-8 h-8 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-semibold">Access Restricted</h2>
          <p className="text-muted-foreground max-w-sm">
            Constellation member management is available to Household Admins and Executive Assistants only.
          </p>
        </div>
      </div>
    );
  }

  const filteredMembers = members.filter((m: any) => {
    if (filterStatus === "all") return true;
    return m.status === filterStatus;
  });

  const statusCounts = {
    all: members.length,
    active: members.filter((m: any) => m.status === "active").length,
    invited: members.filter((m: any) => m.status === "invited").length,
    inactive: members.filter((m: any) => m.status === "inactive").length,
  };

  return (
    <div className="container max-w-4xl py-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="w-6 h-6 text-primary" />
            Constellation Members
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Manage member profiles, permissions, and access across your constellation.
          </p>
        </div>
        {(myRole === "household_admin" || myRole === "ea") && (
          <Button onClick={() => setShowInvite(true)} className="flex-shrink-0">
            <Plus className="w-4 h-4 mr-1.5" /> Invite Member
          </Button>
        )}
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1 bg-muted/50 rounded-lg p-1 w-fit">
        {(["active", "invited", "inactive", "all"] as const).map((status) => (
          <button key={status} onClick={() => setFilterStatus(status)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors capitalize ${filterStatus === status ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            {status === "all" ? "All" : status.charAt(0).toUpperCase() + status.slice(1)}
            <span className="ml-1.5 text-xs opacity-60">{statusCounts[status]}</span>
          </button>
        ))}
      </div>

      {/* Member grid */}
      {filteredMembers.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-16 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
            <Users className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="font-semibold">No {filterStatus !== "all" ? filterStatus : ""} members</h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            {filterStatus === "active" ? "Invite someone to join your constellation." : `No members with '${filterStatus}' status.`}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredMembers.map((member: any) => (
            <button key={member.id} onClick={() => setSelectedMember(member)}
              className="text-left p-4 rounded-xl border border-border/60 bg-card hover:border-primary/40 hover:bg-card/80 transition-all group">
              <div className="flex items-start gap-3">
                <MemberAvatar member={member} size="md" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate group-hover:text-primary transition-colors">{member.displayName}</p>
                  {member.email && <p className="text-xs text-muted-foreground truncate">{member.email}</p>}
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${ROLE_COLORS[member.role] ?? ""}`}>
                      {ROLE_LABELS[member.role] ?? member.role}
                    </span>
                    {member.status !== "active" && (
                      <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${STATUS_COLORS[member.status] ?? ""}`}>
                        {member.status}
                      </span>
                    )}
                  </div>
                  {member.relationshipLabel && (
                    <p className="text-xs text-muted-foreground mt-1">{member.relationshipLabel}</p>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Member detail sheet */}
      {selectedMember && (
        <MemberDetailSheet
          member={selectedMember}
          myRole={myRole}
          open={!!selectedMember}
          onClose={() => setSelectedMember(null)}
          onSaved={() => { refetch(); }}
        />
      )}

      {/* Invite sheet */}
      <InviteMemberDialog
        open={showInvite}
        onClose={() => setShowInvite(false)}
        onSuccess={() => refetch()}
      />
    </div>
  );
}
