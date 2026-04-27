import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { verifyAuth } from "@/lib/api-auth";

// Module-level cache for static reference tables (raw_Subject, raw_tbl_Quiz)
// These are synced from SQL nightly and never change during the day.
let _subjectMap: Record<string, string> | null = null;
let _nameToCode: Record<string, string> | null = null;
let _quizDescMap: Record<string, string> | null = null;
let _refCacheTime = 0;
const REF_CACHE_TTL = 60 * 60 * 1000; // 1 hour

async function getRefTables() {
  const now = Date.now();
  if (_subjectMap && _quizDescMap && now - _refCacheTime < REF_CACHE_TTL) {
    return { subjectMap: _subjectMap, nameToCode: _nameToCode!, quizDescMap: _quizDescMap };
  }
  const supabase = createServiceClient();
  const [{ data: subjectRows }, { data: quizRows }] = await Promise.all([
    supabase.from("raw_Subject").select("*").limit(5000),
    supabase.from("raw_tbl_Quiz").select("*").limit(5000),
  ]);
  const subjectMap: Record<string, string> = {};
  (subjectRows || []).forEach((data: Record<string, unknown>) => {
    const code = String(data.Subject_Code ?? "").trim();
    const name = String(data.E_Subject_Name ?? code).trim();
    if (code) subjectMap[code] = name;
  });
  const nameToCode: Record<string, string> = {};
  for (const [code, name] of Object.entries(subjectMap)) nameToCode[name] = code;
  const quizDescMap: Record<string, string> = {};
  (quizRows || []).forEach((data: Record<string, unknown>) => {
    const code = String(data.Quiz_Code ?? "").trim();
    const desc = String(data.E_Quiz_Desc ?? code).trim();
    if (code) quizDescMap[code] = desc;
  });
  _subjectMap = subjectMap;
  _nameToCode = nameToCode;
  _quizDescMap = quizDescMap;
  _refCacheTime = now;
  return { subjectMap, nameToCode, quizDescMap };
}

/* ── Types ────────────────────────────────────────────────────────── */

interface TranscriptSubject {
  subject: string;
  subject_ar: string;
  grade: number;
  credit_hours: number;
  calculated: boolean;
}

interface SubjectGrade {
  subject: string;
  subject_ar?: string;
  grade: number;
  class_rank?: number | null;
  section_rank?: number | null;
}

interface TermData {
  label: string;
  subjects: { subject: string; grade: number }[];
  avg: number;
}

interface YearData {
  class_code: string;
  class_name: string;
  section_code: string;
  section_name: string;
  school: string;
  overall_avg: number;
  exam_label?: string;
  rank?: number | null;
  class_size?: number | null;
  pass_count?: number;
  fail_count?: number;
  strongest?: { subject: string; grade: number };
  weakest?: { subject: string; grade: number };
  subjects?: SubjectGrade[];
  terms?: Record<string, TermData>;
  term_count?: number;
  transcript_subjects?: TranscriptSubject[];
  transcript_sem1?: TranscriptSubject[];
  transcript_sem2?: TranscriptSubject[];
  transcript_sem3?: TranscriptSubject[];
}

interface StudentData {
  student_number: string;
  student_name: string;
  student_name_ar?: string;
  gender: string;
  family_number: string;
  dob?: string;
  birth_place_en?: string;
  nationality_en?: string;
  nationality_ar?: string;
  passport_id?: string;
  iqama_number?: string;
  enrollment_date?: string;
  prev_school_en?: string;
  years: Record<string, YearData>;
}

interface SchoolConfig {
  label: string;
  principal: string;
  principal_ar: string;
  academic_director: string;
  academic_director_ar: string;
}

interface TranscriptSettings {
  schools: Record<string, SchoolConfig>;
  school_logo?: string;
  cognia_logo?: string;
  moe_logo?: string;
}

/* ── Helpers ──────────────────────────────────────────────────────── */

function letterGrade(g: number): string {
  if (g >= 90) return "A";
  if (g >= 80) return "B";
  if (g >= 70) return "C";
  if (g >= 60) return "D";
  return "F";
}

function gradePoints(g: number): number {
  if (g >= 90) return 4;
  if (g >= 80) return 3;
  if (g >= 70) return 2;
  if (g >= 60) return 1;
  return 0;
}

function formatAcademicYear(code: string): string {
  const parts = code.split("-");
  if (parts.length === 2) {
    const a = Number(parts[0]);
    const b = Number(parts[1]);
    if (!isNaN(a) && !isNaN(b)) {
      const y1 = a >= 50 ? 1900 + a : 2000 + a;
      const y2 = b >= 50 ? 1900 + b : 2000 + b;
      return `${y1}-${y2}`;
    }
  }
  return code;
}

function formatDate(d: string | undefined | null): string {
  if (!d) return "-";
  try {
    return new Date(d).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return d;
  }
}

/* ── Colors ───────────────────────────────────────────────────────── */

const PRIMARY: [number, number, number] = [31, 78, 121];
const HEADER_BG: [number, number, number] = [41, 98, 150];
const ALT_ROW: [number, number, number] = [240, 245, 250];
const GREEN: [number, number, number] = [22, 163, 74];
const RED: [number, number, number] = [220, 38, 38];

interface AssignedClass {
  classId: string;
  className: string;
  section: string;
  year: string;
  campus: string;
  subject?: string;
}

interface TeacherAssignmentReportDoc {
  displayName?: string;
  email?: string;
  role?: string;
  assigned_classes?: AssignedClass[];
}

interface ParsedSubjectPeriod {
  name: string;
  periods: number;
}

interface TeacherSubjectRow {
  subject: string;
  periodsByClassId: Record<string, number>;
  rowTotal: number;
}

interface TeacherReportRow {
  teacherName: string;
  rows: TeacherSubjectRow[];
  teacherTotal: number;
}

interface ClassColumn {
  classId: string;
  label: string;
}

function campusFilterFromSchool(school: string): "Boys" | "Girls" | null {
  if (school === "0021-01") return "Boys";
  if (school === "0021-02") return "Girls";
  return null;
}

function parseSubjectPeriods(subjectRaw?: string): ParsedSubjectPeriod[] {
  if (!subjectRaw) return [];

  return subjectRaw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((entry) => {
      const idx = entry.lastIndexOf(":");
      if (idx < 0) return { name: entry, periods: 0 };
      const name = entry.slice(0, idx).trim();
      const periodsRaw = entry.slice(idx + 1).trim();
      const periods = Number.parseInt(periodsRaw, 10);
      return { name, periods: Number.isFinite(periods) ? periods : 0 };
    })
    .filter((s) => s.name && s.name !== "undefined");
}

function gradeSortValue(className: string): number {
  const m = className.match(/(\d+)/);
  return m ? Number.parseInt(m[1], 10) : 0;
}

