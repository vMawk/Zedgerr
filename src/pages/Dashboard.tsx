import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { Building2, Clock, Euro, FileText, Loader2, Receipt, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NavLink } from "@/components/NavLink";
import type { Company, Invoice, TimeEntry } from "@/lib/db-types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, XAxis, YAxis } from "recharts";

type PeriodPreset = "30d" | "90d" | "ytd" | "12m";
type InvoiceWithCompany = Invoice & { companies: { name: string | null } | null };
type ReportEntry = { hours: number; hourly_rate: number | null; company_name: string | null; default_hourly_rate: number | null };
type TimeEntryWithCompany = TimeEntry & { companies: Company | null };

const STATUS_COLORS: Record<string, string> = {
  concept: "#3b82f6",
  verzonden: "#f59e0b",
  betaald: "#10b981",
  vervallen: "#ef4444",
  /** Originele factuur na splitsen — niet als ‘vervallen’ tellen in dit overzicht */
  gesplitst: "#6366f1",
};

/** Zelfde logica als facturenlijst: gesplitste hoofdfactuur niet als vervallen tonen. */
function invoiceStatusForDashboard(inv: Invoice): string {
  if (inv.status === "vervallen" && (inv.notes ?? "").toLowerCase().includes("gesplitst")) {
    return "gesplitst";
  }
  return inv.status;
}
const periodLabels: Record<PeriodPreset, string> = { "30d": "Laatste 30 dagen", "90d": "Laatste 90 dagen", ytd: "Jaar tot nu", "12m": "Laatste 12 maanden" };

