import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../lib/api";
import { Card, CardContent } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Label } from "../components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "../components/ui/table";

function fmt(cents: number) {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(cents / 100);
}

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 5 }, (_, i) => currentYear - i);
const quarters = [1, 2, 3, 4];

interface PnlLine { account_number: string; name: string; net_cents: number }
interface PnlReport {
  fallback: boolean;
  period: { from: string; to: string };
  revenue:  { total_cents: number; lines: PnlLine[] };
  expenses: { total_cents: number; lines: PnlLine[] };
  net_profit_cents: number;
}

interface BalanceLine {
  account_number: string; name: string;
  total_debit_cents: number; total_credit_cents: number; balance_cents: number;
}
interface BalanceReport {
  as_of: string;
  assets:      { total_cents: number; lines: BalanceLine[] };
  liabilities: { total_cents: number; lines: BalanceLine[] };
  equity:      { total_cents: number; lines: BalanceLine[] };
  balanced: boolean;
}

interface VatLine { btw_percentage?: number; vat_rate?: number; subtotal_cents?: number; excl_cents?: number; btw_cents?: number; vat_cents?: number }
interface VatReport {
  period: { from: string; to: string; year: number; quarter: number | null };
  vat_charged_cents:  number;
  vat_recovery_cents: number;
  vat_payable_cents:  number;
  invoice_lines: VatLine[];
  expense_lines: VatLine[];
}

