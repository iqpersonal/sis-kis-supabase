/**
 * Shared backend CRUD functions for General Store & IT Store.
 * Both API routes delegate to these functions with their own StoreConfig.
 */

import { FieldValue } from "firebase-admin/firestore";
import type { StoreConfig } from "./store-config";
import type { Role } from "./rbac";

type DB = FirebaseFirestore.Firestore;

const STORE_ALERT_RECIPIENTS: Record<StoreConfig["type"], Role[]> = {
  general: ["store_clerk", "school_admin", "super_admin"],
  it: ["it_admin", "it_manager", "school_admin", "super_admin"],
};

type StoreAlertType = "store_low_stock" | "store_out_of_stock";

function buildStoreAlertState(
  cfg: StoreConfig,
  itemDocId: string,
  itemData: Record<string, unknown>,
  quantityOverride?: number,
): null | {
  alertKey: string;
  type: StoreAlertType;
  severity: "warning" | "critical";
  title: string;
  message: string;
  itemId: string;
  itemName: string;
  quantity: number;
  reorderLevel: number;
} {
  if (itemData.is_active === false) return null;

  const quantity = typeof quantityOverride === "number"
    ? quantityOverride
    : typeof itemData.quantity === "number"
      ? itemData.quantity
      : 0;
  const reorderLevel = typeof itemData.reorder_level === "number" ? itemData.reorder_level : 0;
  const itemId = String(itemData.item_id || itemDocId);
  const itemName = String(itemData.name || itemId);

  if (quantity === 0) {
    return {
      alertKey: `${cfg.type}:${itemId}`,
      type: "store_out_of_stock",
      severity: "critical",
      title: `${cfg.label}: Out of Stock`,
      message: `${itemName} is out of stock`,
      itemId,
      itemName,
      quantity,
      reorderLevel,
    };
  }

  if (reorderLevel > 0 && quantity <= reorderLevel) {
    return {
      alertKey: `${cfg.type}:${itemId}`,
      type: "store_low_stock",
      severity: "warning",
      title: `${cfg.label}: Low Stock`,
      message: `${itemName} has ${quantity} left (reorder at ${reorderLevel})`,
      itemId,
      itemName,
      quantity,
      reorderLevel,
    };
  }

  return null;
}

async function syncOperationalStoreAlert(
  db: DB,
  cfg: StoreConfig,
  itemDocId: string,
  itemData: Record<string, unknown>,
  quantityOverride?: number,
) {
  const nextState = buildStoreAlertState(cfg, itemDocId, itemData, quantityOverride);
  const alertKey = nextState?.alertKey || `${cfg.type}:${String(itemData.item_id || itemDocId)}`;
  const existingSnap = await db
    .collection("store_notifications")
    .where("source", "==", "operational")
    .where("alert_key", "==", alertKey)
    .limit(10)
    .get();

  const activeDocs = existingSnap.docs.filter((doc) => doc.data().active !== false);

  if (!nextState) {
    if (activeDocs.length === 0) return;
    const batch = db.batch();
    const resolvedAt = new Date().toISOString();
    for (const doc of activeDocs) {
      batch.update(doc.ref, { active: false, resolved_at: resolvedAt, updated_at: resolvedAt });
    }
    await batch.commit();
    return;
  }

  const now = new Date().toISOString();
  const matchingDoc = activeDocs.find((doc) => doc.data().type === nextState.type);
  const batch = db.batch();

  for (const doc of activeDocs) {
    if (matchingDoc && doc.id === matchingDoc.id) continue;
    batch.update(doc.ref, { active: false, resolved_at: now, updated_at: now });
  }

  if (matchingDoc) {
    batch.update(matchingDoc.ref, {
      title: nextState.title,
      message: nextState.message,
      severity: nextState.severity,
      quantity: nextState.quantity,
      reorder_level: nextState.reorderLevel,
      updated_at: now,
      active: true,
      recipient_roles: STORE_ALERT_RECIPIENTS[cfg.type],
    });
  } else {
    const ref = db.collection("store_notifications").doc();
    batch.set(ref, {
      source: "operational",
      type: nextState.type,
      severity: nextState.severity,
      title: nextState.title,
      message: nextState.message,
      store_type: cfg.type,
      scope: `${cfg.type}_store`,
      alert_key: nextState.alertKey,
      item_doc_id: itemDocId,
      item_id: nextState.itemId,
      item_name: nextState.itemName,
      quantity: nextState.quantity,
      reorder_level: nextState.reorderLevel,
      recipient_roles: STORE_ALERT_RECIPIENTS[cfg.type],
      active: true,
      created_at: now,
      updated_at: now,
    });
  }

  await batch.commit();
}

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
  await syncOperationalStoreAlert(db, cfg, ref.id, doc as Record<string, unknown>);
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
  const updated = await ref.get();
  if (updated.exists) {
    await syncOperationalStoreAlert(db, cfg, updated.id, updated.data() ?? {});
  }
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
  const { item_id, quantity, notes, performed_by, performed_by_name } = body;
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
  const newQuantity = (typeof itemData.quantity === "number" ? itemData.quantity : 0) + quantity;

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
    performed_by_name: (performed_by_name as string) || "",
    timestamp: new Date().toISOString(),
  });

  await syncOperationalStoreAlert(db, cfg, docRef.id, itemData, newQuantity);

  return { data: { success: true, txn_id: txnId } };
}

