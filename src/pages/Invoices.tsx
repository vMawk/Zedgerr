import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import type { Company, CompanyProduct, Invoice, InvoiceLine, Service, TimeEntry } from "@/lib/db-types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
import { Plus, FileText, Download, Trash2, Pencil, Split, Rows3, Clock, Package, Briefcase, FileMinus } from "lucide-react";
import { generateInvoicePDF } from "@/lib/pdf";
import { Checkbox } from "@/components/ui/checkbox";

const statusColors: Record<string, string> = {
  concept: "bg-muted text-muted-foreground",
  verzonden: "bg-primary/10 text-primary",
  betaald: "bg-success/10 text-success",
  vervallen: "bg-destructive/10 text-destructive",
};

const emptyProductForm = {
  name: "",
  serial_number: "",
  url: "",
  internal_notes: "",
  sale_price: "",
  price_includes_vat: false,
  vat_percentage: "21",
  cost_price: "",
};

interface InvoiceLineDraft {
  description: string;
  hours: string;
  hourly_rate: string;
  amount: string;
  /** datum voor deze regel (uren gebruiken de urendatum, rest de factuurdatum) */
  date: string | null;
  /** gekoppelde urenregistratie — wordt na aanmaken op 'gefactureerd' gezet */
  time_entry_id: string | null;
}

