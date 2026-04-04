"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTeacherAuth } from "@/context/teacher-auth-context";
import { useLanguage } from "@/context/language-context";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageSwitcher } from "@/components/language-switcher";
import { cn } from "@/lib/utils";
import type { TranslationKeys } from "@/lib/i18n/translations";
import {
  BookOpen,
  LayoutDashboard,
  Users,
  CalendarCheck,
  ClipboardList,
  HelpCircle,
  FileText,
  BarChart3,
  LogOut,
  NotebookPen,
} from "lucide-react";

const NAV: { href: string; labelKey: TranslationKeys; icon: React.ElementType }[] = [
  { href: "/teacher/dashboard", labelKey: "teacherHome" as TranslationKeys, icon: LayoutDashboard },
  { href: "/teacher/dashboard/classes", labelKey: "teacherMyClasses" as TranslationKeys, icon: Users },
  { href: "/teacher/dashboard/attendance", labelKey: "teacherAttendance" as TranslationKeys, icon: CalendarCheck },
  { href: "/teacher/dashboard/grades", labelKey: "teacherGrades" as TranslationKeys, icon: ClipboardList },
  { href: "/teacher/dashboard/progress-report", labelKey: "teacherProgressReport" as TranslationKeys, icon: NotebookPen },
  { href: "/teacher/dashboard/quizzes", labelKey: "teacherQuestionBank" as TranslationKeys, icon: HelpCircle },
  { href: "/teacher/dashboard/quiz-assign", labelKey: "teacherQuizAssign" as TranslationKeys, icon: FileText },
  { href: "/teacher/dashboard/quiz-results", labelKey: "teacherQuizResults" as TranslationKeys, icon: BarChart3 },
];

export default function TeacherDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { teacher, signOut } = useTeacherAuth();
  const { t, isRTL: rtl } = useLanguage();

  const handleSignOut = () => {
    signOut();
    router.push("/");
  };

  return (
    <div className={cn("flex min-h-screen", rtl && "flex-row-reverse")}>
      {/* Sidebar */}
      <aside className={cn("sticky top-0 flex h-screen w-64 flex-col bg-card", rtl ? "border-l" : "border-r")}>
        <div className="flex h-16 items-center gap-2 px-6">
          <BookOpen className="h-6 w-6 text-blue-600" />
          <span className="text-lg font-semibold">{t("teacherPortal")}</span>
        </div>

        <Separator />

        {/* Teacher Info */}
        {teacher && (
          <div className="px-4 py-3">
            <p className="text-sm font-medium truncate">{teacher.displayName}</p>
            <p className="text-xs text-muted-foreground truncate">{teacher.email}</p>
            {teacher.grade && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {t("grade")}: {teacher.grade}
              </p>
            )}
          </div>
        )}

        <Separator />

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {NAV.map(({ href, labelKey, icon: Icon }) => {
            const active =
              href === "/teacher/dashboard"
                ? pathname === "/teacher/dashboard"
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
                {t(labelKey)}
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
            {t("signOut")}
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

        <div className="flex-1 overflow-y-auto p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
