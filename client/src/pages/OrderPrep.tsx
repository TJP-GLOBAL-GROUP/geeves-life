import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  ShoppingCart, ArrowLeft, ExternalLink, Package, DollarSign,
  CheckCircle2, Loader2, Store, Truck, Clock, Star, AlertCircle,
  ChevronDown, ChevronUp
} from "lucide-react";
import { useLocation, useParams } from "wouter";
import { useState, useMemo } from "react";

type PreparedItem = {
  id: number;
  name: string;
  quantity: number;
  unit: string | null;
  category: string | null;
  notes: string | null;
  estimatedPrice: string | null;
  preferredStore: string | null;
  bestMatch: {
    productName: string;
    platform: string;
    price: string;
    lastOrderDate: string;
    matchScore: number;
  } | null;
  walmartSearchUrl: string;
  amazonSearchUrl: string;
};

type OrderPrepData = {
  listId: number;
  listName: string;
  totalItems: number;
  estimatedTotal: string;
  stores: {
    walmart: { items: PreparedItem[]; cartUrl: string | null; count: number };
    amazon: { items: PreparedItem[]; cartUrl: string | null; count: number };
    other: { items: PreparedItem[]; count: number };
  };
  allItems: PreparedItem[];
};

function MatchScoreBadge({ score }: { score: number }) {
  if (score >= 80) return <Badge className="bg-primary/20 text-primary border-primary/30"><Star className="w-3 h-3 mr-1" />Exact Match</Badge>;
  if (score >= 50) return <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">Good Match</Badge>;
  return <Badge className="bg-zinc-500/20 text-zinc-400 border-zinc-500/30">Partial</Badge>;
}

