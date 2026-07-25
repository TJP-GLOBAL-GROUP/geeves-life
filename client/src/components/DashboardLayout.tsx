import { useAuth } from "@/_core/hooks/useAuth";
import { GeevesConstellationMark } from "@/components/GeevesLogo";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { getGoogleLoginUrl } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import { useTheme } from "@/contexts/ThemeContext";
import {
  LayoutDashboard,
  ShoppingCart,
  CreditCard,
  Receipt,
  Package,
  MessageSquare,
  Settings,
  LogOut,
  PanelLeft,
  Bot,
  ScanLine,
  Calendar,
  Home,
  Building2,
  StickyNote,
  ChevronRight,
  Layers,
  Sun,
  Moon,
  ShieldAlert,
  Shield,
  ShieldCheck,
  Users,
  ClipboardList,
} from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { Button } from "./ui/button";
import { trpc } from "@/lib/trpc";

// ─── Nav item type with brand color ──────────────────────────────────────────
type NavItem = {
  icon: React.ElementType;
  label: string;
  path: string;
  color: string;        // active text/icon color
  activeClass: string;  // active background class
};

// ─── Top nav items with Bold Diversity Rainbow colors ─────────────────────────
const topNavItems: NavItem[] = [
  {
    icon: LayoutDashboard,
    label: "Dashboard",
    path: "/dashboard",
    color: "#2AAFA9",
    activeClass: "bg-[#2AAFA9]/10",
  },
  {
    icon: Calendar,
    label: "Calendar",
    path: "/calendar",
    color: "#2AAFA9",
    activeClass: "bg-[#2AAFA9]/10",
  },
  {
    icon: Home,
    label: "Household",
    path: "/household",
    color: "#E8624A",
    activeClass: "bg-[#E8624A]/10",
  },
  {
    icon: StickyNote,
    label: "Notes",
    path: "/notes",
    color: "#8B5CF6",
    activeClass: "bg-[#8B5CF6]/10",
  },
  {
    icon: Building2,
    label: "Properties",
    path: "/properties",
    color: "#E8943A",
    activeClass: "bg-[#E8943A]/10",
  },
  {
    icon: Layers,
    label: "Verticals",
    path: "/verticals",
    color: "#2AAFA9",
    activeClass: "bg-[#2AAFA9]/10",
  },
  {
    icon: Users,
    label: "Constellation Members",
    path: "/constellation-members",
    color: "#14b8a6",
    activeClass: "bg-teal-500/10",
  },
  {
    icon: ShieldCheck,
    label: "Custom Roles",
    path: "/custom-roles",
    color: "#8B5CF6",
    activeClass: "bg-violet-500/10",
  },
];

// Shopping sub-items
const shoppingSubItems = [
  { icon: ShoppingCart, label: "Shopping Lists", path: "/shopping" },
  { icon: Package, label: "Orders", path: "/orders" },
  { icon: Bot, label: "Shop Agent", path: "/shop-agent" },
  { icon: ScanLine, label: "Scan List", path: "/scan-list" },
  { icon: MessageSquare, label: "WhatsApp Import", path: "/whatsapp" },
];

// Finance & people items
const bottomNavItems: NavItem[] = [
  {
    icon: CreditCard,
    label: "Accounts",
    path: "/accounts",
    color: "#4F7EC4",
    activeClass: "bg-[#4F7EC4]/10",
  },

  {
    icon: Settings,
    label: "Settings",
    path: "/settings",
    color: "#2AAFA9",
    activeClass: "bg-[#2AAFA9]/10",
  },
];

const SHOPPING_COLOR = "#D4A017";

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 260;
const MIN_WIDTH = 200;
const MAX_WIDTH = 400;

// ConstellationMark is now provided by GeevesLogo.tsx (brand-accurate geometry).
// We alias it here so no other lines in this file need changing.
const ConstellationMark = ({ size = 28 }: { size?: number }) => (
  <GeevesConstellationMark size={size} />
);

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { loading, user } = useAuth();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (loading) {
    return <DashboardLayoutSkeleton />;
  }

  // Determine theme for login screen logo
  const loginTheme = (() => {
    try {
      return localStorage.getItem("geeves-theme") || "dark";
    } catch {
      return "dark";
    }
  })();
  const isDarkLogin = loginTheme !== "light";

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="flex flex-col items-center gap-8 p-8 max-w-md w-full">
          <div className="flex flex-col items-center gap-2">
            <img
              src="/manus-storage/universal_logo_34c85c76.svg"
              alt="Geeves.Life — Operating System"
              className="w-48 h-48 object-contain"
              draggable={false}
            />
            <p className="text-sm text-muted-foreground text-center max-w-sm">
              Your intelligent life orchestrator. Sign in to get started.
            </p>
          </div>
          <div className="flex flex-col gap-3 w-full">
            <Button
              onClick={() => { window.location.href = getGoogleLoginUrl(); }}
              size="lg"
              className="w-full shadow-lg hover:shadow-xl transition-all"
              style={{ backgroundColor: "#2AAFA9", color: "#fff" }}
            >
              <svg className="h-5 w-5 mr-2" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </Button>
          </div>
          {/* Legal footer links */}
          <p className="text-xs text-muted-foreground text-center mt-2">
            By signing in, you agree to our{" "}
            <a href="/terms" className="underline hover:text-foreground transition-colors" style={{ color: "#2AAFA9" }}>Terms of Service</a>
            {" "}and{" "}
            <a href="/privacy" className="underline hover:text-foreground transition-colors" style={{ color: "#2AAFA9" }}>Privacy Policy</a>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider
      style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}
    >
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>
        {children}
      </DashboardLayoutContent>
    </SidebarProvider>
  );
}

