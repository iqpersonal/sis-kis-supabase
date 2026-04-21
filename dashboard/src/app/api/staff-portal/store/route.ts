import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { STORE_CONFIGS } from "@/lib/store-config";

/* Roles allowed to directly issue items (quick issue) */
const STORE_MANAGE_ROLES = new Set([
  "admin", "super_admin", "school_admin", "store_clerk", "it_manager", "it_admin",
]);

function extractToken(req: NextRequest): string | null {
  const h = req.headers.get("authorization");
  if (h?.startsWith("Bearer ")) return h.slice(7);
  return null;
}

async function getStaffInfo(email: string) {
  const snap = await adminDb
    .collection("staff")
    .where("E_Mail", "==", email.toLowerCase())
    .limit(1)
    .get();
  if (snap.empty) {
    const snap2 = await adminDb
      .collection("staff")
      .where("E_Mail", "==", email)
      .limit(1)
      .get();
    if (snap2.empty) return null;
    const d = snap2.docs[0].data();
    return {
      staffNumber: d.Staff_Number || snap2.docs[0].id,
      name: d.E_Full_Name || email,
    };
  }
  const d = snap.docs[0].data();
  return {
    staffNumber: d.Staff_Number || snap.docs[0].id,
    name: d.E_Full_Name || email,
  };
}

async function getUserRole(uid: string): Promise<string | null> {
  const snap = await adminDb.collection("admin_users").doc(uid).get();
  return snap.exists ? (snap.data()?.role as string) || null : null;
}

/**
 * GET /api/staff-portal/store
 * ?action=items&store=general|it  → Browse available items
 * ?action=requests                → My store requests
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

  const action = req.nextUrl.searchParams.get("action") || "items";
  const storeType = req.nextUrl.searchParams.get("store") || "general";

  if (action === "items") {
    const config = STORE_CONFIGS[storeType as keyof typeof STORE_CONFIGS];
    if (!config) {
      return NextResponse.json({ error: "Invalid store type" }, { status: 400 });
    }
    const snap = await adminDb
      .collection(config.collections.items)
      .where("is_active", "==", true)
      .orderBy("name")
      .get();

    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ items });
  }

  if (action === "requests") {
    const staffInfo = await getStaffInfo(decoded.email || "");
    if (!staffInfo) {
      return NextResponse.json({ error: "Staff not found" }, { status: 404 });
    }

    // Fetch from both stores
    const [gsSnap, itsSnap] = await Promise.all([
      adminDb
        .collection("gs_requests")
        .where("requested_by", "==", staffInfo.staffNumber)
        .orderBy("requested_at", "desc")
        .limit(30)
        .get(),
      adminDb
        .collection("its_requests")
        .where("requested_by", "==", staffInfo.staffNumber)
        .orderBy("requested_at", "desc")
        .limit(30)
        .get(),
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

  if (action === "role") {
    const role = await getUserRole(decoded.uid);
    const canIssue = !!role && STORE_MANAGE_ROLES.has(role);
    return NextResponse.json({ role: role || "staff", canIssue });
  }

  if (action === "notifications") {
    const staffInfo = await getStaffInfo(decoded.email || "");
    if (!staffInfo) {
      return NextResponse.json({ notifications: [] });
    }
    try {
      const snap = await adminDb
        .collection("store_notifications")
        .where("staff_number", "==", staffInfo.staffNumber)
        .where("read", "==", false)
        .orderBy("created_at", "desc")
        .limit(20)
        .get();
      const notifications = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      return NextResponse.json({ notifications });
    } catch {
      return NextResponse.json({ notifications: [] });
    }
  }

  if (action === "purchase_orders") {
    const role = await getUserRole(decoded.uid);
    if (!role || !STORE_MANAGE_ROLES.has(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const col = storeType === "it" ? "its_purchase_orders" : "gs_purchase_orders";
    const snap = await adminDb.collection(col).orderBy("created_at", "desc").limit(30).get();
    const purchase_orders = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ purchase_orders });
  }

  if (action === "stock_takes") {
    const role = await getUserRole(decoded.uid);
    if (!role || !STORE_MANAGE_ROLES.has(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const storeType = req.nextUrl.searchParams.get("store") || "general";
    const col = storeType === "it" ? "its_stock_takes" : "gs_stock_takes";
    const snap = await adminDb.collection(col).orderBy("created_at", "desc").limit(10).get();
    const takes = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ stock_takes: takes });
  }

  if (action === "stock_take") {
    const role = await getUserRole(decoded.uid);
    if (!role || !STORE_MANAGE_ROLES.has(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const storeType = req.nextUrl.searchParams.get("store") || "general";
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const col = storeType === "it" ? "its_stock_takes" : "gs_stock_takes";
    const doc = await adminDb.collection(col).doc(id).get();
    if (!doc.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ stock_take: { id: doc.id, ...doc.data() } });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

/**
 * POST /api/staff-portal/store
 * Submit a new store request
 * Body: { store: "general"|"it", items: [{ item_id, item_name, quantity }], notes? }
 */
