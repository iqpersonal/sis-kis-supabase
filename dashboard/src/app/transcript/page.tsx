"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
interface TranscriptSubject {
  subject: string;
  subject_ar: string;
  grade: number;
  credit_hours: number;
  calculated: boolean;
}

interface YearData {
  class_code: string;
  class_name: string;
  section_code: string;
  section_name: string;
  school: string;
  overall_avg: number;
  transcript_subjects?: TranscriptSubject[];
  transcript_sem1?: TranscriptSubject[];
  transcript_sem2?: TranscriptSubject[];
  transcript_sem3?: TranscriptSubject[];
}

interface StudentData {
  student_number: string;
  student_name: string;
  student_name_ar: string;
  gender: string;
  family_number: string;
  dob: string;
  birth_place_en: string;
  birth_place_ar: string;
  nationality_en: string;
  nationality_ar: string;
  passport_id: string;
  iqama_number: string;
  enrollment_date: string;
  prev_school_en: string;
  prev_school_ar: string;
  prev_school_year: string;
  years: Record<string, YearData>;
  financials?: Record<string, { balance: number; opening_balance?: number }>;
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
  school_logo: string;
  cognia_logo: string;
  moe_logo: string;
  lwis_logo: string;
  ib_logo: string;
}

/* ------------------------------------------------------------------ */
/*  Grading scale                                                      */
/* ------------------------------------------------------------------ */
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

function computeGPA(subjects: TranscriptSubject[]): string {
  const calc = subjects.filter((s) => s.calculated);
  if (!calc.length) return "0.00";
  let totalWeighted = 0;
  let totalCredits = 0;
  for (const s of calc) {
    totalWeighted += gradePoints(s.grade) * s.credit_hours;
    totalCredits += s.credit_hours;
  }
  return totalCredits > 0 ? (totalWeighted / totalCredits).toFixed(2) : "0.00";
}

function formatDate(d: string | null | undefined): string {
  if (!d) return "-";
  try {
    const date = new Date(d);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return d;
  }
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

/** Increment a 2-digit academic year code: "16-17" → "17-18" */
function nextYearCode(code: string): string {
  const parts = code.split("-");
  if (parts.length === 2) {
    const a = Number(parts[0]);
    const b = Number(parts[1]);
    if (!isNaN(a) && !isNaN(b)) {
      return `${String(a + 1).padStart(2, "0")}-${String(b + 1).padStart(2, "0")}`;
    }
  }
  return "";
}

/** Get previous school name for a specific transcript year */
function getPrevSchool(student: StudentData, transcriptYear: string): string {
  // If there's an external previous school, show it only for the first year at Khaled
  // (the year right after prev_school_year)
  if (student.prev_school_en && student.prev_school_year) {
    const firstYearAtKhaled = nextYearCode(student.prev_school_year);
    if (transcriptYear === firstYearAtKhaled) {
      return student.prev_school_en;
    }
  }
  return "Khaled International Schools";
}

/* ------------------------------------------------------------------ */
/*  Wrapper                                                            */
/* ------------------------------------------------------------------ */
export default function TranscriptWrapper() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <p className="text-lg text-gray-500">Loading transcript…</p>
        </div>
      }
    >
      <TranscriptPage />
    </Suspense>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */
