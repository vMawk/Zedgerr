import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import type { Subscription } from "@/lib/db-types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, CreditCard, Landmark, CalendarClock, RepeatIcon, Wallet } from "lucide-react";

type Category = "prive" | "zakelijk";

const billingCycleLabels: Record<string, string> = {
  wekelijks: "Wekelijks",
  maandelijks: "Maandelijks",
  kwartaal: "Per kwartaal",
  halfjaarlijks: "Halfjaarlijks",
  jaarlijks: "Jaarlijks",
};

const billingCycleMonthly: Record<string, number> = {
  wekelijks: 52 / 12,
  maandelijks: 1,
  kwartaal: 1 / 3,
  halfjaarlijks: 1 / 6,
  jaarlijks: 1 / 12,
};

const paymentMethodIcons: Record<string, typeof CreditCard> = {
  creditcard: CreditCard,
  rekening: Landmark,
};

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
};

function formatDate(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });
}

function formatCurrency(n: number): string {
  return n.toLocaleString("nl-NL", { style: "currency", currency: "EUR" });
}

function daysUntil(d: string | null | undefined): number | null {
  if (!d) return null;
  const target = new Date(d);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export default function Subscriptions() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [form, setForm] = useState<Partial<Subscription>>(emptyForm);
  const [editId, setEditId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<Category>("prive");

  const fetchSubscriptions = async () => {
    const data = await api.getSubscriptions();
    setSubscriptions(data);
  };

  useEffect(() => {
    if (user) fetchSubscriptions();
  }, [user]);

  const filtered = useMemo(
    () => subscriptions.filter((s) => s.category === category),
    [subscriptions, category],
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
      toast({ title: "Vul een naam in", variant: "destructive" });
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
      };
      if (editId) {
        await api.updateSubscription(editId, payload);
        toast({ title: "Abonnement bijgewerkt" });
      } else {
        await api.createSubscription(payload as Partial<Subscription> & { name: string });
        toast({ title: "Abonnement toegevoegd" });
      }
      setOpen(false);
      setForm(emptyForm);
      setEditId(null);
      fetchSubscriptions();
    } catch (error: unknown) {
      toast({ title: "Fout", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
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
    });
    setEditId(sub.id);
    setOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Weet je zeker dat je dit abonnement wilt verwijderen?")) return;
    await api.deleteSubscription(id);
    fetchSubscriptions();
    toast({ title: "Abonnement verwijderd" });
  };

  const updateField = (field: string, value: string | number | null | undefined) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Abonnementen</h1>
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
              Abonnement toevoegen
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editId ? "Abonnement bewerken" : "Nieuw abonnement"}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>Naam *</Label>
                <Input
                  placeholder="bijv. Netflix, Spotify, KPN..."
                  value={form.name || ""}
                  onChange={(e) => updateField("name", e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Bedrag per periode</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">€</span>
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
                  <Label>Betaalcyclus</Label>
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
                  <Label>Betalingsmethode</Label>
                  <Select
                    value={form.payment_method || ""}
                    onValueChange={(v) => updateField("payment_method", v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecteer..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="rekening">Bankrekening</SelectItem>
                      <SelectItem value="creditcard">Creditcard</SelectItem>
                      <SelectItem value="ideal">iDEAL</SelectItem>
                      <SelectItem value="paypal">PayPal</SelectItem>
                      <SelectItem value="incasso">Automatische incasso</SelectItem>
                      <SelectItem value="overig">Overig</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Contractnummer</Label>
                  <Input
                    placeholder="Optioneel"
                    value={form.contract_number || ""}
                    onChange={(e) => updateField("contract_number", e.target.value)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Contract t/m</Label>
                  <Input
                    type="date"
                    value={form.contract_end_date || ""}
                    onChange={(e) => updateField("contract_end_date", e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Volgende betaling</Label>
                  <Input
                    type="date"
                    value={form.next_payment_date || ""}
                    onChange={(e) => updateField("next_payment_date", e.target.value)}
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Notities</Label>
                <Textarea
                  placeholder="Optioneel"
                  value={form.notes || ""}
                  onChange={(e) => updateField("notes", e.target.value)}
                />
              </div>
              <Button onClick={handleSave}>{editId ? "Opslaan" : "Toevoegen"}</Button>
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
          Privé
        </button>
        <button
          onClick={() => setCategory("zakelijk")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
            category === "zakelijk"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Zakelijk
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
              Geschatte maandelijkse kosten ({category === "prive" ? "privé" : "zakelijk"})
            </p>
            <p className="text-2xl font-bold">{formatCurrency(monthlyTotal)}</p>
          </div>
          <div className="ml-auto text-right">
            <p className="text-sm text-muted-foreground">Aantal abonnementen</p>
            <p className="text-2xl font-bold">{filtered.length}</p>
          </div>
        </CardContent>
      </Card>

      {/* Subscription cards */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <RepeatIcon className="h-12 w-12 mb-4" />
            <p>Nog geen {category === "prive" ? "privé" : "zakelijke"} abonnementen</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((sub) => {
            const PaymentIcon = paymentMethodIcons[sub.payment_method ?? ""] ?? Wallet;
            const nextDays = daysUntil(sub.next_payment_date);
            const contractDays = daysUntil(sub.contract_end_date);

            return (
              <Card key={sub.id} className="relative group">
                <CardHeader className="flex flex-row items-start justify-between pb-2">
                  <div className="space-y-1 min-w-0 flex-1">
                    <CardTitle className="text-base truncate">{sub.name}</CardTitle>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="secondary" className="text-xs font-normal">
                        {billingCycleLabels[sub.billing_cycle] ?? sub.billing_cycle}
                      </Badge>
                      {sub.payment_method && (
                        <Badge variant="outline" className="text-xs font-normal gap-1">
                          <PaymentIcon className="h-3 w-3" />
                          {sub.payment_method === "rekening"
                            ? "Bank"
                            : sub.payment_method === "creditcard"
                              ? "Creditcard"
                              : sub.payment_method === "ideal"
                                ? "iDEAL"
                                : sub.payment_method === "paypal"
                                  ? "PayPal"
                                  : sub.payment_method === "incasso"
                                    ? "Incasso"
                                    : "Overig"}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(sub)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(sub.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-xl font-bold">{formatCurrency(sub.amount)}</p>

                  {sub.contract_number && (
                    <p className="text-xs text-muted-foreground">
                      Contract: {sub.contract_number}
                    </p>
                  )}

                  <div className="flex flex-col gap-1.5 text-sm">
                    {sub.next_payment_date && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <CalendarClock className="h-3.5 w-3.5 shrink-0" />
                        <span>
                          Volgende betaling: {formatDate(sub.next_payment_date)}
                          {nextDays !== null && nextDays >= 0 && nextDays <= 7 && (
                            <Badge variant="destructive" className="ml-2 text-[10px] px-1.5 py-0">
                              over {nextDays} {nextDays === 1 ? "dag" : "dagen"}
                            </Badge>
                          )}
                          {nextDays !== null && nextDays < 0 && (
                            <Badge variant="destructive" className="ml-2 text-[10px] px-1.5 py-0">
                              verlopen
                            </Badge>
                          )}
                        </span>
                      </div>
                    )}
                    {sub.contract_end_date && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <CalendarClock className="h-3.5 w-3.5 shrink-0" />
                        <span>
                          Contract t/m: {formatDate(sub.contract_end_date)}
                          {contractDays !== null && contractDays >= 0 && contractDays <= 30 && (
                            <Badge className="ml-2 text-[10px] px-1.5 py-0 bg-yellow-500/15 text-yellow-600 hover:bg-yellow-500/15 border-0">
                              loopt af
                            </Badge>
                          )}
                          {contractDays !== null && contractDays < 0 && (
                            <Badge variant="secondary" className="ml-2 text-[10px] px-1.5 py-0">
                              afgelopen
                            </Badge>
                          )}
                        </span>
                      </div>
                    )}
                  </div>

                  {sub.notes && (
                    <p className="text-xs text-muted-foreground pt-1 border-t">{sub.notes}</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
