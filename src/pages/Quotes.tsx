import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import type { Company, Quote } from "@/lib/db-types";
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
import { Plus, FileCheck, Trash2, Download, Pencil } from "lucide-react";
import { generateQuotePDF } from "@/lib/pdf";

interface QuoteLine {
  description: string;
  hours: string;
  hourly_rate: string;
  amount: string;
}

const statusColors: Record<string, string> = {
  concept: "bg-muted text-muted-foreground",
  verzonden: "bg-primary/10 text-primary",
  geaccepteerd: "bg-success/10 text-success",
  afgewezen: "bg-destructive/10 text-destructive",
};

export default function Quotes() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [quotes, setQuotes] = useState<(Quote & { companies: { name: string | null } | null })[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [open, setOpen] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState("");
  const [lines, setLines] = useState<QuoteLine[]>([{ description: "", hours: "", hourly_rate: "", amount: "" }]);
  const [notes, setNotes] = useState("");
  const [btwPercentage, setBtwPercentage] = useState("21");
  const [editOpen, setEditOpen] = useState(false);
  const [quoteToEdit, setQuoteToEdit] = useState<(Quote & { companies: { name: string | null } | null }) | null>(null);
  const [editQuoteNumber, setEditQuoteNumber] = useState("");
  const [editQuoteDate, setEditQuoteDate] = useState("");
  const [editValidUntil, setEditValidUntil] = useState("");
  const [editStatus, setEditStatus] = useState("concept");
  const [editNotes, setEditNotes] = useState("");

  const fetchData = async () => {
    const [quotesRes, companiesRes] = await Promise.all([api.getQuotes(), api.getCompanies()]);
    setQuotes(quotesRes);
    setCompanies(companiesRes);
  };

  useEffect(() => { if (user) fetchData(); }, [user]);

  const updateLine = (index: number, field: keyof QuoteLine, value: string) => {
    setLines((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      if (field === "hours" || field === "hourly_rate") {
        const h = parseFloat(updated[index].hours) || 0;
        const r = parseFloat(updated[index].hourly_rate) || 0;
        updated[index].amount = (h * r).toFixed(2);
      }
      return updated;
    });
  };

  const addLine = () => setLines((prev) => [...prev, { description: "", hours: "", hourly_rate: "", amount: "" }]);
  const removeLine = (i: number) => setLines((prev) => prev.filter((_, idx) => idx !== i));

  const handleCreate = async () => {
    if (!user || !selectedCompany || lines.length === 0) return;
    const subtotal = lines.reduce((sum, l) => sum + (parseFloat(l.amount) || 0), 0);
    const btw = parseFloat(btwPercentage);
    const btwAmount = subtotal * (btw / 100);
    const total = subtotal + btwAmount;

    const now = new Date();
    const count = quotes.filter((q) => q.quote_number.startsWith(`O${now.getFullYear()}`)).length + 1;
    const quoteNumber = `O${now.getFullYear()}-${String(count).padStart(4, "0")}`;

    try {
      const quote = await api.createQuote({
        company_id: selectedCompany,
        quote_number: quoteNumber,
        subtotal,
        btw_percentage: btw,
        btw_amount: btwAmount,
        total,
        notes: notes || null,
        valid_until: new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0],
      });

      const dbLines = lines.map((l) => ({
        quote_id: quote.id,
        description: l.description || "Werkzaamheden",
        hours: l.hours ? parseFloat(l.hours) : null,
        hourly_rate: l.hourly_rate ? parseFloat(l.hourly_rate) : null,
        amount: parseFloat(l.amount) || 0,
      }));
      await api.createQuoteLinesBatch(dbLines);

      setOpen(false);
      setSelectedCompany("");
      setLines([{ description: "", hours: "", hourly_rate: "", amount: "" }]);
      setNotes("");
      fetchData();
      toast({ title: "Offerte aangemaakt", description: quoteNumber });
    } catch (error: unknown) {
      toast({ title: "Fout", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    }
  };

  const handleDownloadPDF = async (quote: Quote & { companies: { name: string | null } | null }) => {
    const [linesRes, settingsRes, companyRes] = await Promise.all([
      api.getQuoteLines(quote.id),
      api.getBusinessSettings(),
      api.getCompany(quote.company_id),
    ]);
    await generateQuotePDF(quote, linesRes, settingsRes, companyRes);
  };

  const openEdit = (q: Quote & { companies: { name: string | null } | null }) => {
    setQuoteToEdit(q);
    setEditQuoteNumber(q.quote_number);
    setEditQuoteDate(q.quote_date);
    setEditValidUntil(q.valid_until ?? "");
    setEditStatus(q.status);
    setEditNotes(q.notes ?? "");
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!quoteToEdit) return;
    try {
      await api.updateQuote(quoteToEdit.id, {
        quote_number: editQuoteNumber.trim() || quoteToEdit.quote_number,
        quote_date: editQuoteDate,
        valid_until: editValidUntil ? editValidUntil : null,
        status: editStatus,
        notes: editNotes.trim() ? editNotes.trim() : null,
      });
      setEditOpen(false);
      setQuoteToEdit(null);
      await fetchData();
      toast({ title: "Offerte bijgewerkt" });
    } catch (e: unknown) {
      toast({ title: "Fout", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Offertes</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" />Offerte aanmaken</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Nieuwe offerte</DialogTitle>
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

              <div className="grid gap-2">
                <Label>Regels</Label>
                {lines.map((line, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-4">
                      <Input placeholder="Omschrijving" value={line.description} onChange={(e) => updateLine(i, "description", e.target.value)} />
                    </div>
                    <div className="col-span-2">
                      <Input type="number" placeholder="Uren" value={line.hours} onChange={(e) => updateLine(i, "hours", e.target.value)} />
                    </div>
                    <div className="col-span-2">
                      <Input type="number" placeholder="Tarief" value={line.hourly_rate} onChange={(e) => updateLine(i, "hourly_rate", e.target.value)} />
                    </div>
                    <div className="col-span-3">
                      <Input type="number" placeholder="Bedrag" value={line.amount} onChange={(e) => updateLine(i, "amount", e.target.value)} />
                    </div>
                    <div className="col-span-1">
                      {lines.length > 1 && (
                        <Button variant="ghost" size="icon" onClick={() => removeLine(i)}><Trash2 className="h-3 w-3" /></Button>
                      )}
                    </div>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={addLine}><Plus className="mr-1 h-3 w-3" />Regel toevoegen</Button>
              </div>

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
              <Button onClick={handleCreate}>Offerte aanmaken</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {quotes.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <FileCheck className="h-12 w-12 mb-4" />
            <p>Nog geen offertes</p>
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
                <TableHead className="w-20 text-right">Acties</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {quotes.map((quote) => (
                <TableRow key={quote.id}>
                  <TableCell className="font-medium">{quote.quote_number}</TableCell>
                  <TableCell>{quote.companies?.name}</TableCell>
                  <TableCell>{new Date(quote.quote_date).toLocaleDateString("nl-NL")}</TableCell>
                  <TableCell>€{Number(quote.total).toLocaleString("nl-NL", { minimumFractionDigits: 2 })}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={statusColors[quote.status]}>{quote.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(quote)} title="Bewerken">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDownloadPDF(quote)} title="PDF downloaden">
                        <Download className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Dialog open={editOpen} onOpenChange={(v) => { setEditOpen(v); if (!v) setQuoteToEdit(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Offerte bewerken</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Offertenummer</Label>
              <Input value={editQuoteNumber} onChange={(e) => setEditQuoteNumber(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Offertedatum</Label>
                <Input type="date" value={editQuoteDate} onChange={(e) => setEditQuoteDate(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label>Geldig t/m</Label>
                <Input type="date" value={editValidUntil} onChange={(e) => setEditValidUntil(e.target.value)} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Status</Label>
              <Select value={editStatus} onValueChange={setEditStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="concept">concept</SelectItem>
                  <SelectItem value="verzonden">verzonden</SelectItem>
                  <SelectItem value="geaccepteerd">geaccepteerd</SelectItem>
                  <SelectItem value="afgewezen">afgewezen</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Notities</Label>
              <Textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} />
            </div>
            <Button onClick={handleSaveEdit}>Opslaan</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
