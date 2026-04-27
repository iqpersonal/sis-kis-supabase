import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { CACHE_PRIVATE } from "@/lib/cache-headers";

export async function GET(req: NextRequest) {
  const studentNumber = req.nextUrl.searchParams.get("studentNumber");
  if (!studentNumber) return NextResponse.json({ error: "studentNumber is required" }, { status: 400 });

  try {
    const supabase = createServiceClient();
    const sn = studentNumber.trim();

    const [{ data: absenceRows }, { data: tardyRows }, { data: dailyRows }] = await Promise.all([
      supabase.from("student_absence").select("absence_date, no_of_days, absence_reason_code, absence_reason_desc, year_code").eq("student_number", sn).limit(200),
      supabase.from("student_tardy").select("tardy_date, tardy_reason_code, tardy_reason_desc, year_code").eq("student_number", sn).limit(200),
      supabase.from("daily_attendance").select("date, status, note, class_code").eq("student_number", sn).limit(200),
    ]);

    const absences = (absenceRows ?? []).map((d) => {
      const r = d as Record<string, unknown>;
      return { date: String(r["absence_date"] || ""), days: Number(r["no_of_days"] ?? 1), reason: String(r["absence_reason_code"] || ""), reason_desc: String(r["absence_reason_desc"] || r["absence_reason_code"] || ""), year: String(r["year_code"] || "") };
    });

    const tardies = (tardyRows ?? []).map((d) => {
      const r = d as Record<string, unknown>;
      return { date: String(r["tardy_date"] || ""), reason: String(r["tardy_reason_code"] || ""), reason_desc: String(r["tardy_reason_desc"] || r["tardy_reason_code"] || ""), year: String(r["year_code"] || "") };
    });

    const dailyRecords = (dailyRows ?? []).map((d) => {
      const r = d as Record<string, unknown>;
      return { date: String(r["date"] || ""), status: String(r["status"] || ""), notes: String(r["note"] || ""), class_code: String(r["class_code"] || "") };
    });

    const totalAbsenceDays = absences.reduce((s, a) => s + (a.days || 1), 0);

    const monthlyAbsences = new Map<string, number>();
    for (const a of absences) if (a.date) monthlyAbsences.set(a.date.substring(0, 7), (monthlyAbsences.get(a.date.substring(0, 7)) || 0) + (a.days || 1));

    const monthlyTardies = new Map<string, number>();
    for (const t of tardies) if (t.date) monthlyTardies.set(t.date.substring(0, 7), (monthlyTardies.get(t.date.substring(0, 7)) || 0) + 1);

    const allMonths = new Set([...monthlyAbsences.keys(), ...monthlyTardies.keys()]);
    const monthlyBreakdown = Array.from(allMonths).sort().reverse().map((month) => ({ month, absences: monthlyAbsences.get(month) || 0, tardies: monthlyTardies.get(month) || 0 }));

    const yearAbsences = new Map<string, number>();
    for (const a of absences) if (a.year) yearAbsences.set(a.year, (yearAbsences.get(a.year) || 0) + (a.days || 1));

    const yearTardies = new Map<string, number>();
    for (const t of tardies) if (t.year) yearTardies.set(t.year, (yearTardies.get(t.year) || 0) + 1);

    const allYears = new Set([...yearAbsences.keys(), ...yearTardies.keys()]);
    const yearlyBreakdown = Array.from(allYears).sort().reverse().map((year) => ({ year, absences: yearAbsences.get(year) || 0, tardies: yearTardies.get(year) || 0 }));

    return NextResponse.json({
      student_number: sn,
      summary: { total_absence_days: totalAbsenceDays, total_tardy_days: tardies.length },
      monthly_breakdown: monthlyBreakdown,
      yearly_breakdown: yearlyBreakdown,
      absences: absences.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 50),
      tardies: tardies.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 50),
      daily_records: dailyRecords.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 50),
    }, { headers: CACHE_PRIVATE });
  } catch (err) {
    console.error("Parent attendance error:", err);
    return NextResponse.json({ error: "Failed to fetch attendance data" }, { status: 500 });
  }
}
