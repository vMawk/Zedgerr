import { useEffect, useState } from "react";
import { useOpenOnNew } from "@/hooks/use-open-on-new";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import type { Company, CompanyProduct, Invoice, InvoiceLine, InvoiceType, Service, TimeEntry } from "@/lib/db-types";
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
import { useTaxSettings } from "@/lib/tax";
import { rateOptions } from "@/lib/tax-presets";
import { Checkbox } from "@/components/ui/checkbox";

const statusColors: Record<string, string> = {
  concept: "bg-[hsl(220_13%_95%)] text-[hsl(220_13%_40%)]",
  verzonden: "bg-[hsl(38_92%_95%)] text-[hsl(38_60%_35%)]",
  betaald: "bg-success/12 text-success",
  vervallen: "bg-destructive/10 text-destructive",
  gesplitst: "bg-[hsl(250_80%_95%)] text-[hsl(250_50%_45%)]",
};

const emptyProductForm = {
  name: "",
  serial_number: "",
  url: "",
  internal_notes: "",
  sale_price: "",
  price_includes_vat: false,
  vat_percentage: "",
  cost_price: "",
};

interface InvoiceLineDraft {
  description: string;
  hours: string;
  hourly_rate: string;
  amount: string;
  /** Line date: time entries keep their own date, other lines use the invoice date. */
  date: string | null;
  /** Linked time entry, marked as invoiced once the invoice is created. */
  time_entry_id: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  concept: "Draft",
  verzonden: "Sent",
  betaald: "Paid",
  vervallen: "Void",
  gesplitst: "Split",
};

