import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { CACHE_PRIVATE } from "@/lib/cache-headers";

/**
 * GET /api/parent/attendance?studentNumber=12345
 * Returns attendance records for a specific student (for parent portal).
 * Pulls from:
 *   - student_absence collection (legacy SQL data)
 *   - student_tardy collection (legacy SQL data)
 *   - daily_attendance collection (new daily records)
 */
export async function GET(req: NextRequest) {
  const studentNumber = req.nextUrl.searchParams.get("studentNumber");
  if (!studentNumber) {
    return NextResponse.json(
      { error: "studentNumber is required" },
      { status: 400 }
    );
  }

  try {
    // ── 1. Legacy absence data (no orderBy to avoid composite index requirement) ──
    const absenceSnap = await adminDb
      .collection("student_absence")
      .where("Student_Number", "==", studentNumber)
      .limit(200)
      .get();

    const absences = absenceSnap.docs.map((doc) => {
      const d = doc.data();
      return {
        date: d.Absence_Date || "",
        days: d.No_of_Days ?? 1,
        reason: d.Absence_Reason_Code || "",
        reason_desc: d.Absence_Reason_Desc || d.Absence_Reason_Code || "",
        year: d.Year_Code || "",
      };
    });

    // ── 2. Legacy tardy data (no orderBy to avoid composite index requirement) ──
    const tardySnap = await adminDb
      .collection("student_tardy")
      .where("Student_Number", "==", studentNumber)
      .limit(200)
      .get();

    const tardies = tardySnap.docs.map((doc) => {
      const d = doc.data();
      return {
        date: d.Tardy_Date || "",
        reason: d.Tardy_Reason_Code || "",
        reason_desc: d.Tardy_Reason_Desc || d.Tardy_Reason_Code || "",
        year: d.Year_Code || "",
      };
    });

    // ── 3. New daily attendance (no orderBy to avoid composite index requirement) ──
    const dailySnap = await adminDb
      .collection("daily_attendance")
      .where("student_number", "==", studentNumber)
      .limit(200)
      .get();

    const dailyRecords = dailySnap.docs.map((doc) => {
      const d = doc.data();
      return {
        date: d.date || "",
        status: d.status || "",
        notes: d.notes || "",
        class_code: d.class_code || "",
      };
    });

    // ── 4. Calculate summaries ──
    const totalAbsenceDays = absences.reduce((sum, a) => sum + (a.days || 1), 0);
    const totalTardyDays = tardies.length;

    // Monthly breakdown
    const monthlyAbsences = new Map<string, number>();
    for (const a of absences) {
      if (a.date) {
        const month = a.date.substring(0, 7); // YYYY-MM
        monthlyAbsences.set(month, (monthlyAbsences.get(month) || 0) + (a.days || 1));
      }
    }
    const monthlyTardies = new Map<string, number>();
    for (const t of tardies) {
      if (t.date) {
        const month = t.date.substring(0, 7);
        monthlyTardies.set(month, (monthlyTardies.get(month) || 0) + 1);
      }
    }

    // Merge monthly keys
    const allMonths = new Set([...monthlyAbsences.keys(), ...monthlyTardies.keys()]);
    const monthlyBreakdown = Array.from(allMonths)
      .sort()
      .reverse()
      .map((month) => ({
        month,
        absences: monthlyAbsences.get(month) || 0,
        tardies: monthlyTardies.get(month) || 0,
      }));

    // By year
    const yearAbsences = new Map<string, number>();
    for (const a of absences) {
      if (a.year) {
        yearAbsences.set(a.year, (yearAbsences.get(a.year) || 0) + (a.days || 1));
      }
    }
    const yearTardies = new Map<string, number>();
    for (const t of tardies) {
      if (t.year) {
        yearTardies.set(t.year, (yearTardies.get(t.year) || 0) + 1);
      }
    }
    const allYears = new Set([...yearAbsences.keys(), ...yearTardies.keys()]);
    const yearlyBreakdown = Array.from(allYears)
      .sort()
      .reverse()
      .map((year) => ({
        year,
        absences: yearAbsences.get(year) || 0,
        tardies: yearTardies.get(year) || 0,
      }));

    return NextResponse.json({
      student_number: studentNumber,
      summary: {
        total_absence_days: totalAbsenceDays,
        total_tardy_days: totalTardyDays,
      },
      monthly_breakdown: monthlyBreakdown,
      yearly_breakdown: yearlyBreakdown,
      absences: absences.sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 50),
      tardies: tardies.sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 50),
      daily_records: dailyRecords.sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 50),
    }, { headers: CACHE_PRIVATE });
  } catch (err) {
    console.error("Parent attendance error:", err);
    return NextResponse.json(
      { error: "Failed to fetch attendance data" },
      { status: 500 }
    );
  }
}
