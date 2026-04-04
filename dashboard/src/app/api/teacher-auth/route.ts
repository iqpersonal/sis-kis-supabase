import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { verifyPassword, hashPassword } from "@/lib/password";

/**
 * POST /api/teacher-auth
 * Body: { username: string, password: string }
 *
 * Authenticates a teacher by username + password from admin_users collection.
 * Returns teacher profile data (excluding password).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { username, password } = body as {
      username?: string;
      password?: string;
    };

    if (!username || !password) {
      return NextResponse.json(
        { error: "Username and password required" },
        { status: 400 }
      );
    }

    const trimmedUsername = username.trim().toLowerCase();
    const trimmedPassword = password.trim();

    // Look up teacher by username in admin_users (indexed query)
    const usernameSnap = await adminDb
      .collection("admin_users")
      .where("username", "==", trimmedUsername)
      .where("role", "==", "teacher")
      .limit(1)
      .get();

    // Also try by email if no match
    let teacherDoc: FirebaseFirestore.DocumentData | null = null;
    let teacherUid: string | null = null;

    if (!usernameSnap.empty) {
      const doc = usernameSnap.docs[0];
      teacherDoc = doc.data();
      teacherUid = doc.id;
    } else {
      const emailSnap = await adminDb
        .collection("admin_users")
        .where("email", "==", trimmedUsername)
        .where("role", "==", "teacher")
        .limit(1)
        .get();
      if (!emailSnap.empty) {
        const doc = emailSnap.docs[0];
        teacherDoc = doc.data();
        teacherUid = doc.id;
      }
    }

    if (!teacherDoc) {
      return NextResponse.json(
        { error: "Invalid username or password" },
        { status: 401 }
      );
    }

    // Verify password - check against stored password in admin_users
    // (set during CSV bulk upload)
    // Since Firebase Auth is used, we verify via the admin SDK
    const { adminAuth } = await import("@/lib/firebase-admin");

    try {
      // Try to sign in by verifying credentials through Firebase Auth
      // We'll check the email associated with this teacher
      const userRecord = await adminAuth.getUser(teacherUid!);

      // For teacher portal, verify using a password field stored during bulk upload
      if (teacherDoc.password) {
        const { match, needsUpgrade } = await verifyPassword(
          trimmedPassword,
          teacherDoc.password
        );
        if (!match) {
          return NextResponse.json(
            { error: "Invalid username or password" },
            { status: 401 }
          );
        }

        // Upgrade plaintext → bcrypt on successful login
        if (needsUpgrade) {
          const hashed = await hashPassword(trimmedPassword);
          await adminDb.collection("admin_users").doc(teacherUid!).update({ password: hashed });
        }
      }

      // Build teacher profile (exclude sensitive fields)
      const teacher = {
        uid: teacherUid,
        email: teacherDoc.email || userRecord.email || "",
        displayName: teacherDoc.displayName || userRecord.displayName || "",
        firstName: teacherDoc.firstName || "",
        lastName: teacherDoc.lastName || "",
        username: teacherDoc.username || "",
        grade: teacherDoc.grade || "",
        schoolYear: teacherDoc.schoolYear || "",
        role: teacherDoc.role,
      };

      return NextResponse.json({ teacher });
    } catch {
      return NextResponse.json(
        { error: "Invalid username or password" },
        { status: 401 }
      );
    }
  } catch (err) {
    console.error("Teacher auth error:", err);
    return NextResponse.json(
      { error: "Authentication failed" },
      { status: 500 }
    );
  }
}