async function generateTeacherAssignmentPDF(year: string, school: string): Promise<ArrayBuffer> {
  const campusFilter = campusFilterFromSchool(school);
  const supabase = createServiceClient();

  const { data: teacherRows } = await supabase
    .from("admin_users")
    .select("*")
    .eq("role", "teacher");

  const teacherDocs = (teacherRows || [])
    .map((d) => d as TeacherAssignmentReportDoc)
    .map((doc) => {
      const name = (doc.displayName || "").trim() || (doc.email || "").trim() || "Unnamed Teacher";
      const assigned = Array.isArray(doc.assigned_classes) ? doc.assigned_classes : [];
      const inScope = assigned.filter((c) => {
        if (!c || c.year !== year) return false;
        if (!campusFilter) return true;
        return c.campus === campusFilter;
      });
      return { name, assigned: inScope };
    })
    .filter((t) => t.assigned.length > 0);

  if (teacherDocs.length === 0) {
    throw new Error("No teacher assignments found for the selected filters");
  }

  const columnMap = new Map<string, ClassColumn>();
  teacherDocs.forEach((t) => {
    t.assigned.forEach((c) => {
      if (!columnMap.has(c.classId)) {
        columnMap.set(c.classId, {
          classId: c.classId,
          label: `${c.className} ${c.section}`.trim(),
        });
      }
    });
  });

  const classColumns = Array.from(columnMap.values()).sort((a, b) => {
    const ga = gradeSortValue(a.label);
    const gb = gradeSortValue(b.label);
    if (ga !== gb) return ga - gb;
    return a.label.localeCompare(b.label, undefined, { numeric: true });
  });

  const teachers = teacherDocs
    .map((t): TeacherReportRow => {
      const subjectMap = new Map<string, TeacherSubjectRow>();

      t.assigned.forEach((assignment) => {
        const parsed = parseSubjectPeriods(assignment.subject);
        parsed.forEach((sp) => {
          const key = sp.name;
          if (!subjectMap.has(key)) {
            subjectMap.set(key, { subject: key, periodsByClassId: {}, rowTotal: 0 });
          }
          const row = subjectMap.get(key)!;
          row.periodsByClassId[assignment.classId] = (row.periodsByClassId[assignment.classId] || 0) + sp.periods;
          row.rowTotal += sp.periods;
        });
      });

      const rows = Array.from(subjectMap.values()).sort((a, b) => a.subject.localeCompare(b.subject));
      const teacherTotal = rows.reduce((sum, r) => sum + r.rowTotal, 0);

      return {
        teacherName: t.name,
        rows,
        teacherTotal,
      };
    })
    .filter((t) => t.rows.length > 0)
    .sort((a, b) => a.teacherName.localeCompare(b.teacherName));

  if (teachers.length === 0) {
    throw new Error("No teacher subject periods found for the selected filters");
  }

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a3" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 8;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...PRIMARY);
  doc.text("TEACHER ASSIGNMENT MATRIX", pageW / 2, 12, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(50);
  doc.text(
    `Academic Year: ${formatAcademicYear(year)} | Campus: ${school === "0021-01" ? "Boys" : school === "0021-02" ? "Girls" : "All"}`,
    pageW / 2,
    18,
    { align: "center" },
  );

  const head = [["Name", "Subject", ...classColumns.map((c) => c.label), "Total Hours"]];
  const body: string[][] = [];
  const totalRowIndexes = new Set<number>();

  teachers.forEach((teacher) => {
    teacher.rows.forEach((row, idx) => {
      const record: string[] = [];
      record.push(idx === 0 ? teacher.teacherName : "");
      record.push(row.subject);
      classColumns.forEach((cc) => {
        const val = row.periodsByClassId[cc.classId] || 0;
        record.push(val > 0 ? String(val) : "");
      });
      record.push("");
      body.push(record);
    });

    const totalRecord: string[] = ["", "Teacher Total", ...classColumns.map(() => ""), String(teacher.teacherTotal)];
    body.push(totalRecord);
    totalRowIndexes.add(body.length - 1);
  });

  autoTable(doc, {
    startY: 24,
    margin: { left: margin, right: margin },
    head,
    body,
    styles: {
      fontSize: 7,
      cellPadding: 1.5,
      lineColor: [220, 220, 220],
      lineWidth: 0.2,
      halign: "center",
    },
    headStyles: {
      fillColor: HEADER_BG,
      textColor: [255, 255, 255],
      fontStyle: "bold",
      halign: "center",
      fontSize: 7,
    },
    columnStyles: {
      0: { halign: "left", cellWidth: 38 },
      1: { halign: "left", cellWidth: 22 },
      [classColumns.length + 2]: { halign: "center", cellWidth: 16, fontStyle: "bold" },
    },
    didParseCell: (data) => {
      if (data.section !== "body") return;
      if (totalRowIndexes.has(data.row.index)) {
        data.cell.styles.fillColor = [242, 242, 242];
        data.cell.styles.fontStyle = "bold";
      }
    },
    alternateRowStyles: {
      fillColor: ALT_ROW,
    },
  });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(140);
  doc.text(
    `Generated on ${new Date().toLocaleDateString("en-US")} — Teacher Assignment Matrix`,
    pageW / 2,
    pageH - 6,
    { align: "center" },
  );

  return doc.output("arraybuffer");
}

/* ── Transcript PDF ───────────────────────────────────────────────── */

function generateTranscriptPDF(
  student: StudentData,
  yearKeys: string[],
  settings: TranscriptSettings | null,
): ArrayBuffer {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 15;

  for (let yi = 0; yi < yearKeys.length; yi++) {
    const yearKey = yearKeys[yi];
    const yd = student.years[yearKey];
    if (!yd) continue;

    if (yi > 0) doc.addPage();

    let y = 15;

    // ── Logos ──
    if (settings?.school_logo) {
      try { doc.addImage(settings.school_logo, "PNG", margin, y, 20, 20); } catch { /* skip */ }
    }
    if (settings?.moe_logo) {
      try { doc.addImage(settings.moe_logo, "PNG", pageW - margin - 20, y, 20, 20); } catch { /* skip */ }
    }

    // ── Title ──
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(...PRIMARY);
    doc.text("OFFICIAL ACADEMIC TRANSCRIPT", pageW / 2, y + 8, { align: "center" });
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`Academic Year: ${formatAcademicYear(yearKey)}`, pageW / 2, y + 14, { align: "center" });

    const schoolKey = yd.school || "0021-01";
    const schoolCfg = settings?.schools?.[schoolKey];
    if (schoolCfg) {
      doc.text(schoolCfg.label, pageW / 2, y + 19, { align: "center" });
    }
    y += 28;

    // ── Student Info Box ──
    const boxH = 42;
    doc.setDrawColor(200);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(margin, y, pageW - 2 * margin, boxH, 2, 2, "FD");

    doc.setFontSize(8);
    const labelX1 = margin + 4;
    const valueX1 = margin + 36;
    const midX = pageW / 2 + 2;
    const labelX2 = midX;
    const valueX2 = midX + 32;
    const rowH = 5.5;

    // Row 1: Student Name (full width, own line)
    doc.setFont("helvetica", "bold");
    doc.setTextColor(80);
    doc.text("Student Name:", labelX1, y + rowH);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(30);
    doc.text(student.student_name || "-", valueX1, y + rowH);

    // Row 2–7: Two-column layout
    const r2 = y + rowH * 2;

    // Left column
    doc.setFont("helvetica", "bold"); doc.setTextColor(80);
    doc.text("Student ID:", labelX1, r2);
    doc.text("Date of Birth:", labelX1, r2 + rowH);
    doc.text("Nationality:", labelX1, r2 + rowH * 2);
    doc.text("Grade:", labelX1, r2 + rowH * 3);
    doc.text("Section:", labelX1, r2 + rowH * 4);

    doc.setFont("helvetica", "normal"); doc.setTextColor(30);
    doc.text(student.student_number || "-", valueX1, r2);
    doc.text(formatDate(student.dob), valueX1, r2 + rowH);
    doc.text(student.nationality_en || "-", valueX1, r2 + rowH * 2);
    doc.text(yd.class_name || "-", valueX1, r2 + rowH * 3);
    doc.text(yd.section_name || "-", valueX1, r2 + rowH * 4);

    // Right column
    doc.setFont("helvetica", "bold"); doc.setTextColor(80);
    doc.text("Gender:", labelX2, r2);
    doc.text("Passport:", labelX2, r2 + rowH);
    doc.text("Iqama:", labelX2, r2 + rowH * 2);
    doc.text("Enrollment:", labelX2, r2 + rowH * 3);
    doc.text("Prev School:", labelX2, r2 + rowH * 4);

    doc.setFont("helvetica", "normal"); doc.setTextColor(30);
    doc.text(student.gender || "-", valueX2, r2);
    doc.text(student.passport_id || "-", valueX2, r2 + rowH);
    doc.text(student.iqama_number || "-", valueX2, r2 + rowH * 2);
    doc.text(formatDate(student.enrollment_date), valueX2, r2 + rowH * 3);
    doc.text((student.prev_school_en || "-").substring(0, 35), valueX2, r2 + rowH * 4);

    y += boxH + 6;

    // ── Unified Grade Table with dynamic semester columns ──
    const sem1 = yd.transcript_sem1 || [];
    const sem2 = yd.transcript_sem2 || [];
    const sem3 = yd.transcript_sem3 || [];
    const annual = yd.transcript_subjects || [];

    const hasSem1 = sem1.length > 0;
    const hasSem2 = sem2.length > 0;
    const hasSem3 = sem3.length > 0;

    // Build unified subject map
    const subjectMap = new Map<string, { name: string; credits: number; calculated: boolean; sem1?: number; sem2?: number; sem3?: number; total?: number }>();
    for (const s of annual) {
      const isCalc = s.calculated && s.credit_hours > 0;
      subjectMap.set(s.subject, { name: s.subject, credits: s.credit_hours, calculated: isCalc, total: s.grade });
    }
    for (const s of sem1) {
      const isCalc = s.calculated && s.credit_hours > 0;
      const e = subjectMap.get(s.subject) || { name: s.subject, credits: s.credit_hours, calculated: isCalc };
      e.sem1 = s.grade;
      subjectMap.set(s.subject, e);
    }
    for (const s of sem2) {
      const isCalc = s.calculated && s.credit_hours > 0;
      const e = subjectMap.get(s.subject) || { name: s.subject, credits: s.credit_hours, calculated: isCalc };
      e.sem2 = s.grade;
      subjectMap.set(s.subject, e);
    }
    for (const s of sem3) {
      const isCalc = s.calculated && s.credit_hours > 0;
      const e = subjectMap.get(s.subject) || { name: s.subject, credits: s.credit_hours, calculated: isCalc };
      e.sem3 = s.grade;
      subjectMap.set(s.subject, e);
    }

    const sortedSubjects = Array.from(subjectMap.values()).sort((a, b) => {
      if (a.calculated !== b.calculated) return a.calculated ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    // Build dynamic headers and rows
    const headers: string[] = ["Subject", "Credits"];
    if (hasSem1) headers.push("Sem 1");
    if (hasSem2) headers.push("Sem 2");
    if (hasSem3) headers.push("Sem 3");
    headers.push("Total", "Letter", "GPA Points");

    const tableData = sortedSubjects.map((s) => {
      const row: string[] = [
        s.name,
        s.credits > 0 ? s.credits.toString() : "-",
      ];
      if (hasSem1) row.push(s.sem1 !== undefined ? s.sem1.toFixed(1) : "-");
      if (hasSem2) row.push(s.sem2 !== undefined ? s.sem2.toFixed(1) : "-");
      if (hasSem3) row.push(s.sem3 !== undefined ? s.sem3.toFixed(1) : "-");
      const total = s.total ?? 0;
      row.push(s.total !== undefined ? s.total.toFixed(1) : "-");
      row.push(s.total !== undefined ? letterGrade(total) : "-");
      row.push(s.total !== undefined && s.calculated ? gradePoints(total).toFixed(1) : "-");
      return row;
    });

    // Dynamic column styles
    const colStyles: Record<number, { halign: string; cellWidth: number | "auto" }> = {
      0: { halign: "left", cellWidth: "auto" },
      1: { halign: "center", cellWidth: 16 },
    };
    let colIdx = 2;
    if (hasSem1) colStyles[colIdx++] = { halign: "center", cellWidth: 18 };
    if (hasSem2) colStyles[colIdx++] = { halign: "center", cellWidth: 18 };
    if (hasSem3) colStyles[colIdx++] = { halign: "center", cellWidth: 18 };
    colStyles[colIdx++] = { halign: "center", cellWidth: 18 }; // Total
    colStyles[colIdx++] = { halign: "center", cellWidth: 16 }; // Letter
    colStyles[colIdx] = { halign: "center", cellWidth: 22 };   // GPA Points

    // Find the grade column index (Total column) for color-coding
    const totalColIdx = 2 + (hasSem1 ? 1 : 0) + (hasSem2 ? 1 : 0) + (hasSem3 ? 1 : 0);

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      tableWidth: pageW - 2 * margin,
      head: [headers],
      body: tableData,
      styles: {
        fontSize: 8,
        cellPadding: 2,
        lineColor: [220, 220, 220],
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: HEADER_BG,
        textColor: [255, 255, 255],
        fontStyle: "bold",
        halign: "center",
      },
      columnStyles: colStyles as Record<number, Partial<{ halign: "left" | "center" | "right"; cellWidth: number | "auto" }>>,
      alternateRowStyles: { fillColor: ALT_ROW },
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index === totalColIdx) {
          const g = parseFloat(data.cell.raw as string);
          if (!isNaN(g)) {
            data.cell.styles.textColor = g >= 60 ? GREEN : RED;
            data.cell.styles.fontStyle = "bold";
          }
        }
      },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = (doc as any).lastAutoTable.finalY + 4;

    // ── GPA ──
    const calcSubjects = annual.length > 0 ? annual : sem1;
    const calc = calcSubjects.filter((s) => s.calculated && s.credit_hours > 0);
    if (calc.length > 0) {
      let totalWeighted = 0;
      let totalCredits = 0;
      for (const s of calc) {
        totalWeighted += gradePoints(s.grade) * s.credit_hours;
        totalCredits += s.credit_hours;
      }
      const gpa = totalCredits > 0 ? (totalWeighted / totalCredits).toFixed(2) : "0.00";

      doc.setFillColor(...HEADER_BG);
      doc.roundedRect(margin, y, pageW - 2 * margin, 10, 2, 2, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text(`Cumulative GPA: ${gpa} / 4.00`, margin + 10, y + 6.5);
      doc.text(`Overall Average: ${yd.overall_avg?.toFixed(1) || "-"}`, pageW - margin - 10, y + 6.5, { align: "right" });
      y += 14;
    }

    // ── Signatures ──
    if (y < 250) {
      y = 255;
    }
    doc.setTextColor(80);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.line(margin, y, margin + 50, y);
    doc.text("Principal", margin, y + 5);
    if (schoolCfg?.principal) doc.text(schoolCfg.principal, margin, y + 10);

    doc.line(pageW - margin - 50, y, pageW - margin, y);
    doc.text("Academic Director", pageW - margin - 50, y + 5);
    if (schoolCfg?.academic_director)
      doc.text(schoolCfg.academic_director, pageW - margin - 50, y + 10);

    // ── Footer ──
    doc.setFontSize(7);
    doc.setTextColor(150);
    doc.text(
      `Generated on ${new Date().toLocaleDateString("en-US")} — This is an official document`,
      pageW / 2,
      287,
      { align: "center" },
    );
  }

  return doc.output("arraybuffer");
}

/* ── Report Card PDF ──────────────────────────────────────────────── */

function generateReportCardPDF(
  student: StudentData,
  yearKey: string,
  settings: TranscriptSettings | null,
): ArrayBuffer {
  const yd = student.years[yearKey];
  if (!yd) throw new Error(`No data for year ${yearKey}`);

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 12;

  let y = 12;

  // ── Header ──
  if (settings?.school_logo) {
    try { doc.addImage(settings.school_logo, "PNG", margin, y, 16, 16); } catch { /* skip */ }
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...PRIMARY);
  doc.text("STUDENT ACADEMIC PROGRESS REPORT", pageW / 2, y + 6, { align: "center" });
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`Academic Year: ${formatAcademicYear(yearKey)}`, pageW / 2, y + 12, { align: "center" });
  y += 20;

  // ── Student Info strip ──
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(200);
  doc.roundedRect(margin, y, pageW - 2 * margin, 12, 2, 2, "FD");
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(80);

  const infoPairs = [
    ["Name", student.student_name],
    ["ID", student.student_number],
    ["Grade", yd.class_name],
    ["Section", yd.section_name],
    ["Avg", yd.overall_avg?.toFixed(1) || "-"],
    ["Rank", yd.rank ? `${yd.rank}/${yd.class_size || "?"}` : "-"],
  ];
  const stripW = (pageW - 2 * margin) / infoPairs.length;
  for (let i = 0; i < infoPairs.length; i++) {
    const x = margin + i * stripW + 2;
    doc.text(`${infoPairs[i][0]}:`, x, y + 5);
    doc.setFont("helvetica", "normal");
    doc.text(infoPairs[i][1] || "-", x + doc.getTextWidth(`${infoPairs[i][0]}: `), y + 5);
    doc.setFont("helvetica", "bold");

    doc.setFont("helvetica", "normal");
    doc.text(infoPairs[i][1] || "-", x, y + 10);
    doc.setFont("helvetica", "bold");
  }
  y += 16;

  // ── Term-by-term grades table ──
  const terms = yd.terms || {};
  const termOrder = yd.term_count === 3
    ? ["t1_assess", "t1_final", "sem1", "t2_assess", "t2_final", "sem2", "t3_assess", "t3_final", "sem3", "annual"]
    : ["t1_assess", "t1_final", "sem1", "t2_assess", "t2_final", "sem2", "annual"];
  const validTerms = termOrder.filter((tk) => terms[tk]);

  const TERM_SHORT: Record<string, string> = {
    t1_assess: "T1A", t1_final: "T1F", sem1: "S1",
    t2_assess: "T2A", t2_final: "T2F", sem2: "S2",
    t3_assess: "T3A", t3_final: "T3F", sem3: "S3",
    annual: "ANN",
  };

  if (validTerms.length && yd.subjects?.length) {
    const headers = ["Subject", ...validTerms.map((tk) => TERM_SHORT[tk] || tk)];
    const body = yd.subjects.map((subj) => {
      const row: string[] = [subj.subject];
      for (const tk of validTerms) {
        const termSubj = terms[tk]?.subjects?.find((s) => s.subject === subj.subject);
        row.push(termSubj ? termSubj.grade.toFixed(1) : "-");
      }
      return row;
    });

    // Add averages row
    const avgRow: string[] = ["Average"];
    for (const tk of validTerms) {
      avgRow.push(terms[tk]?.avg?.toFixed(1) || "-");
    }
    body.push(avgRow);

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      tableWidth: pageW - 2 * margin,
      head: [headers],
      body,
      styles: {
        fontSize: 7,
        cellPadding: 1.5,
        lineColor: [220, 220, 220],
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: HEADER_BG,
        textColor: [255, 255, 255],
        fontStyle: "bold",
        halign: "center",
        fontSize: 7,
      },
      columnStyles: {
        0: { halign: "left", cellWidth: 45, fontStyle: "bold" },
      },
      alternateRowStyles: { fillColor: ALT_ROW },
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index > 0) {
          const g = parseFloat(data.cell.raw as string);
          if (!isNaN(g)) {
            data.cell.styles.textColor = g >= 60 ? GREEN : RED;
            data.cell.styles.halign = "center";
          }
        }
        // Bold the average row
        if (data.section === "body" && data.row.index === body.length - 1) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fillColor = [230, 240, 250];
        }
      },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // ── Summary cards row ──
  const cards = [
    { label: "Overall Average", value: yd.overall_avg?.toFixed(1) || "-" },
    { label: "Rank / Class Size", value: yd.rank ? `${yd.rank} / ${yd.class_size || "?"}` : "-" },
    { label: "Subjects Passed", value: `${yd.pass_count || 0}` },
    { label: "Subjects Failed", value: `${yd.fail_count || 0}` },
    { label: "Strongest Subject", value: yd.strongest?.subject || "-" },
    { label: "Weakest Subject", value: yd.weakest?.subject || "-" },
  ];

  if (y + 22 < pageH - 20) {
    const cardW = (pageW - 2 * margin - 5 * 4) / 6;
    for (let i = 0; i < cards.length; i++) {
      const cx = margin + i * (cardW + 4);
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(200);
      doc.roundedRect(cx, y, cardW, 18, 2, 2, "FD");
      doc.setFontSize(7);
      doc.setTextColor(120);
      doc.setFont("helvetica", "normal");
      doc.text(cards[i].label, cx + cardW / 2, y + 5, { align: "center" });
      doc.setFontSize(11);
      doc.setTextColor(30);
      doc.setFont("helvetica", "bold");
      doc.text(cards[i].value, cx + cardW / 2, y + 13, { align: "center" });
    }
    y += 22;
  }

  // ── Footer ──
  doc.setFontSize(7);
  doc.setTextColor(150);
  doc.setFont("helvetica", "normal");
  doc.text(
    `Generated on ${new Date().toLocaleDateString("en-US")} — Student Academic Progress Report`,
    pageW / 2,
    pageH - 8,
    { align: "center" },
  );

  return doc.output("arraybuffer");
}

