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

export default function Settings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [form, setForm] = useState({
    company_name: "", contact_person: "", email: "", phone: "",
    street: "", postal_code: "", city: "", country: "",
    kvk_number: "", btw_number: "", iban: "",
    private_name: "", private_street: "", private_postal_code: "", private_city: "", private_country: "",
    tax_name: "VAT", default_tax_rate: "20", currency: "EUR",
  });
  const [existingId, setExistingId] = useState<string | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [svcOpen, setSvcOpen] = useState(false);
  const [svcEditId, setSvcEditId] = useState<string | null>(null);
  const [svcName, setSvcName] = useState("");
  const [svcAmount, setSvcAmount] = useState("");
  const [passwordForm, setPasswordForm] = useState({ current: "", next: "", confirm: "" });
  const [changingPassword, setChangingPassword] = useState(false);
  const [sendingTelegramTest, setSendingTelegramTest] = useState(false);
  const [sendingUpcomingTelegramTest, setSendingUpcomingTelegramTest] = useState(false);

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
      const result = await apiRequest<{ invite_token: string; email: string }>("/api/org/invite", {
        method: "POST",
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      toast({ title: `Invite sent to ${result.email}`, description: `Token: ${result.invite_token.slice(0, 12)}…` });
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
          default_tax_rate: String(data.default_tax_rate ?? 20),
          currency: data.currency || "EUR",
        });
      }
    });
    api.getServices().then(setServices).catch(() => setServices([]));
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    try {
      const saved = await api.putBusinessSettings({ ...form, default_tax_rate: Number(form.default_tax_rate) });
      if (saved) setExistingId(saved.id);
      toast({ title: "Settings saved" });
    } catch (error: unknown) {
      toast({ title: "Fout", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    }
  };

  const updateField = (field: string, value: string) => setForm((prev) => ({ ...prev, [field]: value }));

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
    if (next.length < 6) {
      toast({ title: "Password", description: "New password must be at least 6 characters.", variant: "destructive" });
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

  const handleSendTelegramTest = async () => {
    setSendingTelegramTest(true);
    try {
      await api.sendTelegramTest();
      toast({ title: "Telegram test sent" });
    } catch (error: unknown) {
      toast({
        title: "Telegram test failed",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setSendingTelegramTest(false);
    }
  };

  const handleSendUpcomingTelegramTest = async () => {
    setSendingUpcomingTelegramTest(true);
    try {
      const res = await api.sendUpcomingPaymentsTelegramTest();
      if (res.count > 0) {
        toast({ title: "Upcoming payments test sent", description: `${res.count} payment(s) included.` });
      } else {
        toast({ title: "Upcoming payments test sent", description: "No payments due in the next 2 days." });
      }
    } catch (error: unknown) {
      toast({
        title: "Upcoming payments test failed",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setSendingUpcomingTelegramTest(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-xl font-semibold">Settings</h1>
      <Card>
        <CardHeader>
          <CardTitle>Business details</CardTitle>
          <CardDescription>Used on invoices and quotes</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
              <Label>Company / registration number</Label>
              <Input value={form.kvk_number} onChange={(e) => updateField("kvk_number", e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Tax ID / VAT number</Label>
              <Input value={form.btw_number} onChange={(e) => updateField("btw_number", e.target.value)} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>IBAN / Bank account</Label>
            <Input value={form.iban} onChange={(e) => updateField("iban", e.target.value)} />
          </div>
          <Button onClick={handleSave}>Save</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tax & currency</CardTitle>
          <CardDescription>Configure your local tax name, default rate, and currency. Works for VAT, GST, Sales Tax, IVA, and more.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="grid gap-2">
              <Label>Tax label</Label>
              <Input value={form.tax_name} onChange={(e) => updateField("tax_name", e.target.value)} placeholder="VAT / GST / Tax" />
            </div>
            <div className="grid gap-2">
              <Label>Default rate (%)</Label>
              <Input type="number" step="0.1" min="0" max="100" value={form.default_tax_rate} onChange={(e) => updateField("default_tax_rate", e.target.value)} placeholder="20" />
            </div>
            <div className="grid gap-2">
              <Label>Currency</Label>
              <Select value={form.currency} onValueChange={(v) => updateField("currency", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="EUR">EUR — Euro</SelectItem>
                  <SelectItem value="USD">USD — US Dollar</SelectItem>
                  <SelectItem value="GBP">GBP — British Pound</SelectItem>
                  <SelectItem value="AUD">AUD — Australian Dollar</SelectItem>
                  <SelectItem value="CAD">CAD — Canadian Dollar</SelectItem>
                  <SelectItem value="NZD">NZD — New Zealand Dollar</SelectItem>
                  <SelectItem value="CHF">CHF — Swiss Franc</SelectItem>
                  <SelectItem value="SEK">SEK — Swedish Krona</SelectItem>
                  <SelectItem value="NOK">NOK — Norwegian Krone</SelectItem>
                  <SelectItem value="DKK">DKK — Danish Krone</SelectItem>
                  <SelectItem value="JPY">JPY — Japanese Yen</SelectItem>
                  <SelectItem value="INR">INR — Indian Rupee</SelectItem>
                  <SelectItem value="BRL">BRL — Brazilian Real</SelectItem>
                  <SelectItem value="MXN">MXN — Mexican Peso</SelectItem>
                  <SelectItem value="SGD">SGD — Singapore Dollar</SelectItem>
                  <SelectItem value="ZAR">ZAR — South African Rand</SelectItem>
                </SelectContent>
              </Select>
            </div>
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

      <Card>
        <CardHeader>
          <CardTitle>Telegram</CardTitle>
          <CardDescription>Send a test notification to verify your Telegram integration</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleSendTelegramTest} disabled={sendingTelegramTest}>
              {sendingTelegramTest ? "Sending…" : "Test Telegram message"}
            </Button>
            <Button variant="outline" onClick={handleSendUpcomingTelegramTest} disabled={sendingUpcomingTelegramTest}>
              {sendingUpcomingTelegramTest ? "Sending…" : "Test upcoming payments"}
            </Button>
          </div>
        </CardContent>
      </Card>

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
    </div>
  );
}
