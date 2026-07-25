/**
 * WidgetGrid — Geeves.Life Dashboard Widget Layout System
 *
 * Features:
 *   - Drag-to-reorder on BOTH desktop (mouse) and mobile (touch) using pointer events
 *   - Long-press (400ms) activates drag on touch; immediate drag on desktop
 *   - Visibility toggles per widget in edit mode
 *   - Server-side persistence via trpc.dashboard.saveLayout
 *   - Falls back to DEFAULT_WIDGET_ORDER when no saved layout exists
 *
 * Widget IDs (stable, never change — they are the persistence keys):
 *   calendar | properties | shopping | tasks | financials | analytics | resources | constellation
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { GripVertical, Eye, EyeOff, Settings2, Check, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";

// ─── Constants ────────────────────────────────────────────────────────────────

export const DEFAULT_WIDGET_ORDER: string[] = [
  "calendar",
  "properties",
  "shopping",
  "tasks",
  "financials",
  "analytics",
  "resources",
  "constellation",
];

export const WIDGET_LABELS: Record<string, string> = {
  calendar: "Calendar",
  properties: "Properties",
  shopping: "Shopping",
  tasks: "Tasks",
  financials: "Financials",
  analytics: "Spending Analytics",
  resources: "Resources",
  constellation: "Constellation",
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WidgetSlot {
  id: string;
  visible: boolean;
}

interface WidgetGridProps {
  /** Map of widgetId → rendered widget element */
  widgets: Record<string, React.ReactNode>;
  isMobile: boolean;
  mobileLayout?: "stack" | "scroll";
  /** If true, only admin-visible widgets are shown */
  isAdmin?: boolean;
  /** Widgets that require admin access */
  adminOnly?: string[];
}

// ─── useWidgetLayout hook ─────────────────────────────────────────────────────

