import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Camera,
  Upload,
  ScanLine,
  ShoppingCart,
  Check,
  X,
  Pencil,
  Trash2,
  ImageIcon,
  Loader2,
  Plus,
  FileImage,
  Sparkles,
} from "lucide-react";
import { useState, useRef, useCallback } from "react";
import { toast } from "sonner";

type ScannedItem = {
  name: string;
  quantity: number;
  unit: string | null;
  category: string;
  notes: string | null;
  selected: boolean;
  editing: boolean;
};

const CATEGORY_COLORS: Record<string, string> = {
  groceries: "bg-primary/15 text-primary border-primary/30",
  household: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  personal_care: "bg-pink-500/15 text-pink-400 border-pink-500/30",
  clothing: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  electronics: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  kids: "bg-[#4F7EC4]/15 text-[#4F7EC4] border-[#4F7EC4]/30",
  office: "bg-slate-500/15 text-slate-400 border-slate-500/30",
  other: "bg-gray-500/15 text-gray-400 border-gray-500/30",
};

export default function ScanList() {
  const utils = trpc.useUtils();
  const { data: lists, isLoading: listsLoading } = trpc.shoppingLists.list.useQuery();

  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [scannedItems, setScannedItems] = useState<ScannedItem[]>([]);
  const [confidence, setConfidence] = useState<number>(0);
  const [rawText, setRawText] = useState<string>("");
  const [imageUrl, setImageUrl] = useState<string>("");
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [selectedListId, setSelectedListId] = useState<string>("");
  const [newListName, setNewListName] = useState("");
  const [showNewListDialog, setShowNewListDialog] = useState(false);
  const [adding, setAdding] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const scanMutation = trpc.listScanner.scan.useMutation({
    onSuccess: (data) => {
      setScannedItems(
        data.items.map((item: any) => ({ ...item, selected: true, editing: false }))
      );
      setConfidence(data.confidence);
      setRawText(data.rawText);
      setImageUrl(data.imageUrl);
      setScanned(true);
      setScanning(false);
      toast.success(`Found ${data.items.length} items on your list!`);
    },
    onError: (err) => {
      setScanning(false);
      toast.error(`Scan failed: ${err.message}`);
    },
  });

  const addToListMutation = trpc.listScanner.addToList.useMutation({
    onSuccess: (data) => {
      setAdding(false);
      utils.shoppingLists.list.invalidate();
      toast.success(`Added ${data.addedCount} items to your shopping list!`);
      // Reset state
      setScannedItems([]);
      setScanned(false);
      setImagePreview(null);
      setSelectedListId("");
    },
    onError: (err) => {
      setAdding(false);
      toast.error(`Failed to add items: ${err.message}`);
    },
  });

  const createListMutation = trpc.shoppingLists.create.useMutation({
    onSuccess: (data) => {
      utils.shoppingLists.list.invalidate();
      setSelectedListId(String(data.id));
      setShowNewListDialog(false);
      setNewListName("");
      toast.success("New list created!");
    },
  });

  const handleFileSelect = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error("Image must be under 10MB");
      return;
    }

    // Show preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setImagePreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);

    // Convert to base64 and scan
    setScanning(true);
    setScanned(false);
    setScannedItems([]);

    const base64Reader = new FileReader();
    base64Reader.onload = (e) => {
      const base64 = (e.target?.result as string).split(",")[1];
      scanMutation.mutate({
        imageBase64: base64,
        fileName: file.name,
        mimeType: file.type,
      });
    };
    base64Reader.readAsDataURL(file);
  }, [scanMutation]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const toggleItem = (index: number) => {
    setScannedItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, selected: !item.selected } : item))
    );
  };

  const toggleAll = () => {
    const allSelected = scannedItems.every((i) => i.selected);
    setScannedItems((prev) => prev.map((item) => ({ ...item, selected: !allSelected })));
  };

  const updateItem = (index: number, updates: Partial<ScannedItem>) => {
    setScannedItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, ...updates } : item))
    );
  };

  const removeItem = (index: number) => {
    setScannedItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddToList = () => {
    const selectedItems = scannedItems.filter((i) => i.selected);
    if (selectedItems.length === 0) {
      toast.error("Select at least one item to add");
      return;
    }
    if (!selectedListId) {
      toast.error("Please select a shopping list");
      return;
    }

    setAdding(true);
    addToListMutation.mutate({
      listId: parseInt(selectedListId),
      items: selectedItems.map(({ name, quantity, unit, category, notes }) => ({
        name,
        quantity,
        unit,
        category,
        notes,
      })),
    });
  };

  const selectedCount = scannedItems.filter((i) => i.selected).length;

  return (
    <div className="container max-w-4xl py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ScanLine className="h-6 w-6 text-primary" />
            Scan Handwritten List
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Take a photo or upload an image of your handwritten shopping list and Geeves will read it for you
          </p>
        </div>
      </div>

      {/* Upload Area */}
      {!scanned && (
        <Card className="border-dashed border-2 border-primary/30 bg-primary/5">
          <CardContent className="p-8">
            <div
              className="flex flex-col items-center justify-center gap-4 cursor-pointer"
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onClick={() => fileInputRef.current?.click()}
            >
              {scanning ? (
                <>
                  <div className="relative">
                    <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center">
                      <Loader2 className="h-10 w-10 text-primary animate-spin" />
                    </div>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-medium text-foreground">Geeves is reading your list...</p>
                    <p className="text-sm text-muted-foreground mt-1">Using AI vision to extract items from your handwriting</p>
                  </div>
                </>
              ) : imagePreview ? (
                <div className="relative w-full max-w-md">
                  <img
                    src={imagePreview}
                    alt="Uploaded list"
                    className="rounded-lg border border-border max-h-64 mx-auto object-contain"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="absolute top-2 right-2"
                    onClick={(e) => {
                      e.stopPropagation();
                      setImagePreview(null);
                      setScanned(false);
                      setScannedItems([]);
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <>
                  <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center">
                    <FileImage className="h-10 w-10 text-primary" />
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-medium text-foreground">Drop your list image here</p>
                    <p className="text-sm text-muted-foreground mt-1">or click to browse files</p>
                  </div>
                  <div className="flex gap-3 mt-2">
                    <Button
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        fileInputRef.current?.click();
                      }}
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Upload Photo
                    </Button>
                    <Button
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        cameraInputRef.current?.click();
                      }}
                    >
                      <Camera className="h-4 w-4 mr-2" />
                      Take Photo
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Supports JPG, PNG, HEIC up to 10MB</p>
                </>
              )}
            </div>

            {/* Hidden file inputs */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelect(file);
                e.target.value = "";
              }}
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelect(file);
                e.target.value = "";
              }}
            />
          </CardContent>
        </Card>
      )}

      {/* Scanned Results */}
      {scanned && scannedItems.length > 0 && (
        <>
          {/* Confidence & Image Preview */}
          <div className="flex flex-col md:flex-row gap-4">
            {imagePreview && (
              <Card className="md:w-1/3">
                <CardContent className="p-3">
                  <img
                    src={imagePreview}
                    alt="Scanned list"
                    className="rounded-lg border border-border w-full object-contain max-h-48"
                  />
                </CardContent>
              </Card>
            )}
            <Card className="flex-1">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Scan Results
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground">Confidence:</span>
                  <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        confidence >= 80
                          ? "bg-primary"
                          : confidence >= 50
                          ? "bg-amber-500"
                          : "bg-red-500"
                      }`}
                      style={{ width: `${confidence}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium">{confidence}%</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <Badge variant="secondary">{scannedItems.length} items found</Badge>
                  <Badge variant="outline" className="text-primary border-primary/30">
                    {selectedCount} selected
                  </Badge>
                </div>
                {rawText && (
                  <details className="text-xs">
                    <summary className="text-muted-foreground cursor-pointer hover:text-foreground">
                      View raw transcription
                    </summary>
                    <pre className="mt-2 p-3 bg-muted/50 rounded-md whitespace-pre-wrap text-muted-foreground">
                      {rawText}
                    </pre>
                  </details>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Items List */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Extracted Items</CardTitle>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={toggleAll}>
                    {scannedItems.every((i) => i.selected) ? "Deselect All" : "Select All"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setScanned(false);
                      setScannedItems([]);
                      setImagePreview(null);
                    }}
                  >
                    <Camera className="h-4 w-4 mr-1" />
                    Scan Another
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {scannedItems.map((item, index) => (
                  <ScannedItemRow
                    key={index}
                    item={item}
                    index={index}
                    onToggle={() => toggleItem(index)}
                    onUpdate={(updates) => updateItem(index, updates)}
                    onRemove={() => removeItem(index)}
                  />
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Add to List Section */}
          <Card className="border-primary/30">
            <CardContent className="p-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
                <div className="flex-1 space-y-2 w-full">
                  <Label className="text-sm font-medium">Add to Shopping List</Label>
                  <div className="flex gap-2">
                    <Select value={selectedListId} onValueChange={setSelectedListId}>
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Select a list..." />
                      </SelectTrigger>
                      <SelectContent>
                        {lists?.map((list: any) => (
                          <SelectItem key={list.id} value={String(list.id)}>
                            {list.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setShowNewListDialog(true)}
                      title="Create new list"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <Button
                  onClick={handleAddToList}
                  disabled={selectedCount === 0 || !selectedListId || adding}
                  className="w-full sm:w-auto"
                >
                  {adding ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <ShoppingCart className="h-4 w-4 mr-2" />
                  )}
                  Add {selectedCount} Item{selectedCount !== 1 ? "s" : ""} to List
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Empty scanned state */}
      {scanned && scannedItems.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center">
            <ImageIcon className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-lg font-medium text-foreground">No items detected</p>
            <p className="text-sm text-muted-foreground mt-1">
              Geeves couldn't read any items from this image. Try a clearer photo with better lighting.
            </p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => {
                setScanned(false);
                setImagePreview(null);
              }}
            >
              Try Again
            </Button>
          </CardContent>
        </Card>
      )}

      {/* New List Dialog */}
      <Dialog open={showNewListDialog} onOpenChange={setShowNewListDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Shopping List</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>List Name</Label>
              <Input
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                placeholder="e.g., Weekly Groceries"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newListName.trim()) {
                    createListMutation.mutate({ name: newListName.trim(), category: "Groceries" });
                  }
                }}
              />
            </div>
            <Button
              className="w-full"
              disabled={!newListName.trim()}
              onClick={() => createListMutation.mutate({ name: newListName.trim(), category: "Groceries" })}
            >
              Create List
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Scanned Item Row Component ─────────────────────────────────────────────

function ScannedItemRow({
  item,
  index,
  onToggle,
  onUpdate,
  onRemove,
}: {
  item: ScannedItem;
  index: number;
  onToggle: () => void;
  onUpdate: (updates: Partial<ScannedItem>) => void;
  onRemove: () => void;
}) {
  const [editName, setEditName] = useState(item.name);
  const [editQty, setEditQty] = useState(String(item.quantity));
  const [editUnit, setEditUnit] = useState(item.unit || "");

  const catColor = CATEGORY_COLORS[item.category] || CATEGORY_COLORS.other;

  if (item.editing) {
    return (
      <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/30 border border-border">
        <Input
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          className="flex-1 h-8 text-sm"
          placeholder="Item name"
        />
        <Input
          value={editQty}
          onChange={(e) => setEditQty(e.target.value)}
          className="w-16 h-8 text-sm text-center"
          type="number"
          min="1"
        />
        <Input
          value={editUnit}
          onChange={(e) => setEditUnit(e.target.value)}
          className="w-20 h-8 text-sm"
          placeholder="unit"
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-primary"
          onClick={() => {
            onUpdate({
              name: editName,
              quantity: parseInt(editQty) || 1,
              unit: editUnit || null,
              editing: false,
            });
          }}
        >
          <Check className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground"
          onClick={() => onUpdate({ editing: false })}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
        item.selected
          ? "bg-primary/5 border-primary/20"
          : "bg-muted/20 border-border opacity-60"
      }`}
    >
      <Checkbox
        checked={item.selected}
        onCheckedChange={onToggle}
        className="data-[state=checked]:bg-primary"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-foreground truncate">{item.name}</span>
          {item.quantity > 1 && (
            <Badge variant="secondary" className="text-[10px]">
              x{item.quantity}
            </Badge>
          )}
          {item.unit && (
            <Badge variant="outline" className="text-[10px]">
              {item.unit}
            </Badge>
          )}
          <Badge variant="outline" className={`text-[10px] ${catColor}`}>
            {item.category}
          </Badge>
        </div>
        {item.notes && (
          <p className="text-xs text-muted-foreground mt-0.5">{item.notes}</p>
        )}
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
          onClick={() => onUpdate({ editing: true })}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-red-400"
          onClick={onRemove}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
