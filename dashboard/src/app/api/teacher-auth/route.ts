import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { verifyPassword, hashPassword } from "@/lib/password";

/**
 * POST /api/teacher-auth
 * Body: { username: string, password: string }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { username, password } = body as { username?: string; password?: string };

    if (!username || !password) {
      return NextResponse.json({ error: "Username and password required" }, { status: 400 });
    }

    const trimmedUsername = username.trim().toLowerCase();
    const trimmedPassword = password.trim();
    const supabase = createServiceClient();

    // Look up by username (role=teacher)
    const { data: byUsername } = await supabase
      .from("admin_users")
      .select("*")
      .eq("username", trimmedUsername)
      .eq("role", "teacher")
      .limit(1);

    let teacherRow: Record<string, unknown> | null = byUsername?.[0] ?? null;
    let teacherUid: string | null = teacherRow ? String(teacherRow.id) : null;

    if (!teacherRow) {
      const { data: byEmail } = await supabase
        .from("admin_users")
        .select("*")
        .eq("email", trimmedUsername)
        .eq("role", "teacher")
        .limit(1);
      teacherRow = byEmail?.[0] ?? null;
      teacherUid = teacherRow ? String(teacherRow.id) : null;
    }

    if (!teacherRow || !teacherUid) {
      return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
    }

    if (teacherRow.password_hash) {
      const { match, needsUpgrade } = await verifyPassword(trimmedPassword, String(teacherRow.password_hash));
      if (!match) {
        return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
      }
      if (needsUpgrade) {
        const hashed = await hashPassword(trimmedPassword);
        await supabase.from("admin_users").update({ password_hash: hashed }).eq("id", teacherUid);
      }
    }

    const teacher = {
      uid: teacherUid,
      email: teacherRow.email || "",
      displayName: teacherRow.display_name || "",
      firstName: teacherRow.first_name || "",
      lastName: teacherRow.last_name || "",
      username: teacherRow.username || "",
      grade: teacherRow.grade || "",
      schoolYear: teacherRow.school_year || "",
      role: teacherRow.role,
    };

    return NextResponse.json({ teacher });
  } catch (err) {
    console.error("Teacher auth error:", err);
    return NextResponse.json({ error: "Authentication failed" }, { status: 500 });
  }
}