/* ── Stock Adjustment (increase or decrease with reason) ─────── */
export async function adjustStock(
  db: DB,
  cfg: StoreConfig,
  body: Record<string, unknown>,
) {
  const { item_id, quantity, reason, notes, performed_by, performed_by_name } = body;
  if (!item_id || typeof quantity !== "number" || quantity === 0) {
    return { error: "item_id and non-zero quantity required", status: 400 };
  }
  if (!reason || typeof reason !== "string") {
    return { error: "reason is required for adjustments", status: 400 };
  }

  const snap = await db
    .collection(cfg.collections.items)
    .where("item_id", "==", item_id)
    .limit(1)
    .get();
  if (snap.empty) return { error: "Item not found", status: 404 };

  const docRef = snap.docs[0].ref;
  const itemData = snap.docs[0].data();
  const currentQty = itemData.quantity || 0;
  const newQuantity = currentQty + quantity;

  // Prevent negative stock
  if (newQuantity < 0) {
    return { error: `Cannot adjust below zero. Current stock: ${currentQty}`, status: 400 };
  }

  await docRef.update({ quantity: FieldValue.increment(quantity) });

  const txnId = `${cfg.idPrefix}-ADJ-${Date.now()}`;
  await db.collection(cfg.collections.transactions).add({
    txn_id: txnId,
    type: "adjustment",
    item_id,
    item_name: itemData.name || "",
    quantity,
    request_id: null,
    staff_number: null,
    staff_name: null,
    reason,
    notes: ((notes as string) || "").trim(),
    performed_by: (performed_by as string) || "system",
    performed_by_name: (performed_by_name as string) || "",
    timestamp: new Date().toISOString(),
  });

  await syncOperationalStoreAlert(db, cfg, docRef.id, itemData, newQuantity);

  return { data: { success: true, txn_id: txnId, new_quantity: newQuantity } };
}