function statusLabel(status: string, notes: string | null): string {
  if (status === "vervallen" && /gesplitst|split into/i.test(notes ?? "")) {
    return STATUS_LABELS.gesplitst;
  }
  return STATUS_LABELS[status] ?? status;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function productExVatPrice(p: CompanyProduct): number {
  const vatPct = p.vat_percentage ?? 0;
  return p.price_includes_vat ? p.sale_price / (1 + vatPct / 100) : p.sale_price;
}


export default function Invoices() {
  const { taxName, defaultRate, preset, isEu, currencySymbol: cs } = useTaxSettings();
  const { user } = useAuth();
  const { toast } = useToast();
  const [invoices, setInvoices] = useState<(Invoice & { companies: { name: string | null; contact_person: string | null } | null })[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [open, setOpen] = useState(false);
  useOpenOnNew(setOpen);
  const [selectedCompany, setSelectedCompany] = useState("");
  const [uninvoicedEntries, setUninvoicedEntries] = useState<(TimeEntry & { companies: Company | null })[]>([]);
  const [selectedEntries, setSelectedEntries] = useState<string[]>([]);
  const [companyProducts, setCompanyProducts] = useState<CompanyProduct[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<Record<string, number>>({});
  const [selectedService, setSelectedService] = useState("");
  const [lines, setLines] = useState<InvoiceLineDraft[]>([]);
  const [notes, setNotes] = useState("");
  const [btwPercentage, setBtwPercentage] = useState(String(defaultRate));
  const [invoiceType, setInvoiceType] = useState<InvoiceType>("business");
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [applyAdvance, setApplyAdvance] = useState(true);
  const [advanceLabel, setAdvanceLabel] = useState<"krediet" | "voorschot">("krediet");
  const [paymentMethod, setPaymentMethod] = useState<"overboeking" | "contant">("overboeking");
  const [creating, setCreating] = useState(false);

  // Inline product create/edit, same as on the client page
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
  const [editInvoiceType, setEditInvoiceType] = useState<InvoiceType>("business");
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
    setBtwPercentage(String(defaultRate));
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

  // Line helpers, shared model with quotes
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
          description: e.description || "Work",
          hours: String(hours),
          hourly_rate: String(rate),
          amount: round2(hours * rate).toFixed(2),
          date: e.date,
          time_entry_id: e.id,
        };
      });
    if (toAdd.length === 0) {
      toast({ title: "No hours selected", description: "Select at least one time entry.", variant: "destructive" });
      return;
    }
    setLines((prev) => [...prev, ...toAdd]);
    setSelectedEntries([]);
    toast({ title: `${toAdd.length} time line${toAdd.length === 1 ? "" : "s"} added` });
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
      toast({ title: "No products selected", description: "Select at least one product.", variant: "destructive" });
      return;
    }
    setLines((prev) => [...prev, ...toAdd]);
    setSelectedProducts({});
    toast({ title: `${toAdd.length} product line${toAdd.length === 1 ? "" : "s"} added`, description: "You can still edit the description and amount of each line." });
  };

  const addServiceToLines = () => {
    const svc = services.find((s) => s.id === selectedService);
    if (!svc) return;
    setLines((prev) => [
      ...prev,
      { description: svc.name, hours: "", hourly_rate: "", amount: Number(svc.amount).toFixed(2), date: null, time_entry_id: null },
    ]);
    setSelectedService("");
    toast({ title: "Service added to lines" });
  };

  const validLines = () => lines.filter((l) => l.description.trim() || (parseFloat(l.amount) || 0) > 0);
  const invoiceSubtotal = () => round2(validLines().reduce((sum, l) => sum + (parseFloat(l.amount) || 0), 0));

  // Inline product create/edit
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
      vat_percentage: String(p.vat_percentage ?? defaultRate),
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
      vat_percentage: parseFloat(productForm.vat_percentage) || defaultRate,
      cost_price: productForm.cost_price ? parseFloat(productForm.cost_price) : null,
    };
    try {
      if (editProduct) {
        await api.updateCompanyProduct(selectedCompany, editProduct.id, body);
        toast({ title: "Product updated" });
      } else {
        await api.createCompanyProduct(selectedCompany, body);
        toast({ title: "Product added" });
      }
      setProductOpen(false);
      setEditProduct(null);
      await refreshCompanyProducts();
    } catch (e: unknown) {
      toast({ title: "Error", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    }
  };

  const handleCreate = async () => {
    if (!user || !selectedCompany) return;
    const company = companies.find((c) => c.id === selectedCompany);
    if (!company) return;

    const draftLines = validLines();
    if (draftLines.length === 0 || draftLines.every((l) => (parseFloat(l.amount) || 0) <= 0)) {
      toast({ title: "No lines", description: "Add hours, products, a service or a manual line.", variant: "destructive" });
      return;
    }

    const invDate = invoiceDate || new Date().toISOString().split("T")[0];
    const subtotal = round2(draftLines.reduce((sum, l) => sum + (parseFloat(l.amount) || 0), 0));
    const btw = invoiceType !== "business" ? 0 : parseFloat(btwPercentage);
    const btwAmount = invoiceType !== "business" ? 0 : round2(subtotal * (btw / 100));
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
        description: l.description.trim() || "Work",
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
        title: "Invoice created",
        description:
          appliedAdvance > 0
            ? `${invoiceNumber} • ${advanceLabel === "voorschot" ? "Advance" : "Credit"} €${appliedAdvance.toLocaleString(undefined, { minimumFractionDigits: 2 })} applied`
            : invoiceNumber,
      });
    } catch (error: unknown) {
      toast({ title: "Error", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
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
      toast({ title: "Invoice deleted", description: "Linked hours are available to invoice again." });
    } catch (error: unknown) {
      toast({ title: "Could not delete", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
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
    setEditInvoiceType((inv.invoice_type as InvoiceType) || "business");
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
      toast({ title: "Invoice updated" });
    } catch (e: unknown) {
      toast({ title: "Error", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
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
      toast({ title: "Credit note created", description: "You'll find it at the top of the list." });
    } catch (e: unknown) {
      toast({ title: "Error", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
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
      toast({ title: "Invoice split", description: "Instalments created and the original invoice was voided." });
    } catch (e: unknown) {
      toast({ title: "Error", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    }
  };

  const toggleEntry = (id: string) => {
    setSelectedEntries((prev) => (prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]));
  };

  const selectedCompanyObj = companies.find((c) => c.id === selectedCompany);
  const availableAdvance = round2(Math.max(0, Number(selectedCompanyObj?.advance_balance ?? 0)));
  // Unbilled hours that are not on the invoice yet
  const addedEntryIds = new Set(lines.map((l) => l.time_entry_id).filter(Boolean));
  const pickableEntries = uninvoicedEntries.filter((e) => !addedEntryIds.has(e.id));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Invoices</h1>
        <Dialog
          open={open}
          onOpenChange={(v) => {
            setOpen(v);
            if (!v) resetCreateForm();
          }}
        >
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" />Create invoice</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>New invoice</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>Client</Label>
                <Select value={selectedCompany} onValueChange={setSelectedCompany}>
                  <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
                  <SelectContent>
                    {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name || c.contact_person || "Client"}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Lines: hours, products and services on one invoice */}
              <div className="grid gap-2">
                <div className="flex items-center justify-between gap-2">
                  <Label>Lines</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addLine}>
                    <Plus className="mr-1 h-3 w-3" />Add line
                  </Button>
                </div>
                {lines.length === 0 ? (
                  <p className="text-sm text-muted-foreground rounded-md border border-dashed p-4 text-center">
                    No lines yet. Add hours, products or a service below, or create a manual line.
                  </p>
                ) : (
                  lines.map((line, i) => (
                    <div key={i} className="grid grid-cols-12 gap-2 items-end">
                      <div className="col-span-4">
                        <Input placeholder="Description" value={line.description} onChange={(e) => updateLine(i, "description", e.target.value)} />
                      </div>
                      <div className="col-span-2">
                        <Input type="number" placeholder="Hours" value={line.hours} onChange={(e) => updateLine(i, "hours", e.target.value)} />
                      </div>
                      <div className="col-span-2">
                        <Input type="number" placeholder="Rate" value={line.hourly_rate} onChange={(e) => updateLine(i, "hourly_rate", e.target.value)} />
                      </div>
                      <div className="col-span-3">
                        <Input type="number" placeholder="Amount" value={line.amount} onChange={(e) => updateLine(i, "amount", e.target.value)} />
                      </div>
                      <div className="col-span-1">
                        <Button type="button" variant="ghost" size="icon" onClick={() => removeLine(i)} title="Remove line">
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {selectedCompany && (
                <div className="grid gap-3">
                  {/* Client hours */}
                  <div className="grid gap-2 rounded-md border p-3 bg-muted/20">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <Label className="mb-0 flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />Unbilled hours</Label>
                      <Button
                        type="button"
                        size="sm"
                        onClick={addSelectedHoursToLines}
                        disabled={selectedEntries.length === 0}
                      >
                        Add to lines
                      </Button>
                    </div>
                    {pickableEntries.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        {uninvoicedEntries.length === 0 ? "No unbilled hours for this client." : "All unbilled hours have been added."}
                      </p>
                    ) : (
                      <div className="border rounded-md max-h-48 overflow-y-auto bg-background">
                        {pickableEntries.map((entry) => (
                          <label key={entry.id} className="flex items-center gap-3 px-3 py-2 hover:bg-muted/50 cursor-pointer">
                            <Checkbox checked={selectedEntries.includes(entry.id)} onCheckedChange={() => toggleEntry(entry.id)} />
                            <span className="text-sm">{new Date(entry.date).toLocaleDateString(undefined)}</span>
                            <span className="text-sm text-muted-foreground flex-1 truncate">{entry.description}</span>
                            <span className="text-sm font-medium">{Number(entry.hours).toFixed(2)}u</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Client products */}
                  <div className="grid gap-2 rounded-md border p-3 bg-muted/20">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <Label className="mb-0 flex items-center gap-1.5"><Package className="h-3.5 w-3.5" />Client products</Label>
                      <div className="flex gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={openNewProduct}>
                          <Plus className="mr-1 h-3 w-3" />New product
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          onClick={addSelectedProductsToLines}
                          disabled={!companyProducts.some((p) => (selectedProducts[p.id] ?? 0) > 0)}
                        >
                          Add to lines
                        </Button>
                      </div>
                    </div>
                    {companyProducts.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No products for this client yet.</p>
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
                                {exVatPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })} excl.
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
                              <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => openEditProduct(p)} title="Edit product">
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Service */}
                  {services.length > 0 && (
                    <div className="grid gap-2 rounded-md border p-3 bg-muted/20">
                      <Label className="mb-0 flex items-center gap-1.5"><Briefcase className="h-3.5 w-3.5" />Service (fixed amount)</Label>
                      <div className="flex gap-2">
                        <Select value={selectedService} onValueChange={setSelectedService}>
                          <SelectTrigger className="flex-1"><SelectValue placeholder="Choose service" /></SelectTrigger>
                          <SelectContent>
                            {services.map((s) => (
                              <SelectItem key={s.id} value={s.id}>
                                {s.name} — {cs}{Number(s.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button type="button" size="sm" onClick={addServiceToLines} disabled={!selectedService}>
                          Add
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Invoice settings */}
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Invoice date</Label>
                  <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label>Payment method</Label>
                  <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as "overboeking" | "contant")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="overboeking">Bank transfer</SelectItem>
                      <SelectItem value="contant">Cash</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Invoice type</Label>
                  <Select value={invoiceType} onValueChange={(v) => setInvoiceType(v as InvoiceType)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="business">Business (with {taxName})</SelectItem>
                      <SelectItem value="private">Private individual (no {taxName})</SelectItem>
                      {isEu && <SelectItem value="reverse_charge">EU business abroad (reverse charge)</SelectItem>}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>{taxName} rate (%)</Label>
                  <Input type="number" step="0.001" value={invoiceType !== "business" ? "0" : btwPercentage} onChange={(e) => setBtwPercentage(e.target.value)} disabled={invoiceType !== "business"} />
                  {invoiceType === "business" && (
                    <div className="flex flex-wrap gap-1">
                      {rateOptions(preset, Number(btwPercentage)).map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setBtwPercentage(String(r))}
                          className={`rounded-full border px-2 py-0.5 text-[11px] tabular-nums transition-colors ${Number(btwPercentage) === r ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                        >
                          {r}%
                        </button>
                      ))}
                    </div>
                  )}
                  {invoiceType === "reverse_charge" && (
                    <p className="text-xs text-muted-foreground">No {taxName} is charged. The PDF states that the client accounts for it; make sure the client's VAT number is filled in.</p>
                  )}
                </div>
              </div>

              {/* Apply client credit, only when the client has a balance */}
              {selectedCompany && availableAdvance > 0 && (
                <div className="rounded-md border p-3 space-y-3">
                  <div className="flex items-start gap-3">
                    <Checkbox id="apply-advance" checked={applyAdvance} onCheckedChange={(c) => setApplyAdvance(c === true)} className="mt-1" />
                    <div className="grid gap-1 flex-1">
                      <Label htmlFor="apply-advance" className="font-medium leading-snug">
                        Apply client balance ({cs}{availableAdvance.toLocaleString(undefined, { minimumFractionDigits: 2 })} available)
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        If unchecked, the balance stays with the client and nothing is deducted from this invoice.
                      </p>
                    </div>
                  </div>
                  {applyAdvance && (
                    <div className="grid gap-2 pl-7 sm:pl-0">
                      <Label>Show on the invoice PDF as</Label>
                      <Select value={advanceLabel} onValueChange={(v) => setAdvanceLabel(v as "krediet" | "voorschot")}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="krediet">Credit</SelectItem>
                          <SelectItem value="voorschot">Advance</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              )}

              <div className="grid gap-2">
                <Label>Notes</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>

              {/* Totals */}
              {(() => {
                const subtotal = invoiceSubtotal();
                if (subtotal <= 0) return null;
                const vat = invoiceType !== "business" ? 0 : parseFloat(btwPercentage || "0");
                const vatAmount = invoiceType !== "business" ? 0 : round2(subtotal * (vat / 100));
                const grossTotal = round2(subtotal + vatAmount);
                const appliedAdvance = applyAdvance ? round2(Math.min(availableAdvance, grossTotal)) : 0;
                const netTotal = round2(grossTotal - appliedAdvance);
                const labelWord = advanceLabel === "voorschot" ? "advance" : "credit";
                return (
                  <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
                    <p>
                      Total: <span className="font-medium">{cs}{grossTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      <span className="text-muted-foreground"> (excl. {cs}{subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}{vat > 0 ? ` + ${vat}% ${taxName}` : ""})</span>
                    </p>
                    {appliedAdvance > 0 && (
                      <>
                        <p>Applied ({labelWord}): <span className="font-medium">{cs}{appliedAdvance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></p>
                        <p>Amount due: <span className="font-medium">{cs}{netTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></p>
                      </>
                    )}
                  </div>
                );
              })()}

              <Button onClick={handleCreate} disabled={creating || !selectedCompany || validLines().length === 0}>
                {creating ? "Working…" : "Create invoice"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Inline product create/edit */}
        <Dialog open={productOpen} onOpenChange={(v) => { setProductOpen(v); if (!v) setEditProduct(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>{editProduct ? "Edit product" : "Add product"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="grid gap-2">
                <Label>Name *</Label>
                <Input value={productForm.name} onChange={(e) => setProductForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Website licence" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label>Serial number</Label>
                  <Input value={productForm.serial_number} onChange={(e) => setProductForm((f) => ({ ...f, serial_number: e.target.value }))} placeholder="SN-12345" className="font-mono text-sm" />
                </div>
                <div className="grid gap-2">
                  <Label>{taxName} rate (%)</Label>
                  <Select value={productForm.vat_percentage} onValueChange={(v) => setProductForm((f) => ({ ...f, vat_percentage: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {rateOptions(preset, Number(productForm.vat_percentage)).map((r) => <SelectItem key={r} value={String(r)}>{r}%</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Link</Label>
                <Input type="url" value={productForm.url} onChange={(e) => setProductForm((f) => ({ ...f, url: e.target.value }))} placeholder="https://…" />
              </div>
              <div className="grid gap-2">
                <Label>Internal notes</Label>
                <Textarea rows={2} value={productForm.internal_notes} onChange={(e) => setProductForm((f) => ({ ...f, internal_notes: e.target.value }))} />
              </div>
              <div className="flex items-center gap-3">
                <Switch id="inv-incl-vat" checked={productForm.price_includes_vat} onCheckedChange={(v) => setProductForm((f) => ({ ...f, price_includes_vat: v }))} />
                <Label htmlFor="inv-incl-vat" className="cursor-pointer">Enter price including tax</Label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label>Sales price ({productForm.price_includes_vat ? "incl." : "excl."} tax) *</Label>
                  <Input type="number" step="0.01" min="0" value={productForm.sale_price} onChange={(e) => setProductForm((f) => ({ ...f, sale_price: e.target.value }))} />
                </div>
                <div className="grid gap-2">
                  <Label>Cost price (excl. tax)</Label>
                  <Input type="number" step="0.01" min="0" value={productForm.cost_price} onChange={(e) => setProductForm((f) => ({ ...f, cost_price: e.target.value }))} placeholder="optioneel" />
                </div>
              </div>
              <Button onClick={handleSaveProduct} disabled={!productForm.name.trim() || !productForm.sale_price}>
                {editProduct ? "Save" : "Add"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {invoices.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <FileText className="h-12 w-12 mb-4" />
            <p>No invoices yet</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Total</TableHead>
                <TableHead className="whitespace-nowrap">Applied</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-28 text-right">Actions</TableHead>
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
                  <TableCell>{invoice.companies?.name || invoice.companies?.contact_person || "Client"}</TableCell>
                  <TableCell>{new Date(invoice.invoice_date).toLocaleDateString(undefined)}</TableCell>
                  <TableCell>
                    <div className="leading-tight">
                      <p className="font-medium">
                        {cs}{Number(Number(invoice.total) - Number(invoice.advance_payment ?? 0)).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </p>
                      {Number(invoice.advance_payment ?? 0) > 0 && (
                        <p className="text-xs text-muted-foreground">
                          of {cs}{Number(invoice.total).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {Number(invoice.advance_payment ?? 0) > 0
                      ? `${cs}${Number(invoice.advance_payment).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={statusColors[invoice.status]}>
                      {statusLabel(invoice.status, invoice.notes)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openLines(invoice)} title="Edit lines">
                        <Rows3 className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(invoice)} title="Edit">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {!invoice.is_credit_note && invoice.status !== "vervallen" && (
                        <Button variant="ghost" size="icon" onClick={() => { setCreditNoteTarget(invoice); setCreditNoteOpen(true); }} title="Create credit note">
                          <FileMinus className="h-4 w-4" />
                        </Button>
                      )}
                      {!invoice.is_credit_note && (
                        <Button variant="ghost" size="icon" onClick={() => openSplit(invoice)} title="Split into instalments">
                          <Split className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDownloadPDF(invoice)}
                        title="Download PDF"
                        disabled={invoice.status === "vervallen"}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setInvoiceToDelete(invoice)}
                        title="Delete invoice"
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
            <AlertDialogTitle>Delete invoice?</AlertDialogTitle>
            <AlertDialogDescription>
              Invoice <span className="font-medium text-foreground">{invoiceToDelete?.invoice_number}</span> will be permanently
              deleted. Hours on this invoice are released so you can invoice them again.
              Any credit used is returned to the client.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <Button variant="destructive" onClick={handleConfirmDelete} disabled={deleting}>
              {deleting ? "Working…" : "Delete"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={editOpen} onOpenChange={(v) => { setEditOpen(v); if (!v) setInvoiceToEdit(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit invoice</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Invoice type</Label>
              <Select value={editInvoiceType} onValueChange={(v) => setEditInvoiceType(v as InvoiceType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="business">Business (with {taxName})</SelectItem>
                  <SelectItem value="private">Private individual (no {taxName})</SelectItem>
                  {(isEu || editInvoiceType === "reverse_charge") && <SelectItem value="reverse_charge">EU business abroad (reverse charge)</SelectItem>}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Invoice number</Label>
              <Input value={editInvoiceNumber} onChange={(e) => setEditInvoiceNumber(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Invoice date</Label>
                <Input type="date" value={editInvoiceDate} onChange={(e) => setEditInvoiceDate(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label>Due date</Label>
                <Input type="date" value={editDueDate} onChange={(e) => setEditDueDate(e.target.value)} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Status</Label>
              <Select value={editStatus} onValueChange={setEditStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="concept">Draft</SelectItem>
                  <SelectItem value="verzonden">Sent</SelectItem>
                  <SelectItem value="betaald">Paid</SelectItem>
                  <SelectItem value="vervallen">Void</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Payment method</Label>
              <Select value={editPaymentMethod} onValueChange={(v) => setEditPaymentMethod(v as "overboeking" | "contant")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="overboeking">Bank transfer</SelectItem>
                  <SelectItem value="contant">Cash</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Notes</Label>
              <Textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} />
            </div>
            <Button onClick={handleSaveEdit}>Save</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={linesOpen} onOpenChange={(v) => { setLinesOpen(v); if (!v) { setLinesInvoice(null); setInvoiceLines([]); } }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Lines — {linesInvoice?.invoice_number}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {invoiceLines.length === 0 ? (
              <p className="text-sm text-muted-foreground">No lines yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right w-28">Amount</TableHead>
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
                            {Number(line.hours).toFixed(2)}h × {cs}{Number(line.hourly_rate).toFixed(2)}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {cs}{Number(line.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
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
              <p className="text-sm font-medium">Add line</p>
              <div className="flex gap-2">
                <Input
                  className="flex-1"
                  placeholder="Description"
                  value={newLineDesc}
                  onChange={(e) => setNewLineDesc(e.target.value)}
                />
                <Input
                  className="w-32"
                  type="number"
                  step="0.01"
                  placeholder="Amount"
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
            <AlertDialogTitle>Create credit note?</AlertDialogTitle>
            <AlertDialogDescription>
              A credit note will be created for invoice{" "}
              <span className="font-medium text-foreground">{creditNoteTarget?.invoice_number}</span>.
              The credit note has the same amount as the original invoice, but negative.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={creatingCN}>Cancel</AlertDialogCancel>
            <Button onClick={handleConfirmCreditNote} disabled={creatingCN}>
              {creatingCN ? "Working…" : "Create credit note"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={splitOpen} onOpenChange={(v) => { setSplitOpen(v); if (!v) setInvoiceToSplit(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Split into instalments</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <p className="text-sm text-muted-foreground">
              This creates separate draft invoices (split evenly) and marks the original invoice as <span className="font-medium text-foreground">void</span>.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Number of instalments</Label>
                <Input type="number" min={2} max={12} value={splitParts} onChange={(e) => setSplitParts(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label>Days between instalments</Label>
                <Input type="number" min={1} max={365} value={splitIntervalDays} onChange={(e) => setSplitIntervalDays(e.target.value)} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>First due date</Label>
              <Input type="date" value={splitFirstDueDate} onChange={(e) => setSplitFirstDueDate(e.target.value)} />
              <p className="text-xs text-muted-foreground">Leave empty to use the current due date, or 30 days from now by default.</p>
            </div>
            <Button onClick={handleConfirmSplit} disabled={!invoiceToSplit}>
              Split
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
