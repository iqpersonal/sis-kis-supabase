"use client";

import { Suspense, useEffect, useState, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { getSupabase } from "@/lib/supabase";

/* ------------------------------------------------------------------ */
/*  Types (mirrors progress page)                                     */
/* ------------------------------------------------------------------ */
interface SubjectGrade {
  subject: string;
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
  exam_label: string;
  overall_avg: number;
  subjects: SubjectGrade[];
  rank: number | null;
  class_size: number | null;
  pass_count: number;
  fail_count: number;
  strongest: { subject: string; grade: number };
  weakest: { subject: string; grade: number };
  terms?: Record<string, TermData>;
  term_count?: number;
}

interface StudentProgress {
  student_number: string;
  student_name: string;
  gender: string;
  family_number: string;
  years: Record<string, YearData>;
  financials?: Record<string, { balance: number; opening_balance?: number }>;
  updated_at: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */
function gradeColorCSS(grade: number): string {
  if (grade >= 90) return "#059669";
  if (grade >= 80) return "#2563eb";
  if (grade >= 70) return "#d97706";
  if (grade >= 60) return "#ea580c";
  return "#dc2626";
}

function gradeStatus(grade: number): string {
  if (grade >= 90) return "Excellent";
  if (grade >= 80) return "Very Good";
  if (grade >= 70) return "Good";
  if (grade >= 60) return "Satisfactory";
  if (grade >= 50) return "Pass";
  return "Fail";
}

const TERM_LABELS: Record<string, string> = {
  t1_assess: "T1 Assessment",
  t1_final: "T1 Final",
  sem1: "Semester 1",
  t2_assess: "T2 Assessment",
  t2_final: "T2 Final",
  sem2: "Semester 2",
  t3_assess: "T3 Assessment",
  t3_final: "T3 Final",
  sem3: "Semester 3",
  annual: "Annual",
};

const TERM_SHORT: Record<string, string> = {
  t1_assess: "T1 Assess",
  t1_final: "T1 Final",
  sem1: "Sem 1",
  t2_assess: "T2 Assess",
  t2_final: "T2 Final",
  sem2: "Sem 2",
  t3_assess: "T3 Assess",
  t3_final: "T3 Final",
  sem3: "Sem 3",
  annual: "Annual",
};

/* ------------------------------------------------------------------ */
/*  Report Page (wrapped in Suspense for useSearchParams)             */
/* ------------------------------------------------------------------ */
export default function StudentReportWrapper() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <p className="text-lg text-gray-500">Loading report…</p>
        </div>
      }
    >
      <StudentReportPage />
    </Suspense>
  );
}

