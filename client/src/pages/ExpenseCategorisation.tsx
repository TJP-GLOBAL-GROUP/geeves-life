import { useState, useMemo, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Home, Briefcase, ShoppingCart, User, Globe, Building2,
  ChevronLeft, ChevronRight, Split, Check, SkipForward, X,
  ExternalLink, Store, Truck, Package, MapPin, Receipt, ArrowLeft,
  Pencil, StickyNote, Image as ImageIcon, Download, CreditCard, Link2, FileText
} from "lucide-react";

const VERTICAL_ICONS: Record<string, any> = {
  home: Home, briefcase: Briefcase, "shopping-cart": ShoppingCart,
  user: User, globe: Globe, building: Building2,
};

const ORDER_TYPE_ICONS: Record<string, any> = {
  "Store purchase": Store,
  "Delivery from store": Truck,
  "Curbside pickup": MapPin,
  "Delivery": Package,
  "Third-party delivery": Package,
};

// Inline vendor logos to avoid broken external image URLs
const WalmartSparkLogo = () => (
  <svg viewBox="0 0 32 32" className="w-7 h-7" fill="none">
    <circle cx="16" cy="16" r="16" fill="#0071CE" />
    <g fill="#FFC220">
      <ellipse cx="16" cy="9.5" rx="2" ry="4.5" />
      <ellipse cx="16" cy="22.5" rx="2" ry="4.5" />
      <ellipse cx="9.5" cy="16" rx="4.5" ry="2" />
      <ellipse cx="22.5" cy="16" rx="4.5" ry="2" />
      <ellipse cx="11.4" cy="11.4" rx="2" ry="4.5" transform="rotate(-45 11.4 11.4)" />
      <ellipse cx="20.6" cy="20.6" rx="2" ry="4.5" transform="rotate(-45 20.6 20.6)" />
      <ellipse cx="20.6" cy="11.4" rx="2" ry="4.5" transform="rotate(45 20.6 11.4)" />
      <ellipse cx="11.4" cy="20.6" rx="2" ry="4.5" transform="rotate(45 11.4 20.6)" />
    </g>
  </svg>
);

const AmazonLogo = () => (
  <svg viewBox="0 0 32 32" className="w-7 h-7" fill="none">
    <rect width="32" height="32" rx="6" fill="#232F3E" />
    <path d="M8 18.5c0 0 3.5 3 8 3s8-3 8-3" stroke="#FF9900" strokeWidth="2" strokeLinecap="round" />
    <path d="M22 17.5l2 1.5-0.5-2.5" fill="#FF9900" />
    <text x="16" y="15" textAnchor="middle" fill="white" fontSize="7" fontWeight="bold" fontFamily="Arial">a</text>
  </svg>
);

type SplitItem = {
  id: string; verticalId: string; verticalName: string; chartOfAccountId: string;
  categoryName: string | null; propertyId: string | null; propertyName: string | null;
  splitPercentage: number; splitAmount: number | null;
};

// Separate component to prevent parent re-render from stealing focus
function SplitRow({ split, orderTotal, entryMode, onUpdate, onRemove }: {
  split: SplitItem;
  orderTotal: number;
  entryMode: "percentage" | "dollar";
  onUpdate: (updated: SplitItem) => void;
  onRemove: () => void;
}) {
  const [localPct, setLocalPct] = useState(String(split.splitPercentage));
  const [localAmt, setLocalAmt] = useState(String(split.splitAmount || 0));

  // Sync from parent when split changes externally (e.g. on add)
  useEffect(() => {
    setLocalPct(String(split.splitPercentage));
    setLocalAmt(String(split.splitAmount || 0));
  }, [split.id]);

  function commitPercentage() {
    const pct = parseFloat(localPct) || 0;
    const amt = orderTotal * (pct / 100);
    onUpdate({ ...split, splitPercentage: pct, splitAmount: Math.round(amt * 100) / 100 });
  }

  function commitAmount() {
    const amt = parseFloat(localAmt) || 0;
    const pct = orderTotal > 0 ? (amt / orderTotal) * 100 : 0;
    onUpdate({ ...split, splitAmount: amt, splitPercentage: Math.round(pct * 100) / 100 });
  }

  return (
    <div className="flex items-center gap-2 p-2.5 bg-muted rounded-lg flex-wrap">
      <span className="text-sm flex-1 min-w-0">
        <span className="font-medium">{split.verticalName}</span>: {split.categoryName || "No category"}
        {split.propertyName && <span className="text-muted-foreground"> ({split.propertyName})</span>}
      </span>
      {entryMode === "percentage" ? (
        <>
          <Input
            type="number"
            className="w-20 text-sm"
            value={localPct}
            onChange={(e) => setLocalPct(e.target.value)}
            onBlur={commitPercentage}
            onKeyDown={(e) => { if (e.key === "Enter") commitPercentage(); }}
            min={0}
            max={100}
            step={0.1}
          />
          <span className="text-sm text-muted-foreground">%</span>
          <span className="text-sm font-medium w-20 text-right">
            ${(orderTotal * ((parseFloat(localPct) || 0) / 100)).toFixed(2)}
          </span>
        </>
      ) : (
        <>
          <span className="text-sm text-muted-foreground">$</span>
          <Input
            type="number"
            className="w-24 text-sm"
            value={localAmt}
            onChange={(e) => setLocalAmt(e.target.value)}
            onBlur={commitAmount}
            onKeyDown={(e) => { if (e.key === "Enter") commitAmount(); }}
            min={0}
            step={0.01}
          />
          <span className="text-xs text-muted-foreground">
            ({orderTotal > 0 ? ((parseFloat(localAmt) || 0) / orderTotal * 100).toFixed(1) : 0}%)
          </span>
        </>
      )}
      <Button size="icon" variant="ghost" onClick={onRemove} className="flex-shrink-0">
        <X className="w-4 h-4" />
      </Button>
    </div>
  );
}

