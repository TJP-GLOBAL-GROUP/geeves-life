import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { StickyNote, Plus, Pencil, Trash2, Clock } from "lucide-react";

export default function Notes() {
  const { user } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [verticalFilter, setVerticalFilter] = useState<string>("all");
  const [selectedVerticalId, setSelectedVerticalId] = useState<string>("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const householdQuery = trpc.household.getMyHousehold.useQuery();
  const householdId = householdQuery.data?.household?.id;
  const memberId = householdQuery.data?.member?.id;

  const verticalsQuery = trpc.household.verticals.list.useQuery(undefined, {
    enabled: !!householdId,
  });

  const notesQuery = trpc.notes.list.useQuery(
    {
      householdId: householdId!,
      ...(verticalFilter !== "all" ? { verticalId: verticalFilter } : {}),
    },
    { enabled: !!householdId }
  );

  const utils = trpc.useUtils();

  const createMutation = trpc.notes.create.useMutation({
    onSuccess: () => {
      utils.notes.list.invalidate();
      toast.success("Note created");
      closeDialog();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = trpc.notes.update.useMutation({
    onSuccess: () => {
      utils.notes.list.invalidate();
      toast.success("Note updated");
      closeDialog();
    },
    onError: (err) => toast.error(err.message),
  });

  const toggleMutation = trpc.notes.toggleComplete.useMutation({
    onSuccess: () => {
      utils.notes.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.notes.delete.useMutation({
    onSuccess: () => {
      utils.notes.list.invalidate();
      toast.success("Note deleted");
      setDeleteConfirmId(null);
    },
    onError: (err) => toast.error(err.message),
  });

  function closeDialog() {
    setDialogOpen(false);
    setEditingId(null);
    setContent("");
    setSelectedVerticalId("");
  }

  function openCreate() {
    setContent("");
    setSelectedVerticalId("");
    setEditingId(null);
    setDialogOpen(true);
  }

  function openEdit(note: any) {
    setContent(note.content);
    setSelectedVerticalId(note.verticalId || "");
    setEditingId(note.id);
    setDialogOpen(true);
  }

  function handleSave() {
    if (!content.trim()) {
      toast.error("Note content is required");
      return;
    }
    if (!householdId || !memberId) return;

    const verticalValue = selectedVerticalId && selectedVerticalId !== "none" ? selectedVerticalId : undefined;
    if (editingId) {
      updateMutation.mutate({
        id: editingId,
        content: content.trim(),
        verticalId: verticalValue || null,
      });
    } else {
      createMutation.mutate({
        householdId,
        memberId,
        content: content.trim(),
        verticalId: verticalValue,
        source: "text",
      });
    }
  }

  const notes = notesQuery.data || [];
  const verticals = verticalsQuery.data || [];
  const isLoading = householdQuery.isLoading || notesQuery.isLoading;

  const { pendingNotes, completedNotes } = useMemo(() => {
    const pending = notes.filter((n: any) => !n.isCompleted);
    const completed = notes.filter((n: any) => n.isCompleted);
    return { pendingNotes: pending, completedNotes: completed };
  }, [notes]);

  if (!householdId && !householdQuery.isLoading) {
    return (
      <div className="p-6">
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <StickyNote className="h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">No Household</h2>
          <p className="text-muted-foreground max-w-sm">
            Create or join a household first to use notes.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Notes</h1>
          <p className="text-muted-foreground mt-1">
            Quick notes, reminders, and action items for your household.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={verticalFilter} onValueChange={setVerticalFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="All verticals" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All verticals</SelectItem>
              {verticals.map((v: any) => (
                <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={openCreate} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            New Note
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="py-4">
                <div className="h-4 bg-muted rounded w-3/4" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : notes.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <StickyNote className="h-10 w-10 text-muted-foreground mb-3" />
            <h3 className="font-medium mb-1">No notes yet</h3>
            <p className="text-sm text-muted-foreground max-w-sm mb-4">
              Capture quick thoughts, reminders, and action items linked to your household verticals.
            </p>
            <Button onClick={openCreate} variant="outline" size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Create Your First Note
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Pending Notes */}
          {pendingNotes.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                Active ({pendingNotes.length})
              </h2>
              <div className="space-y-2">
                {pendingNotes.map((note: any) => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    verticals={verticals}
                    onToggle={() => toggleMutation.mutate({ id: note.id })}
                    onEdit={() => openEdit(note)}
                    onDelete={() => setDeleteConfirmId(note.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Completed Notes */}
          {completedNotes.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                Completed ({completedNotes.length})
              </h2>
              <div className="space-y-2">
                {completedNotes.map((note: any) => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    verticals={verticals}
                    onToggle={() => toggleMutation.mutate({ id: note.id })}
                    onEdit={() => openEdit(note)}
                    onDelete={() => setDeleteConfirmId(note.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Note" : "New Note"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="content">Content</Label>
              <Textarea
                id="content"
                placeholder="What's on your mind?"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={4}
                className="resize-none"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vertical">Vertical (optional)</Label>
              <Select value={selectedVerticalId} onValueChange={setSelectedVerticalId}>
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {verticals.map((v: any) => (
                    <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending}>
              {createMutation.isPending || updateMutation.isPending ? "Saving..." : editingId ? "Save Changes" : "Create Note"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteConfirmId} onOpenChange={(open) => { if (!open) setDeleteConfirmId(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Note</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete this note? This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirmId && deleteMutation.mutate({ id: deleteConfirmId })}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NoteCard({
  note,
  verticals,
  onToggle,
  onEdit,
  onDelete,
}: {
  note: any;
  verticals: any[];
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const vertical = verticals.find((v: any) => v.id === note.verticalId);
  const createdDate = new Date(note.createdAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

  return (
    <Card className={`transition-all ${note.isCompleted ? "opacity-60" : ""}`}>
      <CardContent className="py-3 px-4">
        <div className="flex items-start gap-3">
          <Checkbox
            checked={!!note.isCompleted}
            onCheckedChange={onToggle}
            className="mt-1"
          />
          <div className="flex-1 min-w-0">
            <p className={`text-sm leading-relaxed ${note.isCompleted ? "line-through text-muted-foreground" : ""}`}>
              {note.content}
            </p>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {vertical && (
                <Badge variant="outline" className="text-xs" style={{ borderColor: vertical.color, color: vertical.color }}>
                  {vertical.name}
                </Badge>
              )}
              <span className="text-xs text-muted-foreground">{createdDate}</span>
              {note.source !== "text" && (
                <Badge variant="secondary" className="text-xs">{note.source}</Badge>
              )}
            </div>
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={onDelete}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
