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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { useToast } from "@/hooks/use-toast";
import {
  LogOut,
  Clock,
  FileText,
  Download,
  Scale,
  Settings,
  Loader2,
  Filter,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { generateInvoicePDF } from "@/lib/pdf";

function money(n: number): string {
  return `€${n.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function todayIso(): string {
  return new Date().toISOString().split("T")[0]!;
}

function monthsAgoIso(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().split("T")[0]!;
}

function startOfYearIso(): string {
  const y = new Date().getFullYear();
  return `${y}-01-01`;
}

function startOfMonthIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
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

const hoursChartConfig = { hours: { label: "Uren", color: "#3b82f6" } } satisfies ChartConfig;
const settlementChartConfig = { amount: { label: "Verrekend (€)", color: "#8b5cf6" } } satisfies ChartConfig;

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

function PortalHoursBlock({ entries }: { entries: TimeRow[] }) {
  const [from, setFrom] = useState(monthsAgoIso(12));
  const [to, setTo] = useState(todayIso());
  const [kind, setKind] = useState<"all" | "settled" | "open">("all");

  const filtered = useMemo(() => {
    return entries.filter((row) => {
      if (from && row.date < from) return false;
      if (to && row.date > to) return false;
      if (kind === "settled" && !row.settledAgainstDebt) return false;
      if (kind === "open" && row.settledAgainstDebt) return false;
      return true;
    });
  }, [entries, from, to, kind]);

  const hoursInPeriod = useMemo(
    () => filtered.reduce((s, r) => s + Number(r.hours), 0),
    [filtered],
  );

  const chartData = useMemo(() => {
    const byMonth = new Map<string, number>();
    for (const row of filtered) {
      const key = row.date.slice(0, 7);
      byMonth.set(key, (byMonth.get(key) ?? 0) + Number(row.hours));
    }
    return [...byMonth.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, hours]) => ({ month, label: monthLabel(month), hours: Number(hours.toFixed(2)) }));
  }, [filtered]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:flex-wrap">
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setFrom(startOfMonthIso())}>
            Deze maand
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setFrom(startOfYearIso())}>
            Dit jaar
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setFrom(monthsAgoIso(12));
              setTo(todayIso());
            }}
          >
            Laatste 12 mnd
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setFrom("");
              setTo("");
            }}
          >
            Alles
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="grid gap-1">
            <Label className="text-xs">Van</Label>
            <Input type="date" className="w-[160px]" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Tot en met</Label>
            <Input type="date" className="w-[160px]" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="grid gap-1 min-w-[180px]">
            <Label className="text-xs">Soort</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle uren</SelectItem>
                <SelectItem value="settled">Alleen verrekend met schuld</SelectItem>
                <SelectItem value="open">Alleen nog niet verrekend</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        In selectie: <span className="font-medium text-foreground">{hoursInPeriod.toLocaleString("nl-NL", { maximumFractionDigits: 2 })}</span> uur
        {" · "}
        {filtered.length} regel{filtered.length === 1 ? "" : "s"}
      </p>

      {chartData.length > 0 ? (
        <div className="rounded-xl border bg-card/50 p-2">
          <ChartContainer config={hoursChartConfig} className="h-[220px] w-full">
            <BarChart data={chartData} margin={{ left: 4, right: 8 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis tickLine={false} axisLine={false} width={44} tick={{ fontSize: 11 }} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="hours" fill="var(--color-hours)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
          <p className="text-center text-xs text-muted-foreground px-2 pb-1">Uren per maand (selectie)</p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Geen uren in deze filter.</p>
      )}

      <div className="rounded-md border overflow-x-auto">
        {filtered.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">Geen regels om te tonen.</p>
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
              {filtered.map((row) => (
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
  const [from, setFrom] = useState(monthsAgoIso(12));
  const [to, setTo] = useState(todayIso());

  const filtered = useMemo(() => {
    return settlements.filter((s) => {
      const d = s.createdAt.slice(0, 10);
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    });
  }, [settlements, from, to]);

  const chartData = useMemo(() => {
    const byMonth = new Map<string, number>();
    for (const s of filtered) {
      const key = s.createdAt.slice(0, 7);
      byMonth.set(key, (byMonth.get(key) ?? 0) + s.totalAmount);
    }
    return [...byMonth.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, amount]) => ({ month, label: monthLabel(month), amount: Number(amount.toFixed(2)) }));
  }, [filtered]);

  const totalVerrekend = useMemo(() => filtered.reduce((s, x) => s + x.totalAmount, 0), [filtered]);
  const totalUrenVerrekend = useMemo(
    () => filtered.reduce((s, x) => s + (x.totalHours ?? x.lines?.reduce((a, l) => a + l.hours, 0) ?? 0), 0),
    [filtered],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:flex-wrap">
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setFrom(startOfMonthIso())}>
            Deze maand
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setFrom(startOfYearIso())}>
            Dit jaar
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setFrom(monthsAgoIso(12));
              setTo(todayIso());
            }}
          >
            Laatste 12 mnd
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setFrom("");
              setTo("");
            }}
          >
            Alles
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="grid gap-1">
            <Label className="text-xs">Van</Label>
            <Input type="date" className="w-[160px]" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Tot en met</Label>
            <Input type="date" className="w-[160px]" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Selectie: <span className="font-medium text-foreground">{money(totalVerrekend)}</span> verrekend ·{" "}
        <span className="font-medium text-foreground">{totalUrenVerrekend.toLocaleString("nl-NL", { maximumFractionDigits: 2 })}</span> uur
        {" · "}
        {filtered.length} verrekening{filtered.length === 1 ? "" : "en"}
      </p>

      {chartData.length > 0 ? (
        <div className="rounded-xl border bg-card/50 p-2">
          <ChartContainer config={settlementChartConfig} className="h-[220px] w-full">
            <BarChart data={chartData} margin={{ left: 4, right: 8 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={52}
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => `€${Number(v).toFixed(0)}`}
              />
              <ChartTooltip
                content={<ChartTooltipContent formatter={(value) => money(Number(value))} />}
              />
              <Bar dataKey="amount" fill="var(--color-amount)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
          <p className="text-center text-xs text-muted-foreground px-2 pb-1">Verrekende bedragen per maand (selectie)</p>
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">Geen verrekeningen in deze periode.</p>
      ) : null}

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">Pas de datums aan of er zijn nog geen verrekeningen.</p>
      ) : (
        <Accordion type="multiple" className="space-y-2 w-full">
          {filtered.map((s) => (
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
                        Filter op periode en soort uren. Klap secties dicht voor een compacter overzicht.
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
                        Per verrekening ziet u het bedrag, het aantal uren en welke diensten daarbij horen. Klap een regel open voor details.
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
