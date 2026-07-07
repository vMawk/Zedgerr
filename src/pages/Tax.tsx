import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";

// IB 2025 — box 1 schijven (beneden AOW-leeftijd)
const IB_2025 = [
  { limit: 38441, rate: 0.3697 },
  { limit: 76817, rate: 0.3748 },
  { limit: Infinity, rate: 0.495 },
];

// Algemene heffingskorting 2025 (benadering)
function ahk2025(inkomen: number): number {
  const max = 3483;
  const afbouwStart = 23941;
  const afbouwTarief = 0.06083;
  if (inkomen <= afbouwStart) return max;
  const reduction = (inkomen - afbouwStart) * afbouwTarief;
  return Math.max(0, max - reduction);
}

function calcIB(belastbaarInkomen: number): number {
  if (belastbaarInkomen <= 0) return 0;
  let ib = 0;
  let prev = 0;
  for (const { limit, rate } of IB_2025) {
    const slice = Math.min(belastbaarInkomen, limit) - prev;
    if (slice <= 0) break;
    ib += slice * rate;
    prev = limit;
  }
  return Math.round(ib * 100) / 100;
}

function fmt(n: number): string {
  return n.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function quarterRange(year: number, q: number): [string, string] {
  const starts = ["01-01", "04-01", "07-01", "10-01"];
  const ends   = ["03-31", "06-30", "09-30", "12-31"];
  return [`${year}-${starts[q - 1]}`, `${year}-${ends[q - 1]}`];
}

function currentQuarter(): number {
  return Math.ceil((new Date().getMonth() + 1) / 3);
}

// --- BTW-aangifte ---
function BtwTab() {
  const { user } = useAuth();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [quarter, setQuarter] = useState(currentQuarter());
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

  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);
  const teBetalen = data ? data.saldo_btw > 0 : false;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-4 items-end">
        <div className="grid gap-1.5">
          <Label className="text-xs text-muted-foreground">Jaar</Label>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-28 h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs text-muted-foreground">Kwartaal</Label>
          <Select value={String(quarter)} onValueChange={(v) => setQuarter(Number(v))}>
            <SelectTrigger className="w-32 h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Q1 (jan–mrt)</SelectItem>
              <SelectItem value="2">Q2 (apr–jun)</SelectItem>
              <SelectItem value="3">Q3 (jul–sep)</SelectItem>
              <SelectItem value="4">Q4 (okt–dec)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Laden…</p>}

      {data && !loading && (
        <div className="space-y-4">
          {/* Rubriek 1a: verkoop */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Rubriek 1a — Verkoop (omzet belast met BTW)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Omzet excl. BTW</span>
                <span className="font-medium tabular-nums">€{fmt(data.verkoop_omzet)}</span>
              </div>
              <div className="flex justify-between border-t pt-2">
                <span className="font-medium">BTW op verkopen (te voldoen)</span>
                <span className="font-bold tabular-nums text-destructive/90">€{fmt(data.verkoop_btw)}</span>
              </div>
            </CardContent>
          </Card>

          {/* Rubriek 5b: inkoop */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Rubriek 5b — Voorbelasting (BTW op inkopen)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Inkopen excl. BTW</span>
                <span className="font-medium tabular-nums">€{fmt(data.inkoop_excl)}</span>
              </div>
              <div className="flex justify-between border-t pt-2">
                <span className="font-medium">BTW op inkopen (aftrekbaar)</span>
                <span className="font-bold tabular-nums text-success">€{fmt(data.inkoop_btw)}</span>
              </div>
            </CardContent>
          </Card>

          {/* Saldo */}
          <Card className={teBetalen ? "border-destructive/40 bg-destructive/5" : "border-success/40 bg-success/5"}>
            <CardContent className="pt-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Saldo BTW</p>
                  <p className="text-2xl font-bold tabular-nums">€{fmt(Math.abs(data.saldo_btw))}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {teBetalen ? "Te betalen aan Belastingdienst" : "Te ontvangen van Belastingdienst"}
                  </p>
                </div>
                <Badge variant="secondary" className={teBetalen ? "bg-destructive/10 text-destructive text-sm px-3 py-1" : "bg-success/10 text-success text-sm px-3 py-1"}>
                  {teBetalen ? "Te betalen" : "Te ontvangen"}
                </Badge>
              </div>
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground">
            Verkoop-BTW: facturen met status <em>verzonden</em> of <em>betaald</em> in dit kwartaal.
            Inkoop-BTW: uitgaven geregistreerd in dit kwartaal. Dit overzicht is een hulpmiddel — controleer altijd in het portaal van de Belastingdienst.
          </p>
        </div>
      )}
    </div>
  );
}

