"use client";

import { useState, useRef, useCallback } from "react";
import { useAuth } from "@/context/auth-context";
import { Button } from "@/components/ui/button";
import {
  Printer,
  Users,
  GraduationCap,
  BookOpen,
  CalendarOff,
  DollarSign,
  FileText,
  BellRing,
  MessageSquare,
  Phone,
  Laptop,
  ShoppingCart,
  HelpCircle,
  Package,
  Baby,
  Shield,
  Sparkles,
  TrendingUp,
  Trophy,
  AlertTriangle,
  ClipboardList,
  ClipboardCheck,
  BarChart3,
  Headphones,
  Megaphone,
  ArrowRightLeft,
  Globe,
  Smartphone,
  Monitor,
  Loader2,
  ChevronRight,
  CheckCircle2,
  School,
  Heart,
  Target,
  Lightbulb,
  BookMarked,
  PieChart,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   KIS SiS â€” Complete Application Features
   Management-facing feature catalog Â· Super Admin only
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */

const MODULES = [
  { id: "overview", label: "System Overview" },
  { id: "student-management", label: "Student Management" },
  { id: "academics", label: "Academics & Grades" },
  { id: "kindergarten", label: "Kindergarten" },
  { id: "attendance", label: "Attendance" },
  { id: "fees", label: "Finance & Fees" },
  { id: "admissions", label: "Admissions" },
  { id: "communication", label: "Communication" },
  { id: "quizzes", label: "Adaptive Quizzes" },
  { id: "documents", label: "Documents & Certificates" },
  { id: "library", label: "Library" },
  { id: "store", label: "Store & Inventory" },
  { id: "it-helpdesk", label: "IT Helpdesk" },
  { id: "staff", label: "Staff Management" },
  { id: "reports", label: "Reports & Analytics" },
  { id: "ai", label: "AI-Powered Features" },
  { id: "portals", label: "Parent, Student & Staff Portals" },
  { id: "mobile", label: "Mobile Application" },
  { id: "security", label: "Security & Administration" },
] as const;

type ModuleId = (typeof MODULES)[number]["id"];

/* â”€â”€ Benefit helpers â”€â”€ */
interface Benefit {
  text: string;
  for: ("parents" | "students" | "school" | "management")[];
}

const TAG_COLORS: Record<string, { bg: string; text: string }> = {
  parents:    { bg: "bg-blue-100 dark:bg-blue-900/40",     text: "text-blue-800 dark:text-blue-300" },
  students:   { bg: "bg-green-100 dark:bg-green-900/40",    text: "text-green-800 dark:text-green-300" },
  school:     { bg: "bg-amber-100 dark:bg-amber-900/40",    text: "text-amber-800 dark:text-amber-300" },
  management: { bg: "bg-purple-100 dark:bg-purple-900/40",  text: "text-purple-800 dark:text-purple-300" },
};

function BenefitTag({ target }: { target: string }) {
  const c = TAG_COLORS[target];
  return (
    <span className={cn("af-tag inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide mr-1", c?.bg, c?.text)}
      data-tag={target}>
      {target}
    </span>
  );
}

function BenefitList({ benefits }: { benefits: Benefit[] }) {
  return (
    <ul className="af-benefits space-y-2 mt-3">
      {benefits.map((b, i) => (
        <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
          <div>
            <span>{b.text}</span>
            <div className="mt-1">
              {b.for.map((t) => <BenefitTag key={t} target={t} />)}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

/* â”€â”€ Feature Card â”€â”€ */
function FeatureCard({ icon: Icon, title, description, benefits }: {
  icon: React.ElementType;
  title: string;
  description: string;
  benefits: Benefit[];
}) {
  return (
    <div className="af-card rounded-xl border bg-card p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center gap-3 mb-2">
        <div className="af-icon-box rounded-lg bg-primary/10 p-2">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <h4 className="af-card-title font-semibold text-base">{title}</h4>
      </div>
      <p className="af-card-desc text-sm text-muted-foreground leading-relaxed">{description}</p>
      <BenefitList benefits={benefits} />
    </div>
  );
}

/* â”€â”€ Module Section â”€â”€ */
function ModuleSection({ id, title, icon: Icon, intro, features, children }: {
  id: string;
  title: string;
  icon: React.ElementType;
  intro: string;
  features?: { icon: React.ElementType; title: string; description: string; benefits: Benefit[] }[];
  children?: React.ReactNode;
}) {
  return (
    <section id={id} className="af-section scroll-mt-24 mb-12">
      <div className="af-section-header flex items-center gap-3 mb-2">
        <div className="af-section-icon rounded-xl bg-primary/10 p-2.5">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <h2 className="af-section-title text-2xl font-bold">{title}</h2>
      </div>
      <p className="af-section-intro text-muted-foreground mb-5 max-w-3xl leading-relaxed">{intro}</p>
      {features && (
        <div className="af-grid grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {features.map((f, i) => <FeatureCard key={i} {...f} />)}
        </div>
      )}
      {children}
    </section>
  );
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   Print CSS â€” injected into clean popup window to bypass global styles
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
const PRINT_CSS = `
@page {
  size: A4 portrait;
  margin: 14mm 12mm 16mm 12mm;
}
html, body {
  margin: 0; padding: 0; background: #fff; color: #1a1a1a;
  font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
  font-size: 9pt; line-height: 1.5;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

/* â”€â”€ Cover Page â”€â”€ */
.af-cover {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  min-height: 90vh; text-align: center; page-break-after: always;
}
.af-cover h1 { font-size: 26pt; font-weight: 800; color: #0f172a; margin: 0 0 6px; letter-spacing: -0.5px; }
.af-cover h2 { font-size: 15pt; font-weight: 600; color: #2563eb; margin: 0 0 4px; }
.af-cover .af-cover-sub { font-size: 12pt; color: #64748b; margin-bottom: 24px; }
.af-cover .af-cover-meta { font-size: 9pt; color: #94a3b8; display: flex; gap: 8px; justify-content: center; }
.af-cover .af-cover-meta span { margin: 0 4px; }
.af-cover-divider { display: block !important; width: 80px; height: 3px; background: #2563eb; margin: 20px auto; border-radius: 2px; }
.af-cover-legend {
  display: flex; gap: 18px; justify-content: center; margin-top: 30px; flex-wrap: wrap;
}
.af-cover-legend .af-legend-item { display: flex; align-items: center; gap: 5px; font-size: 8pt; color: #64748b; }
.af-cover-legend .af-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
.af-dot-parents { background: #3b82f6; }
.af-dot-students { background: #22c55e; }
.af-dot-school { background: #f59e0b; }
.af-dot-management { background: #a855f7; }

/* â”€â”€ TOC â”€â”€ */
.af-toc { display: block !important; page-break-after: always; padding: 40px 20px; }
.af-toc h3 { font-size: 16pt; font-weight: 700; color: #0f172a; margin-bottom: 20px; border-bottom: 2px solid #2563eb; padding-bottom: 8px; }
.af-toc-list { list-style: none; padding: 0; margin: 0; columns: 2; column-gap: 30px; }
.af-toc-list li {
  padding: 6px 0; font-size: 10pt; color: #334155; border-bottom: 1px dotted #e2e8f0;
  break-inside: avoid;
}
.af-toc-list li .af-toc-num { display: inline-block; width: 24px; font-weight: 700; color: #2563eb; }

/* â”€â”€ Sections â”€â”€ */
.af-section { page-break-before: always; padding-top: 4px; }
.af-section:first-of-type { page-break-before: auto; }
.af-section-header { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
.af-section-icon {
  width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;
  background: #eff6ff; border-radius: 8px;
}
.af-section-icon svg { width: 18px; height: 18px; color: #2563eb; }
.af-section-title { font-size: 16pt; font-weight: 700; color: #0f172a; margin: 0; }
.af-section-intro { font-size: 9pt; color: #475569; margin-bottom: 12px; max-width: 100%; line-height: 1.55; }

/* â”€â”€ Feature Cards â”€â”€ */
.af-grid {
  display: grid !important; grid-template-columns: 1fr 1fr !important; gap: 10px !important;
}
.af-card {
  border: 1px solid #e2e8f0 !important; border-radius: 8px !important; padding: 12px 14px !important;
  background: #fafbfc !important; box-shadow: none !important;
  page-break-inside: avoid; break-inside: avoid;
}
.af-card-title { font-size: 10pt; font-weight: 700; color: #1e293b; margin: 0; }
.af-card-desc { font-size: 8.5pt; color: #475569; line-height: 1.5; margin: 4px 0 0; }
.af-icon-box {
  width: 26px; height: 26px; display: flex; align-items: center; justify-content: center;
  background: #eff6ff; border-radius: 6px; flex-shrink: 0;
}
.af-icon-box svg { width: 14px; height: 14px; color: #2563eb; }

/* â”€â”€ Benefits â”€â”€ */
.af-benefits { margin-top: 8px !important; list-style: none; padding: 0; }
.af-benefits li {
  display: flex; align-items: flex-start; gap: 5px; font-size: 8pt; color: #475569;
  margin-bottom: 4px; line-height: 1.4;
}
.af-benefits li svg { width: 11px; height: 11px; color: #22c55e; flex-shrink: 0; margin-top: 2px; }
.af-tag {
  display: inline-block; padding: 1px 6px; border-radius: 9px; font-size: 6.5pt;
  font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; margin-right: 3px;
}
.af-tag[data-tag="parents"]    { background: #dbeafe; color: #1e40af; }
.af-tag[data-tag="students"]   { background: #dcfce7; color: #166534; }
.af-tag[data-tag="school"]     { background: #fef3c7; color: #92400e; }
.af-tag[data-tag="management"] { background: #f3e8ff; color: #6b21a8; }

/* â”€â”€ Stats boxes (overview) â”€â”€ */
.af-stats-row {
  display: grid !important; grid-template-columns: repeat(3, 1fr) !important; gap: 10px !important;
  margin: 10px 0;
}
.af-stat-box {
  border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; text-align: center;
  background: #f8fafc;
}
.af-stat-num { font-size: 22pt; font-weight: 800; color: #2563eb; }
.af-stat-label { font-size: 8pt; color: #64748b; margin-top: 2px; }

/* â”€â”€ Highlights box â”€â”€ */
.af-highlights {
  border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; background: #f8fafc; margin-top: 10px;
}
.af-highlights h4 { font-size: 10pt; font-weight: 700; color: #1e293b; margin: 0 0 8px; }
.af-highlights-grid {
  display: grid !important; grid-template-columns: 1fr 1fr !important; gap: 6px !important;
}
.af-highlights-grid .af-hl-item {
  display: flex; align-items: flex-start; gap: 5px; font-size: 8.5pt; color: #475569;
}
.af-highlights-grid .af-hl-item svg { width: 12px; height: 12px; color: #22c55e; flex-shrink: 0; margin-top: 2px; }

/* â”€â”€ Portal boxes â”€â”€ */
.af-portal-box {
  border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; background: #fafbfc;
  margin-bottom: 10px; page-break-inside: avoid; break-inside: avoid;
}
.af-portal-header { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.af-portal-header .af-portal-icon {
  width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;
  border-radius: 8px; flex-shrink: 0;
}
.af-portal-header .af-portal-icon svg { width: 16px; height: 16px; }
.af-portal-header h4 { font-size: 11pt; font-weight: 700; color: #1e293b; margin: 0; }
.af-portal-desc { font-size: 8.5pt; color: #475569; margin-bottom: 8px; line-height: 1.5; }
.af-portal-features {
  display: grid !important; grid-template-columns: 1fr 1fr !important; gap: 4px !important;
}
.af-portal-features .af-pf-item {
  display: flex; align-items: flex-start; gap: 5px; font-size: 8pt; color: #475569;
}
.af-portal-features .af-pf-item svg { width: 11px; height: 11px; color: #22c55e; flex-shrink: 0; margin-top: 2px; }

.af-portal-icon.blue { background: #dbeafe; }
.af-portal-icon.blue svg { color: #3b82f6; }
.af-portal-icon.amber { background: #fef3c7; }
.af-portal-icon.amber svg { color: #f59e0b; }
.af-portal-icon.green { background: #dcfce7; }
.af-portal-icon.green svg { color: #22c55e; }
.af-portal-icon.purple { background: #f3e8ff; }
.af-portal-icon.purple svg { color: #a855f7; }

/* â”€â”€ Footer â”€â”€ */
.af-footer {
  margin-top: 30px; padding-top: 14px; border-top: 1px solid #e2e8f0;
  text-align: center; font-size: 8pt; color: #94a3b8;
  page-break-before: auto;
}
.af-footer p { margin: 2px 0; }
.af-footer .af-footer-title { font-weight: 600; color: #475569; font-size: 9pt; }

/* â”€â”€ Hide screen-only elements â”€â”€ */
.print\\:hidden, [class*="print:hidden"] { display: none !important; }
`;

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */

export default function AppFeaturesPage() {
  const { role, loading } = useAuth();
  const [activeModule, setActiveModule] = useState<ModuleId>("overview");

  const scrollTo = useCallback((id: string) => {
    setActiveModule(id as ModuleId);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  /* â”€â”€ Print via clean popup window (bypasses dashboard global CSS) â”€â”€ */
  const handlePrint = useCallback(() => {
    const docEl = document.getElementById("af-print-doc");
    if (!docEl) return;

    const pw = window.open("", "_blank");
    if (!pw) { window.print(); return; }

    pw.document.write(
      `<!DOCTYPE html><html><head><meta charset="utf-8">` +
      `<title>KIS SiS â€” Application Features</title>` +
      `<style>${PRINT_CSS}</style>` +
      `</head><body>` +
      `<div class="af-doc">${docEl.innerHTML}</div>` +
      `</body></html>`
    );
    pw.document.close();

    const kick = () => { pw.focus(); pw.print(); };
    const fallback = setTimeout(kick, 2500);
    pw.onload = () => { clearTimeout(fallback); setTimeout(kick, 600); };
  }, []);

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (role !== "super_admin") {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-4 text-muted-foreground">
        <Shield className="h-12 w-12" />
        <p className="text-lg font-medium">Access Restricted</p>
        <p className="text-sm">This page is only available to super administrators.</p>
      </div>
    );
  }

  return (
    <div className="flex gap-0 xl:gap-6">
      {/* â”€â”€ Sidebar TOC (desktop) â”€â”€ */}
      <aside className="hidden xl:block w-64 shrink-0 sticky top-20 h-[calc(100vh-6rem)] overflow-y-auto pr-2 print:hidden">
        <div className="mb-4">
          <Button onClick={handlePrint} variant="outline" size="sm" className="w-full gap-2">
            <Printer className="h-4 w-4" /> Print / PDF
          </Button>
        </div>
        <nav className="space-y-1">
          {MODULES.map((m) => (
            <button
              key={m.id}
              onClick={() => scrollTo(m.id)}
              className={cn(
                "flex items-center gap-2 w-full px-3 py-2 text-sm rounded-lg transition-colors text-left",
                activeModule === m.id
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              <ChevronRight className={cn("h-3 w-3 transition-transform", activeModule === m.id && "rotate-90")} />
              {m.label}
            </button>
          ))}
        </nav>
      </aside>

      {/* â”€â”€ Main Content (also the print document) â”€â”€ */}
      <div id="af-print-doc" className="af-doc flex-1 min-w-0 max-w-5xl mx-auto pb-20">

        {/* â”€â”€ Print button (mobile) â”€â”€ */}
        <div className="flex items-center justify-end mb-2 xl:hidden print:hidden">
          <Button onClick={handlePrint} variant="outline" size="sm" className="gap-2">
            <Printer className="h-4 w-4" /> Print
          </Button>
        </div>

        {/* â•â•â• COVER / HEADER â•â•â• */}
        <div className="af-cover text-center mb-10">
          <h1 className="text-3xl font-bold mb-2">Khaled International Schools</h1>
          <h2 className="text-xl font-semibold text-primary mb-1">Student Information System (SiS)</h2>
          <p className="af-cover-sub text-muted-foreground text-lg">Complete Application Features</p>
          <div className="af-cover-divider hidden" />
          <div className="af-cover-meta flex justify-center gap-6 mt-4 text-sm text-muted-foreground">
            <span>April 2026</span>
            <span>â€¢</span>
            <span>Web Dashboard + Mobile App</span>
          </div>

          {/* Legend */}
          <div className="af-cover-legend flex flex-wrap justify-center gap-4 mt-6">
            <div className="af-legend-item flex items-center gap-1.5 text-xs">
              <span className="af-dot af-dot-parents inline-block w-3 h-3 rounded-full bg-blue-500" /> Benefits Parents
            </div>
            <div className="af-legend-item flex items-center gap-1.5 text-xs">
              <span className="af-dot af-dot-students inline-block w-3 h-3 rounded-full bg-green-500" /> Benefits Students
            </div>
            <div className="af-legend-item flex items-center gap-1.5 text-xs">
              <span className="af-dot af-dot-school inline-block w-3 h-3 rounded-full bg-amber-500" /> Benefits School
            </div>
            <div className="af-legend-item flex items-center gap-1.5 text-xs">
              <span className="af-dot af-dot-management inline-block w-3 h-3 rounded-full bg-purple-500" /> Benefits Management
            </div>
          </div>
        </div>

        {/* â•â•â• TABLE OF CONTENTS (print only) â•â•â• */}
        <div className="af-toc hidden">
          <h3>Table of Contents</h3>
          <ol className="af-toc-list">
            {MODULES.map((m, i) => (
              <li key={m.id}><span className="af-toc-num">{i + 1}.</span> {m.label}</li>
            ))}
          </ol>
        </div>

        {/* â•â•â• MODULE 1: OVERVIEW â•â•â• */}
        <ModuleSection
          id="overview"
          title="System Overview"
          icon={Monitor}
          intro="KIS SiS is a comprehensive, custom-built Student Information System designed specifically for Khaled International Schools. It replaces fragmented legacy systems with a single, unified platform covering every aspect of school operations â€” from student enrollment and academic tracking to financial management, parent communication, and inventory control."
        >
          <div className="af-stats-row grid gap-4 md:grid-cols-3 mt-4">
            <div className="af-stat-box rounded-xl border bg-card p-5 text-center">
              <div className="af-stat-num text-3xl font-bold text-primary mb-1">19+</div>
              <div className="af-stat-label text-sm text-muted-foreground">Integrated Modules</div>
            </div>
            <div className="af-stat-box rounded-xl border bg-card p-5 text-center">
              <div className="af-stat-num text-3xl font-bold text-primary mb-1">6</div>
              <div className="af-stat-label text-sm text-muted-foreground">User Portals</div>
            </div>
            <div className="af-stat-box rounded-xl border bg-card p-5 text-center">
              <div className="af-stat-num text-3xl font-bold text-primary mb-1">2</div>
              <div className="af-stat-label text-sm text-muted-foreground">School Campuses</div>
            </div>
          </div>
          <div className="af-highlights mt-5 rounded-xl border bg-card p-5">
            <h4 className="font-semibold mb-3">Platform Highlights</h4>
            <div className="af-highlights-grid grid gap-3 sm:grid-cols-2 text-sm text-muted-foreground">
              <div className="af-hl-item flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" /> Bilingual interface (Arabic &amp; English) with full RTL support</div>
              <div className="af-hl-item flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" /> Multi-campus support (Boys &amp; Girls branches)</div>
              <div className="af-hl-item flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" /> Real-time data sync from existing SIS server</div>
              <div className="af-hl-item flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" /> Role-based access control (16 distinct roles)</div>
              <div className="af-hl-item flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" /> Dark &amp; light mode for comfortable viewing</div>
              <div className="af-hl-item flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" /> Works offline as a Progressive Web App (PWA)</div>
              <div className="af-hl-item flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" /> Mobile app for parents, staff, and store operators</div>
              <div className="af-hl-item flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" /> AI-powered insights and recommendations</div>
            </div>
          </div>
        </ModuleSection>

        {/* â•â•â• MODULE 2: STUDENT MANAGEMENT â•â•â• */}
        <ModuleSection
          id="student-management"
          title="Student Management"
          icon={Users}
          intro="A centralized hub for all student information â€” profiles, enrollment history, academic records, and family connections. Provides instant access to any student's complete record across all years."
          features={[
            {
              icon: Users,
              title: "Student Directory & Search",
              description: "Searchable student roster with filters by class, section, school, and enrollment status. Instantly locate any student across both campuses.",
              benefits: [
                { text: "Immediate access to any student's information without manual file searching", for: ["school"] },
                { text: "View enrollment statistics and demographic breakdowns at a glance", for: ["management"] },
              ],
            },
            {
              icon: FileText,
              title: "Comprehensive Student Profile",
              description: "Individual student profiles showing personal details, academic history across all years, attendance records, fee status, documents, and family information â€” all in one place.",
              benefits: [
                { text: "Parents see their child's complete school journey in one view", for: ["parents"] },
                { text: "Eliminates time wasted gathering scattered records", for: ["school"] },
              ],
            },
            {
              icon: TrendingUp,
              title: "Academic Progress Tracking",
              description: "Multi-year academic progress with trend charts, subject-by-subject breakdown, class rank, and term comparisons. Visual charts highlight improvement or decline patterns.",
              benefits: [
                { text: "Parents track their child's academic trajectory over the years", for: ["parents"] },
                { text: "Teachers identify students who need additional support early", for: ["school"] },
              ],
            },
            {
              icon: Trophy,
              title: "Honor Roll Recognition",
              description: "Automatically identifies top-performing students by class and grade. Generates honor roll lists with performance charts and exportable reports.",
              benefits: [
                { text: "Students gain motivation through recognition of excellence", for: ["students"] },
                { text: "Parents receive concrete recognition of achievements", for: ["parents"] },
              ],
            },
            {
              icon: AlertTriangle,
              title: "At-Risk Student Identification",
              description: "Intelligent detection of struggling students using grades and attendance data. Scatter charts plot grades vs. absences to visually identify at-risk students.",
              benefits: [
                { text: "Early intervention prevents academic failure and dropout", for: ["students"] },
                { text: "Management sees the overall health of the student body", for: ["management"] },
              ],
            },
            {
              icon: ArrowRightLeft,
              title: "Transfer & Withdrawal Management",
              description: "Complete workflow for student transfers and withdrawals with status tracking (pending â†’ approved â†’ completed), destination school records, and clearance checklists.",
              benefits: [
                { text: "Streamlined process reduces paperwork and processing time", for: ["school"] },
                { text: "Parents experience a smoother transfer process", for: ["parents"] },
              ],
            },
          ]}
        />

        {/* â•â•â• MODULE 3: ACADEMICS & GRADES â•â•â• */}
        <ModuleSection
          id="academics"
          title="Academics & Grades"
          icon={GraduationCap}
          intro="Complete academic management including grade tracking, subject performance analysis, term-by-term comparisons, and assessment oversight. All grade data syncs directly from the school's existing SIS server."
          features={[
            {
              icon: GraduationCap,
              title: "Academic Dashboard",
              description: "High-level KPIs showing total exams, pass rates, grade distributions, and attendance trends. Color-coded performance indicators make it easy to spot issues.",
              benefits: [
                { text: "Real-time snapshot of academic performance across both campuses", for: ["management"] },
                { text: "Academic directors monitor department results at a glance", for: ["school"] },
              ],
            },
            {
              icon: BookOpen,
              title: "Subject Performance Analysis",
              description: "Subject-by-subject average scores with bar charts and color-coded performance levels. Compare subject results across classes, sections, and campuses.",
              benefits: [
                { text: "Identifies subjects needing curriculum improvements", for: ["school"] },
                { text: "Data-driven decisions on resource allocation", for: ["management"] },
              ],
            },
            {
              icon: BarChart3,
              title: "Term Progress Comparison",
              description: "Side-by-side comparison of student and class performance across terms with line and bar charts showing progression.",
              benefits: [
                { text: "Parents see whether their child improved term to term", for: ["parents"] },
                { text: "Reveals whether school interventions produce results", for: ["management"] },
              ],
            },
            {
              icon: TrendingUp,
              title: "Subject Trend Analysis",
              description: "Multi-subject line charts tracking performance over time. Select specific subjects to see long-term trends and seasonal patterns.",
              benefits: [
                { text: "Identifies declining subjects before they become critical", for: ["school"] },
                { text: "Supports strategic academic planning with historical data", for: ["management"] },
              ],
            },
            {
              icon: FileText,
              title: "Transcripts & Report Cards",
              description: "Professional, branded transcripts with school logos (KIS, Cognia, MOE). Configurable settings for principal names and logos. Bulk export for entire classes.",
              benefits: [
                { text: "Parents receive professionally formatted academic documents", for: ["parents"] },
                { text: "Eliminates hours of manual transcript preparation", for: ["school"] },
              ],
            },
            {
              icon: GraduationCap,
              title: "Diploma Printing",
              description: "Batch diploma generation for Grade 12 graduates. Select students, set ceremony date, and produce professionally formatted diplomas.",
              benefits: [
                { text: "Graduates receive professional diplomas for their milestone", for: ["students"] },
                { text: "Saves significant time compared to manual preparation", for: ["school"] },
              ],
            },
          ]}
        />

        {/* â•â•â• MODULE 4: KINDERGARTEN â•â•â• */}
        <ModuleSection
          id="kindergarten"
          title="Kindergarten Assessments"
          icon={Baby}
          intro="A specialized assessment module designed for early years education, using domain-based rubrics instead of traditional grades. Covers developmental areas like Literacy, Numeracy, Social Skills, and more."
          features={[
            {
              icon: Baby,
              title: "Domain-Based Rubric Entry",
              description: "Teachers assess each KG student across developmental domains (Literacy, Numeracy, Social, Motor Skills, etc.) using age-appropriate rubric scales per term.",
              benefits: [
                { text: "Parents understand their child's development in meaningful terms", for: ["parents"] },
                { text: "Structured, consistent framework for KG assessment", for: ["school"] },
              ],
            },
            {
              icon: Sparkles,
              title: "AI-Generated Comments",
              description: "AI generates personalized, constructive narrative comments for each student based on their rubric scores, saving teachers hours of report writing.",
              benefits: [
                { text: "Parents receive detailed, personalized feedback", for: ["parents"] },
                { text: "Dramatically reduces teacher workload during report season", for: ["school"] },
              ],
            },
            {
              icon: FileText,
              title: "Printable KG Reports",
              description: "Branded KG progress reports with domain scores, teacher comments, and class-level summaries. Designed specifically for early years parent communication.",
              benefits: [
                { text: "Professional, easy-to-understand progress reports", for: ["parents"] },
                { text: "Modern approach to early childhood education", for: ["school"] },
              ],
            },
          ]}
        />

        {/* â•â•â• MODULE 5: ATTENDANCE â•â•â• */}
        <ModuleSection
          id="attendance"
          title="Attendance Management"
          icon={CalendarOff}
          intro="Complete attendance tracking system covering absences and tardiness, with both summary analytics and daily entry capabilities."
          features={[
            {
              icon: CalendarOff,
              title: "Attendance Dashboard",
              description: "KPI cards showing total absences, tardy counts, and trends. Bar charts break down attendance by class. Highlights most frequently absent students.",
              benefits: [
                { text: "Management monitors attendance patterns across the school", for: ["management"] },
                { text: "Counselors identify chronically absent students", for: ["school"] },
              ],
            },
            {
              icon: ClipboardCheck,
              title: "Daily Attendance Entry",
              description: "Teachers mark each student as present, absent, late, or excused directly in the system. Per-class, per-date entry with notes for special circumstances.",
              benefits: [
                { text: "Replaces paper-based attendance with instant digital records", for: ["school"] },
                { text: "Parents are notified of absences in real-time", for: ["parents"] },
              ],
            },
            {
              icon: BellRing,
              title: "Automated Absence Alerts",
              description: "Auto-generated notifications when students exceed absence thresholds, ensuring no student falls through the cracks.",
              benefits: [
                { text: "Parents are immediately aware of attendance issues", for: ["parents"] },
                { text: "Early warnings allow proactive attendance management", for: ["school"] },
              ],
            },
          ]}
        />

        {/* â•â•â• MODULE 6: FINANCE & FEES â•â•â• */}
        <ModuleSection
          id="fees"
          title="Finance & Fees"
          icon={DollarSign}
          intro="End-to-end financial management covering fee tracking, installment plans, delinquency monitoring, and bookshop point-of-sale."
          features={[
            {
              icon: DollarSign,
              title: "Fee Management",
              description: "Per-student fee breakdown showing charges, payments, discounts, and balances by installment. Search by student, family, or class. Multi-year history.",
              benefits: [
                { text: "Parents see exactly what they owe and their remaining balance", for: ["parents"] },
                { text: "Full visibility into revenue collection status", for: ["management"] },
              ],
            },
            {
              icon: AlertTriangle,
              title: "Delinquency Tracking",
              description: "Outstanding balance monitoring with bar charts by class. Expandable drill-down to individual student balances.",
              benefits: [
                { text: "Finance teams prioritize collection efforts with clear data", for: ["school"] },
                { text: "Management monitors overall receivables health", for: ["management"] },
              ],
            },
            {
              icon: ShoppingCart,
              title: "Bookshop Point of Sale",
              description: "Full bookshop module with book catalog, grade bundles, student search, and POS transaction processing. Branded receipts with VAT. Sales history and reports.",
              benefits: [
                { text: "Parents get professional receipts and transparent pricing", for: ["parents"] },
                { text: "Complete visibility into book sales revenue", for: ["management"] },
              ],
            },
          ]}
        />

        {/* â•â•â• MODULE 7: ADMISSIONS â•â•â• */}
        <ModuleSection
          id="admissions"
          title="Admissions Management"
          icon={ClipboardCheck}
          intro="A complete admissions pipeline from initial enquiry through enrollment, with visual Kanban boards, test/interview scheduling, and conversion analytics."
          features={[
            {
              icon: ClipboardCheck,
              title: "Admissions Dashboard & Enquiries",
              description: "KPIs for total enquiries, in-progress applications, accepted and enrolled students. Full CRUD with 11-stage status workflow and multi-student family support.",
              benefits: [
                { text: "Parents experience a professional, organized admission process", for: ["parents"] },
                { text: "Management sees the admissions funnel health at a glance", for: ["management"] },
              ],
            },
            {
              icon: Target,
              title: "Visual Kanban Pipeline",
              description: "Drag-and-drop board with columns for each admission stage. Move applicants through the pipeline visually with instant status overview.",
              benefits: [
                { text: "Admissions team processes applications faster", for: ["school"] },
                { text: "Management sees bottlenecks in the process instantly", for: ["management"] },
              ],
            },
            {
              icon: PieChart,
              title: "Tests, Interviews & Analytics",
              description: "Schedule and record test results and interview outcomes. Funnel analytics showing conversion rates at each stage and enrollment trends.",
              benefits: [
                { text: "Structured evaluation ensures fair, consistent admissions", for: ["management"] },
                { text: "Data-driven insights improve yield and reduce drop-off", for: ["school"] },
              ],
            },
          ]}
        />

        {/* â•â•â• MODULE 8: COMMUNICATION â•â•â• */}
        <ModuleSection
          id="communication"
          title="Communication"
          icon={MessageSquare}
          intro="Multi-channel communication system connecting the school with parents through WhatsApp, in-app push messages, smart notifications, and internal staff announcements."
          features={[
            {
              icon: Phone,
              title: "WhatsApp Messaging",
              description: "Send template or text messages directly to parents via WhatsApp. Target audiences by school, class, or family. Select father, mother, or both. Delivery statistics.",
              benefits: [
                { text: "Parents receive updates on the platform they use most", for: ["parents"] },
                { text: "Communicate with hundreds of parents in minutes", for: ["school"] },
              ],
            },
            {
              icon: BellRing,
              title: "Smart Notifications & Push Messages",
              description: "Auto-generated alerts for low grades, excessive absences, expiring documents, and overdue fees. In-app push messages with read tracking and audience targeting.",
              benefits: [
                { text: "Parents are proactively notified of issues needing attention", for: ["parents"] },
                { text: "No issue goes unnoticed â€” problems addressed before escalation", for: ["management"] },
              ],
            },
            {
              icon: Phone,
              title: "WhatsApp Chatbot & Contact Updates",
              description: "Automated bot handles common parent enquiries 24/7. OTP-verified contact update forms sent via WhatsApp for parents to update their information securely.",
              benefits: [
                { text: "Parents get instant answers and update info from their phone", for: ["parents"] },
                { text: "Reduces administrative burden of repetitive enquiries", for: ["school"] },
              ],
            },
            {
              icon: Megaphone,
              title: "Staff Announcements",
              description: "Internal announcement system targeting specific groups (all, teachers, non-teaching, admin). Priority levels, expiry dates, and portal visibility.",
              benefits: [
                { text: "Leadership communicates effectively with all staff", for: ["school"] },
                { text: "Important notices reach the right people with urgency", for: ["management"] },
              ],
            },
          ]}
        />

        {/* â•â•â• MODULE 9: ADAPTIVE QUIZZES â•â•â• */}
        <ModuleSection
          id="quizzes"
          title="Adaptive Quiz System"
          icon={HelpCircle}
          intro="A sophisticated adaptive testing platform using Item Response Theory (IRT) that adjusts difficulty in real-time based on student performance."
          features={[
            {
              icon: HelpCircle,
              title: "Adaptive Quiz Engine",
              description: "Quizzes dynamically adjust difficulty based on each student's responses. Uses NWEA-style grade bands with rapid-guess detection for answer integrity.",
              benefits: [
                { text: "Students are challenged at their appropriate level", for: ["students"] },
                { text: "Accurate assessment of true student ability", for: ["school"] },
              ],
            },
            {
              icon: BookMarked,
              title: "Question Bank & Scheduling",
              description: "Teachers create MCQ questions with difficulty levels, strand tags, and explanations. Assign quizzes to classes with configurable duration and date ranges.",
              benefits: [
                { text: "Growing resource library saves time year over year", for: ["school"] },
                { text: "Clear timelines and expectations for assessments", for: ["students"] },
              ],
            },
            {
              icon: BarChart3,
              title: "Detailed Quiz Analytics",
              description: "Per-student results: mastery level, score, difficulty breakdown, time analysis, adaptive path visualization. Strand/standard performance identifies learning gaps.",
              benefits: [
                { text: "Parents see meaningful results beyond simple scores", for: ["parents"] },
                { text: "Teachers identify exactly which concepts need reinforcement", for: ["school"] },
              ],
            },
          ]}
        />

        {/* â•â•â• MODULE 10: DOCUMENTS â•â•â• */}
        <ModuleSection
          id="documents"
          title="Documents & Certificates"
          icon={FileText}
          intro="Track passport and Iqama (residency) document validity for all students and staff. Automated alerts for upcoming expirations help the school stay compliant."
          features={[
            {
              icon: FileText,
              title: "Document Expiry Tracking",
              description: "Color-coded dashboard showing passport and Iqama status: valid (green), expiring soon (amber), expired (red), missing (grey). Search and filter capabilities.",
              benefits: [
                { text: "Parents are reminded before documents expire", for: ["parents"] },
                { text: "School remains compliant with government regulations", for: ["school"] },
              ],
            },
            {
              icon: Shield,
              title: "Document Verification",
              description: "QR code-based verification system for school-issued documents. External parties verify the authenticity of transcripts and certificates.",
              benefits: [
                { text: "Students have verifiable credentials for applications", for: ["students"] },
                { text: "School documents carry additional credibility", for: ["school"] },
              ],
            },
          ]}
        />

        {/* â•â•â• MODULE 11: LIBRARY â•â•â• */}
        <ModuleSection
          id="library"
          title="Library Management"
          icon={BookOpen}
          intro="A complete library management system for book cataloging, borrowing, returning, overdue tracking, and fine management."
          features={[
            {
              icon: BookOpen,
              title: "Book Catalog & Borrowing",
              description: "Full CRUD for the library collection with ISBN lookup. Track borrowing, returns, due dates, and automatic overdue detection per student.",
              benefits: [
                { text: "Students and parents see current borrowings and due dates", for: ["parents", "students"] },
                { text: "Library staff spend less time on manual tracking", for: ["school"] },
              ],
            },
            {
              icon: DollarSign,
              title: "Overdue Tracking & Fines",
              description: "Automatic fine calculation for overdue books. Dashboard showing overdue items with student details. Fine management and waiver capabilities.",
              benefits: [
                { text: "Encourages timely returns through transparent tracking", for: ["students"] },
                { text: "Library resources are better protected and available", for: ["school"] },
              ],
            },
          ]}
        />

        {/* â•â•â• MODULE 12: STORE & INVENTORY â•â•â• */}
        <ModuleSection
          id="store"
          title="Store & Inventory Management"
          icon={Package}
          intro="A dual-store system (General Store + IT Store) plus IT asset tracking. Complete lifecycle management from procurement to disposal."
          features={[
            {
              icon: Package,
              title: "General Store & IT Store",
              description: "Full inventory management for school supplies and IT consumables. Barcode-based tracking, stock levels, reorder alerts, and issue history.",
              benefits: [
                { text: "Supplies are always available â€” no stockouts", for: ["school"] },
                { text: "Visibility into consumption and spending patterns", for: ["management"] },
              ],
            },
            {
              icon: Laptop,
              title: "IT Asset Management",
              description: "Comprehensive tracking for laptops, desktops, printers, projectors, and network devices. Staff assignment, maintenance scheduling, and depreciation tracking.",
              benefits: [
                { text: "IT equipment tracked throughout its lifecycle", for: ["management"] },
                { text: "Proactive maintenance reduces unexpected breakdowns", for: ["school"] },
              ],
            },
            {
              icon: ClipboardList,
              title: "Request & Approval Workflow",
              description: "Staff submit supply requests via portal or mobile. Approval workflow with store clerk fulfillment and complete audit trail.",
              benefits: [
                { text: "Streamlined, accountable supply process", for: ["school"] },
                { text: "Spending control with approval workflows", for: ["management"] },
              ],
            },
          ]}
        />

        {/* â•â•â• MODULE 13: IT HELPDESK â•â•â• */}
        <ModuleSection
          id="it-helpdesk"
          title="IT Helpdesk & Tickets"
          icon={Headphones}
          intro="An internal IT support ticket system allowing staff to report issues and track resolution progress."
          features={[
            {
              icon: Headphones,
              title: "IT Support Tickets",
              description: "Staff create support tickets categorized by type (hardware, software, network). Priority levels, status workflow, and notes thread between IT and requester.",
              benefits: [
                { text: "Issues tracked and resolved systematically", for: ["school"] },
                { text: "IT management monitors workload and recurring issues", for: ["management"] },
              ],
            },
          ]}
        />

        {/* â•â•â• MODULE 14: STAFF â•â•â• */}
        <ModuleSection
          id="staff"
          title="Staff Management"
          icon={Users}
          intro="Staff directory, department management, and employee self-service portal."
          features={[
            {
              icon: Users,
              title: "Staff Directory",
              description: "Complete staff list with department filtering, active/terminated status, and assigned IT assets detail.",
              benefits: [
                { text: "HR and admin locate staff information instantly", for: ["school"] },
                { text: "Complete view of human resources", for: ["management"] },
              ],
            },
            {
              icon: Monitor,
              title: "Staff Self-Service Portal",
              description: "Personal portal for viewing announcements, creating IT tickets, checking assigned assets, and submitting store supply requests.",
              benefits: [
                { text: "Staff handle routine requests independently", for: ["school"] },
                { text: "Reduces administrative overhead", for: ["management"] },
              ],
            },
          ]}
        />

        {/* â•â•â• MODULE 15: REPORTS & ANALYTICS â•â•â• */}
        <ModuleSection
          id="reports"
          title="Reports & Analytics"
          icon={BarChart3}
          intro="Comprehensive reporting and analytics suite covering academic performance, financial health, attendance patterns, and year-over-year comparisons."
          features={[
            {
              icon: FileText,
              title: "Monthly Progress Reports",
              description: "Teachers enter monthly assessments (academic band, homework, participation, conduct) per student. Printable reports for parents showing development.",
              benefits: [
                { text: "Parents receive regular updates, not just term-end cards", for: ["parents"] },
                { text: "Frequent feedback helps students improve throughout the year", for: ["students"] },
              ],
            },
            {
              icon: PieChart,
              title: "Full Analytics & Bulk Export",
              description: "Combined dashboard with registration, demographics, financial, academic KPIs, and attendance data. Batch-generate transcripts and report cards as PDFs.",
              benefits: [
                { text: "Complete, data-driven view of school performance", for: ["management"] },
                { text: "Hundreds of report cards generated in minutes", for: ["school"] },
              ],
            },
            {
              icon: BarChart3,
              title: "Year-Over-Year Comparison",
              description: "Side-by-side metrics between academic years: enrollment, pass rates, fee collection, attendance. Percentage change indicators highlight trends.",
              benefits: [
                { text: "Measures institutional progress objectively over time", for: ["management"] },
                { text: "Supports board presentations with comparison data", for: ["management"] },
              ],
            },
          ]}
        />

        {/* â•â•â• MODULE 16: AI FEATURES â•â•â• */}
        <ModuleSection
          id="ai"
          title="AI-Powered Features"
          icon={Sparkles}
          intro="Artificial intelligence integrated throughout the system for insights, automated report writing, and enhanced inventory management."
          features={[
            {
              icon: Sparkles,
              title: "AI School Insights",
              description: "Auto-generated insight cards analyzing performance data. Radar charts, severity levels, and actionable recommendations for academic improvement.",
              benefits: [
                { text: "Intelligent analysis without hiring data analysts", for: ["management"] },
                { text: "Act on AI-identified patterns that might be missed", for: ["school"] },
              ],
            },
            {
              icon: Baby,
              title: "AI KG Report Writing",
              description: "Generates personalized narrative comments for kindergarten students based on assessment rubric scores.",
              benefits: [
                { text: "Detailed, thoughtful comments for each child", for: ["parents"] },
                { text: "Teachers save hours per reporting cycle", for: ["school"] },
              ],
            },
            {
              icon: Smartphone,
              title: "AI Image-Based Inventory Search",
              description: "Using Google Gemini Vision AI, store staff photograph an item and the system identifies it and matches it to inventory on the mobile app.",
              benefits: [
                { text: "Find items instantly â€” even without knowing name or code", for: ["school"] },
                { text: "Reduces errors in item identification", for: ["management"] },
              ],
            },
          ]}
        />

        {/* â•â•â• MODULE 17: PORTALS â•â•â• */}
        <ModuleSection
          id="portals"
          title="Parent, Student & Staff Portals"
          icon={Globe}
          intro="Dedicated web portals for each user group â€” parents, students, teachers, and staff â€” each with role-appropriate features and information access."
        >
          <div className="space-y-4">
            {/* Parent Portal */}
            <div className="af-portal-box rounded-xl border bg-card p-5">
              <div className="af-portal-header flex items-center gap-3 mb-2">
                <div className="af-portal-icon blue rounded-lg bg-blue-500/10 p-2"><Heart className="h-5 w-5 text-blue-500" /></div>
                <h4 className="font-semibold text-lg">Parent Portal</h4>
              </div>
              <p className="af-portal-desc text-sm text-muted-foreground mb-3">Comprehensive portal where parents view their children&apos;s grades, attendance, fees, library borrowings, documents, messages, and progress reports. Multi-child family support.</p>
              <div className="af-portal-features grid gap-2 sm:grid-cols-2 text-sm text-muted-foreground">
                <div className="af-pf-item flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" /> Grade overview with visual charts</div>
                <div className="af-pf-item flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" /> Fee summary with installment breakdown</div>
                <div className="af-pf-item flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" /> Attendance records and tardy history</div>
                <div className="af-pf-item flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" /> Library borrowings and overdue items</div>
                <div className="af-pf-item flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" /> School messages and notifications</div>
                <div className="af-pf-item flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" /> Document status and monthly reports</div>
              </div>
              <BenefitList benefits={[
                { text: "Parents stay informed about every aspect of their child's school life", for: ["parents"] },
                { text: "Reduces parent inquiries to the school office significantly", for: ["school"] },
              ]} />
            </div>

            {/* Teacher Portal */}
            <div className="af-portal-box rounded-xl border bg-card p-5">
              <div className="af-portal-header flex items-center gap-3 mb-2">
                <div className="af-portal-icon amber rounded-lg bg-amber-500/10 p-2"><School className="h-5 w-5 text-amber-500" /></div>
                <h4 className="font-semibold text-lg">Teacher Portal</h4>
              </div>
              <p className="af-portal-desc text-sm text-muted-foreground mb-3">Teachers manage classes, enter grades, take attendance, create quiz questions, assign adaptive quizzes, view detailed results, and submit monthly progress reports.</p>
              <div className="af-portal-features grid gap-2 sm:grid-cols-2 text-sm text-muted-foreground">
                <div className="af-pf-item flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" /> View classes and student rosters</div>
                <div className="af-pf-item flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" /> Enter/edit grades per subject and term</div>
                <div className="af-pf-item flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" /> Mark daily attendance</div>
                <div className="af-pf-item flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" /> Create questions and assign quizzes</div>
                <div className="af-pf-item flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" /> View quiz results and mastery analysis</div>
                <div className="af-pf-item flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" /> Submit monthly progress reports</div>
              </div>
              <BenefitList benefits={[
                { text: "All teaching tools in one place instead of multiple systems", for: ["school"] },
                { text: "Adaptive quizzes provide deeper insight into understanding", for: ["students"] },
              ]} />
            </div>

            {/* Student Portal */}
            <div className="af-portal-box rounded-xl border bg-card p-5">
              <div className="af-portal-header flex items-center gap-3 mb-2">
                <div className="af-portal-icon green rounded-lg bg-green-500/10 p-2"><GraduationCap className="h-5 w-5 text-green-500" /></div>
                <h4 className="font-semibold text-lg">Student Portal</h4>
              </div>
              <p className="af-portal-desc text-sm text-muted-foreground mb-3">Students view grades, attendance summary, and take assigned adaptive quizzes through a clean, focused interface.</p>
              <div className="af-portal-features grid gap-2 sm:grid-cols-2 text-sm text-muted-foreground">
                <div className="af-pf-item flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" /> Current year grades and term breakdown</div>
                <div className="af-pf-item flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" /> Strongest and weakest subjects</div>
                <div className="af-pf-item flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" /> Attendance and tardiness tracking</div>
                <div className="af-pf-item flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" /> Take adaptive quizzes with timed interface</div>
              </div>
              <BenefitList benefits={[
                { text: "Students take ownership of their learning", for: ["students"] },
                { text: "Develops digital literacy and responsibility", for: ["school"] },
              ]} />
            </div>

            {/* Staff Portal */}
            <div className="af-portal-box rounded-xl border bg-card p-5">
              <div className="af-portal-header flex items-center gap-3 mb-2">
                <div className="af-portal-icon purple rounded-lg bg-purple-500/10 p-2"><Users className="h-5 w-5 text-purple-500" /></div>
                <h4 className="font-semibold text-lg">Staff Portal</h4>
              </div>
              <p className="af-portal-desc text-sm text-muted-foreground mb-3">All staff access announcements, IT tickets, assigned IT assets, and store supply requests through a personal self-service portal.</p>
              <div className="af-portal-features grid gap-2 sm:grid-cols-2 text-sm text-muted-foreground">
                <div className="af-pf-item flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" /> View school-wide announcements</div>
                <div className="af-pf-item flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" /> Create and track IT support tickets</div>
                <div className="af-pf-item flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" /> View assigned IT assets</div>
                <div className="af-pf-item flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" /> Submit store supply requests</div>
              </div>
              <BenefitList benefits={[
                { text: "Staff resolve routine needs without admin bottlenecks", for: ["school"] },
                { text: "Reduces operational overhead with self-service tools", for: ["management"] },
              ]} />
            </div>
          </div>
        </ModuleSection>

        {/* â•â•â• MODULE 18: MOBILE APP â•â•â• */}
        <ModuleSection
          id="mobile"
          title="Mobile Application"
          icon={Smartphone}
          intro="Full-featured mobile app (Android & iOS) providing on-the-go access for parents, staff, and store operators."
          features={[
            {
              icon: Heart,
              title: "Parent Mobile App",
              description: "Grades, attendance, fees, documents, library, messages, notifications, quizzes, and progress reports â€” all on smartphone. Multi-child support with easy switching.",
              benefits: [
                { text: "Parents stay connected on their most-used device", for: ["parents"] },
                { text: "Modern, convenient experience drives satisfaction", for: ["management"] },
              ],
            },
            {
              icon: Package,
              title: "Store Mobile App",
              description: "Barcode scanner (7 formats), quick issue workflow, AI image search (Gemini Vision), request fulfillment, and real-time inventory with live KPI dashboard.",
              benefits: [
                { text: "Store staff work from anywhere without returning to desk", for: ["school"] },
                { text: "Barcode scanning and AI search reduce errors", for: ["management"] },
              ],
            },
            {
              icon: BellRing,
              title: "Smart Push Notifications",
              description: "Configurable alerts: low grades, failing subjects, document expiry, absences, and fee balances. Parents choose which alerts to receive.",
              benefits: [
                { text: "Proactively informed about critical issues", for: ["parents"] },
                { text: "Increases parent engagement and response rate", for: ["school"] },
              ],
            },
          ]}
        />

        {/* â•â•â• MODULE 19: SECURITY & ADMIN â•â•â• */}
        <ModuleSection
          id="security"
          title="Security & Administration"
          icon={Shield}
          intro="Enterprise-grade security with role-based access control, comprehensive audit logging, and multi-level user management."
          features={[
            {
              icon: Shield,
              title: "Role-Based Access Control (16 Roles)",
              description: "16 distinct roles from Super Admin to Store Clerk with precisely defined permissions. Campus-scoped roles for academic directors ensure branch-specific data access.",
              benefits: [
                { text: "Sensitive data only accessible to authorized personnel", for: ["management"] },
                { text: "Staff see only what's relevant â€” clean, focused interface", for: ["school"] },
              ],
            },
            {
              icon: Users,
              title: "User Management & Audit Log",
              description: "Create, edit, delete users. Assign roles, campuses, classes, subjects. CSV bulk import. Every action logged with actor, timestamp, and IP address.",
              benefits: [
                { text: "Onboarding new staff takes minutes, not hours", for: ["school"] },
                { text: "Full transparency and accountability for all actions", for: ["management"] },
              ],
            },
            {
              icon: Globe,
              title: "Multi-Language, Multi-Campus & Sync",
              description: "Full Arabic/English bilingual interface with RTL. Campus filter (Boys/Girls/All). Automated data pipeline from SQL Server with resume support and error recovery.",
              benefits: [
                { text: "Parents interact in their preferred language", for: ["parents"] },
                { text: "Always up-to-date data across all platforms", for: ["management"] },
              ],
            },
          ]}
        />

        {/* â”€â”€ Footer â”€â”€ */}
        <div className="af-footer mt-12 pt-6 border-t text-center text-sm text-muted-foreground">
          <p className="af-footer-title font-medium text-foreground mb-1">Khaled International Schools â€” Student Information System</p>
          <p>Developed in-house Â· All modules fully integrated Â· Continuously updated</p>
          <p className="mt-2">For questions or demonstrations, contact the IT Department</p>
        </div>
      </div>
    </div>
  );
}