/* ── Return Stock (items returned by staff) ──────────────────── */
export async function returnStock(
  db: DB,
  cfg: StoreConfig,
  body: Record<string, unknown>,
) {
  const { item_id, quantity, staff_number, staff_name, reason, notes, performed_by, performed_by_name } = body;
  if (!item_id || typeof quantity !== "number" || quantity <= 0) {
    return { error: "item_id and positive quantity required", status: 400 };
  }
  if (!reason || typeof reason !== "string") {
    return { error: "reason is required for returns", status: 400 };
  }

  const snap = await db
    .collection(cfg.collections.items)
    .where("item_id", "==", item_id)
    .limit(1)
    .get();
  if (snap.empty) return { error: "Item not found", status: 404 };

  const docRef = snap.docs[0].ref;
  const itemData = snap.docs[0].data();
  const newQuantity = (typeof itemData.quantity === "number" ? itemData.quantity : 0) + quantity;

  await docRef.update({ quantity: FieldValue.increment(quantity) });

  const txnId = `${cfg.idPrefix}-RET-${Date.now()}`;
  await db.collection(cfg.collections.transactions).add({
    txn_id: txnId,
    type: "return",
    item_id,
    item_name: itemData.name || "",
    quantity,
    request_id: null,
    staff_number: (staff_number as string) || null,
    staff_name: (staff_name as string) || null,
    reason,
    notes: ((notes as string) || "").trim(),
    performed_by: (performed_by as string) || "system",
    performed_by_name: (performed_by_name as string) || "",
    timestamp: new Date().toISOString(),
  });

  await syncOperationalStoreAlert(db, cfg, docRef.id, itemData, newQuantity);

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

  // Create notification for the requester
  const reqData = existing.data()!;
  try {
    const statusLabel = status === "approved" ? "Approved" : status === "partially_approved" ? "Partially Approved" : "Rejected";
    await db.collection("store_notifications").add({
      type: "request_status",
      request_id: reqData.request_id || id,
      staff_number: reqData.requested_by,
      staff_name: reqData.requested_by_name || "",
      title: `Request ${statusLabel}`,
      message: `Your store request ${reqData.request_id || ""} has been ${statusLabel.toLowerCase()}`,
      status: status as string,
      read: false,
      created_at: new Date().toISOString(),
    });
  } catch (e) {
    console.warn("Failed to create request notification:", e);
  }

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
  const updatedItems: Array<{ docId: string; data: Record<string, unknown>; quantity: number }> = [];

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
        updatedItems.push({
          docId: itemSnap.docs[0].id,
          data: itemSnap.docs[0].data(),
          quantity: currentQty - deductQty,
        });

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
          performed_by_name: (issued_by_name as string) || "",
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

  for (const item of updatedItems) {
    await syncOperationalStoreAlert(db, cfg, item.docId, item.data, item.quantity);
  }

  // Auto-create delivery note
  const dnPrefix = cfg.type === "general" ? "GEN" : "IT";
  const dnYear = new Date().getFullYear();
  const dnPattern = `DN-${dnPrefix}-${dnYear}-`;

  const dnSnap = await db
    .collection("delivery_notes")
    .where("dn_number", ">=", dnPattern)
    .where("dn_number", "<=", dnPattern + "\uf8ff")
    .orderBy("dn_number", "desc")
    .limit(1)
    .get();

  let dnSeq = 1;
  if (!dnSnap.empty) {
    const lastDn = dnSnap.docs[0].data().dn_number as string;
    const parts = lastDn.split("-");
    dnSeq = (parseInt(parts[parts.length - 1], 10) || 0) + 1;
  }
  const dnNumber = `${dnPattern}${String(dnSeq).padStart(4, "0")}`;

  const dnItems = requestItems
    .filter((ri) => ri.qty_approved > 0)
    .map((ri) => ({
      item_id: ri.item_id,
      item_name: ri.name,
      quantity: ri.qty_approved,
      condition: "good",
      remarks: "",
    }));

  const dnRef = await db.collection("delivery_notes").add({
    dn_number: dnNumber,
    store_type: cfg.type,
    branch: "",
    request_id: reqData.request_id || null,
    items: dnItems,
    issued_by: issued_by || "system",
    issued_by_name: (issued_by_name as string) || "",
    received_by: reqData.requested_by || "",
    received_by_name: reqData.requested_by_name || "",
    received_by_name_ar: "",
    department: "",
    status: "pending_acknowledgment",
    issued_at: now,
    acknowledged_at: null,
    notes: `Auto-created from request ${reqData.request_id}`,
    created_at: now,
  });

  await notifyRequestIssued(db, reqData, dnNumber);

  return { data: { success: true, dn_id: dnRef.id, dn_number: dnNumber } };
}