// --- Winst & verlies ---
function ProfitTab() {
  const { user } = useAuth();
  const currentYear = new Date().getFullYear();
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

  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);
  const margin = data && data.omzet > 0 ? Math.round((data.winst / data.omzet) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="grid gap-1.5 w-28">
        <Label className="text-xs text-muted-foreground">Jaar</Label>
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Laden…</p>}

      {data && !loading && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Omzet (betaalde facturen)</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold tabular-nums">€{fmt(data.omzet)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Totaal kosten</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold tabular-nums">€{fmt(data.totaal_kosten)}</p>
              </CardContent>
            </Card>
            <Card className={data.winst >= 0 ? "border-success/40" : "border-destructive/40"}>
              <CardHeader className="pb-1">
                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Winst voor belasting</CardTitle>
              </CardHeader>
              <CardContent>
                <p className={`text-2xl font-bold tabular-nums ${data.winst >= 0 ? "text-success" : "text-destructive"}`}>
                  €{fmt(data.winst)}
                </p>
                {data.omzet > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">{margin}% marge</p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="pt-5 space-y-3 text-sm">
              <div className="flex justify-between py-1">
                <span className="font-medium">Omzet (excl. BTW)</span>
                <span className="font-medium tabular-nums">+ €{fmt(data.omzet)}</span>
              </div>
              <div className="flex justify-between py-1 text-muted-foreground">
                <span>Inkoop / uitgaven (excl. BTW)</span>
                <span className="tabular-nums">− €{fmt(data.inkoop_kosten)}</span>
              </div>
              <div className="flex justify-between py-1 text-muted-foreground">
                <span>Zakelijke abonnementen (betaald)</span>
                <span className="tabular-nums">− €{fmt(data.abonnement_kosten)}</span>
              </div>
              {data.km_kosten > 0 && (
                <div className="flex justify-between py-1 text-muted-foreground">
                  <span>Kilometervergoeding (€0,23/km)</span>
                  <span className="tabular-nums">− €{fmt(data.km_kosten)}</span>
                </div>
              )}
              <div className="flex justify-between py-2 border-t font-bold text-base">
                <span>Winst voor belasting</span>
                <span className={`tabular-nums ${data.winst >= 0 ? "text-success" : "text-destructive"}`}>
                  €{fmt(data.winst)}
                </span>
              </div>
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground">
            Omzet = facturen met status <em>betaald</em> in {year}. Kosten = geregistreerde uitgaven + betaalde zakelijke abonnementen in {year}.
            Privé-abonnementen tellen niet mee als zakelijke kosten.
          </p>
        </div>
      )}
    </div>
  );
}

