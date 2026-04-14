/**
 * Shared backend CRUD functions for General Store & IT Store.
 * Both API routes delegate to these functions with their own StoreConfig.
 */

import { FieldValue } from "firebase-admin/firestore";
import type { StoreConfig } from "./store-config";

type DB = FirebaseFirestore.Firestore;

/* ─── GET helpers ─────────────────────────────────────────────── */

export async function getStoreStats(db: DB, cfg: StoreConfig) {
  const snap = await db
    .collection(cfg.collections.items)
    .select("quantity", "reorder_level", "category", "is_active")
    .limit(10000)
    .get();

  let totalItems = 0;
  let totalQty = 0;
  let lowStock = 0;
  let outOfStock = 0;
  const byCategory: Record<string, number> = {};

  for (const doc of snap.docs) {
    const d = doc.data();
    if (d.is_active === false) continue;
    totalItems++;
    const qty = typeof d.quantity === "number" ? d.quantity : 0;
    totalQty += qty;
    if (qty === 0) outOfStock++;
    else if (typeof d.reorder_level === "number" && qty <= d.reorder_level) lowStock++;
    const cat = (d.category as string) || "other";
    byCategory[cat] = (byCategory[cat] || 0) + 1;
  }

  // Pending requests count
  const pendingSnap = await db
    .collection(cfg.collections.requests)
    .where("status", "==", "pending")
    .count()
    .get();
  const pendingRequests = pendingSnap.data().count;

  return {
    total_items: totalItems,
    total_quantity: totalQty,
    low_stock: lowStock,
    out_of_stock: outOfStock,
    by_category: byCategory,
    pending_requests: pendingRequests,
  };
}

