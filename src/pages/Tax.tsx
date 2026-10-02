import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { useTaxSettings } from "@/lib/tax";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

function fmt(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function quarterRange(year: number, q: number): [string, string] {
  const starts = ["01-01", "04-01", "07-01", "10-01"];
  const ends = ["03-31", "06-30", "09-30", "12-31"];
  return [`${year}-${starts[q - 1]}`, `${year}-${ends[q - 1]}`];
}

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => currentYear - i);

function YearSelect({ value, onChange }: { value: number; onChange: (y: number) => void }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs text-muted-foreground">Year</Label>
      <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
        <SelectTrigger className="w-28 h-8 text-sm"><SelectValue /></SelectTrigger>
        <SelectContent>
          {YEARS.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function Row({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: "pay" | "reclaim" }) {
  return (
    <div className={`flex justify-between gap-4 ${strong ? "border-t pt-2 font-medium" : ""}`}>
      <span className={strong ? "" : "text-muted-foreground"}>{label}</span>
      <span
        className={`tabular-nums ${strong ? "font-bold" : "font-medium"} ${
          tone === "pay" ? "text-destructive/90" : tone === "reclaim" ? "text-success" : ""
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function TaxSummaryTab() {
  const { user } = useAuth();
  const { taxName, currencySymbol: cs } = useTaxSettings();
  const [year, setYear] = useState(currentYear);
  const [quarter, setQuarter] = useState(Math.ceil((new Date().getMonth() + 1) / 3));
  const [data, setData] = useState<{
    verkoop_omzet: number; verkoop_btw: number;
    inkoop_excl: number; inkoop_btw: number; saldo_btw: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    const [from, to] = quarterRange(year, quarter);
    setLoading(true);
    api.getTaxReport(from, to).then(setData).finally(() => setLoading(false));
  }, [user, year, quarter]);

  const payable = data ? data.saldo_btw > 0 : false;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-4 items-end">
        <YearSelect value={year} onChange={setYear} />
        <div className="grid gap-1.5">
          <Label className="text-xs text-muted-foreground">Quarter</Label>
          <Select value={String(quarter)} onValueChange={(v) => setQuarter(Number(v))}>
            <SelectTrigger className="w-32 h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Q1 (Jan–Mar)</SelectItem>
              <SelectItem value="2">Q2 (Apr–Jun)</SelectItem>
              <SelectItem value="3">Q3 (Jul–Sep)</SelectItem>
              <SelectItem value="4">Q4 (Oct–Dec)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {data && !loading && (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Sales</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Row label={`Sales excl. ${taxName}`} value={`${cs}${fmt(data.verkoop_omzet)}`} />
                <Row label={`${taxName} charged (output tax)`} value={`${cs}${fmt(data.verkoop_btw)}`} strong tone="pay" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Purchases</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Row label={`Purchases excl. ${taxName}`} value={`${cs}${fmt(data.inkoop_excl)}`} />
                <Row label={`${taxName} paid (input tax)`} value={`${cs}${fmt(data.inkoop_btw)}`} strong tone="reclaim" />
              </CardContent>
            </Card>
          </div>

          <Card className={payable ? "border-destructive/40 bg-destructive/5" : "border-success/40 bg-success/5"}>
            <CardContent className="pt-5 flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">{taxName} balance for Q{quarter} {year}</p>
                <p className="text-2xl font-bold tabular-nums">{cs}{fmt(Math.abs(data.saldo_btw))}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {payable ? "Set this aside: you owe it to your tax authority." : "You can reclaim this from your tax authority."}
                </p>
              </div>
              <Badge
                variant="secondary"
                className={payable ? "bg-destructive/10 text-destructive text-sm px-3 py-1" : "bg-success/10 text-success text-sm px-3 py-1"}
              >
                {payable ? "To pay" : "To reclaim"}
              </Badge>
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground max-w-prose">
            Output tax comes from invoices marked sent or paid in this quarter; input tax from expenses recorded in this quarter.
            Reverse-charge and tax-exempt invoices carry no tax. Filing periods and rules differ per country, so treat this as a
            working overview and check it against your tax authority's return before you file.
          </p>
        </div>
      )}
    </div>
  );
}

function ProfitTab() {
  const { user } = useAuth();
  const { taxName, currencySymbol: cs, distanceUnit } = useTaxSettings();
  const [year, setYear] = useState(currentYear);
  const [data, setData] = useState<{
    omzet: number; inkoop_kosten: number; abonnement_kosten: number;
    km_kosten: number; totaal_kosten: number; winst: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    api.getProfitReport(year).then(setData).finally(() => setLoading(false));
  }, [user, year]);

  const margin = data && data.omzet > 0 ? Math.round((data.winst / data.omzet) * 100) : 0;

  return (
    <div className="space-y-6">
      <YearSelect value={year} onChange={setYear} />

      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {data && !loading && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { label: "Revenue (paid invoices)", value: data.omzet },
              { label: "Total costs", value: data.totaal_kosten },
            ].map((k) => (
              <Card key={k.label}>
                <CardHeader className="pb-1">
                  <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{k.label}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold tabular-nums">{cs}{fmt(k.value)}</p>
                </CardContent>
              </Card>
            ))}
            <Card className={data.winst >= 0 ? "border-success/40" : "border-destructive/40"}>
              <CardHeader className="pb-1">
                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Profit before tax</CardTitle>
              </CardHeader>
              <CardContent>
                <p className={`text-2xl font-bold tabular-nums ${data.winst >= 0 ? "text-success" : "text-destructive"}`}>
                  {cs}{fmt(data.winst)}
                </p>
                {data.omzet > 0 && <p className="text-xs text-muted-foreground mt-1">{margin}% margin</p>}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="pt-5 space-y-3 text-sm">
              <Row label={`Revenue (excl. ${taxName})`} value={`+ ${cs}${fmt(data.omzet)}`} />
              <Row label={`Purchases and expenses (excl. ${taxName})`} value={`− ${cs}${fmt(data.inkoop_kosten)}`} />
              <Row label="Business subscriptions (paid)" value={`− ${cs}${fmt(data.abonnement_kosten)}`} />
              {data.km_kosten > 0 && <Row label={`Mileage allowance (business ${distanceUnit})`} value={`− ${cs}${fmt(data.km_kosten)}`} />}
              <Row label="Profit before tax" value={`${cs}${fmt(data.winst)}`} strong />
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground max-w-prose">
            Revenue counts invoices marked paid in {year}. Costs are recorded expenses, paid business subscriptions and business
            mileage at the rate set in Settings. Personal subscriptions and trips are not included.
          </p>
        </div>
      )}
    </div>
  );
}

export default function Tax() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Tax</h1>
      <Tabs defaultValue="summary">
        <TabsList>
          <TabsTrigger value="summary">Tax summary</TabsTrigger>
          <TabsTrigger value="profit">Profit &amp; loss</TabsTrigger>
        </TabsList>
        <TabsContent value="summary" className="mt-6"><TaxSummaryTab /></TabsContent>
        <TabsContent value="profit" className="mt-6"><ProfitTab /></TabsContent>
      </Tabs>
    </div>
  );
}
