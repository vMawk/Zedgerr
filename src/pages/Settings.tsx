import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

export default function Settings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [form, setForm] = useState({
    company_name: "", contact_person: "", email: "", phone: "",
    street: "", postal_code: "", city: "", country: "Nederland",
    kvk_number: "", btw_number: "", iban: "",
  });
  const [existingId, setExistingId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from("business_settings").select("*").single().then(({ data }) => {
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
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    try {
      if (existingId) {
        const { error } = await supabase.from("business_settings").update(form).eq("id", existingId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("business_settings").insert({ ...form, user_id: user.id }).select().single();
        if (error) throw error;
        if (data) setExistingId(data.id);
      }
      toast({ title: "Instellingen opgeslagen" });
    } catch (error: any) {
      toast({ title: "Fout", description: error.message, variant: "destructive" });
    }
  };

  const updateField = (field: string, value: string) => setForm((prev) => ({ ...prev, [field]: value }));

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
    </div>
  );
}
