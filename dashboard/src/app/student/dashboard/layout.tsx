"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useStudentAuth } from "@/context/student-auth-context";
import { useLanguage } from "@/context/language-context";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
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
} from "lucide-react";

const NAV = [
  { href: "/student/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/student/dashboard/grades", label: "My Grades", icon: ClipboardList },
  { href: "/student/dashboard/attendance", label: "Attendance", icon: CalendarCheck },
  { href: "/student/dashboard/quizzes", label: "Quizzes", icon: HelpCircle },
];

export default function StudentDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { student, signOut } = useStudentAuth();
  const { t, isRTL: rtl } = useLanguage();

  const handleSignOut = () => {
    signOut();
    router.push("/");
  };

  return (
    <div className={cn("flex min-h-screen", rtl && "flex-row-reverse")}>
      {/* Sidebar */}
      <aside
        className={cn(
          "sticky top-0 flex h-screen w-64 flex-col bg-card",
          rtl ? "border-l" : "border-r"
        )}
      >
        <div className="flex h-16 items-center gap-2 px-6">
          <BookOpen className="h-6 w-6 text-blue-600" />
          <span className="text-lg font-semibold">
            {t("studentPortal") || "Student Portal"}
          </span>
        </div>

        <Separator />

        {/* Student Info */}
        {student && (
          <div className="px-4 py-3">
            <p className="text-sm font-medium truncate">{student.student_name}</p>
            <p className="text-xs text-muted-foreground truncate">
              {student.class_name} — {student.section_name}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              ID: {student.student_number}
            </p>
          </div>
        )}

        <Separator />

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active =
              href === "/student/dashboard"
                ? pathname === "/student/dashboard"
                : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>

        <Separator />

        <div className="p-3">
          <Button
            variant="ghost"
            className="w-full justify-start gap-2 text-muted-foreground"
            onClick={handleSignOut}
          >
            <LogOut className="h-4 w-4" />
            {t("signOut") || "Sign Out"}
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-end gap-3 border-b bg-background/80 px-6 backdrop-blur">
          <ThemeToggle />
          <LanguageSwitcher variant="icon" />
        </header>

        <div className="flex-1 overflow-y-auto p-6">{children}</div>
      </main>
    </div>
  );
}
