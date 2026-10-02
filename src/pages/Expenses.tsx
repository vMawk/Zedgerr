import { useEffect, useState } from "react";
import { useOpenOnNew } from "@/hooks/use-open-on-new";
import { rateOptions } from "@/lib/tax-presets";
import { useTaxSettings } from "@/lib/tax";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import type { Expense } from "@/lib/db-types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Receipt } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AttachmentSection } from "@/components/AttachmentSection";

export const EXPENSE_CATEGORIES: Record<string, string> = {
  kantoor: "Office",
  hardware: "Hardware",
  software: "Software",
  vervoer: "Transport",
  marketing: "Marketing",
  onderhoud: "Maintenance",
  overig: "Other",
};

const categoryColors: Record<string, string> = {
  kantoor: "bg-blue-500/10 text-blue-600",
  hardware: "bg-purple-500/10 text-purple-600",
  software: "bg-indigo-500/10 text-indigo-600",
  vervoer: "bg-amber-500/10 text-amber-600",
  marketing: "bg-pink-500/10 text-pink-600",
  onderhoud: "bg-orange-500/10 text-orange-600",
  overig: "bg-muted text-muted-foreground",
};

const emptyForm = {
  date: new Date().toISOString().split("T")[0],
  supplier: "",
  description: "",
  category: "overig",
  amount_excl_vat: "",
  vat_percentage: "",
  notes: "",
};

function calcVat(exclVat: number, vatPct: number) {
  return Math.round(exclVat * vatPct) / 100;
}

