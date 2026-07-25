import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Plus, Pencil, Trash2, Eye, EyeOff, Users, Calendar, Mail, Link2, ChevronRight,
  Briefcase, Home, User, ShoppingCart, Building2, Globe, Lock, Shield, Globe2
} from "lucide-react";

const VERTICAL_ICONS = [
  { value: "home", label: "Home", icon: Home },
  { value: "briefcase", label: "Work", icon: Briefcase },
  { value: "user", label: "Personal", icon: User },
  { value: "users", label: "Family", icon: Users },
  { value: "shopping-cart", label: "Shopping", icon: ShoppingCart },
  { value: "building", label: "Business", icon: Building2 },
  { value: "globe", label: "Community", icon: Globe },
];

// Brand rainbow palette — only these 6 colours are permitted per brand guidelines
const VERTICAL_COLORS = [
  { value: "#2AAFA9", label: "Vivid Teal" },
  { value: "#E8624A", label: "Coral Red" },
  { value: "#D4A017", label: "Golden Yellow" },
  { value: "#8B5CF6", label: "Bold Violet" },
  { value: "#4F7EC4", label: "Indigo Blue" },
  { value: "#E8943A", label: "Amber Orange" },
];

const VISIBILITY_LABELS: Record<string, string> = {
  none: "Private",
  busy_only: "Busy Only",
  full: "Full Access",
};

function getIconComponent(iconName: string | null) {
  const found = VERTICAL_ICONS.find((i) => i.value === iconName);
  return found ? found.icon : Globe;
}

interface VerticalFormData {
  name: string;
  icon: string;
  color: string;
  description: string;
  sortOrder: number;
  privacyLevel: "household" | "admin_only" | "private";
  busyLabel: string;
}

const DEFAULT_VERTICALS: VerticalFormData[] = [
  { name: "Home & Family", icon: "home", color: "#E8624A", description: "Home, family, and household management", sortOrder: 0, privacyLevel: "household", busyLabel: "Busy" },
  { name: "Maxfield Bakery", icon: "briefcase", color: "#4F7EC4", description: "Maxfield Bakery business operations", sortOrder: 1, privacyLevel: "household", busyLabel: "Busy" },
  { name: "Maxfield Market", icon: "shopping-cart", color: "#D4A017", description: "Maxfield Market business operations", sortOrder: 2, privacyLevel: "household", busyLabel: "Busy" },
  { name: "Personal", icon: "user", color: "#8B5CF6", description: "Personal life and self-care", sortOrder: 3, privacyLevel: "private", busyLabel: "Busy" },
  { name: "StartOut", icon: "globe", color: "#E8943A", description: "StartOut community and leadership", sortOrder: 4, privacyLevel: "household", busyLabel: "Busy" },
];

