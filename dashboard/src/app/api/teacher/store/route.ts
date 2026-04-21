import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { STORE_CONFIGS } from "@/lib/store-config";

async function getTeacher(uid: string) {
  const doc = await adminDb.collection("admin_users").doc(uid).get();
  if (!doc.exists) return null;
  const data = doc.data()!;
  if (data.role !== "teacher") return null;
  return { uid: doc.id, email: data.email as string, displayName: data.displayName as string };
}

async function getStaffNumber(email: string) {
  const snap = await adminDb
    .collection("staff")
    .where("E_Mail", "==", email.toLowerCase())
    .limit(1)
    .get();
  if (!snap.empty) {
    const d = snap.docs[0].data();
    return { staffNumber: d.Staff_Number || snap.docs[0].id, name: d.E_Full_Name || email };
  }
  // retry exact case
  const snap2 = await adminDb.collection("staff").where("E_Mail", "==", email).limit(1).get();
  if (!snap2.empty) {
    const d = snap2.docs[0].data();
    return { staffNumber: d.Staff_Number || snap2.docs[0].id, name: d.E_Full_Name || email };
  }
  return null;
}

/**
 * GET /api/teacher/store?uid=...&action=items&store=general|it
 * GET /api/teacher/store?uid=...&action=requests
 */
export async function GET(req: NextRequest) {
  const uid = req.nextUrl.searchParams.get("uid");
  if (!uid) return NextResponse.json({ error: "uid required" }, { status: 400 });

  const teacher = await getTeacher(uid);
  if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const action = req.nextUrl.searchParams.get("action") || "items";
  const storeType = req.nextUrl.searchParams.get("store") || "general";

  if (action === "items") {
    const config = STORE_CONFIGS[storeType as keyof typeof STORE_CONFIGS];
    if (!config) return NextResponse.json({ error: "Invalid store type" }, { status: 400 });

    const snap = await adminDb
      .collection(config.collections.items)
      .where("is_active", "==", true)
      .orderBy("name")
      .get();
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ items });
  }

  if (action === "requests") {
    const staffInfo = await getStaffNumber(teacher.email);
    const requestedBy = staffInfo?.staffNumber || uid;

    const [gsSnap, itsSnap] = await Promise.all([
      adminDb.collection("gs_requests").where("requested_by", "==", requestedBy).orderBy("requested_at", "desc").limit(30).get(),
      adminDb.collection("its_requests").where("requested_by", "==", requestedBy).orderBy("requested_at", "desc").limit(30).get(),
    ]);

    const requests = [
      ...gsSnap.docs.map((d) => ({ id: d.id, store: "general", ...d.data() })),
      ...itsSnap.docs.map((d) => ({ id: d.id, store: "it", ...d.data() })),
    ].sort((a, b) => {
      const aTime = (a as Record<string, unknown>).requested_at as string || "";
      const bTime = (b as Record<string, unknown>).requested_at as string || "";
      return bTime.localeCompare(aTime);
    });

    return NextResponse.json({ requests });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

/**
 * POST /api/teacher/store
 * Body: { uid, store, items: [{ item_id, item_name, quantity }], notes? }
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { uid, store, items, notes } = body;

  if (!uid) return NextResponse.json({ error: "uid required" }, { status: 400 });

  const teacher = await getTeacher(uid);
  if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!store || !items || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "Store type and items are required" }, { status: 400 });
  }

  const config = STORE_CONFIGS[store as keyof typeof STORE_CONFIGS];
  if (!config) return NextResponse.json({ error: "Invalid store type" }, { status: 400 });

  // Identify by staff number if available, else by uid
  const staffInfo = await getStaffNumber(teacher.email);
  const requestedBy = staffInfo?.staffNumber || uid;
  const requestedByName = staffInfo?.name || teacher.displayName;

  // Generate request ID
  const counterDoc = `${store}_requests`;
  const countSnap = await adminDb.collection("counters").doc(counterDoc).get();
  const nextNum = (countSnap.exists ? (countSnap.data()?.count || 0) : 0) + 1;
  const requestId = `${config.idPrefix}-REQ-${String(nextNum).padStart(4, "0")}`;

  const doc = {
    request_id: requestId,
    requested_by: requestedBy,
    requested_by_name: requestedByName,
    items: items.map((i: { item_id: string; item_name: string; quantity: number }) => ({
      item_id: i.item_id,
      item_name: i.item_name,
      qty_requested: i.quantity,
      qty_approved: 0,
    })),
    status: "pending",
    notes: notes || "",
    requested_at: FieldValue.serverTimestamp(),
    reviewed_by: null,
    reviewed_by_name: null,
    reviewed_at: null,
    issued_by: null,
    issued_by_name: null,
    issued_at: null,
  };

  const ref = await adminDb.collection(config.collections.requests).add(doc);
  await adminDb.collection("counters").doc(counterDoc).set({ count: nextNum }, { merge: true });

  return NextResponse.json({ id: ref.id, request_id: requestId, success: true }, { status: 201 });
}
