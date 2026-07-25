import { useState, useMemo, useEffect, useRef } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Building2, Plus, Pencil, Trash2, MapPin, Link as LinkIcon,
  RefreshCw, AlertTriangle, CheckCircle2, Settings2, Calendar,
  ChevronRight, X, Download, Clock, Copy, CalendarPlus, FileText,
  DollarSign, Camera, ExternalLink, TrendingUp, TrendingDown, Upload, Receipt, GripVertical
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { Textarea } from "@/components/ui/textarea";
import { format } from "date-fns";
import { GeeveNode, GeeveNodeBadge } from "@/components/GeeveNode";
import { BookingGantt } from "@/components/BookingGantt";
import { MapView } from "@/components/Map";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";


const PROPERTY_TYPES = [
  { value: "primary_residence", label: "Primary Residence" },
  { value: "rental_str", label: "Short-Term Rental (STR)" },
  { value: "rental_ltr", label: "Long-Term Rental (LTR)" },
  { value: "vacation", label: "Vacation Home" },
  { value: "commercial", label: "Commercial" },
  { value: "investment", label: "Investment Property" },
  { value: "other", label: "Other" },
] as const;

const STR_PLATFORMS = [
  { value: "airbnb", label: "Airbnb", color: "#FF5A5F" },
  { value: "vrbo", label: "VRBO", color: "#1B6FE4" },
  { value: "booking_com", label: "Booking.com", color: "#003580" },
  { value: "direct", label: "Direct Booking", color: "#2AAFA9" },  // Brand Vivid Teal
] as const;

const LTR_PLATFORMS = [
  { value: "zillow", label: "Zillow", color: "#006AFF" },
  { value: "apartments_com", label: "Apartments.com", color: "#E31837" },
  { value: "direct", label: "Direct Lease", color: "#2AAFA9" },  // Brand Vivid Teal
  { value: "other", label: "Other", color: "#6B7280" },
] as const;

type PropertyType = typeof PROPERTY_TYPES[number]["value"];

interface PropertyForm {
  name: string;
  address: string;
  type: PropertyType;
  propertyEmail: string;
  isActive: boolean;
  country: string;
  timezone: string;
}

const defaultForm: PropertyForm = {
  name: "",
  address: "",
  type: "rental_str",
  propertyEmail: "",
  isActive: true,
  country: "US",
  timezone: "America/New_York",
};

function getPlatformColor(platform: string): string {
  const all = [...STR_PLATFORMS, ...LTR_PLATFORMS];
  return all.find(p => p.value === platform)?.color || "#6B7280";
}

function getPlatformLabel(platform: string): string {
  const all = [...STR_PLATFORMS, ...LTR_PLATFORMS];
  return all.find(p => p.value === platform)?.label || platform;
}

function isSTR(type: string) {
  return ["rental_str", "vacation"].includes(type);
}

// ─── Platform Feed Manager ────────────────────────────────────────────────────

