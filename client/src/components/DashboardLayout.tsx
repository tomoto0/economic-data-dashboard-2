import {
  BarChart3,
  Bot,
  Database,
  Globe2,
  LineChart,
  Moon,
  PanelLeft,
  Sun,
  Table2,
} from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useIsMobile } from "@/hooks/useMobile";
import { useTheme } from "@/contexts/ThemeContext";

const menuItems = [
  { icon: BarChart3, label: "Overview", path: "/" },
  { icon: LineChart, label: "Explorer", path: "/explorer" },
  { icon: Table2, label: "Comparison", path: "/comparison" },
  { icon: Bot, label: "AI Insights", path: "/insights" },
  { icon: Globe2, label: "Legacy", path: "/legacy" },
];

const SIDEBAR_WIDTH_KEY = "economic-dashboard-sidebar-width";
const DEFAULT_WIDTH = 300;
const MIN_WIDTH = 232;
const MAX_WIDTH = 440;

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  return (
    <SidebarProvider style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}>
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>{children}</DashboardLayoutContent>
    </SidebarProvider>
  );
}

function DashboardLayoutContent({ children, setSidebarWidth }: { children: React.ReactNode; setSidebarWidth: (width: number) => void }) {
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const { theme, toggleTheme } = useTheme();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const activeMenuItem = menuItems.find(item => item.path === location) ?? menuItems[0];
  const isMobile = useIsMobile();
  const isDark = theme === "dark";

  useEffect(() => {
    if (isCollapsed) setIsResizing(false);
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!isResizing) return;
      const sidebarLeft = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = event.clientX - sidebarLeft;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) setSidebarWidth(newWidth);
    };
    const handleMouseUp = () => setIsResizing(false);
    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar collapsible="icon" className={isDark ? "border-r border-white/10 bg-slate-950/95 text-slate-100" : "border-r border-slate-200 bg-white text-slate-950"} disableTransition={isResizing}>
          <SidebarHeader className="min-h-20 justify-center border-b border-white/10 px-3">
            <div className="flex items-center gap-3 transition-all w-full">
              <button onClick={toggleSidebar} className={isDark ? "h-9 w-9 flex items-center justify-center rounded-xl bg-cyan-400/10 hover:bg-cyan-400/20 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300" : "h-9 w-9 flex items-center justify-center rounded-xl bg-cyan-100 hover:bg-cyan-200 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"} aria-label="Toggle navigation">
                <PanelLeft className={isDark ? "h-4 w-4 text-cyan-200" : "h-4 w-4 text-cyan-700"} />
              </button>
              {!isCollapsed ? (
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={isDark ? "font-semibold tracking-tight text-white" : "font-semibold tracking-tight text-slate-950"}>Global Macro</span>
                    <Badge className={isDark ? "border-cyan-300/30 bg-cyan-400/10 text-cyan-100" : "border-cyan-600/30 bg-cyan-100 text-cyan-800"} variant="outline">AI</Badge>
                  </div>
                  <p className={isDark ? "text-xs text-slate-400" : "text-xs text-slate-600"}>World Bank Open Data</p>
                </div>
              ) : null}
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0 py-3">
            <SidebarMenu className="px-2 py-1">
              {menuItems.map(item => {
                const isActive = location === item.path;
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton isActive={isActive} onClick={() => setLocation(item.path)} tooltip={item.label} className={`h-11 rounded-xl font-medium transition-all ${isActive ? (isDark ? "bg-cyan-400/15 text-cyan-100 shadow-[0_0_30px_rgba(34,211,238,0.12)]" : "bg-cyan-100 text-cyan-950 shadow-sm") : (isDark ? "text-slate-300 hover:bg-white/8 hover:text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950")}`}>
                      <item.icon className={`h-4 w-4 ${isActive ? (isDark ? "text-cyan-200" : "text-cyan-700") : (isDark ? "text-slate-400" : "text-slate-500")}`} />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarContent>

          <SidebarFooter className="border-t border-white/10 p-3">
            <Button onClick={toggleTheme} variant="outline" className={isDark ? "w-full justify-start gap-2 border-white/10 bg-white/5 text-slate-100 hover:bg-white/10 hover:text-white" : "w-full justify-start gap-2 border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100 hover:text-slate-950"}>
              {theme === "dark" ? <Sun className="h-4 w-4 text-amber-200" /> : <Moon className="h-4 w-4 text-slate-700" />}
              <span className="group-data-[collapsible=icon]:hidden">{theme === "dark" ? "Light mode" : "Dark mode"}</span>
            </Button>
            {!isCollapsed ? (
                <div className={isDark ? "mt-3 rounded-2xl border border-white/10 bg-gradient-to-br from-cyan-400/10 to-indigo-500/10 p-3 text-xs text-slate-300" : "mt-3 rounded-2xl border border-slate-200 bg-gradient-to-br from-cyan-50 to-indigo-50 p-3 text-xs text-slate-600"}>
                <Database className={isDark ? "mb-2 h-4 w-4 text-cyan-200" : "mb-2 h-4 w-4 text-cyan-700"} />
                Database-backed snapshots with cached World Bank refreshes.
              </div>
            ) : null}
          </SidebarFooter>
        </Sidebar>
        <div className={`absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-cyan-300/40 transition-colors ${isCollapsed ? "hidden" : ""}`} onMouseDown={() => !isCollapsed && setIsResizing(true)} style={{ zIndex: 50 }} />
      </div>

      <SidebarInset>
        {isMobile && (
          <div className="flex border-b border-white/10 h-14 items-center justify-between bg-slate-950/90 px-3 backdrop-blur sticky top-0 z-40 text-white">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="h-9 w-9 rounded-lg bg-white/10" />
              <span className="tracking-tight">{activeMenuItem.label}</span>
            </div>
          </div>
        )}
        <main className={isDark ? "min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.16),transparent_30%),radial-gradient(circle_at_70%_10%,rgba(99,102,241,0.22),transparent_28%),linear-gradient(135deg,#020617_0%,#07111f_48%,#0f172a_100%)] text-slate-100" : "min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.18),transparent_32%),linear-gradient(135deg,#f8fafc_0%,#e0f2fe_48%,#eef2ff_100%)] text-slate-950"}>
          {children}
        </main>
      </SidebarInset>
    </>
  );
}