export async function POST(req: NextRequest) {
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

  const staffInfo = await getStaffInfo(decoded.email || "");
  if (!staffInfo) {
    return NextResponse.json({ error: "Staff not found" }, { status: 404 });
  }

  const body = await req.json();
  const { store, items, notes, action } = body;

  if (!store || !items || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json(
      { error: "Store type and items are required" },
      { status: 400 }
    );
  }

  const config = STORE_CONFIGS[store as keyof typeof STORE_CONFIGS];
  if (!config) {
    return NextResponse.json({ error: "Invalid store type" }, { status: 400 });
  }

  /* ── Quick Issue (direct issue by storekeeper from mobile) ── */
  if (action === "quick_issue") {
    const { recipient_name, department, branch } = body;

    if (!recipient_name || !recipient_name.trim()) {
      return NextResponse.json(
        { error: "Recipient name is required" },
        { status: 400 }
      );
    }

    // Role check
    const role = await getUserRole(decoded.uid);
    if (!role || !STORE_MANAGE_ROLES.has(role)) {
      return NextResponse.json(
        { error: "Not authorized to issue items" },
        { status: 403 }
      );
    }

    const now = new Date().toISOString();
    const batch = adminDb.batch();
    const issuedItems: Array<{ item_id: string; item_name: string; quantity: number }> = [];

    for (const it of items) {
      if (!it.item_id || !it.quantity || it.quantity <= 0) continue;

      const itemSnap = await adminDb
        .collection(config.collections.items)
        .where("item_id", "==", it.item_id)
        .limit(1)
        .get();
      if (itemSnap.empty) continue;

      const itemRef = itemSnap.docs[0].ref;
      const itemData = itemSnap.docs[0].data();
      const currentQty = (itemData.quantity as number) || 0;
      const deductQty = Math.min(it.quantity, currentQty);
      if (deductQty <= 0) continue;

      batch.update(itemRef, { quantity: FieldValue.increment(-deductQty) });

      const txnRef = adminDb.collection(config.collections.transactions).doc();
      batch.set(txnRef, {
        txn_id: `${config.idPrefix}-ISS-${Date.now()}-${it.item_id}`,
        type: "issue",
        item_id: it.item_id,
        item_name: itemData.name || it.item_name || "",
        quantity: deductQty,
        request_id: null,
        staff_number: null,
        staff_name: recipient_name.trim(),
        notes: notes || "Quick issue (mobile)",
        performed_by: decoded.uid,
        performed_by_name: staffInfo.name,
        timestamp: now,
      });

      issuedItems.push({
        item_id: it.item_id,
        item_name: itemData.name || it.item_name || "",
        quantity: deductQty,
      });
    }

    if (issuedItems.length === 0) {
      return NextResponse.json(
        { error: "No valid items to issue (check stock levels)" },
        { status: 400 }
      );
    }

    await batch.commit();

    // Create delivery note
    const prefix = store === "it" ? "IT" : "GEN";
    const year = new Date().getFullYear();
    const dnPattern = `DN-${prefix}-${year}-`;
    const dnSnap = await adminDb
      .collection("delivery_notes")
      .where("dn_number", ">=", dnPattern)
      .where("dn_number", "<=", dnPattern + "\uf8ff")
      .orderBy("dn_number", "desc")
      .limit(1)
      .get();
    let seq = 1;
    if (!dnSnap.empty) {
      const last = dnSnap.docs[0].data().dn_number as string;
      seq = (parseInt(last.split("-").pop() || "0", 10) || 0) + 1;
    }
    const dnNumber = `${dnPattern}${String(seq).padStart(4, "0")}`;

    await adminDb.collection("delivery_notes").add({
      dn_number: dnNumber,
      store_type: store,
      branch: branch || "",
      request_id: null,
      items: issuedItems.map((i) => ({ ...i, condition: "good", remarks: "" })),
      issued_by: decoded.uid,
      issued_by_name: staffInfo.name,
      received_by: "",
      received_by_name: recipient_name.trim(),
      received_by_name_ar: "",
      department: (department || "").trim(),
      status: "pending_acknowledgment",
      issued_at: now,
      acknowledged_at: null,
      notes: notes || "",
      created_at: now,
    });

    return NextResponse.json(
      {
        success: true,
        dn_number: dnNumber,
        items_issued: issuedItems.length,
        total_qty: issuedItems.reduce((s, i) => s + i.quantity, 0),
      },
      { status: 201 }
    );
  }

  /* ── Receive Stock (storekeeper from mobile) ── */
  if (action === "receive_stock") {
    // Verify role
    const userRole = await getUserRole(decoded.uid);
    if (!userRole || !STORE_MANAGE_ROLES.has(userRole)) {
      return NextResponse.json({ error: "Not authorized to receive stock" }, { status: 403 });
    }

    const receiveItems: { item_id: string; item_name: string; quantity: number }[] = items;
    const batch = adminDb.batch();
    const receivedItems: { item_id: string; item_name: string; quantity: number }[] = [];
    const now = new Date().toISOString();

    for (const ri of receiveItems) {
      if (!ri.item_id || typeof ri.quantity !== "number" || ri.quantity <= 0) continue;

      const itemSnap = await adminDb
        .collection(config.collections.items)
        .where("item_id", "==", ri.item_id)
        .limit(1)
        .get();

      if (itemSnap.empty) continue;

      const docRef = itemSnap.docs[0].ref;
      batch.update(docRef, { quantity: FieldValue.increment(ri.quantity) });

      const txnRef = adminDb.collection(config.collections.transactions).doc();
      batch.set(txnRef, {
        txn_id: `${config.idPrefix}-RCV-${Date.now()}-${ri.item_id}`,
        type: "receive",
        item_id: ri.item_id,
        item_name: ri.item_name || "",
        quantity: ri.quantity,
        request_id: null,
        staff_number: null,
        staff_name: null,
        notes: notes || `Mobile receive by ${staffInfo.name}`,
        performed_by: decoded.uid,
        performed_by_name: staffInfo.name,
        timestamp: now,
      });

      receivedItems.push(ri);
    }

    if (receivedItems.length === 0) {
      return NextResponse.json({ error: "No valid items to receive" }, { status: 400 });
    }

    await batch.commit();

    return NextResponse.json(
      {
        success: true,
        items_received: receivedItems.length,
        total_qty: receivedItems.reduce((s, i) => s + i.quantity, 0),
      },
      { status: 201 }
    );
  }

  /* ── Receive Stock against PO (storekeeper from mobile) ── */
  if (action === "receive_po") {
    const userRole = await getUserRole(decoded.uid);
    if (!userRole || !STORE_MANAGE_ROLES.has(userRole)) {
      return NextResponse.json({ error: "Not authorized to receive stock" }, { status: 403 });
    }

    const { po_id, received_items } = body;
    if (!po_id || !Array.isArray(received_items) || received_items.length === 0) {
      return NextResponse.json({ error: "po_id and received_items required" }, { status: 400 });
    }

    const col = store === "it" ? "its_purchase_orders" : "gs_purchase_orders";
    const poRef = adminDb.collection(col).doc(po_id as string);
    const poDoc = await poRef.get();
    if (!poDoc.exists) return NextResponse.json({ error: "PO not found" }, { status: 404 });
    const poData = poDoc.data()!;
    if (poData.status !== "approved" && poData.status !== "partial") {
      return NextResponse.json({ error: "PO must be approved first" }, { status: 400 });
    }

    const poItems = poData.items as Array<{ item_id: string; item_name: string; quantity: number; unit_cost: number; received_qty: number }>;
    const batch = adminDb.batch();
    const now = new Date().toISOString();
    const receivedItems: { item_id: string; item_name: string; quantity: number }[] = [];

    for (const ri of received_items as Array<{ item_id: string; quantity: number }>) {
      if (!ri.item_id || typeof ri.quantity !== "number" || ri.quantity <= 0) continue;
      const poItem = poItems.find((p) => p.item_id === ri.item_id);
      if (!poItem) continue;
      const remaining = poItem.quantity - poItem.received_qty;
      const qty = Math.min(ri.quantity, remaining);
      if (qty <= 0) continue;

      poItem.received_qty = poItem.received_qty + qty;

      const itemSnap = await adminDb.collection(config.collections.items).where("item_id", "==", ri.item_id).limit(1).get();
      if (!itemSnap.empty) {
        batch.update(itemSnap.docs[0].ref, { quantity: FieldValue.increment(qty) });
      }

      const txnRef = adminDb.collection(config.collections.transactions).doc();
      batch.set(txnRef, {
        txn_id: `${config.idPrefix}-PO-RCV-${Date.now()}-${ri.item_id.slice(0, 4)}`,
        type: "receive",
        item_id: ri.item_id,
        item_name: poItem.item_name,
        quantity: qty,
        reason: `PO ${poData.po_number}`,
        notes: notes || `PO receive (mobile) by ${staffInfo.name}`,
        performed_by: decoded.uid,
        performed_by_name: staffInfo.name,
        timestamp: now,
      });

      receivedItems.push({ item_id: ri.item_id, item_name: poItem.item_name, quantity: qty });
    }

    if (receivedItems.length === 0) {
      return NextResponse.json({ error: "No valid items to receive" }, { status: 400 });
    }

    const allReceived = poItems.every((p) => p.received_qty >= p.quantity);
    batch.update(poRef, { items: poItems, status: allReceived ? "received" : "partial", ...(allReceived ? { received_at: now } : {}) });

    await batch.commit();
    return NextResponse.json({
      success: true,
      po_number: poData.po_number,
      status: allReceived ? "received" : "partial",
      items_received: receivedItems.length,
      total_qty: receivedItems.reduce((s, i) => s + i.quantity, 0),
    }, { status: 201 });
  }

  if (action === "update_stock_take_count") {
    const userRole = await getUserRole(decoded.uid);
    if (!userRole || !STORE_MANAGE_ROLES.has(userRole)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }
    const { stock_take_id, item_id, counted_qty } = body;
    if (!stock_take_id || !item_id || counted_qty === undefined) {
      return NextResponse.json({ error: "stock_take_id, item_id, counted_qty required" }, { status: 400 });
    }
    const col = store === "it" ? "its_stock_takes" : "gs_stock_takes";
    const ref = adminDb.collection(col).doc(stock_take_id as string);
    const doc = await ref.get();
    if (!doc.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (doc.data()?.status !== "in_progress") return NextResponse.json({ error: "Not in progress" }, { status: 400 });

    const stItems = doc.data()!.items as Record<string, { name: string; system_qty: number; counted_qty: number | null }>;
    if (!stItems[item_id as string]) return NextResponse.json({ error: "Item not found" }, { status: 404 });
    stItems[item_id as string].counted_qty = Number(counted_qty);

    let counted = 0, variances = 0;
    Object.values(stItems).forEach((it) => { if (it.counted_qty !== null) { counted++; if (it.counted_qty !== it.system_qty) variances++; } });
    await ref.update({ items: stItems, counted, variances });
    return NextResponse.json({ success: true, counted, variances });
  }

  // Generate request ID
  const counterDoc = `${store}_requests`;
  const countSnap = await adminDb
    .collection("counters")
    .doc(counterDoc)
    .get();
  const nextNum = (countSnap.exists ? (countSnap.data()?.count || 0) : 0) + 1;
  const requestId = `${config.idPrefix}-REQ-${String(nextNum).padStart(4, "0")}`;

  const doc = {
    request_id: requestId,
    requested_by: staffInfo.staffNumber,
    requested_by_name: staffInfo.name,
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

  // Update counter
  await adminDb
    .collection("counters")
    .doc(counterDoc)
    .set({ count: nextNum }, { merge: true });

  return NextResponse.json(
    { id: ref.id, request_id: requestId, success: true },
    { status: 201 }
  );
}
