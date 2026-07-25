import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  RefreshCw,
  Calendar,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  ShieldOff,
  ShieldX,
  Info,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface GoogleCalendar {
  id: string;
  name: string;
  primary: boolean;
  color: string;
  accessRole: string;
}

/** Per-calendar shadow blocking configuration chosen during onboarding */
interface CalendarShadowConfig {
  /** true = events on this calendar generate Busy blocks on other calendars */
  shadowSource: boolean;
  /** true = this calendar receives Busy blocks from other calendars */
  shadowBlocking: boolean;
}

/** The three preset modes shown in the onboarding step */
type ShadowMode = "personal" | "shared" | "isolated";

const SHADOW_MODES: Record<
  ShadowMode,
  {
    label: string;
    description: string;
    icon: React.ReactNode;
    badge: string;
    badgeVariant: "default" | "secondary" | "outline";
    shadowSource: boolean;
    shadowBlocking: boolean;
    example: string;
    detail: string;
  }
> = {
  personal: {
    label: "Personal calendar",
    description: "Generates and receives Busy blocks",
    icon: <ShieldCheck className="h-5 w-5 text-emerald-500" />,
    badge: "Recommended",
    badgeVariant: "default",
    shadowSource: true,
    shadowBlocking: true,
    example:
            "When you have a dentist appointment on this calendar, a 'Busy' block will appear on your work calendar so colleagues know you're unavailable. Likewise, work meetings will show as 'Busy' here.",
    detail:
      "Use this for your primary personal calendars — e.g. tarikp@gmail.com, your personal Google calendar. Events flow both ways: your personal commitments protect your work availability, and your work commitments protect your personal time.",
  },
  shared: {
    label: "Shared / team calendar",
    description: "Receives Busy blocks only — does not broadcast events",
    icon: <ShieldOff className="h-5 w-5 text-amber-500" />,
    badge: "For team calendars",
    badgeVariant: "secondary",
    shadowSource: false,
    shadowBlocking: true,
    example:
            "When a colleague adds 'Jake OOO' to the Team StartOut calendar, that event will NOT appear as a Busy block on your personal calendar. But your personal commitments will still show as Busy here so the team can see your availability.",
    detail:
      "Use this for shared or team calendars — e.g. Team StartOut, a family shared calendar. The calendar receives availability context from your other calendars, but its own events are team-wide announcements that should not pollute your personal availability signals.",
  },
  isolated: {
    label: "Isolated calendar",
    description: "No Busy blocks generated or received",
    icon: <ShieldX className="h-5 w-5 text-muted-foreground" />,
    badge: "Advanced",
    badgeVariant: "outline",
    shadowSource: false,
    shadowBlocking: false,
    example:
      "Events on this calendar will never appear as Busy blocks anywhere else, and no Busy blocks from other calendars will appear here. The calendar is fully independent.",
    detail:
            "Use this for reference calendars, holiday calendars, or any calendar whose events should not affect availability signals in either direction — e.g. 'Holidays in Jamaica', a read-only subscription feed.",
  },
};

interface ConnectCalendarDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConnected?: () => void;
}

