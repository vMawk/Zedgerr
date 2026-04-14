import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Clock } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type TimeEntry = Database["public"]["Tables"]["time_entries"]["Row"];
type Company = Database["public"]["Tables"]["companies"]["Row"];

export default function TimeEntries() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [entries, setEntries] = useState<(TimeEntry & { companies: { name: string } | null })[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ company_id: "", date: new Date().toISOString().split("T")[0], hours: "", description: "", hourly_rate: "" });

  const fetchData = async () => {
    const [entriesRes, companiesRes] = await Promise.all([
      supabase.from("time_entries").select("*, companies(name)").order("date", { ascending: false }),
      supabase.from("companies").select("*").order("name"),
    ]);
    if (entriesRes.data) setEntries(entriesRes.data as any);
    if (companiesRes.data) setCompanies(companiesRes.data);
  };

  useEffect(() => { if (user) fetchData(); }, [user]);

  const handleSave = async () => {
    if (!user || !form.company_id || !form.hours) return;
    const data = {
      company_id: form.company_id,
      date: form.date,
      hours: parseFloat(form.hours),
      description: form.description || null,
      hourly_rate: form.hourly_rate ? parseFloat(form.hourly_rate) : null,
      user_id: user.id,
    };
    try {
      if (editId) {
        const { error } = await supabase.from("time_entries").update(data).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("time_entries").insert(data);
        if (error) throw error;
      }
      setOpen(false);
      resetForm();
      fetchData();
      toast({ title: editId ? "Uren bijgewerkt" : "Uren toegevoegd" });
    } catch (error: any) {
      toast({ title: "Fout", description: error.message, variant: "destructive" });
    }
  };

  const resetForm = () => {
    setForm({ company_id: "", date: new Date().toISOString().split("T")[0], hours: "", description: "", hourly_rate: "" });
    setEditId(null);
  };

  const handleEdit = (entry: TimeEntry) => {
    setForm({
      company_id: entry.company_id,
      date: entry.date,
      hours: String(entry.hours),
      description: entry.description || "",
      hourly_rate: entry.hourly_rate ? String(entry.hourly_rate) : "",
    });
    setEditId(entry.id);
    setOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Verwijderen?")) return;
    await supabase.from("time_entries").delete().eq("id", id);
    fetchData();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Urenregistratie</h1>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" />Uren toevoegen</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editId ? "Uren bewerken" : "Uren registreren"}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>Bedrijf *</Label>
                <Select value={form.company_id} onValueChange={(v) => setForm((p) => ({ ...p, company_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecteer bedrijf" /></SelectTrigger>
                  <SelectContent>
                    {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Datum *</Label>
                  <Input type="date" value={form.date} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))} />
                </div>
                <div className="grid gap-2">
                  <Label>Uren *</Label>
                  <Input type="number" step="0.25" value={form.hours} onChange={(e) => setForm((p) => ({ ...p, hours: e.target.value }))} />
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Werkzaamheden</Label>
                <Textarea value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>Afwijkend uurtarief (€)</Label>
                <Input type="number" step="0.01" value={form.hourly_rate} onChange={(e) => setForm((p) => ({ ...p, hourly_rate: e.target.value }))} placeholder="Leeg = standaardtarief" />
              </div>
              <Button onClick={handleSave}>{editId ? "Opslaan" : "Toevoegen"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {entries.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Clock className="h-12 w-12 mb-4" />
            <p>Nog geen uren geregistreerd</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Datum</TableHead>
                <TableHead>Bedrijf</TableHead>
                <TableHead>Uren</TableHead>
                <TableHead className="hidden md:table-cell">Werkzaamheden</TableHead>
                <TableHead>Tarief</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>{new Date(entry.date).toLocaleDateString("nl-NL")}</TableCell>
                  <TableCell>{entry.companies?.name}</TableCell>
                  <TableCell>{Number(entry.hours).toFixed(2)}</TableCell>
                  <TableCell className="hidden md:table-cell max-w-xs truncate">{entry.description}</TableCell>
                  <TableCell>{entry.hourly_rate ? `€${Number(entry.hourly_rate).toFixed(2)}` : "-"}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(entry)}><Pencil className="h-3 w-3" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(entry.id)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
