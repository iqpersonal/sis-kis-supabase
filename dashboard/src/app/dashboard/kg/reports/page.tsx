"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useMemo, useCallback } from "react";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Loader2, FileText, Users, Printer, Download,
  Sparkles, Eye, ChevronRight,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useAcademicYear } from "@/context/academic-year-context";
import { useLanguage } from "@/context/language-context";
import { compareAlphabeticalNames } from "@/lib/name-sort";
import { PageTransition } from "@/components/motion";
import {
  DEFAULT_KG_DOMAINS, KG_LEVELS, KG_TERMS, KG_LEVEL_MAP,
  domainAverage, numericToLevel, levelToNumeric, getTermsForCount,
  type KgDomain, type KgLevel, type KgTerm,
} from "@/lib/kg-rubric";

/* ── Types ──────────────────────────────────────────────────────── */

interface KgClass {
  classCode: string;
  className: string;
  sections: { sectionCode: string; sectionName: string }[];
}

interface KgAssessment {
  id: string;
  student_number: string;
  student_name: string;
  class_code: string;
  class_name: string;
  section_code: string;
  section_name: string;
  academic_year: string;
  term: string;
  ratings: Record<string, KgLevel>;
  domain_notes: Record<string, string>;
  teacher_comment: string;
  recorded_by: string;
  updated_at?: string;
}

/* ── PDF Generation ────────────────────────────────────────────── */

