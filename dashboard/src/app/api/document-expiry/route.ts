import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { CACHE_SHORT } from "@/lib/cache-headers";
import { verifyAdmin } from "@/lib/api-auth";
/**
 * GET /api/document-expiry
 * Lists students with document status (passport, iqama) and expiry dates.
 * Supports filtering by status, academic year, and school/campus.
 *   ?filter=all|expired|expiring-30|expiring-60|expiring-90|missing
 *   &year=25-26
 *   &school=0021-01|0021-02
 *
 * POST /api/document-expiry
 * Updates expiry dates for a specific student.
 * Body: { studentNumber: string, passport_expiry?: string, iqama_expiry?: string }
 */

export async function GET(req: NextRequest) {
  const filter = req.nextUrl.searchParams.get("filter") || "all";
  const yearParam = req.nextUrl.searchParams.get("year") || "25-26";
  const schoolParam = req.nextUrl.searchParams.get("school");

  try {
    // Step 1: Query registrations (already indexed by year/school — fast)
    let regQuery: FirebaseFirestore.Query = adminDb
      .collection("registrations")
      .where("School_Year", "==", yearParam);

    if (schoolParam) {
      regQuery = regQuery.where("School_Code", "==", schoolParam);
    }

    const regSnap = await regQuery.select(
      "Student_Number",
      "E_Class_Desc",
      "School_Code"
    ).limit(50000).get();

    // Build map: student_number → class_name (deduplicated)
    const regMap = new Map<string, { class_name: string }>();
    for (const doc of regSnap.docs) {
      const d = doc.data();
      const sn = String(d.Student_Number || "");
      if (sn && !regMap.has(sn)) {
        regMap.set(sn, { class_name: d.E_Class_Desc || "" });
      }
    }

    const studentNumbers = Array.from(regMap.keys());

    // Step 2: Batch-fetch passport/iqama data from student_progress
    const progressMap = new Map<string, {
      student_name: string;
      student_name_ar: string;
      gender: string;
      passport_id: string;
      iqama_number: string;
      passport_expiry: string | null;
      iqama_expiry: string | null;
    }>();

    const BATCH_SIZE = 100;
    for (let i = 0; i < studentNumbers.length; i += BATCH_SIZE) {
      const batch = studentNumbers.slice(i, i + BATCH_SIZE);
      const refs = batch.map((sn) =>
        adminDb.collection("student_progress").doc(sn)
      );
      if (refs.length === 0) continue;
      const docs = await adminDb.getAll(...refs);
      for (const doc of docs) {
        if (!doc.exists) continue;
        const d = doc.data()!;
        progressMap.set(doc.id, {
          student_name: d.student_name || "",
          student_name_ar: d.student_name_ar || "",
          gender: d.gender || "",
          passport_id: d.passport_id || "",
          iqama_number: d.iqama_number || "",
          passport_expiry: d.passport_expiry || null,
          iqama_expiry: d.iqama_expiry || null,
        });
      }
    }

    // Step 3: Merge and compute statuses
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    type StudentRow = {
      student_number: string;
      student_name: string;
      student_name_ar: string;
      gender: string;
      class_name: string;
      passport_id: string;
      iqama_number: string;
      passport_expiry: string | null;
      iqama_expiry: string | null;
      passport_status: "valid" | "expiring" | "expired" | "missing" | "no-expiry";
      iqama_status: "valid" | "expiring" | "expired" | "missing" | "no-expiry";
      days_to_passport_expiry: number | null;
      days_to_iqama_expiry: number | null;
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

      if (filter !== "all") {
        if (!checkFilter(filter, passportStatus, iqamaStatus, daysToPassport, daysToIqama)) continue;
      }

      students.push({
        student_number: sn,
        student_name: prog?.student_name || "",
        student_name_ar: prog?.student_name_ar || "",
        gender: prog?.gender || "",
        class_name: reg.class_name,
        passport_id: passportId,
        iqama_number: iqamaNum,
        passport_expiry: passportExpiry,
        iqama_expiry: iqamaExpiry,
        passport_status: passportStatus,
        iqama_status: iqamaStatus,
        days_to_passport_expiry: daysToPassport,
        days_to_iqama_expiry: daysToIqama,
      });
    }

    // Sort: expired first, then expiring soonest, then missing, then valid
    students.sort((a, b) => {
      const priorityA = statusPriority(a.passport_status, a.iqama_status);
      const priorityB = statusPriority(b.passport_status, b.iqama_status);
      if (priorityA !== priorityB) return priorityA - priorityB;
      const daysA = Math.min(a.days_to_passport_expiry ?? 99999, a.days_to_iqama_expiry ?? 99999);
      const daysB = Math.min(b.days_to_passport_expiry ?? 99999, b.days_to_iqama_expiry ?? 99999);
      return daysA - daysB;
    });

    // Summary stats (over ALL matched students, not just filtered)
    const summary = {
      total: studentNumbers.length,
      expired: students.filter(
        (s) => s.passport_status === "expired" || s.iqama_status === "expired"
      ).length,
      expiring_30: students.filter(
        (s) =>
          (s.passport_status === "expiring" && (s.days_to_passport_expiry ?? 999) <= 30) ||
          (s.iqama_status === "expiring" && (s.days_to_iqama_expiry ?? 999) <= 30)
      ).length,
      expiring_60: students.filter(
        (s) =>
          (s.passport_status === "expiring" && (s.days_to_passport_expiry ?? 999) <= 60) ||
          (s.iqama_status === "expiring" && (s.days_to_iqama_expiry ?? 999) <= 60)
      ).length,
      expiring_90: students.filter(
        (s) =>
          (s.passport_status === "expiring" && (s.days_to_passport_expiry ?? 999) <= 90) ||
          (s.iqama_status === "expiring" && (s.days_to_iqama_expiry ?? 999) <= 90)
      ).length,
      missing_passport: students.filter((s) => s.passport_status === "missing").length,
      missing_iqama: students.filter((s) => s.iqama_status === "missing").length,
      no_expiry_set: students.filter(
        (s) => s.passport_status === "no-expiry" || s.iqama_status === "no-expiry"
      ).length,
    };

    return NextResponse.json({ students, summary }, { headers: CACHE_SHORT });
  } catch (err) {
    console.error("Document expiry fetch error:", err);
    return NextResponse.json(
      { error: "Failed to fetch document expiry data" },
      { status: 500 }
    );
  }
}

