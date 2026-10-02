import { Fragment, useEffect, useMemo, useState, useCallback } from "react";
import { useTaxSettings } from "@/lib/tax";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import type { Subscription, SubscriptionPayment } from "@/lib/db-types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Pencil, Trash2, CreditCard, Landmark, CalendarClock,
  RepeatIcon, Wallet, ChevronDown, Check, X,
} from "lucide-react";

type Category = "prive" | "zakelijk";

const billingCycleLabels: Record<string, string> = {
  wekelijks: "Weekly",
  maandelijks: "Monthly",
  kwartaal: "Quarterly",
  halfjaarlijks: "Every 6 months",
  jaarlijks: "Yearly",
};

const billingCycleMonthly: Record<string, number> = {
  wekelijks: 52 / 12,
  maandelijks: 1,
  kwartaal: 1 / 3,
  halfjaarlijks: 1 / 6,
  jaarlijks: 1 / 12,
};

const billingCycleMonths: Record<string, number> = {
  wekelijks: 0,
  maandelijks: 1,
  kwartaal: 3,
  halfjaarlijks: 6,
  jaarlijks: 12,
};

const paymentMethodIcons: Record<string, typeof CreditCard> = {
  creditcard: CreditCard,
  rekening: Landmark,
};

const paymentMethodLabels: Record<string, string> = {
  rekening: "Bank",
  creditcard: "Credit card",
  ideal: "iDEAL",
  paypal: "PayPal",
  incasso: "Direct debit",
  overig: "Other",
};

const monthNames = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const emptyForm: Partial<Subscription> = {
  name: "",
  category: "prive",
  contract_number: "",
  amount: 0,
  billing_cycle: "maandelijks",
  payment_method: "",
  contract_end_date: "",
  next_payment_date: "",
  notes: "",
  tags: [],
};

