import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  ShoppingCart,
  Plus,
  Archive,
  CheckCircle2,
  Clock,
  Trash2,
  MoreVertical,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

const CATEGORIES = ["Groceries", "Clothing", "Household", "Electronics", "Personal Care", "Kids", "Office", "Other"];

export default function Shopping() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const { data: lists, isLoading } = trpc.shoppingLists.list.useQuery();
  const createList = trpc.shoppingLists.create.useMutation({
    onSuccess: () => {
      utils.shoppingLists.list.invalidate();
      setOpen(false);
      toast.success("Shopping list created");
    },
  });
  const updateList = trpc.shoppingLists.update.useMutation({
    onSuccess: () => {
      utils.shoppingLists.list.invalidate();
      toast.success("List updated");
    },
  });
  const deleteList = trpc.shoppingLists.delete.useMutation({
    onSuccess: () => {
      utils.shoppingLists.list.invalidate();
      toast.success("List deleted");
    },
  });

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringSchedule, setRecurringSchedule] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "completed" | "archived">("all");

  const filteredLists = lists?.filter((l) => filter === "all" || l.status === filter) || [];

  const handleCreate = () => {
    if (!name.trim()) return;
    createList.mutate({
      name: name.trim(),
      description: description || null,
      category: category || null,
      isRecurring,
      recurringSchedule: recurringSchedule || null,
    });
    setName("");
    setDescription("");
    setCategory("");
    setIsRecurring(false);
    setRecurringSchedule("");
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case "active": return <Clock className="h-3.5 w-3.5" style={{ color: "#D4A017" }} />;
      case "completed": return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />;
      case "archived": return <Archive className="h-3.5 w-3.5 text-muted-foreground" />;
      default: return null;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
            Shopping Lists
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage your shopping lists and track items
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2">
              <Plus className="h-4 w-4" />
              New List
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Shopping List</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input placeholder="e.g., Weekly Groceries" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea placeholder="Optional description..." value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between">
                <Label>Recurring</Label>
                <Switch checked={isRecurring} onCheckedChange={setIsRecurring} />
              </div>
              {isRecurring && (
                <div className="space-y-2">
                  <Label>Schedule</Label>
                  <Select value={recurringSchedule} onValueChange={setRecurringSchedule}>
                    <SelectTrigger><SelectValue placeholder="Select frequency" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="biweekly">Bi-weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <Button onClick={handleCreate} disabled={!name.trim() || createList.isPending} className="w-full">
                {createList.isPending ? "Creating..." : "Create List"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {(["all", "active", "completed", "archived"] as const).map((f) => (
          <Button
            key={f}
            variant={filter === f ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(f)}
            className="capitalize"
          >
            {f}
          </Button>
        ))}
      </div>

      {/* Lists */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-40" />)}
        </div>
      ) : filteredLists.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="py-12 text-center">
            <ShoppingCart className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground">No shopping lists found</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => setOpen(true)}>
              Create your first list
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredLists.map((list) => (
            <Card
              key={list.id}
              className="bg-card border-border hover:border-primary/30 transition-colors cursor-pointer group"
              onClick={() => setLocation(`/shopping/${list.id}`)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    {statusIcon(list.status)}
                    <CardTitle className="text-base font-semibold">{list.name}</CardTitle>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {list.status === "active" && (
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); updateList.mutate({ id: list.id, status: "completed" }); }}>
                          <CheckCircle2 className="mr-2 h-4 w-4" /> Mark Complete
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); updateList.mutate({ id: list.id, status: "archived" }); }}>
                        <Archive className="mr-2 h-4 w-4" /> Archive
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={(e) => { e.stopPropagation(); deleteList.mutate({ id: list.id }); }}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="mr-2 h-4 w-4" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent>
                {list.description && (
                  <p className="text-sm text-muted-foreground mb-2 line-clamp-2">{list.description}</p>
                )}
                <div className="flex items-center gap-2 flex-wrap">
                  {list.category && <Badge variant="secondary" className="text-xs">{list.category}</Badge>}
                  {list.isRecurring && <Badge variant="outline" className="text-xs">🔄 {list.recurringSchedule}</Badge>}
                  <span className="text-xs text-muted-foreground ml-auto">
                    {new Date(list.updatedAt).toLocaleDateString()}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
