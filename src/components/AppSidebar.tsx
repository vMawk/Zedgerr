import { LayoutDashboard, Building2, Clock, FileText, FileCheck, BarChart3, Settings, LogOut, MonitorSmartphone, NotebookPen, RepeatIcon, Users, Package, Receipt, Calculator, Car, Landmark, BookOpen, PieChart, Github, Heart } from "lucide-react";
import { useState } from "react";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { ZedgerrLogo } from "./ZedgerrLogo";
import { AboutDialog } from "./AboutDialog";
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
