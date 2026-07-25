/**
 * Super Admin Portal — Geeves.life Platform Team Only
 *
 * Accessible only to users with role === "system_admin".
 * This page is the single source of truth for:
 *   - Project task tracking (DB-driven, synced from todo.md)
 *   - Knowledge base management (project_knowledge table)
 *   - Audit log review
 *   - User role management
 *
 * Regular household admins and constellation owners have NO access.
 */

import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { ShieldAlert, CheckCircle2, Circle, Clock, AlertCircle, XCircle, RefreshCw, Plus, Trash2, BookOpen, ClipboardList, ScrollText, Users, Database, Tag, Wifi, WifiOff, AlertTriangle, Activity, Search, Archive, Edit2, X, ChevronDown, ChevronUp } from "lucide-react";
import React, { useState, useMemo } from "react";

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  done:        { label: "Done",        color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", icon: CheckCircle2 },
  todo:        { label: "To Do",       color: "bg-slate-500/15 text-slate-400 border-slate-500/30",       icon: Circle },
  in_progress: { label: "In Progress", color: "bg-blue-500/15 text-blue-400 border-blue-500/30",          icon: Clock },
  deferred:    { label: "Deferred",    color: "bg-amber-500/15 text-amber-400 border-amber-500/30",       icon: AlertCircle },
  blocked:     { label: "Blocked",     color: "bg-red-500/15 text-red-400 border-red-500/30",             icon: XCircle },
} as const;

type TaskStatus = keyof typeof STATUS_CONFIG;

const AREA_LABELS: Record<string, string> = {
  general: "General",
  future: "Future",
  calendar: "Calendar",
  design_system: "Design System",
  finance: "Finance",
  knowledge_mgmt: "Knowledge Mgmt",
  properties: "Properties",
  shopping: "Shopping",
  performance: "Performance",
  security: "Security",
  ai: "AI / Geeves",
};