export function ConnectCalendarDialog({
  open,
  onOpenChange,
  onConnected,
}: ConnectCalendarDialogProps) {
  const [step, setStep] = useState<
    "discover" | "select" | "shadow" | "confirm" | "connecting" | "done"
  >("discover");
  const [discoveredCalendars, setDiscoveredCalendars] = useState<
    GoogleCalendar[]
  >([]);
  const [selectedCalendars, setSelectedCalendars] = useState<Set<string>>(
    new Set()
  );
  const [shadowConfigs, setShadowConfigs] = useState<
    Record<string, ShadowMode>
  >({});
  const [connectingIndex, setConnectingIndex] = useState(0);
  const [results, setResults] = useState<
    Array<{ name: string; synced: number; error?: string }>
  >([]);

  const discoverMutation = trpc.calendar.discoverGoogle.useMutation();
  const connectMutation = trpc.calendar.connectGoogle.useMutation();

  const handleDiscover = async () => {
    try {
      const result = await discoverMutation.mutateAsync();
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setDiscoveredCalendars(result.calendars);
      const primary = result.calendars.find((c) => c.primary);
      if (primary) {
        setSelectedCalendars(new Set([primary.id]));
      }
      setStep("select");
    } catch (error: any) {
      toast.error(error.message || "Failed to discover calendars");
    }
  };

  const handleProceedToShadow = () => {
    if (selectedCalendars.size === 0) {
      toast.error("Please select at least one calendar");
      return;
    }
    // Default all selected calendars to "personal" mode
    const defaults: Record<string, ShadowMode> = {};
    Array.from(selectedCalendars).forEach(id => {
      defaults[id] = shadowConfigs[id] ?? "personal";
    });
    setShadowConfigs(defaults);
    setStep("shadow");
  };

  const handleProceedToConfirm = () => {
    setStep("confirm");
  };

  const handleConnect = async () => {
    const toConnect = discoveredCalendars.filter((c) =>
      selectedCalendars.has(c.id)
    );
    setStep("connecting");
    const newResults: typeof results = [];

    for (let i = 0; i < toConnect.length; i++) {
      setConnectingIndex(i);
      const cal = toConnect[i];
      const mode = shadowConfigs[cal.id] ?? "personal";
      const modeConfig = SHADOW_MODES[mode];
      try {
        const result = await connectMutation.mutateAsync({
          googleCalendarId: cal.id,
          name: cal.name,
          color: cal.color,
          isPrimary: cal.primary,
          provider: "google_personal",
          shadowBlocking: modeConfig.shadowBlocking,
          shadowSource: modeConfig.shadowSource,
        });
        newResults.push({ name: cal.name, synced: result.synced });
      } catch (error: any) {
        newResults.push({ name: cal.name, synced: 0, error: error.message });
      }
    }

    setResults(newResults);
    setStep("done");
    onConnected?.();
  };

  const toggleCalendar = (id: string) => {
    setSelectedCalendars((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const setShadowMode = (calId: string, mode: ShadowMode) => {
    setShadowConfigs((prev) => ({ ...prev, [calId]: mode }));
  };

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(() => {
      setStep("discover");
      setDiscoveredCalendars([]);
      setSelectedCalendars(new Set());
      setShadowConfigs({});
      setResults([]);
    }, 300);
  };

  const selectedList = discoveredCalendars.filter((c) =>
    selectedCalendars.has(c.id)
  );

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Connect Google Calendar
          </DialogTitle>
          <DialogDescription>
            {step === "discover" &&
              "Discover and sync your Google calendars with Geeves."}
            {step === "select" && "Select which calendars to sync."}
            {step === "shadow" &&
              "Configure how each calendar participates in availability sharing."}
            {step === "confirm" &&
              "Review your configuration before connecting."}
            {step === "connecting" &&
              "Connecting and syncing your calendars..."}
            {step === "done" && "Calendar connection complete!"}
          </DialogDescription>
        </DialogHeader>

        {/* ── Step 1: Discover ── */}
        {step === "discover" && (
          <div className="flex flex-col items-center gap-4 py-6">
            <div className="rounded-full bg-blue-500/10 p-4">
              <svg className="h-10 w-10" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
            </div>
            <p className="text-sm text-muted-foreground text-center max-w-xs">
              Geeves will discover your Google calendars and sync events in
              real-time.
            </p>
            <Button
              onClick={handleDiscover}
              disabled={discoverMutation.isPending}
              className="w-full"
            >
              {discoverMutation.isPending ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />{" "}
                  Discovering...
                </>
              ) : (
                "Discover My Calendars"
              )}
            </Button>
          </div>
        )}

        {/* ── Step 2: Select calendars ── */}
        {step === "select" && (
          <div className="flex flex-col gap-3 py-2">
            <div className="max-h-64 overflow-y-auto space-y-2">
              {discoveredCalendars.map((cal) => (
                <label
                  key={cal.id}
                  className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-accent/50 cursor-pointer transition-colors"
                >
                  <Checkbox
                    checked={selectedCalendars.has(cal.id)}
                    onCheckedChange={() => toggleCalendar(cal.id)}
                  />
                  <div
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: cal.color }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{cal.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {cal.primary ? "Primary" : cal.accessRole}
                    </p>
                  </div>
                </label>
              ))}
            </div>
            <DialogFooter className="pt-2">
              <Button variant="outline" onClick={() => setStep("discover")}>
                Back
              </Button>
              <Button
                onClick={handleProceedToShadow}
                disabled={selectedCalendars.size === 0}
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* ── Step 3: Shadow blocking configuration ── */}
        {step === "shadow" && (
          <div className="flex flex-col gap-4 py-2">
            <p className="text-sm text-muted-foreground">
              Choose how each calendar participates in{" "}
              <strong>availability sharing</strong>. Geeves uses this to show
              "Busy" blocks across your calendars so the right people see when
              you're free.
            </p>

            <div className="space-y-4">
              {selectedList.map((cal) => {
                const currentMode = shadowConfigs[cal.id] ?? "personal";
                return (
                  <div
                    key={cal.id}
                    className="rounded-lg border border-border p-3 space-y-3"
                  >
                    {/* Calendar header */}
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: cal.color }}
                      />
                      <p className="text-sm font-semibold truncate flex-1">
                        {cal.name}
                      </p>
                      {cal.primary && (
                        <Badge variant="outline" className="text-xs">
                          Primary
                        </Badge>
                      )}
                    </div>

                    {/* Mode selector */}
                    <div className="grid grid-cols-1 gap-2">
                      {(
                        Object.entries(SHADOW_MODES) as [
                          ShadowMode,
                          (typeof SHADOW_MODES)[ShadowMode],
                        ][]
                      ).map(([mode, cfg]) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setShadowMode(cal.id, mode)}
                          className={cn(
                            "flex items-start gap-3 p-3 rounded-lg border text-left transition-all",
                            currentMode === mode
                              ? "border-primary bg-primary/5 ring-1 ring-primary"
                              : "border-border hover:border-muted-foreground/40 hover:bg-accent/30"
                          )}
                        >
                          <div className="mt-0.5 shrink-0">{cfg.icon}</div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium">
                                {cfg.label}
                              </span>
                              <Badge
                                variant={cfg.badgeVariant}
                                className="text-xs"
                              >
                                {cfg.badge}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {cfg.description}
                            </p>
                          </div>
                          {/* Info popover */}
                          <Popover>
                            <PopoverTrigger asChild>
                              <button
                                type="button"
                                onClick={(e) => e.stopPropagation()}
                                className="shrink-0 mt-0.5 text-muted-foreground hover:text-foreground transition-colors"
                                aria-label={`More info about ${cfg.label}`}
                              >
                                <Info className="h-4 w-4" />
                              </button>
                            </PopoverTrigger>
                            <PopoverContent
                              className="w-80 text-sm space-y-3"
                              side="right"
                              align="start"
                            >
                              <div className="flex items-center gap-2">
                                {cfg.icon}
                                <span className="font-semibold">
                                  {cfg.label}
                                </span>
                              </div>
                              <p className="text-muted-foreground">
                                {cfg.detail}
                              </p>
                              <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
                                <strong className="text-foreground block mb-1">
                                  Example
                                </strong>
                                {cfg.example}
                              </div>
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                <div
                                  className={cn(
                                    "rounded p-2 text-center",
                                    cfg.shadowSource
                                      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                                      : "bg-muted text-muted-foreground line-through"
                                  )}
                                >
                                  Generates Busy blocks
                                </div>
                                <div
                                  className={cn(
                                    "rounded p-2 text-center",
                                    cfg.shadowBlocking
                                      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                                      : "bg-muted text-muted-foreground line-through"
                                  )}
                                >
                                  Receives Busy blocks
                                </div>
                              </div>
                            </PopoverContent>
                          </Popover>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <DialogFooter className="pt-2">
              <Button variant="outline" onClick={() => setStep("select")}>
                Back
              </Button>
              <Button onClick={handleProceedToConfirm}>
                Review & Confirm
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* ── Step 4: Confirm ── */}
        {step === "confirm" && (
          <div className="flex flex-col gap-4 py-2">
            <p className="text-sm text-muted-foreground">
              Please review your configuration. You can change these settings
              later in{" "}
              <strong>Settings → Calendars → Shadow Blocking</strong>.
            </p>

            <div className="space-y-2">
              {selectedList.map((cal) => {
                const mode = shadowConfigs[cal.id] ?? "personal";
                const cfg = SHADOW_MODES[mode];
                return (
                  <div
                    key={cal.id}
                    className="flex items-center gap-3 p-3 rounded-lg border border-border bg-accent/20"
                  >
                    <div
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: cal.color }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{cal.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {cfg.description}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {cfg.icon}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Behaviour summary */}
            <div className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground text-sm mb-2">
                What will happen
              </p>
              {selectedList.map((cal) => {
                const mode = shadowConfigs[cal.id] ?? "personal";
                const cfg = SHADOW_MODES[mode];
                return (
                  <p key={cal.id}>
                    <strong>{cal.name}:</strong>{" "}
                    {cfg.shadowSource && cfg.shadowBlocking &&
                      "Events here will show as Busy on your other calendars, and vice versa."}
                    {!cfg.shadowSource && cfg.shadowBlocking &&
                      "Events here will NOT generate Busy blocks elsewhere. Your other calendars will show Busy here."}
                    {!cfg.shadowSource && !cfg.shadowBlocking &&
                      "Fully isolated — no Busy blocks generated or received."}
                    {cfg.shadowSource && !cfg.shadowBlocking &&
                      "Events here will generate Busy blocks elsewhere, but this calendar will not receive any."}
                  </p>
                );
              })}
            </div>

            <DialogFooter className="pt-2">
              <Button variant="outline" onClick={() => setStep("shadow")}>
                Back
              </Button>
              <Button onClick={handleConnect}>
                Connect {selectedList.length} Calendar
                {selectedList.length !== 1 ? "s" : ""}
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* ── Step 5: Connecting ── */}
        {step === "connecting" && (
          <div className="flex flex-col items-center gap-4 py-6">
            <RefreshCw className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              Syncing calendar {connectingIndex + 1} of {selectedList.length}
              ...
            </p>
          </div>
        )}

        {/* ── Step 6: Done ── */}
        {step === "done" && (
          <div className="flex flex-col gap-3 py-4">
            {results.map((r, i) => (
              <div
                key={i}
                className="flex items-center gap-3 p-3 rounded-lg bg-accent/30"
              >
                {r.error ? (
                  <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
                ) : (
                  <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{r.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.error ? r.error : `${r.synced} events synced`}
                  </p>
                </div>
              </div>
            ))}
            <DialogFooter className="pt-2">
              <Button onClick={handleClose}>Done</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
