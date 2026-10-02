import { useEffect, useState } from "react";
import { useOpenOnNew } from "@/hooks/use-open-on-new";
import { rateOptions } from "@/lib/tax-presets";
import { useTaxSettings } from "@/lib/tax";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import type { Company, CompanyProduct, Quote } from "@/lib/db-types";
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
import { Plus, FileCheck, FileText, Trash2, Download, Pencil } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { useNavigate } from "react-router-dom";
import { generateQuotePDF } from "@/lib/pdf";

interface QuoteLine {
  description: string;
  hours: string;
  hourly_rate: string;
  amount: string;
}

const statusLabels: Record<string, string> = {
  concept: "Draft",
  verzonden: "Sent",
  geaccepteerd: "Accepted",
  afgewezen: "Declined",
};

const statusColors: Record<string, string> = {
  concept: "bg-muted text-muted-foreground",
  verzonden: "bg-primary/10 text-primary",
  geaccepteerd: "bg-success/10 text-success",
  afgewezen: "bg-destructive/10 text-destructive",
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

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function productExVatPrice(p: CompanyProduct): number {
  const vatPct = p.vat_percentage ?? 0;
  return p.price_includes_vat ? p.sale_price / (1 + vatPct / 100) : p.sale_price;
}

export default function Quotes() {
  const { currencySymbol: cs, defaultRate, preset } = useTaxSettings();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [quotes, setQuotes] = useState<(Quote & { companies: { name: string | null; contact_person: string | null } | null })[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [open, setOpen] = useState(false);
  useOpenOnNew(setOpen);
  const [selectedCompany, setSelectedCompany] = useState("");
  const [companyProducts, setCompanyProducts] = useState<CompanyProduct[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<Record<string, number>>({});
  const [productOpen, setProductOpen] = useState(false);
  const [editProduct, setEditProduct] = useState<CompanyProduct | null>(null);
  const [productForm, setProductForm] = useState(emptyProductForm);
  const [lines, setLines] = useState<QuoteLine[]>([{ description: "", hours: "", hourly_rate: "", amount: "" }]);
  const [notes, setNotes] = useState("");
  const [btwPercentage, setBtwPercentage] = useState(String(defaultRate));
  const [editOpen, setEditOpen] = useState(false);
  const [quoteToEdit, setQuoteToEdit] = useState<(Quote & { companies: { name: string | null; contact_person: string | null } | null }) | null>(null);
  const [editQuoteNumber, setEditQuoteNumber] = useState("");
  const [editQuoteDate, setEditQuoteDate] = useState("");
  const [editValidUntil, setEditValidUntil] = useState("");
  const [editStatus, setEditStatus] = useState("concept");
  const [editNotes, setEditNotes] = useState("");
  const [creatingInvoiceFromId, setCreatingInvoiceFromId] = useState<string | null>(null);

  const fetchData = async () => {
    const [quotesRes, companiesRes] = await Promise.all([api.getQuotes(), api.getCompanies()]);
    setQuotes(quotesRes);
    setCompanies(companiesRes);
  };

  useEffect(() => { if (user) fetchData(); }, [user]);

  useEffect(() => {
    if (!selectedCompany) {
      setCompanyProducts([]);
      setSelectedProducts({});
      return;
    }
    api.getCompanyProducts(selectedCompany).then(setCompanyProducts);
  }, [selectedCompany]);

  const refreshCompanyProducts = async () => {
    if (!selectedCompany) return;
    const prods = await api.getCompanyProducts(selectedCompany);
    setCompanyProducts(prods);
  };

  const resetCreateForm = () => {
    setSelectedCompany("");
    setCompanyProducts([]);
    setSelectedProducts({});
    setLines([]);
    setNotes("");
    setBtwPercentage(String(defaultRate));
  };

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

  const updateLine = (index: number, field: keyof QuoteLine, value: string) => {
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

  const addLine = () => setLines((prev) => [...prev, { description: "", hours: "", hourly_rate: "", amount: "" }]);
  const removeLine = (i: number) => setLines((prev) => prev.filter((_, idx) => idx !== i));

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
        };
      });
    if (toAdd.length === 0) {
      toast({ title: "No products selected", description: "Select at least one product.", variant: "destructive" });
      return;
    }
    setLines((prev) => [...prev, ...toAdd]);
    setSelectedProducts({});
    toast({ title: `${toAdd.length} product line${toAdd.length === 1 ? "" : "s"} added`, description: "You can still edit the lines below." });
  };

  const validLines = () =>
    lines.filter((l) => l.description.trim() || (parseFloat(l.amount) || 0) > 0);

  const quoteSubtotal = () => round2(validLines().reduce((sum, l) => sum + (parseFloat(l.amount) || 0), 0));

  const handleCreate = async () => {
    if (!user || !selectedCompany) return;

    const quoteLines = validLines().map((l) => ({
      description: l.description.trim() || "Work",
      hours: l.hours ? parseFloat(l.hours) : null,
      hourly_rate: l.hourly_rate ? parseFloat(l.hourly_rate) : null,
      amount: parseFloat(l.amount) || 0,
    }));

    if (quoteLines.length === 0 || quoteLines.every((l) => l.amount <= 0)) {
      toast({
        title: "No lines",
        description: "Add lines manually or select products.",
        variant: "destructive",
      });
      return;
    }

    const subtotal = round2(quoteLines.reduce((sum, l) => sum + l.amount, 0));
    const btw = parseFloat(btwPercentage);
    const btwAmount = round2(subtotal * (btw / 100));
    const total = round2(subtotal + btwAmount);

    const now = new Date();
    const count = quotes.filter((q) => q.quote_number.startsWith(`Q${now.getFullYear()}`)).length + 1;
    const quoteNumber = `Q${now.getFullYear()}-${String(count).padStart(4, "0")}`;

    try {
      const quote = await api.createQuote({
        company_id: selectedCompany,
        quote_number: quoteNumber,
        subtotal,
        btw_percentage: btw,
        btw_amount: btwAmount,
        total,
        notes: notes || null,
        valid_until: new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0],
      });

      const dbLines = quoteLines.map((l) => ({
        quote_id: quote.id,
        description: l.description,
        hours: l.hours,
        hourly_rate: l.hourly_rate,
        amount: l.amount,
      }));
      await api.createQuoteLinesBatch(dbLines);

      setOpen(false);
      resetCreateForm();
      fetchData();
      toast({ title: "Quote created", description: quoteNumber });
    } catch (error: unknown) {
      toast({ title: "Error", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    }
  };

  const handleCreateInvoiceFromQuote = async (
    quote: Quote & { companies: { name: string | null; contact_person: string | null } | null },
  ) => {
    setCreatingInvoiceFromId(quote.id);
    try {
      const invoice = await api.createInvoiceFromQuote(quote.id);
      toast({
        title: "Invoice created",
        description: `${invoice.invoice_number} (from ${quote.quote_number})`,
      });
      navigate("/invoices");
    } catch (error: unknown) {
      toast({ title: "Error", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    } finally {
      setCreatingInvoiceFromId(null);
    }
  };

  const handleDownloadPDF = async (quote: Quote & { companies: { name: string | null; contact_person: string | null } | null }) => {
    const [linesRes, settingsRes, companyRes] = await Promise.all([
      api.getQuoteLines(quote.id),
      api.getBusinessSettings(),
      api.getCompany(quote.company_id),
    ]);
    await generateQuotePDF(quote, linesRes, settingsRes, companyRes);
  };

  const openEdit = (q: Quote & { companies: { name: string | null; contact_person: string | null } | null }) => {
    setQuoteToEdit(q);
    setEditQuoteNumber(q.quote_number);
    setEditQuoteDate(q.quote_date);
    setEditValidUntil(q.valid_until ?? "");
    setEditStatus(q.status);
    setEditNotes(q.notes ?? "");
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!quoteToEdit) return;
    try {
      await api.updateQuote(quoteToEdit.id, {
        quote_number: editQuoteNumber.trim() || quoteToEdit.quote_number,
        quote_date: editQuoteDate,
        valid_until: editValidUntil ? editValidUntil : null,
        status: editStatus,
        notes: editNotes.trim() ? editNotes.trim() : null,
      });
      setEditOpen(false);
      setQuoteToEdit(null);
      await fetchData();
      toast({ title: "Quote updated" });
    } catch (e: unknown) {
      toast({ title: "Error", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    }
  };

  const handleDeleteQuote = async (q: Quote) => {
    if (!confirm(`Delete quote ${q.quote_number}?`)) return;
    try {
      await api.deleteQuote(q.id);
      await fetchData();
      toast({ title: "Quote deleted" });
    } catch (e: unknown) {
      toast({ title: "Error", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Quotes</h1>
        <Dialog
          open={open}
          onOpenChange={(v) => {
            setOpen(v);
            if (!v) resetCreateForm();
          }}
        >
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" />Create quote</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>New quote</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>Company</Label>
                <Select value={selectedCompany} onValueChange={setSelectedCompany}>
                  <SelectTrigger><SelectValue placeholder="Select company" /></SelectTrigger>
                  <SelectContent>
                    {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name || c.contact_person || "Client"}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <div className="flex items-center justify-between gap-2">
                  <Label>Lines</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addLine}>
                    <Plus className="mr-1 h-3 w-3" />Add line
                  </Button>
                </div>
                {lines.length === 0 ? (
                  <p className="text-sm text-muted-foreground rounded-md border border-dashed p-4 text-center">
                    No lines yet. Add a line manually or pick products below.
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
                <div className="grid gap-2 rounded-md border p-3 bg-muted/20">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <Label className="mb-0">Client products</Label>
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
                  <p className="text-xs text-muted-foreground">
                    Select products and add them. You can then still edit the description and amount of each line.
                  </p>
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
                                setSelectedProducts((prev) => ({
                                  ...prev,
                                  [p.id]: checked ? 1 : 0,
                                }))
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
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Tax rate (%)</Label>
                  <Input type="number" value={btwPercentage} onChange={(e) => setBtwPercentage(e.target.value)} />
                </div>
              </div>
              {(() => {
                const subtotal = quoteSubtotal();
                const vat = parseFloat(btwPercentage || "0");
                const vatAmount = round2(subtotal * (vat / 100));
                const grossTotal = round2(subtotal + vatAmount);
                if (subtotal <= 0) return null;
                return (
                  <div className="rounded-md border bg-muted/30 p-3 text-sm">
                    Total: <span className="font-medium">{cs}{grossTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    <span className="text-muted-foreground"> (excl. {cs}{subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })} + tax)</span>
                  </div>
                );
              })()}
              <div className="grid gap-2">
                <Label>Notes</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
              <Button onClick={handleCreate}>Create quote</Button>
            </div>
          </DialogContent>
        </Dialog>

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
                  <Label>Tax rate (%)</Label>
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
                <Switch id="quote-incl-vat" checked={productForm.price_includes_vat} onCheckedChange={(v) => setProductForm((f) => ({ ...f, price_includes_vat: v }))} />
                <Label htmlFor="quote-incl-vat" className="cursor-pointer">Enter price including tax</Label>
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

      {quotes.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <FileCheck className="h-12 w-12 mb-4" />
            <p>No quotes yet</p>
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
                <TableHead>Status</TableHead>
                <TableHead className="w-20 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {quotes.map((quote) => (
                <TableRow key={quote.id}>
                  <TableCell className="font-medium">{quote.quote_number}</TableCell>
                  <TableCell>{quote.companies?.name || quote.companies?.contact_person || "Client"}</TableCell>
                  <TableCell>{new Date(quote.quote_date).toLocaleDateString(undefined)}</TableCell>
                  <TableCell>{cs}{Number(quote.total).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={statusColors[quote.status]}>{statusLabels[quote.status] ?? quote.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(quote)} title="Edit">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleCreateInvoiceFromQuote(quote)}
                        title="Create invoice from quote"
                        disabled={creatingInvoiceFromId === quote.id}
                      >
                        <FileText className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDownloadPDF(quote)} title="Download PDF">
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => handleDeleteQuote(quote)}
                        title="Delete quote"
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

      <Dialog open={editOpen} onOpenChange={(v) => { setEditOpen(v); if (!v) setQuoteToEdit(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit quote</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Quote number</Label>
              <Input value={editQuoteNumber} onChange={(e) => setEditQuoteNumber(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Quote date</Label>
                <Input type="date" value={editQuoteDate} onChange={(e) => setEditQuoteDate(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label>Valid until</Label>
                <Input type="date" value={editValidUntil} onChange={(e) => setEditValidUntil(e.target.value)} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Status</Label>
              <Select value={editStatus} onValueChange={setEditStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="concept">Draft</SelectItem>
                  <SelectItem value="verzonden">Sent</SelectItem>
                  <SelectItem value="geaccepteerd">Accepted</SelectItem>
                  <SelectItem value="afgewezen">Declined</SelectItem>
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
    </div>
  );
}
