"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useCallback } from "react";
import { useAcademicYear } from "@/context/academic-year-context";
import { useSchoolFilter } from "@/context/school-filter-context";
import { useAuth } from "@/context/auth-context";
import { useLanguage } from "@/context/language-context";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Sparkles,
  RefreshCw,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Trophy,
  BookOpen,
  CalendarOff,
  DollarSign,
  BarChart3,
  Award,
  ShieldAlert,
  Brain,
  Target,
  Users,
  GraduationCap,
  Percent,
} from "lucide-react";
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

/* ── Types ──────────────────────────────────────────────────────── */

interface InsightCard {
  id: string;
  title: string;
  icon: string;
  content: string;
  severity: "info" | "warning" | "success" | "critical";
}

interface InsightStats {
  totalStudents: number;
  avgGrade: number;
  passRate: number;
  atRiskRate: number;
  honorRate: number;
  absenceAvg: number;
  collectionRate: number;
  strongestSubject: string;
  weakestSubject: string;
}

interface InsightsResponse {
  narrative: string;
  insights: InsightCard[];
  stats: InsightStats;
}

/* ── Icon mapping ───────────────────────────────────────────────── */

const ICON_MAP: Record<string, React.ElementType> = {
  trophy: Trophy,
  "trending-up": TrendingUp,
  "trending-down": TrendingDown,
  alert: ShieldAlert,
  "alert-triangle": AlertTriangle,
  calendar: CalendarOff,
  book: BookOpen,
  dollar: DollarSign,
  "bar-chart": BarChart3,
  award: Award,
};

const SEVERITY_STYLES: Record<string, string> = {
  success:
    "border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/20",
  info: "border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/20",
  warning:
    "border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20",
  critical:
    "border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20",
};

const SEVERITY_ICON_STYLES: Record<string, string> = {
  success: "text-green-600 dark:text-green-400",
  info: "text-blue-600 dark:text-blue-400",
  warning: "text-amber-600 dark:text-amber-400",
  critical: "text-red-600 dark:text-red-400",
};

/* ── Page ───────────────────────────────────────────────────────── */

