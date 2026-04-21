import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";

/* ── Auth ─────────────────────────────────────────────────────── */
async function verifyAccess(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;
  try {
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    const snap = await adminDb.collection("admin_users").doc(decoded.uid).get();
    if (!snap.exists) return false;
    const role = snap.data()?.role;
    return ["super_admin", "school_admin", "academic_director"].includes(role);
  } catch {
    return false;
  }
}

/* ── GET: Retrieve seating plans ─────────────────────────────── */
export async function GET(req: NextRequest) {
  if (!(await verifyAccess(req)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const scheduleId = req.nextUrl.searchParams.get("scheduleId");
    const campus = req.nextUrl.searchParams.get("campus");

    if (!scheduleId) {
      return NextResponse.json({ error: "scheduleId required" }, { status: 400 });
    }

    let query: FirebaseFirestore.Query = adminDb
      .collection("exam_seating_plans")
      .where("scheduleId", "==", scheduleId);

    if (campus) query = query.where("campus", "==", campus);

    const snap = await query.orderBy("examDate").get();
    const plans = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    return NextResponse.json({ plans });
  } catch (err) {
    console.error("[exam-seating-plan] GET error:", err);
    return NextResponse.json({ error: "Failed to fetch plans" }, { status: 500 });
  }
}

/* ── DELETE: Remove plans for a schedule+campus ──────────────── */
export async function DELETE(req: NextRequest) {
  if (!(await verifyAccess(req)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const { scheduleId, campus } = (await req.json()) as {
      scheduleId: string;
      campus?: string;
    };

    if (!scheduleId) {
      return NextResponse.json({ error: "scheduleId required" }, { status: 400 });
    }

    let query: FirebaseFirestore.Query = adminDb
      .collection("exam_seating_plans")
      .where("scheduleId", "==", scheduleId);

    if (campus) query = query.where("campus", "==", campus);

    const snap = await query.get();
    const batch = adminDb.batch();
    snap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();

    return NextResponse.json({ ok: true, deleted: snap.size });
  } catch (err) {
    console.error("[exam-seating-plan] DELETE error:", err);
    return NextResponse.json({ error: "Failed to delete plans" }, { status: 500 });
  }
}
