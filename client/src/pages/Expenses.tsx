import { trpc } from "@/lib/trpc";
import { todayISO } from "@/lib/dateUtils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Receipt,
  Plus,
  Sparkles,
  Trash2,
  FileText,
  TrendingDown,
  Briefcase,
  User,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const EXPENSE_CATEGORIES = [
  "Groceries", "Clothing", "Utilities", "Rent/Mortgage", "Transportation",
  "Dining Out", "Entertainment", "Healthcare", "Education", "Insurance",
  "Office Supplies", "Software", "Equipment", "Travel", "Marketing",
  "Professional Services", "Subscriptions", "Other",
];

export default function Expenses() {
  const utils = trpc.useUtils();
  const [tab, setTab] = useState("all");
  const { data: allTransactions, isLoading } = trpc.transactions.list.useQuery(
    tab === "all" ? undefined : { classification: tab as any }
  );
  const { data: summary, isLoading: summaryLoading } = trpc.transactions.summary.useQuery();
  const { data: byCategory } = trpc.transactions.byCategory.useQuery();
  const { data: accounts } = trpc.bankAccounts.list.useQuery();

  const createTransaction = trpc.transactions.create.useMutation({
    onSuccess: () => {
      utils.transactions.list.invalidate();
      utils.transactions.summary.invalidate();
      utils.transactions.byCategory.invalidate();
      setOpen(false);
      toast.success("Expense added");
    },
  });
  const categorize = trpc.ai.categorizeExpense.useMutation();
  const deleteTransaction = trpc.transactions.delete.useMutation({
    onSuccess: () => {
      utils.transactions.list.invalidate();
      utils.transactions.summary.invalidate();
      utils.transactions.byCategory.invalidate();
      toast.success("Expense deleted");
    },
  });
  const updateTransaction = trpc.transactions.update.useMutation({
    onSuccess: () => {
      utils.transactions.list.invalidate();
      utils.transactions.summary.invalidate();
      toast.success("Expense updated");
    },
  });

  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [type, setType] = useState<"expense" | "income">("expense");
  const [expenseCategory, setExpenseCategory] = useState("");
  const [classification, setClassification] = useState<"personal" | "business">("personal");
  const [vendor, setVendor] = useState("");
  const [notes, setNotes] = useState("");
  const [isTaxDeductible, setIsTaxDeductible] = useState(false);
  const [taxCategory, setTaxCategory] = useState("");
  const [transactionDate, setTransactionDate] = useState(() => todayISO());
  const [bankAccountId, setBankAccountId] = useState("");

  const handleCreate = () => {
    if (!description.trim() || !amount) return;
    createTransaction.mutate({
      description: description.trim(),
      amount,
      currency,
      type,
      expenseCategory: expenseCategory || null,
      classification,
      vendor: vendor || null,
      notes: notes || null,
      isTaxDeductible,
      taxCategory: taxCategory || null,
      transactionDate: new Date(transactionDate).toISOString(),
      bankAccountId: bankAccountId ? parseInt(bankAccountId) : null,
    });
    setDescription(""); setAmount(""); setVendor(""); setNotes(""); setExpenseCategory(""); setTaxCategory("");
  };

  const handleAICategorize = async () => {
    if (!description.trim() || !amount) return;
    const result = await categorize.mutateAsync({ description, vendor, amount });
    setClassification(result.classification as any);
    setExpenseCategory(result.expenseCategory);
    setIsTaxDeductible(result.isTaxDeductible);
    if (result.taxCategory) setTaxCategory(result.taxCategory);
    toast.success(`AI suggests: ${result.classification} — ${result.expenseCategory} (${result.confidence}% confidence)`);
  };

  const formatCurrency = (amt: string, cur: string) =>
    `${cur === "JMD" ? "J$" : "$"}${parseFloat(amt).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>Expenses</h1>
          <p className="text-muted-foreground text-sm mt-1">Track and categorize personal and business expenses</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2"><Plus className="h-4 w-4" /> Add Expense</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Add Expense</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2 max-h-[70vh] overflow-y-auto">
              <div className="space-y-2">
                <Label>Description</Label>
                <Input placeholder="e.g., Office supplies from Staples" value={description} onChange={(e) => setDescription(e.target.value)} />
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
                  <Label>Type</Label>
                  <Select value={type} onValueChange={(v) => setType(v as any)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="expense">Expense</SelectItem>
                      <SelectItem value="income">Income</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Vendor</Label>
                  <Input placeholder="e.g., Staples" value={vendor} onChange={(e) => setVendor(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Date</Label>
                  <Input type="date" value={transactionDate} onChange={(e) => setTransactionDate(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select value={expenseCategory} onValueChange={setExpenseCategory}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{EXPENSE_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Classification</Label>
                  <Select value={classification} onValueChange={(v) => setClassification(v as any)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="personal">Personal</SelectItem>
                      <SelectItem value="business">Business</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {accounts && accounts.length > 0 && (
                <div className="space-y-2">
                  <Label>Bank Account</Label>
                  <Select value={bankAccountId} onValueChange={setBankAccountId}>
                    <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {accounts.map(a => <SelectItem key={a.id} value={a.id.toString()}>{a.accountName} ({a.institution})</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="flex items-center justify-between">
                <Label>Tax Deductible</Label>
                <Switch checked={isTaxDeductible} onCheckedChange={setIsTaxDeductible} />
              </div>
              {isTaxDeductible && (
                <div className="space-y-2">
                  <Label>Tax Category</Label>
                  <Input placeholder="e.g., Business expense" value={taxCategory} onChange={(e) => setTaxCategory(e.target.value)} />
                </div>
              )}
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea placeholder="Additional notes..." value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleAICategorize} disabled={!description.trim() || !amount || categorize.isPending} className="gap-2 flex-1">
                  <Sparkles className="h-4 w-4" />
                  {categorize.isPending ? "Analyzing..." : "AI Categorize"}
                </Button>
                <Button onClick={handleCreate} disabled={!description.trim() || !amount || createTransaction.isPending} className="flex-1">
                  {createTransaction.isPending ? "Adding..." : "Add"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <User className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Personal</p>
            </div>
            {summaryLoading ? <Skeleton className="h-8 w-24" /> : (
              <p className="text-xl font-bold">${parseFloat(summary?.personal || "0").toLocaleString("en-US", { minimumFractionDigits: 2 })}</p>
            )}
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Briefcase className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Business</p>
            </div>
            {summaryLoading ? <Skeleton className="h-8 w-24" /> : (
              <p className="text-xl font-bold">${parseFloat(summary?.business || "0").toLocaleString("en-US", { minimumFractionDigits: 2 })}</p>
            )}
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Total</p>
            </div>
            {summaryLoading ? <Skeleton className="h-8 w-24" /> : (
              <p className="text-xl font-bold">${parseFloat(summary?.total || "0").toLocaleString("en-US", { minimumFractionDigits: 2 })}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="personal">Personal</TabsTrigger>
          <TabsTrigger value="business">Business</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          {isLoading ? (
            <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
          ) : !allTransactions || allTransactions.length === 0 ? (
            <Card className="bg-card border-border">
              <CardContent className="py-12 text-center">
                <Receipt className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground">No expenses recorded yet</p>
              </CardContent>
            </Card>
          ) : (
            <Card className="bg-card border-border">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Tax</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allTransactions.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="text-xs">{new Date(t.transactionDate).toLocaleDateString()}</TableCell>
                        <TableCell className="font-medium text-sm max-w-[200px] truncate">{t.description}</TableCell>
                        <TableCell className="text-sm">{t.vendor || "—"}</TableCell>
                        <TableCell>
                          {t.expenseCategory ? <Badge variant="secondary" className="text-[10px]">{t.expenseCategory}</Badge> : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={t.classification === "business" ? "default" : "outline"} className="text-[10px]">
                            {t.classification}
                          </Badge>
                        </TableCell>
                        <TableCell className={`font-medium ${t.type === "income" ? "text-green-500" : ""}`}>
                          {t.type === "income" ? "+" : "-"}{formatCurrency(t.amount, t.currency)}
                        </TableCell>
                        <TableCell>
                          {t.isTaxDeductible ? (
                            <Badge variant="outline" className="text-[10px]" style={{ color: "#4F7EC4", borderColor: "rgba(79,126,196,0.3)" }}>
                              <FileText className="h-3 w-3 mr-1" /> Tax
                            </Badge>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => deleteTransaction.mutate({ id: t.id })}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
