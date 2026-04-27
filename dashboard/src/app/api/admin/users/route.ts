import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { ROLES, MAJOR_SCOPED_ROLES, ROLE_PERMISSIONS, type Role } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { sendEmail } from "@/lib/email-service";
import { teacherWelcomeEmail } from "@/lib/email-templates";
import { CACHE_SHORT } from "@/lib/cache-headers";

/**
 * GET  /api/admin/users          → list all admin users
 * POST /api/admin/users          → create / update a user's role
 *   Body: { uid: string, role: Role }
 * DELETE /api/admin/users?uid=x  → remove admin_users doc (does NOT delete Firebase auth user)
 */

// ── Helpers ────────────────────────────────────────────────────
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

// ── GET ────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const supabase = createServiceClient();
  const authorized = await verifyCallerIsSuperAdmin(req);
  if (!authorized) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: usersData, error } = await supabase.from("admin_users").select("*");
  if (error) {
    return NextResponse.json({ error: "Failed to list users" }, { status: 500 });
  }
  const users = (usersData || []).map((u: Record<string, unknown>) => ({ uid: u.id, ...u }));

  return NextResponse.json({ users, roles: ROLES }, { headers: CACHE_SHORT });
}

// ── POST ───────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const supabase = createServiceClient();
  const authorized = await verifyCallerIsSuperAdmin(req);
  if (!authorized) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { uid, role, email, assigned_major, supervised_classes, supervised_subjects, teaches, secondary_roles } = body as {
    uid?: string;
    role?: string;
    email?: string;
    assigned_major?: string;
    supervised_classes?: string[];
    supervised_subjects?: string[];
    teaches?: boolean;
    secondary_roles?: string[];
  };

  if (!role || !(role in ROLES)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  // Validate and sanitize secondary_roles
  const validSecondaryRoles = Array.isArray(secondary_roles)
    ? secondary_roles.filter((r): r is keyof typeof ROLES => r in ROLES && r !== role)
    : [];

  // Build scoping fields for major-scoped roles
  const scopingFields: Record<string, unknown> = {};
  if (MAJOR_SCOPED_ROLES.includes(role as Role)) {
    scopingFields.assigned_major = assigned_major || null;
    scopingFields.supervised_classes = Array.isArray(supervised_classes) ? supervised_classes : [];
    scopingFields.supervised_subjects = Array.isArray(supervised_subjects) ? supervised_subjects : [];
    scopingFields.teaches = !!teaches;
  } else {
    // Clear scoping fields when switching to a non-scoped role
    scopingFields.assigned_major = null;
    scopingFields.supervised_classes = [];
    scopingFields.supervised_subjects = [];
    scopingFields.teaches = false;
  }

  // If uid provided → update existing
  if (uid) {
    const { error } = await supabase
      .from("admin_users")
      .upsert({ id: uid, role, ...scopingFields, secondary_roles: validSecondaryRoles, updated_at: new Date().toISOString() });
    if (error) {
      return NextResponse.json({ error: `Failed to update user: ${error.message}` }, { status: 500 });
    }
    logAudit({ actor: "super_admin", action: "user.update", details: `Updated role to ${role}`, targetId: uid, targetType: "user" });
    return NextResponse.json({ ok: true });
  }

  // If email provided → look up uid from Firebase Auth, or create account
  if (email) {
    let userRecord: { id: string; email?: string | null; user_metadata?: { display_name?: string } };
    let wasCreated = false;
    let emailSent = false;
    let emailError: string | undefined;

    try {
      const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (error) throw error;
      const found = (data.users || []).find((u) => (u.email || "").toLowerCase() === email.toLowerCase());
      if (!found) throw new Error("NOT_FOUND");
      userRecord = { id: found.id, email: found.email, user_metadata: found.user_metadata as { display_name?: string } };
    } catch {
      // User doesn't exist → create Supabase Auth account with a random temporary password
      try {
        const tempPassword = `KIS_${crypto.randomUUID().slice(0, 12)}`;
        const { data: created, error: createErr } = await supabase.auth.admin.createUser({
          email,
          password: tempPassword,
          user_metadata: { display_name: email.split("@")[0] },
          email_confirm: true,
        });
        if (createErr || !created.user) throw createErr || new Error("Failed to create auth user");
        userRecord = { id: created.user.id, email: created.user.email, user_metadata: created.user.user_metadata as { display_name?: string } };
        wasCreated = true;
        logAudit({ actor: "super_admin", action: "user.create-auth", details: `Auto-created Supabase Auth for ${email}`, targetId: userRecord.id, targetType: "user" });
      } catch (createErr) {
        return NextResponse.json(
          { error: `Failed to create account: ${createErr instanceof Error ? createErr.message : "Unknown error"}` },
          { status: 500 }
        );
      }
    }

    // Send welcome/role email — skip for teachers (credentials shared directly)
    if (role !== "teacher") try {
      const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
        type: "recovery",
        email,
      });
      if (linkErr) throw linkErr;
      const resetLink = linkData.properties.action_link;
      const tpl = teacherWelcomeEmail({
        displayName: userRecord.user_metadata?.display_name || email.split("@")[0],
        email,
        role: ROLES[role as Role] || role,
        resetLink,
      });
      const result = await sendEmail({ to: email, subject: tpl.subject, html: tpl.html, text: tpl.text });
      emailSent = !!result.sent;
      if (!result.sent) emailError = result.reason;
    } catch (e) {
      console.error("Welcome email failed:", e);
      emailError = e instanceof Error ? e.message : "Unknown email error";
    }

    const { error: upsertErr } = await supabase
      .from("admin_users")
      .upsert({
        id: userRecord.id,
        email: userRecord.email,
        role,
        ...scopingFields,
        secondary_roles: validSecondaryRoles,
        created_at: new Date().toISOString(),
      });
    if (upsertErr) {
      return NextResponse.json({ error: `Failed to save admin profile: ${upsertErr.message}` }, { status: 500 });
    }
    logAudit({ actor: "super_admin", action: "user.create", details: `Added ${email} as ${role}${wasCreated ? " (account auto-created)" : ""}`, targetId: userRecord.id, targetType: "user" });
    return NextResponse.json({ ok: true, uid: userRecord.id, created: wasCreated, emailSent, emailError });
  }

  return NextResponse.json(
    { error: "Provide uid or email" },
    { status: 400 }
  );
}

// ── DELETE ─────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const supabase = createServiceClient();
  const authorized = await verifyCallerIsSuperAdmin(req);
  if (!authorized) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const uid = req.nextUrl.searchParams.get("uid");
  if (!uid) {
    return NextResponse.json({ error: "uid required" }, { status: 400 });
  }

  const { error } = await supabase.from("admin_users").delete().eq("id", uid);
  if (error) {
    return NextResponse.json({ error: `Failed to delete admin user: ${error.message}` }, { status: 500 });
  }
  logAudit({ actor: "super_admin", action: "user.delete", details: `Removed admin user`, targetId: uid, targetType: "user" });
  return NextResponse.json({ ok: true });
}
