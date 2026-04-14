"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Globe,
  Users,
  TrendingUp,
  LayoutGrid,
  Calendar,
  DollarSign,
  ClipboardList,
  GraduationCap,
  ChevronDown,
  ChevronUp,
  X,
} from "lucide-react";
import { NationalityReport } from "./nationality-report";

/* ─── report registry ────────────────────────────────────────── */

interface ReportDef {
  key: string;
  title: string;
  description: string;
  icon: React.ElementType;
  ready: boolean;
  component?: React.ComponentType;
}

const REPORTS: ReportDef[] = [
  {
    key: "nationality",
    title: "Student Nationalities",
    description: "Full nationality breakdown with filters, chart, and CSV export",
    icon: Globe,
    ready: true,
    component: NationalityReport,
  },
  {
    key: "gender",
    title: "Gender Distribution",
    description: "Male / Female counts by school, class, and section",
    icon: Users,
    ready: false,
  },
  {
    key: "enrollment",
    title: "Enrollment Trends",
    description: "Registration counts over academic years by school",
    icon: TrendingUp,
    ready: false,
  },
  {
    key: "class-size",
    title: "Class Size Analysis",
    description: "Students per class and section, capacity vs actual",
    icon: LayoutGrid,
    ready: false,
  },
  {
    key: "age",
    title: "Age Distribution",
    description: "Student age brackets from birth dates",
    icon: Calendar,
    ready: false,
  },
  {
    key: "fee-collection",
    title: "Fee Collection Summary",
    description: "Paid vs outstanding by class and school",
    icon: DollarSign,
    ready: false,
  },
  {
    key: "attendance",
    title: "Attendance Overview",
    description: "Absence and tardy rates by class and school",
    icon: ClipboardList,
    ready: false,
  },
  {
    key: "performance",
    title: "Academic Performance",
    description: "Average grades by subject, class, and school",
    icon: GraduationCap,
    ready: false,
  },
];

/* ─── component ──────────────────────────────────────────────── */

export function DashboardReportsHub() {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [hubOpen, setHubOpen] = useState(false);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5" />
              Quick Reports
            </CardTitle>
            <CardDescription>
              On-demand reports with live filters — click any tile to expand
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setHubOpen(!hubOpen);
              if (hubOpen) setExpanded(null);
            }}
          >
            {hubOpen ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardHeader>

      {hubOpen && (
        <CardContent className="space-y-6">
          {/* Report tiles grid */}
          {!expanded && (
            <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
              {REPORTS.map((r) => {
                const Icon = r.icon;
                return (
                  <button
                    key={r.key}
                    disabled={!r.ready}
                    className={`
                      text-left rounded-lg border p-4 transition-all
                      ${r.ready
                        ? "hover:shadow-md hover:border-primary/50 cursor-pointer"
                        : "opacity-50 cursor-not-allowed"
                      }
                    `}
                    onClick={() => r.ready && setExpanded(r.key)}
                  >
                    <Icon className="h-6 w-6 text-primary mb-2" />
                    <div className="font-medium text-sm">{r.title}</div>
                    <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {r.description}
                    </div>
                    {!r.ready && (
                      <span className="inline-block mt-2 text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                        Coming Soon
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Expanded report */}
          {expanded && (() => {
            const report = REPORTS.find((r) => r.key === expanded);
            if (!report?.component) return null;
            const ReportComponent = report.component;
            return (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <report.icon className="h-5 w-5 text-primary" />
                    <h3 className="text-lg font-semibold">{report.title}</h3>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setExpanded(null)}
                  >
                    <X className="h-4 w-4 mr-1" />
                    Close
                  </Button>
                </div>
                <ReportComponent />
              </div>
            );
          })()}
        </CardContent>
      )}
    </Card>
  );
}
