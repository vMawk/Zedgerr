import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import type { Company } from "@/lib/db-types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Building2 } from "lucide-react";

const emptyForm: Partial<Company> = {
  name: "", contact_person: "", email: "", phone: "",
  street: "", postal_code: "", city: "", country: "Nederland",
  kvk_number: "", btw_number: "", default_hourly_rate: undefined, notes: "",
};

export default function Companies() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [form, setForm] = useState<Partial<Company>>(emptyForm);
  const [editId, setEditId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const fetchCompanies = async () => {
    const data = await api.getCompanies();
    setCompanies(data);
  };

  useEffect(() => { if (user) fetchCompanies(); }, [user]);

  const handleSave = async () => {
    if (!user || !form.name) return;
    try {
      if (editId) {
        await api.updateCompany(editId, { ...form });
        toast({ title: "Bedrijf bijgewerkt" });
      } else {
        await api.createCompany({ ...form, name: form.name });
        toast({ title: "Bedrijf toegevoegd" });
      }
      setOpen(false);
      setForm(emptyForm);
      setEditId(null);
      fetchCompanies();
    } catch (error: unknown) {
      toast({ title: "Fout", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    }
  };

  const handleEdit = (company: Company) => {
    setForm(company);
    setEditId(company.id);
    setOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Weet je zeker dat je dit bedrijf wilt verwijderen?")) return;
    await api.deleteCompany(id);
    fetchCompanies();
    toast({ title: "Bedrijf verwijderd" });
  };

  const updateField = (field: string, value: string | number | null | undefined) => setForm((prev) => ({ ...prev, [field]: value }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Bedrijven</h1>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setForm(emptyForm); setEditId(null); } }}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" />Bedrijf toevoegen</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editId ? "Bedrijf bewerken" : "Nieuw bedrijf"}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>Bedrijfsnaam *</Label>
                <Input value={form.name || ""} onChange={(e) => updateField("name", e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Contactpersoon</Label>
                  <Input value={form.contact_person || ""} onChange={(e) => updateField("contact_person", e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label>E-mail</Label>
                  <Input type="email" value={form.email || ""} onChange={(e) => updateField("email", e.target.value)} />
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Telefoon</Label>
                <Input value={form.phone || ""} onChange={(e) => updateField("phone", e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label>Straat</Label>
                <Input value={form.street || ""} onChange={(e) => updateField("street", e.target.value)} />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="grid gap-2">
                  <Label>Postcode</Label>
                  <Input value={form.postal_code || ""} onChange={(e) => updateField("postal_code", e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label>Plaats</Label>
                  <Input value={form.city || ""} onChange={(e) => updateField("city", e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label>Land</Label>
                  <Input value={form.country || ""} onChange={(e) => updateField("country", e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>KvK-nummer</Label>
                  <Input value={form.kvk_number || ""} onChange={(e) => updateField("kvk_number", e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label>BTW-nummer</Label>
                  <Input value={form.btw_number || ""} onChange={(e) => updateField("btw_number", e.target.value)} />
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Standaard uurtarief (€)</Label>
                <Input type="number" step="0.01" value={form.default_hourly_rate ?? ""} onChange={(e) => updateField("default_hourly_rate", e.target.value ? parseFloat(e.target.value) : null)} />
              </div>
              <div className="grid gap-2">
                <Label>Notities</Label>
                <Textarea value={form.notes || ""} onChange={(e) => updateField("notes", e.target.value)} />
              </div>
              <Button onClick={handleSave}>{editId ? "Opslaan" : "Toevoegen"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {companies.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Building2 className="h-12 w-12 mb-4" />
            <p>Nog geen bedrijven toegevoegd</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {companies.map((company) => (
            <Card key={company.id}>
              <CardHeader className="flex flex-row items-start justify-between pb-2">
                <CardTitle className="text-base">{company.name}</CardTitle>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => handleEdit(company)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(company.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-1">
                {company.contact_person && <p>{company.contact_person}</p>}
                {company.email && <p>{company.email}</p>}
                {company.phone && <p>{company.phone}</p>}
                {company.city && <p>{company.city}</p>}
                {company.default_hourly_rate && <p className="font-medium text-foreground">€{Number(company.default_hourly_rate).toFixed(2)}/uur</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