export default function Verticals() {
  const utils = trpc.useUtils();
  const { data: verticals = [], isLoading } = trpc.verticals.list.useQuery();

  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<VerticalFormData>({
    name: "", icon: "home", color: "#10b981", description: "", sortOrder: 0,
    privacyLevel: "household", busyLabel: "Busy",
  });

  const createMutation = trpc.verticals.create.useMutation({
    onSuccess: () => {
      utils.verticals.list.invalidate();
      setShowCreate(false);
      setForm({ name: "", icon: "home", color: "#10b981", description: "", sortOrder: 0, privacyLevel: "household", busyLabel: "Busy" });
      toast.success("Vertical created");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.verticals.update.useMutation({
    onSuccess: () => {
      utils.verticals.list.invalidate();
      setEditingId(null);
      toast.success("Vertical updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.verticals.delete.useMutation({
    onSuccess: () => {
      utils.verticals.list.invalidate();
      toast.success("Vertical removed");
    },
    onError: (e) => toast.error(e.message),
  });

  const seedMutation = trpc.verticals.seedDefaults.useMutation({
    onSuccess: (data) => {
      utils.verticals.list.invalidate();
      if (data.skipped) {
        toast.info("Verticals already exist. Use \"Replace\" to overwrite.");
      } else {
        toast.success(`${data.seeded} default verticals created`);
      }
    },
    onError: (e) => toast.error(e.message),
  });

  function openCreate() {
    setForm({ name: "", icon: "home", color: "#10b981", description: "", sortOrder: verticals.length, privacyLevel: "household", busyLabel: "Busy" });
    setShowCreate(true);
  }

  function openEdit(v: typeof verticals[0]) {
    setForm({
      name: v.name,
      icon: v.icon ?? "home",
      color: v.color ?? "#10b981",
      description: v.description ?? "",
      sortOrder: v.sortOrder ?? 0,
      privacyLevel: (v.privacyLevel as "household" | "admin_only" | "private") ?? "household",
      busyLabel: (v as any).busyLabel ?? "Busy",
    });
    setEditingId(v.id);
  }

  function handleSeed() {
    seedMutation.mutate({ verticals: DEFAULT_VERTICALS });
  }

  const IconComp = getIconComponent(form.icon);

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Verticals</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Life domains that organise your calendars, email accounts, and integrations.
          </p>
        </div>
        <div className="flex gap-2">
          {verticals.length === 0 && (
            <Button variant="outline" onClick={handleSeed} disabled={seedMutation.isPending}>
              Seed Defaults
            </Button>
          )}
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" /> New Vertical
          </Button>
        </div>
      </div>

      {/* Empty state */}
      {!isLoading && verticals.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center space-y-4">
            <Globe className="h-12 w-12 mx-auto text-muted-foreground opacity-40" />
            <div>
              <p className="font-medium">No verticals yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Verticals are life domains — Home, Work, Personal, etc. — that group your calendars and integrations.
              </p>
            </div>
            <div className="flex gap-2 justify-center">
              <Button variant="outline" onClick={handleSeed} disabled={seedMutation.isPending}>
                Seed TJ Perkins Defaults
              </Button>
              <Button onClick={openCreate}>
                <Plus className="h-4 w-4 mr-2" /> Create First Vertical
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Verticals grid */}
      <div className="grid gap-4 sm:grid-cols-2">
        {verticals.map((v) => {
          const Icon = getIconComponent(v.icon);
          return (
            <Card key={v.id} className="relative overflow-hidden">
              {/* Colour accent strip */}
              <div
                className="absolute left-0 top-0 bottom-0 w-1 rounded-l"
                style={{ backgroundColor: v.color ?? "#10b981" }}
              />
              <CardHeader className="pl-5 pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div
                      className="h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: `${v.color ?? "#10b981"}22` }}
                    >
                      <Icon className="h-5 w-5" style={{ color: v.color ?? "#10b981" }} />
                    </div>
                    <div>
                      <CardTitle className="text-base">{v.name}</CardTitle>
                      {v.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{v.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(v)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => deleteMutation.mutate({ id: v.id })}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pl-5 pt-0 space-y-3">
                {/* Stats row */}
                <div className="flex gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    {v.calendarCount} calendar{v.calendarCount !== 1 ? "s" : ""}
                  </span>
                  <span className="flex items-center gap-1">
                    <Link2 className="h-3.5 w-3.5" />
                    {v.integrationCount} integration{v.integrationCount !== 1 ? "s" : ""}
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" />
                    {v.ownerCount} owner{v.ownerCount !== 1 ? "s" : ""}
                  </span>
                </div>

                {/* Manage link */}
                <Link href={`/verticals/${v.id}`}>
                  <Button variant="outline" size="sm" className="w-full text-xs h-7">
                    Manage Integrations <ChevronRight className="h-3.5 w-3.5 ml-1" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Create / Edit Dialog */}
      <Dialog open={showCreate || !!editingId} onOpenChange={(open) => { if (!open) { setShowCreate(false); setEditingId(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Vertical" : "New Vertical"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Home & Family"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Icon</Label>
                <Select value={form.icon} onValueChange={(v) => setForm((f) => ({ ...f, icon: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VERTICAL_ICONS.map((i) => (
                      <SelectItem key={i.value} value={i.value}>
                        {i.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Colour</Label>
                <Select value={form.color} onValueChange={(v) => setForm((f) => ({ ...f, color: v }))}>
                  <SelectTrigger>
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full" style={{ backgroundColor: form.color }} />
                      <span className="text-sm">{VERTICAL_COLORS.find((c) => c.value === form.color)?.label ?? form.color}</span>
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    {VERTICAL_COLORS.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        <div className="flex items-center gap-2">
                          <div className="h-3 w-3 rounded-full" style={{ backgroundColor: c.value }} />
                          {c.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Description <span className="text-muted-foreground">(optional)</span></Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Brief description of this life domain"
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5" /> Privacy Level
                </Label>
                <Select value={form.privacyLevel} onValueChange={(v) => setForm((f) => ({ ...f, privacyLevel: v as "household" | "admin_only" | "private" }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="household">
                      <div className="flex items-center gap-2"><Globe2 className="h-3.5 w-3.5" /> Household</div>
                    </SelectItem>
                    <SelectItem value="admin_only">
                      <div className="flex items-center gap-2"><Shield className="h-3.5 w-3.5" /> Admin Only</div>
                    </SelectItem>
                    <SelectItem value="private">
                      <div className="flex items-center gap-2"><Lock className="h-3.5 w-3.5" /> Private</div>
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {form.privacyLevel === "household" && "All household members can see this vertical"}
                  {form.privacyLevel === "admin_only" && "Only admins; EA sees busy blocks"}
                  {form.privacyLevel === "private" && "Only vertical owners can see this"}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <Eye className="h-3.5 w-3.5" /> Busy Label
                </Label>
                <Input
                  value={form.busyLabel}
                  onChange={(e) => setForm((f) => ({ ...f, busyLabel: e.target.value }))}
                  placeholder="e.g. Busy, OOO, Focus Time"
                  maxLength={50}
                />
                <p className="text-xs text-muted-foreground">Shown to others instead of event title</p>
              </div>
            </div>
            {/* Preview */}
            <div className="rounded-lg border p-3 flex items-center gap-3">
              <div
                className="h-9 w-9 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: `${form.color}22` }}
              >
                <IconComp className="h-5 w-5" style={{ color: form.color }} />
              </div>
              <div>
                <p className="font-medium text-sm">{form.name || "Vertical Name"}</p>
                <p className="text-xs text-muted-foreground">{form.description || "Description"}</p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreate(false); setEditingId(null); }}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (editingId) {
                  updateMutation.mutate({ id: editingId, ...form });
                } else {
                  createMutation.mutate(form);
                }
              }}
              disabled={!form.name.trim() || createMutation.isPending || updateMutation.isPending}
            >
              {editingId ? "Save Changes" : "Create Vertical"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
