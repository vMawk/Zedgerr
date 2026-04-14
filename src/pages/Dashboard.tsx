import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Building2, Clock, FileText, Euro } from "lucide-react";

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState({ companies: 0, hoursThisMonth: 0, openInvoices: 0, revenue: 0 });

  useEffect(() => {
    if (!user) return;
    const fetchStats = async () => {
      const now = new Date();
      const firstOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

      const [companiesRes, hoursRes, invoicesRes, revenueRes] = await Promise.all([
        supabase.from("companies").select("id", { count: "exact", head: true }),
        supabase.from("time_entries").select("hours").gte("date", firstOfMonth),
        supabase.from("invoices").select("total").in("status", ["concept", "verzonden"]),
        supabase.from("invoices").select("total").eq("status", "betaald"),
      ]);

      setStats({
        companies: companiesRes.count ?? 0,
        hoursThisMonth: hoursRes.data?.reduce((sum, e) => sum + Number(e.hours), 0) ?? 0,
        openInvoices: invoicesRes.data?.length ?? 0,
        revenue: revenueRes.data?.reduce((sum, e) => sum + Number(e.total), 0) ?? 0,
      });
    };
    fetchStats();
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
