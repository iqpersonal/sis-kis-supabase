"use client";

import { useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  User,
  BookOpen,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  DollarSign,
  CalendarDays,
  Printer,
} from "lucide-react";
import type { StudentDetail } from "@/hooks/use-sis-data";

interface StudentDetailDialogProps {
  studentName: string;
  studentNumber: string;
  className: string;
  detail: StudentDetail;
  stats?: { label: string; value: string | number }[];
  children: React.ReactNode;
}

export function StudentDetailDialog({
  studentName,
  studentNumber,
  className: cls,
  detail,
  stats,
  children,
}: StudentDetailDialogProps) {
  const [open, setOpen] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const hasAbsenceContext =
    (detail.absenceByMonth && detail.absenceByMonth.length > 0) ||
    (detail.absenceReasons && detail.absenceReasons.length > 0);
  const hasBalanceContext =
    detail.balanceByTerm && detail.balanceByTerm.length > 0;
  const hasExamTrend = detail.examTrend && detail.examTrend.length > 0;
  const hasFailingSubs =
    detail.failingSubjects && detail.failingSubjects.length > 0;

  const handlePrint = () => {
    if (!printRef.current) return;
    const printWindow = window.open("", "_blank", "width=800,height=900");
    if (!printWindow) return;
    printWindow.document.write(`<!DOCTYPE html>
<html><head><title>${studentName} — Student Report</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; color: #1a1a1a; padding: 32px; font-size: 13px; line-height: 1.5; }
  .header { display: flex; align-items: center; gap: 16px; padding-bottom: 16px; border-bottom: 3px solid #0f172a; margin-bottom: 20px; }
  .header .logo { font-size: 18px; font-weight: 700; color: #0f172a; }
  .header .sub { font-size: 11px; color: #64748b; }
  .student-banner { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; }
  .student-banner .name { font-size: 18px; font-weight: 700; }
  .student-banner .meta { font-size: 12px; color: #64748b; margin-top: 2px; }
  .student-banner .badge { display: inline-block; background: #0f172a; color: #fff; padding: 2px 10px; border-radius: 4px; font-size: 11px; font-weight: 600; }
  .stats-row { display: flex; gap: 12px; margin-bottom: 20px; }
  .stat-box { flex: 1; text-align: center; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 8px; }
  .stat-box .label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.8px; color: #64748b; font-weight: 600; }
  .stat-box .value { font-size: 22px; font-weight: 800; margin-top: 2px; }
  .section { margin-bottom: 18px; }
  .section-title { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #334155; margin-bottom: 8px; padding-bottom: 4px; border-bottom: 1px solid #e2e8f0; }
  .section-title.red { color: #dc2626; border-color: #fecaca; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { background: #f1f5f9; text-align: left; padding: 6px 10px; font-weight: 600; color: #475569; border-bottom: 1px solid #e2e8f0; }
  th.right, td.right { text-align: right; }
  td { padding: 5px 10px; border-bottom: 1px solid #f1f5f9; }
  .failing { color: #dc2626; font-weight: 700; }
  .grade-good { color: #16a34a; font-weight: 600; }
  .grade-mid { color: #ca8a04; font-weight: 600; }
  .grade-low { color: #dc2626; font-weight: 600; }
  .semester-row { display: flex; gap: 12px; margin-bottom: 16px; }
  .semester-card { flex: 1; text-align: center; border: 2px solid #e2e8f0; border-radius: 8px; padding: 12px 8px; }
  .semester-card .label { font-size: 9px; text-transform: uppercase; letter-spacing: 1px; color: #64748b; font-weight: 600; }
  .semester-card .val { font-size: 24px; font-weight: 800; margin-top: 4px; }
  .semester-card .diff { font-size: 10px; font-weight: 600; }
  .bar-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
  .bar-label { width: 40px; font-size: 12px; }
  .bar-value { font-size: 12px; font-weight: 600; white-space: nowrap; }
  .bar-track { flex: 1; height: 6px; background: #e2e8f0; border-radius: 3px; overflow: hidden; }
  .bar-fill { height: 100%; background: #f59e0b; border-radius: 3px; }
  .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 10px; color: #94a3b8; text-align: center; }
  @media print { body { padding: 16px; } }
</style></head><body>`);

    // Build print content
    const dateStr = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    let html = `
      <div class="header">
        <div>
          <div class="logo">Khaled International Schools</div>
          <div class="sub">Student Information System — Confidential Report</div>
        </div>
        <div style="margin-left:auto; text-align:right;">
          <div class="sub">Generated: ${dateStr}</div>
        </div>
      </div>
      <div class="student-banner">
        <div>
          <div class="name">${studentName}</div>
          <div class="meta">#${studentNumber} &middot; ${cls}${detail.section ? ` &middot; ${detail.section}` : ""}${detail.nationality ? ` &middot; ${detail.nationality}` : ""}</div>
        </div>
        <span class="badge">${cls}</span>
      </div>`;

    // Stats
    if (stats && stats.length > 0) {
      html += `<div class="stats-row">${stats.map(s => `<div class="stat-box"><div class="label">${s.label}</div><div class="value">${s.value}</div></div>`).join("")}</div>`;
    }

    // Failing subjects
    if (hasFailingSubs) {
      html += `<div class="section"><div class="section-title red">Failing Subjects</div><table><tr><th>Subject</th><th class="right">Grade</th></tr>`;
      for (const f of detail.failingSubjects!) {
        html += `<tr><td>${f.subject}</td><td class="right failing">${f.grade}</td></tr>`;
      }
      html += `</table></div>`;
    }

    // Semester Progress
    if (hasExamTrend) {
      const classAvgStr = typeof detail.classAvg === "number" && detail.classAvg > 0 ? ` (Class Avg: ${detail.classAvg})` : "";
      html += `<div class="section"><div class="section-title">Semester Progress${classAvgStr}</div><div class="semester-row">`;
      detail.examTrend!.forEach((e, i) => {
        const prev = i > 0 ? detail.examTrend![i - 1].avg : e.avg;
        const diff = e.avg - prev;
        const color = e.avg >= prev ? "#16a34a" : "#dc2626";
        html += `<div class="semester-card"><div class="label">${e.exam}</div><div class="val" style="color:${color}">${e.avg}</div>`;
        if (i > 0) html += `<div class="diff" style="color:${color}">${diff >= 0 ? "+" : ""}${diff.toFixed(1)}</div>`;
        html += `</div>`;
      });
      html += `</div></div>`;
    }

    // Absence Breakdown
    if (hasAbsenceContext && detail.absenceByMonth && detail.absenceByMonth.length > 0) {
      const maxDays = Math.max(...detail.absenceByMonth.map(m => m.days));
      html += `<div class="section"><div class="section-title">Absence Breakdown</div>`;
      for (const m of detail.absenceByMonth) {
        const pct = maxDays > 0 ? Math.round((m.days / maxDays) * 100) : 0;
        html += `<div class="bar-row"><span class="bar-label">${m.month}</span><div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div><span class="bar-value">${m.days} ${m.days === 1 ? "day" : "days"}</span></div>`;
      }
      html += `</div>`;
    }

    // Subject Grades
    if (detail.subjects && detail.subjects.length > 0) {
      html += `<div class="section"><div class="section-title">All Subject Grades</div><table><tr><th>Subject</th><th class="right">Grade</th></tr>`;
      for (const s of detail.subjects) {
        const cls2 = s.grade >= 90 ? "grade-good" : s.grade >= 60 ? "grade-mid" : "grade-low";
        html += `<tr><td>${s.subject}</td><td class="right ${cls2}">${s.grade}</td></tr>`;
      }
      html += `</table></div>`;
    }

    // Balance by term
    if (hasBalanceContext) {
      html += `<div class="section"><div class="section-title">Financial — Balance by Term</div><table><tr><th>Term</th><th class="right">Charged</th><th class="right">Paid</th><th class="right">Balance</th></tr>`;
      for (const t of detail.balanceByTerm!) {
        const bColor = t.balance > 0 ? "failing" : "grade-good";
        html += `<tr><td>${t.term}</td><td class="right">${t.charged.toLocaleString()}</td><td class="right">${t.paid.toLocaleString()}</td><td class="right ${bColor}">${t.balance.toLocaleString()}</td></tr>`;
      }
      html += `</table></div>`;
    }

    html += `<div class="footer">Khaled International Schools — SiS Dashboard — This report is confidential and intended for authorized personnel only.</div>`;
    printWindow.document.write(html);
    printWindow.document.write(`</body></html>`);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 300);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[680px] max-h-[90vh] overflow-y-auto p-0 gap-0">
        {/* Header band */}
        <div className="bg-gradient-to-r from-slate-900 to-slate-700 dark:from-slate-800 dark:to-slate-600 px-6 py-5 text-white rounded-t-lg">
          <DialogHeader className="space-y-1">
            <DialogTitle className="flex items-center gap-3 text-lg font-semibold text-white">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 shrink-0">
                <User className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-lg">{studentName}</p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge className="bg-white/20 hover:bg-white/30 text-white border-0 text-[11px] font-medium">
                    {cls}
                  </Badge>
                  <span className="font-mono text-[11px] text-white/70">
                    {studentNumber}
                  </span>
                  {detail.section && (
                    <span className="text-[11px] text-white/70">
                      {detail.section}
                    </span>
                  )}
                  {detail.nationality && (
                    <span className="text-[11px] text-white/50">
                      {detail.nationality}
                    </span>
                  )}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="text-white/70 hover:text-white hover:bg-white/10 shrink-0"
                onClick={handlePrint}
                title="Print report"
              >
                <Printer className="h-4 w-4" />
              </Button>
            </DialogTitle>
          </DialogHeader>
        </div>

        <div ref={printRef} className="px-6 py-5 space-y-6">
          {/* Key stats bar */}
          {stats && stats.length > 0 && (
            <div className={`grid gap-3 ${stats.length === 1 ? "grid-cols-1" : stats.length === 2 ? "grid-cols-2" : stats.length === 3 ? "grid-cols-3" : "grid-cols-4"}`}>
              {stats.map((s) => (
                <div
                  key={s.label}
                  className="rounded-xl border bg-muted/40 px-4 py-3 text-center"
                >
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    {s.label}
                  </p>
                  <p className="text-2xl font-extrabold mt-0.5">{s.value}</p>
                </div>
              ))}
            </div>
          )}

          {/* Failing Subjects */}
          {hasFailingSubs && (
            <section>
              <SectionHeader
                icon={AlertTriangle}
                title="Failing Subjects"
                iconColor="text-red-500"
                count={detail.failingSubjects!.length}
              />
              <div className="rounded-lg border border-red-200 dark:border-red-900 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-red-50 dark:bg-red-950/30 hover:bg-red-50 dark:hover:bg-red-950/30">
                      <TableHead className="text-red-700 dark:text-red-400 text-xs font-semibold">
                        Subject
                      </TableHead>
                      <TableHead className="text-right text-red-700 dark:text-red-400 text-xs font-semibold w-20">
                        Grade
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.failingSubjects!.map((f) => (
                      <TableRow key={f.subject}>
                        <TableCell className="text-sm font-medium">{f.subject}</TableCell>
                        <TableCell className="text-right font-bold text-red-600 text-base tabular-nums">
                          {f.grade}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </section>
          )}

          {/* Exam Trend */}
          {hasExamTrend && (
            <section>
              <SectionHeader
                icon={
                  detail.examTrend![detail.examTrend!.length - 1]?.avg >=
                  (detail.examTrend![0]?.avg ?? 0)
                    ? TrendingUp
                    : TrendingDown
                }
                title="Semester Progress"
                iconColor={
                  detail.examTrend![detail.examTrend!.length - 1]?.avg >=
                  (detail.examTrend![0]?.avg ?? 0)
                    ? "text-green-500"
                    : "text-red-500"
                }
                extra={
                  typeof detail.classAvg === "number" &&
                  detail.classAvg > 0 ? (
                    <Badge variant="secondary" className="text-[10px] font-normal">
                      Class Avg: {detail.classAvg}
                    </Badge>
                  ) : undefined
                }
              />
              <div className="flex gap-3">
                {detail.examTrend!.map((e, i) => {
                  const prev = i > 0 ? detail.examTrend![i - 1].avg : e.avg;
                  const isUp = e.avg >= prev;
                  return (
                    <div
                      key={e.exam}
                      className={`flex-1 rounded-xl border-2 p-4 text-center transition-colors ${
                        isUp
                          ? "border-green-200 bg-green-50/60 dark:bg-green-950/20 dark:border-green-900"
                          : "border-red-200 bg-red-50/60 dark:bg-red-950/20 dark:border-red-900"
                      }`}
                    >
                      <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-1">
                        {e.exam}
                      </p>
                      <p
                        className={`text-3xl font-extrabold ${
                          isUp ? "text-green-600" : "text-red-600"
                        }`}
                      >
                        {e.avg}
                      </p>
                      {i > 0 && (
                        <p
                          className={`text-xs mt-1 font-semibold ${
                            isUp ? "text-green-500" : "text-red-500"
                          }`}
                        >
                          {isUp ? "+" : ""}
                          {(e.avg - prev).toFixed(1)}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Absence Breakdown */}
          {hasAbsenceContext && (
            <section>
              <SectionHeader icon={CalendarDays} title="Absence Breakdown" />
              <div className="grid grid-cols-2 gap-5">
                {detail.absenceByMonth && detail.absenceByMonth.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                      By Month
                    </p>
                    <div className="space-y-2">
                      {detail.absenceByMonth.map((m) => {
                        const maxDays = Math.max(
                          ...detail.absenceByMonth!.map((x) => x.days)
                        );
                        const pct =
                          maxDays > 0
                            ? Math.round((m.days / maxDays) * 100)
                            : 0;
                        return (
                          <div key={m.month} className="space-y-0.5">
                            <div className="flex justify-between text-sm">
                              <span className="font-medium">{m.month}</span>
                              <span className="font-bold tabular-nums text-orange-600">
                                {m.days}
                              </span>
                            </div>
                            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                              <div
                                className="h-full rounded-full bg-orange-400 transition-all"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {detail.absenceReasons && detail.absenceReasons.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                      By Reason
                    </p>
                    <div className="space-y-2">
                      {detail.absenceReasons.map((r) => {
                        const maxDays = Math.max(
                          ...detail.absenceReasons!.map((x) => x.days)
                        );
                        const pct =
                          maxDays > 0
                            ? Math.round((r.days / maxDays) * 100)
                            : 0;
                        return (
                          <div key={r.reason} className="space-y-0.5">
                            <div className="flex justify-between text-sm">
                              <span className="truncate mr-2 font-medium">
                                {r.reason}
                              </span>
                              <span className="font-bold shrink-0 tabular-nums text-blue-600">
                                {r.days}
                              </span>
                            </div>
                            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                              <div
                                className="h-full rounded-full bg-blue-400 transition-all"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Balance By Term (Delinquency) */}
          {hasBalanceContext && (
            <section>
              <SectionHeader icon={DollarSign} title="Balance by Term" />
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableHead className="text-xs font-semibold">Term</TableHead>
                      <TableHead className="text-right text-xs font-semibold">
                        Charged
                      </TableHead>
                      <TableHead className="text-right text-xs font-semibold">
                        Paid
                      </TableHead>
                      <TableHead className="text-right text-xs font-semibold">
                        Balance
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.balanceByTerm!.map((t) => (
                      <TableRow key={t.term}>
                        <TableCell className="text-sm font-medium">
                          {t.term}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          {t.charged.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          {t.paid.toLocaleString()}
                        </TableCell>
                        <TableCell
                          className={`text-right text-sm font-bold tabular-nums ${
                            t.balance > 0
                              ? "text-red-600"
                              : "text-green-600"
                          }`}
                        >
                          {t.balance.toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </section>
          )}

          {/* Subject Grades */}
          {detail.subjects && detail.subjects.length > 0 && (
            <section>
              <SectionHeader icon={BookOpen} title="All Subject Grades" count={detail.subjects.length} />
              <div className="max-h-60 overflow-y-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50 hover:bg-muted/50 sticky top-0">
                      <TableHead className="text-xs font-semibold">Subject</TableHead>
                      <TableHead className="text-right text-xs font-semibold w-20">
                        Grade
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.subjects.map((s) => (
                      <TableRow key={s.subject}>
                        <TableCell className="text-sm font-medium">{s.subject}</TableCell>
                        <TableCell className="text-right">
                          <Badge
                            variant="secondary"
                            className={`font-bold text-xs tabular-nums ${
                              s.grade >= 90
                                ? "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400"
                                : s.grade >= 60
                                ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-400"
                                : "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400"
                            }`}
                          >
                            {s.grade}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/*  Reusable section header                                            */
/* ------------------------------------------------------------------ */
function SectionHeader({
  icon: Icon,
  title,
  iconColor = "text-muted-foreground",
  extra,
  count,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  iconColor?: string;
  extra?: React.ReactNode;
  count?: number;
}) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className={`h-4 w-4 ${iconColor}`} />
      <h4 className="text-sm font-semibold">{title}</h4>
      {typeof count === "number" && (
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-semibold">
          {count}
        </Badge>
      )}
      {extra && <div className="ml-auto">{extra}</div>}
    </div>
  );
}
