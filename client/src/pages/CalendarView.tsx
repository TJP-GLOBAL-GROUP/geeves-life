import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import { useRealtimeCalendar } from "@/hooks/useRealtime";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ChevronLeft, ChevronRight, Plus, Link2, CalendarDays, CalendarRange, LayoutGrid, Columns2, RefreshCw, CalendarX2, Pencil, Trash2, MapPin, AlignLeft, Calendar, Video, Clock, MessageSquare, CheckCircle2, XCircle, Inbox, Layers, ChevronDown } from "lucide-react";
import { useIsMobile } from "@/hooks/useMobile";
import { toast } from "sonner";
import { ConnectCalendarDialog } from "@/components/ConnectCalendarDialog";
import { LocationAutocomplete } from "@/components/LocationAutocomplete";
import { ShadowBlocksPanel } from "@/components/ShadowBlocksPanel";
import { GeeveNode, GeeveNodeBadge } from "@/components/GeeveNode";
import { Skeleton } from "@/components/ui/skeleton";
import { isSameAsHome, HOME_TIMEZONE } from "@/hooks/useDeviceLocation";

type ViewMode = "day" | "2day" | "week" | "month" | "gantt";

// ─── Swipe hook — detects horizontal swipe on touch & pointer devices ──
function useSwipeNav(onSwipe: (dir: -1 | 1) => void) {
  const ref = useRef<HTMLDivElement>(null);
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      startX.current = e.touches[0].clientX;
      startY.current = e.touches[0].clientY;
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (startX.current === null || startY.current === null) return;
      const dx = e.changedTouches[0].clientX - startX.current;
      const dy = e.changedTouches[0].clientY - startY.current;
      startX.current = null;
      startY.current = null;
      // Only trigger if horizontal swipe dominates and exceeds threshold
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        onSwipe(dx < 0 ? 1 : -1);
      }
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [onSwipe]);

  return ref;
}

interface CalendarEvent {
  id: string;
  title: string;
  description: string | null;
  startTime: number;
  endTime: number;
  isAllDay: boolean | null;
  calendarId: string;
  location: string | null;
  status: string;
  isShadow?: boolean;
  sourceEventId?: string;
}

