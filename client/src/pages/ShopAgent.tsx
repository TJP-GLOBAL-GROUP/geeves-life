import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { DashboardLayoutSkeleton } from "@/components/DashboardLayoutSkeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { trpc } from "@/lib/trpc";
import {
  AlertCircle,
  ArrowLeftRight,
  BookOpen,
  Bot,
  CheckCircle2,
  ChevronLeft,
  Clock,
  DollarSign,
  Eye,
  EyeOff,
  KeyRound,
  Link2,
  Loader2,
  MessageSquare,
  Package,
  RefreshCw,
  Search,
  ShoppingCart,
  Sparkles,
  Truck,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useLocation, useParams } from "wouter";

// Status colors and icons
const statusConfig: Record<string, { color: string; icon: typeof CheckCircle2; label: string }> = {
  queued: { color: "bg-zinc-500/20 text-zinc-400", icon: Clock, label: "Queued" },
  searching: { color: "bg-blue-500/20 text-blue-400", icon: Search, label: "Searching" },
  found: { color: "bg-primary/20 text-primary", icon: CheckCircle2, label: "Found" },
  added_to_cart: { color: "bg-primary/20 text-primary", icon: ShoppingCart, label: "In Cart" },
  substituted: { color: "bg-amber-500/20 text-amber-400", icon: ArrowLeftRight, label: "Substituted" },
  unavailable: { color: "bg-red-500/20 text-red-400", icon: XCircle, label: "Unavailable" },
  transferred: { color: "bg-purple-500/20 text-purple-400", icon: ArrowLeftRight, label: "Transferred" },
  rejected: { color: "bg-red-500/20 text-red-400", icon: XCircle, label: "Rejected" },
};

const sessionStatusConfig: Record<string, { color: string; label: string; description: string }> = {
  pending_credentials: {
    color: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    label: "Credentials Needed",
    description: "Add your Walmart or Amazon login credentials so Geeves can shop for you.",
  },
  ready: {
    color: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    label: "Ready to Shop",
    description: "Geeves has prepared your shopping list. Tell Geeves to start shopping when you're ready.",
  },
  preparing: {
    color: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    label: "Preparing",
    description: "Geeves is preparing your items and matching them to platforms.",
  },
  shopping: {
    color: "bg-primary/20 text-primary border-primary/30",
    label: "Shopping in Progress",
    description: "Geeves is actively searching and adding items to your carts right now.",
  },
  awaiting_review: {
    color: "bg-purple-500/20 text-purple-400 border-purple-500/30",
    label: "Review Required",
    description: "Shopping is complete. Review the results and approve or cancel checkout.",
  },
  approved: {
    color: "bg-primary/20 text-primary border-primary/30",
    label: "Approved",
    description: "You approved checkout. Geeves will complete the purchase.",
  },
  completed: {
    color: "bg-primary/20 text-primary border-primary/30",
    label: "Completed",
    description: "Shopping session completed successfully.",
  },
  cancelled: {
    color: "bg-red-500/20 text-red-400 border-red-500/30",
    label: "Cancelled",
    description: "This shopping session was cancelled.",
  },
};

