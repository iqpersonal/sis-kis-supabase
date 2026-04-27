import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { ROLES, type Role } from "@/lib/rbac";
import { sendEmail } from "@/lib/email-service";
import { bulkWelcomeEmail } from "@/lib/email-templates";
import { hashPassword } from "@/lib/password";

/**
 * POST /api/admin/users/bulk-upload
 * Body: { users: CsvRow[] }
 *
 * Creates Firebase Auth accounts and admin_users Firestore docs.
 * Only Super Admins can call this.
 */

interface CsvRow {
  SCHOOLYEAR: string;
  ROLE: string;
  FIRSTNAME: string;
  MIDDLENAME: string;
  LASTNAME: string;
  GRADE: string;
  USERNAME: string;
  PASSWORD: string;
  PRIMARYEMAIL: string;
  CLASSES?: string;
}

/** Map CSV ROLE codes → RBAC roles */
const ROLE_MAP: Record<string, Role> = {
  T: "teacher",
  A: "super_admin",
  AC: "academic",
  F: "finance",
  ACC: "accounts",
  R: "registrar",
  V: "viewer",
};

interface UploadResult {
  email: string;
  name: string;
  status: "created" | "updated" | "error";
  message?: string;
}

async function verifyCallerIsSuperAdmin(req: NextRequest) {
  const supabase = createServiceClient();
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;
  const token = authHeader.slice(7);
  try {
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser(token);
    if (authErr || !user) return false;

    const { data: caller } = await supabase
      .from("admin_users")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (caller) return caller.role === "super_admin";

    // First-admin bootstrap: if NO admin_users docs exist at all,
    // treat the current authenticated user as super_admin and create their doc.
    const { data: anyAdmin } = await supabase
      .from("admin_users")
      .select("id")
      .limit(1)
      .maybeSingle();
    if (!anyAdmin) {
      await supabase.from("admin_users").upsert({
        id: user.id,
        email: user.email || "",
        role: "super_admin",
        created_at: new Date().toISOString(),
      });
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const supabase = createServiceClient();
  const authorized = await verifyCallerIsSuperAdmin(req);
  if (!authorized) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const rows: CsvRow[] = body.users;

  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "No users provided" }, { status: 400 });
  }

  if (rows.length > 200) {
    return NextResponse.json(
      { error: "Maximum 200 users per upload" },
      { status: 400 }
    );
  }

  const results: UploadResult[] = [];

  const { data: usersList, error: usersErr } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (usersErr) {
    return NextResponse.json({ error: `Failed to read auth users: ${usersErr.message}` }, { status: 500 });
  }
  const existingByEmail = new Map(
    (usersList.users || [])
      .filter((u) => !!u.email)
      .map((u) => [String(u.email).toLowerCase(), u.id])
  );

  for (const row of rows) {
    const email = (row.PRIMARYEMAIL || "").trim().toLowerCase();
    const password = (row.PASSWORD || "").trim();
    const firstName = (row.FIRSTNAME || "").trim();
    const middleName = (row.MIDDLENAME || "").trim();
    const lastName = (row.LASTNAME || "").trim();
    const fullName = [firstName, middleName, lastName].filter(Boolean).join(" ");
    const roleCode = (row.ROLE || "").trim().toUpperCase();
    const role = ROLE_MAP[roleCode] || "teacher";
    const grade = (row.GRADE || "").trim();
    const username = (row.USERNAME || "").trim();
    const schoolYear = (row.SCHOOLYEAR || "").trim();
    const classIds = (row.CLASSES || "").trim();

    if (!email) {
      results.push({ email: email || "(empty)", name: fullName, status: "error", message: "Missing email" });
      continue;
    }

    if (!password || password.length < 6) {
      results.push({ email, name: fullName, status: "error", message: "Password must be at least 6 characters" });
      continue;
    }

    try {
      let uid: string;
      let action: "created" | "updated" = "created";

      // Try to get existing user first
      const existingUid = existingByEmail.get(email);
      if (existingUid) {
        uid = existingUid;
        const { error: updateErr } = await supabase.auth.admin.updateUserById(uid, {
          user_metadata: { display_name: fullName },
        });
        if (updateErr) throw updateErr;
        action = "updated";
      } else {
        // User doesn't exist → create new
        const { data: created, error: createErr } = await supabase.auth.admin.createUser({
          email,
          password,
          user_metadata: { display_name: fullName },
          email_confirm: true,
        });
        if (createErr || !created.user) throw createErr || new Error("Failed to create auth user");
        uid = created.user.id;
        existingByEmail.set(email, uid);
      }

      // Upsert admin_users doc
      const hashedPw = await hashPassword(password);
      const userDoc: Record<string, unknown> = {
          email,
          role,
          displayName: fullName,
          firstName,
          middleName,
          lastName,
          username,
          password: hashedPw,
          grade,
          schoolYear,
          updatedAt: new Date().toISOString(),
          ...(action === "created" ? { createdAt: new Date().toISOString() } : {}),
      };

      // If CLASSES column provided, resolve class IDs to assigned_classes
      if (classIds) {
        const ids = classIds.split(";").map((s) => s.trim()).filter(Boolean);
        if (ids.length > 0) {
          const { data: classRows } = await supabase
            .from("classes")
            .select("id, class_name, grade, section, subject_name, subject, year, academic_year")
            .in("id", ids);

          const assigned = (classRows || [])
            .map((cd: Record<string, unknown>) => {
              return {
                classId: String(cd.id || ""),
                className: cd.class_name || cd.grade || "",
                section: cd.section || "",
                subject: cd.subject_name || cd.subject || "",
                year: cd.year || cd.academic_year || "",
              };
            })
            .filter((a) => !!a.classId);
          userDoc.assigned_classes = assigned;
        }
      }

      const { error: upsertErr } = await supabase
        .from("admin_users")
        .upsert({ id: uid, ...userDoc }, { onConflict: "id" });
      if (upsertErr) throw upsertErr;

      // Send welcome email for newly created accounts (skip for teachers)
      if (action === "created" && role !== "teacher") {
        const tpl = bulkWelcomeEmail({
          displayName: fullName || email.split("@")[0],
          email,
          password,
          role,
        });
        sendEmail({ to: email, subject: tpl.subject, html: tpl.html, text: tpl.text }).catch((e) =>
          console.error(`Welcome email failed for ${email}:`, e)
        );
      }

      results.push({ email, name: fullName, status: action });
    } catch (err) {
      results.push({
        email,
        name: fullName,
        status: "error",
        message: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  const created = results.filter((r) => r.status === "created").length;
  const updated = results.filter((r) => r.status === "updated").length;
  const errors = results.filter((r) => r.status === "error").length;

  return NextResponse.json({ results, summary: { total: results.length, created, updated, errors } });
}