function formatDate(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function daysUntil(d: string | null | undefined): number | null {
  if (!d) return null;
  const target = new Date(d);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function generatePeriods(sub: Subscription): string[] {
  const months = billingCycleMonths[sub.billing_cycle];
  if (!months) return [];

  const now = new Date();
  const currentYear = now.getFullYear();
  const periods: string[] = [];

  const startDate = sub.next_payment_date
    ? new Date(sub.next_payment_date)
    : new Date(sub.created_at);

  const startMonth = startDate.getMonth();
  const startYear = startDate.getFullYear();

  const rangeStart = new Date(currentYear - 1, 0, 1);
  const rangeEnd = new Date(currentYear, 11, 31);

  const cursor = new Date(startYear, startMonth, 1);

  if (cursor > rangeEnd) {
    while (cursor > rangeStart) {
      cursor.setMonth(cursor.getMonth() - months);
    }
    cursor.setMonth(cursor.getMonth() + months);
  }

  while (cursor < rangeStart) {
    cursor.setMonth(cursor.getMonth() + months);
  }

  while (cursor <= rangeEnd) {
    periods.push(cursor.toISOString().slice(0, 7));
    cursor.setMonth(cursor.getMonth() + months);
  }

  return periods;
}

function PaymentTimeline({
  sub,
  payments,
  onToggle,
}: {
  sub: Subscription;
  payments: SubscriptionPayment[];
  onToggle: (periodDate: string) => void;
}) {
  const periods = useMemo(() => generatePeriods(sub), [sub]);
  const paidSet = useMemo(
    () => new Set(payments.filter((p) => p.paid).map((p) => p.period_date)),
    [payments],
  );

  const now = new Date();
  const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  if (periods.length === 0) return null;

  return (
    <div className="space-y-2 pt-3 border-t">
      <p className="text-xs font-medium text-muted-foreground">Payment history</p>
      <div className="grid grid-cols-4 gap-1.5">
        {periods.map((period) => {
          const [y, m] = period.split("-");
          const monthIdx = parseInt(m!, 10) - 1;
          const isPaid = paidSet.has(period);
          const isCurrent = period === currentPeriod;
          const isFuture = period > currentPeriod;

          return (
            <button
              key={period}
              onClick={() => onToggle(period)}
              className={`
                flex flex-col items-center gap-0.5 rounded-md px-1 py-1.5 text-[11px] transition-all
                ${isPaid
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/25"
                  : isFuture
                    ? "bg-muted/50 text-muted-foreground/50 hover:bg-muted"
                    : "bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20"
                }
                ${isCurrent ? "ring-1 ring-primary/50" : ""}
              `}
            >
              <span className="font-medium">{monthNames[monthIdx]}</span>
              <span className="text-[9px] opacity-70">{y}</span>
              {isPaid ? (
                <Check className="h-3 w-3" />
              ) : isFuture ? (
                <span className="h-3 w-3" />
              ) : (
                <X className="h-3 w-3" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function Subscriptions() {
  const { currency } = useTaxSettings();
  const formatCurrency = (n: number) => n.toLocaleString(undefined, { style: "currency", currency });
  const { currencySymbol: cs } = useTaxSettings();
  const { user } = useAuth();
  const { toast } = useToast();
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [form, setForm] = useState<Partial<Subscription>>(emptyForm);
  const [editId, setEditId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<Category>("prive");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [payments, setPayments] = useState<Record<string, SubscriptionPayment[]>>({});
  const [search, setSearch] = useState("");
  const [cycleFilter, setCycleFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");

  const fetchSubscriptions = async () => {
    const data = await api.getSubscriptions();
    setSubscriptions(data);
  };

  useEffect(() => {
    if (user) fetchSubscriptions();
  }, [user]);

  const fetchPayments = useCallback(async (subId: string) => {
    const data = await api.getSubscriptionPayments(subId);
    setPayments((prev) => ({ ...prev, [subId]: data }));
  }, []);

  useEffect(() => {
    if (!subscriptions.length) return;
    const missing = subscriptions.filter((s) => !payments[s.id]).map((s) => s.id);
    if (!missing.length) return;
    Promise.all(
      missing.map(async (id) => {
        try {
          const data = await api.getSubscriptionPayments(id);
          return { id, data };
        } catch {
          return { id, data: [] as SubscriptionPayment[] };
        }
      }),
    ).then((rows) => {
      setPayments((prev) => {
        const next = { ...prev };
        for (const row of rows) next[row.id] = row.data;
        return next;
      });
    });
  }, [subscriptions, payments]);

  const handleExpand = useCallback(
    (subId: string) => {
      if (expandedId === subId) {
        setExpandedId(null);
      } else {
        setExpandedId(subId);
        if (!payments[subId]) fetchPayments(subId);
      }
    },
    [expandedId, payments, fetchPayments],
  );

  const handleTogglePayment = useCallback(
    async (subId: string, periodDate: string) => {
      try {
        await api.toggleSubscriptionPayment(subId, periodDate);
        await fetchPayments(subId);
      } catch (error: unknown) {
        toast({ title: "Error", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
      }
    },
    [fetchPayments, toast],
  );

  const filtered = useMemo(
    () =>
      subscriptions.filter((s) => {
        if (s.category !== category) return false;
        if (cycleFilter !== "all" && s.billing_cycle !== cycleFilter) return false;
        const q = search.trim().toLowerCase();
        if (
          q &&
          !s.name.toLowerCase().includes(q) &&
          !(s.contract_number ?? "").toLowerCase().includes(q) &&
          !(s.notes ?? "").toLowerCase().includes(q) &&
          !(s.tags ?? []).join(" ").toLowerCase().includes(q)
        ) {
          return false;
        }
        if (tagFilter !== "all" && !(s.tags ?? []).includes(tagFilter)) return false;
        const now = new Date();
        const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
        const dueThisMonth = generatePeriods(s).includes(currentPeriod);
        const paidThisMonth = (payments[s.id] ?? []).some((p) => p.period_date === currentPeriod && p.paid);
        if (paymentFilter === "paid" && !paidThisMonth) return false;
        if (paymentFilter === "open" && (!dueThisMonth || paidThisMonth)) return false;
        if (paymentFilter === "na" && dueThisMonth) return false;
        return true;
      }),
    [subscriptions, category, cycleFilter, search, paymentFilter, tagFilter, payments],
  );

  const allTags = useMemo(
    () =>
      Array.from(
        new Set(
          subscriptions.flatMap((s) => s.tags ?? []).map((t) => t.trim()).filter(Boolean),
        ),
      ).sort((a, b) => a.localeCompare(b)),
    [subscriptions],
  );

  const monthlyTotal = useMemo(
    () =>
      filtered.reduce((sum, s) => {
        const factor = billingCycleMonthly[s.billing_cycle] ?? 1;
        return sum + s.amount * factor;
      }, 0),
    [filtered],
  );

  const handleSave = async () => {
    if (!user || !form.name?.trim()) {
      toast({ title: "Enter a name", variant: "destructive" });
      return;
    }
    try {
      const payload = {
        ...form,
        name: form.name.trim(),
        category,
        contract_number: form.contract_number?.trim() || null,
        payment_method: form.payment_method?.trim() || null,
        contract_end_date: form.contract_end_date || null,
        next_payment_date: form.next_payment_date || null,
        notes: form.notes?.trim() || null,
        tags: (form.tags ?? []).map((t) => t.trim()).filter(Boolean),
      };
      if (editId) {
        await api.updateSubscription(editId, payload);
        toast({ title: "Subscription updated" });
      } else {
        await api.createSubscription(payload as Partial<Subscription> & { name: string });
        toast({ title: "Subscription added" });
      }
      setOpen(false);
      setForm(emptyForm);
      setEditId(null);
      fetchSubscriptions();
    } catch (error: unknown) {
      toast({ title: "Error", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    }
  };

  const handleEdit = (sub: Subscription) => {
    setForm({
      ...sub,
      contract_number: sub.contract_number ?? "",
      payment_method: sub.payment_method ?? "",
      contract_end_date: sub.contract_end_date ?? "",
      next_payment_date: sub.next_payment_date ?? "",
      notes: sub.notes ?? "",
      tags: sub.tags ?? [],
    });
    setEditId(sub.id);
    setOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this subscription?")) return;
    await api.deleteSubscription(id);
    fetchSubscriptions();
    toast({ title: "Subscription deleted" });
  };

  const updateField = (field: string, value: string | number | null | undefined) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const quickTags = ["Essential", "Luxury", "Hobby", "Leisure", "Work", "Health", "Entertainment", "Savings"];

  const preserveScroll = (updater: () => void) => {
    const y = window.scrollY;
    updater();
    requestAnimationFrame(() => {
      window.scrollTo({ top: y });
    });
  };

  const toggleTag = (tag: string) => {
    preserveScroll(() => {
      setForm((prev) => {
        const current = prev.tags ?? [];
        if (current.includes(tag)) {
          return { ...prev, tags: current.filter((t) => t !== tag) };
        }
        return { ...prev, tags: [...current, tag] };
      });
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Subscriptions</h1>
        <Dialog
          open={open}
          onOpenChange={(v) => {
            setOpen(v);
            if (!v) {
              setForm(emptyForm);
              setEditId(null);
            }
          }}
        >
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add subscription
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editId ? "Edit subscription" : "New subscription"}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>Name *</Label>
                <Input
                  placeholder="e.g. Netflix, Spotify, Adobe…"
                  value={form.name || ""}
                  onChange={(e) => updateField("name", e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Amount per period</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">{cs}</span>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      className="pl-7"
                      value={form.amount ?? ""}
                      onChange={(e) => updateField("amount", e.target.value ? parseFloat(e.target.value) : 0)}
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label>Billing cycle</Label>
                  <Select
                    value={form.billing_cycle || "maandelijks"}
                    onValueChange={(v) => updateField("billing_cycle", v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(billingCycleLabels).map(([key, label]) => (
                        <SelectItem key={key} value={key}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Payment method</Label>
                  <Select
                    value={form.payment_method || ""}
                    onValueChange={(v) => updateField("payment_method", v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="rekening">Bank account</SelectItem>
                      <SelectItem value="creditcard">Credit card</SelectItem>
                      <SelectItem value="ideal">iDEAL</SelectItem>
                      <SelectItem value="paypal">PayPal</SelectItem>
                      <SelectItem value="incasso">Direct debit</SelectItem>
                      <SelectItem value="overig">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Contract number</Label>
                  <Input
                    placeholder="Optional"
                    value={form.contract_number || ""}
                    onChange={(e) => updateField("contract_number", e.target.value)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Contract ends</Label>
                  <Input
                    type="date"
                    value={form.contract_end_date || ""}
                    onChange={(e) => updateField("contract_end_date", e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Next payment</Label>
                  <Input
                    type="date"
                    value={form.next_payment_date || ""}
                    onChange={(e) => updateField("next_payment_date", e.target.value)}
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Notes</Label>
                <Textarea
                  placeholder="Optional"
                  value={form.notes || ""}
                  onChange={(e) => updateField("notes", e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label>Tags</Label>
                <Input
                  placeholder="e.g. Essential, Luxury, Hobby"
                  value={(form.tags ?? []).join(", ")}
                  onChange={(e) =>
                    preserveScroll(() => {
                      setForm((prev) => ({
                        ...prev,
                        tags: e.target.value
                          .split(",")
                          .map((t) => t.trim())
                          .filter(Boolean),
                      }));
                    })
                  }
                />
                <div className="flex flex-wrap gap-2">
                  {quickTags.map((tag) => {
                    const active = (form.tags ?? []).includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => toggleTag(tag)}
                        className={`rounded-full border px-2 py-1 text-xs transition-colors ${
                          active ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
              </div>
              <Button onClick={handleSave}>{editId ? "Save" : "Add"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Category toggle */}
      <div className="flex items-center gap-1 rounded-lg bg-muted p-1 w-fit">
        <button
          onClick={() => setCategory("prive")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
            category === "prive"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Personal
        </button>
        <button
          onClick={() => setCategory("zakelijk")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
            category === "zakelijk"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Business
        </button>
      </div>

      {/* Monthly total summary */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="flex items-center gap-4 py-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <Wallet className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">
              Estimated monthly cost ({category === "prive" ? "personal" : "business"})
            </p>
            <p className="text-2xl font-bold">{formatCurrency(monthlyTotal)}</p>
          </div>
          <div className="ml-auto text-right">
            <p className="text-sm text-muted-foreground">Subscriptions</p>
            <p className="text-2xl font-bold">{filtered.length}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-3 md:grid-cols-4">
            <Input
              placeholder="Search by name, contract number or note…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Select value={cycleFilter} onValueChange={setCycleFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All cycles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All cycles</SelectItem>
                {Object.entries(billingCycleLabels).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={paymentFilter} onValueChange={setPaymentFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All payment statuses</SelectItem>
                <SelectItem value="paid">Paid this month</SelectItem>
                <SelectItem value="open">Open this month</SelectItem>
                <SelectItem value="na">Not due this month</SelectItem>
              </SelectContent>
            </Select>
            <Select value={tagFilter} onValueChange={setTagFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All tags" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All tags</SelectItem>
                {allTags.map((tag) => (
                  <SelectItem key={tag} value={tag}>
                    {tag}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Subscription table */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <RepeatIcon className="h-12 w-12 mb-4" />
            <p>No {category === "prive" ? "personal" : "business"} subscriptions yet</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <div className="overflow-x-auto border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Subscription</TableHead>
                    <TableHead>Cycle</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Next payment</TableHead>
                    <TableHead>This month</TableHead>
                    <TableHead>Tags</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
          {filtered.map((sub) => {
            const PaymentIcon = paymentMethodIcons[sub.payment_method ?? ""] ?? Wallet;
            const nextDays = daysUntil(sub.next_payment_date);
            const contractDays = daysUntil(sub.contract_end_date);
            const isExpanded = expandedId === sub.id;
            const now = new Date();
            const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
            const dueThisMonth = generatePeriods(sub).includes(currentPeriod);
            const paidThisMonth = (payments[sub.id] ?? []).some((p) => p.period_date === currentPeriod && p.paid);
            const paymentStatus = !dueThisMonth ? "na" : paidThisMonth ? "paid" : "open";

            return (
              <Fragment key={sub.id}>
                <TableRow>
                  <TableCell>
                    <div className="min-w-[220px]">
                      <p className="font-medium">{sub.name}</p>
                      <div className="mt-1 flex items-center gap-2 flex-wrap">
                        {sub.payment_method && (
                          <Badge variant="outline" className="text-xs font-normal gap-1">
                            <PaymentIcon className="h-3 w-3" />
                            {paymentMethodLabels[sub.payment_method] ?? "Other"}
                          </Badge>
                        )}
                        {sub.contract_number && (
                          <Badge variant="secondary" className="text-xs font-normal">
                            #{sub.contract_number}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-xs font-normal">
                      {billingCycleLabels[sub.billing_cycle] ?? sub.billing_cycle}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-semibold">{formatCurrency(sub.amount)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <CalendarClock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="text-sm">
                        {formatDate(sub.next_payment_date)}
                      </span>
                      {nextDays !== null && nextDays >= 0 && nextDays <= 7 && (
                        <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                          in {nextDays} {nextDays === 1 ? "day" : "days"}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {paymentStatus === "paid" && <Badge className="bg-emerald-600 hover:bg-emerald-600">PAID</Badge>}
                    {paymentStatus === "open" && <Badge variant="destructive">OPEN</Badge>}
                    {paymentStatus === "na" && <Badge variant="secondary">N/A</Badge>}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1 max-w-[220px]">
                      {(sub.tags ?? []).length === 0 ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        (sub.tags ?? []).map((tag) => (
                          <Badge key={tag} variant="outline" className="text-[10px] font-normal">
                            {tag}
                          </Badge>
                        ))
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(sub)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(sub.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleExpand(sub.id)}>
                        <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
                {isExpanded && (
                  <TableRow>
                    <TableCell colSpan={7}>
                      <div className="space-y-2 py-2">
                        {sub.contract_end_date && (
                          <p className="text-xs text-muted-foreground">
                            Contract ends: {formatDate(sub.contract_end_date)}
                            {contractDays !== null && contractDays >= 0 && contractDays <= 30 && " (ending soon)"}
                            {contractDays !== null && contractDays < 0 && " (ended)"}
                          </p>
                        )}
                        {sub.notes && <p className="text-xs text-muted-foreground">{sub.notes}</p>}
                        <PaymentTimeline
                          sub={sub}
                          payments={payments[sub.id] ?? []}
                          onToggle={(period) => handleTogglePayment(sub.id, period)}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
