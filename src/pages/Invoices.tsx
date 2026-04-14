import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import type { Company, Invoice, TimeEntry } from "@/lib/db-types";
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
import { Plus, FileText, Download, Trash2 } from "lucide-react";
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
  const [open, setOpen] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState("");
  const [uninvoicedEntries, setUninvoicedEntries] = useState<(TimeEntry & { companies: Company | null })[]>([]);
  const [selectedEntries, setSelectedEntries] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [btwPercentage, setBtwPercentage] = useState("21");
  const [invoiceToDelete, setInvoiceToDelete] = useState<Invoice | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchData = async () => {
    const [invList, compList] = await Promise.all([api.getInvoices(), api.getCompanies()]);
    setInvoices(invList);
    setCompanies(compList);
  };

  useEffect(() => { if (user) fetchData(); }, [user]);

  useEffect(() => {
    if (!selectedCompany) { setUninvoicedEntries([]); return; }
    api.getTimeEntries({ company_id: selectedCompany, invoiced: false }).then(setUninvoicedEntries);
  }, [selectedCompany]);

  const generateInvoiceNumber = () => {
    const now = new Date();
    const year = now.getFullYear();
    const count = invoices.filter((i) => i.invoice_number.startsWith(`F${year}`)).length + 1;
    return `F${year}-${String(count).padStart(4, "0")}`;
  };

  const handleCreate = async () => {
    if (!user || !selectedCompany || selectedEntries.length === 0) return;
    const company = companies.find((c) => c.id === selectedCompany);
    if (!company) return;

    const entries = uninvoicedEntries.filter((e) => selectedEntries.includes(e.id));
    const subtotal = entries.reduce((sum, e) => {
      const rate = e.hourly_rate ?? company.default_hourly_rate ?? 0;
      return sum + Number(e.hours) * Number(rate);
    }, 0);
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

      const lines = entries.map((e) => ({
        invoice_id: invoice.id,
        description: e.description || "Werkzaamheden",
        date: e.date,
        hours: e.hours,
        hourly_rate: e.hourly_rate ?? company.default_hourly_rate ?? 0,
        amount: Number(e.hours) * Number(e.hourly_rate ?? company.default_hourly_rate ?? 0),
        time_entry_id: e.id,
      }));
      await api.createInvoiceLinesBatch(lines);
      await api.markTimeEntriesInvoiced({ ids: selectedEntries, invoice_id: invoice.id });

      setOpen(false);
      setSelectedCompany("");
      setSelectedEntries([]);
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
                <Label>Bedrijf</Label>
                <Select value={selectedCompany} onValueChange={setSelectedCompany}>
                  <SelectTrigger><SelectValue placeholder="Selecteer bedrijf" /></SelectTrigger>
                  <SelectContent>
                    {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {uninvoicedEntries.length > 0 && (
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
              <Button onClick={handleCreate} disabled={selectedEntries.length === 0}>Factuur aanmaken</Button>
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
    </div>
  );
}
