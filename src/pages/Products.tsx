import { useEffect, useState } from "react";
import { useTaxSettings } from "@/lib/tax";
import { rateOptions } from "@/lib/tax-presets";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import type { Company, CompanyProduct } from "@/lib/db-types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Package, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

const emptyForm = {
  name: "",
  serial_number: "",
  url: "",
  internal_notes: "",
  sale_price: "",
  price_includes_vat: false,
  vat_percentage: "",
  cost_price: "",
};

function exVat(price: number, pct: number) {
  return price / (1 + pct / 100);
}
function inclVat(price: number, pct: number) {
  return price * (1 + pct / 100);
}
export default function Products() {
  const { currencySymbol: cs, defaultRate, preset } = useTaxSettings();
  const fmt = (n: number) => `${cs} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const { user } = useAuth();
  const { toast } = useToast();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [products, setProducts] = useState<CompanyProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editProduct, setEditProduct] = useState<CompanyProduct | null>(null);
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    if (user) api.getCompanies().then(setCompanies);
  }, [user]);

  useEffect(() => {
    if (!selectedId) { setProducts([]); return; }
    setLoadingProducts(true);
    api.getCompanyProducts(selectedId).then(setProducts).finally(() => setLoadingProducts(false));
  }, [selectedId]);

  const selected = companies.find((c) => c.id === selectedId);
  const displayName = (c: Company) => c.name || c.contact_person || "Client";

  const openNew = () => {
    setEditProduct(null);
    setForm({ ...emptyForm, vat_percentage: String(defaultRate) });
    setDialogOpen(true);
  };

  const openEdit = (p: CompanyProduct) => {
    setEditProduct(p);
    setForm({
      name: p.name,
      serial_number: p.serial_number ?? "",
      url: p.url ?? "",
      internal_notes: p.internal_notes ?? "",
      sale_price: String(p.sale_price),
      price_includes_vat: Boolean(p.price_includes_vat),
      vat_percentage: String(p.vat_percentage ?? defaultRate),
      cost_price: p.cost_price != null ? String(p.cost_price) : "",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!selectedId || !form.name.trim() || !form.sale_price) return;
    const body = {
      name: form.name.trim(),
      serial_number: form.serial_number.trim() || null,
      url: form.url.trim() || null,
      internal_notes: form.internal_notes.trim() || null,
      sale_price: parseFloat(form.sale_price),
      price_includes_vat: form.price_includes_vat,
      vat_percentage: parseFloat(form.vat_percentage) || defaultRate,
      cost_price: form.cost_price ? parseFloat(form.cost_price) : null,
    };
    try {
      if (editProduct) {
        await api.updateCompanyProduct(selectedId, editProduct.id, body);
        toast({ title: "Product updated" });
      } else {
        await api.createCompanyProduct(selectedId, body);
        toast({ title: "Product added" });
      }
      setDialogOpen(false);
      api.getCompanyProducts(selectedId).then(setProducts);
    } catch (e: unknown) {
      toast({ title: "Error", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    }
  };

  const handleDelete = async (p: CompanyProduct) => {
    if (!selectedId || !confirm(`Delete "${p.name}"?`)) return;
    await api.deleteCompanyProduct(selectedId, p.id);
    toast({ title: "Product deleted" });
    api.getCompanyProducts(selectedId).then(setProducts);
  };

  const set = (k: keyof typeof form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  const saleNum = parseFloat(form.sale_price) || 0;
  const vatPct = parseFloat(form.vat_percentage) || defaultRate;
  const priceExVat = form.price_includes_vat ? exVat(saleNum, vatPct) : saleNum;
  const priceInclVat = form.price_includes_vat ? saleNum : inclVat(saleNum, vatPct);

  return (
    <div className="flex gap-0 h-[calc(100vh-4rem)] -mx-4 -my-6">
      {/* Left: client list */}
      <div className="w-64 shrink-0 border-r flex flex-col">
        <div className="p-4 border-b">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Clients</h2>
        </div>
        <div className="overflow-y-auto flex-1">
          {companies.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">No clients found.</p>
          )}
          {companies.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              className={cn(
                "w-full text-left px-4 py-3 text-sm border-b hover:bg-muted/50 transition-colors",
                selectedId === c.id && "bg-accent text-accent-foreground font-medium"
              )}
            >
              <p className="truncate">{displayName(c)}</p>
              {c.city && <p className="text-xs text-muted-foreground truncate">{c.city}</p>}
            </button>
          ))}
        </div>
      </div>

      {/* Right: products */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {!selectedId ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
            <Package className="h-12 w-12 opacity-30" />
            <p>Select a client to manage their products</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-semibold">{selected ? displayName(selected) : ""}</h1>
                <p className="text-sm text-muted-foreground">{products.length} product{products.length !== 1 ? "s" : ""}</p>
              </div>
              <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" />Add product</Button>
            </div>

            {loadingProducts ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : products.length === 0 ? (
              <Card>
                <CardContent className="py-12 flex flex-col items-center text-muted-foreground gap-2">
                  <Package className="h-8 w-8 opacity-40" />
                  <p className="text-sm">No products for this client yet</p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Serial number</TableHead>
                      <TableHead className="text-right">Excl. tax</TableHead>
                      <TableHead className="text-right">Incl. tax</TableHead>
                      <TableHead className="text-right">Cost</TableHead>
                      <TableHead className="text-right">Margin</TableHead>
                      <TableHead className="w-20" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {products.map((p) => {
                      const vat = p.vat_percentage ?? defaultRate;
                      const excl = p.price_includes_vat ? exVat(p.sale_price, vat) : p.sale_price;
                      const incl = p.price_includes_vat ? p.sale_price : inclVat(p.sale_price, vat);
                      const margin = p.cost_price != null ? excl - p.cost_price : null;
                      return (
                        <TableRow key={p.id}>
                          <TableCell>
                            <p className="font-medium">{p.name}</p>
                            {p.url && (
                              <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary flex items-center gap-1 mt-0.5 hover:underline">
                                <ExternalLink className="h-3 w-3" />link
                              </a>
                            )}
                            {p.internal_notes && (
                              <p className="text-xs text-muted-foreground mt-0.5 italic">{p.internal_notes}</p>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground font-mono">{p.serial_number || "—"}</TableCell>
                          <TableCell className="text-right text-sm">{fmt(excl)}</TableCell>
                          <TableCell className="text-right text-sm">{fmt(incl)}</TableCell>
                          <TableCell className="text-right text-sm">{p.cost_price != null ? fmt(p.cost_price) : "—"}</TableCell>
                          <TableCell className="text-right text-sm">
                            {margin != null ? (
                              <span className={margin >= 0 ? "text-emerald-600" : "text-destructive"}>{fmt(margin)}</span>
                            ) : "—"}
                          </TableCell>
                          <TableCell>
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(p)}><Pencil className="h-3.5 w-3.5" /></Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(p)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Card>
            )}
          </>
        )}
      </div>

      {/* Product dialog */}
      <Dialog open={dialogOpen} onOpenChange={(v) => { setDialogOpen(v); if (!v) setEditProduct(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editProduct ? "Edit product" : "Add product"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Product details</p>
              <div className="grid gap-2">
                <Label>Name *</Label>
                <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Annual software licence" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label>Serienummer <span className="text-muted-foreground font-normal">(internal)</span></Label>
                  <Input value={form.serial_number} onChange={(e) => set("serial_number", e.target.value)} placeholder="SN-12345" className="font-mono text-sm" />
                </div>
                <div className="grid gap-2">
                  <Label>Tax rate (%)</Label>
                  <Select value={form.vat_percentage} onValueChange={(v) => set("vat_percentage", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {rateOptions(preset, Number(form.vat_percentage)).map((r) => <SelectItem key={r} value={String(r)}>{r}%</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Link <span className="text-muted-foreground font-normal">(internal)</span></Label>
                <Input type="url" value={form.url} onChange={(e) => set("url", e.target.value)} placeholder="https://..." />
              </div>
              <div className="grid gap-2">
                <Label>Internal notes <span className="text-muted-foreground font-normal">(not shown on invoices)</span></Label>
                <Textarea rows={2} value={form.internal_notes} onChange={(e) => set("internal_notes", e.target.value)} placeholder="e.g. login details, warranty info…" />
              </div>
            </div>

            <div className="border-t pt-4 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Price</p>
              <div className="flex items-center gap-3">
                <Switch
                  id="incl-vat"
                  checked={form.price_includes_vat}
                  onCheckedChange={(v) => set("price_includes_vat", v)}
                />
                <Label htmlFor="incl-vat" className="cursor-pointer">
                  Enter price including tax
                </Label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label>
                    Sales price ({form.price_includes_vat ? "incl. tax" : "excl. tax"}) *
                  </Label>
                  <Input
                    type="number" step="0.01" min="0"
                    value={form.sale_price}
                    onChange={(e) => set("sale_price", e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Cost price (excl. tax)</Label>
                  <Input
                    type="number" step="0.01" min="0"
                    value={form.cost_price}
                    onChange={(e) => set("cost_price", e.target.value)}
                    placeholder="optioneel"
                  />
                </div>
              </div>
              {saleNum > 0 && (
                <div className="rounded-md bg-muted/40 px-3 py-2 text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Excl. tax</span>
                    <span className="font-medium">{fmt(priceExVat)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tax ({vatPct}%)</span>
                    <span>{fmt(priceInclVat - priceExVat)}</span>
                  </div>
                  <div className="flex justify-between border-t pt-1 mt-1">
                    <span className="text-muted-foreground">Incl. tax</span>
                    <span className="font-semibold">{fmt(priceInclVat)}</span>
                  </div>
                  {form.cost_price && parseFloat(form.cost_price) > 0 && (
                    <div className="flex justify-between border-t pt-1 mt-1">
                      <span className="text-muted-foreground">Margin (excl. tax)</span>
                      <span className={cn("font-medium", priceExVat - parseFloat(form.cost_price) >= 0 ? "text-emerald-600" : "text-destructive")}>
                        {fmt(priceExVat - parseFloat(form.cost_price))}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <Button
              className="w-full"
              onClick={handleSave}
              disabled={!form.name.trim() || !form.sale_price}
            >
              {editProduct ? "Save" : "Add"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