// --- Belastingschatting ---
function TaxEstimateTab() {
  const currentYear = new Date().getFullYear();
  const [winst, setWinst] = useState("");
  const [jaar, setJaar] = useState(currentYear);
  const [zelfstandigenaftrek, setZelfstandigenaftrek] = useState("2470");
  const [startersaftrek, setStartersaftrek] = useState(false);
  const [startersAftrekBedrag] = useState("2123");
  const [mkbPct, setMkbPct] = useState("13.31");
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

  const winstNum = parseFloat(winst) || 0;
  const zelfstandigenNum = parseFloat(zelfstandigenaftrek) || 0;
  const startersNum = startersaftrek ? (parseFloat(startersAftrekBedrag) || 0) : 0;
  const mkbPctNum = parseFloat(mkbPct) || 0;

  const winstNaZelfstandigen = Math.max(0, winstNum - zelfstandigenNum - startersNum);
  const mkbVrijstelling = Math.round(winstNaZelfstandigen * (mkbPctNum / 100) * 100) / 100;
  const belastbaarInkomen = Math.max(0, winstNaZelfstandigen - mkbVrijstelling);
  const ibBruto = calcIB(belastbaarInkomen);
  const ahk = ahk2025(belastbaarInkomen);
  const ibNetto = Math.max(0, ibBruto - ahk);
  const effectiefTarief = winstNum > 0 ? Math.round((ibNetto / winstNum) * 1000) / 10 : 0;
  const opzijZetten = winstNum > 0 ? Math.round((ibNetto / winstNum) * 100) : 0;

  return (
    <div className="space-y-6 max-w-xl">
      <p className="text-sm text-muted-foreground">
        Ruwe schatting voor ZZP / eenmanszaak. Tarieven {jaar}. Geen rekening gehouden met arbeidskorting, heffingskortingen op toeslagen, of box 3 vermogen.
      </p>

      <div className="grid gap-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="grid gap-2">
            <Label>Winst voor belasting (€)</Label>
            <Input type="number" step="100" min="0" placeholder="bijv. 45000" value={winst} onChange={(e) => setWinst(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>Jaar</Label>
            <Select value={String(jaar)} onValueChange={(v) => setJaar(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="grid gap-2">
            <Label>Zelfstandigenaftrek (€)</Label>
            <Input type="number" step="10" min="0" value={zelfstandigenaftrek} onChange={(e) => setZelfstandigenaftrek(e.target.value)} />
            <p className="text-xs text-muted-foreground">€2.470 in 2025 (afgebouwd t/m 2027)</p>
          </div>
          <div className="grid gap-2">
            <Label>MKB-winstvrijstelling (%)</Label>
            <Input type="number" step="0.01" min="0" max="100" value={mkbPct} onChange={(e) => setMkbPct(e.target.value)} />
            <p className="text-xs text-muted-foreground">13,31% in 2024/2025</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Checkbox id="starters" checked={startersaftrek} onCheckedChange={(v) => setStartersaftrek(v === true)} />
          <Label htmlFor="starters" className="cursor-pointer">
            Startersaftrek toepassen (€{parseInt(startersAftrekBedrag).toLocaleString("nl-NL")} — alleen eerste 3 jaar)
          </Label>
        </div>
      </div>

      {winstNum > 0 && (
        <Card>
          <CardContent className="pt-5 space-y-2 text-sm">
            <div className="flex justify-between py-1">
              <span className="text-muted-foreground">Winst voor belasting</span>
              <span className="tabular-nums">€{fmt(winstNum)}</span>
            </div>
            <div className="flex justify-between py-1 text-muted-foreground">
              <span>Zelfstandigenaftrek</span>
              <span className="tabular-nums">− €{fmt(zelfstandigenNum)}</span>
            </div>
            {startersaftrek && (
              <div className="flex justify-between py-1 text-muted-foreground">
                <span>Startersaftrek</span>
                <span className="tabular-nums">− €{fmt(startersNum)}</span>
              </div>
            )}
            <div className="flex justify-between py-1 text-muted-foreground">
              <span>MKB-winstvrijstelling ({mkbPctNum}%)</span>
              <span className="tabular-nums">− €{fmt(mkbVrijstelling)}</span>
            </div>
            <div className="flex justify-between py-2 border-t font-medium">
              <span>Belastbaar inkomen</span>
              <span className="tabular-nums">€{fmt(belastbaarInkomen)}</span>
            </div>
            <div className="flex justify-between py-1 text-muted-foreground">
              <span>IB vóór heffingskortingen</span>
              <span className="tabular-nums">€{fmt(ibBruto)}</span>
            </div>
            <div className="flex justify-between py-1 text-muted-foreground">
              <span>Algemene heffingskorting (schatting)</span>
              <span className="tabular-nums">− €{fmt(ahk)}</span>
            </div>
            <div className="flex justify-between py-2 border-t font-bold text-base">
              <span>Geschatte inkomstenbelasting</span>
              <span className="tabular-nums text-destructive/90">€{fmt(ibNetto)}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {winstNum > 0 && (
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground mb-1">Effectief tarief op winst</p>
              <p className="text-2xl font-bold">{effectiefTarief}%</p>
            </CardContent>
          </Card>
          <Card className="border-amber-400/40 bg-amber-50/40 dark:bg-amber-950/20">
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground mb-1">Zet opzij van elke euro winst</p>
              <p className="text-2xl font-bold text-amber-700 dark:text-amber-400">{opzijZetten}%</p>
            </CardContent>
          </Card>
        </div>
      )}

      {winstNum > 0 && (
        <p className="text-xs text-muted-foreground">
          Schijven {jaar}: t/m €38.441 → 36,97% · €38.441–€76.817 → 37,48% · &gt;€76.817 → 49,50%.
          Arbeidskorting is hier <em>niet</em> meegenomen — die verlaagt de IB verder.
          Raadpleeg een boekhouder voor je definitieve aangifte.
        </p>
      )}
    </div>
  );
}

export default function Tax() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Belasting</h1>
      <Tabs defaultValue="btw">
        <TabsList>
          <TabsTrigger value="btw">BTW-aangifte</TabsTrigger>
          <TabsTrigger value="wv">Winst &amp; verlies</TabsTrigger>
          <TabsTrigger value="ib">Belastingschatting</TabsTrigger>
        </TabsList>
        <TabsContent value="btw" className="mt-6"><BtwTab /></TabsContent>
        <TabsContent value="wv" className="mt-6"><ProfitTab /></TabsContent>
        <TabsContent value="ib" className="mt-6"><TaxEstimateTab /></TabsContent>
      </Tabs>
    </div>
  );
}
