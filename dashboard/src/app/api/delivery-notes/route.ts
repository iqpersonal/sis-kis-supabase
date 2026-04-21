import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { verifyAuth } from "@/lib/api-auth";
import { hasPermission } from "@/lib/rbac";
import { CACHE_SHORT, CACHE_NONE } from "@/lib/cache-headers";
import { logAudit } from "@/lib/audit";
import { STORE_CONFIGS } from "@/lib/store-config";

const DN_COLLECTION = "delivery_notes";

/* ── Sequential DN number ──────────────────────────────────────── */
async function nextDnNumber(storeType: string): Promise<string> {
  const prefix = storeType === "general" ? "GEN" : "IT";
  const year = new Date().getFullYear();
  const pattern = `DN-${prefix}-${year}-`;

  const snap = await adminDb
    .collection(DN_COLLECTION)
    .where("dn_number", ">=", pattern)
    .where("dn_number", "<=", pattern + "\uf8ff")
    .orderBy("dn_number", "desc")
    .limit(1)
    .get();

  let seq = 1;
  if (!snap.empty) {
    const last = snap.docs[0].data().dn_number as string;
    const parts = last.split("-");
    seq = (parseInt(parts[parts.length - 1], 10) || 0) + 1;
  }
  return `${pattern}${String(seq).padStart(4, "0")}`;
}

/* ── Permission check helper ───────────────────────────────────── */
function storePermission(storeType: string) {
  return storeType === "it" ? "it_store.manage" : "general_store.manage";
}

/* ════════════════════════════════════════════════════════════════
   GET /api/delivery-notes
   ?action=list&storeType=general&status=pending_acknowledgment&branch=boys
   ?action=single&id=DOC_ID
   ════════════════════════════════════════════════════════════════ */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const action = sp.get("action") || "list";

  try {
    if (action === "single") {
      const id = sp.get("id");
      if (!id)
        return NextResponse.json({ error: "id required" }, { status: 400 });
      const doc = await adminDb.collection(DN_COLLECTION).doc(id).get();
      if (!doc.exists)
        return NextResponse.json(
          { error: "Delivery note not found" },
          { status: 404 }
        );
      return NextResponse.json(
        { deliveryNote: { id: doc.id, ...doc.data() } },
        { headers: CACHE_SHORT }
      );
    }

    // action === "list"
    const storeType = sp.get("storeType") || "general";
    let q: FirebaseFirestore.Query = adminDb
      .collection(DN_COLLECTION)
      .where("store_type", "==", storeType)
      .orderBy("issued_at", "desc")
      .limit(200);

    const status = sp.get("status");
    if (status && status !== "all") {
      q = q.where("status", "==", status);
    }
    const branch = sp.get("branch");
    if (branch && branch !== "all") {
      q = q.where("branch", "==", branch);
    }

    const snap = await q.get();
    const notes = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ deliveryNotes: notes }, { headers: CACHE_SHORT });
  } catch (err) {
    console.error("Delivery notes GET error:", err);
    return NextResponse.json(
      { error: "Failed to fetch delivery notes" },
      { status: 500 }
    );
  }
}

/* ════════════════════════════════════════════════════════════════
   POST /api/delivery-notes
   body.action: "create_from_request" | "quick_issue" | "acknowledge"
   ════════════════════════════════════════════════════════════════ */
