import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { Building2, Clock, FileText, Euro } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NavLink } from "@/components/NavLink";

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState({ companies: 0, hoursThisMonth: 0, openInvoices: 0, revenue: 0 });
  const [needsMonthInvoice, setNeedsMonthInvoice] = useState(false);
  const [toSendCount, setToSendCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    api.getDashboardStats().then(setStats).catch(() => setStats({ companies: 0, hoursThisMonth: 0, openInvoices: 0, revenue: 0 }));
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const now = new Date();
    const day = now.getDate();
    const threshold = 25;
    if (day < threshold) {
      setNeedsMonthInvoice(false);
      setToSendCount(0);
      return;
    }
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    api
      .invoicesExistForMonth(month)
      .then((r) => setNeedsMonthInvoice(!r.exists))
      .catch(() => setNeedsMonthInvoice(false));
    api
      .invoicesToSend(month)
      .then((r) => setToSendCount(r.count))
      .catch(() => setToSendCount(0));
  }, [user]);

  const cards = [
    { title: "Klanten", value: stats.companies, icon: Building2, format: (v: number) => v.toString() },
    { title: "Uren deze maand", value: stats.hoursThisMonth, icon: Clock, format: (v: number) => v.toFixed(1) },
    { title: "Open facturen", value: stats.openInvoices, icon: FileText, format: (v: number) => v.toString() },
    { title: "Omzet (betaald)", value: stats.revenue, icon: Euro, format: (v: number) => `€${v.toLocaleString("nl-NL", { minimumFractionDigits: 2 })}` },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      {toSendCount > 0 && (
        <Alert>
          <AlertTitle>Facturen klaar om te versturen</AlertTitle>
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p>
              Je hebt <span className="font-medium text-foreground">{toSendCount}</span> conceptfactuur{toSendCount === 1 ? "" : "en"} voor deze maand.
            </p>
            <Button asChild size="sm" className="w-fit">
              <NavLink to="/facturen">Naar facturen</NavLink>
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {needsMonthInvoice && (
        <Alert>
          <AlertTitle>Einde van de maand nadert</AlertTitle>
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p>Je hebt nog geen factuur voor deze maand aangemaakt.</p>
            <Button asChild size="sm" className="w-fit">
              <NavLink to="/facturen">Factuur aanmaken</NavLink>
            </Button>
          </AlertDescription>
        </Alert>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{card.title}</CardTitle>
              <card.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{card.format(card.value)}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
