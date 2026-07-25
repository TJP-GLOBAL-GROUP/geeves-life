import { trpc } from "@/lib/trpc";
import { todayISO } from "@/lib/dateUtils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Package, Plus, Mail, Truck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const PLATFORMS = ["Amazon", "Walmart", "Target", "eBay", "Costco", "Other"];
const STATUSES = ["pending", "shipped", "delivered", "cancelled", "returned"] as const;

export default function Orders() {
  const utils = trpc.useUtils();
  const { data: orders, isLoading } = trpc.orders.list.useQuery();
  const createOrder = trpc.orders.create.useMutation({
    onSuccess: () => { utils.orders.list.invalidate(); setManualOpen(false); toast.success("Order added"); },
  });
  const parseEmail = trpc.ai.parseEmailOrder.useMutation({
    onSuccess: () => { utils.orders.list.invalidate(); setEmailOpen(false); setEmailContent(""); toast.success("Order imported from email"); },
    onError: () => toast.error("Failed to parse email"),
  });
  const updateOrder = trpc.orders.update.useMutation({
    onSuccess: () => { utils.orders.list.invalidate(); toast.success("Order updated"); },
  });

  const [manualOpen, setManualOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailContent, setEmailContent] = useState("");
  const [platform, setPlatform] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [vendor, setVendor] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [orderDate, setOrderDate] = useState(() => todayISO());

  const handleManualCreate = () => {
    if (!platform || !orderDate) return;
    createOrder.mutate({
      platform,
      orderNumber: orderNumber || null,
      vendor: vendor || null,
      totalAmount: amount || null,
      currency,
      orderDate: new Date(orderDate).toISOString(),
      importSource: "manual",
    });
    setPlatform(""); setOrderNumber(""); setVendor(""); setAmount(""); setCurrency("USD");
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "delivered": return "default";
      case "shipped": return "secondary";
      case "pending": return "outline";
      case "cancelled": return "destructive";
      default: return "secondary";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>Orders</h1>
          <p className="text-muted-foreground text-sm mt-1">Track purchases across all platforms</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={emailOpen} onOpenChange={setEmailOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2"><Mail className="h-4 w-4" /> Import Email</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Import Order from Email</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-2">
                <p className="text-sm text-muted-foreground">Paste an order confirmation email and our AI will extract the details.</p>
                <Textarea
                  placeholder="Paste your order confirmation email here..."
                  value={emailContent}
                  onChange={(e) => setEmailContent(e.target.value)}
                  className="min-h-[200px]"
                />
                <Button onClick={() => parseEmail.mutate({ emailContent })} disabled={!emailContent.trim() || parseEmail.isPending} className="w-full">
                  {parseEmail.isPending ? "Parsing..." : "Import Order"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={manualOpen} onOpenChange={setManualOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2"><Plus className="h-4 w-4" /> Add Order</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Order Manually</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Platform</Label>
                    <Select value={platform} onValueChange={setPlatform}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>{PLATFORMS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Order Number</Label>
                    <Input placeholder="Optional" value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Vendor / Seller</Label>
                  <Input placeholder="e.g., Amazon.com" value={vendor} onChange={(e) => setVendor(e.target.value)} />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Amount</Label>
                    <Input type="number" step="0.01" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Currency</Label>
                    <Select value={currency} onValueChange={setCurrency}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="USD">USD</SelectItem>
                        <SelectItem value="JMD">JMD</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Date</Label>
                    <Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
                  </div>
                </div>
                <Button onClick={handleManualCreate} disabled={!platform || createOrder.isPending} className="w-full">
                  {createOrder.isPending ? "Adding..." : "Add Order"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : !orders || orders.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="py-12 text-center">
            <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground">No orders tracked yet</p>
            <p className="text-xs text-muted-foreground mt-1">Import from email or add manually</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-card border-border">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Platform</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Order #</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-medium">{order.platform}</TableCell>
                    <TableCell>{order.vendor || "—"}</TableCell>
                    <TableCell className="text-xs font-mono">{order.orderNumber || "—"}</TableCell>
                    <TableCell>{order.orderDate ? new Date(order.orderDate).toLocaleDateString() : "—"}</TableCell>
                    <TableCell>
                      {order.totalAmount ? `${order.currency === "JMD" ? "J$" : "$"}${parseFloat(order.totalAmount).toFixed(2)}` : "—"}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={order.status}
                        onValueChange={(val) => updateOrder.mutate({ id: order.id, status: val as any })}
                      >
                        <SelectTrigger className="h-7 w-28 text-xs">
                          <Badge variant={statusColor(order.status) as any} className="text-[10px]">{order.status}</Badge>
                        </SelectTrigger>
                        <SelectContent>
                          {STATUSES.map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">{order.importSource}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
