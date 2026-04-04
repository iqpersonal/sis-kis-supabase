"use client";

import * as React from "react";
import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  LayoutDashboard,
  Users,
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
  Search,
  Sun,
  Moon,
  Globe,
  User,
} from "lucide-react";
import { useLanguage } from "@/context/language-context";
import { useTheme } from "@/context/theme-context";
import type { TranslationKeys } from "@/lib/i18n/translations";
import { getDb } from "@/lib/firebase";
import { collection, query, where, getDocs, limit, orderBy } from "firebase/firestore";

/* ------------------------------------------------------------------ */
/*  Navigation items (mirrors sidebar)                                 */
/* ------------------------------------------------------------------ */

const NAV_ITEMS: {
  href: string;
  labelKey: TranslationKeys;
  icon: React.ElementType;
}[] = [
  { href: "/dashboard", labelKey: "navOverview", icon: LayoutDashboard },
  { href: "/dashboard/reports", labelKey: "navStudents", icon: Users },
  { href: "/dashboard/academics", labelKey: "navAcademics", icon: GraduationCap },
  { href: "/dashboard/subjects", labelKey: "navSubjectPerformance", icon: BookOpen },
  { href: "/dashboard/assessments", labelKey: "navAssessments", icon: ClipboardList },
  { href: "/dashboard/progress", labelKey: "navStudentProgress", icon: UserSearch },
  { href: "/dashboard/terms", labelKey: "navTermProgress", icon: CalendarRange },
  { href: "/dashboard/subject-trends", labelKey: "navSubjectTrends", icon: TrendingUp },
  { href: "/dashboard/honor-roll", labelKey: "navHonorRoll", icon: Trophy },
  { href: "/dashboard/at-risk", labelKey: "navAtRisk", icon: AlertTriangle },
  { href: "/dashboard/attendance", labelKey: "navAttendance", icon: CalendarOff },
  { href: "/dashboard/delinquency", labelKey: "navDelinquency", icon: DollarSign },
  { href: "/dashboard/documents", labelKey: "navDocumentExpiry", icon: FileText },
  { href: "/dashboard/notifications", labelKey: "navNotifications", icon: BellRing },
  { href: "/dashboard/fees", labelKey: "navFees", icon: Wallet },
  { href: "/dashboard/library", labelKey: "navLibrary" as TranslationKeys, icon: BookOpen },
  { href: "/dashboard/transfers", labelKey: "navTransfers", icon: ArrowRightLeft },
  { href: "/dashboard/bulk-export", labelKey: "navBulkExport", icon: Printer },
  { href: "/dashboard/analytics", labelKey: "navAnalytics", icon: PieChart },
  { href: "/dashboard/compare", labelKey: "navYearComparison", icon: GitCompareArrows },
  { href: "/dashboard/transcript-settings", labelKey: "navTranscriptSettings", icon: Settings },
  { href: "/dashboard/upload", labelKey: "navUpload", icon: Upload },
];

/* ------------------------------------------------------------------ */
/*  Student search helper                                              */
/* ------------------------------------------------------------------ */

interface StudentResult {
  Student_Number: string;
  E_Full_Name: string;
  A_Full_Name: string;
}

async function searchStudents(term: string): Promise<StudentResult[]> {
  const db = getDb();
  if (!db || !term || term.length < 2) return [];

  const results: StudentResult[] = [];

  // Search by student number (exact prefix match)
  if (/^\d+$/.test(term)) {
    const q = query(
      collection(db, "students"),
      where("Student_Number", ">=", Number(term)),
      where("Student_Number", "<=", Number(term) + 999),
      limit(8)
    );
    const snap = await getDocs(q);
    snap.forEach((doc) => {
      const d = doc.data();
      results.push({
        Student_Number: String(d.Student_Number || ""),
        E_Full_Name: String(d.E_Full_Name || d.E_Child_Name || ""),
        A_Full_Name: String(d.A_Full_Name || d.A_Child_Name || ""),
      });
    });
    return results;
  }

  // For name search, query browse_index or students with a text prefix
  // Since Firestore doesn't support full-text, do a prefix match on E_Full_Name
  const upperTerm = term.charAt(0).toUpperCase() + term.slice(1);
  const q = query(
    collection(db, "students"),
    orderBy("E_Full_Name"),
    where("E_Full_Name", ">=", upperTerm),
    where("E_Full_Name", "<=", upperTerm + "\uf8ff"),
    limit(8)
  );
  const snap = await getDocs(q);
  snap.forEach((doc) => {
    const d = doc.data();
    results.push({
      Student_Number: String(d.Student_Number || ""),
      E_Full_Name: String(d.E_Full_Name || d.E_Child_Name || ""),
      A_Full_Name: String(d.A_Full_Name || d.A_Child_Name || ""),
    });
  });

  return results;
}

