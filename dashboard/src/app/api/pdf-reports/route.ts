import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { verifyAuth } from "@/lib/api-auth";

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
  // Fetch browse index for the year
  const indexSnap = await adminDb
    .collection("parent_config")
    .doc(`browse_${yearKey}`)
    .get();

  if (!indexSnap.exists) throw new Error("No browse index for this year");

  const indexData = indexSnap.data() as {
    entries: { student_number: string; name: string; class_code: string; section_code: string; school: string; avg?: number }[];
  };

  let students = indexData.entries || [];
  if (classCode) students = students.filter((s) => s.class_code === classCode);
  if (school && school !== "all") students = students.filter((s) => s.school === school);
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
    `Academic Year: ${formatAcademicYear(yearKey)} | Class: ${classCode || "All"} | Campus: ${school === "0021-01" ? "Boys" : school === "0021-02" ? "Girls" : "All"}`,
    pageW / 2,
    y + 14,
    { align: "center" },
  );
  y += 22;

  // ── Summary Stats ──
  const avgs = students.filter((s) => s.avg && s.avg > 0).map((s) => s.avg!);
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
  // Fetch student info
  const studentSnap = await adminDb.collection("student_progress").doc(studentNumber.trim()).get();
  const studentData = studentSnap.exists ? studentSnap.data() : null;
  const studentName = studentData?.student_name || studentNumber;
  const yearData = studentData?.years?.[year] || {};
  const className = yearData.class_name || "";
  const sectionName = yearData.section_name || "";

  // Fetch progress reports
  let q = adminDb.collection("progress_reports")
    .where("student_number", "==", studentNumber)
    .where("academic_year", "==", year);
  if (month) q = q.where("month", "==", month);
  const snap = await q.get();

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
  const entries: PREntry[] = snap.docs.map((d) => d.data() as PREntry);

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

/* ── POST handler ─────────────────────────────────────────────────── */

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();
    const { type, studentNumber, year, years: yearList, classCode, school, month } = body as {
      type: "transcript" | "report_card" | "class_report" | "progress_report";
      studentNumber?: string;
      year?: string;
      years?: string[];
      classCode?: string;
      school?: string;
      month?: string;
    };

    if (!type) {
      return NextResponse.json({ error: "type is required" }, { status: 400 });
    }

    // Fetch transcript settings (for logos, principal names)
    let settings: TranscriptSettings | null = null;
    try {
      const settingsSnap = await adminDb.doc("parent_config/transcript_settings").get();
      if (settingsSnap.exists) settings = settingsSnap.data() as TranscriptSettings;
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

    // Individual student reports
    if (!studentNumber) {
      return NextResponse.json({ error: "studentNumber is required" }, { status: 400 });
    }

    const docRef = adminDb.collection("student_progress").doc(studentNumber.trim());
    const snap = await docRef.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Student not found" }, { status: 404 });
    }
    const student = snap.data() as StudentData;

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

    return NextResponse.json({ error: "Invalid report type" }, { status: 400 });
  } catch (err) {
    console.error("PDF generation error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to generate PDF" },
      { status: 500 },
    );
  }
}