// ─── Summary Cards ────────────────────────────────────────────────────────────
type StatsData = {
  tasks: {
    totals: Record<string, number>;
    byArea: Record<string, Record<string, number>>;
    totalTasks: number;
    completionPct: number;
  };
  knowledgeEntries: number;
};
function SummaryCards({ stats }: { stats: StatsData | undefined }) {
  if (!stats) return null;
  const { totals, totalTasks, completionPct } = stats.tasks;
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
      <Card className="col-span-2 md:col-span-1 border-amber-500/20 bg-amber-500/5">
        <CardContent className="pt-4 pb-3">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Overall</p>
          <p className="text-3xl font-bold text-amber-400">{completionPct}%</p>
          <p className="text-xs text-muted-foreground mt-1">{totals.done}/{totalTasks} tasks</p>
          <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-amber-400 transition-all" style={{ width: `${completionPct}%` }} />
          </div>
        </CardContent>
      </Card>
      {(["done", "todo", "in_progress", "deferred", "blocked"] as TaskStatus[]).map(s => {
        const cfg = STATUS_CONFIG[s];
        const Icon = cfg.icon;
        return (
          <Card key={s} className="border-border/50">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="text-xs text-muted-foreground uppercase tracking-wider">{cfg.label}</p>
              </div>
              <p className="text-2xl font-bold">{totals[s] ?? 0}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ─── Tasks Tab ────────────────────────────────────────────────────────────────
function TasksTab() {
  const utils = trpc.useUtils();
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterArea, setFilterArea] = useState<string>("all");
  const [search, setSearch] = useState("");

  const statsQuery = trpc.superAdmin.stats.summary.useQuery();
  const tasksQuery = trpc.superAdmin.tasks.list.useQuery({
    status: filterStatus !== "all" ? (filterStatus as TaskStatus) : undefined,
    area: filterArea !== "all" ? filterArea : undefined,
    limit: 500,
  });

  const updateStatus = trpc.superAdmin.tasks.updateStatus.useMutation({
    onSuccess: () => {
      utils.superAdmin.tasks.list.invalidate();
      utils.superAdmin.stats.summary.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteTask = trpc.superAdmin.tasks.delete.useMutation({
    onSuccess: () => {
      utils.superAdmin.tasks.list.invalidate();
      utils.superAdmin.stats.summary.invalidate();
      toast.success("Task deleted");
    },
  });

  const tasks = tasksQuery.data ?? [];
  const filteredTasks = useMemo(() => {
    if (!search.trim()) return tasks;
    const q = search.toLowerCase();
    return tasks.filter(t => t.title.toLowerCase().includes(q) || t.area.toLowerCase().includes(q));
  }, [tasks, search]);

  // Group by area
  const grouped = useMemo(() => {
    const map: Record<string, typeof filteredTasks> = {};
    for (const t of filteredTasks) {
      if (!map[t.area]) map[t.area] = [];
      map[t.area].push(t);
    }
    return map;
  }, [filteredTasks]);

  return (
    <div>
      <SummaryCards stats={statsQuery.data} />

      {/* Area progress bars */}
      {statsQuery.data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-6">
          {Object.entries(statsQuery.data.tasks.byArea).map(([area, counts]) => {
            const total = Object.values(counts).reduce((a, b) => a + b, 0);
            const pct = total > 0 ? Math.round((counts.done / total) * 100) : 0;
            return (
              <div key={area} className="bg-card border border-border/50 rounded-lg px-3 py-2">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-medium truncate">{AREA_LABELS[area] ?? area}</span>
                  <span className="text-xs text-muted-foreground ml-2 shrink-0">{pct}%</span>
                </div>
                <div className="h-1 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">{counts.done}/{total}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <Input
          placeholder="Search tasks..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-48 h-8 text-sm"
        />
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36 h-8 text-sm">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {Object.entries(STATUS_CONFIG).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterArea} onValueChange={setFilterArea}>
          <SelectTrigger className="w-40 h-8 text-sm">
            <SelectValue placeholder="Area" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All areas</SelectItem>
            {Object.entries(AREA_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="ghost" size="sm" onClick={() => tasksQuery.refetch()} className="h-8 px-2">
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Task groups */}
      {tasksQuery.isLoading ? (
        <div className="text-muted-foreground text-sm py-8 text-center">Loading tasks...</div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([area, areaTaskList]) => (
            <div key={area}>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">
                {AREA_LABELS[area] ?? area} <span className="font-normal">({areaTaskList.length})</span>
              </h3>
              <div className="space-y-1">
                {areaTaskList.map(task => {
                  const cfg = STATUS_CONFIG[task.status as TaskStatus] ?? STATUS_CONFIG.todo;
                  const Icon = cfg.icon;
                  return (
                    <div key={task.id} className="flex items-start gap-2 bg-card border border-border/40 rounded-lg px-3 py-2 group hover:border-border transition-colors">
                      <Icon className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm leading-snug ${task.status === "done" ? "line-through text-muted-foreground" : ""}`}>
                          {task.title}
                        </p>
                        {task.notes && (
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">{task.notes}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${cfg.color}`}>
                          {cfg.label}
                        </Badge>
                        <Select
                          value={task.status}
                          onValueChange={(val) => updateStatus.mutate({ id: task.id, status: val as TaskStatus })}
                        >
                          <SelectTrigger className="h-6 w-6 p-0 border-0 bg-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                            <span className="sr-only">Change status</span>
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                              <SelectItem key={k} value={k}>{v.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <button
                          onClick={() => deleteTask.mutate({ id: task.id })}
                          className="h-6 w-6 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 transition-opacity hover:text-destructive"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {filteredTasks.length === 0 && (
            <div className="text-center text-muted-foreground text-sm py-8">No tasks match the current filters.</div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Knowledge Base Tab ───────────────────────────────────────────────────────
type KnowledgeEntry = { id: number; category: string; key: string; value: string; sourceDoc?: string | null; notes?: string | null; lastReviewedAt?: Date | null; createdAt: Date; updatedAt: Date; };

type EditForm = { category: string; key: string; value: string; sourceDoc: string; notes: string; };

const EMPTY_FORM: EditForm = { category: "", key: "", value: "", sourceDoc: "", notes: "" };

function KnowledgeEntryRow({
  item, selected, onToggleSelect, onEdit, onDelete, onMarkDeprecated,
}: {
  item: KnowledgeEntry;
  selected: boolean;
  onToggleSelect: () => void;
  onEdit: (item: KnowledgeEntry) => void;
  onDelete: (id: number) => void;
  onMarkDeprecated: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isDeprecated = item.category.startsWith("deprecated");
  return (
    <div className={`group border rounded-lg px-3 py-2 transition-colors ${
      selected ? "bg-amber-500/10 border-amber-500/40" : isDeprecated ? "bg-red-500/5 border-red-500/20" : "bg-card border-border/40"
    }`}>
      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          className="mt-1 h-3.5 w-3.5 rounded accent-amber-500 shrink-0 cursor-pointer"
        />
        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setExpanded(v => !v)}>
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-xs font-mono text-amber-400/80">{item.key}</p>
            {isDeprecated && <span className="text-[10px] bg-red-500/20 text-red-400 border border-red-500/30 rounded px-1">DEPRECATED</span>}
            {item.sourceDoc && <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[200px]">{item.sourceDoc}</span>}
            <span className="ml-auto">{expanded ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}</span>
          </div>
          <p className={`text-sm text-foreground/90 mt-0.5 ${expanded ? "whitespace-pre-wrap break-words" : "truncate"}`}>{item.value}</p>
        </div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => onEdit(item)}>
            <Edit2 className="h-3 w-3" />
          </Button>
          {!isDeprecated && (
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-amber-500 hover:text-amber-400" title="Mark deprecated" onClick={() => onMarkDeprecated(item.id)}>
              <Archive className="h-3 w-3" />
            </Button>
          )}
          <button onClick={() => onDelete(item.id)} className="h-6 w-6 flex items-center justify-center rounded hover:text-destructive">
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
      {expanded && item.notes && (
        <p className="text-xs text-muted-foreground mt-1.5 pl-5 border-l border-border/40 ml-5">{item.notes}</p>
      )}
    </div>
  );
}

function KnowledgeTab() {
  const utils = trpc.useUtils();
  const [editingItem, setEditingItem] = useState<KnowledgeEntry | null>(null);
  const [editForm, setEditForm] = useState<EditForm>(EMPTY_FORM);
  const [showAdd, setShowAdd] = useState(false);
  const [newRow, setNewRow] = useState<EditForm>(EMPTY_FORM);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("all");
  const [showDeprecated, setShowDeprecated] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  // deprecateReason is handled inline via prompt() in onMarkDeprecated callback

  const knowledgeQuery = trpc.superAdmin.knowledge.list.useQuery({ includeDeprecated: showDeprecated });
  const categoriesQuery = trpc.superAdmin.knowledge.categories.useQuery();

  const upsert = trpc.superAdmin.knowledge.upsert.useMutation({
    onSuccess: () => {
      utils.superAdmin.knowledge.list.invalidate();
      utils.superAdmin.knowledge.categories.invalidate();
      setEditingItem(null);
      setShowAdd(false);
      setNewRow(EMPTY_FORM);
      toast.success("Saved");
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteK = trpc.superAdmin.knowledge.delete.useMutation({
    onSuccess: () => { utils.superAdmin.knowledge.list.invalidate(); toast.success("Deleted"); },
  });
  const bulkDelete = trpc.superAdmin.knowledge.bulkDelete.useMutation({
    onSuccess: (_, vars) => {
      utils.superAdmin.knowledge.list.invalidate();
      setSelectedIds(new Set());
      toast.success(`Deleted ${vars.ids.length} entries`);
    },
    onError: (e) => toast.error(e.message),
  });
  const markDeprecated = trpc.superAdmin.knowledge.markDeprecated.useMutation({
    onSuccess: () => { utils.superAdmin.knowledge.list.invalidate(); toast.success("Marked deprecated"); },
    onError: (e) => toast.error(e.message),
  });

  const allEntries = knowledgeQuery.data ?? [];
  const categories = (categoriesQuery.data ?? []).map(c => c.category);

  const filtered = useMemo(() => {
    let list = allEntries;
    if (filterCat !== "all") list = list.filter(e => e.category === filterCat);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(e =>
        e.key.toLowerCase().includes(q) ||
        e.value.toLowerCase().includes(q) ||
        e.category.toLowerCase().includes(q) ||
        (e.sourceDoc ?? "").toLowerCase().includes(q) ||
        (e.notes ?? "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [allEntries, filterCat, search]);

  const grouped = useMemo(() => {
    const map: Record<string, typeof filtered> = {};
    for (const e of filtered) {
      if (!map[e.category]) map[e.category] = [];
      map[e.category].push(e);
    }
    return map;
  }, [filtered]);

  const allFilteredIds = filtered.map(e => e.id);
  const allSelected = allFilteredIds.length > 0 && allFilteredIds.every(id => selectedIds.has(id));

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds(prev => { const s = new Set(prev); allFilteredIds.forEach(id => s.delete(id)); return s; });
    } else {
      setSelectedIds(prev => { const s = new Set(prev); allFilteredIds.forEach(id => s.add(id)); return s; });
    }
  }

  function openEdit(item: KnowledgeEntry) {
    setEditingItem(item);
    setEditForm({ category: item.category, key: item.key, value: item.value, sourceDoc: item.sourceDoc ?? "", notes: item.notes ?? "" });
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search entries…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-8 pl-8 text-sm"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <Select value={filterCat} onValueChange={setFilterCat}>
          <SelectTrigger className="h-8 w-44 text-sm">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map(c => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm" variant={showDeprecated ? "default" : "outline"}
          className="h-8 gap-1.5 text-xs"
          onClick={() => setShowDeprecated(v => !v)}
        >
          <Archive className="h-3.5 w-3.5" /> {showDeprecated ? "Hide deprecated" : "Show deprecated"}
        </Button>
        <Button size="sm" variant="outline" onClick={() => { setShowAdd(v => !v); setEditingItem(null); }} className="h-8 gap-1.5">
          <Plus className="h-3.5 w-3.5" /> Add entry
        </Button>
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-amber-500/10 border border-amber-500/30 rounded-lg text-sm">
          <span className="text-amber-400 font-medium">{selectedIds.size} selected</span>
          <Button
            size="sm" variant="ghost" className="h-7 gap-1 text-destructive hover:text-destructive ml-auto"
            onClick={() => {
              if (!confirm(`Permanently delete ${selectedIds.size} entries? This cannot be undone.`)) return;
              bulkDelete.mutate({ ids: Array.from(selectedIds) });
            }}
            disabled={bulkDelete.isPending}
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete selected
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSelectedIds(new Set())}>
            <X className="h-3.5 w-3.5" /> Clear
          </Button>
        </div>
      )}

      {/* New entry form */}
      {showAdd && (
        <Card className="mb-4 border-amber-500/30 bg-amber-500/5">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm">New Knowledge Entry</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 pb-3 px-4 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Category (e.g. db_schema)" value={newRow.category} onChange={e => setNewRow(r => ({ ...r, category: e.target.value }))} className="h-8 text-sm" />
              <Input placeholder="Key (unique within category)" value={newRow.key} onChange={e => setNewRow(r => ({ ...r, key: e.target.value }))} className="h-8 text-sm" />
            </div>
            <textarea
              placeholder="Value"
              value={newRow.value}
              onChange={e => setNewRow(r => ({ ...r, value: e.target.value }))}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px] resize-y"
            />
            <Input placeholder="Source doc (optional, e.g. drizzle/schema.ts:42)" value={newRow.sourceDoc} onChange={e => setNewRow(r => ({ ...r, sourceDoc: e.target.value }))} className="h-8 text-sm" />
            <textarea
              placeholder="Notes for AI agents (optional)"
              value={newRow.notes}
              onChange={e => setNewRow(r => ({ ...r, notes: e.target.value }))}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[48px] resize-y"
            />
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button size="sm" onClick={() => upsert.mutate(newRow)} disabled={!newRow.category || !newRow.key || !newRow.value || upsert.isPending}>Save</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Edit dialog */}
      {editingItem && (
        <Card className="mb-4 border-blue-500/30 bg-blue-500/5">
          <CardHeader className="py-3 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Edit Entry #{editingItem.id}</CardTitle>
              <button onClick={() => setEditingItem(null)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
          </CardHeader>
          <CardContent className="pt-0 pb-3 px-4 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Category" value={editForm.category} onChange={e => setEditForm(r => ({ ...r, category: e.target.value }))} className="h-8 text-sm" />
              <Input placeholder="Key" value={editForm.key} onChange={e => setEditForm(r => ({ ...r, key: e.target.value }))} className="h-8 text-sm" />
            </div>
            <textarea
              placeholder="Value"
              value={editForm.value}
              onChange={e => setEditForm(r => ({ ...r, value: e.target.value }))}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px] resize-y"
            />
            <Input placeholder="Source doc" value={editForm.sourceDoc} onChange={e => setEditForm(r => ({ ...r, sourceDoc: e.target.value }))} className="h-8 text-sm" />
            <textarea
              placeholder="Notes for AI agents"
              value={editForm.notes}
              onChange={e => setEditForm(r => ({ ...r, notes: e.target.value }))}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[48px] resize-y"
            />
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setEditingItem(null)}>Cancel</Button>
              <Button size="sm" onClick={() => upsert.mutate({ id: editingItem.id, ...editForm })} disabled={!editForm.category || !editForm.key || !editForm.value || upsert.isPending}>Save changes</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats row */}
      <div className="flex items-center gap-3 mb-3 text-xs text-muted-foreground">
        <span>{filtered.length} of {allEntries.length} entries</span>
        {filtered.length > 0 && (
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} className="h-3.5 w-3.5 rounded accent-amber-500" />
            Select all visible
          </label>
        )}
      </div>

      {/* Grouped entries */}
      <div className="space-y-4">
        {Object.entries(grouped).map(([cat, items]) => (
          <div key={cat}>
            <h3 className={`text-xs font-semibold uppercase tracking-wider mb-2 px-1 ${
              cat.startsWith("deprecated") ? "text-red-400/70" : "text-muted-foreground"
            }`}>
              {cat.startsWith("deprecated") && <Archive className="inline h-3 w-3 mr-1" />}
              {cat} <span className="font-normal">({items.length})</span>
            </h3>
            <div className="space-y-1">
              {items.map(item => (
                <KnowledgeEntryRow
                  key={item.id}
                  item={item}
                  selected={selectedIds.has(item.id)}
                  onToggleSelect={() => setSelectedIds(prev => {
                    const s = new Set(prev);
                    if (s.has(item.id)) s.delete(item.id); else s.add(item.id);
                    return s;
                  })}
                  onEdit={openEdit}
                  onDelete={(id) => {
                    if (!confirm("Permanently delete this entry?")) return;
                    deleteK.mutate({ id });
                  }}
                  onMarkDeprecated={(id) => {
                    const reason = prompt("Deprecation reason (optional):") ?? undefined;
                    markDeprecated.mutate({ id, reason });
                  }}
                />
              ))}
            </div>
          </div>
        ))}
        {filtered.length === 0 && !knowledgeQuery.isLoading && (
          <div className="text-center text-muted-foreground text-sm py-8">
            {search || filterCat !== "all" ? "No entries match your filter." : "No knowledge entries yet."}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Audit Log Tab ────────────────────────────────────────────────────────────
function AuditTab() {
  const [filterCategory, setFilterCategory] = useState("all");
  const [offset, setOffset] = useState(0);
  const PAGE = 50;

  const auditQuery = trpc.superAdmin.audit.list.useQuery({
    category: filterCategory !== "all" ? filterCategory : undefined,
    limit: PAGE,
    offset,
  });

  const entries = auditQuery.data ?? [];

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4">
        <Select value={filterCategory} onValueChange={v => { setFilterCategory(v); setOffset(0); }}>
          <SelectTrigger className="w-40 h-8 text-sm">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {["auth", "member", "data", "system", "security"].map(c => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="ghost" size="sm" onClick={() => auditQuery.refetch()} className="h-8 px-2">
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="space-y-1">
        {entries.map(entry => (
          <div key={String(entry.id)} className="bg-card border border-border/40 rounded-lg px-3 py-2 text-sm">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${entry.outcome === "success" ? "text-emerald-400 border-emerald-500/30" : "text-red-400 border-red-500/30"}`}>
                {entry.outcome}
              </Badge>
              <span className="font-mono text-xs text-amber-400/80">{entry.action}</span>
              <span className="text-xs text-muted-foreground">{entry.actorName ?? entry.actorEmail ?? `User #${entry.actorUserId}`}</span>
              <span className="text-xs text-muted-foreground ml-auto">{new Date(entry.createdAt).toLocaleString()}</span>
            </div>
            {entry.metadata != null && (
              <p className="text-xs text-muted-foreground mt-1 font-mono truncate">{JSON.stringify(entry.metadata as object)}</p>
            )}
          </div>
        ))}
        {entries.length === 0 && !auditQuery.isLoading && (
          <div className="text-center text-muted-foreground text-sm py-8">No audit entries found.</div>
        )}
      </div>

      <div className="flex gap-2 mt-4 justify-center">
        <Button variant="outline" size="sm" disabled={offset === 0} onClick={() => setOffset(o => Math.max(0, o - PAGE))}>Previous</Button>
        <Button variant="outline" size="sm" disabled={entries.length < PAGE} onClick={() => setOffset(o => o + PAGE)}>Next</Button>
      </div>
    </div>
  );
}

// ─── Users Tab ────────────────────────────────────────────────────────────────
function UsersTab() {
  const { user: currentUser } = useAuth();
  const utils = trpc.useUtils();

  const usersQuery = trpc.superAdmin.users.list.useQuery();
  const promote = trpc.superAdmin.users.promoteToSystemAdmin.useMutation({
    onSuccess: () => { utils.superAdmin.users.list.invalidate(); toast.success("User promoted to system_admin"); },
    onError: (e) => toast.error(e.message),
  });
  const demote = trpc.superAdmin.users.demoteToUser.useMutation({
    onSuccess: () => { utils.superAdmin.users.list.invalidate(); toast.success("User demoted to user"); },
    onError: (e) => toast.error(e.message),
  });

  const users = usersQuery.data ?? [];

  return (
    <div>
      <p className="text-sm text-muted-foreground mb-4">{users.length} registered accounts</p>
      <div className="space-y-1">
        {users.map(u => (
          <div key={u.id} className="flex items-center gap-3 bg-card border border-border/40 rounded-lg px-3 py-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{u.name ?? "—"}</p>
              <p className="text-xs text-muted-foreground truncate">{u.email ?? u.openId}</p>
            </div>
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 shrink-0 ${u.role === "system_admin" ? "text-amber-400 border-amber-500/30" : "text-muted-foreground border-border"}`}>
              {u.role}
            </Badge>
            <p className="text-xs text-muted-foreground shrink-0 hidden md:block">
              {u.lastSignedIn ? new Date(u.lastSignedIn).toLocaleDateString() : "Never"}
            </p>
            {u.id !== currentUser?.id && (
              u.role === "system_admin" ? (
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive" onClick={() => demote.mutate({ userId: u.id })}>
                  Demote
                </Button>
              ) : (
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-amber-500/70 hover:text-amber-400" onClick={() => promote.mutate({ userId: u.id })}>
                  Promote
                </Button>
              )
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Sync Status Tab ─────────────────────────────────────────────────────────
const PLATFORM_COLORS: Record<string, string> = {
  airbnb: "#FF5A5F",
  vrbo: "#3D6ECC",
  booking_com: "#003580",
  direct: "#2AAFA9",
  zillow: "#006AFF",
  apartments_com: "#E8943A",
  other: "#94a3b8",
};

const SYNC_MATRIX_NOTES: Record<string, Record<string, string>> = {
  // propertyId → platformId → note
};

function SyncStatusTab() {
  const householdQuery = trpc.household.getMyHousehold.useQuery();
  const householdId = householdQuery.data?.household?.id;
  const propertiesQuery = trpc.properties.list.useQuery(
    householdId ? { householdId } : undefined as any,
    { enabled: !!householdId, staleTime: 30000 }
  );
  const properties = (propertiesQuery.data || []).filter((p: any) => ["rental_str", "vacation"].includes(p.type));

  // Fetch platforms for each STR property
  const platformQueries = properties.map((p: any) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    trpc.properties.listPlatforms.useQuery({ propertyId: p.id }, { staleTime: 30000 })
  );

  const isLoading = householdQuery.isLoading || propertiesQuery.isLoading || platformQueries.some(q => q.isLoading);

  const now = Date.now();
  const fourHoursAgo = now - 4 * 60 * 60 * 1000;
  const oneDayAgo = now - 24 * 60 * 60 * 1000;

  const getSyncStatus = (platform: any): { status: "ok" | "stale" | "error" | "inactive" | "never"; label: string; detail: string } => {
    if (!platform.isActive) return { status: "inactive", label: "Inactive", detail: "Platform marked inactive — may push blocks to other calendars" };
    if (!platform.icalUrl) return { status: "error", label: "No iCal", detail: "No iCal URL configured" };
    if (!platform.lastPolledAt) return { status: "never", label: "Never synced", detail: "iCal has never been polled" };
    if (platform.lastError) return { status: "error", label: "Poll error", detail: platform.lastError.slice(0, 120) };
    if (platform.lastPolledAt < fourHoursAgo) return { status: "stale", label: "Stale", detail: `Last synced ${new Date(platform.lastPolledAt).toLocaleString()}` };
    return { status: "ok", label: "Synced", detail: `Last synced ${new Date(platform.lastPolledAt).toLocaleString()}` };
  };

  const statusIcon = (status: string) => {
    if (status === "ok") return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />;
    if (status === "stale") return <Clock className="h-3.5 w-3.5 text-amber-400" />;
    if (status === "inactive") return <WifiOff className="h-3.5 w-3.5 text-red-400" />;
    if (status === "error") return <XCircle className="h-3.5 w-3.5 text-red-400" />;
    return <AlertTriangle className="h-3.5 w-3.5 text-slate-400" />;
  };

  const statusBg = (status: string) => {
    if (status === "ok") return "bg-emerald-500/10 border-emerald-500/20";
    if (status === "stale") return "bg-amber-500/10 border-amber-500/20";
    if (status === "inactive") return "bg-red-500/15 border-red-500/40";
    if (status === "error") return "bg-red-500/10 border-red-500/20";
    return "bg-slate-500/10 border-slate-500/20";
  };

  // Summary counts
  const allPlatforms = platformQueries.flatMap(q => q.data || []);
  const criticalCount = allPlatforms.filter((p: any) => !p.isActive && p.icalUrl).length;
  const errorCount = allPlatforms.filter((p: any) => p.isActive && p.lastError).length;
  const staleCount = allPlatforms.filter((p: any) => p.isActive && !p.lastError && p.lastPolledAt && p.lastPolledAt < fourHoursAgo).length;
  const okCount = allPlatforms.filter((p: any) => p.isActive && !p.lastError && p.lastPolledAt && p.lastPolledAt >= fourHoursAgo).length;

  return (
    <div className="space-y-6">
      {/* Summary row */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Synced", count: okCount, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
          { label: "Stale", count: staleCount, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
          { label: "Error", count: errorCount, color: "text-red-400", bg: "bg-red-500/10 border-red-500/20" },
          { label: "Critical", count: criticalCount, color: "text-red-400", bg: "bg-red-500/15 border-red-500/40" },
        ].map(s => (
          <div key={s.label} className={`rounded-lg border p-3 ${s.bg}`}>
            <p className={`text-xl font-bold ${s.color}`}>{s.count}</p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Critical alert */}
      {criticalCount > 0 && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/8 p-3 flex items-start gap-2">
          <WifiOff className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-400">⛔ Critical: Inactive listing detected</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              An inactive listing on VRBO or another platform may still be pushing calendar blocks to your other platforms.
              This can cause false double-booking blocks on Airbnb and Booking.com even when the property is available.
              Go to the platform and either reactivate the listing or remove the iCal export URL.
            </p>
          </div>
        </div>
      )}

      {/* Matrix */}
      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-16 bg-muted/30 rounded animate-pulse" />)}</div>
      ) : properties.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No short-term rental properties found.</p>
      ) : (
        <div className="space-y-4">
          {properties.map((prop: any, pi: number) => {
            const platforms = platformQueries[pi]?.data || [];
            return (
              <Card key={prop.id} className="overflow-hidden">
                <CardHeader className="pb-2 flex-row items-center gap-2">
                  <Activity className="h-4 w-4" style={{ color: "#E8943A" }} />
                  <CardTitle className="text-sm">{prop.name}</CardTitle>
                  <span className="text-xs text-muted-foreground ml-auto">{platforms.length} platform{platforms.length !== 1 ? "s" : ""}</span>
                </CardHeader>
                <CardContent className="pt-0">
                  {platforms.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No platforms configured.</p>
                  ) : (
                    <div className="grid gap-2">
                      {platforms.map((platform: any) => {
                        const sync = getSyncStatus(platform);
                        const pColor = PLATFORM_COLORS[platform.platform] || "#94a3b8";
                        return (
                          <div key={platform.id} className={`rounded-md border p-2.5 ${statusBg(sync.status)}`}>
                            <div className="flex items-center gap-2">
                              <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: pColor }} />
                              <span className="text-xs font-medium capitalize" style={{ color: pColor }}>
                                {platform.displayName || platform.platform.replace("_", ".")}
                              </span>
                              <div className="flex items-center gap-1 ml-auto">
                                {statusIcon(sync.status)}
                                <span className="text-[10px] font-medium text-muted-foreground">{sync.label}</span>
                              </div>
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-1 ml-4" title={sync.detail}>
                              {sync.detail.length > 80 ? sync.detail.slice(0, 80) + "…" : sync.detail}
                            </p>
                            {sync.status === "inactive" && (
                              <div className="mt-1.5 ml-4 flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3 text-red-400" />
                                <span className="text-[10px] text-red-400 font-medium">
                                  CRITICAL: Inactive listing may push blocks to other calendars
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Maintenance section */}
      <Card className="border-amber-500/20 bg-amber-500/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="h-4 w-4 text-amber-400" />
            <span>Maintenance Actions</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <BackfillShadowBlocksPanel />
        </CardContent>
      </Card>

      <p className="text-[10px] text-muted-foreground text-center">
        Sync matrix generated at {new Date().toLocaleString()} · iCal heartbeat runs every 10 min
      </p>
    </div>
  );
}

function BackfillShadowBlocksPanel() {
  const [scope, setScope] = React.useState<"all" | "household" | "calendars">("all");
  const [selectedHouseholdId, setSelectedHouseholdId] = React.useState("");
  const [windowDays, setWindowDays] = React.useState(90);
  const [result, setResult] = React.useState<{ totalQueued: number; calendarsProcessed: number } | null>(null);

  const householdsQuery = trpc.superAdmin.maintenance.listHouseholdsForBackfill.useQuery();
  const households = householdsQuery.data || [];

  // When scope = "household", also list calendars for that household
  const householdCalendarsQuery = trpc.calendar.list.useQuery(
    selectedHouseholdId ? { householdId: selectedHouseholdId } : undefined as any,
    { enabled: scope === "calendars" && !!selectedHouseholdId }
  );
  const availableCalendars = (householdCalendarsQuery.data || []).filter((c: any) => c.provider !== "ical");
  const [selectedCalendarIds, setSelectedCalendarIds] = React.useState<string[]>([]);

  const backfillMutation = trpc.superAdmin.maintenance.repropagateCalendars.useMutation({
    onSuccess: (data) => {
      setResult(data);
      toast.success(`Backfill queued: ${data.totalQueued} events across ${data.calendarsProcessed} calendars`);
    },
    onError: (err) => toast.error(`Backfill failed: ${err.message}`),
  });

  const selectedHousehold = households.find((h: any) => h.id === selectedHouseholdId);
  const universeName = selectedHousehold?.groupName || "Universe";

  const canRun = (() => {
    if (scope === "all") return true;
    if (scope === "household") return !!selectedHouseholdId;
    return !!selectedHouseholdId && selectedCalendarIds.length > 0;
  })();

  const handleRun = () => {
    setResult(null);
    backfillMutation.mutate({
      scope,
      householdId: selectedHouseholdId || undefined,
      calendarIds: scope === "calendars" ? selectedCalendarIds : undefined,
      windowDays,
    });
  };

  const toggleCalendar = (id: string) =>
    setSelectedCalendarIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-medium mb-0.5">Backfill Shadow Blocks</p>
        <p className="text-[10px] text-muted-foreground">
          Re-propagates missing shadow blocks for events that have none. Idempotent — safe to run multiple times.
          Only processes non-iCal calendars within the selected window.
        </p>
      </div>

      {/* Scope selector */}
      <div className="space-y-2">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Scope</p>
        <div className="flex gap-2 flex-wrap">
          {([
            { value: "all", label: "All Universes" },
            { value: "household", label: "Select Universe" },
            { value: "calendars", label: "Select Calendars" },
          ] as const).map(opt => (
            <button
              key={opt.value}
              onClick={() => { setScope(opt.value); setSelectedCalendarIds([]); }}
              className={`text-[10px] px-2.5 py-1 rounded-md border transition-colors ${
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

      {/* Universe picker */}
      {(scope === "household" || scope === "calendars") && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Universe</p>
          {householdsQuery.isLoading ? (
            <div className="h-8 bg-muted/30 rounded animate-pulse" />
          ) : (
            <Select value={selectedHouseholdId} onValueChange={v => { setSelectedHouseholdId(v); setSelectedCalendarIds([]); }}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Choose a universe…" />
              </SelectTrigger>
              <SelectContent>
                {households.map((h: any) => (
                  <SelectItem key={h.id} value={h.id} className="text-xs">
                    {h.name} <span className="text-muted-foreground">({h.groupName || "Household"} · {h.calendarCount} cals)</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      {/* Calendar multi-select */}
      {scope === "calendars" && selectedHouseholdId && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
            Calendars ({selectedCalendarIds.length} selected)
          </p>
          {householdCalendarsQuery.isLoading ? (
            <div className="h-20 bg-muted/30 rounded animate-pulse" />
          ) : availableCalendars.length === 0 ? (
            <p className="text-[10px] text-muted-foreground">No calendars found for this universe.</p>
          ) : (
            <div className="max-h-40 overflow-y-auto rounded-md border border-border/50 divide-y divide-border/30">
              {availableCalendars.map((cal: any) => (
                <label key={cal.id} className="flex items-center gap-2 px-2.5 py-1.5 hover:bg-muted/20 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedCalendarIds.includes(cal.id)}
                    onChange={() => toggleCalendar(cal.id)}
                    className="h-3 w-3 accent-amber-400"
                  />
                  <span className="text-[10px] truncate">{cal.name}</span>
                  {cal.accountEmail && (
                    <span className="text-[9px] text-muted-foreground ml-auto shrink-0">{cal.accountEmail}</span>
                  )}
                </label>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={() => setSelectedCalendarIds(availableCalendars.map((c: any) => c.id))} className="text-[10px] text-amber-400 hover:underline">Select all</button>
            <span className="text-[10px] text-muted-foreground">·</span>
            <button onClick={() => setSelectedCalendarIds([])} className="text-[10px] text-muted-foreground hover:underline">Clear</button>
          </div>
        </div>
      )}

      {/* Window days */}
      <div className="flex items-center gap-3">
        <p className="text-[10px] text-muted-foreground shrink-0">Look-back window:</p>
        {[30, 60, 90, 180].map(d => (
          <button
            key={d}
            onClick={() => setWindowDays(d)}
            className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
              windowDays === d
                ? "bg-amber-500/20 border-amber-500/40 text-amber-300"
                : "border-border text-muted-foreground hover:border-amber-500/30"
            }`}
          >{d}d</button>
        ))}
      </div>

      {/* Run button */}
      <button
        onClick={handleRun}
        disabled={backfillMutation.isPending || !canRun}
        className="w-full rounded-md bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs px-3 py-2 hover:bg-amber-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
      >
        {backfillMutation.isPending
          ? "Running backfill…"
          : scope === "all"
            ? `Run Backfill — All Universes (${windowDays}d)`
            : scope === "household" && selectedHousehold
              ? `Run Backfill — ${selectedHousehold.name} ${universeName} (${windowDays}d)`
              : `Run Backfill — ${selectedCalendarIds.length} Calendar${selectedCalendarIds.length !== 1 ? "s" : ""} (${windowDays}d)`
        }
      </button>

      {/* Result */}
      {result && (
        <div className="rounded-md bg-emerald-500/10 border border-emerald-500/20 p-2.5">
          <p className="text-xs text-emerald-400 font-medium">
            ✓ Backfill queued: {result.totalQueued} events across {result.calendarsProcessed} calendars
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Shadow blocks are being written asynchronously. Allow 1–2 minutes for all blocks to propagate.
          </p>
        </div>
      )}
      {backfillMutation.isError && (
        <p className="text-[10px] text-red-400">Error: {backfillMutation.error.message}</p>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function SuperAdmin() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-400" />
      </div>
    );
  }

  if (!user || user.role !== "system_admin") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <ShieldAlert className="h-12 w-12 text-muted-foreground" />
        <h2 className="text-xl font-semibold">Access Denied</h2>
        <p className="text-sm text-muted-foreground text-center max-w-sm">
          This area is restricted to Geeves.life platform administrators only.
          Your account does not have the required <code className="bg-muted px-1 rounded">system_admin</code> role.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="h-10 w-10 rounded-lg bg-amber-500/15 flex items-center justify-center">
          <ShieldAlert className="h-5 w-5 text-amber-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight">
            Super Admin <span className="text-amber-400">Portal</span>
          </h1>
          <p className="text-xs text-muted-foreground">Geeves.life Platform Team — internal use only</p>
        </div>
        <Badge variant="outline" className="ml-auto text-amber-400 border-amber-500/30 text-xs">
          {user.name} · system_admin
        </Badge>
      </div>

      <Tabs defaultValue="tasks">
        <TabsList className="mb-4 bg-card border border-border/50">
          <TabsTrigger value="tasks" className="gap-1.5 data-[state=active]:text-amber-400">
            <ClipboardList className="h-3.5 w-3.5" /> Project Tasks
          </TabsTrigger>
          <TabsTrigger value="knowledge" className="gap-1.5 data-[state=active]:text-amber-400">
            <BookOpen className="h-3.5 w-3.5" /> Knowledge Base
          </TabsTrigger>
          <TabsTrigger value="audit" className="gap-1.5 data-[state=active]:text-amber-400">
            <ScrollText className="h-3.5 w-3.5" /> Audit Log
          </TabsTrigger>
          <TabsTrigger value="users" className="gap-1.5 data-[state=active]:text-amber-400">
            <Users className="h-3.5 w-3.5" /> Users
          </TabsTrigger>
          <TabsTrigger value="data" className="gap-1.5 data-[state=active]:text-amber-400">
            <Database className="h-3.5 w-3.5" /> Data Classification
          </TabsTrigger>
          <TabsTrigger value="beta" className="gap-1.5 data-[state=active]:text-amber-400">
            <Tag className="h-3.5 w-3.5" /> Beta Signups
          </TabsTrigger>
          <TabsTrigger value="contact" className="gap-1.5 data-[state=active]:text-amber-400">
            <ScrollText className="h-3.5 w-3.5" /> Contact Messages
          </TabsTrigger>
          <TabsTrigger value="sync" className="gap-1.5 data-[state=active]:text-amber-400">
            <Wifi className="h-3.5 w-3.5" /> Sync Status
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tasks">
          <TasksTab />
        </TabsContent>
        <TabsContent value="knowledge">
          <KnowledgeTab />
        </TabsContent>
        <TabsContent value="audit">
          <AuditTab />
        </TabsContent>
        <TabsContent value="users">
          <UsersTab />
        </TabsContent>
        <TabsContent value="data">
          <DataClassificationTab />
        </TabsContent>
        <TabsContent value="beta">
          <BetaSignupsTab />
        </TabsContent>
        <TabsContent value="contact">
          <ContactMessagesTab />
        </TabsContent>
        <TabsContent value="sync">
          <SyncStatusTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Data Classification Tab ──────────────────────────────────────────────────
const CATEGORY_COLORS: Record<string, string> = {
  financial:     "bg-red-500/15 text-red-400 border-red-500/30",
  private:       "bg-purple-500/15 text-purple-400 border-purple-500/30",
  guest_pii:     "bg-orange-500/15 text-orange-400 border-orange-500/30",
  operational:   "bg-blue-500/15 text-blue-400 border-blue-500/30",
};

function DataClassificationTab() {
  const [filterCategory, setFilterCategory] = useState("all");
  const registryQuery = trpc.superAdmin.dataClassification.list.useQuery();
  const registry = registryQuery.data;

  const filteredByTable = useMemo(() => {
    if (!registry?.byTable) return {};
    if (filterCategory === "all") return registry.byTable;
    const result: typeof registry.byTable = {};
    for (const [table, fields] of Object.entries(registry.byTable)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const matching = fields.filter(f => f.categories.includes(filterCategory as any));
      if (matching.length > 0) result[table] = matching;
    }
    return result;
  }, [registry, filterCategory]);

  const totalFiltered = Object.values(filteredByTable).reduce((a, b) => a + b.length, 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm text-muted-foreground">
            {registry ? `${totalFiltered} classified fields across ${Object.keys(filteredByTable).length} tables` : "Loading..."}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            This registry controls which fields are stripped from API responses for restricted members (e.g. Cary-style access).
            To add new fields, edit <code className="bg-muted px-1 rounded">server/services/dataClassification.ts</code>.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => registryQuery.refetch()} className="h-8 px-2">
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Category filter */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => setFilterCategory("all")}
          className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${filterCategory === "all" ? "bg-amber-500/15 text-amber-400 border-amber-500/30" : "border-border/50 text-muted-foreground hover:border-border"}`}
        >
          All categories
        </button>
        {(registry?.categories ?? []).map(cat => (
          <button
            key={cat}
            onClick={() => setFilterCategory(cat)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${filterCategory === cat ? (CATEGORY_COLORS[cat] ?? "bg-slate-500/15 text-slate-400 border-slate-500/30") : "border-border/50 text-muted-foreground hover:border-border"}`}
          >
            {cat}
          </button>
        ))}
      </div>

      {registryQuery.isLoading ? (
        <div className="text-muted-foreground text-sm py-8 text-center">Loading registry...</div>
      ) : (
        <div className="space-y-4">
          {Object.entries(filteredByTable).map(([tableName, fields]) => (
            <div key={tableName}>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1 flex items-center gap-1.5">
                <Database className="h-3 w-3" /> {tableName} <span className="font-normal">({fields.length} classified fields)</span>
              </h3>
              <div className="space-y-1">
                {fields.map((field, i) => (
                  <div key={i} className="flex items-start gap-3 bg-card border border-border/40 rounded-lg px-3 py-2">
                    <code className="text-xs font-mono text-amber-400/80 shrink-0 mt-0.5 w-40 truncate">{field.field}</code>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground/80">{field.description}</p>
                      {field.redactedValue !== undefined && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Redacted as: <code className="bg-muted px-1 rounded">{String(field.redactedValue)}</code>
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1 shrink-0">
                      {field.categories.map(cat => (
                        <span
                          key={cat}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${CATEGORY_COLORS[cat] ?? "bg-slate-500/15 text-slate-400 border-slate-500/30"}`}
                        >
                          <Tag className="h-2.5 w-2.5" /> {cat}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {Object.keys(filteredByTable).length === 0 && (
            <div className="text-center text-muted-foreground text-sm py-8">
              No fields classified under "{filterCategory}".
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Beta Signups Tab ─────────────────────────────────────────────────────────
function BetaSignupsTab() {
  const { data, isLoading, refetch } = trpc.landing.listBetaSignups.useQuery({ status: "all" });

  const ICP_LABELS: Record<string, string> = {
    individual: "Individual",
    family: "Family / Household",
    caregiver: "Caregiver",
    professional: "Professional",
    other: "Other",
  };

  const PRIORITY_COLORS: Record<string, string> = {
    high:   "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    medium: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    low:    "bg-slate-500/15 text-slate-400 border-slate-500/30",
  };

  if (isLoading) {
    return <div className="text-center text-muted-foreground py-12 text-sm">Loading signups…</div>;
  }

  const signups = data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{signups.length} beta signup{signups.length !== 1 ? "s" : ""} total</p>
        <Button size="sm" variant="outline" onClick={() => refetch()} className="gap-1.5 h-7 text-xs">
          <RefreshCw className="h-3 w-3" /> Refresh
        </Button>
      </div>

      {signups.length === 0 ? (
        <div className="text-center text-muted-foreground py-12 text-sm">No beta signups yet.</div>
      ) : (
        <div className="rounded-lg border border-border/50 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 border-b border-border/50">
              <tr>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Name</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Email</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">ICP Type</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Household Size</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Priority</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Signed Up</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {signups.map((s: any) => (
                <tr key={s.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 font-medium">{s.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{s.email}</td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className="text-xs">{ICP_LABELS[s.icpType] ?? s.icpType}</Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-center">{s.householdSize ?? "—"}</td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className={`text-xs ${PRIORITY_COLORS[s.icpPriority] ?? ""}`}>
                      {s.icpPriority ?? "—"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {new Date(s.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Contact Messages Tab ─────────────────────────────────────────────────────
function ContactMessagesTab() {
  const { data, isLoading, refetch } = trpc.landing.listContactMessages.useQuery({ unreadOnly: false });

  if (isLoading) {
    return <div className="text-center text-muted-foreground py-12 text-sm">Loading messages…</div>;
  }

  const messages = data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{messages.length} message{messages.length !== 1 ? "s" : ""} total</p>
        <Button size="sm" variant="outline" onClick={() => refetch()} className="gap-1.5 h-7 text-xs">
          <RefreshCw className="h-3 w-3" /> Refresh
        </Button>
      </div>

      {messages.length === 0 ? (
        <div className="text-center text-muted-foreground py-12 text-sm">No contact messages yet.</div>
      ) : (
        <div className="space-y-3">
          {messages.map((m: any) => (
            <Card key={m.id} className="border-border/50">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start justify-between gap-4 mb-2">
                  <div>
                    <p className="font-medium text-sm">{m.name}</p>
                    <p className="text-xs text-muted-foreground">{m.email}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <Badge variant="outline" className="text-xs mb-1">{m.subject}</Badge>
                    <p className="text-xs text-muted-foreground">{new Date(m.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed border-t border-border/30 pt-2 mt-2">
                  {m.message}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
