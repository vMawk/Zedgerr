import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, FileText, Download } from "lucide-react";
import { generateInvoicePDF } from "@/lib/pdf";
import type { Database } from "@/integrations/supabase/types";

type Invoice = Database["public"]["Tables"]["invoices"]["Row"];
type Company = Database["public"]["Tables"]["companies"]["Row"];
type TimeEntry = Database["public"]["Tables"]["time_entries"]["Row"];

const statusColors: Record<string, string> = {
  concept: "bg-muted text-muted-foreground",
  verzonden: "bg-primary/10 text-primary",
  betaald: "bg-success/10 text-success",
  vervallen: "bg-destructive/10 text-destructive",
};

export default function Invoices() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [invoices, setInvoices] = useState<(Invoice & { companies: { name: string } | null })[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [open, setOpen] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState("");
  const [uninvoicedEntries, setUninvoicedEntries] = useState<(TimeEntry & { companies: Company | null })[]>([]);
  const [selectedEntries, setSelectedEntries] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [btwPercentage, setBtwPercentage] = useState("21");

  const fetchData = async () => {
    const [invoicesRes, companiesRes] = await Promise.all([
      supabase.from("invoices").select("*, companies(name)").order("created_at", { ascending: false }),
      supabase.from("companies").select("*").order("name"),
    ]);
    if (invoicesRes.data) setInvoices(invoicesRes.data as any);
    if (companiesRes.data) setCompanies(companiesRes.data);
  };

  useEffect(() => { if (user) fetchData(); }, [user]);

  useEffect(() => {
    if (!selectedCompany) { setUninvoicedEntries([]); return; }
    supabase.from("time_entries").select("*, companies(*)").eq("company_id", selectedCompany).eq("invoiced", false).order("date")
      .then(({ data }) => { if (data) setUninvoicedEntries(data as any); });
  }, [selectedCompany]);

  const generateInvoiceNumber = () => {
    const now = new Date();
    const year = now.getFullYear();
    const count = invoices.filter((i) => i.invoice_number.startsWith(`F${year}`)).length + 1;
    return `F${year}-${String(count).padStart(4, "0")}`;
  };

  const handleCreate = async () => {
    if (!user || !selectedCompany || selectedEntries.length === 0) return;
    const company = companies.find((c) => c.id === selectedCompany);
    if (!company) return;

    const entries = uninvoicedEntries.filter((e) => selectedEntries.includes(e.id));
    const subtotal = entries.reduce((sum, e) => {
      const rate = e.hourly_rate ?? company.default_hourly_rate ?? 0;
      return sum + Number(e.hours) * Number(rate);
    }, 0);
    const btw = parseFloat(btwPercentage);
    const btwAmount = subtotal * (btw / 100);
    const total = subtotal + btwAmount;
    const invoiceNumber = generateInvoiceNumber();

    try {
      const { data: invoice, error } = await supabase.from("invoices").insert({
        user_id: user.id, company_id: selectedCompany, invoice_number: invoiceNumber,
        subtotal, btw_percentage: btw, btw_amount: btwAmount, total, notes: notes || null,
        due_date: new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0],
      }).select().single();
      if (error) throw error;

      const lines = entries.map((e) => ({
        invoice_id: invoice.id,
        description: e.description || "Werkzaamheden",
        date: e.date,
        hours: e.hours,
        hourly_rate: e.hourly_rate ?? company.default_hourly_rate ?? 0,
        amount: Number(e.hours) * Number(e.hourly_rate ?? company.default_hourly_rate ?? 0),
        time_entry_id: e.id,
      }));
      await supabase.from("invoice_lines").insert(lines);
      await supabase.from("time_entries").update({ invoiced: true, invoice_id: invoice.id }).in("id", selectedEntries);

      setOpen(false);
      setSelectedCompany("");
      setSelectedEntries([]);
      setNotes("");
      fetchData();
      toast({ title: "Factuur aangemaakt", description: invoiceNumber });
    } catch (error: any) {
      toast({ title: "Fout", description: error.message, variant: "destructive" });
    }
  };

  const handleDownloadPDF = async (invoice: Invoice & { companies: { name: string } | null }) => {
    const [linesRes, settingsRes, companyRes] = await Promise.all([
      supabase.from("invoice_lines").select("*").eq("invoice_id", invoice.id).order("date"),
      supabase.from("business_settings").select("*").single(),
      supabase.from("companies").select("*").eq("id", invoice.company_id).single(),
    ]);
    generateInvoicePDF(invoice, linesRes.data || [], settingsRes.data, companyRes.data);
  };

  const toggleEntry = (id: string) => {
    setSelectedEntries((prev) => prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Facturen</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" />Factuur aanmaken</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Nieuwe factuur</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>Bedrijf</Label>
                <Select value={selectedCompany} onValueChange={setSelectedCompany}>
                  <SelectTrigger><SelectValue placeholder="Selecteer bedrijf" /></SelectTrigger>
                  <SelectContent>
                    {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {uninvoicedEntries.length > 0 && (
                <div className="grid gap-2">
                  <Label>Selecteer uren</Label>
                  <div className="border rounded-md max-h-48 overflow-y-auto">
                    {uninvoicedEntries.map((entry) => (
                      <label key={entry.id} className="flex items-center gap-3 px-3 py-2 hover:bg-muted/50 cursor-pointer">
                        <input type="checkbox" checked={selectedEntries.includes(entry.id)} onChange={() => toggleEntry(entry.id)} className="rounded" />
                        <span className="text-sm">{new Date(entry.date).toLocaleDateString("nl-NL")}</span>
                        <span className="text-sm text-muted-foreground flex-1 truncate">{entry.description}</span>
                        <span className="text-sm font-medium">{Number(entry.hours).toFixed(2)}u</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>BTW-percentage</Label>
                  <Input type="number" value={btwPercentage} onChange={(e) => setBtwPercentage(e.target.value)} />
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Notities</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
              <Button onClick={handleCreate} disabled={selectedEntries.length === 0}>Factuur aanmaken</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {invoices.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <FileText className="h-12 w-12 mb-4" />
            <p>Nog geen facturen</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nummer</TableHead>
                <TableHead>Bedrijf</TableHead>
                <TableHead>Datum</TableHead>
                <TableHead>Totaal</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell className="font-medium">{invoice.invoice_number}</TableCell>
                  <TableCell>{invoice.companies?.name}</TableCell>
                  <TableCell>{new Date(invoice.invoice_date).toLocaleDateString("nl-NL")}</TableCell>
                  <TableCell>€{Number(invoice.total).toLocaleString("nl-NL", { minimumFractionDigits: 2 })}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={statusColors[invoice.status]}>{invoice.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => handleDownloadPDF(invoice)}>
                      <Download className="h-4 w-4" />
                    </Button>
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
