import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Building2, Clock, FileText, FileCheck, BarChart3,
  Settings, LogOut, NotebookPen, RepeatIcon, Users, Package, Receipt,
  Calculator, Car, Landmark, ChevronDown, Menu, X,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

const LOGO_SRC = "/gibby-logo.png";

type NavItem = { title: string; url: string; icon: React.ElementType };

const primaryNav: NavItem[] = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Facturen", url: "/facturen", icon: FileText },
  { title: "Bedrijven", url: "/bedrijven", icon: Building2 },
  { title: "Uren", url: "/uren", icon: Clock },
  { title: "Uitgaven", url: "/uitgaven", icon: Receipt },
  { title: "Bankrekening", url: "/bankrekening", icon: Landmark },
  { title: "Overzichten", url: "/overzichten", icon: BarChart3 },
];

const moreNav: NavItem[] = [
  { title: "Offertes", url: "/offertes", icon: FileCheck },
  { title: "Belasting", url: "/belasting", icon: Calculator },
  { title: "Abonnementen", url: "/abonnementen", icon: RepeatIcon },
  { title: "Leads", url: "/leads", icon: Users },
  { title: "Producten", url: "/producten", icon: Package },
  { title: "Kilometers", url: "/kilometers", icon: Car },
  { title: "Notities", url: "/notities", icon: NotebookPen },
];

function isActive(url: string, pathname: string) {
  if (url === "/") return pathname === "/";
  return pathname.startsWith(url);
}

export function AppTopNav() {
  const location = useLocation();
  const { signOut, user } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
      if (userRef.current && !userRef.current.contains(e.target as Node)) setUserOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // Close mobile menu on navigation
  useEffect(() => setMobileOpen(false), [location.pathname]);

  const activeInMore = moreNav.some((item) => isActive(item.url, location.pathname));
  const email = user?.email ?? "";
  const initials = email.slice(0, 2).toUpperCase();

  return (
    <>
      {/* Top bar */}
      <header className="h-14 bg-[hsl(var(--nav-bg))] border-b border-[hsl(var(--nav-border))] flex items-center px-4 gap-4 sticky top-0 z-40">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 shrink-0 mr-2">
          <img src={LOGO_SRC} alt="gibby.it" className="h-7 w-auto object-contain" />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1 flex-1 min-w-0">
          {primaryNav.map((item) => {
            const active = isActive(item.url, location.pathname);
            return (
              <Link
                key={item.url}
                to={item.url}
                className={cn(
                  "relative px-3 py-1.5 text-sm rounded-md transition-colors whitespace-nowrap",
                  active
                    ? "text-[hsl(var(--nav-fg-active))] font-medium bg-[hsl(var(--secondary))]"
                    : "text-[hsl(var(--nav-fg))] hover:text-[hsl(var(--nav-fg-active))] hover:bg-[hsl(var(--secondary))]",
                )}
              >
                {item.title}
                {active && (
                  <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-[hsl(var(--nav-indicator))] rounded-full" />
                )}
              </Link>
            );
          })}

          {/* Meer dropdown */}
          <div ref={moreRef} className="relative">
            <button
              onClick={() => setMoreOpen((v) => !v)}
              className={cn(
                "flex items-center gap-1 px-3 py-1.5 text-sm rounded-md transition-colors whitespace-nowrap",
                activeInMore || moreOpen
                  ? "text-[hsl(var(--nav-fg-active))] font-medium bg-[hsl(var(--secondary))]"
                  : "text-[hsl(var(--nav-fg))] hover:text-[hsl(var(--nav-fg-active))] hover:bg-[hsl(var(--secondary))]",
              )}
            >
              Meer
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", moreOpen && "rotate-180")} />
              {activeInMore && (
                <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-[hsl(var(--nav-indicator))] rounded-full" />
              )}
            </button>

            {moreOpen && (
              <div className="absolute left-0 top-full mt-1.5 w-48 bg-card border border-[hsl(var(--border))] rounded-lg shadow-md py-1 z-50">
                {moreNav.map((item) => {
                  const active = isActive(item.url, location.pathname);
                  return (
                    <Link
                      key={item.url}
                      to={item.url}
                      onClick={() => setMoreOpen(false)}
                      className={cn(
                        "flex items-center gap-2.5 px-3 py-2 text-sm transition-colors",
                        active
                          ? "text-[hsl(var(--primary))] font-medium bg-[hsl(var(--accent))]"
                          : "text-[hsl(var(--nav-fg))] hover:text-[hsl(var(--nav-fg-active))] hover:bg-[hsl(var(--secondary))]",
                      )}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      {item.title}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </nav>

        {/* Spacer */}
        <div className="flex-1 md:hidden" />

        {/* Right side */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Settings */}
          <Link
            to="/instellingen"
            className={cn(
              "hidden md:flex items-center gap-1 px-3 py-1.5 text-sm rounded-md transition-colors",
              isActive("/instellingen", location.pathname)
                ? "text-[hsl(var(--nav-fg-active))] font-medium bg-[hsl(var(--secondary))]"
                : "text-[hsl(var(--nav-fg))] hover:text-[hsl(var(--nav-fg-active))] hover:bg-[hsl(var(--secondary))]",
            )}
          >
            <Settings className="h-4 w-4" />
          </Link>

          {/* User menu */}
          <div ref={userRef} className="relative hidden md:block">
            <button
              onClick={() => setUserOpen((v) => !v)}
              className="flex items-center justify-center h-8 w-8 rounded-full bg-[hsl(var(--primary))] text-white text-xs font-bold hover:opacity-90 transition-opacity"
              title={email}
            >
              {initials}
            </button>
            {userOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-52 bg-card border border-[hsl(var(--border))] rounded-lg shadow-md py-1 z-50">
                <div className="px-3 py-2 border-b border-[hsl(var(--border))]">
                  <p className="text-xs text-muted-foreground truncate">{email}</p>
                </div>
                <button
                  onClick={() => { setUserOpen(false); signOut(); }}
                  className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-destructive hover:bg-destructive/8 transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                  Uitloggen
                </button>
              </div>
            )}
          </div>

          {/* Mobile hamburger */}
          <button
            className="md:hidden p-2 rounded-md text-[hsl(var(--nav-fg))] hover:bg-[hsl(var(--secondary))]"
            onClick={() => setMobileOpen((v) => !v)}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </header>

      {/* Mobile menu overlay */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 top-14 bg-card border-t border-[hsl(var(--border))] z-30 overflow-y-auto">
          <nav className="p-4 flex flex-col gap-1">
            {[...primaryNav, ...moreNav].map((item) => {
              const active = isActive(item.url, location.pathname);
              return (
                <Link
                  key={item.url}
                  to={item.url}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors",
                    active
                      ? "text-[hsl(var(--primary))] font-medium bg-[hsl(var(--accent))]"
                      : "text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]",
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {item.title}
                </Link>
              );
            })}
            <div className="border-t border-[hsl(var(--border))] mt-2 pt-2">
              <Link
                to="/instellingen"
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors",
                  isActive("/instellingen", location.pathname)
                    ? "text-[hsl(var(--primary))] font-medium bg-[hsl(var(--accent))]"
                    : "text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]",
                )}
              >
                <Settings className="h-4 w-4" />
                Instellingen
              </Link>
              <button
                onClick={signOut}
                className="flex items-center gap-3 w-full px-3 py-2.5 rounded-md text-sm text-destructive hover:bg-destructive/10 transition-colors"
              >
                <LogOut className="h-4 w-4" />
                Uitloggen
              </button>
            </div>
          </nav>
        </div>
      )}
    </>
  );
}