function getWeekDates(date: Date): Date[] {
  const start = new Date(date);
  start.setDate(start.getDate() - start.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

function getMonthDates(date: Date): Date[] {
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDate = new Date(firstDay);
  startDate.setDate(startDate.getDate() - startDate.getDay());
  const dates: Date[] = [];
  const current = new Date(startDate);
  while (current <= lastDay || dates.length % 7 !== 0) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
    if (dates.length > 42) break;
  }
  return dates;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatDate(date: Date): string {
  return date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

function isSameDay(d1: Date, d2: Date): boolean {
  return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
// Bold Diversity Rainbow hex palette — always use inline styles, never dynamic Tailwind classes
const CALENDAR_COLORS = [
  "#2AAFA9", // Vivid Teal
  "#E8624A", // Coral Red
  "#D4A017", // Golden Yellow
  "#8B5CF6", // Bold Violet
  "#4F7EC4", // Indigo Blue
  "#E8943A", // Amber Orange
  "#10B981", // Emerald
  "#EC4899", // Pink
];

/** Deterministic hash of a string → stable palette index regardless of DB return order */
function stableColorIndex(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % CALENDAR_COLORS.length;
}

export default function CalendarView() {
  // Read ?view=day&date=YYYY-MM-DD or ?date=today from navigation
  const search = typeof window !== "undefined" ? window.location.search : "";
  const params = new URLSearchParams(search);
  const paramView = params.get("view") as ViewMode | null;
  const paramDate = params.get("date");

  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (paramView && ["day", "2day", "week", "month", "gantt"].includes(paramView)) return paramView as ViewMode;
    return "week";
  });
  const [currentDate, setCurrentDate] = useState(() => {
    if (paramDate === "today" || !paramDate) return new Date();
    // Parse YYYY-MM-DD as LOCAL midnight — new Date(dateOnlyString) treats it as UTC midnight,
    // which in negative-UTC-offset timezones (EDT, PDT) becomes the previous evening.
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(paramDate);
    if (match) return new Date(+match[1], +match[2] - 1, +match[3]);
    const d = new Date(paramDate);
    return isNaN(d.getTime()) ? new Date() : d;
  });
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<{ date: Date; hour?: number } | null>(null);
  const [showConnectDialog, setShowConnectDialog] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [showEventDetail, setShowEventDetail] = useState(false);
  const [showBookingRequest, setShowBookingRequest] = useState(false);
  const [bookingSlot, setBookingSlot] = useState<{ date: Date; hour?: number } | null>(null);
  const [showBookingReview, setShowBookingReview] = useState(false);
  // Gantt sub-range: 3, 7, or 14 days
  const [ganttDays, setGanttDays] = useState<3 | 7 | 14>(7);

  const { startTime, endTime } = useMemo(() => {
    const start = new Date(currentDate);
    const end = new Date(currentDate);
    switch (viewMode) {
      case "day":
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        break;
      case "2day":
        start.setHours(0, 0, 0, 0);
        end.setDate(end.getDate() + 1);
        end.setHours(23, 59, 59, 999);
        break;
      case "week": {
        const dayOfWeek = start.getDay();
        start.setDate(start.getDate() - dayOfWeek);
        start.setHours(0, 0, 0, 0);
        end.setDate(start.getDate() + 6);
        end.setHours(23, 59, 59, 999);
        break;
      }
      case "month": {
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
        end.setMonth(end.getMonth() + 1, 0);
        end.setHours(23, 59, 59, 999);
        break;
      }
      case "gantt": {
        start.setHours(0, 0, 0, 0);
        end.setDate(end.getDate() + ganttDays - 1);
        end.setHours(23, 59, 59, 999);
        break;
      }
    }
    return { startTime: start.getTime(), endTime: end.getTime() };
  }, [currentDate, viewMode, ganttDays]);

  // Fetch household for realtime subscription
  const { data: householdData } = trpc.household.getMyHousehold.useQuery();
  const householdId = householdData?.household?.id;
  const myMemberRole = (householdData as any)?.member?.role as string | undefined;
  // Roles that can only request time, not create events directly
  const isRequestOnly = myMemberRole ? ["member", "caregiver", "child", "elder"].includes(myMemberRole) : false;
  // Roles that can review booking requests
  const canReviewRequests = myMemberRole ? ["household_admin", "ea"].includes(myMemberRole) : true;

  // A4: Activate WebSocket for real-time calendar updates (replaces 30s polling)
  useRealtimeCalendar(householdId);

  const { data: rawEvents = [], isLoading, isFetching, refetch } = trpc.calendar.events.list.useQuery(
    { startTime, endTime },
    {
      refetchInterval: householdId ? false : 30000, // Disable polling when WebSocket is active
      staleTime: 30_000,                            // P-42: keep last state fresh for 30s
      placeholderData: keepPreviousData,             // P-42: show previous data while refetching
    }
  );

  // P-21: Client-side deduplication of shadow events as a safety net.
  // The server already deduplicates by (targetCalendarId, startTime, endTime), but
  // any shadow blocks created before the fix may still appear as duplicates.
  // Deduplicate by event.id (all real events) and by (calendarId, startTime, endTime) for shadow events.
  const events = useMemo(() => {
    const seen = new Set<string>();
    const shadowSeen = new Set<string>();
    return rawEvents.filter((e: any) => {
      if (e.isShadow) {
        const key = `${e.calendarId}|${e.startTime}|${e.endTime}`;
        if (shadowSeen.has(key)) return false;
        shadowSeen.add(key);
        return true;
      }
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    });
  }, [rawEvents]);

  const { data: calendars = [], isLoading: calendarsLoading } = trpc.calendar.list.useQuery();
  const { data: syncedCalendars = [] } = trpc.calendar.listSynced.useQuery();
  const { data: verticals = [] } = trpc.verticals.list.useQuery();
  const utils = trpc.useUtils();
  const rediscoverMutation = trpc.calendar.rediscoverAll.useMutation({
    onSuccess: (result) => {
      if (result.error) {
        toast.error(result.error);
      } else if (result.discovered === 0) {
        toast.info("All your calendars are already connected.");
      } else {
        toast.success(`Found ${result.discovered} new calendar${result.discovered !== 1 ? "s" : ""} and started syncing.`);
      }
      utils.calendar.list.invalidate();
      refetch();
    },
    onError: (err) => toast.error(`Could not discover calendars: ${err.message}`),
  });

  // Build calendarId → colour map.
  // Priority: (1) vertical colour if the calendar is assigned to a vertical,
  //           (2) stored calendar hex colour if valid,
  //           (3) deterministic fallback from CALENDAR_COLORS palette.
  const calendarColorMap = useMemo(() => {
    // Build verticalId → vertical colour lookup
    const verticalColorById: Record<string, string> = {};
    (verticals as any[]).forEach((v) => {
      if (v.color) verticalColorById[v.id] = v.color;
    });
    // Build calendarId → verticalColor lookup via the calendars array on each vertical
    const calendarToVerticalColor: Record<string, string> = {};
    (verticals as any[]).forEach((v) => {
      if (!v.color || !Array.isArray(v.calendars)) return;
      v.calendars.forEach((cal: any) => {
        calendarToVerticalColor[cal.id] = v.color;
      });
    });
    const map: Record<string, string> = {};
    (calendars as any[]).forEach((cal) => {
      if (calendarToVerticalColor[cal.id]) {
        // Use the vertical's brand colour — this is the primary design intent
        map[cal.id] = calendarToVerticalColor[cal.id];
      } else {
        const raw = (cal.color || "").trim();
        map[cal.id] = raw.startsWith("#") ? raw : CALENDAR_COLORS[stableColorIndex(cal.id)];
      }
    });
    return map;
  }, [calendars, verticals]);

  const navigate = useCallback((direction: -1 | 1) => {
    setCurrentDate(prev => {
      const next = new Date(prev);
      switch (viewMode) {
        case "day": next.setDate(next.getDate() + direction); break;
        case "2day": next.setDate(next.getDate() + (direction * 2)); break;
        case "week": next.setDate(next.getDate() + (direction * 7)); break;
        case "month": next.setMonth(next.getMonth() + direction); break;
        case "gantt": next.setDate(next.getDate() + (direction * ganttDays)); break;
      }
      return next;
    });
  }, [viewMode, ganttDays]);

  const goToToday = useCallback(() => setCurrentDate(new Date()), []);
  const swipeRef = useSwipeNav(navigate);

  const headerTitle = useMemo(() => {
    switch (viewMode) {
      case "day": return currentDate.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" });
      case "2day": {
        const next = new Date(currentDate);
        next.setDate(next.getDate() + 1);
        return `${formatDate(currentDate)} — ${formatDate(next)}`;
      }
      case "week": {
        const weekDates = getWeekDates(currentDate);
        return `${weekDates[0].toLocaleDateString([], { month: "short", day: "numeric" })} — ${weekDates[6].toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}`;
      }
      case "month": return currentDate.toLocaleDateString([], { month: "long", year: "numeric" });
      case "gantt": {
        const ganttEnd = new Date(currentDate);
        ganttEnd.setDate(ganttEnd.getDate() + ganttDays - 1);
        return `${currentDate.toLocaleDateString([], { month: "short", day: "numeric" })} — ${ganttEnd.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}`;
      }
    }
  }, [currentDate, viewMode, ganttDays]);

  const isMobile = useIsMobile();

  // Icon map for view modes
  const viewIcons: Record<ViewMode, React.ReactNode> = {
    day: <CalendarDays className="h-4 w-4" />,
    "2day": <Columns2 className="h-4 w-4" />,
    week: <CalendarRange className="h-4 w-4" />,
    month: <LayoutGrid className="h-4 w-4" />,
    gantt: <Layers className="h-4 w-4" />,
  };
  const viewLabels: Record<ViewMode, string> = {
    day: "Day", "2day": "2D", week: "Wk", month: "Mo", gantt: "Gantt",
  };

  // Compact date label for mobile
  const mobileTitle = useMemo(() => {
    switch (viewMode) {
      case "day": return currentDate.toLocaleDateString([], { month: "short", day: "numeric" });
      case "2day": {
        const next = new Date(currentDate); next.setDate(next.getDate() + 1);
        return `${currentDate.toLocaleDateString([], { month: "short", day: "numeric" })} – ${next.getDate()}`;
      }
      case "week": {
        const w = getWeekDates(currentDate);
        return `${w[0].toLocaleDateString([], { month: "short", day: "numeric" })} – ${w[6].getDate()}`;
      }
      case "month": return currentDate.toLocaleDateString([], { month: "short", year: "numeric" });
      case "gantt": {
        const ganttEnd = new Date(currentDate);
        ganttEnd.setDate(ganttEnd.getDate() + ganttDays - 1);
        return `${currentDate.toLocaleDateString([], { month: "short", day: "numeric" })} – ${ganttEnd.getDate()}`;
      }
    }
  }, [currentDate, viewMode, ganttDays]);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Calendar Header */}
      {isMobile ? (
        /* ── Mobile toolbar: two compact rows ── */
        <div className="shrink-0 border-b border-border">
          {/* Row 1: Today · prev/next · date label · + FAB */}
          <div className="flex items-center gap-1.5 px-2 py-2">
            <Button variant="outline" size="sm" className="h-8 px-2.5 text-xs font-medium shrink-0" onClick={goToToday}>
              Today
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => navigate(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => navigate(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <span className="flex-1 text-sm font-semibold truncate text-center">{mobileTitle}</span>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" title="Connect calendar" onClick={() => setShowConnectDialog(true)}>
              <Link2 className="h-4 w-4" />
            </Button>
            {isRequestOnly ? (
              <Button size="icon" className="h-8 w-8 shrink-0" title="Request time" onClick={() => { setBookingSlot({ date: new Date() }); setShowBookingRequest(true); }}>
                <Clock className="h-4 w-4" />
              </Button>
            ) : (
              <Button size="icon" className="h-8 w-8 shrink-0" title="New event" onClick={() => { setSelectedSlot({ date: new Date() }); setShowCreateDialog(true); }}>
                <Plus className="h-4 w-4" />
              </Button>
            )}
            {canReviewRequests && (
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" title="Booking requests" onClick={() => setShowBookingReview(true)}>
                <Inbox className="h-4 w-4" />
              </Button>
            )}
          </div>
          {/* Row 2: View mode pills (icon + short label) */}
          <div className="flex items-center gap-1 px-2 pb-2">
            {(["day", "2day", "week", "month", "gantt"] as ViewMode[]).map(mode => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`flex items-center gap-1 flex-1 justify-center py-1.5 rounded-md text-xs font-medium transition-colors ${
                  viewMode === mode
                    ? "text-white"
                    : "bg-secondary text-muted-foreground hover:text-foreground"
                }`}
                style={viewMode === mode ? { backgroundColor: "#2AAFA9" } : undefined}
              >
                {viewIcons[mode]}
                <span>{viewLabels[mode]}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        /* ── Desktop toolbar: single row ── */
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={goToToday}>Today</Button>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(-1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <h2 className="text-lg font-semibold">{headerTitle}</h2>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex bg-secondary rounded-lg p-0.5">
              {(["day", "2day", "week", "month", "gantt"] as ViewMode[]).map(mode => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  viewMode === mode ? "text-white" : "text-muted-foreground hover:text-foreground"
                }`}
                style={viewMode === mode ? { backgroundColor: "#2AAFA9" } : undefined}
                >
                  {mode === "2day" ? "2 Day" : mode.charAt(0).toUpperCase() + mode.slice(1)}
                </button>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={() => setShowConnectDialog(true)}>
              <Link2 className="h-4 w-4 mr-1" /> Connect
            </Button>
            {isRequestOnly ? (
              <Button size="sm" onClick={() => { setBookingSlot({ date: new Date() }); setShowBookingRequest(true); }}>
                <Clock className="h-4 w-4 mr-1" /> Request Time
              </Button>
            ) : (
              <Button size="sm" onClick={() => { setSelectedSlot({ date: new Date() }); setShowCreateDialog(true); }}>
                <Plus className="h-4 w-4 mr-1" /> Event
              </Button>
            )}
            {canReviewRequests && (
              <Button variant="outline" size="sm" onClick={() => setShowBookingReview(true)}>
                <Inbox className="h-4 w-4 mr-1" /> Requests
              </Button>
            )}
          </div>
        </div>
      )}

      {/* No-calendars onboarding banner */}
      {!isLoading && !calendarsLoading && calendars.length === 0 && (
        <div className="mx-3 mt-3 rounded-xl border border-dashed p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3" style={{ borderColor: "rgba(42,175,169,0.4)", backgroundColor: "rgba(42,175,169,0.05)" }}>
          <div className="rounded-full p-2 shrink-0" style={{ backgroundColor: "rgba(42,175,169,0.1)" }}>
            <CalendarX2 className="h-5 w-5" style={{ color: "#2AAFA9" }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">No calendars connected yet</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Tap “Sync Now” to automatically import all your Google calendars, or use “Connect” to add them one by one.
            </p>
          </div>
          <div className="flex gap-2 shrink-0 flex-wrap">
            <Button
              size="sm"
              variant="outline"
              onClick={() => rediscoverMutation.mutate()}
              disabled={rediscoverMutation.isPending}
            >
              {rediscoverMutation.isPending ? (
                <><RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />Discovering…</>
              ) : (
                <><RefreshCw className="h-3.5 w-3.5 mr-1.5" />Sync Now</>
              )}
            </Button>
            <Button size="sm" onClick={() => setShowConnectDialog(true)}>
              <Link2 className="h-3.5 w-3.5 mr-1.5" />Connect
            </Button>
          </div>
        </div>
      )}

      {/* Calendar Body — swipe left/right to navigate */}
      <div ref={swipeRef} className="flex-1 overflow-auto min-h-0 touch-pan-y relative">
        {/* Subtle refetch shimmer bar at top — shown when navigating between dates */}
        {isFetching && !isLoading && (
          <div className="absolute top-0 left-0 right-0 h-0.5 z-20 overflow-hidden">
            <div className="h-full animate-[shimmer_1.2s_ease-in-out_infinite]" style={{ background: "linear-gradient(90deg, transparent 0%, #2AAFA9 50%, transparent 100%)", backgroundSize: "200% 100%", animation: "shimmer 1.2s ease-in-out infinite" }} />
          </div>
        )}
        {isLoading ? (
          viewMode === "month" ? (
            <CalendarSkeletonMonth />
          ) : viewMode === "gantt" ? (
            <CalendarSkeletonGantt />
          ) : (
            <CalendarSkeletonTimeGrid viewMode={viewMode} />
          )
        ) : viewMode === "month" ? (
          <MonthView
            currentDate={currentDate}
            events={events as CalendarEvent[]}
            calendarColorMap={calendarColorMap}
            onDayClick={(date) => { setCurrentDate(date); setViewMode("day"); }}
            onEventClick={(event) => { setSelectedEvent(event); setShowEventDetail(true); }}
          />
        ) : viewMode === "gantt" ? (
          <GanttView
            currentDate={currentDate}
            ganttDays={ganttDays}
            onGanttDaysChange={setGanttDays}
            events={events as CalendarEvent[]}
            calendarColorMap={calendarColorMap}
            onEventClick={(event: CalendarEvent) => { setSelectedEvent(event); setShowEventDetail(true); }}
          />
        ) : (
          <TimeGridView
            viewMode={viewMode}
            currentDate={currentDate}
            events={events as CalendarEvent[]}
            calendarColorMap={calendarColorMap}
            onSlotClick={(date, hour) => {
              if (isRequestOnly) {
                setBookingSlot({ date, hour });
                setShowBookingRequest(true);
              } else {
                setSelectedSlot({ date, hour });
                setShowCreateDialog(true);
              }
            }}
            onEventClick={(event) => { setSelectedEvent(event); setShowEventDetail(true); }}
          />
        )}
      </div>

      {/* Create Event Dialog */}
      <CreateEventDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        selectedSlot={selectedSlot}
        calendars={syncedCalendars.length > 0 ? syncedCalendars : calendars}
        onCreated={() => { refetch(); setShowCreateDialog(false); }}
      />
      {/* Event Detail / Edit Dialog */}
      <EventDetailDialog
        open={showEventDetail}
        onOpenChange={setShowEventDetail}
        event={selectedEvent}
        calendars={calendars}
        calendarColorMap={calendarColorMap}
        onUpdated={() => { refetch(); setShowEventDetail(false); }}
        onDeleted={() => { refetch(); setShowEventDetail(false); }}
      />

      {/* Booking Request Dialog (for members/caregivers/children/elders) */}
      <BookingRequestDialog
        open={showBookingRequest}
        onOpenChange={setShowBookingRequest}
        selectedSlot={bookingSlot}
        onSubmitted={() => { setShowBookingRequest(false); toast.success("Time request sent!"); }}
      />
      {/* Booking Request Review Panel (for admins/EAs) */}
      <BookingReviewDialog
        open={showBookingReview}
        onOpenChange={setShowBookingReview}
        onAccepted={() => { refetch(); }}
      />
      {/* Connect Calendar Dialog */}
      <ConnectCalendarDialog
        open={showConnectDialog}
        onOpenChange={setShowConnectDialog}
        onConnected={() => { refetch(); }}
      />
    </div>
  );
}

// ─── Event Detail / Edit Dialog ────────────────────────────────────
function formatRecurrenceLabel(rule: string | null | undefined): string | null {
  if (!rule) return null;
  const r = rule.toUpperCase();
  if (r.includes("FREQ=DAILY")) return "Daily";
  if (r.includes("FREQ=WEEKLY")) {
    const byDay = r.match(/BYDAY=([A-Z,]+)/);
    const days: Record<string, string> = { MO: "Mon", TU: "Tue", WE: "Wed", TH: "Thu", FR: "Fri", SA: "Sat", SU: "Sun" };
    if (byDay) {
      const labels = byDay[1].split(",").map(d => days[d] || d).join(", ");
      return `Weekly · ${labels}`;
    }
    return "Weekly";
  }
  if (r.includes("FREQ=MONTHLY")) return "Monthly";
  if (r.includes("FREQ=YEARLY")) return "Yearly";
  return "Recurring";
}

function cleanDescription(raw: string): { preview: string; full: string; hasMore: boolean } {
  // Strip Google Calendar invitation boilerplate (URLs, RSVP links, dial-in numbers)
  const lines = raw.split("\n");
  const cleanLines: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    // Skip lines that are purely URLs or Google Calendar action links
    if (/^https?:\/\//i.test(trimmed)) continue;
    if (/action=(VIEW|RESPOND)&eid=/i.test(trimmed)) continue;
    if (/^-\s*(Yes|No|Maybe)<https/i.test(trimmed)) continue;
    if (/^more options »/i.test(trimmed)) continue;
    if (/^Invitation from Google Calendar/i.test(trimmed)) continue;
    if (/^Or dial:/i.test(trimmed)) continue;
    cleanLines.push(line);
  }
  // Collapse multiple blank lines
  const collapsed = cleanLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  const PREVIEW_CHARS = 200;
  const hasMore = collapsed.length > PREVIEW_CHARS;
  return {
    preview: hasMore ? collapsed.slice(0, PREVIEW_CHARS) + "…" : collapsed,
    full: collapsed,
    hasMore,
  };
}

function EventDetailDialog({
  open, onOpenChange, event, calendars, calendarColorMap, onUpdated, onDeleted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: CalendarEvent | null;
  calendars: any[];
  calendarColorMap: Record<string, string>;
  onUpdated: () => void;
  onDeleted: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [isAllDay, setIsAllDay] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [startTimeStr, setStartTimeStr] = useState("");
  const [endDate, setEndDate] = useState("");
  const [endTimeStr, setEndTimeStr] = useState("");
  const [showDeleteScope, setShowDeleteScope] = useState(false);
  const [showEditScope, setShowEditScope] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);
  const [editScope, setEditScope] = useState<"single" | "following" | "all">("single");

  const updateEvent = trpc.calendar.events.update.useMutation({
    onSuccess: () => { toast.success("Event updated"); onUpdated(); },
    onError: (err) => toast.error(err.message),
  });
  const deleteEvent = trpc.calendar.events.delete.useMutation({
    onSuccess: () => { toast.success("Event deleted"); onDeleted(); },
    onError: (err) => toast.error(err.message),
  });

  useMemo(() => {
    if (event) {
      setTitle(event.title);
      setDescription(event.description || "");
      setLocation(event.location || "");
      setIsAllDay(event.isAllDay || false);
      const s = new Date(event.startTime);
      const e = new Date(event.endTime);
      setStartDate(`${s.getFullYear()}-${String(s.getMonth() + 1).padStart(2, "0")}-${String(s.getDate()).padStart(2, "0")}`);
      setEndDate(`${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, "0")}-${String(e.getDate()).padStart(2, "0")}`);
      setStartTimeStr(`${String(s.getHours()).padStart(2, "0")}:${String(s.getMinutes()).padStart(2, "0")}`);
      setEndTimeStr(`${String(e.getHours()).padStart(2, "0")}:${String(e.getMinutes()).padStart(2, "0")}`);
      setEditing(false);
      setShowDeleteScope(false);
      setShowEditScope(false);
      setDescExpanded(false);
      setEditScope("single");
    }
  }, [event]);

  const calendarName = calendars.find((c: any) => c.id === event?.calendarId)?.name || "Unknown calendar";
  const eventColor = event ? (calendarColorMap[event.calendarId] || "#2AAFA9") : "#2AAFA9";
  const recurrenceLabel = formatRecurrenceLabel((event as any)?.recurrenceRule);
  const isRecurring = !!(event as any)?.recurrenceRule || !!(event as any)?.recurringEventId;

  const handleEditClick = () => {
    if (isRecurring) { setShowEditScope(true); }
    else { setEditing(true); }
  };

  const handleDeleteClick = () => { setShowDeleteScope(true); };

  const handleSave = () => {
    if (!event) return;
    if (!title.trim()) { toast.error("Title is required"); return; }
    let startTime: number, endTime: number;
    if (isAllDay) {
      startTime = new Date(`${startDate}T00:00:00`).getTime();
      endTime = new Date(`${endDate}T23:59:59`).getTime();
    } else {
      startTime = new Date(`${startDate}T${startTimeStr}:00`).getTime();
      endTime = new Date(`${endDate}T${endTimeStr}:00`).getTime();
    }
    if (endTime <= startTime) { toast.error("End time must be after start time"); return; }
    updateEvent.mutate({ id: event.id, title: title.trim(), description: description || undefined, location: location || undefined, startTime, endTime, isAllDay, scope: editScope });
  };

  if (!event) return null;

  const descInfo = event.description ? cleanDescription(event.description) : null;

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) { setEditing(false); setShowDeleteScope(false); setShowEditScope(false); } }}>
      <DialogContent className="sm:max-w-[480px] flex flex-col max-h-[90vh] p-0 gap-0">
        {/* ── Sticky header with action buttons always visible ── */}
        <div className="flex items-center gap-2 px-4 pt-4 pb-3 border-b border-border shrink-0">
          <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: eventColor }} />
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm leading-tight truncate">{editing ? "Edit Event" : event.title}</div>
            {recurrenceLabel && !editing && (
              <div className="flex items-center gap-1 mt-0.5">
                <RefreshCw className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{recurrenceLabel}</span>
              </div>
            )}
          </div>
          {/* Action buttons — always pinned to top */}
          {!editing && !showDeleteScope && !showEditScope && (
            <div className="flex gap-1 shrink-0">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleEditClick} title="Edit">
                <Pencil className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={handleDeleteClick} title="Delete">
                <Trash2 className="h-4 w-4" />
              </Button>
              <DialogClose asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" title="Close">
                  <XCircle className="h-4 w-4" />
                </Button>
              </DialogClose>
            </div>
          )}
          {(editing || showDeleteScope || showEditScope) && (
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => { setEditing(false); setShowDeleteScope(false); setShowEditScope(false); }}>
              <XCircle className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">

          {/* ── Delete scope selector ── */}
          {showDeleteScope && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 space-y-3">
              <p className="text-sm font-semibold text-destructive">Delete recurring event</p>
              <p className="text-xs text-muted-foreground">Choose which events to delete:</p>
              <div className="space-y-2">
                {(["single", "following", "all"] as const).map(scope => (
                  <label key={scope} className="flex items-center gap-3 cursor-pointer">
                    <input type="radio" name="del-scope" value={scope}
                      checked={editScope === scope}
                      onChange={() => setEditScope(scope)}
                      className="accent-destructive"
                    />
                    <span className="text-sm">
                      {scope === "single" && "This event only"}
                      {scope === "following" && "This and all following events"}
                      {scope === "all" && "All events in the series"}
                    </span>
                  </label>
                ))}
              </div>
              <div className="flex gap-2 pt-1">
                <Button size="sm" variant="destructive"
                  onClick={() => deleteEvent.mutate({ id: event.id, scope: editScope })}
                  disabled={deleteEvent.isPending}>
                  {deleteEvent.isPending ? "Deleting…" : "Delete"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowDeleteScope(false)}>Cancel</Button>
              </div>
            </div>
          )}

          {/* ── Edit scope selector (for recurring events) ── */}
          {showEditScope && !editing && (
            <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
              <p className="text-sm font-semibold">Edit recurring event</p>
              <p className="text-xs text-muted-foreground">Choose which events to edit:</p>
              <div className="space-y-2">
                {(["single", "following", "all"] as const).map(scope => (
                  <label key={scope} className="flex items-center gap-3 cursor-pointer">
                    <input type="radio" name="edit-scope" value={scope}
                      checked={editScope === scope}
                      onChange={() => setEditScope(scope)}
                    />
                    <span className="text-sm">
                      {scope === "single" && "This event only"}
                      {scope === "following" && "This and all following events"}
                      {scope === "all" && "All events in the series"}
                    </span>
                  </label>
                ))}
              </div>
              <div className="flex gap-2 pt-1">
                <Button size="sm" onClick={() => { setShowEditScope(false); setEditing(true); }}>Continue to edit</Button>
                <Button size="sm" variant="outline" onClick={() => setShowEditScope(false)}>Cancel</Button>
              </div>
            </div>
          )}

          {/* ── View mode ── */}
          {!editing && !showDeleteScope && !showEditScope && (
            <>
              <div className="flex items-start gap-2 text-sm">
                <Calendar className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                <div>
                  <div>{event.isAllDay
                    ? new Date(event.startTime).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })
                    : `${new Date(event.startTime).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })} · ${formatTime(event.startTime)} – ${formatTime(event.endTime)}`
                  }</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{calendarName}</div>
                </div>
              </div>
              {event.location && (
                <div className="flex items-start gap-2 text-sm">
                  <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                  <span>{event.location}</span>
                </div>
              )}
              {descInfo && (
                <div className="flex items-start gap-2 text-sm">
                  <AlignLeft className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">
                      {descExpanded ? descInfo.full : descInfo.preview}
                    </p>
                    {descInfo.hasMore && (
                      <button
                        className="text-xs text-primary mt-1 hover:underline flex items-center gap-1"
                        onClick={() => setDescExpanded(v => !v)}
                      >
                        <ChevronDown className={`h-3 w-3 transition-transform ${descExpanded ? "rotate-180" : ""}`} />
                        {descExpanded ? "Show less" : "Show full details"}
                      </button>
                    )}
                  </div>
                </div>
              )}
              <ShadowBlocksPanel eventId={event.id} calendarId={event.calendarId} calendars={calendars} />
            </>
          )}

          {/* ── Edit mode ── */}
          {editing && (
            <div className="space-y-3">
              {isRecurring && (
                <div className="text-xs text-muted-foreground bg-muted/40 rounded px-2 py-1.5">
                  Editing: <span className="font-medium text-foreground">
                    {editScope === "single" ? "This event only" : editScope === "following" ? "This and following" : "All events in series"}
                  </span>
                </div>
              )}
              <div>
                <Label htmlFor="ev-title">Title</Label>
                <Input id="ev-title" value={title} onChange={e => setTitle(e.target.value)} />
              </div>
              <div className="flex items-center gap-2">
                <Switch id="ev-allday" checked={isAllDay} onCheckedChange={setIsAllDay} />
                <Label htmlFor="ev-allday">All day</Label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Start Date</Label><Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} /></div>
                {!isAllDay && <div><Label>Start Time</Label><Input type="time" value={startTimeStr} onChange={e => setStartTimeStr(e.target.value)} /></div>}
                <div><Label>End Date</Label><Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} /></div>
                {!isAllDay && <div><Label>End Time</Label><Input type="time" value={endTimeStr} onChange={e => setEndTimeStr(e.target.value)} /></div>}
              </div>
              <div>
                <Label htmlFor="ev-loc">Location</Label>
                <LocationAutocomplete
                  value={location}
                  onChange={setLocation}
                  onPlaceSelect={({ address, mapsUrl }) => {
                    setLocation(address);
                    setDescription(prev => {
                      const link = `\ud83d\udccd ${mapsUrl}`;
                      if (prev && prev.includes(mapsUrl)) return prev;
                      return prev ? `${prev}\n${link}` : link;
                    });
                  }}
                  placeholder="Add location or address"
                />
              </div>
              <div><Label htmlFor="ev-desc">Description</Label><Textarea id="ev-desc" value={description} onChange={e => setDescription(e.target.value)} rows={3} /></div>
              <div className="flex gap-2 pt-1">
                <Button onClick={handleSave} disabled={updateEvent.isPending}>
                  {updateEvent.isPending ? "Saving…" : "Save changes"}
                </Button>
                <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Overlap layout helper ───────────────────────────────────────────
function layoutEvents(evts: CalendarEvent[]): Array<CalendarEvent & { col: number; totalCols: number }> {
  const sorted = [...evts].sort((a, b) => a.startTime - b.startTime);
  const result: Array<CalendarEvent & { col: number; totalCols: number }> = [];
  // Each "cluster" is a group of events that all overlap with at least one other in the group
  const clusters: Array<Array<CalendarEvent & { col: number; totalCols: number }>> = [];
  for (const ev of sorted) {
    let placed = false;
    for (const cluster of clusters) {
      const overlaps = cluster.some(c => c.startTime < ev.endTime && c.endTime > ev.startTime);
      if (overlaps) {
        const usedCols = new Set(cluster.map(c => c.col));
        let col = 0;
        while (usedCols.has(col)) col++;
        const entry = { ...ev, col, totalCols: 0 };
        cluster.push(entry);
        result.push(entry);
        placed = true;
        break;
      }
    }
    if (!placed) {
      const entry = { ...ev, col: 0, totalCols: 0 };
      clusters.push([entry]);
      result.push(entry);
    }
  }
  for (const cluster of clusters) {
    const maxCol = Math.max(...cluster.map(c => c.col));
    for (const entry of cluster) entry.totalCols = maxCol + 1;
  }
  return result;
}

// ─── Calendar Loading Skeletons ────────────────────────────────────

/** Time-grid skeleton — mirrors the day/2day/week layout: time gutter + columns with event blocks */
function CalendarSkeletonTimeGrid({ viewMode }: { viewMode: ViewMode }) {
  const colCount = viewMode === "day" ? 1 : viewMode === "2day" ? 2 : 7;
  const HOUR_H = 56; // matches default hourHeight
  const VISIBLE_HOURS = 10;

  // Fake event blocks: a handful of random-ish rectangles per column
  const fakeBlocks: { col: number; top: number; height: number }[] = [
    { col: 0, top: 1.5 * HOUR_H, height: HOUR_H },
    { col: 0, top: 4 * HOUR_H, height: HOUR_H * 1.5 },
    { col: Math.min(1, colCount - 1), top: 2.5 * HOUR_H, height: HOUR_H * 0.75 },
    { col: Math.min(2, colCount - 1), top: 5 * HOUR_H, height: HOUR_H },
    { col: Math.min(3, colCount - 1), top: 3 * HOUR_H, height: HOUR_H * 1.25 },
    { col: Math.min(5, colCount - 1), top: 1 * HOUR_H, height: HOUR_H * 0.5 },
    { col: Math.min(6, colCount - 1), top: 6 * HOUR_H, height: HOUR_H },
  ].filter(b => b.col < colCount);

  return (
    <div className="h-full flex flex-col">
      {/* All-day row skeleton */}
      <div className="flex border-b border-border" style={{ minHeight: 32 }}>
        <div className="w-12 shrink-0 border-r border-border" />
        {Array.from({ length: colCount }).map((_, i) => (
          <div key={i} className="flex-1 px-1 py-1 border-r border-border last:border-r-0">
            {i % 3 === 0 && <Skeleton className="h-4 w-full rounded" />}
          </div>
        ))}
      </div>

      {/* Time grid */}
      <div className="flex-1 overflow-hidden relative" style={{ height: VISIBLE_HOURS * HOUR_H }}>
        {/* Time gutter */}
        <div className="absolute left-0 top-0 bottom-0 w-12 border-r border-border z-10">
          {Array.from({ length: VISIBLE_HOURS }).map((_, h) => (
            <div key={h} style={{ height: HOUR_H }} className="flex items-start justify-end pr-2 pt-1">
              <Skeleton className="h-3 w-7" />
            </div>
          ))}
        </div>

        {/* Columns */}
        <div className="absolute left-12 right-0 top-0 bottom-0 flex">
          {Array.from({ length: colCount }).map((_, col) => (
            <div key={col} className="flex-1 relative border-r border-border last:border-r-0">
              {/* Hour lines */}
              {Array.from({ length: VISIBLE_HOURS }).map((_, h) => (
                <div key={h} style={{ height: HOUR_H }} className="border-b border-border/40" />
              ))}
              {/* Fake event blocks */}
              {fakeBlocks.filter(b => b.col === col).map((b, i) => (
                <div
                  key={i}
                  className="absolute left-1 right-1 rounded"
                  style={{ top: b.top, height: b.height }}
                >
                  <Skeleton className="h-full w-full rounded" style={{ opacity: 0.7 }} />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Month skeleton — 7-col grid with day cells and scattered event bars */
function CalendarSkeletonMonth() {
  const WEEKS = 5;
  // Scatter some event bars: [weekRow, colStart, colSpan]
  const bars: [number, number, number][] = [
    [0, 1, 2], [0, 4, 1],
    [1, 0, 3], [1, 5, 2],
    [2, 2, 1], [2, 3, 2],
    [3, 0, 1], [3, 2, 3],
    [4, 1, 1], [4, 4, 2],
  ];

  return (
    <div className="h-full flex flex-col">
      {/* Day-of-week header */}
      <div className="grid grid-cols-7 border-b border-border">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
          <div key={d} className="text-center py-2">
            <Skeleton className="h-3 w-6 mx-auto" />
          </div>
        ))}
      </div>

      {/* Week rows */}
      <div className="flex-1 flex flex-col">
        {Array.from({ length: WEEKS }).map((_, w) => (
          <div key={w} className="flex-1 relative border-b border-border last:border-b-0" style={{ minHeight: 80 }}>
            {/* Day number chips */}
            <div className="grid grid-cols-7 h-7">
              {Array.from({ length: 7 }).map((_, d) => (
                <div key={d} className="flex justify-center pt-1">
                  <Skeleton className="h-5 w-5 rounded-full" />
                </div>
              ))}
            </div>
            {/* Event bars for this week */}
            {bars.filter(([bw]) => bw === w).map(([, col, span], i) => (
              <div
                key={i}
                className="absolute"
                style={{
                  top: 32 + i * 20,
                  left: `${(col / 7) * 100}%`,
                  width: `${(span / 7) * 100}%`,
                  paddingLeft: 4,
                  paddingRight: 4,
                }}
              >
                <Skeleton className="h-4 w-full rounded" style={{ opacity: 0.65 }} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Gantt skeleton — date header strip + row blocks */
function CalendarSkeletonGantt() {
  const DAYS = 7;
  const ROWS = 5;
  return (
    <div className="h-full flex flex-col p-2 gap-2">
      {/* Date header */}
      <div className="flex gap-1">
        <div className="w-28 shrink-0" />
        {Array.from({ length: DAYS }).map((_, d) => (
          <div key={d} className="flex-1 flex flex-col items-center gap-1">
            <Skeleton className="h-3 w-6" />
            <Skeleton className="h-5 w-5 rounded-full" />
          </div>
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: ROWS }).map((_, r) => (
        <div key={r} className="flex gap-1 items-center">
          <div className="w-28 shrink-0">
            <Skeleton className="h-4 w-20" />
          </div>
          {Array.from({ length: DAYS }).map((_, d) => (
            <div key={d} className="flex-1 h-10 border border-border/30 rounded">
              {(r + d) % 3 === 0 && <Skeleton className="h-full w-full rounded" style={{ opacity: 0.5 }} />}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── Time Grid View (Day / 2-Day / Week) ────────────────────────────
function TimeGridView({
  viewMode, currentDate, events, calendarColorMap, onSlotClick, onEventClick,
}: {
  viewMode: ViewMode;
  currentDate: Date;
  events: CalendarEvent[];
  calendarColorMap: Record<string, string>;
  onSlotClick: (date: Date, hour: number) => void;
  onEventClick: (event: CalendarEvent) => void;
}) {
  const days = useMemo(() => {
    switch (viewMode) {
      case "day": return [currentDate];
      case "2day": {
        const next = new Date(currentDate);
        next.setDate(next.getDate() + 1);
        return [currentDate, next];
      }
      case "week": return getWeekDates(currentDate);
    }
    return [currentDate];
  }, [viewMode, currentDate]);

  const today = new Date();

  // ── Dual-timezone setup ──────────────────────────────────────────
  const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const homeTz = HOME_TIMEZONE;
  const showDualTz = !isSameAsHome(deviceTz);

  // Home today date string for the Violet ring highlight
  const homeTodayDateStr = new Intl.DateTimeFormat("en-CA", { timeZone: homeTz }).format(Date.now());

  // Format a UTC timestamp as HH:MM in a given timezone
  const formatInTzShort = (ts: number, tz: string) =>
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true }).format(ts);

  // ── Pinch-to-zoom ─────────────────────────────────────────────────
  const [hourHeight, setHourHeight] = useState(56);
  const MIN_H = 28, MAX_H = 160;
  const gridScrollRef = useRef<HTMLDivElement>(null);
  const lastPinchDist = useRef<number | null>(null);
  useEffect(() => {
    const el = gridScrollRef.current;
    if (!el) return;
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (lastPinchDist.current !== null) {
        const delta = dist - lastPinchDist.current;
        setHourHeight(h => Math.min(MAX_H, Math.max(MIN_H, h + delta * 0.3)));
      }
      lastPinchDist.current = dist;
    };
    const onTouchEnd = () => { lastPinchDist.current = null; };
    el.addEventListener("touchmove", onTouchMove, { passive: true });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, []);

  // ── Current time indicator ────────────────────────────────────────
  const [nowMinutes, setNowMinutes] = useState(() => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); });
  useEffect(() => {
    const id = setInterval(() => { const n = new Date(); setNowMinutes(n.getHours() * 60 + n.getMinutes()); }, 60_000);
    return () => clearInterval(id);
  }, []);
  const nowTop = (nowMinutes / 60) * hourHeight;

  // ── Auto-scroll to center current time on first render ───────────
  useEffect(() => {
    // Use rAF so the browser has completed layout and clientHeight is non-zero
    const raf = requestAnimationFrame(() => {
      const el = gridScrollRef.current;
      if (!el) return;
      const scrollTarget = nowTop - el.clientHeight / 2;
      el.scrollTop = Math.max(0, scrollTarget);
    });
    return () => cancelAnimationFrame(raf);
  // Re-run whenever the view is freshly mounted (e.g. switching from month → day)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount only

  // All-day events that overlap the visible window
  const allDayEvents = useMemo(() => {
    const windowStart = days[0].getTime();
    const windowEnd = days[days.length - 1].getTime() + 86400000; // end of last day
    return events.filter(e => e.isAllDay && e.startTime < windowEnd && e.endTime > windowStart);
  }, [events, days]);

  // Separate regular all-day events from property booking bars
  const regularAllDay = useMemo(() => allDayEvents.filter(e => !(e as any).isPropertyBooking), [allDayEvents]);
  const propertyBookingBars = useMemo(() => allDayEvents.filter(e => !!(e as any).isPropertyBooking), [allDayEvents]);

  const MAX_ALLDAY_ROWS = 3;
  const [allDayExpanded, setAllDayExpanded] = useState(false);
  const visibleAllDay = allDayExpanded ? regularAllDay : regularAllDay.slice(0, MAX_ALLDAY_ROWS);
  const hiddenCount = regularAllDay.length - MAX_ALLDAY_ROWS;

  return (
    <div className="flex flex-col h-full">
      {/* Day Headers + All-Day Strip */}
      <div className="border-b border-border sticky top-0 bg-background z-10">
        {/* Day header row */}
        <div className="flex">
          <div className={showDualTz ? "w-28 shrink-0" : "w-16 shrink-0"} />
          {days.map((day, i) => {
            const isToday = isSameDay(day, today);
            const dayLocalStr = new Intl.DateTimeFormat("en-CA", { timeZone: deviceTz }).format(day);
            const isHomeToday = showDualTz && dayLocalStr === homeTodayDateStr;
            return (
              <div key={i} className="flex-1 text-center py-2 border-l border-border" style={isToday ? { backgroundColor: "rgba(42,175,169,0.05)" } : undefined}>
                <div className="text-xs text-muted-foreground">{day.toLocaleDateString([], { weekday: "short" })}</div>
                <div className="relative inline-flex items-center justify-center">
                  {/* Teal fill — device today */}
                  <div
                    className="text-lg font-semibold w-8 h-8 flex items-center justify-center rounded-full"
                    style={isToday ? { backgroundColor: "#2AAFA9", color: "#fff" } : undefined}
                  >
                    {day.getDate()}
                  </div>
                  {/* Violet ring — home today (when different from device today) */}
                  {isHomeToday && !isToday && (
                    <div
                      className="absolute inset-0 rounded-full pointer-events-none"
                      style={{ border: "1.5px solid #8B5CF6" }}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {/* All-day events strip — regular events + property booking row */}
        {(regularAllDay.length > 0 || propertyBookingBars.length > 0) && (
          <div className="border-t border-border/50 bg-background/80">
            {/* Regular all-day events with +N overflow */}
            {regularAllDay.length > 0 && (
              <div className="flex">
                <div className={`${showDualTz ? "w-28" : "w-16"} shrink-0 flex flex-col items-end justify-start pt-1 pr-1 gap-0.5`}>
                  <span className="text-[9px] text-muted-foreground">all-day</span>
                  {hiddenCount > 0 && (
                    <button
                      className="text-[9px] text-primary font-semibold hover:underline leading-none"
                      onClick={() => setAllDayExpanded(x => !x)}
                    >
                      {allDayExpanded ? "less" : `+${hiddenCount}`}
                    </button>
                  )}
                </div>
                <div
                  className="flex-1 relative"
                  style={{ minHeight: `${visibleAllDay.length * 22 + 4}px` }}
                >
                  {visibleAllDay.map((event, idx) => {
                    const windowStart = days[0];
                    const windowEnd = new Date(days[days.length - 1].getTime() + 86400000);
                    const totalDays = days.length;
                    const rawStart = new Date(event.startTime);
                    const rawEnd   = new Date(event.endTime);
                    const evStart = new Date(rawStart.getUTCFullYear(), rawStart.getUTCMonth(), rawStart.getUTCDate());
                    const evEnd   = new Date(rawEnd.getUTCFullYear(), rawEnd.getUTCMonth(), rawEnd.getUTCDate() + 1);
                    const clampedStart = evStart < windowStart ? windowStart : evStart;
                    const clampedEnd = evEnd > windowEnd ? windowEnd : evEnd;
                    const startDayIdx = days.findIndex(d => isSameDay(d, clampedStart) || d >= clampedStart);
                    const startIdx = startDayIdx === -1 ? 0 : startDayIdx;
                    let spanDays = 0;
                    for (let d = 0; d < totalDays; d++) {
                      if (days[d] >= clampedStart && days[d] < clampedEnd) spanDays++;
                    }
                    if (spanDays === 0) return null;
                    const leftPct = (startIdx / totalDays) * 100;
                    const widthPct = (spanDays / totalDays) * 100;
                    const isShadow = !!(event as any).isShadow;
                    const baseColor = (event as any).verticalColor || calendarColorMap[event.calendarId] || "#2AAFA9";
                    const eventColor = isShadow ? "transparent" : baseColor;
                    return (
                      <div
                        key={event.id}
                        className={`absolute rounded text-[10px] px-1.5 flex items-center truncate ${
                          isShadow
                            ? "border border-dashed border-slate-400 text-slate-400"
                            : "text-white cursor-pointer hover:opacity-90"
                        }`}
                        style={{
                          left: `calc(${leftPct}% + 2px)`,
                          width: `calc(${widthPct}% - 4px)`,
                          top: `${idx * 22 + 2}px`,
                          height: "20px",
                          backgroundColor: isShadow ? "transparent" : eventColor,
                        }}
                        onClick={() => { if (!isShadow) onEventClick(event); }}
                      >
                        <span className="truncate">{isShadow ? ((event as any).isAvailabilityOnly ? "Stay" : "Busy") : event.title}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {/* Property booking bars — separate row below regular all-day events */}
            {propertyBookingBars.length > 0 && (
              <div className="flex border-t border-border/30">
                <div className="w-16 shrink-0 flex items-center justify-end pr-1">
                  <span className="text-[9px] text-muted-foreground/60">stays</span>
                </div>
                <div
                  className="flex-1 relative"
                  style={{ minHeight: `${propertyBookingBars.length * 22 + 4}px` }}
                >
                  {propertyBookingBars.map((event, idx) => {
                    const windowStart = days[0];
                    const windowEnd = new Date(days[days.length - 1].getTime() + 86400000);
                    const totalDays = days.length;
                    const rawStart = new Date(event.startTime);
                    const rawEnd   = new Date(event.endTime);
                    const evStart = new Date(rawStart.getUTCFullYear(), rawStart.getUTCMonth(), rawStart.getUTCDate());
                    // iCal checkOut is stored as UTC midnight of the NEXT day (already exclusive).
                    // Do NOT add +1 — that would push evEnd one extra day too far.
                    // (Regular all-day events use +1 because their endTime is 23:59:59 of the last
                    //  inclusive day, but property bookings store checkOut as UTC midnight.)
                    const evEnd   = new Date(rawEnd.getUTCFullYear(), rawEnd.getUTCMonth(), rawEnd.getUTCDate());
                    const clampedStart = evStart < windowStart ? windowStart : evStart;
                    const clampedEnd = evEnd > windowEnd ? windowEnd : evEnd;
                    const startDayIdx = days.findIndex(d => isSameDay(d, clampedStart) || d >= clampedStart);
                    const startIdx = startDayIdx === -1 ? 0 : startDayIdx;
                    let spanDays = 0;
                    for (let d = 0; d < totalDays; d++) {
                      if (days[d] >= clampedStart && days[d] < clampedEnd) spanDays++;
                    }
                    if (spanDays === 0) return null;
                    const leftPct = (startIdx / totalDays) * 100;
                    const widthPct = (spanDays / totalDays) * 100;
                    const barColor = (event as any).hasConflict ? "#EF4444" : ((event as any).verticalColor || calendarColorMap[event.calendarId] || "#2AAFA9");
                    // Determine if check-in / check-out day is visible in this window.
                    // Checkout day = evEnd - 1 day (evEnd is the exclusive end).
                    const checkoutDay = new Date(evEnd.getTime() - 86400000);
                    const isCheckinVisible = isSameDay(evStart, clampedStart) && evStart >= windowStart;
                    const isCheckoutVisible = isSameDay(checkoutDay, new Date(clampedEnd.getTime() - 86400000)) && evEnd <= windowEnd;
                    return (
                      <div
                        key={event.id}
                        className="absolute flex items-center cursor-pointer hover:opacity-90 overflow-hidden"
                        style={{ left: `calc(${leftPct}% + 2px)`, width: `calc(${widthPct}% - 4px)`, top: `${idx * 22 + 2}px`, height: "20px" }}
                        title={event.title}
                        onClick={() => onEventClick(event)}
                      >
                        {/* Left end: closed node on check-in day, flat cap otherwise */}
                        {isCheckinVisible ? (
                          <svg width="10" height="10" viewBox="0 0 10 10" className="shrink-0">
                            <circle cx="5" cy="5" r="4.5" fill={barColor} />
                          </svg>
                        ) : (
                          <div className="w-1.5 h-px" style={{ backgroundColor: barColor, opacity: 0.4 }} />
                        )}
                        {/* Line + label */}
                        <div className="flex-1 h-px" style={{ backgroundColor: barColor, opacity: 0.5 }} />
                        <span className="text-[9px] font-medium truncate shrink px-0.5" style={{ color: barColor, maxWidth: "55%" }}>
                          {(event as any).propertyName || event.title}
                        </span>
                        <div className="flex-1 h-px" style={{ backgroundColor: barColor, opacity: 0.5 }} />
                        {/* Right end: open node on check-out day, flat cap otherwise */}
                        {isCheckoutVisible ? (
                          <svg width="10" height="10" viewBox="0 0 10 10" className="shrink-0">
                            <circle cx="5" cy="5" r="3.5" fill="none" stroke={barColor} strokeWidth="2" />
                          </svg>
                        ) : (
                          <div className="w-1.5 h-px" style={{ backgroundColor: barColor, opacity: 0.4 }} />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Time Grid */}
      <div className="flex-1 overflow-y-auto" ref={gridScrollRef}>
        <div className="flex relative">
          {/* Hour labels — dual LOCAL/HOME columns when timezones differ */}
          <div className={showDualTz ? "w-28 shrink-0" : "w-16 shrink-0"}>
            {/* Column headers — only shown when dual tz active */}
            {showDualTz && (
              <div className="flex items-center justify-end pr-1 gap-1" style={{ height: "16px" }}>
                <span className="text-[8px] uppercase tracking-widest" style={{ color: "#2AAFA9", minWidth: "36px", textAlign: "right" }}>LOCAL</span>
                <span className="text-[8px] uppercase tracking-widest text-muted-foreground" style={{ minWidth: "36px", textAlign: "right", opacity: 0.6 }}>HOME</span>
              </div>
            )}
            {HOURS.map(hour => (
              <div key={hour} style={{ height: `${hourHeight}px` }} className={`flex items-start ${showDualTz ? "justify-end pr-1 gap-1" : "justify-end pr-2"}`}>
                {showDualTz ? (
                  <>
                    {/* Local time */}
                    <span className="text-xs -mt-2 tabular-nums" style={{ color: "#2AAFA9", minWidth: "36px", textAlign: "right" }}>
                      {hour === 0 ? "" : `${hour % 12 || 12}${hour < 12 ? "a" : "p"}`}
                    </span>
                    {/* Home time — compute home hour from device offset */}
                    <span className="text-[10px] -mt-2 tabular-nums text-muted-foreground" style={{ minWidth: "36px", textAlign: "right", opacity: 0.6 }}>
                      {hour === 0 ? "" : (() => {
                        // Get the home hour for this device hour slot
                        const slotTs = new Date();
                        slotTs.setHours(hour, 0, 0, 0);
                        const homeH = parseInt(new Intl.DateTimeFormat("en-US", { timeZone: homeTz, hour: "numeric", hour12: false }).format(slotTs), 10);
                        return `${homeH % 12 || 12}${homeH < 12 ? "a" : "p"}`;
                      })()}
                    </span>
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground -mt-2">
                    {hour === 0 ? "" : `${hour % 12 || 12} ${hour < 12 ? "AM" : "PM"}`}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map((day, dayIdx) => {
            const isToday = isSameDay(day, today);
            const dayEvents = events.filter(e => isSameDay(new Date(e.startTime), day) && !e.isAllDay);
            const laidOut = layoutEvents(dayEvents);

            return (
              <div key={dayIdx} className="flex-1 relative border-l border-border">
                {/* Hour slots */}
                {HOURS.map(hour => (
                  <div
                    key={hour}
                    style={{ height: `${hourHeight}px` }}
                    className="border-b border-border/50 hover:bg-accent/30 cursor-pointer transition-colors"
                    onClick={() => onSlotClick(day, hour)}
                  />
                ))}

                {/* Current time indicator — Teal line with dual-time pill */}
                {isToday && (
                  <div className="absolute left-0 right-0 z-20 pointer-events-none" style={{ top: `${nowTop}px` }}>
                    <div className="flex items-center">
                      <div className="w-2 h-2 rounded-full -ml-1 shrink-0" style={{ backgroundColor: "#2AAFA9" }} />
                      <div className="flex-1 h-px" style={{ backgroundColor: "#2AAFA9" }} />
                      {/* Time pill at right end */}
                      <div className="shrink-0 rounded-full px-1.5 py-0.5 text-[8px] font-medium text-white tabular-nums" style={{ backgroundColor: "#2AAFA9", marginRight: "2px" }}>
                        {formatInTzShort(Date.now(), deviceTz)}
                        {showDualTz && (
                          <span className="opacity-75"> · {formatInTzShort(Date.now(), homeTz)} home</span>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Events — side-by-side columns for overlaps */}
                {laidOut.map(event => {
                  const startMinutes = new Date(event.startTime).getHours() * 60 + new Date(event.startTime).getMinutes();
                  const endMinutes = new Date(event.endTime).getHours() * 60 + new Date(event.endTime).getMinutes();
                  const top = (startMinutes / 60) * hourHeight;
                  const height = Math.max(((endMinutes - startMinutes) / 60) * hourHeight, 20);
                  const isShadow = !!event.isShadow;
                  const eventColor = isShadow ? "transparent" : (calendarColorMap[event.calendarId] || CALENDAR_COLORS[0]);
                  const colWidth = 100 / event.totalCols;
                  const leftPct = event.col * colWidth;
                  return (
                    <div
                      key={event.id}
                      className={`absolute rounded-md px-1.5 py-0.5 text-xs overflow-hidden transition-opacity ${
                        isShadow
                          ? "border border-dashed border-slate-400 text-slate-400 cursor-default"
                          : "text-white cursor-pointer hover:opacity-90"
                      }`}
                      style={{
                        top: `${top}px`,
                        height: `${height}px`,
                        left: `calc(${leftPct}% + 2px)`,
                        width: `calc(${colWidth}% - 4px)`,
                        backgroundColor: eventColor,
                      }}
                      onClick={e => { e.stopPropagation(); if (!isShadow) onEventClick(event); }}
                    >
                      <div className="font-medium truncate leading-tight">{isShadow ? ((event as any).isAvailabilityOnly ? "Stay" : "Busy") : event.title}</div>
                      {height > 30 && !isShadow && (
                        <div className="text-white/80 truncate text-[10px]">{formatTime(event.startTime)} – {formatTime(event.endTime)}</div>
                      )}
                      {/* Home time corner badge — only shown when device tz ≠ home tz */}
                      {showDualTz && !isShadow && height >= 24 && (
                        <div
                          className="absolute bottom-0.5 right-0.5 text-[8px] tabular-nums leading-none"
                          style={{ color: "rgba(139,92,246,0.85)" }}
                        >
                          {formatInTzShort(event.startTime, homeTz)}▸
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Month View ─────────────────────────────────────────────────────

function MonthView({
  currentDate, events, calendarColorMap, onDayClick, onEventClick,
}: {
  currentDate: Date;
  events: CalendarEvent[];
  calendarColorMap: Record<string, string>;
  onDayClick: (date: Date) => void;
  onEventClick: (event: CalendarEvent) => void;
}) {
  const dates = getMonthDates(currentDate);
  const today = new Date();
  const currentMonth = currentDate.getMonth();

  // Split into week rows (each row = 7 days)
  const weeks: Date[][] = [];
  for (let i = 0; i < dates.length; i += 7) weeks.push(dates.slice(i, i + 7));

  // For each week row, compute spanning all-day bars
  function getAllDayBarsForWeek(week: Date[]) {
    const weekStart = week[0];
    const weekEnd = new Date(week[6].getTime() + 86400000);
    const allDayEvts = events.filter(e =>
      e.isAllDay &&
      e.startTime < weekEnd.getTime() &&
      (e.endTime + 86400000) > weekStart.getTime()
    );
    return allDayEvts.map(event => {
      // All-day events stored as UTC midnight — reconstruct as LOCAL midnight for correct column
      const rawS = new Date(event.startTime);
      const rawE = new Date(event.endTime);
      const isPropertyBooking = !!(event as any).isPropertyBooking;
      const evStart = new Date(rawS.getUTCFullYear(), rawS.getUTCMonth(), rawS.getUTCDate());
      // Property bookings store checkOut as UTC midnight of the NEXT day (already exclusive).
      // Regular all-day events store endTime as 23:59:59 of the last inclusive day and need +1.
      const evEnd = isPropertyBooking
        ? new Date(rawE.getUTCFullYear(), rawE.getUTCMonth(), rawE.getUTCDate()) // already exclusive
        : new Date(rawE.getUTCFullYear(), rawE.getUTCMonth(), rawE.getUTCDate() + 1); // exclusive
      const clampedStart = evStart < weekStart ? weekStart : evStart;
      const clampedEnd = evEnd > weekEnd ? weekEnd : evEnd;
      const startCol = week.findIndex(d => isSameDay(d, clampedStart) || d >= clampedStart);
      let spanCols = 0;
      for (let d = 0; d < 7; d++) {
        if (week[d] >= clampedStart && week[d] < clampedEnd) spanCols++;
      }
      const isStart = isSameDay(evStart, clampedStart);
      const isEnd = evEnd <= weekEnd;
      return { event, startCol: startCol === -1 ? 0 : startCol, spanCols, isStart, isEnd };
    });
  }

  return (
    <div className="h-full flex flex-col">
      <div className="grid grid-cols-7 border-b border-border">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => (
          <div key={day} className="text-center py-2 text-xs font-medium text-muted-foreground">{day}</div>
        ))}
      </div>

      <div className="flex-1 flex flex-col">
        {weeks.map((week, weekIdx) => {
          const allDayBars = getAllDayBarsForWeek(week);
          return (
            <div key={weekIdx} className="flex-1 flex flex-col" style={{ minHeight: "80px" }}>
              {/* All-day spanning bars for this week row */}
              {allDayBars.length > 0 && (
                <div className="relative grid grid-cols-7" style={{ height: `${Math.min(allDayBars.length, 3) * 18 + 2 + (allDayBars.length > 3 ? 16 : 0)}px` }}>
                  {allDayBars.slice(0, 3).map(({ event, startCol, spanCols, isStart, isEnd }, barIdx) => {
                    const isShadow = !!(event as any).isShadow;
                    const isPropertyBooking = !!(event as any).isPropertyBooking;
                    const baseColor = (event as any).verticalColor || calendarColorMap[event.calendarId] || "#2AAFA9";
                    const eventColor = isShadow ? "transparent" : baseColor;
                    const barColor = (event as any).hasConflict ? "#EF4444" : eventColor;
                    // Property bookings: node bar style
                    if (isPropertyBooking) {
                      return (
                        <div
                          key={event.id}
                          className="absolute flex items-center gap-0.5 cursor-pointer hover:opacity-90 overflow-hidden"
                          style={{ left: `calc(${(startCol / 7) * 100}% + 1px)`, width: `calc(${(spanCols / 7) * 100}% - 2px)`, top: `${barIdx * 18 + 1}px`, height: "16px" }}
                          title={event.title}
                          onClick={(e) => { e.stopPropagation(); onEventClick(event as CalendarEvent); }}
                        >
                          {isStart && <svg width="8" height="8" viewBox="0 0 8 8" className="shrink-0"><circle cx="4" cy="4" r="3.5" fill={barColor} /></svg>}
                          <div className="flex-1 h-px" style={{ backgroundColor: barColor, opacity: 0.5 }} />
                          {isStart && <span className="text-[9px] font-medium truncate" style={{ color: barColor }}>{(event as any).propertyName || event.title}</span>}
                          {isStart && <div className="flex-1 h-px" style={{ backgroundColor: barColor, opacity: 0.5 }} />}
                          {isEnd && <svg width="8" height="8" viewBox="0 0 8 8" className="shrink-0"><circle cx="4" cy="4" r="2.5" fill="none" stroke={barColor} strokeWidth="2" /></svg>}
                        </div>
                      );
                    }
                    return (
                      <div
                        key={event.id}
                        className={`absolute text-[10px] px-1 flex items-center truncate ${
                          isShadow
                            ? "border border-dashed border-slate-400 text-slate-400"
                            : "text-white cursor-pointer hover:opacity-90"
                        } ${isStart ? "rounded-l" : ""} ${isEnd ? "rounded-r" : ""}`}
                        style={{
                          left: `calc(${(startCol / 7) * 100}% + 1px)`,
                          width: `calc(${(spanCols / 7) * 100}% - 2px)`,
                          top: `${barIdx * 18 + 1}px`,
                          height: "16px",
                          backgroundColor: isShadow ? "transparent" : eventColor,
                        }}
                        onClick={(e) => { e.stopPropagation(); if (!isShadow) onEventClick(event as CalendarEvent); }}
                      >
                        {isStart && <span className="truncate">{isShadow ? ((event as any).isAvailabilityOnly ? "Stay" : "Busy") : event.title}</span>}
                      </div>
                    );
                  })}
                  {/* +N overflow chip when more than 3 all-day events exist in this week */}
                  {allDayBars.length > 3 && (
                    <div
                      className="absolute text-[9px] font-medium text-muted-foreground hover:text-foreground cursor-pointer transition-colors px-1 py-0.5 rounded bg-muted/40 hover:bg-muted/70"
                      style={{ left: "2px", top: `${3 * 18 + 2}px`, height: "14px", lineHeight: "14px" }}
                      title={`${allDayBars.length - 3} more all-day event${allDayBars.length - 3 !== 1 ? "s" : ""} this week`}
                      onClick={(e) => { e.stopPropagation(); }}
                    >
                      +{allDayBars.length - 3} more
                    </div>
                  )}
                </div>
              )}
              {/* Day cells for this week */}
              <div className="flex-1 grid grid-cols-7">
                {week.map((date, dayIdx) => {
                  const isToday = isSameDay(date, today);
                  const isCurrentMonth = date.getMonth() === currentMonth;
                  // Only show non-all-day events in the cell body
                  const timedEvents = events.filter(e =>
                    !e.isAllDay && isSameDay(new Date(e.startTime), date)
                  );
                  return (
                    <div
                      key={dayIdx}
                      className={`border-b border-r border-border p-1 cursor-pointer hover:bg-accent/20 transition-colors ${!isCurrentMonth ? "opacity-40" : ""}`}
                      onClick={() => onDayClick(date)}
                    >
                      <div className="text-xs font-medium mb-0.5 w-6 h-6 flex items-center justify-center rounded-full" style={isToday ? { backgroundColor: "#2AAFA9", color: "#fff" } : undefined}>
                        {date.getDate()}
                      </div>
                      <div className="space-y-0.5">
                        {timedEvents.slice(0, 2).map(event => {
                          const isShadow = !!(event as CalendarEvent).isShadow;
                          const eventColor = isShadow ? "transparent" : (calendarColorMap[event.calendarId] || CALENDAR_COLORS[0]);
                          return (
                            <div
                              key={event.id}
                              className={`text-[10px] px-1 py-0.5 rounded truncate transition-opacity ${
                                isShadow
                                  ? "border border-dashed border-slate-400 text-slate-400 cursor-default"
                                  : "text-white cursor-pointer hover:opacity-80"
                              }`}
                              style={{ backgroundColor: eventColor }}
                              onClick={(e) => { e.stopPropagation(); if (!isShadow) onEventClick(event as CalendarEvent); }}
                            >
                              {isShadow ? ((event as any).isAvailabilityOnly ? "Stay" : `Busy`) : `${formatTime(event.startTime)} ${event.title}`}
                            </div>
                          );
                        })}
                        {timedEvents.length > 2 && <div className="text-[10px] text-muted-foreground px-1">+{timedEvents.length - 2} more</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Create Event Dialog ────────────────────────────────────────────

type VideoCallType = "none" | "meet" | "zoom" | "teams";

function generateMeetLink(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz";
  const seg = (n: number) => Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `https://meet.google.com/${seg(3)}-${seg(4)}-${seg(3)}`;
}

function CreateEventDialog({
  open, onOpenChange, selectedSlot, calendars, onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedSlot: { date: Date; hour?: number } | null;
  calendars: any[];
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [calendarId, setCalendarId] = useState("");
  const [isAllDay, setIsAllDay] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [startTimeStr, setStartTimeStr] = useState("");
  const [endDate, setEndDate] = useState("");
  const [endTimeStr, setEndTimeStr] = useState("");
  const [videoCall, setVideoCall] = useState<VideoCallType>("none");
  const [zoomLink, setZoomLink] = useState("");
  const [teamsLink, setTeamsLink] = useState("");
  const [recurrencePreset, setRecurrencePreset] = useState<"none"|"daily"|"weekly"|"weekdays"|"monthly"|"annually"|"custom">("none");
  const [customRRule, setCustomRRule] = useState("");

  const createEvent = trpc.calendar.events.create.useMutation({
    onSuccess: () => { toast.success("Event created"); onCreated(); resetForm(); },
    onError: (err) => toast.error(err.message),
  });

  const resetForm = () => {
    setTitle(""); setDescription(""); setLocation(""); setCalendarId("");
    setIsAllDay(false); setVideoCall("none"); setZoomLink(""); setTeamsLink("");
    setRecurrencePreset("none"); setCustomRRule("");
  };

  useMemo(() => {
    if (selectedSlot) {
      const d = selectedSlot.date;
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      setStartDate(dateStr);
      setEndDate(dateStr);
      if (selectedSlot.hour !== undefined) {
        setStartTimeStr(`${String(selectedSlot.hour).padStart(2, "0")}:00`);
        setEndTimeStr(`${String(Math.min(selectedSlot.hour + 1, 23)).padStart(2, "0")}:00`);
      } else {
        setStartTimeStr("09:00");
        setEndTimeStr("10:00");
      }
      if (calendars.length > 0 && !calendarId) setCalendarId(calendars[0].id);
    }
  }, [selectedSlot, calendars]);

  const handleSubmit = () => {
    if (!title.trim()) { toast.error("Title is required"); return; }
    if (!calendarId) { toast.error("Please select a calendar"); return; }
    let startTime: number, endTime: number;
    if (isAllDay) {
      startTime = new Date(`${startDate}T00:00:00`).getTime();
      endTime = new Date(`${endDate}T23:59:59`).getTime();
    } else {
      startTime = new Date(`${startDate}T${startTimeStr}:00`).getTime();
      endTime = new Date(`${endDate}T${endTimeStr}:00`).getTime();
    }
    if (endTime <= startTime) { toast.error("End time must be after start time"); return; }
    // Build description with video call link appended
    let finalDescription = description || "";
    let finalLocation = location || "";
    if (videoCall === "meet") {
      const link = generateMeetLink();
      finalLocation = finalLocation || link;
      finalDescription = finalDescription ? `${finalDescription}\n\nGoogle Meet: ${link}` : `Google Meet: ${link}`;
    } else if (videoCall === "zoom" && zoomLink.trim()) {
      finalLocation = finalLocation || zoomLink.trim();
      finalDescription = finalDescription ? `${finalDescription}\n\nZoom: ${zoomLink.trim()}` : `Zoom: ${zoomLink.trim()}`;
    } else if (videoCall === "teams" && teamsLink.trim()) {
      finalLocation = finalLocation || teamsLink.trim();
      finalDescription = finalDescription ? `${finalDescription}\n\nMicrosoft Teams: ${teamsLink.trim()}` : `Microsoft Teams: ${teamsLink.trim()}`;
    }
    const rruleMap: Record<string, string> = {
      daily: "RRULE:FREQ=DAILY",
      weekly: `RRULE:FREQ=WEEKLY;BYDAY=${["SU","MO","TU","WE","TH","FR","SA"][new Date(startDate).getDay()]}`,
      weekdays: "RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
      monthly: "RRULE:FREQ=MONTHLY",
      annually: "RRULE:FREQ=YEARLY",
    };
    const recurrenceRule = recurrencePreset === "none" ? undefined
      : recurrencePreset === "custom" ? (customRRule.trim() || undefined)
      : rruleMap[recurrencePreset];
    createEvent.mutate({ calendarId, title: title.trim(), description: finalDescription || undefined, location: finalLocation || undefined, startTime, endTime, isAllDay, recurrenceRule });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Create Event</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="title">Title</Label>
            <Input id="title" value={title} onChange={e => setTitle(e.target.value)} placeholder="Event title" />
          </div>
          {calendars.length > 0 && (
            <div>
              <Label>Calendar</Label>
              <Select value={calendarId} onValueChange={setCalendarId}>
                <SelectTrigger><SelectValue placeholder="Select calendar" /></SelectTrigger>
                <SelectContent>
                  {calendars.map((cal: any) => (<SelectItem key={cal.id} value={cal.id}>{cal.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Switch id="allday" checked={isAllDay} onCheckedChange={setIsAllDay} />
            <Label htmlFor="allday">All day</Label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Start Date</Label><Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} /></div>
            {!isAllDay && <div><Label>Start Time</Label><Input type="time" value={startTimeStr} onChange={e => setStartTimeStr(e.target.value)} /></div>}
            <div><Label>End Date</Label><Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} /></div>
            {!isAllDay && <div><Label>End Time</Label><Input type="time" value={endTimeStr} onChange={e => setEndTimeStr(e.target.value)} /></div>}
          </div>
          {/* Recurrence */}
          <div>
            <Label className="flex items-center gap-1.5 mb-2"><RefreshCw className="h-3.5 w-3.5" /> Repeat</Label>
            <Select value={recurrencePreset} onValueChange={(v: any) => setRecurrencePreset(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Does not repeat</SelectItem>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="weekdays">Every weekday (Mon–Fri)</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="annually">Annually</SelectItem>
                <SelectItem value="custom">Custom RRULE…</SelectItem>
              </SelectContent>
            </Select>
            {recurrencePreset === "custom" && (
              <Input
                className="mt-2"
                value={customRRule}
                onChange={e => setCustomRRule(e.target.value)}
                placeholder="e.g. RRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=10"
              />
            )}
          </div>

          <div>
            <Label htmlFor="location">Location</Label>
            <LocationAutocomplete
              value={location}
              onChange={setLocation}
              onPlaceSelect={({ address, mapsUrl }) => {
                setLocation(address);
                setDescription(prev => {
                  const link = `\ud83d\udccd ${mapsUrl}`;
                  if (prev && prev.includes(mapsUrl)) return prev;
                  return prev ? `${prev}\n${link}` : link;
                });
              }}
              placeholder="Add location or address"
            />
          </div>

          {/* Video call */}
          <div>
            <Label className="flex items-center gap-1.5 mb-2"><Video className="h-3.5 w-3.5" /> Video call</Label>
            <div className="flex gap-2 flex-wrap">
              {(["none", "meet", "zoom", "teams"] as VideoCallType[]).map(v => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setVideoCall(v)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                    videoCall === v ? "border-transparent text-white" : "border-border bg-transparent text-muted-foreground hover:text-foreground"
                  }`}
                  style={videoCall === v ? { backgroundColor: v === "meet" ? "#4285F4" : v === "zoom" ? "#2D8CFF" : v === "teams" ? "#6264A7" : "#6b7280" } : undefined}
                >
                  {v === "none" ? "None" : v === "meet" ? "Google Meet" : v === "zoom" ? "Zoom" : "Teams"}
                </button>
              ))}
            </div>
            {videoCall === "meet" && (
              <p className="text-xs text-muted-foreground mt-1.5">A Google Meet link will be generated and added to the event.</p>
            )}
            {videoCall === "zoom" && (
              <div className="mt-2">
                <Input value={zoomLink} onChange={e => setZoomLink(e.target.value)} placeholder="Paste your Zoom meeting link" />
              </div>
            )}
            {videoCall === "teams" && (
              <div className="mt-2">
                <Input value={teamsLink} onChange={e => setTeamsLink(e.target.value)} placeholder="Paste your Teams meeting link" />
              </div>
            )}
          </div>

          <div><Label htmlFor="description">Description</Label><Textarea id="description" value={description} onChange={e => setDescription(e.target.value)} placeholder="Add description" rows={3} /></div>
        </div>
        <DialogFooter>
          <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
          <Button onClick={handleSubmit} disabled={createEvent.isPending}>{createEvent.isPending ? "Creating..." : "Create Event"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Booking Request Dialog (for members / caregivers / children / elders) ──
function BookingRequestDialog({
  open, onOpenChange, selectedSlot, onSubmitted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedSlot: { date: Date; hour?: number } | null;
  onSubmitted: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetVerticalId, setTargetVerticalId] = useState("");
  const { data: verticals = [] } = trpc.accessControl.getMyAccessibleVerticals.useQuery();
  const [startDate, setStartDate] = useState("");
  const [startTimeStr, setStartTimeStr] = useState("");
  const [endDate, setEndDate] = useState("");
  const [endTimeStr, setEndTimeStr] = useState("");

  // Populate from selected slot
  useMemo(() => {
    if (selectedSlot) {
      const d = selectedSlot.date;
      const pad = (n: number) => String(n).padStart(2, "0");
      const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      setStartDate(dateStr);
      setEndDate(dateStr);
      if (selectedSlot.hour !== undefined) {
        setStartTimeStr(`${pad(selectedSlot.hour)}:00`);
        setEndTimeStr(`${pad(Math.min(selectedSlot.hour + 1, 23))}:00`);
      } else {
        setStartTimeStr("09:00");
        setEndTimeStr("10:00");
      }
    }
  }, [selectedSlot]);

  const createRequest = trpc.bookingRequests.create.useMutation({
    onSuccess: onSubmitted,
    onError: (err) => toast.error(err.message),
  });

  const handleSubmit = () => {
    if (!title.trim()) { toast.error("Please add a title for your request"); return; }
    const startTime = new Date(`${startDate}T${startTimeStr}:00`).getTime();
    const endTime = new Date(`${endDate}T${endTimeStr}:00`).getTime();
    if (endTime <= startTime) { toast.error("End time must be after start time"); return; }
    if (!targetVerticalId) { toast.error("Please select whose calendar to request time on"); return; }
    createRequest.mutate({ title: title.trim(), description: description || undefined, targetVerticalId, startTime, endTime });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" /> Request Time
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            Submit a request to book a free slot. The household admin will review and confirm.
          </p>
          <div className="space-y-1.5">
            <Label>What's this for?</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Family dinner, School pickup, Chat" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Start Date</Label>
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Start Time</Label>
              <Input type="time" value={startTimeStr} onChange={e => setStartTimeStr(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>End Date</Label>
              <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>End Time</Label>
              <Input type="time" value={endTimeStr} onChange={e => setEndTimeStr(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Whose calendar?</Label>
            <Select value={targetVerticalId} onValueChange={setTargetVerticalId}>
              <SelectTrigger><SelectValue placeholder="Select a vertical…" /></SelectTrigger>
              <SelectContent>
                {(verticals as any[]).map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    <div className="flex items-center gap-2">
                      <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: v.color ?? "#2AAFA9" }} />
                      {v.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Notes <span className="text-muted-foreground">(optional)</span></Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Any details the admin should know…" rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={createRequest.isPending}>
            {createRequest.isPending ? "Sending…" : "Send Request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Booking Review Dialog (for household_admin / EA) ────────────────────────
function BookingReviewDialog({
  open, onOpenChange, onAccepted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAccepted: () => void;
}) {
  const { data: requests = [], isLoading, refetch } = trpc.bookingRequests.list.useQuery(
    { status: "pending" },
    { enabled: open }
  );

  const respond = trpc.bookingRequests.respond.useMutation({
    onSuccess: () => { refetch(); onAccepted(); },
    onError: (err) => toast.error(err.message),
  });

  const formatSlot = (start: number, end: number) => {
    const s = new Date(start);
    const e = new Date(end);
    return `${s.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })} · ${
      s.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} – ${
      e.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Inbox className="h-4 w-4 text-primary" /> Booking Requests
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2 max-h-[60vh] overflow-y-auto">
          {isLoading && <p className="text-sm text-muted-foreground text-center py-4">Loading…</p>}
          {!isLoading && (requests as any[]).length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle2 className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No pending requests</p>
            </div>
          )}
          {(requests as any[]).map((req) => (
            <div key={req.id} className="rounded-lg border p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <GeeveNodeBadge status="pending" size={8} />
                    <p className="font-medium text-sm truncate">{req.title}</p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {req.requesterName ?? "A household member"} · {formatSlot(req.requestedStartTime, req.requestedEndTime)}
                  </p>
                </div>
              </div>
              {req.notes && (
                <p className="text-xs text-muted-foreground bg-secondary/50 rounded p-2">{req.notes}</p>
              )}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="flex-1 gap-1.5"
                  onClick={() => respond.mutate({ requestId: req.id, decision: "approved" })}
                  disabled={respond.isPending}
                >
                  <GeeveNode status="approved" size={10} /> Accept
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 gap-1.5"
                  onClick={() => respond.mutate({ requestId: req.id, decision: "declined" })}
                  disabled={respond.isPending}
                >
                  <GeeveNode status="declined" size={10} /> Decline
                </Button>
              </div>
            </div>
          ))}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Close</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── GanttView — all-day strip only, 3/7/14 day range ────────────────────────
function GanttView({
  currentDate,
  ganttDays,
  onGanttDaysChange,
  events,
  calendarColorMap,
  onEventClick,
}: {
  currentDate: Date;
  ganttDays: 3 | 7 | 14;
  onGanttDaysChange: (d: 3 | 7 | 14) => void;
  events: CalendarEvent[];
  calendarColorMap: Record<string, string>;
  onEventClick: (event: CalendarEvent) => void;
}) {
  // Build the array of days in the gantt range
  const days = useMemo(() => {
    return Array.from({ length: ganttDays }, (_, i) => {
      const d = new Date(currentDate);
      d.setDate(d.getDate() + i);
      d.setHours(0, 0, 0, 0);
      return d;
    });
  }, [currentDate, ganttDays]);

  const today = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }, []);

  // Separate property bookings from regular all-day events
  const propertyBookings = useMemo(() =>
    events.filter(e => (e as any).eventType === "property_booking"),
    [events]
  );
  const regularAllDay = useMemo(() =>
    events.filter(e => e.isAllDay && (e as any).eventType !== "property_booking"),
    [events]
  );
  const timedEvents = useMemo(() =>
    events.filter(e => !e.isAllDay && (e as any).eventType !== "property_booking"),
    [events]
  );

  // For each day, collect timed events that start on that day
  function getTimedForDay(day: Date) {
    return timedEvents.filter(e => {
      const s = new Date(e.startTime);
      return s.getFullYear() === day.getFullYear() &&
        s.getMonth() === day.getMonth() &&
        s.getDate() === day.getDate();
    });
  }

  // Compute row placement for all-day events (simple greedy packing)
  const allDayRows = useMemo(() => {
    const rows: CalendarEvent[][] = [];
    for (const ev of regularAllDay) {
      let placed = false;
      for (const row of rows) {
        const last = row[row.length - 1];
        if (last.endTime <= ev.startTime) {
          row.push(ev);
          placed = true;
          break;
        }
      }
      if (!placed) rows.push([ev]);
    }
    return rows;
  }, [regularAllDay]);

  const COL_W = 100 / ganttDays; // percent width per column

  function dayColIdx(date: Date) {
    // Returns 0-based column index for a UTC date (all-day events)
    const d0 = new Date(currentDate);
    d0.setHours(0, 0, 0, 0);
    const diffMs = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) -
      Date.UTC(d0.getFullYear(), d0.getMonth(), d0.getDate());
    return Math.round(diffMs / 86400000);
  }

  const tealColor = "#2AAFA9";

  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* Sub-range selector */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border shrink-0">
        <span className="text-xs text-muted-foreground font-medium">Range:</span>
        {([3, 7, 14] as const).map(n => (
          <button
            key={n}
            onClick={() => onGanttDaysChange(n)}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
              ganttDays === n ? "text-white" : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
            style={ganttDays === n ? { backgroundColor: tealColor } : undefined}
          >
            {n}d
          </button>
        ))}
      </div>

      {/* Column headers */}
      <div className="flex shrink-0 border-b border-border">
        <div className="w-24 shrink-0 text-xs text-muted-foreground px-2 py-1.5 border-r border-border">Event</div>
        <div className="flex-1 flex">
          {days.map((day, i) => {
            const isToday = day.getTime() === today.getTime();
            return (
              <div
                key={i}
                className="flex-1 text-center py-1.5 border-r border-border last:border-r-0"
                style={{ minWidth: 0 }}
              >
                <div className={`text-xs font-medium ${isToday ? "text-[#2AAFA9]" : "text-muted-foreground"}`}>
                  {day.toLocaleDateString([], { weekday: "short" })}
                </div>
                <div className={`text-sm font-bold ${isToday ? "text-[#2AAFA9]" : "text-foreground"}`}>
                  {day.getDate()}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* All-day event rows */}
      {allDayRows.length > 0 && (
        <div className="shrink-0 border-b border-border">
          {allDayRows.map((row, rowIdx) => (
            <div key={rowIdx} className="flex" style={{ minHeight: "28px" }}>
              <div className="w-24 shrink-0 border-r border-border px-2 flex items-center">
                {rowIdx === 0 && <span className="text-xs text-muted-foreground">All day</span>}
              </div>
              <div className="flex-1 relative" style={{ height: "28px" }}>
                {row.map(ev => {
                  const evStart = new Date(ev.startTime);
                  const evEnd = new Date(ev.endTime);
                  const startCol = Math.max(0, dayColIdx(evStart));
                  const endCol = Math.min(ganttDays - 1, dayColIdx(new Date(evEnd.getTime() - 1)));
                  if (startCol > ganttDays - 1 || endCol < 0) return null;
                  const color = calendarColorMap[(ev as any).calendarId] || tealColor;
                  return (
                    <div
                      key={ev.id}
                      className="absolute top-1 bottom-1 rounded cursor-pointer flex items-center px-1.5 overflow-hidden"
                      style={{
                        left: `${startCol * COL_W}%`,
                        width: `${(endCol - startCol + 1) * COL_W}%`,
                        backgroundColor: color,
                        opacity: 0.9,
                      }}
                      onClick={() => onEventClick(ev)}
                    >
                      <span className="text-xs text-white truncate font-medium">{ev.title}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Property booking row */}
      {propertyBookings.length > 0 && (
        <div className="shrink-0 border-b border-border" style={{ minHeight: "32px" }}>
          <div className="flex" style={{ minHeight: "32px" }}>
            <div className="w-24 shrink-0 border-r border-border px-2 flex items-center">
              <span className="text-xs text-muted-foreground">Stays</span>
            </div>
            <div className="flex-1 relative" style={{ height: "32px" }}>
              {propertyBookings.map(ev => {
                const evStart = new Date(ev.startTime);
                const evEnd = new Date(ev.endTime);
                const startCol = Math.max(0, dayColIdx(evStart));
                const endCol = Math.min(ganttDays - 1, dayColIdx(new Date(evEnd.getTime() - 1)));
                if (startCol > ganttDays - 1 || endCol < 0) return null;
                const isConflict = (ev as any).isConflict;
                const barColor = isConflict ? "#ef4444" : tealColor;
                const isCheckinVisible = dayColIdx(evStart) >= 0;
                const isCheckoutVisible = dayColIdx(new Date(evEnd.getTime() - 1)) <= ganttDays - 1;
                return (
                  <div
                    key={ev.id}
                    className="absolute top-2 bottom-2 flex items-center cursor-pointer"
                    style={{
                      left: `${startCol * COL_W}%`,
                      width: `${(endCol - startCol + 1) * COL_W}%`,
                    }}
                    onClick={() => onEventClick(ev)}
                    title={ev.title}
                  >
                    {isCheckinVisible ? (
                      <svg width="10" height="10" viewBox="0 0 10 10" className="shrink-0">
                        <circle cx="5" cy="5" r="4.5" fill={barColor} />
                      </svg>
                    ) : (
                      <div className="w-1.5 h-px" style={{ backgroundColor: barColor, opacity: 0.4 }} />
                    )}
                    <div className="flex-1 h-px mx-0.5" style={{ backgroundColor: barColor }} />
                    <span className="text-xs font-medium truncate px-1" style={{ color: barColor, maxWidth: "60%" }}>{ev.title}</span>
                    <div className="flex-1 h-px mx-0.5" style={{ backgroundColor: barColor }} />
                    {isCheckoutVisible ? (
                      <svg width="10" height="10" viewBox="0 0 10 10" className="shrink-0">
                        <circle cx="5" cy="5" r="3.5" fill="none" stroke={barColor} strokeWidth="2" />
                      </svg>
                    ) : (
                      <div className="w-1.5 h-px" style={{ backgroundColor: barColor, opacity: 0.4 }} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Timed events per day */}
      <div className="flex-1 overflow-auto">
        {/* Collect all unique event titles per day */}
        {days.map((day, i) => {
          const dayTimed = getTimedForDay(day);
          if (dayTimed.length === 0) return null;
          const isToday = day.getTime() === today.getTime();
          return (
            <div key={i} className="border-b border-border last:border-b-0">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-secondary/30">
                <span className={`text-xs font-semibold ${isToday ? "text-[#2AAFA9]" : "text-muted-foreground"}`}>
                  {day.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}
                </span>
                {isToday && <span className="text-xs px-1.5 py-0.5 rounded-full text-white font-medium" style={{ backgroundColor: tealColor }}>Today</span>}
              </div>
              {dayTimed.map(ev => {
                const color = calendarColorMap[(ev as any).calendarId] || tealColor;
                const start = new Date(ev.startTime);
                const end = new Date(ev.endTime);
                const timeStr = `${start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} – ${end.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
                return (
                  <div
                    key={ev.id}
                    className="flex items-center gap-2 px-3 py-2 hover:bg-secondary/50 cursor-pointer border-l-2 mx-3 my-1 rounded-r"
                    style={{ borderLeftColor: color }}
                    onClick={() => onEventClick(ev)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{ev.title}</div>
                      <div className="text-xs text-muted-foreground">{timeStr}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
        {timedEvents.length === 0 && allDayRows.length === 0 && propertyBookings.length === 0 && (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
            No events in this range
          </div>
        )}
      </div>
    </div>
  );
}
