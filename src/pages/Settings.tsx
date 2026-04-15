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
  });
  const [existingId, setExistingId] = useState<string | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [svcOpen, setSvcOpen] = useState(false);
  const [svcEditId, setSvcEditId] = useState<string | null>(null);
  const [svcName, setSvcName] = useState("");
  const [svcAmount, setSvcAmount] = useState("");

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
    </div>
  );
}