function monthKeyFromDate(dateIso: string): string {
  const d = new Date(`${dateIso}T00:00:00`);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(key: string): string {
  const [year, month] = key.split("-");
  const d = new Date(Number(year), Number(month) - 1, 1);
  return d.toLocaleDateString("nl-NL", { month: "short", year: "2-digit" });
}
function numberMoney(value: number): string {
  return `€${value.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function getPeriodRange(period: PeriodPreset): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString().split("T")[0];
  const fromDate = new Date(now);
  if (period === "30d") fromDate.setDate(fromDate.getDate() - 30);
  if (period === "90d") fromDate.setDate(fromDate.getDate() - 90);
  if (period === "12m") fromDate.setMonth(fromDate.getMonth() - 12);
  if (period === "ytd") fromDate.setMonth(0, 1);
  return { from: fromDate.toISOString().split("T")[0], to };
}

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState({ companies: 0, hoursThisMonth: 0, openInvoices: 0, revenue: 0 });
  const [companies, setCompanies] = useState<Company[]>([]);
  const [invoices, setInvoices] = useState<InvoiceWithCompany[]>([]);
  const [reportRows, setReportRows] = useState<ReportEntry[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntryWithCompany[]>([]);
  const [period, setPeriod] = useState<PeriodPreset>("12m");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [needsMonthInvoice, setNeedsMonthInvoice] = useState(false);
  const [toSendCount, setToSendCount] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [customerTableSort, setCustomerTableSort] = useState<"revenue" | "hours">("revenue");
  const [btwQuarter, setBtwQuarter] = useState<{ verkoop_btw: number; inkoop_btw: number; saldo_btw: number } | null>(null);

  useEffect(() => {
    if (!user) return;
    const { from, to } = getPeriodRange(period);
    setLoading(true);
    setLoadError(null);
    Promise.all([
      api.getDashboardStats(),
      api.getCompanies(),
      api.getInvoices(),
      api.getReportTimeEntries(from, to, companyFilter),
      api.getTimeEntries(companyFilter === "all" ? undefined : { company_id: companyFilter }),
    ])
      .then(([statsRes, companiesRes, invoicesRes, reportRes, timeEntriesRes]) => {
        setStats(statsRes);
        setCompanies(companiesRes);
        setInvoices(invoicesRes);
        setReportRows(reportRes);
        setTimeEntries(timeEntriesRes);
      })
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : "Dashboard data kon niet geladen worden."))
      .finally(() => setLoading(false));
  }, [user, period, companyFilter]);

  useEffect(() => {
    if (!user) return;
    const now = new Date();
    const q = Math.ceil((now.getMonth() + 1) / 3);
    const qStarts = ["01-01", "04-01", "07-01", "10-01"];
    const qEnds   = ["03-31", "06-30", "09-30", "12-31"];
    const qFrom = `${now.getFullYear()}-${qStarts[q - 1]}`;
    const qTo   = `${now.getFullYear()}-${qEnds[q - 1]}`;
    api.getTaxReport(qFrom, qTo).then(setBtwQuarter).catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const now = new Date();
    if (now.getDate() < 25) {
      setNeedsMonthInvoice(false);
      setToSendCount(0);
      return;
    }
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    Promise.all([api.invoicesExistForMonth(month), api.invoicesToSend(month)])
      .then(([existsRes, toSendRes]) => {
        setNeedsMonthInvoice(!existsRes.exists);
        setToSendCount(toSendRes.count);
      })
      .catch(() => {
        setNeedsMonthInvoice(false);
        setToSendCount(0);
      });
  }, [user]);

  const filteredInvoices = useMemo(() => (companyFilter === "all" ? invoices : invoices.filter((inv) => inv.company_id === companyFilter)), [companyFilter, invoices]);

  const revenueByMonth = useMemo(() => {
    const grouped = new Map<string, { month: string; paid: number; open: number }>();
    for (const inv of filteredInvoices) {
      const key = monthKeyFromDate(inv.invoice_date);
      if (!grouped.has(key)) grouped.set(key, { month: key, paid: 0, open: 0 });
      const row = grouped.get(key)!;
      const netAmount = Math.max(0, Number(inv.total) - Number(inv.advance_payment ?? 0));
      if (inv.status === "betaald") row.paid += netAmount;
      if (inv.status === "concept" || inv.status === "verzonden") row.open += netAmount;
    }
    return [...grouped.values()].sort((a, b) => a.month.localeCompare(b.month)).map((r) => ({ ...r, label: monthLabel(r.month), paid: Number(r.paid.toFixed(2)), open: Number(r.open.toFixed(2)) }));
  }, [filteredInvoices]);

  const hoursByMonth = useMemo(() => {
    const { from, to } = getPeriodRange(period);
    const grouped = new Map<string, number>();
    for (const row of timeEntries) {
      if (row.date < from || row.date > to) continue;
      const key = monthKeyFromDate(row.date);
      grouped.set(key, (grouped.get(key) ?? 0) + Number(row.hours));
    }
    return [...grouped.entries()].map(([month, hours]) => ({ month, label: monthLabel(month), hours: Number(hours.toFixed(1)) }));
  }, [period, timeEntries]);

  const statusDistribution = useMemo(() => {
    const grouped = new Map<string, number>();
    for (const inv of filteredInvoices) {
      const key = invoiceStatusForDashboard(inv);
      grouped.set(key, (grouped.get(key) ?? 0) + 1);
    }
    return [...grouped.entries()].map(([status, count]) => ({ status, count, fill: STATUS_COLORS[status] ?? "#94a3b8" }));
  }, [filteredInvoices]);

  const customersHoursRevenue = useMemo(() => {
    const grouped = new Map<string, { customer: string; hours: number; revenue: number }>();
    for (const row of reportRows) {
      const customer = row.company_name ?? "Onbekend";
      if (!grouped.has(customer)) grouped.set(customer, { customer, hours: 0, revenue: 0 });
      const agg = grouped.get(customer)!;
      const hours = Number(row.hours);
      const rate = Number(row.hourly_rate ?? row.default_hourly_rate ?? 0);
      agg.hours += hours;
      agg.revenue += hours * rate;
    }
    return [...grouped.values()].map((r) => ({
      ...r,
      hours: Number(r.hours.toFixed(1)),
      revenue: Number(r.revenue.toFixed(2)),
    }));
  }, [reportRows]);

  const topCustomers = useMemo(
    () => [...customersHoursRevenue].sort((a, b) => b.revenue - a.revenue).slice(0, 5),
    [customersHoursRevenue],
  );

  const customersTableSorted = useMemo(() => {
    const arr = [...customersHoursRevenue];
    arr.sort((a, b) => (customerTableSort === "revenue" ? b.revenue - a.revenue : b.hours - a.hours));
    return arr;
  }, [customersHoursRevenue, customerTableSort]);

  const kpis = useMemo(() => {
    const openAmount = filteredInvoices.filter((inv) => inv.status === "concept" || inv.status === "verzonden").reduce((sum, inv) => sum + Math.max(0, Number(inv.total) - Number(inv.advance_payment ?? 0)), 0);
    const paidRevenue = filteredInvoices.filter((inv) => inv.status === "betaald").reduce((sum, inv) => sum + Math.max(0, Number(inv.total) - Number(inv.advance_payment ?? 0)), 0);
    const hours = reportRows.reduce((sum, r) => sum + Number(r.hours), 0);
    return {
      clientsCount: companyFilter === "all" ? companies.length : filteredInvoices.reduce((acc, inv) => acc.add(inv.company_id), new Set<string>()).size,
      openAmount,
      paidRevenue,
      hours,
      openInvoicesCount: filteredInvoices.filter((inv) => inv.status === "concept" || inv.status === "verzonden").length,
    };
  }, [companies.length, companyFilter, filteredInvoices, reportRows]);

  const revenueChartConfig: ChartConfig = { paid: { label: "Betaald", color: "#10b981" }, open: { label: "Openstaand", color: "#f59e0b" } };
  const hoursChartConfig: ChartConfig = { hours: { label: "Uren", color: "#3b82f6" } };
  const statusChartConfig: ChartConfig = {
    concept: { label: "Concept", color: STATUS_COLORS.concept },
    verzonden: { label: "Verzonden", color: STATUS_COLORS.verzonden },
    betaald: { label: "Betaald", color: STATUS_COLORS.betaald },
    vervallen: { label: "Vervallen", color: STATUS_COLORS.vervallen },
    gesplitst: { label: "Gesplitst", color: STATUS_COLORS.gesplitst },
  };
  const topCustomersConfig: ChartConfig = { revenue: { label: "Omzet", color: "#8b5cf6" } };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <div className="flex flex-wrap gap-2">
          <Select value={period} onValueChange={(v) => setPeriod(v as PeriodPreset)}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="30d">{periodLabels["30d"]}</SelectItem>
              <SelectItem value="90d">{periodLabels["90d"]}</SelectItem>
              <SelectItem value="ytd">{periodLabels.ytd}</SelectItem>
              <SelectItem value="12m">{periodLabels["12m"]}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={companyFilter} onValueChange={setCompanyFilter}>
            <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle bedrijven</SelectItem>
              {companies.map((company) => <SelectItem key={company.id} value={company.id}>{company.name || company.contact_person || "Klant"}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loadError && (
        <Alert>
          <AlertTitle>Dashboard kon niet volledig laden</AlertTitle>
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      {toSendCount > 0 && (
        <Alert>
          <AlertTitle>Facturen klaar om te versturen</AlertTitle>
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p>Je hebt <span className="font-medium text-foreground">{toSendCount}</span> conceptfactuur{toSendCount === 1 ? "" : "en"} voor deze maand.</p>
            <Button asChild size="sm" className="w-fit"><NavLink to="/facturen">Naar facturen</NavLink></Button>
          </AlertDescription>
        </Alert>
      )}
      {needsMonthInvoice && (
        <Alert>
          <AlertTitle>Einde van de maand nadert</AlertTitle>
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p>Je hebt nog geen factuur voor deze maand aangemaakt.</p>
            <Button asChild size="sm" className="w-fit"><NavLink to="/facturen">Factuur aanmaken</NavLink></Button>
          </AlertDescription>
        </Alert>
      )}

      {loading ? (
        <Card>
          <CardContent className="py-10 flex items-center gap-3 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Dashboard laden...
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Klanten in beeld</CardTitle><Building2 className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{kpis.clientsCount}</div></CardContent></Card>
            <Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Uren in periode</CardTitle><Clock className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{kpis.hours.toFixed(1)}</div></CardContent></Card>
            <Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Openstaande facturen</CardTitle><FileText className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{kpis.openInvoicesCount}</div><p className="text-xs text-muted-foreground mt-1">{numberMoney(kpis.openAmount)}</p></CardContent></Card>
            <Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Omzet ontvangen</CardTitle><Euro className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{numberMoney(kpis.paidRevenue)}</div></CardContent></Card>
            <Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Klaar om te sturen</CardTitle><Send className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{toSendCount}</div></CardContent></Card>
            <Card className={btwQuarter && btwQuarter.saldo_btw > 0 ? "border-amber-400/50 bg-amber-50/30 dark:bg-amber-950/20" : ""}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  BTW reserveren Q{Math.ceil((new Date().getMonth() + 1) / 3)}
                </CardTitle>
                <Receipt className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold tabular-nums ${btwQuarter && btwQuarter.saldo_btw > 0 ? "text-amber-700 dark:text-amber-400" : ""}`}>
                  {btwQuarter !== null ? numberMoney(Math.max(0, btwQuarter.saldo_btw)) : "—"}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {btwQuarter
                    ? btwQuarter.inkoop_btw > 0
                      ? `Excl. €${btwQuarter.inkoop_btw.toFixed(2)} aftrek`
                      : "Huidig kwartaal"
                    : "Laden…"}
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Omzettrend (betaald/open)</CardTitle></CardHeader>
              <CardContent>
                {revenueByMonth.length === 0 ? <p className="text-sm text-muted-foreground">Geen factuurdata voor deze filters.</p> : (
                  <ChartContainer config={revenueChartConfig} className="h-72 w-full">
                    <BarChart data={revenueByMonth}>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} />
                      <YAxis tickLine={false} axisLine={false} width={80} tickFormatter={(v) => `€${Number(v).toFixed(0)}`} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <ChartLegend content={<ChartLegendContent />} />
                      <Bar dataKey="paid" fill="var(--color-paid)" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="open" fill="var(--color-open)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Urentrend</CardTitle></CardHeader>
              <CardContent>
                {hoursByMonth.length === 0 ? <p className="text-sm text-muted-foreground">Geen urendata voor deze filters.</p> : (
                  <ChartContainer config={hoursChartConfig} className="h-72 w-full">
                    <LineChart data={hoursByMonth}>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} />
                      <YAxis tickLine={false} axisLine={false} width={48} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Line dataKey="hours" stroke="var(--color-hours)" strokeWidth={2.5} dot={false} />
                    </LineChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Factuurstatus verdeling</CardTitle></CardHeader>
              <CardContent>
                {statusDistribution.length === 0 ? <p className="text-sm text-muted-foreground">Geen statusdata beschikbaar.</p> : (
                  <ChartContainer config={statusChartConfig} className="h-72 w-full">
                    <PieChart>
                      <Pie data={statusDistribution} dataKey="count" nameKey="status" innerRadius={70} outerRadius={100}>
                        {statusDistribution.map((entry) => <Cell key={entry.status} fill={entry.fill} />)}
                      </Pie>
                      <ChartTooltip content={<ChartTooltipContent nameKey="status" />} />
                      <ChartLegend content={<ChartLegendContent nameKey="status" />} />
                    </PieChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Top klanten op omzet</CardTitle></CardHeader>
              <CardContent>
                {topCustomers.length === 0 ? <p className="text-sm text-muted-foreground">Nog geen klantomzet in deze periode.</p> : (
                  <ChartContainer config={topCustomersConfig} className="h-72 w-full">
                    <BarChart data={topCustomers} layout="vertical" margin={{ left: 8, right: 8 }}>
                      <CartesianGrid horizontal={false} />
                      <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={(v) => `€${Number(v).toFixed(0)}`} />
                      <YAxis type="category" dataKey="customer" tickLine={false} axisLine={false} width={120} />
                      <ChartTooltip content={<ChartTooltipContent formatter={(value) => numberMoney(Number(value))} />} />
                      <Bar dataKey="revenue" fill="var(--color-revenue)" radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-base">Uren en omzet per klant</CardTitle>
                <p className="text-sm text-muted-foreground font-normal mt-1">
                  Zelfde periode en filters als hierboven. Omzet = uren × tarief (regeltarief of standaardtarief klant).
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button
                  type="button"
                  variant={customerTableSort === "revenue" ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => setCustomerTableSort("revenue")}
                >
                  Sorteer op omzet
                </Button>
                <Button
                  type="button"
                  variant={customerTableSort === "hours" ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => setCustomerTableSort("hours")}
                >
                  Sorteer op uren
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {customersTableSorted.length === 0 ? (
                <p className="text-sm text-muted-foreground">Geen uren in deze periode voor de gekozen filters.</p>
              ) : (
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Klant</TableHead>
                        <TableHead className="text-right">Uren</TableHead>
                        <TableHead className="text-right">Omzet</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {customersTableSorted.map((row) => (
                        <TableRow key={row.customer}>
                          <TableCell className="font-medium">{row.customer}</TableCell>
                          <TableCell className="text-right">{row.hours.toLocaleString("nl-NL")}</TableCell>
                          <TableCell className="text-right">{numberMoney(row.revenue)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Samenvatting voor {periodLabels[period]}</CardTitle></CardHeader>
            <CardContent className="grid gap-1 text-sm">
              <p className="text-muted-foreground">Snel overzicht op basis van de gekozen filters:</p>
              <p>- Klanten: <span className="font-medium text-foreground">{kpis.clientsCount}</span></p>
              <p>- Uren: <span className="font-medium text-foreground">{kpis.hours.toFixed(1)}</span></p>
              <p>- Openstaand: <span className="font-medium text-foreground">{numberMoney(kpis.openAmount)}</span></p>
              <p>- Ontvangen: <span className="font-medium text-foreground">{numberMoney(kpis.paidRevenue)}</span></p>
              <p className="text-xs text-muted-foreground mt-2">
                Basisstatistieken deze maand: {stats.hoursThisMonth.toFixed(1)} uur, {stats.openInvoices} open facturen, {numberMoney(stats.revenue)} betaald.
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
