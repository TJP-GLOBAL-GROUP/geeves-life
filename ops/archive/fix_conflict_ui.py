import re

with open("/home/ubuntu/geeves-shopping/client/src/pages/Home.tsx", "r") as f:
    src = f.read()

# ── 1. Add conflictsQuery + conflictDays + backToBack + editOverlay state after platformsQuery ──
OLD_AFTER_PLATFORMS = '''  const platformsQuery = trpc.properties.listPlatforms.useQuery({ propertyId: property.id }, { staleTime: 300000 });
  const entries = compositeQuery.data || [];'''

NEW_AFTER_PLATFORMS = '''  const platformsQuery = trpc.properties.listPlatforms.useQuery({ propertyId: property.id }, { staleTime: 300000 });
  const conflictsQuery = trpc.properties.getConflicts.useQuery({ propertyId: property.id }, { staleTime: 60000 });
  const [editOverlay, setEditOverlay] = useState<{ bookingId: string; currentName: string } | null>(null);
  const [editName, setEditName] = useState("");
  const setOverrideMutation = trpc.properties.setBookingOverride.useMutation({
    onSuccess: () => { setEditOverlay(null); conflictsQuery.refetch(); compositeQuery.refetch(); },
  });
  const entries = compositeQuery.data || [];'''

src = src.replace(OLD_AFTER_PLATFORMS, NEW_AFTER_PLATFORMS, 1)

# ── 2. Add conflictDays and backToBackDays computed sets after stalePlatforms ──
OLD_AFTER_STALE = '''  const days = useMemo(() => {'''

NEW_AFTER_STALE = '''  // Build a Set of day timestamps that have a real conflict (overlap > 0 days)
  const conflictDays = useMemo(() => {
    const s = new Set<number>();
    (conflictsQuery.data?.conflicts || []).forEach((c: any) => {
      if (c.severity === "conflict") {
        const start = new Date(c.overlapStart); start.setHours(0,0,0,0);
        const end   = new Date(c.overlapEnd);   end.setHours(0,0,0,0);
        for (let d = start.getTime(); d <= end.getTime(); d += 86400000) s.add(d);
      }
    });
    return s;
  }, [conflictsQuery.data]);
  // Build a Set of day timestamps that are back-to-back (checkout + checkin same day, no prep)
  const backToBackDays = useMemo(() => {
    const s = new Set<number>();
    (conflictsQuery.data?.conflicts || []).forEach((c: any) => {
      if (c.severity === "back_to_back") {
        const d = new Date(c.overlapStart); d.setHours(0,0,0,0);
        s.add(d.getTime());
      }
    });
    return s;
  }, [conflictsQuery.data]);
  const days = useMemo(() => {'''

src = src.replace(OLD_AFTER_STALE, NEW_AFTER_STALE, 1)

# ── 3. Enhance the Gantt cell to flash coral on conflict days and show ↔ on back-to-back ──
OLD_CELL_STYLE = '''          const cellStyle: React.CSSProperties = {
            ...(isPrepDay ? {
              backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(0,0,0,0.12) 3px, rgba(0,0,0,0.12) 4px)",
              backgroundColor: "#E8943A33",
            } : isBlock ? { backgroundColor: "#ef444433" }
              : isUnavail ? { backgroundColor: "#94a3b833" }
              : platformColor ? {
                  backgroundColor: platformColor + "33",
                  outline: `1.5px solid ${verticalColor}`,
                  outlineOffset: "-1px",
                } : {}),
          };'''

NEW_CELL_STYLE = '''          const dayTs = day.getTime();
          const isConflictDay = conflictDays.has(dayTs);
          const isBackToBack  = backToBackDays.has(dayTs);
          const cellStyle: React.CSSProperties = {
            ...(isConflictDay ? {
              backgroundColor: "#E8624A",
              animation: "pulse 1.2s ease-in-out infinite",
            } : isPrepDay ? {
              backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(0,0,0,0.12) 3px, rgba(0,0,0,0.12) 4px)",
              backgroundColor: "#E8943A33",
            } : isBlock ? { backgroundColor: "#ef444433" }
              : isUnavail ? { backgroundColor: "#94a3b833" }
              : platformColor ? {
                  backgroundColor: platformColor + "33",
                  outline: `1.5px solid ${verticalColor}`,
                  outlineOffset: "-1px",
                } : {}),
          };'''

src = src.replace(OLD_CELL_STYLE, NEW_CELL_STYLE, 1)

# ── 4. Add conflict/back-to-back labels and tap-to-edit handler ──
OLD_LABEL = '''          const labelContent = (() => {
            if (!entry || isToday) return null;
            if (isPrepDay) return isFirstDay ? <span className="text-[7px] font-bold" style={{ color: "#E8943A" }}>P</span> : null;
            if (isBlock) return isFirstDay ? <span className="text-[7px] font-bold text-red-400">✕</span> : null;
            if (isUnavail) return isFirstDay ? <span className="text-[7px] text-slate-400">—</span> : null;
            if (isCheckin) return <span className="text-[7px] font-bold" style={{ color: platformColor || verticalColor }}>▲</span>;
            if (isCheckout) return <span className="text-[7px] font-bold" style={{ color: platformColor || verticalColor }}>▼</span>;
            if (!isCompact && platformColor) return <span className="text-[7px] font-bold" style={{ color: platformColor }}>{(entry.platform || "?")[0].toUpperCase()}</span>;
            return null;
          })();'''

