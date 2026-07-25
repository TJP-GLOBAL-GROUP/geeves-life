/**
 * ResourcesWidget — Per-member curated resource links
 *
 * Shows a member's assigned resource links (docs, forms, invoices, templates, links).
 * Vertical owners and admins can add/edit/remove resources.
 * Members see their own list; admins can view any member's list.
 *
 * Design: follows Geeves.Life brand palette — no off-brand colours.
 * Resource type icons use Lucide. Vertical colour-coding uses the vertical's
 * configured colour (brand rainbow).
 */

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Link2, FileText, FileInput, Receipt, LayoutTemplate,
  Plus, ExternalLink, Pencil, Trash2, GripVertical,
} from "lucide-react";
import { toast } from "sonner";

// ─── Resource type config ─────────────────────────────────────────────────────

const RESOURCE_TYPE_CONFIG: Record<string, { label: string; Icon: any; color: string }> = {
  link:     { label: "Link",     Icon: Link2,          color: "#2AAFA9" }, // Vivid Teal
  form:     { label: "Form",     Icon: FileInput,      color: "#8B5CF6" }, // Bold Violet
  doc:      { label: "Doc",      Icon: FileText,       color: "#4F7EC4" }, // Indigo Blue
  invoice:  { label: "Invoice",  Icon: Receipt,        color: "#D4A017" }, // Golden Yellow
  template: { label: "Template", Icon: LayoutTemplate, color: "#E8943A" }, // Amber Orange
};

// ─── Add/Edit Resource Dialog ─────────────────────────────────────────────────

