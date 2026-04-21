import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
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
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;
  const token = authHeader.slice(7);
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const snap = await adminDb.collection("admin_users").doc(decoded.uid).get();
    if (snap.exists) return snap.data()?.role === "super_admin";

    // First-admin bootstrap: if NO admin_users docs exist at all,
    // treat the current authenticated user as super_admin and create their doc.
    const allAdmins = await adminDb.collection("admin_users").limit(1).get();
    if (allAdmins.empty) {
      await adminDb.collection("admin_users").doc(decoded.uid).set({
        email: decoded.email || "",
        role: "super_admin",
        createdAt: new Date().toISOString(),
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
  const authorized = await verifyCallerIsSuperAdmin(req);
  if (!authorized) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const snap = await adminDb.collection("admin_users").get();
  const users = snap.docs.map((d) => ({
    uid: d.id,
    ...d.data(),
  }));

  return NextResponse.json({ users, roles: ROLES }, { headers: CACHE_SHORT });
}

// ── POST ───────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
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
    await adminDb.collection("admin_users").doc(uid).set(
      { role, ...scopingFields, secondary_roles: validSecondaryRoles, updatedAt: new Date().toISOString() },
      { merge: true }
    );
    logAudit({ actor: "super_admin", action: "user.update", details: `Updated role to ${role}`, targetId: uid, targetType: "user" });
    return NextResponse.json({ ok: true });
  }

  // If email provided → look up uid from Firebase Auth, or create account
  if (email) {
    let userRecord;
    let wasCreated = false;
    let emailSent = false;
    let emailError: string | undefined;

    try {
      userRecord = await adminAuth.getUserByEmail(email);
    } catch {
      // User doesn't exist → create Firebase Auth account with a random temporary password
      try {
        const tempPassword = `KIS_${crypto.randomUUID().slice(0, 12)}`;
        userRecord = await adminAuth.createUser({
          email,
          password: tempPassword,
          displayName: email.split("@")[0],
        });
        wasCreated = true;
        logAudit({ actor: "super_admin", action: "user.create-auth", details: `Auto-created Firebase Auth for ${email}`, targetId: userRecord.uid, targetType: "user" });
      } catch (createErr) {
        return NextResponse.json(
          { error: `Failed to create account: ${createErr instanceof Error ? createErr.message : "Unknown error"}` },
          { status: 500 }
        );
      }
    }

    // Always generate a password-reset link and send a welcome/role email
    try {
      const resetLink = await adminAuth.generatePasswordResetLink(email);
      const tpl = teacherWelcomeEmail({
        displayName: userRecord.displayName || email.split("@")[0],
        email,
        role: ROLES[role as Role] || role,
        resetLink,
      });
      const result = await sendEmail({ to: email, subject: tpl.subject, html: tpl.html });
      emailSent = !!result.sent;
      if (!result.sent) emailError = result.reason;
    } catch (e) {
      console.error("Welcome email failed:", e);
      emailError = e instanceof Error ? e.message : "Unknown email error";
    }

    await adminDb
      .collection("admin_users")
      .doc(userRecord.uid)
      .set({
        email: userRecord.email,
        role,
        ...scopingFields,
        secondary_roles: validSecondaryRoles,
        createdAt: new Date().toISOString(),
      });
    logAudit({ actor: "super_admin", action: "user.create", details: `Added ${email} as ${role}${wasCreated ? " (account auto-created)" : ""}`, targetId: userRecord.uid, targetType: "user" });
    return NextResponse.json({ ok: true, uid: userRecord.uid, created: wasCreated, emailSent, emailError });
  }

  return NextResponse.json(
    { error: "Provide uid or email" },
    { status: 400 }
  );
}

// ── DELETE ─────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const authorized = await verifyCallerIsSuperAdmin(req);
  if (!authorized) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const uid = req.nextUrl.searchParams.get("uid");
  if (!uid) {
    return NextResponse.json({ error: "uid required" }, { status: 400 });
  }

  await adminDb.collection("admin_users").doc(uid).delete();
  logAudit({ actor: "super_admin", action: "user.delete", details: `Removed admin user`, targetId: uid, targetType: "user" });
  return NextResponse.json({ ok: true });
}
