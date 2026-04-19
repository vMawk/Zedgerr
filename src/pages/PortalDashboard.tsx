import { useEffect, useMemo, useState } from "react";
import { usePortalAuth } from "@/lib/portal-auth";
import {
  portalChangePassword,
  portalFetchDashboard,
  portalFetchInvoicePdfData,
  portalFetchMe,
  type PortalDashboard,
} from "@/lib/portal-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import { LogOut, Clock, FileText, Download, Scale, Settings, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { generateInvoicePDF } from "@/lib/pdf";

function money(n: number): string {
  return `€${n.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString("nl-NL", { month: "short", year: "numeric" });
}

function invoiceStatusLabel(status: string): string {
  const m: Record<string, string> = {
    concept: "Concept",
    verzonden: "Open / verzonden",
    betaald: "Betaald",
    vervallen: "Gesplitst",
  };
  return m[status] ?? status;
}

type TimeRow = PortalDashboard["timeEntries"][number];
type SettlementRow = PortalDashboard["debtSettlements"][number];

function PortalSettingsPanel() {
  const { toast } = useToast();
  const [portalEmail, setPortalEmail] = useState<string | null>(null);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    portalFetchMe()
      .then((r) => setPortalEmail(r.portal_email))
      .catch(() => setPortalEmail(null));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPw.length < 6) {
      toast({ title: "Nieuw wachtwoord te kort", description: "Minimaal 6 tekens.", variant: "destructive" });
      return;
    }
    if (newPw !== confirmPw) {
      toast({ title: "Wachtwoorden komen niet overeen", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await portalChangePassword(currentPw, newPw);
      toast({ title: "Wachtwoord bijgewerkt", description: "Je kunt voortaan met het nieuwe wachtwoord inloggen." });
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
    } catch (err: unknown) {
      toast({
        title: "Mislukt",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Settings className="h-5 w-5 text-muted-foreground" />
          Account
        </CardTitle>
        <CardDescription>Wijzig het wachtwoord voor uw klantenportaal.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {portalEmail && (
            <div className="space-y-1">
              <Label className="text-muted-foreground">Inlog-e-mail</Label>
              <p className="text-sm font-medium">{portalEmail}</p>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="portal-current-pw">Huidig wachtwoord</Label>
            <Input
              id="portal-current-pw"
              type="password"
              autoComplete="current-password"
              value={currentPw}
              onChange={(e) => setCurrentPw(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="portal-new-pw">Nieuw wachtwoord</Label>
            <Input
              id="portal-new-pw"
              type="password"
              autoComplete="new-password"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              required
              minLength={6}
            />
            <p className="text-xs text-muted-foreground">Minimaal 6 tekens.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="portal-confirm-pw">Nieuw wachtwoord bevestigen</Label>
            <Input
              id="portal-confirm-pw"
              type="password"
              autoComplete="new-password"
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              required
              minLength={6}
            />
          </div>
          <Button type="submit" disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Wachtwoord opslaan
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

/** Lage, rustige staafjes per maand — alleen ter indicatie. */
function SubtleHoursTrend({ entries }: { entries: TimeRow[] }) {
  const data = useMemo(() => {
    const byMonth = new Map<string, number>();
    for (const row of entries) {
      const key = row.date.slice(0, 7);
      byMonth.set(key, (byMonth.get(key) ?? 0) + Number(row.hours));
    }
    return [...byMonth.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, hours]) => ({ key: month, label: monthLabel(month), value: hours }));
  }, [entries]);

  if (data.length === 0) return null;
  const max = Math.max(...data.map((d) => d.value), 0.01);

  return (
    <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-3">
      <p className="text-xs text-muted-foreground mb-3">Verdeling van uren over de maanden heen</p>
      <div className="flex h-11 items-end gap-px sm:gap-0.5">
        {data.map((d) => (
          <div
            key={d.key}
            className="flex min-h-0 min-w-0 flex-1 flex-col items-stretch justify-end gap-1.5"
            title={`${d.label}: ${d.value.toLocaleString("nl-NL", { maximumFractionDigits: 2 })} uur`}
          >
            <div className="flex h-10 w-full flex-col justify-end">
              <div
                className="w-full rounded-[2px] bg-foreground/10 transition-[height]"
                style={{ height: `${Math.max(8, (d.value / max) * 100)}%` }}
              />
            </div>
            <span className="block truncate text-center text-[10px] leading-none text-muted-foreground sm:text-[11px]">
              {d.label.replace(" ", "\u00a0")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SubtleSettlementTrend({ settlements }: { settlements: SettlementRow[] }) {
  const data = useMemo(() => {
    const byMonth = new Map<string, number>();
    for (const s of settlements) {
      const key = s.createdAt.slice(0, 7);
      byMonth.set(key, (byMonth.get(key) ?? 0) + s.totalAmount);
    }
    return [...byMonth.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, amount]) => ({ key: month, label: monthLabel(month), value: amount }));
  }, [settlements]);

  if (data.length === 0) return null;
  const max = Math.max(...data.map((d) => d.value), 0.01);

  return (
    <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-3">
      <p className="text-xs text-muted-foreground mb-3">Verrekende bedragen per maand</p>
      <div className="flex h-11 items-end gap-px sm:gap-0.5">
        {data.map((d) => (
          <div
            key={d.key}
            className="flex min-h-0 min-w-0 flex-1 flex-col items-stretch justify-end gap-1.5"
            title={`${d.label}: ${money(d.value)}`}
          >
            <div className="flex h-10 w-full flex-col justify-end">
              <div
                className="w-full rounded-[2px] bg-foreground/10 transition-[height]"
                style={{ height: `${Math.max(8, (d.value / max) * 100)}%` }}
              />
            </div>
            <span className="block truncate text-center text-[10px] leading-none text-muted-foreground sm:text-[11px]">
              {d.label.replace(" ", "\u00a0")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PortalHoursBlock({ entries }: { entries: TimeRow[] }) {
  const sumHours = useMemo(() => entries.reduce((s, r) => s + Number(r.hours), 0), [entries]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{sumHours.toLocaleString("nl-NL", { maximumFractionDigits: 2 })}</span> uur in{" "}
        <span className="font-medium text-foreground">{entries.length}</span> regel{entries.length === 1 ? "" : "s"}
      </p>

      <SubtleHoursTrend entries={entries} />

      <div className="rounded-md border overflow-x-auto">
        {entries.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">Nog geen uren geregistreerd.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Datum</TableHead>
                <TableHead className="text-right">Uren</TableHead>
                <TableHead>Omschrijving / dienst</TableHead>
                <TableHead className="w-[150px]">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap">{row.date}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {Number(row.hours).toLocaleString("nl-NL", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell className="text-muted-foreground max-w-[min(480px,55vw)]">{row.description ?? "—"}</TableCell>
                  <TableCell>
                    {row.settledAgainstDebt ? (
                      <Badge variant="secondary" className="font-normal">
                        Verrekend met schuld
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}

function PortalSettlementsBlock({ settlements }: { settlements: SettlementRow[] }) {
  const totalVerrekend = useMemo(() => settlements.reduce((s, x) => s + x.totalAmount, 0), [settlements]);
  const totalUrenVerrekend = useMemo(
    () =>
      settlements.reduce((s, x) => s + (x.totalHours ?? x.lines?.reduce((a, l) => a + l.hours, 0) ?? 0), 0),
    [settlements],
  );

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Totaal verrekend: <span className="font-medium text-foreground">{money(totalVerrekend)}</span>
        {" · "}
        <span className="font-medium text-foreground">{totalUrenVerrekend.toLocaleString("nl-NL", { maximumFractionDigits: 2 })}</span> uur
        {" · "}
        {settlements.length} verrekening{settlements.length === 1 ? "" : "en"}
      </p>

      <SubtleSettlementTrend settlements={settlements} />

      {settlements.length === 0 ? (
        <p className="text-sm text-muted-foreground py-1">Nog geen schuldverrekeningen.</p>
      ) : (
        <Accordion type="multiple" className="space-y-2 w-full">
          {settlements.map((s) => (
            <AccordionItem key={s.id} value={s.id} className="border rounded-lg px-3 bg-muted/20">
              <AccordionTrigger className="text-sm hover:no-underline py-3 [&[data-state=open]>svg]:rotate-180">
                <div className="flex flex-1 flex-col gap-1 text-left sm:flex-row sm:items-center sm:justify-between sm:gap-4 pr-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{new Date(s.createdAt).toLocaleString("nl-NL")}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                    <span className="tabular-nums font-semibold text-foreground">{money(s.totalAmount)}</span>
                    <span className="text-muted-foreground">
                      {(s.totalHours ?? s.lines?.reduce((a, l) => a + l.hours, 0) ?? 0).toLocaleString("nl-NL", {
                        maximumFractionDigits: 2,
                      })}{" "}
                      uur
                    </span>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3 border-t pt-3">
                  {s.notes?.trim() ? (
                    <p className="text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">Toelichting: </span>
                      {s.notes.trim()}
                    </p>
                  ) : null}
                  <div className="rounded-md border overflow-x-auto bg-background">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Datum</TableHead>
                          <TableHead className="text-right">Uren</TableHead>
                          <TableHead>Uitgevoerde diensten / werk</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(s.lines ?? []).length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={3} className="text-muted-foreground">
                              Geen regels gekoppeld (alleen totaal bekend).
                            </TableCell>
                          </TableRow>
                        ) : (
                          (s.lines ?? []).map((line) => (
                            <TableRow key={line.id}>
                              <TableCell className="whitespace-nowrap">{line.date}</TableCell>
                              <TableCell className="text-right tabular-nums">
                                {line.hours.toLocaleString("nl-NL", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                              </TableCell>
                              <TableCell className="text-muted-foreground">{line.description ?? "—"}</TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </div>
  );
}

export default function PortalDashboard() {
  const { company, signOut } = usePortalAuth();
  const { toast } = useToast();
  const [data, setData] = useState<PortalDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    portalFetchDashboard()
      .then(setData)
      .catch((e: unknown) => {
        toast({
          title: "Fout",
          description: e instanceof Error ? e.message : String(e),
          variant: "destructive",
        });
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- eenmalig laden
  }, []);

  const handleDownloadInvoice = async (invoiceId: string) => {
    setDownloadingId(invoiceId);
    try {
      const d = await portalFetchInvoicePdfData(invoiceId);
      await generateInvoicePDF(d.invoice, d.lines, d.settings, d.company);
    } catch (e: unknown) {
      toast({ title: "Fout", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
          <div className="flex items-center gap-3">
            <img src="/gibby-logo.png" alt="" className="h-8 w-auto" />
            <div>
              <p className="font-semibold">Klantenportaal</p>
              <p className="text-sm text-muted-foreground">{company?.name}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={signOut}>
            <LogOut className="mr-2 h-4 w-4" />
            Uitloggen
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <Tabs defaultValue="overview" className="w-full space-y-6">
          <TabsList>
            <TabsTrigger value="overview">Overzicht</TabsTrigger>
            <TabsTrigger value="settings">Instellingen</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6 mt-0">
            {loading && <p className="text-muted-foreground">Laden…</p>}
            {!loading && data && (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Card className="border-primary/15 shadow-sm">
                    <CardHeader className="flex flex-row items-center gap-2 pb-2">
                      <Clock className="h-5 w-5 text-primary" />
                      <CardTitle className="text-lg">Totaal uren</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-3xl font-semibold tabular-nums tracking-tight">
                        {data.totalHours.toLocaleString("nl-NL", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                      </p>
                      <CardDescription className="mt-1">Alle geregistreerde uren (historisch)</CardDescription>
                    </CardContent>
                  </Card>
                  <Card className="border-primary/15 shadow-sm">
                    <CardHeader className="flex flex-row items-center gap-2 pb-2">
                      <FileText className="h-5 w-5 text-primary" />
                      <CardTitle className="text-lg">Facturen</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-3xl font-semibold tabular-nums tracking-tight">{data.invoices.length}</p>
                      <CardDescription className="mt-1">Openstaand en betaald</CardDescription>
                    </CardContent>
                  </Card>
                  <Card className="border-amber-500/20 shadow-sm sm:col-span-2 lg:col-span-1 bg-gradient-to-br from-card to-amber-500/5">
                    <CardHeader className="flex flex-row items-center gap-2 pb-2">
                      <Scale className="h-5 w-5 text-amber-700 dark:text-amber-400" />
                      <CardTitle className="text-lg">Openstaande schuld</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-3xl font-semibold tabular-nums tracking-tight">{money(data.debtToClient ?? 0)}</p>
                      <CardDescription className="mt-1">
                        Tegoed / vooruitbetaling dat nog met uren kan worden verrekend.
                      </CardDescription>
                    </CardContent>
                  </Card>
                </div>

                <Accordion type="multiple" defaultValue={["hours", "settlements", "invoices"]} className="space-y-3">
                  <AccordionItem value="hours" className="border rounded-xl px-4 bg-card shadow-sm">
                    <AccordionTrigger className="text-lg font-semibold hover:no-underline py-4">
                      <span className="flex items-center gap-2">
                        <Clock className="h-5 w-5 text-muted-foreground" />
                        Urenregistratie
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="pb-4">
                      <CardDescription className="mb-4 -mt-1">
                        Alle uren in één tabel; bovenin een rustige verdeling per maand. Klap de sectie dicht voor minder schermruimte.
                      </CardDescription>
                      <PortalHoursBlock entries={data.timeEntries} />
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="settlements" className="border rounded-xl px-4 bg-card shadow-sm">
                    <AccordionTrigger className="text-lg font-semibold hover:no-underline py-4">
                      <span className="flex items-center gap-2">
                        <Scale className="h-5 w-5 text-muted-foreground" />
                        Schuldverrekeningen
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="pb-4">
                      <CardDescription className="mb-4 -mt-1">
                        Bedrag, uren en uitgevoerde werkzaamheden per verrekening. Open een regel voor het volledige detail.
                      </CardDescription>
                      <PortalSettlementsBlock settlements={data.debtSettlements ?? []} />
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="invoices" className="border rounded-xl px-4 bg-card shadow-sm">
                    <AccordionTrigger className="text-lg font-semibold hover:no-underline py-4">
                      <span className="flex items-center gap-2">
                        <FileText className="h-5 w-5 text-muted-foreground" />
                        Facturen
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="pb-4">
                      <CardDescription className="mb-4 -mt-1">Status en bedragen (incl. BTW waar van toepassing)</CardDescription>
                      <div className="overflow-x-auto rounded-md border">
                        {data.invoices.length === 0 ? (
                          <p className="p-4 text-sm text-muted-foreground">Nog geen facturen.</p>
                        ) : (
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Nummer</TableHead>
                                <TableHead>Datum</TableHead>
                                <TableHead>Vervaldatum</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Totaal</TableHead>
                                <TableHead className="w-16 text-right">PDF</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {data.invoices.map((inv) => (
                                <TableRow
                                  key={inv.id}
                                  className={
                                    inv.status === "vervallen"
                                      ? "opacity-55 text-muted-foreground"
                                      : inv.status === "betaald"
                                        ? "bg-emerald-500/8"
                                        : undefined
                                  }
                                >
                                  <TableCell className="font-medium whitespace-nowrap">{inv.invoice_number}</TableCell>
                                  <TableCell className="whitespace-nowrap">
                                    {new Date(inv.invoice_date).toLocaleDateString("nl-NL")}
                                  </TableCell>
                                  <TableCell className="whitespace-nowrap">
                                    {inv.due_date ? new Date(inv.due_date).toLocaleDateString("nl-NL") : "—"}
                                  </TableCell>
                                  <TableCell>{invoiceStatusLabel(inv.status)}</TableCell>
                                  <TableCell className="text-right tabular-nums">
                                    €{Number(inv.total).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => handleDownloadInvoice(inv.id)}
                                      disabled={downloadingId === inv.id || inv.status === "vervallen"}
                                      title="PDF downloaden"
                                    >
                                      <Download className="h-4 w-4" />
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        )}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </>
            )}
          </TabsContent>

          <TabsContent value="settings" className="mt-0">
            <PortalSettingsPanel />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
