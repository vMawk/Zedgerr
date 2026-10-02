import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, Building2, Clock, FileText, FileCheck, BarChart3,
  Settings, LogOut, NotebookPen, RepeatIcon, Users, Package, Receipt,
  Calculator, Car, Landmark, BookOpen, PieChart, ChevronDown, Menu, X, Compass, Search, Github,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useOnboarding } from "./OnboardingProvider";
import { cn } from "@/lib/utils";
import { ZedgerrLogo } from "./ZedgerrLogo";
import { ThemeToggle } from "./ThemeToggle";
import { openCommandPalette, isMac } from "./CommandPalette";
import { AboutDialog } from "./AboutDialog";

type NavItem = { title: string; url: string; icon: React.ElementType };

const primaryNav: NavItem[] = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Invoices", url: "/invoices", icon: FileText },
  { title: "Companies", url: "/companies", icon: Building2 },
  { title: "Time", url: "/time", icon: Clock },
  { title: "Expenses", url: "/expenses", icon: Receipt },
  { title: "Bank", url: "/bank", icon: Landmark },
  { title: "Reports", url: "/reports", icon: BarChart3 },
];

const moreNav: NavItem[] = [
  { title: "Accounting", url: "/accounting", icon: BookOpen },
  { title: "Financial Reports", url: "/financial", icon: PieChart },
  { title: "Quotes", url: "/quotes", icon: FileCheck },
  { title: "Tax", url: "/tax", icon: Calculator },
  { title: "Subscriptions", url: "/subscriptions", icon: RepeatIcon },
  { title: "Leads", url: "/leads", icon: Users },
  { title: "Products", url: "/products", icon: Package },
  { title: "Mileage", url: "/mileage", icon: Car },
  { title: "Notes", url: "/notes", icon: NotebookPen },
];

function isActive(url: string, pathname: string) {
  if (url === "/") return pathname === "/";
  return pathname.startsWith(url);
}

export function AppTopNav() {
  const location = useLocation();
  const { signOut, user } = useAuth();
  const { startTour } = useOnboarding();
  const [moreOpen, setMoreOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
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
          <ZedgerrLogo size="sm" />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1 flex-1 min-w-0">
          {primaryNav.map((item) => {
            const active = isActive(item.url, location.pathname);
            return (
              <Link
                key={item.url}
                to={item.url}
                data-tour={`nav-${item.title.toLowerCase()}`}
                className={cn(
                  "relative px-3 py-1.5 text-sm rounded-md transition-colors whitespace-nowrap",
                  active
                    ? "text-[hsl(var(--nav-fg-active))] font-medium bg-[hsl(var(--secondary))]"
                    : "text-[hsl(var(--nav-fg))] hover:text-[hsl(var(--nav-fg-active))] hover:bg-[hsl(var(--secondary))]",
                )}
              >
                {item.title}
                {active && (
                  <motion.span
                    layoutId="nav-indicator"
                    className="absolute bottom-0 left-3 right-3 h-0.5 bg-[hsl(var(--nav-indicator))] rounded-full"
                    transition={{ type: "spring", stiffness: 500, damping: 35 }}
                  />
                )}
              </Link>
            );
          })}

          {/* More dropdown */}
          <div ref={moreRef} className="relative">
            <button
              onClick={() => setMoreOpen((v) => !v)}
              data-tour="nav-more"
              className={cn(
                "relative flex items-center gap-1 px-3 py-1.5 text-sm rounded-md transition-colors whitespace-nowrap",
                activeInMore || moreOpen
                  ? "text-[hsl(var(--nav-fg-active))] font-medium bg-[hsl(var(--secondary))]"
                  : "text-[hsl(var(--nav-fg))] hover:text-[hsl(var(--nav-fg-active))] hover:bg-[hsl(var(--secondary))]",
              )}
            >
              More
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", moreOpen && "rotate-180")} />
              {activeInMore && (
                <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-[hsl(var(--nav-indicator))] rounded-full" />
              )}
            </button>

            <AnimatePresence>
            {moreOpen && (
              <motion.div
                className="absolute left-0 top-full mt-1.5 w-48 bg-card border border-[hsl(var(--border))] rounded-lg shadow-md py-1 z-50"
                initial={{ opacity: 0, y: -8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.97 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
              >
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
              </motion.div>
            )}
            </AnimatePresence>
          </div>
        </nav>

        {/* Spacer */}
        <div className="flex-1 md:hidden" />

        {/* Right side */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={openCommandPalette}
            className="hidden md:flex items-center gap-2 h-8 rounded-md border border-[hsl(var(--border))] px-2.5 text-xs text-[hsl(var(--nav-fg))] hover:text-[hsl(var(--nav-fg-active))] hover:bg-[hsl(var(--secondary))] transition-colors"
            aria-label="Open command palette"
          >
            <Search className="h-3.5 w-3.5" />
            Search
            <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">{isMac ? "⌘" : "Ctrl"} K</kbd>
          </button>
          <button
            onClick={() => setAboutOpen(true)}
            className="hidden md:flex items-center justify-center h-8 w-8 rounded-md text-[hsl(var(--nav-fg))] hover:text-[hsl(var(--nav-fg-active))] hover:bg-[hsl(var(--secondary))] transition-colors"
            aria-label="Open source & community"
            title="Open source & community"
          >
            <Github className="h-4 w-4" />
          </button>
          <ThemeToggle />
          {/* Settings */}
          <Link
            to="/settings"
            data-tour="nav-settings"
            className={cn(
              "hidden md:flex items-center gap-1 px-3 py-1.5 text-sm rounded-md transition-colors",
              isActive("/settings", location.pathname)
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
                  onClick={() => { setUserOpen(false); startTour(); }}
                  className="flex items-center gap-2.5 w-full px-3 py-2 text-sm hover:bg-[hsl(var(--secondary))] transition-colors"
                >
                  <Compass className="h-4 w-4" />
                  Take the tour
                </button>
                <button
                  onClick={() => { setUserOpen(false); signOut(); }}
                  className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-destructive hover:bg-destructive/8 transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
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

      <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} />

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
                to="/settings"
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors",
                  isActive("/settings", location.pathname)
                    ? "text-[hsl(var(--primary))] font-medium bg-[hsl(var(--accent))]"
                    : "text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]",
                )}
              >
                <Settings className="h-4 w-4" />
                Settings
              </Link>
              <button
                onClick={() => { setMobileOpen(false); startTour(); }}
                className="flex items-center gap-3 w-full px-3 py-2.5 rounded-md text-sm hover:bg-[hsl(var(--secondary))] transition-colors"
              >
                <Compass className="h-4 w-4" />
                Take the tour
              </button>
              <button
                onClick={signOut}
                className="flex items-center gap-3 w-full px-3 py-2.5 rounded-md text-sm text-destructive hover:bg-destructive/10 transition-colors"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </div>
          </nav>
        </div>
      )}
    </>
  );
}
