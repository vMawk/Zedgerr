import { useEffect, useState } from "react";
import { usePortalAuth } from "@/lib/portal-auth";
import { portalFetchDashboard, portalFetchInvoicePdfData, type PortalDashboard } from "@/lib/portal-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { LogOut, Clock, FileText, Download } from "lucide-react";
import { generateInvoicePDF } from "@/lib/pdf";

function invoiceStatusLabel(status: string): string {
  const m: Record<string, string> = {
    concept: "Concept",
    verzonden: "Open / verzonden",
    betaald: "Betaald",
  };
  return m[status] ?? status;
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
          title: "Fout",
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
      toast({ title: "Fout", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
          <div className="flex items-center gap-3">
            <img src="/gibby-logo.png" alt="" className="h-8 w-auto" />
            <div>
              <p className="font-semibold">Klantenportaal</p>
              <p className="text-sm text-muted-foreground">{company?.name}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={signOut}>
            <LogOut className="mr-2 h-4 w-4" />
            Uitloggen
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-8 px-4 py-8">
        {loading && <p className="text-muted-foreground">Laden…</p>}
        {!loading && data && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Card>
                <CardHeader className="flex flex-row items-center gap-2 pb-2">
                  <Clock className="h-5 w-5 text-muted-foreground" />
                  <CardTitle className="text-lg">Totaal uren</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-semibold tabular-nums">{data.totalHours.toLocaleString("nl-NL", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</p>
                  <CardDescription className="mt-1">Alle geregistreerde uren voor uw organisatie</CardDescription>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center gap-2 pb-2">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  <CardTitle className="text-lg">Facturen</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-semibold tabular-nums">{data.invoices.length}</p>
                  <CardDescription className="mt-1">Openstaand en betaald</CardDescription>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Urenregistratie</CardTitle>
                <CardDescription>Per regel</CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {data.timeEntries.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nog geen uren geregistreerd.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Datum</TableHead>
                        <TableHead className="text-right">Uren</TableHead>
                        <TableHead>Omschrijving</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.timeEntries.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="whitespace-nowrap">{row.date}</TableCell>
                          <TableCell className="text-right tabular-nums">{Number(row.hours).toLocaleString("nl-NL", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</TableCell>
                          <TableCell className="text-muted-foreground">{row.description ?? "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Facturen</CardTitle>
                <CardDescription>Status en bedragen (incl. BTW waar van toepassing)</CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {data.invoices.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nog geen facturen.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nummer</TableHead>
                        <TableHead>Datum</TableHead>
                        <TableHead>Vervaldatum</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Totaal</TableHead>
                        <TableHead className="w-16 text-right">PDF</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.invoices.map((inv) => (
                        <TableRow
                          key={inv.id}
                          className={inv.status === "vervallen" ? "opacity-55 text-muted-foreground" : undefined}
                        >
                          <TableCell className="font-medium whitespace-nowrap">{inv.invoice_number}</TableCell>
                          <TableCell className="whitespace-nowrap">{new Date(inv.invoice_date).toLocaleDateString("nl-NL")}</TableCell>
                          <TableCell className="whitespace-nowrap">
                            {inv.due_date ? new Date(inv.due_date).toLocaleDateString("nl-NL") : "—"}
                          </TableCell>
                          <TableCell>{invoiceStatusLabel(inv.status)}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            €{Number(inv.total).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDownloadInvoice(inv.id)}
                              disabled={downloadingId === inv.id}
                              title="PDF downloaden"
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
