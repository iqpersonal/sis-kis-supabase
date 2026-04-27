import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";

/* ── Auth ─────────────────────────────────────────────────────── */
async function verifyAccess(req: NextRequest) {
  const supabase = createServiceClient();
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;
  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(authHeader.slice(7));
    if (error || !user) return false;

    const { data: profile } = await supabase
      .from("admin_users")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (!profile) return false;
    const role = profile.role;
    return ["super_admin", "school_admin", "academic_director"].includes(role);
  } catch {
    return false;
  }
}

/* ── Types ─────────────────────────────────────────────────────── */
interface SeatAssignment {
  row: number;
  col: number;
  studentNumber: string;
  studentName: string;
  className: string;
  section: string;
  classKey: string; // className + section for adjacency check
}

interface HallPlan {
  hallId: string;
  hallName: string;
  rows: number;
  columns: number;
  proctors: { uid: string; name: string; email: string }[];
  seats: (SeatAssignment | null)[][];
  studentCount: number;
}

// Grade group → class code ranges
const GRADE_GROUPS: Record<string, number[]> = {
  junior: [21, 22, 23, 24, 25], // Gr 4–8 (class codes 21-25)
  high: [26, 27, 28, 29],       // Gr 9–12 (class codes 26-29)
  all: [21, 22, 23, 24, 25, 26, 27, 28, 29],
};

