import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { verifyPassword, hashPassword } from "@/lib/password";

/**
 * POST /api/student-auth
 * Verify student credentials against the `raw_Student` collection (SIS data).
 * Each student has their own UserName + Password from the SIS database.
 *
 * Body: { username: string, password: string }
 * username = student number / UserName (e.g. "0021-001712")
 * password = student password from SIS  (e.g. "1100171217")
 */
export async function POST(req: NextRequest) {
  try {
    const { username, password } = (await req.json()) as {
      username?: string;
      password?: string;
    };

    if (!username || !password) {
      return NextResponse.json(
        { error: "Student number and password are required" },
        { status: 400 }
      );
    }

    const trimmedUsername = username.trim();
    const trimmedPassword = password.trim();

    // Step 1: Look up the student in raw_Student by UserName
    const studentSnap = await adminDb
      .collection("raw_Student")
      .where("UserName", "==", trimmedUsername)
      .limit(1)
      .get();

    if (studentSnap.empty) {
      return NextResponse.json(
        { error: "Invalid student number or password" },
        { status: 401 }
      );
    }

    const rawStudent = studentSnap.docs[0].data();

    // Step 2: Verify password (supports bcrypt hash and legacy plaintext)
    const { match, needsUpgrade } = await verifyPassword(
      trimmedPassword,
      String(rawStudent.Password || "")
    );
    if (!match) {
      return NextResponse.json(
        { error: "Invalid student number or password" },
        { status: 401 }
      );
    }

    // Upgrade plaintext → bcrypt on successful login
    if (needsUpgrade) {
      const hashed = await hashPassword(trimmedPassword);
      const docId = studentSnap.docs[0].id;
      await adminDb.collection("raw_Student").doc(docId).update({ Password: hashed });
    }

    const studentNumber = rawStudent.Student_Number || trimmedUsername;

    // Step 3: Get the student profile from student_credentials (has class/section info)
    const credDoc = await adminDb
      .collection("student_credentials")
      .doc(studentNumber)
      .get();

    const cred = credDoc.exists ? credDoc.data()! : {};

    // Build student profile
    const student = {
      student_number: studentNumber,
      student_name: cred.student_name || "",
      gender: cred.gender || "",
      class_name: cred.class_name || "",
      section_name: cred.section_name || "",
      school: cred.school || "",
      family_number: rawStudent.Family_Number || cred.family_number || "",
      academic_year: cred.academic_year || "",
    };

    return NextResponse.json({ success: true, student });
  } catch (err) {
    console.error("Student auth error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