/* ── Bulk Class Report PDF ────────────────────────────────────────── */

async function generateClassReportPDF(
  yearKey: string,
  classCode: string,
  school: string,
): Promise<ArrayBuffer> {
  const supabase = createServiceClient();
  // Fetch browse index for the year
  const { data: indexData } = await supabase
    .from("parent_config")
    .select("*")
    .eq("id", `browse_${yearKey}`)
    .maybeSingle();

  if (!indexData) throw new Error("No browse index for this year");

  // browse_{year} stores data in buckets keyed by "classCode__sectionCode__school"
  const buckets = ((indexData as Record<string, unknown>).buckets || {}) as Record<
    string,
    { sn: string; name: string; avg?: number; class?: string; section?: string }[]
  >;

  const students: { student_number: string; name: string; section_code: string; avg: number }[] = [];
  for (const [bucketKey, entries] of Object.entries(buckets)) {
    const parts = bucketKey.split("__");
    const bClass = parts[0] || "";
    const bSection = parts[1] || "";
    const bSchool = parts[2] || "";
    if (classCode && bClass !== classCode) continue;
    if (school && school !== "all" && bSchool !== school) continue;
    for (const e of entries) {
      students.push({ student_number: e.sn, name: e.name, section_code: bSection, avg: e.avg ?? 0 });
    }
  }
  students.sort((a, b) => (b.avg || 0) - (a.avg || 0));

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 15;

  let y = 15;

  // ── Title ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...PRIMARY);
  doc.text("CLASS PERFORMANCE REPORT", pageW / 2, y + 8, { align: "center" });
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(
    `Academic Year: ${formatAcademicYear(yearKey)} | Class: ${classCode || "All"} | Campus: ${school === "0021-01" ? "Boys" : school === "0021-02" ? "Girls" : "All"} | Students: ${students.length}`,
    pageW / 2,
    y + 14,
    { align: "center" },
  );
  y += 22;

  // ── Summary Stats ──
  const avgs = students.filter((s) => s.avg > 0).map((s) => s.avg);
  const classAvg = avgs.length ? (avgs.reduce((a, b) => a + b, 0) / avgs.length).toFixed(1) : "-";
  const passCount = avgs.filter((a) => a >= 60).length;
  const failCount = avgs.filter((a) => a < 60).length;

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(200);
  doc.roundedRect(margin, y, pageW - 2 * margin, 16, 2, 2, "FD");

  const statsArr = [
    `Total Students: ${students.length}`,
    `Class Avg: ${classAvg}`,
    `Pass: ${passCount}`,
    `Fail: ${failCount}`,
    `Pass Rate: ${avgs.length ? ((passCount / avgs.length) * 100).toFixed(0) : 0}%`,
  ];
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(60);
  const statW = (pageW - 2 * margin) / statsArr.length;
  for (let i = 0; i < statsArr.length; i++) {
    doc.text(statsArr[i], margin + i * statW + statW / 2, y + 10, { align: "center" });
  }
  y += 22;

  // ── Student Table ──
  const body = students.map((s, i) => [
    (i + 1).toString(),
    s.student_number,
    s.name,
    s.section_code || "-",
    s.avg?.toFixed(1) || "-",
    s.avg ? (s.avg >= 60 ? "Pass" : "Fail") : "-",
  ]);

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    tableWidth: pageW - 2 * margin,
    head: [["#", "Student ID", "Name", "Section", "Average", "Status"]],
    body,
    styles: {
      fontSize: 8,
      cellPadding: 2,
      lineColor: [220, 220, 220],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: HEADER_BG,
      textColor: [255, 255, 255],
      fontStyle: "bold",
      halign: "center",
    },
    columnStyles: {
      0: { halign: "center", cellWidth: 10 },
      1: { halign: "center", cellWidth: 25 },
      2: { halign: "left" },
      3: { halign: "center", cellWidth: 20 },
      4: { halign: "center", cellWidth: 20 },
      5: { halign: "center", cellWidth: 18 },
    },
    alternateRowStyles: { fillColor: ALT_ROW },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 5) {
        const status = data.cell.raw as string;
        data.cell.styles.textColor = status === "Pass" ? GREEN : status === "Fail" ? RED : [80, 80, 80];
        data.cell.styles.fontStyle = "bold";
      }
      if (data.section === "body" && data.column.index === 4) {
        const g = parseFloat(data.cell.raw as string);
        if (!isNaN(g)) {
          data.cell.styles.textColor = g >= 60 ? GREEN : RED;
        }
      }
    },
  });

  // ── Footer ──
  doc.setFontSize(7);
  doc.setTextColor(150);
  doc.setFont("helvetica", "normal");
  doc.text(
    `Generated on ${new Date().toLocaleDateString("en-US")} — Class Performance Report`,
    pageW / 2,
    287,
    { align: "center" },
  );

  return doc.output("arraybuffer");
}