function PlatformManager({ property }: { property: any }) {
  const utils = trpc.useUtils();
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ platform: "airbnb", displayName: "", icalUrl: "", notificationEmail: "", emailScrapingEnabled: false });
  const [editOpen, setEditOpen] = useState(false);
  const [editingPlatform, setEditingPlatform] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ displayName: "", icalUrl: "", notificationEmail: "", emailScrapingEnabled: false });
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [scrapingId, setScrapingId] = useState<string | null>(null);
  const [expandedBookingId, setExpandedBookingId] = useState<string | null>(null);

  const platformsQuery = trpc.properties.listPlatforms.useQuery({ propertyId: property.id });
  const platforms = platformsQuery.data || [];

  const addMutation = trpc.properties.addPlatform.useMutation({
    onSuccess: () => {
      utils.properties.listPlatforms.invalidate({ propertyId: property.id });
      toast.success("Platform feed added and synced");
      setAddOpen(false);
      setAddForm({ platform: "airbnb", displayName: "", icalUrl: "", notificationEmail: "", emailScrapingEnabled: false });
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.properties.deletePlatform.useMutation({
    onSuccess: () => {
      utils.properties.listPlatforms.invalidate({ propertyId: property.id });
      toast.success("Platform removed");
    },
    onError: (err) => toast.error(err.message),
  });

  const syncMutation = trpc.properties.syncPlatform.useMutation({
    onSuccess: (result) => {
      utils.properties.listPlatforms.invalidate({ propertyId: property.id });
      setSyncingId(null);
      if (result.errors.length > 0) {
        toast.error(`Sync completed with errors: ${result.errors[0]}`);
      } else {
        toast.success(`Synced: +${result.added} added, ${result.updated} updated, ${result.conflicts} conflicts`);
      }
    },
    onError: (err) => { setSyncingId(null); toast.error(err.message); },
  });

  const updateMutation = trpc.properties.updatePlatform.useMutation({
    onSuccess: () => {
      utils.properties.listPlatforms.invalidate({ propertyId: property.id });
      toast.success("Platform updated");
      setEditOpen(false);
      setEditingPlatform(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const scrapeMutation = trpc.properties.triggerEmailScrape.useMutation({
    onSuccess: (result) => {
      utils.properties.listPlatforms.invalidate({ propertyId: property.id });
      utils.properties.getEmailScrapeStatus.invalidate({ propertyId: property.id });
      setScrapingId(null);
      const enriched = result.bookingsEnriched + result.bookingsCreated;
      if (result.errors.length > 0) {
        toast.error(`Scrape completed with errors: ${result.errors[0]}`);
      } else {
        toast.success(`Email scrape complete: ${enriched} booking${enriched !== 1 ? 's' : ''} enriched from ${result.emailsProcessed} emails`);
      }
    },
    onError: (err) => { setScrapingId(null); toast.error(err.message); },
  });

  const scrapeStatusQuery = trpc.properties.getEmailScrapeStatus.useQuery(
    { propertyId: property.id },
    { refetchInterval: 5000 }
  );
  const scrapeJob = scrapeStatusQuery.data;

  const connectedAccountsQuery = trpc.calendar.listGoogleAccounts.useQuery();
  const connectedEmails = new Set((connectedAccountsQuery.data || []).map((a: any) => a.email?.toLowerCase()));

  const generateICSMutation = trpc.properties.generateOutboundICS.useMutation({
    onSuccess: (result) => {
      utils.properties.getById.invalidate({ id: property.id });
      navigator.clipboard.writeText(result.url).catch(() => {});
      toast.success("Outbound ICS regenerated and URL copied to clipboard");
    },
    onError: (err) => toast.error(err.message),
  });

  const currentIcsUrl = (property as any).outboundIcsUrl as string | null | undefined;

  const availablePlatforms = isSTR(property.type) ? STR_PLATFORMS : LTR_PLATFORMS;

  return (
    <div className="space-y-4">
      {/* Scrape job status banner */}
      {scrapeJob && (
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${
          scrapeJob.status === "running" ? "bg-violet-500/10 text-violet-300 border border-violet-500/20" :
          scrapeJob.status === "completed" ? "bg-teal-500/10 text-teal-300 border border-teal-500/20" :
          "bg-destructive/10 text-destructive border border-destructive/20"
        }`}>
          {scrapeJob.status === "running" ? (
            <RefreshCw className="h-3 w-3 animate-spin shrink-0" />
          ) : scrapeJob.status === "completed" ? (
            <CheckCircle2 className="h-3 w-3 shrink-0" />
          ) : (
            <AlertTriangle className="h-3 w-3 shrink-0" />
          )}
          <span>
            {scrapeJob.status === "running"
              ? `Scraping emails… ${scrapeJob.emailsProcessed ?? 0} processed`
              : scrapeJob.status === "completed"
              ? `Last scrape: ${scrapeJob.bookingsEnriched ?? 0} enriched, ${scrapeJob.bookingsCreated ?? 0} new — ${new Date(scrapeJob.completedAt ?? scrapeJob.startedAt).toLocaleString()}`
              : `Scrape error: ${scrapeJob.errorMessage ?? "unknown error"}`
            }
          </span>
        </div>
      )}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Add iCal feeds from each platform. Geeves will merge them into one unified calendar.
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => generateICSMutation.mutate({ propertyId: property.id })}
            disabled={generateICSMutation.isPending || platforms.length === 0}
            title={currentIcsUrl ? "Regenerate and copy the composite iCal URL" : "Generate composite iCal URL for platform export"}
          >
            {generateICSMutation.isPending ? (
              <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5 mr-1.5" />
            )}
            {currentIcsUrl ? "Regenerate Export URL" : "Generate Export URL"}
          </Button>
          {currentIcsUrl && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { navigator.clipboard.writeText(currentIcsUrl).catch(() => {}); toast.success("Outbound ICS URL copied to clipboard"); }}
              title="Copy the current composite iCal URL to clipboard"
            >
              <Copy className="h-3.5 w-3.5 mr-1.5" />
              Copy URL
            </Button>
          )}
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Add Platform
          </Button>
        </div>
      </div>

      {platforms.length === 0 ? (
        <div className="border border-dashed rounded-lg p-6 text-center">
          <LinkIcon className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No platform feeds connected yet.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Add your Airbnb, VRBO, or Booking.com iCal URL to start syncing bookings.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {platforms.map((p: any) => (
            <div key={p.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card">
              <div
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: getPlatformColor(p.platform) }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{p.displayName || getPlatformLabel(p.platform)}</span>
                  <Badge variant="outline" className="text-xs px-1.5 py-0">
                    {getPlatformLabel(p.platform)}
                  </Badge>
                  {p.lastError ? (
                    <GeeveNode status="error" size={10} title={p.lastError} />
                  ) : p.lastPolledAt ? (
                    <GeeveNode status="connected" size={10} title="Synced" />
                  ) : (
                    <GeeveNode status="inactive" size={10} title="Not yet synced" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate mt-0.5">{p.icalUrl}</p>
                {p.lastError && (
                  <p className="text-xs text-destructive mt-0.5">{p.lastError}</p>
                )}
                {p.lastPolledAt && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Last synced: {new Date(p.lastPolledAt).toLocaleString()}
                  </p>
                )}
                {p.notificationEmail && (
                  <p className="text-xs mt-0.5 flex items-center gap-1">
                    <span className={connectedEmails.has(p.notificationEmail.toLowerCase()) ? "text-teal-400" : "text-amber-400"}>
                      {connectedEmails.has(p.notificationEmail.toLowerCase()) ? "✓" : "○"}
                    </span>
                    <span className="text-muted-foreground">{p.notificationEmail}</span>
                    {!connectedEmails.has(p.notificationEmail.toLowerCase()) && (
                      <span className="text-amber-400">(not connected — email scraping unavailable)</span>
                    )}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  disabled={syncingId === p.id || syncMutation.isPending}
                  onClick={() => {
                    setSyncingId(p.id);
                    syncMutation.mutate({ platformId: p.id });
                  }}
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${syncingId === p.id ? "animate-spin" : ""}`} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  title="Edit platform"
                  onClick={() => {
                    setEditingPlatform(p);
                    setEditForm({
                      displayName: p.displayName || "",
                      icalUrl: p.icalUrl || "",
                      notificationEmail: p.notificationEmail || "",
                      emailScrapingEnabled: p.emailScrapingEnabled || false,
                    });
                    setEditOpen(true);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                {p.emailScrapingEnabled && p.notificationEmail && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    title={`Scrape ${getPlatformLabel(p.platform)} emails for booking details`}
                    disabled={scrapingId === p.id || scrapeMutation.isPending || scrapeJob?.status === "running"}
                    onClick={() => {
                      setScrapingId(p.id);
                      scrapeMutation.mutate({ platformId: p.id });
                    }}
                  >
                    <Download className={`h-3.5 w-3.5 ${scrapingId === p.id || scrapeJob?.status === "running" ? "animate-pulse" : ""}`} />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  onClick={() => deleteMutation.mutate({ id: p.id })}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit Platform Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Platform Feed</DialogTitle>
          </DialogHeader>
          {editingPlatform && (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Display Name (optional)</Label>
                <Input
                  placeholder={getPlatformLabel(editingPlatform.platform)}
                  value={editForm.displayName}
                  onChange={(e) => setEditForm({ ...editForm, displayName: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>iCal URL</Label>
                <Input
                  value={editForm.icalUrl}
                  onChange={(e) => setEditForm({ ...editForm, icalUrl: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Notification Email</Label>
                  {editForm.notificationEmail && (
                    connectedEmails.has(editForm.notificationEmail.toLowerCase())
                      ? <Badge variant="outline" className="text-xs text-primary border-primary/40"><CheckCircle2 className="h-3 w-3 mr-1" />Linked</Badge>
                      : <Badge variant="outline" className="text-xs text-amber-400 border-amber-400/40"><AlertTriangle className="h-3 w-3 mr-1" />Needs Access</Badge>
                  )}
                </div>
                <Input
                  type="email"
                  placeholder="email that receives booking confirmations"
                  value={editForm.notificationEmail}
                  onChange={(e) => setEditForm({ ...editForm, notificationEmail: e.target.value })}
                />
                {editForm.notificationEmail && !connectedEmails.has(editForm.notificationEmail.toLowerCase()) && (
                  <p className="text-xs text-amber-400">
                    This email is not yet connected to Geeves. Go to Settings → Accounts to add it so email scraping can access the inbox.
                  </p>
                )}
                {editingPlatform.notificationEmail && editForm.notificationEmail !== editingPlatform.notificationEmail && (
                  <p className="text-xs text-blue-400">
                    Email address changed — a full 2-year historical scrape will run automatically on the new inbox.
                  </p>
                )}
              </div>
              {editForm.notificationEmail && (
                <div className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium">Enable email scraping</Label>
                    <p className="text-xs text-muted-foreground">
                      Automatically read confirmation emails to enrich bookings with guest names, confirmation numbers, and financial data.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={editForm.emailScrapingEnabled}
                    onChange={(e) => setEditForm({ ...editForm, emailScrapingEnabled: e.target.checked })}
                    className="h-4 w-4 rounded border-border"
                  />
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button
              onClick={() => editingPlatform && updateMutation.mutate({
                id: editingPlatform.id,
                displayName: editForm.displayName || undefined,
                icalUrl: editForm.icalUrl,
                notificationEmail: editForm.notificationEmail || undefined,
                emailScrapingEnabled: editForm.emailScrapingEnabled,
              })}
              disabled={!editForm.icalUrl || updateMutation.isPending}
            >
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Platform Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Platform Feed</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Platform</Label>
              <Select value={addForm.platform} onValueChange={(v) => setAddForm({ ...addForm, platform: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availablePlatforms.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
                        {p.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Display Name (optional)</Label>
              <Input
                placeholder={`e.g. ${getPlatformLabel(addForm.platform)} — Beach House`}
                value={addForm.displayName}
                onChange={(e) => setAddForm({ ...addForm, displayName: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>iCal URL</Label>
              <Input
                placeholder="https://www.airbnb.com/calendar/ical/..."
                value={addForm.icalUrl}
                onChange={(e) => setAddForm({ ...addForm, icalUrl: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                In Airbnb: Listing → Availability → Export Calendar. In VRBO: Calendar → Import/Export.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Notification Email</Label>
              <Input
                type="email"
                placeholder="email that receives booking confirmations"
                value={addForm.notificationEmail}
                onChange={(e) => setAddForm({ ...addForm, notificationEmail: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                The email address where {getPlatformLabel(addForm.platform)} sends booking confirmations.
                {addForm.platform === "booking_com" && " Geeves will read this inbox to enrich bookings with guest names and financial data."}
              </p>
            </div>
            {addForm.platform === "booking_com" && addForm.notificationEmail && (
              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">Enable email scraping</Label>
                  <p className="text-xs text-muted-foreground">
                    Automatically read Booking.com confirmation emails to enrich bookings with guest names, confirmation numbers, and financial data.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={addForm.emailScrapingEnabled}
                  onChange={(e) => setAddForm({ ...addForm, emailScrapingEnabled: e.target.checked })}
                  className="h-4 w-4 rounded border-border"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button
              onClick={() => addMutation.mutate({
                propertyId: property.id,
                platform: addForm.platform as any,
                displayName: addForm.displayName || undefined,
                icalUrl: addForm.icalUrl,
                notificationEmail: addForm.notificationEmail || undefined,
                emailScrapingEnabled: addForm.emailScrapingEnabled,
              })}
              disabled={!addForm.icalUrl || addMutation.isPending}
            >
              {addMutation.isPending ? "Adding & Syncing..." : "Add & Sync"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Prep Rules Editor ────────────────────────────────────────────────────────

function PrepRulesEditor({ property }: { property: any }) {
  const utils = trpc.useUtils();
  const prepRuleQuery = trpc.properties.getPrepRule.useQuery({ propertyId: property.id });
  const rule = prepRuleQuery.data;

  const [form, setForm] = useState({
    blockDaysBefore: 0,
    blockDaysAfter: 1,
    blockNationalHolidays: false,
    blockSundays: false,
  });
  // Populate form once when rule data arrives — must be in useEffect, not render
  useEffect(() => {
    if (!rule) return;
    setForm({
      blockDaysBefore: rule.blockDaysBefore ?? 0,
      blockDaysAfter: rule.blockDaysAfter ?? 1,
      blockNationalHolidays: rule.blockNationalHolidays ?? false,
      blockSundays: rule.blockSundays ?? false,
    });
  }, [rule?.blockDaysBefore, rule?.blockDaysAfter, rule?.blockNationalHolidays, rule?.blockSundays]);

  const saveMutation = trpc.properties.savePrepRule.useMutation({
    onSuccess: () => {
      utils.properties.getPrepRule.invalidate({ propertyId: property.id });
      toast.success("Prep rules saved and outbound ICS updated");
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Prep time rules are applied to every booking and pushed to the outbound ICS feed with a note explaining the block reason.
      </p>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Days to block before check-in</Label>
          <Input
            type="number"
            min={0}
            max={30}
            value={form.blockDaysBefore}
            onChange={(e) => setForm({ ...form, blockDaysBefore: parseInt(e.target.value) || 0 })}
          />
        </div>
        <div className="space-y-2">
          <Label>Days to block after check-out</Label>
          <Input
            type="number"
            min={0}
            max={30}
            value={form.blockDaysAfter}
            onChange={(e) => setForm({ ...form, blockDaysAfter: parseInt(e.target.value) || 0 })}
          />
        </div>
      </div>
      <Separator />
      <div className="space-y-3">
        <p className="text-sm font-medium">Restrict prep days</p>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm">Block national holidays as prep days</p>
            <p className="text-xs text-muted-foreground">Prep days will skip over national holidays</p>
          </div>
          <Switch
            checked={form.blockNationalHolidays}
            onCheckedChange={(v) => setForm({ ...form, blockNationalHolidays: v })}
          />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm">Block Sundays as prep days</p>
            <p className="text-xs text-muted-foreground">Prep days will skip over Sundays</p>
          </div>
          <Switch
            checked={form.blockSundays}
            onCheckedChange={(v) => setForm({ ...form, blockSundays: v })}
          />
        </div>
      </div>
      <Button
        onClick={() => saveMutation.mutate({ propertyId: property.id, ...form })}
        disabled={saveMutation.isPending}
        size="sm"
      >
        {saveMutation.isPending ? "Saving..." : "Save Prep Rules"}
      </Button>
    </div>
  );
}

// ─── Blackout Date Picker ─────────────────────────────────────────────────────

function BlackoutDates({ property }: { property: any }) {
  const utils = trpc.useUtils();
  const prepRuleQuery = trpc.properties.getPrepRule.useQuery({ propertyId: property.id });
  const rule = prepRuleQuery.data;
  const customDates: string[] = (rule?.customBlockDates as string[]) || [];

  const [newDate, setNewDate] = useState("");

  const saveMutation = trpc.properties.savePrepRule.useMutation({
    onSuccess: () => {
      utils.properties.getPrepRule.invalidate({ propertyId: property.id });
      toast.success("Blackout dates updated");
      setNewDate("");
    },
    onError: (err) => toast.error(err.message),
  });

  function addDate() {
    if (!newDate || customDates.includes(newDate)) return;
    const updated = [...customDates, newDate].sort();
    saveMutation.mutate({
      propertyId: property.id,
      blockDaysBefore: rule?.blockDaysBefore ?? 0,
      blockDaysAfter: rule?.blockDaysAfter ?? 1,
      blockNationalHolidays: rule?.blockNationalHolidays ?? false,
      blockSundays: rule?.blockSundays ?? false,
      customBlockDates: updated,
    });
  }

  function removeDate(date: string) {
    const updated = customDates.filter(d => d !== date);
    saveMutation.mutate({
      propertyId: property.id,
      blockDaysBefore: rule?.blockDaysBefore ?? 0,
      blockDaysAfter: rule?.blockDaysAfter ?? 1,
      blockNationalHolidays: rule?.blockNationalHolidays ?? false,
      blockSundays: rule?.blockSundays ?? false,
      customBlockDates: updated,
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Blackout dates are pushed to the outbound ICS with a "Blackout — Geeves.Life" note. Platforms will show these as unavailable.
      </p>
      <div className="flex gap-2">
        <Input
          type="date"
          value={newDate}
          onChange={(e) => setNewDate(e.target.value)}
          className="max-w-[180px]"
        />
        <Button size="sm" onClick={addDate} disabled={!newDate || saveMutation.isPending}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Add Blackout Date
        </Button>
      </div>
      {customDates.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">No blackout dates set.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {customDates.map((date) => (
            <Badge key={date} variant="secondary" className="flex items-center gap-1.5 pr-1">
              <Calendar className="h-3 w-3" />
              {new Date(date + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
              <button
                onClick={() => removeDate(date)}
                className="ml-0.5 hover:text-destructive transition-colors"
                disabled={saveMutation.isPending}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Bookings Tab ─────────────────────────────────────────────────────────────

function BookingsTab({ property }: { property: any }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingBookingId, setEditingBookingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    guestName: string; guestCount: string; guestEmail: string; guestPhone: string;
    totalPrice: string; cleaningFee: string; commissionAmount: string; netAmount: string;
    currency: string; confirmationNumber: string; platformBookingUrl: string;
  }>({
    guestName: "", guestCount: "", guestEmail: "", guestPhone: "",
    totalPrice: "", cleaningFee: "", commissionAmount: "", netAmount: "",
    currency: "USD", confirmationNumber: "", platformBookingUrl: "",
  });
  // ── Add Booking dialog state ──────────────────────────────────────────────
  const [addBookingOpen, setAddBookingOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    guestName: "",
    guestEmail: "",
    guestPhone: "",
    guestCount: "",
    checkIn: null as Date | null,
    checkOut: null as Date | null,
    totalPrice: "",
    cleaningFee: "",
    currency: "USD",
    notes: "",
  });
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [checkOutOpen, setCheckOutOpen] = useState(false);
  const [invoiceUrl, setInvoiceUrl] = useState<string | null>(null);
  const [showCancelled, setShowCancelled] = useState(false);

  const nowTs = Date.now();
  const fromTs = nowTs - 7 * 86400000;
  const toTs = nowTs + 60 * 86400000;

  const bookingsQuery = trpc.properties.listBookings.useQuery(
    { propertyId: property.id, fromTs, toTs },
    { staleTime: 30000 }
  );
  const platformsQuery = trpc.properties.listPlatforms.useQuery(
    { propertyId: property.id },
    { staleTime: 60000 }
  );
  const syncMutation = trpc.properties.syncAllPlatforms.useMutation({
    onSuccess: () => {
      bookingsQuery.refetch();
      toast.success("Feeds synced");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateFinancialsMutation = trpc.properties.updateBookingFinancials.useMutation({
    onSuccess: () => {
      bookingsQuery.refetch();
      setEditingBookingId(null);
      toast.success("Booking details saved.");
    },
    onError: (e) => toast.error(e.message),
  });

  const createBookingMutation = trpc.properties.createManualBooking.useMutation({
    onSuccess: (result) => {
      bookingsQuery.refetch();
      setAddBookingOpen(false);
      setAddForm({ guestName: "", guestEmail: "", guestPhone: "", guestCount: "", checkIn: null, checkOut: null, totalPrice: "", cleaningFee: "", currency: "USD", notes: "" });
      toast.success("Booking created! Generating invoice...");
      // Auto-generate invoice
      generateInvoiceMutation.mutate({ bookingId: result.bookingId });
    },
    onError: (e) => toast.error(e.message),
  });

  const generateInvoiceMutation = trpc.properties.generateInvoice.useMutation({
    onSuccess: (result) => {
      setInvoiceUrl(result.invoiceUrl);
      toast.success("Invoice ready!", { description: "Click to download the PDF invoice.", action: { label: "Download", onClick: () => window.open(result.invoiceUrl, "_blank") } });
    },
    onError: () => toast.error("Invoice generation failed — you can retry from the booking details."),
  });

  const cancelBookingMutation = trpc.properties.cancelManualBooking.useMutation({
    onSuccess: () => {
      bookingsQuery.refetch();
      cancelledQuery.refetch();
      toast.success("Booking cancelled.");
    },
    onError: (e) => toast.error(e.message),
  });

  // ── P-31: Cancelled bookings + pending cancellations ──────────────────────
  const cancelledQuery = trpc.properties.getCancelledBookings.useQuery(
    { propertyId: property.id },
    { staleTime: 30000 }
  );
  const pendingCancellationsQuery = trpc.properties.getPendingCancellations.useQuery(
    undefined,
    { staleTime: 30000 }
  );
  const pendingForProperty = (pendingCancellationsQuery.data || []).filter(
    (p: any) => p.propertyId === property.id
  );

  const restoreBookingMutation = trpc.properties.restoreBooking.useMutation({
    onSuccess: () => {
      cancelledQuery.refetch();
      bookingsQuery.refetch();
      toast.success("Booking restored.");
    },
    onError: (e) => toast.error(e.message),
  });

  const confirmCancellationMutation = trpc.properties.confirmCancellation.useMutation({
    onSuccess: () => {
      pendingCancellationsQuery.refetch();
      cancelledQuery.refetch();
      bookingsQuery.refetch();
      toast.success("Cancellation confirmed.");
    },
    onError: (e) => toast.error(e.message),
  });

  const dismissCancellationMutation = trpc.properties.dismissPendingCancellation.useMutation({
    onSuccess: () => {
      pendingCancellationsQuery.refetch();
      toast.success("Cancellation dismissed — booking kept.");
    },
    onError: (e) => toast.error(e.message),
  });

  function submitAddBooking() {
    if (!addForm.guestName.trim()) { toast.error("Guest name is required"); return; }
    if (!addForm.checkIn || !addForm.checkOut) { toast.error("Check-in and check-out dates are required"); return; }
    const checkInTs = addForm.checkIn.getTime();
    const checkOutTs = addForm.checkOut.getTime();
    if (checkOutTs <= checkInTs) { toast.error("Check-out must be after check-in"); return; }
    createBookingMutation.mutate({
      propertyId: property.id,
      guestName: addForm.guestName.trim(),
      guestEmail: addForm.guestEmail.trim() || null,
      guestPhone: addForm.guestPhone.trim() || null,
      guestCount: addForm.guestCount ? parseInt(addForm.guestCount, 10) : null,
      checkIn: checkInTs,
      checkOut: checkOutTs,
      totalPrice: addForm.totalPrice ? parseFloat(addForm.totalPrice) : null,
      cleaningFee: addForm.cleaningFee ? parseFloat(addForm.cleaningFee) : null,
      currency: addForm.currency || "USD",
      notes: addForm.notes.trim() || null,
    });
  }

  function openEdit(b: any) {
    setEditingBookingId(b.id);
    setEditForm({
      guestName: b.guestName || "",
      guestCount: b.guestCount ? String(b.guestCount) : "",
      guestEmail: b.guestEmail || "",
      guestPhone: b.guestPhone || "",
      totalPrice: b.totalPrice ? String(b.totalPrice) : "",
      cleaningFee: b.cleaningFee ? String(b.cleaningFee) : "",
      commissionAmount: b.commissionAmount ? String(b.commissionAmount) : "",
      netAmount: b.netAmount ? String(b.netAmount) : "",
      currency: b.currency || "USD",
      confirmationNumber: b.confirmationNumber || "",
      platformBookingUrl: b.platformBookingUrl || "",
    });
  }

  function saveEdit() {
    if (!editingBookingId) return;
    const parseNum = (s: string) => s.trim() === "" ? null : parseFloat(s);
    const parseIntVal = (s: string): number | null => s.trim() === "" ? null : window.parseInt(s, 10);
    updateFinancialsMutation.mutate({
      bookingId: editingBookingId,
      guestName: editForm.guestName.trim() || null,
      guestCount: parseIntVal(editForm.guestCount),
      guestEmail: editForm.guestEmail.trim() || null,
      guestPhone: editForm.guestPhone.trim() || null,
      totalPrice: parseNum(editForm.totalPrice),
      cleaningFee: parseNum(editForm.cleaningFee),
      commissionAmount: parseNum(editForm.commissionAmount),
      netAmount: parseNum(editForm.netAmount),
      currency: editForm.currency.trim() || null,
      confirmationNumber: editForm.confirmationNumber.trim() || null,
      platformBookingUrl: editForm.platformBookingUrl.trim() || null,
    });
  }

  const bookings = bookingsQuery.data || [];
  const platforms = platformsQuery.data || [];
  const platformMap = new Map<string, string>();
  platforms.forEach((p: any) => platformMap.set(p.id, p.platform));

  const upcoming = useMemo(() => {
    // One entry per booking — sorted by check-in date
    const cutoff = nowTs + 60 * 86400000;
    return bookings
      .filter((b: any) => b.bookingType === "booking" && b.checkIn <= cutoff && b.checkOut >= nowTs - 86400000)
      .map((b: any) => ({ booking: b, platformType: platformMap.get(b.platformId) || "other" }))
      .sort((a: any, z: any) => a.booking.checkIn - z.booking.checkIn);
  }, [bookings, platformMap, nowTs]);

  const today = new Date(); today.setHours(0,0,0,0);
  /** H-01: UTC-safe date formatting to avoid timezone-shift off-by-one errors */
  function utcDateStr(d: Date, opts?: Intl.DateTimeFormatOptions) {
    return d.toLocaleDateString([], { timeZone: "UTC", ...opts });
  }
  function dayLabel(d: Date) {
    const dStr = d.toISOString().slice(0, 10);
    const todayStr = new Date().toISOString().slice(0, 10);
    const tomorrowStr = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const yesterdayStr = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    if (dStr === todayStr) return "Today";
    if (dStr === tomorrowStr) return "Tomorrow";
    if (dStr === yesterdayStr) return "Yesterday";
    return utcDateStr(d, { weekday: "short", month: "short", day: "numeric" });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Upcoming (60 days)</p>
        <div className="flex items-center gap-2">
          <Button size="sm" className="h-7 text-xs gap-1 bg-violet-600 hover:bg-violet-500 text-white"
            onClick={() => setAddBookingOpen(true)}>
            <CalendarPlus className="h-3 w-3" />
            Add Booking
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1"
            onClick={() => syncMutation.mutate({ propertyId: property.id })}
            disabled={syncMutation.isPending}>
            <RefreshCw className={`h-3 w-3 ${syncMutation.isPending ? "animate-spin" : ""}`} />
            Sync
          </Button>
        </div>
      </div>

      {bookingsQuery.isLoading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-12 bg-muted/30 rounded animate-pulse" />)}</div>
      ) : upcoming.length === 0 ? (
        <div className="text-center py-8">
          <Calendar className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No upcoming bookings</p>
          <p className="text-xs text-muted-foreground mt-1">Add platform feeds and sync to see bookings here</p>
        </div>
      ) : (
        <>
        {/* ── Gantt Timeline ── */}
        <BookingGantt
          upcoming={upcoming}
          allBookings={bookings}
          platformMap={platformMap}
          nowTs={nowTs}
          onSelectBooking={(id: string) => setExpandedId(id)}
        />
        <div className="flex flex-col gap-2">
          {upcoming.map((item: any, idx: number) => {
            const b = item.booking;
            const pColor = getPlatformColor(item.platformType);
            const pLabel = getPlatformLabel(item.platformType);
            const cinDate = new Date(b.checkIn);
            const coutDate = new Date(b.checkOut);
            const nights = Math.round((b.checkOut - b.checkIn) / 86400000);
            return (
              <div
                key={idx}
                className="rounded-lg border px-3 py-2.5 flex flex-col gap-1.5 cursor-pointer hover:border-border/80 transition-colors"
                onClick={() => setExpandedId(expandedId === b.id ? null : b.id)}
              >
                {/* Header row: platform label + enrichment badge + source badge */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                    <p className="text-sm font-semibold truncate">{b.guestName || b.summary || pLabel}</p>
                    {b.guestName ? (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-teal-500/15 text-teal-400 border border-teal-500/20 shrink-0">✓ enriched</span>
                    ) : (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20 shrink-0">awaiting data</span>
                    )}
                    {/* P-31: data source badge */}
                    {b.dataSource === 'email_only' && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-violet-500/15 text-violet-400 border border-violet-500/20 shrink-0">email only</span>
                    )}
                    {b.dataSource === 'ical_only' && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/20 shrink-0">iCal only</span>
                    )}
                    {b.dataSource === 'both' && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-teal-500/10 text-teal-500 border border-teal-500/15 shrink-0">⊙ iCal + email</span>
                    )}
                  </div>
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0" style={{ backgroundColor: pColor + "22", color: pColor }}>
                    {pLabel}
                  </span>
                </div>
                {/* Check-in / Check-out row */}
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <GeeveNode status="checkin" size={14} color={pColor} />
                    <div>
                      <p className="text-[10px] text-muted-foreground">Check-in</p>
                      <p className="text-xs font-semibold" style={{ color: pColor }}>{dayLabel(cinDate)}</p>
                      <p className="text-[10px] text-muted-foreground">{utcDateStr(cinDate, { month: "short", day: "numeric" })}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-center gap-0.5 shrink-0">
                    <div className="h-px w-8 bg-border" />
                    <span className="text-[9px] text-muted-foreground">{nights}n</span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-1 min-w-0 justify-end">
                    <div className="text-right">
                      <p className="text-[10px] text-muted-foreground">Check-out</p>
                      <p className="text-xs font-semibold">{dayLabel(coutDate)}</p>
                      <p className="text-[10px] text-muted-foreground">{utcDateStr(coutDate, { month: "short", day: "numeric" })}</p>
                    </div>
                    <GeeveNode status="checkout" size={14} color={pColor} />
                  </div>
                </div>

                {/* Expanded enriched details */}
                {expandedId === b.id && (
                  <div className="mt-1 pt-2 border-t border-border/40 space-y-2">

                    {editingBookingId === b.id ? (
                      /* ── Edit form ── */
                      <div className="space-y-2" onClick={e => e.stopPropagation()}>
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Edit Booking Details</p>
                        <div className="grid grid-cols-2 gap-1.5">
                          <div>
                            <label className="text-[9px] text-muted-foreground uppercase tracking-wider">Guest Name</label>
                            <input className="w-full text-xs bg-muted/40 border border-border/50 rounded px-1.5 py-0.5 mt-0.5" value={editForm.guestName} onChange={e => setEditForm(f => ({ ...f, guestName: e.target.value }))} placeholder="Guest name" />
                          </div>
                          <div>
                            <label className="text-[9px] text-muted-foreground uppercase tracking-wider">Guests</label>
                            <input type="number" min="1" className="w-full text-xs bg-muted/40 border border-border/50 rounded px-1.5 py-0.5 mt-0.5" value={editForm.guestCount} onChange={e => setEditForm(f => ({ ...f, guestCount: e.target.value }))} placeholder="1" />
                          </div>
                          <div>
                            <label className="text-[9px] text-muted-foreground uppercase tracking-wider">Guest Email</label>
                            <input type="email" className="w-full text-xs bg-muted/40 border border-border/50 rounded px-1.5 py-0.5 mt-0.5" value={editForm.guestEmail} onChange={e => setEditForm(f => ({ ...f, guestEmail: e.target.value }))} placeholder="email@example.com" />
                          </div>
                          <div>
                            <label className="text-[9px] text-muted-foreground uppercase tracking-wider">Guest Phone</label>
                            <input className="w-full text-xs bg-muted/40 border border-border/50 rounded px-1.5 py-0.5 mt-0.5" value={editForm.guestPhone} onChange={e => setEditForm(f => ({ ...f, guestPhone: e.target.value }))} placeholder="+1 555 000 0000" />
                          </div>
                          <div>
                            <label className="text-[9px] text-muted-foreground uppercase tracking-wider">Total Price</label>
                            <input type="number" min="0" step="0.01" className="w-full text-xs bg-muted/40 border border-border/50 rounded px-1.5 py-0.5 mt-0.5" value={editForm.totalPrice} onChange={e => setEditForm(f => ({ ...f, totalPrice: e.target.value }))} placeholder="0.00" />
                          </div>
                          <div>
                            <label className="text-[9px] text-muted-foreground uppercase tracking-wider">Cleaning Fee</label>
                            <input type="number" min="0" step="0.01" className="w-full text-xs bg-muted/40 border border-border/50 rounded px-1.5 py-0.5 mt-0.5" value={editForm.cleaningFee} onChange={e => setEditForm(f => ({ ...f, cleaningFee: e.target.value }))} placeholder="0.00" />
                          </div>
                          <div>
                            <label className="text-[9px] text-muted-foreground uppercase tracking-wider">Platform Fee</label>
                            <input type="number" min="0" step="0.01" className="w-full text-xs bg-muted/40 border border-border/50 rounded px-1.5 py-0.5 mt-0.5" value={editForm.commissionAmount} onChange={e => setEditForm(f => ({ ...f, commissionAmount: e.target.value }))} placeholder="0.00" />
                          </div>
                          <div>
                            <label className="text-[9px] text-muted-foreground uppercase tracking-wider">Net Payout</label>
                            <input type="number" min="0" step="0.01" className="w-full text-xs bg-muted/40 border border-border/50 rounded px-1.5 py-0.5 mt-0.5" value={editForm.netAmount} onChange={e => setEditForm(f => ({ ...f, netAmount: e.target.value }))} placeholder="0.00" />
                          </div>
                          <div>
                            <label className="text-[9px] text-muted-foreground uppercase tracking-wider">Currency</label>
                            <input className="w-full text-xs bg-muted/40 border border-border/50 rounded px-1.5 py-0.5 mt-0.5" value={editForm.currency} onChange={e => setEditForm(f => ({ ...f, currency: e.target.value.toUpperCase().slice(0,3) }))} placeholder="USD" maxLength={3} />
                          </div>
                          <div>
                            <label className="text-[9px] text-muted-foreground uppercase tracking-wider">Confirmation #</label>
                            <input className="w-full text-xs bg-muted/40 border border-border/50 rounded px-1.5 py-0.5 mt-0.5" value={editForm.confirmationNumber} onChange={e => setEditForm(f => ({ ...f, confirmationNumber: e.target.value }))} placeholder="ABC123" />
                          </div>
                        </div>
                        <div>
                          <label className="text-[9px] text-muted-foreground uppercase tracking-wider">Platform Booking URL</label>
                          <input className="w-full text-xs bg-muted/40 border border-border/50 rounded px-1.5 py-0.5 mt-0.5" value={editForm.platformBookingUrl} onChange={e => setEditForm(f => ({ ...f, platformBookingUrl: e.target.value }))} placeholder="https://..." />
                        </div>
                        <div className="flex gap-1.5 pt-0.5">
                          <Button size="sm" className="h-6 text-[10px] px-2 bg-teal-600 hover:bg-teal-500 text-white" onClick={saveEdit} disabled={updateFinancialsMutation.isPending}>
                            {updateFinancialsMutation.isPending ? "Saving…" : "Save"}
                          </Button>
                          <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={() => setEditingBookingId(null)}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      /* ── View mode ── */
                      <>
                        {/* Guest details */}
                        {(b.guestName || b.guestEmail || b.guestPhone || b.guestCount) && (
                          <div className="space-y-0.5">
                            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Guest</p>
                            {b.guestName && <p className="text-xs">{b.guestName}</p>}
                            {b.guestCount && <p className="text-xs text-muted-foreground">{b.guestCount} guest{b.guestCount !== 1 ? 's' : ''}</p>}
                            {b.guestEmail && (
                              <p className="text-xs text-muted-foreground">
                                <a href={`mailto:${b.guestEmail}`} className="hover:text-foreground" onClick={e => e.stopPropagation()}>{b.guestEmail}</a>
                              </p>
                            )}
                            {b.guestPhone && <p className="text-xs text-muted-foreground">{b.guestPhone}</p>}
                          </div>
                        )}
                        {/* Financials */}
                        {(b.totalPrice || b.netAmount || b.cleaningFee) && (
                          <div className="space-y-0.5">
                            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Financials</p>
                            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                              {b.totalPrice && (
                                <>
                                  <p className="text-[10px] text-muted-foreground">Total</p>
                                  <p className="text-[10px] font-semibold text-right">{b.currency || 'USD'} {Number(b.totalPrice).toFixed(2)}</p>
                                </>
                              )}
                              {b.cleaningFee && (
                                <>
                                  <p className="text-[10px] text-muted-foreground">Cleaning fee</p>
                                  <p className="text-[10px] text-right">{b.currency || 'USD'} {Number(b.cleaningFee).toFixed(2)}</p>
                                </>
                              )}
                              {b.commissionAmount && (
                                <>
                                  <p className="text-[10px] text-muted-foreground">Platform fee</p>
                                  <p className="text-[10px] text-right">{b.currency || 'USD'} {Number(b.commissionAmount).toFixed(2)}</p>
                                </>
                              )}
                              {b.netAmount && (
                                <>
                                  <p className="text-[10px] text-muted-foreground font-semibold">Net payout</p>
                                  <p className="text-[10px] font-semibold text-teal-400 text-right">{b.currency || 'USD'} {Number(b.netAmount).toFixed(2)}</p>
                                </>
                              )}
                            </div>
                          </div>
                        )}
                        {/* Confirmation + platform link */}
                        {(b.confirmationNumber || b.platformBookingUrl) && (
                          <div className="space-y-0.5">
                            {b.confirmationNumber && (
                              <p className="text-[10px] text-muted-foreground">Ref: <span className="text-foreground font-mono">{b.confirmationNumber}</span></p>
                            )}
                            {b.platformBookingUrl && (
                              <a
                                href={b.platformBookingUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[10px] text-violet-400 hover:text-violet-300 flex items-center gap-1"
                                onClick={e => e.stopPropagation()}
                              >
                                <LinkIcon className="h-2.5 w-2.5" />
                                View on {pLabel}
                              </a>
                            )}
                          </div>
                        )}
                        {/* No enrichment yet */}
                        {!b.guestName && !b.totalPrice && !b.confirmationNumber && (
                          <p className="text-[10px] text-muted-foreground italic">
                            No enrichment data yet. Enable email scraping on the platform feed to pull guest and financial details.
                          </p>
                        )}
                        {/* Edit button */}
                        <div className="pt-0.5" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center gap-2 flex-wrap">
                            <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 gap-1" onClick={() => openEdit(b)}>
                              <Pencil className="h-2.5 w-2.5" /> Edit Details
                            </Button>
                            <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 gap-1"
                              onClick={() => {
                                generateInvoiceMutation.mutate({ bookingId: b.id });
                              }}
                              disabled={generateInvoiceMutation.isPending}>
                              <FileText className="h-2.5 w-2.5" /> Invoice
                            </Button>
                            {item.platformType === "direct" && (
                              <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 gap-1 text-destructive hover:text-destructive"
                                onClick={() => {
                                  if (confirm("Cancel this booking? This cannot be undone.")) {
                                    cancelBookingMutation.mutate({ bookingId: b.id });
                                  }
                                }}
                                disabled={cancelBookingMutation.isPending}>
                                <X className="h-2.5 w-2.5" /> Cancel
                              </Button>
                            )}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Conflict warning */}
                {b.hasConflict && (
                  <p className="text-[10px] text-destructive flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> Conflict detected
                  </p>
                )}
              </div>
            );
          })}
        </div>
        </>
      )}
      {/* ── Add Booking Dialog ── */}
      <Dialog open={addBookingOpen} onOpenChange={setAddBookingOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarPlus className="h-4 w-4 text-violet-400" />
              New Direct Booking
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Guest Info */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Guest Information</p>
              <div className="space-y-1.5">
                <Label className="text-xs">Guest Name *</Label>
                <Input className="h-8 text-sm" placeholder="Full name" value={addForm.guestName}
                  onChange={e => setAddForm(f => ({ ...f, guestName: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Email</Label>
                  <Input className="h-8 text-sm" type="email" placeholder="guest@email.com" value={addForm.guestEmail}
                    onChange={e => setAddForm(f => ({ ...f, guestEmail: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Phone</Label>
                  <Input className="h-8 text-sm" type="tel" placeholder="+1 555 000 0000" value={addForm.guestPhone}
                    onChange={e => setAddForm(f => ({ ...f, guestPhone: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Number of Guests</Label>
                <Input className="h-8 text-sm w-32" type="number" min="1" max="20" placeholder="1" value={addForm.guestCount}
                  onChange={e => setAddForm(f => ({ ...f, guestCount: e.target.value }))} />
              </div>
            </div>

            {/* Dates */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Stay Dates</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Check-In *</Label>
                  <Popover open={checkInOpen} onOpenChange={setCheckInOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="h-8 w-full text-sm justify-start font-normal">
                        <Calendar className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                        {addForm.checkIn ? format(addForm.checkIn, "MMM d, yyyy") : "Select date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarPicker
                        mode="single"
                        selected={addForm.checkIn ?? undefined}
                        onSelect={(d) => { setAddForm(f => ({ ...f, checkIn: d ?? null })); setCheckInOpen(false); }}
                        disabled={(d) => d < new Date(new Date().setHours(0,0,0,0))}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Check-Out *</Label>
                  <Popover open={checkOutOpen} onOpenChange={setCheckOutOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="h-8 w-full text-sm justify-start font-normal">
                        <Calendar className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                        {addForm.checkOut ? format(addForm.checkOut, "MMM d, yyyy") : "Select date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarPicker
                        mode="single"
                        selected={addForm.checkOut ?? undefined}
                        onSelect={(d) => { setAddForm(f => ({ ...f, checkOut: d ?? null })); setCheckOutOpen(false); }}
                        disabled={(d) => !addForm.checkIn || d <= addForm.checkIn}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
              {addForm.checkIn && addForm.checkOut && addForm.checkOut > addForm.checkIn && (
                <p className="text-xs text-teal-400">
                  {Math.round((addForm.checkOut.getTime() - addForm.checkIn.getTime()) / 86400000)} night stay
                </p>
              )}
            </div>

            {/* Pricing */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Pricing</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Currency</Label>
                  <Select value={addForm.currency} onValueChange={v => setAddForm(f => ({ ...f, currency: v }))}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="JMD">JMD</SelectItem>
                      <SelectItem value="EUR">EUR</SelectItem>
                      <SelectItem value="GBP">GBP</SelectItem>
                      <SelectItem value="CAD">CAD</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Total Price</Label>
                  <Input className="h-8 text-sm" type="number" min="0" step="0.01" placeholder="0.00" value={addForm.totalPrice}
                    onChange={e => setAddForm(f => ({ ...f, totalPrice: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Cleaning Fee</Label>
                  <Input className="h-8 text-sm" type="number" min="0" step="0.01" placeholder="0.00" value={addForm.cleaningFee}
                    onChange={e => setAddForm(f => ({ ...f, cleaningFee: e.target.value }))} />
                </div>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label className="text-xs">Notes</Label>
              <Textarea className="text-sm min-h-[60px] resize-none" placeholder="Special requests, notes for the guest..." value={addForm.notes}
                onChange={e => setAddForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setAddBookingOpen(false)}>Cancel</Button>
            <Button size="sm" className="bg-violet-600 hover:bg-violet-500 text-white gap-1.5"
              onClick={submitAddBooking}
              disabled={createBookingMutation.isPending}>
              {createBookingMutation.isPending ? (
                <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Creating...</>
              ) : (
                <><CalendarPlus className="h-3.5 w-3.5" /> Create Booking</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Conflict warnings */}
      {bookings.filter((b: any) => b.hasConflict).length > 0 && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3">
          <p className="text-xs font-semibold text-destructive flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            {bookings.filter((b: any) => b.hasConflict).length} booking conflict(s) detected
          </p>
          <p className="text-xs text-muted-foreground mt-1">Two platforms have overlapping bookings. Review your platform feeds.</p>
        </div>
      )}

      {/* ── P-31: Pending Cancellations Queue ── */}
      {pendingForProperty.length > 0 && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 space-y-2">
          <p className="text-xs font-semibold text-amber-400 flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            {pendingForProperty.length} pending cancellation{pendingForProperty.length !== 1 ? 's' : ''} — your confirmation needed
          </p>
          <div className="space-y-2">
            {pendingForProperty.map((p: any) => {
              const cinDate = new Date(p.checkIn);
              const coutDate = new Date(p.checkOut);
              return (
                <div key={p.id} className="rounded border border-amber-500/20 bg-amber-500/5 px-2.5 py-2 flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold truncate">{p.guestName || p.summary || 'Booking'}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {utcDateStr(cinDate, { month: 'short', day: 'numeric' })} → {utcDateStr(coutDate, { month: 'short', day: 'numeric' })}
                      </p>
                      <p className="text-[9px] text-amber-400/80 mt-0.5">
                        Cancellation signalled by: {p.pendingCancellationSource === 'ical' ? 'iCal feed' : p.pendingCancellationSource === 'email' ? 'email confirmation' : p.pendingCancellationSource}
                      </p>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <Button size="sm" className="h-6 text-[10px] px-2 bg-destructive hover:bg-destructive/80 text-white"
                        onClick={() => confirmCancellationMutation.mutate({ bookingId: p.id })}
                        disabled={confirmCancellationMutation.isPending}>
                        Confirm Cancel
                      </Button>
                      <Button size="sm" variant="outline" className="h-6 text-[10px] px-2"
                        onClick={() => dismissCancellationMutation.mutate({ bookingId: p.id })}
                        disabled={dismissCancellationMutation.isPending}>
                        Keep Booking
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── P-31: Cancelled Bookings Section ── */}
      {(cancelledQuery.data || []).length > 0 && (
        <div className="space-y-2">
          <button
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full text-left"
            onClick={() => setShowCancelled(v => !v)}
          >
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted/40 font-mono">{(cancelledQuery.data || []).length}</span>
            Cancelled bookings
            <span className="ml-auto text-[10px]">{showCancelled ? '▲ hide' : '▼ show'}</span>
          </button>
          {showCancelled && (
            <div className="flex flex-col gap-1.5">
              {(cancelledQuery.data || []).map((b: any) => {
                const cinDate = new Date(b.checkIn);
                const coutDate = new Date(b.checkOut);
                const pColor = '#6b7280';
                return (
                  <div key={b.id} className="rounded-lg border border-border/40 bg-muted/10 px-3 py-2 flex items-center justify-between gap-2 opacity-70">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-semibold truncate text-muted-foreground">{b.guestName || b.summary || 'Booking'}</p>
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-destructive/15 text-destructive/80 border border-destructive/20 shrink-0">cancelled</span>
                        {b.dataSource === 'email_only' && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-violet-500/10 text-violet-400/70 border border-violet-500/15 shrink-0">email only</span>}
                        {b.dataSource === 'ical_only' && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400/70 border border-blue-500/15 shrink-0">iCal only</span>}
                        {b.dataSource === 'both' && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-teal-500/10 text-teal-500/70 border border-teal-500/15 shrink-0">⊙ iCal + email</span>}
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        {utcDateStr(cinDate, { month: 'short', day: 'numeric' })} → {utcDateStr(coutDate, { month: 'short', day: 'numeric' })}
                      </p>
                      {b.cancellationSource && (
                        <p className="text-[9px] text-muted-foreground/60">Cancelled by: {b.cancellationSource}</p>
                      )}
                    </div>
                    <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 shrink-0 gap-1"
                      onClick={() => restoreBookingMutation.mutate({ bookingId: b.id })}
                      disabled={restoreBookingMutation.isPending}>
                      <RefreshCw className="h-2.5 w-2.5" /> Restore
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Property Expenses Section (within Financials Tab) ─────────────────────────

function PropertyExpensesSection({ propertyId, fromTs, toTs, fmt }: { propertyId: string; fromTs: number; toTs: number; fmt: (n: number, currency?: string) => string }) {
  const { data: expenseData, isLoading } = trpc.expenseCategorisation.getExpensesByProperty.useQuery(
    { propertyId, fromTs, toTs },
    { staleTime: 5 * 60 * 1000 }
  );

  if (isLoading) return <div className="h-16 bg-muted/30 rounded animate-pulse" />;
  if (!expenseData || expenseData.total === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Receipt className="h-4 w-4 text-red-400" />
          Categorized Expenses
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-red-500/10 rounded-lg p-3">
            <p className="text-[10px] text-muted-foreground uppercase">Total Expenses</p>
            <p className="text-lg font-bold text-red-400">\u2212{fmt(expenseData.total)}</p>
          </div>
          <div className="bg-muted/30 rounded-lg p-3">
            <p className="text-[10px] text-muted-foreground uppercase">Orders</p>
            <p className="text-lg font-bold">{expenseData.count}</p>
          </div>
        </div>
        {expenseData.byCategory && expenseData.byCategory.length > 0 && (
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {expenseData.byCategory.map((cat: any) => (
              <div key={cat.category} className="flex items-center justify-between text-xs p-2 rounded bg-muted/20 hover:bg-muted/40">
                <div className="min-w-0">
                  <p className="font-medium truncate">{cat.category}</p>
                  <p className="text-[10px] text-muted-foreground">{cat.count} order{cat.count !== 1 ? 's' : ''}</p>
                </div>
                <p className="text-sm font-medium text-red-400 shrink-0 ml-2">\u2212{fmt(cat.total)}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Property Financials Tab ────────────────────────────────────────────────────

function PropertyFinancialsTab({ property }: { property: any }) {
  const householdQuery = trpc.household.getMyHousehold.useQuery();
  const householdId = householdQuery.data?.household?.id;
  const [year, setYear] = useState(new Date().getFullYear());
  const fromTs = useMemo(() => new Date(year, 0, 1).getTime(), [year]);
  const toTs = useMemo(() => new Date(year + 1, 0, 1).getTime() - 1, [year]);

  const { data: revData, isLoading } = trpc.properties.getRevenueSummary.useQuery(
    householdId ? { householdId, fromTs, toTs } : undefined as any,
    { enabled: !!householdId, staleTime: 5 * 60 * 1000 }
  );

  const propData = (revData as any)?.properties?.find((p: any) => p.propertyId === property.id);
  const isStr = isSTR(property.type);
  const isLtr = property.type === "rental_ltr";

  const fmt = (n: number, currency = "USD") => new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(n);

  return (
    <div className="space-y-4">
      {/* Year selector */}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setYear(y => y - 1)}>&larr;</Button>
        <span className="text-sm font-semibold">{year}</span>
        <Button variant="outline" size="sm" onClick={() => setYear(y => y + 1)} disabled={year >= new Date().getFullYear()}>&rarr;</Button>
      </div>

      {isLoading && <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-6 bg-muted/30 rounded animate-pulse" />)}</div>}

      {!isLoading && !propData && (
        <div className="text-center py-6">
          <p className="text-sm text-muted-foreground">No financial data for {year}</p>
          <p className="text-xs text-muted-foreground mt-1">Upload a platform export or enable email scraping to populate</p>
        </div>
      )}

      {!isLoading && propData && (
        <>
          {/* STR Financial Summary */}
          {isStr && propData.bookingCount > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-green-500" />
                  Short-Term Rental Income
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-muted/30 rounded-lg p-3">
                    <p className="text-[10px] text-muted-foreground uppercase">Gross Revenue</p>
                    <p className="text-lg font-bold">{fmt(propData.revenue, propData.currency)}</p>
                  </div>
                  <div className="bg-muted/30 rounded-lg p-3">
                    <p className="text-[10px] text-muted-foreground uppercase">Net Payout</p>
                    <p className="text-lg font-bold" style={{ color: "#4FC4A4" }}>{fmt(propData.net, propData.currency)}</p>
                  </div>
                </div>
                <Separator />
                <div className="space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Platform commission</span>
                    <span className="text-red-400">\u2212{fmt(propData.commission, propData.currency)}</span>
                  </div>
                  {propData.taxRemittedByPlatform > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Tax remitted by platform</span>
                      <span className="text-amber-500">\u2212{fmt(propData.taxRemittedByPlatform, propData.currency)}</span>
                    </div>
                  )}
                  {propData.taxOwedByHost > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Tax still owed by host</span>
                      <span className="text-orange-500">{fmt(propData.taxOwedByHost, propData.currency)}</span>
                    </div>
                  )}
                  {propData.taxOwedByHost === 0 && propData.taxRemittedByPlatform > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Additional taxes owed</span>
                      <span className="text-green-500">$0.00</span>
                    </div>
                  )}
                </div>
                <Separator />
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">{propData.bookingCount} bookings</span>
                  {propData.sourceBreakdown && (
                    <div className="flex gap-1">
                      {propData.sourceBreakdown.platform_export > 0 && (
                        <Badge variant="outline" className="text-[9px] h-4 px-1 text-green-500 border-green-500/30">
                          {propData.sourceBreakdown.platform_export} verified
                        </Badge>
                      )}
                      {propData.sourceBreakdown.email_scrape > 0 && (
                        <Badge variant="outline" className="text-[9px] h-4 px-1 text-amber-500 border-amber-500/30">
                          {propData.sourceBreakdown.email_scrape} provisional
                        </Badge>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* LTR Financial Summary */}
          {(isLtr || (propData.ltr && propData.ltr.totalReceived > 0)) && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-blue-500" />
                  Long-Term Rental Income
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-muted/30 rounded-lg p-2 text-center">
                    <p className="text-[9px] text-muted-foreground uppercase">Received</p>
                    <p className="text-sm font-bold text-green-500">{fmt(propData.ltr?.totalReceived || 0)}</p>
                  </div>
                  <div className="bg-muted/30 rounded-lg p-2 text-center">
                    <p className="text-[9px] text-muted-foreground uppercase">Pending</p>
                    <p className="text-sm font-bold text-amber-500">{fmt(propData.ltr?.totalPending || 0)}</p>
                  </div>
                  <div className="bg-muted/30 rounded-lg p-2 text-center">
                    <p className="text-[9px] text-muted-foreground uppercase">Overdue</p>
                    <p className="text-sm font-bold text-red-500">{fmt(propData.ltr?.totalOverdue || 0)}</p>
                  </div>
                </div>
                {property.monthlyRent && (
                  <p className="text-xs text-muted-foreground">Monthly rent: {fmt(parseFloat(property.monthlyRent), property.rentCurrency || "USD")}</p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Per-booking breakdown */}
          {isStr && propData.bookings && propData.bookings.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Booking Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {propData.bookings.map((b: any) => (
                    <div key={b.id} className="flex items-center justify-between text-xs p-2 rounded bg-muted/20 hover:bg-muted/40">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{b.guestName || "Guest"}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {b.platform} \u00b7 {new Date(b.checkIn).toLocaleDateString()} - {new Date(b.checkOut).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="text-right shrink-0 ml-2">
                        <p className="font-semibold">{fmt(b.totalPrice || 0, propData.currency)}</p>
                        <p className="text-[10px] text-muted-foreground">net {fmt(b.netPayout || b.hostPayout || 0, propData.currency)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Categorized Expenses for this property */}
          <PropertyExpensesSection propertyId={property.id} fromTs={fromTs} toTs={toTs} fmt={fmt} />

          {/* Platform links */}
          {property.platforms && property.platforms.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <ExternalLink className="h-4 w-4" />
                  Platform Links
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {property.platforms.map((p: any) => (
                    p.listingUrl && (
                      <a
                        key={p.id}
                        href={p.listingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 hover:underline"
                      >
                        <div className="h-2 w-2 rounded-full" style={{ backgroundColor: getPlatformColor(p.platform) }} />
                        {getPlatformLabel(p.platform)}
                        <ExternalLink className="h-3 w-3 ml-auto" />
                      </a>
                    )
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

// ─── Property Map Tab ──────────────────────────────────────────────────────
function PropertyMapTab({ property }: { property: any }) {
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const [geocodeError, setGeocodeError] = useState<string | null>(null);
  const [geocoding, setGeocoding] = useState(false);

  // Use stored lat/lng if available, otherwise geocode from address
  const hasCoords = property.latitude && property.longitude;
  const [initialCenter] = useState<google.maps.LatLngLiteral>(() => {
    if (hasCoords) {
      return { lat: parseFloat(property.latitude), lng: parseFloat(property.longitude) };
    }
    return { lat: 40.7128, lng: -74.006 }; // Default NYC
  });

  const handleMapReady = (map: google.maps.Map) => {
    mapRef.current = map;

    if (hasCoords) {
      // Already have coordinates — place marker
      const pos = { lat: parseFloat(property.latitude), lng: parseFloat(property.longitude) };
      map.setCenter(pos);
      map.setZoom(15);
      markerRef.current = new google.maps.marker.AdvancedMarkerElement({
        map,
        position: pos,
        title: property.name,
      });
    } else if (property.address) {
      // Geocode from address
      setGeocoding(true);
      const geocoder = new google.maps.Geocoder();
      geocoder.geocode({ address: property.address }, (results, status) => {
        setGeocoding(false);
        if (status === "OK" && results && results[0]) {
          const loc = results[0].geometry.location;
          map.setCenter(loc);
          map.setZoom(15);
          markerRef.current = new google.maps.marker.AdvancedMarkerElement({
            map,
            position: loc,
            title: property.name,
          });
          setGeocodeError(null);
        } else {
          setGeocodeError("Could not find this address on the map");
        }
      });
    } else {
      setGeocodeError("No address set for this property");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Property Location</p>
        {property.address && (
          <p className="text-[11px] text-muted-foreground truncate max-w-[200px]">{property.address}</p>
        )}
      </div>
      {geocoding && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <RefreshCw className="h-3 w-3 animate-spin" />
          Looking up address...
        </div>
      )}
      {geocodeError && (
        <div className="text-xs text-amber-400 bg-amber-400/10 border border-amber-400/30 rounded px-3 py-2">
          {geocodeError}
        </div>
      )}
      <MapView
        className="h-[300px] rounded-lg overflow-hidden border"
        initialCenter={initialCenter}
        initialZoom={hasCoords ? 15 : 4}
        onMapReady={handleMapReady}
      />
    </div>
  );
}

// ─── Property Photos Tab ────────────────────────────────────────────────────
function PropertyPhotosTab({ property }: { property: any }) {
  const householdQuery = trpc.household.getMyHousehold.useQuery();
  const householdId = householdQuery.data?.household?.id;
  const utils = trpc.useUtils();
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const photosQuery = trpc.properties.getPropertyPhotos.useQuery(
    { propertyId: property.id },
    { staleTime: 30_000 }
  );
  const photos = photosQuery.data || [];

  const uploadMutation = trpc.properties.uploadPropertyPhoto.useMutation({
    onSuccess: () => {
      utils.properties.getPropertyPhotos.invalidate({ propertyId: property.id });
      toast.success("Photo uploaded");
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.properties.deletePropertyPhoto.useMutation({
    onSuccess: () => {
      utils.properties.getPropertyPhotos.invalidate({ propertyId: property.id });
      toast.success("Photo deleted");
    },
    onError: (err) => toast.error(err.message),
  });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !householdId) return;
    setUploading(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.type.startsWith("image/")) {
          toast.error(`${file.name} is not an image`);
          continue;
        }
        if (file.size > 8_000_000) {
          toast.error(`${file.name} is too large (max 8 MB)`);
          continue;
        }
        const dataUri = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
        await uploadMutation.mutateAsync({
          propertyId: property.id,
          householdId,
          dataUri,
          sortOrder: photos.length + i,
        });
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-4">
      {/* Upload button */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Property Photos ({photos.length})</p>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? (
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Upload className="h-3.5 w-3.5" />
          )}
          {uploading ? "Uploading..." : "Add Photos"}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          className="hidden"
          onChange={handleFileSelect}
        />
      </div>

      {/* Photo grid */}
      {photos.length === 0 ? (
        <div className="text-center py-8 border border-dashed rounded-lg">
          <Camera className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">No photos yet</p>
          <p className="text-[10px] text-muted-foreground/70 mt-1">Upload photos of your property</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {photos.map((photo: any) => (
            <div key={photo.id} className="relative group rounded-lg overflow-hidden border aspect-square">
              <img
                src={photo.url}
                alt={photo.caption || property.name}
                className="w-full h-full object-cover"
              />
              {photo.caption && (
                <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] px-2 py-1 truncate">
                  {photo.caption}
                </div>
              )}
              <button
                className="absolute top-1 right-1 h-6 w-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                onClick={() => deleteMutation.mutate({ id: photo.id, householdId: householdId! })}
                title="Delete photo"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Property Detail Panel ────────────────────────────────────────────────────
function PropertyDetail({ property, onClose, embedded = false }: { property: any; onClose: () => void; embedded?: boolean }) {
  const isStr = isSTR(property.type);

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="flex-1 bg-black/20" onClick={onClose} />
      <div className="w-full max-w-xl bg-background border-l shadow-xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h2 className="font-semibold text-lg">{property.name}</h2>
            <p className="text-sm text-muted-foreground">
              {PROPERTY_TYPES.find(t => t.value === property.type)?.label}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <Tabs defaultValue={isStr ? "bookings" : "financials"}>
            <TabsList className="w-full flex-wrap">
              {isStr && (
                <TabsTrigger value="bookings" className="flex-1">
                  <Clock className="h-3.5 w-3.5 mr-1.5" />
                  Bookings
                </TabsTrigger>
              )}
              <TabsTrigger value="financials" className="flex-1">
                <DollarSign className="h-3.5 w-3.5 mr-1.5" />
                Financials
              </TabsTrigger>
              <TabsTrigger value="platforms" className="flex-1">
                <LinkIcon className="h-3.5 w-3.5 mr-1.5" />
                Platforms
              </TabsTrigger>
              {isStr && (
                <TabsTrigger value="prep" className="flex-1">
                  <Settings2 className="h-3.5 w-3.5 mr-1.5" />
                  Prep Rules
                </TabsTrigger>
              )}
              {isStr && (
                <TabsTrigger value="blackout" className="flex-1">
                  <Calendar className="h-3.5 w-3.5 mr-1.5" />
                  Blackouts
                </TabsTrigger>
              )}
              <TabsTrigger value="photos" className="flex-1">
                <Camera className="h-3.5 w-3.5 mr-1.5" />
                Photos
              </TabsTrigger>
              <TabsTrigger value="map" className="flex-1">
                <MapPin className="h-3.5 w-3.5 mr-1.5" />
                Map
              </TabsTrigger>
            </TabsList>
            {isStr && (
              <TabsContent value="bookings" className="mt-4">
                <BookingsTab property={property} />
              </TabsContent>
            )}
            <TabsContent value="financials" className="mt-4">
              <PropertyFinancialsTab property={property} />
            </TabsContent>
            <TabsContent value="platforms" className="mt-4">
              <PlatformManager property={property} />
            </TabsContent>
            {isStr && (
              <TabsContent value="prep" className="mt-4">
                <PrepRulesEditor property={property} />
              </TabsContent>
            )}
            {isStr && (
              <TabsContent value="blackout" className="mt-4">
                <BlackoutDates property={property} />
              </TabsContent>
            )}
            <TabsContent value="photos" className="mt-4">
              <PropertyPhotosTab property={property} />
            </TabsContent>
            <TabsContent value="map" className="mt-4">
              <PropertyMapTab property={property} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

// ─── Sortable Property Item (DnD) ─────────────────────────────────────────────

function SortablePropertyItem({ property, isSelected, onSelect, onEdit, onDelete }: {
  property: any;
  isSelected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: property.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };
  const typeLabel = PROPERTY_TYPES.find((t) => t.value === property.type)?.label ?? property.type;

  return (
    <div ref={setNodeRef} style={style} className="mb-1.5">
      <button
        onClick={onSelect}
        className={`w-full text-left rounded-xl p-3 transition-colors ${
          isSelected
            ? "bg-primary/10 border border-primary/30 text-foreground"
            : "hover:bg-muted/60 border border-transparent text-foreground"
        } ${!property.isActive ? "opacity-60" : ""}`}
      >
        <div className="flex items-start justify-between gap-2">
          {/* Drag handle */}
          <div
            {...attributes}
            {...listeners}
            className="mt-1 cursor-grab active:cursor-grabbing flex-shrink-0 text-muted-foreground/50 hover:text-muted-foreground"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1">
              <Building2 className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              <span className="text-sm font-medium truncate">{property.name}</span>
            </div>
            <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded border font-medium ${
              (property.type as string).startsWith("rental_str")
                ? "text-violet-400 bg-violet-400/10 border-violet-400/30"
                : (property.type as string).startsWith("rental_ltr")
                ? "text-sky-400 bg-sky-400/10 border-sky-400/30"
                : (property.type as string) === "primary_residence"
                ? "text-emerald-400 bg-emerald-400/10 border-emerald-400/30"
                : "text-muted-foreground bg-muted/40 border-border"
            }`}>
              {typeLabel}
            </span>
            {property.address && (
              <div className="flex items-start gap-1 mt-1.5 text-[11px] text-muted-foreground">
                <MapPin className="h-3 w-3 mt-0.5 flex-shrink-0" />
                <span className="line-clamp-1">{property.address}</span>
              </div>
            )}
          </div>
          <div className="flex flex-col items-end gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onEdit} title="Edit property">
              <Pencil className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={onDelete} title="Delete property">
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
        {!property.isActive && (
          <span className="mt-1 inline-block text-[10px] text-muted-foreground">Inactive</span>
        )}
      </button>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Properties() {
  const { user } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PropertyForm>(defaultForm);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [detailProperty, setDetailProperty] = useState<any | null>(null);
  const householdQuery = trpc.household.getMyHousehold.useQuery();
  // P-28: Scrape auth warnings are handled centrally in Settings → Integrations.
  // We only show a compact badge count here pointing users there.
  const scrapeAuthWarningsQuery = trpc.properties.getScrapeAuthWarnings.useQuery(
    undefined,
    { staleTime: 60000, refetchInterval: 120000 }
  );
  const scrapeAuthWarningCount = (scrapeAuthWarningsQuery.data || []).length;

  const householdId = householdQuery.data?.household?.id;

  const propertiesQuery = trpc.properties.list.useQuery(
    { householdId: householdId! },
    { enabled: !!householdId }
  );

  const utils = trpc.useUtils();

  const createMutation = trpc.properties.create.useMutation({
    onSuccess: () => {
      utils.properties.list.invalidate();
      toast.success("Property created");
      closeDialog();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = trpc.properties.update.useMutation({
    onSuccess: () => {
      utils.properties.list.invalidate();
      toast.success("Property updated");
      closeDialog();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.properties.delete.useMutation({
    onSuccess: () => {
      utils.properties.list.invalidate();
      toast.success("Property deleted");
      setDeleteConfirmId(null);
    },
    onError: (err) => toast.error(err.message),
  });

  function closeDialog() {
    setDialogOpen(false);
    setEditingId(null);
    setForm(defaultForm);
  }

  function openCreate() {
    setForm(defaultForm);
    setEditingId(null);
    setDialogOpen(true);
  }

  function openEdit(property: any) {
    setForm({
      name: property.name,
      address: property.address || "",
      type: (property.type as PropertyType) || "rental_str",
      propertyEmail: property.propertyEmail || "",
      isActive: property.isActive ?? true,
      country: property.country || "US",
      timezone: property.timezone || "America/New_York",
    });
    setEditingId(property.id);
    setDialogOpen(true);
  }

  function handleSave() {
    if (!form.name.trim()) {
      toast.error("Property name is required");
      return;
    }
    if (!householdId) return;

    if (editingId) {
      updateMutation.mutate({
        id: editingId,
        name: form.name,
        address: form.address || undefined,
        type: form.type,
        propertyEmail: form.propertyEmail || undefined,
        isActive: form.isActive,
        country: form.country || undefined,
        timezone: form.timezone || undefined,
      });
    } else {
      createMutation.mutate({
        householdId,
        name: form.name,
        address: form.address || undefined,
        type: form.type,
        propertyEmail: form.propertyEmail || undefined,
        country: form.country || undefined,
        timezone: form.timezone || undefined,
      });
    }
  }

  const memberId = householdQuery.data?.member?.id;
  const propertyOrderQuery = trpc.properties.getPropertyOrder.useQuery(
    memberId ? { memberId } : undefined as any,
    { enabled: !!memberId, staleTime: 60_000 }
  );
  const savedOrder: string[] = (propertyOrderQuery.data as string[]) || [];
  const updateOrderMutation = trpc.properties.updatePropertyOrder.useMutation({
    onSuccess: () => propertyOrderQuery.refetch(),
  });

  // Sort properties by saved order
  const rawProperties = propertiesQuery.data || [];
  const propertiesList = useMemo(() => {
    if (!savedOrder.length) return rawProperties;
    const orderMap = new Map(savedOrder.map((id, idx) => [id, idx]));
    return [...rawProperties].sort((a: any, b: any) => {
      const aIdx = orderMap.get(a.id) ?? 999;
      const bIdx = orderMap.get(b.id) ?? 999;
      return aIdx - bIdx;
    });
  }, [rawProperties, savedOrder]);

  const isLoading = householdQuery.isLoading || propertiesQuery.isLoading;

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id || !memberId || !householdId) return;
    const oldIndex = propertiesList.findIndex((p: any) => p.id === active.id);
    const newIndex = propertiesList.findIndex((p: any) => p.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const newOrder = arrayMove(propertiesList.map((p: any) => p.id), oldIndex, newIndex);
    updateOrderMutation.mutate({ memberId, householdId, propertyOrder: newOrder });
  }

  if (!householdId && !householdQuery.isLoading) {
    return (
      <div className="p-6">
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">No Household</h2>
          <p className="text-muted-foreground max-w-sm">
            Create or join a household first to manage properties.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="flex-none px-6 pt-6 pb-4 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Properties</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Manage your homes, rentals, and commercial properties.
            </p>
          </div>
          <Button onClick={openCreate} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Add Property
          </Button>
        </div>

        {/* Stats bar */}
        {!isLoading && propertiesList.length > 0 && (
          <div className="flex items-center gap-6 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5" />
              <strong className="text-foreground">{propertiesList.length}</strong>
              {propertiesList.length === 1 ? "property" : "properties"}
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              <strong className="text-foreground">
                {propertiesList.filter((p: any) => p.isActive).length}
              </strong>
              active
            </span>
            <span className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-sky-400" />
              <strong className="text-foreground">
                {propertiesList.filter((p: any) => (p.type as string).startsWith("rental")).length}
              </strong>
              rentals
            </span>
          </div>
        )}

        {/* Integration attention badge */}
        {scrapeAuthWarningCount > 0 && (
          <Link href="/settings?tab=integrations">
            <div className="mt-3 flex items-center gap-3 px-4 py-2.5 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-400 cursor-pointer hover:bg-amber-500/15 transition-colors">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              <span className="text-sm font-medium flex-1">
                {scrapeAuthWarningCount === 1
                  ? "1 integration needs attention"
                  : `${scrapeAuthWarningCount} integrations need attention`}
              </span>
              <span className="text-xs text-amber-400/70">Manage in Settings →</span>
            </div>
          </Link>
        )}
      </div>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="flex-1 p-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader className="pb-3">
                  <div className="h-5 bg-muted rounded w-3/4" />
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="h-4 bg-muted rounded w-full" />
                    <div className="h-4 bg-muted rounded w-1/2" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ) : propertiesList.length === 0 ? (
        <div className="flex-1 flex items-center justify-center p-6">
          <Card className="border-dashed w-full max-w-md">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Building2 className="h-10 w-10 text-muted-foreground mb-3" />
              <h3 className="font-medium mb-1">No properties yet</h3>
              <p className="text-sm text-muted-foreground max-w-sm mb-4">
                Add your primary residence, rental properties, or commercial spaces to keep everything organised.
              </p>
              <Button onClick={openCreate} variant="outline" size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Add Your First Property
              </Button>
            </CardContent>
          </Card>
        </div>
      ) : (
        /* ── Split layout: sidebar + detail ─────────────────────────────── */
        <div className="flex-1 flex overflow-hidden">
          {/* Left sidebar — property selector with drag-and-drop reorder */}
          <div className="w-72 flex-none border-r border-border overflow-y-auto">
            <div className="p-3 space-y-1.5">
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={propertiesList.map((p: any) => p.id)} strategy={verticalListSortingStrategy}>
                  {propertiesList.map((property: any) => (
                    <SortablePropertyItem
                      key={property.id}
                      property={property}
                      isSelected={detailProperty?.id === property.id}
                      onSelect={() => setDetailProperty(property)}
                      onEdit={() => openEdit(property)}
                      onDelete={() => setDeleteConfirmId(property.id)}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            </div>
          </div>

          {/* Right panel — property detail */}
          <div className="flex-1 overflow-y-auto">
            {detailProperty ? (
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold">{detailProperty.name}</h2>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setDetailProperty(null)}
                    title="Close detail"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <PropertyDetail
                  property={detailProperty}
                  onClose={() => setDetailProperty(null)}
                  embedded
                />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center p-8">
                <Building2 className="h-10 w-10 text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">
                  Select a property from the sidebar to view details
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Create/Edit Dialog ────────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Property" : "Add Property"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="propName">Property Name *</Label>
              <Input
                id="propName"
                placeholder="e.g. Main House, Beach Cottage"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="propType">Property Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as PropertyType })}>
                <SelectTrigger id="propType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROPERTY_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="propAddress">Address (optional)</Label>
              <Input
                id="propAddress"
                placeholder="123 Main St, City, State"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="propCountry">Country</Label>
                <Select value={form.country} onValueChange={(v) => setForm({ ...form, country: v })}>
                  <SelectTrigger id="propCountry">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="US">United States</SelectItem>
                    <SelectItem value="JM">Jamaica</SelectItem>
                    <SelectItem value="GB">United Kingdom</SelectItem>
                    <SelectItem value="CA">Canada</SelectItem>
                    <SelectItem value="AU">Australia</SelectItem>
                    <SelectItem value="NG">Nigeria</SelectItem>
                    <SelectItem value="OTHER">Other</SelectItem>
                  </SelectContent>
                </Select>
                {form.country && form.country !== "US" && form.country !== "JM" && (
                  <p className="text-xs text-amber-400/80 mt-1">
                    ⚠ Sunday/Holiday prep rules currently only apply to US and JM properties.
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="propTimezone">Timezone</Label>
                <Select value={form.timezone} onValueChange={(v) => setForm({ ...form, timezone: v })}>
                  <SelectTrigger id="propTimezone">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="America/New_York">Eastern (New York)</SelectItem>
                    <SelectItem value="America/Chicago">Central (Chicago)</SelectItem>
                    <SelectItem value="America/Denver">Mountain (Denver)</SelectItem>
                    <SelectItem value="America/Los_Angeles">Pacific (Los Angeles)</SelectItem>
                    <SelectItem value="America/Jamaica">Jamaica (Kingston)</SelectItem>
                    <SelectItem value="Europe/London">London (GMT)</SelectItem>
                    <SelectItem value="Africa/Lagos">Lagos (WAT)</SelectItem>
                    <SelectItem value="Australia/Sydney">Sydney (AEST)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="propertyEmail">Property Management Email (optional)</Label>
              <Input
                id="propertyEmail"
                type="email"
                placeholder="bookings@yourproperty.com"
                value={form.propertyEmail}
                onChange={(e) => setForm({ ...form, propertyEmail: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Booking confirmation emails sent here will be scanned for guest details and revenue in Phase 2.
              </p>
            </div>
            {editingId && (
              <div className="flex items-center justify-between">
                <Label htmlFor="isActive">Active</Label>
                <Switch
                  id="isActive"
                  checked={form.isActive}
                  onCheckedChange={(checked) => setForm({ ...form, isActive: checked })}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending}>
              {createMutation.isPending || updateMutation.isPending
                ? "Saving..."
                : editingId
                ? "Save Changes"
                : "Add Property"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation ───────────────────────────────────────────── */}
      <Dialog open={!!deleteConfirmId} onOpenChange={(open) => { if (!open) setDeleteConfirmId(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Property</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete this property? This will permanently delete all associated bookings, platforms, prep rules, email scrape jobs, and photos. This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirmId && deleteMutation.mutate({ id: deleteConfirmId })}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
