import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { Link } from "react-router-dom";
import {
  Building2, Clock, Banknote, FileText, Landmark, Loader2, Receipt,
  TrendingUp, TrendingDown, AlertCircle, ChevronRight,
} from "lucide-react";
import type { Company, Invoice, TimeEntry } from "@/lib/db-types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis,
} from "recharts";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { FadeList, FadeItem } from "@/components/PageTransition";

type PeriodPreset = "30d" | "90d" | "ytd" | "12m";
type InvoiceWithCompany = Invoice & { companies: { name: string | null } | null };
type ReportEntry = { hours: number; hourly_rate: number | null; company_name: string | null; default_hourly_rate: number | null };
type TimeEntryWithCompany = TimeEntry & { companies: Company | null };

const STATUS_COLORS: Record<string, string> = {
  concept: "#3b82f6",
  verzonden: "#f59e0b",
  betaald: "#16a34a",
  vervallen: "#ef4444",
  gesplitst: "#6366f1",
};
const STATUS_LABELS: Record<string, string> = {
  concept: "Draft",
  verzonden: "Sent",
  betaald: "Paid",
  vervallen: "Void",
  gesplitst: "Split",
};

function invoiceStatusForDashboard(inv: Invoice): string {
  if (inv.status === "vervallen" && /gesplitst|split into/i.test(inv.notes ?? "")) return "gesplitst";
  return inv.status;
}

const periodLabels: Record<PeriodPreset, string> = {
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  ytd: "This year",
  "12m": "Last 12 months",
};