NEW_LABEL = '''          const labelContent = (() => {
            if (!entry || isToday) return null;
            if (isConflictDay) return <span className="text-[8px] font-bold text-amber-300">!</span>;
            if (isBackToBack && !isConflictDay) return <span className="text-[8px] font-bold text-amber-400">↔</span>;
            if (isPrepDay) return isFirstDay ? <span className="text-[7px] font-bold" style={{ color: "#E8943A" }}>P</span> : null;
            if (isBlock) return isFirstDay ? <span className="text-[7px] font-bold text-red-400">✕</span> : null;
            if (isUnavail) return isFirstDay ? <span className="text-[7px] text-slate-400">—</span> : null;
            if (isCheckin) return <span className="text-[7px] font-bold" style={{ color: platformColor || verticalColor }}>▲</span>;
            if (isCheckout) return <span className="text-[7px] font-bold" style={{ color: platformColor || verticalColor }}>▼</span>;
            if (!isCompact && platformColor) return <span className="text-[7px] font-bold" style={{ color: platformColor }}>{(entry.platform || "?")[0].toUpperCase()}</span>;
            return null;
          })();'''

src = src.replace(OLD_LABEL, NEW_LABEL, 1)

# ── 5. Add onClick handler for tap-to-edit on block/unavailable cells ──
OLD_CELL_DIV = '''            <div key={i} title={tooltipParts} style={cellStyle}
              className={`flex-1 flex items-center justify-center relative transition-colors ${!entry ? "bg-muted/20" : ""} ${isToday ? "ring-1 ring-primary ring-inset" : ""}`}
            >
              {isToday ? <span className="text-[8px] font-bold text-primary leading-none">T</span> : labelContent}
            </div>'''

NEW_CELL_DIV = '''            <div key={i} title={tooltipParts} style={cellStyle}
              onClick={() => {
                if (entry && (isBlock || isUnavail) && entry.id) {
                  setEditName(entry.guestName || entry.summary || "");
                  setEditOverlay({ bookingId: entry.id, currentName: entry.guestName || entry.summary || "" });
                }
              }}
              className={`flex-1 flex items-center justify-center relative transition-colors ${!entry ? "bg-muted/20" : ""} ${isToday ? "ring-1 ring-primary ring-inset" : ""} ${(isBlock || isUnavail) && entry?.id ? "cursor-pointer" : ""}`}
            >
              {isToday ? <span className="text-[8px] font-bold text-primary leading-none">T</span> : labelContent}
            </div>'''

src = src.replace(OLD_CELL_DIV, NEW_CELL_DIV, 1)

# ── 6. Add the edit overlay dialog just before the closing </div> of the component ──
OLD_CLOSE = '''      {upcoming.length === 0 && entries.length === 0 && (
        <p className="text-[10px] text-muted-foreground text-center py-1">No bookings synced yet</p>
      )}
    </div>
  );
}
function PropertiesWidget'''

NEW_CLOSE = '''      {upcoming.length === 0 && entries.length === 0 && (
        <p className="text-[10px] text-muted-foreground text-center py-1">No bookings synced yet</p>
      )}
      {/* Conflict alert banner */}
      {(conflictsQuery.data?.conflicts || []).filter((c: any) => c.severity === "conflict").length > 0 && (
        <div className="mt-2 rounded-md px-2 py-1.5 flex items-center gap-2 text-[10px] font-medium"
          style={{ backgroundColor: "#E8624A22", border: "1px solid #E8624A66", color: "#E8624A" }}>
          <span className="text-amber-400 font-bold">!</span>
          {(conflictsQuery.data?.conflicts || []).filter((c: any) => c.severity === "conflict").length} double-booking conflict{(conflictsQuery.data?.conflicts || []).filter((c: any) => c.severity === "conflict").length > 1 ? "s" : ""} detected
        </div>
      )}
      {/* Tap-to-edit guest name overlay */}
      {editOverlay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setEditOverlay(null)}>
          <div className="bg-card rounded-xl p-4 w-72 shadow-xl flex flex-col gap-3" onClick={e => e.stopPropagation()}>
            <p className="text-sm font-semibold">Annotate Booking</p>
            <p className="text-[11px] text-muted-foreground">This is an anonymous iCal block. Add the guest name so it appears in the Gantt and upcoming events.</p>
            <input
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Guest name (e.g. Kristina Panova)"
              value={editName}
              onChange={e => setEditName(e.target.value)}
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted/40" onClick={() => setEditOverlay(null)}>Cancel</button>
              <button
                className="text-xs px-3 py-1.5 rounded-md font-medium text-white"
                style={{ backgroundColor: "#2AAFA9" }}
                onClick={() => setOverrideMutation.mutate({ bookingId: editOverlay.bookingId, guestName: editName })}
                disabled={setOverrideMutation.isPending}
              >{setOverrideMutation.isPending ? "Saving…" : "Save"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
function PropertiesWidget'''

src = src.replace(OLD_CLOSE, NEW_CLOSE, 1)

with open("/home/ubuntu/geeves-shopping/client/src/pages/Home.tsx", "w") as f:
    f.write(src)

print("Done — conflict UI injected")
