import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { CACHE_SHORT } from "@/lib/cache-headers";
import { compareAlphabeticalNames } from "@/lib/name-sort";

/**
 * GET /api/attendance?date=YYYY-MM-DD&classCode=XX&sectionCode=XX&year=XX-XX&school=XXXX-XX
 *   → Returns attendance records for a specific date + class
 *
 * GET /api/attendance?studentNumber=XXX
 *   → Returns full attendance history for a student
 *
 * POST /api/attendance
 *   → Record/update attendance for a list of students on a given date
 *   Body: { date, classCode, sectionCode, year, school, records: [{studentNumber, status, note?}] }
 *   status: "present" | "absent" | "late" | "excused"
 */

// ── GET ────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const supabase = createServiceClient();
  const { searchParams } = req.nextUrl;
  const studentNumber = searchParams.get("studentNumber");

  try {
    // ── Single student history ──
    if (studentNumber) {
      const sn = studentNumber.trim();

      // 1. Get records from our attendance collection
      const { data: recordsData } = await supabase
        .from("daily_attendance")
        .select("*")
        .eq("student_number", sn)
        .order("date", { ascending: false })
        .limit(200);

      const records = (recordsData || []).map((d: Record<string, unknown>) => ({
        id: d.id,
        ...d,
      }));

      // 2. Also get legacy absence records from the mirrored student_absence collection
      const { data: absenceRows } = await supabase
        .from("student_absence")
        .select("*")
        .or(`student_number.eq.${sn},Student_Number.eq.${sn}`)
        .limit(500);

      const legacyRecords = (absenceRows || []).map((data: Record<string, unknown>) => {
        return {
          id: data.id,
          date: data.Absence_Date || "",
          status: "absent",
          days: data.No_of_Days || 1,
          reason_code: data.Absence_Reason_Code || "",
          year: data.Academic_Year || "",
          source: "legacy",
        };
      });

      // 3. Legacy tardy
      const { data: tardyRows } = await supabase
        .from("student_tardy")
        .select("*")
        .or(`student_number.eq.${sn},Student_Number.eq.${sn}`)
        .limit(500);

      const tardyRecords = (tardyRows || []).map((data: Record<string, unknown>) => {
        return {
          id: data.id,
          date: data.Tardy_date || data.Tardy_Date || "",
          status: "late",
          year: data.Academic_year || data.Academic_Year || "",
          source: "legacy",
        };
      });

      return NextResponse.json({
        records,
        legacy_absences: legacyRecords,
        legacy_tardies: tardyRecords,
      }, { headers: CACHE_SHORT });
    }

    // ── Class attendance for a date ──
    const date = searchParams.get("date");
    const classCode = searchParams.get("classCode");
    const year = searchParams.get("year");

    if (!date || !classCode) {
      return NextResponse.json(
        { error: "date and classCode are required (or use studentNumber)" },
        { status: 400 }
      );
    }

    // Fetch students in this class for the given year (from browse index)
    const sectionCode = searchParams.get("sectionCode") || "";
    const school = searchParams.get("school") || "";

    // Get students from browse index
    const { data: indexDoc } = await supabase
      .from("parent_config")
      .select("buckets")
      .eq("id", `browse_${year}`)
      .maybeSingle();

    const students: {
      student_number: string;
      student_name: string;
      gender: string;
      section: string;
    }[] = [];

    if (indexDoc) {
      const buckets = ((indexDoc as Record<string, unknown>)?.buckets ?? {}) as Record<
        string,
        { sn: string; name: string; gender: string; section: string }[]
      >;

      for (const [bucketKey, stuList] of Object.entries(buckets)) {
        const [bClass, bSection, bSchool] = bucketKey.split("__");
        if (bClass !== classCode) continue;
        if (sectionCode && sectionCode !== "all" && bSection !== sectionCode)
          continue;
        if (school && school !== "all" && bSchool !== school) continue;

        for (const s of stuList) {
          students.push({
            student_number: s.sn,
            student_name: s.name,
            gender: s.gender,
            section: s.section || bSection,
          });
        }
      }
    }

    students.sort((a, b) => compareAlphabeticalNames(a.student_name, b.student_name));

    // Fetch existing attendance records for this date + class
    const { data: attendanceRows } = await supabase
      .from("daily_attendance")
      .select("*")
      .eq("date", date)
      .eq("class_code", classCode);

    const attendanceMap = new Map<
      string,
      { status: string; note: string; id: string }
    >();
    for (const row of attendanceRows || []) {
      const d = row as Record<string, unknown>;
      if (sectionCode && sectionCode !== "all" && d.section_code !== sectionCode)
        continue;
      attendanceMap.set(String(d.student_number || ""), {
        status: String(d.status || "not-recorded"),
        note: String(d.note || ""),
        id: String(d.id || ""),
      });
    }

    // Merge students with attendance
    const result = students.map((s) => {
      const att = attendanceMap.get(s.student_number);
      return {
        student_number: s.student_number,
        student_name: s.student_name,
        gender: s.gender,
        section: s.section,
        status: att?.status || "not-recorded",
        note: att?.note || "",
        record_id: att?.id || null,
      };
    });

    return NextResponse.json({
      date,
      class_code: classCode,
      students: result,
      total: result.length,
      recorded: result.filter((r) => r.status !== "not-recorded").length,
    }, { headers: CACHE_SHORT });
  } catch (err) {
    console.error("Attendance GET error:", err);
    return NextResponse.json(
      { error: "Failed to fetch attendance data" },
      { status: 500 }
    );
  }
}