function monthKeyFromDate(dateIso: string) {
  const d = new Date(`${dateIso}T00:00:00`);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(key: string) {
  const [year, month] = key.split("-");
  const d = new Date(Number(year), Number(month) - 1, 1);
  return d.toLocaleDateString("en", { month: "short" });
}
function fmt(value: number) {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function fmtFull(value: number) {
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function getPeriodRange(period: PeriodPreset) {
  const now = new Date();
  const to = now.toISOString().split("T")[0];
  const fromDate = new Date(now);
  if (period === "30d") fromDate.setDate(fromDate.getDate() - 30);
  else if (period === "90d") fromDate.setDate(fromDate.getDate() - 90);
  else if (period === "12m") fromDate.setMonth(fromDate.getMonth() - 12);
  else fromDate.setMonth(0, 1);
  return { from: fromDate.toISOString().split("T")[0], to };
}

// Compact KPI card in Sypher style
function KpiCard({
  label, value, sub, icon: Icon, trend, positive, delay = 0,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  trend?: number | null;
  positive?: boolean;
  delay?: number;
}) {
  const trendUp = trend !== undefined && trend !== null && trend > 0;
  const trendDown = trend !== undefined && trend !== null && trend < 0;
  const prevValue = useRef(value);
  const [key, setKey] = useState(0);
  useEffect(() => {
    if (prevValue.current !== value) {
      setKey((k) => k + 1);
      prevValue.current = value;
    }
  }, [value]);

  return (
    <motion.div
      className="bg-card border border-border rounded-lg p-4 flex flex-col gap-2 card-lift cursor-default"
      initial={{ opacity: 0, y: 18, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.32, ease: [0.25, 0.46, 0.45, 0.94], delay }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{label}</span>
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div className="flex items-end gap-2">
        <span key={key} className="text-2xl font-bold tabular-nums leading-none count-up">{value}</span>
        {trend !== null && trend !== undefined && (
          <motion.span
            className={cn("flex items-center gap-0.5 text-xs font-medium mb-0.5", trendUp ? (positive !== false ? "text-success" : "text-cost") : trendDown ? (positive !== false ? "text-cost" : "text-success") : "text-muted-foreground")}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: delay + 0.25, duration: 0.2 }}
          >
            {trendUp ? <TrendingUp className="h-3 w-3" /> : trendDown ? <TrendingDown className="h-3 w-3" /> : null}
            {Math.abs(trend).toFixed(1)}%
          </motion.span>
        )}
      </div>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </motion.div>
  );
}

type InvoiceTab = "all" | "betaald" | "verzonden" | "concept";

export default function Dashboard() {
  const { user } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [invoices, setInvoices] = useState<InvoiceWithCompany[]>([]);
  const [reportRows, setReportRows] = useState<ReportEntry[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntryWithCompany[]>([]);
  const [period, setPeriod] = useState<PeriodPreset>("12m");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [btwQuarter, setBtwQuarter] = useState<{ verkoop_btw: number; inkoop_btw: number; saldo_btw: number } | null>(null);
  const [bankSaldo, setBankSaldo] = useState<number | null>(null);
  const [invoiceTab, setInvoiceTab] = useState<InvoiceTab>("all");

  useEffect(() => {
    if (!user) return;
    const { from, to } = getPeriodRange(period);
    setLoading(true);
    setLoadError(null);
    Promise.all([
      api.getCompanies(),
      api.getInvoices(),
      api.getReportTimeEntries(from, to, companyFilter),
      api.getTimeEntries(companyFilter === "all" ? undefined : { company_id: companyFilter }),
    ])
      .then(([companiesRes, invoicesRes, reportRes, timeEntriesRes]) => {
        setCompanies(companiesRes);
        setInvoices(invoicesRes);
        setReportRows(reportRes);
        setTimeEntries(timeEntriesRes);
      })
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : "Failed to load dashboard data."))
      .finally(() => setLoading(false));
  }, [user, period, companyFilter]);

  useEffect(() => {
    if (!user) return;
    const now = new Date();
    const q = Math.ceil((now.getMonth() + 1) / 3);
    const qStarts = ["01-01", "04-01", "07-01", "10-01"];
    const qEnds = ["03-31", "06-30", "09-30", "12-31"];
    const qFrom = `${now.getFullYear()}-${qStarts[q - 1]}`;
    const qTo = `${now.getFullYear()}-${qEnds[q - 1]}`;
    api.getTaxReport(qFrom, qTo).then(setBtwQuarter).catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!user) return;
    api.getBankBalance().then((r) => setBankSaldo(r.saldo)).catch(() => {});
  }, [user]);

  const filteredInvoices = useMemo(
    () => (companyFilter === "all" ? invoices : invoices.filter((inv) => inv.company_id === companyFilter)),
    [companyFilter, invoices],
  );

  const kpis = useMemo(() => {
    const paid = filteredInvoices.filter((i) => i.status === "betaald");
    const open = filteredInvoices.filter((i) => i.status === "concept" || i.status === "verzonden");
    const paidAmount = paid.reduce((s, i) => s + Math.max(0, Number(i.total) - Number(i.advance_payment ?? 0)), 0);
    const openAmount = open.reduce((s, i) => s + Math.max(0, Number(i.total) - Number(i.advance_payment ?? 0)), 0);
    const hours = reportRows.reduce((s, r) => s + Number(r.hours), 0);
    const total = paidAmount + openAmount;
    return { paidAmount, openAmount, openCount: open.length, paidCount: paid.length, hours, total };
  }, [filteredInvoices, reportRows]);

  const revenueByMonth = useMemo(() => {
    const grouped = new Map<string, { month: string; betaald: number; open: number }>();
    for (const inv of filteredInvoices) {
      const key = monthKeyFromDate(inv.invoice_date);
      if (!grouped.has(key)) grouped.set(key, { month: key, betaald: 0, open: 0 });
      const row = grouped.get(key)!;
      const net = Math.max(0, Number(inv.total) - Number(inv.advance_payment ?? 0));
      if (inv.status === "betaald") row.betaald += net;
      if (inv.status === "concept" || inv.status === "verzonden") row.open += net;
    }
    return [...grouped.values()]
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((r) => ({ ...r, label: monthLabel(r.month), betaald: +r.betaald.toFixed(2), open: +r.open.toFixed(2) }));
  }, [filteredInvoices]);

  const hoursByMonth = useMemo(() => {
    const { from, to } = getPeriodRange(period);
    const grouped = new Map<string, number>();
    for (const row of timeEntries) {
      if (row.date < from || row.date > to) continue;
      const key = monthKeyFromDate(row.date);
      grouped.set(key, (grouped.get(key) ?? 0) + Number(row.hours));
    }
    return [...grouped.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, hours]) => ({ label: monthLabel(month), hours: +hours.toFixed(1) }));
  }, [period, timeEntries]);

  // Invoice table filtered by tab
  const invoiceTableRows = useMemo(() => {
    const recent = [...filteredInvoices].sort((a, b) => b.invoice_date.localeCompare(a.invoice_date)).slice(0, 50);
    if (invoiceTab === "all") return recent;
    return recent.filter((i) => invoiceStatusForDashboard(i) === invoiceTab);
  }, [filteredInvoices, invoiceTab]);

  const invoiceCounts = useMemo(() => {
    return {
      all: filteredInvoices.length,
      betaald: filteredInvoices.filter((i) => i.status === "betaald").length,
      verzonden: filteredInvoices.filter((i) => i.status === "verzonden").length,
      concept: filteredInvoices.filter((i) => i.status === "concept").length,
    };
  }, [filteredInvoices]);

  // Customer summary
  const customerSummary = useMemo(() => {
    const grouped = new Map<string, { name: string; hours: number; revenue: number }>();
    for (const row of reportRows) {
      const name = row.company_name ?? "Unknown";
      if (!grouped.has(name)) grouped.set(name, { name, hours: 0, revenue: 0 });
      const agg = grouped.get(name)!;
      const h = Number(row.hours);
      const rate = Number(row.hourly_rate ?? row.default_hourly_rate ?? 0);
      agg.hours += h;
      agg.revenue += h * rate;
    }
    return [...grouped.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 6);
  }, [reportRows]);

  const revenueChartConfig: ChartConfig = {
    betaald: { label: "Paid", color: "hsl(var(--primary))" },
    open: { label: "Outstanding", color: "hsl(39 90% 65%)" },
  };
  const hoursChartConfig: ChartConfig = {
    hours: { label: "Hours", color: "hsl(162 40% 50%)" },
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground gap-2">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Loading…</span>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{periodLabels[period]}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={period} onValueChange={(v) => setPeriod(v as PeriodPreset)}>
            <SelectTrigger className="h-8 text-sm w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(periodLabels) as PeriodPreset[]).map((p) => (
                <SelectItem key={p} value={p}>{periodLabels[p]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={companyFilter} onValueChange={setCompanyFilter}>
            <SelectTrigger className="h-8 text-sm w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All clients</SelectItem>
              {companies.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name || c.contact_person || "Client"}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loadError && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/8 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {loadError}
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard delay={0}    label="Revenue received" value={fmt(kpis.paidAmount)} sub={`${kpis.paidCount} invoices`} icon={Banknote} positive />
        <KpiCard delay={0.05} label="Outstanding" value={fmt(kpis.openAmount)} sub={`${kpis.openCount} invoices`} icon={FileText} positive={false} />
        <KpiCard delay={0.1}  label="Bank balance" value={bankSaldo !== null ? (bankSaldo < 0 ? `−${fmt(Math.abs(bankSaldo))}` : fmt(bankSaldo)) : "—"} icon={Landmark} positive={bankSaldo === null || bankSaldo >= 0} />
        <KpiCard delay={0.15} label="Hours (period)" value={kpis.hours.toFixed(1)} icon={Clock} />
        <KpiCard delay={0.2}  label="Clients" value={String(companies.length)} icon={Building2} />
        <KpiCard delay={0.25} label={`Tax Q${Math.ceil((new Date().getMonth() + 1) / 3)}`} value={btwQuarter !== null ? fmt(Math.max(0, btwQuarter.saldo_btw)) : "—"} sub={btwQuarter?.inkoop_btw ? `−${fmt(btwQuarter.inkoop_btw)} input credit` : "Current quarter"} icon={Receipt} positive={false} />
      </div>

      {/* Main two-column layout */}
      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">

        {/* LEFT column */}
        <div className="space-y-4 min-w-0">
          {/* Revenue chart */}
          <div className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold">Revenue & outstanding</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Paid vs. outstanding per month</p>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-success" />Paid</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-warning" />Outstanding</span>
              </div>
            </div>
            {revenueByMonth.length === 0 ? (
              <p className="text-sm text-muted-foreground py-12 text-center">No invoice data for the selected filters.</p>
            ) : (
              <ChartContainer config={revenueChartConfig} className="h-56 w-full">
                <AreaChart data={revenueByMonth} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="gradBetaald" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradOpen" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(39 90% 65%)" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="hsl(39 90% 65%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis tickLine={false} axisLine={false} width={60} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={fmt} />
                  <ChartTooltip content={<ChartTooltipContent formatter={(v) => fmtFull(Number(v))} />} />
                  <Area dataKey="betaald" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#gradBetaald)" dot={false} />
                  <Area dataKey="open" stroke="hsl(39 90% 65%)" strokeWidth={2} fill="url(#gradOpen)" dot={false} />
                </AreaChart>
              </ChartContainer>
            )}
          </div>

          {/* Hours chart + Customer table side by side */}
          <div className="grid gap-4 md:grid-cols-2">
            {/* Hours chart */}
            <div className="bg-card border border-border rounded-lg p-4">
              <h2 className="text-sm font-semibold mb-1">Hours per month</h2>
              <p className="text-xs text-muted-foreground mb-4">Logged hours in the selected period</p>
              {hoursByMonth.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No time data.</p>
              ) : (
                <ChartContainer config={hoursChartConfig} className="h-44 w-full">
                  <BarChart data={hoursByMonth} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                    <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis tickLine={false} axisLine={false} width={32} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="hours" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} opacity={0.85} />
                  </BarChart>
                </ChartContainer>
              )}
            </div>

            {/* Customer revenue */}
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold">Client revenue</h2>
                <Link to="/reports" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition-colors">
                  View all <ChevronRight className="h-3 w-3" />
                </Link>
              </div>
              {customerSummary.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No data.</p>
              ) : (
                <div className="space-y-2.5">
                  {customerSummary.map((c) => {
                    const maxRev = customerSummary[0].revenue;
                    const pct = maxRev > 0 ? (c.revenue / maxRev) * 100 : 0;
                    return (
                      <div key={c.name}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="font-medium truncate max-w-[140px]">{c.name}</span>
                          <span className="text-muted-foreground tabular-nums">{fmtFull(c.revenue)}</span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <motion.div
                            className="h-full bg-success rounded-full"
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{ duration: 0.6, ease: "easeOut", delay: 0.1 }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT column — Invoices panel */}
        <div className="bg-card border border-border rounded-lg flex flex-col min-h-[500px]">
          <div className="p-4 border-b border-border">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold">Invoices</h2>
              <Link to="/invoices" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition-colors">
                View all <ChevronRight className="h-3 w-3" />
              </Link>
            </div>
            {/* Amount summary bar */}
            <div className="flex items-center gap-4 mb-3">
              <div>
                <p className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Paid</p>
                <p className="text-lg font-bold tabular-nums text-success">{fmt(kpis.paidAmount)}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Outstanding</p>
                <p className="text-lg font-bold tabular-nums text-warning">{fmt(kpis.openAmount)}</p>
              </div>
            </div>
            {/* Progress bar */}
            {kpis.total > 0 && (
              <div className="h-1.5 bg-muted rounded-full overflow-hidden flex">
                <motion.div className="h-full bg-success" initial={{ width: 0 }} animate={{ width: `${(kpis.paidAmount / kpis.total) * 100}%` }} transition={{ duration: 0.7, ease: "easeOut" }} />
                <motion.div className="h-full bg-warning" initial={{ width: 0 }} animate={{ width: `${(kpis.openAmount / kpis.total) * 100}%` }} transition={{ duration: 0.7, ease: "easeOut", delay: 0.1 }} />
              </div>
            )}
          </div>

          {/* Tabs */}
          <div className="flex border-b border-border">
            {(["all", "betaald", "verzonden", "concept"] as InvoiceTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setInvoiceTab(tab)}
                className={cn(
                  "px-3 py-2.5 text-xs font-medium transition-colors border-b-2 -mb-px whitespace-nowrap",
                  invoiceTab === tab
                    ? "border-success text-success"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {tab === "all" ? "All" : STATUS_LABELS[tab]}
                <span className={cn("ml-1.5 rounded-full px-1.5 py-0.5 text-[10px]", invoiceTab === tab ? "bg-success/15" : "bg-muted")}>
                  {invoiceCounts[tab]}
                </span>
              </button>
            ))}
          </div>

          {/* Invoice list */}
          <div className="flex-1 overflow-y-auto">
            {invoiceTableRows.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-10">No invoices.</p>
            ) : (
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-card z-10">
                  <tr className="border-b border-border">
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Client</th>
                    <th className="text-left px-2 py-2 font-medium text-muted-foreground">Date</th>
                    <th className="text-right px-4 py-2 font-medium text-muted-foreground">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {invoiceTableRows.map((inv, i) => {
                    const status = invoiceStatusForDashboard(inv);
                    const color = STATUS_COLORS[status] ?? "#94a3b8";
                    const net = Math.max(0, Number(inv.total) - Number(inv.advance_payment ?? 0));
                    const companyName = inv.companies?.name ?? inv.invoice_number;
                    const initials = (companyName ?? "?").slice(0, 2).toUpperCase();
                    return (
                      <motion.tr
                        key={inv.id}
                        className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.04, duration: 0.2 }}
                      >
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span
                              className="h-6 w-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold shrink-0"
                              style={{ backgroundColor: color + "33", color }}
                            >
                              {initials}
                            </span>
                            <div className="min-w-0">
                              <p className="font-medium truncate">{companyName || "—"}</p>
                              <p className="text-muted-foreground">{inv.invoice_number}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-2 py-2.5 text-muted-foreground whitespace-nowrap">
                          {new Date(inv.invoice_date).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                        </td>
                        <td className="px-4 py-2.5 text-right font-medium tabular-nums whitespace-nowrap">
                          {fmtFull(net)}
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