function TranscriptPage() {
  const searchParams = useSearchParams();
  const studentNumber = searchParams.get("student");
  const yearFilter = searchParams.get("year");

  const [student, setStudent] = useState<StudentData | null>(null);
  const [settings, setSettings] = useState<TranscriptSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // Detect admin session (Firebase Auth = admin; parents use custom auth)
  useEffect(() => {
    const unsub = onAuthStateChanged(getFirebaseAuth(), (user) => {
      setIsAdmin(!!user);
    });
    return unsub;
  }, []);

  // Fetch student data + transcript settings in parallel
  useEffect(() => {
    if (!studentNumber) {
      setError("No student number provided. Use ?student=XXXX&year=YY-YY");
      setLoading(false);
      return;
    }

    Promise.all([
      fetch(`/api/student-progress?studentNumber=${encodeURIComponent(studentNumber)}`).then(
        (r) => r.json()
      ),
      fetch("/api/transcript-settings").then((r) => r.json()),
    ])
      .then(([studentJson, settingsJson]) => {
        if (!studentJson.data) {
          setError("Student not found");
          return;
        }
        setStudent(studentJson.data as StudentData);
        if (settingsJson.data) {
          setSettings(settingsJson.data as TranscriptSettings);
        }
      })
      .catch(() => setError("Failed to load data"))
      .finally(() => setLoading(false));
  }, [studentNumber]);

  // Auto-print after load (disabled — user clicks the Print button manually)
  useEffect(() => {
    if (!loading && student) {
      document.title = `Transcript — ${student.student_name || student.student_number}`;
    }
  }, [loading, student]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-lg text-gray-500">Loading transcript…</p>
      </div>
    );
  }

  if (error || !student) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-lg text-red-500">{error || "No data"}</p>
      </div>
    );
  }

  // Determine which year(s) to show (supports comma-separated: year=16-17,17-18,18-19)
  const yearCodes = yearFilter
    ? yearFilter.split(",").filter((y) => y && student.years[y])
    : Object.keys(student.years).sort();

  // Determine school config based on latest year
  const latestYear = yearCodes[yearCodes.length - 1];
  const majorCode = student.years[latestYear]?.school || "0021-01";
  const schoolConfig = settings?.schools?.[majorCode];

  const handlePrint = () => {
    // Small delay lets React flush any pending state before printing
    setTimeout(() => {
      try {
        window.print();
      } catch {
        // Fallback for environments where window.print() is blocked
        alert("Please use Ctrl+P (or Cmd+P on Mac) to print this page.");
      }
    }, 100);
  };

  return (
    <>
      {/* Print styles */}
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 10mm 12mm; }
          html, body { 
            -webkit-print-color-adjust: exact; 
            print-color-adjust: exact;
            background: white !important;
            color: black !important;
          }
          .no-print { display: none !important; }
          .transcript-page { 
            box-shadow: none !important; 
            padding: 0 !important; 
            margin: 0 !important;
            max-width: none !important;
          }
        }
        @media screen {
          .transcript-page { 
            max-width: 210mm; 
            margin: 0 auto; 
            background: white; 
            padding: 10mm 12mm;
            box-shadow: 0 0 20px rgba(0,0,0,0.1);
          }
        }
      `}</style>

      {/* Print button (screen only) */}
      <div className="no-print" style={{ position: "fixed", top: "16px", right: "16px", zIndex: 99999, display: "flex", gap: "8px" }}>
        <button
          type="button"
          onClick={handlePrint}
          style={{
            padding: "8px 16px",
            fontSize: "14px",
            fontWeight: 500,
            color: "#fff",
            backgroundColor: "#2563eb",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
            boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
          }}
        >
          🖨️ Print / Save PDF
        </button>
        <button
          type="button"
          onClick={() => { window.history.back(); }}
          style={{
            padding: "8px 16px",
            fontSize: "14px",
            fontWeight: 500,
            color: "#374151",
            backgroundColor: "#e5e7eb",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
            boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
          }}
        >
          ← Back
        </button>
      </div>

      {/* One page per year */}
      {(() => {
        const fin = student.financials || {};
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
        return yearCodes.map((yr) => {
        const yearData = student.years[yr];
        if (!yearData) return null;

        /* Fee-based access control: block unpaid years */
        const yearUnpaid = unpaidYearSet.has(yr);
        if (yearUnpaid) {
          return (
            <div
              key={yr}
              className="transcript-page"
              style={{
                fontFamily: "'Times New Roman', serif",
                fontSize: "13px",
                color: "#000",
                pageBreakAfter: "always",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: "600px",
              }}
            >
              <div style={{ textAlign: "center", padding: "60px 20px" }}>
                <div style={{ fontSize: "48px", marginBottom: "16px" }}>🔒</div>
                <p style={{ fontSize: "20px", fontWeight: 700, color: "#dc2626", margin: "0 0 8px" }}>
                  Transcript Unavailable
                </p>
                <p style={{ fontSize: "14px", color: "#991b1b", margin: "0 0 4px" }}>
                  Academic Year 20{yr} — {yearData.class_name}
                </p>
                <p style={{ fontSize: "12px", color: "#6b7280", margin: 0 }}>
                  Academic records for this year are restricted due to outstanding fees.
                  Please contact the school administration to clear your balance.
                </p>
              </div>
            </div>
          );
        }

        const subjects = yearData.transcript_subjects || [];
        const sem1 = yearData.transcript_sem1 || [];
        const sem2 = yearData.transcript_sem2 || [];
        const sem3 = yearData.transcript_sem3 || [];

        // Detect which semesters have data
        const hasSem1 = sem1.length > 0;
        const hasSem2 = sem2.length > 0;
        const hasSem3 = sem3.length > 0;

        // Build a unified subject list with sem1 + sem2 + sem3 + total columns
        const subjectMap = new Map<string, { name: string; name_ar: string; credits: number; calculated: boolean; sem1?: number; sem2?: number; sem3?: number; total?: number }>();

        for (const s of subjects) {
          const isCalc = s.calculated && s.credit_hours > 0;
          subjectMap.set(s.subject, {
            name: s.subject,
            name_ar: s.subject_ar,
            credits: s.credit_hours,
            calculated: isCalc,
            total: s.grade,
          });
        }
        for (const s of sem1) {
          const isCalc = s.calculated && s.credit_hours > 0;
          const existing = subjectMap.get(s.subject) || {
            name: s.subject,
            name_ar: s.subject_ar,
            credits: s.credit_hours,
            calculated: isCalc,
          };
          existing.sem1 = s.grade;
          subjectMap.set(s.subject, existing);
        }
        for (const s of sem2) {
          const isCalc = s.calculated && s.credit_hours > 0;
          const existing = subjectMap.get(s.subject) || {
            name: s.subject,
            name_ar: s.subject_ar,
            credits: s.credit_hours,
            calculated: isCalc,
          };
          existing.sem2 = s.grade;
          subjectMap.set(s.subject, existing);
        }
        for (const s of sem3) {
          const isCalc = s.calculated && s.credit_hours > 0;
          const existing = subjectMap.get(s.subject) || {
            name: s.subject,
            name_ar: s.subject_ar,
            credits: s.credit_hours,
            calculated: isCalc,
          };
          existing.sem3 = s.grade;
          subjectMap.set(s.subject, existing);
        }

        // Sort: calculated subjects first, then non-calculated
        const sortedSubjects = Array.from(subjectMap.values()).sort((a, b) => {
          if (a.calculated !== b.calculated) return a.calculated ? -1 : 1;
          return a.name.localeCompare(b.name);
        });

        // Compute GPA from total column
        const gpa = computeGPA(
          sortedSubjects
            .filter((s) => s.total !== undefined)
            .map((s) => ({
              subject: s.name,
              subject_ar: s.name_ar,
              grade: s.total!,
              credit_hours: s.credits,
              calculated: s.calculated,
            }))
        );

        // Compute semester GPAs
        const gpaSem1 = computeGPA(
          sem1.filter((s) => s.calculated)
        );
        const gpaSem2 = computeGPA(
          sem2.filter((s) => s.calculated)
        );
        const gpaSem3 = computeGPA(
          sem3.filter((s) => s.calculated)
        );

        // Total credit hours (calculated subjects only)
        const totalCredits = sortedSubjects
          .filter((s) => s.calculated)
          .reduce((sum, s) => sum + s.credits, 0);

        return (
          <div
            key={yr}
            className="transcript-page"
            style={{
              fontFamily: "'Times New Roman', serif",
              fontSize: "13px",
              lineHeight: 1.4,
              color: "#000",
              pageBreakAfter: "always",
            }}
          >
            {/* ════════════════════ HEADER (Letterhead) ════════════════════ */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                paddingBottom: "6px",
                marginBottom: "0",
              }}
            >
              {/* Left: Ministry of Education logo */}
              <div style={{ width: "85px", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {settings?.moe_logo ? (
                  <img
                    src={settings.moe_logo}
                    alt="Ministry of Education"
                    style={{ maxWidth: "85px", maxHeight: "85px", mixBlendMode: "multiply" }}
                  />
                ) : (
                  <div
                    style={{
                      width: 70,
                      height: 70,
                      border: "1px dashed #999",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "7px",
                      color: "#999",
                    }}
                  >
                    MoE Logo
                  </div>
                )}
              </div>

              {/* Center: School logo + details */}
              <div style={{ flex: 1, textAlign: "center" }}>
                <div style={{ marginBottom: "4px" }}>
                  {settings?.school_logo ? (
                    <img
                      src={settings.school_logo}
                      alt="School Logo"
                      style={{ maxWidth: "85px", maxHeight: "85px", margin: "0 auto", mixBlendMode: "multiply" }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 70,
                        height: 70,
                        border: "1px dashed #999",
                        borderRadius: "50%",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "8px",
                        color: "#999",
                      }}
                    >
                      Logo
                    </div>
                  )}
                </div>
                <div style={{ fontWeight: "bold", fontSize: "18px" }}>Khaled International Schools</div>
              </div>

              {/* Right: Cognia logo */}
              <div style={{ width: "85px", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {settings?.cognia_logo ? (
                  <img
                    src={settings.cognia_logo}
                    alt="Cognia"
                    style={{ maxWidth: "85px", maxHeight: "85px", mixBlendMode: "multiply" }}
                  />
                ) : (
                  <div
                    style={{
                      width: 70,
                      height: 70,
                      border: "1px dashed #999",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "7px",
                      color: "#999",
                    }}
                  >
                    Cognia
                  </div>
                )}
              </div>
            </div>

            {/* Gold line separator */}
            <div style={{ borderBottom: "2px solid #b8860b", marginBottom: "6px" }} />

            {/* Transcript Title Bar */}
            <div
              style={{
                textAlign: "center",
                marginBottom: "8px",
                paddingBottom: "6px",
                borderBottom: "2px solid #1a365d",
              }}
            >
              <div style={{ fontSize: "18px", fontWeight: "bold", color: "#1a365d", letterSpacing: "2px", textTransform: "uppercase" }}>
                Transcript
              </div>
              <div style={{ fontSize: "13px", fontWeight: "bold", marginTop: "2px", color: "#2d3748" }}>
                {yearData.class_name} — {formatAcademicYear(yr)}
              </div>
            </div>

            {/* ════════════════════ STUDENT INFO ════════════════════ */}
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", marginBottom: "8px" }}>
              <tbody>
                <tr>
                  <td style={infoCellLabel}>Student Name</td>
                  <td style={infoCellValue}>{student.student_name || "-"}</td>
                  <td style={infoCellLabel}>Passport Number</td>
                  <td style={infoCellValue}>{student.passport_id || "-"}</td>
                </tr>
                <tr>
                  <td style={infoCellLabel}>Nationality</td>
                  <td style={infoCellValue}>{student.nationality_en || "-"}</td>
                  <td style={infoCellLabel}>Iqama Number</td>
                  <td style={infoCellValue}>{student.iqama_number || "-"}</td>
                </tr>
                <tr>
                  <td style={infoCellLabel}>Date of Birth</td>
                  <td style={infoCellValue} colSpan={3}>
                    {formatDate(student.dob)}{student.birth_place_en ? ` — ${student.birth_place_en}` : ""}
                  </td>
                </tr>
                <tr>
                  <td style={infoCellLabel}>Date of Enrollment</td>
                  <td style={infoCellValue} colSpan={3}>{formatDate(student.enrollment_date)}</td>
                </tr>
                <tr>
                  <td style={infoCellLabel}>Previous School</td>
                  <td style={infoCellValue} colSpan={3}>{getPrevSchool(student, yr) || "-"}</td>
                </tr>
              </tbody>
            </table>

            {/* ════════════════════ GRADES TABLE ════════════════════ */}
            <div style={{ position: "relative" }}>
              {/* Watermark — uses <img> so it prints reliably */}
              {settings?.school_logo && (
                <div
                  style={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                    width: "55%",
                    height: "75%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    pointerEvents: "none",
                    zIndex: 2,
                  }}
                >
                  <img
                    src={settings.school_logo}
                    alt=""
                    style={{
                      maxWidth: "100%",
                      maxHeight: "100%",
                      objectFit: "contain",
                      opacity: 0.08,
                    }}
                  />
                </div>
              )}
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "12px",
                marginBottom: "8px",
                position: "relative",
                zIndex: 1,
              }}
            >
              <thead>
                <tr style={{ backgroundColor: "#1a365d", color: "white" }}>
                  <th style={thStyle}>Subject</th>
                  <th style={{ ...thStyle, width: "65px" }}>Credit Hours</th>
                  {hasSem1 && <th style={{ ...thStyle, width: "65px" }}>1st Semester</th>}
                  {hasSem2 && <th style={{ ...thStyle, width: "65px" }}>2nd Semester</th>}
                  {hasSem3 && <th style={{ ...thStyle, width: "65px" }}>3rd Semester</th>}
                  <th style={{ ...thStyle, width: "60px" }}>Total</th>
                  <th style={{ ...thStyle, width: "50px" }}>Grade</th>
                  <th style={{ ...thStyle, width: "50px" }}>GPA</th>
                </tr>
              </thead>
              <tbody>
                {sortedSubjects.map((s, idx) => {
                  const total = s.total ?? 0;
                  const isNonCalc = !s.calculated;
                  return (
                    <tr
                      key={s.name}
                      style={{
                        backgroundColor: isNonCalc
                          ? "#f7fafc"
                          : idx % 2 === 0
                          ? "#fff"
                          : "#f9fafb",
                      }}
                    >
                      <td style={tdSubject}>
                        {s.name}
                      </td>
                      <td style={tdCenter}>{s.credits > 0 ? s.credits : "-"}</td>
                      {hasSem1 && <td style={tdCenter}>{s.sem1 !== undefined ? s.sem1 : "-"}</td>}
                      {hasSem2 && <td style={tdCenter}>{s.sem2 !== undefined ? s.sem2 : "-"}</td>}
                      {hasSem3 && <td style={tdCenter}>{s.sem3 !== undefined ? s.sem3 : "-"}</td>}
                      <td style={{ ...tdCenter, fontWeight: "bold" }}>
                        {s.total !== undefined ? s.total : "-"}
                      </td>
                      <td style={tdCenter}>
                        {s.total !== undefined ? letterGrade(total) : "-"}
                      </td>
                      <td style={tdCenter}>
                        {s.total !== undefined && s.calculated
                          ? gradePoints(total).toFixed(2)
                          : "-"}
                      </td>
                    </tr>
                  );
                })}

                {/* Totals / GPA row */}
                <tr style={{ backgroundColor: "#1a365d", color: "white", fontWeight: "bold" }}>
                  <td style={{ ...tdSubject, color: "white", fontWeight: "bold" }}>
                    Total / GPA
                  </td>
                  <td style={{ ...tdCenter, color: "white" }}>{totalCredits}</td>
                  {hasSem1 && <td style={{ ...tdCenter, color: "white" }}>{gpaSem1}</td>}
                  {hasSem2 && <td style={{ ...tdCenter, color: "white" }}>{gpaSem2}</td>}
                  {hasSem3 && <td style={{ ...tdCenter, color: "white" }}>{gpaSem3}</td>}
                  <td style={{ ...tdCenter, color: "white" }}>{yearData.overall_avg}</td>
                  <td style={{ ...tdCenter, color: "white" }}>{letterGrade(yearData.overall_avg)}</td>
                  <td style={{ ...tdCenter, color: "white", fontSize: "14px" }}>{gpa}</td>
                </tr>
              </tbody>
            </table>
            </div>

            {/* ════════════════════ GRADING SCALE ════════════════════ */}
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                marginBottom: "6px",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={{ fontSize: "12px", fontWeight: "bold", marginBottom: "6px", color: "#1a365d", letterSpacing: "1px", textTransform: "uppercase" }}>Grading Scale</div>
                <table
                  style={{
                    borderCollapse: "collapse",
                    fontSize: "11px",
                    textAlign: "center",
                  }}
                >
                  <tbody>
                    {GRADING_SCALE.map((row) => (
                      <tr key={row.range}>
                        <td style={{ ...scaleTdStyle, fontWeight: "bold", width: "40px" }}>{row.letter}</td>
                        <td style={{ ...scaleTdStyle, width: "80px" }}>{row.range}</td>
                        <td style={{ ...scaleTdStyle, width: "40px" }}>{row.points}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ════════════════════ SIGNATURES ════════════════════ */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: "8px",
                fontSize: "12px",
              }}
            >
              <div style={{ textAlign: "center", width: "45%" }}>
                <div style={{ borderBottom: "1px solid #000", marginBottom: "2px", height: "20px" }} />
                <div style={{ fontWeight: "bold" }}>School Principal</div>
                {schoolConfig?.principal && (
                  <div style={{ marginTop: "2px", fontSize: "11px" }}>
                    {schoolConfig.principal}
                  </div>
                )}
              </div>

              <div style={{ textAlign: "center", width: "45%" }}>
                <div style={{ borderBottom: "1px solid #000", marginBottom: "2px", height: "20px" }} />
                <div style={{ fontWeight: "bold" }}>Academic Director</div>
                {schoolConfig?.academic_director && (
                  <div style={{ marginTop: "2px", fontSize: "11px" }}>
                    {schoolConfig.academic_director}
                  </div>
                )}
              </div>
            </div>

            {/* Date & stamp area */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: "6px",
                fontSize: "10px",
                color: "#666",
              }}
            >
              <div>Date: _______________</div>
              <div>&nbsp;</div>
            </div>

            {/* ════════════════════ FOOTER (Letterhead) ════════════════════ */}
            <div style={{ marginTop: "auto", borderTop: "1px solid #e2e8f0", paddingTop: "4px" }}>
              {/* Footer logos row */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "16px", marginBottom: "3px" }}>
                {settings?.lwis_logo && (
                  <img src={settings.lwis_logo} alt="LWIS Network" style={{ height: "28px", mixBlendMode: "multiply" }} />
                )}
                {settings?.ib_logo && (
                  <img src={settings.ib_logo} alt="IB" style={{ height: "28px", mixBlendMode: "multiply" }} />
                )}
              </div>

              {/* Contact info row */}
              <div style={{ display: "flex", justifyContent: "center", gap: "24px", fontSize: "8px", color: "#444", marginBottom: "3px", flexWrap: "wrap" }}>
                <span>📞 +966 920033901</span>
                <span>✉ info@kis-riyadh.com</span>
                <span>🌐 www.kis-riyadh.com</span>
                <span>📍 Prince Fawaz Ben Abdel Aziz Street, Nahda Road, P.O.Box 148, Riyadh, KSA</span>
              </div>

              {/* Motto banner */}
              <div
                style={{
                  background: "linear-gradient(135deg, #1a365d 0%, #2d6a8a 50%, #b8860b 100%)",
                  color: "white",
                  textAlign: "center",
                  padding: "3px 0",
                  fontSize: "9px",
                  fontStyle: "italic",
                  letterSpacing: "1px",
                  borderRadius: "2px",
                }}
              >
                &ldquo;we measure success one happy learner at a time&rdquo;
              </div>
            </div>
          </div>
        );
      });
      })()}

      {/* ════════════════════ CUMULATIVE GPA PAGE ════════════════════ */}
      {yearCodes.length > 1 && (() => {
        let cumWeighted = 0;
        let cumCredits = 0;
        const yearRows: { year: string; className: string; gpa: string; avg: number }[] = [];
        for (const yc of yearCodes) {
          const yd = student.years[yc];
          if (!yd) continue;
          const subs = yd.transcript_subjects || [];
          const calc = subs.filter((s) => s.calculated);
          let yw = 0, yc2 = 0;
          for (const s of calc) {
            yw += gradePoints(s.grade) * s.credit_hours;
            yc2 += s.credit_hours;
          }
          cumWeighted += yw;
          cumCredits += yc2;
          yearRows.push({
            year: formatAcademicYear(yc),
            className: yd.class_name,
            gpa: yc2 > 0 ? (yw / yc2).toFixed(2) : "-",
            avg: yd.overall_avg,
          });
        }
        const cumGPA = cumCredits > 0 ? (cumWeighted / cumCredits).toFixed(2) : "-";

        return (
          <div
            className="transcript-page"
            style={{
              fontFamily: "'Times New Roman', serif",
              fontSize: "13px",
              lineHeight: 1.4,
              color: "#000",
              pageBreakAfter: "always",
              display: "flex",
              flexDirection: "column",
              minHeight: "277mm",
            }}
          >
            {/* ════════════════════ HEADER ════════════════════ */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                paddingBottom: "6px",
                marginBottom: "0",
              }}
            >
              <div style={{ width: "85px", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {settings?.moe_logo ? (
                  <img src={settings.moe_logo} alt="Ministry of Education" style={{ maxWidth: "85px", maxHeight: "85px", mixBlendMode: "multiply" }} />
                ) : (
                  <div style={{ width: 70, height: 70, border: "1px dashed #999", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "7px", color: "#999" }}>MoE Logo</div>
                )}
              </div>
              <div style={{ flex: 1, textAlign: "center" }}>
                <div style={{ marginBottom: "4px" }}>
                  {settings?.school_logo ? (
                    <img src={settings.school_logo} alt="School Logo" style={{ maxWidth: "85px", maxHeight: "85px", margin: "0 auto", mixBlendMode: "multiply" }} />
                  ) : (
                    <div style={{ width: 70, height: 70, border: "1px dashed #999", borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "8px", color: "#999" }}>Logo</div>
                  )}
                </div>
                <div style={{ fontWeight: "bold", fontSize: "18px" }}>Khaled International Schools</div>
              </div>
              <div style={{ width: "85px", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {settings?.cognia_logo ? (
                  <img src={settings.cognia_logo} alt="Cognia" style={{ maxWidth: "85px", maxHeight: "85px", mixBlendMode: "multiply" }} />
                ) : (
                  <div style={{ width: 70, height: 70, border: "1px dashed #999", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "7px", color: "#999" }}>Cognia</div>
                )}
              </div>
            </div>

            <div style={{ borderBottom: "2px solid #b8860b", marginBottom: "6px" }} />

            {/* Title */}
            <div
              style={{
                textAlign: "center",
                marginBottom: "16px",
                paddingBottom: "6px",
                borderBottom: "2px solid #1a365d",
              }}
            >
              <div style={{ fontSize: "18px", fontWeight: "bold", color: "#1a365d", letterSpacing: "2px", textTransform: "uppercase" }}>
                Cumulative GPA Summary
              </div>
              <div style={{ fontSize: "13px", fontWeight: "bold", marginTop: "2px", color: "#2d3748" }}>
                {student.student_name || student.student_number}
              </div>
            </div>

            {/* Student info */}
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", marginBottom: "16px" }}>
              <tbody>
                <tr>
                  <td style={infoCellLabel}>Student Name</td>
                  <td style={infoCellValue}>{student.student_name || "-"}</td>
                  <td style={infoCellLabel}>Passport Number</td>
                  <td style={infoCellValue}>{student.passport_id || "-"}</td>
                </tr>
                <tr>
                  <td style={infoCellLabel}>Nationality</td>
                  <td style={infoCellValue}>{student.nationality_en || "-"}</td>
                  <td style={infoCellLabel}>Iqama Number</td>
                  <td style={infoCellValue}>{student.iqama_number || "-"}</td>
                </tr>
              </tbody>
            </table>

            {/* Cumulative GPA Table */}
            <div style={{ position: "relative" }}>
              {/* Watermark — uses <img> so it prints reliably */}
              {settings?.school_logo && (
                <div
                  style={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                    width: "55%",
                    height: "75%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    pointerEvents: "none",
                    zIndex: 2,
                  }}
                >
                  <img
                    src={settings.school_logo}
                    alt=""
                    style={{
                      maxWidth: "100%",
                      maxHeight: "100%",
                      objectFit: "contain",
                      opacity: 0.08,
                    }}
                  />
                </div>
              )}
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", marginBottom: "16px", position: "relative", zIndex: 1 }}>
              <thead>
                <tr style={{ backgroundColor: "#1a365d", color: "white" }}>
                  <th style={{ ...thStyle }}>Academic Year</th>
                  <th style={{ ...thStyle }}>Grade Level</th>
                  <th style={{ ...thStyle, width: "100px" }}>Average</th>
                  <th style={{ ...thStyle, width: "80px" }}>GPA</th>
                </tr>
              </thead>
              <tbody>
                {yearRows.map((r, idx) => (
                  <tr key={r.year} style={{ backgroundColor: idx % 2 === 0 ? "#fff" : "#f9fafb" }}>
                    <td style={tdCenter}>{r.year}</td>
                    <td style={tdCenter}>{r.className}</td>
                    <td style={tdCenter}>{r.avg}</td>
                    <td style={{ ...tdCenter, fontWeight: "bold" }}>{r.gpa}</td>
                  </tr>
                ))}
                <tr style={{ backgroundColor: "#1a365d", color: "white", fontWeight: "bold" }}>
                  <td style={{ ...tdCenter, color: "white", textAlign: "right" }} colSpan={3}>Cumulative GPA</td>
                  <td style={{ ...tdCenter, color: "white", fontSize: "16px" }}>{cumGPA}</td>
                </tr>
              </tbody>
            </table>
            </div>

            {/* Spacer to push signatures & footer to bottom */}
            <div style={{ flex: 1 }} />

            {/* Signatures */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: "8px",
                fontSize: "12px",
              }}
            >
              <div style={{ textAlign: "center", width: "45%" }}>
                <div style={{ borderBottom: "1px solid #000", marginBottom: "2px", height: "20px" }} />
                <div style={{ fontWeight: "bold" }}>School Principal</div>
                {schoolConfig?.principal && (
                  <div style={{ marginTop: "2px", fontSize: "11px" }}>{schoolConfig.principal}</div>
                )}
              </div>
              <div style={{ textAlign: "center", width: "45%" }}>
                <div style={{ borderBottom: "1px solid #000", marginBottom: "2px", height: "20px" }} />
                <div style={{ fontWeight: "bold" }}>Academic Director</div>
                {schoolConfig?.academic_director && (
                  <div style={{ marginTop: "2px", fontSize: "11px" }}>{schoolConfig.academic_director}</div>
                )}
              </div>
            </div>

            {/* Date & stamp */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: "6px",
                fontSize: "10px",
                color: "#666",
              }}
            >
              <div>Date: _______________</div>
              <div>&nbsp;</div>
            </div>

            {/* Footer */}
            <div style={{ marginTop: "auto", borderTop: "1px solid #e2e8f0", paddingTop: "4px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "16px", marginBottom: "3px" }}>
                {settings?.lwis_logo && (
                  <img src={settings.lwis_logo} alt="LWIS Network" style={{ height: "28px", mixBlendMode: "multiply" }} />
                )}
                {settings?.ib_logo && (
                  <img src={settings.ib_logo} alt="IB" style={{ height: "28px", mixBlendMode: "multiply" }} />
                )}
              </div>
              <div style={{ display: "flex", justifyContent: "center", gap: "24px", fontSize: "8px", color: "#444", marginBottom: "3px", flexWrap: "wrap" }}>
                <span>📞 +966 920033901</span>
                <span>✉ info@kis-riyadh.com</span>
                <span>🌐 www.kis-riyadh.com</span>
                <span>📍 Prince Fawaz Ben Abdel Aziz Street, Nahda Road, P.O.Box 148, Riyadh, KSA</span>
              </div>
              <div
                style={{
                  background: "linear-gradient(135deg, #1a365d 0%, #2d6a8a 50%, #b8860b 100%)",
                  color: "white",
                  textAlign: "center",
                  padding: "3px 0",
                  fontSize: "9px",
                  fontStyle: "italic",
                  letterSpacing: "1px",
                  borderRadius: "2px",
                }}
              >
                &ldquo;we measure success one happy learner at a time&rdquo;
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Style constants                                                    */
/* ------------------------------------------------------------------ */
const infoCellLabel: React.CSSProperties = {
  padding: "4px 8px",
  fontWeight: "bold",
  width: "30%",
  borderBottom: "1px solid #e2e8f0",
  fontSize: "12px",
  whiteSpace: "nowrap",
};

const infoCellValue: React.CSSProperties = {
  padding: "4px 8px",
  width: "70%",
  borderBottom: "1px solid #e2e8f0",
  fontSize: "12px",
};

const thStyle: React.CSSProperties = {
  padding: "6px 8px",
  textAlign: "center",
  borderBottom: "2px solid #2d3748",
  fontSize: "12px",
  fontWeight: "bold",
  lineHeight: 1.3,
};

const tdSubject: React.CSSProperties = {
  padding: "4px 8px",
  borderBottom: "1px solid #e2e8f0",
  borderRight: "1px solid #e2e8f0",
};

const tdCenter: React.CSSProperties = {
  padding: "4px 6px",
  textAlign: "center",
  borderBottom: "1px solid #e2e8f0",
  borderRight: "1px solid #e2e8f0",
};

const scaleThStyle: React.CSSProperties = {
  padding: "4px 10px",
  border: "1px solid #cbd5e0",
  fontWeight: "bold",
  fontSize: "11px",
};

const scaleTdStyle: React.CSSProperties = {
  padding: "3px 10px",
  border: "1px solid #cbd5e0",
  fontSize: "11px",
};

const GRADING_SCALE = [
  { range: "90–100", letter: "A", points: "4" },
  { range: "80–89", letter: "B", points: "3" },
  { range: "70–79", letter: "C", points: "2" },
  { range: "60–69", letter: "D", points: "1" },
  { range: "Below 60", letter: "F", points: "0" },
];