/* ── Progress Report PDF ──────────────────────────────────────────── */

async function generateProgressReportPDF(
  studentNumber: string,
  year: string,
  month?: string,
): Promise<ArrayBuffer> {
  const supabase = createServiceClient();
  // Fetch student info
  const { data: studentData } = await supabase
    .from("student_progress")
    .select("*")
    .or(`id.eq.${studentNumber.trim()},student_number.eq.${studentNumber.trim()}`)
    .maybeSingle();
  const studentPayload = (studentData?.data as Record<string, unknown> | undefined) ?? (studentData as Record<string, unknown> | null);
  const yearsMap = (studentPayload?.years as Record<string, Record<string, unknown>> | undefined) ?? {};
  const studentName = String((studentPayload?.student_name as string | undefined) || studentNumber);
  const yearData = yearsMap[year] || {};
  const className = yearData.class_name || "";
  const sectionName = yearData.section_name || "";

  // Fetch progress reports
  let q = supabase
    .from("progress_reports")
    .select("*")
    .eq("student_number", studentNumber)
    .eq("academic_year", year);
  if (month) q = q.eq("month", month);
  const { data: progressRows } = await q;

  interface PREntry {
    subject: string;
    month: string;
    term: string;
    academic_performance: string;
    homework_effort: string;
    participation: string;
    conduct: string;
    notes?: string;
  }
  const entries: PREntry[] = (progressRows ?? []) as PREntry[];

  // Group by month
  const MONTH_ORDER = [
    "September","October","November","December","January",
    "February","March","April","May",
  ];
  const grouped: Record<string, PREntry[]> = {};
  for (const e of entries) {
    (grouped[e.month] = grouped[e.month] || []).push(e);
  }
  const orderedMonths = MONTH_ORDER.filter((m) => grouped[m]);

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  let yPos = 15;

  // Header
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Progress Report", pageW / 2, yPos, { align: "center" });
  yPos += 7;
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text(`AY 20${year}`, pageW / 2, yPos, { align: "center" });
  yPos += 10;

  // Student info row
  doc.setFontSize(10);
  doc.text(`Name: ${studentName}`, 14, yPos);
  doc.text(`Grade: ${className}`, pageW / 2, yPos);
  yPos += 5;
  doc.text(`Section: ${sectionName}`, 14, yPos);
  if (month) doc.text(`Month: ${month}`, pageW / 2, yPos);
  yPos += 8;

  // Table per month
  for (const m of orderedMonths) {
    if (yPos > 260) {
      doc.addPage();
      yPos = 15;
    }

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(`${m} — ${grouped[m][0]?.term || ""}`, 14, yPos);
    yPos += 2;

    const rows = grouped[m].map((r) => [
      r.subject,
      r.academic_performance,
      r.homework_effort,
      r.participation,
      r.conduct,
      r.notes || "",
    ]);

    autoTable(doc, {
      startY: yPos,
      head: [["Subject", "Academic Performance", "Homework", "Participation", "Conduct", "Notes"]],
      body: rows,
      theme: "grid",
      headStyles: {
        fillColor: [37, 99, 235],
        textColor: 255,
        fontSize: 8,
        fontStyle: "bold",
      },
      bodyStyles: { fontSize: 7.5, cellPadding: 2 },
      columnStyles: {
        0: { cellWidth: 28 },
        1: { cellWidth: 38 },
        5: { cellWidth: 30 },
      },
      margin: { left: 14, right: 14 },
    });

    yPos = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  }

  if (orderedMonths.length === 0) {
    doc.setFontSize(11);
    doc.text("No progress reports available.", pageW / 2, yPos + 20, { align: "center" });
  }

  return doc.output("arraybuffer");
}

/* ── Subject Performance Report PDF ──────────────────────────────── */

