import { useEffect, useState } from "react";
import { useOpenOnNew } from "@/hooks/use-open-on-new";
import { useTaxSettings } from "@/lib/tax";
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
  street: "", postal_code: "", city: "", country: "",
  kvk_number: "", btw_number: "", default_hourly_rate: undefined, advance_balance: 0, notes: "",
};

export default function Companies() {
  const { currencySymbol: cs, preset } = useTaxSettings();
  const { user } = useAuth();
  const { toast } = useToast();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [form, setForm] = useState<Partial<Company>>(emptyForm);
  const [editId, setEditId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  useOpenOnNew(setOpen);
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
      if (!portalHasPortal && pw.length < 8) {
        toast({
          title: "Client portal",
          description: "Set a password for the client (at least 8 characters) or click Generate.",
          variant: "destructive",
        });
        return;
      }
      if (pw.length > 0 && pw.length < 8) {
        toast({ title: "Client portal", description: "Password must be at least 8 characters.", variant: "destructive" });
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
        toast({ title: "Company updated" });
      } else {
        const created = await api.createCompany({ ...form, name: form.name });
        if (portalEmail.trim()) {
          await api.putCompanyPortal(created.id, {
            email: portalEmail.trim(),
            password: pw,
          });
        }
        toast({ title: "Company added" });
      }
      setOpen(false);
      setForm(emptyForm);
      setEditId(null);
      setPortalEmail("");
      setPortalPassword("");
      setPortalHasPortal(false);
      fetchCompanies();
    } catch (error: unknown) {
      toast({ title: "Error", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
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
      toast({ title: "Password created", description: "Copied to clipboard. Share it with your client securely." });
    } catch {
      toast({ title: "Password created", description: "Copy the password from the field and share it with your client securely." });
    }
  };

  const handleRemovePortal = async () => {
    if (!editId || !portalHasPortal) return;
    if (!confirm("Disable the client portal? This client will no longer be able to sign in.")) return;
    try {
      await api.deleteCompanyPortal(editId);
      setPortalHasPortal(false);
      setPortalEmail("");
      setPortalPassword("");
      fetchCompanies();
      toast({ title: "Portal disabled" });
    } catch (error: unknown) {
      toast({ title: "Error", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this company?")) return;
    await api.deleteCompany(id);
    fetchCompanies();
    toast({ title: "Company deleted" });
  };

  const updateField = (field: string, value: string | number | null | undefined) => setForm((prev) => ({ ...prev, [field]: value }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Companies</h1>
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
            <Button><Plus className="mr-2 h-4 w-4" />Add company</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editId ? "Edit company" : "New company"}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>Company name</Label>
                <Input value={form.name || ""} onChange={(e) => updateField("name", e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Contact person</Label>
                  <Input value={form.contact_person || ""} onChange={(e) => updateField("contact_person", e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label>Email</Label>
                  <Input type="email" value={form.email || ""} onChange={(e) => updateField("email", e.target.value)} />
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Phone</Label>
                <Input value={form.phone || ""} onChange={(e) => updateField("phone", e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label>Street</Label>
                <Input value={form.street || ""} onChange={(e) => updateField("street", e.target.value)} />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="grid gap-2">
                  <Label>Postal code</Label>
                  <Input value={form.postal_code || ""} onChange={(e) => updateField("postal_code", e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label>City</Label>
                  <Input value={form.city || ""} onChange={(e) => updateField("city", e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label>Country</Label>
                  <Input value={form.country || ""} onChange={(e) => updateField("country", e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>{preset.companyIdLabel}</Label>
                  <Input value={form.kvk_number || ""} onChange={(e) => updateField("kvk_number", e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label>{preset.taxIdLabel}</Label>
                  <Input value={form.btw_number || ""} onChange={(e) => updateField("btw_number", e.target.value)} />
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Default hourly rate</Label>
                <Input type="number" step="0.01" value={form.default_hourly_rate ?? ""} onChange={(e) => updateField("default_hourly_rate", e.target.value ? parseFloat(e.target.value) : null)} />
              </div>
              <div className="grid gap-2">
                <Label>Available credit</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.advance_balance ?? 0}
                  onChange={(e) => updateField("advance_balance", e.target.value ? Math.max(0, parseFloat(e.target.value)) : 0)}
                />
              </div>
              <div className="grid gap-2">
                <Label>Notes</Label>
                <Textarea value={form.notes || ""} onChange={(e) => updateField("notes", e.target.value)} />
              </div>
              <div className="border-t pt-4 space-y-3">
                <div className="flex items-center gap-2">
                  <MonitorSmartphone className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm font-medium">Client portal</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Create a login for your client here. Your client goes to{" "}
                  <span className="font-mono text-foreground">/portal</span> and sees the hours and invoices for this company.
                </p>
                <div className="grid gap-2">
                  <Label htmlFor="portal-email">Client login email</Label>
                  <Input
                    id="portal-email"
                    type="email"
                    autoComplete="off"
                    value={portalEmail}
                    onChange={(e) => setPortalEmail(e.target.value)}
                    placeholder="client@company.com"
                  />
                </div>
                <div className="grid gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="portal-password">Client password</Label>
                    <Button type="button" variant="secondary" size="sm" className="h-7 text-xs shrink-0" onClick={handleGeneratePortalPassword}>
                      <RefreshCw className="mr-1 h-3 w-3" />
                      Generate
                    </Button>
                  </div>
                  <Input
                    id="portal-password"
                    type="text"
                    autoComplete="new-password"
                    value={portalPassword}
                    onChange={(e) => setPortalPassword(e.target.value)}
                    placeholder={portalHasPortal ? "Leave empty to keep the current password" : "At least 8 characters, or click Generate"}
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    {portalHasPortal
                      ? "Only enter a new password if you want to change it."
                      : "Required once you enter an email. A generated password is copied to your clipboard."}
                  </p>
                </div>
                {editId && portalHasPortal && (
                  <Button type="button" variant="outline" size="sm" className="text-destructive" onClick={handleRemovePortal}>
                    Disable portal
                  </Button>
                )}
              </div>
              <Button onClick={handleSave}>{editId ? "Save" : "Add"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {companies.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Building2 className="h-12 w-12 mb-4" />
            <p>No companies yet</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {companies.map((company) => (
            <Card key={company.id}>
              <CardHeader className="flex flex-row items-start justify-between pb-2">
                <div className="space-y-1">
                  <CardTitle className="text-base">
                    <Link to={`/companies/${company.id}`} className="hover:underline">
                      {company.name || company.contact_person || "Client"}
                    </Link>
                  </CardTitle>
                  {company.has_portal && (
                    <Badge variant="secondary" className="text-xs font-normal">
                      Client portal
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
                {company.default_hourly_rate && <p className="font-medium text-foreground">{cs}{Number(company.default_hourly_rate).toFixed(2)}/hr</p>}
                <p className="font-medium text-foreground">
                  Credit: {cs}{Number(company.advance_balance ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
