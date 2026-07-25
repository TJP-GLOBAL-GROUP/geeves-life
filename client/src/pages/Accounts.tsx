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
import {
  CreditCard,
  Plus,
  Trash2,
  Building2,
  Wallet,
  TrendingUp,
  Calendar,
  Receipt,
} from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";

const INSTITUTIONS = [
  "Bank of America",
  "American Express",
  "Scotiabank Jamaica",
  "Chase",
  "Wells Fargo",
  "Other",
];

const ACCOUNT_TYPES = [
  { value: "checking", label: "Checking" },
  { value: "savings", label: "Savings" },
  { value: "credit_card", label: "Credit Card" },
  { value: "business_checking", label: "Business Checking" },
  { value: "business_savings", label: "Business Savings" },
  { value: "business_credit", label: "Business Credit" },
] as const;

export default function Accounts() {
  const utils = trpc.useUtils();
  const { data: accounts, isLoading } = trpc.bankAccounts.list.useQuery();
  const createAccount = trpc.bankAccounts.create.useMutation({
    onSuccess: () => { utils.bankAccounts.list.invalidate(); setOpen(false); toast.success("Account added"); },
  });
  const deleteAccount = trpc.bankAccounts.delete.useMutation({
    onSuccess: () => { utils.bankAccounts.list.invalidate(); toast.success("Account removed"); },
  });
  const updateAccount = trpc.bankAccounts.update.useMutation({
    onSuccess: () => { utils.bankAccounts.list.invalidate(); toast.success("Balance updated"); },
  });

  const [open, setOpen] = useState(false);
  const [institution, setInstitution] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountType, setAccountType] = useState<string>("");
  const [category, setCategory] = useState<"personal" | "business">("personal");
  const [currency, setCurrency] = useState("USD");
  const [lastFour, setLastFour] = useState("");
  const [balance, setBalance] = useState("");

  const handleCreate = () => {
    if (!institution || !accountName || !accountType) return;
    createAccount.mutate({
      institution,
      accountName,
      accountType: accountType as any,
      category,
      currency,
      lastFourDigits: lastFour || null,
      currentBalance: balance || "0",
    });
    setInstitution(""); setAccountName(""); setAccountType(""); setCategory("personal"); setCurrency("USD"); setLastFour(""); setBalance("");
  };

  // Time period filter for expense summary
  const [expensePeriod, setExpensePeriod] = useState<"this_month" | "last_month" | "this_year" | "all">("this_month");
  const expenseDateRange = useMemo(() => {
    const now = new Date();
    if (expensePeriod === "this_month") {
      return { fromTs: new Date(now.getFullYear(), now.getMonth(), 1).getTime(), toTs: now.getTime() };
    } else if (expensePeriod === "last_month") {
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
      return { fromTs: lastMonth.getTime(), toTs: endOfLastMonth.getTime() };
    } else if (expensePeriod === "this_year") {
      return { fromTs: new Date(now.getFullYear(), 0, 1).getTime(), toTs: now.getTime() };
    }
    return { fromTs: undefined, toTs: undefined };
  }, [expensePeriod]);

  // Expense totals by account
  const { data: expensesByAccount } = trpc.expenseCategorisation.getExpensesByAccount.useQuery(
    { fromTs: expenseDateRange.fromTs, toTs: expenseDateRange.toTs },
    { staleTime: 5 * 60 * 1000 }
  );

  const personalAccounts = accounts?.filter(a => a.category === "personal") || [];
  const businessAccounts = accounts?.filter(a => a.category === "business") || [];

  const totalByCategory = (accts: typeof personalAccounts, cur: string) =>
    accts.filter(a => a.currency === cur).reduce((sum, a) => sum + parseFloat(a.currentBalance || "0"), 0);

  const formatCurrency = (amount: number, cur: string) =>
    `${cur === "JMD" ? "J$" : "$"}${amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

  const AccountCard = ({ account }: { account: any }) => {
    const [editing, setEditing] = useState(false);
    const [newBalance, setNewBalance] = useState(account.currentBalance || "0");

    return (
      <div className="flex items-center justify-between p-4 rounded-lg border border-border hover:border-primary/20 transition-colors">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-accent flex items-center justify-center">
            {account.accountType.includes("credit") ? (
              <CreditCard className="h-5 w-5 text-muted-foreground" />
            ) : (
              <Building2 className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
          <div>
            <p className="text-sm font-medium">{account.accountName}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-muted-foreground">{account.institution}</span>
              {account.lastFourDigits && (
                <span className="text-xs text-muted-foreground">••••{account.lastFourDigits}</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            {editing ? (
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  step="0.01"
                  value={newBalance}
                  onChange={(e) => setNewBalance(e.target.value)}
                  className="h-8 w-32 text-right text-sm"
                />
                <Button
                  size="sm"
                  className="h-8"
                  onClick={() => {
                    updateAccount.mutate({ id: account.id, currentBalance: newBalance });
                    setEditing(false);
                  }}
                >
                  Save
                </Button>
              </div>
            ) : (
              <p
                className="text-sm font-semibold cursor-pointer transition-colors hover:text-[#4F7EC4]"
                onClick={() => setEditing(true)}
                title="Click to update balance"
              >
                {formatCurrency(parseFloat(account.currentBalance || "0"), account.currency)}
              </p>
            )}
            <Badge variant="outline" className="text-[10px] mt-0.5">{account.currency}</Badge>
          </div>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive" onClick={() => deleteAccount.mutate({ id: account.id })}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>Accounts</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage your bank accounts and balances</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2"><Plus className="h-4 w-4" /> Add Account</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Bank Account</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Institution</Label>
                <Select value={institution} onValueChange={setInstitution}>
                  <SelectTrigger><SelectValue placeholder="Select bank" /></SelectTrigger>
                  <SelectContent>{INSTITUTIONS.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Account Name</Label>
                <Input placeholder="e.g., Personal Checking" value={accountName} onChange={(e) => setAccountName(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Account Type</Label>
                  <Select value={accountType} onValueChange={setAccountType}>
                    <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
                    <SelectContent>{ACCOUNT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select value={category} onValueChange={(v) => setCategory(v as any)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="personal">Personal</SelectItem>
                      <SelectItem value="business">Business</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
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
                  <Label>Last 4 Digits</Label>
                  <Input maxLength={4} placeholder="1234" value={lastFour} onChange={(e) => setLastFour(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Balance</Label>
                  <Input type="number" step="0.01" placeholder="0.00" value={balance} onChange={(e) => setBalance(e.target.value)} />
                </div>
              </div>
              <Button onClick={handleCreate} disabled={!institution || !accountName || !accountType || createAccount.isPending} className="w-full">
                {createAccount.isPending ? "Adding..." : "Add Account"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Expense Summary by Account */}
      {expensesByAccount && expensesByAccount.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Receipt className="h-4 w-4 text-muted-foreground" />
                Expense Summary by Account
              </CardTitle>
              <Select value={expensePeriod} onValueChange={(v) => setExpensePeriod(v as any)}>
                <SelectTrigger className="w-[140px] h-8 text-xs">
                  <Calendar className="h-3 w-3 mr-1" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="this_month">This Month</SelectItem>
                  <SelectItem value="last_month">Last Month</SelectItem>
                  <SelectItem value="this_year">This Year</SelectItem>
                  <SelectItem value="all">All Time</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2">
              {expensesByAccount.map((ea: any) => (
                <div key={ea.accountId} className="flex items-center justify-between p-3 rounded-lg border border-border/50 hover:border-primary/20 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-md bg-red-500/10 flex items-center justify-center">
                      <CreditCard className="h-4 w-4 text-red-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{ea.accountName}</p>
                      <p className="text-xs text-muted-foreground">{ea.institution}{ea.lastFourDigits ? ` ••••${ea.lastFourDigits}` : ''}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-red-400">
                      −{ea.currency === "JMD" ? "J$" : "$"}{ea.totalExpenses.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{ea.orderCount} order{ea.orderCount !== 1 ? 's' : ''}</p>
                  </div>
                </div>
              ))}
              <div className="flex justify-between pt-2 border-t border-border/50">
                <span className="text-sm font-medium">Total Expenses</span>
                <span className="text-sm font-bold text-red-400">
                  −${expensesByAccount.reduce((s: number, ea: any) => s + ea.totalExpenses, 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Personal (USD)</p>
            {isLoading ? <Skeleton className="h-8 w-24 mt-1" /> : (
              <p className="text-xl font-bold mt-1">{formatCurrency(totalByCategory(personalAccounts, "USD"), "USD")}</p>
            )}
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Business (USD)</p>
            {isLoading ? <Skeleton className="h-8 w-24 mt-1" /> : (
              <p className="text-xl font-bold mt-1">{formatCurrency(totalByCategory(businessAccounts, "USD"), "USD")}</p>
            )}
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Personal (JMD)</p>
            {isLoading ? <Skeleton className="h-8 w-24 mt-1" /> : (
              <p className="text-xl font-bold mt-1">{formatCurrency(totalByCategory(personalAccounts, "JMD"), "JMD")}</p>
            )}
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Business (JMD)</p>
            {isLoading ? <Skeleton className="h-8 w-24 mt-1" /> : (
              <p className="text-xl font-bold mt-1">{formatCurrency(totalByCategory(businessAccounts, "JMD"), "JMD")}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : !accounts || accounts.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="py-12 text-center">
            <Wallet className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground">No accounts added yet</p>
            <p className="text-xs text-muted-foreground mt-1">Add your Bank of America, Amex, and Scotiabank accounts</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {personalAccounts.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Personal Accounts</h2>
              {personalAccounts.map(a => <AccountCard key={a.id} account={a} />)}
            </div>
          )}
          {businessAccounts.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Business Accounts</h2>
              {businessAccounts.map(a => <AccountCard key={a.id} account={a} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
