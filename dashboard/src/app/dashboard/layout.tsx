"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import {
  useAcademicYear,
} from "@/context/academic-year-context";
import {
  useSchoolFilter,
  type SchoolFilter,
} from "@/context/school-filter-context";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  BarChart3,
  LayoutDashboard,
  Users,
  User,
  LogOut,
  PieChart,
  Upload,
  CalendarDays,
  GraduationCap,
  School,
  CalendarOff,
  DollarSign,
  GitCompareArrows,
  BookOpen,
  CalendarRange,
  TrendingUp,
  Trophy,
  AlertTriangle,
  ClipboardList,
  UserSearch,
  Settings,
  FileText,
  BellRing,
  ArrowRightLeft,
  Printer,
  Wallet,
  Sparkles,
  Shield,
  MessageSquare,
  Phone,
  Laptop,
  Contact,
  ShoppingCart,
  HelpCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { NotificationBell } from "@/components/dashboard/notification-bell";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { CommandPalette } from "@/components/command-palette";
import { useLanguage } from "@/context/language-context";
import type { TranslationKeys } from "@/lib/i18n/translations";
import { ROUTE_PERMISSIONS, ROLES, type Permission } from "@/lib/rbac";

const NAV: { href: string; labelKey: TranslationKeys; icon: React.ElementType; permission: Permission }[] = [
  { href: "/dashboard", labelKey: "navOverview", icon: LayoutDashboard, permission: "dashboard.view" },
  { href: "/dashboard/reports", labelKey: "navStudents", icon: Users, permission: "students.view" },
  { href: "/dashboard/students", labelKey: "navStudentProfile", icon: User, permission: "students.profile" },
  { href: "/dashboard/academics", labelKey: "navAcademics", icon: GraduationCap, permission: "academics.view" },
  { href: "/dashboard/subjects", labelKey: "navSubjectPerformance", icon: BookOpen, permission: "subjects.view" },
  { href: "/dashboard/assessments", labelKey: "navAssessments", icon: ClipboardList, permission: "assessments.view" },
  { href: "/dashboard/progress", labelKey: "navStudentProgress", icon: UserSearch, permission: "progress.view" },
  { href: "/dashboard/terms", labelKey: "navTermProgress", icon: CalendarRange, permission: "terms.view" },
  { href: "/dashboard/subject-trends", labelKey: "navSubjectTrends", icon: TrendingUp, permission: "subject_trends.view" },
  { href: "/dashboard/honor-roll", labelKey: "navHonorRoll", icon: Trophy, permission: "honor_roll.view" },
  { href: "/dashboard/at-risk", labelKey: "navAtRisk", icon: AlertTriangle, permission: "at_risk.view" },
  { href: "/dashboard/attendance", labelKey: "navAttendance", icon: CalendarOff, permission: "attendance.view" },
  { href: "/dashboard/delinquency", labelKey: "navDelinquency", icon: DollarSign, permission: "delinquency.view" },
  { href: "/dashboard/documents", labelKey: "navDocumentExpiry", icon: FileText, permission: "documents.view" },
  { href: "/dashboard/notifications", labelKey: "navNotifications", icon: BellRing, permission: "notifications.view" },
  { href: "/dashboard/messages", labelKey: "navMessages" as TranslationKeys, icon: MessageSquare, permission: "notifications.view" },
  { href: "/dashboard/whatsapp", labelKey: "navWhatsApp" as TranslationKeys, icon: Phone, permission: "notifications.view" },
  { href: "/dashboard/fees", labelKey: "navFees", icon: Wallet, permission: "fees.view" },
  { href: "/dashboard/progress-report", labelKey: "navProgressReport" as TranslationKeys, icon: ClipboardList, permission: "progress.view" as Permission },
  { href: "/dashboard/library", labelKey: "navLibrary" as TranslationKeys, icon: BookOpen, permission: "library.view" as Permission },
  { href: "/dashboard/quizzes", labelKey: "navQuizzes" as TranslationKeys, icon: HelpCircle, permission: "quizzes.view" as Permission },
  { href: "/dashboard/transfers", labelKey: "navTransfers", icon: ArrowRightLeft, permission: "transfers.view" },
  { href: "/dashboard/bulk-export", labelKey: "navBulkExport", icon: Printer, permission: "bulk_export.view" },
  { href: "/dashboard/pdf-reports", labelKey: "navPdfReports" as TranslationKeys, icon: FileText, permission: "bulk_export.view" },
  { href: "/dashboard/analytics", labelKey: "navAnalytics", icon: PieChart, permission: "analytics.view" },
  { href: "/dashboard/compare", labelKey: "navYearComparison", icon: GitCompareArrows, permission: "year_comparison.view" },
  { href: "/dashboard/ai-insights", labelKey: "navAiInsights" as TranslationKeys, icon: Sparkles, permission: "ai_insights.view" as Permission },
  { href: "/dashboard/transcript-settings", labelKey: "navTranscriptSettings", icon: Settings, permission: "transcript_settings.view" },
  { href: "/dashboard/upload", labelKey: "navUpload", icon: Upload, permission: "upload.view" },
  { href: "/dashboard/diplomas", labelKey: "navDiplomas" as TranslationKeys, icon: GraduationCap, permission: "certificates.print" as Permission },
  { href: "/dashboard/admin/users", labelKey: "navUserManagement" as TranslationKeys, icon: Users, permission: "admin.users" },
  { href: "/dashboard/admin/class-assignment", labelKey: "navClassAssignment" as TranslationKeys, icon: BookOpen, permission: "admin.users" },
  { href: "/dashboard/audit-log", labelKey: "navAuditLog" as TranslationKeys, icon: Shield, permission: "admin.audit_log" as Permission },
  { href: "/dashboard/staff", labelKey: "navStaffDirectory" as TranslationKeys, icon: Contact, permission: "staff.view" as Permission },
  { href: "/dashboard/it-inventory", labelKey: "navITInventory" as TranslationKeys, icon: Laptop, permission: "inventory.view" as Permission },
  { href: "/dashboard/book-sales", labelKey: "navBookSales" as TranslationKeys, icon: ShoppingCart, permission: "book_sales.view" as Permission },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { user, role, signOut, can } = useAuth();
  const router = useRouter();
  const { years, selectedYear, selectedLabel, setSelectedYear, loading: yearsLoading } =
    useAcademicYear();
  const { schoolFilter, setSchoolFilter, locked: schoolLocked } = useSchoolFilter();
  const { t, isRTL: rtl } = useLanguage();

  // Filter nav items by user's permissions
  const filteredNav = NAV.filter(({ permission }) => can(permission));

  const handleSignOut = async () => {
    await signOut();
    document.cookie = "__session=; path=/; max-age=0";
    router.push("/");
  };

  return (
    <div className={cn("flex min-h-screen", rtl && "flex-row-reverse")}>
      {/* ── Sidebar ───────────────────────────────────────────────── */}
      <aside className={cn("sticky top-0 flex h-screen w-64 flex-col bg-card", rtl ? "border-l" : "border-r")}>
        <div className="flex h-16 items-center gap-2 px-6">
          <BarChart3 className="h-6 w-6 text-primary" />
          <span className="text-lg font-semibold">{t("appName")}</span>
        </div>

        <Separator />

        {/* Academic Year Picker */}
        <div className="px-4 py-3">
          <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" />
            {t("academicYear")}
          </label>
          <select
            value={selectedYear ?? ""}
            onChange={(e) => setSelectedYear(e.target.value)}
            disabled={yearsLoading}
            className="h-9 w-full rounded-md border bg-background px-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {years.map((code) => {
              // Convert "22-23" → "2022–2023"
              const parts = code.split("-");
              let label = code;
              if (parts.length === 2) {
                const a = Number(parts[0]);
                const b = Number(parts[1]);
                if (!isNaN(a) && !isNaN(b)) {
                  const y1 = a >= 50 ? 1900 + a : 2000 + a;
                  const y2 = b >= 50 ? 1900 + b : 2000 + b;
                  label = `${y1}–${y2}`;
                }
              }
              return (
                <option key={code} value={code}>
                  {label}
                </option>
              );
            })}
          </select>
        </div>

        <Separator />

        {/* School Filter */}
        <div className="px-4 py-3">
          <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <School className="h-3.5 w-3.5" />
            {t("school")}
          </label>
          <select
            value={schoolFilter}
            onChange={(e) => setSchoolFilter(e.target.value as SchoolFilter)}
            disabled={schoolLocked}
            className="h-9 w-full rounded-md border bg-background px-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
          >
            <option value="all">{t("allSchools")}</option>
            <option value="0021-01">{t("boysSchool")}</option>
            <option value="0021-02">{t("girlsSchool")}</option>
          </select>
        </div>

        <Separator />

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {filteredNav.map(({ href, labelKey, icon: Icon }) => {
            const active =
              href === "/dashboard"
                ? pathname === "/dashboard"
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
                <Icon className="h-4 w-4" />
                {t(labelKey)}
              </Link>
            );
          })}
        </nav>

        <Separator />

        <div className="p-4">
          <p className="mb-1 truncate text-xs text-muted-foreground">
            {user?.email ?? "—"}
          </p>
          {role && (
            <p className="mb-2 truncate text-xs font-medium text-primary">
              {ROLES[role]}
            </p>
          )}
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={handleSignOut}
          >
            <LogOut className={cn("h-4 w-4", rtl ? "ml-2" : "mr-2")} />
            {t("signOut")}
          </Button>
        </div>
      </aside>

      {/* ── Main content ──────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto bg-muted/40">
        {/* Top bar with notification bell + language switcher */}
        <div className="flex items-center justify-end gap-2 border-b bg-card px-6 py-2">
          <ThemeToggle />
          <LanguageSwitcher variant="icon" />
          <NotificationBell />
        </div>
        <div className="p-6 lg:p-8">
          {children}
        </div>
      </main>

      {/* ── Command Palette (Ctrl+K) ── */}
      <CommandPalette />
    </div>
  );
}
