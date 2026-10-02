import { useState } from "react";
import { useTaxSettings } from "@/lib/tax";
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
  const { taxName, currency } = useTaxSettings();
  const fmt = (cents: number) => new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100);
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
        <Label className="text-xs">Year</Label>
        <Select value={year} onValueChange={setYear}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1.5">
        <Label className="text-xs">Quarter</Label>
        <Select value={quarter} onValueChange={setQuarter}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Full year</SelectItem>
            {quarters.map((q) => <SelectItem key={q} value={String(q)}>Q{q}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Financial report</h1>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="pnl">Profit & loss</TabsTrigger>
          <TabsTrigger value="balance">Balance sheet</TabsTrigger>
          <TabsTrigger value="vat">{taxName} summary</TabsTrigger>
        </TabsList>

        {/* Profit and loss */}
        <TabsContent value="pnl" className="mt-4 space-y-4">
          <Filters />
          {pnl && (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <Card>
                  <CardContent className="pt-5 pb-5">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Revenue</p>
                    <p className="text-3xl font-bold tabular-nums text-success">{fmt(pnl.revenue.total_cents)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-5 pb-5">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Expenses</p>
                    <p className="text-3xl font-bold tabular-nums text-destructive">{fmt(pnl.expenses.total_cents)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-5 pb-5">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Net result</p>
                    <p className={`text-3xl font-bold tabular-nums ${pnl.net_profit_cents >= 0 ? "text-success" : "text-destructive"}`}>
                      {fmt(pnl.net_profit_cents)}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {pnl.fallback && (
                <p className="text-xs text-muted-foreground bg-muted/30 rounded-md px-3 py-2">
                  Based on invoices and expenses — post journal entries for a full double-entry report.
                </p>
              )}

              {!pnl.fallback && (
                <Card>
                  <CardContent className="p-0">
                    <div className="px-4 py-2 bg-success/10 border-b">
                      <span className="text-xs font-semibold uppercase tracking-wider text-success">Revenue</span>
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
                          <TableCell colSpan={2}>Total revenue</TableCell>
                          <TableCell className="text-right font-mono tabular-nums text-success">{fmt(pnl.revenue.total_cents)}</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>

                    <div className="px-4 py-2 bg-destructive/10 border-b border-t">
                      <span className="text-xs font-semibold uppercase tracking-wider text-destructive">Expenses</span>
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
                          <TableCell colSpan={2}>Total expenses</TableCell>
                          <TableCell className="text-right font-mono tabular-nums text-destructive">{fmt(pnl.expenses.total_cents)}</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>

                    <div className="border-t px-4 py-3 flex justify-between items-center font-bold">
                      <span>Net result</span>
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

        {/* Balance sheet */}
        <TabsContent value="balance" className="mt-4 space-y-4">
          <Filters />
          {balance && (
            <>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm text-muted-foreground">Per {balance.as_of}</span>
                <Badge variant={balance.balanced ? "default" : "destructive"}>
                  {balance.balanced ? "Balanced" : "Not balanced"}
                </Badge>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {/* Assets */}
                <Card>
                  <CardContent className="p-0">
                    <div className="px-4 py-2 bg-muted/40 border-b">
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Assets</span>
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
                          <TableCell colSpan={2}>Total assets</TableCell>
                          <TableCell className="text-right font-mono tabular-nums">{fmt(balance.assets.total_cents)}</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                {/* Liabilities and equity */}
                <Card>
                  <CardContent className="p-0">
                    <div className="px-4 py-2 bg-muted/40 border-b">
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Liabilities</span>
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
                          <TableCell colSpan={2}>Subtotal liabilities</TableCell>
                          <TableCell className="text-right font-mono tabular-nums">{fmt(balance.liabilities.total_cents)}</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>

                    <div className="px-4 py-2 bg-muted/40 border-y">
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Equity</span>
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
                          <TableCell colSpan={2}>Total liabilities + equity</TableCell>
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

        {/* Tax */}
        <TabsContent value="vat" className="mt-4 space-y-4">
          <Filters />
          {vat && (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <Card>
                  <CardContent className="pt-5 pb-5">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">{taxName} charged</p>
                    <p className="text-3xl font-bold tabular-nums text-success">{fmt(vat.vat_charged_cents)}</p>
                    <p className="text-xs text-muted-foreground mt-1">on outgoing invoices</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-5 pb-5">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">{taxName} paid</p>
                    <p className="text-3xl font-bold tabular-nums">{fmt(vat.vat_recovery_cents)}</p>
                    <p className="text-xs text-muted-foreground mt-1">on incoming costs</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-5 pb-5">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">{taxName} payable</p>
                    <p className={`text-3xl font-bold tabular-nums ${vat.vat_payable_cents > 0 ? "text-destructive" : "text-success"}`}>
                      {fmt(vat.vat_payable_cents)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {vat.period.quarter ? `Q${vat.period.quarter} ${vat.period.year}` : `Full ${vat.period.year}`}
                    </p>
                  </CardContent>
                </Card>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardContent className="p-0">
                    <div className="px-4 py-2 bg-muted/40 border-b">
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Output {taxName} (invoices)</span>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Rate</TableHead>
                          <TableHead className="text-right">Net</TableHead>
                          <TableHead className="text-right">{taxName}</TableHead>
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
                          <TableRow><TableCell colSpan={3} className="text-center text-sm text-muted-foreground py-4">No data</TableCell></TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-0">
                    <div className="px-4 py-2 bg-muted/40 border-b">
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Input {taxName} (expenses)</span>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Rate</TableHead>
                          <TableHead className="text-right">Net</TableHead>
                          <TableHead className="text-right">Tax</TableHead>
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
                          <TableRow><TableCell colSpan={3} className="text-center text-sm text-muted-foreground py-4">No data</TableCell></TableRow>
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