// ── POST ───────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const supabase = createServiceClient();
  try {
    const body = await req.json();
    const {
      date,
      classCode,
      sectionCode,
      year,
      school,
      records,
    } = body as {
      date: string;
      classCode: string;
      sectionCode?: string;
      year?: string;
      school?: string;
      records: {
        studentNumber: string;
        studentName?: string;
        status: "present" | "absent" | "late" | "excused";
        note?: string;
      }[];
    };

    if (!date || !classCode || !records || records.length === 0) {
      return NextResponse.json(
        { error: "date, classCode, and records are required" },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    let created = 0;
    let updated = 0;

    // Pre-fetch ALL existing records for this date + class in ONE query (eliminates N+1)
    const { data: existingRows } = await supabase
      .from("daily_attendance")
      .select("id, student_number")
      .eq("date", date)
      .eq("class_code", classCode);
    const existingMap = new Map<string, string>();
    for (const row of existingRows || []) {
      const r = row as Record<string, unknown>;
      existingMap.set(String(r.student_number || ""), String(r.id || ""));
    }

    const upserts: Record<string, unknown>[] = [];

    for (const r of records) {
      const existingId = existingMap.get(r.studentNumber);
      if (existingId) {
        upserts.push({
          id: existingId,
          date,
          student_number: r.studentNumber,
          class_code: classCode,
          section_code: sectionCode || "",
          year: year || "",
          school: school || "",
          status: r.status,
          note: r.note || "",
          updated_at: now,
        });
        updated++;
      } else {
        upserts.push({
          date,
          student_number: r.studentNumber,
          student_name: r.studentName || "",
          class_code: classCode,
          section_code: sectionCode || "",
          year: year || "",
          school: school || "",
          status: r.status,
          note: r.note || "",
          created_at: now,
          updated_at: now,
        });
        created++;
      }
    }

    if (upserts.length > 0) {
      const { error: upsertErr } = await supabase.from("daily_attendance").upsert(upserts, {
        onConflict: "id",
      });
      if (upsertErr) throw upsertErr;
    }

    return NextResponse.json({
      success: true,
      created,
      updated,
      total: records.length,
    });
  } catch (err) {
    console.error("Attendance POST error:", err);
    return NextResponse.json(
      { error: "Failed to save attendance records" },
      { status: 500 }
    );
  }
}