type DashboardLayoutContentProps = {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
};

function DashboardLayoutContent({ children, setSidebarWidth }: DashboardLayoutContentProps) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const { theme, toggleTheme } = useTheme();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const { setOpenMobile } = useSidebar();

  // Fetch groupName so the sidebar label reflects the user's chosen group type
  const householdQuery = trpc.household.getMyHousehold.useQuery(undefined, { retry: false });
  const groupName = householdQuery.data?.household?.groupName || "Household";

  // M-01: Fetch pending booking request count for sidebar badge
  const pendingRequestsQuery = trpc.bookingRequests.list.useQuery({ status: "pending" }, { retry: false });
  const pendingRequestCount = pendingRequestsQuery.data?.length ?? 0;

  // ── Role-based nav filtering (P-39) ────────────────────────────────────────────
  const myPerms = trpc.accessControl.getMyEffectivePermissions.useQuery(undefined, { retry: false });
  const memberRole = myPerms.data?.role;
  const isAdminOrEA = memberRole === "household_admin" || memberRole === "ea";
  const verticalAccessQuery = trpc.household.verticalAccess.getMyAssignments.useQuery(undefined, {
    enabled: !isAdminOrEA && memberRole !== undefined,
    retry: false,
  });
  const hasVerticalAccess = isAdminOrEA || (Array.isArray(verticalAccessQuery.data) ? verticalAccessQuery.data.length > 0 : false);
  // Build nav items with dynamic groupName and role-based filtering
  const resolvedTopNavItems = topNavItems
    .map(item => item.path === "/household" ? { ...item, label: groupName } : item)
    .filter(item => {
      if (item.path === "/properties" && !isAdminOrEA) return false;
      if (item.path === "/constellation-members" && !isAdminOrEA) return false;
      if (item.path === "/custom-roles" && !isAdminOrEA) return false;
      if (item.path === "/verticals" && !isAdminOrEA) return false;
      return true;
    });
  const resolvedBottomNavItems = bottomNavItems.filter(item => {
    if (item.path === "/accounts" && !hasVerticalAccess) return false;
    return true;
  });
  const [shoppingOpen, setShoppingOpen] = useState(() =>
    shoppingSubItems.some(item =>
      item.path === "/" ? location === "/" : location.startsWith(item.path)
    )
  );
  const [expensesOpen, setExpensesOpen] = useState(() =>
    location.startsWith("/expenses") || location.startsWith("/expense-categorisation")
  );
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  const isShoppingActive = shoppingSubItems.some(item =>
    item.path === "/" ? location === "/" : location.startsWith(item.path)
  );

  const activeLabel = (() => {
    const allItems = [...resolvedTopNavItems, ...shoppingSubItems.map(i => ({ ...i, color: SHOPPING_COLOR, activeClass: "" })), ...resolvedBottomNavItems];
    const match = allItems.find(item =>
      item.path === "/" ? location === "/" : location.startsWith(item.path)
    );
    return match?.label ?? "Menu";
  })();

  useEffect(() => {
    if (isCollapsed) setIsResizing(false);
  }, [isCollapsed]);

  useEffect(() => {
    if (isShoppingActive) setShoppingOpen(true);
  }, [isShoppingActive]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const sidebarLeft = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = e.clientX - sidebarLeft;
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
        <Sidebar collapsible="icon" className="border-r-0" disableTransition={isResizing}>

          {/* ─── Sidebar Header: Logo ──────────────────────────────────────── */}
          <SidebarHeader className="h-16 justify-center">
            <div className="flex items-center gap-3 px-2 transition-all w-full">
              <button
                onClick={toggleSidebar}
                className="h-8 w-8 flex items-center justify-center hover:bg-accent rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
                aria-label="Toggle navigation"
              >
                <PanelLeft className="h-4 w-4 text-muted-foreground" />
              </button>
              {!isCollapsed && (
                <div className="flex items-center gap-2.5 min-w-0">
                  <ConstellationMark size={26} />
                  <div className="min-w-0">
                    <p className="font-display text-base font-bold tracking-tight leading-none truncate" style={{ color: theme === 'light' ? '#2D3139' : '#F8F7F4' }}>
                      Geeves<span style={{ color: '#2AAFA9' }}>.Life</span>
                    </p>
                    <p className="text-[9px] tracking-[0.18em] uppercase text-muted-foreground leading-none mt-0.5 truncate">
                      Operating System
                    </p>
                  </div>
                </div>
              )}
              {isCollapsed && (
                <div className="flex items-center justify-center w-full">
                  <ConstellationMark size={26} />
                </div>
              )}
            </div>
          </SidebarHeader>

          {/* ─── Sidebar Content: Nav ──────────────────────────────────────── */}
          <SidebarContent className="gap-0">
            <SidebarMenu className="px-2 py-1">

              {/* Top nav items with rainbow colors */}
              {resolvedTopNavItems.map((item) => {
                const isActive = item.path === "/" ? location === "/" : location.startsWith(item.path);
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => { setLocation(item.path); if (isMobile) setOpenMobile(false); }}
                      tooltip={item.label}
                      className={`h-10 transition-all font-normal ${isActive ? item.activeClass : ""}`}
                      style={isActive ? { color: item.color } : undefined}
                    >
                      <item.icon
                        className="h-4 w-4 shrink-0"
                        style={{ color: isActive ? item.color : undefined }}
                      />
                      <span className="flex-1">{item.label}</span>
                      {/* M-01: Booking request notification badge */}
                      {item.path === "/calendar" && pendingRequestCount > 0 && (
                        <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white">
                          {pendingRequestCount > 9 ? "9+" : pendingRequestCount}
                        </span>
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}

              {/* Shopping collapsible group — Golden Yellow */}
              <Collapsible
                open={isCollapsed ? false : shoppingOpen}
                onOpenChange={setShoppingOpen}
                asChild
              >
                <SidebarMenuItem>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton
                      isActive={isShoppingActive}
                      tooltip="Shopping"
                      className={`h-10 transition-all font-normal ${isShoppingActive ? "bg-[#D4A017]/10" : ""}`}
                      style={isShoppingActive ? { color: SHOPPING_COLOR } : undefined}
                      onClick={() => {
                        if (isCollapsed) setLocation("/shopping");
                      }}
                    >
                      <ShoppingCart
                        className="h-4 w-4 shrink-0"
                        style={{ color: isShoppingActive ? SHOPPING_COLOR : undefined }}
                      />
                      <span>Shopping</span>
                      <ChevronRight
                        className={`ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${shoppingOpen ? "rotate-90" : ""}`}
                      />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {shoppingSubItems.map((item) => {
                        const isActive = item.path === "/" ? location === "/" : location.startsWith(item.path);
                        return (
                          <SidebarMenuSubItem key={item.path}>
                            <SidebarMenuSubButton
                              isActive={isActive}
                              onClick={() => { setLocation(item.path); if (isMobile) setOpenMobile(false); }}
                              className="transition-all"
                              style={isActive ? { color: SHOPPING_COLOR } : undefined}
                            >
                              <item.icon
                                className="h-3.5 w-3.5 shrink-0"
                                style={{ color: isActive ? SHOPPING_COLOR : undefined }}
                              />
                              <span>{item.label}</span>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        );
                      })}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>

              {/* Super Admin nav item — only visible to system_admin role */}
              {user?.role === "system_admin" && (() => {
                const isActive = location.startsWith("/super-admin");
                return (
                  <SidebarMenuItem key="/super-admin">
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => { setLocation("/super-admin"); if (isMobile) setOpenMobile(false); }}
                      tooltip="Super Admin"
                      className={`h-10 transition-all font-normal ${isActive ? "bg-amber-500/10" : ""}`}
                      style={isActive ? { color: "#f59e0b" } : { color: "rgba(245,158,11,0.6)" }}
                    >
                      <ShieldAlert className="h-4 w-4 shrink-0" />
                      <span>Super Admin</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })()}

              {/* Expenses collapsible group */}
              {hasVerticalAccess && (() => {
                const isExpensesActive = location.startsWith("/expenses") || location.startsWith("/expense-categorisation");
                const EXPENSES_COLOR = "#4F7EC4";
                return (
                  <Collapsible
                    open={isCollapsed ? false : expensesOpen}
                    onOpenChange={setExpensesOpen}
                    asChild
                  >
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton
                          isActive={isExpensesActive}
                          tooltip="Expenses"
                          className={`h-10 transition-all font-normal ${isExpensesActive ? "bg-[#4F7EC4]/10" : ""}`}
                          style={isExpensesActive ? { color: EXPENSES_COLOR } : undefined}
                          onClick={() => {
                            if (isCollapsed) setLocation("/expenses");
                          }}
                        >
                          <Receipt
                            className="h-4 w-4 shrink-0"
                            style={{ color: isExpensesActive ? EXPENSES_COLOR : undefined }}
                          />
                          <span>Expenses</span>
                          <ChevronRight
                            className={`ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${expensesOpen ? "rotate-90" : ""}`}
                          />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenuSub>
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton
                              isActive={location === "/expenses"}
                              onClick={() => { setLocation("/expenses"); if (isMobile) setOpenMobile(false); }}
                              className="transition-all"
                              style={location === "/expenses" ? { color: EXPENSES_COLOR } : undefined}
                            >
                              <Receipt className="h-3.5 w-3.5 shrink-0" style={location === "/expenses" ? { color: EXPENSES_COLOR } : undefined} />
                              <span>Overview</span>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                          {isAdminOrEA && (
                            <SidebarMenuSubItem>
                              <SidebarMenuSubButton
                                isActive={location.startsWith("/expense-categorisation")}
                                onClick={() => { setLocation("/expense-categorisation"); if (isMobile) setOpenMobile(false); }}
                                className="transition-all"
                                style={location.startsWith("/expense-categorisation") ? { color: EXPENSES_COLOR } : undefined}
                              >
                                <ClipboardList className="h-3.5 w-3.5 shrink-0" style={location.startsWith("/expense-categorisation") ? { color: EXPENSES_COLOR } : undefined} />
                                <span>Categorisation Tool</span>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          )}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </SidebarMenuItem>
                  </Collapsible>
                );
              })()}

              {/* Bottom nav items */}
              {resolvedBottomNavItems.map((item) => {
                const isActive = item.path === "/" ? location === "/" : location.startsWith(item.path);
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => { setLocation(item.path); if (isMobile) setOpenMobile(false); }}
                      tooltip={item.label}
                      className={`h-10 transition-all font-normal ${isActive ? item.activeClass : ""}`}
                      style={isActive ? { color: item.color } : undefined}
                    >
                      <item.icon
                        className="h-4 w-4 shrink-0"
                        style={{ color: isActive ? item.color : undefined }}
                      />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}

            </SidebarMenu>
          </SidebarContent>

          {/* ─── Sidebar Footer: User + Theme Toggle ──────────────────────── */}
          <SidebarFooter className="p-3 gap-2">
            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              className={`flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-accent/50 transition-colors text-muted-foreground hover:text-foreground w-full text-left text-sm ${isCollapsed ? "justify-center" : ""}`}
              aria-label="Toggle theme"
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {theme === "dark" ? (
                <Sun className="h-4 w-4 shrink-0" style={{ color: "#D4A017" }} />
              ) : (
                <Moon className="h-4 w-4 shrink-0" style={{ color: "#4F7EC4" }} />
              )}
              {!isCollapsed && (
                <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>
              )}
            </button>

            {/* User profile */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 rounded-lg px-1 py-1 hover:bg-accent/50 transition-colors w-full text-left group-data-[collapsible=icon]:justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Avatar className="h-9 w-9 border shrink-0">
                    <AvatarFallback
                      className="text-xs font-medium"
                      style={{ backgroundColor: "rgba(42,175,169,0.15)", color: "#2AAFA9" }}
                    >
                      {user?.name?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                    <p className="text-sm font-medium truncate leading-none">
                      {user?.name || "-"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate mt-1.5">
                      {user?.email || "-"}
                    </p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => setLocation("/settings")} className="cursor-pointer">
                  <Settings className="mr-2 h-4 w-4" />
                  <span>Settings</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={logout}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>

        {/* Resize handle */}
        <div
          className={`absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-[#2AAFA9]/20 transition-colors ${isCollapsed ? "hidden" : ""}`}
          onMouseDown={() => { if (!isCollapsed) setIsResizing(true); }}
          style={{ zIndex: 50 }}
        />
      </div>

      <SidebarInset>
        {isMobile && (
          <div className="flex border-b h-14 items-center justify-between bg-background/95 px-2 backdrop-blur supports-[backdrop-filter]:backdrop-blur sticky top-0 z-40">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="h-9 w-9 rounded-lg bg-background" />
              <div className="flex items-center gap-3">
                <span className="tracking-tight text-foreground font-medium">
                  {activeLabel}
                </span>
              </div>
            </div>
          </div>
        )}
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </SidebarInset>
    </>
  );
}