export default function AIInsightsPage() {
  const { selectedYear, selectedLabel, loading: yearLoading } = useAcademicYear();
  const { schoolFilter, schoolLabel } = useSchoolFilter();
  const { user } = useAuth();
  const { t, isRTL } = useLanguage();

  const [data, setData] = useState<InsightsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchInsights = useCallback(async () => {
    if (!selectedYear) return;
    setLoading(true);
    setError(null);

    try {
      const token = await user?.getIdToken();
      const res = await fetch("/api/ai-insights", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ year: selectedYear, school: schoolFilter }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to fetch insights");
      }

      const result = await res.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load insights");
    } finally {
      setLoading(false);
    }
  }, [selectedYear, schoolFilter, user]);

  useEffect(() => {
    if (!yearLoading && selectedYear) {
      fetchInsights();
    }
  }, [selectedYear, schoolFilter, yearLoading, fetchInsights]);

  if (yearLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        {t("loading") || "Loading..."}
      </div>
    );
  }

  // Build radar data from stats
  const radarData = data?.stats
    ? [
        { metric: "Pass Rate", value: data.stats.passRate, fullMark: 100 },
        { metric: "Honor Rate", value: data.stats.honorRate, fullMark: 100 },
        {
          metric: "Attendance",
          value: Math.max(0, 100 - (data.stats.absenceAvg || 0) * 5),
          fullMark: 100,
        },
        { metric: "Collection", value: data.stats.collectionRate, fullMark: 100 },
        {
          metric: "Avg Grade",
          value: data.stats.avgGrade,
          fullMark: 100,
        },
        {
          metric: "Low Risk",
          value: Math.max(0, 100 - (data.stats.atRiskRate || 0)),
          fullMark: 100,
        },
      ]
    : [];

  return (
    <div className="space-y-6" dir={isRTL ? "rtl" : "ltr"}>
      {/* ── Header ───────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Brain className="h-6 w-6 text-primary" />
            {t("aiInsights") || "AI Insights"}
          </h1>
          <p className="text-muted-foreground mt-1">
            {t("aiInsightsDesc") ||
              "AI-powered analysis of student performance data"}{" "}
            — {selectedLabel} · {schoolLabel}
          </p>
        </div>
        <Button
          onClick={fetchInsights}
          disabled={loading}
          variant="outline"
          size="sm"
        >
          {loading ? (
            <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4 mr-1" />
          )}
          {t("aiRegenerate") || "Regenerate"}
        </Button>
      </div>

      {/* ── Loading / Error ──────────────────────────────────── */}
      {loading && !data && (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <div className="relative">
            <Brain className="h-12 w-12 text-primary/20" />
            <Sparkles className="h-5 w-5 text-primary absolute -top-1 -right-1 animate-pulse" />
          </div>
          <p className="text-muted-foreground">
            {t("aiAnalyzing") || "Analyzing data with AI..."}
          </p>
        </div>
      )}

      {error && (
        <Card className="border-red-200 dark:border-red-900">
          <CardContent className="py-6 text-center text-red-600 dark:text-red-400">
            {error}
          </CardContent>
        </Card>
      )}

      {data && (
        <>
          {/* ── KPI Strip ──────────────────────────────────────── */}
          <div className="grid gap-3 grid-cols-2 md:grid-cols-4 lg:grid-cols-6">
            <KPICard
              icon={Users}
              label={t("totalStudents") || "Students"}
              value={data.stats.totalStudents.toLocaleString()}
            />
            <KPICard
              icon={GraduationCap}
              label={t("avgGrade") || "Avg Grade"}
              value={data.stats.avgGrade.toFixed(1)}
            />
            <KPICard
              icon={Percent}
              label={t("passRate") || "Pass Rate"}
              value={`${data.stats.passRate}%`}
            />
            <KPICard
              icon={AlertTriangle}
              label={t("atRiskRate") || "At-Risk Rate"}
              value={`${data.stats.atRiskRate}%`}
              variant={data.stats.atRiskRate > 15 ? "danger" : undefined}
            />
            <KPICard
              icon={Trophy}
              label={t("honorRate") || "Honor Rate"}
              value={`${data.stats.honorRate}%`}
            />
            <KPICard
              icon={Target}
              label={t("collectionRate") || "Collection"}
              value={`${data.stats.collectionRate}%`}
            />
          </div>

          {/* ── AI Narrative + Radar ───────────────────────────── */}
          <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  {t("aiNarrative") || "AI Analysis"}
                  {loading && (
                    <RefreshCw className="h-3 w-3 animate-spin text-muted-foreground" />
                  )}
                </CardTitle>
                <CardDescription>
                  {t("aiNarrativeDesc") ||
                    "Generated analysis of school performance data"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-line">
                  {formatNarrative(data.narrative)}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Target className="h-4 w-4" />
                  {t("performanceRadar") || "Performance Radar"}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
                      <PolarGrid strokeDasharray="3 3" />
                      <PolarAngleAxis
                        dataKey="metric"
                        tick={{ fontSize: 11 }}
                      />
                      <PolarRadiusAxis
                        angle={90}
                        domain={[0, 100]}
                        tick={{ fontSize: 10 }}
                      />
                      <Radar
                        name="Score"
                        dataKey="value"
                        stroke="hsl(var(--primary))"
                        fill="hsl(var(--primary))"
                        fillOpacity={0.2}
                        strokeWidth={2}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-2 text-xs text-muted-foreground">
                  <div>
                    <span className="font-medium text-green-600 dark:text-green-400">
                      Strongest:
                    </span>{" "}
                    {data.stats.strongestSubject}
                  </div>
                  <div>
                    <span className="font-medium text-red-600 dark:text-red-400">
                      Weakest:
                    </span>{" "}
                    {data.stats.weakestSubject}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ── Insight Cards ──────────────────────────────────── */}
          <div>
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <ShieldAlert className="h-5 w-5" />
              {t("keyInsights") || "Key Insights"}
            </h2>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {data.insights.map((insight) => {
                const Icon = ICON_MAP[insight.icon] || AlertTriangle;
                return (
                  <Card
                    key={insight.id}
                    className={`border ${SEVERITY_STYLES[insight.severity] || ""}`}
                  >
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Icon
                          className={`h-4 w-4 flex-shrink-0 ${SEVERITY_ICON_STYLES[insight.severity] || ""}`}
                        />
                        {insight.title}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {insight.content}
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ── Sub-components ─────────────────────────────────────────────── */

function KPICard({
  icon: Icon,
  label,
  value,
  variant,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  variant?: "danger";
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-3 px-4">
        <Icon
          className={`h-5 w-5 flex-shrink-0 ${variant === "danger" ? "text-red-500" : "text-muted-foreground"}`}
        />
        <div className="min-w-0">
          <p
            className={`text-lg font-bold leading-none ${variant === "danger" ? "text-red-600 dark:text-red-400" : ""}`}
          >
            {value}
          </p>
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {label}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

/* ── Helpers ────────────────────────────────────────────────────── */

function formatNarrative(text: string): React.ReactNode {
  if (!text) return null;

  // Convert markdown bold **text** to <strong>
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}