async function generateSubjectPerformancePDF(
  yearKey: string,
  classCode: string,
  sectionCode: string,
  school: string,
): Promise<ArrayBuffer> {
  const supabase = createServiceClient();
  // 1. Load browse index to get student list
  const { data: indexData } = await supabase
    .from("parent_config")
    .select("*")
    .eq("id", `browse_${yearKey}`)
    .maybeSingle();
  if (!indexData) throw new Error("No browse index for this year");

  // browse_{year} stores data in buckets keyed by "classCode__sectionCode__school"
  const browseStudents: { student_number: string; class_code: string; section_code: string; school: string }[] = [];
  const buckets = ((indexData as Record<string, unknown>).buckets || {}) as Record<string, { sn: string }[]>;
  for (const [bucketKey, entries] of Object.entries(buckets)) {
    const parts = bucketKey.split("__");
    const bClass = parts[0] || "";
    const bSection = parts[1] || "";
    const bSchool = parts[2] || "";
    if (classCode && bClass !== classCode) continue;
    if (sectionCode && bSection !== sectionCode) continue;
    if (school && school !== "all" && bSchool !== school) continue;
    for (const e of entries) {
      browseStudents.push({ student_number: e.sn, class_code: bClass, section_code: bSection, school: bSchool });
    }
  }

  if (browseStudents.length === 0) throw new Error("No students found for the selected filters");

  // 2. Batch-fetch student_progress rows (chunks of 100)
  const CHUNK = 100;
  const allRows: Record<string, unknown>[] = [];
  for (let i = 0; i < browseStudents.length; i += CHUNK) {
    const sns = browseStudents.slice(i, i + CHUNK).map((s) => s.student_number);
    const { data: rowsByStudent } = await supabase
      .from("student_progress")
      .select("*")
      .in("student_number", sns);
    const { data: rowsById } = await supabase
      .from("student_progress")
      .select("*")
      .in("id", sns);
    allRows.push(...(rowsByStudent || []), ...(rowsById || []));
  }

  // 3. Aggregate per subject per term
  const TERM_KEYS = ["t1_assess", "t1_final", "sem1", "t2_assess", "t2_final", "sem2", "annual"];
  const TERM_SHORT: Record<string, string> = {
    t1_assess: "T1 Assess", t1_final: "T1 Final", sem1: "Sem 1",
    t2_assess: "T2 Assess", t2_final: "T2 Final", sem2: "Sem 2",
    annual: "Annual",
  };

  // subjectData: subject → termKey → {sum, count}
  const subjectData = new Map<string, Record<string, { sum: number; count: number }>>();

  for (const row of allRows) {
    const payload = (row.data as Record<string, unknown> | undefined) ?? row;
    const years = (payload.years as Record<string, YearData> | undefined) ?? {};
    const yearData = years[yearKey];
    if (!yearData) continue;
    const terms = (yearData.terms || {}) as Record<string, { subjects?: { subject: string; grade: number }[] }>;

    for (const termKey of TERM_KEYS) {
      const termSubjects = terms[termKey]?.subjects;
      if (!termSubjects) continue;
      for (const s of termSubjects) {
        if (!s.subject || s.grade === undefined) continue;
        if (!subjectData.has(s.subject)) subjectData.set(s.subject, {});
        const entry = subjectData.get(s.subject)!;
        if (!entry[termKey]) entry[termKey] = { sum: 0, count: 0 };
        entry[termKey].sum += s.grade;
        entry[termKey].count++;
      }
    }
  }

  if (subjectData.size === 0) throw new Error("No grade data found for the selected class/section");

  // 4. Determine which terms actually have data
  const termHasData = TERM_KEYS.filter((tk) => {
    for (const termMap of subjectData.values()) {
      if ((termMap[tk]?.count ?? 0) > 0) return true;
    }
    return false;
  });

  const sortedSubjects = Array.from(subjectData.keys()).sort();

  // 5. Build PDF
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 12;
  let y = 14;

  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...PRIMARY);
  doc.text("SUBJECT PERFORMANCE ANALYSIS", pageW / 2, y, { align: "center" });
  y += 7;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(60);
  const campusLabel = school === "0021-01" ? "Boys" : school === "0021-02" ? "Girls" : "All";
  const sectionLabel = sectionCode ? ` · Section ${sectionCode}` : "";
  doc.text(
    `Academic Year: ${formatAcademicYear(yearKey)} | Class: ${classCode || "All"}${sectionLabel} | Campus: ${campusLabel} | Students: ${browseStudents.length}`,
    pageW / 2, y, { align: "center" },
  );
  y += 3;

  // Legend
  doc.setFontSize(7);
  doc.setTextColor(100);
  doc.text("Values represent class average per subject per assessment. Green ≥ 60 | Red < 60", pageW / 2, y + 4, { align: "center" });
  y += 9;

  // Table headers
  const headers = ["Subject", ...termHasData.map((tk) => TERM_SHORT[tk]), "n"];

  // Build rows
  const body: string[][] = [];
  const termTotals: Record<string, { sum: number; count: number }> = {};

  for (const subj of sortedSubjects) {
    const termMap = subjectData.get(subj)!;
    const row: string[] = [subj];
    for (const tk of termHasData) {
      const agg = termMap[tk];
      if (agg && agg.count > 0) {
        const avg = agg.sum / agg.count;
        row.push(avg.toFixed(1));
        if (!termTotals[tk]) termTotals[tk] = { sum: 0, count: 0 };
        termTotals[tk].sum += avg;
        termTotals[tk].count++;
      } else {
        row.push("—");
      }
    }
    // n = max student count seen across any term for this subject
    const maxN = Math.max(...termHasData.map((tk) => termMap[tk]?.count ?? 0));
    row.push(maxN > 0 ? String(maxN) : "—");
    body.push(row);
  }

  // Class-average summary row
  const avgRow: string[] = ["Class Average"];
  for (const tk of termHasData) {
    const agg = termTotals[tk];
    avgRow.push(agg && agg.count > 0 ? (agg.sum / agg.count).toFixed(1) : "—");
  }
  avgRow.push(String(browseStudents.length));
  body.push(avgRow);
  const avgRowIndex = body.length - 1;

  // Column styles
  const colStyles: Record<number, Partial<{ halign: "left" | "center" | "right"; cellWidth: number | "auto" }>> = {
    0: { halign: "left", cellWidth: "auto" },
    [termHasData.length + 1]: { halign: "center", cellWidth: 10 }, // n column
  };
  for (let i = 1; i <= termHasData.length; i++) {
    colStyles[i] = { halign: "center", cellWidth: 20 };
  }

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    tableWidth: pageW - 2 * margin,
    head: [headers],
    body,
    styles: {
      fontSize: 8,
      cellPadding: 2.2,
      lineColor: [220, 220, 220],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: HEADER_BG,
      textColor: [255, 255, 255],
      fontStyle: "bold",
      halign: "center",
      fontSize: 8,
    },
    columnStyles: colStyles,
    alternateRowStyles: { fillColor: ALT_ROW },
    didParseCell: (data) => {
      if (data.section !== "body") return;
      // Style the class-average summary row
      if (data.row.index === avgRowIndex) {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = [225, 235, 248];
      }
      // Color-code grade columns (not subject name or n count)
      if (data.column.index >= 1 && data.column.index <= termHasData.length) {
        const g = parseFloat(data.cell.raw as string);
        if (!isNaN(g)) {
          data.cell.styles.textColor = g >= 60 ? GREEN : RED;
        }
      }
    },
  });

  // Footer
  doc.setFontSize(7);
  doc.setTextColor(150);
  doc.text(
    `Generated on ${new Date().toLocaleDateString("en-US")} — Subject Performance Analysis`,
    pageW / 2, pageH - 8, { align: "center" },
  );

  return doc.output("arraybuffer");
}

/* ── Performance Suggestion (rule-based AI) ──────────────────────── */

function generatePerformanceSuggestion(
  studentName: string,
  overallAvg: number,
  subjects: Array<{ name: string; avg: number; sem1?: number; sem2?: number; hasFailingAssessments?: boolean; t2QuizAvg?: number; t2HasFail?: boolean }>,
  sem1Avg: number,
  sem2Avg: number,
): string[] {
  const withGrades = subjects.filter((s) => s.avg > 0);
  const sorted = [...withGrades].sort((a, b) => b.avg - a.avg);
  const isYearComplete = sem2Avg > 0;

  const level =
    overallAvg >= 90 ? "outstanding"
    : overallAvg >= 80 ? "strong"
    : overallAvg >= 70 ? "good"
    : overallAvg >= 60 ? "satisfactory"
    : "below the passing standard";

  const paragraphs: string[] = [];

  // ── Opening sentence ──────────────────────────────────────────────
  let opening: string;
  if (isYearComplete) {
    opening = `${studentName} completed the academic year with a ${level} overall average of ${overallAvg.toFixed(1)}/100.`;
    const diff = sem2Avg - sem1Avg;
    if (Math.abs(diff) < 1.5) {
      opening += ` Performance was consistent across both semesters (Sem\u00A01: ${sem1Avg.toFixed(1)}, Sem\u00A02: ${sem2Avg.toFixed(1)}).`;
    } else if (diff > 0) {
      opening += ` A positive improvement was recorded from Semester\u00A01 (${sem1Avg.toFixed(1)}) to Semester\u00A02 (${sem2Avg.toFixed(1)}).`;
    } else {
      opening += ` A decline was noted from Semester\u00A01 (${sem1Avg.toFixed(1)}) to Semester\u00A02 (${sem2Avg.toFixed(1)}) \u2014 reviewing and addressing the contributing factors is advised.`;
    }
  } else {
    opening = `${studentName} has recorded a ${level} average of ${overallAvg.toFixed(1)}/100 based on Semester\u00A01 data. Term\u00A02 results are pending.`;
  }

  const topTwo = sorted.slice(0, 2).filter((s) => s.avg >= 70);
  if (topTwo.length >= 2) {
    opening += ` Relatively stronger performance was observed in ${topTwo[0].name} (${topTwo[0].avg.toFixed(1)}) and ${topTwo[1].name} (${topTwo[1].avg.toFixed(1)}).`;
  } else if (topTwo.length === 1) {
    opening += ` The strongest result was in ${topTwo[0].name} (${topTwo[0].avg.toFixed(1)}).`;
  }
  paragraphs.push(opening);

  // ── Per-subject recommendations ────────────────────────────────────
  const concerningSubjects = withGrades.filter(
    (s) => s.avg < 60 || s.hasFailingAssessments === true || s.t2HasFail === true,
  );

  if (concerningSubjects.length > 0) {
    paragraphs.push("Recommended focus areas:");
    for (const s of concerningSubjects) {
      let rec = `\u2022 ${s.name} (avg: ${s.avg.toFixed(1)}): `;
      if (s.avg < 60) {
        rec += `This subject is below the minimum passing grade and requires urgent intervention. The student should attend extra sessions, complete all outstanding work, and request one-on-one support from the subject teacher immediately.`;
      } else if (s.t2HasFail && s.t2QuizAvg !== undefined && s.avg < 70) {
        rec += `Term\u00A02 assessment scores are critically low (avg: ${s.t2QuizAvg.toFixed(1)}) and the semester average is borderline. Intensive revision of Term\u00A02 topics and additional practice before the final exam are essential.`;
      } else if (s.t2HasFail && s.t2QuizAvg !== undefined) {
        rec += `Term\u00A02 assessment scores include marks below 60 (avg: ${s.t2QuizAvg.toFixed(1)}). The student should identify the weak topics covered in Term\u00A02, review class notes thoroughly, and seek clarification from the teacher to prevent the gap from widening.`;
      } else if (s.hasFailingAssessments) {
        rec += `Some assessment quiz scores fall below 60. Regular review of class material, practising past assessments, and requesting teacher feedback will help build stronger understanding and prevent cumulative gaps from forming.`;
      }
      paragraphs.push(rec);
    }
  } else if (isYearComplete) {
    paragraphs.push("The student has met the passing standard in all subjects for the full academic year. Continued effort is encouraged to maintain and improve these results.");
  } else {
    paragraphs.push("All recorded semester grades are currently at or above the passing standard.");
  }

  // ── Closing recommendation ─────────────────────────────────────────
  let closing: string;
  if (overallAvg >= 85) {
    closing = "We encourage the student to maintain this level of excellence and explore enrichment activities to further develop academic potential.";
  } else if (overallAvg >= 70) {
    closing = "Maintaining a consistent study routine, active class participation, and focused revision in areas of difficulty will support continued growth.";
  } else if (overallAvg >= 60) {
    closing = "A structured daily study plan, regular review of class notes, and proactive consultation with subject teachers are strongly recommended to strengthen overall performance.";
  } else {
    closing = "Intensive academic support, a personalised improvement plan, and close coordination between the student\u2019s parents and subject teachers are strongly recommended to reach the required academic standards.";
  }
  paragraphs.push(closing);

  return paragraphs;
}

/* ── Subject-level suggestion (rule-based AI) ───────────────────── */

