import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Layers, ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/**
 * Collapsible panel shown inside the EventDetailDialog.
 *
 * Displays which calendars will receive a shadow block for this event,
 * and lets the user override the vertical-level defaults on a per-event basis:
 *   - Calendars that are normally EXCLUDED can be toggled IN for this event.
 *   - Calendars that are normally INCLUDED can be toggled OUT for this event.
 */
export function ShadowBlocksPanel({
  eventId,
  calendarId,
  calendars,
}: {
  eventId: string;
  calendarId: string;
  calendars: any[];
}) {
  const [open, setOpen] = useState(false);
  const utils = trpc.useUtils();

  // Load the current shadow overrides for this event
  const overridesQuery = trpc.calendar.shadows.getOverrides.useQuery(
    { eventId },
    { enabled: open }
  );
  const rawOverrides = overridesQuery.data ?? [];
  // rawOverrides is an array of { calendarId, action } rows
  const overrides = {
    included: rawOverrides.filter((o: any) => o.action === "include").map((o: any) => o.calendarId),
    excluded: rawOverrides.filter((o: any) => o.action === "exclude").map((o: any) => o.calendarId),
  };

  // Load all vertical visibility rules so we know the defaults
  const verticalsQuery = trpc.verticals.list.useQuery(undefined, { enabled: open });
  const verticals = verticalsQuery.data ?? [];
  // Load all cross-vertical rules (with calendarExclusions) from a single query
  const allRulesQuery = trpc.verticals.listAllVisibility.useQuery(undefined, { enabled: open });
  const allRules = allRulesQuery.data ?? [];

  const setOverrideMutation = trpc.calendar.shadows.setOverride.useMutation({
    onSuccess: () => {
      toast.success("Shadow block override saved.");
      utils.calendar.shadows.getOverrides.invalidate({ eventId });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const removeOverrideMutation = trpc.calendar.shadows.removeOverride.useMutation({
    onSuccess: () => {
      utils.calendar.shadows.getOverrides.invalidate({ eventId });
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Determine which vertical this event's calendar belongs to
  const sourceCalendar = calendars.find((c: any) => c.id === calendarId);
  const sourceVerticalId = sourceCalendar?.verticalId;

  // Find all rules that originate from this vertical (using the dedicated listAllVisibility query)
  const applicableRules = allRules.filter((r: any) => r.fromVerticalId === sourceVerticalId);

  // Build the full list of target calendars across all applicable rules
  // For each rule, get target-vertical calendars and apply exclusions
  type CalendarRow = {
    calendarId: string;
    calendarName: string;
    calendarColor: string;
    verticalName: string;
    defaultIncluded: boolean; // based on vertical rule exclusions
    overrideIncluded: boolean | null; // null = no override
  };

  const rows: CalendarRow[] = [];
  for (const rule of applicableRules) {
    const targetVertical = verticals.find((v: any) => v.id === rule.toVerticalId);
    if (!targetVertical) continue;
    const targetCals = calendars.filter((c: any) => c.verticalId === rule.toVerticalId);
    for (const cal of targetCals) {
      // Calendar-level opt-out: shadowBlocking === false means this calendar is excluded by default
      const defaultIncluded = cal.shadowBlocking !== false;
      const overrideIncluded = overrides.included.includes(cal.id)
        ? true
        : overrides.excluded.includes(cal.id)
        ? false
        : null;
      rows.push({
        calendarId: cal.id,
        calendarName: cal.name,
        calendarColor: cal.color || "#888",
        verticalName: targetVertical.name,
        defaultIncluded,
        overrideIncluded,
      });
    }
  }

  if (rows.length === 0 && !overridesQuery.isLoading) {
    // Nothing to show — no cross-vertical rules for this calendar's vertical
    if (!open) return null;
  }

  function effectivelyIncluded(row: CalendarRow) {
    if (row.overrideIncluded !== null) return row.overrideIncluded;
    return row.defaultIncluded;
  }

  function handleToggle(row: CalendarRow) {
    const current = effectivelyIncluded(row);
    const newIncluded = !current;
    // If the new state matches the default, remove the override (revert to default)
    if (newIncluded === row.defaultIncluded) {
      removeOverrideMutation.mutate({ eventId, calendarId: row.calendarId });
    } else {
      setOverrideMutation.mutate({
        eventId,
        calendarId: row.calendarId,
        action: newIncluded ? "include" : "exclude",
      });
    }
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-3 py-2 text-xs bg-muted/30 hover:bg-muted/50 transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="flex items-center gap-1.5">
          <Layers className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-medium">Shadow Blocks</span>
          {rows.length > 0 && (
            <Badge variant="outline" className="h-4 text-[10px] px-1">
              {rows.filter(effectivelyIncluded).length}/{rows.length}
            </Badge>
          )}
        </div>
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </button>

      {open && (
        <div className="px-3 py-2 space-y-1.5">
          {overridesQuery.isLoading ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">
              No cross-vertical shadow rules apply to this calendar. Configure them in Settings → Calendars.
            </p>
          ) : (
            <>
              <p className="text-[11px] text-muted-foreground mb-2">
                Toggle which calendars receive a shadow block for <em>this event only</em>. Defaults come from your vertical rules.
              </p>
              <div className="grid grid-cols-1 gap-1">
                {rows.map((row) => {
                  const included = effectivelyIncluded(row);
                  const hasOverride = row.overrideIncluded !== null;
                  return (
                    <button
                      key={row.calendarId}
                      onClick={() => handleToggle(row)}
                      disabled={setOverrideMutation.isPending}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs border transition-colors text-left ${
                        included
                          ? "border-solid border-primary/40 text-foreground bg-primary/5"
                          : "border-dashed border-muted-foreground/40 text-muted-foreground bg-muted/30"
                      }`}
                    >
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ background: row.calendarColor }}
                      />
                      <span className="flex-1 truncate">{row.calendarName}</span>
                      <span className="text-muted-foreground text-[10px] shrink-0">{row.verticalName}</span>
                      {hasOverride && (
                        <Badge variant="secondary" className="h-4 text-[9px] px-1 shrink-0">
                          override
                        </Badge>
                      )}
                      <span
                        className={`text-[10px] shrink-0 ${included ? "text-primary" : "text-muted-foreground"}`}
                      >
                        {included ? "block" : "skip"}
                      </span>
                    </button>
                  );
                })}
              </div>
              {rows.some((r) => r.overrideIncluded !== null) && (
                <button
                  className="text-[10px] text-muted-foreground underline mt-1"
                  onClick={() => {
                    // Remove overrides for all calendars that have one
                    rows
                      .filter((r) => r.overrideIncluded !== null)
                      .forEach((r) =>
                        removeOverrideMutation.mutate({ eventId, calendarId: r.calendarId })
                      );
                  }}
                  disabled={removeOverrideMutation.isPending}
                >
                  Reset all overrides to defaults
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
