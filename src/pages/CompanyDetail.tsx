import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import type { Company, Invoice, Quote } from "@/lib/db-types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, FileText, FileCheck } from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  concept: "Concept", verzonden: "Verzonden", betaald: "Betaald",
  verlopen: "Verlopen", geaccepteerd: "Geaccepteerd", afgewezen: "Afgewezen",
};

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  betaald: "default", geaccepteerd: "default",
  concept: "secondary", verzonden: "secondary",
  verlopen: "destructive", afgewezen: "destructive",
};

export default function CompanyDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [company, setCompany] = useState<Company | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);

  useEffect(() => {
    if (!user || !id) return;
    api.getCompany(id).then(setCompany);
    api.getInvoices().then((all) => setInvoices(all.filter((i) => i.company_id === id)));
    api.getQuotes().then((all) => setQuotes(all.filter((q) => q.company_id === id)));
  }, [user, id]);

  const displayName = company?.name || company?.contact_person || "Klant";

  const totalInvoiced = invoices.reduce((s, i) => s + Number(i.total), 0);
  const totalPaid = invoices.filter((i) => i.status === "betaald").reduce((s, i) => s + Number(i.total), 0);
  const totalOpen = totalInvoiced - totalPaid;

  const fmt = (n: number) => `€ ${n.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/bedrijven">
          <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" />Bedrijven</Button>
        </Link>
        <h1 className="text-2xl font-semibold">{displayName}</h1>
      </div>

      {company && (
        <Card>
          <CardContent className="pt-4 grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3 text-sm">
            {company.name && company.contact_person && (
              <div><p className="text-muted-foreground text-xs">Contactpersoon</p><p>{company.contact_person}</p></div>
            )}
            {company.email && (
              <div><p className="text-muted-foreground text-xs">E-mail</p><p>{company.email}</p></div>
            )}
            {company.phone && (
              <div><p className="text-muted-foreground text-xs">Telefoon</p><p>{company.phone}</p></div>
            )}
            {(company.street || company.city) && (
              <div>
                <p className="text-muted-foreground text-xs">Adres</p>
                <p>{[company.street, company.postal_code, company.city].filter(Boolean).join(", ")}</p>
              </div>
            )}
            {company.kvk_number && (
              <div><p className="text-muted-foreground text-xs">KvK</p><p>{company.kvk_number}</p></div>
            )}
            {company.btw_number && (
              <div><p className="text-muted-foreground text-xs">BTW</p><p>{company.btw_number}</p></div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-3 gap-4">
        <Card><CardContent className="pt-4">
          <p className="text-xs text-muted-foreground">Totaal gefactureerd</p>
          <p className="text-xl font-semibold mt-1">{fmt(totalInvoiced)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <p className="text-xs text-muted-foreground">Betaald</p>
          <p className="text-xl font-semibold mt-1">{fmt(totalPaid)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <p className="text-xs text-muted-foreground">Openstaand</p>
          <p className="text-xl font-semibold mt-1">{fmt(totalOpen)}</p>
        </CardContent></Card>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-3">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-base font-semibold">Facturen</h2>
          <span className="text-muted-foreground text-sm">({invoices.length})</span>
        </div>
        {invoices.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nog geen facturen voor deze klant.</p>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nummer</TableHead>
                  <TableHead>Datum</TableHead>
                  <TableHead>Vervaldatum</TableHead>
                  <TableHead className="text-right">Bedrag</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-medium">{inv.invoice_number}</TableCell>
                    <TableCell>{new Date(inv.invoice_date).toLocaleDateString("nl-NL")}</TableCell>
                    <TableCell>{inv.due_date ? new Date(inv.due_date).toLocaleDateString("nl-NL") : "—"}</TableCell>
                    <TableCell className="text-right">{fmt(Number(inv.total))}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANTS[inv.status] ?? "secondary"}>
                        {STATUS_LABELS[inv.status] ?? inv.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>

      <div>
        <div className="flex items-center gap-2 mb-3">
          <FileCheck className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-base font-semibold">Offertes</h2>
          <span className="text-muted-foreground text-sm">({quotes.length})</span>
        </div>
        {quotes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nog geen offertes voor deze klant.</p>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nummer</TableHead>
                  <TableHead>Datum</TableHead>
                  <TableHead>Geldig tot</TableHead>
                  <TableHead className="text-right">Bedrag</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {quotes.map((q) => (
                  <TableRow key={q.id}>
                    <TableCell className="font-medium">{q.quote_number}</TableCell>
                    <TableCell>{new Date(q.quote_date).toLocaleDateString("nl-NL")}</TableCell>
                    <TableCell>{q.valid_until ? new Date(q.valid_until).toLocaleDateString("nl-NL") : "—"}</TableCell>
                    <TableCell className="text-right">{fmt(Number(q.total))}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANTS[q.status] ?? "secondary"}>
                        {STATUS_LABELS[q.status] ?? q.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>
    </div>
  );
}