/* ------------------------------------------------------------------ */
/*  CommandPalette component                                           */
/* ------------------------------------------------------------------ */

export function CommandPalette() {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [students, setStudents] = React.useState<StudentResult[]>([]);
  const [searching, setSearching] = React.useState(false);
  const router = useRouter();
  const { t, locale, setLocale } = useLanguage();
  const { theme, setTheme } = useTheme();

  // Global keyboard shortcut: Ctrl+K / Cmd+K
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // Debounced student search
  React.useEffect(() => {
    if (search.length < 2) {
      setStudents([]);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await searchStudents(search);
        setStudents(results);
      } catch {
        setStudents([]);
      }
      setSearching(false);
    }, 300);

    return () => clearTimeout(timer);
  }, [search]);

  const runAction = (fn: () => void) => {
    fn();
    setOpen(false);
    setSearch("");
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => {
          setOpen(false);
          setSearch("");
        }}
      />

      {/* Command dialog */}
      <div className="absolute left-1/2 top-[20%] w-full max-w-lg -translate-x-1/2">
        <Command
          className="rounded-xl border bg-popover text-popover-foreground shadow-2xl"
          shouldFilter={true}
        >
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
            <Command.Input
              value={search}
              onValueChange={setSearch}
              placeholder={t("commandPalettePlaceholder")}
              className="flex h-12 w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
            />
            <kbd className="pointer-events-none ml-2 hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground sm:inline-flex">
              ESC
            </kbd>
          </div>

          <Command.List className="max-h-80 overflow-y-auto p-2">
            <Command.Empty className="px-4 py-6 text-center text-sm text-muted-foreground">
              {searching ? t("searching") : t("noResults")}
            </Command.Empty>

            {/* ── Pages ── */}
            <Command.Group
              heading={t("commandPages")}
              className="px-2 py-1.5 text-xs font-semibold text-muted-foreground"
            >
              {NAV_ITEMS.map(({ href, labelKey, icon: Icon }) => (
                <Command.Item
                  key={href}
                  value={t(labelKey)}
                  onSelect={() => runAction(() => router.push(href))}
                  className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors aria-selected:bg-accent aria-selected:text-accent-foreground"
                >
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  {t(labelKey)}
                </Command.Item>
              ))}
            </Command.Group>

            {/* ── Students ── */}
            {students.length > 0 && (
              <Command.Group
                heading={t("commandStudents")}
                className="px-2 py-1.5 text-xs font-semibold text-muted-foreground"
              >
                {students.map((s) => (
                  <Command.Item
                    key={s.Student_Number}
                    value={`${s.Student_Number} ${s.E_Full_Name} ${s.A_Full_Name}`}
                    onSelect={() =>
                      runAction(() =>
                        router.push(
                          `/dashboard/students/${s.Student_Number}`
                        )
                      )
                    }
                    className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors aria-selected:bg-accent aria-selected:text-accent-foreground"
                  >
                    <User className="h-4 w-4 text-muted-foreground" />
                    <div className="flex flex-col">
                      <span>
                        {locale === "ar" ? s.A_Full_Name || s.E_Full_Name : s.E_Full_Name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        #{s.Student_Number}
                      </span>
                    </div>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {/* ── Quick Actions ── */}
            <Command.Group
              heading={t("commandActions")}
              className="px-2 py-1.5 text-xs font-semibold text-muted-foreground"
            >
              <Command.Item
                value={`${t("darkMode")} ${t("lightMode")} theme`}
                onSelect={() =>
                  runAction(() =>
                    setTheme(theme === "dark" ? "light" : "dark")
                  )
                }
                className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors aria-selected:bg-accent aria-selected:text-accent-foreground"
              >
                {theme === "dark" ? (
                  <Sun className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Moon className="h-4 w-4 text-muted-foreground" />
                )}
                {theme === "dark" ? t("lightMode") : t("darkMode")}
              </Command.Item>

              <Command.Item
                value={`${t("switchLanguage")} language`}
                onSelect={() =>
                  runAction(() =>
                    setLocale(locale === "en" ? "ar" : "en")
                  )
                }
                className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors aria-selected:bg-accent aria-selected:text-accent-foreground"
              >
                <Globe className="h-4 w-4 text-muted-foreground" />
                {t("switchLanguage")} ({locale === "en" ? "العربية" : "English"})
              </Command.Item>
            </Command.Group>
          </Command.List>

          <div className="border-t px-3 py-2">
            <p className="text-xs text-muted-foreground">
              {t("commandHint")}
            </p>
          </div>
        </Command>
      </div>
    </div>
  );
}
