import { Link, useLocation } from "wouter";
import { LayoutDashboard, Settings, Orbit, Sun, Moon } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/theme-provider";

const navItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Settings", url: "/settings", icon: Settings },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { theme, setTheme } = useTheme();

  return (
    <Sidebar data-testid="app-sidebar">
      <SidebarHeader className="p-4">
        <Link href="/" data-testid="link-logo">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-md bg-sidebar-primary/20">
              <Orbit className="w-5 h-5 text-sidebar-primary" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold tracking-tight text-sidebar-foreground">
                BHA Command Center
              </span>
              <span className="text-xs text-sidebar-foreground/50">
                Mission Control
              </span>
            </div>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={
                      item.url === "/"
                        ? location === "/"
                        : location.startsWith(item.url)
                    }
                    tooltip={item.title}
                  >
                    <Link
                      href={item.url}
                      data-testid={`link-nav-${item.title.toLowerCase()}`}
                    >
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="icon"
            variant="ghost"
            className="toggle-elevate"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            data-testid="button-theme-toggle"
          >
            {theme === "dark" ? (
              <Sun className="w-4 h-4" />
            ) : (
              <Moon className="w-4 h-4" />
            )}
          </Button>
          <span className="text-xs text-sidebar-foreground/50">
            {theme === "dark" ? "Light Mode" : "Dark Mode"}
          </span>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
