import { useEffect, useState } from "react";
import { useOpenOnNew } from "@/hooks/use-open-on-new";
import { useTaxSettings } from "@/lib/tax";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import type { Company, TimeEntry } from "@/lib/db-types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Clock, WandSparkles } from "lucide-react";

export default function TimeEntries() {
  const { currencySymbol: cs } = useTaxSettings();
  const { user } = useAuth();
  const { toast } = useToast();
  const [entries, setEntries] = useState<(TimeEntry & { companies: Company | null })[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [open, setOpen] = useState(false);
  useOpenOnNew(setOpen);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ company_id: "", date: new Date().toISOString().split("T")[0], hours: "", description: "", hourly_rate: "" });
  const [improvingDescription, setImprovingDescription] = useState(false);

  const fetchData = async () => {
    const [entriesRes, companiesRes] = await Promise.all([
      api.getTimeEntries(),
      api.getCompanies(),
    ]);
    setEntries(entriesRes);
    setCompanies(companiesRes);
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
    };
    try {
      if (editId) {
        await api.updateTimeEntry(editId, data);
      } else {
        await api.createTimeEntry(data);
      }
      setOpen(false);
      resetForm();
      fetchData();
      toast({ title: editId ? "Time entry updated" : "Time entry added" });
    } catch (error: unknown) {
      toast({ title: "Error", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    }
  };

  const resetForm = () => {
    setForm({ company_id: "", date: new Date().toISOString().split("T")[0], hours: "", description: "", hourly_rate: "" });
    setEditId(null);
  };

  const handleEdit = (entry: TimeEntry & { companies: Company | null }) => {
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
    if (!confirm("Delete this item?")) return;
    await api.deleteTimeEntry(id);
    fetchData();
  };

  const handleImproveDescription = async () => {
    const text = form.description.trim();
    if (!text) {
      toast({
        title: "Nothing to improve",
        description: "Enter a description of the work first.",
        variant: "destructive",
      });
      return;
    }
    setImprovingDescription(true);
    try {
      const res = await api.improveGrammar(text);
      setForm((p) => ({ ...p, description: res.text }));
      toast({ title: "Text improved" });
    } catch (error: unknown) {
      toast({ title: "AI improvement failed", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    } finally {
      setImprovingDescription(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Time tracking</h1>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" />Log time</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editId ? "Edit time entry" : "Log time"}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>Company *</Label>
                <Select value={form.company_id} onValueChange={(v) => setForm((p) => ({ ...p, company_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select company" /></SelectTrigger>
                  <SelectContent>
                    {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name || c.contact_person || "Client"}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Date *</Label>
                  <Input type="date" value={form.date} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))} />
                </div>
                <div className="grid gap-2">
                  <Label>Hours *</Label>
                  <Input type="number" step="0.25" value={form.hours} onChange={(e) => setForm((p) => ({ ...p, hours: e.target.value }))} />
                </div>
              </div>
              <div className="grid gap-2">
                <div className="flex items-center justify-between gap-3">
                  <Label>Description</Label>
                  <Button type="button" variant="outline" size="sm" onClick={handleImproveDescription} disabled={improvingDescription}>
                    <WandSparkles className="mr-2 h-4 w-4" />
                    {improvingDescription ? "Improving…" : "Improve with AI"}
                  </Button>
                </div>
                <Textarea value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>Custom hourly rate</Label>
                <Input type="number" step="0.01" value={form.hourly_rate} onChange={(e) => setForm((p) => ({ ...p, hourly_rate: e.target.value }))} placeholder="Empty = default rate" />
              </div>
              <Button onClick={handleSave}>{editId ? "Save" : "Add"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {entries.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Clock className="h-12 w-12 mb-4" />
            <p>No time logged yet</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Hours</TableHead>
                <TableHead className="hidden md:table-cell">Description</TableHead>
                <TableHead>Rate</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>{new Date(entry.date).toLocaleDateString(undefined)}</TableCell>
                  <TableCell>{entry.companies?.name || entry.companies?.contact_person || "Client"}</TableCell>
                  <TableCell>{Number(entry.hours).toFixed(2)}</TableCell>
                  <TableCell className="hidden md:table-cell max-w-xs truncate">{entry.description}</TableCell>
                  <TableCell>{entry.hourly_rate ? `${cs}${Number(entry.hourly_rate).toFixed(2)}` : "-"}</TableCell>
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