function StoreSection({
  storeName,
  storeIcon,
  storeColor,
  items,
  cartUrl,
  selectedIds,
  onToggle,
  onToggleAll,
}: {
  storeName: string;
  storeIcon: React.ReactNode;
  storeColor: string;
  items: PreparedItem[];
  cartUrl: string | null;
  selectedIds: Set<number>;
  onToggle: (id: number) => void;
  onToggleAll: (ids: number[], selected: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const allSelected = items.every(i => selectedIds.has(i.id));
  const someSelected = items.some(i => selectedIds.has(i.id));
  const sectionTotal = items.reduce((sum, i) => sum + parseFloat(i.estimatedPrice || "0") * i.quantity, 0);

  if (items.length === 0) return null;

  return (
    <Card className={`border-${storeColor}/20 bg-${storeColor}/5`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg bg-${storeColor}/10`}>
              {storeIcon}
            </div>
            <div>
              <CardTitle className="text-lg">{storeName}</CardTitle>
              <p className="text-sm text-muted-foreground">{items.length} item{items.length !== 1 ? "s" : ""} &middot; Est. ${sectionTotal.toFixed(2)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              checked={allSelected}
              onCheckedChange={(checked) => onToggleAll(items.map(i => i.id), !!checked)}
              className="data-[state=checked]:bg-primary"
            />
            <span className="text-xs text-muted-foreground">All</span>
            <Button variant="ghost" size="icon" onClick={() => setExpanded(!expanded)}>
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="space-y-2">
          {items.map(item => (
            <div key={item.id} className="flex items-start gap-3 p-3 rounded-lg bg-card/50 border border-border/50 hover:border-border transition-colors">
              <Checkbox
                checked={selectedIds.has(item.id)}
                onCheckedChange={() => onToggle(item.id)}
                className="mt-1 data-[state=checked]:bg-primary"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{item.name}</p>
                    <p className="text-sm text-muted-foreground">
                      Qty: {item.quantity}{item.unit ? ` ${item.unit}` : ""}
                      {item.category && <> &middot; {item.category}</>}
                    </p>
                    {item.notes && <p className="text-xs text-muted-foreground mt-0.5">{item.notes}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    {item.estimatedPrice && parseFloat(item.estimatedPrice) > 0 ? (
                      <p className="font-semibold text-primary">${parseFloat(item.estimatedPrice).toFixed(2)}</p>
                    ) : (
                      <p className="text-sm text-muted-foreground">No price</p>
                    )}
                  </div>
                </div>
                {item.bestMatch && (
                  <div className="mt-2 p-2 rounded bg-background/50 border border-border/30">
                    <div className="flex items-center gap-2 mb-1">
                      <MatchScoreBadge score={item.bestMatch.matchScore} />
                      <span className="text-xs text-muted-foreground">from past orders</span>
                    </div>
                    <p className="text-sm">{item.bestMatch.productName}</p>
                    <p className="text-xs text-muted-foreground">
                      Last bought: {new Date(item.bestMatch.lastOrderDate).toLocaleDateString()} &middot; ${parseFloat(item.bestMatch.price).toFixed(2)}
                    </p>
                  </div>
                )}
                <div className="flex gap-2 mt-2">
                  <a href={item.walmartSearchUrl} target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                      <Store className="w-3 h-3" /> Walmart <ExternalLink className="w-3 h-3" />
                    </Button>
                  </a>
                  <a href={item.amazonSearchUrl} target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                      <Package className="w-3 h-3" /> Amazon <ExternalLink className="w-3 h-3" />
                    </Button>
                  </a>
                </div>
              </div>
            </div>
          ))}
          {cartUrl && (
            <div className="pt-2">
              <a href={cartUrl} target="_blank" rel="noopener noreferrer">
                <Button className="w-full gap-2 bg-primary hover:bg-emerald-700">
                  <ShoppingCart className="w-4 h-4" />
                  Search All {items.length} Items on {storeName}
                  <ExternalLink className="w-4 h-4" />
                </Button>
              </a>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

export default function OrderPrep() {
  const { user, loading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const params = useParams<{ id: string }>();
  const listId = parseInt(params.id || "0");

  const [prepData, setPrepData] = useState<OrderPrepData | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [confirmPlatform, setConfirmPlatform] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [orderTotal, setOrderTotal] = useState("");

  const prepareMutation = trpc.orderPrep.prepare.useMutation({
    onSuccess: (data) => {
      setPrepData(data as OrderPrepData);
      // Select all items by default
      setSelectedIds(new Set((data as OrderPrepData).allItems.map(i => i.id)));
      toast.success(`Order prepared: ${data.totalItems} items across ${[data.stores.walmart.count > 0, data.stores.amazon.count > 0, data.stores.other.count > 0].filter(Boolean).length} store(s)`);
    },
    onError: (err) => toast.error(err.message),
  });

  const markPurchasedMutation = trpc.orderPrep.markPurchased.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.markedCount} items marked as purchased!`);
      setShowConfirmDialog(false);
      navigate("/shopping");
    },
    onError: (err) => toast.error(err.message),
  });

  // Auto-prepare on mount
  const [hasPrepared, setHasPrepared] = useState(false);
  if (!hasPrepared && user && listId > 0 && !prepareMutation.isPending) {
    setHasPrepared(true);
    prepareMutation.mutate({ listId });
  }

  const toggleItem = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = (ids: number[], selected: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      ids.forEach(id => selected ? next.add(id) : next.delete(id));
      return next;
    });
  };

  const selectedTotal = useMemo(() => {
    if (!prepData) return "0.00";
    return prepData.allItems
      .filter(i => selectedIds.has(i.id))
      .reduce((sum, i) => sum + parseFloat(i.estimatedPrice || "0") * i.quantity, 0)
      .toFixed(2);
  }, [prepData, selectedIds]);

  const handleConfirmPurchase = (platform: string) => {
    const platformItems = prepData?.allItems.filter(i => selectedIds.has(i.id) && (i.preferredStore === platform || (!i.preferredStore && platform === "Walmart"))) || [];
    if (platformItems.length === 0) {
      toast.error(`No ${platform} items selected`);
      return;
    }
    setConfirmPlatform(platform);
    setShowConfirmDialog(true);
  };

  const handleMarkPurchased = () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    markPurchasedMutation.mutate({
      itemIds: ids,
      platform: confirmPlatform || "Walmart",
      orderNumber: orderNumber || undefined,
      totalAmount: orderTotal || undefined,
    });
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => navigate(`/shopping/${listId}`)}>
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="text-xl font-bold flex items-center gap-2">
                  <ShoppingCart className="w-5 h-5 text-primary" />
                  Order Preparation
                </h1>
                {prepData && (
                  <p className="text-sm text-muted-foreground">{prepData.listName} &middot; {prepData.totalItems} items</p>
                )}
              </div>
            </div>
            {prepData && (
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Selected Total</p>
                  <p className="text-xl font-bold text-primary">${selectedTotal}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="container py-6">
        {/* Loading state */}
        {prepareMutation.isPending && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <Loader2 className="w-12 h-12 animate-spin text-primary" />
            <div className="text-center">
              <h2 className="text-lg font-semibold">Preparing Your Order</h2>
              <p className="text-muted-foreground">Matching items to past purchases and finding best prices...</p>
            </div>
          </div>
        )}

        {/* Prepared data */}
        {prepData && (
          <div className="space-y-6">
            {/* Summary cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card className="bg-card/50">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center gap-3">
                    <Package className="w-8 h-8 text-primary" />
                    <div>
                      <p className="text-2xl font-bold">{prepData.totalItems}</p>
                      <p className="text-xs text-muted-foreground">Total Items</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-card/50">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center gap-3">
                    <DollarSign className="w-8 h-8 text-primary" />
                    <div>
                      <p className="text-2xl font-bold">${prepData.estimatedTotal}</p>
                      <p className="text-xs text-muted-foreground">Estimated Total</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-card/50">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center gap-3">
                    <Store className="w-8 h-8 text-blue-500" />
                    <div>
                      <p className="text-2xl font-bold">{prepData.stores.walmart.count}</p>
                      <p className="text-xs text-muted-foreground">Walmart Items</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-card/50">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center gap-3">
                    <Package className="w-8 h-8 text-amber-500" />
                    <div>
                      <p className="text-2xl font-bold">{prepData.stores.amazon.count}</p>
                      <p className="text-xs text-muted-foreground">Amazon Items</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Workflow steps */}
            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start gap-3">
                  <Truck className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold text-primary">How to Order</p>
                    <ol className="text-sm text-muted-foreground mt-1 space-y-1 list-decimal list-inside">
                      <li>Review items below — each is matched to your past purchases for easy reordering</li>
                      <li>Click <strong>"Search All Items"</strong> to open Walmart/Amazon with your items pre-searched</li>
                      <li>Add items to your cart on the store's website and complete checkout</li>
                      <li>Come back and click <strong>"Mark as Purchased"</strong> to update your list</li>
                    </ol>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Store sections */}
            <StoreSection
              storeName="Walmart"
              storeIcon={<Store className="w-5 h-5 text-blue-500" />}
              storeColor="blue"
              items={prepData.stores.walmart.items}
              cartUrl={prepData.stores.walmart.cartUrl}
              selectedIds={selectedIds}
              onToggle={toggleItem}
              onToggleAll={toggleAll}
            />

            <StoreSection
              storeName="Amazon"
              storeIcon={<Package className="w-5 h-5 text-amber-500" />}
              storeColor="amber"
              items={prepData.stores.amazon.items}
              cartUrl={prepData.stores.amazon.cartUrl}
              selectedIds={selectedIds}
              onToggle={toggleItem}
              onToggleAll={toggleAll}
            />

            {prepData.stores.other.items.length > 0 && (
              <StoreSection
                storeName="Other Stores"
                storeIcon={<Store className="w-5 h-5 text-zinc-400" />}
                storeColor="zinc"
                items={prepData.stores.other.items}
                cartUrl={null}
                selectedIds={selectedIds}
                onToggle={toggleItem}
                onToggleAll={toggleAll}
              />
            )}

            {/* Action bar */}
            <div className="sticky bottom-0 bg-background/95 backdrop-blur-sm border-t border-border/50 -mx-4 px-4 py-4 mt-8">
              <div className="container flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">{selectedIds.size} of {prepData.totalItems} items selected</p>
                  <p className="text-lg font-bold text-primary">${selectedTotal} estimated</p>
                </div>
                <div className="flex gap-2">
                  {prepData.stores.walmart.count > 0 && (
                    <Button
                      onClick={() => handleConfirmPurchase("Walmart")}
                      className="gap-2 bg-blue-600 hover:bg-blue-700"
                      disabled={selectedIds.size === 0}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Mark Walmart Purchased
                    </Button>
                  )}
                  {prepData.stores.amazon.count > 0 && (
                    <Button
                      onClick={() => handleConfirmPurchase("Amazon")}
                      className="gap-2 bg-amber-600 hover:bg-amber-700"
                      disabled={selectedIds.size === 0}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Mark Amazon Purchased
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Error state */}
        {prepareMutation.isError && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <AlertCircle className="w-12 h-12 text-red-500" />
            <div className="text-center">
              <h2 className="text-lg font-semibold">Could Not Prepare Order</h2>
              <p className="text-muted-foreground">{prepareMutation.error.message}</p>
            </div>
            <Button onClick={() => navigate(`/shopping/${listId}`)} variant="outline">
              <ArrowLeft className="w-4 h-4 mr-2" /> Back to List
            </Button>
          </div>
        )}
      </div>

      {/* Confirm Purchase Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm {confirmPlatform} Purchase</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Mark {selectedIds.size} item(s) as purchased from {confirmPlatform}. Optionally add your order details:
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium">Order Number (optional)</label>
                <Input
                  placeholder="e.g., 200-1234567-8901234"
                  value={orderNumber}
                  onChange={(e) => setOrderNumber(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Order Total (optional)</label>
                <Input
                  placeholder="e.g., 45.99"
                  value={orderTotal}
                  onChange={(e) => setOrderTotal(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirmDialog(false)}>Cancel</Button>
            <Button
              onClick={handleMarkPurchased}
              disabled={markPurchasedMutation.isPending}
              className="gap-2 bg-primary hover:bg-emerald-700"
            >
              {markPurchasedMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Confirm Purchase
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
