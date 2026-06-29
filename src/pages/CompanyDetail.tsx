import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import type { Company, Invoice, Quote, CompanyProduct } from "@/lib/db-types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, FileText, FileCheck, Package, Plus, Pencil, Trash2 } from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  concept: "Concept", verzonden: "Verzonden", betaald: "Betaald",
  verlopen: "Verlopen", geaccepteerd: "Geaccepteerd", afgewezen: "Afgewezen",
};
const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  betaald: "default", geaccepteerd: "default",
  concept: "secondary", verzonden: "secondary",
  verlopen: "destructive", afgewezen: "destructive",
};

const emptyProduct = { name: "", sale_price: "", cost_price: "" };

export default function CompanyDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { toast } = useToast();

  const [company, setCompany] = useState<Company | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [products, setProducts] = useState<CompanyProduct[]>([]);

  const [productOpen, setProductOpen] = useState(false);
  const [editProduct, setEditProduct] = useState<CompanyProduct | null>(null);
  const [productForm, setProductForm] = useState(emptyProduct);

  const fetchAll = async () => {
    if (!id) return;
    const [comp, allInvoices, allQuotes, prods] = await Promise.all([
      api.getCompany(id),
      api.getInvoices(),
      api.getQuotes(),
      api.getCompanyProducts(id),
    ]);
    setCompany(comp);
    setInvoices(allInvoices.filter((i) => i.company_id === id));
    setQuotes(allQuotes.filter((q) => q.company_id === id));
    setProducts(prods);
  };

  useEffect(() => { if (user && id) fetchAll(); }, [user, id]);

  const openNewProduct = () => {
    setEditProduct(null);
    setProductForm(emptyProduct);
    setProductOpen(true);
  };

  const openEditProduct = (p: CompanyProduct) => {
    setEditProduct(p);
    setProductForm({
      name: p.name,
      sale_price: String(p.sale_price),
      cost_price: p.cost_price != null ? String(p.cost_price) : "",
    });
    setProductOpen(true);
  };

  const handleSaveProduct = async () => {
    if (!id || !productForm.name.trim() || !productForm.sale_price) return;
    const body = {
      name: productForm.name.trim(),
      sale_price: parseFloat(productForm.sale_price),
      cost_price: productForm.cost_price ? parseFloat(productForm.cost_price) : null,
    };
    try {
      if (editProduct) {
        await api.updateCompanyProduct(id, editProduct.id, body);
        toast({ title: "Product bijgewerkt" });
      } else {
        await api.createCompanyProduct(id, body);
        toast({ title: "Product toegevoegd" });
      }
      setProductOpen(false);
      fetchAll();
    } catch (e: unknown) {
      toast({ title: "Fout", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    }
  };

  const handleDeleteProduct = async (p: CompanyProduct) => {
    if (!id || !confirm(`Product "${p.name}" verwijderen?`)) return;
    await api.deleteCompanyProduct(id, p.id);
    toast({ title: "Product verwijderd" });
    fetchAll();
  };

  const displayName = company?.name || company?.contact_person || "Klant";
  const fmt = (n: number) => `€ ${n.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const totalInvoiced = invoices.reduce((s, i) => s + Number(i.total), 0);
  const totalPaid = invoices.filter((i) => i.status === "betaald").reduce((s, i) => s + Number(i.total), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/bedrijven">
          <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" />Bedrijven</Button>
        </Link>
        <h1 className="text-2xl font-semibold">{displayName}</h1>
      </div>

      {company && (
        <Card>
          <CardContent className="pt-4 grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3 text-sm">
            {company.name && company.contact_person && (
              <div><p className="text-muted-foreground text-xs">Contactpersoon</p><p>{company.contact_person}</p></div>
            )}
            {company.email && (
              <div><p className="text-muted-foreground text-xs">E-mail</p><p>{company.email}</p></div>
            )}
            {company.phone && (
              <div><p className="text-muted-foreground text-xs">Telefoon</p><p>{company.phone}</p></div>
            )}
            {(company.street || company.city) && (
              <div>
                <p className="text-muted-foreground text-xs">Adres</p>
                <p>{[company.street, company.postal_code, company.city].filter(Boolean).join(", ")}</p>
              </div>
            )}
            {company.kvk_number && (
              <div><p className="text-muted-foreground text-xs">KvK</p><p>{company.kvk_number}</p></div>
            )}
            {company.btw_number && (
              <div><p className="text-muted-foreground text-xs">BTW</p><p>{company.btw_number}</p></div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-3 gap-4">
        <Card><CardContent className="pt-4">
          <p className="text-xs text-muted-foreground">Totaal gefactureerd</p>
          <p className="text-xl font-semibold mt-1">{fmt(totalInvoiced)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <p className="text-xs text-muted-foreground">Betaald</p>
          <p className="text-xl font-semibold mt-1">{fmt(totalPaid)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <p className="text-xs text-muted-foreground">Openstaand</p>
          <p className="text-xl font-semibold mt-1">{fmt(totalInvoiced - totalPaid)}</p>
        </CardContent></Card>
      </div>

      <Tabs defaultValue="facturen">
        <TabsList>
          <TabsTrigger value="facturen" className="gap-1.5">
            <FileText className="h-3.5 w-3.5" />Facturen ({invoices.length})
          </TabsTrigger>
          <TabsTrigger value="offertes" className="gap-1.5">
            <FileCheck className="h-3.5 w-3.5" />Offertes ({quotes.length})
          </TabsTrigger>
          <TabsTrigger value="producten" className="gap-1.5">
            <Package className="h-3.5 w-3.5" />Producten ({products.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="facturen" className="mt-4">
          {invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nog geen facturen voor deze klant.</p>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nummer</TableHead>
                    <TableHead>Datum</TableHead>
                    <TableHead>Vervaldatum</TableHead>
                    <TableHead className="text-right">Bedrag</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-medium">{inv.invoice_number}</TableCell>
                      <TableCell>{new Date(inv.invoice_date).toLocaleDateString("nl-NL")}</TableCell>
                      <TableCell>{inv.due_date ? new Date(inv.due_date).toLocaleDateString("nl-NL") : "—"}</TableCell>
                      <TableCell className="text-right">{fmt(Number(inv.total))}</TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANTS[inv.status] ?? "secondary"}>
                          {STATUS_LABELS[inv.status] ?? inv.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="offertes" className="mt-4">
          {quotes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nog geen offertes voor deze klant.</p>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nummer</TableHead>
                    <TableHead>Datum</TableHead>
                    <TableHead>Geldig tot</TableHead>
                    <TableHead className="text-right">Bedrag</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {quotes.map((q) => (
                    <TableRow key={q.id}>
                      <TableCell className="font-medium">{q.quote_number}</TableCell>
                      <TableCell>{new Date(q.quote_date).toLocaleDateString("nl-NL")}</TableCell>
                      <TableCell>{q.valid_until ? new Date(q.valid_until).toLocaleDateString("nl-NL") : "—"}</TableCell>
                      <TableCell className="text-right">{fmt(Number(q.total))}</TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANTS[q.status] ?? "secondary"}>
                          {STATUS_LABELS[q.status] ?? q.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="producten" className="mt-4 space-y-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={openNewProduct}><Plus className="h-4 w-4 mr-1" />Product toevoegen</Button>
          </div>
          {products.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nog geen producten voor deze klant.</p>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Naam</TableHead>
                    <TableHead className="text-right">Verkoopprijs</TableHead>
                    <TableHead className="text-right">Inkoopprijs</TableHead>
                    <TableHead className="text-right">Marge</TableHead>
                    <TableHead className="w-20" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((p) => {
                    const margin = p.cost_price != null ? p.sale_price - p.cost_price : null;
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell className="text-right">{fmt(p.sale_price)}</TableCell>
                        <TableCell className="text-right">{p.cost_price != null ? fmt(p.cost_price) : "—"}</TableCell>
                        <TableCell className="text-right">
                          {margin != null ? (
                            <span className={margin >= 0 ? "text-emerald-600" : "text-destructive"}>
                              {fmt(margin)}
                            </span>
                          ) : "—"}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEditProduct(p)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDeleteProduct(p)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={productOpen} onOpenChange={(v) => { setProductOpen(v); if (!v) setEditProduct(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editProduct ? "Product bewerken" : "Product toevoegen"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Naam</Label>
              <Input
                value={productForm.name}
                onChange={(e) => setProductForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Bijv. Website licentie"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Verkoopprijs (€)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={productForm.sale_price}
                  onChange={(e) => setProductForm((f) => ({ ...f, sale_price: e.target.value }))}
                  placeholder="0.00"
                />
              </div>
              <div className="grid gap-2">
                <Label>Inkoopprijs (€)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={productForm.cost_price}
                  onChange={(e) => setProductForm((f) => ({ ...f, cost_price: e.target.value }))}
                  placeholder="optioneel"
                />
              </div>
            </div>
            <Button
              onClick={handleSaveProduct}
              disabled={!productForm.name.trim() || !productForm.sale_price}
            >
              {editProduct ? "Opslaan" : "Toevoegen"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