function ResourceDialog({
  open,
  onOpenChange,
  memberId,
  verticals,
  existing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  memberId: string;
  verticals: any[];
  existing?: any;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(existing?.title ?? "");
  const [url, setUrl] = useState(existing?.url ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [resourceType, setResourceType] = useState(existing?.resourceType ?? "link");
  const [verticalId, setVerticalId] = useState<string>(existing?.verticalId ?? "__none__");

  const utils = trpc.useUtils();

  const createMut = trpc.resources.create.useMutation({
    onSuccess: () => {
      toast.success("Resource added");
      utils.resources.list.invalidate();
      onSaved();
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateMut = trpc.resources.update.useMutation({
    onSuccess: () => {
      toast.success("Resource updated");
      utils.resources.list.invalidate();
      onSaved();
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  function handleSave() {
    if (!title.trim() || !url.trim()) {
      toast.error("Title and URL are required");
      return;
    }
    // Basic URL validation
    try { new URL(url); } catch { toast.error("Please enter a valid URL (include https://)"); return; }

    const resolvedVerticalId = verticalId === "__none__" ? undefined : verticalId;

    if (existing) {
      updateMut.mutate({
        id: existing.id,
        title: title.trim(),
        url: url.trim(),
        description: description.trim() || null,
        resourceType: resourceType as any,
        // verticalId update not supported in this dialog — keep original
      });
    } else {
      createMut.mutate({
        memberId,
        verticalId: resolvedVerticalId,
        title: title.trim(),
        url: url.trim(),
        description: description.trim() || undefined,
        resourceType: resourceType as any,
      });
    }
  }

  const isPending = createMut.isPending || updateMut.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{existing ? "Edit Resource" : "Add Resource"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Title *</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Invoice Submission Form"
              maxLength={255}
            />
          </div>
          <div className="space-y-1.5">
            <Label>URL *</Label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..."
              type="url"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={resourceType} onValueChange={setResourceType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(RESOURCE_TYPE_CONFIG).map(([key, cfg]) => (
                  <SelectItem key={key} value={key}>
                    <span className="flex items-center gap-2">
                      <cfg.Icon className="h-3.5 w-3.5" style={{ color: cfg.color }} />
                      {cfg.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {!existing && verticals.length > 0 && (
            <div className="space-y-1.5">
              <Label>Vertical (optional)</Label>
              <Select value={verticalId} onValueChange={setVerticalId}>
                <SelectTrigger>
                  <SelectValue placeholder="No vertical" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No vertical</SelectItem>
                  {verticals.map((v: any) => (
                    <SelectItem key={v.id} value={v.id}>
                      <span className="flex items-center gap-2">
                        <span
                          className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: v.color || "#2AAFA9" }}
                        />
                        {v.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Description (optional)</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of what this resource is for..."
              rows={2}
              maxLength={1000}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? "Saving..." : existing ? "Save Changes" : "Add Resource"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Single resource row ──────────────────────────────────────────────────────

function ResourceRow({
  resource,
  verticals,
  canEdit,
  onEdit,
  onDelete,
}: {
  resource: any;
  verticals: any[];
  canEdit: boolean;
  onEdit: (r: any) => void;
  onDelete: (id: string) => void;
}) {
  const cfg = RESOURCE_TYPE_CONFIG[resource.resourceType] || RESOURCE_TYPE_CONFIG.link;
  const vertical = verticals.find((v: any) => v.id === resource.verticalId);

  return (
    <div className="flex items-start gap-3 py-2.5 group">
      {/* Type icon */}
      <div
        className="mt-0.5 p-1.5 rounded-md shrink-0"
        style={{ backgroundColor: `${cfg.color}18` }}
      >
        <cfg.Icon className="h-3.5 w-3.5" style={{ color: cfg.color }} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <a
            href={resource.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium hover:underline truncate flex items-center gap-1"
            style={{ color: cfg.color }}
          >
            {resource.title}
            <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />
          </a>
          {vertical && (
            <Badge
              variant="outline"
              className="text-xs px-1.5 py-0 shrink-0"
              style={{
                borderColor: `${vertical.color || "#2AAFA9"}40`,
                color: vertical.color || "#2AAFA9",
              }}
            >
              {vertical.name}
            </Badge>
          )}
        </div>
        {resource.description && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{resource.description}</p>
        )}
      </div>

      {/* Admin actions */}
      {canEdit && (
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            onClick={() => onEdit(resource)}
          >
            <Pencil className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-[#E8624A]"
            onClick={() => onDelete(resource.id)}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Main ResourcesWidget ─────────────────────────────────────────────────────

export function ResourcesWidget({
  memberId,
  memberName,
  isAdmin = false,
  compact = false,
}: {
  memberId?: string; // if omitted, shows caller's own resources
  memberName?: string;
  isAdmin?: boolean;
  compact?: boolean;
}) {
  const { user } = useAuth();
  const [showAdd, setShowAdd] = useState(false);
  const [editResource, setEditResource] = useState<any>(null);

  // Resolve the current user's memberId from auth.me when no memberId prop is given
  const { data: meData } = trpc.auth.me.useQuery(undefined, { enabled: !memberId && !!user });
  const resolvedMemberId = useMemo(() => memberId ?? (meData as any)?.memberId ?? "", [memberId, meData]);

  const { data: resources = [], refetch } = trpc.resources.list.useQuery(
    { memberId },
    { enabled: !!user }
  );

  const { data: verticals = [] } = trpc.household.verticals.list.useQuery(
    undefined,
    { enabled: !!user }
  );

  const utils = trpc.useUtils();
  const deleteMut = trpc.resources.delete.useMutation({
    onSuccess: () => {
      toast.success("Resource removed");
      utils.resources.list.invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  function handleDelete(id: string) {
    if (!confirm("Remove this resource?")) return;
    deleteMut.mutate({ id });
  }

  const targetMemberId = resolvedMemberId;
  const title = memberName ? `${memberName}'s Resources` : "My Resources";

  if (!user) return null;

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Link2 className="h-4 w-4" style={{ color: "#2AAFA9" }} />
              {title}
            </CardTitle>
            {isAdmin && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={() => setShowAdd(true)}
                title="Add resource"
              >
                <Plus className="h-4 w-4" />
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {resources.length === 0 ? (
            <div className="py-6 text-center">
              <Link2 className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
              <p className="text-xs text-muted-foreground">No resources yet</p>
              {isAdmin && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 text-xs"
                  onClick={() => setShowAdd(true)}
                >
                  <Plus className="h-3 w-3 mr-1" /> Add first resource
                </Button>
              )}
            </div>
          ) : (
            <div className={compact ? "divide-y divide-border/50 max-h-48 overflow-y-auto" : "divide-y divide-border/50"}>
              {resources.map((r: any) => (
                <ResourceRow
                  key={r.id}
                  resource={r}
                  verticals={verticals}
                  canEdit={isAdmin}
                  onEdit={setEditResource}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add dialog */}
      {showAdd && (
        <ResourceDialog
          open={showAdd}
          onOpenChange={setShowAdd}
          memberId={targetMemberId}
          verticals={verticals}
          onSaved={refetch}
        />
      )}

      {/* Edit dialog */}
      {editResource && (
        <ResourceDialog
          open={!!editResource}
          onOpenChange={(v) => { if (!v) setEditResource(null); }}
          memberId={targetMemberId}
          verticals={verticals}
          existing={editResource}
          onSaved={refetch}
        />
      )}
    </>
  );
}