export default function ExpenseCategorisation() {
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "categorized" | "split" | "skipped">("pending");
  const [page, setPage] = useState(1);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedVertical, setSelectedVertical] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedCategoryName, setSelectedCategoryName] = useState<string | null>(null);
  const [customCategory, setCustomCategory] = useState("");
  const [selectedProperty, setSelectedProperty] = useState<string | null>(null);
  const [selectedPropertyName, setSelectedPropertyName] = useState<string | null>(null);
  const [selectedBankAccountId, setSelectedBankAccountId] = useState<number | null>(null);
  const [selectedVendorAccountId, setSelectedVendorAccountId] = useState<string | null>(null);
  const [isSplitMode, setIsSplitMode] = useState(false);
  const [mobileView, setMobileView] = useState<"list" | "detail">("list");
  const [memoText, setMemoText] = useState("");
  const [isEditingCategorization, setIsEditingCategorization] = useState(false);
  const [splitEntryMode, setSplitEntryMode] = useState<"percentage" | "dollar">("percentage");
  const [splits, setSplits] = useState<SplitItem[]>([]);
  const [vendorFilter, setVendorFilter] = useState<"all" | "walmart" | "amazon" | "wayfair" | "home_depot" | "other">("all");
  const [hideDeadLinks, setHideDeadLinks] = useState(true);

  // Chrome Extension detection
  const [extensionDetected, setExtensionDetected] = useState(false);
  const [extensionCheckDone, setExtensionCheckDone] = useState(false);

  useEffect(() => {
    // Method 1: Check DOM attribute (set by bridge content script via document.documentElement.setAttribute)
    const checkAttribute = () => document.documentElement.getAttribute("data-geeves-extension") === "true";
    
    // Method 2: Also set the window check flag for the bridge's polling mechanism
    (window as any).__GEEVES_EXTENSION_CHECK = true;
    
    // Check immediately (bridge may have already loaded)
    if (checkAttribute()) {
      setExtensionDetected(true);
      setExtensionCheckDone(true);
      return;
    }
    
    // Poll for the attribute (bridge loads at document_idle, may be slightly delayed)
    let attempts = 0;
    const pollInterval = setInterval(() => {
      attempts++;
      if (checkAttribute() || (window as any).__GEEVES_EXTENSION_INSTALLED) {
        setExtensionDetected(true);
        setExtensionCheckDone(true);
        clearInterval(pollInterval);
      } else if (attempts >= 20) {
        // After 2 seconds of polling, give up
        setExtensionCheckDone(true);
        clearInterval(pollInterval);
      }
    }, 100);
    
    return () => clearInterval(pollInterval);
  }, []);

  const { data: config } = trpc.expenseCategorisation.getConfig.useQuery();
  const { data: stats, refetch: refetchStats } = trpc.expenseCategorisation.getStats.useQuery();
  const { data: ordersData, refetch: refetchOrders } = trpc.expenseCategorisation.getOrders.useQuery({
    status: statusFilter, page, pageSize: 20, platform: vendorFilter,
  });

  // Fetch saved categorization for the selected order
  const { data: savedCategorization } = trpc.expenseCategorisation.getCategorization.useQuery(
    { orderId: selectedOrderId || "" },
    { enabled: !!selectedOrderId }
  );

  // Invoice extraction data for the selected order
  const { data: extractionData } = trpc.invoiceExtraction.getLineItems.useQuery(
    { orderId: selectedOrderId || "" },
    { enabled: !!selectedOrderId }
  );

  // Bank accounts for manual payment linking
  const { data: bankAccountsList } = trpc.bankAccounts.list.useQuery();

  // Vendor accounts and financial accounts for categorization
  const { data: vendorAccountsList } = trpc.expenseCategorisation.getVendorAccounts.useQuery();
  const { data: financialAccountsList } = trpc.expenseCategorisation.getFinancialAccounts.useQuery();

  // Manual link payment mutation
  const manualLinkMutation = trpc.invoiceExtraction.manualLinkPayment.useMutation({
    onSuccess: () => {
      toast.success("Payment account linked.");
    },
  });

  // Create extraction + trigger capture
  const createExtractionMutation = trpc.invoiceExtraction.createExtraction.useMutation({
    onSuccess: (data) => {
      toast.success("Invoice capture initiated. The extension will process the invoice.");
    },
  });

  // Upload invoice file (manual upload flow)
  const uploadMutation = trpc.invoiceExtraction.uploadInvoice.useMutation({
    onSuccess: (data: any) => {
      toast.success("Receipt uploaded. Extracting line items...");
      // Auto-trigger extraction after upload
      if (data.extractionId) {
        extractMutation.mutate({ extractionId: data.extractionId });
      }
    },
    onError: () => {
      toast.error("Failed to upload receipt.");
    },
  });

  // Extract line items from uploaded invoice
  const extractMutation = trpc.invoiceExtraction.extract.useMutation({
    onSuccess: () => {
      toast.success("Line items extracted successfully!");
    },
    onError: () => {
      toast.error("Failed to extract line items from receipt.");
    },
  });

  const categorizeMutation = trpc.expenseCategorisation.categorize.useMutation({
    onSuccess: () => {
      toast.success("Order assigned to vertical.");
      refetchOrders(); refetchStats();
      if (isEditingCategorization) {
        // Re-categorization: stay on the same order, just clear the form
        setIsEditingCategorization(false);
        setSelectedVertical(null);
        setSelectedCategory(null);
        setCustomCategory("");
        setSelectedProperty(null);
        setIsSplitMode(false);
        setSplits([]);
      } else {
        // Fresh categorization from pending: advance to next
        setIsEditingCategorization(false);
        moveToNext();
      }
    },
  });

  const splitMutation = trpc.expenseCategorisation.categorizeSplit.useMutation({
    onSuccess: () => {
      toast.success("Order split across verticals.");
      refetchOrders(); refetchStats();
      if (isEditingCategorization) {
        // Re-categorization: stay on the same order, just clear the form
        setIsEditingCategorization(false);
        setSelectedVertical(null);
        setSelectedCategory(null);
        setCustomCategory("");
        setSelectedProperty(null);
        setIsSplitMode(false);
        setSplits([]);
      } else {
        // Fresh categorization from pending: advance to next
        setIsEditingCategorization(false);
        moveToNext();
      }
    },
  });

  const skipMutation = trpc.expenseCategorisation.skip.useMutation({
    onSuccess: () => {
      toast.info("Order skipped.");
      refetchOrders(); refetchStats();
      moveToNext();
    },
  });

  const memoMutation = trpc.expenseCategorisation.updateMemo.useMutation({
    onSuccess: () => {
      toast.success("Memo saved.");
      refetchOrders();
    },
  });

  const orders = ordersData?.orders || [];
  const totalOrders = ordersData?.total || 0;
  const totalPages = Math.ceil(totalOrders / 20);

  // Auto-select first order when orders load and none is selected
  useEffect(() => {
    if (orders.length > 0 && !selectedOrderId) {
      setSelectedOrderId(orders[0].id);
    }
  }, [orders, selectedOrderId]);

  const currentOrder = useMemo(() => {
    if (selectedOrderId) return orders.find((o: any) => o.id === selectedOrderId);
    return orders[0] || null;
  }, [selectedOrderId, orders]);

  // Load memo when order changes
  useEffect(() => {
    if (currentOrder) {
      setMemoText(currentOrder.memo || "");
    }
  }, [currentOrder?.id]);

  // Determine if order is already categorized and we should show read-only view
  const isAlreadyCategorized = useMemo(() => {
    if (!currentOrder) return false;
    return currentOrder.categorizationStatus === "categorized" || currentOrder.categorizationStatus === "split";
  }, [currentOrder]);

  const showCategorizationForm = useMemo(() => {
    if (!currentOrder) return false;
    if (currentOrder.categorizationStatus === "pending") return true;
    if (isEditingCategorization) return true;
    return false;
  }, [currentOrder, isEditingCategorization]);

  const currentVerticalConfig = useMemo(() => {
    if (!selectedVertical || !config) return null;
    return config.verticals.find((v) => v.id === selectedVertical);
  }, [selectedVertical, config]);

  const availableCategories = useMemo(() => {
    if (!selectedVertical || !config) return [];
    return config.categoriesByVertical?.[selectedVertical] || [];
  }, [selectedVertical, config]);

  const progressStats = useMemo(() => {
    if (!stats) return { total: 0, done: 0, percent: 0 };
    const total = (stats as any[]).reduce((sum: number, s: any) => sum + Number(s.count), 0);
    const done = (stats as any[]).filter((s: any) => s.categorizationStatus !== "pending")
      .reduce((sum: number, s: any) => sum + Number(s.count), 0);
    return { total, done, percent: total > 0 ? Math.round((done / total) * 100) : 0 };
  }, [stats]);

  function moveToNext() {
    setSelectedVertical(null);
    setSelectedCategory(null);
    setCustomCategory("");
    setSelectedProperty(null);
    setIsSplitMode(false);
    setSplits([]);
    setIsEditingCategorization(false);
    const currentIdx = orders.findIndex((o: any) => o.id === (currentOrder?.id));
    if (currentIdx < orders.length - 1) {
      setSelectedOrderId(orders[currentIdx + 1].id);
    } else {
      setSelectedOrderId(null);
      setMobileView("list");
    }
  }

  function selectOrder(orderId: string) {
    setSelectedOrderId(orderId);
    setSelectedVertical(null);
    setSelectedCategory(null);
    setCustomCategory("");
    setSelectedProperty(null);
    setSelectedBankAccountId(null);
    setIsSplitMode(false);
    setSplits([]);
    setIsEditingCategorization(false);
    setMobileView("detail");

    // Auto-populate vendor for Walmart orders
    const walmartVendor = vendorAccountsList?.find((v: any) => v.platform === 'walmart');
    setSelectedVendorAccountId(walmartVendor?.id || null);
  }

  function handleCategorize() {
    if (!currentOrder || !selectedVertical || !selectedCategory) return;
    categorizeMutation.mutate({
      orderId: currentOrder.id,
      verticalId: selectedVertical,
      chartOfAccountId: selectedCategory,
      propertyId: selectedProperty || null,
      bankAccountId: selectedBankAccountId,
      vendorAccountId: selectedVendorAccountId,
    });
  }

  function handleSplitSave() {
    if (!currentOrder || splits.length === 0) return;
    const totalPct = splits.reduce((sum, s) => sum + s.splitPercentage, 0);
    if (Math.abs(totalPct - 100) > 0.01) {
      toast.error("Split percentages must total 100%");
      return;
    }
    splitMutation.mutate({
      orderId: currentOrder.id,
      bankAccountId: selectedBankAccountId,
      vendorAccountId: selectedVendorAccountId,
      splits: splits.map(s => ({
        verticalId: s.verticalId,
        chartOfAccountId: s.chartOfAccountId,
        propertyId: s.propertyId || null,
        splitPercentage: s.splitPercentage,
        splitAmount: s.splitAmount,
      })),
    });
  }

  function addSplit() {
    if (!selectedVertical || !currentVerticalConfig) return;
    const orderAmt = currentOrder?.totalAmount || 0;
    // Use functional update to avoid stale closure issues with rapid clicks
    setSplits(prev => {
      const usedPct = prev.reduce((sum, s) => sum + s.splitPercentage, 0);
      const usedAmt = prev.reduce((sum, s) => sum + (s.splitAmount || 0), 0);
      // For the first split added, default to 50% so there's room for the second
      const isFirstSplit = prev.length === 0;
      let pct: number;
      let amt: number;
      if (isFirstSplit) {
        pct = 50;
        amt = orderAmt * 0.5;
      } else {
        const remainingPct = 100 - usedPct;
        const remainingAmt = orderAmt - usedAmt;
        pct = splitEntryMode === "percentage" ? remainingPct : (orderAmt > 0 ? (remainingAmt / orderAmt) * 100 : 0);
        amt = splitEntryMode === "dollar" ? remainingAmt : orderAmt * (remainingPct / 100);
      }
      return [...prev, {
        id: crypto.randomUUID(),
        verticalId: selectedVertical!,
        verticalName: currentVerticalConfig!.name,
        chartOfAccountId: selectedCategory || '',
        categoryName: selectedCategoryName,
        propertyId: selectedProperty,
        propertyName: selectedPropertyName,
        splitPercentage: Math.round(pct * 100) / 100,
        splitAmount: Math.round(amt * 100) / 100,
      }];
    });
    // Clear all selections so user naturally picks the NEXT vertical for the second split
    setSelectedVertical(null);
    setSelectedCategory(null);
    setSelectedCategoryName(null);
    setCustomCategory("");
    setSelectedProperty(null);
    setSelectedPropertyName(null);
  }

  function removeSplit(idx: number) {
    setSplits(prev => prev.filter((_, i) => i !== idx));
  }

  const handleMemoSave = useCallback(() => {
    if (!currentOrder) return;
    if (memoText !== (currentOrder.memo || "")) {
      memoMutation.mutate({ orderId: currentOrder.id, memo: memoText });
    }
  }, [currentOrder, memoText]);

  function getOrderTypeIcon(type: string) {
    const Icon = ORDER_TYPE_ICONS[type] || ShoppingCart;
    return <Icon className="w-5 h-5 text-muted-foreground" />;
  }

  function getVendorOrderUrl(order: any) {
    if (order.vendorUrl) return order.vendorUrl;
    if (order.legacyWalmartOrderId || order.platform === 'walmart') {
      const wid = order.legacyWalmartOrderId || order.orderNumber;
      if (wid) {
        const base = `https://www.walmart.com/orders/${wid}`;
        if (order.orderType === 'Store purchase') return `${base}?groupId=0&storePurchase=true`;
        if (order.orderType === 'Curbside pickup') return `${base}?groupId=0&curbsidePickup=true`;
        return base;
      }
      return "https://www.walmart.com/account/orders";
    }
    if (order.platform === 'amazon') {
      if (order.orderNumber) return `https://www.amazon.com/gp/your-account/order-details?orderID=${order.orderNumber}`;
      return "https://www.amazon.com/gp/css/order-history";
    }
    if (order.platform === 'wayfair') return "https://www.wayfair.com/v/account/orders";
    if (order.platform === 'home_depot') return "https://www.homedepot.com/order/view/orders";
    return null;
  }

  // ===== SAVED CATEGORIZATION DISPLAY (inline JSX to prevent focus loss) =====
  const savedCategorizationContent = (savedCategorization && savedCategorization.length > 0) ? (() => {
    const isSplit = savedCategorization.length > 1;
    return (
      <Card className="border-green-500/30 bg-green-500/5">
        <CardContent className="p-4 md:p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-green-500" />
              <h3 className="text-sm font-semibold text-green-600">
                {isSplit ? "Split Assignment" : "Assigned"}
              </h3>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsEditingCategorization(true)}
              className="gap-1 text-xs"
            >
              <Pencil className="w-3 h-3" /> Re-categorize
            </Button>
          </div>

          <div className="space-y-2">
            {savedCategorization.map((cat: any, idx: number) => {
              const vertConfig = config?.verticals.find(v => v.id === cat.verticalId);
              const Icon = vertConfig ? (VERTICAL_ICONS[vertConfig.icon] || ShoppingCart) : ShoppingCart;
              return (
                <div key={idx} className="flex items-center gap-3 p-2.5 rounded-lg bg-background border">
                  <Icon className="w-5 h-5 flex-shrink-0" style={{ color: vertConfig?.color || "#888" }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{cat.verticalName}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {cat.categoryName || "No category"}
                    </p>
                  </div>
                  {isSplit && (
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold">{Number(cat.splitPercentage).toFixed(0)}%</p>
                      {cat.splitAmount && (
                        <p className="text-xs text-muted-foreground">${Number(cat.splitAmount).toFixed(2)}</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    );
  })() : null;

  // ===== ORDER ITEMS DISPLAY (inline JSX to prevent focus loss) =====
  const orderItemsContent = (() => {
    if (!currentOrder) return null;
    const thumbnails = currentOrder.thumbnailUrls || [];
    const items = currentOrder.itemNames || [];

    if (thumbnails.length === 0 && items.length === 0) return null;

    return (
      <Card>
        <CardContent className="p-4 md:p-5">
          <div className="flex items-center gap-2 mb-3">
            <ImageIcon className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Order Items</h3>
            <Badge variant="secondary" className="text-xs">{items.length || thumbnails.length} items</Badge>
          </div>

          {/* Thumbnail grid */}
          {thumbnails.length > 0 && (
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2 mb-3">
              {thumbnails.map((url: string, idx: number) => (
                <div key={idx} className="aspect-square rounded-md border overflow-hidden bg-white">
                  <img
                    src={url}
                    alt={items[idx] || `Item ${idx + 1}`}
                    className="w-full h-full object-contain p-1"
                    loading="lazy"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Item names list */}
          {items.length > 0 && (
            <div className="max-h-40 overflow-y-auto">
              <ul className="space-y-1">
                {items.map((name: string, idx: number) => (
                  <li key={idx} className="text-xs text-muted-foreground flex items-start gap-2">
                    <span className="text-muted-foreground/50 flex-shrink-0">{idx + 1}.</span>
                    <span className="truncate">{name}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    );
  })();

  // ===== MEMO FIELD (rendered inline to prevent remount/focus-loss) =====
  const memoFieldContent = currentOrder ? (
    <Card>
      <CardContent className="p-4 md:p-5">
        <div className="flex items-center gap-2 mb-2">
          <StickyNote className="w-4 h-4 text-muted-foreground" />
          <label className="text-sm font-semibold">Memo / Notes</label>
        </div>
        <Textarea
          key={currentOrder.id}
          placeholder="Add notes about this order (e.g., what it was for, who it was for)..."
          value={memoText}
          onChange={(e) => setMemoText(e.target.value)}
          onBlur={handleMemoSave}
          className="text-sm min-h-[60px] resize-y"
          rows={2}
        />
        {memoMutation.isPending && (
          <p className="text-xs text-muted-foreground mt-1">Saving...</p>
        )}
      </CardContent>
    </Card>
  ) : null;

  // ===== ORDER LIST PANEL (inline JSX to prevent focus loss) =====
  const orderListContent = (
    <div className="space-y-2">
      {orders.map((order: any) => {
        const isActive = currentOrder?.id === order.id;
        return (
          <Card
            key={order.id}
            className={`cursor-pointer transition-all hover:ring-2 hover:ring-primary/50 ${
              isActive ? "ring-2 ring-primary bg-primary/5" : ""
            }`}
            onClick={() => selectOrder(order.id)}
          >
            <CardContent className="p-3">
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-muted flex items-center justify-center overflow-hidden">
                  {order.platform === 'amazon' ? (
                    <AmazonLogo />
                  ) : order.platform === 'walmart' ? (
                    <WalmartSparkLogo />
                  ) : order.platform === 'wayfair' ? (
                    <span className="text-xs font-bold text-purple-500">WF</span>
                  ) : order.platform === 'home_depot' ? (
                    <span className="text-xs font-bold text-orange-500">HD</span>
                  ) : (
                    getOrderTypeIcon(order.orderType)
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {order.orderType || "Order"}
                      </p>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground flex-shrink-0 capitalize">
                        {order.platform}
                      </span>
                    </div>
                    <span className="text-sm font-bold text-foreground ml-2 flex-shrink-0">
                      {order.totalAmount ? `$${Number(order.totalAmount).toFixed(2)}` : "—"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {order.orderDate ? new Date(order.orderDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "No date"}
                    {order.orderNumber && <span className="ml-1.5 text-muted-foreground/70">#{order.orderNumber.slice(-6)}</span>}
                  </p>
                  {order.itemSummary && (
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{order.itemSummary}</p>
                  )}
                  {order.memo && (
                    <p className="text-xs text-amber-500 truncate mt-0.5 flex items-center gap-1">
                      <StickyNote className="w-3 h-3" /> {order.memo}
                    </p>
                  )}
                </div>
                {order.categorizationStatus !== "pending" && (
                  <Badge variant="default" className="text-xs flex-shrink-0">
                    {order.categorizationStatus === "categorized" && <Check className="w-3 h-3 mr-1" />}
                    {order.categorizationStatus === "split" && <Split className="w-3 h-3 mr-1" />}
                    {order.categorizationStatus}
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}

      {orders.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          No orders with this status
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex justify-between items-center pt-4">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
            <ChevronLeft className="w-4 h-4" /> Prev
          </Button>
          <span className="text-sm text-muted-foreground">Page {page}/{totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
            Next <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );

  // ===== DETAIL + CATEGORIZATION PANEL (inline JSX to prevent focus loss) =====
  const detailPanelContent = !currentOrder ? (
    <Card>
      <CardContent className="p-12 text-center">
        <ShoppingCart className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium">All caught up!</h3>
        <p className="text-sm text-muted-foreground mt-1">
          {statusFilter === "pending" ? "No more pending orders to categorize." : "Select an order from the list to view details."}
        </p>
      </CardContent>
    </Card>
  ) : (() => {
    const vendorUrl = getVendorOrderUrl(currentOrder);

    return (
      <div className="space-y-4">
        {/* Back button for mobile */}
        <div className="lg:hidden">
          <Button variant="ghost" size="sm" onClick={() => setMobileView("list")} className="gap-1 -ml-2">
            <ArrowLeft className="w-4 h-4" /> Back to orders
          </Button>
        </div>

        {/* Order detail card */}
        <Card>
          <CardContent className="p-4 md:p-5">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div className="flex items-start gap-3 sm:gap-4">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                  {getOrderTypeIcon(currentOrder.orderType)}
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-semibold">
                    {currentOrder.orderType || "Order"}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {currentOrder.orderDate ? new Date(currentOrder.orderDate).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }) : "No date"}
                  </p>
                  <p className="text-2xl sm:text-3xl font-bold mt-2 text-foreground">
                    {currentOrder.totalAmount ? `$${Number(currentOrder.totalAmount).toFixed(2)}` : "Amount unknown"}
                  </p>
                  {/* Vendor badge */}
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="secondary" className="text-xs gap-1">
                      <Store className="w-3 h-3" />
                      {currentOrder.platform ? currentOrder.platform.charAt(0).toUpperCase() + currentOrder.platform.slice(1).replace('_', ' ') : currentOrder.vendorName || 'Unknown'}
                    </Badge>
                    {currentOrder.seller && currentOrder.seller !== currentOrder.platform && (
                      <span className="text-xs text-muted-foreground">via {currentOrder.seller}</span>
                    )}
                  </div>
                  {currentOrder.location && (
                    <p className="text-sm text-muted-foreground">
                      <span className="font-medium">Location:</span> {currentOrder.location}
                    </p>
                  )}
                  {currentOrder.rawDescription && (
                    <p className="text-sm text-muted-foreground mt-2 italic border-l-2 border-muted pl-3">
                      {currentOrder.rawDescription}
                    </p>
                  )}
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex flex-row sm:flex-col gap-2 flex-shrink-0">
                {vendorUrl && (
                  <Button variant="default" size="sm" asChild className="gap-2 flex-1 sm:flex-initial">
                    <a href={vendorUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="w-4 h-4" />
                      <span className="hidden sm:inline">View on vendor site</span>
                      <span className="sm:hidden">Vendor</span>
                    </a>
                  </Button>
                )}
                {currentOrder.receiptUrl && (
                  <Button variant="outline" size="sm" asChild className="gap-2 flex-1 sm:flex-initial">
                    <a href={currentOrder.receiptUrl} target="_blank" rel="noopener noreferrer">
                      <Receipt className="w-4 h-4" />
                      <span className="hidden sm:inline">View Receipt</span>
                      <span className="sm:hidden">Receipt</span>
                    </a>
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Order Items */}
        {orderItemsContent}

        {/* Invoice Extraction Line Items (from Chrome Extension) */}
        {extractionData?.hasExtraction && (
          <Card className="border-blue-500/30 bg-blue-500/5">
            <CardContent className="p-4 md:p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-blue-500" />
                  <h3 className="text-sm font-semibold text-blue-600">Invoice Line Items</h3>
                  <Badge variant="secondary" className="text-xs">
                    {extractionData.lineItems?.length || 0} items
                  </Badge>
                </div>
                {extractionData.s3Url && (
                  <Button variant="ghost" size="sm" asChild className="gap-1 text-xs">
                    <a href={extractionData.s3Url} target="_blank" rel="noopener noreferrer">
                      <Download className="w-3 h-3" /> PDF
                    </a>
                  </Button>
                )}
              </div>

              {/* Vendor + totals summary */}
              <div className="flex flex-wrap gap-3 mb-3 text-xs text-muted-foreground">
                {extractionData.vendorName && (
                  <span className="flex items-center gap-1">
                    <Store className="w-3 h-3" /> {extractionData.vendorName}
                  </span>
                )}
                {extractionData.orderTotal && (
                  <span className="font-medium text-foreground">
                    Total: ${Number(extractionData.orderTotal).toFixed(2)}
                  </span>
                )}
                {extractionData.taxTotal && (
                  <span>Tax: ${Number(extractionData.taxTotal).toFixed(2)}</span>
                )}
              </div>

              {/* Line items table */}
              {extractionData.lineItems && extractionData.lineItems.length > 0 && (
                <div className="border rounded-lg overflow-hidden mb-3">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left p-2 font-medium">Item</th>
                        <th className="text-center p-2 font-medium w-12">Qty</th>
                        <th className="text-right p-2 font-medium w-16">Price</th>
                        <th className="text-right p-2 font-medium w-16">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(extractionData.lineItems as Array<{description: string; quantity: number; unitPrice: number; lineTotal: number}>).map((item, idx) => (
                        <tr key={idx} className="border-t border-border/50">
                          <td className="p-2 truncate max-w-[200px]">{item.description}</td>
                          <td className="p-2 text-center">{item.quantity}</td>
                          <td className="p-2 text-right">${Number(item.unitPrice).toFixed(2)}</td>
                          <td className="p-2 text-right font-medium">${Number(item.lineTotal).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Payment account badge */}
              <div className="flex items-center gap-2 pt-2 border-t border-border/50">
                <CreditCard className="w-4 h-4 text-muted-foreground" />
                {extractionData.linked ? (
                  <div className="flex items-center gap-2">
                    <Badge variant="default" className="text-xs gap-1">
                      <Link2 className="w-3 h-3" />
                      {extractionData.accountName || 'Linked'}
                    </Badge>
                    {extractionData.paymentMethod?.last4 && (
                      <span className="text-xs text-muted-foreground">••••{extractionData.paymentMethod.last4}</span>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 flex-1">
                    <span className="text-xs text-muted-foreground">
                      {extractionData.paymentMethod?.type && extractionData.paymentMethod?.last4
                        ? `${extractionData.paymentMethod.type} ••••${extractionData.paymentMethod.last4}`
                        : 'No payment method detected'}
                    </span>
                    {bankAccountsList && bankAccountsList.length > 0 && extractionData.extractionId && (
                      <Select
                        onValueChange={(val) => {
                          manualLinkMutation.mutate({
                            extractionId: extractionData.extractionId!,
                            accountId: parseInt(val),
                          });
                        }}
                      >
                        <SelectTrigger className="h-7 w-40 text-xs">
                          <SelectValue placeholder="Link account..." />
                        </SelectTrigger>
                        <SelectContent>
                          {bankAccountsList.map((acc: any) => (
                            <SelectItem key={acc.id} value={String(acc.id)}>
                              {acc.accountName}{acc.lastFourDigits ? ` (••${acc.lastFourDigits})` : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Capture Invoice button (when extension detected but no extraction exists) */}
        {extensionDetected && currentOrder && !extractionData?.hasExtraction && (
          <Button
            variant="outline"
            size="sm"
            className="gap-2 border-blue-500/40 text-blue-600 hover:bg-blue-500/10"
            onClick={() => {
              const vendorUrl = getVendorOrderUrl(currentOrder);
              // Create the extraction record in DB
              createExtractionMutation.mutate({
                orderId: currentOrder.id,
                orderType: "vendor_order",
                filename: `invoice-${currentOrder.walmartOrderId || currentOrder.id}.pdf`,
              });
              // Post message to extension bridge to open vendor site and capture
              if (vendorUrl && vendorUrl !== "https://www.walmart.com/account/orders") {
                window.postMessage({
                  type: "GEEVES_CAPTURE_REQUEST",
                  payload: { orderId: currentOrder.id, vendorUrl },
                }, "*");
              } else if (vendorUrl) {
                // Open vendor order history so user can navigate to the order
                window.open(vendorUrl, "_blank");
              }
            }}
            disabled={createExtractionMutation.isPending}
          >
            <Download className="w-4 h-4" />
            {createExtractionMutation.isPending ? 'Capturing...' : 'Capture Invoice'}
          </Button>
        )}

        {/* Receipt preview + manual upload */}
        <Card>
          <CardContent className="p-4 md:p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Receipt Preview</h3>
              </div>
              <div className="flex items-center gap-2">
                {currentOrder.receiptUrl && (
                  <Button variant="ghost" size="sm" asChild className="gap-1 text-xs">
                    <a href={currentOrder.receiptUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="w-3 h-3" /> Open
                    </a>
                  </Button>
                )}
                <label className="cursor-pointer">
                  <input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.webp"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file || !currentOrder) return;
                      if (file.size > 16 * 1024 * 1024) {
                        toast.error("File too large. Max 16MB.");
                        e.target.value = "";
                        return;
                      }
                      const reader = new FileReader();
                      reader.onload = () => {
                        const base64 = (reader.result as string).split(",")[1];
                        // Create extraction then upload
                        createExtractionMutation.mutate({
                          orderId: currentOrder.id,
                          orderType: "vendor_order",
                          filename: file.name,
                        }, {
                          onSuccess: (data: any) => {
                            // Now upload the file
                            uploadMutation.mutate({
                              extractionId: data.extractionId,
                              fileBase64: base64,
                              filename: file.name,
                              mimeType: file.type || "application/pdf",
                            });
                          },
                        });
                      };
                      reader.readAsDataURL(file);
                      e.target.value = "";
                    }}
                  />
                  <Button variant="outline" size="sm" className="gap-1 text-xs pointer-events-none" asChild>
                    <span>
                      <Download className="w-3 h-3" />
                      {uploadMutation?.isPending ? "Uploading..." : "Upload Receipt"}
                    </span>
                  </Button>
                </label>
              </div>
            </div>
            {currentOrder.receiptUrl ? (
              <div className="border rounded-lg overflow-hidden bg-white">
                {currentOrder.receiptUrl.toLowerCase().endsWith(".pdf") ? (
                  <iframe
                    src={currentOrder.receiptUrl}
                    title="Receipt PDF"
                    className="w-full h-[400px]"
                  />
                ) : (
                  <img
                    src={currentOrder.receiptUrl}
                    alt="Order receipt"
                    className="w-full max-w-md mx-auto"
                    loading="lazy"
                    onError={(e) => {
                      // If image fails to load, show a fallback message
                      const target = e.target as HTMLImageElement;
                      target.style.display = "none";
                      target.parentElement!.innerHTML = '<p class="text-center py-8 text-sm text-muted-foreground">Receipt could not be displayed. Click "Open" to view in a new tab.</p>';
                    }}
                  />
                )}
              </div>
            ) : (
              <div className="border rounded-lg p-6 text-center bg-muted/20">
                <Receipt className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">No receipt available</p>
                <p className="text-xs text-muted-foreground mt-1">Upload a receipt or use the Chrome Extension to capture one from the vendor site</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Memo field */}
        {memoFieldContent}

        {/* Saved categorization display (for already-categorized orders) */}
        {isAlreadyCategorized && !isEditingCategorization && savedCategorizationContent}

        {/* Categorization controls (for pending or when re-editing) */}
        {showCategorizationForm && (
          <Card>
            <CardContent className="p-4 md:p-5">
              {isEditingCategorization && (
                <div className="flex items-center justify-between mb-4 pb-3 border-b">
                  <p className="text-sm font-medium text-amber-600">Re-categorizing this order</p>
                  <Button variant="ghost" size="sm" onClick={() => setIsEditingCategorization(false)}>
                    Cancel
                  </Button>
                </div>
              )}

              {/* Mode toggle */}
              <div className="flex gap-2 mb-5">
                <Button
                  variant={!isSplitMode ? "default" : "outline"}
                  size="sm"
                  onClick={() => { setIsSplitMode(false); setSplits([]); }}
                >
                  Single Vertical
                </Button>
                <Button
                  variant={isSplitMode ? "default" : "outline"}
                  size="sm"
                  onClick={() => setIsSplitMode(true)}
                >
                  <Split className="w-4 h-4 mr-1" /> Split Across Verticals
                </Button>
              </div>

              {/* Vertical selector */}
              <div className="mb-4">
                <label className="text-sm font-medium mb-2 block">Vertical</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {config?.verticals.map((v) => {
                    const Icon = VERTICAL_ICONS[v.icon] || ShoppingCart;
                    return (
                      <button
                        key={v.id}
                        onClick={() => { setSelectedVertical(v.id); setSelectedCategory(null); setCustomCategory(""); setSelectedProperty(null); }}
                        className={`flex items-center gap-2 p-2.5 sm:p-3 rounded-lg border transition-all text-left ${
                          selectedVertical === v.id
                            ? "border-primary bg-primary/10 ring-2 ring-primary/30"
                            : "border-border hover:border-primary/50"
                        }`}
                      >
                        <Icon className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" style={{ color: v.color }} />
                        <span className="text-xs sm:text-sm font-medium truncate">{v.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Category selector (from Chart of Accounts) */}
              {selectedVertical && (
                <div className="mb-4">
                  <label className="text-sm font-medium mb-2 block">Expense Account (COA)</label>
                  <Select value={selectedCategory || ""} onValueChange={(v) => {
                    setSelectedCategory(v);
                    const cat = availableCategories.find((c: any) => c.id === v);
                    setSelectedCategoryName(cat?.name || null);
                  }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select an expense account..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availableCategories.map((cat: any) => (
                        <SelectItem key={cat.id} value={cat.id}>
                          {cat.accountNumber ? `${cat.accountNumber} — ` : ''}{cat.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Property selector (Bohemian Lodges) */}
              {currentVerticalConfig?.name === "Bohemian Lodges" && (
                <div className="mb-4">
                  <label className="text-sm font-medium mb-2 block">Property</label>
                  <Select value={selectedProperty || ""} onValueChange={(v) => {
                    setSelectedProperty(v);
                    const prop = config?.properties?.find((p: any) => p.id === v);
                    setSelectedPropertyName(prop?.name || null);
                  }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a property..." />
                    </SelectTrigger>
                    <SelectContent>
                      {config?.properties?.map((p: any) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Bank Account selector */}
              <div className="mb-4">
                <label className="text-sm font-medium mb-1.5 block">Payment Account</label>
                <Select value={selectedBankAccountId?.toString() || ""} onValueChange={(v) => setSelectedBankAccountId(v ? Number(v) : null)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select payment account..." />
                  </SelectTrigger>
                  <SelectContent>
                    {financialAccountsList?.map((a: any) => (
                      <SelectItem key={a.id} value={a.id.toString()}>
                        {a.accountName}{a.lastFourDigits ? ` (****${a.lastFourDigits})` : ''} — {a.institution}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">Which account was this expense charged to?</p>
              </div>

              {/* Vendor Account selector */}
              <div className="mb-4">
                <label className="text-sm font-medium mb-1.5 block">Vendor</label>
                <Select value={selectedVendorAccountId || ""} onValueChange={(v) => setSelectedVendorAccountId(v || null)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select vendor..." />
                  </SelectTrigger>
                  <SelectContent>
                    {vendorAccountsList?.map((v: any) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.vendorName} ({v.platform})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Split mode: accumulated splits */}
              {isSplitMode && (
                <div className="mb-4">
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-sm font-medium">Splits</label>
                    <div className="flex items-center gap-2">
                      <div className="flex rounded-md border overflow-hidden text-xs">
                        <button
                          type="button"
                          className={`px-2.5 py-1 transition-colors ${splitEntryMode === "percentage" ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80"}`}
                          onClick={() => setSplitEntryMode("percentage")}
                        >
                          %
                        </button>
                        <button
                          type="button"
                          className={`px-2.5 py-1 transition-colors ${splitEntryMode === "dollar" ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80"}`}
                          onClick={() => setSplitEntryMode("dollar")}
                        >
                          $
                        </button>
                      </div>
                      <Button size="sm" variant="outline" onClick={addSplit} disabled={!selectedVertical}>
                        + Add Split
                      </Button>
                    </div>
                  </div>
                  {splits.length > 0 && (
                    <div className="space-y-2">
                      {splits.map((s) => (
                        <SplitRow
                          key={s.id}
                          split={s}
                          orderTotal={currentOrder?.totalAmount || 0}
                          entryMode={splitEntryMode}
                          onUpdate={(updated) => {
                            setSplits(prev => prev.map(sp => sp.id === s.id ? updated : sp));
                          }}
                          onRemove={() => {
                            setSplits(prev => prev.filter(sp => sp.id !== s.id));
                          }}
                        />
                      ))}
                      <div className="flex justify-between text-xs text-muted-foreground pt-1">
                        <span>Total: {splits.reduce((sum, s) => sum + s.splitPercentage, 0).toFixed(1)}%</span>
                        <span>${splits.reduce((sum, s) => sum + (s.splitAmount || 0), 0).toFixed(2)} of ${(currentOrder?.totalAmount || 0).toFixed(2)}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Action buttons */}
              <div className="flex gap-3 mt-6 pt-4 border-t">
                {!isSplitMode ? (
                  <Button
                    onClick={handleCategorize}
                    disabled={!selectedVertical || categorizeMutation.isPending}
                    className="flex-1"
                  >
                    <Check className="w-4 h-4 mr-2" />
                    {categorizeMutation.isPending ? "Saving..." : "Assign & Next"}
                  </Button>
                ) : (
                  <Button
                    onClick={handleSplitSave}
                    disabled={splits.length === 0 || splitMutation.isPending}
                    className="flex-1"
                  >
                    <Split className="w-4 h-4 mr-2" />
                    {splitMutation.isPending ? "Saving..." : "Save Split & Next"}
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={() => skipMutation.mutate({ orderId: currentOrder.id })}
                  disabled={skipMutation.isPending}
                >
                  <SkipForward className="w-4 h-4 mr-2" /> Skip
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  })();

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">Expense Categorisation Tool</h1>
        <p className="text-sm text-muted-foreground mt-1">Assign vendor expenses to verticals and QBO categories for reconciliation</p>
        <div className="mt-4 flex items-center gap-4">
          <Progress value={progressStats.percent} className="flex-1 h-3" />
          <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">
            {progressStats.done}/{progressStats.total} ({progressStats.percent}%)
          </span>
        </div>
      </div>

      {/* Chrome Extension detection banner */}
      {extensionCheckDone && !extensionDetected && (
        <div className="mb-4 p-3 rounded-lg border border-blue-500/30 bg-blue-500/5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Download className="w-4 h-4 text-blue-500" />
            <span className="text-sm text-blue-600">
              Install the Geeves Invoice Capture extension to auto-extract line items from vendor invoices.
            </span>
          </div>
          <Button variant="outline" size="sm" className="gap-1 text-xs border-blue-500/40 text-blue-600" asChild>
            <a href="/extensions/geeves-invoice-capture.zip" download>
              <Download className="w-3 h-3" /> Get Extension
            </a>
          </Button>
        </div>
      )}

      {extensionDetected && (
        <div className="mb-4 p-2 rounded-lg border border-green-500/30 bg-green-500/5 flex items-center gap-2">
          <Check className="w-4 h-4 text-green-500" />
          <span className="text-xs text-green-600">Geeves Invoice Capture extension active</span>
        </div>
      )}

      {/* Filter tabs + vendor filter */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Tabs value={statusFilter} onValueChange={(v) => { setStatusFilter(v as any); setPage(1); setSelectedOrderId(null); setMobileView("list"); }} className="flex-1">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="pending">Pending</TabsTrigger>
            <TabsTrigger value="categorized">Categorized</TabsTrigger>
            <TabsTrigger value="split">Split</TabsTrigger>
            <TabsTrigger value="skipped">Skipped</TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
          </TabsList>
        </Tabs>
        <Select value={vendorFilter} onValueChange={(v) => { setVendorFilter(v as any); setPage(1); setSelectedOrderId(null); }}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="All Vendors" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Vendors</SelectItem>
            <SelectItem value="amazon">Amazon</SelectItem>
            <SelectItem value="walmart">Walmart</SelectItem>
            <SelectItem value="wayfair">Wayfair</SelectItem>
            <SelectItem value="home_depot">Home Depot</SelectItem>
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Desktop: side-by-side layout */}
      <div className="hidden lg:grid lg:grid-cols-12 gap-6">
        {/* Left: Order list */}
        <div className="lg:col-span-4 space-y-2 max-h-[75vh] overflow-y-auto pr-1">
          {orderListContent}
        </div>
        {/* Right: Detail + categorization */}
        <div className="lg:col-span-8">
          {detailPanelContent}
        </div>
      </div>

      {/* Mobile: stacked with view toggle */}
      <div className="lg:hidden">
        {mobileView === "list" ? (
          <div className="space-y-2 max-h-[75vh] overflow-y-auto">
            {orderListContent}
          </div>
        ) : (
          detailPanelContent
        )}
      </div>
    </div>
  );
}
