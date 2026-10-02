import { useEffect, useState } from "react";
import { useTaxSettings } from "@/lib/tax";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import type { Company } from "@/lib/db-types";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface CompanySummary {
  company_name: string;
  total_hours: number;
  total_revenue: number;
}

export default function Reports() {
  const { currencySymbol: cs } = useTaxSettings();
  const { user } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [filterCompany, setFilterCompany] = useState("all");
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 3);
    return d.toISOString().split("T")[0];
  });
  const [dateTo, setDateTo] = useState(new Date().toISOString().split("T")[0]);
  const [summaries, setSummaries] = useState<CompanySummary[]>([]);

  useEffect(() => {
    if (!user) return;
    api.getCompanies().then(setCompanies);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const fetchReport = async () => {
      const data = await api.getReportTimeEntries(dateFrom, dateTo, filterCompany);
      const grouped: Record<string, CompanySummary> = {};
      for (const entry of data) {
        const name = entry.company_name || "Onbekend";
        if (!grouped[name]) grouped[name] = { company_name: name, total_hours: 0, total_revenue: 0 };
        const hours = Number(entry.hours);
        const rate = Number(entry.hourly_rate ?? entry.default_hourly_rate ?? 0);
        grouped[name].total_hours += hours;
        grouped[name].total_revenue += hours * rate;
      }
      setSummaries(Object.values(grouped).sort((a, b) => b.total_revenue - a.total_revenue));
    };
    fetchReport();
  }, [user, filterCompany, dateFrom, dateTo]);

  const totals = summaries.reduce((acc, s) => ({
    hours: acc.hours + s.total_hours,
    revenue: acc.revenue + s.total_revenue,
  }), { hours: 0, revenue: 0 });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Reports</h1>

      <div className="flex flex-wrap gap-4">
        <div className="grid gap-2">
          <Label>From</Label>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label>To</Label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label>Company</Label>
          <Select value={filterCompany} onValueChange={setFilterCompany}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All companies</SelectItem>
              {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name || c.contact_person || "Client"}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardContent className="pt-5 pb-5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Total hours</p>
            <p className="text-3xl font-bold tabular-nums">{totals.hours.toFixed(1)}</p>
            <p className="text-xs text-muted-foreground mt-1">in the selected period</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Total revenue</p>
            <p className="text-3xl font-bold tabular-nums text-[hsl(var(--success))]">{cs}{totals.revenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
            <p className="text-xs text-muted-foreground mt-1">based on hourly rate</p>
          </CardContent>
        </Card>
        {summaries.length > 0 && (
          <Card>
            <CardContent className="pt-5 pb-5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Gem. uurtarief</p>
              <p className="text-3xl font-bold tabular-nums">
                {cs}{totals.hours > 0 ? (totals.revenue / totals.hours).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0,00"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">gewogen gemiddelde</p>
            </CardContent>
          </Card>
        )}
      </div>

      {summaries.length > 0 && (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Hours</TableHead>
                <TableHead>Revenue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summaries.map((s) => (
                <TableRow key={s.company_name}>
                  <TableCell className="font-medium">{s.company_name}</TableCell>
                  <TableCell>{s.total_hours.toFixed(1)}</TableCell>
                  <TableCell>{cs}{s.total_revenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
