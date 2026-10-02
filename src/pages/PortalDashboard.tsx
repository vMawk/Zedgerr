import { useEffect, useMemo, useState } from "react";
import { ZedgerrLogo } from "@/components/ZedgerrLogo";
import { currencySymbol } from "@/lib/tax";
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
import { useToast } from "@/hooks/use-toast";
import { LogOut, Clock, FileText, Download, Settings, Loader2 } from "lucide-react";
import { generateInvoicePDF } from "@/lib/pdf";

function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

function invoiceStatusLabel(status: string): string {
  const m: Record<string, string> = {
    concept: "Draft",
    verzonden: "Open",
    betaald: "Paid",
    vervallen: "Void",
  };
  return m[status] ?? status;
}

type TimeRow = PortalDashboard["timeEntries"][number];

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
    if (newPw.length < 8) {
      toast({ title: "New password too short", description: "At least 8 characters.", variant: "destructive" });
      return;
    }
    if (newPw !== confirmPw) {
      toast({ title: "Passwords do not match", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await portalChangePassword(currentPw, newPw);
      toast({ title: "Password updated", description: "Use your new password next time you sign in." });
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
    } catch (err: unknown) {
      toast({
        title: "Failed",
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
        <CardDescription>Change the password for your client portal.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {portalEmail && (
            <div className="space-y-1">
              <Label className="text-muted-foreground">Sign-in email</Label>
              <p className="text-sm font-medium">{portalEmail}</p>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="portal-current-pw">Current password</Label>
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
            <Label htmlFor="portal-new-pw">New password</Label>
            <Input
              id="portal-new-pw"
              type="password"
              autoComplete="new-password"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              required
              minLength={8}
            />
            <p className="text-xs text-muted-foreground">At least 8 characters.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="portal-confirm-pw">Confirm new password</Label>
            <Input
              id="portal-confirm-pw"
              type="password"
              autoComplete="new-password"
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              required
              minLength={8}
            />
          </div>
          <Button type="submit" disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Save password
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

/** Lage, rustige staafjes per maand — alleen ter indicatie. */
function SubtleHoursTrend({ entries }: { entries: TimeRow[] }) {
  const data = useMemo(() => {
    const byMonth = new Map<string, number>();
    for (const row of entries) {
      const key = row.date.slice(0, 7);
      byMonth.set(key, (byMonth.get(key) ?? 0) + Number(row.hours));
    }
    return [...byMonth.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, hours]) => ({ key: month, label: monthLabel(month), value: hours }));
  }, [entries]);

  if (data.length === 0) return null;
  const max = Math.max(...data.map((d) => d.value), 0.01);

  return (
    <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-3">
      <p className="text-xs text-muted-foreground mb-3">Hours per month</p>
      <div className="flex h-11 items-end gap-px sm:gap-0.5">
        {data.map((d) => (
          <div
            key={d.key}
            className="flex min-h-0 min-w-0 flex-1 flex-col items-stretch justify-end gap-1.5"
            title={`${d.label}: ${d.value.toLocaleString(undefined, { maximumFractionDigits: 2 })} h`}
          >
            <div className="flex h-10 w-full flex-col justify-end">
              <div
                className="w-full rounded-[2px] bg-foreground/10 transition-[height]"
                style={{ height: `${Math.max(8, (d.value / max) * 100)}%` }}
              />
            </div>
            <span className="block truncate text-center text-[10px] leading-none text-muted-foreground sm:text-[11px]">
              {d.label.replace(" ", "\u00a0")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PortalHoursBlock({ entries }: { entries: TimeRow[] }) {
  const sumHours = useMemo(() => entries.reduce((s, r) => s + Number(r.hours), 0), [entries]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{sumHours.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span> hours in{" "}
        <span className="font-medium text-foreground">{entries.length}</span> {entries.length === 1 ? "entry" : "entries"}
      </p>

      <SubtleHoursTrend entries={entries} />

      <div className="rounded-md border overflow-x-auto">
        {entries.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No hours logged yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Hours</TableHead>
                <TableHead>Description / service</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap">{row.date}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {Number(row.hours).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell className="text-muted-foreground max-w-[min(480px,55vw)]">{row.description ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
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
          title: "Error",
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
      toast({ title: "Error", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
          <div className="flex items-center gap-3">
            <ZedgerrLogo />
            <div>
              <p className="font-semibold">Client portal</p>
              <p className="text-sm text-muted-foreground">{company?.name}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={signOut}>
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <Tabs defaultValue="overview" className="w-full space-y-6">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6 mt-0">
            {loading && <p className="text-muted-foreground">Loading…</p>}
            {!loading && data && (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Card className="border-primary/15 shadow-sm">
                    <CardHeader className="flex flex-row items-center gap-2 pb-2">
                      <Clock className="h-5 w-5 text-primary" />
                      <CardTitle className="text-lg">Total hours</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-3xl font-semibold tabular-nums tracking-tight">
                        {data.totalHours.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                      </p>
                      <CardDescription className="mt-1">All logged hours</CardDescription>
                    </CardContent>
                  </Card>
                  <Card className="border-primary/15 shadow-sm">
                    <CardHeader className="flex flex-row items-center gap-2 pb-2">
                      <FileText className="h-5 w-5 text-primary" />
                      <CardTitle className="text-lg">Invoices</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-3xl font-semibold tabular-nums tracking-tight">{data.invoices.length}</p>
                      <CardDescription className="mt-1">Open and paid</CardDescription>
                    </CardContent>
                  </Card>
                </div>

                <Accordion type="multiple" defaultValue={["hours", "invoices"]} className="space-y-3">
                  <AccordionItem value="hours" className="border rounded-xl px-4 bg-card shadow-sm">
                    <AccordionTrigger className="text-lg font-semibold hover:no-underline py-4">
                      <span className="flex items-center gap-2">
                        <Clock className="h-5 w-5 text-muted-foreground" />
                        Hours
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="pb-4">
                      <CardDescription className="mb-4 -mt-1">
                        All your hours in one table, with a monthly overview at the top.
                      </CardDescription>
                      <PortalHoursBlock entries={data.timeEntries} />
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="invoices" className="border rounded-xl px-4 bg-card shadow-sm">
                    <AccordionTrigger className="text-lg font-semibold hover:no-underline py-4">
                      <span className="flex items-center gap-2">
                        <FileText className="h-5 w-5 text-muted-foreground" />
                        Invoices
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="pb-4">
                      <CardDescription className="mb-4 -mt-1">Status and amounts (including tax where applicable)</CardDescription>
                      <div className="overflow-x-auto rounded-md border">
                        {data.invoices.length === 0 ? (
                          <p className="p-4 text-sm text-muted-foreground">No invoices yet.</p>
                        ) : (
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Number</TableHead>
                                <TableHead>Date</TableHead>
                                <TableHead>Due date</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Total</TableHead>
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
                                    {new Date(inv.invoice_date).toLocaleDateString(undefined)}
                                  </TableCell>
                                  <TableCell className="whitespace-nowrap">
                                    {inv.due_date ? new Date(inv.due_date).toLocaleDateString(undefined) : "—"}
                                  </TableCell>
                                  <TableCell>{invoiceStatusLabel(inv.status)}</TableCell>
                                  <TableCell className="text-right tabular-nums">
                                    {currencySymbol(data.currency)}{Number(inv.total).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => handleDownloadInvoice(inv.id)}
                                      disabled={downloadingId === inv.id || inv.status === "vervallen"}
                                      title="Download PDF"
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
