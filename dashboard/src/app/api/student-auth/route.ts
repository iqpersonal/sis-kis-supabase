import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { verifyPassword, hashPassword } from "@/lib/password";

/**
 * POST /api/student-auth
 * Body: { username: string, password: string }
 */
export async function POST(req: NextRequest) {
  try {
    const { username, password } = (await req.json()) as { username?: string; password?: string };

    if (!username || !password) {
      return NextResponse.json({ error: "Student number and password are required" }, { status: 400 });
    }

    const trimmedUsername = username.trim();
    const trimmedPassword = password.trim();
    const supabase = createServiceClient();

    const { data: rows } = await supabase
      .from("student_credentials")
      .select("*")
      .eq("username", trimmedUsername)
      .limit(1);

    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: "Invalid student number or password" }, { status: 401 });
    }

    const cred = rows[0] as Record<string, unknown>;

    const { match, needsUpgrade } = await verifyPassword(trimmedPassword, String(cred.password_hash || ""));
    if (!match) {
      return NextResponse.json({ error: "Invalid student number or password" }, { status: 401 });
    }

    if (needsUpgrade) {
      const hashed = await hashPassword(trimmedPassword);
      await supabase.from("student_credentials").update({ password_hash: hashed }).eq("student_number", cred.student_number);
    }

    const student = {
      student_number: cred.student_number || trimmedUsername,
      student_name: cred.student_name || "",
      gender: cred.gender || "",
      class_name: cred.class_name || "",
      section_name: cred.section_name || "",
      school: cred.school || "",
      family_number: cred.family_number || "",
      academic_year: cred.academic_year || "",
    };

    return NextResponse.json({ success: true, student });
  } catch (err) {
    console.error("Student auth error:", err);
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}
