"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
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
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  ClipboardEdit,
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
  Package,
  Cpu,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  Menu,
  Search,
  Megaphone,
  Headphones,
  Baby,
  Bot,
  ClipboardCheck,
  Kanban,
  TestTube,
  UserCheck,
  Presentation,
  LayoutGrid,
  Calendar,
  SlidersHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { NotificationBell } from "@/components/dashboard/notification-bell";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { CommandPalette } from "@/components/command-palette";
import { RoleSwitcher, ACTIVE_PORTAL_KEY } from "@/components/role-switcher";
import { ROLE_PERMISSIONS } from "@/lib/rbac";
import { useLanguage } from "@/context/language-context";
import type { TranslationKeys } from "@/lib/i18n/translations";
import { ROLES, type Permission, type Role } from "@/lib/rbac";
import { motion, AnimatePresence } from "framer-motion";

/* ── Grouped Navigation ─────────────────────────────────── */

interface NavItem {
  href: string;
  labelKey: TranslationKeys;
  icon: React.ElementType;
  permission: Permission;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Main",
    items: [
      { href: "/dashboard", labelKey: "navOverview", icon: LayoutDashboard, permission: "dashboard.view" },
    ],
  },
  {
    label: "Students",
    items: [
      { href: "/dashboard/reports", labelKey: "navStudents", icon: Users, permission: "students.view" },
      { href: "/dashboard/students", labelKey: "navStudentProfile", icon: User, permission: "students.profile" },
      { href: "/dashboard/progress", labelKey: "navStudentProgress", icon: UserSearch, permission: "progress.view" },
      { href: "/dashboard/honor-roll", labelKey: "navHonorRoll", icon: Trophy, permission: "honor_roll.view" },
      { href: "/dashboard/at-risk", labelKey: "navAtRisk", icon: AlertTriangle, permission: "at_risk.view" },
    ],
  },
  {
    label: "Academics",
    items: [
      { href: "/dashboard/academics", labelKey: "navAcademics", icon: GraduationCap, permission: "academics.view" },
      { href: "/dashboard/subjects", labelKey: "navSubjectPerformance", icon: BookOpen, permission: "subjects.view" },
      { href: "/dashboard/assessments", labelKey: "navAssessments", icon: ClipboardList, permission: "assessments.view" },
      { href: "/dashboard/assessment-setup", labelKey: "navAssessmentSetup" as TranslationKeys, icon: SlidersHorizontal, permission: "assessments.manage" as Permission },
      { href: "/dashboard/terms", labelKey: "navTermProgress", icon: CalendarRange, permission: "terms.view" },
      { href: "/dashboard/subject-trends", labelKey: "navSubjectTrends", icon: TrendingUp, permission: "subject_trends.view" },
      { href: "/dashboard/quizzes", labelKey: "navQuizzes" as TranslationKeys, icon: HelpCircle, permission: "quizzes.view" as Permission },
    ],
  },
  {
    label: "Kindergarten",
    items: [
      { href: "/dashboard/kg", labelKey: "navKG" as TranslationKeys, icon: Baby, permission: "kg.view" as Permission },
      { href: "/dashboard/kg/reports", labelKey: "navKGReports" as TranslationKeys, icon: FileText, permission: "kg.view" as Permission },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/dashboard/attendance", labelKey: "navAttendance", icon: CalendarOff, permission: "attendance.view" },
      { href: "/dashboard/documents", labelKey: "navDocumentExpiry", icon: FileText, permission: "documents.view" },
      { href: "/dashboard/transfers", labelKey: "navTransfers", icon: ArrowRightLeft, permission: "transfers.view" },
      { href: "/dashboard/library", labelKey: "navLibrary" as TranslationKeys, icon: BookOpen, permission: "library.view" as Permission },
      { href: "/dashboard/general-store", labelKey: "navGeneralStore" as TranslationKeys, icon: Package, permission: "general_store.view" as Permission },
      { href: "/dashboard/it-store", labelKey: "navITStore" as TranslationKeys, icon: Cpu, permission: "it_store.view" as Permission },
      { href: "/dashboard/it-tickets", labelKey: "navITTickets" as TranslationKeys, icon: Headphones, permission: "tickets.manage" as Permission },
    ],
  },
  {
    label: "Finance",
    items: [
      { href: "/dashboard/fees", labelKey: "navFees", icon: Wallet, permission: "fees.view" },
      { href: "/dashboard/delinquency", labelKey: "navDelinquency", icon: DollarSign, permission: "delinquency.view" },
      { href: "/dashboard/book-sales", labelKey: "navBookSales" as TranslationKeys, icon: ShoppingCart, permission: "book_sales.view" as Permission },
    ],
  },
  {
    label: "Communication",
    items: [
      { href: "/dashboard/notifications", labelKey: "navNotifications", icon: BellRing, permission: "notifications.view" },
      { href: "/dashboard/messages", labelKey: "navMessages" as TranslationKeys, icon: MessageSquare, permission: "notifications.view" },
      { href: "/dashboard/whatsapp", labelKey: "navWhatsApp" as TranslationKeys, icon: Phone, permission: "notifications.view" },
      { href: "/dashboard/whatsapp-logs", labelKey: "navWhatsAppLogs" as TranslationKeys, icon: Bot, permission: "notifications.view" },
      { href: "/dashboard/contact-updates", labelKey: "navContactUpdates" as TranslationKeys, icon: ClipboardEdit, permission: "notifications.view" },
      { href: "/dashboard/announcements", labelKey: "navAnnouncements" as TranslationKeys, icon: Megaphone, permission: "announcements.manage" as Permission },
    ],
  },
  {
    label: "Reports",
    items: [
      { href: "/dashboard/progress-report", labelKey: "navProgressReport" as TranslationKeys, icon: ClipboardList, permission: "progress.view" as Permission },
      { href: "/dashboard/bulk-export", labelKey: "navBulkExport", icon: Printer, permission: "bulk_export.view" },
      { href: "/dashboard/pdf-reports", labelKey: "navPdfReports" as TranslationKeys, icon: FileText, permission: "bulk_export.view" },
      { href: "/dashboard/store-reports", labelKey: "navStoreReports" as TranslationKeys, icon: BarChart3, permission: "store_reports.view" as Permission },
      { href: "/dashboard/analytics", labelKey: "navAnalytics", icon: PieChart, permission: "analytics.view" },
      { href: "/dashboard/compare", labelKey: "navYearComparison", icon: GitCompareArrows, permission: "year_comparison.view" },
      { href: "/dashboard/ai-insights", labelKey: "navAiInsights" as TranslationKeys, icon: Sparkles, permission: "ai_insights.view" as Permission },
    ],
  },
  {
    label: "Admissions",
    items: [
      { href: "/dashboard/admissions", labelKey: "navAdmissions" as TranslationKeys, icon: ClipboardCheck, permission: "admissions.view" as Permission },
      { href: "/dashboard/admissions/enquiries", labelKey: "navAdmissionEnquiries" as TranslationKeys, icon: ClipboardList, permission: "admissions.view" as Permission },
      { href: "/dashboard/admissions/pipeline", labelKey: "navAdmissionPipeline" as TranslationKeys, icon: Kanban, permission: "admissions.manage" as Permission },
      { href: "/dashboard/admissions/tests", labelKey: "navAdmissionTests" as TranslationKeys, icon: TestTube, permission: "admissions.manage" as Permission },
      { href: "/dashboard/admissions/interviews", labelKey: "navAdmissionInterviews" as TranslationKeys, icon: UserCheck, permission: "admissions.manage" as Permission },
      { href: "/dashboard/admissions/reports", labelKey: "navAdmissionReports" as TranslationKeys, icon: BarChart3, permission: "admissions.reports" as Permission },
    ],
  },
  {
    label: "Admin",
    items: [
      { href: "/dashboard/transcript-settings", labelKey: "navTranscriptSettings", icon: Settings, permission: "transcript_settings.view" },
      { href: "/dashboard/academic-year-settings", labelKey: "navAcademicYearSettings" as TranslationKeys, icon: CalendarDays, permission: "transcript_settings.view" },
      { href: "/dashboard/upload", labelKey: "navUpload", icon: Upload, permission: "upload.view" },
      { href: "/dashboard/diplomas", labelKey: "navDiplomas" as TranslationKeys, icon: GraduationCap, permission: "certificates.print" as Permission },
      { href: "/dashboard/admin/users", labelKey: "navUserManagement" as TranslationKeys, icon: Users, permission: "admin.users" },
      { href: "/dashboard/admin/class-assignment", labelKey: "navClassAssignment" as TranslationKeys, icon: BookOpen, permission: "admin.users" },
      { href: "/dashboard/admin/exam-seating/halls", labelKey: "navExamHalls" as TranslationKeys, icon: LayoutGrid, permission: "exam_seating.manage" as Permission },
      { href: "/dashboard/admin/exam-seating/schedule", labelKey: "navExamSchedule" as TranslationKeys, icon: Calendar, permission: "exam_seating.manage" as Permission },
      { href: "/dashboard/admin/exam-seating/plan", labelKey: "navExamSeating" as TranslationKeys, icon: Users, permission: "exam_seating.manage" as Permission },
      { href: "/dashboard/audit-log", labelKey: "navAuditLog" as TranslationKeys, icon: Shield, permission: "admin.audit_log" as Permission },
      { href: "/dashboard/staff", labelKey: "navStaffDirectory" as TranslationKeys, icon: Contact, permission: "staff.view" as Permission },
      { href: "/dashboard/it-inventory", labelKey: "navITInventory" as TranslationKeys, icon: Laptop, permission: "inventory.view" as Permission },
      { href: "/dashboard/store-proposal", labelKey: "navStoreProposal" as TranslationKeys, icon: FileText, permission: "admin.users" as Permission },
      { href: "/dashboard/app-features", labelKey: "navAppFeatures" as TranslationKeys, icon: Presentation, permission: "admin.audit_log" as Permission },
    ],
  },
];

