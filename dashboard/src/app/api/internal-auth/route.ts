import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { verifyPassword, hashPassword } from "@/lib/password";

interface InternalAuthBody {
  identifier?: string;
  password?: string;
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function buildTeacherProfile(uid: string, row: Record<string, unknown>) {
  return {
    uid,
    email: row.email || "",
    displayName: row.display_name || "",
    firstName: row.first_name || "",
    lastName: row.last_name || "",
    username: row.username || "",
    grade: row.grade || "",
    schoolYear: row.school_year || "",
    role: row.role || "teacher",
    secondary_roles: Array.isArray(row.secondary_roles) ? row.secondary_roles : [],
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as InternalAuthBody;
    const identifier = (body.identifier || "").trim();
    const password = (body.password || "").trim();

    if (!identifier || !password) {
      return NextResponse.json(
        { ok: false, error: "Identifier and password are required" },
        { status: 400 }
      );
    }

    const normalized = normalizeEmail(identifier);
    const supabase = createServiceClient();

    // 1) Try admin_users by username then email
    const { data: byUsername } = await supabase
      .from("admin_users")
      .select("*")
      .eq("username", normalized)
      .limit(1);

    let userRow: Record<string, unknown> | null = byUsername?.[0] ?? null;

    if (!userRow) {
      const { data: byEmail } = await supabase
        .from("admin_users")
        .select("*")
        .eq("email", normalized)
        .limit(1);
      userRow = byEmail?.[0] ?? null;
    }

    if (userRow) {
      const userUid = String(userRow.id || "");
      const role = String(userRow.role || "viewer");

      if (role === "teacher") {
        const hasSecondaryRoles = Array.isArray(userRow.secondary_roles) && (userRow.secondary_roles as unknown[]).length > 0;
        const teacherEmail = String(userRow.email || "").trim().toLowerCase();

        if (!hasSecondaryRoles && userRow.password_hash) {
          const { match, needsUpgrade } = await verifyPassword(password, String(userRow.password_hash));
          if (match) {
            if (needsUpgrade) {
              const hashed = await hashPassword(password);
              await supabase.from("admin_users").update({ password_hash: hashed }).eq("id", userUid);
            }
            return NextResponse.json({
              ok: true,
              authMode: "teacher_local",
              target: "/teacher/dashboard",
              teacher: buildTeacherProfile(userUid, userRow),
            });
          }
        }

        if (!teacherEmail) {
          return NextResponse.json({ ok: false, error: "Invalid username or password" }, { status: 401 });
        }
        return NextResponse.json({
          ok: true,
          authMode: "firebase",
          target: "/teacher/dashboard",
          email: teacherEmail,
          teacher: buildTeacherProfile(userUid, userRow),
        });
      }

      const target = role === "staff" ? "/staff/dashboard" : "/dashboard";
      const email = String(userRow.email || "").trim().toLowerCase();
      if (!email) {
        return NextResponse.json({ ok: false, error: "Account is missing email" }, { status: 400 });
      }
      return NextResponse.json({ ok: true, authMode: "firebase", target, email });
    }

    // 2) Staff login by email
    if (normalized.includes("@")) {
      const { data: staffRows } = await supabase
        .from("staff")
        .select("id, \"E_Mail\"")
        .ilike("\"E_Mail\"", normalized)
        .limit(1);

      if (staffRows && staffRows.length > 0) {
        const staffEmail = String((staffRows[0] as Record<string, unknown>)["E_Mail"] || normalized).trim().toLowerCase();
        return NextResponse.json({
          ok: true,
          authMode: "firebase",
          target: "/staff/dashboard",
          email: staffEmail,
        });
      }
    }

    // 3) Parent (families) by username
    const { data: famRows } = await supabase
      .from("families")
      .select("*")
      .eq("username", identifier.trim())
      .limit(1);

    if (famRows && famRows.length > 0) {
      const fData = famRows[0] as Record<string, unknown>;
      const storedPwd = String(fData.password_hash || "");
      const { match } = await verifyPassword(password, storedPwd);
      if (match) {
        return NextResponse.json({
          ok: true,
          authMode: "parent_local",
          target: "/parent/dashboard",
          family: {
            family_number: fData.family_number || fData.id || "",
            username: fData.username || "",
            father_name: fData.father_name || "",
            family_name: fData.family_name || "",
            father_phone: fData.father_phone || "",
            father_email: fData.father_email || "",
            mother_phone: fData.mother_phone || "",
            mother_email: fData.mother_email || "",
            children: Array.isArray(fData.children) ? fData.children : [],
          },
        });
      }
      return NextResponse.json({ ok: false, error: "Invalid username or password" }, { status: 401 });
    }

    // 4) Student by username
    const { data: studRows } = await supabase
      .from("student_credentials")
      .select("*")
      .eq("username", identifier.trim())
      .limit(1);

    if (studRows && studRows.length > 0) {
      const sData = studRows[0] as Record<string, unknown>;
      const storedPwd = String(sData.password_hash || "");
      const { match, needsUpgrade } = await verifyPassword(password, storedPwd);
      if (!match) {
        return NextResponse.json({ ok: false, error: "Invalid username or password" }, { status: 401 });
      }
      if (needsUpgrade) {
        const hashed = await hashPassword(password);
        await supabase.from("student_credentials").update({ password_hash: hashed }).eq("student_number", sData.student_number);
      }
      return NextResponse.json({
        ok: true,
        authMode: "student_local",
        target: "/student/dashboard",
        student: {
          student_number: sData.student_number || identifier.trim(),
          student_name: sData.student_name || "",
          gender: sData.gender || "",
          class_name: sData.class_name || "",
          section_name: sData.section_name || "",
          school: sData.school || "",
          family_number: sData.family_number || "",
          academic_year: sData.academic_year || "",
        },
      });
    }

    return NextResponse.json({ ok: false, error: "Invalid username or password" }, { status: 401 });
  } catch (err) {
    console.error("Internal auth error:", err);
    return NextResponse.json({ ok: false, error: "Authentication failed" }, { status: 500 });
  }
}