/**
 * POST: Update document expiry dates for a student
 */
export async function POST(req: NextRequest) {
  const auth = await verifyAdmin(req);
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();
    const { studentNumber, passport_expiry, iqama_expiry } = body;

    if (!studentNumber) {
      return NextResponse.json(
        { error: "studentNumber is required" },
        { status: 400 }
      );
    }

    const docRef = adminDb.collection("student_progress").doc(studentNumber.trim());
    const snap = await docRef.get();

    if (!snap.exists) {
      return NextResponse.json(
        { error: "Student not found" },
        { status: 404 }
      );
    }

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (passport_expiry !== undefined) {
      updateData.passport_expiry = passport_expiry || null;
    }

    if (iqama_expiry !== undefined) {
      updateData.iqama_expiry = iqama_expiry || null;
    }

    await docRef.update(updateData);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Document expiry update error:", err);
    return NextResponse.json(
      { error: "Failed to update document expiry" },
      { status: 500 }
    );
  }
}

/* ── Helpers ── */

function daysBetween(from: Date, to: Date): number {
  const diff = to.getTime() - from.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function getDocStatus(
  docNumber: string,
  expiryDate: string | null,
  today: Date
): "valid" | "expiring" | "expired" | "missing" | "no-expiry" {
  if (!docNumber) return "missing";
  if (!expiryDate) return "no-expiry";

  const expiry = new Date(expiryDate);
  if (isNaN(expiry.getTime())) return "no-expiry";

  const days = daysBetween(today, expiry);
  if (days < 0) return "expired";
  if (days <= 90) return "expiring";
  return "valid";
}

function statusPriority(
  passportStatus: string,
  iqamaStatus: string
): number {
  const priorities: Record<string, number> = {
    expired: 0,
    expiring: 1,
    missing: 2,
    "no-expiry": 3,
    valid: 4,
  };
  return Math.min(
    priorities[passportStatus] ?? 4,
    priorities[iqamaStatus] ?? 4
  );
}

function checkFilter(
  filter: string,
  passportStatus: string,
  iqamaStatus: string,
  daysToPassport: number | null,
  daysToIqama: number | null
): boolean {
  switch (filter) {
    case "expired":
      return passportStatus === "expired" || iqamaStatus === "expired";
    case "expiring-30":
      return (
        (passportStatus === "expiring" && (daysToPassport ?? 999) <= 30) ||
        (iqamaStatus === "expiring" && (daysToIqama ?? 999) <= 30)
      );
    case "expiring-60":
      return (
        (passportStatus === "expiring" && (daysToPassport ?? 999) <= 60) ||
        (iqamaStatus === "expiring" && (daysToIqama ?? 999) <= 60)
      );
    case "expiring-90":
      return (
        (passportStatus === "expiring" && (daysToPassport ?? 999) <= 90) ||
        (iqamaStatus === "expiring" && (daysToIqama ?? 999) <= 90)
      );
    case "missing":
      return passportStatus === "missing" || iqamaStatus === "missing";
    case "no-expiry":
      return passportStatus === "no-expiry" || iqamaStatus === "no-expiry";
    default:
      return true;
  }
}
