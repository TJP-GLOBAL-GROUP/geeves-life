import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft,
  Plus,
  Minus,
  Trash2,
  ExternalLink,
  Sparkles,
  ShoppingCart,
  ArrowRightLeft,
  CheckSquare,
  X,
  Truck,
  Pencil,
  Check,
  Bot,
} from "lucide-react";
import { useState, useMemo, useRef, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { toast } from "sonner";
import { Streamdown } from "streamdown";

const ITEM_CATEGORIES = ["Groceries", "Clothing", "Household", "Electronics", "Personal Care", "Kids", "Office", "Other"];
const STORES = ["Walmart", "Amazon", "Target", "Costco", "Other"];

export default function ShoppingListDetail() {
  const params = useParams<{ id: string }>();
  const listId = parseInt(params.id || "0");
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  const { data: list, isLoading: listLoading } = trpc.shoppingLists.getById.useQuery({ id: listId });
  const { data: items, isLoading: itemsLoading } = trpc.shoppingItems.list.useQuery({ listId });
  const { data: familyMembers } = trpc.family.list.useQuery();
  const { data: allLists } = trpc.shoppingLists.list.useQuery();

  const createItem = trpc.shoppingItems.create.useMutation({
    onSuccess: () => { utils.shoppingItems.list.invalidate({ listId }); setAddOpen(false); toast.success("Item added"); },
  });
  const updateItem = trpc.shoppingItems.update.useMutation({
    onSuccess: () => utils.shoppingItems.list.invalidate({ listId }),
  });
  const deleteItem = trpc.shoppingItems.delete.useMutation({
    onSuccess: () => { utils.shoppingItems.list.invalidate({ listId }); toast.success("Item removed"); },
  });
  const moveItems = trpc.shoppingItems.moveToList.useMutation({
    onSuccess: (data) => {
      utils.shoppingItems.list.invalidate({ listId });
      utils.shoppingLists.list.invalidate();
      setSelectedItems(new Set());
      setSelectMode(false);
      setMoveDialogOpen(false);
      toast.success(`Moved ${data.moved} item${data.moved > 1 ? "s" : ""} successfully`);
    },
    onError: () => toast.error("Failed to move items"),
  });
  const recommend = trpc.ai.recommend.useMutation();
  const createSession = trpc.shopAgent.createSession.useMutation();

  const [addOpen, setAddOpen] = useState(false);
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());
  const [itemName, setItemName] = useState("");
  const [itemQty, setItemQty] = useState("1");
  const [itemUnit, setItemUnit] = useState("");
  const [itemCategory, setItemCategory] = useState("");
  const [itemStore, setItemStore] = useState("");
  const [itemPrice, setItemPrice] = useState("");
  const [itemNotes, setItemNotes] = useState("");
  const [itemForMember, setItemForMember] = useState("");
  const [showRecommendations, setShowRecommendations] = useState(false);

  // Other lists to move items to (exclude current list)
  const otherLists = useMemo(
    () => (allLists || []).filter((l) => l.id !== listId),
    [allLists, listId]
  );

  const handleAddItem = () => {
    if (!itemName.trim()) return;
    createItem.mutate({
      listId,
      name: itemName.trim(),
      quantity: parseInt(itemQty) || 1,
      unit: itemUnit || null,
      category: itemCategory || null,
      preferredStore: itemStore || null,
      estimatedPrice: itemPrice || null,
      notes: itemNotes || null,
      forFamilyMemberId: itemForMember ? parseInt(itemForMember) : null,
    });
    setItemName(""); setItemQty("1"); setItemUnit(""); setItemCategory(""); setItemStore(""); setItemPrice(""); setItemNotes(""); setItemForMember("");
  };

  const togglePurchased = (item: any) => {
    updateItem.mutate({
      id: item.id,
      status: item.status === "purchased" ? "pending" : "purchased",
    });
  };

  const toggleSelectItem = (itemId: number) => {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const selectAllPending = () => {
    const pendingIds = (items || []).filter((i) => i.status === "pending").map((i) => i.id);
    setSelectedItems(new Set(pendingIds));
  };

  const handleMoveToList = (targetListId: number) => {
    if (selectedItems.size === 0) return;
    moveItems.mutate({
      itemIds: Array.from(selectedItems),
      targetListId,
    });
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedItems(new Set());
  };

  const getStoreUrl = (store: string, itemName: string) => {
    const q = encodeURIComponent(itemName);
    switch (store?.toLowerCase()) {
      case "walmart": return `https://www.walmart.com/search?q=${q}`;
      case "amazon": return `https://www.amazon.com/s?k=${q}`;
      case "target": return `https://www.target.com/s?searchTerm=${q}`;
      default: return `https://www.google.com/search?q=${q}+buy`;
    }
  };

  const handleGetRecommendations = () => {
    setShowRecommendations(true);
    recommend.mutate({
      context: `Shopping list: "${list?.name}". Category: ${list?.category || "general"}. Current items: ${items?.map(i => i.name).join(", ") || "none"}`,
    });
  };

  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editQty, setEditQty] = useState(1);
  const [editUnit, setEditUnit] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const editNameRef = useRef<HTMLInputElement>(null);

  const startEditing = (item: any) => {
    setEditingItemId(item.id);
    setEditName(item.name);
    setEditQty(item.quantity || 1);
    setEditUnit(item.unit || "");
    setEditNotes(item.notes || "");
  };

  const saveEdit = () => {
    if (!editingItemId || !editName.trim()) return;
    updateItem.mutate({
      id: editingItemId,
      name: editName.trim(),
      quantity: editQty,
      unit: editUnit || null,
      notes: editNotes || null,
    });
    setEditingItemId(null);
    toast.success("Item updated");
  };

  const cancelEdit = () => setEditingItemId(null);

  const quickUpdateQty = (itemId: number, currentQty: number, delta: number) => {
    const newQty = Math.max(1, currentQty + delta);
    updateItem.mutate({ id: itemId, quantity: newQty });
  };

  useEffect(() => {
    if (editingItemId && editNameRef.current) editNameRef.current.focus();
  }, [editingItemId]);

  const pendingItems = items?.filter(i => i.status === "pending") || [];
  const purchasedItems = items?.filter(i => i.status === "purchased") || [];
  const totalEstimate = items?.reduce((sum, i) => sum + parseFloat(i.estimatedPrice || "0") * (i.quantity || 1), 0) || 0;

  if (listLoading) return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-64 w-full" /></div>;
  if (!list) return <div className="text-center py-12 text-muted-foreground">List not found</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/shopping")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
            {list.name}
          </h1>
          {list.description && <p className="text-sm text-muted-foreground mt-1">{list.description}</p>}
        </div>
        <div className="flex gap-2">
          {/* Select mode toggle */}
          {!selectMode ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectMode(true)}
              disabled={pendingItems.length === 0 && purchasedItems.length === 0}
              className="gap-2"
            >
              <CheckSquare className="h-4 w-4" /> Select
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={exitSelectMode} className="gap-2">
              <X className="h-4 w-4" /> Cancel
            </Button>
          )}
          <Button
            size="sm"
            onClick={() => setLocation(`/shopping/${listId}/order`)}
            disabled={pendingItems.length === 0}
            className="gap-2"
            variant="outline"
          >
            <Truck className="h-4 w-4" /> Order Prep
          </Button>
          <Button
            size="sm"
            onClick={async () => {
              try {
                const result = await createSession.mutateAsync({ listId });
                toast.success("Shopping session created! Setting up your items...");
                setLocation(`/shop-agent/${result.sessionId}`);
              } catch (e: any) {
                toast.error(e.message || "Failed to start shopping session");
              }
            }}
            disabled={pendingItems.length === 0 || createSession.isPending}
            className="gap-2 bg-primary hover:bg-emerald-700"
          >
            <Bot className="h-4 w-4" /> {createSession.isPending ? "Preparing..." : "Shop This List"}
          </Button>
          <Button variant="outline" size="sm" onClick={handleGetRecommendations} disabled={recommend.isPending} className="gap-2">
            <Sparkles className="h-4 w-4" />
            {recommend.isPending ? "Thinking..." : "AI Suggest"}
          </Button>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2"><Plus className="h-4 w-4" /> Add Item</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Item</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label>Item Name</Label>
                  <Input placeholder="e.g., Whole milk" value={itemName} onChange={(e) => setItemName(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Quantity</Label>
                    <Input type="number" min="1" value={itemQty} onChange={(e) => setItemQty(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Unit</Label>
                    <Input placeholder="lbs, oz, pcs" value={itemUnit} onChange={(e) => setItemUnit(e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Select value={itemCategory} onValueChange={setItemCategory}>
                      <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
                      <SelectContent>
                        {ITEM_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Preferred Store</Label>
                    <Select value={itemStore} onValueChange={setItemStore}>
                      <SelectTrigger><SelectValue placeholder="Store" /></SelectTrigger>
                      <SelectContent>
                        {STORES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Est. Price</Label>
                    <Input type="number" step="0.01" placeholder="0.00" value={itemPrice} onChange={(e) => setItemPrice(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>For Family Member</Label>
                    <Select value={itemForMember} onValueChange={setItemForMember}>
                      <SelectTrigger><SelectValue placeholder="Anyone" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Anyone</SelectItem>
                        {familyMembers?.map((m) => <SelectItem key={m.id} value={m.id.toString()}>{m.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea placeholder="Brand preference, size, etc." value={itemNotes} onChange={(e) => setItemNotes(e.target.value)} />
                </div>
                <Button onClick={handleAddItem} disabled={!itemName.trim() || createItem.isPending} className="w-full">
                  {createItem.isPending ? "Adding..." : "Add Item"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Selection action bar */}
      {selectMode && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/10 border border-primary/20">
          <span className="text-sm font-medium">
            {selectedItems.size} item{selectedItems.size !== 1 ? "s" : ""} selected
          </span>
          <Button variant="ghost" size="sm" className="text-xs" onClick={selectAllPending}>
            Select all pending
          </Button>
          <div className="flex-1" />
          <Dialog open={moveDialogOpen} onOpenChange={setMoveDialogOpen}>
            <DialogTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                disabled={selectedItems.size === 0}
                className="gap-2"
              >
                <ArrowRightLeft className="h-4 w-4" /> Move to List
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Move {selectedItems.size} item{selectedItems.size !== 1 ? "s" : ""} to...</DialogTitle>
              </DialogHeader>
              <div className="space-y-2 pt-2 max-h-80 overflow-y-auto">
                {otherLists.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    No other lists available. Create another list first.
                  </p>
                ) : (
                  otherLists.map((targetList) => (
                    <button
                      key={targetList.id}
                      onClick={() => handleMoveToList(targetList.id)}
                      disabled={moveItems.isPending}
                      className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-accent/50 hover:border-primary/30 transition-all text-left"
                    >
                      <ShoppingCart className="h-5 w-5 text-primary shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{targetList.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {targetList.category || "General"} · {targetList.status}
                        </p>
                      </div>
                      <ArrowRightLeft className="h-4 w-4 text-muted-foreground shrink-0" />
                    </button>
                  ))
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      )}

      {/* Summary bar */}
      <div className="flex items-center gap-4 text-sm">
        <Badge variant="secondary">{pendingItems.length} pending</Badge>
        <Badge variant="outline">{purchasedItems.length} purchased</Badge>
        {totalEstimate > 0 && (
          <span className="text-muted-foreground ml-auto">
            Est. total: <span className="font-semibold text-foreground">${totalEstimate.toFixed(2)}</span>
          </span>
        )}
      </div>

      {/* AI Recommendations */}
      {showRecommendations && (
        <Card className="bg-primary/5 border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" /> AI Recommendations
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recommend.isPending ? (
              <div className="space-y-2"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-1/2" /></div>
            ) : recommend.data ? (
              <div className="prose prose-sm prose-invert max-w-none">
                <Streamdown>{String(recommend.data.recommendation || '')}</Streamdown>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}

      {/* Items */}
      {itemsLoading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : pendingItems.length === 0 && purchasedItems.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="py-12 text-center">
            <ShoppingCart className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground">No items yet</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => setAddOpen(true)}>
              Add your first item
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {pendingItems.length > 0 && (
            <div className="space-y-1">
              {pendingItems.map((item) => (
                <div
                  key={item.id}
                  className={`flex items-center gap-3 p-3 rounded-lg hover:bg-accent/50 transition-colors group ${
                    selectMode && selectedItems.has(item.id) ? "bg-primary/10 border border-primary/30" : ""
                  } ${
                    editingItemId === item.id ? "bg-accent/30 border border-primary/20 ring-1 ring-primary/20" : ""
                  }`}
                  onClick={selectMode ? () => toggleSelectItem(item.id) : undefined}
                  style={selectMode ? { cursor: "pointer" } : undefined}
                >
                  {selectMode ? (
                    <Checkbox
                      checked={selectedItems.has(item.id)}
                      onCheckedChange={() => toggleSelectItem(item.id)}
                    />
                  ) : (
                    <Checkbox
                      checked={false}
                      onCheckedChange={() => togglePurchased(item)}
                    />
                  )}

                  {/* Inline editing mode */}
                  {editingItemId === item.id ? (
                    <div className="flex-1 min-w-0 space-y-2">
                      <Input
                        ref={editNameRef}
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="h-8 text-sm font-medium"
                        placeholder="Item name"
                        onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") cancelEdit(); }}
                      />
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1 bg-background border border-border rounded-md">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setEditQty(Math.max(1, editQty - 1))}>
                            <Minus className="h-3 w-3" />
                          </Button>
                          <Input
                            type="number"
                            min="1"
                            value={editQty}
                            onChange={(e) => setEditQty(Math.max(1, parseInt(e.target.value) || 1))}
                            className="h-7 w-12 text-center text-sm border-0 p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setEditQty(editQty + 1)}>
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                        <Input
                          value={editUnit}
                          onChange={(e) => setEditUnit(e.target.value)}
                          className="h-7 w-20 text-xs"
                          placeholder="unit"
                        />
                        <Input
                          value={editNotes}
                          onChange={(e) => setEditNotes(e.target.value)}
                          className="h-7 flex-1 text-xs"
                          placeholder="Notes (brand, size...)"
                          onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") cancelEdit(); }}
                        />
                      </div>
                      <div className="flex items-center gap-1">
                        <Button size="sm" className="h-7 text-xs gap-1" onClick={saveEdit}>
                          <Check className="h-3 w-3" /> Save
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={cancelEdit}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    /* Normal display mode */
                    <>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{item.name}</span>
                          {item.category && <Badge variant="outline" className="text-[10px]">{item.category}</Badge>}
                        </div>
                        {item.notes && <p className="text-xs text-muted-foreground mt-0.5">{item.notes}</p>}
                      </div>

                      {/* Quantity stepper — always visible */}
                      {!selectMode && (
                        <div className="flex items-center gap-1 bg-background/50 border border-border rounded-md shrink-0">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={(e) => { e.stopPropagation(); quickUpdateQty(item.id, item.quantity || 1, -1); }}
                            disabled={(item.quantity || 1) <= 1}
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <span className="text-sm font-semibold w-8 text-center tabular-nums">
                            {item.quantity || 1}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={(e) => { e.stopPropagation(); quickUpdateQty(item.id, item.quantity || 1, 1); }}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                          {item.unit && <span className="text-[10px] text-muted-foreground pr-2">{item.unit}</span>}
                        </div>
                      )}

                      {!selectMode && (
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={(e) => { e.stopPropagation(); startEditing(item); }}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          {item.preferredStore && (
                            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" asChild>
                              <a href={getStoreUrl(item.preferredStore, item.name)} target="_blank" rel="noopener noreferrer">
                                {item.preferredStore} <ExternalLink className="h-3 w-3" />
                              </a>
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => deleteItem.mutate({ id: item.id })}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                      {item.estimatedPrice && (
                        <span className="text-sm text-muted-foreground font-medium">${parseFloat(item.estimatedPrice).toFixed(2)}</span>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          {purchasedItems.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider px-3 pt-4">Purchased</p>
              {purchasedItems.map((item) => (
                <div
                  key={item.id}
                  className={`flex items-center gap-3 p-3 rounded-lg opacity-60 group ${
                    selectMode && selectedItems.has(item.id) ? "bg-primary/10 border border-primary/30 opacity-100" : ""
                  }`}
                  onClick={selectMode ? () => toggleSelectItem(item.id) : undefined}
                  style={selectMode ? { cursor: "pointer" } : undefined}
                >
                  {selectMode ? (
                    <Checkbox
                      checked={selectedItems.has(item.id)}
                      onCheckedChange={() => toggleSelectItem(item.id)}
                    />
                  ) : (
                    <Checkbox
                      checked={true}
                      onCheckedChange={() => togglePurchased(item)}
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <span className="text-sm line-through">{item.name}</span>
                  </div>
                  {!selectMode && (
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive opacity-0 group-hover:opacity-100" onClick={() => deleteItem.mutate({ id: item.id })}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
