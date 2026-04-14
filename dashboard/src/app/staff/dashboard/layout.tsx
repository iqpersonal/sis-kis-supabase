"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useStaffAuth } from "@/context/staff-auth-context";
import { useLanguage } from "@/context/language-context";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageSwitcher } from "@/components/language-switcher";
import { cn } from "@/lib/utils";
import {
  Briefcase,
  LayoutDashboard,
  Megaphone,
  Wrench,
  Monitor,
  ShoppingCart,
  LogOut,
  Menu,
} from "lucide-react";

const NAV = [
  { href: "/staff/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/staff/dashboard/announcements", label: "Announcements", icon: Megaphone },
  { href: "/staff/dashboard/tickets", label: "IT Tickets", icon: Wrench },
  { href: "/staff/dashboard/assets", label: "My Assets", icon: Monitor },
  { href: "/staff/dashboard/store", label: "Store Requests", icon: ShoppingCart },
];

function SidebarContent({
  pathname,
  staff,
  onSignOut,
  onNavigate,
}: {
  pathname: string;
  staff: { fullNameEn?: string; email?: string; department?: string | null } | null;
  onSignOut: () => void;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex h-full flex-col bg-sidebar">
      {/* Header */}
      <div className="flex h-16 items-center gap-3 px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/20">
          <Briefcase className="h-5 w-5 text-emerald-400" />
        </div>
        <span className="text-sm font-bold text-sidebar-foreground">
          Staff Portal
        </span>
      </div>

      {/* Staff Info */}
      {staff && (
        <div className="mx-4 rounded-xl bg-sidebar-accent/50 p-3">
          <p className="text-sm font-medium text-sidebar-foreground truncate">
            {staff.fullNameEn}
          </p>
          <p className="text-xs text-sidebar-foreground/50 truncate">
            {staff.email}
          </p>
          {staff.department && (
            <p className="text-[10px] text-sidebar-foreground/30 mt-0.5">
              {staff.department}
            </p>
          )}
        </div>
      )}

      {/* Navigation */}
      <ScrollArea className="flex-1 px-3 py-4">
        <div className="space-y-0.5">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active =
              href === "/staff/dashboard"
                ? pathname === "/staff/dashboard"
                : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                onClick={onNavigate}
                className={cn(
                  "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-all duration-150",
                  active
                    ? "bg-emerald-500/15 text-emerald-400 shadow-sm"
                    : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                )}
              >
                <Icon
                  className={cn(
                    "h-4 w-4 shrink-0 transition-colors",
                    active
                      ? "text-emerald-400"
                      : "text-sidebar-foreground/40 group-hover:text-sidebar-foreground/70"
                  )}
                />
                {label}
              </Link>
            );
          })}
        </div>
      </ScrollArea>

      {/* Sign out */}
      <div className="border-t border-sidebar-border p-3">
        <Button
          variant="ghost"
          className="w-full justify-start gap-2 text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent"
          onClick={onSignOut}
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </Button>
      </div>
    </div>
  );
}

export default function StaffDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { staff, loading, signOut } = useStaffAuth();
  const { isRTL: rtl } = useLanguage();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Redirect to login if not authenticated
  if (!loading && !staff) {
    router.push("/staff/login");
    return null;
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
      </div>
    );
  }

  const handleSignOut = () => {
    signOut();
    router.push("/");
  };

  const sidebarProps = { pathname, staff, onSignOut: handleSignOut };

  return (
    <div className={cn("flex min-h-screen", rtl && "flex-row-reverse")}>
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "sticky top-0 hidden h-screen w-[260px] shrink-0 lg:flex lg:flex-col",
          rtl ? "border-l border-sidebar-border" : "border-r border-sidebar-border"
        )}
      >
        <SidebarContent {...sidebarProps} />
      </aside>

      {/* Main content */}
      <main className="flex flex-1 flex-col overflow-x-hidden">
        {/* Top bar */}
        <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur-xl lg:px-6">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="lg:hidden">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side={rtl ? "right" : "left"}
              className="w-[280px] p-0 bg-sidebar border-sidebar-border"
            >
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <SidebarContent {...sidebarProps} onNavigate={() => setMobileOpen(false)} />
            </SheetContent>
          </Sheet>

          <div className="flex-1" />
          <ThemeToggle />
          <LanguageSwitcher variant="icon" />
        </header>

        <div className="flex-1 bg-muted/30 p-4 lg:p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
