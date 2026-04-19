import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import type { Company, DebtSettlement, TimeEntry } from "@/lib/db-types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Scale } from "lucide-react";

type TimeRow = TimeEntry & { companies: Company | null };

function money(n: number): string {
  return `€${n.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function lineAmount(row: TimeRow, defaultRate: number): number {
  const rate = row.hourly_rate != null ? Number(row.hourly_rate) : defaultRate;
  return Number(row.hours) * rate;
}

export default function DebtSettlementPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [history, setHistory] = useState<DebtSettlement[]>([]);
  const [companyId, setCompanyId] = useState<string>("");
  const [entries, setEntries] = useState<TimeRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const selectedCompany = useMemo(() => companies.find((c) => c.id === companyId), [companies, companyId]);
  const defaultRate = Number(selectedCompany?.default_hourly_rate ?? 0);
  const debt = Math.max(0, Number(selectedCompany?.debt_to_client ?? 0));

  const loadLists = useCallback(async () => {
    const [c, h] = await Promise.all([api.getCompanies(), api.getDebtSettlements()]);
    setCompanies(c);
    setHistory(h);
  }, []);

  const loadEntries = useCallback(async () => {
    if (!companyId) {
      setEntries([]);
      return;
    }
    const rows = await api.getTimeEntries({ company_id: companyId, invoiced: false });
    setEntries(rows as TimeRow[]);
  }, [companyId]);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    loadLists()
      .catch(() => toast({ title: "Laden mislukt", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [user, loadLists, toast]);

  useEffect(() => {
    if (!user || !companyId) return;
    loadEntries().catch(() => toast({ title: "Uren laden mislukt", variant: "destructive" }));
  }, [user, companyId, loadEntries, toast]);

  const selectedTotal = useMemo(() => {
    let t = 0;
    for (const row of entries) {
      if (selected.has(row.id)) t += lineAmount(row, defaultRate);
    }
    return Number(t.toFixed(2));
  }, [entries, selected, defaultRate]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!companyId || selected.size === 0) return;
    if (selectedTotal > debt + 1e-6) {
      toast({
        title: "Te hoog bedrag",
        description: `Selectie (${money(selectedTotal)}) is hoger dan openstaande schuld (${money(debt)}).`,
        variant: "destructive",
      });
      return;
    }
    setSubmitting(true);
    try {
      await api.createDebtSettlement({
        company_id: companyId,
        time_entry_ids: [...selected],
        notes: notes.trim() || null,
      });
      toast({ title: "Schuld verrekend", description: `${money(selectedTotal)} verrekend met openstaande schuld.` });
      setSelected(new Set());
      setNotes("");
      await loadLists();
      await loadEntries();
    } catch (e: unknown) {
      toast({
        title: "Verrekenen mislukt",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Scale className="h-7 w-7 text-muted-foreground" />
        <h1 className="text-2xl font-semibold">Schuldverrekening</h1>
      </div>
      <p className="text-sm text-muted-foreground max-w-2xl">
        Verreken openstaande schuld aan een klant met niet-gefactureerde uren. Die uren zijn daarna verbruikt en komen niet meer op een normale factuur. Stel de schuld in bij{" "}
        <span className="text-foreground font-medium">Bedrijven</span>.
      </p>

      {loading ? (
        <Card>
          <CardContent className="py-10 flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Laden…
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Nieuwe verrekening</CardTitle>
              <CardDescription>Kies een klant en selecteer uren. Het totaal mag de restschuld niet overschrijden.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2 max-w-md">
                <Label>Klant</Label>
                <Select
                  value={companyId || undefined}
                  onValueChange={(v) => {
                    setCompanyId(v);
                    setSelected(new Set());
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Kies een bedrijf" />
                  </SelectTrigger>
                  <SelectContent>
                    {companies.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {companyId && selectedCompany && (
                <div className="rounded-lg border bg-muted/40 px-4 py-3 text-sm">
                  <p>
                    Openstaande schuld: <span className="font-semibold text-foreground">{money(debt)}</span>
                  </p>
                  <p className="text-muted-foreground mt-1">
                    Selectie: {money(selectedTotal)}
                    {selectedTotal > debt && <span className="text-destructive ml-2">(te hoog)</span>}
                  </p>
                </div>
              )}

              {companyId && (
                <>
                  {entries.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Geen vrije uren voor dit bedrijf (niet gefactureerd, niet al verrekend).</p>
                  ) : (
                    <div className="rounded-md border overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-10">
                              <Checkbox
                                checked={entries.length > 0 && selected.size === entries.length}
                                onCheckedChange={(c) => {
                                  if (c === true) setSelected(new Set(entries.map((e) => e.id)));
                                  else setSelected(new Set());
                                }}
                                aria-label="Alles selecteren"
                              />
                            </TableHead>
                            <TableHead>Datum</TableHead>
                            <TableHead>Uren</TableHead>
                            <TableHead>Tarief</TableHead>
                            <TableHead className="text-right">Bedrag</TableHead>
                            <TableHead>Omschrijving</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {entries.map((row) => {
                            const amt = lineAmount(row, defaultRate);
                            return (
                              <TableRow key={row.id}>
                                <TableCell>
                                  <Checkbox checked={selected.has(row.id)} onCheckedChange={() => toggle(row.id)} aria-label="Selecteer regel" />
                                </TableCell>
                                <TableCell>{row.date}</TableCell>
                                <TableCell>{Number(row.hours).toLocaleString("nl-NL")}</TableCell>
                                <TableCell>{money(row.hourly_rate != null ? Number(row.hourly_rate) : defaultRate)}/u</TableCell>
                                <TableCell className="text-right font-medium">{money(amt)}</TableCell>
                                <TableCell className="max-w-[200px] truncate text-muted-foreground">{row.description ?? "—"}</TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}

                  <div className="grid gap-2 max-w-xl">
                    <Label htmlFor="debt-notes">Notities (optioneel)</Label>
                    <Textarea id="debt-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Interne toelichting bij deze verrekening" />
                  </div>

                  <Button
                    disabled={!companyId || selected.size === 0 || selectedTotal > debt + 1e-6 || submitting}
                    onClick={handleSubmit}
                  >
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Verrekenen
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Historiek</CardTitle>
              <CardDescription>Recente schuldverrekeningen</CardDescription>
            </CardHeader>
            <CardContent>
              {history.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nog geen verrekeningen.</p>
              ) : (
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Datum</TableHead>
                        <TableHead>Klant</TableHead>
                        <TableHead className="text-right">Bedrag</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {history.map((h) => (
                        <TableRow key={h.id}>
                          <TableCell>{new Date(h.created_at).toLocaleString("nl-NL")}</TableCell>
                          <TableCell>{h.company_name ?? "—"}</TableCell>
                          <TableCell className="text-right font-medium">{money(Number(h.total_amount))}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