// ─── Item Row ──────────────────────────────────────────────────────
function ItemRow({ item }: { item: any }) {
  const config = statusConfig[item.status] || statusConfig.queued;
  const Icon = config.icon;

  return (
    <div className="flex items-center gap-3 py-3 px-4 rounded-lg bg-zinc-900/50 border border-zinc-800/50 hover:border-zinc-700/50 transition-colors">
      <div className={`flex items-center justify-center w-8 h-8 rounded-full ${config.color}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm text-zinc-200 truncate">{item.name}</span>
          <span className="text-xs text-zinc-500">×{item.quantity}{item.unit ? ` ${item.unit}` : ""}</span>
        </div>
        {item.matchedProductName && item.matchedProductName !== item.name && (
          <p className="text-xs text-zinc-500 mt-0.5 truncate">
            Matched: {item.matchedProductName}
          </p>
        )}
        {item.substitutionReason && (
          <p className="text-xs text-amber-400/80 mt-0.5">
            Substituted: {item.substitutionReason}
          </p>
        )}
        {item.transferReason && (
          <p className="text-xs text-purple-400/80 mt-0.5">
            Transferred: {item.transferReason}
          </p>
        )}
        {item.estimatedDelivery && (
          <p className="text-xs text-zinc-500 mt-0.5 flex items-center gap-1">
            <Truck className="w-3 h-3" /> {item.estimatedDelivery}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {item.matchedPrice && (
          <span className="text-sm font-medium text-primary">${item.matchedPrice}</span>
        )}
        <Badge variant="outline" className={`text-[10px] ${config.color} border-0`}>
          {config.label}
        </Badge>
      </div>
    </div>
  );
}

// ─── Platform Section ──────────────────────────────────────────────
function PlatformSection({ platform, items, total, icon }: { platform: string; items: any[]; total: string; icon: string }) {
  const addedCount = items.filter(i => i.status === "added_to_cart" || i.status === "found").length;
  const subCount = items.filter(i => i.status === "substituted").length;
  const unavailCount = items.filter(i => i.status === "unavailable").length;
  const transferCount = items.filter(i => i.status === "transferred").length;

  return (
    <Card className="bg-zinc-900/60 border-zinc-800">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{icon}</span>
            <div>
              <CardTitle className="text-lg">{platform}</CardTitle>
              <CardDescription>{items.length} items</CardDescription>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xl font-bold text-primary">${total}</p>
            <p className="text-xs text-zinc-500">estimated total</p>
          </div>
        </div>
        {items.length > 0 && (
          <div className="flex gap-2 mt-2 flex-wrap">
            {addedCount > 0 && <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/20">{addedCount} in cart</Badge>}
            {subCount > 0 && <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-400 border-amber-500/20">{subCount} substituted</Badge>}
            {unavailCount > 0 && <Badge variant="outline" className="text-[10px] bg-red-500/10 text-red-400 border-red-500/20">{unavailCount} unavailable</Badge>}
            {transferCount > 0 && <Badge variant="outline" className="text-[10px] bg-purple-500/10 text-purple-400 border-purple-500/20">{transferCount} transferred</Badge>}
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {items.length === 0 ? (
          <p className="text-sm text-zinc-500 text-center py-4">No items assigned to {platform}</p>
        ) : (
          items.map((item: any) => <ItemRow key={item.id} item={item} />)
        )}
      </CardContent>
    </Card>
  );
}

// ─── Notification Log ──────────────────────────────────────────────
function NotificationLog({ notifications }: { notifications: any[] }) {
  if (!notifications || notifications.length === 0) return null;

  const typeColors: Record<string, string> = {
    info: "text-blue-400",
    warning: "text-amber-400",
    error: "text-red-400",
    success: "text-primary",
  };

  return (
    <Card className="bg-zinc-900/60 border-zinc-800">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          Activity Log
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-48">
          <div className="space-y-1.5">
            {notifications.slice().reverse().map((n: any, i: number) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span className="text-zinc-600 shrink-0 w-16">
                  {n.timestamp ? new Date(n.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
                </span>
                <span className={typeColors[n.type] || "text-zinc-400"}>{n.message}</span>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

// ─── Learn From Session Button ────────────────────────────────────
function LearnFromSessionButton({ sessionId }: { sessionId: number }) {
  const [showUrlDialog, setShowUrlDialog] = useState(false);
  const [urlText, setUrlText] = useState("");
  const [itemName, setItemName] = useState("");
  const [learnResults, setLearnResults] = useState<any>(null);

  const learnFromSession = trpc.shopAgent.learnFromSession.useMutation({
    onSuccess: (data) => {
      if (data.learned > 0) {
        toast.success(data.message);
      } else {
        toast.info(data.message);
      }
    },
    onError: (err) => toast.error(err.message),
  });

  const learnFromUrls = trpc.shopAgent.learnFromUrls.useMutation({
    onSuccess: (data) => {
      setLearnResults(data);
      toast.success(data.summary.message);
    },
    onError: (err) => toast.error(err.message),
  });

  const handleLearnFromUrls = () => {
    // Parse pasted URLs — supports multiple formats:
    // 1. One URL per line
    // 2. "Item Name - URL" per line
    // 3. "Item Name: URL" per line
    const lines = urlText.trim().split("\n").filter(l => l.trim());
    const items: Array<{ itemName: string; productUrl: string; productName?: string }> = [];

    for (const line of lines) {
      const trimmed = line.trim();
      // Try "Name - URL" or "Name: URL" format
      const separatorMatch = trimmed.match(/^(.+?)\s*[-:–]\s*(https?:\/\/.+)$/i);
      if (separatorMatch) {
        items.push({ itemName: separatorMatch[1].trim(), productUrl: separatorMatch[2].trim() });
        continue;
      }
      // Try plain URL
      const urlMatch = trimmed.match(/(https?:\/\/[^\s]+)/);
      if (urlMatch) {
        items.push({ itemName: itemName || "Unknown Item", productUrl: urlMatch[1] });
        continue;
      }
    }

    if (items.length === 0) {
      toast.error("No valid URLs found. Paste Walmart or Amazon product URLs.");
      return;
    }

    learnFromUrls.mutate({ items });
  };

  return (
    <>
      <div className="flex items-center justify-center gap-3 mt-4">
        <Button
          variant="outline"
          size="sm"
          className="border-emerald-800/50 text-primary hover:bg-emerald-950/50"
          onClick={() => learnFromSession.mutate({ sessionId })}
          disabled={learnFromSession.isPending}
        >
          {learnFromSession.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          ) : (
            <Sparkles className="w-4 h-4 mr-2" />
          )}
          Auto-Learn Products
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="border-blue-800/50 text-blue-400 hover:bg-blue-950/50"
          onClick={() => setShowUrlDialog(true)}
        >
          <Link2 className="w-4 h-4 mr-2" />
          Paste Product URLs
        </Button>
      </div>

      {learnFromSession.data && (
        <div className="mt-3 p-3 rounded-lg bg-zinc-800/50 border border-zinc-700/50 text-left max-w-md mx-auto">
          <p className="text-sm text-zinc-300 font-medium mb-1">
            <Sparkles className="w-4 h-4 inline mr-1 text-primary" />
            {learnFromSession.data.message}
          </p>
          {learnFromSession.data.newMappings.length > 0 && (
            <ul className="text-xs text-zinc-400 mt-2 space-y-1">
              {learnFromSession.data.newMappings.map((m: any, i: number) => (
                <li key={i} className="flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-primary" />
                  <span className="truncate">{m.itemName}</span>
                  <span className="text-zinc-600">→</span>
                  <span className="truncate text-zinc-500">{m.productName}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Paste URLs Dialog */}
      <Dialog open={showUrlDialog} onOpenChange={setShowUrlDialog}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="w-5 h-5 text-blue-400" />
              Teach Geeves New Products
            </DialogTitle>
            <DialogDescription>
              Paste Walmart or Amazon product URLs from your order confirmation or browser history.
              Geeves will extract the product IDs and remember them for future shopping.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label className="text-sm text-zinc-400">Product URLs</Label>
              <Textarea
                placeholder={`Paste one URL per line, or use "Item Name - URL" format:\n\nEggs - https://www.walmart.com/ip/Great-Value-Large-White-Eggs/945193065\nhttps://www.amazon.com/dp/B07CQ6Q52H`}
                className="mt-1 bg-zinc-800/50 border-zinc-700 min-h-[120px] text-sm font-mono"
                value={urlText}
                onChange={(e) => setUrlText(e.target.value)}
              />
              <p className="text-xs text-zinc-500 mt-1">
                Supports Walmart (/ip/NAME/ID) and Amazon (/dp/ASIN) URLs
              </p>
            </div>

            <div>
              <Label className="text-sm text-zinc-400">Default Item Name (for plain URLs)</Label>
              <Input
                placeholder="e.g., Eggs"
                className="mt-1 bg-zinc-800/50 border-zinc-700"
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
              />
            </div>

            {learnResults && (
              <div className="p-3 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
                <p className="text-sm font-medium text-zinc-300 mb-2">{learnResults.summary.message}</p>
                <div className="space-y-1">
                  {learnResults.results.map((r: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      {r.status === "learned" ? (
                        <CheckCircle2 className="w-3 h-3 text-primary shrink-0" />
                      ) : (
                        <XCircle className="w-3 h-3 text-red-400 shrink-0" />
                      )}
                      <span className="text-zinc-400 truncate">{r.itemName}</span>
                      {r.status === "learned" && (
                        <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/20">
                          {r.platform} · {r.productId}
                        </Badge>
                      )}
                      {r.reason && <span className="text-red-400 text-[10px]">{r.reason}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowUrlDialog(false); setLearnResults(null); setUrlText(""); }}>
              Close
            </Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700"
              onClick={handleLearnFromUrls}
              disabled={learnFromUrls.isPending || !urlText.trim()}
            >
              {learnFromUrls.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <BookOpen className="w-4 h-4 mr-2" />
              )}
              Learn Products
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Credentials Setup Card ────────────────────────────────────────
function CredentialsSetup({ onComplete }: { onComplete: () => void }) {
  const [platform, setPlatform] = useState<"Walmart" | "Amazon">("Walmart");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const upsertCred = trpc.shopAgent.credentials.upsert.useMutation({
    onSuccess: () => {
      toast.success(`${platform} credentials saved securely.`);
      setEmail("");
      setPassword("");
      onComplete();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Card className="bg-gradient-to-br from-amber-950/30 to-zinc-900/60 border-amber-800/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-amber-300">
          <KeyRound className="w-5 h-5" />
          Platform Login Credentials
        </CardTitle>
        <CardDescription>
          Geeves needs your Walmart and/or Amazon login to shop on your behalf.
          Your credentials are stored securely and only used during active shopping sessions.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Button
            variant={platform === "Walmart" ? "default" : "outline"}
            size="sm"
            onClick={() => setPlatform("Walmart")}
            className={platform === "Walmart" ? "bg-blue-600 hover:bg-blue-700" : ""}
          >
            🔵 Walmart
          </Button>
          <Button
            variant={platform === "Amazon" ? "default" : "outline"}
            size="sm"
            onClick={() => setPlatform("Amazon")}
            className={platform === "Amazon" ? "bg-amber-600 hover:bg-amber-700" : ""}
          >
            🟠 Amazon
          </Button>
        </div>

        <div className="space-y-3">
          <div>
            <Label htmlFor="cred-email" className="text-zinc-400 text-xs">Email / Username</Label>
            <Input
              id="cred-email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={`Your ${platform} email`}
              className="bg-zinc-900 border-zinc-700 mt-1"
            />
          </div>
          <div>
            <Label htmlFor="cred-password" className="text-zinc-400 text-xs">Password</Label>
            <div className="relative mt-1">
              <Input
                id="cred-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={`Your ${platform} password`}
                className="bg-zinc-900 border-zinc-700 pr-10"
              />
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </Button>
            </div>
          </div>
        </div>

        <Button
          onClick={() => upsertCred.mutate({
            platform,
            credentialData: { email, password },
          })}
          disabled={!email || !password || upsertCred.isPending}
          className="w-full bg-amber-600 hover:bg-amber-700"
        >
          {upsertCred.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <KeyRound className="w-4 h-4 mr-2" />}
          Save {platform} Credentials
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── One-Click Cart Button ────────────────────────────────────────
function OneClickCartButton({ sessionId, platform, icon, label, color }: {
  sessionId: number; platform: "walmart" | "amazon"; icon: string; label: string; color: string;
}) {
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const generateUrl = trpc.shopAgent.generateCartUrl.useMutation({
    onSuccess: (data) => {
      setResult(data);
      setLoading(false);
    },
    onError: (err) => {
      toast.error(err.message);
      setLoading(false);
    },
  });

  const handleGenerate = () => {
    setLoading(true);
    generateUrl.mutate({ sessionId, platform });
  };

  if (result) {
    return (
      <div className="space-y-3">
        <div className={`rounded-lg border p-4 ${color}`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium flex items-center gap-2">
              {icon} {label}
            </span>
            <Badge variant="outline" className="text-[10px]">
              {result.matchedCount}/{result.totalItems} matched
            </Badge>
          </div>

          {result.matchedCount > 0 && (
            <a
              href={result.cartUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary hover:bg-emerald-700 text-white font-medium text-sm transition-colors w-full justify-center"
            >
              <ShoppingCart className="w-4 h-4" />
              Add {result.matchedCount} Items to {label} Cart
              {result.estimatedTotal !== "0.00" && (
                <span className="text-emerald-200 text-xs">(~${result.estimatedTotal})</span>
              )}
            </a>
          )}

          {result.unmatchedCount > 0 && (
            <div className="mt-3 p-3 rounded bg-amber-950/30 border border-amber-800/30">
              <p className="text-xs text-amber-300 font-medium mb-1">
                {result.unmatchedCount} items need manual search:
              </p>
              <ul className="text-xs text-amber-400/80 space-y-0.5">
                {result.unmatchedItems.map((item: any, i: number) => (
                  <li key={i}>• {item.name} ×{item.quantity}</li>
                ))}
              </ul>
            </div>
          )}

          {result.matchedCount > 0 && (
            <p className="text-[10px] text-zinc-500 mt-2">
              This link opens {label}.com and adds all matched items to your cart instantly. You'll still need to checkout manually.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <Button
      variant="outline"
      className={`w-full ${color} h-12`}
      onClick={handleGenerate}
      disabled={loading}
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin mr-2" />
      ) : (
        <span className="mr-2">{icon}</span>
      )}
      {loading ? "Matching products..." : `One-Click ${label} Cart`}
    </Button>
  );
}

// ─── Ready State Banner ────────────────────────────────────────────
function ReadyStateBanner({ session, onCancel }: { session: any; onCancel: () => void }) {
  return (
    <Card className="bg-gradient-to-br from-blue-950/40 to-zinc-900/60 border-blue-800/40">
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0">
            <Bot className="w-6 h-6 text-blue-400" />
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-blue-300">Geeves is Ready to Shop</h3>
            <p className="text-sm text-zinc-400 leading-relaxed">
              Your shopping list has been prepared with <strong className="text-zinc-200">{session.totalItems} items</strong> assigned
              to Walmart and Amazon based on your purchase history.
            </p>
          </div>
        </div>

        {/* One-Click Add To Cart */}
        <div className="bg-zinc-900/80 rounded-lg p-4 border border-zinc-800 space-y-3">
          <h4 className="text-sm font-medium text-zinc-300 flex items-center gap-2">
            <ShoppingCart className="w-4 h-4 text-primary" />
            One-Click Add to Cart
          </h4>
          <p className="text-xs text-zinc-500">
            Geeves matches your items to products you've bought before. Click to add all matched items to your cart instantly — no browsing required.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {(session.platforms?.walmart?.count || 0) > 0 && (
              <OneClickCartButton
                sessionId={session.id}
                platform="walmart"
                icon="🔵"
                label="Walmart"
                color="border-blue-800/30 bg-blue-950/20"
              />
            )}
            {(session.platforms?.amazon?.count || 0) > 0 && (
              <OneClickCartButton
                sessionId={session.id}
                platform="amazon"
                icon="🟠"
                label="Amazon"
                color="border-amber-800/30 bg-amber-950/20"
              />
            )}
          </div>
        </div>

        {/* Manual shopping instructions */}
        <div className="bg-zinc-900/80 rounded-lg p-4 border border-zinc-800">
          <h4 className="text-sm font-medium text-zinc-300 mb-2 flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-primary" />
            Or Ask Geeves to Shop Manually
          </h4>
          <p className="text-xs text-zinc-400">
            For items that aren't matched, or if you prefer Geeves to handle everything, tell Geeves in chat:
            <span className="text-primary font-medium"> "Go shop session #{session.id}"</span>.
            Geeves will search each item individually and add them to your cart.
          </p>
        </div>

        <Separator className="bg-zinc-800" />

        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            className="border-red-800/50 text-red-400 hover:bg-red-950/50"
            onClick={onCancel}
          >
            <XCircle className="w-4 h-4 mr-2" />
            Cancel Session
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Pending Credentials Banner ────────────────────────────────────
function PendingCredentialsBanner({ session, onCredentialsSaved }: { session: any; onCredentialsSaved: () => void }) {
  return (
    <div className="space-y-4">
      <Card className="bg-gradient-to-br from-amber-950/30 to-zinc-900/60 border-amber-800/40">
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
              <KeyRound className="w-6 h-6 text-amber-400" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-semibold text-amber-300">Credentials Needed</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Your shopping list has <strong className="text-zinc-200">{session.totalItems} items</strong> ready to go,
                but Geeves needs your Walmart or Amazon login credentials to shop on your behalf.
                Add at least one platform's credentials below to continue.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
      <CredentialsSetup onComplete={onCredentialsSaved} />
    </div>
  );
}

// ─── Preparing State Banner ──────────────────────────────────────────
function PreparingBanner({ onCancel }: { onCancel: () => void }) {
  return (
    <Card className="bg-zinc-900/60 border-zinc-800">
      <CardContent className="pt-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-zinc-400 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
            Preparing Your Shopping Session
          </span>
        </div>
        <p className="text-xs text-zinc-500 mt-2">
          Geeves is matching your items to platforms and preparing the session. This should only take a moment.
        </p>
        <Separator className="bg-zinc-800 my-3" />
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            className="border-red-800/50 text-red-400 hover:bg-red-950/50"
            onClick={onCancel}
          >
            <XCircle className="w-4 h-4 mr-2" />
            Cancel Session
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Session Detail ────────────────────────────────────────────────
function SessionDetail({ sessionId }: { sessionId: number }) {
  const [, navigate] = useLocation();
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);

  const { data: session, isLoading, refetch } = trpc.shopAgent.getSession.useQuery(
    { sessionId },
    {
      // Only poll frequently when actively shopping
      refetchInterval: (query) => {
        const status = query.state.data?.status;
        if (status === "shopping" || status === "preparing") return 3000;
        return false; // Don't auto-poll for static states
      },
    }
  );

  const approveMut = trpc.shopAgent.approve.useMutation({
    onSuccess: () => {
      toast.success("Shopping session approved! Geeves will proceed with checkout.");
      setShowApproveDialog(false);
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const cancelMut = trpc.shopAgent.cancel.useMutation({
    onSuccess: () => {
      toast.success("Shopping session cancelled.");
      setShowCancelDialog(false);
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateSessionMut = trpc.shopAgent.updateSession.useMutation({
    onSuccess: () => refetch(),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="text-center py-12">
        <p className="text-zinc-400">Session not found</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/shop-agent")}>
          <ChevronLeft className="w-4 h-4 mr-2" /> Back to Sessions
        </Button>
      </div>
    );
  }

  const statusCfg = sessionStatusConfig[session.status] || sessionStatusConfig.ready;
  const totalItems = session.items?.length || 0;
  const completedItems = session.items?.filter((i: any) =>
    ["found", "added_to_cart", "substituted"].includes(i.status)
  ).length || 0;
  const progress = totalItems > 0 ? (completedItems / totalItems) * 100 : 0;

  const handleCredentialsSaved = () => {
    // Upgrade session from pending_credentials to ready
    if (session.status === "pending_credentials") {
      updateSessionMut.mutate({ sessionId, status: "ready" });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/shop-agent")}>
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-zinc-100">{session.listName}</h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge className={`${statusCfg.color} border text-xs`}>{statusCfg.label}</Badge>
              <span className="text-xs text-zinc-500">
                Session #{session.id} · {new Date(session.createdAt).toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" onClick={() => refetch()}>
                <RefreshCw className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Refresh</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Status-specific banners */}
      {session.status === "pending_credentials" && (
        <>
          <PendingCredentialsBanner session={session} onCredentialsSaved={handleCredentialsSaved} />
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              className="border-red-800/50 text-red-400 hover:bg-red-950/50"
              onClick={() => setShowCancelDialog(true)}
            >
              <XCircle className="w-4 h-4 mr-2" />
              Cancel Session
            </Button>
          </div>
        </>
      )}

      {session.status === "ready" && (
        <ReadyStateBanner
          session={session}
          onCancel={() => setShowCancelDialog(true)}
        />
      )}

      {session.status === "preparing" && (
        <PreparingBanner onCancel={() => setShowCancelDialog(true)} />
      )}

      {/* Progress Bar — only show during active shopping */}
      {session.status === "shopping" && (
        <Card className="bg-zinc-900/60 border-zinc-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-zinc-400 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                Geeves is Shopping
              </span>
              <span className="text-sm font-medium text-primary">{completedItems}/{totalItems} items</span>
            </div>
            <Progress value={progress} className="h-2" />
            <p className="text-xs text-zinc-500 mt-2">
              Geeves is actively logged into your accounts, searching for each item, and adding them to your carts.
              This page updates automatically every few seconds.
            </p>
            <Separator className="bg-zinc-800 my-3" />
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                className="border-red-800/50 text-red-400 hover:bg-red-950/50"
                onClick={() => setShowCancelDialog(true)}
              >
                <XCircle className="w-4 h-4 mr-2" />
                Cancel Session
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary Cards — show for all states except pending_credentials */}
      {session.status !== "pending_credentials" && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="bg-zinc-900/60 border-zinc-800">
            <CardContent className="pt-4 pb-4 text-center">
              <Package className="w-5 h-5 mx-auto text-zinc-400 mb-1" />
              <p className="text-2xl font-bold text-zinc-100">{totalItems}</p>
              <p className="text-xs text-zinc-500">Total Items</p>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900/60 border-zinc-800">
            <CardContent className="pt-4 pb-4 text-center">
              <ShoppingCart className="w-5 h-5 mx-auto text-primary mb-1" />
              <p className="text-2xl font-bold text-primary">{completedItems}</p>
              <p className="text-xs text-zinc-500">In Cart</p>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900/60 border-zinc-800">
            <CardContent className="pt-4 pb-4 text-center">
              <ArrowLeftRight className="w-5 h-5 mx-auto text-amber-400 mb-1" />
              <p className="text-2xl font-bold text-amber-400">
                {session.items?.filter((i: any) => i.status === "substituted").length || 0}
              </p>
              <p className="text-xs text-zinc-500">Substituted</p>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900/60 border-zinc-800">
            <CardContent className="pt-4 pb-4 text-center">
              <DollarSign className="w-5 h-5 mx-auto text-primary mb-1" />
              <p className="text-2xl font-bold text-primary">${session.overallTotal || "0.00"}</p>
              <p className="text-xs text-zinc-500">Est. Total</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Platform Tabs — show for all states except pending_credentials */}
      {session.status !== "pending_credentials" && (
        <Tabs defaultValue="walmart" className="w-full">
          <TabsList className="bg-zinc-900 border border-zinc-800 w-full">
            <TabsTrigger value="walmart" className="flex-1 data-[state=active]:bg-blue-600/20 data-[state=active]:text-blue-300">
              Walmart ({session.platforms?.walmart?.count || 0})
            </TabsTrigger>
            <TabsTrigger value="amazon" className="flex-1 data-[state=active]:bg-amber-600/20 data-[state=active]:text-amber-300">
              Amazon ({session.platforms?.amazon?.count || 0})
            </TabsTrigger>
            <TabsTrigger value="log" className="flex-1 data-[state=active]:bg-zinc-600/20 data-[state=active]:text-zinc-300">
              Log
            </TabsTrigger>
          </TabsList>

          <TabsContent value="walmart" className="mt-4">
            <PlatformSection
              platform="Walmart"
              items={session.platforms?.walmart?.items || []}
              total={session.platforms?.walmart?.total || "0.00"}
              icon="🔵"
            />
          </TabsContent>

          <TabsContent value="amazon" className="mt-4">
            <PlatformSection
              platform="Amazon"
              items={session.platforms?.amazon?.items || []}
              total={session.platforms?.amazon?.total || "0.00"}
              icon="🟠"
            />
          </TabsContent>

          <TabsContent value="log" className="mt-4">
            <NotificationLog notifications={session.notifications as any[] || []} />
          </TabsContent>
        </Tabs>
      )}

      {/* Final Report (when awaiting review) */}
      {session.status === "awaiting_review" && (
        <Card className="bg-gradient-to-br from-emerald-950/40 to-zinc-900/60 border-emerald-800/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-emerald-300">
              <CheckCircle2 className="w-5 h-5" />
              Shopping Complete — Review Your Order
            </CardTitle>
            <CardDescription>
              Geeves has finished shopping your list. Review the items below and approve or cancel.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Separator className="bg-zinc-800" />

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-zinc-500 uppercase tracking-wide">Walmart Total</p>
                <p className="text-xl font-bold text-blue-400">${session.walmartTotal || "0.00"}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500 uppercase tracking-wide">Amazon Total</p>
                <p className="text-xl font-bold text-amber-400">${session.amazonTotal || "0.00"}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500 uppercase tracking-wide">Overall Total</p>
                <p className="text-xl font-bold text-primary">${session.overallTotal || "0.00"}</p>
              </div>
            </div>

            {(session.deliveryInfo as any) && (
              <>
                <Separator className="bg-zinc-800" />
                <div>
                  <p className="text-xs text-zinc-500 uppercase tracking-wide mb-2">Delivery Information</p>
                  {typeof session.deliveryInfo === "object" && (
                    <div className="space-y-1.5">
                      {(session.deliveryInfo as any).walmart && (
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-blue-400">🔵 Walmart:</span>
                          <span className="text-zinc-300">{(session.deliveryInfo as any).walmart}</span>
                        </div>
                      )}
                      {(session.deliveryInfo as any).amazon && (
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-amber-400">🟠 Amazon:</span>
                          <span className="text-zinc-300">{(session.deliveryInfo as any).amazon}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}

            <Separator className="bg-zinc-800" />

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
              <div>
                <p className="text-lg font-bold text-primary">{session.itemsFound || 0}</p>
                <p className="text-xs text-zinc-500">Found</p>
              </div>
              <div>
                <p className="text-lg font-bold text-amber-400">{session.itemsSubstituted || 0}</p>
                <p className="text-xs text-zinc-500">Substituted</p>
              </div>
              <div>
                <p className="text-lg font-bold text-red-400">{session.itemsUnavailable || 0}</p>
                <p className="text-xs text-zinc-500">Unavailable</p>
              </div>
              <div>
                <p className="text-lg font-bold text-purple-400">{session.itemsCrossTransferred || 0}</p>
                <p className="text-xs text-zinc-500">Transferred</p>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                className="flex-1 bg-primary hover:bg-emerald-700 text-white"
                onClick={() => setShowApproveDialog(true)}
              >
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Approve & Checkout
              </Button>
              <Button
                variant="outline"
                className="flex-1 border-red-800 text-red-400 hover:bg-red-950/50"
                onClick={() => setShowCancelDialog(true)}
              >
                <XCircle className="w-4 h-4 mr-2" />
                Cancel Order
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Cancelled state */}
      {session.status === "cancelled" && (
        <Card className="bg-zinc-900/60 border-red-800/30">
          <CardContent className="py-8 text-center">
            <XCircle className="w-10 h-10 mx-auto text-red-400/60 mb-3" />
            <h3 className="text-lg font-medium text-zinc-300 mb-1">Session Cancelled</h3>
            <p className="text-sm text-zinc-500">
              This shopping session was cancelled. Items in your carts may still be there — check Walmart/Amazon directly.
            </p>
            <Button variant="outline" className="mt-4" onClick={() => navigate("/shop-agent")}>
              Back to Sessions
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Completed state */}
      {(session.status === "approved" || session.status === "completed") && (
        <Card className="bg-zinc-900/60 border-emerald-800/30">
          <CardContent className="py-8 text-center">
            <CheckCircle2 className="w-10 h-10 mx-auto text-primary/60 mb-3" />
            <h3 className="text-lg font-medium text-zinc-300 mb-1">
              {session.status === "approved" ? "Checkout Approved" : "Session Complete"}
            </h3>
            <p className="text-sm text-zinc-500">
              {session.status === "approved"
                ? "Geeves will complete the checkout process. Check your email for order confirmations."
                : "This shopping session has been completed successfully."}
            </p>
            <LearnFromSessionButton sessionId={sessionId} />
          </CardContent>
        </Card>
      )}

      {/* Approve Dialog */}
      <Dialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
        <DialogContent className="bg-zinc-900 border-zinc-800">
          <DialogHeader>
            <DialogTitle>Approve Checkout?</DialogTitle>
            <DialogDescription>
              Geeves will proceed to complete checkout on Walmart (${String(session.walmartTotal || "0.00")}) and Amazon (${String(session.amazonTotal || "0.00")}).
              Total: <span className="text-primary font-bold">${String(session.overallTotal || "0.00")}</span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowApproveDialog(false)}>Cancel</Button>
            <Button
              className="bg-primary hover:bg-emerald-700"
              onClick={() => approveMut.mutate({ sessionId })}
              disabled={approveMut.isPending}
            >
              {approveMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
              Confirm Checkout
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Dialog */}
      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent className="bg-zinc-900 border-zinc-800">
          <DialogHeader>
            <DialogTitle>Cancel Shopping Session?</DialogTitle>
            <DialogDescription>
              This will cancel the session. Any items already added to your Walmart/Amazon carts will remain there.
              You can start a new session from the shopping list anytime.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCancelDialog(false)}>Keep Session</Button>
            <Button
              variant="destructive"
              onClick={() => cancelMut.mutate({ sessionId })}
              disabled={cancelMut.isPending}
            >
              {cancelMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Cancel Session
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Sessions List ─────────────────────────────────────────────────
function SessionsList() {
  const [, navigate] = useLocation();
  const { data: sessions, isLoading } = trpc.shopAgent.listSessions.useQuery();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Shopping Agent</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Geeves shops your lists by logging into Walmart and Amazon on your behalf.
          </p>
        </div>
      </div>

      {/* How it works */}
      <Card className="bg-zinc-900/60 border-zinc-800">
        <CardContent className="pt-5 pb-5">
          <h3 className="text-sm font-medium text-zinc-300 mb-3 flex items-center gap-2">
            <Bot className="w-4 h-4 text-primary" />
            How Geeves Shopping Works
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs text-zinc-400">
            <div className="flex gap-2">
              <span className="text-primary font-bold shrink-0">1.</span>
              <span>Click <strong className="text-zinc-300">"Shop This List"</strong> on any shopping list to create a session</span>
            </div>
            <div className="flex gap-2">
              <span className="text-primary font-bold shrink-0">2.</span>
              <span>Add your Walmart/Amazon credentials if you haven't already</span>
            </div>
            <div className="flex gap-2">
              <span className="text-primary font-bold shrink-0">3.</span>
              <span>Tell Geeves <strong className="text-zinc-300">"Go shop this list"</strong> in the chat to start</span>
            </div>
            <div className="flex gap-2">
              <span className="text-primary font-bold shrink-0">4.</span>
              <span>Review the final report and approve checkout when Geeves is done</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {!sessions || sessions.length === 0 ? (
        <Card className="bg-zinc-900/60 border-zinc-800">
          <CardContent className="py-12 text-center">
            <ShoppingCart className="w-12 h-12 mx-auto text-zinc-600 mb-4" />
            <h3 className="text-lg font-medium text-zinc-300 mb-2">No Shopping Sessions Yet</h3>
            <p className="text-sm text-zinc-500 mb-4">
              Go to any shopping list and click <strong>"Shop This List"</strong> to create your first session.
            </p>
            <Button variant="outline" onClick={() => navigate("/shopping")}>
              <Package className="w-4 h-4 mr-2" /> Go to Shopping Lists
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {sessions.map((session: any) => {
            const statusCfg = sessionStatusConfig[session.status] || sessionStatusConfig.ready;
            return (
              <Card
                key={session.id}
                className="bg-zinc-900/60 border-zinc-800 hover:border-zinc-700 cursor-pointer transition-colors"
                onClick={() => navigate(`/shop-agent/${session.id}`)}
              >
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <ShoppingCart className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-zinc-200">{session.listName}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge className={`${statusCfg.color} border text-[10px]`}>{statusCfg.label}</Badge>
                          <span className="text-xs text-zinc-500">
                            {session.totalItems} items · {new Date(session.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      {session.overallTotal && parseFloat(session.overallTotal) > 0 ? (
                        <p className="text-lg font-bold text-primary">${session.overallTotal}</p>
                      ) : (
                        <p className="text-sm text-zinc-500">—</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────
export default function ShopAgent() {
  const { user, loading } = useAuth();
  const params = useParams<{ id?: string }>();
  const sessionId = params.id ? parseInt(params.id) : null;

  if (loading) return <DashboardLayoutSkeleton />;

  return (
    <DashboardLayout>
      <div className="container max-w-4xl py-8">
        {sessionId ? <SessionDetail sessionId={sessionId} /> : <SessionsList />}
      </div>
    </DashboardLayout>
  );
}
