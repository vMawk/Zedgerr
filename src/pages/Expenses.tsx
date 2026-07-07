import { useEffect, useState } from "react";
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

export const EXPENSE_CATEGORIES: Record<string, string> = {
  kantoor: "Kantoor",
  hardware: "Hardware",
  software: "Software",
  vervoer: "Vervoer",
  marketing: "Marketing",
  onderhoud: "Onderhoud",
  overig: "Overig",
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
  vat_percentage: "21",
  notes: "",
};

function calcVat(exclVat: number, vatPct: number) {
  return Math.round(exclVat * vatPct) / 100;
}

export default function Expenses() {
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
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [editExpense, setEditExpense] = useState<Expense | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchExpenses = async () => {
    const data = await api.getExpenses({ from: filterFrom, to: filterTo, category: filterCategory });
    setExpenses(data);
  };

  useEffect(() => { if (user) fetchExpenses(); }, [user, filterFrom, filterTo, filterCategory]);

  const resetForm = () => {
    setForm(emptyForm);
    setEditExpense(null);
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
        toast({ title: "Uitgave bijgewerkt" });
      } else {
        await api.createExpense(body);
        toast({ title: "Uitgave toegevoegd" });
      }
      setOpen(false);
      resetForm();
      fetchExpenses();
    } catch (e: unknown) {
      toast({ title: "Fout", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
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
      toast({ title: "Uitgave verwijderd" });
    } catch (e: unknown) {
      toast({ title: "Fout", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
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
        <h1 className="text-2xl font-semibold">Uitgaven</h1>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" />Uitgave toevoegen</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editExpense ? "Uitgave bewerken" : "Nieuwe uitgave"}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Datum *</Label>
                  <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
                </div>
                <div className="grid gap-2">
                  <Label>Categorie</Label>
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
                <Label>Leverancier</Label>
                <Input placeholder="Bijv. Coolblue, NS, Adobe…" value={form.supplier} onChange={(e) => setForm((f) => ({ ...f, supplier: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>Omschrijving *</Label>
                <Input placeholder="Bijv. Externe monitor, treinreis, licentie…" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="grid gap-2">
                  <Label>Excl. BTW (€) *</Label>
                  <Input type="number" step="0.01" min="0" placeholder="0.00" value={form.amount_excl_vat} onChange={(e) => setForm((f) => ({ ...f, amount_excl_vat: e.target.value }))} />
                </div>
                <div className="grid gap-2">
                  <Label>BTW %</Label>
                  <Select value={form.vat_percentage} onValueChange={(v) => setForm((f) => ({ ...f, vat_percentage: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="21">21%</SelectItem>
                      <SelectItem value="9">9%</SelectItem>
                      <SelectItem value="0">0% / vrijgesteld</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Incl. BTW</Label>
                  <div className="h-9 flex items-center px-3 rounded-md border bg-muted/40 text-sm font-medium tabular-nums">
                    €{inclPreview.toLocaleString("nl-NL", { minimumFractionDigits: 2 })}
                  </div>
                </div>
              </div>
              {exclPreview > 0 && vatPctPreview > 0 && (
                <p className="text-xs text-muted-foreground">
                  BTW-bedrag: €{vatPreview.toLocaleString("nl-NL", { minimumFractionDigits: 2 })} — terugvorderbaar via BTW-aangifte
                </p>
              )}
              <div className="grid gap-2">
                <Label>Notities</Label>
                <Textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
              </div>
              <Button onClick={handleSave} disabled={saving || !form.description.trim() || !form.amount_excl_vat || !form.date}>
                {saving ? "Bezig…" : editExpense ? "Opslaan" : "Toevoegen"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="grid gap-1.5">
          <Label className="text-xs text-muted-foreground">Van</Label>
          <Input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} className="h-8 text-sm" />
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs text-muted-foreground">Tot</Label>
          <Input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} className="h-8 text-sm" />
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs text-muted-foreground">Categorie</Label>
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-40 h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle categorieën</SelectItem>
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
            <p>Geen uitgaven gevonden</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Datum</TableHead>
                  <TableHead>Leverancier</TableHead>
                  <TableHead>Omschrijving</TableHead>
                  <TableHead>Categorie</TableHead>
                  <TableHead className="text-right">Excl. BTW</TableHead>
                  <TableHead className="text-right">BTW</TableHead>
                  <TableHead className="text-right">Incl. BTW</TableHead>
                  <TableHead className="w-20 text-right">Acties</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenses.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="whitespace-nowrap text-sm">{new Date(e.date).toLocaleDateString("nl-NL")}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{e.supplier || "—"}</TableCell>
                    <TableCell className="text-sm">{e.description}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={categoryColors[e.category] ?? categoryColors.overig}>
                        {EXPENSE_CATEGORIES[e.category] ?? e.category}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums text-sm">
                      €{Number(e.amount_excl_vat).toLocaleString("nl-NL", { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground tabular-nums">
                      {Number(e.vat_percentage) > 0
                        ? `€${Number(e.vat_amount).toLocaleString("nl-NL", { minimumFractionDigits: 2 })}`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums text-sm">
                      €{Number(e.amount_incl_vat).toLocaleString("nl-NL", { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(e)} title="Bewerken">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setDeleteTarget(e)} title="Verwijderen">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          {/* Totaalbalk */}
          <div className="flex justify-end">
            <div className="rounded-lg border bg-muted/30 px-5 py-3 text-sm space-y-1 min-w-64">
              <div className="flex justify-between gap-8">
                <span className="text-muted-foreground">Totaal excl. BTW</span>
                <span className="font-medium tabular-nums">€{totalExcl.toLocaleString("nl-NL", { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between gap-8">
                <span className="text-muted-foreground">Totaal BTW (aftrekbaar)</span>
                <span className="font-medium tabular-nums">€{totalVat.toLocaleString("nl-NL", { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between gap-8 border-t pt-1 mt-1">
                <span className="font-medium">Totaal incl. BTW</span>
                <span className="font-bold tabular-nums">€{totalIncl.toLocaleString("nl-NL", { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>
        </>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Uitgave verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium text-foreground">{deleteTarget?.description}</span> wordt permanent verwijderd.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Annuleren</AlertDialogCancel>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Bezig…" : "Verwijderen"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