/* ── POST: Generate seating plan ─────────────────────────────── */
export async function POST(req: NextRequest) {
  if (!(await verifyAccess(req)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const supabase = createServiceClient();
    const body = await req.json();
    const { scheduleId, campus } = body as { scheduleId: string; campus: string };

    if (!scheduleId || !campus) {
      return NextResponse.json({ error: "scheduleId and campus required" }, { status: 400 });
    }

    // 1. Load schedule
    const { data: schedule, error: schedErr } = await supabase
      .from("exam_schedules")
      .select("*")
      .eq("id", scheduleId)
      .maybeSingle();
    if (schedErr) throw schedErr;
    if (!schedule) {
      return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
    }
    const { academicYear, gradeGroup, days } = schedule as {
      academicYear: string;
      gradeGroup: string;
      days: { date: string; subjectCode: string; subjectName: string }[];
    };

    // 2. Load active halls for this campus
    const { data: hallsRows, error: hallsErr } = await supabase
      .from("exam_halls")
      .select("*")
      .eq("campus", campus)
      .eq("isActive", true)
      .limit(500);
    if (hallsErr) throw hallsErr;

    const halls = (hallsRows || [])
      .map((d: Record<string, unknown>) => ({ id: d.id, ...d }))
      .sort((a: any, b: any) => (b.rows * b.columns) - (a.rows * a.columns)) as any[];

    if (halls.length === 0) {
      return NextResponse.json({ error: `No active halls for ${campus} campus` }, { status: 400 });
    }

    // 3. Load class code → grade name mapping
    const { data: classRows, error: classErr } = await supabase
      .from("classes")
      .select("Class_Code, class_code, E_Class_Desc, e_class_desc")
      .limit(500);
    if (classErr) throw classErr;
    const classMap = new Map<string, string>();
    for (const row of classRows || []) {
      const d = row as Record<string, unknown>;
      const classCode = String(d.Class_Code || d.class_code || "");
      if (!classCode) continue;
      classMap.set(classCode, String(d.E_Class_Desc || d.e_class_desc || `Class ${classCode}`));
    }

    // 4. Determine which class codes are in the grade group
    const validClassCodes = new Set((GRADE_GROUPS[gradeGroup] || GRADE_GROUPS.all).map(String));

    // 5. Load all registrations for this year + campus, filtered to grade group
    const majorCode = campus === "Boys" ? "0021-01" : "0021-02";
    const { data: regsRows, error: regsErr } = await supabase
      .from("registrations")
      .select("Student_Number, student_number, Class_Code, class_code, Section_Code, section_code, Termination_Date, termination_date, Major_Code, major_code, Academic_Year, academic_year")
      .or(`Academic_Year.eq.${academicYear},academic_year.eq.${academicYear}`)
      .or(`Major_Code.eq.${majorCode},major_code.eq.${majorCode}`)
      .limit(10000);
    if (regsErr) throw regsErr;

    // Build student list grouped by class+section
    const studentsByClassSection = new Map<string, { studentNumber: string; className: string; section: string }[]>();
    const studentNumbers = new Set<string>();

    for (const row of regsRows || []) {
      const d = row as Record<string, unknown>;
      if (d.Termination_Date || d.termination_date) continue;
      const classCode = String(d.Class_Code || d.class_code || "");
      if (!validClassCodes.has(classCode)) continue;

      const sn = String(d.Student_Number || d.student_number || "");
      if (!sn || studentNumbers.has(sn)) continue; // skip duplicates
      studentNumbers.add(sn);

      const className = classMap.get(classCode) || `Class ${classCode}`;
      const sectionCode = String(d.Section_Code || d.section_code || "");
      const key = `${classCode}__${sectionCode}`;

      if (!studentsByClassSection.has(key)) studentsByClassSection.set(key, []);
      studentsByClassSection.get(key)!.push({ studentNumber: sn, className, section: sectionCode });
    }

    // 6. Load student names (batch)
    const allSNs = [...studentNumbers];
    const nameMap = new Map<string, string>();
    for (let i = 0; i < allSNs.length; i += 100) {
      const batch = allSNs.slice(i, i + 100);
      const { data: bySnRows } = await supabase
        .from("student_progress")
        .select("id, student_number, student_name, full_name_en, STUDENT_NAME_EN")
        .in("student_number", batch);

      for (const row of bySnRows || []) {
        const s = row as Record<string, unknown>;
        const sn = String(s.student_number || "");
        if (!sn) continue;
        nameMap.set(sn, String(s.student_name || s.full_name_en || s.STUDENT_NAME_EN || sn));
      }

      const missing = batch.filter((sn) => !nameMap.has(sn));
      if (missing.length > 0) {
        const { data: byIdRows } = await supabase
          .from("student_progress")
          .select("id, student_name, full_name_en, STUDENT_NAME_EN")
          .in("id", missing);

        for (const row of byIdRows || []) {
          const s = row as Record<string, unknown>;
          const id = String(s.id || "");
          if (!id) continue;
          nameMap.set(id, String(s.student_name || s.full_name_en || s.STUDENT_NAME_EN || id));
        }
      }
    }

    // 7. Load section names (section_code → section name)
    const { data: sectionsRows, error: sectionsErr } = await supabase
      .from("sections")
      .select("Class_Code, class_code, Section_Code, section_code, E_Section_Name, e_section_name, Major_Code, major_code, Academic_Year, academic_year")
      .or(`Academic_Year.eq.${academicYear},academic_year.eq.${academicYear}`)
      .or(`Major_Code.eq.${majorCode},major_code.eq.${majorCode}`)
      .limit(2000);
    if (sectionsErr) throw sectionsErr;

    const sectionNameMap = new Map<string, string>();
    for (const row of sectionsRows || []) {
      const d = row as Record<string, unknown>;
      const classCode = String(d.Class_Code || d.class_code || "");
      const sectionCode = String(d.Section_Code || d.section_code || "");
      if (!classCode || !sectionCode) continue;
      sectionNameMap.set(`${classCode}__${sectionCode}`, String(d.E_Section_Name || d.e_section_name || sectionCode));
    }

    // 8. Load all teachers for proctor assignment
    const { data: teacherRows, error: teacherErr } = await supabase
      .from("admin_users")
      .select("id, email, displayName, display_name, assigned_classes")
      .eq("role", "teacher")
      .limit(2000);
    if (teacherErr) throw teacherErr;

    const allTeachers = (teacherRows || []).map((row) => {
      const data = row as Record<string, unknown>;
      const uid = String(data.id || "");
      const email = String(data.email || "");
      return {
        uid,
        name: String(data.displayName || data.display_name || email || uid),
        email,
        subjects: parseTeacherSubjects(Array.isArray(data.assigned_classes) ? (data.assigned_classes as any[]) : []),
      };
    });

    // Track proctor day counts for load balancing
    const proctorDayCount = new Map<string, number>();
    allTeachers.forEach((t) => proctorDayCount.set(t.uid, 0));

    // 9. Generate plans for each exam day
    const generatedPlans: any[] = [];

    for (const day of days) {
      // Get subjects being examined today
      const examinedSubject = day.subjectName;

      // Build interleaved student list from all class groups
      const classGroups = [...studentsByClassSection.entries()]
        .map(([key, students]) => ({
          key,
          students: students.map((s) => ({
            ...s,
            studentName: nameMap.get(s.studentNumber) || s.studentNumber,
            section: sectionNameMap.get(key) || s.section,
            classKey: key,
          })),
        }))
        .filter((g) => g.students.length > 0)
        .sort((a, b) => b.students.length - a.students.length); // largest first

      // Round-robin interleave
      const interleaved: (typeof classGroups[0]["students"][0])[] = [];
      const cursors = classGroups.map(() => 0);
      let remaining = classGroups.reduce((sum, g) => sum + g.students.length, 0);

      while (remaining > 0) {
        for (let g = 0; g < classGroups.length; g++) {
          if (cursors[g] < classGroups[g].students.length) {
            interleaved.push(classGroups[g].students[cursors[g]]);
            cursors[g]++;
            remaining--;
          }
        }
      }

      // Distribute into halls
      const hallPlans: HallPlan[] = [];
      let studentIdx = 0;

      for (const hall of halls) {
        if (studentIdx >= interleaved.length) break;

        const rows = hall.rows as number;
        const cols = hall.columns as number;
        const capacity = rows * cols;
        const hallStudents = interleaved.slice(studentIdx, studentIdx + capacity);
        studentIdx += hallStudents.length;

        // Fill grid and validate adjacency
        const grid: (SeatAssignment | null)[][] = Array.from({ length: rows }, () =>
          Array.from({ length: cols }, () => null)
        );

        // Initial placement
        let idx = 0;
        for (let r = 0; r < rows && idx < hallStudents.length; r++) {
          for (let c = 0; c < cols && idx < hallStudents.length; c++) {
            const s = hallStudents[idx];
            grid[r][c] = {
              row: r,
              col: c,
              studentNumber: s.studentNumber,
              studentName: s.studentName,
              className: s.className,
              section: s.section,
              classKey: s.classKey,
            };
            idx++;
          }
        }

        // Adjacency fix: swap conflicts (up to 3 passes)
        for (let pass = 0; pass < 3; pass++) {
          let swapped = false;
          for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
              if (!grid[r][c]) continue;
              if (hasAdjacentConflict(grid, r, c, rows, cols)) {
                // Try to find a non-conflicting swap target
                const fixed = trySwap(grid, r, c, rows, cols);
                if (fixed) swapped = true;
              }
            }
          }
          if (!swapped) break;
        }

        // Assign proctors
        const studentCount = hallStudents.length;
        const proctorsNeeded = studentCount > 30 ? 2 : 1;

        // Filter out teachers whose subject is being examined
        const availableProctors = allTeachers.filter(
          (t) => !t.subjects.has(examinedSubject)
        );

        // Sort by least proctoring days (load balance)
        availableProctors.sort(
          (a, b) => (proctorDayCount.get(a.uid) || 0) - (proctorDayCount.get(b.uid) || 0)
        );

        const assignedProctors: { uid: string; name: string; email: string }[] = [];
        const usedForThisDay = new Set<string>();

        for (const proctor of availableProctors) {
          if (assignedProctors.length >= proctorsNeeded) break;
          if (usedForThisDay.has(proctor.uid)) continue;

          assignedProctors.push({ uid: proctor.uid, name: proctor.name, email: proctor.email });
          usedForThisDay.add(proctor.uid);
          proctorDayCount.set(proctor.uid, (proctorDayCount.get(proctor.uid) || 0) + 1);
        }

        hallPlans.push({
          hallId: hall.id,
          hallName: hall.hallName,
          rows,
          columns: cols,
          proctors: assignedProctors,
          seats: grid,
          studentCount,
        });
      }

      // Mark all proctors used today so they aren't reused across halls on same day
      // (Already handled above per-hall with usedForThisDay + updating proctorDayCount)
      // But we need to track across halls for the same day:
      const allUsedToday = new Set<string>();
      // Re-do proctor assignment with cross-hall awareness:
      for (const hp of hallPlans) {
        hp.proctors = []; // reset
      }
      const availableForDay = allTeachers
        .filter((t) => !t.subjects.has(examinedSubject))
        .sort((a, b) => (proctorDayCount.get(a.uid) || 0) - (proctorDayCount.get(b.uid) || 0));

      let proctorIdx = 0;
      for (const hp of hallPlans) {
        const needed = hp.studentCount > 30 ? 2 : 1;
        const assigned: { uid: string; name: string; email: string }[] = [];
        while (assigned.length < needed && proctorIdx < availableForDay.length) {
          const p = availableForDay[proctorIdx];
          proctorIdx++;
          if (!allUsedToday.has(p.uid)) {
            assigned.push({ uid: p.uid, name: p.name, email: p.email });
            allUsedToday.add(p.uid);
            proctorDayCount.set(p.uid, (proctorDayCount.get(p.uid) || 0) + 1);
          }
        }
        hp.proctors = assigned;
      }

      // Save this day's plan
      const planId = crypto.randomUUID();
      const { error: planErr } = await supabase.from("exam_seating_plans").insert({
        id: planId,
        scheduleId,
        examDate: day.date,
        subjectName: day.subjectName,
        subjectCode: day.subjectCode || "",
        campus,
        gradeGroup,
        academicYear,
        halls: hallPlans.map((hp) => ({
          ...hp,
          seats: hp.seats.map((row) =>
            row.map((seat) =>
              seat
                ? {
                    row: seat.row,
                    col: seat.col,
                    studentNumber: seat.studentNumber,
                    studentName: seat.studentName,
                    className: seat.className,
                    section: seat.section,
                  }
                : null
            )
          ),
        })),
        totalStudents: hallPlans.reduce((sum, h) => sum + h.studentCount, 0),
        generatedAt: new Date().toISOString(),
      });
      if (planErr) throw planErr;

      generatedPlans.push({
        id: planId,
        examDate: day.date,
        subjectName: day.subjectName,
        hallCount: hallPlans.length,
        totalStudents: hallPlans.reduce((sum, h) => sum + h.studentCount, 0),
      });
    }

    return NextResponse.json({
      ok: true,
      plans: generatedPlans,
      totalDays: days.length,
    });
  } catch (err) {
    console.error("[exam-seating-generate] error:", err);
    return NextResponse.json({ error: "Failed to generate seating plan" }, { status: 500 });
  }
}