export function useWidgetLayout() {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.dashboard.getLayout.useQuery(undefined, {
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const saveMutation = trpc.dashboard.saveLayout.useMutation({
    onSuccess: () => {
      utils.dashboard.getLayout.invalidate();
    },
    onError: () => {
      toast.error("Failed to save layout");
    },
  });

  const savedIds = data?.layout ?? null;

  // Build slots: merge saved order with defaults (add new widgets at end)
  const slots: WidgetSlot[] = (() => {
    if (!savedIds) {
      return DEFAULT_WIDGET_ORDER.map((id) => ({ id, visible: true }));
    }
    // Saved layout stores "id" for visible, "-id" for hidden
    const result: WidgetSlot[] = savedIds.map((entry) => ({
      id: entry.startsWith("-") ? entry.slice(1) : entry,
      visible: !entry.startsWith("-"),
    }));
    // Add any new widgets not yet in saved layout
    for (const id of DEFAULT_WIDGET_ORDER) {
      if (!result.find((s) => s.id === id)) {
        result.push({ id, visible: true });
      }
    }
    return result;
  })();

  const saveLayout = useCallback(
    (newSlots: WidgetSlot[]) => {
      const encoded = newSlots.map((s) => (s.visible ? s.id : `-${s.id}`));
      saveMutation.mutate({ layout: encoded });
    },
    [saveMutation]
  );

  return { slots, isLoading, saveLayout, isSaving: saveMutation.isPending };
}

// ─── WidgetGrid component ─────────────────────────────────────────────────────

export function WidgetGrid({
  widgets,
  isMobile,
  mobileLayout = "stack",
  isAdmin = false,
  adminOnly = ["resources"],
}: WidgetGridProps) {
  const { slots, isLoading, saveLayout } = useWidgetLayout();
  const [editMode, setEditMode] = useState(false);
  const [localSlots, setLocalSlots] = useState<WidgetSlot[]>([]);

  // ── Pointer-event drag state ─────────────────────────────────────────────
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  // Track whether pointer is in a "drag-active" state (after long-press on touch)
  const pointerDownRef = useRef<{ idx: number; pointerId: number; x: number; y: number; timer: ReturnType<typeof setTimeout> | null } | null>(null);
  const isDraggingRef = useRef(false);
  const gridRef = useRef<HTMLDivElement | null>(null);

  // Sync localSlots from server when not editing
  useEffect(() => {
    if (!editMode) {
      setLocalSlots(slots);
    }
  }, [slots, editMode]);

  // Filter out admin-only widgets if not admin
  const visibleSlots = localSlots.filter(
    (s) => isAdmin || !adminOnly.includes(s.id)
  );

  // ── Unified pointer drag (works on mouse + touch) ────────────────────────

  const getItemIdxAtPoint = useCallback((x: number, y: number): number => {
    const el = document.elementFromPoint(x, y);
    const item = el?.closest("[data-widget-idx]");
    if (!item) return -1;
    return parseInt((item as HTMLElement).dataset.widgetIdx ?? "-1", 10);
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent, idx: number) => {
      if (!editMode) return;
      // Only primary button / first touch
      if (e.button !== 0 && e.pointerType === "mouse") return;

      const isTouch = e.pointerType === "touch";

      // For touch: start a long-press timer before activating drag
      // For mouse: activate drag immediately
      const timer = isTouch
        ? setTimeout(() => {
            isDraggingRef.current = true;
            setDragIdx(idx);
            if ("vibrate" in navigator) navigator.vibrate(40);
          }, 400)
        : null;

      if (!isTouch) {
        isDraggingRef.current = true;
        setDragIdx(idx);
      }

      pointerDownRef.current = { idx, pointerId: e.pointerId, x: e.clientX, y: e.clientY, timer };
      // Capture pointer so we receive events outside the element
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [editMode]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!editMode || !pointerDownRef.current) return;

      const { x: startX, y: startY, timer } = pointerDownRef.current;
      const dx = Math.abs(e.clientX - startX);
      const dy = Math.abs(e.clientY - startY);

      // If moved more than 8px before long-press fires, cancel the timer (scroll intent)
      if (timer && (dx > 8 || dy > 8)) {
        clearTimeout(timer);
        pointerDownRef.current.timer = null;
        if (!isDraggingRef.current) return;
      }

      if (!isDraggingRef.current) return;

      e.preventDefault();
      const targetIdx = getItemIdxAtPoint(e.clientX, e.clientY);
      if (targetIdx >= 0 && targetIdx !== dragIdx) {
        setOverIdx(targetIdx);
      }
    },
    [editMode, dragIdx, getItemIdxAtPoint]
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!pointerDownRef.current) return;

      const { timer } = pointerDownRef.current;
      if (timer) {
        clearTimeout(timer);
        pointerDownRef.current.timer = null;
      }

      if (isDraggingRef.current) {
        setLocalSlots((prev) => {
          if (dragIdx === null || overIdx === null || dragIdx === overIdx) return prev;
          const next = [...prev];
          const [moved] = next.splice(dragIdx, 1);
          next.splice(overIdx, 0, moved);
          return next;
        });
      }

      isDraggingRef.current = false;
      pointerDownRef.current = null;
      setDragIdx(null);
      setOverIdx(null);
    },
    [dragIdx, overIdx]
  );

  const onPointerCancel = useCallback(() => {
    if (pointerDownRef.current?.timer) {
      clearTimeout(pointerDownRef.current.timer);
    }
    isDraggingRef.current = false;
    pointerDownRef.current = null;
    setDragIdx(null);
    setOverIdx(null);
  }, []);

  // ── Visibility toggle ────────────────────────────────────────────────────

  const toggleVisibility = useCallback((id: string) => {
    setLocalSlots((prev) =>
      prev.map((s) => (s.id === id ? { ...s, visible: !s.visible } : s))
    );
  }, []);

  // ── Edit mode save/cancel ────────────────────────────────────────────────

  const handleSave = useCallback(() => {
    saveLayout(localSlots);
    setEditMode(false);
    toast.success("Layout saved");
  }, [localSlots, saveLayout]);

  const handleCancel = useCallback(() => {
    setLocalSlots(slots);
    setEditMode(false);
  }, [slots]);

  // ── Render ───────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 animate-pulse">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-64 rounded-2xl bg-muted/40" />
        ))}
      </div>
    );
  }

  // Mobile horizontal scroll (no edit mode)
  if (isMobile && mobileLayout === "scroll") {
    return (
      <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory -mx-4 px-4">
        {visibleSlots
          .filter((s) => s.visible)
          .map((slot) =>
            widgets[slot.id] ? (
              <div key={slot.id} className="snap-start shrink-0 w-[85vw]">
                {widgets[slot.id]}
              </div>
            ) : null
          )}
      </div>
    );
  }

  // ── Shared edit-mode toolbar ─────────────────────────────────────────────
  const toolbar = (
    <div className="flex items-center justify-between">
      <div />
      {editMode ? (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground hidden sm:inline">
            Hold &amp; drag to reorder · tap eye to show/hide
          </span>
          <button
            onClick={handleCancel}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors"
          >
            <X className="h-3.5 w-3.5" />
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Check className="h-3.5 w-3.5" />
            Save Layout
          </button>
        </div>
      ) : (
        <button
          onClick={() => {
            setLocalSlots(slots);
            setEditMode(true);
          }}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2 py-1.5 rounded-lg hover:bg-muted transition-colors"
          title="Customise widget layout"
        >
          <Settings2 className="h-3.5 w-3.5" />
          Customise
        </button>
      )}
    </div>
  );

  // ── Mobile stack (with drag-to-reorder in edit mode) ─────────────────────
  if (isMobile) {
    const displaySlots = visibleSlots.filter((s) => editMode || s.visible);
    return (
      <div className="flex flex-col gap-3">
        {toolbar}
        <div className="flex flex-col gap-4" ref={gridRef}>
          {displaySlots.map((slot, idx) => {
            const isDragging = dragIdx === idx;
            const isOver = overIdx === idx;
            return (
              <div
                key={slot.id}
                data-widget-idx={idx}
                className={`relative transition-all duration-200 ${editMode && isDraggingRef.current ? "touch-none" : ""}
                  ${isDragging ? "opacity-40 scale-[0.97]" : ""}
                  ${isOver && editMode ? "ring-2 ring-primary ring-offset-2 rounded-2xl" : ""}
                  ${!slot.visible && editMode ? "opacity-50" : ""}
                `}
                onPointerDown={editMode ? (e) => onPointerDown(e, idx) : undefined}
                onPointerMove={editMode ? onPointerMove : undefined}
                onPointerUp={editMode ? onPointerUp : undefined}
                onPointerCancel={editMode ? onPointerCancel : undefined}
              >
                {/* Edit mode overlay */}
                {editMode && (
                  <div className="absolute top-2 right-2 z-20 flex items-center gap-1.5">
                    <button
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => toggleVisibility(slot.id)}
                      className={`flex items-center gap-1 text-xs px-2 py-1 rounded-md border transition-colors ${
                        slot.visible
                          ? "bg-background/90 border-border text-foreground hover:bg-muted"
                          : "bg-muted/80 border-border text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {slot.visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                      <span>{WIDGET_LABELS[slot.id] ?? slot.id}</span>
                    </button>
                    <div className="cursor-grab active:cursor-grabbing p-1.5 rounded-md bg-background/90 border border-border text-muted-foreground">
                      <GripVertical className="h-3.5 w-3.5" />
                    </div>
                  </div>
                )}
                {widgets[slot.id] ?? null}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Desktop grid with edit mode ──────────────────────────────────────────
  const displaySlots = visibleSlots.filter((s) => editMode || s.visible);
  const fullWidthIds = ["analytics", "resources"];

  return (
    <div className="flex flex-col gap-3">
      {toolbar}
      <div className="grid grid-cols-2 gap-4" ref={gridRef}>
        {displaySlots.map((slot, idx) => {
          const isFullWidth = fullWidthIds.includes(slot.id);
          const isDragging = dragIdx === idx;
          const isOver = overIdx === idx;

          return (
            <div
              key={slot.id}
              data-widget-idx={idx}
              className={`relative transition-all duration-200 select-none
                ${isFullWidth ? "col-span-2" : ""}
                ${isDragging ? "opacity-40 scale-95" : ""}
                ${isOver && editMode ? "ring-2 ring-primary ring-offset-2 rounded-2xl" : ""}
                ${!slot.visible && editMode ? "opacity-50" : ""}
              `}
              onPointerDown={(e) => onPointerDown(e, idx)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerCancel}
            >
              {/* Edit mode overlay */}
              {editMode && (
                <div className="absolute top-2 right-2 z-20 flex items-center gap-1.5">
                  <button
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => toggleVisibility(slot.id)}
                    className={`flex items-center gap-1 text-xs px-2 py-1 rounded-md border transition-colors ${
                      slot.visible
                        ? "bg-background/90 border-border text-foreground hover:bg-muted"
                        : "bg-muted/80 border-border text-muted-foreground hover:bg-muted"
                    }`}
                    title={slot.visible ? "Hide widget" : "Show widget"}
                  >
                    {slot.visible ? (
                      <Eye className="h-3 w-3" />
                    ) : (
                      <EyeOff className="h-3 w-3" />
                    )}
                    <span>{WIDGET_LABELS[slot.id] ?? slot.id}</span>
                  </button>
                  <div
                    className="cursor-grab active:cursor-grabbing p-1.5 rounded-md bg-background/90 border border-border text-muted-foreground hover:text-foreground transition-colors"
                    title="Drag to reorder"
                  >
                    <GripVertical className="h-3.5 w-3.5" />
                  </div>
                </div>
              )}
              {/* Widget content */}
              {widgets[slot.id] ?? null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