export default function Expenses() {
  const { currencySymbol: cs, defaultRate, preset, taxName } = useTaxSettings();
  const { user } = useAuth();
  const { toast } = useToast();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterFrom, setFilterFrom] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-01-01`;
  });
  const [filterTo, setFilterTo] = useState(new Date().toISOString().split("T")[0]);
  const [open, setOpen] = useState(false);
  useOpenOnNew(setOpen);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [editExpense, setEditExpense] = useState<Expense | null>(null);
  const [pendingId, setPendingId] = useState(() => crypto.randomUUID());
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchExpenses = async () => {
    const data = await api.getExpenses({ from: filterFrom, to: filterTo, category: filterCategory });
    setExpenses(data);
  };

  useEffect(() => { if (user) fetchExpenses(); }, [user, filterFrom, filterTo, filterCategory]);

  const resetForm = () => {
    setForm({ ...emptyForm, vat_percentage: String(defaultRate) });
    setEditExpense(null);
    setPendingId(crypto.randomUUID());
  };

  const openEdit = (e: Expense) => {
    setEditExpense(e);
    setForm({
      date: e.date,
      supplier: e.supplier ?? "",
      description: e.description,
      category: e.category,
      amount_excl_vat: String(e.amount_excl_vat),
      vat_percentage: String(e.vat_percentage),
      notes: e.notes ?? "",
    });
    setOpen(true);
  };

  const handleSave = async () => {
    if (!form.description.trim() || !form.amount_excl_vat || !form.date) return;
    const exclVat = parseFloat(form.amount_excl_vat);
    const vatPct = parseFloat(form.vat_percentage) || 0;
    const vatAmt = Math.round(exclVat * vatPct) / 100;
    const body = {
      date: form.date,
      supplier: form.supplier.trim() || null,
      description: form.description.trim(),
      category: form.category,
      amount_excl_vat: exclVat,
      vat_percentage: vatPct,
      vat_amount: vatAmt,
      amount_incl_vat: Math.round((exclVat + vatAmt) * 100) / 100,
      notes: form.notes.trim() || null,
    };
    setSaving(true);
    try {
      if (editExpense) {
        await api.updateExpense(editExpense.id, body);
        toast({ title: "Expense updated" });
      } else {
        await api.createExpense({ id: pendingId, ...body });
        toast({ title: "Expense added" });
      }
      setOpen(false);
      resetForm();
      fetchExpenses();
    } catch (e: unknown) {
      toast({ title: "Error", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.deleteExpense(deleteTarget.id);
      setDeleteTarget(null);
      fetchExpenses();
      toast({ title: "Expense deleted" });
    } catch (e: unknown) {
      toast({ title: "Error", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const exclPreview = parseFloat(form.amount_excl_vat) || 0;
  const vatPctPreview = parseFloat(form.vat_percentage) || 0;
  const vatPreview = calcVat(exclPreview, vatPctPreview);
  const inclPreview = Math.round((exclPreview + vatPreview) * 100) / 100;

  const totalExcl = expenses.reduce((s, e) => s + Number(e.amount_excl_vat), 0);
  const totalVat = expenses.reduce((s, e) => s + Number(e.vat_amount), 0);
  const totalIncl = expenses.reduce((s, e) => s + Number(e.amount_incl_vat), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Expenses</h1>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" />Add expense</Button>
          </DialogTrigger>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>{editExpense ? "Edit expense" : "New expense"}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Date *</Label>
                  <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
                </div>
                <div className="grid gap-2">
                  <Label>Category</Label>
                  <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(EXPENSE_CATEGORIES).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Supplier</Label>
                <Input placeholder="e.g. Amazon, Apple, Adobe…" value={form.supplier} onChange={(e) => setForm((f) => ({ ...f, supplier: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>Description *</Label>
                <Input placeholder="e.g. External monitor, train ticket, license…" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="grid gap-2">
                  <Label>Excl. tax *</Label>
                  <Input type="number" step="0.01" min="0" placeholder="0.00" value={form.amount_excl_vat} onChange={(e) => setForm((f) => ({ ...f, amount_excl_vat: e.target.value }))} />
                </div>
                <div className="grid gap-2">
                  <Label>Tax rate (%)</Label>
                  <Select value={form.vat_percentage} onValueChange={(v) => setForm((f) => ({ ...f, vat_percentage: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {rateOptions(preset, Number(form.vat_percentage)).map((r) => <SelectItem key={r} value={String(r)}>{r}%</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Incl. tax</Label>
                  <div className="h-9 flex items-center px-3 rounded-md border bg-muted/40 text-sm font-medium tabular-nums">
                    {cs}{inclPreview.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </div>
                </div>
              </div>
              {exclPreview > 0 && vatPctPreview > 0 && (
                <p className="text-xs text-muted-foreground">
                  {taxName} amount: {cs}{vatPreview.toLocaleString(undefined, { minimumFractionDigits: 2 })}, reclaimable through your tax return
                </p>
              )}
              <div className="grid gap-2">
                <Label>Notes</Label>
                <Textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
              </div>
              <Button onClick={handleSave} disabled={saving || !form.description.trim() || !form.amount_excl_vat || !form.date}>
                {saving ? "Saving…" : editExpense ? "Save" : "Add"}
              </Button>
              <div className="border-t pt-4 mt-2">
                <AttachmentSection entityType="expense" entityId={editExpense?.id ?? pendingId} />
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="grid gap-1.5">
          <Label className="text-xs text-muted-foreground">From</Label>
          <Input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} className="h-8 text-sm" />
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs text-muted-foreground">To</Label>
          <Input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} className="h-8 text-sm" />
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs text-muted-foreground">Category</Label>
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-40 h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {Object.entries(EXPENSE_CATEGORIES).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {expenses.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Receipt className="h-12 w-12 mb-4" />
            <p>No expenses found</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Excl. tax</TableHead>
                  <TableHead className="text-right">{taxName}</TableHead>
                  <TableHead className="text-right">Incl. tax</TableHead>
                  <TableHead className="w-20 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenses.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="whitespace-nowrap text-sm">{new Date(e.date).toLocaleDateString(undefined)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{e.supplier || "—"}</TableCell>
                    <TableCell className="text-sm">{e.description}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={categoryColors[e.category] ?? categoryColors.overig}>
                        {EXPENSE_CATEGORIES[e.category] ?? e.category}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums text-sm">
                      {cs}{Number(e.amount_excl_vat).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground tabular-nums">
                      {Number(e.vat_percentage) > 0
                        ? `${cs}${Number(e.vat_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums text-sm">
                      {cs}{Number(e.amount_incl_vat).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(e)} title="Edit">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setDeleteTarget(e)} title="Delete">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          {/* Totals bar */}
          <div className="flex justify-end">
            <div className="rounded-lg border bg-muted/30 px-5 py-3 text-sm space-y-1 min-w-64">
              <div className="flex justify-between gap-8">
                <span className="text-muted-foreground">Total excl. tax</span>
                <span className="font-medium tabular-nums">{cs}{totalExcl.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between gap-8">
                <span className="text-muted-foreground">Total {taxName} (reclaimable)</span>
                <span className="font-medium tabular-nums">{cs}{totalVat.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between gap-8 border-t pt-1 mt-1">
                <span className="font-medium">Total incl. tax</span>
                <span className="font-bold tabular-nums">{cs}{totalIncl.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>
        </>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete expense?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium text-foreground">{deleteTarget?.description}</span> will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