export async function getStoreItems(
  db: DB,
  cfg: StoreConfig,
  filters: { category?: string; branch?: string },
) {
  let query: FirebaseFirestore.Query = db.collection(cfg.collections.items);

  if (filters.category && cfg.categories.includes(filters.category)) {
    query = query.where("category", "==", filters.category);
  }
  if (filters.branch) {
    query = query.where("branch", "==", filters.branch);
  }

  const snap = await query.limit(5000).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getStoreRequests(
  db: DB,
  cfg: StoreConfig,
  filters: { status?: string; staff?: string; limit?: number },
) {
  let query: FirebaseFirestore.Query = db.collection(cfg.collections.requests);

  if (filters.status && ["pending", "approved", "partially_approved", "rejected", "issued"].includes(filters.status)) {
    query = query.where("status", "==", filters.status);
  }
  if (filters.staff) {
    query = query.where("requested_by", "==", filters.staff);
  }

  const pageLimit = filters.limit || 500;
  const snap = await query.orderBy("requested_at", "desc").limit(pageLimit + 1).get();
  const hasMore = snap.docs.length > pageLimit;
  const docs = (hasMore ? snap.docs.slice(0, pageLimit) : snap.docs).map((d) => ({ id: d.id, ...d.data() }));
  return { rows: docs, hasMore };
}

export async function getStoreTransactions(
  db: DB,
  cfg: StoreConfig,
  filters: { type?: string; item_id?: string; limit?: number },
) {
  let query: FirebaseFirestore.Query = db.collection(cfg.collections.transactions);

  if (filters.type && ["receive", "issue"].includes(filters.type)) {
    query = query.where("type", "==", filters.type);
  }
  if (filters.item_id) {
    query = query.where("item_id", "==", filters.item_id);
  }

  const pageLimit = filters.limit || 500;
  const snap = await query.orderBy("timestamp", "desc").limit(pageLimit + 1).get();
  const hasMore = snap.docs.length > pageLimit;
  const docs = (hasMore ? snap.docs.slice(0, pageLimit) : snap.docs).map((d) => ({ id: d.id, ...d.data() }));
  return { rows: docs, hasMore };
}

/* ─── POST helpers ────────────────────────────────────────────── */

async function generateItemId(db: DB, cfg: StoreConfig, category: string): Promise<string> {
  const prefix = cfg.categoryPrefixes[category] || "OTH";
  const countSnap = await db
    .collection(cfg.collections.items)
    .where("category", "==", category)
    .count()
    .get();
  const nextNum = countSnap.data().count + 1;
  return `${cfg.idPrefix}-${prefix}-${String(nextNum).padStart(4, "0")}`;
}

async function generateRequestId(db: DB, cfg: StoreConfig): Promise<string> {
  const countSnap = await db.collection(cfg.collections.requests).count().get();
  const nextNum = countSnap.data().count + 1;
  return `${cfg.idPrefix}-REQ-${String(nextNum).padStart(4, "0")}`;
}

export async function createItem(
  db: DB,
  cfg: StoreConfig,
  body: Record<string, unknown>,
) {
  const { name, name_ar, category, unit, quantity, reorder_level, location, branch, notes, barcode, performed_by } = body;
  if (!name || !category) {
    return { error: "name and category are required", status: 400 };
  }
  if (!cfg.categories.includes(category as string)) {
    return { error: `Invalid category. Must be one of: ${cfg.categories.join(", ")}`, status: 400 };
  }

  // Check for duplicate barcode
  const barcodeStr = ((barcode as string) || "").trim();
  if (barcodeStr) {
    const dupSnap = await db.collection(cfg.collections.items)
      .where("barcode", "==", barcodeStr)
      .limit(1)
      .get();
    if (!dupSnap.empty) {
      return { error: `An item with barcode "${barcodeStr}" already exists`, status: 409 };
    }
  }

  const itemId = await generateItemId(db, cfg, category as string);

  const doc = {
    item_id: itemId,
    name: (name as string).trim(),
    name_ar: ((name_ar as string) || "").trim(),
    category,
    unit: ((unit as string) || "piece").trim(),
    quantity: typeof quantity === "number" && quantity >= 0 ? quantity : 0,
    reorder_level: typeof reorder_level === "number" && reorder_level >= 0 ? reorder_level : 0,
    location: ((location as string) || "").trim(),
    branch: ((branch as string) || "").trim(),
    notes: ((notes as string) || "").trim(),
    barcode: ((barcode as string) || "").trim(),
    image_url: "",
    custom_image_url: "",
    is_active: true,
    created_at: new Date().toISOString(),
    updated_by: (performed_by as string) || "system",
  };

  const ref = await db.collection(cfg.collections.items).add(doc);
  return { data: { id: ref.id, ...doc } };
}

export async function updateItem(
  db: DB,
  cfg: StoreConfig,
  body: Record<string, unknown>,
) {
  const { id, ...fields } = body;
  if (!id) return { error: "id required", status: 400 };
  delete fields.action;
  fields.updated_by = (fields.performed_by as string) || "system";
  delete fields.performed_by;

  const ref = db.collection(cfg.collections.items).doc(id as string);
  const existing = await ref.get();
  if (!existing.exists) return { error: "Item not found", status: 404 };

  await ref.update(fields);
  return { data: { success: true } };
}

export async function deleteItem(
  db: DB,
  cfg: StoreConfig,
  body: Record<string, unknown>,
) {
  const { id } = body;
  if (!id) return { error: "id required", status: 400 };
  await db.collection(cfg.collections.items).doc(id as string).delete();
  return { data: { success: true } };
}

export async function bulkImportItems(
  db: DB,
  cfg: StoreConfig,
  body: Record<string, unknown>,
) {
  const { items, performed_by } = body;
  if (!Array.isArray(items) || items.length === 0) {
    return { error: "items array required", status: 400 };
  }

  let imported = 0;
  for (const item of items) {
    if (!item.name || !item.category) continue;
    if (!cfg.categories.includes(item.category)) continue;

    const itemId = await generateItemId(db, cfg, item.category);
    await db.collection(cfg.collections.items).add({
      item_id: itemId,
      name: (item.name || "").trim(),
      name_ar: (item.name_ar || "").trim(),
      category: item.category,
      unit: (item.unit || "piece").trim(),
      quantity: typeof item.quantity === "number" ? Math.max(0, item.quantity) : 0,
      reorder_level: typeof item.reorder_level === "number" ? Math.max(0, item.reorder_level) : 0,
      location: (item.location || "").trim(),
      branch: (item.branch || "").trim(),
      notes: (item.notes || "").trim(),
      barcode: (item.barcode || "").trim(),
      image_url: "",
      custom_image_url: "",
      is_active: true,
      created_at: new Date().toISOString(),
      updated_by: (performed_by as string) || "system",
    });
    imported++;
  }

  return { data: { success: true, imported } };
}

export async function receiveStock(
  db: DB,
  cfg: StoreConfig,
  body: Record<string, unknown>,
) {
  const { item_id, quantity, notes, performed_by } = body;
  if (!item_id || typeof quantity !== "number" || quantity <= 0) {
    return { error: "item_id and positive quantity required", status: 400 };
  }

  // Find item by item_id field
  const snap = await db
    .collection(cfg.collections.items)
    .where("item_id", "==", item_id)
    .limit(1)
    .get();
  if (snap.empty) return { error: "Item not found", status: 404 };

  const docRef = snap.docs[0].ref;
  const itemData = snap.docs[0].data();

  await docRef.update({ quantity: FieldValue.increment(quantity) });

  // Log transaction
  const txnId = `${cfg.idPrefix}-RCV-${Date.now()}`;
  await db.collection(cfg.collections.transactions).add({
    txn_id: txnId,
    type: "receive",
    item_id,
    item_name: itemData.name || "",
    quantity,
    request_id: null,
    staff_number: null,
    staff_name: null,
    notes: ((notes as string) || "").trim(),
    performed_by: (performed_by as string) || "system",
    timestamp: new Date().toISOString(),
  });

  return { data: { success: true, txn_id: txnId } };
}

export async function submitRequest(
  db: DB,
  cfg: StoreConfig,
  body: Record<string, unknown>,
) {
  const { requested_by, requested_by_name, items, notes } = body;
  if (!requested_by || !Array.isArray(items) || items.length === 0) {
    return { error: "requested_by and items array required", status: 400 };
  }

  const requestId = await generateRequestId(db, cfg);

  const requestItems = (items as Array<{ item_id: string; name: string; qty_requested: number }>).map((i) => ({
    item_id: i.item_id,
    name: i.name || "",
    qty_requested: typeof i.qty_requested === "number" ? Math.max(1, i.qty_requested) : 1,
    qty_approved: 0,
  }));

  const doc = {
    request_id: requestId,
    requested_by,
    requested_by_name: ((requested_by_name as string) || "").trim(),
    items: requestItems,
    status: "pending",
    notes: ((notes as string) || "").trim(),
    requested_at: new Date().toISOString(),
    reviewed_by: null,
    reviewed_by_name: null,
    reviewed_at: null,
    issued_by: null,
    issued_by_name: null,
    issued_at: null,
  };

  const ref = await db.collection(cfg.collections.requests).add(doc);
  return { data: { id: ref.id, ...doc } };
}

export async function approveRequest(
  db: DB,
  cfg: StoreConfig,
  body: Record<string, unknown>,
) {
  const { id, status, items, reviewed_by, reviewed_by_name, notes } = body;
  if (!id || !status) return { error: "id and status required", status: 400 };

  const validStatuses = ["approved", "partially_approved", "rejected"];
  if (!validStatuses.includes(status as string)) {
    return { error: `status must be one of: ${validStatuses.join(", ")}`, status: 400 };
  }

  const ref = db.collection(cfg.collections.requests).doc(id as string);
  const existing = await ref.get();
  if (!existing.exists) return { error: "Request not found", status: 404 };
  if (existing.data()?.status !== "pending") {
    return { error: "Can only review pending requests", status: 400 };
  }

  const updates: Record<string, unknown> = {
    status,
    reviewed_by: reviewed_by || null,
    reviewed_by_name: reviewed_by_name || null,
    reviewed_at: new Date().toISOString(),
  };

  // If approved/partially_approved, update approved quantities
  if (Array.isArray(items)) {
    updates.items = items;
  }
  if (notes) updates.notes = notes;

  await ref.update(updates);
  return { data: { success: true } };
}

export async function issueRequest(
  db: DB,
  cfg: StoreConfig,
  body: Record<string, unknown>,
) {
  const { id, issued_by, issued_by_name } = body;
  if (!id) return { error: "id required", status: 400 };

  const ref = db.collection(cfg.collections.requests).doc(id as string);
  const existing = await ref.get();
  if (!existing.exists) return { error: "Request not found", status: 404 };

  const reqData = existing.data()!;
  if (!["approved", "partially_approved"].includes(reqData.status)) {
    return { error: "Can only issue approved requests", status: 400 };
  }

  const requestItems = reqData.items as Array<{ item_id: string; name: string; qty_approved: number }>;
  const batch = db.batch();
  const now = new Date().toISOString();

  // Deduct stock and create transactions for each item
  for (const ri of requestItems) {
    if (ri.qty_approved <= 0) continue;

    // Find item
    const itemSnap = await db
      .collection(cfg.collections.items)
      .where("item_id", "==", ri.item_id)
      .limit(1)
      .get();

    if (!itemSnap.empty) {
      const itemRef = itemSnap.docs[0].ref;
      const currentQty = (itemSnap.docs[0].data().quantity as number) || 0;
      const deductQty = Math.min(ri.qty_approved, currentQty);

      if (deductQty > 0) {
        batch.update(itemRef, { quantity: FieldValue.increment(-deductQty) });

        const txnRef = db.collection(cfg.collections.transactions).doc();
        batch.set(txnRef, {
          txn_id: `${cfg.idPrefix}-ISS-${Date.now()}-${ri.item_id}`,
          type: "issue",
          item_id: ri.item_id,
          item_name: ri.name,
          quantity: deductQty,
          request_id: reqData.request_id,
          staff_number: reqData.requested_by,
          staff_name: reqData.requested_by_name || "",
          notes: `Issued via request ${reqData.request_id}`,
          performed_by: (issued_by as string) || "system",
          timestamp: now,
        });
      }
    }
  }

  // Update request status
  batch.update(ref, {
    status: "issued",
    issued_by: issued_by || null,
    issued_by_name: issued_by_name || null,
    issued_at: now,
  });

  await batch.commit();
  return { data: { success: true } };
}

export async function cancelRequest(
  db: DB,
  cfg: StoreConfig,
  body: Record<string, unknown>,
) {
  const { id } = body;
  if (!id) return { error: "id required", status: 400 };

  const ref = db.collection(cfg.collections.requests).doc(id as string);
  const existing = await ref.get();
  if (!existing.exists) return { error: "Request not found", status: 404 };
  if (existing.data()?.status !== "pending") {
    return { error: "Can only cancel pending requests", status: 400 };
  }

  await ref.update({ status: "rejected", reviewed_at: new Date().toISOString() });
  return { data: { success: true } };
}