export default function FinancieelRapport() {
  const [tab, setTab] = useState("pnl");
  const [year, setYear] = useState(String(currentYear));
  const [quarter, setQuarter] = useState("all");

  const pnlParams = quarter !== "all"
    ? `?year=${year}&quarter=${quarter}`
    : `?year=${year}`;
  const vatParams = quarter !== "all"
    ? `?year=${year}&quarter=${quarter}`
    : `?year=${year}`;
  const balanceParams = `?as_of=${year}-12-31`;

  const { data: pnl } = useQuery<PnlReport>({
    queryKey: ["pnl", year, quarter],
    queryFn: () => apiRequest(`/api/reports/pnl${pnlParams}`),
    enabled: tab === "pnl",
  });

  const { data: balance } = useQuery<BalanceReport>({
    queryKey: ["balance-sheet", year],
    queryFn: () => apiRequest(`/api/reports/balance-sheet${balanceParams}`),
    enabled: tab === "balance",
  });

  const { data: vat } = useQuery<VatReport>({
    queryKey: ["vat", year, quarter],
    queryFn: () => apiRequest(`/api/reports/vat${vatParams}`),
    enabled: tab === "vat",
  });

  const Filters = () => (
    <div className="flex flex-wrap gap-4 mb-4">
      <div className="grid gap-1.5">
        <Label className="text-xs">Jaar</Label>
        <Select value={year} onValueChange={setYear}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1.5">
        <Label className="text-xs">Kwartaal</Label>
        <Select value={quarter} onValueChange={setQuarter}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Heel jaar</SelectItem>
            {quarters.map((q) => <SelectItem key={q} value={String(q)}>Q{q}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Financieel rapport</h1>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="pnl">Winst & verlies</TabsTrigger>
          <TabsTrigger value="balance">Balans</TabsTrigger>
          <TabsTrigger value="vat">BTW-aangifte</TabsTrigger>
        </TabsList>

        {/* ── P&L ───────────────────────────────────────────────────────── */}
        <TabsContent value="pnl" className="mt-4 space-y-4">
          <Filters />
          {pnl && (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <Card>
                  <CardContent className="pt-5 pb-5">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Omzet</p>
                    <p className="text-3xl font-bold tabular-nums text-success">{fmt(pnl.revenue.total_cents)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-5 pb-5">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Kosten</p>
                    <p className="text-3xl font-bold tabular-nums text-destructive">{fmt(pnl.expenses.total_cents)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-5 pb-5">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Nettoresultaat</p>
                    <p className={`text-3xl font-bold tabular-nums ${pnl.net_profit_cents >= 0 ? "text-success" : "text-destructive"}`}>
                      {fmt(pnl.net_profit_cents)}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {pnl.fallback && (
                <p className="text-xs text-muted-foreground bg-muted/30 rounded-md px-3 py-2">
                  Gebaseerd op facturen en uitgaven — boek journaalposten voor een volledig dubbel rapport.
                </p>
              )}

              {!pnl.fallback && (
                <Card>
                  <CardContent className="p-0">
                    <div className="px-4 py-2 bg-success/10 border-b">
                      <span className="text-xs font-semibold uppercase tracking-wider text-success">Opbrengsten</span>
                    </div>
                    <Table>
                      <TableBody>
                        {pnl.revenue.lines.map((l) => (
                          <TableRow key={l.account_number}>
                            <TableCell className="w-16 font-mono text-sm text-muted-foreground">{l.account_number}</TableCell>
                            <TableCell>{l.name}</TableCell>
                            <TableCell className="text-right font-mono tabular-nums text-success">{fmt(l.net_cents)}</TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="border-t-2 font-semibold bg-muted/10">
                          <TableCell colSpan={2}>Totaal opbrengsten</TableCell>
                          <TableCell className="text-right font-mono tabular-nums text-success">{fmt(pnl.revenue.total_cents)}</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>

                    <div className="px-4 py-2 bg-destructive/10 border-b border-t">
                      <span className="text-xs font-semibold uppercase tracking-wider text-destructive">Kosten</span>
                    </div>
                    <Table>
                      <TableBody>
                        {pnl.expenses.lines.map((l) => (
                          <TableRow key={l.account_number}>
                            <TableCell className="w-16 font-mono text-sm text-muted-foreground">{l.account_number}</TableCell>
                            <TableCell>{l.name}</TableCell>
                            <TableCell className="text-right font-mono tabular-nums text-destructive">{fmt(l.net_cents)}</TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="border-t-2 font-semibold bg-muted/10">
                          <TableCell colSpan={2}>Totaal kosten</TableCell>
                          <TableCell className="text-right font-mono tabular-nums text-destructive">{fmt(pnl.expenses.total_cents)}</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>

                    <div className="border-t px-4 py-3 flex justify-between items-center font-bold">
                      <span>Nettoresultaat</span>
                      <span className={`font-mono tabular-nums text-lg ${pnl.net_profit_cents >= 0 ? "text-success" : "text-destructive"}`}>
                        {fmt(pnl.net_profit_cents)}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        {/* ── Balans ────────────────────────────────────────────────────── */}
        <TabsContent value="balance" className="mt-4 space-y-4">
          <Filters />
          {balance && (
            <>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm text-muted-foreground">Per {balance.as_of}</span>
                <Badge variant={balance.balanced ? "default" : "destructive"}>
                  {balance.balanced ? "In balans" : "Niet in balans"}
                </Badge>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {/* Activa */}
                <Card>
                  <CardContent className="p-0">
                    <div className="px-4 py-2 bg-muted/40 border-b">
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Activa</span>
                    </div>
                    <Table>
                      <TableBody>
                        {balance.assets.lines.map((l) => (
                          <TableRow key={l.account_number}>
                            <TableCell className="w-16 font-mono text-sm text-muted-foreground">{l.account_number}</TableCell>
                            <TableCell>{l.name}</TableCell>
                            <TableCell className="text-right font-mono tabular-nums">{fmt(l.balance_cents)}</TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="border-t-2 font-semibold bg-muted/10">
                          <TableCell colSpan={2}>Totaal activa</TableCell>
                          <TableCell className="text-right font-mono tabular-nums">{fmt(balance.assets.total_cents)}</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                {/* Passiva + Eigen vermogen */}
                <Card>
                  <CardContent className="p-0">
                    <div className="px-4 py-2 bg-muted/40 border-b">
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Passiva</span>
                    </div>
                    <Table>
                      <TableBody>
                        {balance.liabilities.lines.map((l) => (
                          <TableRow key={l.account_number}>
                            <TableCell className="w-16 font-mono text-sm text-muted-foreground">{l.account_number}</TableCell>
                            <TableCell>{l.name}</TableCell>
                            <TableCell className="text-right font-mono tabular-nums">{fmt(l.balance_cents)}</TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="border-t font-semibold bg-muted/5">
                          <TableCell colSpan={2}>Subtotaal schulden</TableCell>
                          <TableCell className="text-right font-mono tabular-nums">{fmt(balance.liabilities.total_cents)}</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>

                    <div className="px-4 py-2 bg-muted/40 border-y">
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Eigen vermogen</span>
                    </div>
                    <Table>
                      <TableBody>
                        {balance.equity.lines.map((l) => (
                          <TableRow key={l.account_number}>
                            <TableCell className="w-16 font-mono text-sm text-muted-foreground">{l.account_number}</TableCell>
                            <TableCell>{l.name}</TableCell>
                            <TableCell className="text-right font-mono tabular-nums">{fmt(l.balance_cents)}</TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="border-t-2 font-semibold bg-muted/10">
                          <TableCell colSpan={2}>Totaal passiva + EV</TableCell>
                          <TableCell className="text-right font-mono tabular-nums">
                            {fmt(balance.liabilities.total_cents + balance.equity.total_cents)}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </TabsContent>

        {/* ── BTW ───────────────────────────────────────────────────────── */}
        <TabsContent value="vat" className="mt-4 space-y-4">
          <Filters />
          {vat && (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <Card>
                  <CardContent className="pt-5 pb-5">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">BTW ontvangen</p>
                    <p className="text-3xl font-bold tabular-nums text-success">{fmt(vat.vat_charged_cents)}</p>
                    <p className="text-xs text-muted-foreground mt-1">op uitgaande facturen</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-5 pb-5">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">BTW voorbelasting</p>
                    <p className="text-3xl font-bold tabular-nums">{fmt(vat.vat_recovery_cents)}</p>
                    <p className="text-xs text-muted-foreground mt-1">op inkomende kosten</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-5 pb-5">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Te betalen BTW</p>
                    <p className={`text-3xl font-bold tabular-nums ${vat.vat_payable_cents > 0 ? "text-destructive" : "text-success"}`}>
                      {fmt(vat.vat_payable_cents)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {vat.period.quarter ? `Q${vat.period.quarter} ${vat.period.year}` : `Heel ${vat.period.year}`}
                    </p>
                  </CardContent>
                </Card>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardContent className="p-0">
                    <div className="px-4 py-2 bg-muted/40 border-b">
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Uitgaande BTW (facturen)</span>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Tarief</TableHead>
                          <TableHead className="text-right">Netto</TableHead>
                          <TableHead className="text-right">BTW</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {vat.invoice_lines.map((l, i) => (
                          <TableRow key={i}>
                            <TableCell>{l.btw_percentage ?? 0}%</TableCell>
                            <TableCell className="text-right font-mono tabular-nums">{fmt(l.subtotal_cents ?? 0)}</TableCell>
                            <TableCell className="text-right font-mono tabular-nums text-success">{fmt(l.btw_cents ?? 0)}</TableCell>
                          </TableRow>
                        ))}
                        {!vat.invoice_lines.length && (
                          <TableRow><TableCell colSpan={3} className="text-center text-sm text-muted-foreground py-4">Geen data</TableCell></TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-0">
                    <div className="px-4 py-2 bg-muted/40 border-b">
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Inkomende BTW (uitgaven)</span>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Tarief</TableHead>
                          <TableHead className="text-right">Netto</TableHead>
                          <TableHead className="text-right">BTW</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {vat.expense_lines.map((l, i) => (
                          <TableRow key={i}>
                            <TableCell>{l.vat_rate ?? 0}%</TableCell>
                            <TableCell className="text-right font-mono tabular-nums">{fmt(l.excl_cents ?? 0)}</TableCell>
                            <TableCell className="text-right font-mono tabular-nums">{fmt(l.vat_cents ?? 0)}</TableCell>
                          </TableRow>
                        ))}
                        {!vat.expense_lines.length && (
                          <TableRow><TableCell colSpan={3} className="text-center text-sm text-muted-foreground py-4">Geen data</TableCell></TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
