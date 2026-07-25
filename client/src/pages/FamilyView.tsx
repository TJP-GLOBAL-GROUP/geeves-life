/**
 * FamilyView.tsx — Role-filtered dashboards for household members.
 *
 * Routes:
 *   /family/child     → ChildView    (simplified calendar, tasks, booking requests)
 *   /family/elder     → ElderView    (large-text calendar, reminders, caregiver notes)
 *   /family/caregiver → CaregiverView (care schedule, notes, medication reminders)
 *
 * Each view is self-contained and only shows data relevant to that role.
 * The household admin can navigate to any view; members see only their own.
 */
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Calendar,
  Clock,
  CheckCircle2,
  Circle,
  Bell,
  Heart,
  BookOpen,
  Pill,
  ClipboardList,
  ArrowLeft,
  User,
  Star,
  MessageSquare,
  ChevronRight,
} from "lucide-react";
import { GeeveNode, GeeveNodeBadge } from "@/components/GeeveNode";
import { useState, useMemo } from "react";

// ─── Brand colours ────────────────────────────────────────────────────────────
const TEAL = "#2AAFA9";
const CORAL = "#E8624A";
const VIOLET = "#8B5CF6";
const AMBER = "#E8943A";
const BLUE = "#4F7EC4";

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isToday(ts: number): boolean {
  // H-02: Compare ISO date strings (UTC) to avoid timezone-shift off-by-one errors
  return new Date(ts).toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10);
}

function isTomorrow(ts: number): boolean {
  // H-02: Compare ISO date strings (UTC) to avoid timezone-shift off-by-one errors
  return new Date(ts).toISOString().slice(0, 10) === new Date(Date.now() + 86400000).toISOString().slice(0, 10);
}

function dayLabel(ts: number): string {
  if (isToday(ts)) return "Today";
  if (isTomorrow(ts)) return "Tomorrow";
  return formatDate(ts);
}