/* ── Create notification for requester when request is issued ── */
async function notifyRequestIssued(db: DB, reqData: Record<string, unknown>, dnNumber: string) {
  try {
    await db.collection("store_notifications").add({
      type: "request_issued",
      request_id: reqData.request_id || "",
      staff_number: reqData.requested_by,
      staff_name: reqData.requested_by_name || "",
      title: "Items Ready for Pickup",
      message: `Your request ${reqData.request_id || ""} has been issued. Delivery Note: ${dnNumber}`,
      dn_number: dnNumber,
      read: false,
      created_at: new Date().toISOString(),
    });
  } catch (e) {
    console.warn("Failed to create issue notification:", e);
  }
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

// ── Stock Take ──────────────────────────────────────────

export async function createStockTake(
  db: DB,
  cfg: StoreConfig,
  body: Record<string, unknown>,
  user: string,
) {
  const notes = (body.notes as string) || "";

  // Snapshot all current items
  const snap = await db.collection(cfg.collections.items).get();
  const items: Record<string, { name: string; system_qty: number; counted_qty: number | null }> = {};
  snap.docs.forEach((d) => {
    const data = d.data();
    items[d.id] = { name: data.name || d.id, system_qty: data.quantity ?? 0, counted_qty: null };
  });

  const col = cfg.type === "general" ? "gs_stock_takes" : "its_stock_takes";
  const ref = await db.collection(col).add({
    status: "in_progress",
    created_by: user,
    created_at: new Date().toISOString(),
    completed_at: null,
    notes,
    items,
    item_count: Object.keys(items).length,
    counted: 0,
    variances: 0,
  });

  return { data: { success: true, id: ref.id } };
}

export async function getStockTakes(
  db: DB,
  cfg: StoreConfig,
) {
  const col = cfg.type === "general" ? "gs_stock_takes" : "its_stock_takes";
  const snap = await db.collection(col).orderBy("created_at", "desc").limit(20).get();
  const takes = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return { data: { stock_takes: takes } };
}

export async function getStockTake(
  db: DB,
  cfg: StoreConfig,
  id: string,
) {
  const col = cfg.type === "general" ? "gs_stock_takes" : "its_stock_takes";
  const doc = await db.collection(col).doc(id).get();
  if (!doc.exists) return { error: "Stock take not found", status: 404 };
  return { data: { stock_take: { id: doc.id, ...doc.data() } } };
}

export async function updateStockTakeCount(
  db: DB,
  cfg: StoreConfig,
  body: Record<string, unknown>,
) {
  const { stock_take_id, item_id, counted_qty } = body;
  if (!stock_take_id || !item_id || counted_qty === undefined)
    return { error: "stock_take_id, item_id, counted_qty required", status: 400 };

  const col = cfg.type === "general" ? "gs_stock_takes" : "its_stock_takes";
  const ref = db.collection(col).doc(stock_take_id as string);
  const doc = await ref.get();
  if (!doc.exists) return { error: "Stock take not found", status: 404 };
  if (doc.data()?.status !== "in_progress") return { error: "Stock take is not in progress", status: 400 };

  const items = doc.data()!.items as Record<string, { name: string; system_qty: number; counted_qty: number | null }>;
  if (!items[item_id as string]) return { error: "Item not in this stock take", status: 404 };

  items[item_id as string].counted_qty = Number(counted_qty);

  // Recalculate counted + variances
  let counted = 0;
  let variances = 0;
  Object.values(items).forEach((it) => {
    if (it.counted_qty !== null) {
      counted++;
      if (it.counted_qty !== it.system_qty) variances++;
    }
  });

  await ref.update({ items, counted, variances });
  return { data: { success: true, counted, variances } };
}

export async function completeStockTake(
  db: DB,
  cfg: StoreConfig,
  body: Record<string, unknown>,
  user: string,
) {
  const { stock_take_id, apply_adjustments } = body;
  if (!stock_take_id) return { error: "stock_take_id required", status: 400 };

  const col = cfg.type === "general" ? "gs_stock_takes" : "its_stock_takes";
  const ref = db.collection(col).doc(stock_take_id as string);
  const doc = await ref.get();
  if (!doc.exists) return { error: "Stock take not found", status: 404 };
  if (doc.data()?.status !== "in_progress") return { error: "Stock take is not in progress", status: 400 };

  const items = doc.data()!.items as Record<string, { name: string; system_qty: number; counted_qty: number | null }>;
  const adjustedItems: Array<{ docId: string; data: Record<string, unknown>; quantity: number }> = [];

  // If apply_adjustments, update actual stock quantities
  if (apply_adjustments) {
    const batch = db.batch();
    Object.entries(items).forEach(([itemId, it]) => {
      if (it.counted_qty !== null && it.counted_qty !== it.system_qty) {
        const itemRef = db.collection(cfg.collections.items).doc(itemId);
        batch.update(itemRef, { quantity: it.counted_qty });
        adjustedItems.push({
          docId: itemId,
          data: { item_id: itemId, name: it.name, quantity: it.system_qty },
          quantity: it.counted_qty,
        });

        // Create adjustment transaction
        const txnRef = db.collection(cfg.collections.transactions).doc();
        batch.set(txnRef, {
          txn_id: `ADJ-ST-${Date.now()}-${itemId.slice(0, 4)}`,
          item_id: itemId,
          item_name: it.name,
          type: "adjustment",
          quantity: it.counted_qty - it.system_qty,
          reason: "Physical count correction (Stock Take)",
          performed_by: user,
          created_at: new Date().toISOString(),
        });
      }
    });
    await batch.commit();

    for (const item of adjustedItems) {
      const freshSnap = await db.collection(cfg.collections.items).doc(item.docId).get();
      await syncOperationalStoreAlert(db, cfg, item.docId, freshSnap.data() ?? item.data, item.quantity);
    }
  }

  await ref.update({
    status: "completed",
    completed_at: new Date().toISOString(),
    completed_by: user,
    adjustments_applied: !!apply_adjustments,
  });

  return { data: { success: true } };
}

export async function cancelStockTake(
  db: DB,
  cfg: StoreConfig,
  body: Record<string, unknown>,
) {
  const { stock_take_id } = body;
  if (!stock_take_id) return { error: "stock_take_id required", status: 400 };

  const col = cfg.type === "general" ? "gs_stock_takes" : "its_stock_takes";
  const ref = db.collection(col).doc(stock_take_id as string);
  const doc = await ref.get();
  if (!doc.exists) return { error: "Stock take not found", status: 404 };
  if (doc.data()?.status !== "in_progress") return { error: "Only in-progress stock takes can be cancelled", status: 400 };

  await ref.delete();
  return { data: { success: true } };
}

// ── Purchase Orders ─────────────────────────────────────

export async function createPurchaseOrder(
  db: DB,
  cfg: StoreConfig,
  body: Record<string, unknown>,
  user: string,
) {
  const { supplier, items: poItems, notes, expected_date } = body;
  if (!supplier || !Array.isArray(poItems) || poItems.length === 0)
    return { error: "supplier and items required", status: 400 };

  const col = cfg.type === "general" ? "gs_purchase_orders" : "its_purchase_orders";

  const pfx = cfg.type === "general" ? "gs_" : "its_";
  const counterRef = db.collection("counters").doc(`${pfx}po`);
  const counterSnap = await counterRef.get();
  const nextNum = (counterSnap.exists ? (counterSnap.data()?.count || 0) : 0) + 1;
  await counterRef.set({ count: nextNum }, { merge: true });
  const poNumber = `${cfg.idPrefix}-PO-${String(nextNum).padStart(4, "0")}`;

  const orderItems = (poItems as Array<{ item_id: string; item_name: string; quantity: number; unit_cost?: number }>).map((i) => ({
    item_id: i.item_id,
    item_name: i.item_name,
    quantity: i.quantity,
    unit_cost: i.unit_cost || 0,
    received_qty: 0,
  }));

  const totalCost = orderItems.reduce((s, i) => s + i.quantity * i.unit_cost, 0);

  const ref = await db.collection(col).add({
    po_number: poNumber,
    supplier: supplier as string,
    status: "draft",
    items: orderItems,
    total_cost: totalCost,
    notes: (notes as string) || "",
    expected_date: (expected_date as string) || null,
    created_by: user,
    created_at: new Date().toISOString(),
    approved_at: null,
    approved_by: null,
    received_at: null,
  });

  return { data: { success: true, id: ref.id, po_number: poNumber } };
}

export async function getPurchaseOrders(
  db: DB,
  cfg: StoreConfig,
) {
  const col = cfg.type === "general" ? "gs_purchase_orders" : "its_purchase_orders";
  const snap = await db.collection(col).orderBy("created_at", "desc").limit(50).get();
  const orders = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return { data: { purchase_orders: orders } };
}

export async function approvePurchaseOrder(
  db: DB,
  cfg: StoreConfig,
  body: Record<string, unknown>,
  user: string,
) {
  const { id } = body;
  if (!id) return { error: "id required", status: 400 };
  const col = cfg.type === "general" ? "gs_purchase_orders" : "its_purchase_orders";
  const ref = db.collection(col).doc(id as string);
  const doc = await ref.get();
  if (!doc.exists) return { error: "PO not found", status: 404 };
  if (doc.data()?.status !== "draft") return { error: "Can only approve draft POs", status: 400 };

  await ref.update({ status: "approved", approved_at: new Date().toISOString(), approved_by: user });
  return { data: { success: true } };
}

export async function receivePurchaseOrder(
  db: DB,
  cfg: StoreConfig,
  body: Record<string, unknown>,
  user: string,
) {
  const { id, received_items } = body;
  if (!id || !Array.isArray(received_items))
    return { error: "id and received_items required", status: 400 };

  const col = cfg.type === "general" ? "gs_purchase_orders" : "its_purchase_orders";
  const ref = db.collection(col).doc(id as string);
  const doc = await ref.get();
  if (!doc.exists) return { error: "PO not found", status: 404 };
  const poData = doc.data()!;
  if (poData.status !== "approved" && poData.status !== "partial") return { error: "PO must be approved first", status: 400 };

  const poItems = poData.items as Array<{ item_id: string; item_name: string; quantity: number; unit_cost: number; received_qty: number }>;
  const batch = db.batch();
  const now = new Date().toISOString();
  const updatedItems: Array<{ docId: string; data: Record<string, unknown>; quantity: number }> = [];

  for (const ri of received_items as Array<{ item_id: string; quantity: number }>) {
    const poItem = poItems.find((p) => p.item_id === ri.item_id);
    if (!poItem) continue;
    const newReceived = poItem.received_qty + ri.quantity;
    poItem.received_qty = Math.min(newReceived, poItem.quantity);

    const itemSnap = await db.collection(cfg.collections.items).where("item_id", "==", ri.item_id).limit(1).get();
    if (!itemSnap.empty) {
      const currentQty = (itemSnap.docs[0].data().quantity || 0) as number;
      batch.update(itemSnap.docs[0].ref, { quantity: currentQty + ri.quantity });
      updatedItems.push({
        docId: itemSnap.docs[0].id,
        data: itemSnap.docs[0].data(),
        quantity: currentQty + ri.quantity,
      });
    }

    const txnRef = db.collection(cfg.collections.transactions).doc();
    batch.set(txnRef, {
      txn_id: `${cfg.idPrefix}-PO-RCV-${Date.now()}-${ri.item_id.slice(0, 4)}`,
      type: "receive",
      item_id: ri.item_id,
      item_name: poItem.item_name,
      quantity: ri.quantity,
      reason: `PO ${poData.po_number}`,
      performed_by: user,
      performed_by_name: user,
      timestamp: now,
    });
  }

  const allReceived = poItems.every((p) => p.received_qty >= p.quantity);
  if (allReceived) {
    batch.update(ref, { items: poItems, status: "received", received_at: now });
  } else {
    batch.update(ref, { items: poItems, status: "partial" });
  }

  await batch.commit();

  for (const item of updatedItems) {
    await syncOperationalStoreAlert(db, cfg, item.docId, item.data, item.quantity);
  }
  return { data: { success: true, status: allReceived ? "received" : "partial" } };
}

// ── Branch Transfer ─────────────────────────────────────

export async function transferItems(
  db: DB,
  fromCfg: StoreConfig,
  toCfg: StoreConfig,
  body: Record<string, unknown>,
  user: string,
) {
  const { transfers } = body;
  if (!Array.isArray(transfers) || transfers.length === 0)
    return { error: "transfers array required", status: 400 };

  const batch = db.batch();
  const now = new Date().toISOString();
  const transferId = `TRF-${Date.now()}`;
  const sourceUpdates: Array<{ docId: string; data: Record<string, unknown>; quantity: number }> = [];
  const destUpdates: Array<{ docId: string; data: Record<string, unknown>; quantity: number }> = [];

  for (const t of transfers as Array<{ item_id: string; item_name: string; quantity: number; dest_item_id?: string }>) {
    if (!t.item_id || typeof t.quantity !== "number" || t.quantity <= 0) continue;

    // Decrement from source store
    const srcSnap = await db.collection(fromCfg.collections.items).where("item_id", "==", t.item_id).limit(1).get();
    if (srcSnap.empty) continue;
    const srcDoc = srcSnap.docs[0];
    const srcQty = srcDoc.data().quantity || 0;
    if (srcQty < t.quantity) continue; // Skip if insufficient

    batch.update(srcDoc.ref, { quantity: srcQty - t.quantity });
    sourceUpdates.push({ docId: srcDoc.id, data: srcDoc.data(), quantity: srcQty - t.quantity });

    // Increment in destination store (find matching item by name or dest_item_id)
    let destRef: FirebaseFirestore.DocumentReference | null = null;
    if (t.dest_item_id) {
      const destSnap = await db.collection(toCfg.collections.items).where("item_id", "==", t.dest_item_id).limit(1).get();
      if (!destSnap.empty) destRef = destSnap.docs[0].ref;
    }
    if (destRef) {
      const destDoc = await destRef.get();
      const destQty = (destDoc.data()?.quantity || 0) as number;
      batch.update(destRef, { quantity: destQty + t.quantity });
      destUpdates.push({ docId: destRef.id, data: destDoc.data() ?? {}, quantity: destQty + t.quantity });
    }

    // Create transfer-out transaction in source
    const outRef = db.collection(fromCfg.collections.transactions).doc();
    batch.set(outRef, {
      txn_id: `${fromCfg.idPrefix}-TRF-OUT-${Date.now()}-${t.item_id.slice(0, 4)}`,
      type: "transfer_out",
      item_id: t.item_id,
      item_name: t.item_name || "",
      quantity: -t.quantity,
      reason: `Transfer to ${toCfg.label} (${transferId})`,
      performed_by: user,
      performed_by_name: user,
      timestamp: now,
    });

    // Create transfer-in transaction in destination
    if (destRef) {
      const inRef = db.collection(toCfg.collections.transactions).doc();
      batch.set(inRef, {
        txn_id: `${toCfg.idPrefix}-TRF-IN-${Date.now()}-${t.item_id.slice(0, 4)}`,
        type: "transfer_in",
        item_id: t.dest_item_id || t.item_id,
        item_name: t.item_name || "",
        quantity: t.quantity,
        reason: `Transfer from ${fromCfg.label} (${transferId})`,
        performed_by: user,
        performed_by_name: user,
        timestamp: now,
      });
    }
  }

  await batch.commit();

  for (const item of sourceUpdates) {
    await syncOperationalStoreAlert(db, fromCfg, item.docId, item.data, item.quantity);
  }
  for (const item of destUpdates) {
    await syncOperationalStoreAlert(db, toCfg, item.docId, item.data, item.quantity);
  }
  return { data: { success: true, transfer_id: transferId } };
}
