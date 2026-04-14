import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

/**
 * GET /api/staff-portal/profile
 * Verifies Firebase ID token, finds matching staff doc by email,
 * and returns a sanitized staff profile.
 */
export async function GET(req: NextRequest) {
  // Extract token
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const token = authHeader.slice(7);

  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(token);
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const email = decoded.email;
  if (!email) {
    return NextResponse.json(
      { error: "No email associated with this account" },
      { status: 400 }
    );
  }

  // Look up staff doc by email
  const snap = await adminDb
    .collection("staff")
    .where("E_Mail", "==", email.toLowerCase())
    .limit(1)
    .get();

  if (snap.empty) {
    // Try case-insensitive match (email might be stored differently)
    const snap2 = await adminDb
      .collection("staff")
      .where("E_Mail", "==", email)
      .limit(1)
      .get();
    if (snap2.empty) {
      return NextResponse.json(
        { error: "No staff profile found for this email" },
        { status: 404 }
      );
    }
    return respondWithProfile(decoded.uid, email, snap2.docs[0]);
  }

  return respondWithProfile(decoded.uid, email, snap.docs[0]);
}

function respondWithProfile(
  uid: string,
  email: string,
  doc: FirebaseFirestore.QueryDocumentSnapshot
) {
  const d = doc.data();
  const profile = {
    uid,
    email,
    staffNumber: d.Staff_Number || doc.id,
    fullNameEn: d.E_Full_Name || `${d.E_First_Name || ""} ${d.E_Family_Name || ""}`.trim(),
    fullNameAr: d.A_Full_Name || `${d.A_First_Name || ""} ${d.A_Family_Name || ""}`.trim(),
    firstName: d.E_First_Name || d.A_First_Name || "",
    department: d.Employee_Group_ID || null,
    position: d.Position_Code || null,
    school: d.School_Code || null,
    branch: d.Branch_Code || null,
    idNumber: d.ID_Number || null,
    enrollmentDate: d.Enrollment_Date || null,
    sex: d.Sex || null,
    nationality: d.Primary_Nationality || null,
    isActive: d.is_active ?? true,
  };

  return NextResponse.json({ profile });
}
