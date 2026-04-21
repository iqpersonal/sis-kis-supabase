import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { verifyPassword, hashPassword } from "@/lib/password";

interface InternalAuthBody {
  identifier?: string;
  password?: string;
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function buildTeacherProfile(uid: string, doc: FirebaseFirestore.DocumentData) {
  return {
    uid,
    email: doc.email || "",
    displayName: doc.displayName || "",
    firstName: doc.firstName || "",
    lastName: doc.lastName || "",
    username: doc.username || "",
    grade: doc.grade || "",
    schoolYear: doc.schoolYear || "",
    role: doc.role || "teacher",
    secondary_roles: Array.isArray(doc.secondary_roles) ? doc.secondary_roles : [],
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

    // 1) Try admin_users by username first, then by email.
    const byUsername = await adminDb
      .collection("admin_users")
      .where("username", "==", normalized)
      .limit(1)
      .get();

    let userDoc: FirebaseFirestore.DocumentData | null = null;
    let userUid: string | null = null;

    if (!byUsername.empty) {
      userDoc = byUsername.docs[0].data();
      userUid = byUsername.docs[0].id;
    } else {
      const byEmail = await adminDb
        .collection("admin_users")
        .where("email", "==", normalized)
        .limit(1)
        .get();

      if (!byEmail.empty) {
        userDoc = byEmail.docs[0].data();
        userUid = byEmail.docs[0].id;
      }
    }

    if (userDoc && userUid) {
      const role = String(userDoc.role || "viewer");

      // Teachers: dual-role users MUST use Firebase auth so they get a real JWT
      // in __session, enabling navigation to admin-portal secondary pages.
      // Pure teachers (no secondary roles) keep the legacy local-password flow.
      if (role === "teacher") {
        const hasSecondaryRoles =
          Array.isArray(userDoc.secondary_roles) && userDoc.secondary_roles.length > 0;
        const teacherEmail = String(userDoc.email || "").trim().toLowerCase();

        if (!hasSecondaryRoles && userDoc.password) {
          const { match, needsUpgrade } = await verifyPassword(password, String(userDoc.password));
          if (match) {
            if (needsUpgrade) {
              const hashed = await hashPassword(password);
              await adminDb.collection("admin_users").doc(userUid).update({ password: hashed });
            }
            return NextResponse.json({
              ok: true,
              authMode: "teacher_local",
              target: "/teacher/dashboard",
              teacher: buildTeacherProfile(userUid, userDoc),
            });
          }
        }

        // Dual-role teacher or no local password → use Firebase Auth for a real JWT.
        if (!teacherEmail) {
          return NextResponse.json(
            { ok: false, error: "Invalid username or password" },
            { status: 401 }
          );
        }
        return NextResponse.json({
          ok: true,
          authMode: "firebase",
          target: "/teacher/dashboard",
          email: teacherEmail,
          teacher: buildTeacherProfile(userUid, userDoc),
        });
      }

      // For non-teacher internal roles, complete sign-in via Firebase on client.
      const target = role === "staff" ? "/staff/dashboard" : "/dashboard";
      const email = String(userDoc.email || "").trim().toLowerCase();
      if (!email) {
        return NextResponse.json(
          { ok: false, error: "Account is missing email" },
          { status: 400 }
        );
      }

      return NextResponse.json({
        ok: true,
        authMode: "firebase",
        target,
        email,
      });
    }

    // 2) If not in admin_users, allow staff login discovery by staff email.
    if (normalized.includes("@")) {
      const staffByLower = await adminDb
        .collection("staff")
        .where("E_Mail", "==", normalized)
        .limit(1)
        .get();

      if (!staffByLower.empty) {
        return NextResponse.json({
          ok: true,
          authMode: "firebase",
          target: "/staff/dashboard",
          email: normalized,
        });
      }

      const staffByRaw = await adminDb
        .collection("staff")
        .where("E_Mail", "==", identifier)
        .limit(1)
        .get();

      if (!staffByRaw.empty) {
        const email = String(staffByRaw.docs[0].data().E_Mail || normalized).trim().toLowerCase();
        return NextResponse.json({
          ok: true,
          authMode: "firebase",
          target: "/staff/dashboard",
          email,
        });
      }
    }

    // 3) Try parent (families collection) by username.
    const familySnap = await adminDb
      .collection("families")
      .where("username", "==", identifier.trim())
      .limit(1)
      .get();

    if (!familySnap.empty) {
      const fData = familySnap.docs[0].data();
      const storedPwd = String(fData.password || "");
      const { match } = await verifyPassword(password, storedPwd);
      if (match) {
        return NextResponse.json({
          ok: true,
          authMode: "parent_local",
          target: "/parent/dashboard",
          family: {
            family_number: fData.family_number || familySnap.docs[0].id,
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
      return NextResponse.json(
        { ok: false, error: "Invalid username or password" },
        { status: 401 }
      );
    }

    // 4) Try student (raw_Student collection) by UserName.
    const studentSnap = await adminDb
      .collection("raw_Student")
      .where("UserName", "==", identifier.trim())
      .limit(1)
      .get();

    if (!studentSnap.empty) {
      const sData = studentSnap.docs[0].data();
      const storedPwd = String(sData.Password || "");
      const { match, needsUpgrade } = await verifyPassword(password, storedPwd);
      if (!match) {
        return NextResponse.json(
          { ok: false, error: "Invalid username or password" },
          { status: 401 }
        );
      }
      if (needsUpgrade) {
        const hashed = await hashPassword(password);
        await adminDb.collection("raw_Student").doc(studentSnap.docs[0].id).update({ Password: hashed });
      }

      const studentNumber = sData.Student_Number || identifier.trim();

      // Look up student_credentials for the full profile.
      const credSnap = await adminDb
        .collection("student_credentials")
        .where("student_number", "==", studentNumber)
        .limit(1)
        .get();

      const cred = credSnap.empty ? null : credSnap.docs[0].data();

      return NextResponse.json({
        ok: true,
        authMode: "student_local",
        target: "/student/dashboard",
        student: {
          student_number: studentNumber,
          student_name: cred?.student_name || sData.E_Name || "",
          gender: cred?.gender || sData.Gender || "",
          class_name: cred?.class_name || "",
          section_name: cred?.section_name || "",
          school: cred?.school || sData.School_Number || "",
          family_number: cred?.family_number || sData.Family_Number || "",
          academic_year: cred?.academic_year || "",
        },
      });
    }

    return NextResponse.json(
      { ok: false, error: "Invalid username or password" },
      { status: 401 }
    );
  } catch (err) {
    console.error("Internal auth error:", err);
    return NextResponse.json(
      { ok: false, error: "Authentication failed" },
      { status: 500 }
    );
  }
}
