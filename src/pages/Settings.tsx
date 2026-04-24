import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import type { Service } from "@/lib/db-types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2 } from "lucide-react";

export default function Settings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [form, setForm] = useState({
    company_name: "", contact_person: "", email: "", phone: "",
    street: "", postal_code: "", city: "", country: "Nederland",
    kvk_number: "", btw_number: "", iban: "",
    private_name: "", private_street: "", private_postal_code: "", private_city: "", private_country: "Nederland",
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
          country: data.country || "Nederland",
          kvk_number: data.kvk_number || "",
          btw_number: data.btw_number || "",
          iban: data.iban || "",
          private_name: data.private_name || "",
          private_street: data.private_street || "",
          private_postal_code: data.private_postal_code || "",
          private_city: data.private_city || "",
          private_country: data.private_country || "Nederland",
        });
      }
    });
    api.getServices().then(setServices).catch(() => setServices([]));
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    try {
      const saved = await api.putBusinessSettings(form);
      if (saved) setExistingId(saved.id);
      toast({ title: "Instellingen opgeslagen" });
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
      toast({ title: "Dienst", description: "Naam is verplicht.", variant: "destructive" });
      return;
    }
    if (!Number.isFinite(amount)) {
      toast({ title: "Dienst", description: "Bedrag is ongeldig.", variant: "destructive" });
      return;
    }
    try {
      if (svcEditId) await api.updateService(svcEditId, { name, amount });
      else await api.createService({ name, amount });
      setSvcOpen(false);
      await refreshServices();
      toast({ title: "Dienst opgeslagen" });
    } catch (e: unknown) {
      toast({ title: "Fout", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    }
  };

  const deleteService = async (id: string) => {
    if (!confirm("Dienst verwijderen?")) return;
    try {
      await api.deleteService(id);
      await refreshServices();
      toast({ title: "Dienst verwijderd" });
    } catch (e: unknown) {
      toast({ title: "Fout", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    }
  };

  const handleChangePassword = async () => {
    const current = passwordForm.current;
    const next = passwordForm.next;
    const confirm = passwordForm.confirm;
    if (!current || !next || !confirm) {
      toast({ title: "Wachtwoord", description: "Vul alle velden in.", variant: "destructive" });
      return;
    }
    if (next.length < 6) {
      toast({ title: "Wachtwoord", description: "Nieuw wachtwoord moet minimaal 6 tekens zijn.", variant: "destructive" });
      return;
    }
    if (next !== confirm) {
      toast({ title: "Wachtwoord", description: "Nieuw wachtwoord en bevestiging komen niet overeen.", variant: "destructive" });
      return;
    }
    setChangingPassword(true);
    try {
      await api.changePassword({ current_password: current, new_password: next });
      setPasswordForm({ current: "", next: "", confirm: "" });
      toast({ title: "Wachtwoord gewijzigd" });
    } catch (error: unknown) {
      toast({ title: "Wachtwoord wijzigen mislukt", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    } finally {
      setChangingPassword(false);
    }
  };

  const handleSendTelegramTest = async () => {
    setSendingTelegramTest(true);
    try {
      await api.sendTelegramTest();
      toast({ title: "Telegram test verstuurd" });
    } catch (error: unknown) {
      toast({
        title: "Telegram test mislukt",
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
        toast({ title: "Komende-betalingen test verstuurd", description: `${res.count} betaling(en) meegenomen.` });
      } else {
        toast({ title: "Komende-betalingen test verstuurd", description: "Geen betalingen in de komende 2 dagen." });
      }
    } catch (error: unknown) {
      toast({
        title: "Komende-betalingen test mislukt",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setSendingUpcomingTelegramTest(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-semibold">Instellingen</h1>
      <Card>
        <CardHeader>
          <CardTitle>Bedrijfsgegevens</CardTitle>
          <CardDescription>Deze gegevens worden gebruikt op facturen en offertes</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label>Bedrijfsnaam</Label>
            <Input value={form.company_name} onChange={(e) => updateField("company_name", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Contactpersoon</Label>
              <Input value={form.contact_person} onChange={(e) => updateField("contact_person", e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>E-mail</Label>
              <Input type="email" value={form.email} onChange={(e) => updateField("email", e.target.value)} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Telefoon</Label>
            <Input value={form.phone} onChange={(e) => updateField("phone", e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>Straat</Label>
            <Input value={form.street} onChange={(e) => updateField("street", e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="grid gap-2">
              <Label>Postcode</Label>
              <Input value={form.postal_code} onChange={(e) => updateField("postal_code", e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Plaats</Label>
              <Input value={form.city} onChange={(e) => updateField("city", e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Land</Label>
              <Input value={form.country} onChange={(e) => updateField("country", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>KvK-nummer</Label>
              <Input value={form.kvk_number} onChange={(e) => updateField("kvk_number", e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>BTW-nummer</Label>
              <Input value={form.btw_number} onChange={(e) => updateField("btw_number", e.target.value)} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>IBAN</Label>
            <Input value={form.iban} onChange={(e) => updateField("iban", e.target.value)} />
          </div>
          <Button onClick={handleSave}>Opslaan</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Privégegevens</CardTitle>
          <CardDescription>Voor particuliere facturen (uitkering aan jezelf, vrijgesteld van BTW)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label>Naam</Label>
            <Input value={form.private_name} onChange={(e) => updateField("private_name", e.target.value)} placeholder="Voornaam Achternaam" />
          </div>
          <div className="grid gap-2">
            <Label>Straat</Label>
            <Input value={form.private_street} onChange={(e) => updateField("private_street", e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="grid gap-2">
              <Label>Postcode</Label>
              <Input value={form.private_postal_code} onChange={(e) => updateField("private_postal_code", e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Plaats</Label>
              <Input value={form.private_city} onChange={(e) => updateField("private_city", e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Land</Label>
              <Input value={form.private_country} onChange={(e) => updateField("private_country", e.target.value)} />
            </div>
          </div>
          <Button onClick={handleSave}>Opslaan</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Diensten</CardTitle>
          <CardDescription>Vaste bedragen om snel facturen mee te maken</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-end">
            <Button variant="outline" onClick={openNewService}>
              <Plus className="mr-2 h-4 w-4" />
              Dienst toevoegen
            </Button>
          </div>
          {services.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nog geen diensten.</p>
          ) : (
            <div className="overflow-x-auto border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Naam</TableHead>
                    <TableHead className="text-right">Bedrag</TableHead>
                    <TableHead className="w-24 text-right">Acties</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {services.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        €{Number(s.amount).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEditService(s)} title="Bewerken">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="text-destructive" onClick={() => deleteService(s.id)} title="Verwijderen">
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
                <DialogTitle>{svcEditId ? "Dienst bewerken" : "Nieuwe dienst"}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-2">
                <div className="grid gap-2">
                  <Label>Naam</Label>
                  <Input value={svcName} onChange={(e) => setSvcName(e.target.value)} placeholder="Bijv. Website onderhoud" />
                </div>
                <div className="grid gap-2">
                  <Label>Bedrag (excl. BTW)</Label>
                  <Input type="number" step="0.01" value={svcAmount} onChange={(e) => setSvcAmount(e.target.value)} placeholder="250.00" />
                </div>
                <Button onClick={saveService}>{svcEditId ? "Opslaan" : "Aanmaken"}</Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Wachtwoord wijzigen</CardTitle>
          <CardDescription>Wijzig je inlogwachtwoord voor deze account</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label>Huidig wachtwoord</Label>
            <Input
              type="password"
              autoComplete="current-password"
              value={passwordForm.current}
              onChange={(e) => setPasswordForm((p) => ({ ...p, current: e.target.value }))}
            />
          </div>
          <div className="grid gap-2">
            <Label>Nieuw wachtwoord</Label>
            <Input
              type="password"
              autoComplete="new-password"
              value={passwordForm.next}
              onChange={(e) => setPasswordForm((p) => ({ ...p, next: e.target.value }))}
            />
          </div>
          <div className="grid gap-2">
            <Label>Bevestig nieuw wachtwoord</Label>
            <Input
              type="password"
              autoComplete="new-password"
              value={passwordForm.confirm}
              onChange={(e) => setPasswordForm((p) => ({ ...p, confirm: e.target.value }))}
            />
          </div>
          <Button onClick={handleChangePassword} disabled={changingPassword}>
            {changingPassword ? "Bezig..." : "Wachtwoord opslaan"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Telegram</CardTitle>
          <CardDescription>Stuur een testbericht om je worker Telegram-melding te controleren</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleSendTelegramTest} disabled={sendingTelegramTest}>
              {sendingTelegramTest ? "Bezig..." : "Test Telegram bericht"}
            </Button>
            <Button variant="outline" onClick={handleSendUpcomingTelegramTest} disabled={sendingUpcomingTelegramTest}>
              {sendingUpcomingTelegramTest ? "Bezig..." : "Test komende betalingen"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