// ─── Shared: upcoming events mini-list ───────────────────────────────────────
function UpcomingEventsList({ limit = 5, large = false }: { limit?: number; large?: boolean }) {
  const now = useMemo(() => Date.now(), []);
  const weekAhead = useMemo(() => now + 7 * 24 * 60 * 60 * 1000, [now]);
  const { data: events = [], isLoading } = trpc.calendar.events.list.useQuery(
    { startTime: now, endTime: weekAhead },
    { refetchOnWindowFocus: false }
  );
  const sorted = useMemo(() =>
    [...(events as any[])].sort((a, b) => a.startTime - b.startTime).slice(0, limit),
    [events, limit]
  );

  if (isLoading) return (
    <div className="flex flex-col gap-2">
      {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}
    </div>
  );

  if (sorted.length === 0) return (
    <p className={`text-muted-foreground italic ${large ? "text-base" : "text-sm"}`}>
      No upcoming events this week
    </p>
  );

  return (
    <div className="flex flex-col gap-2">
      {sorted.map((ev: any) => (
        <div
          key={ev.id}
          className="flex items-start gap-3 rounded-lg border p-3 bg-card"
        >
          <div
            className="mt-0.5 h-3 w-3 rounded-full shrink-0"
            style={{ backgroundColor: ev.color || TEAL }}
          />
          <div className="flex-1 min-w-0">
            <p className={`font-medium truncate ${large ? "text-base" : "text-sm"}`}>{ev.title}</p>
            <p className={`text-muted-foreground ${large ? "text-sm" : "text-xs"}`}>
              {dayLabel(ev.startTime)} · {formatTime(ev.startTime)}
              {ev.endTime && ` – ${formatTime(ev.endTime)}`}
            </p>
          </div>
          {isToday(ev.startTime) && (
            <Badge variant="secondary" className="shrink-0 text-[10px]" style={{ backgroundColor: `${TEAL}20`, color: TEAL }}>
              Today
            </Badge>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Shared: my booking requests ─────────────────────────────────────────────
function MyBookingRequests({ large = false }: { large?: boolean }) {
  const { data: requests = [], isLoading } = trpc.bookingRequests.list.useQuery({ status: "all" });
  const pending = (requests as any[]).filter(r => r.status === "pending");
  const recent = (requests as any[]).filter(r => r.status !== "pending").slice(0, 3);

  if (isLoading) return <Skeleton className="h-16 w-full rounded-lg" />;

  return (
    <div className="flex flex-col gap-2">
      {pending.length > 0 && (
        <div>
          <p className={`font-medium mb-1.5 ${large ? "text-sm" : "text-xs"} text-muted-foreground`}>Pending</p>
          {pending.map((r: any) => (
            <div key={r.id} className="flex items-center gap-2 rounded-lg border p-2.5 bg-amber-500/5 border-amber-500/20">
              <GeeveNodeBadge status="pending" size={8} />
              <div className="flex-1 min-w-0">
                <p className={`font-medium truncate ${large ? "text-sm" : "text-xs"}`}>{r.title}</p>
                <p className={`text-muted-foreground ${large ? "text-xs" : "text-[10px]"}`}>
                  {dayLabel(r.requestedStartTime)} · {r.verticalName}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
      {recent.length > 0 && (
        <div>
          <p className={`font-medium mb-1.5 ${large ? "text-sm" : "text-xs"} text-muted-foreground`}>Recent</p>
          {recent.map((r: any) => (
            <div key={r.id} className="flex items-center gap-2 rounded-lg border p-2.5">
              <GeeveNodeBadge
                status={r.status === "approved" ? "approved" : r.status === "declined" ? "declined" : "pending"}
                size={8}
              />
              <div className="flex-1 min-w-0">
                <p className={`font-medium truncate ${large ? "text-sm" : "text-xs"}`}>{r.title}</p>
                <p className={`text-muted-foreground ${large ? "text-xs" : "text-[10px]"}`}>
                  {dayLabel(r.requestedStartTime)} · {r.status}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
      {pending.length === 0 && recent.length === 0 && (
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <div className="rounded-full bg-muted p-3 mb-3">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <p className={`text-muted-foreground font-medium ${large ? "text-sm" : "text-xs"}`}>No booking requests yet</p>
          <p className={`text-muted-foreground/70 mt-1 ${large ? "text-xs" : "text-[10px]"}`}>Request time on a vertical's calendar to get started</p>
        </div>
      )}
    </div>
  );
}

// ─── Shared: notes list ───────────────────────────────────────────────────────
function NotesList({ householdId, memberId, large = false }: { householdId: string; memberId?: string; large?: boolean }) {
  const { data: notes = [], isLoading } = trpc.notes.list.useQuery(
    { householdId, memberId },
    { enabled: !!householdId }
  );
  const active = (notes as any[]).filter(n => !n.isCompleted).slice(0, 5);

  if (isLoading) return <Skeleton className="h-16 w-full rounded-lg" />;
  if (active.length === 0) return (
    <p className={`text-muted-foreground italic ${large ? "text-base" : "text-sm"}`}>No active notes</p>
  );

  return (
    <div className="flex flex-col gap-2">
      {active.map((note: any) => (
        <div key={note.id} className="flex items-start gap-2.5 rounded-lg border p-3 bg-card">
          <Circle className={`shrink-0 mt-0.5 ${large ? "h-4 w-4" : "h-3.5 w-3.5"} text-muted-foreground`} />
          <p className={`flex-1 leading-snug ${large ? "text-base" : "text-sm"}`}>{note.content}</p>
          {note.reminderAt && (
            <Bell className={`shrink-0 ${large ? "h-4 w-4" : "h-3.5 w-3.5"} text-amber-500`} />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── CHILD VIEW ───────────────────────────────────────────────────────────────
function ChildView() {
  const { user } = useAuth();
  const { data: household } = trpc.household.getMyHousehold.useQuery();
  const householdId = household?.household?.id ?? "";
  const memberId = household?.member?.id;
  const [, setLocation] = useLocation();

  return (
    <div className="max-w-xl mx-auto p-4 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div
          className="h-10 w-10 rounded-full flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${TEAL}20` }}
        >
          <Star className="h-5 w-5" style={{ color: TEAL }} />
        </div>
        <div>
          <h1 className="text-xl font-bold">Hi, {user?.name?.split(" ")[0] ?? "there"}! 👋</h1>
          <p className="text-sm text-muted-foreground">Here's what's happening</p>
        </div>
      </div>

      {/* Upcoming events */}
      <Card>
        <CardHeader className="pb-2 flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Calendar className="h-4 w-4" style={{ color: TEAL }} />
            My Week
          </CardTitle>
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground" onClick={() => setLocation("/calendar")}>
            Full calendar <ChevronRight className="h-3 w-3" />
          </Button>
        </CardHeader>
        <CardContent className="pt-0">
          <UpcomingEventsList limit={5} />
        </CardContent>
      </Card>

      {/* My notes / tasks */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <BookOpen className="h-4 w-4" style={{ color: VIOLET }} />
            My Notes
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {householdId ? (
            <NotesList householdId={householdId} memberId={memberId} />
          ) : (
            <Skeleton className="h-12 w-full rounded-lg" />
          )}
        </CardContent>
      </Card>

      {/* Booking requests */}
      <Card>
        <CardHeader className="pb-2 flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Clock className="h-4 w-4" style={{ color: AMBER }} />
            My Requests
          </CardTitle>
          <Button
            variant="ghost" size="sm"
            className="h-7 text-xs gap-1 text-muted-foreground"
            onClick={() => setLocation("/calendar")}
          >
            Request time <ChevronRight className="h-3 w-3" />
          </Button>
        </CardHeader>
        <CardContent className="pt-0">
          <MyBookingRequests />
        </CardContent>
      </Card>
    </div>
  );
}

// ─── ELDER VIEW ───────────────────────────────────────────────────────────────
function ElderView() {
  const { user } = useAuth();
  const { data: household } = trpc.household.getMyHousehold.useQuery();
  const householdId = household?.household?.id ?? "";
  const memberId = household?.member?.id;
  const [, setLocation] = useLocation();

  return (
    <div className="max-w-xl mx-auto p-4 flex flex-col gap-5">
      {/* Header — large text */}
      <div className="flex items-center gap-3">
        <div
          className="h-12 w-12 rounded-full flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${CORAL}20` }}
        >
          <Heart className="h-6 w-6" style={{ color: CORAL }} />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Good day, {user?.name?.split(" ")[0] ?? "there"}</h1>
          <p className="text-base text-muted-foreground">Your schedule for the week</p>
        </div>
      </div>

      {/* Upcoming events — large text */}
      <Card>
        <CardHeader className="pb-3 flex-row items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Calendar className="h-5 w-5" style={{ color: CORAL }} />
            Upcoming Events
          </CardTitle>
          <Button variant="ghost" size="sm" className="text-sm gap-1 text-muted-foreground" onClick={() => setLocation("/calendar")}>
            View all <ChevronRight className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="pt-0">
          <UpcomingEventsList limit={7} large />
        </CardContent>
      </Card>

      {/* Reminders / Notes — large text */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Bell className="h-5 w-5" style={{ color: AMBER }} />
            Reminders
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {householdId ? (
            <NotesList householdId={householdId} memberId={memberId} large />
          ) : (
            <Skeleton className="h-16 w-full rounded-lg" />
          )}
        </CardContent>
      </Card>

      {/* Caregiver notes — notes tagged to this member by caregivers */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <MessageSquare className="h-5 w-5" style={{ color: BLUE }} />
            Notes from Your Caregiver
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {householdId ? (
            <NotesList householdId={householdId} large />
          ) : (
            <Skeleton className="h-16 w-full rounded-lg" />
          )}
          <p className="text-xs text-muted-foreground mt-3 italic">
            Notes left by your household caregivers appear here.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── CAREGIVER VIEW ───────────────────────────────────────────────────────────
function CaregiverView() {
  const { user } = useAuth();
  const { data: household } = trpc.household.getMyHousehold.useQuery();
  const householdId = household?.household?.id ?? "";
  const memberId = household?.member?.id;
  const [, setLocation] = useLocation();

  // All household members to show care schedule context
  const { data: members = [] } = trpc.household.members.list.useQuery(
    undefined,
    { enabled: !!householdId }
  );
  const elderMembers = (members as any[]).filter(m => m.role === "elder");

  return (
    <div className="max-w-2xl mx-auto p-4 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div
          className="h-10 w-10 rounded-full flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${BLUE}20` }}
        >
          <ClipboardList className="h-5 w-5" style={{ color: BLUE }} />
        </div>
        <div>
          <h1 className="text-xl font-bold">Care Dashboard</h1>
          <p className="text-sm text-muted-foreground">Welcome, {user?.name?.split(" ")[0] ?? "Caregiver"}</p>
        </div>
      </div>

      {/* Care schedule — upcoming events */}
      <Card>
        <CardHeader className="pb-2 flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Calendar className="h-4 w-4" style={{ color: BLUE }} />
            Care Schedule
          </CardTitle>
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground" onClick={() => setLocation("/calendar")}>
            Full calendar <ChevronRight className="h-3 w-3" />
          </Button>
        </CardHeader>
        <CardContent className="pt-0">
          <UpcomingEventsList limit={7} />
        </CardContent>
      </Card>

      {/* Elder members quick links */}
      {elderMembers.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <User className="h-4 w-4" style={{ color: CORAL }} />
              People in Your Care
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex flex-col gap-2">
              {elderMembers.map((m: any) => (
                <div key={m.id} className="flex items-center gap-3 rounded-lg border p-3 bg-card">
                  <div
                    className="h-8 w-8 rounded-full flex items-center justify-center shrink-0 text-sm font-bold"
                    style={{ backgroundColor: `${CORAL}20`, color: CORAL }}
                  >
                    {(m.displayName ?? m.name ?? "?")[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{m.displayName ?? m.name}</p>
                    <p className="text-xs text-muted-foreground capitalize">{m.role}</p>
                  </div>
                  <Badge variant="outline" className="text-[10px]">Elder</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Medication reminders placeholder */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Pill className="h-4 w-4" style={{ color: VIOLET }} />
            Medication Reminders
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="rounded-lg border border-dashed p-4 text-center">
            <Pill className="h-8 w-8 mx-auto mb-2 text-muted-foreground opacity-30" />
            <p className="text-sm text-muted-foreground">Medication tracking coming in Phase 2</p>
            <p className="text-xs text-muted-foreground mt-1">
              Add medication schedules as calendar events or notes for now
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Caregiver notes */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <ClipboardList className="h-4 w-4" style={{ color: AMBER }} />
            Care Notes
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {householdId ? (
            <NotesList householdId={householdId} memberId={memberId} />
          ) : (
            <Skeleton className="h-16 w-full rounded-lg" />
          )}
        </CardContent>
      </Card>

      {/* My requests */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Clock className="h-4 w-4" style={{ color: TEAL }} />
            My Requests
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <MyBookingRequests />
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Role guard + router ──────────────────────────────────────────────────────
export default function FamilyView() {
  const [location, setLocation] = useLocation();
  const { data: household, isLoading } = trpc.household.getMyHousehold.useQuery();
  const role = household?.member?.role;
  const isAdmin = household?.isAdmin;

  // Determine which sub-view to render
  const subView = location.includes("/child")
    ? "child"
    : location.includes("/elder")
    ? "elder"
    : location.includes("/caregiver")
    ? "caregiver"
    : null;

  if (isLoading) {
    return (
      <div className="max-w-xl mx-auto p-4 flex flex-col gap-4">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}
      </div>
    );
  }

  // If no sub-view is specified, show the role selector
  if (!subView) {
    return (
      <div className="max-w-xl mx-auto p-4 flex flex-col gap-4">
        <div>
          <h1 className="text-xl font-bold">Family Views</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Role-filtered dashboards for household members
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <Card
            className="cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => setLocation("/family/child")}
          >
            <CardContent className="flex items-center gap-4 p-4">
              <div className="h-10 w-10 rounded-full flex items-center justify-center" style={{ backgroundColor: `${TEAL}20` }}>
                <Star className="h-5 w-5" style={{ color: TEAL }} />
              </div>
              <div className="flex-1">
                <p className="font-semibold">Child View</p>
                <p className="text-xs text-muted-foreground">Simplified calendar, notes, and requests</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </CardContent>
          </Card>
          <Card
            className="cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => setLocation("/family/elder")}
          >
            <CardContent className="flex items-center gap-4 p-4">
              <div className="h-10 w-10 rounded-full flex items-center justify-center" style={{ backgroundColor: `${CORAL}20` }}>
                <Heart className="h-5 w-5" style={{ color: CORAL }} />
              </div>
              <div className="flex-1">
                <p className="font-semibold">Elder View</p>
                <p className="text-xs text-muted-foreground">Large-text calendar, reminders, caregiver notes</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </CardContent>
          </Card>
          <Card
            className="cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => setLocation("/family/caregiver")}
          >
            <CardContent className="flex items-center gap-4 p-4">
              <div className="h-10 w-10 rounded-full flex items-center justify-center" style={{ backgroundColor: `${BLUE}20` }}>
                <ClipboardList className="h-5 w-5" style={{ color: BLUE }} />
              </div>
              <div className="flex-1">
                <p className="font-semibold">Caregiver View</p>
                <p className="text-xs text-muted-foreground">Care schedule, notes, medication reminders</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Back button */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur border-b px-4 py-2 flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 text-muted-foreground"
          onClick={() => setLocation("/family")}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All Views
        </Button>
        <Separator orientation="vertical" className="h-4" />
        <span className="text-sm font-medium capitalize">{subView} View</span>
      </div>

      {subView === "child" && <ChildView />}
      {subView === "elder" && <ElderView />}
      {subView === "caregiver" && <CaregiverView />}
    </div>
  );
}
