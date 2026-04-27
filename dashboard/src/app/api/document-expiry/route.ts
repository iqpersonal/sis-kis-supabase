import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { CACHE_SHORT } from "@/lib/cache-headers";
import { verifyAdmin } from "@/lib/api-auth";
import { getCached, setCache } from "@/lib/cache";

/**
 * GET /api/document-expiry
 *   ?filter=all|expired|expiring-30|expiring-60|expiring-90|missing
 *   &year=25-26  &school=0021-01
 * POST /api/document-expiry — update expiry dates for a student
 */

export async function GET(req: NextRequest) {
  const filter = req.nextUrl.searchParams.get("filter") || "all";
  const yearParam = req.nextUrl.searchParams.get("year") || "25-26";
  const schoolParam = req.nextUrl.searchParams.get("school");

  const supabase = createServiceClient();

  try {
    const regCacheKey = `doc-expiry-regs:${yearParam}:${schoolParam || "all"}`;
    let regMap = getCached<Map<string, { class_name: string }>>(regCacheKey);

    if (!regMap) {
      let regQuery = supabase
        .from("registrations")
        .select("Student_Number, E_Class_Desc, School_Code")
        .eq("School_Year", yearParam)
        .limit(50000);

      if (schoolParam) regQuery = regQuery.eq("School_Code", schoolParam);

      const { data: regs } = await regQuery;
      regMap = new Map<string, { class_name: string }>();
      for (const row of regs ?? []) {
        const r = row as Record<string, unknown>;
        const sn = String(r["Student_Number"] || "");
        if (sn && !regMap.has(sn)) {
          regMap.set(sn, { class_name: String(r["E_Class_Desc"] || "") });
        }
      }
      setCache(regCacheKey, regMap);
    }

    const studentNumbers = Array.from(regMap.keys());
    const progressMap = new Map<string, {
      student_name: string; student_name_ar: string; gender: string;
      passport_id: string; iqama_number: string;
      passport_expiry: string | null; iqama_expiry: string | null;
    }>();

    for (let i = 0; i < studentNumbers.length; i += 500) {
      const batch = studentNumbers.slice(i, i + 500);
      const { data: rows } = await supabase
        .from("student_progress")
        .select("student_number, student_name, student_name_ar, gender, passport_id, iqama_number, passport_expiry, iqama_expiry")
        .in("student_number", batch);
      for (const row of rows ?? []) {
        const d = row as Record<string, unknown>;
        progressMap.set(String(d["student_number"]), {
          student_name: String(d["student_name"] || ""),
          student_name_ar: String(d["student_name_ar"] || ""),
          gender: String(d["gender"] || ""),
          passport_id: String(d["passport_id"] || ""),
          iqama_number: String(d["iqama_number"] || ""),
          passport_expiry: (d["passport_expiry"] as string) || null,
          iqama_expiry: (d["iqama_expiry"] as string) || null,
        });
      }
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    type StudentRow = {
      student_number: string; student_name: string; student_name_ar: string;
      gender: string; class_name: string; passport_id: string; iqama_number: string;
      passport_expiry: string | null; iqama_expiry: string | null;
      passport_status: "valid" | "expiring" | "expired" | "missing" | "no-expiry";
      iqama_status: "valid" | "expiring" | "expired" | "missing" | "no-expiry";
      days_to_passport_expiry: number | null; days_to_iqama_expiry: number | null;
    };

    const students: StudentRow[] = [];
    for (const sn of studentNumbers) {
      const reg = regMap.get(sn)!;
      const prog = progressMap.get(sn);
      const passportId = prog?.passport_id || "";
      const iqamaNum = prog?.iqama_number || "";
      const passportExpiry = prog?.passport_expiry || null;
      const iqamaExpiry = prog?.iqama_expiry || null;
      const passportStatus = getDocStatus(passportId, passportExpiry, today);
      const iqamaStatus = getDocStatus(iqamaNum, iqamaExpiry, today);
      const daysToPassport = passportExpiry ? daysBetween(today, new Date(passportExpiry)) : null;
      const daysToIqama = iqamaExpiry ? daysBetween(today, new Date(iqamaExpiry)) : null;

      if (filter !== "all" && !checkFilter(filter, passportStatus, iqamaStatus, daysToPassport, daysToIqama)) continue;

      students.push({
        student_number: sn,
        student_name: prog?.student_name || "",
        student_name_ar: prog?.student_name_ar || "",
        gender: prog?.gender || "",
        class_name: reg.class_name,
        passport_id: passportId, iqama_number: iqamaNum,
        passport_expiry: passportExpiry, iqama_expiry: iqamaExpiry,
        passport_status: passportStatus, iqama_status: iqamaStatus,
        days_to_passport_expiry: daysToPassport, days_to_iqama_expiry: daysToIqama,
      });
    }

    students.sort((a, b) => {
      const pA = statusPriority(a.passport_status, a.iqama_status);
      const pB = statusPriority(b.passport_status, b.iqama_status);
      if (pA !== pB) return pA - pB;
      const dA = Math.min(a.days_to_passport_expiry ?? 99999, a.days_to_iqama_expiry ?? 99999);
      const dB = Math.min(b.days_to_passport_expiry ?? 99999, b.days_to_iqama_expiry ?? 99999);
      return dA - dB;
    });

    const summary = {
      total: studentNumbers.length,
      expired: students.filter((s) => s.passport_status === "expired" || s.iqama_status === "expired").length,
      expiring_30: students.filter((s) => (s.passport_status === "expiring" && (s.days_to_passport_expiry ?? 999) <= 30) || (s.iqama_status === "expiring" && (s.days_to_iqama_expiry ?? 999) <= 30)).length,
      expiring_60: students.filter((s) => (s.passport_status === "expiring" && (s.days_to_passport_expiry ?? 999) <= 60) || (s.iqama_status === "expiring" && (s.days_to_iqama_expiry ?? 999) <= 60)).length,
      expiring_90: students.filter((s) => (s.passport_status === "expiring" && (s.days_to_passport_expiry ?? 999) <= 90) || (s.iqama_status === "expiring" && (s.days_to_iqama_expiry ?? 999) <= 90)).length,
      missing_passport: students.filter((s) => s.passport_status === "missing").length,
      missing_iqama: students.filter((s) => s.iqama_status === "missing").length,
      no_expiry_set: students.filter((s) => s.passport_status === "no-expiry" || s.iqama_status === "no-expiry").length,
    };

    return NextResponse.json({ students, summary }, { headers: CACHE_SHORT });
  } catch (err) {
    console.error("Document expiry fetch error:", err);
    return NextResponse.json({ error: "Failed to fetch document expiry data" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await verifyAdmin(req);
  if (!auth.ok) return auth.response;

  const supabase = createServiceClient();

  try {
    const body = await req.json();
    const { studentNumber, passport_expiry, iqama_expiry } = body;

    if (!studentNumber) return NextResponse.json({ error: "studentNumber is required" }, { status: 400 });

    const { data, error } = await supabase
      .from("student_progress")
      .select("student_number")
      .eq("student_number", studentNumber.trim())
      .maybeSingle();

    if (error || !data) return NextResponse.json({ error: "Student not found" }, { status: 404 });

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (passport_expiry !== undefined) updateData.passport_expiry = passport_expiry || null;
    if (iqama_expiry !== undefined) updateData.iqama_expiry = iqama_expiry || null;

    await supabase.from("student_progress").update(updateData).eq("student_number", studentNumber.trim());

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Document expiry update error:", err);
    return NextResponse.json({ error: "Failed to update document expiry" }, { status: 500 });
  }
}

function daysBetween(from: Date, to: Date): number {
  return Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

function getDocStatus(docNumber: string, expiryDate: string | null, today: Date): "valid" | "expiring" | "expired" | "missing" | "no-expiry" {
  if (!docNumber) return "missing";
  if (!expiryDate) return "no-expiry";
  const expiry = new Date(expiryDate);
  if (isNaN(expiry.getTime())) return "no-expiry";
  const days = daysBetween(today, expiry);
  if (days < 0) return "expired";
  if (days <= 90) return "expiring";
  return "valid";
}

function checkFilter(filter: string, ps: string, is2: string, dp: number | null, di: number | null): boolean {
  if (filter === "expired") return ps === "expired" || is2 === "expired";
  if (filter === "expiring-30") return (ps === "expiring" && (dp ?? 999) <= 30) || (is2 === "expiring" && (di ?? 999) <= 30);
  if (filter === "expiring-60") return (ps === "expiring" && (dp ?? 999) <= 60) || (is2 === "expiring" && (di ?? 999) <= 60);
  if (filter === "expiring-90") return (ps === "expiring" && (dp ?? 999) <= 90) || (is2 === "expiring" && (di ?? 999) <= 90);
  if (filter === "missing") return ps === "missing" || is2 === "missing";
  return true;
}

function statusPriority(ps: string, is2: string): number {
  const priorities: Record<string, number> = { expired: 0, expiring: 1, missing: 2, "no-expiry": 3, valid: 4 };
  return Math.min(priorities[ps] ?? 4, priorities[is2] ?? 4);
}
