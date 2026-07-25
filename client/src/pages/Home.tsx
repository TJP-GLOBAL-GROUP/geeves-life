import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useExpiredAccountCount, ReconnectSequenceModal, useReconnectSequenceResume } from "@/components/ReconnectSequenceModal";
import { skipToken, keepPreviousData } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc";
import { localDateISO } from "@/lib/dateUtils";
import { useAuth } from "@/_core/hooks/useAuth";
import { useIsMobile, useIsLandscape } from "@/hooks/useMobile";
import { useGestures } from "@/hooks/useGestures";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import {
  ArrowLeftRight,
  ShoppingCart,
  CreditCard,
  Package,
  ArrowRight,
  DollarSign,
  Users,
  Building2,
  CheckSquare,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  AlignJustify,
  CalendarCheck,
  MapPin,
  Clock,
  Link as LinkIcon,
  AlertTriangle,
  TrendingUp,
  Store,
  Camera,
  UserCircle,
  Star,
  Crown,
  Edit3,
  Trash2,
  UserX,
  ShieldCheck,
  Phone,
  Mail,
  DollarSign as DollarSignIcon,
  Hash,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { useLocation } from "wouter";
import { GeevesConstellationMark } from "@/components/GeevesLogo";
import { useTheme } from "@/contexts/ThemeContext";
import { ResourcesWidget } from "@/components/ResourcesWidget";
import { isSameAsHome, HOME_TIMEZONE, formatInTz } from "@/hooks/useDeviceLocation";
import { WidgetGrid } from "@/components/WidgetGrid";
import { toast } from "sonner";

// ─── Helpers ────────────────────────────────────────────────────────

function getGreeting(name?: string): string {
  const h = new Date().getHours();
  const salutation = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  return name ? `${salutation}, ${name.split(" ")[0]}` : salutation;
}

function formatCurrency(amount: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function isSameDay(d1: Date, d2: Date): boolean {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

/**
 * Converts a UTC-midnight iCal timestamp to a YYYY-MM-DD string using its UTC date
 * components — bypassing any timezone shift. This is the correct approach for iCal
 * DTSTART/DTEND values which are stored as UTC midnight but represent a local calendar date.
 */
function utcMidnightToDateStr(utcMs: number): string {
  const d = new Date(utcMs);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
/**
 * Formats a UTC-midnight iCal timestamp as a human-readable date label using the UTC
 * date components (not the timezone-shifted local time). Prevents the UTC→local shift
 * (e.g. Jul 3 00:00 UTC → Jul 2 19:00 EDT) from showing the wrong date.
 */
function formatUtcMidnightDate(utcMs: number): string {
  const d = new Date(utcMs);
  // Build a local-midnight Date from UTC components to avoid timezone shift
  const local = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0);
  return local.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
/**
 * Returns the YYYY-MM-DD date string for a UTC timestamp in a given IANA timezone.
 * Uses Intl.DateTimeFormat so it works in all browsers without a library.
 */
function toLocalDateString(utcMs: number, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(utcMs));
}

/**
 * Returns today's YYYY-MM-DD in the given timezone.
 */
function todayInTz(timezone: string): string {
  return toLocalDateString(Date.now(), timezone);
}

/**
 * Returns tomorrow's YYYY-MM-DD in the given timezone.
 */
function tomorrowInTz(timezone: string): string {
  return toLocalDateString(Date.now() + 86400000, timezone);
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

// ─── Platform colour map ────────────────────────────────────────────

const PLATFORM_COLORS: Record<string, string> = {
  airbnb: "#FF5A5F",
  vrbo: "#1B6FE4",
  booking_com: "#003580",
  direct: "#2AAFA9",  // Brand Vivid Teal — NC-07 fix
  zillow: "#006AFF",
  apartments_com: "#E31837",
  other: "#6B7280",
};

function getPlatformColor(platform: string): string {
  return PLATFORM_COLORS[platform] || "#6B7280";
}

// ─── Constellation mark: use the brand-accurate component from GeevesLogo ───
function ConstellationMark({ size = 36 }: { size?: number }) {
  return <GeevesConstellationMark size={size} />;
}

// ─── Widget: AI Greeting Header ─────────────────────────────────────

function formatTimeInZone(tz: string): string {
  try {
    return new Intl.DateTimeFormat([], {
      hour: "numeric", minute: "2-digit", hour12: true, timeZone: tz,
    }).format(new Date());
  } catch {
    return "";
  }
}

function getTimezoneCityName(tz: string): string {
  // Extract city name from IANA timezone string e.g. "America/New_York" → "New York"
  const parts = tz.split("/");
  return (parts[parts.length - 1] || tz).replace(/_/g, " ");
}

function GreetingHeader() {
  const { user } = useAuth();
  const [tick, setTick] = useState(0);

  // Tick every minute to refresh the clock
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(id);
  }, []);

  const now = new Date();
  const dateStr = now.toLocaleDateString([], {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });

  // Household timezone = "constellation home" timezone
  const householdQuery = trpc.household.getMyHousehold.useQuery();
  const homeTimezone: string = (householdQuery.data?.household as any)?.timezone || "America/New_York";

  // User's local timezone from browser
  const localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  // Are they at home or traveling? Use offset comparison (handles equivalent IANA strings)
  const isTraveling = !isSameAsHome(localTimezone);

  // Are they on a different calendar day than home?
  const localDateStr2 = new Intl.DateTimeFormat("en-CA", { timeZone: localTimezone }).format(Date.now());
  const homeDateStr2 = new Intl.DateTimeFormat("en-CA", { timeZone: homeTimezone }).format(Date.now());
  const isDifferentDay = isTraveling && localDateStr2 !== homeDateStr2;
  const homeDateDisplay = isDifferentDay
    ? new Intl.DateTimeFormat("en-US", { timeZone: homeTimezone, weekday: "short", month: "short", day: "numeric" }).format(Date.now())
    : null;

  const localTimeStr = formatTimeInZone(localTimezone);
  const homeTimeStr = formatTimeInZone(homeTimezone);
  const localCity = getTimezoneCityName(localTimezone);
  const homeCity = getTimezoneCityName(homeTimezone);

  // suppress unused tick warning
  void tick;

  const todayStart = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d.getTime(); }, []);
  const todayEnd   = useMemo(() => { const d = new Date(); d.setHours(23,59,59,999); return d.getTime(); }, []);
  const { data: todayEvents = [] } = trpc.calendar.events.list.useQuery({ startTime: todayStart, endTime: todayEnd });
  const { data: lists = [] } = trpc.shoppingLists.list.useQuery();
  const activeLists = (lists as any[]).filter((l: any) => l.status === "active");

  const summary = useMemo(() => {
    const parts: string[] = [];
    if ((todayEvents as any[]).length > 0)
      parts.push(`${(todayEvents as any[]).length} event${(todayEvents as any[]).length > 1 ? "s" : ""} today`);
    if (activeLists.length > 0)
      parts.push(`${activeLists.length} active list${activeLists.length > 1 ? "s" : ""}`);
    return parts.length > 0 ? parts.join(" · ") : "Your constellation is quiet today";
  }, [(todayEvents as any[]).length, activeLists.length]);

  const firstName = user?.name?.split(" ")[0] ?? "";
  const h = new Date().getHours();
  const salutation = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  const { theme } = useTheme();
  const isDark = theme === "dark";

  // Dark mode: brand Deep Charcoal #1A1C20 base with very-low-opacity rainbow tints
  // Light mode: soft pastel wash using brand tints over Warm White #FAFAF8
  const headerBg = isDark
    ? "linear-gradient(135deg, rgba(26,28,32,1) 0%, rgba(42,175,169,0.08) 30%, rgba(139,92,246,0.07) 65%, rgba(232,98,74,0.06) 100%)"
    : "linear-gradient(135deg, #e8f7f6 0%, #eef0fb 35%, #f3eeff 65%, #fdf4e7 100%)";
  const headerBorder = isDark
    ? "1px solid rgba(42,175,169,0.25)"
    : "1px solid rgba(42,175,169,0.30)";
  const summaryColor = isDark ? "rgba(248,247,244,0.65)" : "rgba(30,30,40,0.55)";

  return (
    <div className="relative overflow-hidden rounded-2xl mb-6 p-6 md:p-8"
      style={{ background: headerBg, border: headerBorder }}
    >
      {/* Teal glow — top right */}
      <div
        className="absolute -top-10 -right-10 h-56 w-56 rounded-full pointer-events-none"
        style={{ background: `radial-gradient(circle, rgba(42,175,169,${isDark ? "0.28" : "0.18"}) 0%, transparent 70%)` }}
      />
      {/* Coral glow — left */}
      <div
        className="absolute top-0 -left-10 h-40 w-40 rounded-full pointer-events-none"
        style={{ background: `radial-gradient(circle, rgba(232,98,74,${isDark ? "0.20" : "0.14"}) 0%, transparent 70%)` }}
      />
      {/* Violet glow — bottom right */}
      <div
        className="absolute -bottom-8 right-1/3 h-40 w-40 rounded-full pointer-events-none"
        style={{ background: `radial-gradient(circle, rgba(139,92,246,${isDark ? "0.18" : "0.12"}) 0%, transparent 70%)` }}
      />
      {/* Golden glow — bottom left */}
      <div
        className="absolute -bottom-6 -left-6 h-32 w-32 rounded-full pointer-events-none"
        style={{ background: `radial-gradient(circle, rgba(212,160,23,${isDark ? "0.15" : "0.10"}) 0%, transparent 70%)` }}
      />

      <div className="relative flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="shrink-0 mt-1">
            <ConstellationMark size={48} />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-display text-sm font-bold tracking-tight" style={{ color: isDark ? '#F8F7F4' : '#2D3139' }}>
                Geeves<span style={{ color: "#2AAFA9" }}>.Life</span>
              </span>
              <span className="text-[9px] tracking-[0.18em] uppercase text-muted-foreground">Operating System</span>
            </div>
            <h1 className="font-display text-3xl md:text-4xl font-light tracking-tight text-foreground">
              {salutation}{firstName ? (
                <>, <span style={{ color: "#2AAFA9" }}>{firstName}</span></>
              ) : null}
            </h1>
            <p className="text-sm text-muted-foreground mt-1.5">
              {dateStr}
              {homeDateDisplay && (
                <span className="ml-2 text-xs" style={{ color: "rgba(139,92,246,0.75)" }}>
                  · {homeDateDisplay} home
                </span>
              )}
            </p>
            {/* Mobile-only compact clock — hidden on md+ where the sidebar clock shows */}
            <p className="flex items-baseline gap-2 mt-0.5 md:hidden">
              <span className="text-xl font-light tabular-nums" style={{ color: "#2AAFA9" }}>{localTimeStr}</span>
              {isTraveling && (
                <span className="text-xs text-muted-foreground tabular-nums">{homeCity} {homeTimeStr}</span>
              )}
            </p>
            <p className="text-sm mt-1" style={{ color: summaryColor }}>{summary}</p>
          </div>
        </div>
        {/* Timezone clock + rainbow accent */}
        <div className="hidden md:flex flex-col items-end gap-2 shrink-0 mt-1">
          {/* Timezone display */}
          <div className="flex flex-col items-end gap-1">
            {isTraveling ? (
              <>
                <div className="flex flex-col items-end">
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Local · {localCity}</span>
                  <span className="text-lg font-light tabular-nums" style={{ color: "#2AAFA9" }}>{localTimeStr}</span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Home · {homeCity}</span>
                  <span className="text-base font-light tabular-nums text-muted-foreground">{homeTimeStr}</span>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-end">
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{localCity}</span>
                <span className="text-2xl font-light tabular-nums" style={{ color: "#2AAFA9" }}>{localTimeStr}</span>
              </div>
            )}
          </div>
          {/* Rainbow accent bar */}
          <div className="flex flex-col gap-1.5">
            {[
              ["#2AAFA9", "Technology"],
              ["#E8624A", "Family"],
              ["#D4A017", "Routines"],
              ["#8B5CF6", "Wellness"],
              ["#4F7EC4", "Business"],
              ["#E8943A", "Open"],
            ].map(([color, label]) => (
              <div key={color} className="flex items-center gap-1.5" title={label}>
                <div className="h-1.5 w-8 rounded-full" style={{ backgroundColor: color }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Widget: Mini Calendar ───────────────────────────────────────────

function CalendarWidget() {
  const [, setLocation] = useLocation();
  // Shadow block sync health — compact indicator
  const syncHealthQuery = trpc.dashboard.syncHealth.useQuery(undefined, { refetchInterval: 30000 });
  const syncHealth = syncHealthQuery.data;
  const { data: myAccessData } = trpc.household.verticalAccess.getMyAccess.useQuery();
  const canSeeSyncProgress = (myAccessData?.isAdmin ?? false) || (myAccessData?.isEa ?? false);
  const showSyncIndicator = canSeeSyncProgress && syncHealth && syncHealth.status !== 'healthy';
  // Traveling detection — show home-date second line when device date ≠ home date
  const localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const isTraveling = !isSameAsHome(localTimezone);
  const householdQuery = trpc.household.getMyHousehold.useQuery();
  const homeTimezone: string = (householdQuery.data?.household as any)?.timezone || HOME_TIMEZONE;
  const localDateStr = new Intl.DateTimeFormat("en-CA", { timeZone: localTimezone }).format(Date.now());
  const homeDateStr  = new Intl.DateTimeFormat("en-CA", { timeZone: homeTimezone }).format(Date.now());
  const isDifferentDay = isTraveling && localDateStr !== homeDateStr;
  const [calMonth, setCalMonth] = useState(() => new Date());
  const monthDates = useMemo(() => getMonthDates(calMonth), [calMonth]);

  const monthStart = useMemo(() => new Date(calMonth.getFullYear(), calMonth.getMonth(), 1).getTime(), [calMonth]);
  const monthEnd   = useMemo(() => new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 0, 23, 59, 59, 999).getTime(), [calMonth]);
  const { data: monthEvents = [] } = trpc.calendar.events.list.useQuery({ startTime: monthStart, endTime: monthEnd });

  const upcomingStart = useMemo(() => Date.now(), []);
  // Fetch 7 days ahead so upcoming list is meaningful
  const upcomingEnd   = useMemo(() => Date.now() + 7 * 24 * 60 * 60 * 1000, []);
  const { data: upcomingEventsRaw = [], isLoading: eventsLoading } = trpc.calendar.events.list.useQuery({ startTime: upcomingStart, endTime: upcomingEnd });
  const { data: calendarList = [] } = trpc.calendar.list.useQuery();
  const hasCalendars = (calendarList as any[]).length > 0;
  // Partition events into three buckets for the upcoming widget
  const { ongoingEvents, todayEvents, upcomingEvents } = useMemo(() => {
    const now = Date.now();
    const todayMidnight = (() => { const d = new Date(); d.setHours(0,0,0,0); return d.getTime(); })();
    const todayEnd = todayMidnight + 86400000;
    const allFiltered = [...(upcomingEventsRaw as any[])]
      .filter((e: any) => {
        if (e.isAllDay) return e.endTime + 86400000 > todayMidnight;
        return e.endTime > now;
      })
      .sort((a: any, b: any) => a.startTime - b.startTime);

    const ongoing: any[] = [];   // multi-day all-day events already in progress (started before today)
    const today: any[] = [];     // events starting today (all-day or timed)
    const upcoming: any[] = [];  // events starting tomorrow or later

    for (const e of allFiltered) {
      if (e.isAllDay) {
        // Use UTC date components to avoid timezone off-by-one
        const rawS = new Date(e.startTime);
        const evStartMidnight = Date.UTC(rawS.getUTCFullYear(), rawS.getUTCMonth(), rawS.getUTCDate());
        if (evStartMidnight < todayMidnight) {
          ongoing.push(e); // started before today, still ongoing
        } else if (evStartMidnight < todayEnd) {
          today.push(e);   // starts today
        } else {
          upcoming.push(e);
        }
      } else {
        if (e.startTime < todayMidnight && e.endTime > now) {
          ongoing.push(e); // timed event that started before today but hasn't ended
        } else if (e.startTime < todayEnd) {
          today.push(e);   // starts today
        } else {
          upcoming.push(e);
        }
      }
    }
    return { ongoingEvents: ongoing, todayEvents: today, upcomingEvents: upcoming.slice(0, 8) };
  }, [upcomingEventsRaw]);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  type CalTab = "ongoing" | "today" | "upcoming";
  const [calTab, setCalTab] = useState<CalTab>("today");
  const [calScrollTop, setCalScrollTop] = useState<Record<CalTab, number>>({ ongoing: 0, today: 0, upcoming: 0 });
  const calListRef = useRef<HTMLDivElement>(null);
  // Swipe gesture on the events panel
  const { ref: calSwipeRef } = useGestures<HTMLDivElement>({
    onSwipe: (dir) => {
      const tabs: CalTab[] = ["ongoing", "today", "upcoming"];
      const idx = tabs.indexOf(calTab);
      if (dir === "left" && idx < tabs.length - 1) setCalTab(tabs[idx + 1]);
      if (dir === "right" && idx > 0) setCalTab(tabs[idx - 1]);
    },
  });

  const eventDays = useMemo(() => {
    const set = new Set<string>();
    (monthEvents as any[]).forEach((e: any) => {
      const d = new Date(e.startTime);
      set.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
    });
    return set;
  }, [monthEvents]);

  const today = new Date();

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2 flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <CalendarDays className="h-4 w-4" style={{ color: "#2AAFA9" }} /> Calendar
          {/* Compact sync indicator */}
          {showSyncIndicator && (
            <Popover>
              <PopoverTrigger asChild>
                <button className="relative flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-muted/60 hover:bg-muted transition-colors" title="Shadow Block Sync">
                  {syncHealth.status === 'syncing' ? (
                    <div className="h-2.5 w-2.5 rounded-full border-[1.5px] border-teal-400 border-t-transparent animate-spin" />
                  ) : syncHealth.status === 'blocked' ? (
                    <div className="h-2.5 w-2.5 rounded-full bg-red-500/80" />
                  ) : (
                    <AlertTriangle className={`h-2.5 w-2.5 ${syncHealth.status === 'critical' ? 'text-red-400' : 'text-amber-400'}`} />
                  )}
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {syncHealth.status === 'blocked' ? '⏸' : `${syncHealth.percentComplete}%`}
                  </span>
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-3" align="start">
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-semibold ${
                      syncHealth.status === 'blocked' ? 'text-red-400' :
                      syncHealth.status === 'syncing' ? 'text-teal-400' :
                      syncHealth.status === 'critical' ? 'text-red-400' : 'text-amber-400'
                    }`}>
                      {syncHealth.status === 'blocked' ? 'Sync Blocked' :
                       syncHealth.status === 'syncing' ? 'Sync in Progress' :
                       syncHealth.status === 'critical' ? 'Sync Errors' : 'Sync Warning'}
                    </span>
                    <span className="text-[10px] font-mono text-muted-foreground">{syncHealth.percentComplete}%</span>
                  </div>
                  {/* Blocked explanation */}
                  {syncHealth.status === 'blocked' && (
                    <p className="text-[10px] text-red-400/80">
                      All Google accounts are disconnected. Reconnect to resume sync.
                    </p>
                  )}
                  {/* Progress bar */}
                  <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-1000 ease-out ${
                        syncHealth.status === 'blocked' ? 'bg-red-500' :
                        syncHealth.status === 'syncing' ? 'bg-teal-500' :
                        syncHealth.status === 'critical' ? 'bg-red-500' : 'bg-amber-500'
                      }`}
                      style={{ width: `${syncHealth.percentComplete}%` }}
                    />
                  </div>
                  {/* Stats */}
                  <div className="grid grid-cols-4 gap-1.5 text-center">
                    <div>
                      <div className="text-sm font-bold text-teal-400">{syncHealth.synced.toLocaleString()}</div>
                      <div className="text-[8px] text-muted-foreground uppercase">Synced</div>
                    </div>
                    <div>
                      <div className="text-sm font-bold text-amber-400">{syncHealth.pending.toLocaleString()}</div>
                      <div className="text-[8px] text-muted-foreground uppercase">Pending</div>
                    </div>
                    <div>
                      <div className="text-sm font-bold text-red-400">{(syncHealth.failed + syncHealth.permanentFailed)}</div>
                      <div className="text-[8px] text-muted-foreground uppercase">Failed</div>
                    </div>
                    <div>
                      <div className="text-sm font-bold text-foreground">{syncHealth.total.toLocaleString()}</div>
                      <div className="text-[8px] text-muted-foreground uppercase">Total</div>
                    </div>
                  </div>
                  {/* ETA */}
                  {syncHealth.status === 'syncing' && syncHealth.etaHours > 0 && (
                    <div className="pt-2 border-t border-border/50 flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>~{syncHealth.blocksPerHour} blk/hr</span>
                      <span>
                        ETA: {syncHealth.etaHours < 1 ? `${Math.round(syncHealth.etaHours * 60)}m` :
                          syncHealth.etaHours < 24 ? `${syncHealth.etaHours}h` :
                          `${Math.round(syncHealth.etaHours / 24 * 10) / 10}d`}
                      </span>
                    </div>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          )}
        </CardTitle>
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground" onClick={() => setLocation("/calendar?view=day&date=today")}>
          View all <ArrowRight className="h-3 w-3" />
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 pt-0">
        {/* Mini month */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <button
              onClick={() => setCalMonth(m => { const n = new Date(m); n.setMonth(n.getMonth() - 1); return n; })}
              className="h-6 w-6 flex items-center justify-center rounded hover:bg-accent transition-colors"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="text-xs font-medium">
              {calMonth.toLocaleDateString([], { month: "long", year: "numeric" })}
            </span>
            <button
              onClick={() => setCalMonth(m => { const n = new Date(m); n.setMonth(n.getMonth() + 1); return n; })}
              className="h-6 w-6 flex items-center justify-center rounded hover:bg-accent transition-colors"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-0">
            {["S","M","T","W","T","F","S"].map((d, i) => (
              <div key={i} className="text-center text-[10px] text-muted-foreground font-medium py-0.5">{d}</div>
            ))}
            {monthDates.map((date, i) => {
              const isToday = isSameDay(date, today);
              const isCurrentMonth = date.getMonth() === calMonth.getMonth();
              const hasEvent = eventDays.has(`${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`);
              return (
                <button
                  key={i}
                  onClick={() => { const iso = localDateISO(date); setLocation(`/calendar?view=day&date=${iso}`); }}
                  className={`relative flex flex-col items-center justify-center h-7 w-full rounded text-[11px] transition-colors ${
                    isToday
                      ? "bg-primary text-primary-foreground font-bold"
                      : isCurrentMonth
                      ? "text-foreground hover:bg-accent"
                      : "text-muted-foreground/40"
                  }`}
                >
                  {date.getDate()}
                  {hasEvent && !isToday && (
                    <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-primary" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Events — swipe tabs: Ongoing / Today / Upcoming */}
        <div className="border-t pt-3 flex flex-col gap-0">
          {/* Tab bar */}
          {(ongoingEvents.length > 0 || todayEvents.length > 0 || upcomingEvents.length > 0) && (
            <div className="flex items-center gap-0 mb-2 rounded-lg bg-muted/40 p-0.5">
              {(["ongoing", "today", "upcoming"] as const).map((tab) => {
                const counts: Record<string, number> = { ongoing: ongoingEvents.length, today: todayEvents.length, upcoming: upcomingEvents.length };
                const labels: Record<string, string> = { ongoing: "Ongoing", today: "Today", upcoming: "Upcoming" };
                const isActive = calTab === tab;
                return (
                  <button
                    key={tab}
                    onClick={() => setCalTab(tab)}
                    className={`flex-1 flex items-center justify-center gap-1 py-1 rounded-md text-[10px] font-semibold transition-colors ${
                      isActive ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {labels[tab]}
                    {counts[tab] > 0 && (
                      <span className={`text-[9px] px-1 py-0.5 rounded-full leading-none ${
                        isActive ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                      }`}>{counts[tab]}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Event list for active tab */}
          {eventsLoading ? (
            <div className="flex flex-col gap-1.5 py-1">
              {[1,2,3].map(i => <Skeleton key={i} className="h-8 w-full rounded" />)}
            </div>
          ) : !hasCalendars ? (
            <div className="flex flex-col items-center gap-2 py-3 text-center">
              <CalendarDays className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-xs text-muted-foreground">No calendar connected yet.</p>
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setLocation("/calendar")}>
                Connect Google Calendar
              </Button>
            </div>
          ) : (() => {
            const buckets: Record<string, any[]> = { ongoing: ongoingEvents, today: todayEvents, upcoming: upcomingEvents };
            const bucket = buckets[calTab] ?? [];
            if (bucket.length === 0) {
              return (
                <p className="text-xs text-muted-foreground italic py-2 text-center">
                  No {calTab === "ongoing" ? "ongoing" : calTab === "today" ? "events today" : "upcoming events"}
                </p>
              );
            }
            const PAGE = 5;
            const visible = bucket.slice(0, PAGE);
            const hasMore = bucket.length > PAGE;
            return (
              <div ref={calSwipeRef} className="touch-pan-y">
                <div
                  ref={calListRef}
                  className="flex flex-col divide-y divide-border/40 overflow-y-auto"
                  style={{ maxHeight: "280px" }}
                >
                  {(hasMore ? bucket : visible).map((e: any) => {
                    const start = new Date(e.startTime);
                    const end   = new Date(e.endTime);
                    const dotColor: string = (e as any).verticalColor || "#2AAFA9";
                    let dayLabel: string;
                    let homeDayLabel: string | null = null;
                    let timeStr: string;
                    let endTimeStr: string;
                    if (e.isAllDay) {
                      const utcY = start.getUTCFullYear(), utcM = start.getUTCMonth(), utcD = start.getUTCDate();
                      const todayD = today.getDate(), todayM = today.getMonth(), todayY = today.getFullYear();
                      const isToday2 = utcY === todayY && utcM === todayM && utcD === todayD;
                      const tomorrowD = new Date(today); tomorrowD.setDate(todayD + 1);
                      const isTomorrow = utcY === tomorrowD.getFullYear() && utcM === tomorrowD.getMonth() && utcD === tomorrowD.getDate();
                      dayLabel = isToday2 ? "Today" : isTomorrow ? "Tomorrow"
                        : new Date(Date.UTC(utcY, utcM, utcD)).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
                      timeStr = "All day";
                      endTimeStr = "";
                    } else {
                      const isToday2 = isSameDay(start, today);
                      const isTomorrow = isSameDay(start, new Date(today.getTime() + 86400000));
                      dayLabel = isToday2 ? "Today" : isTomorrow ? "Tomorrow" : start.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
                      timeStr = start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
                      endTimeStr = end.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
                      if (isDifferentDay) {
                        const homeLocalStr = new Intl.DateTimeFormat("en-CA", { timeZone: homeTimezone }).format(e.startTime);
                        const localStr2    = new Intl.DateTimeFormat("en-CA", { timeZone: localTimezone }).format(e.startTime);
                        if (homeLocalStr !== localStr2) {
                          const homeStart = new Intl.DateTimeFormat("en-US", { timeZone: homeTimezone, weekday: "short", month: "short", day: "numeric" }).format(e.startTime);
                          const homeTime  = new Intl.DateTimeFormat("en-US", { timeZone: homeTimezone, hour: "numeric", minute: "2-digit" }).format(e.startTime);
                          homeDayLabel = `${homeStart} · ${homeTime} (home)`;
                        }
                      }
                    }
                    const mins = e.isAllDay ? 0 : Math.round((e.endTime - e.startTime) / 60000);
                    const durationStr = e.isAllDay ? "" : mins < 60 ? `${mins}m` : mins % 60 === 0 ? `${mins / 60}h` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
                    const isExpanded = expandedEventId === e.id;
                    const showDayLabel = calTab === "upcoming";
                    return (
                      <div
                        key={e.id}
                        className="py-2 px-1 cursor-pointer hover:bg-accent/40 transition-colors rounded"
                        onClick={() => setExpandedEventId(isExpanded ? null : e.id)}
                      >
                        <div className="flex items-center gap-2">
                          {e.isAllDay ? (
                            <div className="w-1.5 self-stretch rounded-full shrink-0" style={{ backgroundColor: dotColor }} />
                          ) : (
                            <div className="w-1 rounded-full shrink-0" style={{ backgroundColor: dotColor, height: "32px" }} />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="text-xs font-semibold leading-tight truncate">{e.title}</p>
                              {e.isAllDay && (
                                <span className="text-[9px] font-medium px-1 py-0.5 rounded shrink-0" style={{ backgroundColor: dotColor + "22", color: dotColor }}>all-day</span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                              {showDayLabel && (
                                <span className="text-[10px] text-muted-foreground font-medium">{dayLabel}</span>
                              )}
                              {!e.isAllDay && (
                                <>
                                  {showDayLabel && <span className="text-[10px] text-muted-foreground">·</span>}
                                  <Clock className="h-2.5 w-2.5 text-muted-foreground shrink-0" />
                                  <span className="text-[10px] text-muted-foreground">{timeStr}</span>
                                  <span className="text-[10px] text-muted-foreground">·</span>
                                  <span className="text-[10px] font-medium shrink-0" style={{ color: dotColor }}>{durationStr}</span>
                                </>
                              )}
                            </div>
                            {homeDayLabel && (
                              <div className="flex items-center gap-1 mt-0.5">
                                <span className="text-[9px] text-muted-foreground/70 italic">{homeDayLabel}</span>
                              </div>
                            )}
                          </div>
                          <ChevronRight className={`h-3 w-3 text-muted-foreground shrink-0 transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`} />
                        </div>
                        {isExpanded && (
                          <div
                            className="mt-2 ml-3 pl-2 border-l-2 flex flex-col gap-1"
                            style={{ borderColor: dotColor + "66" }}
                            onClick={(ev) => ev.stopPropagation()}
                          >
                            {!e.isAllDay && (
                              <div className="flex items-center gap-1.5">
                                <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
                                <span className="text-[10px] text-muted-foreground">{timeStr} – {endTimeStr}</span>
                                <span className="text-[10px] text-muted-foreground">({durationStr})</span>
                              </div>
                            )}
                            {e.location && (
                              <div className="flex items-center gap-1.5">
                                <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
                                <span className="text-[11px] text-muted-foreground truncate">{e.location}</span>
                              </div>
                            )}
                            {e.description && (
                              <p className="text-[11px] text-muted-foreground line-clamp-3 mt-0.5">{e.description}</p>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 text-[10px] px-2 mt-1 self-start"
                              onClick={() => { const iso = localDateISO(start); setLocation(`/calendar?view=day&date=${iso}`); }}
                            >
                              Open in Calendar <ArrowRight className="h-2.5 w-2.5 ml-1" />
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>
      </CardContent>
    </Card>
  );
}
// ─── Widget: Shopping ────────────────────────────────────────────────

function ShoppingWidget() {
  const [, setLocation] = useLocation();
  const { data: lists = [], isLoading: listsLoading } = trpc.shoppingLists.list.useQuery();
  const { data: orders = [], isLoading: ordersLoading } = trpc.orders.list.useQuery({ limit: 3 });
  const activeLists = (lists as any[]).filter((l: any) => l.status === "active");

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2 flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <ShoppingCart className="h-4 w-4" style={{ color: "#D4A017" }} /> Shopping
        </CardTitle>
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground" onClick={() => setLocation("/shopping")}>
          View all <ArrowRight className="h-3 w-3" />
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 pt-0">
        <div>
          <p className="text-xs text-muted-foreground font-medium mb-2">Active Lists ({activeLists.length})</p>
          {listsLoading ? (
            <div className="flex flex-col gap-1.5">{[1,2,3].map(i => <Skeleton key={i} className="h-7 w-full rounded" />)}</div>
          ) : activeLists.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No active lists</p>
          ) : (
            <div className="flex flex-col gap-1">
              {activeLists.slice(0, 3).map((l: any) => (
                <div
                  key={l.id}
                  className="flex items-center justify-between cursor-pointer hover:bg-accent/50 rounded px-1 py-1 transition-colors"
                  onClick={() => setLocation("/shopping")}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <ShoppingCart className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span className="text-xs truncate">{l.name}</span>
                  </div>
                  <Badge variant="secondary" className="text-[10px] h-4 px-1.5 shrink-0">{l.category || "General"}</Badge>
                </div>
              ))}
              {activeLists.length > 3 && (
                <p className="text-[10px] text-muted-foreground pl-1">+{activeLists.length - 3} more</p>
              )}
            </div>
          )}
        </div>

        <div className="border-t pt-3">
          <p className="text-xs text-muted-foreground font-medium mb-2">Recent Orders</p>
          {ordersLoading ? (
            <div className="flex flex-col gap-1.5">{[1,2].map(i => <Skeleton key={i} className="h-6 w-full rounded" />)}</div>
          ) : (orders as any[]).length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No recent orders</p>
          ) : (
            <div className="flex flex-col gap-1">
              {(orders as any[]).slice(0, 3).map((o: any) => (
                <div
                  key={o.id}
                  className="flex items-center justify-between cursor-pointer hover:bg-accent/50 rounded px-1 py-0.5 transition-colors"
                  onClick={() => setLocation("/orders")}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Package className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span className="text-xs truncate">{o.retailer || "Order"}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-xs font-medium">{formatCurrency(parseFloat(o.totalAmount || "0"))}</span>
                    <Badge variant={o.status === "delivered" ? "default" : "secondary"} className="text-[10px] h-4 px-1.5">{o.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
// ─── Property Revenue Section ──────────────────────────────────────────────

function PropertyRevenueSection() {
  const { data: householdData } = trpc.household.getMyHousehold.useQuery();
  const householdId = householdData?.household?.id;
  // Check if this member has a financial data restriction on any vertical
  const { data: myAccess } = trpc.household.verticalAccess.getMyAccess.useQuery();
  const isFinancialRestricted = !myAccess?.isAdmin &&
    (myAccess?.restrictedCategories ?? []).some((r: any) => r.dataCategory === "financial");
  // Current year date range
  const [currentYearStart] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), 0, 1).getTime();
  });
  const { data: revData, isLoading } = trpc.properties.getRevenueSummary.useQuery(
    householdId && !isFinancialRestricted ? { householdId, fromTs: currentYearStart } : skipToken,
    { staleTime: 10 * 60 * 1000 }
  );
  // Return null for restricted members — the section simply doesn't exist for them
  if (isFinancialRestricted) return null;
  const totals = (revData as any)?.totals;
  const hasStrData = totals && totals.bookingCount > 0;
  const hasLtrData = totals && (totals.ltrTotalReceived > 0 || totals.ltrTotalOverdue > 0);
  const hasData = hasStrData || hasLtrData;
  if (isLoading) return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs text-muted-foreground font-medium mb-1">Property Revenue ({new Date().getFullYear()})</p>
      {[1,2].map(i => <Skeleton key={i} className="h-5 w-full rounded" />)}
    </div>
  );
  if (!hasData) return (
    <div>
      <p className="text-xs text-muted-foreground font-medium mb-1">Property Revenue ({new Date().getFullYear()})</p>
      <p className="text-xs text-muted-foreground italic">No financial data yet — enable email scraping or upload platform exports</p>
    </div>
  );
  const fmt = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: totals.currency || "USD", maximumFractionDigits: 0 }).format(n);
  return (
    <div>
      <p className="text-xs text-muted-foreground font-medium mb-2">Property Revenue ({new Date().getFullYear()})</p>
      <div className="flex flex-col gap-1.5">
        {/* STR Revenue */}
        {hasStrData && (
          <>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Gross revenue (STR)</span>
              <span className="text-sm font-semibold">{fmt(totals.revenue)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Commission</span>
              <span className="text-sm text-red-400">{"\u2212"}{fmt(totals.commission)}</span>
            </div>
            {totals.taxRemittedByPlatform > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Tax remitted by platform</span>
                <span className="text-sm text-amber-500">{"\u2212"}{fmt(totals.taxRemittedByPlatform)}</span>
              </div>
            )}
            <div className="h-px bg-border" />
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium">Net payout</span>
              <span className="text-sm font-bold" style={{ color: "#4FC4A4" }}>{fmt(totals.net)}</span>
            </div>
            {totals.taxOwedByHost > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Taxes still owed</span>
                <span className="text-sm text-orange-400">{fmt(totals.taxOwedByHost)}</span>
              </div>
            )}
            {totals.taxOwedByHost === 0 && totals.taxRemittedByPlatform > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Additional taxes owed</span>
                <span className="text-sm text-green-500">$0</span>
              </div>
            )}
            <p className="text-[10px] text-muted-foreground">{totals.bookingCount} booking{totals.bookingCount !== 1 ? "s" : ""} with financial data</p>
          </>
        )}
        {/* LTR Revenue */}
        {hasLtrData && (
          <>
            {hasStrData && <div className="h-px bg-border my-1" />}
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">LTR income received</span>
              <span className="text-sm font-semibold" style={{ color: "#4FC4A4" }}>{fmt(totals.ltrTotalReceived)}</span>
            </div>
            {totals.ltrTotalOverdue > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">LTR overdue</span>
                <span className="text-sm text-red-400">{fmt(totals.ltrTotalOverdue)}</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}


// ─── Widget: Financials ──────────────────────────────────────────────

function FinancialsWidget() {
  const [, setLocation] = useLocation();
  const { data: accounts = [], isLoading: accountsLoading } = trpc.bankAccounts.list.useQuery();
  const { data: summary, isLoading: summaryLoading } = trpc.transactions.summary.useQuery();

  const usdAccounts = (accounts as any[]).filter((a: any) => a.currency === "USD" && a.isActive);
  const jmdAccounts = (accounts as any[]).filter((a: any) => a.currency === "JMD" && a.isActive);
  const usdTotal = usdAccounts.reduce((s: number, a: any) => s + parseFloat(a.currentBalance || "0"), 0);
  const jmdTotal = jmdAccounts.reduce((s: number, a: any) => s + parseFloat(a.currentBalance || "0"), 0);
  const totalSpend = parseFloat((summary as any)?.total || "0");
  const personalSpend = parseFloat((summary as any)?.personal || "0");
  const businessSpend = parseFloat((summary as any)?.business || "0");
  const personalPct = totalSpend > 0 ? (personalSpend / totalSpend) * 100 : 0;

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2 flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <CreditCard className="h-4 w-4" style={{ color: "#4F7EC4" }} /> Financials
        </CardTitle>
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground" onClick={() => setLocation("/accounts")}>
          View all <ArrowRight className="h-3 w-3" />
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 pt-0">
        <div>
          <p className="text-xs text-muted-foreground font-medium mb-2">Account Balances</p>
          {accountsLoading ? (
            <div className="flex flex-col gap-1.5">{[1,2].map(i => <Skeleton key={i} className="h-6 w-full rounded" />)}</div>
          ) : (accounts as any[]).length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No accounts linked</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {usdTotal !== 0 && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <DollarSign className="h-3 w-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">USD</span>
                  </div>
                  <span className="text-sm font-semibold">{formatCurrency(usdTotal, "USD")}</span>
                </div>
              )}
              {jmdTotal !== 0 && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <DollarSign className="h-3 w-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">JMD</span>
                  </div>
                  <span className="text-sm font-semibold">{formatCurrency(jmdTotal, "JMD")}</span>
                </div>
              )}
              {usdTotal === 0 && jmdTotal === 0 && (
                <p className="text-xs text-muted-foreground italic">Balances at $0</p>
              )}
            </div>
          )}
        </div>

        <div className="border-t pt-3">
          <PropertyRevenueSection />
        </div>

        <div className="border-t pt-3">
          <p className="text-xs text-muted-foreground font-medium mb-2">Total Spend</p>
          {summaryLoading ? (
            <Skeleton className="h-8 w-full rounded" />
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">All time</span>
                <span className="text-sm font-semibold">{formatCurrency(totalSpend)}</span>
              </div>
              {totalSpend > 0 && (
                <>
                  <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${personalPct}%`, backgroundColor: "#4F7EC4" }} />
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>Personal {formatCurrency(personalSpend)}</span>
                    <span>Business {formatCurrency(businessSpend)}</span>
                  </div>
                </>
              )}
              <Button
                variant="ghost" size="sm"
                className="h-7 text-xs w-full justify-start gap-1 text-muted-foreground hover:text-foreground px-1 mt-1"
                onClick={() => setLocation("/expenses")}
              >
                <ArrowRight className="h-3 w-3" /> View expenses
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Widget: Spending Analytics ─────────────────────────────────────
function SpendingAnalyticsWidget() {
  const [, setLocation] = useLocation();
  const { data: trend = [], isLoading: trendLoading } = trpc.transactions.monthlyTrend.useQuery({ months: 6 });
  const { data: merchants = [], isLoading: merchantsLoading } = trpc.transactions.topMerchants.useQuery({ limit: 5 });
  const { data: byCategory = [], isLoading: categoryLoading } = trpc.transactions.byCategory.useQuery();

  const maxMerchant = (merchants as any[]).reduce((m: number, r: any) => Math.max(m, parseFloat(r.total || "0")), 0);
  // Category breakdown — top 6 categories sorted by spend descending
  const topCategories = useMemo(() => {
    const cats = (byCategory as any[])
      .filter(c => c.category)
      .map(c => ({ category: c.category as string, total: parseFloat(c.total || "0"), count: c.count as number }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);
    return cats;
  }, [byCategory]);
  const maxCategory = topCategories.reduce((m, c) => Math.max(m, c.total), 0);
  // Colour palette for categories
  const CATEGORY_COLORS = ["#4F7EC4", "#2AAFA9", "#C9A84C", "#E8624A", "#8B5CF6", "#E8943A"];

  return (
    <Card className="flex flex-col col-span-2">
      <CardHeader className="pb-2 flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <TrendingUp className="h-4 w-4" style={{ color: "#4F7EC4" }} /> Spending Analytics
        </CardTitle>
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground" onClick={() => setLocation("/expenses")}>
          View expenses <ArrowRight className="h-3 w-3" />
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 pt-0">
        {/* Monthly trend bar chart */}
        <div>
          <p className="text-xs text-muted-foreground font-medium mb-3">Monthly Spend — Last 6 Months</p>
          {trendLoading ? (
            <div className="h-32 flex items-center justify-center">
              <div className="h-full w-full flex gap-1 items-end">
                {[60, 80, 45, 90, 70, 55].map((h, i) => (
                  <div key={i} className="flex-1 rounded-t bg-muted animate-pulse" style={{ height: `${h}%` }} />
                ))}
              </div>
            </div>
          ) : (trend as any[]).length === 0 ? (
            <div className="h-32 flex flex-col items-center justify-center gap-2">
              <TrendingUp className="h-8 w-8 text-muted-foreground/30" />
              <p className="text-xs text-muted-foreground italic">No expense data yet</p>
            </div>
          ) : (
            <div className="h-36">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trend as any[]} margin={{ top: 4, right: 4, left: -20, bottom: 0 }} barCategoryGap="25%">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v >= 1000 ? `${(v/1000).toFixed(1)}k` : v}`} />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }}
                    labelStyle={{ color: "hsl(var(--popover-foreground))", fontWeight: 600 }}
                    formatter={(v: any, name: string) => [`$${parseFloat(v).toFixed(2)}`, name === "personal" ? "Personal" : "Business"]}
                  />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="personal" name="Personal" fill="#4F7EC4" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="business" name="Business" fill="#2AAFA9" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Top merchants */}
        <div className="border-t pt-3">
          <p className="text-xs text-muted-foreground font-medium mb-2 flex items-center gap-1.5">
            <Store className="h-3.5 w-3.5" /> Top Merchants
          </p>
          {merchantsLoading ? (
            <div className="flex flex-col gap-1.5">{[1,2,3].map(i => <div key={i} className="h-6 w-full rounded bg-muted animate-pulse" />)}</div>
          ) : (merchants as any[]).length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No merchant data yet</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {(merchants as any[]).map((m: any) => {
                const total = parseFloat(m.total || "0");
                const pct = maxMerchant > 0 ? (total / maxMerchant) * 100 : 0;
                return (
                  <div key={m.vendor} className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-24 truncate shrink-0">{m.vendor ?? "Unknown"}</span>
                    <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: "#4F7EC4" }} />
                    </div>
                    <span className="text-xs font-medium w-16 text-right shrink-0">{formatCurrency(total)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Category spend breakdown */}
        <div className="border-t pt-3">
          <p className="text-xs text-muted-foreground font-medium mb-2 flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5" /> Spend by Category
          </p>
          {categoryLoading ? (
            <div className="flex flex-col gap-1.5">{[1,2,3,4].map(i => <div key={i} className="h-6 w-full rounded bg-muted animate-pulse" />)}</div>
          ) : topCategories.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No categorised expenses yet</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {topCategories.map((c, idx) => {
                const pct = maxCategory > 0 ? (c.total / maxCategory) * 100 : 0;
                const color = CATEGORY_COLORS[idx % CATEGORY_COLORS.length];
                return (
                  <div key={c.category} className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-28 truncate shrink-0 capitalize">{c.category.replace(/_/g, " ")}</span>
                    <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
                    </div>
                    <span className="text-xs font-medium w-16 text-right shrink-0">{formatCurrency(c.total)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Widget: Properties ──────────────────────────────────────────────

// Entry type color helpers for composite entries
function getCompositeEntryColor(type: string, platform: string, verticalColor: string): string {
  if (type === "checkin" || type === "checkout") return getPlatformColor(platform) || verticalColor;
  if (type === "block") return "#ef4444";
  if (type === "prep") return "#f59e0b"; // amber for prep days
  return "#94a3b8"; // slate for unavailable
}

function PropertyBookingTimeline({ property, verticalColor }: { property: any; verticalColor: string }) {
  const isMobile = useIsMobile();
  const isLandscape = useIsLandscape();

  const [windowSize, setWindowSize] = useState<8 | 15>(8);
  const [anchorOffset, setAnchorOffset] = useState(0);

  const [nowTs] = useState(() => {
    const t = new Date(); t.setHours(0, 0, 0, 0); return t.getTime();
  });

  const windowStart = useMemo(() => nowTs - 3 * 86400000 + anchorOffset * 86400000, [nowTs, anchorOffset]);

  const fetchFrom = useMemo(() => nowTs - 30 * 86400000, [nowTs]);
  const fetchTo   = useMemo(() => nowTs + 60 * 86400000, [nowTs]);
  // Consolidated single-query dashboard — replaces 3 separate queries
  const dashboardQuery = trpc.properties.getPropertyDashboard.useQuery(
    { propertyId: property.id, fromTs: fetchFrom, toTs: fetchTo },
    { staleTime: 5 * 60 * 1000 }
  );
  const [editOverlay, setEditOverlay] = useState<{ bookingId: string; currentName: string } | null>(null);
  const [editName, setEditName] = useState("");
  const setOverrideMutation = trpc.properties.setBookingOverride.useMutation({
    onSuccess: () => { setEditOverlay(null); dashboardQuery.refetch(); },
  });
  const entries = dashboardQuery.data?.entries || [];
  const financials = dashboardQuery.data?.financials ?? null;
  const inactivePlatforms = dashboardQuery.data?.inactivePlatforms || [];
  const [isRefreshing, setIsRefreshing] = useState(false);
  // staleDismissed: set to true after a successful manual refresh so the badge
  // doesn't reappear until the next page load or until data genuinely goes stale again.
  // FIX: do NOT reset to false at the start of handleRefresh — that caused the banner
  // to flash back during the async gap between reset and setStaleDismissed(true).
  const [staleDismissed, setStaleDismissed] = useState(false);
  const syncAllMutation = trpc.properties.syncAllPlatforms.useMutation();

  const handleRefresh = async () => {
    setIsRefreshing(true);
    // Do NOT reset staleDismissed here — keep it false until we confirm success
    try {
      // 1. Trigger a real iCal poll on the server so data is actually fresh
      await syncAllMutation.mutateAsync({ propertyId: property.id });
    } catch (e) {
      // Non-fatal — still refetch cached data even if poll fails
      console.warn("[PropertyWidget] iCal sync failed:", e);
    }
    try {
      // 2. Refetch consolidated query to pick up the freshly polled data
      await dashboardQuery.refetch();
      // 3. Dismiss the stale badge — we just refreshed so it's no longer stale
      setStaleDismissed(true);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Stale feed: any platform not polled in the last 4 hours
  // staleDismissed suppresses the badge after a manual refresh so it doesn't
  // immediately reappear based on the pre-refresh lastPolledAt values.
  const stalePlatforms = useMemo(() => {
    if (staleDismissed) return [];
    const fourHoursAgo = Date.now() - 4 * 60 * 60 * 1000;
    return (dashboardQuery.data?.platforms || []).filter((p: any) => p.icalUrl && (!p.lastPolledAt || p.lastPolledAt < fourHoursAgo));
  }, [dashboardQuery.data?.platforms, staleDismissed]);

  // Build a Set of ISO date strings that have a real conflict (overlap > 0 days)
  // Use UTC date components to avoid timezone drift with UTC-midnight timestamps
  const conflictDays = useMemo(() => {
    const s = new Set<string>();
    (dashboardQuery.data?.conflicts?.conflicts || []).forEach((c: any) => {
      // Walk from overlapStart to overlapEnd in UTC day increments
      const startD = new Date(c.overlapStart);
      const endD   = new Date(c.overlapEnd);
      // Normalize to UTC midnight for iteration
      let cur = Date.UTC(startD.getUTCFullYear(), startD.getUTCMonth(), startD.getUTCDate());
      const endMs = Date.UTC(endD.getUTCFullYear(), endD.getUTCMonth(), endD.getUTCDate());
      while (cur <= endMs) {
        const d = new Date(cur);
        s.add(`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`);
        cur += 86400000;
      }
    });
    return s;
  }, [dashboardQuery.data?.conflicts]);
  // Build a Set of day timestamps that are back-to-back (checkout + checkin same day, no prep)
  // IMPORTANT: turnoverDate is stored as UTC midnight. We must compare using UTC date string
  // to avoid timezone drift (e.g. UTC midnight = prior day evening in EDT).
  const backToBackDays = useMemo(() => {
    const s = new Set<string>(); // use ISO date string keys to avoid tz drift
    (dashboardQuery.data?.conflicts?.backToBacks || []).forEach((c: any) => {
      const d = new Date(c.turnoverDate);
      // Use UTC date components to get the correct calendar date
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
      s.add(key);
    });
    return s;
  }, [dashboardQuery.data?.conflicts]);
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

  // iCal booking timestamps are stored as UTC midnight (date-only values from DTSTART/DTEND).
  // To compare them against Gantt column dates (local midnight), we must extract the UTC
  // date components and build a local-midnight Date from them. This prevents the UTC→local
  // timezone shift (e.g. UTC midnight Jul 3 → Jamaica Jul 2 19:00) from displacing bookings.
  const utcMidnightToLocal = (ts: number): number => {
    const d = new Date(ts);
    // Build a local-midnight Date using the UTC date components
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0).getTime();
  };

  const getEntryForDay = (day: Date) => {
    const dayStart = day.getTime();
    const dayEnd = dayStart + 86400000;
    // Convert booking UTC timestamps to local-midnight equivalents before comparing
    const covering = entries.filter((e: any) => {
      const ciLocal = utcMidnightToLocal(e.checkIn);
      const coLocal = utcMidnightToLocal(e.checkOut);
      return ciLocal < dayEnd && coLocal > dayStart;
    });
    if (covering.length === 0) return null;
    return covering.reduce((best: any, e: any) =>
      (ENTRY_PRIORITY[e.type] ?? 0) > (ENTRY_PRIORITY[best.type] ?? 0) ? e : best
    );
  };

  /**
   * Determines the visual role of a day within a booking span:
   * - "checkin"  : the actual check-in day (first day of the booking)
   * - "checkout" : the actual check-out day (last day of the booking)
   * - "mid"      : a day in the middle of a multi-day booking
   * - null       : not a booking day (block, prep, unavailable, empty)
   *
   * This prevents the ▲ check-in marker from appearing on every day of a long booking.
   */
  const getBookingRole = (day: Date, entry: any): "checkin" | "checkout" | "mid" | null => {
    if (!entry) return null;
    if (entry.type !== "checkin" && entry.type !== "checkout" && entry.type !== "booking") return null;
    const dayTs = day.getTime();
    // Use UTC date components to avoid timezone shift on iCal date-only timestamps
    const ciLocal = utcMidnightToLocal(entry.checkIn);
    const coLocal = utcMidnightToLocal(entry.checkOut);
    if (dayTs === ciLocal) return "checkin";
    if (dayTs === coLocal) return "checkout";
    return "mid";
  };

  // For multi-day block/unavailable/prep spans, only show label on the first visible day
  const isFirstDayOfSpan = (day: Date, entry: any) => {
    if (!entry) return true;
    if (entry.type !== "block" && entry.type !== "unavailable" && entry.type !== "prep") return true;
    const dayStart = day.getTime();
    const spanStart = utcMidnightToLocal(entry.checkIn);
    return dayStart <= spanStart;
  };

  const upcoming = useMemo(() => {
    const cutoff = nowTs + 30 * 86400000;
    // Use sortTs for checkout entries (= checkOut date) so they are not filtered
    // out when the stay's checkIn is already in the past.
    // For check-in entries, sortTs is undefined so we fall back to checkIn.
    return entries
      .filter((e: any) => {
        if (e.type !== "checkin" && e.type !== "checkout") return false;
        const ts = e.sortTs ?? e.checkIn;
        return ts >= nowTs && ts <= cutoff;
      })
      .sort((a: any, b: any) => (a.sortTs ?? a.checkIn) - (b.sortTs ?? b.checkIn))
      .slice(0, 6);
  }, [entries, nowTs]);

  const isCompact = isMobile && !isLandscape;
  const slide = (d: number) => setAnchorOffset(prev => prev + d);

  if (dashboardQuery.isLoading) {
    return <div className="h-8 bg-muted/30 rounded animate-pulse" />;
  }

  return (
    <div className="select-none">
      {/* Header: property name + controls */}
      <div className="flex items-center justify-between gap-1 mb-1.5">
        <div className="flex items-center gap-1 flex-1 min-w-0">
          <p className="text-xs font-medium truncate">{property.name}</p>
          {!dashboardQuery.isLoading && stalePlatforms.length > 0 && (
            <span
              title={`Feed may be stale: ${stalePlatforms.map((p: any) => p.displayName || p.platform).join(", ")} not synced recently — reconnect in Settings → Integrations`}
              className="shrink-0 text-[8px] font-bold px-1 py-0.5 rounded-sm leading-none"
              style={{ backgroundColor: "#E8943A22", color: "#E8943A", border: "1px solid #E8943A44" }}
            >⚠ stale</span>
          )}
          {inactivePlatforms.length > 0 && (
            <span
              title={`CRITICAL: ${inactivePlatforms.map((p: any) => p.displayName || p.platform).join(", ")} is inactive — may be pushing calendar blocks to other platforms`}
              className="shrink-0 text-[8px] font-bold px-1 py-0.5 rounded-sm leading-none cursor-help"
              style={{ backgroundColor: "#E8624A22", color: "#E8624A", border: "1px solid #E8624A66" }}
            >⛔ inactive</span>
          )}
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="shrink-0 h-4 w-4 flex items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
            title="Refresh booking data"
            style={{ fontSize: 10 }}
          >{isRefreshing ? <span className="animate-spin inline-block">↻</span> : "↻"}</button>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={() => setWindowSize(windowSize === 8 ? 15 : 8)}
            className="h-5 px-1.5 text-[9px] rounded border border-border/60 text-muted-foreground hover:text-foreground hover:border-border transition-colors font-mono"
            title={windowSize === 8 ? "Expand to 15-day view" : "Collapse to 8-day view"}
          >{windowSize === 8 ? "15d" : "8d"}</button>
          <button onClick={() => slide(-7)} className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors" title="Back 1 week"><span className="text-[9px]">«</span></button>
          <button onClick={() => slide(-1)} className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors" title="Back 1 day"><span className="text-[9px]">‹</span></button>
          {anchorOffset !== 0 && (
            <button onClick={() => setAnchorOffset(0)} className="h-5 px-1 text-[9px] rounded text-primary hover:text-primary/80 transition-colors" title="Return to today">↺</button>
          )}
          <button onClick={() => slide(1)} className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors" title="Forward 1 day"><span className="text-[9px]">›</span></button>
          <button onClick={() => slide(7)} className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors" title="Forward 1 week"><span className="text-[9px]">»</span></button>
        </div>
      </div>

      {/* Day header row */}
      <div className="flex gap-px mb-0.5">
        {days.map((day, i) => {
          const isToday = isSameDay(day, today);
          const dayInitial = ["S","M","T","W","T","F","S"][day.getDay()];
          const dateNum = day.getDate();
          const monthLabel = day.toLocaleDateString([], { month: "short" });
          return (
            <div key={i} className={`flex-1 flex flex-col items-center justify-center rounded-t-sm py-0.5 ${isToday ? "bg-primary/15" : "bg-muted/20"}`}>
              {isCompact ? (
                <>
                  <span className={`text-[7px] leading-none font-medium ${isToday ? "text-primary" : "text-muted-foreground"}`}>{dayInitial}</span>
                  <span className={`text-[9px] leading-none font-bold ${isToday ? "text-primary" : "text-foreground"}`}>{dateNum}</span>
                </>
              ) : (
                <>
                  <span className={`text-[8px] leading-none font-medium ${isToday ? "text-primary" : "text-muted-foreground"}`}>{day.toLocaleDateString([], { weekday: "short" })}</span>
                  <span className={`text-[10px] leading-none font-bold ${isToday ? "text-primary" : "text-foreground"}`}>{dateNum}</span>
                  {(i === 0 || dateNum === 1) && <span className={`text-[7px] leading-none ${isToday ? "text-primary/70" : "text-muted-foreground"}`}>{monthLabel}</span>}
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Gantt bar row */}
      <div className="flex gap-px rounded-b overflow-hidden" style={{ height: isCompact ? 22 : 28 }}>
        {days.map((day, i) => {
          const entry = getEntryForDay(day);
          const isToday = isSameDay(day, today);
          const isPrepDay  = entry?.type === "prep";
          const isBlock    = entry?.type === "block";
          const isUnavail  = entry?.type === "unavailable";
          const bookingRole = getBookingRole(day, entry);
          const isCheckin  = bookingRole === "checkin";
          const isCheckout = bookingRole === "checkout";
          const isMidBooking = bookingRole === "mid";
          const platformColor = entry ? getPlatformColor(entry.platform) : null;

          const dayTs = day.getTime();
          // Use UTC date string for back-to-back matching (avoids timezone drift with UTC-midnight timestamps)
          const dayUtcKey = `${day.getUTCFullYear()}-${String(day.getUTCMonth()+1).padStart(2,'0')}-${String(day.getUTCDate()).padStart(2,'0')}`;
          const isConflictDay = conflictDays.has(dayUtcKey);
          const isBackToBack  = backToBackDays.has(dayUtcKey);
          const cellStyle: React.CSSProperties = {
            ...(isConflictDay ? {
              backgroundColor: "#E8624A",
              animation: "pulse 1.2s ease-in-out infinite",
            } : isPrepDay ? {
              backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(0,0,0,0.12) 3px, rgba(0,0,0,0.12) 4px)",
              backgroundColor: "#E8943A33",
            } : isBlock ? { backgroundColor: "#ef444433" }
              : isUnavail ? { backgroundColor: "#94a3b855", border: "1px solid #94a3b840" }
              : platformColor ? {
                  backgroundColor: platformColor + "33",
                  outline: `1.5px solid ${verticalColor}`,
                  outlineOffset: "-1px",
                } : {}),
          };

          const isFirstDay = isFirstDayOfSpan(day, entry);
          // Determine the node symbol for this cell (● = check-in, ○ = check-out)
          const nodeSymbol = isCheckin ? "●" : isCheckout ? "○" : null;

          const labelContent = (() => {
            if (!entry || isToday) return null;

            // Conflict day: show node (if checkin/checkout) + amber ! badge together
            if (isConflictDay) {
              return (
                <span className="flex items-center justify-center gap-px leading-none">
                  {nodeSymbol && (
                    <span className="text-[8px]" style={{ color: platformColor || verticalColor }}>{nodeSymbol}</span>
                  )}
                  <span className="text-[7px] font-bold text-amber-300">!</span>
                </span>
              );
            }

            // Back-to-back: show node (if checkin/checkout) + ↔ badge
            if (isBackToBack) {
              return (
                <span className="flex items-center justify-center gap-px leading-none">
                  {nodeSymbol && (
                    <span className="text-[8px]" style={{ color: platformColor || verticalColor }}>{nodeSymbol}</span>
                  )}
                  <span className="text-[7px] font-bold text-amber-400">↔</span>
                </span>
              );
            }

            if (isPrepDay) return isFirstDay ? <span className="text-[7px] font-bold" style={{ color: "#E8943A" }}>P</span> : null;
            if (isBlock) return isFirstDay ? <span className="text-[7px] font-bold text-red-400">✕</span> : null;
            if (isUnavail) return isFirstDay ? <span className="text-[7px] text-slate-400">—</span> : null;

            // Platform-coloured nodes: ● = check-in, ○ = check-out
            if (isCheckin) return (
              <span className="text-[9px] leading-none" style={{ color: platformColor || verticalColor }}
                title={`Check-in • ${entry.platformDisplay}`}>●</span>
            );
            if (isCheckout) return (
              <span className="text-[9px] leading-none" style={{ color: platformColor || verticalColor }}
                title={`Check-out • ${entry.platformDisplay}`}>○</span>
            );
            if (isMidBooking) return !isCompact ? (
              <span className="text-[7px] leading-none" style={{ color: platformColor || verticalColor, opacity: 0.4 }}>—</span>
            ) : null;
            if (!isCompact && platformColor) return (
              <span className="text-[7px] font-bold" style={{ color: platformColor }}>
                {(entry.platformDisplay || entry.platform || "?")[0].toUpperCase()}
              </span>
            );
            return null;
          })();

          const tooltipParts = entry
            ? [entry.summary || entry.platformDisplay, entry.platformDisplay, `${new Date(entry.checkIn).toLocaleDateString()} – ${new Date(entry.checkOut).toLocaleDateString()}`].filter(Boolean).join(" · ")
            : day.toLocaleDateString();

          return (
            <div key={i} title={tooltipParts} style={cellStyle}
              onClick={() => {
                if (entry && (isBlock || isUnavail) && entry.id) {
                  setEditName(entry.guestName || entry.summary || "");
                  setEditOverlay({ bookingId: entry.id, currentName: entry.guestName || entry.summary || "" });
                }
              }}
              className={`flex-1 flex items-center justify-center relative transition-colors ${!entry ? "bg-muted/20" : ""} ${isToday ? "ring-1 ring-primary ring-inset" : ""} ${(isBlock || isUnavail) && entry?.id ? "cursor-pointer" : ""}`}
            >
              {isToday ? <span className="text-[8px] font-bold text-primary leading-none">T</span> : labelContent}
            </div>
          );
        })}
      </div>

      {/* Date range label */}
      <div className="flex justify-between items-center mt-0.5 mb-1">
        <span className="text-[9px] text-muted-foreground">{days[0].toLocaleDateString([], { month: "short", day: "numeric" })}</span>
        <span className="text-[9px] text-muted-foreground">{days[days.length - 1].toLocaleDateString([], { month: "short", day: "numeric" })}</span>
      </div>

      {/* Financial summary row — Revenue / Commission / Net for visible window */}
      {financials && financials.bookingCount > 0 ? (
        <div className="flex items-center gap-1 mb-2 px-1 py-1 rounded bg-muted/20 border border-border/30">
          <span className="text-[8px] text-muted-foreground shrink-0"
            title={`${financials.bookingCount} booking${financials.bookingCount !== 1 ? "s" : ""} with financial data in this window`}>
            {financials.bookingCount}bk
          </span>
          <span className="text-[8px] text-muted-foreground mx-0.5">·</span>
          <span className="text-[8px] text-muted-foreground">Rev</span>
          <span className="text-[8px] font-medium text-foreground">
            {financials.currency === "USD" ? "$" : financials.currency}{financials.revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </span>
          <span className="text-[8px] text-muted-foreground mx-0.5">·</span>
          <span className="text-[8px] text-muted-foreground">Comm</span>
          <span className="text-[8px] font-medium text-foreground">
            −{financials.currency === "USD" ? "$" : financials.currency}{financials.commission.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </span>
          <span className="text-[8px] text-muted-foreground mx-0.5">·</span>
          <span className="text-[8px] text-muted-foreground">Net</span>
          <span className="text-[8px] font-semibold" style={{ color: "#D4A017" }}>
            {financials.currency === "USD" ? "$" : financials.currency}{financials.net.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </span>
        </div>
      ) : (
        <div className="mb-2" />
      )}

      {/* Upcoming events list */}
      {upcoming.length > 0 && (
        <UpcomingBookingsList upcoming={upcoming} isCompact={isCompact} />
      )}
            {upcoming.length === 0 && entries.length === 0 && (
        <p className="text-[10px] text-muted-foreground text-center py-1">No bookings synced yet</p>
      )}

      {/* Guest name edit overlay dialog */}
      {editOverlay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setEditOverlay(null)}>
          <div className="bg-card border border-border rounded-xl shadow-xl p-5 w-80 max-w-[90vw]" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold mb-1">Add Guest Name</h3>
            <p className="text-[11px] text-muted-foreground mb-3">
              This block has no guest name from the iCal feed. Enter the guest name to display it on the Gantt.
            </p>
            <input
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Guest name (e.g. Kristina Panova)"
              value={editName}
              onChange={e => setEditName(e.target.value)}
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button
                className="px-3 py-1.5 rounded-lg text-xs border border-border hover:bg-accent transition-colors"
                onClick={() => setEditOverlay(null)}
              >Cancel</button>
              <button
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-colors"
                style={{ backgroundColor: "#2AAFA9" }}
                onClick={() => setOverrideMutation.mutate({ bookingId: editOverlay.bookingId, guestName: editName || undefined })}
                disabled={setOverrideMutation.isPending}
              >{setOverrideMutation.isPending ? "Saving…" : "Save"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
// ─── Upcoming bookings list with drilldown ──────────────────────────
function UpcomingBookingsList({ upcoming, isCompact }: { upcoming: any[]; isCompact: boolean }) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-1 mt-1">
      {upcoming.map((item: any) => {
        const tz = item.propertyTimezone || "America/New_York";
        const effectiveTs = item.type === "checkout" && item.sortTs ? item.sortTs : item.checkIn;
        const itemDateStr = utcMidnightToDateStr(effectiveTs);
        const isToday2 = itemDateStr === todayInTz(tz);
        const isTomorrow = itemDateStr === tomorrowInTz(tz);
        const dateLabel = isToday2 ? "Today" : isTomorrow ? "Tomorrow" : formatUtcMidnightDate(effectiveTs);
        const pColor = getPlatformColor(item.platform);
        const typeLabel = item.type === "checkin" ? "Check-in" : item.type === "checkout" ? "Check-out" : "Booking";
        const typeIcon = item.type === "checkin" ? "●" : item.type === "checkout" ? "○" : "●";
        const platformLabel = item.platformDisplay || item.platform || "Other";
        const guestName = item.guestName || item.summary || null;
        const bookingId = item.confirmationNumber || (item.id ? `#${item.id.slice(0, 8)}` : null);
        const isExpanded = expandedKey === item.key;
        return (
          <div key={item.key} className="rounded border border-border/40 overflow-hidden">
            {/* Row — always visible */}
            <div
              className="flex items-center gap-2 px-1.5 py-1.5 bg-muted/20 cursor-pointer hover:bg-muted/40 transition-colors"
              onClick={() => setExpandedKey(isExpanded ? null : item.key)}
            >
              <span className="text-[10px] shrink-0" style={{ color: pColor }}>{typeIcon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] font-medium">{typeLabel}</span>
                  <span className="text-[8px] font-medium px-1 py-0.5 rounded-sm leading-none shrink-0"
                    style={{ backgroundColor: pColor + "22", color: pColor, border: `1px solid ${pColor}44` }}>
                    {platformLabel}
                  </span>
                  {item.hasConflict && <span className="text-[9px] text-red-400 shrink-0">⚠</span>}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  {guestName && (
                    <span className="text-[10px] font-medium text-foreground truncate max-w-[120px]">{guestName}</span>
                  )}
                  {bookingId && (
                    <span className="text-[9px] text-muted-foreground font-mono">{bookingId}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <span className={`text-[10px] font-medium ${isToday2 ? "text-primary" : "text-muted-foreground"}`}>{dateLabel}</span>
                {isExpanded ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
              </div>
            </div>
            {/* Drilldown — expanded details */}
            {isExpanded && (
              <div className="px-3 py-2 bg-muted/10 border-t border-border/30 flex flex-col gap-1.5">
                {/* Guest contact */}
                {(item.guestEmail || item.guestPhone) && (
                  <div className="flex flex-col gap-0.5">
                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold mb-0.5">Guest Contact</p>
                    {item.guestEmail && (
                      <div className="flex items-center gap-1.5">
                        <Mail className="h-3 w-3 text-muted-foreground shrink-0" />
                        <a href={`mailto:${item.guestEmail}`} className="text-[10px] text-primary hover:underline truncate">{item.guestEmail}</a>
                      </div>
                    )}
                    {item.guestPhone && (
                      <div className="flex items-center gap-1.5">
                        <Phone className="h-3 w-3 text-muted-foreground shrink-0" />
                        <a href={`tel:${item.guestPhone}`} className="text-[10px] text-foreground hover:underline">{item.guestPhone}</a>
                      </div>
                    )}
                  </div>
                )}
                {/* Financial info */}
                {(item.totalPrice || item.netAmount || item.commissionAmount) && (
                  <div className="flex flex-col gap-0.5">
                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold mb-0.5">Financials</p>
                    <div className="flex items-center gap-3 flex-wrap">
                      {item.totalPrice && (
                        <div className="flex items-center gap-1">
                          <DollarSignIcon className="h-3 w-3 text-muted-foreground shrink-0" />
                          <span className="text-[10px] text-muted-foreground">Total</span>
                          <span className="text-[10px] font-semibold text-foreground">
                            {item.currency === "USD" ? "$" : (item.currency || "$")}{parseFloat(item.totalPrice).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                          </span>
                        </div>
                      )}
                      {item.commissionAmount && (
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-muted-foreground">Comm</span>
                          <span className="text-[10px] font-medium text-muted-foreground">
                            −{item.currency === "USD" ? "$" : (item.currency || "$")}{parseFloat(item.commissionAmount).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                          </span>
                        </div>
                      )}
                      {item.netAmount && (
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-muted-foreground">Net</span>
                          <span className="text-[10px] font-semibold" style={{ color: "#D4A017" }}>
                            {item.currency === "USD" ? "$" : (item.currency || "$")}{parseFloat(item.netAmount).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {/* Booking link */}
                {item.platformBookingUrl && (
                  <a
                    href={item.platformBookingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[10px] text-primary hover:underline mt-0.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink className="h-3 w-3 shrink-0" /> View on {platformLabel}
                  </a>
                )}
                {/* Fallback when no enriched data */}
                {!item.guestEmail && !item.guestPhone && !item.totalPrice && !item.netAmount && (
                  <p className="text-[10px] text-muted-foreground italic">No additional details — add guest info in Properties</p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Per-Property Financial Card (with tax breakdown + provenance) ──────────

function PropertyCardFinancials({ propertyId, householdId, propertyName }: { propertyId: string; householdId: string; propertyName?: string }) {
  const [currentYearStart] = useState(() => new Date(new Date().getFullYear(), 0, 1).getTime());
  const { data: revData } = trpc.properties.getRevenueSummary.useQuery(
    { householdId, fromTs: currentYearStart },
    { staleTime: 10 * 60 * 1000 }
  );
  // Expense totals for this property (from categorized expenses)
  const { data: expenseData } = trpc.expenseCategorisation.getExpensesByProperty.useQuery(
    { propertyId: propertyId, fromTs: currentYearStart },
    { enabled: !!propertyId, staleTime: 10 * 60 * 1000 }
  );
  const propData = (revData as any)?.properties?.find((p: any) => p.propertyId === propertyId);
  const hasExpenses = expenseData && expenseData.total > 0;
  if (!propData || (propData.bookingCount === 0 && !propData.ltr?.totalReceived && !hasExpenses)) return null;

  const fmt = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: propData.currency || "USD", maximumFractionDigits: 0 }).format(n);

  // Provenance badge
  const sourceBreakdown = propData.sourceBreakdown;
  const verifiedCount = (sourceBreakdown?.platform_export ?? 0) + (sourceBreakdown?.screenshot_ocr ?? 0);
  const provisionalCount = (sourceBreakdown?.email_scrape ?? 0) + (sourceBreakdown?.unverified ?? 0);
  const totalSourced = verifiedCount + provisionalCount + (sourceBreakdown?.manual ?? 0);
  const provenanceLabel = verifiedCount >= totalSourced * 0.8 ? "Verified" : provisionalCount > verifiedCount ? "Provisional" : "Mixed";
  const provenanceColor = provenanceLabel === "Verified" ? "text-green-500 bg-green-500/10" : provenanceLabel === "Provisional" ? "text-amber-500 bg-amber-500/10" : "text-blue-400 bg-blue-400/10";

  return (
    <div className="mt-2 pt-2 border-t border-border/50">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] text-muted-foreground font-medium">{new Date().getFullYear()} Financials</span>
        <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${provenanceColor}`}>{provenanceLabel}</span>
      </div>
      {propData.bookingCount > 0 && (
        <div className="flex flex-col gap-1">
          <div className="flex justify-between">
            <span className="text-[10px] text-muted-foreground">Revenue</span>
            <span className="text-xs font-medium">{fmt(propData.revenue)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[10px] text-muted-foreground">Commission</span>
            <span className="text-xs text-red-400">{"\u2212"}{fmt(propData.commission)}</span>
          </div>
          {propData.taxRemittedByPlatform > 0 && (
            <div className="flex justify-between">
              <span className="text-[10px] text-muted-foreground">Tax (platform remitted)</span>
              <span className="text-xs text-amber-500">{"\u2212"}{fmt(propData.taxRemittedByPlatform)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-[10px] font-medium">Net</span>
            <span className="text-xs font-bold" style={{ color: "#4FC4A4" }}>{fmt(propData.net)}</span>
          </div>
          {propData.taxOwedByHost > 0 && (
            <div className="flex justify-between">
              <span className="text-[10px] text-muted-foreground">Taxes owed</span>
              <span className="text-xs text-orange-400">{fmt(propData.taxOwedByHost)}</span>
            </div>
          )}
          {propData.taxOwedByHost === 0 && propData.taxRemittedByPlatform > 0 && (
            <div className="flex justify-between">
              <span className="text-[10px] text-muted-foreground">Additional taxes</span>
              <span className="text-xs text-green-500">$0</span>
            </div>
          )}
        </div>
      )}
      {propData.ltr && propData.ltr.totalReceived > 0 && (
        <div className="flex flex-col gap-1 mt-1">
          <div className="flex justify-between">
            <span className="text-[10px] text-muted-foreground">LTR received</span>
            <span className="text-xs font-medium" style={{ color: "#4FC4A4" }}>{fmt(propData.ltr.totalReceived)}</span>
          </div>
          {propData.ltr.totalOverdue > 0 && (
            <div className="flex justify-between">
              <span className="text-[10px] text-muted-foreground">LTR overdue</span>
              <span className="text-xs text-red-400">{fmt(propData.ltr.totalOverdue)}</span>
            </div>
          )}
        </div>
      )}
      {/* Categorized expenses for this property */}
      {hasExpenses && (
        <div className="flex flex-col gap-1 mt-1.5 pt-1.5 border-t border-border/30">
          <div className="flex justify-between">
            <span className="text-[10px] text-muted-foreground">Expenses ({expenseData.count})</span>
            <span className="text-xs font-medium text-red-400">{"\u2212"}{fmt(expenseData.total)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function PropertiesWidget() {
  const [, setLocation] = useLocation();
  const [carouselIdx, setCarouselIdx] = useState(0);

  const householdQuery = trpc.household.getMyHousehold.useQuery();
  const householdId = householdQuery.data?.household?.id;

  const propertiesQuery = trpc.properties.list.useQuery(
    householdId ? { householdId } : skipToken,
    { staleTime: 60_000, placeholderData: keepPreviousData }
  );

  const verticalsQuery = trpc.verticals.list.useQuery(
    undefined,
    { staleTime: 60000 }
  );

  const memberId = householdQuery.data?.member?.id;

  // Fetch user's saved property order
  const propertyOrderQuery = trpc.properties.getPropertyOrder.useQuery(
    memberId ? { memberId } : skipToken as any,
    { staleTime: 60_000 }
  );
  const savedOrder: string[] = (propertyOrderQuery.data as string[]) || [];

  const rawProperties = propertiesQuery.data || [];
  const verticals = verticalsQuery.data || [];

  // Filter out inactive properties, then sort by saved order
  const propertiesList = useMemo(() => {
    const activeProps = rawProperties.filter((p: any) => p.isActive !== false);
    if (!savedOrder.length) return activeProps;
    const orderMap = new Map(savedOrder.map((id, idx) => [id, idx]));
    return [...activeProps].sort((a: any, b: any) => {
      const aIdx = orderMap.get(a.id) ?? 999;
      const bIdx = orderMap.get(b.id) ?? 999;
      return aIdx - bIdx;
    });
  }, [rawProperties, savedOrder]);

  // Build verticalId → color map
  const verticalColorMap = new Map<string, string>();
  verticals.forEach((v: any) => verticalColorMap.set(v.id, v.color || "#2AAFA9"));

  const isLoading = householdQuery.isLoading || propertiesQuery.isLoading;

  // Clamp carousel index when properties list changes
  const clampedIdx = propertiesList.length > 0 ? Math.min(carouselIdx, propertiesList.length - 1) : 0;

  // Reorder mutation
  const updateOrder = trpc.properties.updatePropertyOrder.useMutation({
    onSuccess: () => {
      propertyOrderQuery.refetch();
    },
  });

  const moveProperty = useCallback((direction: "left" | "right") => {
    if (!memberId || !householdId) return;
    const currentIds = propertiesList.map((p: any) => p.id);
    const idx = clampedIdx;
    const swapIdx = direction === "left" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= currentIds.length) return;
    // Swap
    const newOrder = [...currentIds];
    [newOrder[idx], newOrder[swapIdx]] = [newOrder[swapIdx], newOrder[idx]];
    updateOrder.mutate({ memberId, householdId, propertyOrder: newOrder });
    setCarouselIdx(swapIdx);
  }, [memberId, householdId, propertiesList, clampedIdx, updateOrder]);

  const goTo = useCallback((idx: number) => {
    setCarouselIdx(Math.max(0, Math.min(idx, propertiesList.length - 1)));
  }, [propertiesList.length]);

  // Gesture hook: swipe left/right to navigate properties
  const { ref: carouselRef } = useGestures<HTMLDivElement>({
    onSwipe: (dir: import("@/hooks/useGestures").SwipeDirection) => goTo(clampedIdx + (dir === "left" ? 1 : -1)),
  });

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2 flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Building2 className="h-4 w-4" style={{ color: "#E8943A" }} /> Properties
          {propertiesList.length > 1 && (
            <span className="text-[10px] text-muted-foreground font-normal">
              {clampedIdx + 1}/{propertiesList.length}
            </span>
          )}
        </CardTitle>
        <div className="flex items-center gap-1">
          {propertiesList.length > 1 && (
            <>
              <Button variant="ghost" size="icon" className="h-6 w-6" disabled={clampedIdx === 0} onClick={() => goTo(clampedIdx - 1)}>
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6" disabled={clampedIdx === propertiesList.length - 1} onClick={() => goTo(clampedIdx + 1)}>
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
              {/* Reorder: move current property left/right in carousel order */}
              <span className="w-px h-4 bg-border mx-0.5" />
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-foreground"
                disabled={clampedIdx === 0}
                onClick={() => moveProperty("left")}
                title="Move property earlier in carousel"
              >
                <ArrowLeftRight className="h-3 w-3 rotate-180" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-foreground"
                disabled={clampedIdx === propertiesList.length - 1}
                onClick={() => moveProperty("right")}
                title="Move property later in carousel"
              >
                <ArrowLeftRight className="h-3 w-3" />
              </Button>
            </>
          )}
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground" onClick={() => setLocation("/properties")}>
            View all <ArrowRight className="h-3 w-3" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 pt-0">

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2].map(i => <div key={i} className="h-10 bg-muted/30 rounded animate-pulse" />)}
          </div>
        ) : propertiesList.length === 0 ? (
          <div className="text-center py-4">
            <p className="text-xs text-muted-foreground">No properties added yet.</p>
            <Button variant="link" size="sm" className="text-xs h-6 mt-1" onClick={() => setLocation("/properties")}>
              Add a property
            </Button>
          </div>
        ) : (
          <>
            {/* Carousel: one property at a time */}
            <div
              ref={carouselRef}
              className="touch-pan-y"
            >
              {(() => {
                const prop = propertiesList[clampedIdx];
                if (!prop) return null;
                const verticalColor = prop.verticalId ? (verticalColorMap.get(prop.verticalId) || "#2AAFA9") : "#2AAFA9";
                const isSTR = ["rental_str", "vacation"].includes(prop.type ?? "");
                const isLTR = prop.type === "rental_ltr";
                return (
                  <div key={prop.id}>
                    {/* Property type badge + address */}
                    <div className="flex items-center gap-2 mb-2">
                      <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: verticalColor }} />
                      <span className="text-[9px] uppercase tracking-widest text-muted-foreground font-medium">
                        {isSTR ? "Short-term Rental" : isLTR ? "Long-term Rental" : prop.type?.replace(/_/g, " ") || "Property"}
                      </span>
                      {prop.address && (
                        <span className="text-[9px] text-muted-foreground truncate ml-auto flex items-center gap-0.5">
                          <MapPin className="h-2.5 w-2.5 shrink-0" />{prop.address}
                        </span>
                      )}
                    </div>

                    {/* Gantt timeline for STR */}
                    {isSTR && (
                      <PropertyBookingTimeline
                        property={prop}
                        verticalColor={verticalColor}
                      />
                    )}

                    {/* LTR summary row */}
                    {isLTR && (
                      <div className="flex items-center justify-between gap-2 rounded-md bg-muted/30 px-2 py-2 mb-2">
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate">{prop.name}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{prop.address || "No address"}</p>
                        </div>
                        {prop.monthlyRent && (
                          <div className="text-right shrink-0">
                            <p className="text-xs font-semibold">{formatCurrency(parseFloat(prop.monthlyRent), prop.rentCurrency || "USD")}</p>
                            <p className="text-[10px] text-muted-foreground">/ month</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Per-property financial summary */}
                    <PropertyCardFinancials propertyId={prop.id} householdId={householdId!} propertyName={prop.name} />

                    {/* Other property type */}
                    {!isSTR && !isLTR && (
                      <div className="flex items-center gap-2 rounded-md bg-muted/30 px-2 py-1.5 mb-2">
                        <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <p className="text-xs font-medium truncate">{prop.name}</p>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Dot pagination */}
            {propertiesList.length > 1 && (
              <div className="flex items-center justify-center gap-1.5 -mt-1">
                {propertiesList.map((_: any, i: number) => (
                  <button
                    key={i}
                    onClick={() => setCarouselIdx(i)}
                    className={`rounded-full transition-all ${
                      i === clampedIdx
                        ? "h-1.5 w-4 bg-primary"
                        : "h-1.5 w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/60"
                    }`}
                  />
                ))}
              </div>
            )}
          </>
        )}

      </CardContent>
    </Card>
  );
}

// ─── Widget: Tasks (Coming Soon) ─────────────────────────────────────

function TasksWidget() {
  return (
    <Card className="flex flex-col opacity-60 select-none">
      <CardHeader className="pb-2 flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <CheckSquare className="h-4 w-4 text-muted-foreground" /> Tasks
        </CardTitle>
        <Badge variant="outline" className="text-[10px] h-5 px-1.5 text-muted-foreground">Coming Soon</Badge>
      </CardHeader>
      <CardContent className="flex flex-col items-center justify-center gap-3 py-6 text-center">
        <div className="h-12 w-12 rounded-full bg-muted/50 flex items-center justify-center">
          <CheckSquare className="h-6 w-6 text-muted-foreground/50" />
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground">Unified Task Manager</p>
          <p className="text-[10px] text-muted-foreground/70 mt-1 max-w-[200px]">
            Asana, Google Keep, and personal tasks — all in one place
          </p>
        </div>
        <div className="flex gap-2 mt-1 flex-wrap justify-center">
          {["Asana", "Google Keep", "Personal"].map(t => (
            <Badge key={t} variant="secondary" className="text-[9px] h-4 px-1.5 opacity-50">{t}</Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Constellation Widget ─────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  household_admin: "Admin",
  ea: "Executive Assistant",
  member: "Member",
  caregiver: "Caregiver",
  child: "Child",
  elder: "Elder",
};

const ROLE_COLORS: Record<string, string> = {
  household_admin: "text-amber-400 bg-amber-400/10 border-amber-400/30",
  ea: "text-violet-400 bg-violet-400/10 border-violet-400/30",
  member: "text-sky-400 bg-sky-400/10 border-sky-400/30",
  caregiver: "text-emerald-400 bg-emerald-400/10 border-emerald-400/30",
  child: "text-pink-400 bg-pink-400/10 border-pink-400/30",
  elder: "text-orange-400 bg-orange-400/10 border-orange-400/30",
};

function MemberAvatar({
  member,
  size = "md",
  isOwn,
  onUpload,
}: {
  member: { displayName: string; avatarUrl?: string | null; photoUrl?: string | null; role: string };
  size?: "sm" | "md" | "lg";
  isOwn?: boolean;
  onUpload?: () => void;
}) {
  const sizeClass = size === "lg" ? "h-16 w-16 text-xl" : size === "sm" ? "h-8 w-8 text-xs" : "h-12 w-12 text-base";
  const photo = member.photoUrl || member.avatarUrl;
  const initials = member.displayName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className={`relative flex-shrink-0 ${sizeClass} rounded-full`}>
      {photo ? (
        <img
          src={photo}
          alt={member.displayName}
          className={`${sizeClass} rounded-full object-cover border-2 border-border`}
        />
      ) : (
        <div
          className={`${sizeClass} rounded-full border-2 border-border bg-muted flex items-center justify-center font-semibold text-muted-foreground`}
        >
          {initials || <UserCircle className="h-5 w-5" />}
        </div>
      )}
      {isOwn && onUpload && (
        <button
          onClick={onUpload}
          className="absolute -bottom-0.5 -right-0.5 h-5 w-5 rounded-full bg-primary border-2 border-background flex items-center justify-center hover:bg-primary/80 transition-colors"
          title="Update your photo"
        >
          <Camera className="h-2.5 w-2.5 text-primary-foreground" />
        </button>
      )}
    </div>
  );
}

// ─── Member detail sheet ─────────────────────────────────────────────
function MemberDetailSheet({
  member,
  open,
  onClose,
  isCurrentUser,
  isAdmin,
}: {
  member: any;
  open: boolean;
  onClose: () => void;
  isCurrentUser: boolean;
  isAdmin: boolean;
}) {
  const utils = trpc.useUtils();
  const [editName, setEditName] = useState(member.displayName);
  const [editPronouns, setEditPronouns] = useState(member.pronouns || "");
  const [editRole, setEditRole] = useState(member.role);
  const [editRelationship, setEditRelationship] = useState(member.relationshipLabel || "");
  const [editGeevesAccess, setEditGeevesAccess] = useState(member.geevesAccess !== false);
  const [editAccessibility, setEditAccessibility] = useState(member.accessibilityMode || "standard");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const updateMember = trpc.household.members.update.useMutation({
    onSuccess: () => {
      utils.household.getMembers.invalidate();
      toast.success("Member updated");
      onClose();
    },
    onError: (err) => toast.error(err.message ?? "Failed to update member"),
  });

  const removeMember = trpc.household.members.remove.useMutation({
    onSuccess: () => {
      utils.household.getMembers.invalidate();
      toast.success("Member removed");
      onClose();
    },
    onError: (err) => toast.error(err.message ?? "Failed to remove member"),
  });

  const handleSave = () => {
    updateMember.mutate({
      memberId: member.id,
      displayName: editName || undefined,
      pronouns: editPronouns || null,
      role: isAdmin && !isCurrentUser ? editRole : undefined,
      relationshipLabel: editRelationship || null,
      accessibilityMode: editAccessibility as any,
    });
  };

  const roleColor = ROLE_COLORS[member.role] ?? ROLE_COLORS.member;
  const photo = member.photoUrl || member.avatarUrl;
  const initials = member.displayName.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-[360px] sm:w-[420px] overflow-y-auto">
        <SheetHeader className="pb-4">
          <div className="flex items-center gap-3">
            {photo ? (
              <img src={photo} alt={member.displayName} className="h-14 w-14 rounded-full object-cover border-2 border-border" />
            ) : (
              <div className="h-14 w-14 rounded-full border-2 border-border bg-muted flex items-center justify-center text-lg font-semibold text-muted-foreground">
                {initials || <UserCircle className="h-7 w-7" />}
              </div>
            )}
            <div>
              <SheetTitle className="text-base">{member.displayName}</SheetTitle>
              <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded border font-medium mt-0.5 ${roleColor}`}>
                {ROLE_LABELS[member.role] ?? member.role}
              </span>
              {member.googleName && member.googleName !== member.displayName && (
                <p className="text-[10px] text-muted-foreground mt-0.5">Google: {member.googleName}</p>
              )}
            </div>
          </div>
        </SheetHeader>

        <div className="flex flex-col gap-4">
          {/* Basic info */}
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Display Name</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Pronouns</Label>
              <Input value={editPronouns} onChange={(e) => setEditPronouns(e.target.value)} placeholder="e.g. he/him" className="h-8 text-sm" />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Relationship / Label</Label>
              <Input value={editRelationship} onChange={(e) => setEditRelationship(e.target.value)} placeholder="e.g. Son, Mother" className="h-8 text-sm" />
            </div>
            {isAdmin && !isCurrentUser && (
              <div className="flex flex-col gap-1">
                <Label className="text-xs">Role</Label>
                <Select value={editRole} onValueChange={setEditRole}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["household_admin","ea","member","caregiver","child","elder"].map(r => (
                      <SelectItem key={r} value={r}>{ROLE_LABELS[r] ?? r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <Separator />

          {/* Permissions */}
          <div className="flex flex-col gap-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Permissions</p>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Geeves AI Access</p>
                <p className="text-[11px] text-muted-foreground">Can use the Geeves chat assistant</p>
              </div>
              <Switch checked={editGeevesAccess} onCheckedChange={setEditGeevesAccess} />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Accessibility Mode</Label>
              <Select value={editAccessibility} onValueChange={setEditAccessibility}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">Standard</SelectItem>
                  <SelectItem value="picture_board">Picture Board</SelectItem>
                  <SelectItem value="large_text">Large Text</SelectItem>
                  <SelectItem value="voice_only">Voice Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator />

          {/* Account info */}
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Account</p>
            {member.email && (
              <div className="flex items-center gap-2">
                <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-sm text-muted-foreground">{member.email}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-sm text-muted-foreground capitalize">{member.status}</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2 pt-2">
            <Button onClick={handleSave} disabled={updateMember.isPending} className="w-full">
              {updateMember.isPending ? "Saving…" : "Save Changes"}
            </Button>
            {isAdmin && !isCurrentUser && (
              confirmDelete ? (
                <div className="flex gap-2">
                  <Button
                    variant="destructive"
                    className="flex-1 text-sm"
                    disabled={removeMember.isPending}
                    onClick={() => removeMember.mutate({ memberId: member.id })}
                  >
                    {removeMember.isPending ? "Removing…" : "Confirm Remove"}
                  </Button>
                  <Button variant="outline" className="flex-1 text-sm" onClick={() => setConfirmDelete(false)}>Cancel</Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  className="w-full text-sm border-destructive/40 text-destructive hover:bg-destructive/10"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-2" /> Remove from Household
                </Button>
              )
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ConstellationWidget() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const [selectedMember, setSelectedMember] = useState<any | null>(null);

  const { data: membersData, isLoading } = trpc.household.getMembers.useQuery(undefined, {
    staleTime: 2 * 60 * 1000,
  });

  const uploadPhoto = trpc.household.uploadMemberPhoto.useMutation({
    onSuccess: () => {
      utils.household.getMembers.invalidate();
      setUploadingFor(null);
      toast.success("Photo updated");
    },
    onError: (err) => {
      toast.error(err.message ?? "Failed to upload photo");
      setUploadingFor(null);
    },
  });

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !uploadingFor) return;
      if (file.size > 4_000_000) {
        toast.error("Image too large (max 4 MB)");
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUri = ev.target?.result as string;
        uploadPhoto.mutate({ memberId: uploadingFor, dataUri });
      };
      reader.readAsDataURL(file);
      // Reset input so same file can be re-selected
      e.target.value = "";
    },
    [uploadingFor, uploadPhoto]
  );

  const triggerUpload = useCallback((memberId: string) => {
    setUploadingFor(memberId);
    fileInputRef.current?.click();
  }, []);

  const members = membersData ?? [];
  const activeMember = members.find((m: any) => m.userId === user?.id);
  const isAdmin = activeMember?.role === "household_admin";

  return (
    <div className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Star className="h-4 w-4 text-amber-400" />
          <h3 className="text-sm font-semibold text-foreground">Constellation</h3>
        </div>
        <span className="text-xs text-muted-foreground">{members.length} members</span>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Member cards */}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 rounded-xl bg-muted/40 animate-pulse" />
          ))}
        </div>
      ) : members.length === 0 ? (
        <div className="text-center py-6 text-sm text-muted-foreground">
          No household members yet
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {members
            .filter((m) => m.status !== "removed")
            .sort((a, b) => {
              // Admins first, then by name
              if (a.role === "household_admin" && b.role !== "household_admin") return -1;
              if (b.role === "household_admin" && a.role !== "household_admin") return 1;
              return a.displayName.localeCompare(b.displayName);
            })
            .map((member) => {
              const isOwn = member.userId === user?.id;
              const roleColor = ROLE_COLORS[member.role] ?? ROLE_COLORS.member;
              return (
                <div
                  key={member.id}
                  className={`flex items-center gap-2.5 p-2.5 rounded-xl border transition-colors cursor-pointer ${
                    isOwn
                      ? "border-primary/30 bg-primary/5 hover:bg-primary/10"
                      : "border-border bg-muted/20 hover:bg-muted/40"
                  }`}
                  onClick={() => setSelectedMember(member)}
                >
                  <MemberAvatar
                    member={member}
                    size="md"
                    isOwn={isOwn}
                    onUpload={() => triggerUpload(member.id)}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="text-xs font-medium text-foreground truncate">
                        {member.displayName}
                      </span>
                      {member.role === "household_admin" && (
                        <Crown className="h-2.5 w-2.5 text-amber-400 flex-shrink-0" />
                      )}
                    </div>
                    {member.pronouns && (
                      <span className="text-[10px] text-muted-foreground">{member.pronouns}</span>
                    )}
                    <span
                      className={`inline-block mt-0.5 text-[10px] px-1.5 py-0.5 rounded border font-medium ${roleColor}`}
                    >
                      {ROLE_LABELS[member.role] ?? member.role}
                    </span>
                  </div>
                </div>
              );
            })}
        </div>
      )}

      {/* Upload progress */}
      {uploadPhoto.isPending && (
        <div className="text-xs text-muted-foreground text-center animate-pulse">
          Uploading photo…
        </div>
      )}

      {/* Member detail sheet */}
      {selectedMember && (
        <MemberDetailSheet
          member={selectedMember}
          open={!!selectedMember}
          onClose={() => setSelectedMember(null)}
          isCurrentUser={selectedMember.userId === user?.id}
          isAdmin={isAdmin}
        />
      )}
    </div>
  );
}


// ─── Main Dashboard ──────────────────────────────────────────────────

export default function Home() {
  const isMobile = useIsMobile();
  const [mobileLayout, setMobileLayout] = useState<"stack" | "scroll">("stack");
  const { shouldOpen: reconnectShouldOpen, setShouldOpen: setReconnectShouldOpen } = useReconnectSequenceResume();
  const [showReconnectModal, setShowReconnectModal] = useState(false);
  const { count: expiredCount } = useExpiredAccountCount();
  const { data: myAccessData } = trpc.household.verticalAccess.getMyAccess.useQuery();
  const isHomeAdmin = myAccessData?.isAdmin ?? false;
  const isHomeEa = myAccessData?.isEa ?? false;

  // Open modal when the page-level hook detects a returning OAuth redirect or saved sequence
  useEffect(() => {
    if (reconnectShouldOpen) setShowReconnectModal(true);
  }, [reconnectShouldOpen]);

  return (
    <div className="flex flex-col gap-4 max-w-[1400px] mx-auto">
      {/* Reconnect sequence modal */}
      {showReconnectModal && (
        <ReconnectSequenceModal
          onClose={() => setShowReconnectModal(false)}
          onAllDone={() => setShowReconnectModal(false)}
        />
      )}

      {/* Expired account banner */}
      {expiredCount > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-400">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-sm font-medium">
              {expiredCount === 1 ? "1 Google account disconnected" : `${expiredCount} Google accounts disconnected`}
            </span>
            <span className="text-xs text-amber-400/70 ml-2">
              — calendar sync and shadow blocks are paused
            </span>
          </div>
          <button
            onClick={() => setShowReconnectModal(true)}
            className="flex-shrink-0 text-xs font-semibold bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 rounded-lg px-3 py-1.5 transition-colors"
          >
            Fix Now →
          </button>
        </div>
      )}

      {/* Shadow Block Sync Progress — moved to CalendarWidget as compact indicator */}

      {/* Greeting */}
      <GreetingHeader />

      {/* Mobile layout toggle */}
      {isMobile && (
        <div className="flex items-center gap-1 self-end -mt-2">
          <button
            onClick={() => setMobileLayout("stack")}
            className={`h-7 w-7 flex items-center justify-center rounded transition-colors ${
              mobileLayout === "stack"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-accent"
            }`}
            title="Stacked view"
          >
            <AlignJustify className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setMobileLayout("scroll")}
            className={`h-7 w-7 flex items-center justify-center rounded transition-colors ${
              mobileLayout === "scroll"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-accent"
            }`}
            title="Scroll view"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

            {/* Widget grid — personalised layout with drag-to-reorder */}
      <WidgetGrid
        isMobile={isMobile}
        mobileLayout={mobileLayout}
        isAdmin={isHomeAdmin}
        adminOnly={["resources"]}
        widgets={{
          calendar: <CalendarWidget />,
          properties: <PropertiesWidget />,
          shopping: <ShoppingWidget />,
          tasks: <TasksWidget />,
          financials: <FinancialsWidget />,
          analytics: <SpendingAnalyticsWidget />,
          resources: <ResourcesWidget isAdmin={isHomeAdmin} />,
          constellation: <ConstellationWidget />,
        }}
      />
    </div>
  );
}