function statusLabel(status: string, notes: string | null): string {
  if (status === "vervallen" && (notes ?? "").toLowerCase().includes("gesplitst")) {
    return "gesplitst";
  }
  return status;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function productExVatPrice(p: CompanyProduct): number {
  const vatPct = p.vat_percentage ?? 21;
  return p.price_includes_vat ? p.sale_price / (1 + vatPct / 100) : p.sale_price;
}

export default function Invoices() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [invoices, setInvoices] = useState<(Invoice & { companies: { name: string | null; contact_person: string | null } | null })[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [open, setOpen] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState("");
  const [uninvoicedEntries, setUninvoicedEntries] = useState<(TimeEntry & { companies: Company | null })[]>([]);
  const [selectedEntries, setSelectedEntries] = useState<string[]>([]);
  const [companyProducts, setCompanyProducts] = useState<CompanyProduct[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<Record<string, number>>({});
  const [selectedService, setSelectedService] = useState("");
  const [lines, setLines] = useState<InvoiceLineDraft[]>([]);
  const [notes, setNotes] = useState("");
  const [btwPercentage, setBtwPercentage] = useState("21");
  const [invoiceType, setInvoiceType] = useState<"business" | "private">("business");
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [applyAdvance, setApplyAdvance] = useState(true);
  const [advanceLabel, setAdvanceLabel] = useState<"krediet" | "voorschot">("krediet");
  const [paymentMethod, setPaymentMethod] = useState<"overboeking" | "contant">("overboeking");
  const [creating, setCreating] = useState(false);

  // Inline product aanmaken/bewerken (zelfde als op de klantpagina)
  const [productOpen, setProductOpen] = useState(false);
  const [editProduct, setEditProduct] = useState<CompanyProduct | null>(null);
  const [productForm, setProductForm] = useState(emptyProductForm);

  const [invoiceToDelete, setInvoiceToDelete] = useState<Invoice | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [invoiceToEdit, setInvoiceToEdit] = useState<(Invoice & { companies: { name: string | null; contact_person: string | null } | null }) | null>(null);
  const [editInvoiceNumber, setEditInvoiceNumber] = useState("");
  const [editInvoiceDate, setEditInvoiceDate] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editStatus, setEditStatus] = useState("concept");
  const [editNotes, setEditNotes] = useState("");
  const [editInvoiceType, setEditInvoiceType] = useState<"business" | "private">("business");
  const [editPaymentMethod, setEditPaymentMethod] = useState<"overboeking" | "contant">("overboeking");
  const [creditNoteOpen, setCreditNoteOpen] = useState(false);
  const [creditNoteTarget, setCreditNoteTarget] = useState<(Invoice & { companies: { name: string | null; contact_person: string | null } | null }) | null>(null);
  const [creatingCN, setCreatingCN] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);
  const [invoiceToSplit, setInvoiceToSplit] = useState<(Invoice & { companies: { name: string | null; contact_person: string | null } | null }) | null>(null);
  const [splitParts, setSplitParts] = useState("3");
  const [splitIntervalDays, setSplitIntervalDays] = useState("30");
  const [splitFirstDueDate, setSplitFirstDueDate] = useState("");

  const [linesOpen, setLinesOpen] = useState(false);
  const [linesInvoice, setLinesInvoice] = useState<Invoice | null>(null);
  const [invoiceLines, setInvoiceLines] = useState<InvoiceLine[]>([]);
  const [newLineDesc, setNewLineDesc] = useState("");
  const [newLineAmount, setNewLineAmount] = useState("");

  const fetchData = async () => {
    const [invList, compList, svcList] = await Promise.all([api.getInvoices(), api.getCompanies(), api.getServices()]);
    setInvoices(invList);
    setCompanies(compList);
    setServices(svcList);
  };

  useEffect(() => { if (user) fetchData(); }, [user]);

  useEffect(() => {
    if (!selectedCompany) {
      setUninvoicedEntries([]);
      setCompanyProducts([]);
      setSelectedProducts({});
      setSelectedEntries([]);
      return;
    }
    api.getTimeEntries({ company_id: selectedCompany, invoiced: false }).then(setUninvoicedEntries);
    api.getCompanyProducts(selectedCompany).then(setCompanyProducts);
  }, [selectedCompany]);

  const refreshCompanyProducts = async () => {
    if (!selectedCompany) return;
    setCompanyProducts(await api.getCompanyProducts(selectedCompany));
  };

  const resetCreateForm = () => {
    setSelectedCompany("");
    setUninvoicedEntries([]);
    setSelectedEntries([]);
    setCompanyProducts([]);
    setSelectedProducts({});
    setSelectedService("");
    setLines([]);
    setNotes("");
    setBtwPercentage("21");
    setInvoiceType("business");
    setInvoiceDate(new Date().toISOString().split("T")[0]);
    setApplyAdvance(true);
    setAdvanceLabel("krediet");
    setPaymentMethod("overboeking");
  };

  const generateInvoiceNumber = () => {
    const now = new Date();
    const year = now.getFullYear();
    const count = invoices.filter((i) => i.invoice_number.startsWith(`F${year}`)).length + 1;
    return `F${year}-${String(count).padStart(4, "0")}`;
  };

  // ---- Regel-helpers (zelfde model als offertes) ----
  const updateLine = (index: number, field: keyof InvoiceLineDraft, value: string) => {
    setLines((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      if (field === "hours" || field === "hourly_rate") {
        const h = parseFloat(updated[index].hours) || 0;
        const r = parseFloat(updated[index].hourly_rate) || 0;
        updated[index].amount = (h * r).toFixed(2);
      }
      return updated;
    });
  };

  const addLine = () =>
    setLines((prev) => [...prev, { description: "", hours: "", hourly_rate: "", amount: "", date: null, time_entry_id: null }]);

  const removeLine = (i: number) => setLines((prev) => prev.filter((_, idx) => idx !== i));

  const addSelectedHoursToLines = () => {
    const company = companies.find((c) => c.id === selectedCompany);
    const toAdd = uninvoicedEntries
      .filter((e) => selectedEntries.includes(e.id))
      .map((e) => {
        const rate = Number(e.hourly_rate ?? company?.default_hourly_rate ?? 0);
        const hours = Number(e.hours);
        return {
          description: e.description || "Werkzaamheden",
          hours: String(hours),
          hourly_rate: String(rate),
          amount: round2(hours * rate).toFixed(2),
          date: e.date,
          time_entry_id: e.id,
        };
      });
    if (toAdd.length === 0) {
      toast({ title: "Geen uren geselecteerd", description: "Vink minimaal één urenregistratie aan.", variant: "destructive" });
      return;
    }
    setLines((prev) => [...prev, ...toAdd]);
    setSelectedEntries([]);
    toast({ title: `${toAdd.length} urenregel${toAdd.length === 1 ? "" : "s"} toegevoegd` });
  };

  const addSelectedProductsToLines = () => {
    const toAdd = companyProducts
      .filter((p) => (selectedProducts[p.id] ?? 0) > 0)
      .map((p) => {
        const qty = selectedProducts[p.id]!;
        return {
          description: qty > 1 ? `${p.name} (${qty}×)` : p.name,
          hours: "",
          hourly_rate: "",
          amount: round2(productExVatPrice(p) * qty).toFixed(2),
          date: null,
          time_entry_id: null,
        };
      });
    if (toAdd.length === 0) {
      toast({ title: "Geen producten geselecteerd", description: "Vink minimaal één product aan.", variant: "destructive" });
      return;
    }
    setLines((prev) => [...prev, ...toAdd]);
    setSelectedProducts({});
    toast({ title: `${toAdd.length} productregel${toAdd.length === 1 ? "" : "s"} toegevoegd`, description: "Je kunt omschrijving en bedrag per regel nog aanpassen." });
  };

  const addServiceToLines = () => {
    const svc = services.find((s) => s.id === selectedService);
    if (!svc) return;
    setLines((prev) => [
      ...prev,
      { description: svc.name, hours: "", hourly_rate: "", amount: Number(svc.amount).toFixed(2), date: null, time_entry_id: null },
    ]);
    setSelectedService("");
    toast({ title: "Dienst toegevoegd aan regels" });
  };

  const validLines = () => lines.filter((l) => l.description.trim() || (parseFloat(l.amount) || 0) > 0);
  const invoiceSubtotal = () => round2(validLines().reduce((sum, l) => sum + (parseFloat(l.amount) || 0), 0));

  // Inline product aanmaken/bewerken
  const openNewProduct = () => {
    setEditProduct(null);
    setProductForm(emptyProductForm);
    setProductOpen(true);
  };

  const openEditProduct = (p: CompanyProduct) => {
    setEditProduct(p);
    setProductForm({
      name: p.name,
      serial_number: p.serial_number ?? "",
      url: p.url ?? "",
      internal_notes: p.internal_notes ?? "",
      sale_price: String(p.sale_price),
      price_includes_vat: Boolean(p.price_includes_vat),
      vat_percentage: String(p.vat_percentage ?? 21),
      cost_price: p.cost_price != null ? String(p.cost_price) : "",
    });
    setProductOpen(true);
  };

  const handleSaveProduct = async () => {
    if (!selectedCompany || !productForm.name.trim() || !productForm.sale_price) return;
    const body = {
      name: productForm.name.trim(),
      serial_number: productForm.serial_number || null,
      url: productForm.url || null,
      internal_notes: productForm.internal_notes || null,
      sale_price: parseFloat(productForm.sale_price),
      price_includes_vat: productForm.price_includes_vat,
      vat_percentage: parseFloat(productForm.vat_percentage) || 21,
      cost_price: productForm.cost_price ? parseFloat(productForm.cost_price) : null,
    };
    try {
      if (editProduct) {
        await api.updateCompanyProduct(selectedCompany, editProduct.id, body);
        toast({ title: "Product bijgewerkt" });
      } else {
        await api.createCompanyProduct(selectedCompany, body);
        toast({ title: "Product toegevoegd" });
      }
      setProductOpen(false);
      setEditProduct(null);
      await refreshCompanyProducts();
    } catch (e: unknown) {
      toast({ title: "Fout", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    }
  };

  const handleCreate = async () => {
    if (!user || !selectedCompany) return;
    const company = companies.find((c) => c.id === selectedCompany);
    if (!company) return;

    const draftLines = validLines();
    if (draftLines.length === 0 || draftLines.every((l) => (parseFloat(l.amount) || 0) <= 0)) {
      toast({ title: "Geen regels", description: "Voeg uren, producten, een dienst of een handmatige regel toe.", variant: "destructive" });
      return;
    }

    const invDate = invoiceDate || new Date().toISOString().split("T")[0];
    const subtotal = round2(draftLines.reduce((sum, l) => sum + (parseFloat(l.amount) || 0), 0));
    const btw = invoiceType === "private" ? 0 : parseFloat(btwPercentage);
    const btwAmount = invoiceType === "private" ? 0 : round2(subtotal * (btw / 100));
    const total = round2(subtotal + btwAmount);
    const companyAdvance = round2(Math.max(0, Number(company.advance_balance ?? 0)));
    const appliedAdvance = applyAdvance ? round2(Math.min(companyAdvance, total)) : 0;
    const invoiceNumber = generateInvoiceNumber();

    setCreating(true);
    try {
      const invoice = await api.createInvoice({
        company_id: selectedCompany,
        invoice_number: invoiceNumber,
        invoice_date: invDate,
        subtotal,
        btw_percentage: btw,
        btw_amount: btwAmount,
        total,
        notes: notes || null,
        advance_payment: appliedAdvance,
        advance_label: advanceLabel,
        due_date: new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0],
        invoice_type: invoiceType,
        payment_method: paymentMethod,
      });

      const dbLines = draftLines.map((l) => ({
        invoice_id: invoice.id,
        description: l.description.trim() || "Werkzaamheden",
        date: l.date ?? invDate,
        hours: l.hours ? parseFloat(l.hours) : null,
        hourly_rate: l.hourly_rate ? parseFloat(l.hourly_rate) : null,
        amount: parseFloat(l.amount) || 0,
        time_entry_id: l.time_entry_id,
      }));
      await api.createInvoiceLinesBatch(dbLines);

      const entryIds = draftLines.map((l) => l.time_entry_id).filter((id): id is string => !!id);
      if (entryIds.length > 0) {
        await api.markTimeEntriesInvoiced({ ids: entryIds, invoice_id: invoice.id });
      }

      setOpen(false);
      resetCreateForm();
      fetchData();
      toast({
        title: "Factuur aangemaakt",
        description:
          appliedAdvance > 0
            ? `${invoiceNumber} • ${advanceLabel === "voorschot" ? "Voorschot" : "Krediet"} €${appliedAdvance.toLocaleString("nl-NL", { minimumFractionDigits: 2 })} verrekend`
            : invoiceNumber,
      });
    } catch (error: unknown) {
      toast({ title: "Fout", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const handleDownloadPDF = async (invoice: Invoice & { companies: { name: string | null; contact_person: string | null } | null }) => {
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

  const openEdit = (inv: Invoice & { companies: { name: string | null; contact_person: string | null } | null }) => {
    setInvoiceToEdit(inv);
    setEditInvoiceNumber(inv.invoice_number);
    setEditInvoiceDate(inv.invoice_date);
    setEditDueDate(inv.due_date ?? "");
    setEditStatus(inv.status);
    setEditNotes(inv.notes ?? "");
    setEditInvoiceType((inv.invoice_type as "business" | "private") || "business");
    setEditPaymentMethod((inv.payment_method as "overboeking" | "contant") || "overboeking");
    setEditOpen(true);
  };

  const openLines = async (inv: Invoice) => {
    setLinesInvoice(inv);
    const lines = await api.getInvoiceLines(inv.id);
    setInvoiceLines(lines);
    setNewLineDesc("");
    setNewLineAmount("");
    setLinesOpen(true);
  };

  const handleAddLine = async () => {
    if (!linesInvoice || !newLineDesc.trim() || !newLineAmount) return;
    const line = await api.createInvoiceLine({
      invoice_id: linesInvoice.id,
      description: newLineDesc.trim(),
      amount: parseFloat(newLineAmount),
    });
    setInvoiceLines((prev) => [...prev, line]);
    setNewLineDesc("");
    setNewLineAmount("");
    fetchData();
  };

  const handleDeleteLine = async (lineId: string) => {
    if (!linesInvoice) return;
    await api.deleteInvoiceLine(lineId);
    setInvoiceLines((prev) => prev.filter((l) => l.id !== lineId));
    fetchData();
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
        invoice_type: editInvoiceType,
        payment_method: editPaymentMethod,
      });
      setEditOpen(false);
      setInvoiceToEdit(null);
      await fetchData();
      toast({ title: "Factuur bijgewerkt" });
    } catch (e: unknown) {
      toast({ title: "Fout", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    }
  };

  const handleConfirmCreditNote = async () => {
    if (!creditNoteTarget) return;
    setCreatingCN(true);
    try {
      await api.createCreditNote(creditNoteTarget.id);
      setCreditNoteOpen(false);
      setCreditNoteTarget(null);
      await fetchData();
      toast({ title: "Creditnota aangemaakt", description: "Je vindt hem bovenaan de lijst." });
    } catch (e: unknown) {
      toast({ title: "Fout", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setCreatingCN(false);
    }
  };

  const openSplit = (inv: Invoice & { companies: { name: string | null; contact_person: string | null } | null }) => {
    setInvoiceToSplit(inv);
    setSplitParts("3");
    setSplitIntervalDays("30");
    setSplitFirstDueDate(inv.due_date ?? "");
    setSplitOpen(true);
  };

  const handleConfirmSplit = async () => {
    if (!invoiceToSplit) return;
    try {
      await api.splitInvoice(invoiceToSplit.id, {
        parts: Number(splitParts),
        interval_days: Number(splitIntervalDays),
        first_due_date: splitFirstDueDate ? splitFirstDueDate : undefined,
      });
      setSplitOpen(false);
      setInvoiceToSplit(null);
      await fetchData();
      toast({ title: "Factuur gesplitst", description: `Termijnen aangemaakt en originele factuur op 'vervallen' gezet.` });
    } catch (e: unknown) {
      toast({ title: "Fout", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    }
  };

  const toggleEntry = (id: string) => {
    setSelectedEntries((prev) => (prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]));
  };

  const selectedCompanyObj = companies.find((c) => c.id === selectedCompany);
  const availableAdvance = round2(Math.max(0, Number(selectedCompanyObj?.advance_balance ?? 0)));
  // Uren die nog niet als regel zijn toegevoegd
  const addedEntryIds = new Set(lines.map((l) => l.time_entry_id).filter(Boolean));
  const pickableEntries = uninvoicedEntries.filter((e) => !addedEntryIds.has(e.id));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Facturen</h1>
        <Dialog
          open={open}
          onOpenChange={(v) => {
            setOpen(v);
            if (!v) resetCreateForm();
          }}
        >
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" />Factuur aanmaken</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Nieuwe factuur</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>Klant</Label>
                <Select value={selectedCompany} onValueChange={setSelectedCompany}>
                  <SelectTrigger><SelectValue placeholder="Selecteer klant" /></SelectTrigger>
                  <SelectContent>
                    {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name || c.contact_person || "Klant"}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Regels — uren, producten en diensten samen op één factuur */}
              <div className="grid gap-2">
                <div className="flex items-center justify-between gap-2">
                  <Label>Regels</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addLine}>
                    <Plus className="mr-1 h-3 w-3" />Regel toevoegen
                  </Button>
                </div>
                {lines.length === 0 ? (
                  <p className="text-sm text-muted-foreground rounded-md border border-dashed p-4 text-center">
                    Nog geen regels. Voeg hieronder uren, producten of een dienst toe — of maak een handmatige regel.
                  </p>
                ) : (
                  lines.map((line, i) => (
                    <div key={i} className="grid grid-cols-12 gap-2 items-end">
                      <div className="col-span-4">
                        <Input placeholder="Omschrijving" value={line.description} onChange={(e) => updateLine(i, "description", e.target.value)} />
                      </div>
                      <div className="col-span-2">
                        <Input type="number" placeholder="Uren" value={line.hours} onChange={(e) => updateLine(i, "hours", e.target.value)} />
                      </div>
                      <div className="col-span-2">
                        <Input type="number" placeholder="Tarief" value={line.hourly_rate} onChange={(e) => updateLine(i, "hourly_rate", e.target.value)} />
                      </div>
                      <div className="col-span-3">
                        <Input type="number" placeholder="Bedrag" value={line.amount} onChange={(e) => updateLine(i, "amount", e.target.value)} />
                      </div>
                      <div className="col-span-1">
                        <Button type="button" variant="ghost" size="icon" onClick={() => removeLine(i)} title="Regel verwijderen">
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {selectedCompany && (
                <div className="grid gap-3">
                  {/* Uren van klant */}
                  <div className="grid gap-2 rounded-md border p-3 bg-muted/20">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <Label className="mb-0 flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />Openstaande uren</Label>
                      <Button
                        type="button"
                        size="sm"
                        onClick={addSelectedHoursToLines}
                        disabled={selectedEntries.length === 0}
                      >
                        Toevoegen aan regels
                      </Button>
                    </div>
                    {pickableEntries.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        {uninvoicedEntries.length === 0 ? "Geen openstaande uren voor deze klant." : "Alle openstaande uren zijn al toegevoegd."}
                      </p>
                    ) : (
                      <div className="border rounded-md max-h-48 overflow-y-auto bg-background">
                        {pickableEntries.map((entry) => (
                          <label key={entry.id} className="flex items-center gap-3 px-3 py-2 hover:bg-muted/50 cursor-pointer">
                            <Checkbox checked={selectedEntries.includes(entry.id)} onCheckedChange={() => toggleEntry(entry.id)} />
                            <span className="text-sm">{new Date(entry.date).toLocaleDateString("nl-NL")}</span>
                            <span className="text-sm text-muted-foreground flex-1 truncate">{entry.description}</span>
                            <span className="text-sm font-medium">{Number(entry.hours).toFixed(2)}u</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Producten van klant */}
                  <div className="grid gap-2 rounded-md border p-3 bg-muted/20">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <Label className="mb-0 flex items-center gap-1.5"><Package className="h-3.5 w-3.5" />Producten van klant</Label>
                      <div className="flex gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={openNewProduct}>
                          <Plus className="mr-1 h-3 w-3" />Nieuw product
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          onClick={addSelectedProductsToLines}
                          disabled={!companyProducts.some((p) => (selectedProducts[p.id] ?? 0) > 0)}
                        >
                          Toevoegen aan regels
                        </Button>
                      </div>
                    </div>
                    {companyProducts.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Nog geen producten voor deze klant.</p>
                    ) : (
                      <div className="border rounded-md divide-y bg-background">
                        {companyProducts.map((p) => {
                          const qty = selectedProducts[p.id] ?? 0;
                          const exVatPrice = productExVatPrice(p);
                          return (
                            <div key={p.id} className="flex items-center gap-2 px-3 py-2">
                              <Checkbox
                                checked={qty > 0}
                                onCheckedChange={(checked) =>
                                  setSelectedProducts((prev) => ({ ...prev, [p.id]: checked ? 1 : 0 }))
                                }
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm truncate">{p.name}</p>
                                {p.serial_number && <p className="text-xs text-muted-foreground font-mono">{p.serial_number}</p>}
                              </div>
                              <span className="text-sm text-muted-foreground shrink-0 w-24 text-right">
                                {exVatPrice.toLocaleString("nl-NL", { minimumFractionDigits: 2 })} excl.
                              </span>
                              <Input
                                type="number"
                                min={1}
                                className="w-16 h-7 text-sm text-center"
                                value={qty || ""}
                                disabled={qty === 0}
                                onChange={(e) => {
                                  const n = Math.max(1, parseInt(e.target.value) || 1);
                                  setSelectedProducts((prev) => ({ ...prev, [p.id]: n }));
                                }}
                              />
                              <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => openEditProduct(p)} title="Product bewerken">
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Dienst */}
                  {services.length > 0 && (
                    <div className="grid gap-2 rounded-md border p-3 bg-muted/20">
                      <Label className="mb-0 flex items-center gap-1.5"><Briefcase className="h-3.5 w-3.5" />Dienst (vast bedrag)</Label>
                      <div className="flex gap-2">
                        <Select value={selectedService} onValueChange={setSelectedService}>
                          <SelectTrigger className="flex-1"><SelectValue placeholder="Kies dienst" /></SelectTrigger>
                          <SelectContent>
                            {services.map((s) => (
                              <SelectItem key={s.id} value={s.id}>
                                {s.name} — €{Number(s.amount).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button type="button" size="sm" onClick={addServiceToLines} disabled={!selectedService}>
                          Toevoegen
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Factuurinstellingen */}
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Factuurdatum</Label>
                  <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label>Betaalwijze</Label>
                  <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as "overboeking" | "contant")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="overboeking">Overboeking</SelectItem>
                      <SelectItem value="contant">Contant</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Factuurtype</Label>
                  <Select value={invoiceType} onValueChange={(v) => setInvoiceType(v as "business" | "private")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="business">Zakelijk (met BTW)</SelectItem>
                      <SelectItem value="private">Particulier (geen BTW)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>BTW-percentage</Label>
                  <Input type="number" value={invoiceType === "private" ? "0" : btwPercentage} onChange={(e) => setBtwPercentage(e.target.value)} disabled={invoiceType === "private"} />
                </div>
              </div>

              {/* Saldo verrekenen — alleen als de klant saldo heeft */}
              {selectedCompany && availableAdvance > 0 && (
                <div className="rounded-md border p-3 space-y-3">
                  <div className="flex items-start gap-3">
                    <Checkbox id="apply-advance" checked={applyAdvance} onCheckedChange={(c) => setApplyAdvance(c === true)} className="mt-1" />
                    <div className="grid gap-1 flex-1">
                      <Label htmlFor="apply-advance" className="font-medium leading-snug">
                        Klantsaldo verrekenen (€{availableAdvance.toLocaleString("nl-NL", { minimumFractionDigits: 2 })} beschikbaar)
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Zo niet, dan blijft het saldo op de klant staan en wordt er niets op deze factuur afgetrokken.
                      </p>
                    </div>
                  </div>
                  {applyAdvance && (
                    <div className="grid gap-2 pl-7 sm:pl-0">
                      <Label>Op de factuur (PDF) tonen als</Label>
                      <Select value={advanceLabel} onValueChange={(v) => setAdvanceLabel(v as "krediet" | "voorschot")}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="krediet">Krediet</SelectItem>
                          <SelectItem value="voorschot">Voorschot</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              )}

              <div className="grid gap-2">
                <Label>Notities</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>

              {/* Totaaloverzicht */}
              {(() => {
                const subtotal = invoiceSubtotal();
                if (subtotal <= 0) return null;
                const vat = invoiceType === "private" ? 0 : parseFloat(btwPercentage || "0");
                const vatAmount = invoiceType === "private" ? 0 : round2(subtotal * (vat / 100));
                const grossTotal = round2(subtotal + vatAmount);
                const appliedAdvance = applyAdvance ? round2(Math.min(availableAdvance, grossTotal)) : 0;
                const netTotal = round2(grossTotal - appliedAdvance);
                const labelWord = advanceLabel === "voorschot" ? "voorschot" : "krediet";
                return (
                  <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
                    <p>
                      Totaal: <span className="font-medium">€{grossTotal.toLocaleString("nl-NL", { minimumFractionDigits: 2 })}</span>
                      <span className="text-muted-foreground"> (excl. €{subtotal.toLocaleString("nl-NL", { minimumFractionDigits: 2 })}{vat > 0 ? ` + ${vat}% BTW` : ""})</span>
                    </p>
                    {appliedAdvance > 0 && (
                      <>
                        <p>Verrekend ({labelWord}): <span className="font-medium">€{appliedAdvance.toLocaleString("nl-NL", { minimumFractionDigits: 2 })}</span></p>
                        <p>Te betalen: <span className="font-medium">€{netTotal.toLocaleString("nl-NL", { minimumFractionDigits: 2 })}</span></p>
                      </>
                    )}
                  </div>
                );
              })()}

              <Button onClick={handleCreate} disabled={creating || !selectedCompany || validLines().length === 0}>
                {creating ? "Bezig…" : "Factuur aanmaken"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Inline product aanmaken/bewerken */}
        <Dialog open={productOpen} onOpenChange={(v) => { setProductOpen(v); if (!v) setEditProduct(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>{editProduct ? "Product bewerken" : "Product toevoegen"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="grid gap-2">
                <Label>Naam *</Label>
                <Input value={productForm.name} onChange={(e) => setProductForm((f) => ({ ...f, name: e.target.value }))} placeholder="Bijv. Website licentie" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label>Serienummer</Label>
                  <Input value={productForm.serial_number} onChange={(e) => setProductForm((f) => ({ ...f, serial_number: e.target.value }))} placeholder="SN-12345" className="font-mono text-sm" />
                </div>
                <div className="grid gap-2">
                  <Label>BTW (%)</Label>
                  <Select value={productForm.vat_percentage} onValueChange={(v) => setProductForm((f) => ({ ...f, vat_percentage: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="21">21%</SelectItem>
                      <SelectItem value="9">9%</SelectItem>
                      <SelectItem value="0">0%</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Link</Label>
                <Input type="url" value={productForm.url} onChange={(e) => setProductForm((f) => ({ ...f, url: e.target.value }))} placeholder="https://…" />
              </div>
              <div className="grid gap-2">
                <Label>Interne notities</Label>
                <Textarea rows={2} value={productForm.internal_notes} onChange={(e) => setProductForm((f) => ({ ...f, internal_notes: e.target.value }))} />
              </div>
              <div className="flex items-center gap-3">
                <Switch id="inv-incl-vat" checked={productForm.price_includes_vat} onCheckedChange={(v) => setProductForm((f) => ({ ...f, price_includes_vat: v }))} />
                <Label htmlFor="inv-incl-vat" className="cursor-pointer">Prijs inclusief BTW invoeren</Label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label>Verkoopprijs ({productForm.price_includes_vat ? "incl." : "excl."} BTW) *</Label>
                  <Input type="number" step="0.01" min="0" value={productForm.sale_price} onChange={(e) => setProductForm((f) => ({ ...f, sale_price: e.target.value }))} />
                </div>
                <div className="grid gap-2">
                  <Label>Inkoopprijs (excl. BTW)</Label>
                  <Input type="number" step="0.01" min="0" value={productForm.cost_price} onChange={(e) => setProductForm((f) => ({ ...f, cost_price: e.target.value }))} placeholder="optioneel" />
                </div>
              </div>
              <Button onClick={handleSaveProduct} disabled={!productForm.name.trim() || !productForm.sale_price}>
                {editProduct ? "Opslaan" : "Toevoegen"}
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
                <TableHead className="whitespace-nowrap">Verrekend</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-28 text-right">Acties</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((invoice) => (
                <TableRow
                  key={invoice.id}
                  className={
                    invoice.status === "vervallen"
                      ? "opacity-55 text-muted-foreground"
                      : invoice.status === "betaald"
                        ? "bg-emerald-500/8"
                        : undefined
                  }
                >
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {invoice.invoice_number}
                      {invoice.is_credit_note && (
                        <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 text-xs">CN</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{invoice.companies?.name || invoice.companies?.contact_person || "Klant"}</TableCell>
                  <TableCell>{new Date(invoice.invoice_date).toLocaleDateString("nl-NL")}</TableCell>
                  <TableCell>
                    <div className="leading-tight">
                      <p className="font-medium">
                        €{Number(Number(invoice.total) - Number(invoice.advance_payment ?? 0)).toLocaleString("nl-NL", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </p>
                      {Number(invoice.advance_payment ?? 0) > 0 && (
                        <p className="text-xs text-muted-foreground">
                          van €{Number(invoice.total).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {Number(invoice.advance_payment ?? 0) > 0
                      ? `€${Number(invoice.advance_payment).toLocaleString("nl-NL", { minimumFractionDigits: 2 })}`
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={statusColors[invoice.status]}>
                      {statusLabel(invoice.status, invoice.notes)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openLines(invoice)} title="Regels bewerken">
                        <Rows3 className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(invoice)} title="Bewerken">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {!invoice.is_credit_note && invoice.status !== "vervallen" && (
                        <Button variant="ghost" size="icon" onClick={() => { setCreditNoteTarget(invoice); setCreditNoteOpen(true); }} title="Creditnota aanmaken">
                          <FileMinus className="h-4 w-4" />
                        </Button>
                      )}
                      {!invoice.is_credit_note && (
                        <Button variant="ghost" size="icon" onClick={() => openSplit(invoice)} title="Splitsen in termijnen">
                          <Split className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDownloadPDF(invoice)}
                        title="PDF downloaden"
                        disabled={invoice.status === "vervallen"}
                      >
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
              Gebruikt krediet wordt ook teruggezet op de klant.
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
              <Label>Factuurtype</Label>
              <Select value={editInvoiceType} onValueChange={(v) => setEditInvoiceType(v as "business" | "private")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="business">Zakelijk (met BTW)</SelectItem>
                  <SelectItem value="private">Particulier (vrijgesteld van BTW)</SelectItem>
                </SelectContent>
              </Select>
            </div>
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
              <Label>Betaalwijze</Label>
              <Select value={editPaymentMethod} onValueChange={(v) => setEditPaymentMethod(v as "overboeking" | "contant")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="overboeking">Overboeking</SelectItem>
                  <SelectItem value="contant">Contant</SelectItem>
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

      <Dialog open={linesOpen} onOpenChange={(v) => { setLinesOpen(v); if (!v) { setLinesInvoice(null); setInvoiceLines([]); } }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Regels — {linesInvoice?.invoice_number}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {invoiceLines.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nog geen regels.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Omschrijving</TableHead>
                    <TableHead className="text-right w-28">Bedrag</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoiceLines.map((line) => (
                    <TableRow key={line.id}>
                      <TableCell>
                        <p className="text-sm">{line.description}</p>
                        {line.hours && (
                          <p className="text-xs text-muted-foreground">
                            {Number(line.hours).toFixed(2)}u × €{Number(line.hourly_rate).toFixed(2)}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        €{Number(line.amount).toLocaleString("nl-NL", { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteLine(line.id)}
                          className="h-7 w-7 text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <div className="border-t pt-4 space-y-3">
              <p className="text-sm font-medium">Regel toevoegen</p>
              <div className="flex gap-2">
                <Input
                  className="flex-1"
                  placeholder="Omschrijving"
                  value={newLineDesc}
                  onChange={(e) => setNewLineDesc(e.target.value)}
                />
                <Input
                  className="w-32"
                  type="number"
                  step="0.01"
                  placeholder="Bedrag"
                  value={newLineAmount}
                  onChange={(e) => setNewLineAmount(e.target.value)}
                />
                <Button
                  onClick={handleAddLine}
                  disabled={!newLineDesc.trim() || !newLineAmount || isNaN(parseFloat(newLineAmount))}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={creditNoteOpen} onOpenChange={(v) => { setCreditNoteOpen(v); if (!v) setCreditNoteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Creditnota aanmaken?</AlertDialogTitle>
            <AlertDialogDescription>
              Er wordt een creditnota aangemaakt voor factuur{" "}
              <span className="font-medium text-foreground">{creditNoteTarget?.invoice_number}</span>.
              De creditnota heeft hetzelfde bedrag als de originele factuur maar dan negatief.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={creatingCN}>Annuleren</AlertDialogCancel>
            <Button onClick={handleConfirmCreditNote} disabled={creatingCN}>
              {creatingCN ? "Bezig…" : "Creditnota aanmaken"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={splitOpen} onOpenChange={(v) => { setSplitOpen(v); if (!v) setInvoiceToSplit(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Splitsen in termijnen</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <p className="text-sm text-muted-foreground">
              Dit maakt losse conceptfacturen aan (gelijk verdeeld) en zet de originele factuur op <span className="font-medium text-foreground">vervallen</span>.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Aantal termijnen</Label>
                <Input type="number" min={2} max={12} value={splitParts} onChange={(e) => setSplitParts(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label>Dagen tussen termijnen</Label>
                <Input type="number" min={1} max={365} value={splitIntervalDays} onChange={(e) => setSplitIntervalDays(e.target.value)} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Eerste vervaldatum</Label>
              <Input type="date" value={splitFirstDueDate} onChange={(e) => setSplitFirstDueDate(e.target.value)} />
              <p className="text-xs text-muted-foreground">Leeg laten = we gebruiken de huidige vervaldatum of zetten standaard +30 dagen.</p>
            </div>
            <Button onClick={handleConfirmSplit} disabled={!invoiceToSplit}>
              Splitsen
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
