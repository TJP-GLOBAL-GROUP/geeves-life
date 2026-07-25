/**
 * P-40: Custom Roles Management Page
 *
 * Allows household admins and EAs with household.manage permission to:
 * - View all custom roles defined for the household
 * - Create new custom roles with per-permission, widget, and vertical access
 * - Edit existing custom roles
 * - Delete custom roles
 * - Assign custom roles to household members
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Plus, Pencil, Trash2, Shield, Users, ChevronRight,
  ShieldCheck, ShieldAlert, Info, Layers
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CustomRole {
  id: string;
  name: string;
  description: string | null;
  baseRole: string;
  permissions: string[];
  deniedPermissions: string[];
  allowedWidgets: string[] | null;
  allowedVerticalIds: string[] | null;
  color: string;
  icon: string;
  createdByMemberId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface PermissionGroup {
  group: string;
  label: string;
  description: string;
  permissions: Array<{ key: string; label: string; description: string; globalOnly?: boolean }>;
}

// ─── Role Form ────────────────────────────────────────────────────────────────

const BASE_ROLES = [
  { value: "household_admin", label: "Household Admin", description: "Full access — co-equal head of household" },
  { value: "ea", label: "Executive Assistant", description: "Broad operational access, manages on behalf of admin" },
  { value: "member", label: "Member", description: "Standard household member" },
  { value: "vendor", label: "Vendor / Contractor", description: "External service provider with limited access" },
  { value: "caregiver", label: "Caregiver", description: "Childcare or elder care provider" },
  { value: "child", label: "Child", description: "Minor household member with restricted access" },
  { value: "elder", label: "Elder", description: "Senior household member with accessibility-first UI" },
];

const ROLE_COLORS = [
  "#6B7280", "#EF4444", "#F97316", "#EAB308",
  "#22C55E", "#06B6D4", "#3B82F6", "#8B5CF6",
  "#EC4899", "#14B8A6",
];

interface RoleFormState {
  name: string;
  description: string;
  baseRole: string;
  permissions: string[];
  deniedPermissions: string[];
  color: string;
}

function RoleForm({
  initial,
  permissionGroups,
  onSave,
  onCancel,
  saving,
}: {
  initial: RoleFormState;
  permissionGroups: PermissionGroup[];
  onSave: (data: RoleFormState) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<RoleFormState>(initial);

  const togglePermission = (key: string, list: "permissions" | "deniedPermissions") => {
    const other = list === "permissions" ? "deniedPermissions" : "permissions";
    setForm(prev => {
      const current = prev[list];
      const otherList = prev[other];
      if (current.includes(key)) {
        return { ...prev, [list]: current.filter(p => p !== key) };
      } else {
        return {
          ...prev,
          [list]: [...current, key],
          [other]: otherList.filter(p => p !== key), // can't be in both
        };
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Basic Info */}
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2 space-y-2">
          <Label>Role Name *</Label>
          <Input
            value={form.name}
            onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
            placeholder="e.g. Property Manager, Nanny, Bookkeeper"
            maxLength={100}
          />
        </div>
        <div className="col-span-2 space-y-2">
          <Label>Description</Label>
          <Textarea
            value={form.description}
            onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
            placeholder="What does this role do in your household?"
            rows={2}
            maxLength={500}
          />
        </div>
        <div className="space-y-2">
          <Label>Base Role (inherits permissions from)</Label>
          <Select value={form.baseRole} onValueChange={v => setForm(prev => ({ ...prev, baseRole: v }))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BASE_ROLES.map(r => (
                <SelectItem key={r.value} value={r.value}>
                  <div>
                    <div className="font-medium">{r.label}</div>
                    <div className="text-xs text-muted-foreground">{r.description}</div>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Badge Color</Label>
          <div className="flex gap-2 flex-wrap">
            {ROLE_COLORS.map(color => (
              <button
                key={color}
                type="button"
                className="w-7 h-7 rounded-full border-2 transition-all"
                style={{
                  backgroundColor: color,
                  borderColor: form.color === color ? "white" : "transparent",
                  boxShadow: form.color === color ? `0 0 0 2px ${color}` : "none",
                }}
                onClick={() => setForm(prev => ({ ...prev, color }))}
              />
            ))}
          </div>
        </div>
      </div>

      <Separator />

      {/* Permission Overrides */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck className="h-4 w-4 text-emerald-500" />
          <h3 className="font-semibold text-sm">Permission Overrides</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Grant or deny specific permissions on top of the base role. Leave unchecked to inherit from base role.
        </p>
        <div className="space-y-5">
          {permissionGroups.map(group => (
            <div key={group.group}>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                {group.label}
              </div>
              <div className="space-y-2">
                {group.permissions.map(perm => {
                  const isGranted = form.permissions.includes(perm.key);
                  const isDenied = form.deniedPermissions.includes(perm.key);
                  return (
                    <div key={perm.key} className="flex items-start gap-3 py-1">
                      <div className="flex gap-2 mt-0.5">
                        <div className="flex items-center gap-1">
                          <Checkbox
                            id={`grant-${perm.key}`}
                            checked={isGranted}
                            onCheckedChange={() => togglePermission(perm.key, "permissions")}
                          />
                          <label htmlFor={`grant-${perm.key}`} className="text-xs text-emerald-600 cursor-pointer">Grant</label>
                        </div>
                        <div className="flex items-center gap-1">
                          <Checkbox
                            id={`deny-${perm.key}`}
                            checked={isDenied}
                            onCheckedChange={() => togglePermission(perm.key, "deniedPermissions")}
                            className="data-[state=checked]:bg-red-500 data-[state=checked]:border-red-500"
                          />
                          <label htmlFor={`deny-${perm.key}`} className="text-xs text-red-500 cursor-pointer">Deny</label>
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium leading-none">{perm.label}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{perm.description}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button
          onClick={() => onSave(form)}
          disabled={saving || !form.name.trim()}
        >
          {saving ? "Saving…" : "Save Role"}
        </Button>
      </DialogFooter>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CustomRoles() {
  const utils = trpc.useUtils();

  const { data: roles = [], isLoading } = trpc.customRoles.list.useQuery();
  const { data: catalog } = trpc.customRoles.getPermissionCatalog.useQuery();
  const { data: members = [] } = trpc.household.members.list.useQuery();

  const [createOpen, setCreateOpen] = useState(false);
  const [editRole, setEditRole] = useState<CustomRole | null>(null);
  const [deleteRole, setDeleteRole] = useState<CustomRole | null>(null);
  const [activeTab, setActiveTab] = useState("roles");

  const defaultForm: RoleFormState = {
    name: "",
    description: "",
    baseRole: "member",
    permissions: [],
    deniedPermissions: [],
    color: "#6B7280",
  };

  const createMutation = trpc.customRoles.create.useMutation({
    onSuccess: () => {
      utils.customRoles.list.invalidate();
      setCreateOpen(false);
      toast.success("Role created", { description: "The custom role has been created." });
    },
    onError: (e) => toast.error("Error", { description: e.message }),
  });

  const updateMutation = trpc.customRoles.update.useMutation({
    onSuccess: () => {
      utils.customRoles.list.invalidate();
      setEditRole(null);
      toast.success("Role updated", { description: "The custom role has been updated." });
    },
    onError: (e) => toast.error("Error", { description: e.message }),
  });

  const deleteMutation = trpc.customRoles.delete.useMutation({
    onSuccess: () => {
      utils.customRoles.list.invalidate();
      setDeleteRole(null);
      toast.success("Role deleted", { description: "The custom role has been removed." });
    },
    onError: (e) => toast.error("Error", { description: e.message }),
  });

  const assignMutation = trpc.customRoles.assignToMember.useMutation({
    onSuccess: () => {
      utils.household.members.list.invalidate();
      toast.success("Role assigned", { description: "The member's custom role has been updated." });
    },
    onError: (e) => toast.error("Error", { description: e.message }),
  });

  const permissionGroups: PermissionGroup[] = catalog?.groups ?? [];

  const handleCreate = (data: RoleFormState) => {
    createMutation.mutate({
      name: data.name,
      description: data.description || undefined,
      baseRole: data.baseRole as any,
      permissions: data.permissions,
      deniedPermissions: data.deniedPermissions,
      color: data.color,
    });
  };

  const handleUpdate = (data: RoleFormState) => {
    if (!editRole) return;
    updateMutation.mutate({
      id: editRole.id,
      data: {
        name: data.name,
        description: data.description || undefined,
        baseRole: data.baseRole as any,
        permissions: data.permissions,
        deniedPermissions: data.deniedPermissions,
        color: data.color,
      },
    });
  };

  const getRoleUsageCount = (roleId: string) => {
    return (members as any[]).filter((m: any) => m.customRoleId === roleId).length;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Shield className="h-6 w-6 text-primary" />
              Custom Roles
            </h1>
            <p className="text-muted-foreground mt-1">
              Define custom roles with specific permissions and access controls for your constellation members.
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            New Role
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="roles" className="gap-2">
              <Shield className="h-4 w-4" />
              Roles ({roles.length})
            </TabsTrigger>
            <TabsTrigger value="assignments" className="gap-2">
              <Users className="h-4 w-4" />
              Assignments
            </TabsTrigger>
          </TabsList>

          {/* Roles Tab */}
          <TabsContent value="roles" className="space-y-4 mt-4">
            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3].map(i => (
                  <Card key={i} className="animate-pulse">
                    <CardHeader><div className="h-5 bg-muted rounded w-3/4" /></CardHeader>
                    <CardContent><div className="h-4 bg-muted rounded w-full" /></CardContent>
                  </Card>
                ))}
              </div>
            ) : roles.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <Shield className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="font-semibold text-lg">No custom roles yet</h3>
                  <p className="text-muted-foreground text-sm mt-1 max-w-sm">
                    Create custom roles to give specific members tailored access to features, verticals, and widgets.
                  </p>
                  <Button className="mt-4 gap-2" onClick={() => setCreateOpen(true)}>
                    <Plus className="h-4 w-4" />
                    Create First Role
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {(roles as CustomRole[]).map(role => {
                  const usageCount = getRoleUsageCount(role.id);
                  const baseRoleLabel = BASE_ROLES.find(r => r.value === role.baseRole)?.label ?? role.baseRole;
                  return (
                    <Card key={role.id} className="group relative hover:shadow-md transition-shadow">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <div
                              className="w-3 h-3 rounded-full flex-shrink-0"
                              style={{ backgroundColor: role.color ?? "#6B7280" }}
                            />
                            <CardTitle className="text-base truncate">{role.name}</CardTitle>
                          </div>
                          <div className="flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => setEditRole(role)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => setDeleteRole(role)}
                              disabled={usageCount > 0}
                              title={usageCount > 0 ? `Cannot delete — ${usageCount} member(s) use this role` : "Delete role"}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                        {role.description && (
                          <CardDescription className="text-xs mt-1">{role.description}</CardDescription>
                        )}
                      </CardHeader>
                      <CardContent className="pt-0 space-y-3">
                        <div className="flex flex-wrap gap-1.5">
                          <Badge variant="secondary" className="text-xs">
                            Inherits: {baseRoleLabel}
                          </Badge>
                          {role.permissions.length > 0 && (
                            <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-200">
                              +{role.permissions.length} granted
                            </Badge>
                          )}
                          {role.deniedPermissions.length > 0 && (
                            <Badge variant="outline" className="text-xs text-red-500 border-red-200">
                              -{role.deniedPermissions.length} denied
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {usageCount} member{usageCount !== 1 ? "s" : ""}
                          </span>
                          {role.allowedVerticalIds && (
                            <span className="flex items-center gap-1">
                              <Layers className="h-3 w-3" />
                              {role.allowedVerticalIds.length} vertical{role.allowedVerticalIds.length !== 1 ? "s" : ""}
                            </span>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}

            {/* Info card about built-in roles */}
            <Card className="bg-muted/30 border-dashed">
              <CardContent className="flex gap-3 py-4">
                <Info className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                <div className="text-xs text-muted-foreground">
                  <strong>Built-in roles</strong> (Household Admin, EA, Member, Caregiver, Child, Elder) are always available and cannot be deleted.
                  Custom roles <em>extend</em> a built-in base role — members assigned a custom role inherit the base role's permissions plus any overrides you define here.
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Assignments Tab */}
          <TabsContent value="assignments" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Member Role Assignments</CardTitle>
                <CardDescription>
                  Assign custom roles to constellation members. A member can have one custom role in addition to their base role.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {(members as any[]).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No members found.</p>
                ) : (
                  <div className="space-y-3">
                    {(members as any[]).map((member: any) => {
                      const assignedRole = (roles as CustomRole[]).find(r => r.id === member.customRoleId);
                      return (
                        <div key={member.id} className="flex items-center justify-between gap-4 py-2 border-b last:border-0">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary flex-shrink-0">
                              {member.displayName?.[0]?.toUpperCase() ?? "?"}
                            </div>
                            <div className="min-w-0">
                              <div className="font-medium text-sm truncate">{member.displayName}</div>
                              <div className="text-xs text-muted-foreground capitalize">{member.role?.replace("_", " ")}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {assignedRole && (
                              <Badge
                                variant="outline"
                                style={{ borderColor: assignedRole.color, color: assignedRole.color }}
                                className="text-xs"
                              >
                                {assignedRole.name}
                              </Badge>
                            )}
                            <Select
                              value={member.customRoleId ?? "none"}
                              onValueChange={(v) => assignMutation.mutate({
                                memberId: member.id,
                                customRoleId: v === "none" ? null : v,
                              })}
                            >
                              <SelectTrigger className="w-44 h-8 text-xs">
                                <SelectValue placeholder="No custom role" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">No custom role</SelectItem>
                                {(roles as CustomRole[]).map(role => (
                                  <SelectItem key={role.id} value={role.id}>
                                    <div className="flex items-center gap-2">
                                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: role.color ?? "#6B7280" }} />
                                      {role.name}
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Create Custom Role</DialogTitle>
            <DialogDescription>
              Define a new role with custom permissions for your constellation members.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="flex-1 pr-4">
            <RoleForm
              initial={defaultForm}
              permissionGroups={permissionGroups}
              onSave={handleCreate}
              onCancel={() => setCreateOpen(false)}
              saving={createMutation.isPending}
            />
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editRole} onOpenChange={open => !open && setEditRole(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Edit Role: {editRole?.name}</DialogTitle>
            <DialogDescription>
              Modify the permissions and settings for this custom role.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="flex-1 pr-4">
            {editRole && (
              <RoleForm
                initial={{
                  name: editRole.name,
                  description: editRole.description ?? "",
                  baseRole: editRole.baseRole,
                  permissions: editRole.permissions ?? [],
                  deniedPermissions: editRole.deniedPermissions ?? [],
                  color: editRole.color ?? "#6B7280",
                }}
                permissionGroups={permissionGroups}
                onSave={handleUpdate}
                onCancel={() => setEditRole(null)}
                saving={updateMutation.isPending}
              />
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteRole} onOpenChange={open => !open && setDeleteRole(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteRole?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the custom role. Members currently assigned this role will lose it but will retain their base role permissions.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteRole && deleteMutation.mutate({ id: deleteRole.id })}
            >
              Delete Role
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
