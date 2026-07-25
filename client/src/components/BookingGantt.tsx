/**
 * BookingGantt
 *
 * A horizontal Gantt-style timeline showing upcoming property bookings.
 * - One row per booking, bars spanning check-in to check-out
 * - Colour-coded by platform
 * - Prep/block bars shown as grey hatched bars
 * - Today marker as a vertical dashed line
 * - Clicking a bar calls onSelectBooking(bookingId) to expand the card below
 */
import { useRef, useMemo } from "react";

function getPlatformColor(platform: string): string {
  switch (platform) {
    case "airbnb": return "#FF5A5F";
    case "vrbo": return "#1B6FE4";
    case "booking_com": return "#003580";
    case "direct": return "#2AAFA9";
    default: return "#6B7280";
  }
}

interface GanttBooking {
  booking: {
    id: string;
    checkIn: number;
    checkOut: number;
    guestName?: string | null;
    bookingType?: string;
    summary?: string | null;
    hasConflict?: boolean;
  };
  platformType: string;
}

interface BookingGanttProps {
  upcoming: GanttBooking[];
  allBookings: any[];
  platformMap: Map<string, string>;
  nowTs: number;
  onSelectBooking: (id: string) => void;
}

const DAY_MS = 86400000;
const WINDOW_DAYS = 60;
const ROW_HEIGHT = 28;
const LABEL_WIDTH = 80;
const BAR_RADIUS = 4;
const TODAY_MARKER_COLOR = "#2AAFA9";