export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth.ok)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { action } = body;

    /* ── Create from issued request ────────────────────────────── */
    if (action === "create_from_request") {
      const {
        request_id,
        store_type,
        branch,
        received_by,
        received_by_name,
        received_by_name_ar,
        department,
        notes,
        items,
        issued_by,
        issued_by_name,
      } = body;

      if (!request_id || !store_type)
        return NextResponse.json(
          { error: "request_id and store_type are required" },
          { status: 400 }
        );

      if (!hasPermission(auth.role!, storePermission(store_type)))
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });

      const now = new Date().toISOString();
      const dnNumber = await nextDnNumber(store_type);

      const dnData = {
        dn_number: dnNumber,
        store_type,
        branch: branch || "",
        request_id,
        items: items || [],
        issued_by: issued_by || auth.uid,
        issued_by_name: issued_by_name || auth.role || "",
        received_by: received_by || "",
        received_by_name: received_by_name || "",
        received_by_name_ar: received_by_name_ar || "",
        department: department || "",
        status: "pending_acknowledgment",
        issued_at: now,
        acknowledged_at: null,
        notes: notes || "",
        created_at: now,
      };

      const ref = await adminDb.collection(DN_COLLECTION).add(dnData);
      logAudit({ actor: auth.uid!, action: "delivery_note.create", details: `Created DN ${dnNumber}`, targetId: dnNumber, targetType: "delivery_note" });

      return NextResponse.json(
        { success: true, id: ref.id, dn_number: dnNumber },
        { headers: CACHE_NONE }
      );
    }

    /* ── Quick issue (no prior request) ────────────────────────── */
    if (action === "quick_issue") {
      const {
        store_type,
        branch,
        items,
        received_by,
        received_by_name,
        received_by_name_ar,
        department,
        notes,
        issued_by,
        issued_by_name,
      } = body;

      if (!store_type || !items || !Array.isArray(items) || items.length === 0)
        return NextResponse.json(
          { error: "store_type and items[] are required" },
          { status: 400 }
        );

      if (!hasPermission(auth.role!, storePermission(store_type)))
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });

      const cfg = STORE_CONFIGS[store_type as "general" | "it"];
      if (!cfg)
        return NextResponse.json(
          { error: "Invalid store_type" },
          { status: 400 }
        );

      const now = new Date().toISOString();
      const batch = adminDb.batch();
      const dnItems: Array<{
        item_id: string;
        item_name: string;
        quantity: number;
        condition: string;
        remarks: string;
      }> = [];

      // Deduct stock + create transactions for each item
      for (const it of items) {
        if (!it.item_id || !it.quantity || it.quantity <= 0) continue;

        const itemSnap = await adminDb
          .collection(cfg.collections.items)
          .where("item_id", "==", it.item_id)
          .limit(1)
          .get();

        if (itemSnap.empty) continue;

        const itemRef = itemSnap.docs[0].ref;
        const itemData = itemSnap.docs[0].data();
        const currentQty = (itemData.quantity as number) || 0;
        const deductQty = Math.min(it.quantity, currentQty);

        if (deductQty > 0) {
          batch.update(itemRef, {
            quantity: FieldValue.increment(-deductQty),
          });

          // Transaction record
          const txnRef = adminDb.collection(cfg.collections.transactions).doc();
          batch.set(txnRef, {
            txn_id: `${cfg.idPrefix}-ISS-${Date.now()}-${it.item_id}`,
            type: "issue",
            item_id: it.item_id,
            item_name: itemData.name || it.item_name || "",
            quantity: deductQty,
            request_id: null,
            staff_number: received_by || null,
            staff_name: received_by_name || null,
            notes: "Quick issue",
            performed_by: issued_by || auth.uid || "system",
            timestamp: now,
          });
        }

        dnItems.push({
          item_id: it.item_id,
          item_name: itemData.name || it.item_name || "",
          quantity: deductQty || it.quantity,
          condition: it.condition || "good",
          remarks: it.remarks || "",
        });
      }

      if (dnItems.length === 0)
        return NextResponse.json(
          { error: "No valid items to issue" },
          { status: 400 }
        );

      await batch.commit();

      // Create delivery note
      const dnNumber = await nextDnNumber(store_type);
      const dnData = {
        dn_number: dnNumber,
        store_type,
        branch: branch || "",
        request_id: null,
        items: dnItems,
        issued_by: issued_by || auth.uid,
        issued_by_name: issued_by_name || "",
        received_by: received_by || "",
        received_by_name: received_by_name || "",
        received_by_name_ar: received_by_name_ar || "",
        department: department || "",
        status: "pending_acknowledgment",
        issued_at: now,
        acknowledged_at: null,
        notes: notes || "",
        created_at: now,
      };

      const ref = await adminDb.collection(DN_COLLECTION).add(dnData);
      logAudit({ actor: auth.uid!, action: "delivery_note.quick_issue", details: `Quick issued DN ${dnNumber}`, targetId: dnNumber, targetType: "delivery_note" });

      return NextResponse.json(
        { success: true, id: ref.id, dn_number: dnNumber },
        { headers: CACHE_NONE }
      );
    }

    /* ── Acknowledge ───────────────────────────────────────────── */
    if (action === "acknowledge") {
      const { id } = body;
      if (!id)
        return NextResponse.json({ error: "id required" }, { status: 400 });

      const ref = adminDb.collection(DN_COLLECTION).doc(id);
      const doc = await ref.get();
      if (!doc.exists)
        return NextResponse.json(
          { error: "Delivery note not found" },
          { status: 404 }
        );

      const data = doc.data()!;
      if (data.status === "acknowledged")
        return NextResponse.json(
          { error: "Already acknowledged" },
          { status: 400 }
        );

      await ref.update({
        status: "acknowledged",
        acknowledged_at: new Date().toISOString(),
      });

      logAudit({ actor: auth.uid!, action: "delivery_note.acknowledge", details: `Acknowledged DN ${data.dn_number}`, targetId: data.dn_number, targetType: "delivery_note" });

      return NextResponse.json({ success: true }, { headers: CACHE_NONE });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("Delivery notes POST error:", err);
    return NextResponse.json(
      { error: "Failed to process delivery note" },
      { status: 500 }
    );
  }
}
