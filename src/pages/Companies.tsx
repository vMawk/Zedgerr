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
import { Plus, Pencil, Trash2, Building2, MonitorSmartphone, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";

function generateClientPassword(): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const len = 14;
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  let s = "";
  for (let i = 0; i < len; i++) s += chars[arr[i]! % chars.length];
  return s;
}

const emptyForm: Partial<Company> = {
  name: "", contact_person: "", email: "", phone: "",
  street: "", postal_code: "", city: "", country: "Nederland",
  kvk_number: "", btw_number: "", default_hourly_rate: undefined, advance_balance: 0, notes: "",
};

export default function Companies() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [form, setForm] = useState<Partial<Company>>(emptyForm);
  const [editId, setEditId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [portalEmail, setPortalEmail] = useState("");
  const [portalPassword, setPortalPassword] = useState("");
  const [portalHasPortal, setPortalHasPortal] = useState(false);

  const fetchCompanies = async () => {
    const data = await api.getCompanies();
    setCompanies(data);
  };

  useEffect(() => { if (user) fetchCompanies(); }, [user]);

  const handleSave = async () => {
    if (!user) return;
    const pw = portalPassword.trim();
    if (portalEmail.trim()) {
      if (!portalHasPortal && pw.length < 6) {
        toast({
          title: "Klantenportaal",
          description: "Stel een wachtwoord in voor de klant (minimaal 6 tekens) of gebruik ‘Wachtwoord genereren’.",
          variant: "destructive",
        });
        return;
      }
      if (pw.length > 0 && pw.length < 6) {
        toast({ title: "Klantenportaal", description: "Wachtwoord moet minimaal 6 tekens zijn.", variant: "destructive" });
        return;
      }
    }
    try {
      if (editId) {
        await api.updateCompany(editId, { ...form });
        if (portalEmail.trim()) {
          await api.putCompanyPortal(editId, {
            email: portalEmail.trim(),
            password: pw || undefined,
          });
        }
        toast({ title: "Bedrijf bijgewerkt" });
      } else {
        const created = await api.createCompany({ ...form, name: form.name });
        if (portalEmail.trim()) {
          await api.putCompanyPortal(created.id, {
            email: portalEmail.trim(),
            password: pw,
          });
        }
        toast({ title: "Bedrijf toegevoegd" });
      }
      setOpen(false);
      setForm(emptyForm);
      setEditId(null);
      setPortalEmail("");
      setPortalPassword("");
      setPortalHasPortal(false);
      fetchCompanies();
    } catch (error: unknown) {
      toast({ title: "Fout", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    }
  };

  const handleEdit = async (company: Company) => {
    setForm(company);
    setEditId(company.id);
    setPortalPassword("");
    try {
      const p = await api.getCompanyPortal(company.id);
      setPortalEmail(p.email ?? "");
      setPortalHasPortal(p.hasPortal);
    } catch {
      setPortalEmail("");
      setPortalHasPortal(false);
    }
    setOpen(true);
  };

  const handleGeneratePortalPassword = async () => {
    const pw = generateClientPassword();
    setPortalPassword(pw);
    try {
      await navigator.clipboard.writeText(pw);
      toast({ title: "Wachtwoord aangemaakt", description: "Gekopieerd naar klembord. Deel dit veilig met je klant." });
    } catch {
      toast({ title: "Wachtwoord aangemaakt", description: "Kopieer het wachtwoord uit het veld en deel het veilig met je klant." });
    }
  };

  const handleRemovePortal = async () => {
    if (!editId || !portalHasPortal) return;
    if (!confirm("Klantenportaal uitschakelen? Het bedrijf kan dan niet meer inloggen.")) return;
    try {
      await api.deleteCompanyPortal(editId);
      setPortalHasPortal(false);
      setPortalEmail("");
      setPortalPassword("");
      fetchCompanies();
      toast({ title: "Portaal uitgeschakeld" });
    } catch (error: unknown) {
      toast({ title: "Fout", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    }
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
        <h1 className="text-xl font-semibold">Bedrijven</h1>
        <Dialog
          open={open}
          onOpenChange={(v) => {
            setOpen(v);
            if (!v) {
              setForm(emptyForm);
              setEditId(null);
              setPortalEmail("");
              setPortalPassword("");
              setPortalHasPortal(false);
            }
          }}
        >
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" />Bedrijf toevoegen</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editId ? "Bedrijf bewerken" : "Nieuw bedrijf"}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>Bedrijfsnaam</Label>
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
                <Label>Beschikbaar krediet (€)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.advance_balance ?? 0}
                  onChange={(e) => updateField("advance_balance", e.target.value ? Math.max(0, parseFloat(e.target.value)) : 0)}
                />
              </div>
              <div className="grid gap-2">
                <Label>Notities</Label>
                <Textarea value={form.notes || ""} onChange={(e) => updateField("notes", e.target.value)} />
              </div>
              <div className="border-t pt-4 space-y-3">
                <div className="flex items-center gap-2">
                  <MonitorSmartphone className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm font-medium">Klantenportaal</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Maak hier een inlog aan voor je klant: e-mail en wachtwoord. De klant gaat naar{" "}
                  <span className="font-mono text-foreground">/klantenportaal</span> en ziet uren en facturen voor dit bedrijf.
                </p>
                <div className="grid gap-2">
                  <Label htmlFor="portal-email">E-mail voor inlog klant</Label>
                  <Input
                    id="portal-email"
                    type="email"
                    autoComplete="off"
                    value={portalEmail}
                    onChange={(e) => setPortalEmail(e.target.value)}
                    placeholder="klant@bedrijf.nl"
                  />
                </div>
                <div className="grid gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="portal-password">Wachtwoord voor klant</Label>
                    <Button type="button" variant="secondary" size="sm" className="h-7 text-xs shrink-0" onClick={handleGeneratePortalPassword}>
                      <RefreshCw className="mr-1 h-3 w-3" />
                      Genereren
                    </Button>
                  </div>
                  <Input
                    id="portal-password"
                    type="text"
                    autoComplete="new-password"
                    value={portalPassword}
                    onChange={(e) => setPortalPassword(e.target.value)}
                    placeholder={portalHasPortal ? "Leeg laten om wachtwoord niet te wijzigen" : "Min. 6 tekens — of klik op Genereren"}
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    {portalHasPortal
                      ? "Vul alleen een nieuw wachtwoord in als je het wilt wijzigen."
                      : "Verplicht zodra je een e-mail invult. Het gegenereerde wachtwoord wordt naar je klembord gekopieerd."}
                  </p>
                </div>
                {editId && portalHasPortal && (
                  <Button type="button" variant="outline" size="sm" className="text-destructive" onClick={handleRemovePortal}>
                    Portaal uitschakelen
                  </Button>
                )}
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
                <div className="space-y-1">
                  <CardTitle className="text-base">
                    <Link to={`/bedrijven/${company.id}`} className="hover:underline">
                      {company.name || company.contact_person || "Klant"}
                    </Link>
                  </CardTitle>
                  {company.has_portal && (
                    <Badge variant="secondary" className="text-xs font-normal">
                      Klantenportaal
                    </Badge>
                  )}
                </div>
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
                <p className="font-medium text-foreground">
                  Krediet: €{Number(company.advance_balance ?? 0).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