/* ── Collapsible Nav Group ──────────────────────────────── */

function NavGroupSection({
  label,
  items,
  pathname,
  t,
  collapsed,
  onToggle,
  onNavigate,
  mini,
}: {
  label: string;
  items: NavItem[];
  pathname: string;
  t: (k: TranslationKeys) => string;
  collapsed: boolean;
  onToggle: () => void;
  onNavigate?: () => void;
  mini?: boolean;
}) {
  const hasActive = items.some(({ href }) =>
    href === "/dashboard"
      ? pathname === "/dashboard"
      : pathname.startsWith(href)
  );

  /* ── Mini mode: just show icons with tooltips, no group headers ── */
  if (mini) {
    return (
      <div className="mb-2 flex flex-col items-center gap-0.5">
        {items.map(({ href, labelKey, icon: Icon }) => {
          const active =
            href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(href);
          return (
            <Tooltip key={href}>
              <TooltipTrigger asChild>
                <Link
                  href={href}
                  onClick={onNavigate}
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-lg transition-all duration-150",
                    active
                      ? "bg-sidebar-primary/20 text-sidebar-primary shadow-sm"
                      : "text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  )}
                >
                  <Icon className="h-4 w-4" />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs">
                {t(labelKey)}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    );
  }

  /* ── Full mode ── */
  return (
    <div className="mb-1">
      {/* Group header — clickable to collapse */}
      <button
        onClick={onToggle}
        className={cn(
          "flex w-full items-center justify-between rounded-md px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider transition-colors",
          hasActive
            ? "text-sidebar-primary-foreground"
            : "text-sidebar-foreground/40 hover:text-sidebar-foreground/70"
        )}
      >
        {label}
        <ChevronDown
          className={cn(
            "h-3 w-3 transition-transform duration-200",
            collapsed && "-rotate-90"
          )}
        />
      </button>

      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="space-y-0.5 py-0.5">
              {items.map(({ href, labelKey, icon: Icon }) => {
                const active =
                  href === "/dashboard"
                    ? pathname === "/dashboard"
                    : pathname.startsWith(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={onNavigate}
                    className={cn(
                      "group flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-150",
                      active
                        ? "bg-sidebar-primary/20 text-sidebar-primary-foreground shadow-sm"
                        : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                    )}
                  >
                    <Icon
                      className={cn(
                        "h-4 w-4 shrink-0 transition-colors",
                        active
                          ? "text-sidebar-primary"
                          : "text-sidebar-foreground/40 group-hover:text-sidebar-foreground/70"
                      )}
                    />
                    {t(labelKey)}
                  </Link>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Sidebar Content (shared between desktop & mobile) ──── */

function SidebarContent({
  pathname,
  t,
  rtl,
  filteredGroups,
  user,
  role,
  years,
  selectedYear,
  selectedLabel,
  setSelectedYear,
  yearsLoading,
  yearLocked,
  schoolFilter,
  setSchoolFilter,
  schoolLocked,
  onSignOut,
  collapsedGroups,
  toggleGroup,
  onNavigate,
  mini,
  onToggleMini,
}: {
  pathname: string;
  t: (k: TranslationKeys) => string;
  rtl: boolean;
  filteredGroups: { label: string; items: NavItem[] }[];
  user: { email?: string | null } | null;
  role: string | null;
  years: string[];
  selectedYear: string | null;
  selectedLabel: string;
  setSelectedYear: (y: string) => void;
  yearsLoading: boolean;
  yearLocked: boolean;
  schoolFilter: SchoolFilter;
  setSchoolFilter: (f: SchoolFilter) => void;
  schoolLocked: boolean;
  onSignOut: () => void;
  collapsedGroups: Record<string, boolean>;
  toggleGroup: (label: string) => void;
  onNavigate?: () => void;
  mini?: boolean;
  onToggleMini?: () => void;
}) {
  return (
    <div className="flex h-full flex-col overflow-hidden bg-sidebar">
      {/* Logo */}
      <div className={cn("flex h-16 shrink-0 items-center gap-3", mini ? "justify-center px-2" : "px-5")}>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary/20">
          <BarChart3 className="h-5 w-5 text-sidebar-primary" />
        </div>
        {!mini && (
          <div className="flex flex-col">
            <span className="text-sm font-bold text-sidebar-foreground leading-tight">
              {t("appName")}
            </span>
            <span className="text-[10px] text-sidebar-foreground/40">
              Khaled International Schools
            </span>
          </div>
        )}
      </div>

      {/* Filters — hidden in mini mode */}
      {!mini && (
        <div className="mx-4 shrink-0 space-y-2.5 rounded-xl bg-sidebar-accent/50 p-3">
        <div>
          <label className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
            <CalendarDays className="h-3 w-3" />
            {t("academicYear")}
          </label>
          {yearLocked ? (
            <div className="h-8 w-full rounded-lg bg-sidebar-accent px-2.5 text-xs font-medium text-sidebar-foreground flex items-center">
              {selectedLabel}
            </div>
          ) : (
          <select
            value={selectedYear ?? ""}
            onChange={(e) => setSelectedYear(e.target.value)}
            disabled={yearsLoading}
            className="h-8 w-full rounded-lg border-0 bg-sidebar-accent px-2.5 text-xs font-medium text-sidebar-foreground focus:outline-none focus:ring-2 focus:ring-sidebar-primary/50"
          >
            {years.map((code) => {
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
          )}
        </div>
        <div>
          <label className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
            <School className="h-3 w-3" />
            {t("school")}
          </label>
          {schoolLocked ? (
            <div className="h-8 w-full rounded-lg bg-sidebar-accent px-2.5 text-xs font-medium text-sidebar-foreground flex items-center">
              {schoolFilter === "0021-01" ? t("boysSchool") : schoolFilter === "0021-02" ? t("girlsSchool") : t("allSchools")}
            </div>
          ) : (
          <select
            value={schoolFilter}
            onChange={(e) => setSchoolFilter(e.target.value as SchoolFilter)}
            className="h-8 w-full rounded-lg border-0 bg-sidebar-accent px-2.5 text-xs font-medium text-sidebar-foreground focus:outline-none focus:ring-2 focus:ring-sidebar-primary/50"
          >
            <option value="all">{t("allSchools")}</option>
            <option value="0021-01">{t("boysSchool")}</option>
            <option value="0021-02">{t("girlsSchool")}</option>
          </select>
          )}
        </div>
      </div>
      )}

      {/* Navigation */}
      <ScrollArea className={cn("min-h-0 flex-1 py-3", mini ? "px-1.5" : "px-3")}>
        {filteredGroups.map(({ label, items }) => (
          <NavGroupSection
            key={label}
            label={label}
            items={items}
            pathname={pathname}
            t={t}
            collapsed={!!collapsedGroups[label]}
            onToggle={() => toggleGroup(label)}
            onNavigate={onNavigate}
            mini={mini}
          />
        ))}
      </ScrollArea>

      {/* Collapse toggle — desktop only */}
      {onToggleMini && (
        <div className="shrink-0 flex justify-center border-t border-sidebar-border py-2">
          <button
            onClick={onToggleMini}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-sidebar-foreground/40 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
          >
            {mini ? (
              <ChevronsRight className={cn("h-4 w-4", rtl && "rotate-180")} />
            ) : (
              <ChevronsLeft className={cn("h-4 w-4", rtl && "rotate-180")} />
            )}
          </button>
        </div>
      )}

      {/* User info + sign-out */}
      <div className={cn("shrink-0 border-t border-sidebar-border", mini ? "p-2" : "p-4")}>
        <div className={cn("flex items-center", mini ? "flex-col gap-2" : "gap-3")}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sidebar-primary/20 text-sm font-bold text-sidebar-primary cursor-default">
                {user?.email?.charAt(0).toUpperCase() ?? "?"}
              </div>
            </TooltipTrigger>
            {mini && (
              <TooltipContent side="right" className="text-xs">
                <p>{user?.email ?? "—"}</p>
                {role && <p className="text-muted-foreground">{ROLES[role as keyof typeof ROLES]}</p>}
              </TooltipContent>
            )}
          </Tooltip>
          {!mini && (
            <>
              <div className="flex-1 min-w-0">
                <p className="truncate text-xs font-medium text-sidebar-foreground">
                  {user?.email ?? "—"}
                </p>
                {role && (
                  <p className="truncate text-[10px] text-sidebar-primary">
                    {ROLES[role as keyof typeof ROLES]}
                  </p>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                className="shrink-0 text-sidebar-foreground/40 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                onClick={onSignOut}
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </>
          )}
          {mini && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-sidebar-foreground/40 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                  onClick={onSignOut}
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs">
                Sign out
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Main Layout ────────────────────────────────────────── */

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { user, role, signOut, can } = useAuth();
  const { secondaryRoles } = useAuth();
  const [fallbackPrimaryRole, setFallbackPrimaryRole] = useState<Role | null>(null);
  const [fallbackSecondaryRoles, setFallbackSecondaryRoles] = useState<Role[]>([]);
  const effectivePrimaryRole = role ?? fallbackPrimaryRole ?? "viewer";
  const effectiveSecondaryRoles = secondaryRoles.length ? secondaryRoles : fallbackSecondaryRoles;
  const [activePortalRole, setActivePortalRole] = useState<string | null>(null);

  // Fallback: restore roles from teacher session cache when auth context hasn't loaded them.
  useEffect(() => {
    try {
      const raw = localStorage.getItem("teacher_session");
      if (!raw) {
        setFallbackPrimaryRole(null);
        setFallbackSecondaryRoles([]);
        return;
      }
      const parsed = JSON.parse(raw) as { role?: string; secondary_roles?: string[] };
      const parsedRole = parsed.role;
      const parsedSecondary = Array.isArray(parsed.secondary_roles) ? parsed.secondary_roles : [];

      setFallbackPrimaryRole(
        parsedRole && parsedRole in ROLE_PERMISSIONS ? (parsedRole as Role) : null
      );
      setFallbackSecondaryRoles(
        parsedSecondary.filter((r): r is Role => r in ROLE_PERMISSIONS)
      );
    } catch {
      setFallbackPrimaryRole(null);
      setFallbackSecondaryRoles([]);
    }
  }, []);

  // Read active portal from localStorage (set by RoleSwitcher)
  useEffect(() => {
    const stored = localStorage.getItem(ACTIVE_PORTAL_KEY);
    // Only apply scoping if the stored role is actually one of the user's secondary roles
    if (stored && effectiveSecondaryRoles.includes(stored as Role)) {
      setActivePortalRole(stored);
    } else {
      setActivePortalRole(null);
    }
  }, [effectiveSecondaryRoles]);
  const router = useRouter();
  const { years, selectedYear, selectedLabel, setSelectedYear, loading: yearsLoading } =
    useAcademicYear();
  const { schoolFilter, setSchoolFilter, locked: schoolLocked } = useSchoolFilter();
  const { t, isRTL: rtl } = useLanguage();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [sidebarMini, setSidebarMini] = useState(false);

  const toggleGroup = (label: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  // Filter nav groups by user permissions
  // If a secondary portal is active, scope nav to ONLY that role's permissions
  const filteredGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter(({ permission }) => {
      if (activePortalRole) {
        return ROLE_PERMISSIONS[activePortalRole as keyof typeof ROLE_PERMISSIONS]?.includes(permission) ?? false;
      }
      return can(permission);
    }),
  })).filter((group) => group.items.length > 0);

  const yearLocked = effectivePrimaryRole === "teacher";

  const handleSignOut = async () => {
    await signOut();
    document.cookie = "__session=; path=/; max-age=0";
    router.push("/");
  };

  const sidebarProps = {
    pathname,
    t,
    rtl,
    filteredGroups,
    user,
    role,
    years,
    selectedYear,
    selectedLabel,
    setSelectedYear,
    yearsLoading,
    yearLocked,
    schoolFilter,
    setSchoolFilter,
    schoolLocked,
    onSignOut: handleSignOut,
    collapsedGroups,
    toggleGroup,
  };

  return (
    <TooltipProvider>
    <div className={cn("flex min-h-screen", rtl && "flex-row-reverse")}>
      {/* ── Desktop Sidebar ──────────────────────────────────── */}
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 transition-[width] duration-200 ease-in-out lg:flex lg:flex-col",
          sidebarMini ? "w-[64px]" : "w-[260px]",
          rtl ? "border-l border-sidebar-border" : "border-r border-sidebar-border"
        )}
      >
        <SidebarContent
          {...sidebarProps}
          mini={sidebarMini}
          onToggleMini={() => setSidebarMini((v) => !v)}
        />
      </aside>

      {/* ── Main content ──────────────────────────────────────── */}
      <main className="flex flex-1 flex-col overflow-x-hidden">
        {/* Top bar */}
        <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur-xl lg:px-6">
          {/* Mobile menu trigger */}
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
              <SidebarContent
                {...sidebarProps}
                onNavigate={() => setMobileOpen(false)}
              />
            </SheetContent>
          </Sheet>

          {/* Current year badge */}
          <div className="hidden sm:flex items-center gap-2 rounded-lg bg-primary/5 px-3 py-1.5">
            <CalendarDays className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-medium text-primary">
              {selectedLabel}
            </span>
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Right actions */}
          <div className="flex items-center gap-1">
            <RoleSwitcher
              primaryRole={effectivePrimaryRole}
              secondaryRoles={effectiveSecondaryRoles}
            />
            <ThemeToggle />
            <LanguageSwitcher variant="icon" />
            <NotificationBell />
          </div>
        </header>

        {/* Page content */}
        <div className="flex-1 bg-muted/30 p-4 lg:p-8">
          {children}
        </div>
      </main>

      {/* ── Command Palette (Ctrl+K) ── */}
      <CommandPalette />
    </div>
    </TooltipProvider>
  );
}