async function generateKgReportPdf(
  assessment: KgAssessment,
  domains: KgDomain[],
  year: string,
  schoolName: string,
) {
  const { default: jsPDF } = await import("jspdf");
  // @ts-ignore — autoTable plugin attaches to jsPDF prototype
  await import("jspdf-autotable");

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 15;
  let y = 15;

  /* ── Header Banner ── */
  doc.setFillColor(124, 58, 237); // purple-600
  doc.rect(0, 0, pageW, 38, "F");

  // Gradient bar
  doc.setFillColor(219, 39, 119); // pink-600
  doc.rect(0, 35, pageW, 3, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(schoolName, pageW / 2, 14, { align: "center" });

  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.text("Kindergarten Progress Report", pageW / 2, 22, { align: "center" });

  const termLabel = KG_TERMS.find((t) => t.value === assessment.term)?.label || assessment.term;
  doc.setFontSize(10);
  doc.text(`${termLabel} — Academic Year ${year}`, pageW / 2, 30, { align: "center" });

  y = 45;

  /* ── Student Info Box ── */
  doc.setDrawColor(200, 200, 200);
  doc.setFillColor(249, 250, 251);
  doc.roundedRect(margin, y, pageW - 2 * margin, 22, 3, 3, "FD");

  doc.setTextColor(60, 60, 60);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("Student:", margin + 5, y + 8);
  doc.setFont("helvetica", "normal");
  doc.text(assessment.student_name, margin + 28, y + 8);

  doc.setFont("helvetica", "bold");
  doc.text("ID:", margin + 100, y + 8);
  doc.setFont("helvetica", "normal");
  doc.text(assessment.student_number, margin + 110, y + 8);

  doc.setFont("helvetica", "bold");
  doc.text("Class:", margin + 5, y + 16);
  doc.setFont("helvetica", "normal");
  doc.text(assessment.class_name || `Class ${assessment.class_code}`, margin + 22, y + 16);

  doc.setFont("helvetica", "bold");
  doc.text("Section:", margin + 70, y + 16);
  doc.setFont("helvetica", "normal");
  doc.text(assessment.section_name || assessment.section_code, margin + 90, y + 16);

  y += 30;

  /* ── Rating Scale Legend ── */
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("Rating Scale:", margin, y);
  doc.setFont("helvetica", "normal");

  const legendItems = KG_LEVELS.map((l) => `${l.emoji} ${l.label}`);
  doc.text(legendItems.join("     "), margin + 25, y);
  y += 8;

  /* ── Domain Tables ── */
  for (const domain of domains) {
    // Check if we need a new page
    if (y > 240) {
      doc.addPage();
      y = 15;
    }

    // Domain header
    const colorMap: Record<string, [number, number, number]> = {
      blue: [59, 130, 246],
      violet: [139, 92, 246],
      teal: [20, 184, 166],
      green: [34, 197, 94],
      amber: [245, 158, 11],
      rose: [244, 63, 94],
    };
    const headerColor = colorMap[domain.color] || [124, 58, 237];

    doc.setFillColor(...headerColor);
    doc.roundedRect(margin, y, pageW - 2 * margin, 8, 2, 2, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(`${domain.icon}  ${domain.name}`, margin + 4, y + 5.5);

    y += 11;

    // Skills table
    const tableData = domain.skills.map((skill) => {
      const rating = assessment.ratings?.[skill.id] as KgLevel | undefined;
      const info = rating ? KG_LEVEL_MAP[rating] : null;
      return [
        skill.name,
        info ? `${info.emoji} ${info.label}` : "—",
      ];
    });

    // Domain average
    const { avg, level } = domainAverage(assessment.ratings as Record<string, KgLevel>, domain.skills);
    const avgInfo = KG_LEVEL_MAP[level];

    // @ts-expect-error — autoTable plugin
    doc.autoTable({
      startY: y,
      margin: { left: margin, right: margin },
      head: [["Skill", "Rating"]],
      body: tableData,
      foot: [["Domain Average", `${avgInfo.emoji} ${avgInfo.label} (${avg.toFixed(1)}/4.0)`]],
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 2.5 },
      headStyles: {
        fillColor: [...headerColor] as [number, number, number],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 8,
      },
      footStyles: {
        fillColor: [249, 250, 251],
        textColor: [60, 60, 60],
        fontStyle: "bold",
        fontSize: 8,
      },
      columnStyles: {
        0: { cellWidth: "auto" },
        1: { cellWidth: 40, halign: "center" },
      },
    });

    // @ts-expect-error — autoTable sets finalY
    y = doc.lastAutoTable.finalY + 3;

    // Domain notes
    const domainNote = assessment.domain_notes?.[domain.id];
    if (domainNote) {
      doc.setTextColor(100, 100, 100);
      doc.setFontSize(7);
      doc.setFont("helvetica", "italic");
      doc.text(`Note: ${domainNote}`, margin + 2, y);
      y += 5;
    }

    y += 3;
  }

  /* ── Overall Summary ── */
  if (y > 230) {
    doc.addPage();
    y = 15;
  }

  // Summary box
  doc.setFillColor(249, 250, 251);
  doc.setDrawColor(124, 58, 237);
  doc.setLineWidth(0.5);

  const allSkills = domains.flatMap((d) => d.skills);
  const totalRated = allSkills.filter((s) => assessment.ratings?.[s.id]).length;
  const overallSum = allSkills.reduce((sum, s) => {
    const r = assessment.ratings?.[s.id] as KgLevel;
    return sum + (r ? levelToNumeric(r) : 0);
  }, 0);
  const overallAvg = totalRated > 0 ? overallSum / totalRated : 0;
  const overallLevel = numericToLevel(overallAvg);
  const overallInfo = KG_LEVEL_MAP[overallLevel];

  doc.roundedRect(margin, y, pageW - 2 * margin, 14, 3, 3, "FD");
  doc.setTextColor(60, 60, 60);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("Overall Assessment:", margin + 5, y + 6);
  doc.text(
    `${overallInfo.emoji} ${overallInfo.label} (${overallAvg.toFixed(1)}/4.0) — ${totalRated}/${allSkills.length} skills rated`,
    margin + 50, y + 6,
  );

  y += 20;

  /* ── Teacher Comment ── */
  if (assessment.teacher_comment) {
    if (y > 245) {
      doc.addPage();
      y = 15;
    }

    doc.setFillColor(254, 243, 199); // amber-100
    doc.setDrawColor(245, 158, 11);
    doc.roundedRect(margin, y, pageW - 2 * margin, 20, 3, 3, "FD");

    doc.setTextColor(120, 80, 0);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("Teacher's Comment:", margin + 4, y + 6);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    const lines = doc.splitTextToSize(assessment.teacher_comment, pageW - 2 * margin - 8);
    doc.text(lines.slice(0, 3), margin + 4, y + 12);

    y += 25;
  }

  /* ── Footer ── */
  const pageH = doc.internal.pageSize.getHeight();
  doc.setDrawColor(200, 200, 200);
  doc.line(margin, pageH - 20, pageW - margin, pageH - 20);

  doc.setTextColor(150, 150, 150);
  doc.setFontSize(7);
  doc.text(
    `Generated on ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`,
    margin, pageH - 14,
  );
  doc.text(schoolName, pageW - margin, pageH - 14, { align: "right" });

  // Signature lines
  doc.setTextColor(60, 60, 60);
  doc.setFontSize(8);
  const sigY = pageH - 35;
  doc.line(margin, sigY, margin + 50, sigY);
  doc.text("Teacher Signature", margin + 10, sigY + 4);

  doc.line(pageW - margin - 50, sigY, pageW - margin, sigY);
  doc.text("Parent Signature", pageW - margin - 40, sigY + 4);

  return doc;
}

/* ── Preview Component ─────────────────────────────────────────── */

function ReportPreview({
  assessment,
  domains,
  locale,
}: {
  assessment: KgAssessment;
  domains: KgDomain[];
  locale: string;
}) {
  const termLabel = KG_TERMS.find((t) => t.value === assessment.term)?.label || assessment.term;

  return (
    <div className="space-y-4">
      {/* Student info */}
      <div className="rounded-lg bg-muted/50 p-4">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div><span className="font-medium">Student:</span> {assessment.student_name}</div>
          <div><span className="font-medium">ID:</span> #{assessment.student_number}</div>
          <div><span className="font-medium">Class:</span> {assessment.class_name}</div>
          <div><span className="font-medium">Section:</span> {assessment.section_name}</div>
          <div><span className="font-medium">Term:</span> {termLabel}</div>
        </div>
      </div>

      {/* Domain breakdown */}
      {domains.map((domain) => {
        const { avg, level, rated, total } = domainAverage(
          assessment.ratings as Record<string, KgLevel>,
          domain.skills,
        );
        const info = KG_LEVEL_MAP[level];

        return (
          <div key={domain.id} className="rounded-lg border p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium text-sm">{domain.icon} {locale === "ar" ? domain.nameAr : domain.name}</span>
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${info.color}`}>
                {info.emoji} {info.label}
              </span>
            </div>
            <div className="space-y-1">
              {domain.skills.map((skill) => {
                const r = assessment.ratings?.[skill.id] as KgLevel | undefined;
                const rInfo = r ? KG_LEVEL_MAP[r] : null;
                return (
                  <div key={skill.id} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{locale === "ar" ? skill.nameAr : skill.name}</span>
                    {rInfo ? (
                      <span className={`rounded-full px-2 py-0.5 ${rInfo.color}`}>
                        {rInfo.emoji} {rInfo.label}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </div>
                );
              })}
            </div>
            {assessment.domain_notes?.[domain.id] && (
              <p className="mt-2 text-xs italic text-muted-foreground border-t pt-1.5">
                {assessment.domain_notes[domain.id]}
              </p>
            )}
          </div>
        );
      })}

      {/* Teacher comment */}
      {assessment.teacher_comment && (
        <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3">
          <p className="text-xs font-medium text-amber-800 dark:text-amber-300 mb-1">Teacher&apos;s Comment</p>
          <p className="text-sm text-amber-900 dark:text-amber-200">{assessment.teacher_comment}</p>
        </div>
      )}
    </div>
  );
}

/* ── Main Page ──────────────────────────────────────────────────── */

export default function KgReportPage() {
  const { selectedYear, loading: yearLoading } = useAcademicYear();
  const { locale } = useLanguage();

  const year = selectedYear || "25-26";

  // Filters
  const [classCode, setClassCode] = useState<string>("all");
  const [sectionCode, setSectionCode] = useState<string>("all");
  const [term, setTerm] = useState<KgTerm>("term1");
  const [termCount, setTermCount] = useState(3);

  // Derived: visible terms based on academic year setting
  const visibleTerms = useMemo(() => getTermsForCount(termCount), [termCount]);

  // Data
  const [classes, setClasses] = useState<KgClass[]>([]);
  const [assessments, setAssessments] = useState<KgAssessment[]>([]);
  const domains = DEFAULT_KG_DOMAINS;

  // UI
  const [loading, setLoading] = useState(true);
  const [loadingReports, setLoadingReports] = useState(false);
  const [generating, setGenerating] = useState<string | null>(null);
  const [previewAssessment, setPreviewAssessment] = useState<KgAssessment | null>(null);

  const schoolName = "Khaled International Schools";

  /* ── Fetch classes + term config ── */
  useEffect(() => {
    if (!year) return;
    setLoading(true);
    (async () => {
      try {
        const [classesRes, termRes] = await Promise.all([
          fetch(`/api/kg?action=classes&year=${year}`),
          fetch(`/api/academic-year?year=${year}`),
        ]);
        if (classesRes.ok) {
          const data = await classesRes.json();
          setClasses(data.classes || []);
        }
        if (termRes.ok) {
          const termData = await termRes.json();
          setTermCount(termData.term_count ?? 3);
        }
      } catch (err) {
        console.error("Failed to fetch KG classes:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [year]);

  /* ── Fetch assessments ── */
  useEffect(() => {
    if (classCode === "all" || !year || !term) {
      setAssessments([]);
      return;
    }
    setLoadingReports(true);
    (async () => {
      try {
        const params = new URLSearchParams({ action: "list", year, term, classCode });
        if (sectionCode !== "all") params.set("sectionCode", sectionCode);
        const res = await fetch(`/api/kg?${params}`);
        if (res.ok) {
          const data = await res.json();
          setAssessments(data.assessments || []);
        }
      } catch (err) {
        console.error("Failed to fetch assessments:", err);
      } finally {
        setLoadingReports(false);
      }
    })();
  }, [year, classCode, sectionCode, term]);

  /* ── Available sections ── */
  const availableSections = useMemo(() => {
    if (classCode === "all") return [];
    return classes.find((c) => c.classCode === classCode)?.sections || [];
  }, [classes, classCode]);

  /* ── Generate single PDF ── */
  const handleGeneratePdf = useCallback(async (assessment: KgAssessment) => {
    setGenerating(assessment.student_number);
    try {
      const doc = await generateKgReportPdf(assessment, domains, year, schoolName);
      doc.save(`KG_Report_${assessment.student_name.replace(/\s+/g, "_")}_${assessment.term}_${year}.pdf`);
    } catch (err) {
      console.error("PDF generation failed:", err);
    } finally {
      setGenerating(null);
    }
  }, [domains, year, schoolName]);

  /* ── Generate all PDFs (batch) ── */
  const handleGenerateAll = useCallback(async () => {
    if (assessments.length === 0) return;
    setGenerating("all");
    try {
      for (const assessment of assessments) {
        const doc = await generateKgReportPdf(assessment, domains, year, schoolName);
        doc.save(`KG_Report_${assessment.student_name.replace(/\s+/g, "_")}_${assessment.term}_${year}.pdf`);
        // Small delay to prevent browser freeze
        await new Promise((r) => setTimeout(r, 200));
      }
    } catch (err) {
      console.error("Batch PDF generation failed:", err);
    } finally {
      setGenerating(null);
    }
  }, [assessments, domains, year, schoolName]);

  /* ── Render ── */

  if (yearLoading || loading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-4 w-96 mt-2" />
        <div className="grid gap-4 sm:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}><CardContent className="py-6"><Skeleton className="h-20 w-full" /></CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <PageTransition>
      <div className="space-y-6 p-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-7 w-7 text-purple-500" />
            <span className="bg-gradient-to-r from-purple-600 to-pink-500 bg-clip-text text-transparent">
              KG Progress Reports
            </span>
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Generate and download professional KG progress report PDFs — {year}
          </p>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Select Report Parameters</CardTitle>
            <CardDescription>Choose the class, section, and term to generate reports.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4 items-end">
              <div className="w-44">
                <Label className="text-xs">Class</Label>
                <Select
                  value={classCode}
                  onValueChange={(v) => { setClassCode(v); setSectionCode("all"); }}
                >
                  <SelectTrigger><SelectValue placeholder="Select class…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All KG Classes</SelectItem>
                    {classes.map((c) => (
                      <SelectItem key={c.classCode} value={c.classCode}>
                        {c.className || `Class ${c.classCode}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="w-44">
                <Label className="text-xs">Section</Label>
                <Select value={sectionCode} onValueChange={setSectionCode}>
                  <SelectTrigger><SelectValue placeholder="All sections" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sections</SelectItem>
                    {availableSections.map((s) => (
                      <SelectItem key={s.sectionCode} value={s.sectionCode}>
                        {s.sectionName || s.sectionCode}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="w-44">
                <Label className="text-xs">Term</Label>
                <Select value={term} onValueChange={(v) => setTerm(v as KgTerm)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {visibleTerms.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {locale === "ar" ? t.labelAr : t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {assessments.length > 0 && (
                <Button
                  onClick={handleGenerateAll}
                  disabled={!!generating}
                  className="bg-gradient-to-r from-purple-600 to-pink-500 text-white hover:from-purple-700 hover:to-pink-600"
                >
                  {generating === "all" ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating…</>
                  ) : (
                    <><Download className="mr-2 h-4 w-4" /> Download All ({assessments.length})</>
                  )}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Report List */}
        {classCode === "all" ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Printer className="mx-auto h-12 w-12 mb-3 text-purple-300" />
              <p className="text-lg font-medium">Select a class and term</p>
              <p className="text-sm">Choose filters above to see available reports</p>
            </CardContent>
          </Card>
        ) : loadingReports ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        ) : assessments.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <FileText className="mx-auto h-12 w-12 mb-3 text-muted-foreground/30" />
              <p className="text-lg font-medium">No assessments found</p>
              <p className="text-sm">Complete assessments in the KG Assessment page first</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {assessments
              .sort((a, b) => compareAlphabeticalNames(a.student_name, b.student_name))
              .map((assessment) => {
                const allSkills = domains.flatMap((d) => d.skills);
                const ratedCount = allSkills.filter((s) => assessment.ratings?.[s.id]).length;
                const totalCount = allSkills.length;
                const overallSum = allSkills.reduce((sum, s) => {
                  const r = assessment.ratings?.[s.id] as KgLevel;
                  return sum + (r ? levelToNumeric(r) : 0);
                }, 0);
                const overallAvg = ratedCount > 0 ? overallSum / ratedCount : 0;
                const overallLevel = numericToLevel(overallAvg);
                const info = KG_LEVEL_MAP[overallLevel];

                return (
                  <Card
                    key={assessment.id}
                    className="hover:shadow-sm transition-shadow"
                  >
                    <CardContent className="py-3 flex items-center gap-4">
                      {/* Student info */}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{assessment.student_name}</p>
                        <p className="text-xs text-muted-foreground">
                          #{assessment.student_number} · {assessment.section_name || assessment.section_code}
                        </p>
                      </div>

                      {/* Skills count */}
                      <Badge variant="outline" className="flex-shrink-0">
                        {ratedCount}/{totalCount} skills
                      </Badge>

                      {/* Overall level */}
                      <span className={`flex-shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${info.color}`}>
                        {info.emoji} {info.label}
                      </span>

                      {/* Actions */}
                      <div className="flex gap-1 flex-shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPreviewAssessment(assessment)}
                        >
                          <Eye className="h-3.5 w-3.5 mr-1" /> Preview
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleGeneratePdf(assessment)}
                          disabled={!!generating}
                          className="bg-gradient-to-r from-purple-600 to-pink-500 text-white hover:from-purple-700 hover:to-pink-600"
                        >
                          {generating === assessment.student_number ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <><Download className="h-3.5 w-3.5 mr-1" /> PDF</>
                          )}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
          </div>
        )}

        {/* Preview Dialog */}
        <Dialog open={!!previewAssessment} onOpenChange={(open) => { if (!open) setPreviewAssessment(null); }}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Eye className="h-5 w-5 text-purple-500" />
                Report Preview: {previewAssessment?.student_name}
              </DialogTitle>
            </DialogHeader>
            {previewAssessment && (
              <>
                <ReportPreview assessment={previewAssessment} domains={domains} locale={locale} />
                <div className="flex justify-end gap-2 pt-4 border-t">
                  <Button variant="outline" onClick={() => setPreviewAssessment(null)}>
                    Close
                  </Button>
                  <Button
                    onClick={() => {
                      handleGeneratePdf(previewAssessment);
                      setPreviewAssessment(null);
                    }}
                    className="bg-gradient-to-r from-purple-600 to-pink-500 text-white"
                  >
                    <Download className="h-4 w-4 mr-2" /> Download PDF
                  </Button>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </PageTransition>
  );
}
