import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import { AppLayout } from "@/components/AppLayout";
import Dashboard from "./pages/Dashboard";
import Companies from "./pages/Companies";
import CompanyDetail from "./pages/CompanyDetail";
import TimeEntries from "./pages/TimeEntries";
import Invoices from "./pages/Invoices";
import Quotes from "./pages/Quotes";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import Notes from "./pages/Notes";
import Subscriptions from "./pages/Subscriptions";
import Leads from "./pages/Leads";
import Products from "./pages/Products";
import Expenses from "./pages/Expenses";
import Tax from "./pages/Tax";
import Mileage from "./pages/Mileage";
import Bankrekening from "./pages/Bankrekening";
import Boekhouding from "./pages/Boekhouding";
import FinancieelRapport from "./pages/FinancieelRapport";
import InviteAccept from "./pages/InviteAccept";
import NotFound from "./pages/NotFound";
import Auth from "./pages/Auth";
import { PortalProvider, usePortalAuth } from "@/lib/portal-auth";
import PortalLogin from "./pages/PortalLogin";
import PortalDashboard from "./pages/PortalDashboard";

const queryClient = new QueryClient();

function ProtectedRoutes() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  return <AppLayout />;
}

function AuthRoute() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (user) return <Navigate to="/" replace />;
  return <Auth />;
}

function KlantenportaalPage() {
  return (
    <PortalProvider>
      <PortalShell />
    </PortalProvider>
  );
}

function PortalShell() {
  const { company, loading } = usePortalAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (!company) return <PortalLogin />;
  return <PortalDashboard />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/auth" element={<AuthRoute />} />
            <Route path="/invite" element={<InviteAccept />} />
            <Route path="/portal" element={<KlantenportaalPage />} />
            <Route element={<ProtectedRoutes />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/companies" element={<Companies />} />
              <Route path="/companies/:id" element={<CompanyDetail />} />
              <Route path="/time" element={<TimeEntries />} />
              <Route path="/invoices" element={<Invoices />} />
              <Route path="/quotes" element={<Quotes />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/notes" element={<Notes />} />
              <Route path="/subscriptions" element={<Subscriptions />} />
              <Route path="/leads" element={<Leads />} />
              <Route path="/products" element={<Products />} />
              <Route path="/expenses" element={<Expenses />} />
              <Route path="/tax" element={<Tax />} />
              <Route path="/mileage" element={<Mileage />} />
              <Route path="/bank" element={<Bankrekening />} />
              <Route path="/accounting" element={<Boekhouding />} />
              <Route path="/financial" element={<FinancieelRapport />} />
              <Route path="/settings" element={<Settings />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
