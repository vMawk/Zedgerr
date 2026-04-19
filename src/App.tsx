import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import { AppLayout } from "@/components/AppLayout";
import Dashboard from "./pages/Dashboard";
import Companies from "./pages/Companies";
import TimeEntries from "./pages/TimeEntries";
import Invoices from "./pages/Invoices";
import Quotes from "./pages/Quotes";
import Reports from "./pages/Reports";
import DebtSettlement from "./pages/DebtSettlement";
import Settings from "./pages/Settings";
import Notes from "./pages/Notes";
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
        Laden…
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
        Laden…
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
        Laden…
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
            <Route path="/klantenportaal" element={<KlantenportaalPage />} />
            <Route element={<ProtectedRoutes />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/bedrijven" element={<Companies />} />
              <Route path="/uren" element={<TimeEntries />} />
              <Route path="/facturen" element={<Invoices />} />
              <Route path="/offertes" element={<Quotes />} />
              <Route path="/overzichten" element={<Reports />} />
              <Route path="/schuld" element={<DebtSettlement />} />
              <Route path="/notities" element={<Notes />} />
              <Route path="/instellingen" element={<Settings />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