function StudentReportPage() {
  const searchParams = useSearchParams();
  const studentNumber = searchParams.get("student");
  const yearFilter = searchParams.get("year"); // optional: show only one year

  const [progress, setProgress] = useState<StudentProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const hasPrinted = useRef(false);

  // Detect admin session (Supabase = admin; parents use custom auth)
  useEffect(() => {
    const supabase = getSupabase();
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsAdmin(!!session?.user);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAdmin(!!session?.user);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!studentNumber) {
      setError("No student number provided");
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const res = await fetch(
          `/api/student-progress?studentNumber=${encodeURIComponent(studentNumber)}`
        );
        if (!res.ok) throw new Error("Student not found");
        const json = await res.json();
        setProgress(json.data as StudentProgress);
      } catch {
        setError("Failed to load student data");
      } finally {
        setLoading(false);
      }
    })();
  }, [studentNumber]);

  // Auto-print after loading
  useEffect(() => {
    if (!loading && progress && !hasPrinted.current) {
      hasPrinted.current = true;
      // Set document title for PDF filename
      document.title = `Progress Report — ${progress.student_name || progress.student_number}`;
      setTimeout(() => window.print(), 600);
    }
  }, [loading, progress]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-lg text-gray-500">Loading report…</p>
      </div>
    );
  }

  if (error || !progress) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-lg text-red-500">{error || "No data available"}</p>
      </div>
    );
  }

  const sortedYears = Object.keys(progress.years).sort();
  const yearsToShow = yearFilter
    ? sortedYears.filter((y) => y === yearFilter)
    : sortedYears;

  const latestYr = sortedYears[sortedYears.length - 1];
  const latestData = progress.years[latestYr];
  const schoolName =
    latestData?.school === "0021-01"
      ? "Boys' School"
      : latestData?.school === "0021-02"
      ? "Girls' School"
      : "";

  return (
    <>
      <style jsx global>{`
        @media print {
          @page {
            size: A4 landscape;
            margin: 12mm 10mm;
          }
          body {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            font-size: 10px;
          }
          .no-print {
            display: none !important;
          }
          .page-break {
            page-break-before: always;
          }
        }
        @media screen {
          body {
            background: #f3f4f6;
          }
        }
        .report-page {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          color: #1e293b;
          max-width: 1200px;
          margin: 0 auto;
          background: white;
        }
        @media screen {
          .report-page {
            padding: 32px;
            margin: 20px auto;
            box-shadow: 0 4px 24px rgba(0,0,0,0.1);
            border-radius: 8px;
          }
        }
        .report-header {
          text-align: center;
          border-bottom: 3px solid #1e40af;
          padding-bottom: 16px;
          margin-bottom: 20px;
        }
        .report-header h1 {
          font-size: 22px;
          font-weight: 700;
          color: #1e40af;
          margin: 0 0 4px;
        }
        .report-header h2 {
          font-size: 14px;
          font-weight: 500;
          color: #64748b;
          margin: 0;
        }
        .student-info {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          padding: 14px 16px;
          margin-bottom: 20px;
        }
        .student-info .info-item {
          display: flex;
          flex-direction: column;
        }
        .student-info .info-label {
          font-size: 10px;
          font-weight: 600;
          color: #94a3b8;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .student-info .info-value {
          font-size: 13px;
          font-weight: 600;
          color: #1e293b;
        }
        .year-section {
          margin-bottom: 24px;
        }
        .year-title {
          font-size: 15px;
          font-weight: 700;
          color: #1e40af;
          border-bottom: 2px solid #dbeafe;
          padding-bottom: 6px;
          margin-bottom: 12px;
          display: flex;
          justify-content: space-between;
          align-items: baseline;
        }
        .year-title .year-meta {
          font-size: 11px;
          font-weight: 500;
          color: #64748b;
        }
        .summary-row {
          display: grid;
          grid-template-columns: repeat(6, 1fr);
          gap: 10px;
          margin-bottom: 14px;
        }
        .summary-card {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          padding: 8px 10px;
          text-align: center;
        }
        .summary-card .sc-label {
          font-size: 9px;
          font-weight: 600;
          color: #94a3b8;
          text-transform: uppercase;
          letter-spacing: 0.3px;
        }
        .summary-card .sc-value {
          font-size: 16px;
          font-weight: 700;
          margin-top: 2px;
        }
        .grade-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 11px;
          margin-bottom: 8px;
        }
        .grade-table th {
          background: #1e40af;
          color: white;
          padding: 6px 8px;
          font-weight: 600;
          text-align: center;
          font-size: 10px;
        }
        .grade-table th:first-child {
          text-align: left;
          min-width: 130px;
        }
        .grade-table th.sem-col {
          background: #7c3aed;
        }
        .grade-table th.annual-col {
          background: #059669;
        }
        .grade-table td {
          padding: 5px 8px;
          border-bottom: 1px solid #e2e8f0;
          text-align: center;
        }
        .grade-table td:first-child {
          text-align: left;
          font-weight: 500;
        }
        .grade-table tr:nth-child(even) {
          background: #f8fafc;
        }
        .grade-table tr:hover {
          background: #eff6ff;
        }
        .grade-table .avg-row {
          background: #f1f5f9 !important;
          font-weight: 700;
          border-top: 2px solid #94a3b8;
        }
        .grade-badge {
          display: inline-block;
          padding: 1px 6px;
          border-radius: 10px;
          font-weight: 700;
          font-size: 10px;
        }
        .history-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 11px;
        }
        .history-table th {
          background: #475569;
          color: white;
          padding: 6px 8px;
          font-weight: 600;
          font-size: 10px;
          text-align: center;
        }
        .history-table th:first-child,
        .history-table th:nth-child(2) {
          text-align: left;
        }
        .history-table td {
          padding: 5px 8px;
          border-bottom: 1px solid #e2e8f0;
          text-align: center;
        }
        .history-table td:first-child,
        .history-table td:nth-child(2) {
          text-align: left;
        }
        .history-table tr:nth-child(even) {
          background: #f8fafc;
        }
        /* ── Recommendation section ── */
        .recommendation-section {
          margin-bottom: 24px;
          border: 1px solid #e2e8f0;
          border-left: 4px solid #1e40af;
          border-radius: 6px;
          padding: 18px 20px;
          background: #fafbff;
        }
        .recommendation-section .rec-title {
          font-size: 15px;
          font-weight: 700;
          color: #1e40af;
          margin: 0 0 14px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .rec-rating {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 14px;
          border-radius: 20px;
          font-size: 13px;
          font-weight: 700;
          margin-bottom: 14px;
        }
        .rec-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
          margin-bottom: 14px;
        }
        .rec-card {
          padding: 10px 14px;
          border-radius: 6px;
          border: 1px solid #e2e8f0;
          background: white;
        }
        .rec-card-title {
          font-size: 10px;
          font-weight: 700;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 6px;
        }
        .rec-card ul {
          margin: 0;
          padding-left: 16px;
          font-size: 11px;
          line-height: 1.6;
        }
        .rec-card li {
          margin-bottom: 2px;
        }
        .rec-statement {
          background: #eff6ff;
          border: 1px solid #bfdbfe;
          border-radius: 6px;
          padding: 12px 16px;
          font-size: 11px;
          line-height: 1.7;
          color: #1e293b;
          margin-top: 14px;
        }
        .rec-statement strong {
          color: #1e40af;
        }
        .subject-trend-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 10px;
          margin-top: 14px;
        }
        .subject-trend-table th {
          background: #334155;
          color: white;
          padding: 5px 8px;
          font-weight: 600;
          font-size: 9px;
          text-align: center;
        }
        .subject-trend-table th:first-child {
          text-align: left;
          min-width: 110px;
        }
        .subject-trend-table td {
          padding: 4px 8px;
          border-bottom: 1px solid #e2e8f0;
          text-align: center;
          font-size: 10px;
        }
        .subject-trend-table td:first-child {
          text-align: left;
          font-weight: 500;
        }
        .subject-trend-table tr:nth-child(even) {
          background: #f8fafc;
        }
        .trend-up { color: #059669; font-weight: 700; }
        .trend-down { color: #dc2626; font-weight: 700; }
        .trend-same { color: #94a3b8; }
        .report-footer {
          margin-top: 20px;
          padding-top: 10px;
          border-top: 1px solid #e2e8f0;
          font-size: 9px;
          color: #94a3b8;
          display: flex;
          justify-content: space-between;
        }
        .print-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 10px 24px;
          background: #1e40af;
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          margin: 16px auto;
        }
        .print-btn:hover {
          background: #1d4ed8;
        }
      `}</style>

      {/* Print / PDF button */}
      <div className="no-print" style={{ textAlign: "center", padding: "16px", background: "#f3f4f6" }}>
        <button className="print-btn" onClick={() => window.print()}>
          🖨️ Print / Save as PDF
        </button>
      </div>

      <div className="report-page">
        {/* ── School Header ── */}
        <div className="report-header">
          <h1>Khaled International Schools</h1>
          <h2>Student Academic Progress Report{schoolName ? ` — ${schoolName}` : ""}</h2>
          <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#1e293b", margin: "8px 0 0" }}>
            {progress.student_name || progress.student_number}
          </h3>
        </div>

        {/* ── Student Info ── */}
        <div className="student-info">
          <div className="info-item">
            <span className="info-label">Student Name</span>
            <span className="info-value">{progress.student_name || "—"}</span>
          </div>
          <div className="info-item">
            <span className="info-label">Student Number</span>
            <span className="info-value">{progress.student_number}</span>
          </div>
          <div className="info-item">
            <span className="info-label">Current Class</span>
            <span className="info-value">
              {latestData?.class_name || "—"}
              {latestData?.section_name ? ` — ${latestData.section_name}` : ""}
            </span>
          </div>
          <div className="info-item">
            <span className="info-label">Family Number</span>
            <span className="info-value">{progress.family_number || "—"}</span>
          </div>
        </div>

        {/* ── Per-Year Term Breakdown ── */}
        {(() => {
          const fin = progress.financials || {};
          const sortedFinYears = Object.keys(fin).sort();
          const unpaidYearSet = new Set<string>();
          if (!isAdmin) {
            for (let i = 0; i < sortedFinYears.length; i++) {
              const y = sortedFinYears[i];
              const nextY = sortedFinYears[i + 1];
              if (nextY) {
                if ((fin[nextY]?.opening_balance ?? 0) > 0) unpaidYearSet.add(y);
              } else {
                if (fin[y].balance > 0) unpaidYearSet.add(y);
              }
            }
          }
          return yearsToShow.map((yr, yrIdx) => {
          const yd = progress.years[yr];
          if (!yd) return null;

          /* Fee-based access control: block unpaid years */
          const yearUnpaid = unpaidYearSet.has(yr);
          if (yearUnpaid) {
            return (
              <div key={yr} className={`year-section ${yrIdx > 0 ? "page-break" : ""}`}>
                <div className="year-title">
                  <span>Academic Year 20{yr} — {yd.class_name}</span>
                </div>
                <div style={{
                  textAlign: "center",
                  padding: "60px 20px",
                  background: "#fef2f2",
                  border: "2px solid #fecaca",
                  borderRadius: "8px",
                }}>
                  <div style={{ fontSize: "32px", marginBottom: "12px" }}>🔒</div>
                  <p style={{ fontSize: "16px", fontWeight: 700, color: "#dc2626", margin: "0 0 8px" }}>
                    Report Card Unavailable
                  </p>
                  <p style={{ fontSize: "12px", color: "#991b1b", margin: 0 }}>
                    Academic records for this year are restricted due to outstanding fees.
                    Please contact the school administration to clear your balance.
                  </p>
                </div>
              </div>
            );
          }

          const termCount = yd.term_count ?? 2;
          const termCols =
            termCount === 3
              ? ["t1_assess", "t1_final", "sem1", "t2_assess", "t2_final", "sem2", "t3_assess", "t3_final", "sem3", "annual"]
              : ["t1_assess", "t1_final", "sem1", "t2_assess", "t2_final", "sem2", "annual"];
          const activeCols = yd.terms
            ? termCols.filter((k) => yd.terms![k])
            : [];

          // Collect all subjects across terms
          const allSubjects = new Set<string>();
          if (yd.terms) {
            for (const tk of activeCols) {
              yd.terms[tk]?.subjects.forEach((s) => allSubjects.add(s.subject));
            }
          }
          // Fallback to overall subjects
          if (allSubjects.size === 0) {
            yd.subjects.forEach((s) => allSubjects.add(s.subject));
          }
          const subjectList = Array.from(allSubjects).sort();

          // Lookup
          const lookup: Record<string, Record<string, number>> = {};
          if (yd.terms) {
            for (const tk of activeCols) {
              const t = yd.terms[tk];
              if (t) {
                lookup[tk] = {};
                t.subjects.forEach((s) => {
                  lookup[tk][s.subject] = s.grade;
                });
              }
            }
          }

          // Overall subject grades lookup (for fallback)
          const overallLookup: Record<string, SubjectGrade> = {};
          yd.subjects.forEach((s) => {
            overallLookup[s.subject] = s;
          });

          return (
            <div key={yr} className={yrIdx > 0 ? "year-section page-break" : "year-section"}>
              <div className="year-title">
                <span>Academic Year 20{yr}</span>
                <span className="year-meta">
                  {yd.class_name}
                  {yd.section_name ? ` — ${yd.section_name}` : ""}
                  {" · "}
                  {yd.school === "0021-01" ? "Boys'" : yd.school === "0021-02" ? "Girls'" : ""}
                  {" · "}
                  {termCount === 3 ? "3-term" : "2-term"} year
                </span>
              </div>

              {/* Summary Cards */}
              <div className="summary-row">
                <div className="summary-card">
                  <div className="sc-label">Overall Avg</div>
                  <div className="sc-value" style={{ color: gradeColorCSS(yd.overall_avg) }}>
                    {yd.overall_avg}%
                  </div>
                </div>
                <div className="summary-card">
                  <div className="sc-label">Rank</div>
                  <div className="sc-value" style={{ color: "#2563eb" }}>
                    {yd.rank ? `#${yd.rank} / ${yd.class_size}` : "—"}
                  </div>
                </div>
                <div className="summary-card">
                  <div className="sc-label">Subjects Passed</div>
                  <div className="sc-value" style={{ color: "#059669" }}>
                    {yd.pass_count}
                  </div>
                </div>
                <div className="summary-card">
                  <div className="sc-label">Subjects Failed</div>
                  <div className="sc-value" style={{ color: yd.fail_count > 0 ? "#dc2626" : "#94a3b8" }}>
                    {yd.fail_count || "0"}
                  </div>
                </div>
                <div className="summary-card">
                  <div className="sc-label">Strongest</div>
                  <div className="sc-value" style={{ color: "#059669", fontSize: "11px" }}>
                    {yd.strongest.subject}
                    <br />
                    <span style={{ fontSize: "14px" }}>{yd.strongest.grade}%</span>
                  </div>
                </div>
                <div className="summary-card">
                  <div className="sc-label">Weakest</div>
                  <div className="sc-value" style={{ color: "#d97706", fontSize: "11px" }}>
                    {yd.weakest.subject}
                    <br />
                    <span style={{ fontSize: "14px" }}>{yd.weakest.grade}%</span>
                  </div>
                </div>
              </div>

              {/* Term-by-Term Grade Table */}
              {activeCols.length > 0 ? (
                <table className="grade-table">
                  <thead>
                    <tr>
                      <th>Subject</th>
                      {activeCols.map((tk) => (
                        <th
                          key={tk}
                          className={
                            tk === "annual"
                              ? "annual-col"
                              : tk.startsWith("sem")
                              ? "sem-col"
                              : ""
                          }
                        >
                          {TERM_SHORT[tk] || tk}
                        </th>
                      ))}
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subjectList.map((subj) => {
                      // Use annual or last available grade for status
                      const annualGrade =
                        lookup["annual"]?.[subj] ??
                        lookup["sem2"]?.[subj] ??
                        lookup["sem1"]?.[subj] ??
                        overallLookup[subj]?.grade;
                      return (
                        <tr key={subj}>
                          <td>{subj}</td>
                          {activeCols.map((tk) => {
                            const g = lookup[tk]?.[subj];
                            return (
                              <td key={tk}>
                                {g != null ? (
                                  <span
                                    className="grade-badge"
                                    style={{
                                      color: gradeColorCSS(g),
                                      background:
                                        g >= 90
                                          ? "#ecfdf5"
                                          : g >= 80
                                          ? "#eff6ff"
                                          : g >= 70
                                          ? "#fffbeb"
                                          : g >= 60
                                          ? "#fff7ed"
                                          : "#fef2f2",
                                    }}
                                  >
                                    {g}
                                  </span>
                                ) : (
                                  "—"
                                )}
                              </td>
                            );
                          })}
                          <td
                            style={{
                              color: annualGrade != null ? gradeColorCSS(annualGrade) : "#94a3b8",
                              fontWeight: 600,
                              fontSize: "10px",
                            }}
                          >
                            {annualGrade != null ? gradeStatus(annualGrade) : "—"}
                          </td>
                        </tr>
                      );
                    })}
                    {/* Averages row */}
                    <tr className="avg-row">
                      <td>Average</td>
                      {activeCols.map((tk) => {
                        const t = yd.terms?.[tk];
                        return (
                          <td key={tk}>
                            {t ? (
                              <span
                                className="grade-badge"
                                style={{
                                  color: gradeColorCSS(t.avg),
                                  background: "#e2e8f0",
                                }}
                              >
                                {t.avg}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                        );
                      })}
                      <td style={{ color: gradeColorCSS(yd.overall_avg), fontWeight: 700 }}>
                        {gradeStatus(yd.overall_avg)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              ) : (
                /* Fallback: simple subject list */
                <table className="grade-table">
                  <thead>
                    <tr>
                      <th>Subject</th>
                      <th>Grade</th>
                      <th>Class Rank</th>
                      <th>Section Rank</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {yd.subjects
                      .slice()
                      .sort((a, b) => b.grade - a.grade)
                      .map((s) => (
                        <tr key={s.subject}>
                          <td>{s.subject}</td>
                          <td>
                            <span
                              className="grade-badge"
                              style={{
                                color: gradeColorCSS(s.grade),
                                background:
                                  s.grade >= 90
                                    ? "#ecfdf5"
                                    : s.grade >= 80
                                    ? "#eff6ff"
                                    : s.grade >= 70
                                    ? "#fffbeb"
                                    : s.grade >= 60
                                    ? "#fff7ed"
                                    : "#fef2f2",
                              }}
                            >
                              {s.grade}%
                            </span>
                          </td>
                          <td>{s.class_rank ?? "—"}</td>
                          <td>{s.section_rank ?? "—"}</td>
                          <td style={{ color: gradeColorCSS(s.grade), fontWeight: 600 }}>
                            {gradeStatus(s.grade)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </div>
          );
        });
        })()}

        {/* ── Academic History Summary ── */}
        {yearsToShow.length > 1 && (
          <div className="year-section">
            <div className="year-title">
              <span>Academic History Summary</span>
            </div>
            <table className="history-table">
              <thead>
                <tr>
                  <th>Year</th>
                  <th>Class</th>
                  <th>Section</th>
                  <th>Average</th>
                  <th>Change</th>
                  <th>Rank</th>
                  <th>Passed</th>
                  <th>Failed</th>
                  <th>Strongest</th>
                  <th>Weakest</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const fin = progress.financials || {};
                  const sortedFinYears = Object.keys(fin).sort();
                  const unpaidYearSet = new Set<string>();
                  if (!isAdmin) {
                    for (let i = 0; i < sortedFinYears.length; i++) {
                      const y = sortedFinYears[i];
                      const nextY = sortedFinYears[i + 1];
                      if (nextY) {
                        if ((fin[nextY]?.opening_balance ?? 0) > 0) unpaidYearSet.add(y);
                      } else {
                        if (fin[y].balance > 0) unpaidYearSet.add(y);
                      }
                    }
                  }
                  return yearsToShow.map((yr, idx) => {
                  const yd = progress.years[yr];
                  if (!yd) return null;
                  const yearUnpaid = unpaidYearSet.has(yr);
                  if (yearUnpaid) {
                    return (
                      <tr key={yr}>
                        <td style={{ fontWeight: 600 }}>20{yr}</td>
                        <td>{yd.class_name}</td>
                        <td colSpan={8} style={{ color: "#dc2626", fontStyle: "italic", fontSize: "10px" }}>
                          🔒 Restricted — outstanding fees
                        </td>
                      </tr>
                    );
                  }
                  const prevYr = idx > 0 ? yearsToShow[idx - 1] : null;
                  const prevAvg = prevYr ? progress.years[prevYr]?.overall_avg : null;
                  const diff = prevAvg != null ? yd.overall_avg - prevAvg : null;
                  return (
                    <tr key={yr}>
                      <td style={{ fontWeight: 600 }}>20{yr}</td>
                      <td>{yd.class_name}</td>
                      <td>{yd.section_name || "—"}</td>
                      <td>
                        <span
                          className="grade-badge"
                          style={{
                            color: gradeColorCSS(yd.overall_avg),
                            background:
                              yd.overall_avg >= 90
                                ? "#ecfdf5"
                                : yd.overall_avg >= 80
                                ? "#eff6ff"
                                : yd.overall_avg >= 70
                                ? "#fffbeb"
                                : yd.overall_avg >= 60
                                ? "#fff7ed"
                                : "#fef2f2",
                          }}
                        >
                          {yd.overall_avg}%
                        </span>
                      </td>
                      <td
                        style={{
                          color: diff != null ? (diff > 0 ? "#059669" : diff < 0 ? "#dc2626" : "#94a3b8") : "#94a3b8",
                          fontWeight: 600,
                        }}
                      >
                        {diff != null
                          ? diff > 0
                            ? `▲ ${diff.toFixed(1)}`
                            : diff < 0
                            ? `▼ ${Math.abs(diff).toFixed(1)}`
                            : "—"
                          : "—"}
                      </td>
                      <td style={{ color: "#2563eb", fontWeight: 600 }}>
                        {yd.rank ? `#${yd.rank}/${yd.class_size}` : "—"}
                      </td>
                      <td style={{ color: "#059669", fontWeight: 600 }}>{yd.pass_count}</td>
                      <td style={{ color: yd.fail_count > 0 ? "#dc2626" : "#94a3b8", fontWeight: 600 }}>
                        {yd.fail_count || "0"}
                      </td>
                      <td style={{ fontSize: "10px" }}>
                        <span style={{ color: "#059669" }}>{yd.strongest.subject}</span>{" "}
                        <span style={{ color: "#94a3b8" }}>({yd.strongest.grade}%)</span>
                      </td>
                      <td style={{ fontSize: "10px" }}>
                        <span style={{ color: "#d97706" }}>{yd.weakest.subject}</span>{" "}
                        <span style={{ color: "#94a3b8" }}>({yd.weakest.grade}%)</span>
                      </td>
                    </tr>
                  );
                });
                })()}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Summary & Recommendation ── */}
        {(() => {
          const latestYrKey = sortedYears[sortedYears.length - 1];
          const latestYd = progress.years[latestYrKey];
          if (!latestYd) return null;

          /* Block recommendation if latest year has unpaid fees */
          const fin = progress.financials || {};
          const sortedFinYears = Object.keys(fin).sort();
          const latestFinYr = sortedFinYears[sortedFinYears.length - 1];
          const latestUnpaid = !isAdmin && latestFinYr ? fin[latestFinYr].balance > 0 : false;
          if (latestUnpaid) return null;

          const prevYrKey = sortedYears.length > 1 ? sortedYears[sortedYears.length - 2] : null;
          const prevYd = prevYrKey ? progress.years[prevYrKey] : null;

          // Performance rating
          const avg = latestYd.overall_avg;
          let ratingLabel: string;
          let ratingColor: string;
          let ratingBg: string;
          if (avg >= 90) { ratingLabel = "Outstanding Performance"; ratingColor = "#059669"; ratingBg = "#ecfdf5"; }
          else if (avg >= 80) { ratingLabel = "Strong Performance"; ratingColor = "#2563eb"; ratingBg = "#eff6ff"; }
          else if (avg >= 70) { ratingLabel = "Satisfactory Performance"; ratingColor = "#d97706"; ratingBg = "#fffbeb"; }
          else if (avg >= 60) { ratingLabel = "Needs Improvement"; ratingColor = "#ea580c"; ratingBg = "#fff7ed"; }
          else { ratingLabel = "At Risk — Requires Immediate Attention"; ratingColor = "#dc2626"; ratingBg = "#fef2f2"; }

          // Year-over-year change
          const yoyDiff = prevYd ? avg - prevYd.overall_avg : null;

          // Term trajectory within current year
          let termTrajectory: { first: number; last: number; diff: number } | null = null;
          if (latestYd.terms) {
            const termKeys = Object.keys(latestYd.terms).sort();
            if (termKeys.length >= 2) {
              const firstAvg = latestYd.terms[termKeys[0]].avg;
              const lastAvg = latestYd.terms[termKeys[termKeys.length - 1]].avg;
              termTrajectory = { first: firstAvg, last: lastAvg, diff: lastAvg - firstAvg };
            }
          }

          // Subjects at risk (< 70) and failing (< 60)
          const failSubjects = latestYd.subjects.filter(s => s.grade < 60);
          const atRiskSubjects = latestYd.subjects.filter(s => s.grade >= 60 && s.grade < 70);
          const excellentSubjects = latestYd.subjects.filter(s => s.grade >= 90);

          // Per-subject year-over-year trends
          const allSubjectsSet = new Set<string>();
          for (const yr of sortedYears) {
            progress.years[yr]?.subjects.forEach(s => allSubjectsSet.add(s.subject));
          }
          const allSubjectsSorted = Array.from(allSubjectsSet).sort();
          const subjectYoY: { subject: string; grades: Record<string, number>; change: number | null }[] = [];
          for (const subj of allSubjectsSorted) {
            const grades: Record<string, number> = {};
            for (const yr of sortedYears) {
              const found = progress.years[yr]?.subjects.find(s => s.subject === subj);
              if (found) grades[yr] = found.grade;
            }
            const yrs = sortedYears.filter(yr => grades[yr] != null);
            let change: number | null = null;
            if (yrs.length >= 2) {
              change = grades[yrs[yrs.length - 1]] - grades[yrs[yrs.length - 2]];
            }
            subjectYoY.push({ subject: subj, grades, change });
          }
          // Sort: biggest declines first, then improvements
          const sortedTrends = [...subjectYoY].sort((a, b) => (a.change ?? 0) - (b.change ?? 0));

          // Recommendation statement
          const parts: string[] = [];
          parts.push(`${progress.student_name || "The student"} achieved an overall average of ${avg}% in 20${latestYrKey}, rated as \u201c${ratingLabel}\u201d.`);
          if (yoyDiff != null) {
            if (yoyDiff > 0) parts.push(`This represents an improvement of ${yoyDiff.toFixed(1)}% compared to the previous year.`);
            else if (yoyDiff < 0) parts.push(`This represents a decline of ${Math.abs(yoyDiff).toFixed(1)}% compared to the previous year.`);
            else parts.push("Performance remained stable compared to the previous year.");
          }
          if (termTrajectory) {
            if (termTrajectory.diff > 0) parts.push(`Within the current year, the student showed positive momentum, improving from ${termTrajectory.first}% to ${termTrajectory.last}%.`);
            else if (termTrajectory.diff < 0) parts.push(`Within the current year, performance decreased from ${termTrajectory.first}% to ${termTrajectory.last}%, requiring closer monitoring.`);
          }
          if (failSubjects.length > 0) {
            parts.push(`Immediate attention is needed in: ${failSubjects.map(s => `${s.subject} (${s.grade}%)`).join(", ")}.`);
          }
          if (atRiskSubjects.length > 0) {
            parts.push(`Subjects at risk of falling behind: ${atRiskSubjects.map(s => `${s.subject} (${s.grade}%)`).join(", ")}.`);
          }
          if (excellentSubjects.length > 0) {
            parts.push(`Excellent performance in: ${excellentSubjects.map(s => `${s.subject} (${s.grade}%)`).join(", ")}.`);
          }
          if (failSubjects.length > 0 || atRiskSubjects.length > 0) {
            parts.push("Regular monitoring and additional support in weaker subjects is recommended.");
          } else if (avg >= 80) {
            parts.push("Continue maintaining this high standard of achievement.");
          } else {
            parts.push("Continued effort and consistent study habits are encouraged.");
          }

          return (
            <div className="recommendation-section page-break">
              <div className="rec-title">{"\uD83D\uDCCB"} Summary &amp; Recommendation</div>

              {/* Performance Rating */}
              <div className="rec-rating" style={{ color: ratingColor, background: ratingBg, border: `1px solid ${ratingColor}30` }}>
                <span style={{ fontSize: "18px" }}>{avg >= 80 ? "\u2B50" : avg >= 60 ? "\uD83D\uDCCA" : "\u26A0\uFE0F"}</span>
                {ratingLabel}
              </div>

              {/* Quick Stats Grid */}
              <div className="rec-grid">
                {/* Year-over-Year */}
                <div className="rec-card">
                  <div className="rec-card-title">Year-over-Year Trend</div>
                  {yoyDiff != null ? (
                    <div style={{ fontSize: "13px", fontWeight: 700, color: yoyDiff > 0 ? "#059669" : yoyDiff < 0 ? "#dc2626" : "#94a3b8" }}>
                      {yoyDiff > 0 ? `\u25B2 +${yoyDiff.toFixed(1)}%` : yoyDiff < 0 ? `\u25BC ${yoyDiff.toFixed(1)}%` : "No change"}
                      <span style={{ fontWeight: 400, color: "#64748b", marginLeft: 8, fontSize: "11px" }}>from 20{prevYrKey} → 20{latestYrKey}</span>
                    </div>
                  ) : (
                    <div style={{ fontSize: "11px", color: "#94a3b8" }}>Only one year of data</div>
                  )}
                </div>

                {/* Term Trajectory */}
                <div className="rec-card">
                  <div className="rec-card-title">Current Year Term Trajectory</div>
                  {termTrajectory ? (
                    <div style={{ fontSize: "13px", fontWeight: 700, color: termTrajectory.diff > 0 ? "#059669" : termTrajectory.diff < 0 ? "#dc2626" : "#94a3b8" }}>
                      {termTrajectory.first}% → {termTrajectory.last}%
                      <span style={{ marginLeft: 8 }}>
                        ({termTrajectory.diff > 0 ? "+" : ""}{termTrajectory.diff.toFixed(1)}%)
                      </span>
                    </div>
                  ) : (
                    <div style={{ fontSize: "11px", color: "#94a3b8" }}>Insufficient term data</div>
                  )}
                </div>

                {/* Strengths */}
                <div className="rec-card">
                  <div className="rec-card-title">{"\uD83C\uDF1F"} Strengths (≥90%)</div>
                  {excellentSubjects.length > 0 ? (
                    <ul>
                      {excellentSubjects.sort((a, b) => b.grade - a.grade).map(s => (
                        <li key={s.subject}><span style={{ color: "#059669", fontWeight: 600 }}>{s.subject}</span> — {s.grade}%</li>
                      ))}
                    </ul>
                  ) : (
                    <div style={{ fontSize: "11px", color: "#94a3b8" }}>No subjects at 90%+</div>
                  )}
                </div>

                {/* Attention Areas */}
                <div className="rec-card">
                  <div className="rec-card-title">{"\u26A0\uFE0F"} Needs Attention (&lt;70%)</div>
                  {(failSubjects.length > 0 || atRiskSubjects.length > 0) ? (
                    <ul>
                      {failSubjects.map(s => (
                        <li key={s.subject}><span style={{ color: "#dc2626", fontWeight: 600 }}>{s.subject}</span> — {s.grade}% <span style={{ color: "#dc2626", fontSize: "9px" }}>FAIL</span></li>
                      ))}
                      {atRiskSubjects.map(s => (
                        <li key={s.subject}><span style={{ color: "#d97706", fontWeight: 600 }}>{s.subject}</span> — {s.grade}%</li>
                      ))}
                    </ul>
                  ) : (
                    <div style={{ fontSize: "11px", color: "#059669" }}>All subjects above 70% ✓</div>
                  )}
                </div>
              </div>

              {/* Per-Subject Year-over-Year Trend Table */}
              {sortedYears.length > 1 && (
                <>
                  <div style={{ fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: 6 }}>Subject Performance Across Years</div>
                  <table className="subject-trend-table">
                    <thead>
                      <tr>
                        <th>Subject</th>
                        {sortedYears.map(yr => <th key={yr}>20{yr}</th>)}
                        <th>Change</th>
                        <th>Trend</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedTrends.map(row => (
                        <tr key={row.subject}>
                          <td>{row.subject}</td>
                          {sortedYears.map(yr => (
                            <td key={yr}>
                              {row.grades[yr] != null ? (
                                <span className="grade-badge" style={{ color: gradeColorCSS(row.grades[yr]), background: row.grades[yr] >= 90 ? "#ecfdf5" : row.grades[yr] >= 80 ? "#eff6ff" : row.grades[yr] >= 70 ? "#fffbeb" : row.grades[yr] >= 60 ? "#fff7ed" : "#fef2f2" }}>
                                  {row.grades[yr]}
                                </span>
                              ) : "\u2014"}
                            </td>
                          ))}
                          <td className={row.change != null ? (row.change > 0 ? "trend-up" : row.change < 0 ? "trend-down" : "trend-same") : "trend-same"}>
                            {row.change != null ? (row.change > 0 ? `+${row.change.toFixed(1)}` : row.change < 0 ? row.change.toFixed(1) : "0.0") : "\u2014"}
                          </td>
                          <td className={row.change != null ? (row.change > 0 ? "trend-up" : row.change < 0 ? "trend-down" : "trend-same") : "trend-same"}>
                            {row.change != null ? (row.change > 3 ? "\u25B2 Improving" : row.change < -3 ? "\u25BC Declining" : row.change > 0 ? "\u2197 Slight Up" : row.change < 0 ? "\u2198 Slight Down" : "\u2192 Stable") : "\u2014"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}

              {/* Recommendation Statement */}
              <div className="rec-statement">
                <strong>Recommendation:</strong> {parts.join(" ")}
              </div>
            </div>
          );
        })()}

        {/* ── Footer ── */}
        <div className="report-footer">
          <span>Khaled International Schools — SiS Smart Report Dashboard</span>
          <span>Generated: {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</span>
        </div>
      </div>

      {/* Print button at bottom too */}
      <div className="no-print" style={{ textAlign: "center", padding: "16px", background: "#f3f4f6" }}>
        <button className="print-btn" onClick={() => window.print()}>
          🖨️ Print / Save as PDF
        </button>
      </div>
    </>
  );
}
