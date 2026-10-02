import { LayoutDashboard, Building2, Clock, FileText, FileCheck, BarChart3, Settings, LogOut, MonitorSmartphone, NotebookPen, RepeatIcon, Users, Package, Receipt, Calculator, Car, Landmark, BookOpen, PieChart, Github, Heart, Star, GitPullRequest, Bug } from "lucide-react";
import { useState } from "react";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { ZedgerrLogo } from "./ZedgerrLogo";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";

const mainItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Companies", url: "/companies", icon: Building2 },
  { title: "Time", url: "/time", icon: Clock },
  { title: "Invoices", url: "/invoices", icon: FileText },
  { title: "Quotes", url: "/quotes", icon: FileCheck },
  { title: "Reports", url: "/reports", icon: BarChart3 },
  { title: "Notes", url: "/notes", icon: NotebookPen },
  { title: "Subscriptions", url: "/subscriptions", icon: RepeatIcon },
  { title: "Leads", url: "/leads", icon: Users },
  { title: "Products", url: "/products", icon: Package },
  { title: "Expenses", url: "/expenses", icon: Receipt },
  { title: "Mileage", url: "/mileage", icon: Car },
  { title: "Bank", url: "/bank", icon: Landmark },
  { title: "Accounting", url: "/accounting", icon: BookOpen },
  { title: "Financial Reports", url: "/financial", icon: PieChart },
  { title: "Tax", url: "/tax", icon: Calculator },
];

const settingsItems = [
  { title: "Settings", url: "/settings", icon: Settings },
  { title: "Client Portal", url: "/portal", icon: MonitorSmartphone },
];

function AboutDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Github className="h-5 w-5" />
            Open source &amp; community
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm text-muted-foreground">
          <p>
            Zedgerr is built with love and maintained in our spare time. We believe great bookkeeping software should be
            accessible to everyone — self-hosted, private, and free to run.
          </p>
          <p>
            If Zedgerr saves you time or money, consider giving back so we can keep it running and make it even better.
          </p>
          <div className="grid gap-2 pt-1">
            <a
              href="https://github.com/vMawk/Zedgerr"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-lg border px-4 py-3 hover:bg-accent transition-colors"
            >
              <Star className="h-4 w-4 text-yellow-500 shrink-0" />
              <div>
                <div className="font-medium text-foreground">Star on GitHub</div>
                <div className="text-xs">Help others discover Zedgerr</div>
              </div>
            </a>
            <a
              href="https://github.com/sponsors/vMawk"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-lg border px-4 py-3 hover:bg-accent transition-colors"
            >
              <Heart className="h-4 w-4 text-red-500 shrink-0" />
              <div>
                <div className="font-medium text-foreground">Sponsor the project</div>
                <div className="text-xs">Keep the lights on via GitHub Sponsors</div>
              </div>
            </a>
            <a
              href="https://github.com/vMawk/Zedgerr/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-lg border px-4 py-3 hover:bg-accent transition-colors"
            >
              <Bug className="h-4 w-4 text-blue-500 shrink-0" />
              <div>
                <div className="font-medium text-foreground">Report a bug or idea</div>
                <div className="text-xs">Open an issue on GitHub</div>
              </div>
            </a>
            <a
              href="https://github.com/vMawk/Zedgerr/pulls"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-lg border px-4 py-3 hover:bg-accent transition-colors"
            >
              <GitPullRequest className="h-4 w-4 text-green-500 shrink-0" />
              <div>
                <div className="font-medium text-foreground">Contribute</div>
                <div className="text-xs">Open a pull request — all help is welcome</div>
              </div>
            </a>
          </div>
        </div>
        <div className="pt-2">
          <Button variant="outline" className="w-full" onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { signOut } = useAuth();
  const [aboutOpen, setAboutOpen] = useState(false);

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="px-3 py-3">
            <div className={cn("flex items-center", collapsed ? "justify-center" : "justify-start")}>
              <ZedgerrLogo collapsed={collapsed} size={collapsed ? "sm" : "md"} />
            </div>
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink to={item.url} end={item.url === "/"} className="hover:bg-accent/50" activeClassName="bg-accent text-accent-foreground font-medium">
                      <item.icon className="mr-2 h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {settingsItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink to={item.url} className="hover:bg-accent/50" activeClassName="bg-accent text-accent-foreground font-medium">
                      <item.icon className="mr-2 h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={() => setAboutOpen(true)} className="hover:bg-accent/50 text-muted-foreground hover:text-foreground">
              <Github className="mr-2 h-4 w-4 shrink-0" />
              {!collapsed && (
                <span className="flex items-center gap-1.5">
                  Open source
                  <Heart className="h-3 w-3 text-red-500 fill-red-500" />
                </span>
              )}
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={signOut} className="hover:bg-destructive/10 hover:text-destructive">
              <LogOut className="mr-2 h-4 w-4" />
              {!collapsed && <span>Sign out</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </Sidebar>
  );
}