export function BookingGantt({ upcoming, allBookings, platformMap, nowTs, onSelectBooking }: BookingGanttProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Window: today (start of day) → today + 60 days
  const windowStart = useMemo(() => {
    const d = new Date(nowTs);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, [nowTs]);
  const windowEnd = windowStart + WINDOW_DAYS * DAY_MS;
  const windowMs = windowEnd - windowStart;

  // Include prep/block rows from allBookings that fall in the window
  const allRows = useMemo(() => {
    const bookingIds = new Set(upcoming.map(u => u.booking.id));
    // Add non-booking rows (blocks, prep) that overlap the window
    const extras: GanttBooking[] = allBookings
      .filter((b: any) =>
        b.bookingType !== "booking" &&
        !bookingIds.has(b.id) &&
        b.checkOut >= windowStart &&
        b.checkIn <= windowEnd
      )
      .map((b: any) => ({
        booking: b,
        platformType: platformMap.get(b.platformId) || "other",
      }));
    return [...upcoming, ...extras].sort((a, b) => a.booking.checkIn - b.booking.checkIn);
  }, [upcoming, allBookings, platformMap, windowStart, windowEnd]);

  if (allRows.length === 0) return null;

  const svgHeight = allRows.length * ROW_HEIGHT + 24; // +24 for axis

  // Convert a timestamp to an x percentage within the window
  function tsToX(ts: number, totalWidth: number): number {
    const clamped = Math.max(windowStart, Math.min(windowEnd, ts));
    return ((clamped - windowStart) / windowMs) * totalWidth;
  }

  // Build week tick marks (every 7 days)
  const ticks: { x: number; label: string }[] = [];
  for (let i = 0; i <= WINDOW_DAYS; i += 7) {
    const d = new Date(windowStart + i * DAY_MS);
    ticks.push({
      x: (i / WINDOW_DAYS) * 100,
      label: d.toLocaleDateString([], { month: "short", day: "numeric" }),
    });
  }

  const todayX = ((nowTs - windowStart) / windowMs) * 100;

  return (
    <div
      ref={containerRef}
      className="rounded-lg border bg-card/50 overflow-hidden"
      style={{ marginBottom: "0.5rem" }}
    >
      <div className="px-3 pt-2.5 pb-1 flex items-center justify-between">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">60-Day Timeline</p>
        <p className="text-[9px] text-muted-foreground">Click a bar to expand</p>
      </div>

      {/* SVG Gantt */}
      <div className="overflow-x-auto">
        <svg
          width="100%"
          height={svgHeight}
          viewBox={`0 0 100 ${svgHeight}`}
          preserveAspectRatio="none"
          style={{ minWidth: "320px", display: "block" }}
        >
          {/* Background grid lines */}
          {ticks.map((t, i) => (
            <line
              key={i}
              x1={`${t.x}%`} y1="0"
              x2={`${t.x}%`} y2={svgHeight - 20}
              stroke="currentColor"
              strokeOpacity="0.06"
              strokeWidth="0.5"
            />
          ))}

          {/* Booking bars */}
          {allRows.map((item, rowIdx) => {
            const b = item.booking;
            const isBlock = b.bookingType === "block" || b.bookingType === "unavailable";
            const isPrep = b.bookingType === "prep";
            const color = isBlock || isPrep ? "#6B7280" : getPlatformColor(item.platformType);
            const y = rowIdx * ROW_HEIGHT + 4;
            const barH = ROW_HEIGHT - 8;

            // x positions as percentages
            const xStart = Math.max(0, ((b.checkIn - windowStart) / windowMs) * 100);
            const xEnd = Math.min(100, ((b.checkOut - windowStart) / windowMs) * 100);
            const barW = Math.max(0.5, xEnd - xStart);

            const label = b.guestName || b.summary || (isBlock ? "Block" : isPrep ? "Prep" : "");
            const nights = Math.round((b.checkOut - b.checkIn) / DAY_MS);
            const isClickable = b.bookingType === "booking";

            return (
              <g
                key={b.id || rowIdx}
                style={{ cursor: isClickable ? "pointer" : "default" }}
                onClick={isClickable ? () => onSelectBooking(b.id) : undefined}
              >
                {/* Bar background */}
                <rect
                  x={`${xStart}%`}
                  y={y}
                  width={`${barW}%`}
                  height={barH}
                  rx={BAR_RADIUS}
                  fill={isBlock || isPrep ? "none" : color}
                  fillOpacity={isBlock || isPrep ? 0 : 0.18}
                  stroke={color}
                  strokeWidth={isBlock || isPrep ? "0.4" : "0.6"}
                  strokeDasharray={isBlock || isPrep ? "2 1.5" : undefined}
                />
                {/* Label inside bar (only if wide enough) */}
                {barW > 8 && (
                  <text
                    x={`${xStart + barW / 2}%`}
                    y={y + barH / 2 + 3.5}
                    textAnchor="middle"
                    fontSize="4"
                    fill={color}
                    fillOpacity="0.9"
                    style={{ pointerEvents: "none", userSelect: "none" }}
                  >
                    {label ? `${label} · ${nights}n` : `${nights}n`}
                  </text>
                )}
                {/* Conflict indicator */}
                {b.hasConflict && (
                  <rect
                    x={`${xStart}%`}
                    y={y}
                    width={`${barW}%`}
                    height={barH}
                    rx={BAR_RADIUS}
                    fill="#ef4444"
                    fillOpacity="0.12"
                    stroke="#ef4444"
                    strokeWidth="0.6"
                  />
                )}
              </g>
            );
          })}

          {/* Today marker */}
          {todayX >= 0 && todayX <= 100 && (
            <g>
              <line
                x1={`${todayX}%`} y1="0"
                x2={`${todayX}%`} y2={svgHeight - 20}
                stroke={TODAY_MARKER_COLOR}
                strokeWidth="0.8"
                strokeDasharray="2 2"
              />
              <circle
                cx={`${todayX}%`}
                cy="3"
                r="2"
                fill={TODAY_MARKER_COLOR}
              />
            </g>
          )}

          {/* Axis labels */}
          {ticks.map((t, i) => (
            <text
              key={i}
              x={`${t.x}%`}
              y={svgHeight - 5}
              textAnchor={i === 0 ? "start" : i === ticks.length - 1 ? "end" : "middle"}
              fontSize="3.5"
              fill="currentColor"
              fillOpacity="0.4"
              style={{ userSelect: "none" }}
            >
              {t.label}
            </text>
          ))}
        </svg>
      </div>

      {/* Legend */}
      <div className="px-3 pb-2 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1">
          <div className="w-2.5 h-1.5 rounded-sm" style={{ background: TODAY_MARKER_COLOR, opacity: 0.8 }} />
          <span className="text-[9px] text-muted-foreground">Today</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2.5 h-1.5 rounded-sm border border-gray-500 border-dashed" />
          <span className="text-[9px] text-muted-foreground">Block / Prep</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2.5 h-1.5 rounded-sm bg-red-500/20 border border-red-500/60" />
          <span className="text-[9px] text-muted-foreground">Conflict</span>
        </div>
      </div>
    </div>
  );
}
