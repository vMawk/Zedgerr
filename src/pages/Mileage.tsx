import { useEffect, useState } from "react";
import { useTaxSettings } from "@/lib/tax";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import type { MileageEntry } from "@/lib/db-types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Car } from "lucide-react";
import { useToast } from "@/hooks/use-toast";



const PURPOSES = ["Client visit", "Meeting", "Supplier", "Commute", "Other"];

const emptyForm = {
  date: new Date().toISOString().split("T")[0],
  from_location: "",
  to_location: "",
  odometer_start: "",
  odometer_end: "",
  distance_km: "",
  purpose: "",
  is_private: false,
  notes: "",
};

function fmtNum(n: number | null | undefined, decimals = 0): string {
  if (n == null) return "—";
  return n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export default function Mileage() {
  const { mileageRate: KM_RATE, distanceUnit: unit, currencySymbol: cs } = useTaxSettings();
  const rateLabel = `Allowance (${cs}${KM_RATE}/${unit})`;
  const { user } = useAuth();
  const { toast } = useToast();
  const currentYear = new Date().getFullYear();
  const [entries, setEntries] = useState<MileageEntry[]>([]);
  const [filterFrom, setFilterFrom] = useState(`${currentYear}-01-01`);
  const [filterTo, setFilterTo] = useState(new Date().toISOString().split("T")[0]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editEntry, setEditEntry] = useState<MileageEntry | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MileageEntry | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchEntries = async () => {
    const data = await api.getMileageEntries({ from: filterFrom, to: filterTo });
    setEntries(data);
  };

  useEffect(() => { if (user) fetchEntries(); }, [user, filterFrom, filterTo]);

  const resetForm = () => { setForm(emptyForm); setEditEntry(null); };

  const openEdit = (e: MileageEntry) => {
    setEditEntry(e);
    setForm({
      date: e.date,
      from_location: e.from_location ?? "",
      to_location: e.to_location ?? "",
      odometer_start: e.odometer_start != null ? String(e.odometer_start) : "",
      odometer_end: e.odometer_end != null ? String(e.odometer_end) : "",
      distance_km: String(e.distance_km),
      purpose: e.purpose,
      is_private: Boolean(e.is_private),
      notes: e.notes ?? "",
    });
    setOpen(true);
  };

  // Derive distance from the odometer readings when both are filled in
  const odoStart = parseFloat(form.odometer_start) || null;
  const odoEnd = parseFloat(form.odometer_end) || null;
  const derivedKm = odoStart != null && odoEnd != null ? Math.max(0, odoEnd - odoStart) : null;

  const effectiveKm = derivedKm ?? (parseFloat(form.distance_km) || 0);

  const handleSave = async () => {
    if (!form.date || !form.purpose.trim()) return;
    const body: Record<string, unknown> = {
      date: form.date,
      from_location: form.from_location.trim() || null,
      to_location: form.to_location.trim() || null,
      odometer_start: odoStart,
      odometer_end: odoEnd,
      distance_km: derivedKm ?? (parseFloat(form.distance_km) || 0),
      purpose: form.purpose.trim(),
      is_private: form.is_private,
      notes: form.notes.trim() || null,
    };
    setSaving(true);
    try {
      if (editEntry) {
        await api.updateMileageEntry(editEntry.id, body);
        toast({ title: "Trip updated" });
      } else {
        await api.createMileageEntry(body);
        toast({ title: "Trip added" });
      }
      setOpen(false);
      resetForm();
      fetchEntries();
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
      await api.deleteMileageEntry(deleteTarget.id);
      setDeleteTarget(null);
      fetchEntries();
      toast({ title: "Trip deleted" });
    } catch (e: unknown) {
      toast({ title: "Error", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const zakelijkeEntries = entries.filter((e) => !e.is_private);
  const totalKmAll = entries.reduce((s, e) => s + Number(e.distance_km), 0);
  const totalKmZakelijk = zakelijkeEntries.reduce((s, e) => s + Number(e.distance_km), 0);
  const totalDeduction = Math.round(totalKmZakelijk * KM_RATE * 100) / 100;

  const canSave = !!form.date && !!form.purpose.trim() && (effectiveKm > 0 || !!form.distance_km);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Mileage</h1>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" />Add trip</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editEntry ? "Edit trip" : "New trip"}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-2">

              {/* Date and business/private */}
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Date *</Label>
                  <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
                </div>
                <div className="grid gap-2">
                  <Label>Type</Label>
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, is_private: false }))}
                      className={`flex-1 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${!form.is_private ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"}`}
                    >
                      Business
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, is_private: true }))}
                      className={`flex-1 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${form.is_private ? "bg-secondary text-secondary-foreground border-secondary" : "hover:bg-accent"}`}
                    >
                      Private
                    </button>
                  </div>
                </div>
              </div>

              {/* From / to */}
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Start address</Label>
                  <Input placeholder="e.g. London" value={form.from_location} onChange={(e) => setForm((f) => ({ ...f, from_location: e.target.value }))} />
                </div>
                <div className="grid gap-2">
                  <Label>End address</Label>
                  <Input placeholder="e.g. Oxford" value={form.to_location} onChange={(e) => setForm((f) => ({ ...f, to_location: e.target.value }))} />
                </div>
              </div>

              {/* Odometer */}
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Start odometer ({unit})</Label>
                  <Input
                    type="number"
                    step="1"
                    min="0"
                    placeholder="e.g. 25430"
                    value={form.odometer_start}
                    onChange={(e) => setForm((f) => ({ ...f, odometer_start: e.target.value }))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>End odometer ({unit})</Label>
                  <Input
                    type="number"
                    step="1"
                    min="0"
                    placeholder="e.g. 25482"
                    value={form.odometer_end}
                    onChange={(e) => setForm((f) => ({ ...f, odometer_end: e.target.value }))}
                  />
                </div>
              </div>

              {/* Distance: derived or entered manually */}
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Distance ({unit})</Label>
                  {derivedKm != null ? (
                    <div className="h-9 flex items-center px-3 rounded-md border bg-muted/40 text-sm font-medium tabular-nums">
                      {fmtNum(derivedKm, 1)} {unit}
                      <span className="ml-2 text-xs text-muted-foreground">(calculated)</span>
                    </div>
                  ) : (
                    <Input
                      type="number"
                      step="0.1"
                      min="0"
                      placeholder="e.g. 52"
                      value={form.distance_km}
                      onChange={(e) => setForm((f) => ({ ...f, distance_km: e.target.value }))}
                    />
                  )}
                </div>
                <div className="grid gap-2">
                  <Label>{rateLabel}</Label>
                  <div className="h-9 flex items-center px-3 rounded-md border bg-muted/40 text-sm font-medium tabular-nums">
                    {form.is_private
                      ? <span className="text-muted-foreground text-xs">Private, not deductible</span>
                      : `${cs}${(effectiveKm * KM_RATE).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                    }
                  </div>
                </div>
              </div>

              {/* Purpose */}
              <div className="grid gap-2">
                <Label>Purpose of trip *</Label>
                <div className="flex flex-wrap gap-1.5 mb-1">
                  {PURPOSES.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, purpose: p }))}
                      className={`rounded-full border px-3 py-0.5 text-xs font-medium transition-colors ${form.purpose === p ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"}`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
                <Input
                  placeholder="Or type your own…"
                  value={form.purpose}
                  onChange={(e) => setForm((f) => ({ ...f, purpose: e.target.value }))}
                />
              </div>

              <div className="grid gap-2">
                <Label>Notes</Label>
                <Textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
              </div>

              <Button onClick={handleSave} disabled={saving || !canSave}>
                {saving ? "Working…" : editEntry ? "Save" : "Add"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

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

      {/* Totals */}
      {entries.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground mb-1">Total {unit}</p>
              <p className="text-2xl font-bold tabular-nums">{fmtNum(totalKmAll, 1)} {unit}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground mb-1">Business {unit}</p>
              <p className="text-2xl font-bold tabular-nums">{fmtNum(totalKmZakelijk, 1)} {unit}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground mb-1">{rateLabel}</p>
              <p className="text-2xl font-bold tabular-nums text-green-600 dark:text-green-400">{cs}{totalDeduction.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground mb-1">Trips</p>
              <p className="text-2xl font-bold">{entries.length}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Table */}
      {entries.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Car className="h-12 w-12 mb-4" />
            <p>No trips found</p>
            <p className="text-sm mt-1">Log a business trip to track its mileage allowance</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">Date</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead>Purpose</TableHead>
                  <TableHead className="text-right whitespace-nowrap">Start</TableHead>
                  <TableHead className="text-right whitespace-nowrap">End</TableHead>
                  <TableHead className="text-right">{unit}</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Deduction</TableHead>
                  <TableHead className="w-20 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="whitespace-nowrap text-sm">
                      {new Date(e.date).toLocaleDateString(undefined)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[120px] truncate">
                      {e.from_location || "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[120px] truncate">
                      {e.to_location || "—"}
                    </TableCell>
                    <TableCell className="text-sm max-w-[160px] truncate">{e.purpose}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                      {e.odometer_start != null ? fmtNum(e.odometer_start) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                      {e.odometer_end != null ? fmtNum(e.odometer_end) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm font-medium">
                      {fmtNum(Number(e.distance_km), 1)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={e.is_private ? "secondary" : "outline"} className="text-xs whitespace-nowrap">
                        {e.is_private ? "Private" : "Business"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm font-medium">
                      {e.is_private
                        ? <span className="text-muted-foreground">—</span>
                        : `${cs}${(Number(e.distance_km) * KM_RATE).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                      }
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

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete trip?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium text-foreground">{deleteTarget?.purpose}</span> on{" "}
              {deleteTarget ? new Date(deleteTarget.date).toLocaleDateString(undefined) : ""} will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Working…" : "Delete"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
