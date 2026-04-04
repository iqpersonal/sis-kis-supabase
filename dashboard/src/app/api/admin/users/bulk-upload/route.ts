import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
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

export async function POST(req: NextRequest) {
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
      try {
        const existingUser = await adminAuth.getUserByEmail(email);
        uid = existingUser.uid;
        // Update display name if changed
        await adminAuth.updateUser(uid, {
          displayName: fullName,
        });
        action = "updated";
      } catch {
        // User doesn't exist → create new
        const newUser = await adminAuth.createUser({
          email,
          password,
          displayName: fullName,
        });
        uid = newUser.uid;
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
          const refs = ids.map((id) => adminDb.collection("classes").doc(id));
          const classDocs = await adminDb.getAll(...refs);
          const assigned = classDocs
            .filter((d) => d.exists)
            .map((d) => {
              const cd = d.data()!;
              return {
                classId: d.id,
                className: cd.class_name || cd.grade || "",
                section: cd.section || "",
                subject: cd.subject_name || cd.subject || "",
                year: cd.year || cd.academic_year || "",
              };
            });
          userDoc.assigned_classes = assigned;
        }
      }

      await adminDb.collection("admin_users").doc(uid).set(userDoc, { merge: true });

      // Send welcome email for newly created accounts
      if (action === "created") {
        const tpl = bulkWelcomeEmail({
          displayName: fullName || email.split("@")[0],
          email,
          password,
          role,
        });
        sendEmail({ to: email, subject: tpl.subject, html: tpl.html }).catch((e) =>
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
