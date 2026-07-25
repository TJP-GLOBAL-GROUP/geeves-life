import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  MessageSquare,
  Send,
  ShoppingCart,
  Sparkles,
  Clock,
  Tag,
  Package,
  User,
  AlertCircle,
  ExternalLink,
  Zap,
  ChevronDown,
  ChevronUp,
  Search,
  Ruler,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type PastPurchase = {
  platform: string;
  productName: string;
  price: string;
  vendor: string | null;
  orderDate: string;
  matchScore: number;
};

type ParsedItem = {
  name: string;
  brand: string | null;
  quantity: number;
  unit: string | null;
  size: string | null;
  category: string;
  for_person: string | null;
  urgency: string;
  notes: string | null;
  search_keywords: string[];
  pastPurchases: PastPurchase[];
};

const CATEGORY_COLORS: Record<string, string> = {
  groceries: "bg-primary/15 text-primary border-primary/30",
  clothing: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  household: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  electronics: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  personal_care: "bg-pink-500/15 text-pink-400 border-pink-500/30",
  baby: "bg-[#4F7EC4]/15 text-[#4F7EC4] border-[#4F7EC4]/30",
  pets: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  office: "bg-slate-500/15 text-slate-400 border-slate-500/30",
  other: "bg-gray-500/15 text-gray-400 border-gray-500/30",
};

const PLATFORM_STYLES: Record<string, { bg: string; text: string; icon: string }> = {
  Amazon: { bg: "bg-orange-500/15", text: "text-orange-400", icon: "🅰️" },
  Walmart: { bg: "bg-blue-500/15", text: "text-blue-400", icon: "🔵" },
  Target: { bg: "bg-red-500/15", text: "text-red-400", icon: "🎯" },
};

const URGENCY_STYLES: Record<string, string> = {
  now: "bg-red-500/20 text-red-400 border-red-500/30",
  soon: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  whenever: "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

function MatchScoreBar({ score }: { score: number }) {
  const color = score >= 80 ? "bg-primary" : score >= 50 ? "bg-amber-500" : "bg-gray-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-[10px] text-muted-foreground">{score}%</span>
    </div>
  );
}