function generateSubjectSuggestion(
  subjName: string,
  annual: number | undefined,
  sem1: number | undefined,
  sem2: number | undefined,
  quizGradesT1: number[],
  quizGradesT2: number[],
): string {
  const avg = annual ?? (
    sem1 !== undefined && sem2 !== undefined ? (sem1 + sem2) / 2 :
    sem1 !== undefined ? sem1 :
    sem2 !== undefined ? sem2 : undefined
  );
  if (avg === undefined) return "";

  let text = "";
  if (avg >= 90) text = `Outstanding achievement in ${subjName} (${avg.toFixed(1)}).`;
  else if (avg >= 80) text = `Strong performance in ${subjName} (${avg.toFixed(1)}).`;
  else if (avg >= 70) text = `Good performance in ${subjName} (${avg.toFixed(1)}).`;
  else if (avg >= 60) text = `Satisfactory results in ${subjName} (${avg.toFixed(1)}).`;
  else text = `Below passing grade in ${subjName} (${avg.toFixed(1)}) \u2014 urgent improvement is needed.`;

  if (sem1 !== undefined && sem2 !== undefined) {
    const diff = sem2 - sem1;
    if (diff > 4) text += ` Improved significantly from Sem\u00A01 (${sem1.toFixed(1)}) to Sem\u00A02 (${sem2.toFixed(1)}).`;
    else if (diff > 1.5) text += ` Showed improvement from Sem\u00A01 (${sem1.toFixed(1)}) to Sem\u00A02 (${sem2.toFixed(1)}).`;
    else if (diff < -4) text += ` Declined sharply from Sem\u00A01 (${sem1.toFixed(1)}) to Sem\u00A02 (${sem2.toFixed(1)}) \u2014 additional support is recommended.`;
    else if (diff < -1.5) text += ` Slight decline from Sem\u00A01 (${sem1.toFixed(1)}) to Sem\u00A02 (${sem2.toFixed(1)}).`;
    else text += ` Consistent performance across both semesters.`;
  } else if (sem2 !== undefined && sem1 === undefined) {
    // Only Term 2 available — note it without implying T1 was skipped
    text += ` Term\u00A02 result recorded (${sem2.toFixed(1)}).`;
  }

  // Term 1 quiz analysis
  if (quizGradesT1.length > 0) {
    const t1Avg = quizGradesT1.reduce((a, b) => a + b, 0) / quizGradesT1.length;
    const t1HasFail = quizGradesT1.some((g) => g < 60);
    if (t1HasFail && t1Avg < 60) {
      text += ` Term\u00A01 assessment marks are below passing (avg: ${t1Avg.toFixed(1)}) \u2014 focused revision and extra support are needed.`;
    } else if (t1HasFail) {
      text += ` Some Term\u00A01 assessment marks are below 60 \u2014 targeted revision is recommended.`;
    } else if (quizGradesT1.length >= 2) {
      const first = quizGradesT1[0];
      const last = quizGradesT1[quizGradesT1.length - 1];
      if (last - first > 8) text += ` Progressive improvement across Term\u00A01 assessments (avg: ${t1Avg.toFixed(1)}).`;
      else if (first - last > 8) text += ` Declining trend in Term\u00A01 assessments (avg: ${t1Avg.toFixed(1)}) \u2014 revision is recommended.`;
      else text += ` Steady Term\u00A01 assessment performance (avg: ${t1Avg.toFixed(1)}).`;
    } else {
      text += ` Term\u00A01 assessment result: ${quizGradesT1[0].toFixed(1)}.`;
    }
  }

  // Term 2 quiz analysis — always run if any T2 data exists
  if (quizGradesT2.length > 0) {
    const t2Avg = quizGradesT2.reduce((a, b) => a + b, 0) / quizGradesT2.length;
    const t2HasFail = quizGradesT2.some((g) => g < 60);
    if (t2HasFail && t2Avg < 60) {
      text += ` Term\u00A02 assessment results are below passing (avg: ${t2Avg.toFixed(1)}) \u2014 urgent intervention and focused revision are strongly recommended.`;
    } else if (t2HasFail) {
      text += ` Some Term\u00A02 assessment marks are below 60 \u2014 additional practice is advised before the final exam.`;
    } else if (quizGradesT2.length >= 2) {
      const first = quizGradesT2[0];
      const last = quizGradesT2[quizGradesT2.length - 1];
      if (last - first > 8) text += ` Positive progress across Term\u00A02 quizzes.`;
      else if (first - last > 8) text += ` Declining results in Term\u00A02 quizzes \u2014 additional practice is advised.`;
      else text += ` Steady performance across Term\u00A02 quizzes.`;
    } else {
      // Single T2 quiz, all passing
      text += ` Term\u00A02 assessment result: ${quizGradesT2[0].toFixed(1)}.`;
    }
  }

  if (avg < 60) text += ` Immediate remedial action and targeted support are strongly recommended.`;
  else if (avg < 70) text += ` Regular practice and teacher guidance will help strengthen results.`;

  return text;
}

/* ── Student Progress Detail Report ─────────────────────────────── */

