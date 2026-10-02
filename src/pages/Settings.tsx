import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { api, apiRequest } from "@/lib/api";
import type { Service } from "@/lib/db-types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2, UserPlus, Crown, Shield, Eye, User, Trash } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ThemePicker } from "@/components/ThemeToggle";
import { TwoFactorCard } from "@/components/settings/TwoFactorCard";
import { LogoUpload } from "@/components/settings/LogoUpload";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bell, Building2, Database, Package, Palette, Percent, ShieldCheck, Users } from "lucide-react";
import { SORTED_PRESETS, OTHER_PRESET, presetFor, rateOptions, bankAccountLabel } from "@/lib/tax-presets";
import { SUPPORTED_CURRENCIES, currencySymbol } from "@/lib/tax";

const SETTINGS_TABS = [
  { value: "business", label: "Business", icon: Building2 },
  { value: "tax", label: "Tax & mileage", icon: Percent },
  { value: "services", label: "Services", icon: Package },
  { value: "security", label: "Security", icon: ShieldCheck },
  { value: "team", label: "Team", icon: Users },
  { value: "notifications", label: "Notifications", icon: Bell },
  { value: "data", label: "Data", icon: Database },
  { value: "appearance", label: "Appearance", icon: Palette },
] as const;

function initialTab() {
  const hash = window.location.hash.slice(1);
  return SETTINGS_TABS.some((t) => t.value === hash) ? hash : "business";
}

