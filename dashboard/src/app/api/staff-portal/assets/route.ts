import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

function extractToken(req: NextRequest): string | null {
  const h = req.headers.get("authorization");
  if (h?.startsWith("Bearer ")) return h.slice(7);
  return null;
}

/**
 * GET /api/staff-portal/assets
 * Returns IT assets assigned to the authenticated staff member
 */
export async function GET(req: NextRequest) {
  const token = extractToken(req);
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(token);
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const email = decoded.email || "";

  // Get staff number from email
  const staffSnap = await adminDb
    .collection("staff")
    .where("E_Mail", "==", email.toLowerCase())
    .limit(1)
    .get();

  let staffNumber: string | null = null;
  if (!staffSnap.empty) {
    staffNumber = staffSnap.docs[0].data().Staff_Number || staffSnap.docs[0].id;
  } else {
    const staffSnap2 = await adminDb
      .collection("staff")
      .where("E_Mail", "==", email)
      .limit(1)
      .get();
    if (!staffSnap2.empty) {
      staffNumber =
        staffSnap2.docs[0].data().Staff_Number || staffSnap2.docs[0].id;
    }
  }

  if (!staffNumber) {
    return NextResponse.json({ error: "Staff not found" }, { status: 404 });
  }

  const snap = await adminDb
    .collection("it_assets")
    .where("assigned_to", "==", staffNumber)
    .get();

  const assets = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return NextResponse.json({ assets });
}
