import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import type { Company, Invoice, Service, TimeEntry } from "@/lib/db-types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, FileText, Download, Trash2, Pencil } from "lucide-react";
import { generateInvoicePDF } from "@/lib/pdf";

const statusColors: Record<string, string> = {
  concept: "bg-muted text-muted-foreground",
  verzonden: "bg-primary/10 text-primary",
  betaald: "bg-success/10 text-success",
  vervallen: "bg-destructive/10 text-destructive",
};

export default function Invoices() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [invoices, setInvoices] = useState<(Invoice & { companies: { name: string | null } | null })[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [open, setOpen] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState("");
  const [uninvoicedEntries, setUninvoicedEntries] = useState<(TimeEntry & { companies: Company | null })[]>([]);
  const [selectedEntries, setSelectedEntries] = useState<string[]>([]);
  const [createMode, setCreateMode] = useState<"hours" | "service">("hours");
  const [selectedService, setSelectedService] = useState("");
  const [serviceAmount, setServiceAmount] = useState("");
  const [serviceDescription, setServiceDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [btwPercentage, setBtwPercentage] = useState("21");
  const [invoiceToDelete, setInvoiceToDelete] = useState<Invoice | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [invoiceToEdit, setInvoiceToEdit] = useState<(Invoice & { companies: { name: string | null } | null }) | null>(null);
  const [editInvoiceNumber, setEditInvoiceNumber] = useState("");
  const [editInvoiceDate, setEditInvoiceDate] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editStatus, setEditStatus] = useState("concept");
  const [editNotes, setEditNotes] = useState("");

  const fetchData = async () => {
    const [invList, compList, svcList] = await Promise.all([api.getInvoices(), api.getCompanies(), api.getServices()]);
    setInvoices(invList);
    setCompanies(compList);
    setServices(svcList);
  };

  useEffect(() => { if (user) fetchData(); }, [user]);

  useEffect(() => {
    if (!selectedCompany) { setUninvoicedEntries([]); return; }
    api.getTimeEntries({ company_id: selectedCompany, invoiced: false }).then(setUninvoicedEntries);
  }, [selectedCompany]);

  useEffect(() => {
    if (!selectedService) return;
    const svc = services.find((s) => s.id === selectedService);
    if (!svc) return;
    setServiceAmount(String(svc.amount));
    setServiceDescription(svc.name);
  }, [selectedService, services]);

  const generateInvoiceNumber = () => {
    const now = new Date();
    const year = now.getFullYear();
    const count = invoices.filter((i) => i.invoice_number.startsWith(`F${year}`)).length + 1;
    return `F${year}-${String(count).padStart(4, "0")}`;
  };

  const handleCreate = async () => {
    if (!user || !selectedCompany) return;
    const company = companies.find((c) => c.id === selectedCompany);
    if (!company) return;

    const entries = uninvoicedEntries.filter((e) => selectedEntries.includes(e.id));
    const svcAmt = Number(serviceAmount);
    const subtotal =
      createMode === "hours"
        ? entries.reduce((sum, e) => {
            const rate = e.hourly_rate ?? company.default_hourly_rate ?? 0;
            return sum + Number(e.hours) * Number(rate);
          }, 0)
        : Number.isFinite(svcAmt)
          ? svcAmt
          : NaN;
    const btw = parseFloat(btwPercentage);
    const btwAmount = subtotal * (btw / 100);
    const total = subtotal + btwAmount;
    const invoiceNumber = generateInvoiceNumber();

    try {
      const invoice = await api.createInvoice({
        company_id: selectedCompany,
        invoice_number: invoiceNumber,
        subtotal,
        btw_percentage: btw,
        btw_amount: btwAmount,
        total,
        notes: notes || null,
        advance_payment: 0,
        due_date: new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0],
      });

      const lines =
        createMode === "hours"
          ? entries.map((e) => ({
              invoice_id: invoice.id,
              description: e.description || "Werkzaamheden",
              date: e.date,
              hours: e.hours,
              hourly_rate: e.hourly_rate ?? company.default_hourly_rate ?? 0,
              amount: Number(e.hours) * Number(e.hourly_rate ?? company.default_hourly_rate ?? 0),
              time_entry_id: e.id,
            }))
          : [
              {
                invoice_id: invoice.id,
                description: serviceDescription.trim() || "Dienst",
                date: new Date().toISOString().split("T")[0],
                hours: null,
                hourly_rate: null,
                amount: svcAmt,
                time_entry_id: null,
              },
            ];
      await api.createInvoiceLinesBatch(lines);
      if (createMode === "hours") {
        await api.markTimeEntriesInvoiced({ ids: selectedEntries, invoice_id: invoice.id });
      }

      setOpen(false);
      setSelectedCompany("");
      setSelectedEntries([]);
      setSelectedService("");
      setServiceAmount("");
      setServiceDescription("");
      setCreateMode("hours");
      setNotes("");
      fetchData();
      toast({ title: "Factuur aangemaakt", description: invoiceNumber });
    } catch (error: unknown) {
      toast({ title: "Fout", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    }
  };

  const handleDownloadPDF = async (invoice: Invoice & { companies: { name: string | null } | null }) => {
    const [linesRes, settingsRes, companyRes] = await Promise.all([
      api.getInvoiceLines(invoice.id),
      api.getBusinessSettings(),
      api.getCompany(invoice.company_id),
    ]);
    await generateInvoicePDF(invoice, linesRes, settingsRes, companyRes);
  };

  const handleConfirmDelete = async () => {
    if (!invoiceToDelete) return;
    setDeleting(true);
    try {
      await api.deleteInvoice(invoiceToDelete.id);
      setInvoiceToDelete(null);
      fetchData();
      toast({ title: "Factuur verwijderd", description: "Gekoppelde uren staan weer open om te factureren." });
    } catch (error: unknown) {
      toast({ title: "Fout bij verwijderen", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const openEdit = (inv: Invoice & { companies: { name: string | null } | null }) => {
    setInvoiceToEdit(inv);
    setEditInvoiceNumber(inv.invoice_number);
    setEditInvoiceDate(inv.invoice_date);
    setEditDueDate(inv.due_date ?? "");
    setEditStatus(inv.status);
    setEditNotes(inv.notes ?? "");
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!invoiceToEdit) return;
    try {
      await api.updateInvoice(invoiceToEdit.id, {
        invoice_number: editInvoiceNumber.trim() || invoiceToEdit.invoice_number,
        invoice_date: editInvoiceDate,
        due_date: editDueDate ? editDueDate : null,
        status: editStatus,
        notes: editNotes.trim() ? editNotes.trim() : null,
      });
      setEditOpen(false);
      setInvoiceToEdit(null);
      await fetchData();
      toast({ title: "Factuur bijgewerkt" });
    } catch (e: unknown) {
      toast({ title: "Fout", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    }
  };

  const toggleEntry = (id: string) => {
    setSelectedEntries((prev) => prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Facturen</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" />Factuur aanmaken</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Nieuwe factuur</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>Type factuur</Label>
                <Select value={createMode} onValueChange={(v) => setCreateMode(v as "hours" | "service")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hours">Op basis van uren</SelectItem>
                    <SelectItem value="service">Op basis van dienst (vast bedrag)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Bedrijf</Label>
                <Select value={selectedCompany} onValueChange={setSelectedCompany}>
                  <SelectTrigger><SelectValue placeholder="Selecteer bedrijf" /></SelectTrigger>
                  <SelectContent>
                    {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {createMode === "hours" && uninvoicedEntries.length > 0 && (
                <div className="grid gap-2">
                  <Label>Selecteer uren</Label>
                  <div className="border rounded-md max-h-48 overflow-y-auto">
                    {uninvoicedEntries.map((entry) => (
                      <label key={entry.id} className="flex items-center gap-3 px-3 py-2 hover:bg-muted/50 cursor-pointer">
                        <input type="checkbox" checked={selectedEntries.includes(entry.id)} onChange={() => toggleEntry(entry.id)} className="rounded" />
                        <span className="text-sm">{new Date(entry.date).toLocaleDateString("nl-NL")}</span>
                        <span className="text-sm text-muted-foreground flex-1 truncate">{entry.description}</span>
                        <span className="text-sm font-medium">{Number(entry.hours).toFixed(2)}u</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {createMode === "service" && (
                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <Label>Dienst</Label>
                    <Select value={selectedService} onValueChange={setSelectedService}>
                      <SelectTrigger><SelectValue placeholder={services.length ? "Kies dienst" : "Geen diensten (maak aan bij Instellingen)"} /></SelectTrigger>
                      <SelectContent>
                        {services.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name} — €{Number(s.amount).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label>Omschrijving (op factuurregel)</Label>
                      <Input value={serviceDescription} onChange={(e) => setServiceDescription(e.target.value)} placeholder="Bijv. Website onderhoud" />
                    </div>
                    <div className="grid gap-2">
                      <Label>Bedrag (excl. BTW)</Label>
                      <Input type="number" step="0.01" value={serviceAmount} onChange={(e) => setServiceAmount(e.target.value)} placeholder="250.00" />
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>BTW-percentage</Label>
                  <Input type="number" value={btwPercentage} onChange={(e) => setBtwPercentage(e.target.value)} />
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Notities</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
              <Button
                onClick={handleCreate}
                disabled={
                  createMode === "hours"
                    ? selectedEntries.length === 0
                    : !selectedCompany || !serviceDescription.trim() || !Number.isFinite(Number(serviceAmount))
                }
              >
                Factuur aanmaken
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {invoices.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <FileText className="h-12 w-12 mb-4" />
            <p>Nog geen facturen</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nummer</TableHead>
                <TableHead>Bedrijf</TableHead>
                <TableHead>Datum</TableHead>
                <TableHead>Totaal</TableHead>
                <TableHead className="whitespace-nowrap">Voorschot</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-28 text-right">Acties</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell className="font-medium">{invoice.invoice_number}</TableCell>
                  <TableCell>{invoice.companies?.name}</TableCell>
                  <TableCell>{new Date(invoice.invoice_date).toLocaleDateString("nl-NL")}</TableCell>
                  <TableCell>€{Number(invoice.total).toLocaleString("nl-NL", { minimumFractionDigits: 2 })}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {Number(invoice.advance_payment ?? 0) > 0
                      ? `€${Number(invoice.advance_payment).toLocaleString("nl-NL", { minimumFractionDigits: 2 })}`
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={statusColors[invoice.status]}>{invoice.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(invoice)} title="Bewerken">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDownloadPDF(invoice)} title="PDF downloaden">
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setInvoiceToDelete(invoice)}
                        title="Factuur verwijderen"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <AlertDialog open={!!invoiceToDelete} onOpenChange={(open) => { if (!open) setInvoiceToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Factuur verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              Factuur <span className="font-medium text-foreground">{invoiceToDelete?.invoice_number}</span> wordt permanent
              verwijderd. Uren die op deze factuur stonden worden weer vrijgegeven, zodat je ze opnieuw kunt factureren.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Annuleren</AlertDialogCancel>
            <Button variant="destructive" onClick={handleConfirmDelete} disabled={deleting}>
              {deleting ? "Bezig…" : "Verwijderen"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={editOpen} onOpenChange={(v) => { setEditOpen(v); if (!v) setInvoiceToEdit(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Factuur bewerken</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Factuurnummer</Label>
              <Input value={editInvoiceNumber} onChange={(e) => setEditInvoiceNumber(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Factuurdatum</Label>
                <Input type="date" value={editInvoiceDate} onChange={(e) => setEditInvoiceDate(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label>Vervaldatum</Label>
                <Input type="date" value={editDueDate} onChange={(e) => setEditDueDate(e.target.value)} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Status</Label>
              <Select value={editStatus} onValueChange={setEditStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="concept">concept</SelectItem>
                  <SelectItem value="verzonden">verzonden</SelectItem>
                  <SelectItem value="betaald">betaald</SelectItem>
                  <SelectItem value="vervallen">vervallen</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Notities</Label>
              <Textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} />
            </div>
            <Button onClick={handleSaveEdit}>Opslaan</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
