import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "next-themes";
import { AuthProvider, useAuth } from "@/lib/auth";
import { AppLayout } from "@/components/AppLayout";
import { OnboardingProvider } from "@/components/OnboardingProvider";
import { PortalProvider, usePortalAuth } from "@/lib/portal-auth";
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Companies = lazy(() => import("./pages/Companies"));
const CompanyDetail = lazy(() => import("./pages/CompanyDetail"));
const TimeEntries = lazy(() => import("./pages/TimeEntries"));
const Invoices = lazy(() => import("./pages/Invoices"));
const Quotes = lazy(() => import("./pages/Quotes"));
const Reports = lazy(() => import("./pages/Reports"));
const Settings = lazy(() => import("./pages/Settings"));
const Notes = lazy(() => import("./pages/Notes"));
const Subscriptions = lazy(() => import("./pages/Subscriptions"));
const Leads = lazy(() => import("./pages/Leads"));
const Products = lazy(() => import("./pages/Products"));
const Expenses = lazy(() => import("./pages/Expenses"));
const Tax = lazy(() => import("./pages/Tax"));
const Mileage = lazy(() => import("./pages/Mileage"));
const Bankrekening = lazy(() => import("./pages/Bankrekening"));
const Boekhouding = lazy(() => import("./pages/Boekhouding"));
const FinancieelRapport = lazy(() => import("./pages/FinancieelRapport"));
const InviteAccept = lazy(() => import("./pages/InviteAccept"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Auth = lazy(() => import("./pages/Auth"));
const PortalLogin = lazy(() => import("./pages/PortalLogin"));
const PortalDashboard = lazy(() => import("./pages/PortalDashboard"));

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
  return (
    <OnboardingProvider>
      <AppLayout />
    </OnboardingProvider>
  );
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

function ClientPortalPage() {
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
  <ThemeProvider attribute="class" defaultTheme="system" enableSystem storageKey="zedgerr-theme" disableTransitionOnChange>
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={null}>
          <Routes>
            <Route path="/auth" element={<AuthRoute />} />
            <Route path="/invite" element={<InviteAccept />} />
            <Route path="/portal" element={<ClientPortalPage />} />
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
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  </ThemeProvider>
);

export default App;
