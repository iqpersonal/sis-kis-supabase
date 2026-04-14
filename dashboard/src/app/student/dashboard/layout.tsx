"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useStudentAuth } from "@/context/student-auth-context";
import { useLanguage } from "@/context/language-context";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageSwitcher } from "@/components/language-switcher";
import { cn } from "@/lib/utils";
import {
  BookOpen,
  LayoutDashboard,
  ClipboardList,
  CalendarCheck,
  HelpCircle,
  LogOut,
  Menu,
} from "lucide-react";

const NAV = [
  { href: "/student/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/student/dashboard/grades", label: "My Grades", icon: ClipboardList },
  { href: "/student/dashboard/attendance", label: "Attendance", icon: CalendarCheck },
  { href: "/student/dashboard/quizzes", label: "Quizzes", icon: HelpCircle },
];

function SidebarContent({
  pathname,
  student,
  t,
  onSignOut,
  onNavigate,
}: {
  pathname: string;
  student: { student_name?: string; class_name?: string; section_name?: string; student_number?: string } | null;
  t: (k: string) => string;
  onSignOut: () => void;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex h-full flex-col bg-sidebar">
      {/* Header */}
      <div className="flex h-16 items-center gap-3 px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/20">
          <BookOpen className="h-5 w-5 text-blue-400" />
        </div>
        <span className="text-sm font-bold text-sidebar-foreground">
          {t("studentPortal") || "Student Portal"}
        </span>
      </div>

      {/* Student Info */}
      {student && (
        <div className="mx-4 rounded-xl bg-sidebar-accent/50 p-3">
          <p className="text-sm font-medium text-sidebar-foreground truncate">
            {student.student_name}
          </p>
          <p className="text-xs text-sidebar-foreground/50 truncate">
            {student.class_name} — {student.section_name}
          </p>
          <p className="text-[10px] text-sidebar-foreground/30 mt-0.5">
            ID: {student.student_number}
          </p>
        </div>
      )}

      {/* Navigation */}
      <ScrollArea className="flex-1 px-3 py-4">
        <div className="space-y-0.5">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active =
              href === "/student/dashboard"
                ? pathname === "/student/dashboard"
                : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                onClick={onNavigate}
                className={cn(
                  "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-all duration-150",
                  active
                    ? "bg-blue-500/15 text-blue-400 shadow-sm"
                    : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                )}
              >
                <Icon
                  className={cn(
                    "h-4 w-4 shrink-0 transition-colors",
                    active
                      ? "text-blue-400"
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
          {t("signOut") || "Sign Out"}
        </Button>
      </div>
    </div>
  );
}

export default function StudentDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { student, signOut } = useStudentAuth();
  const { t, isRTL: rtl } = useLanguage();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleSignOut = () => {
    signOut();
    router.push("/");
  };

  const sidebarProps = { pathname, student, t: t as (k: string) => string, onSignOut: handleSignOut };

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

        <div className="flex-1 bg-muted/30 p-4 lg:p-6">{children}</div>
      </main>
    </div>
  );
}