function PlatformSearchLink({ item }: { item: ParsedItem }) {
  const searchTerm = encodeURIComponent(
    item.brand ? `${item.brand} ${item.name}` : item.name
  );
  return (
    <div className="flex gap-2 mt-2">
      <a
        href={`https://www.amazon.com/s?k=${searchTerm}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 transition-colors"
      >
        <Search className="h-3 w-3" /> Amazon
        <ExternalLink className="h-2.5 w-2.5" />
      </a>
      <a
        href={`https://www.walmart.com/search?q=${searchTerm}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors"
      >
        <Search className="h-3 w-3" /> Walmart
        <ExternalLink className="h-2.5 w-2.5" />
      </a>
    </div>
  );
}

function ParsedItemCard({ item, index }: { item: ParsedItem; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const catColor = CATEGORY_COLORS[item.category] || CATEGORY_COLORS.other;
  const urgColor = URGENCY_STYLES[item.urgency] || URGENCY_STYLES.whenever;
  const hasMatches = item.pastPurchases && item.pastPurchases.length > 0;

  return (
    <Card className="bg-card border-border overflow-hidden">
      <div className="p-4">
        {/* Header Row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-foreground">
                {item.brand && (
                  <span className="text-primary">{item.brand} </span>
                )}
                {item.name}
              </span>
              {item.size && (
                <Badge variant="outline" className="text-[10px] gap-1 border-primary/30 text-primary">
                  <Ruler className="h-2.5 w-2.5" />
                  {item.size}
                </Badge>
              )}
            </div>

            {/* Meta Row */}
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <Badge variant="outline" className={`text-[10px] ${catColor}`}>
                {item.category.replace("_", " ")}
              </Badge>
              <Badge variant="outline" className={`text-[10px] ${urgColor}`}>
                {item.urgency === "now" ? "⚡ Urgent" : item.urgency === "soon" ? "🕐 Soon" : "📋 Whenever"}
              </Badge>
              {item.for_person && (
                <Badge variant="outline" className="text-[10px] gap-1 border-chart-4/30 text-chart-4">
                  <User className="h-2.5 w-2.5" />
                  {item.for_person}
                </Badge>
              )}
            </div>
          </div>

          {/* Quantity */}
          <div className="text-right shrink-0">
            <div className="text-lg font-bold text-foreground">{item.quantity}</div>
            <div className="text-[10px] text-muted-foreground">{item.unit || "ea"}</div>
          </div>
        </div>

        {/* Notes */}
        {item.notes && (
          <p className="text-xs text-muted-foreground mt-2 italic">{item.notes}</p>
        )}

        {/* Search Keywords */}
        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          <Tag className="h-3 w-3 text-muted-foreground shrink-0" />
          {item.search_keywords.map((kw, i) => (
            <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
              {kw}
            </span>
          ))}
        </div>

        {/* Search Links */}
        <PlatformSearchLink item={item} />

        {/* Past Purchase Matches */}
        {hasMatches && (
          <div className="mt-3">
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
            >
              <Package className="h-3.5 w-3.5" />
              {item.pastPurchases.length} past purchase{item.pastPurchases.length > 1 ? "s" : ""} found
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>

            {expanded && (
              <div className="mt-2 space-y-2">
                {item.pastPurchases.map((match, mi) => {
                  const pStyle = PLATFORM_STYLES[match.platform] || { bg: "bg-muted", text: "text-muted-foreground", icon: "📦" };
                  return (
                    <div
                      key={mi}
                      className="flex items-center justify-between p-2.5 rounded-lg border border-border bg-muted/30"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className={`text-sm shrink-0 w-6 h-6 rounded flex items-center justify-center ${pStyle.bg}`}>
                          {pStyle.icon}
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-foreground truncate">{match.productName}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <Badge variant="outline" className={`text-[9px] ${pStyle.bg} ${pStyle.text} border-0`}>
                              {match.platform}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground">
                              {new Date(match.orderDate).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        <p className="text-sm font-semibold text-foreground">${match.price}</p>
                        <MatchScoreBar score={match.matchScore} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {!hasMatches && (
          <div className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <AlertCircle className="h-3 w-3" />
            No past purchases found — check Amazon & Walmart links above
          </div>
        )}
      </div>
    </Card>
  );
}

export default function WhatsAppImport() {
  const utils = trpc.useUtils();
  const { data: imports, isLoading: importsLoading } = trpc.whatsapp.list.useQuery();
  const { data: lists } = trpc.shoppingLists.list.useQuery();
  const parseMessage = trpc.whatsapp.parse.useMutation({
    onSuccess: (data) => {
      utils.whatsapp.list.invalidate();
      utils.shoppingItems.list.invalidate();
      setParsedItems(data.items as ParsedItem[]);
      const matchCount = (data.items as ParsedItem[]).filter(i => i.pastPurchases?.length > 0).length;
      toast.success(
        `Parsed ${data.items.length} items` +
        (matchCount > 0 ? ` — ${matchCount} matched to past orders!` : "")
      );
    },
    onError: () => toast.error("Failed to parse message"),
  });

  const [contactName, setContactName] = useState("");
  const [rawMessage, setRawMessage] = useState("");
  const [targetListId, setTargetListId] = useState("");
  const [parsedItems, setParsedItems] = useState<ParsedItem[]>([]);

  const activeLists = lists?.filter(l => l.status === "active") || [];

  const handleParse = () => {
    if (!rawMessage.trim()) return;
    setParsedItems([]);
    parseMessage.mutate({
      contactName: contactName || undefined,
      rawMessage: rawMessage.trim(),
      targetListId: targetListId && targetListId !== "none" ? parseInt(targetListId) : undefined,
    });
  };

  const totalMatches = parsedItems.reduce((sum, item) => sum + (item.pastPurchases?.length || 0), 0);
  const itemsWithMatches = parsedItems.filter(i => i.pastPurchases?.length > 0).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
          WhatsApp Import
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Paste a WhatsApp message and Geeve's will extract items, identify brands, and find matching past purchases
        </p>
      </div>

      {/* Import Form */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-primary" />
            Smart Message Parser
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Contact Name (optional)</Label>
              <Input
                placeholder="e.g., Marcus, Nana, Partner"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Add to Shopping List (optional)</Label>
              <Select value={targetListId} onValueChange={setTargetListId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a list" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Don't add to list</SelectItem>
                  {activeLists.map(l => (
                    <SelectItem key={l.id} value={l.id.toString()}>{l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>WhatsApp Message</Label>
            <Textarea
              placeholder={`Paste the WhatsApp message here...\n\nExample:\n"Hey can you pick up some Tide pods, 2% milk from Horizon, size 6 Nike sneakers for Marcus, and the Cheerios the kids like. Oh and we need more Pampers size 4 for the baby. Get some scotch bonnet peppers too please 🌶️"`}
              value={rawMessage}
              onChange={(e) => setRawMessage(e.target.value)}
              className="min-h-[150px] text-sm"
            />
          </div>
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Sparkles className="h-3 w-3" />
              AI extracts brands, sizes, quantities & matches to your order history
            </p>
            <Button
              onClick={handleParse}
              disabled={!rawMessage.trim() || parseMessage.isPending}
              className="gap-2"
            >
              {parseMessage.isPending ? (
                <>
                  <Sparkles className="h-4 w-4 animate-pulse" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4" />
                  Parse & Match
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Loading State */}
      {parseMessage.isPending && (
        <Card className="bg-card border-primary/20">
          <CardContent className="py-8">
            <div className="flex flex-col items-center gap-3">
              <div className="relative">
                <Sparkles className="h-8 w-8 text-primary animate-pulse" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">Geeve's is analyzing your message...</p>
                <p className="text-xs text-muted-foreground mt-1">Extracting items, identifying brands, and searching your order history</p>
              </div>
              <div className="flex gap-2 mt-2">
                <Skeleton className="h-6 w-20" />
                <Skeleton className="h-6 w-24" />
                <Skeleton className="h-6 w-16" />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Parsed Results */}
      {parsedItems.length > 0 && (
        <div className="space-y-4">
          {/* Summary Bar */}
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="py-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <Sparkles className="h-5 w-5 text-primary" />
                  <span className="text-sm font-semibold text-foreground">
                    {parsedItems.length} items parsed
                  </span>
                  <Separator orientation="vertical" className="h-4" />
                  <span className="text-sm text-muted-foreground">
                    {itemsWithMatches} matched to past orders
                  </span>
                  <Separator orientation="vertical" className="h-4" />
                  <span className="text-sm text-muted-foreground">
                    {totalMatches} total matches found
                  </span>
                </div>
                {targetListId && targetListId !== "none" && (
                  <Badge variant="secondary" className="text-xs gap-1">
                    <ShoppingCart className="h-3 w-3" />
                    Added to list
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Item Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {parsedItems.map((item, i) => (
              <ParsedItemCard key={i} item={item} index={i} />
            ))}
          </div>
        </div>
      )}

      {/* Import History */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            Import History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {importsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : !imports || imports.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No imports yet</p>
              <p className="text-xs mt-1">Paste a WhatsApp message above to get started</p>
            </div>
          ) : (
            <div className="space-y-3">
              {imports.map((imp) => {
                const items = (imp.parsedItems || []) as ParsedItem[];
                const matchedCount = items.filter(i => i.pastPurchases?.length > 0).length;
                const brands = items.map(i => i.brand).filter(Boolean);
                return (
                  <div key={imp.id} className="p-3 rounded-lg border border-border hover:border-primary/20 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {imp.contactName && (
                          <Badge variant="secondary" className="text-xs">{imp.contactName}</Badge>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {new Date(imp.importedAt).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {matchedCount > 0 && (
                          <Tooltip>
                            <TooltipTrigger>
                              <Badge variant="outline" className="text-[10px] gap-1 border-primary/30 text-primary">
                                <Package className="h-2.5 w-2.5" />
                                {matchedCount} matched
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>Items matched to past orders</TooltipContent>
                          </Tooltip>
                        )}
                        <Badge variant="outline" className="text-[10px]">{items.length} items</Badge>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">{imp.rawMessage}</p>
                    {brands.length > 0 && (
                      <div className="flex gap-1 mt-2 flex-wrap">
                        {Array.from(new Set(brands)).slice(0, 5).map((brand, i) => (
                          <Badge key={i} variant="outline" className="text-[9px] border-primary/20 text-primary/70">
                            {brand}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