/* ── Helpers ──────────────────────────────────────────────────── */

/** Parse teacher subjects from assigned_classes array */
function parseTeacherSubjects(assignedClasses: any[]): Set<string> {
  const subjects = new Set<string>();
  for (const ac of assignedClasses) {
    if (!ac.subject) continue;
    // Format: "Math:5, Science:3" or "English"
    const parts = ac.subject.split(", ");
    for (const part of parts) {
      const name = part.split(":")[0].trim();
      if (name && name !== "undefined") subjects.add(name);
    }
  }
  return subjects;
}

/** Check if seat at (r,c) has a same-class neighbor in 8 directions */
function hasAdjacentConflict(
  grid: (SeatAssignment | null)[][],
  r: number,
  c: number,
  rows: number,
  cols: number
): boolean {
  const seat = grid[r][c];
  if (!seat) return false;

  const directions = [
    [-1, -1], [-1, 0], [-1, 1],
    [0, -1],           [0, 1],
    [1, -1],  [1, 0],  [1, 1],
  ];

  for (const [dr, dc] of directions) {
    const nr = r + dr;
    const nc = c + dc;
    if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
      const neighbor = grid[nr][nc];
      if (neighbor && neighbor.classKey === seat.classKey) return true;
    }
  }
  return false;
}

/** Try to swap seat at (r,c) with another to resolve adjacency conflict */
function trySwap(
  grid: (SeatAssignment | null)[][],
  r: number,
  c: number,
  rows: number,
  cols: number
): boolean {
  const seat = grid[r][c];
  if (!seat) return false;

  // Scan grid for a seat that would not create conflicts if swapped
  for (let tr = 0; tr < rows; tr++) {
    for (let tc = 0; tc < cols; tc++) {
      if (tr === r && tc === c) continue;
      const target = grid[tr][tc];
      if (!target) continue;
      if (target.classKey === seat.classKey) continue; // same class, no point

      // Test swap
      grid[r][c] = target;
      grid[tr][tc] = seat;

      const conflict1 = hasAdjacentConflict(grid, r, c, rows, cols);
      const conflict2 = hasAdjacentConflict(grid, tr, tc, rows, cols);

      if (!conflict1 && !conflict2) {
        // Swap resolved both — update row/col
        grid[r][c]!.row = r;
        grid[r][c]!.col = c;
        grid[tr][tc]!.row = tr;
        grid[tr][tc]!.col = tc;
        return true;
      }

      // Revert
      grid[r][c] = seat;
      grid[tr][tc] = target;
    }
  }
  return false;
}
