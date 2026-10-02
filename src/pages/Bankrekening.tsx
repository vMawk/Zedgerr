import { useEffect, useState } from "react";
import { useTaxSettings } from "@/lib/tax";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import type { BankTransaction, BankTransactionType } from "@/lib/db-types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Landmark, TrendingUp, TrendingDown, ArrowDownToLine, ArrowUpFromLine, Upload, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "../lib/api";

type TxType = BankTransactionType;

const TYPE_LABELS: Record<TxType, string> = {
  inkomst: "Income",
  uitgave: "Expense",
  prive_storting: "Private deposit",
  prive_onttrekking: "Private withdrawal",
  beginstand: "Opening balance",
  overig: "Other",
};

const TYPE_COLORS: Record<TxType, string> = {
  inkomst: "bg-success/10 text-success",
  uitgave: "bg-destructive/10 text-destructive",
  prive_storting: "bg-[hsl(213_90%_95%)] text-[hsl(213_60%_40%)]",
  prive_onttrekking: "bg-[hsl(38_92%_95%)] text-[hsl(38_60%_35%)]",
  beginstand: "bg-[hsl(220_13%_95%)] text-[hsl(220_13%_40%)]",
  overig: "bg-[hsl(220_13%_95%)] text-[hsl(220_13%_40%)]",
};

const emptyForm = {
  date: new Date().toISOString().split("T")[0],
  description: "",
  amount: "",
  type: "inkomst" as TxType,
  notes: "",
};