async function generateStudentProgressDetailPDF(
  studentNumber: string,
  yearKey: string,
  settings: TranscriptSettings | null,
): Promise<ArrayBuffer> {
  void settings; // reserved for future logo use

  const supabase = createServiceClient();

  // Use cached reference tables (raw_Subject + raw_tbl_Quiz) — avoids re-reading on every report
  const [{ subjectMap, nameToCode, quizDescMap }, quizGradesRes, progressRes] = await Promise.all([
    getRefTables(),
    supabase
      .from("raw_tbl_Quiz_Grades")
      .select("*")
      .eq("Student_Number", studentNumber)
      .eq("Academic_Year", yearKey),
    supabase
      .from("student_progress")
      .select("*")
      .or(`id.eq.${studentNumber},student_number.eq.${studentNumber}`)
      .maybeSingle(),
  ]);

  // Group quiz grades: Subject_Code → Exam_Code → entries
  type QuizEntry = { quizCode: string; quizDesc: string; grade: number };
  const gradesBySubject: Record<string, Record<string, QuizEntry[]>> = {};
  (quizGradesRes.data || []).forEach((data: Record<string, unknown>) => {
    const subjCode = String(data.Subject_Code ?? "").trim();
    const examCode = String(data.Exam_Code ?? "").padStart(2, "0");
    const quizCode = String(data.Quiz_Code ?? "").trim();
    const grade = parseFloat(String(data.Grade ?? ""));
    if (!subjCode || !examCode || !quizCode || isNaN(grade)) return;
    if (!gradesBySubject[subjCode]) gradesBySubject[subjCode] = {};
    if (!gradesBySubject[subjCode][examCode]) gradesBySubject[subjCode][examCode] = [];
    gradesBySubject[subjCode][examCode].push({
      quizCode,
      quizDesc: quizDescMap[quizCode] || quizCode,
      grade,
    });
  });

  // Student progress data
  const progressData = ((progressRes.data?.data as StudentData | undefined) || (progressRes.data as unknown as StudentData | undefined));
  const yearData = progressData?.years?.[yearKey];
  const terms: Record<string, TermData> = (yearData?.terms as Record<string, TermData>) || {};

  // Subject name → term key → grade (from student_progress — authoritative totals)
  const termGradesByName: Record<string, Record<string, number>> = {};
  for (const [termKey, termData] of Object.entries(terms)) {
    for (const s of termData.subjects ?? []) {
      if (!termGradesByName[s.subject]) termGradesByName[s.subject] = {};
      termGradesByName[s.subject][termKey] = s.grade;
    }
  }

  // Collect all subject names
  const allSubjectNames = new Set<string>();
  for (const td of Object.values(terms)) {
    for (const s of td.subjects ?? []) allSubjectNames.add(s.subject);
  }
  for (const code of Object.keys(gradesBySubject)) {
    allSubjectNames.add(subjectMap[code] || code);
  }

  // ── PDF setup (LANDSCAPE A4) ──────────────────────────────────────
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = 297;
  const pageH = 210;
  const mL = 12;
  const mR = 12;
  const cW = pageW - mL - mR; // 273mm
  const COLG = 5;              // gap between T1 and T2 columns
  const colW = (cW - COLG) / 2; // ~134mm per column
  const col1X = mL;
  const col2X = mL + colW + COLG;
  const FIRST_H = 30;
  const CONT_H = 10;
  const FOOTER_H = 8;
  const SUBJ_H = 11;
  const SECT_H = 6.5;
  const QUIZ_H = 6;
  const TOT_H = 7;
  const SEM_H = 8.5;
  const ANN_H = 9;
  const SUGG_LINE_H = 5.2;
  const GAP = 5;

  const studentName = progressData?.student_name || "Unknown Student";
  const className = yearData?.class_name || yearData?.class_code || "";
  const sectionCode = yearData?.section_code || "";
  const overallAvg = typeof yearData?.overall_avg === "number" ? yearData.overall_avg : 0;
  const rank = yearData?.rank ?? null;
  const classSize = yearData?.class_size ?? null;

  const drawFirstHeader = () => {
    doc.setFillColor(PRIMARY[0], PRIMARY[1], PRIMARY[2]);
    doc.rect(0, 0, pageW, FIRST_H, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("Student Progress Report", pageW / 2, 11, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    doc.text(studentName, pageW / 2, 18.5, { align: "center" });
    doc.setFontSize(8.5);
    doc.text(
      `ID: ${studentNumber}  \u00B7  Class: ${className}  \u00B7  Section: ${sectionCode}  \u00B7  Year: ${formatAcademicYear(yearKey)}`,
      pageW / 2, 24, { align: "center" },
    );
    const rankStr = rank != null ? `  \u00B7  Rank: ${rank}${classSize ? "/" + classSize : ""}` : "";
    doc.text(`Overall Average: ${overallAvg.toFixed(1)}${rankStr}`, pageW / 2, 29, { align: "center" });
    doc.setTextColor(0, 0, 0);
  };

  const drawContHeader = () => {
    doc.setFillColor(PRIMARY[0], PRIMARY[1], PRIMARY[2]);
    doc.rect(0, 0, pageW, CONT_H, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text(
      `Student Progress  \u00B7  ${studentName}  \u00B7  ${formatAcademicYear(yearKey)}`,
      pageW / 2, 6.8, { align: "center" },
    );
    doc.setTextColor(0, 0, 0);
  };

  drawFirstHeader();
  let y = FIRST_H + 4;

  // ── Two-column row helpers ─────────────────────────────────────────
  type PRow = { type: "sect" | "quiz" | "total" | "semester"; label: string; grade?: number };
  const rowH = (r: PRow) =>
    r.type === "sect" ? SECT_H
    : r.type === "quiz" ? QUIZ_H
    : r.type === "total" ? TOT_H
    : SEM_H;
  const colBlockH = (rows: PRow[]) => rows.reduce((s, r) => s + rowH(r), 0);

  const drawColumn = (rows: PRow[], cx: number, startY: number) => {
    let cy = startY;
    let alt = false;
    for (const r of rows) {
      const h = rowH(r);
      if (r.type === "sect") {
        doc.setFillColor(220, 232, 250);
        doc.rect(cx, cy, colW, h, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(PRIMARY[0], PRIMARY[1], PRIMARY[2]);
        doc.text(r.label, cx + 3, cy + h - 1.8);
        doc.setTextColor(0, 0, 0);
        alt = false;
      } else if (r.type === "quiz") {
        if (alt) {
          doc.setFillColor(ALT_ROW[0], ALT_ROW[1], ALT_ROW[2]);
          doc.rect(cx, cy, colW, h, "F");
        }
        alt = !alt;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(55, 55, 55);
        doc.text(r.label, cx + 6, cy + h - 1.7);
        if (r.grade !== undefined) {
          const tc: [number, number, number] = r.grade >= 60 ? [50, 50, 50] : RED;
          doc.setTextColor(tc[0], tc[1], tc[2]);
          doc.text(r.grade.toFixed(1), cx + colW - 1.5, cy + h - 1.7, { align: "right" });
          doc.setTextColor(0, 0, 0);
        }
      } else if (r.type === "total") {
        alt = false;
        doc.setFillColor(244, 247, 252);
        doc.rect(cx, cy, colW, h, "F");
        doc.setDrawColor(200, 215, 235);
        doc.setLineWidth(0.2);
        doc.line(cx, cy, cx + colW, cy);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8.5);
        doc.setTextColor(40, 40, 40);
        doc.text(r.label, cx + 4, cy + h - 2);
        if (r.grade !== undefined) {
          const tc: [number, number, number] = r.grade >= 60 ? [40, 40, 40] : RED;
          doc.setTextColor(tc[0], tc[1], tc[2]);
          doc.text(r.grade.toFixed(1), cx + colW - 1.5, cy + h - 2, { align: "right" });
          doc.setTextColor(0, 0, 0);
        }
      } else { // semester
        alt = false;
        doc.setFillColor(215, 232, 255);
        doc.rect(cx, cy, colW, h, "F");
        doc.setDrawColor(160, 200, 240);
        doc.setLineWidth(0.35);
        doc.line(cx, cy, cx + colW, cy);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9.5);
        doc.setTextColor(PRIMARY[0], PRIMARY[1], PRIMARY[2]);
        doc.text(r.label, cx + 4, cy + h - 2.2);
        if (r.grade !== undefined) {
          const tc: [number, number, number] = r.grade >= 60 ? PRIMARY : RED;
          doc.setTextColor(tc[0], tc[1], tc[2]);
          doc.text(r.grade.toFixed(1), cx + colW - 1.5, cy + h - 2.2, { align: "right" });
          doc.setTextColor(0, 0, 0);
        }
      }
      cy += h;
    }
    return cy;
  };

  // ── Per-subject blocks (landscape, two-column) ────────────────────
  const aiSubjects: Array<{ name: string; avg: number; sem1?: number; sem2?: number; hasFailingAssessments?: boolean; t2QuizAvg?: number; t2HasFail?: boolean }> = [];
  const sortedSubjects = Array.from(allSubjectNames).sort();

  for (const subjName of sortedSubjects) {
    const subjCode = nameToCode[subjName];
    const quizData = subjCode ? (gradesBySubject[subjCode] ?? {}) : {};
    const tg = termGradesByName[subjName] ?? {};
    const hasData = Object.keys(quizData).length > 0 || Object.keys(tg).length > 0;
    if (!hasData) continue;

    // Build T1 row list
    const t1Rows: PRow[] = [];
    const t1Assess = [...(quizData["01"] ?? [])].sort((a, b) => a.quizCode.localeCompare(b.quizCode));
    const t1Finals = quizData["04"] ?? [];
    if (t1Assess.length > 0 || tg.t1_assess !== undefined) {
      t1Rows.push({ type: "sect", label: "Term 1  \u2014  Assessment" });
      for (const q of t1Assess) t1Rows.push({ type: "quiz", label: q.quizDesc, grade: q.grade });
      if (tg.t1_assess !== undefined) t1Rows.push({ type: "total", label: "T1 Assessment Total", grade: tg.t1_assess });
    }
    if (t1Finals.length > 0 || tg.t1_final !== undefined) {
      t1Rows.push({ type: "sect", label: "Term 1  \u2014  Final Exam" });
      for (const q of t1Finals) t1Rows.push({ type: "quiz", label: q.quizDesc, grade: q.grade });
      if (t1Finals.length === 0 && tg.t1_final !== undefined) t1Rows.push({ type: "quiz", label: "Final Exam", grade: tg.t1_final });
    }
    if (tg.sem1 !== undefined) t1Rows.push({ type: "semester", label: "Semester 1", grade: tg.sem1 });

    // Build T2 row list
    const t2Rows: PRow[] = [];
    const t2Assess = [...(quizData["06"] ?? [])].sort((a, b) => a.quizCode.localeCompare(b.quizCode));
    const t2Finals = quizData["09"] ?? [];
    if (t2Assess.length > 0 || tg.t2_assess !== undefined) {
      t2Rows.push({ type: "sect", label: "Term 2  \u2014  Assessment" });
      for (const q of t2Assess) t2Rows.push({ type: "quiz", label: q.quizDesc, grade: q.grade });
      if (tg.t2_assess !== undefined) t2Rows.push({ type: "total", label: "T2 Assessment Total", grade: tg.t2_assess });
    }
    if (t2Finals.length > 0 || tg.t2_final !== undefined) {
      t2Rows.push({ type: "sect", label: "Term 2  \u2014  Final Exam" });
      for (const q of t2Finals) t2Rows.push({ type: "quiz", label: q.quizDesc, grade: q.grade });
      if (t2Finals.length === 0 && tg.t2_final !== undefined) t2Rows.push({ type: "quiz", label: "Final Exam", grade: tg.t2_final });
    }
    if (tg.sem2 !== undefined) t2Rows.push({ type: "semester", label: "Semester 2", grade: tg.sem2 });

    // Heights
    const h1 = colBlockH(t1Rows);
    const h2 = colBlockH(t2Rows);
    const colsH = Math.max(h1, h2);

    const quizT1Grades = t1Assess.map((q) => q.grade);
    const quizT2Grades = t2Assess.map((q) => q.grade);
    const sem1g = tg.sem1;
    const sem2g = tg.sem2;
    const annDiff = (sem2g ?? 0) - (sem1g ?? 0);
    const trend =
      sem1g !== undefined && sem2g !== undefined
        ? annDiff > 1 ? " \u2191" : annDiff < -1 ? " \u2193" : " \u2192"
        : undefined;

    const subjSugg = generateSubjectSuggestion(subjName, tg.annual, sem1g, sem2g, quizT1Grades, quizT2Grades);
    // Set font before splitting so jsPDF uses correct metrics
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    const subjSuggLines = subjSugg ? doc.splitTextToSize(subjSugg, cW - 10) : [];
    const suggBlockH = subjSuggLines.length > 0 ? 4 + 4 + subjSuggLines.length * SUGG_LINE_H + 4 + 1 + 2 : 0; // PAD+label+lines+PAD+margin
    const annH = tg.annual !== undefined ? ANN_H : 0;
    const blockH = GAP + SUBJ_H + colsH + annH + suggBlockH;

    if (y + blockH > pageH - FOOTER_H) {
      doc.addPage();
      drawContHeader();
      y = CONT_H + 4;
    }

    y += GAP;

    // Subject header bar (full width)
    doc.setFillColor(HEADER_BG[0], HEADER_BG[1], HEADER_BG[2]);
    doc.rect(mL, y, cW, SUBJ_H, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(255, 255, 255);
    doc.text(subjName.toUpperCase(), mL + 4, y + SUBJ_H - 3);
    if (tg.annual !== undefined) {
      doc.setFontSize(9);
      doc.text(
        `Annual: ${tg.annual.toFixed(1)}${trend ?? ""}`,
        pageW - mR - 2, y + SUBJ_H - 3, { align: "right" },
      );
    }
    doc.setTextColor(0, 0, 0);
    y += SUBJ_H;

    // Draw T1 (left) and T2 (right) in parallel
    const colStartY = y;
    drawColumn(t1Rows, col1X, colStartY);
    drawColumn(t2Rows, col2X, colStartY);
    y = colStartY + colsH;

    // Annual row spanning full width
    if (tg.annual !== undefined) {
      const g = tg.annual;
      const c: [number, number, number] = g >= 60 ? [210, 242, 218] : [255, 212, 212];
      doc.setFillColor(c[0], c[1], c[2]);
      doc.rect(mL, y, cW, ANN_H, "F");
      doc.setDrawColor(180, 215, 195);
      doc.setLineWidth(0.3);
      doc.line(mL, y, mL + cW, y);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      const tc = g >= 60 ? GREEN : RED;
      doc.setTextColor(tc[0], tc[1], tc[2]);
      doc.text(`Annual Total${trend ?? ""}`, mL + 4, y + ANN_H - 2.5);
      doc.text(g.toFixed(1), pageW - mR - 2, y + ANN_H - 2.5, { align: "right" });
      doc.setTextColor(0, 0, 0);
      y += ANN_H;
    }

    // Per-subject Remarks and Suggestions
    if (subjSuggLines.length > 0) {
      y += 3;
      const PAD = 4; // inner padding all sides
      const suggH = PAD + subjSuggLines.length * SUGG_LINE_H + PAD + 1;
      doc.setFillColor(248, 252, 255);
      doc.rect(mL, y, cW, suggH, "F");
      doc.setDrawColor(210, 225, 248);
      doc.setLineWidth(0.2);
      doc.rect(mL, y, cW, suggH);
      // Label
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(PRIMARY[0], PRIMARY[1], PRIMARY[2]);
      doc.text("Remarks and Suggestions:", mL + PAD, y + PAD + 3.5);
      // Text below label
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(50, 50, 50);
      let sy = y + PAD + 3.5 + SUGG_LINE_H;
      for (const line of subjSuggLines) {
        doc.text(line, mL + PAD, sy);
        sy += SUGG_LINE_H;
      }
      doc.setTextColor(0, 0, 0);
      y += suggH + 2;
    }

    const annualAvg = tg.annual ?? (sem1g !== undefined && sem2g !== undefined ? (sem1g + sem2g) / 2 : (sem1g ?? sem2g ?? 0));
    const hasFailingAssessments = quizT1Grades.some((g) => g < 60) || quizT2Grades.some((g) => g < 60);
    const t2QuizAvg = quizT2Grades.length > 0 ? quizT2Grades.reduce((a, b) => a + b, 0) / quizT2Grades.length : undefined;
    const t2HasFail = quizT2Grades.length > 0 ? quizT2Grades.some((g) => g < 60) : undefined;
    aiSubjects.push({ name: subjName, avg: annualAvg, sem1: sem1g, sem2: sem2g, hasFailingAssessments, t2QuizAvg, t2HasFail });
  }

  // ── General AI Suggestion ──────────────────────────────────────────
  const sem1Avg = terms.sem1?.avg ?? 0;
  const sem2Avg = terms.sem2?.avg ?? 0;
  const generalParas = generatePerformanceSuggestion(studentName, overallAvg, aiSubjects, sem1Avg, sem2Avg);
  // Set font before splitting so jsPDF uses correct character metrics
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const PARA_GAP = 2.5; // vertical gap between paragraphs in the general box
  const generalWrapped = generalParas.map((p) => doc.splitTextToSize(p, cW - 14));
  const totalBodyLines = generalWrapped.reduce((s, lines) => s + lines.length, 0);
  const disclaimerText = "* This analysis is automatically generated based on academic data and is intended as a supplementary tool for educators and parents.";
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7);
  const discLines = doc.splitTextToSize(disclaimerText, cW - 6);
  const generalBlockH = 15 + totalBodyLines * 5.8 + (generalWrapped.length - 1) * PARA_GAP + 8 + discLines.length * 4.5;

  if (y + 12 + generalBlockH > pageH - FOOTER_H) {
    doc.addPage();
    drawContHeader();
    y = CONT_H + 4;
  }

  y += 8;

  doc.setFillColor(PRIMARY[0], PRIMARY[1], PRIMARY[2]);
  doc.rect(0, y, pageW, 11, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text("General Performance Analysis  \u00B7  Remarks and Suggestions", pageW / 2, y + 7.5, { align: "center" });
  doc.setTextColor(0, 0, 0);
  y += 15;

  const GPAD = 5; // inner padding for general box
  const LINE_H = 5.8;
  const DISC_H = 4.5;
  // Full box height: top pad + body lines + paragraph gaps + gap + disc lines + bottom pad
  const genBoxH = GPAD + totalBodyLines * LINE_H + (generalWrapped.length - 1) * PARA_GAP + 4 + discLines.length * DISC_H + GPAD;

  doc.setFillColor(248, 250, 254);
  doc.rect(mL, y, cW, genBoxH, "F");
  doc.setDrawColor(200, 218, 240);
  doc.setLineWidth(0.4);
  doc.rect(mL, y, cW, genBoxH);

  // Body text — draw each paragraph, with a small gap between them
  let gy = y + GPAD;
  doc.setFontSize(9);
  doc.setTextColor(40, 40, 40);
  for (let pi = 0; pi < generalWrapped.length; pi++) {
    const lines = generalWrapped[pi];
    const isHeading = generalParas[pi] === "Recommended focus areas:";
    const isBullet = generalParas[pi].startsWith("\u2022");
    if (isHeading) {
      doc.setFont("helvetica", "bold");
    } else {
      doc.setFont("helvetica", "normal");
    }
    const xOffset = isBullet ? mL + GPAD + 2 : mL + GPAD;
    for (const line of lines) {
      if (gy + 6 > pageH - FOOTER_H) { doc.addPage(); drawContHeader(); gy = CONT_H + GPAD; }
      doc.text(line, xOffset, gy);
      gy += LINE_H;
    }
    if (pi < generalWrapped.length - 1) gy += PARA_GAP;
  }

  // Disclaimer inside box
  gy += 3;
  doc.setFontSize(7);
  doc.setTextColor(140, 140, 140);
  doc.setFont("helvetica", "italic");
  for (const dl of discLines) {
    if (gy + 5 > pageH - FOOTER_H) break;
    doc.text(dl, mL + GPAD, gy);
    gy += DISC_H;
  }

  y = gy + GPAD;

  // ── Footer on every page ───────────────────────────────────────────
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(6.5);
    doc.setTextColor(150, 150, 150);
    doc.setFont("helvetica", "normal");
    doc.text(
      `Generated ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}  \u00B7  Khaled International Schools  \u00B7  Page ${p}/${totalPages}`,
      pageW / 2, pageH - 4, { align: "center" },
    );
  }

  return doc.output("arraybuffer");
}

/* ── POST handler ─────────────────────────────────────────────────── */

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();
    const { type, studentNumber, year, years: yearList, classCode, sectionCode, school, month } = body as {
      type: "transcript" | "report_card" | "class_report" | "progress_report" | "teacher_assignment" | "subject_performance" | "student_progress_detail";
      studentNumber?: string;
      year?: string;
      years?: string[];
      classCode?: string;
      sectionCode?: string;
      school?: string;
      month?: string;
    };

    if (!type) {
      return NextResponse.json({ error: "type is required" }, { status: 400 });
    }

    // Fetch transcript settings (for logos, principal names)
    let settings: TranscriptSettings | null = null;
    try {
      const supabase = createServiceClient();
      const { data: settingsRow } = await supabase
        .from("parent_config")
        .select("*")
        .eq("id", "transcript_settings")
        .maybeSingle();
      if (settingsRow) settings = settingsRow as unknown as TranscriptSettings;
    } catch { /* continue without settings */ }

    if (type === "class_report") {
      if (!year) {
        return NextResponse.json({ error: "year is required for class_report" }, { status: 400 });
      }
      const pdfBuffer = await generateClassReportPDF(year, classCode || "", school || "all");
      return new Response(pdfBuffer, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="class_report_${year}.pdf"`,
        },
      });
    }

    if (type === "subject_performance") {
      if (!year) {
        return NextResponse.json({ error: "year is required for subject_performance" }, { status: 400 });
      }
      const pdfBuffer = await generateSubjectPerformancePDF(year, classCode || "", sectionCode || "", school || "all");
      const suffix = [classCode, sectionCode].filter(Boolean).join("_");
      return new Response(pdfBuffer, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="subject_performance_${year}${suffix ? "_" + suffix : ""}.pdf"`,
        },
      });
    }

    if (type === "teacher_assignment") {
      if (auth.role !== "super_admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (!year) {
        return NextResponse.json({ error: "year is required for teacher_assignment" }, { status: 400 });
      }

      const pdfBuffer = await generateTeacherAssignmentPDF(year, school || "all");
      const schoolSuffix = school && school !== "all" ? `_${school}` : "";
      return new Response(pdfBuffer, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="teacher_assignment_${year}${schoolSuffix}.pdf"`,
        },
      });
    }

    // Individual student reports
    if (!studentNumber) {
      return NextResponse.json({ error: "studentNumber is required" }, { status: 400 });
    }

    const supabase = createServiceClient();
    const { data: progressRow } = await supabase
      .from("student_progress")
      .select("*")
      .or(`id.eq.${studentNumber.trim()},student_number.eq.${studentNumber.trim()}`)
      .maybeSingle();
    if (!progressRow) {
      return NextResponse.json({ error: "Student not found" }, { status: 404 });
    }
    const student = ((progressRow.data as StudentData | undefined) || (progressRow as unknown as StudentData));

    if (type === "transcript") {
      const targetYears = yearList?.length
        ? yearList
        : year
          ? [year]
          : Object.keys(student.years).sort();

      const pdfBuffer = generateTranscriptPDF(student, targetYears, settings);
      return new Response(pdfBuffer, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="transcript_${studentNumber}.pdf"`,
        },
      });
    }

    if (type === "report_card") {
      if (!year) {
        return NextResponse.json({ error: "year is required for report_card" }, { status: 400 });
      }
      const pdfBuffer = generateReportCardPDF(student, year, settings);
      return new Response(pdfBuffer, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="report_card_${studentNumber}_${year}.pdf"`,
        },
      });
    }

    if (type === "progress_report") {
      if (!studentNumber || !year) {
        return NextResponse.json({ error: "studentNumber and year required" }, { status: 400 });
      }
      const pdfBuffer = await generateProgressReportPDF(studentNumber, year, month);
      return new Response(pdfBuffer, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="progress_report_${studentNumber}_${year}${month ? "_" + month : ""}.pdf"`,
        },
      });
    }

    if (type === "student_progress_detail") {
      if (!year) {
        return NextResponse.json({ error: "year is required for student_progress_detail" }, { status: 400 });
      }
      const pdfBuffer = await generateStudentProgressDetailPDF(studentNumber, year, settings);
      return new Response(pdfBuffer, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="progress_detail_${studentNumber}_${year}.pdf"`,
        },
      });
    }

    return NextResponse.json({ error: "Invalid report type" }, { status: 400 });
  } catch (err) {
    console.error("PDF generation error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to generate PDF" },
      { status: 500 },
    );
  }
}
