import { useState } from "react";
import { useTaxSettings } from "@/lib/tax";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../lib/api";
import { Card, CardContent } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";

interface Account {
  id: string;
  account_number: string;
  name: string;
  account_type: "assets" | "liabilities" | "equity" | "revenue" | "expenses";
  is_system: number;
  active: number;
  description: string | null;
}

interface Period {
  id: string;
  year: number;
  period: number;
  period_type: "month" | "quarter";
  status: "open" | "locked";
  starts_on: string;
  ends_on: string;
}

interface JournalEntry {
  id: string;
  entry_date: string;
  description: string;
  reference: string | null;
  reference_type: string | null;
  created_at: string;
}

interface TrialBalance {
  account_number: string;
  name: string;
  account_type: string;
  total_debit_cents: number;
  total_credit_cents: number;
  balance_cents: number;
}

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  assets: "Assets",
  liabilities: "Liabilities",
  equity: "Equity",
  revenue: "Revenue",
  expenses: "Expenses",
};

const ACCOUNT_TYPE_ORDER = ["assets", "liabilities", "equity", "revenue", "expenses"];

const MONTH_NAMES = [
  "", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export default function Boekhouding() {
  const { currency } = useTaxSettings();
  const formatCents = (cents: number) => new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100);
  const [activeTab, setActiveTab] = useState("rekeningschema");

  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ["accounts"],
    queryFn: () => apiRequest("/api/accounts"),
  });

  const { data: periods = [] } = useQuery<Period[]>({
    queryKey: ["periods"],
    queryFn: () => apiRequest("/api/periods"),
  });

  const { data: entries = [] } = useQuery<JournalEntry[]>({
    queryKey: ["journal-entries"],
    queryFn: () => apiRequest("/api/journal-entries?limit=50"),
  });

  const { data: trialBalance = [] } = useQuery<TrialBalance[]>({
    queryKey: ["trial-balance"],
    queryFn: () => apiRequest("/api/trial-balance"),
  });

  const accountsByType = ACCOUNT_TYPE_ORDER.reduce<Record<string, Account[]>>((acc, type) => {
    acc[type] = accounts.filter((a) => a.account_type === type);
    return acc;
  }, {});

  const totalDebit = trialBalance.reduce((s, r) => s + r.total_debit_cents, 0);
  const totalCredit = trialBalance.reduce((s, r) => s + r.total_credit_cents, 0);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Accounting</h1>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="rekeningschema">Chart of accounts</TabsTrigger>
          <TabsTrigger value="journaal">Journal entries</TabsTrigger>
          <TabsTrigger value="perioden">Periods</TabsTrigger>
          <TabsTrigger value="saldibalans">Trial balance</TabsTrigger>
        </TabsList>

        {/* Chart of accounts */}
        <TabsContent value="rekeningschema" className="mt-4">
          <Card>
            <CardContent className="p-0">
              {ACCOUNT_TYPE_ORDER.map((type) => {
                const list = accountsByType[type] ?? [];
                if (!list.length) return null;
                return (
                  <div key={type}>
                    <div className="px-4 py-2 bg-muted/40 border-b">
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {ACCOUNT_TYPE_LABELS[type]}
                      </span>
                    </div>
                    <Table>
                      <TableBody>
                        {list.map((acct) => (
                          <TableRow key={acct.id} className={acct.active ? "" : "opacity-40"}>
                            <TableCell className="w-20 font-mono text-sm text-muted-foreground">
                              {acct.account_number}
                            </TableCell>
                            <TableCell className="font-medium">{acct.name}</TableCell>
                            <TableCell className="text-muted-foreground text-sm hidden md:table-cell">
                              {acct.description}
                            </TableCell>
                            <TableCell className="text-right">
                              {acct.is_system ? (
                                <Badge variant="secondary" className="text-xs">system</Badge>
                              ) : null}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                );
              })}
              {accounts.length === 0 && (
                <p className="p-6 text-sm text-muted-foreground text-center">
                  No accounts found. Create an account to load the default chart of accounts.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Journal entries */}
        <TabsContent value="journaal" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Type</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="font-mono text-sm whitespace-nowrap">
                        {e.entry_date}
                      </TableCell>
                      <TableCell>{e.description}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{e.reference}</TableCell>
                      <TableCell>
                        {e.reference_type && (
                          <Badge variant="outline" className="text-xs">
                            {e.reference_type}
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {entries.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-8">
                        No journal entries yet
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Periods */}
        <TabsContent value="perioden" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Period</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>From</TableHead>
                    <TableHead>To</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {periods.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">
                        {p.period_type === "month"
                          ? `${MONTH_NAMES[p.period]} ${p.year}`
                          : `Q${p.period} ${p.year}`}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {p.period_type === "month" ? "Month" : "Quarter"}
                      </TableCell>
                      <TableCell className="font-mono text-sm">{p.starts_on}</TableCell>
                      <TableCell className="font-mono text-sm">{p.ends_on}</TableCell>
                      <TableCell>
                        <Badge
                          variant={p.status === "locked" ? "destructive" : "default"}
                          className="text-xs"
                        >
                          {p.status === "locked" ? "Locked" : "Open"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" disabled>
                          {p.status === "open" ? "Close" : "Reopen"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {periods.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
                        No periods created yet
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Trial balance */}
        <TabsContent value="saldibalans" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Number</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead className="text-right">Debit</TableHead>
                    <TableHead className="text-right">Credit</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {trialBalance.map((row) => (
                    <TableRow key={row.account_number}>
                      <TableCell className="font-mono text-sm text-muted-foreground">
                        {row.account_number}
                      </TableCell>
                      <TableCell>{row.name}</TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums">
                        {row.total_debit_cents ? formatCents(row.total_debit_cents) : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums">
                        {row.total_credit_cents ? formatCents(row.total_credit_cents) : "—"}
                      </TableCell>
                      <TableCell
                        className={`text-right font-mono text-sm tabular-nums font-medium ${
                          row.balance_cents > 0
                            ? "text-success"
                            : row.balance_cents < 0
                              ? "text-destructive"
                              : "text-muted-foreground"
                        }`}
                      >
                        {formatCents(row.balance_cents)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {trialBalance.length > 0 && (
                    <TableRow className="border-t-2 font-semibold bg-muted/20">
                      <TableCell colSpan={2}>Total</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{formatCents(totalDebit)}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{formatCents(totalCredit)}</TableCell>
                      <TableCell
                        className={`text-right font-mono tabular-nums ${
                          totalDebit === totalCredit ? "text-success" : "text-destructive"
                        }`}
                      >
                        {formatCents(totalDebit - totalCredit)}
                      </TableCell>
                    </TableRow>
                  )}
                  {trialBalance.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                        No transactions posted
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