function fmtEur(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function isPositiveType(type: TxType): boolean {
  return type === "inkomst" || type === "prive_storting" || type === "beginstand";
}

export default function Bankrekening() {
  const { currencySymbol: cs } = useTaxSettings();
  const { user } = useAuth();
  const { toast } = useToast();
  const currentYear = new Date().getFullYear();

  const [entries, setEntries] = useState<BankTransaction[]>([]);
  const [saldo, setSaldo] = useState<number>(0);
  const [filterFrom, setFilterFrom] = useState(`${currentYear}-01-01`);
  const [filterTo, setFilterTo] = useState(new Date().toISOString().split("T")[0]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editEntry, setEditEntry] = useState<BankTransaction | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<BankTransaction | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [importing, setImporting] = useState(false);

  const fetchData = async () => {
    const [txs, bal] = await Promise.all([
      api.getBankTransactions({ from: filterFrom, to: filterTo }),
      api.getBankBalance(),
    ]);
    setEntries(txs);
    setSaldo(bal.saldo);
  };

  useEffect(() => { if (user) fetchData(); }, [user, filterFrom, filterTo]);

  const resetForm = () => { setForm(emptyForm); setEditEntry(null); };

  const openNew = (defaultType: TxType = "inkomst") => {
    setForm({ ...emptyForm, type: defaultType });
    setEditEntry(null);
    setOpen(true);
  };

  const openEdit = (e: BankTransaction) => {
    setEditEntry(e);
    const absAmount = Math.abs(e.amount);
    setForm({
      date: e.date,
      description: e.description,
      amount: String(absAmount),
      type: e.type as TxType,
      notes: e.notes ?? "",
    });
    setOpen(true);
  };

  const handleSave = async () => {
    if (!form.date || !form.description.trim() || !form.amount) return;
    const absAmount = parseFloat(form.amount);
    if (isNaN(absAmount) || absAmount <= 0) return;
    const signedAmount = isPositiveType(form.type) ? absAmount : -absAmount;
    const body = {
      date: form.date,
      description: form.description.trim(),
      amount: signedAmount,
      type: form.type,
      notes: form.notes.trim() || null,
    };
    setSaving(true);
    try {
      if (editEntry) {
        await api.updateBankTransaction(editEntry.id, body);
        toast({ title: "Transaction updated" });
      } else {
        await api.createBankTransaction(body);
        toast({ title: "Transaction added" });
      }
      setOpen(false);
      resetForm();
      fetchData();
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
      await api.deleteBankTransaction(deleteTarget.id);
      setDeleteTarget(null);
      fetchData();
      toast({ title: "Transaction deleted" });
    } catch (e: unknown) {
      toast({ title: "Error", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const result = await apiRequest<{ imported: number; skipped: number }>("/api/bank-transactions/import-csv", {
        method: "POST",
        body: formData,
      });
      toast({ title: `CSV imported: ${result.imported} new, ${result.skipped} skipped` });
      fetchData();
    } catch (err: unknown) {
      toast({ title: "Import failed", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  };

  const handleReconcile = async (txId: string, reconciled: boolean) => {
    try {
      await apiRequest(`/api/bank-transactions/${txId}/${reconciled ? "unreconcile" : "reconcile"}`, {
        method: "POST",
        body: JSON.stringify({ type: "manual" }),
      });
      fetchData();
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    }
  };

  const periodeIn = entries.filter((e) => e.amount > 0).reduce((s, e) => s + e.amount, 0);
  const periodeUit = entries.filter((e) => e.amount < 0).reduce((s, e) => s + Math.abs(e.amount), 0);
  const privestortingen = entries.filter((e) => e.type === "prive_storting").reduce((s, e) => s + e.amount, 0);

  const canSave = !!form.date && !!form.description.trim() && parseFloat(form.amount) > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Bank account</h1>
        <div className="flex gap-2">
          <Label className="cursor-pointer">
            <Button variant="outline" asChild disabled={importing}>
              <span>
                <Upload className="mr-2 h-4 w-4" />
                {importing ? "Importing…" : "Import CSV"}
              </span>
            </Button>
            <input type="file" accept=".csv,.txt" className="sr-only" onChange={handleImportCSV} />
          </Label>
          <Button variant="outline" onClick={() => openNew("prive_storting")} title="Private deposit">
            <ArrowDownToLine className="mr-2 h-4 w-4" />
            Private deposit
          </Button>
          <Button variant="outline" onClick={() => openNew("prive_onttrekking")} title="Private withdrawal">
            <ArrowUpFromLine className="mr-2 h-4 w-4" />
            Private withdrawal
          </Button>
          <Button onClick={() => openNew("inkomst")}>
            <Plus className="mr-2 h-4 w-4" />
            Transaction
          </Button>
        </div>
      </div>

      {/* Balance */}
      <Card className={`border-2 ${saldo >= 0 ? "border-green-200 dark:border-green-900" : "border-red-200 dark:border-red-900"}`}>
        <CardContent className="pt-5 pb-5">
          <div className="flex items-center gap-3">
            <Landmark className={`h-8 w-8 ${saldo >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500"}`} />
            <div>
              <p className="text-sm text-muted-foreground">Current balance</p>
              <p className={`text-3xl font-bold tabular-nums ${saldo >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>
                {saldo < 0 ? "−" : ""}{cs}{fmtEur(Math.abs(saldo))}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Period filter */}
      <div className="flex flex-wrap gap-4 items-end">
        <div className="grid gap-1.5">
          <Label className="text-xs text-muted-foreground">From</Label>
          <Input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} className="h-8 text-sm" />
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs text-muted-foreground">To</Label>
          <Input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} className="h-8 text-sm" />
        </div>
      </div>

      {/* Period totals */}
      {entries.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-4 pb-4 flex items-center gap-3">
              <TrendingUp className="h-6 w-6 text-green-500 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Period income</p>
                <p className="text-xl font-bold tabular-nums text-green-600 dark:text-green-400">{cs}{fmtEur(periodeIn)}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4 flex items-center gap-3">
              <TrendingDown className="h-6 w-6 text-red-500 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Period expenses</p>
                <p className="text-xl font-bold tabular-nums text-red-500">{cs}{fmtEur(periodeUit)}</p>
              </div>
            </CardContent>
          </Card>
          {privestortingen > 0 && (
            <Card>
              <CardContent className="pt-4 pb-4 flex items-center gap-3">
                <ArrowDownToLine className="h-6 w-6 text-blue-500 shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Period private deposits</p>
                  <p className="text-xl font-bold tabular-nums text-blue-600 dark:text-blue-400">{cs}{fmtEur(privestortingen)}</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Table */}
      {entries.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Landmark className="h-12 w-12 mb-4" />
            <p>No transactions found</p>
            <p className="text-sm mt-1">Add your opening balance or first transaction</p>
            <Button className="mt-4" variant="outline" onClick={() => openNew("beginstand")}>
              Set opening balance
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="w-8 text-center hidden sm:table-cell" title="Reconciled">✓</TableHead>
                  <TableHead className="w-20 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="whitespace-nowrap text-sm">
                      {new Date(e.date).toLocaleDateString(undefined)}
                    </TableCell>
                    <TableCell className="text-sm max-w-[240px]">
                      <div className="truncate">{e.description}</div>
                      {e.notes && <div className="text-xs text-muted-foreground truncate mt-0.5">{e.notes}</div>}
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[e.type as TxType] ?? TYPE_COLORS.overig}`}>
                        {TYPE_LABELS[e.type as TxType] ?? e.type}
                      </span>
                    </TableCell>
                    <TableCell className={`text-right tabular-nums font-semibold text-sm whitespace-nowrap ${e.amount >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>
                      {e.amount >= 0 ? "+" : "−"}{cs}{fmtEur(Math.abs(e.amount))}
                    </TableCell>
                    <TableCell className="text-center hidden sm:table-cell">
                      <button
                        onClick={() => handleReconcile(e.id, !!(e as unknown as Record<string,unknown>)["reconciled"])}
                        title={(e as unknown as Record<string,unknown>)["reconciled"] ? "Mark as unreconciled" : "Mark as reconciled"}
                        className="p-1 rounded hover:bg-muted transition-colors"
                      >
                        <CheckCircle2 className={`h-4 w-4 ${(e as unknown as Record<string,unknown>)["reconciled"] ? "text-success" : "text-muted-foreground/30"}`} />
                      </button>
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
          </div>
        </Card>
      )}

      {/* Add/edit dialog */}
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editEntry ? "Edit transaction" : "New transaction"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">

            {/* Type buttons */}
            <div className="grid gap-2">
              <Label>Type</Label>
              <div className="grid grid-cols-2 gap-1.5">
                {(["inkomst", "uitgave", "prive_storting", "prive_onttrekking", "beginstand", "overig"] as TxType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, type: t }))}
                    className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors text-left ${form.type === t ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"}`}
                  >
                    {TYPE_LABELS[t]}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Date *</Label>
              <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
            </div>

            <div className="grid gap-2">
              <Label>Description *</Label>
              <Input
                placeholder={form.type === "prive_storting" ? "e.g. Private deposit to business account" : form.type === "prive_onttrekking" ? "e.g. Private withdrawal for living expenses" : "Description"}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>

            <div className="grid gap-2">
              <Label>
                Amount ({cs}) *
                <span className="ml-2 text-xs text-muted-foreground font-normal">
                  {isPositiveType(form.type) ? "— credited" : "— debited"}
                </span>
              </Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="0,00"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              />
            </div>

            <div className="grid gap-2">
              <Label>Notes</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>

            <Button onClick={handleSave} disabled={saving || !canSave}>
              {saving ? "Saving…" : editEntry ? "Save" : "Add"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete transaction?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium text-foreground">{deleteTarget?.description}</span> will be permanently deleted.
              This will affect the balance.
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
