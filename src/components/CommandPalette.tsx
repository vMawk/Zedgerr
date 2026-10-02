import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "next-themes";
import {
  BarChart3, BookOpen, Building2, Calculator, Car, Clock, Compass, FileCheck, FileText, Landmark,
  LayoutDashboard, LogOut, Moon, NotebookPen, Package, PieChart, Receipt, RepeatIcon, Settings, ShieldCheck, Sun, Users,
} from "lucide-react";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator, CommandShortcut,
} from "@/components/ui/command";
import { useAuth } from "@/lib/auth";
import { useOnboarding } from "./OnboardingProvider";

const OPEN_EVENT = "zedgerr:command-palette";

export function openCommandPalette() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

export const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

const PAGES = [
  { label: "Dashboard", to: "/", icon: LayoutDashboard },
  { label: "Invoices", to: "/invoices", icon: FileText },
  { label: "Quotes", to: "/quotes", icon: FileCheck },
  { label: "Companies", to: "/companies", icon: Building2 },
  { label: "Time tracking", to: "/time", icon: Clock },
  { label: "Expenses", to: "/expenses", icon: Receipt },
  { label: "Bank", to: "/bank", icon: Landmark },
  { label: "Reports", to: "/reports", icon: BarChart3 },
  { label: "Accounting", to: "/accounting", icon: BookOpen },
  { label: "Financial reports", to: "/financial", icon: PieChart },
  { label: "Tax", to: "/tax", icon: Calculator },
  { label: "Subscriptions", to: "/subscriptions", icon: RepeatIcon },
  { label: "Leads", to: "/leads", icon: Users },
  { label: "Products", to: "/products", icon: Package },
  { label: "Mileage", to: "/mileage", icon: Car },
  { label: "Notes", to: "/notes", icon: NotebookPen },
  { label: "Settings", to: "/settings", icon: Settings },
];

const CREATE = [
  { label: "New invoice", to: "/invoices?new=1", icon: FileText, keywords: "bill create" },
  { label: "New quote", to: "/quotes?new=1", icon: FileCheck, keywords: "estimate create" },
  { label: "New company", to: "/companies?new=1", icon: Building2, keywords: "client customer create" },
  { label: "Log time", to: "/time?new=1", icon: Clock, keywords: "hours timesheet create" },
  { label: "New expense", to: "/expenses?new=1", icon: Receipt, keywords: "receipt purchase create" },
  { label: "New lead", to: "/leads?new=1", icon: Users, keywords: "prospect create" },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { resolvedTheme, setTheme } = useTheme();
  const { startTour } = useOnboarding();
  const { signOut } = useAuth();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, []);

  const run = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search pages and actions…" />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        <CommandGroup heading="Create">
          {CREATE.map(({ label, to, icon: Icon, keywords }) => (
            <CommandItem key={to} value={`${label} ${keywords}`} onSelect={() => run(() => navigate(to))}>
              <Icon />
              {label}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Go to">
          {PAGES.map(({ label, to, icon: Icon }) => (
            <CommandItem key={to} value={`go ${label}`} onSelect={() => run(() => navigate(to))}>
              <Icon />
              {label}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Preferences">
          <CommandItem value="toggle theme dark light mode" onSelect={() => run(() => setTheme(resolvedTheme === "dark" ? "light" : "dark"))}>
            {resolvedTheme === "dark" ? <Sun /> : <Moon />}
            Switch to {resolvedTheme === "dark" ? "light" : "dark"} mode
          </CommandItem>
          <CommandItem value="security two-factor 2fa password" onSelect={() => run(() => navigate("/settings#security"))}>
            <ShieldCheck />
            Security and two-factor authentication
          </CommandItem>
          <CommandItem value="product tour help" onSelect={() => run(startTour)}>
            <Compass />
            Take the product tour
          </CommandItem>
          <CommandItem value="sign out log out" onSelect={() => run(() => void signOut())}>
            <LogOut />
            Sign out
          </CommandItem>
        </CommandGroup>
      </CommandList>
      <div className="flex items-center justify-between border-t px-3 py-2 text-[11px] text-muted-foreground">
        <span>Navigate with ↑ ↓, open with Enter</span>
        <CommandShortcut>{isMac ? "⌘" : "Ctrl"} K</CommandShortcut>
      </div>
    </CommandDialog>
  );
}
