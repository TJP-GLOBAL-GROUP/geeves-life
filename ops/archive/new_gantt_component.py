NEW_COMPONENT = '''
// ─── Property Gantt: sliding window, 8/15-day toggle, responsive ──────────────
function PropertyBookingTimeline({ property, verticalColor }: { property: any; verticalColor: string }) {
  const isMobile = useIsMobile();
  const isLandscape = useIsLandscape();

  // Window: default 8 days (3 past + today + 4 future), toggle to 15 (3 past + today + 11 future)
  const [windowSize, setWindowSize] = useState<8 | 15>(8);
  // anchorOffset: number of days the window has been slid from "today-centred" default
  const [anchorOffset, setAnchorOffset] = useState(0);

  const [nowTs] = useState(() => {
    const t = new Date(); t.setHours(0, 0, 0, 0); return t.getTime();
  });

  // Window start = 3 days before today + anchorOffset
  const windowStart = useMemo(() => nowTs - 3 * 86400000 + anchorOffset * 86400000, [nowTs, anchorOffset]);
  const windowEnd   = useMemo(() => windowStart + windowSize * 86400000, [windowStart, windowSize]);

  // Fetch composite bookings for a wider range so navigation doesn't require refetch
  const fetchFrom = useMemo(() => nowTs - 30 * 86400000, [nowTs]);
  const fetchTo   = useMemo(() => nowTs + 60 * 86400000, [nowTs]);
  const compositeQuery = trpc.properties.getCompositeBookings.useQuery(
    { propertyId: property.id, fromTs: fetchFrom, toTs: fetchTo },
    { staleTime: 60000 }
  );
  const entries = compositeQuery.data || [];

  // Build array of days in the current window
  const days = useMemo(() => {
    return Array.from({ length: windowSize }, (_, i) => {
      const d = new Date(windowStart + i * 86400000);
      d.setHours(0, 0, 0, 0);
      return d;
    });
  }, [windowStart, windowSize]);

  const today = useMemo(() => {
    const t = new Date(); t.setHours(0, 0, 0, 0); return t;
  }, []);

  const ENTRY_PRIORITY: Record<string, number> = { checkin: 5, checkout: 4, booking: 3, block: 2, prep: 1, unavailable: 0 };

  const getEntryForDay = (day: Date) => {
    const dayStart = day.getTime();
    const dayEnd = dayStart + 86400000;
    const covering = entries.filter((e: any) => e.checkIn < dayEnd && e.checkOut > dayStart);
    if (covering.length === 0) return null;
    return covering.reduce((best: any, e: any) =>
      (ENTRY_PRIORITY[e.type] ?? 0) > (ENTRY_PRIORITY[best.type] ?? 0) ? e : best
    );
  };

  // Upcoming events for the list (next 30 days)
  const upcoming = useMemo(() => {
    const cutoff = nowTs + 30 * 86400000;
    return entries
      .filter((e: any) => e.checkIn >= nowTs && e.checkIn <= cutoff &&
        (e.type === "checkin" || e.type === "checkout" || e.type === "booking"))
      .slice(0, 6);
  }, [entries, nowTs]);

  // Portrait mobile: narrow columns (date number + day initial)
  // Landscape mobile / desktop: wider columns with full day names
  const isCompact = isMobile && !isLandscape;

  const slide = (days: number) => setAnchorOffset(prev => prev + days);

  if (compositeQuery.isLoading) {
    return <div className="h-8 bg-muted/30 rounded animate-pulse" />;
  }

  return (
    <div className="select-none">
      {/* ── Header row: property name + controls ── */}
      <div className="flex items-center justify-between gap-1 mb-1.5">
        <p className="text-xs font-medium truncate flex-1 min-w-0">{property.name}</p>
        <div className="flex items-center gap-0.5 shrink-0">
          {/* Window size toggle */}
          <button
            onClick={() => setWindowSize(windowSize === 8 ? 15 : 8)}
            className="h-5 px-1.5 text-[9px] rounded border border-border/60 text-muted-foreground hover:text-foreground hover:border-border transition-colors font-mono"
            title={windowSize === 8 ? "Expand to 15-day view" : "Collapse to 8-day view"}
          >
            {windowSize === 8 ? "15d" : "8d"}
          </button>
          {/* Navigation: -7 -1 +1 +7 */}
          <button onClick={() => slide(-7)} className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors text-[9px]" title="Back 1 week">«</button>
          <button onClick={() => slide(-1)} className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors text-[9px]" title="Back 1 day">‹</button>
          {anchorOffset !== 0 && (
            <button onClick={() => setAnchorOffset(0)} className="h-5 px-1 text-[9px] rounded text-primary hover:text-primary/80 transition-colors" title="Return to today">↺</button>
          )}
          <button onClick={() => slide(1)} className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors text-[9px]" title="Forward 1 day">›</button>
          <button onClick={() => slide(7)} className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors text-[9px]" title="Forward 1 week">»</button>
        </div>
      </div>

      {/* ── Day header row ── */}
      <div className="flex gap-px mb-0.5">
        {days.map((day, i) => {
          const isToday = isSameDay(day, today);
          const dayInitial = ["S","M","T","W","T","F","S"][day.getDay()];
          const dateNum = day.getDate();
          const monthLabel = day.toLocaleDateString([], { month: "short" });
          return (
            <div
              key={i}
              className={`flex-1 flex flex-col items-center justify-center rounded-t-sm py-0.5 ${
                isToday ? "bg-primary/15" : "bg-muted/20"
              }`}
            >
              {isCompact ? (
                <>
                  <span className={`text-[7px] leading-none font-medium ${isToday ? "text-primary" : "text-muted-foreground"}`}>{dayInitial}</span>
                  <span className={`text-[9px] leading-none font-bold ${isToday ? "text-primary" : "text-foreground"}`}>{dateNum}</span>
                </>
              ) : (
                <>
                  <span className={`text-[8px] leading-none font-medium ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                    {day.toLocaleDateString([], { weekday: "short" })}
                  </span>
                  <span className={`text-[10px] leading-none font-bold ${isToday ? "text-primary" : "text-foreground"}`}>{dateNum}</span>
                  {(i === 0 || dateNum === 1) && (
                    <span className={`text-[7px] leading-none ${isToday ? "text-primary/70" : "text-muted-foreground"}`}>{monthLabel}</span>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Gantt bar row ── */}
      <div className="flex gap-px rounded-b overflow-hidden" style={{ height: isCompact ? 22 : 28 }}>
        {days.map((day, i) => {
          const entry = getEntryForDay(day);
          const isToday = isSameDay(day, today);
          const isPrepDay  = entry?.type === "prep";
          const isBlock    = entry?.type === "block";
          const isUnavail  = entry?.type === "unavailable";
          const isCheckin  = entry && (entry.type === "checkin"  || (entry.type === "booking" && isSameDay(new Date(entry.checkIn), day)));
          const isCheckout = entry && (entry.type === "checkout" || (entry.type === "booking" && isSameDay(new Date(entry.checkOut - 1), day)));
          const platformColor = entry ? getPlatformColor(entry.platform) : null;

          // Block fill: platform colour for bookings, amber for prep, red for block, slate for unavail
          const fillColor = isPrepDay ? "#E8943A"
            : isBlock ? "#ef4444"
            : isUnavail ? "#94a3b8"
            : platformColor || null;

          const cellStyle: React.CSSProperties = {
            ...(fillColor ? { backgroundColor: fillColor + "33" } : {}),
            ...(entry && !isPrepDay && !isBlock && !isUnavail ? {
              outline: `1.5px solid ${verticalColor}`,
              outlineOffset: "-1px",
            } : {}),
            ...(isPrepDay ? {
              backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(0,0,0,0.12) 3px, rgba(0,0,0,0.12) 4px)`,
              backgroundColor: "#E8943A33",
            } : {}),
          };

          // Label: landscape shows more, portrait shows minimal
          const showLabel = !isToday;
          const labelContent = (() => {
            if (!entry || !showLabel) return null;
            if (isPrepDay) return <span className="text-[7px] font-bold" style={{ color: "#E8943A" }}>P</span>;
            if (isBlock) return <span className="text-[7px] font-bold text-red-400">✕</span>;
            if (isUnavail) return <span className="text-[7px] text-slate-400">—</span>;
            if (isCheckin) return <span className="text-[7px] font-bold" style={{ color: platformColor || verticalColor }}>▲</span>;
            if (isCheckout) return <span className="text-[7px] font-bold" style={{ color: platformColor || verticalColor }}>▼</span>;
            // Mid-stay: show platform initial on landscape
            if (!isCompact && platformColor) {
              const initial = (entry.platform || "?")[0].toUpperCase();
              return <span className="text-[7px] font-bold" style={{ color: platformColor }}>{initial}</span>;
            }
            return null;
          })();

          const tooltipParts = entry ? [
            entry.summary || entry.platform,
            entry.platform,
            `${new Date(entry.checkIn).toLocaleDateString()} – ${new Date(entry.checkOut).toLocaleDateString()}`,
            entry.bookingRef ? `Ref: ${entry.bookingRef}` : null,
          ].filter(Boolean).join(" · ") : day.toLocaleDateString();

          return (
            <div
              key={i}
              title={tooltipParts}
              style={cellStyle}
              className={`flex-1 flex items-center justify-center relative transition-colors
                ${!entry ? "bg-muted/20" : ""}
                ${isToday ? "ring-1 ring-primary ring-inset" : ""}
              `}
            >
              {isToday ? (
                <span className="text-[8px] font-bold text-primary leading-none">T</span>
              ) : labelContent}
            </div>
          );
        })}
      </div>

      {/* ── Date range label ── */}
      <div className="flex justify-between mt-0.5 mb-2">
        <span className="text-[9px] text-muted-foreground">{days[0].toLocaleDateString([], { month: "short", day: "numeric" })}</span>
        <span className="text-[9px] text-muted-foreground">{days[days.length - 1].toLocaleDateString([], { month: "short", day: "numeric" })}</span>
      </div>

      {/* ── Upcoming events list ── */}
      {upcoming.length > 0 && (
        <div className="flex flex-col gap-1 mt-1">
          {upcoming.map((item: any) => {
            const itemDate = new Date(item.checkIn);
            const isToday2 = isSameDay(itemDate, today);
            const isTomorrow = isSameDay(itemDate, new Date(nowTs + 86400000));
            const dateLabel = isToday2 ? "Today" : isTomorrow ? "Tomorrow" : itemDate.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
            const pColor = getPlatformColor(item.platform);
            const typeLabel = item.type === "checkin" ? "Check-in" : item.type === "checkout" ? "Check-out" : "Booking";
            const typeIcon = item.type === "checkin" ? "▲" : item.type === "checkout" ? "▼" : "●";
            const platformLabel = (item.platform || "other").replace("_", ".");
            return (
              <div key={item.key} className="flex items-center gap-2 rounded px-1.5 py-1 bg-muted/20">
                <span className="text-[10px] shrink-0" style={{ color: pColor }}>{typeIcon}</span>
                <div className="flex-1 min-w-0 flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] font-medium">{typeLabel}</span>
                  {/* Platform badge */}
                  <span
                    className="text-[8px] font-medium px-1 py-0.5 rounded-sm leading-none shrink-0"
                    style={{ backgroundColor: pColor + "22", color: pColor, border: `1px solid ${pColor}44` }}
                  >
                    {platformLabel}
                  </span>
                  {/* On landscape: show guest name if available */}
                  {!isCompact && item.summary && (
                    <span className="text-[9px] text-muted-foreground truncate">{item.summary}</span>
                  )}
                  {item.hasConflict && (
                    <span className="text-[9px] text-red-400 shrink-0">⚠</span>
                  )}
                </div>
                <span className={`text-[10px] shrink-0 font-medium ${isToday2 ? "text-primary" : "text-muted-foreground"}`}>
                  {dateLabel}
                </span>
              </div>
            );
          })}
        </div>
      )}
      {upcoming.length === 0 && entries.length === 0 && (
        <p className="text-[10px] text-muted-foreground text-center py-1">No bookings synced yet</p>
      )}
    </div>
  );
}
'''

print(NEW_COMPONENT)