export default function Settings() {
  const [tab, setTab] = useState(initialTab);
  const changeTab = (value: string) => {
    setTab(value);
    window.history.replaceState(null, "", `#${value}`);
  };
  const { user } = useAuth();
  const { toast } = useToast();
  const [form, setForm] = useState({
    company_name: "", contact_person: "", email: "", phone: "",
    street: "", postal_code: "", city: "", country: "",
    kvk_number: "", btw_number: "", iban: "",
    private_name: "", private_street: "", private_postal_code: "", private_city: "", private_country: "",
    tax_name: "VAT", default_tax_rate: "0", currency: "EUR",
    country_code: "", mileage_rate: "0", distance_unit: "km",
  });
  const [existingId, setExistingId] = useState<string | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [svcOpen, setSvcOpen] = useState(false);
  const [svcEditId, setSvcEditId] = useState<string | null>(null);
  const [svcName, setSvcName] = useState("");
  const [svcAmount, setSvcAmount] = useState("");
  const [passwordForm, setPasswordForm] = useState({ current: "", next: "", confirm: "" });
  const [changingPassword, setChangingPassword] = useState(false);
  const [smtp, setSmtp] = useState({ host: "", port: 587, secure: 0, username: "", password: "", from_name: "", from_email: "", base_url: "" });
  const [smtpLoaded, setSmtpLoaded] = useState(false);
  const [savingSmtp, setSavingSmtp] = useState(false);
  const [testingSmtp, setTestingSmtp] = useState(false);

  // Backup / restore
  const [backupPassword, setBackupPassword] = useState("");
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [restorePassword, setRestorePassword] = useState("");
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restoring, setRestoring] = useState(false);

  // Team management
  const queryClient = useQueryClient();
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviting, setInviting] = useState(false);

  const { data: org } = useQuery({
    queryKey: ["org"],
    queryFn: () => apiRequest<{
      id: string; name: string; plan: string;
      members: Array<{ id: string; user_id: string; email: string; role: string; joined_at: string }>;
      pending_invites: Array<{ id: string; email: string; role: string; expires_at: string }>;
    }>("/api/org"),
    enabled: !!user,
  });

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      const result = await apiRequest<{ invite_token: string; email: string; email_sent?: boolean }>("/api/org/invite", {
        method: "POST",
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      toast({
        title: `Invite created for ${result.email}`,
        description: result.email_sent
          ? "An email with the invite link has been sent."
          : `Share this link: ${window.location.origin}/invite?token=${result.invite_token}`,
      });
      setInviteEmail("");
      queryClient.invalidateQueries({ queryKey: ["org"] });
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setInviting(false);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    try {
      await apiRequest(`/api/org/members/${memberId}`, { method: "DELETE" });
      queryClient.invalidateQueries({ queryKey: ["org"] });
      toast({ title: "Member removed" });
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    }
  };

  const handleCancelInvite = async (inviteId: string) => {
    try {
      await apiRequest(`/api/org/invites/${inviteId}`, { method: "DELETE" });
      queryClient.invalidateQueries({ queryKey: ["org"] });
      toast({ title: "Invite cancelled" });
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    }
  };

  useEffect(() => {
    if (!user) return;
    api.getBusinessSettings().then((data) => {
      if (data) {
        setExistingId(data.id);
        setForm({
          company_name: data.company_name || "",
          contact_person: data.contact_person || "",
          email: data.email || "",
          phone: data.phone || "",
          street: data.street || "",
          postal_code: data.postal_code || "",
          city: data.city || "",
          country: data.country || "",
          kvk_number: data.kvk_number || "",
          btw_number: data.btw_number || "",
          iban: data.iban || "",
          private_name: data.private_name || "",
          private_street: data.private_street || "",
          private_postal_code: data.private_postal_code || "",
          private_city: data.private_city || "",
          private_country: data.private_country || "",
          tax_name: data.tax_name || "VAT",
          default_tax_rate: String(data.default_tax_rate ?? 0),
          currency: data.currency || "EUR",
          country_code: data.country_code || "",
          mileage_rate: String(data.mileage_rate ?? 0),
          distance_unit: data.distance_unit || "km",
        });
      }
    });
    api.getServices().then(setServices).catch(() => setServices([]));
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    try {
      const saved = await api.putBusinessSettings({
        ...form,
        country_code: form.country_code || null,
        default_tax_rate: Number(form.default_tax_rate) || 0,
        mileage_rate: Number(form.mileage_rate) || 0,
      });
      await queryClient.invalidateQueries({ queryKey: ["business-settings"] });
      if (saved) setExistingId(saved.id);
      toast({ title: "Settings saved" });
    } catch (error: unknown) {
      toast({ title: "Error", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    }
  };

  const updateField = (field: string, value: string) => setForm((prev) => ({ ...prev, [field]: value }));

  const preset = presetFor(form.country_code);

  const applyCountry = (code: string) => {
    const p = presetFor(code);
    setForm((f) => ({
      ...f,
      country_code: code,
      country: code === OTHER_PRESET.code ? f.country : p.name,
      tax_name: p.taxName,
      default_tax_rate: String(p.standardRate),
      currency: p.currency,
      distance_unit: p.distanceUnit,
    }));
  };

  const refreshServices = async () => {
    const s = await api.getServices();
    setServices(s);
  };

  const openNewService = () => {
    setSvcEditId(null);
    setSvcName("");
    setSvcAmount("");
    setSvcOpen(true);
  };

  const openEditService = (s: Service) => {
    setSvcEditId(s.id);
    setSvcName(s.name);
    setSvcAmount(String(s.amount));
    setSvcOpen(true);
  };

  const saveService = async () => {
    const name = svcName.trim();
    const amount = Number(svcAmount);
    if (!name) {
      toast({ title: "Service", description: "Name is required.", variant: "destructive" });
      return;
    }
    if (!Number.isFinite(amount)) {
      toast({ title: "Service", description: "Invalid amount.", variant: "destructive" });
      return;
    }
    try {
      if (svcEditId) await api.updateService(svcEditId, { name, amount });
      else await api.createService({ name, amount });
      setSvcOpen(false);
      await refreshServices();
      toast({ title: "Service saved" });
    } catch (e: unknown) {
      toast({ title: "Error", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    }
  };

  const deleteService = async (id: string) => {
    if (!confirm("Delete this service?")) return;
    try {
      await api.deleteService(id);
      await refreshServices();
      toast({ title: "Service deleted" });
    } catch (e: unknown) {
      toast({ title: "Error", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    }
  };

  const handleChangePassword = async () => {
    const current = passwordForm.current;
    const next = passwordForm.next;
    const confirm = passwordForm.confirm;
    if (!current || !next || !confirm) {
      toast({ title: "Password", description: "Please fill in all fields.", variant: "destructive" });
      return;
    }
    if (next.length < 8) {
      toast({ title: "Password", description: "New password must be at least 8 characters.", variant: "destructive" });
      return;
    }
    if (next !== confirm) {
      toast({ title: "Password", description: "New password and confirmation do not match.", variant: "destructive" });
      return;
    }
    setChangingPassword(true);
    try {
      await api.changePassword({ current_password: current, new_password: next });
      setPasswordForm({ current: "", next: "", confirm: "" });
      toast({ title: "Password changed" });
    } catch (error: unknown) {
      toast({ title: "Failed to change password", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    } finally {
      setChangingPassword(false);
    }
  };

  // Load SMTP settings when notifications tab is opened
  useEffect(() => {
    if (tab === "notifications" && !smtpLoaded && user) {
      api.getSmtpSettings().then((data) => {
        setSmtp({ host: data.host, port: data.port, secure: data.secure, username: data.username, password: "", from_name: data.from_name, from_email: data.from_email, base_url: data.base_url });
        setSmtpLoaded(true);
      }).catch(() => setSmtpLoaded(true));
    }
  }, [tab, smtpLoaded, user]);

  const handleSaveSmtp = async () => {
    setSavingSmtp(true);
    try {
      await api.saveSmtpSettings(smtp);
      toast({ title: "SMTP settings saved" });
    } catch (err: unknown) {
      toast({ title: "Failed to save", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setSavingSmtp(false);
    }
  };

  const handleTestSmtp = async () => {
    setTestingSmtp(true);
    try {
      await api.testSmtp();
      toast({ title: "Test email sent", description: "Check your inbox." });
    } catch (err: unknown) {
      toast({ title: "Test failed", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setTestingSmtp(false);
    }
  };

  const handleBackup = async () => {
    if (!backupPassword || backupPassword.length < 8) {
      toast({ title: "Password too short", description: "Use at least 8 characters.", variant: "destructive" });
      return;
    }
    setCreatingBackup(true);
    try {
      const token = (await import("@/lib/api")).getStoredToken();
      const res = await fetch("/api/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ password: backupPassword }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? "Backup failed"); }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.headers.get("Content-Disposition")?.match(/filename="(.+?)"/)?.[1] ?? "zedgerr-backup.zdbk";
      a.click();
      URL.revokeObjectURL(url);
      setBackupPassword("");
      toast({ title: "Backup downloaded" });
    } catch (err: unknown) {
      toast({ title: "Backup failed", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setCreatingBackup(false);
    }
  };

  const handleRestore = async () => {
    if (!restoreFile || !restorePassword) return;
    if (!confirm("This will replace the current database and restart the server. Are you sure?")) return;
    setRestoring(true);
    try {
      const token = (await import("@/lib/api")).getStoredToken();
      const form = new FormData();
      form.append("file", restoreFile);
      form.append("password", restorePassword);
      const res = await fetch("/api/restore", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Restore failed");
      toast({ title: "Restore complete", description: data.message });
      setRestoreFile(null);
      setRestorePassword("");
    } catch (err: unknown) {
      toast({ title: "Restore failed", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your business details, tax, security and workspace.</p>
      </div>
      <Tabs value={tab} onValueChange={changeTab} className="space-y-6">
        <TabsList className="h-auto flex-wrap justify-start">
          {SETTINGS_TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value} className="gap-1.5">
              <t.icon className="h-4 w-4" />
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="business" className="space-y-6 max-w-3xl mt-0">
      <Card>
        <CardHeader>
          <CardTitle>Business details</CardTitle>
          <CardDescription>Used on invoices and quotes</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label>Logo</Label>
            <LogoUpload />
          </div>
          <div className="grid gap-2">
            <Label>Company name</Label>
            <Input value={form.company_name} onChange={(e) => updateField("company_name", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Contact person</Label>
              <Input value={form.contact_person} onChange={(e) => updateField("contact_person", e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => updateField("email", e.target.value)} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Phone</Label>
            <Input value={form.phone} onChange={(e) => updateField("phone", e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>Street</Label>
            <Input value={form.street} onChange={(e) => updateField("street", e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="grid gap-2">
              <Label>Postal code</Label>
              <Input value={form.postal_code} onChange={(e) => updateField("postal_code", e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>City</Label>
              <Input value={form.city} onChange={(e) => updateField("city", e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Country</Label>
              <Input value={form.country} onChange={(e) => updateField("country", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>{preset.companyIdLabel}</Label>
              <Input value={form.kvk_number} onChange={(e) => updateField("kvk_number", e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>{preset.taxIdLabel}</Label>
              <Input value={form.btw_number} onChange={(e) => updateField("btw_number", e.target.value)} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>{bankAccountLabel(form.country_code).label}</Label>
            <Input value={form.iban} onChange={(e) => updateField("iban", e.target.value)} />
          </div>
          <Button onClick={handleSave}>Save</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Private / personal details</CardTitle>
          <CardDescription>For personal invoices (salary to yourself, tax-exempt)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label>Full name</Label>
            <Input value={form.private_name} onChange={(e) => updateField("private_name", e.target.value)} placeholder="First Last" />
          </div>
          <div className="grid gap-2">
            <Label>Street</Label>
            <Input value={form.private_street} onChange={(e) => updateField("private_street", e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="grid gap-2">
              <Label>Postal code</Label>
              <Input value={form.private_postal_code} onChange={(e) => updateField("private_postal_code", e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>City</Label>
              <Input value={form.private_city} onChange={(e) => updateField("private_city", e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Country</Label>
              <Input value={form.private_country} onChange={(e) => updateField("private_country", e.target.value)} />
            </div>
          </div>
          <Button onClick={handleSave}>Save</Button>
        </CardContent>
      </Card>
        </TabsContent>
        <TabsContent value="tax" className="space-y-6 max-w-3xl mt-0">
      <Card>
        <CardHeader>
          <CardTitle>Country & tax</CardTitle>
          <CardDescription>
            Choosing a country fills in its usual tax name, rate and currency. You can still adjust each value, for example if you are not tax-registered.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label>Country</Label>
            <Select value={form.country_code} onValueChange={applyCountry}>
              <SelectTrigger><SelectValue placeholder="Select your country" /></SelectTrigger>
              <SelectContent className="max-h-72">
                {SORTED_PRESETS.map((p) => <SelectItem key={p.code} value={p.code}>{p.name}</SelectItem>)}
                <SelectItem value={OTHER_PRESET.code}>{OTHER_PRESET.name}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {preset.regions && (
            <div className="grid gap-2">
              <Label>Province or territory</Label>
              <Select
                onValueChange={(name) => {
                  const r = preset.regions?.find((x) => x.name === name);
                  if (r) setForm((f) => ({ ...f, tax_name: r.taxName, default_tax_rate: String(r.rate) }));
                }}
              >
                <SelectTrigger><SelectValue placeholder="Apply a provincial rate…" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {preset.regions.map((r) => <SelectItem key={r.name} value={r.name}>{r.name} ({r.taxName} {r.rate}%)</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="grid gap-2">
              <Label>Tax name</Label>
              <Input value={form.tax_name} onChange={(e) => updateField("tax_name", e.target.value)} placeholder="VAT / GST / Sales tax" />
            </div>
            <div className="grid gap-2">
              <Label>Default rate (%)</Label>
              <Input type="number" step="0.001" min="0" max="100" value={form.default_tax_rate} onChange={(e) => updateField("default_tax_rate", e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Currency</Label>
              <Select value={form.currency} onValueChange={(v) => updateField("currency", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {SUPPORTED_CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c} ({currencySymbol(c)})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {rateOptions(preset, Number(form.default_tax_rate)).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => updateField("default_tax_rate", String(r))}
                className={`rounded-full border px-2.5 py-0.5 text-xs tabular-nums transition-colors ${
                  Number(form.default_tax_rate) === r ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"
                }`}
              >
                {r}%
              </button>
            ))}
          </div>
          {preset.note && <p className="text-xs text-muted-foreground">{preset.note}</p>}
          {preset.eu && (
            <p className="text-xs text-muted-foreground">
              Invoicing a business in another EU country? Choose "EU business abroad (reverse charge)" as the invoice type to charge 0% {form.tax_name || "VAT"}.
            </p>
          )}
          <Button onClick={handleSave}>Save</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Mileage</CardTitle>
          <CardDescription>
            The allowance per {form.distance_unit === "mi" ? "mile" : "kilometre"} for business trips. Use the rate your tax authority allows, or 0 to only track distance.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Distance unit</Label>
              <Select value={form.distance_unit} onValueChange={(v) => updateField("distance_unit", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="km">Kilometres</SelectItem>
                  <SelectItem value="mi">Miles</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Rate per {form.distance_unit} ({currencySymbol(form.currency)})</Label>
              <Input type="number" step="0.001" min="0" value={form.mileage_rate} onChange={(e) => updateField("mileage_rate", e.target.value)} />
            </div>
          </div>
          <Button onClick={handleSave}>Save</Button>
        </CardContent>
      </Card>
        </TabsContent>
        <TabsContent value="services" className="space-y-6 max-w-3xl mt-0">
      <Card>
        <CardHeader>
          <CardTitle>Services</CardTitle>
          <CardDescription>Preset amounts for quick invoice creation</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-end">
            <Button variant="outline" onClick={openNewService}>
              <Plus className="mr-2 h-4 w-4" />
              Add service
            </Button>
          </div>
          {services.length === 0 ? (
            <p className="text-sm text-muted-foreground">No services yet.</p>
          ) : (
            <div className="overflow-x-auto border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="w-24 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {services.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {Number(s.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEditService(s)} title="Edit">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="text-destructive" onClick={() => deleteService(s.id)} title="Delete">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <Dialog open={svcOpen} onOpenChange={setSvcOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>{svcEditId ? "Edit service" : "New service"}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-2">
                <div className="grid gap-2">
                  <Label>Name</Label>
                  <Input value={svcName} onChange={(e) => setSvcName(e.target.value)} placeholder="e.g. Web maintenance" />
                </div>
                <div className="grid gap-2">
                  <Label>Amount (excl. tax)</Label>
                  <Input type="number" step="0.01" value={svcAmount} onChange={(e) => setSvcAmount(e.target.value)} placeholder="250.00" />
                </div>
                <Button onClick={saveService}>{svcEditId ? "Save" : "Create"}</Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
        </TabsContent>
        <TabsContent value="security" className="space-y-6 max-w-3xl mt-0">
      <Card>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
          <CardDescription>Update your login password for this account</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label>Current password</Label>
            <Input
              type="password"
              autoComplete="current-password"
              value={passwordForm.current}
              onChange={(e) => setPasswordForm((p) => ({ ...p, current: e.target.value }))}
            />
          </div>
          <div className="grid gap-2">
            <Label>New password</Label>
            <Input
              type="password"
              autoComplete="new-password"
              value={passwordForm.next}
              onChange={(e) => setPasswordForm((p) => ({ ...p, next: e.target.value }))}
            />
          </div>
          <div className="grid gap-2">
            <Label>Confirm new password</Label>
            <Input
              type="password"
              autoComplete="new-password"
              value={passwordForm.confirm}
              onChange={(e) => setPasswordForm((p) => ({ ...p, confirm: e.target.value }))}
            />
          </div>
          <Button onClick={handleChangePassword} disabled={changingPassword}>
            {changingPassword ? "Saving…" : "Save password"}
          </Button>
        </CardContent>
      </Card>
          <TwoFactorCard />
        </TabsContent>
        <TabsContent value="team" className="space-y-6 max-w-3xl mt-0">
      <Card>
        <CardHeader>
          <CardTitle>Team</CardTitle>
          <CardDescription>
            Organisation: <strong>{org?.name}</strong>
            {org?.plan && <Badge variant="outline" className="ml-2 text-xs">{org.plan}</Badge>}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Member since</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(org?.members ?? []).map((m) => (
                <TableRow key={m.id}>
                  <TableCell>{m.email}</TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1.5">
                      {m.role === "owner" && <Crown className="h-3.5 w-3.5 text-yellow-500" />}
                      {m.role === "admin" && <Shield className="h-3.5 w-3.5 text-blue-500" />}
                      {m.role === "member" && <User className="h-3.5 w-3.5 text-muted-foreground" />}
                      {m.role === "viewer" && <Eye className="h-3.5 w-3.5 text-muted-foreground" />}
                      {m.role}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(m.joined_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    {m.role !== "owner" && (
                      <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleRemoveMember(m.id)}>
                        <Trash className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {(org?.pending_invites?.length ?? 0) > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Pending invites</p>
              <Table>
                <TableBody>
                  {org!.pending_invites.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell>{inv.email}</TableCell>
                      <TableCell><Badge variant="outline" className="text-xs">{inv.role}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">expires {new Date(inv.expires_at).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleCancelInvite(inv.id)}>
                          <Trash className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="border rounded-md p-4 space-y-3 bg-muted/20">
            <p className="text-sm font-medium">Invite team member</p>
            <div className="flex flex-wrap gap-2 items-end">
              <div className="grid gap-1.5 flex-1 min-w-48">
                <Label className="text-xs">Email</Label>
                <Input
                  type="email"
                  placeholder="name@example.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleInvite()}
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Role</Label>
                <Select value={inviteRole} onValueChange={setInviteRole}>
                  <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="member">Member</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleInvite} disabled={inviting || !inviteEmail.trim()}>
                <UserPlus className="mr-2 h-4 w-4" />
                {inviting ? "Sending…" : "Invite"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
        </TabsContent>
        <TabsContent value="notifications" className="space-y-6 max-w-3xl mt-0">
          <Card>
            <CardHeader>
              <CardTitle>Email (SMTP)</CardTitle>
              <CardDescription>
                Configure an outgoing mail server so Zedgerr can send team invitations. Leave blank to share invite links manually.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label>SMTP host</Label>
                  <Input placeholder="smtp.example.com" value={smtp.host} onChange={(e) => setSmtp((s) => ({ ...s, host: e.target.value }))} />
                </div>
                <div className="grid gap-1.5">
                  <Label>Port</Label>
                  <Input type="number" placeholder="587" value={smtp.port} onChange={(e) => setSmtp((s) => ({ ...s, port: Number(e.target.value) }))} />
                </div>
                <div className="grid gap-1.5">
                  <Label>Username</Label>
                  <Input placeholder="you@example.com" value={smtp.username} onChange={(e) => setSmtp((s) => ({ ...s, username: e.target.value }))} />
                </div>
                <div className="grid gap-1.5">
                  <Label>Password</Label>
                  <Input type="password" placeholder="Leave blank to keep existing" value={smtp.password} onChange={(e) => setSmtp((s) => ({ ...s, password: e.target.value }))} />
                </div>
                <div className="grid gap-1.5">
                  <Label>From name</Label>
                  <Input placeholder="Acme Inc" value={smtp.from_name} onChange={(e) => setSmtp((s) => ({ ...s, from_name: e.target.value }))} />
                </div>
                <div className="grid gap-1.5">
                  <Label>From email</Label>
                  <Input type="email" placeholder="noreply@example.com" value={smtp.from_email} onChange={(e) => setSmtp((s) => ({ ...s, from_email: e.target.value }))} />
                </div>
                <div className="grid gap-1.5 sm:col-span-2">
                  <Label>App URL <span className="text-muted-foreground font-normal text-xs">(used in invite links)</span></Label>
                  <Input placeholder="https://invoices.example.com" value={smtp.base_url} onChange={(e) => setSmtp((s) => ({ ...s, base_url: e.target.value }))} />
                </div>
                <div className="flex items-center gap-2 sm:col-span-2">
                  <input type="checkbox" id="smtp-tls" checked={smtp.secure === 1} onChange={(e) => setSmtp((s) => ({ ...s, secure: e.target.checked ? 1 : 0 }))} className="h-4 w-4 rounded border-input accent-primary" />
                  <Label htmlFor="smtp-tls" className="cursor-pointer font-normal">Use TLS (port 465)</Label>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                <Button onClick={handleSaveSmtp} disabled={savingSmtp}>{savingSmtp ? "Saving…" : "Save"}</Button>
                <Button variant="outline" onClick={handleTestSmtp} disabled={testingSmtp || !smtp.host}>{testingSmtp ? "Sending…" : "Send test email"}</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="data" className="space-y-6 max-w-3xl mt-0">
          <Card>
            <CardHeader>
              <CardTitle>Backup</CardTitle>
              <CardDescription>
                Download an encrypted copy of your entire database. Keep it somewhere safe — you'll need the password to restore it.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-1.5 max-w-sm">
                <Label>Encryption password <span className="text-muted-foreground font-normal text-xs">(min. 8 characters)</span></Label>
                <Input
                  type="password"
                  placeholder="Choose a strong password"
                  value={backupPassword}
                  onChange={(e) => setBackupPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleBackup()}
                />
              </div>
              <Button onClick={handleBackup} disabled={creatingBackup || backupPassword.length < 8}>
                {creatingBackup ? "Creating backup…" : "Download backup"}
              </Button>
            </CardContent>
          </Card>

          <Card className="border-destructive/30">
            <CardHeader>
              <CardTitle className="text-destructive">Restore</CardTitle>
              <CardDescription>
                Restore from a <code className="text-xs">.zdbk</code> backup file. This replaces all current data and restarts the server.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-1.5 max-w-sm">
                <Label>Backup file</Label>
                <Input
                  type="file"
                  accept=".zdbk"
                  onChange={(e) => setRestoreFile(e.target.files?.[0] ?? null)}
                />
              </div>
              <div className="grid gap-1.5 max-w-sm">
                <Label>Decryption password</Label>
                <Input
                  type="password"
                  placeholder="Password used when the backup was created"
                  value={restorePassword}
                  onChange={(e) => setRestorePassword(e.target.value)}
                />
              </div>
              <Button
                variant="destructive"
                onClick={handleRestore}
                disabled={restoring || !restoreFile || !restorePassword}
              >
                {restoring ? "Restoring…" : "Restore database"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="appearance" className="space-y-6 max-w-3xl mt-0">
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>Choose light or dark mode, or follow your device setting.</CardDescription>
        </CardHeader>
        <CardContent>
          <ThemePicker />
        </CardContent>
      </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
