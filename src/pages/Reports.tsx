import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import type { Company } from "@/lib/db-types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
      <h1 className="text-2xl font-semibold">Overzichten</h1>

      <div className="flex flex-wrap gap-4">
        <div className="grid gap-2">
          <Label>Van</Label>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label>Tot</Label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label>Bedrijf</Label>
          <Select value={filterCompany} onValueChange={setFilterCompany}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle bedrijven</SelectItem>
              {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name || "Klant"}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Totaal uren</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totals.hours.toFixed(1)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Totaal omzet</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">€{totals.revenue.toLocaleString("nl-NL", { minimumFractionDigits: 2 })}</div>
          </CardContent>
        </Card>
      </div>

      {summaries.length > 0 && (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bedrijf</TableHead>
                <TableHead>Uren</TableHead>
                <TableHead>Omzet</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summaries.map((s) => (
                <TableRow key={s.company_name}>
                  <TableCell className="font-medium">{s.company_name}</TableCell>
                  <TableCell>{s.total_hours.toFixed(1)}</TableCell>
                  <TableCell>€{s.total_revenue.toLocaleString("nl-NL", { minimumFractionDigits: 2 })}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
