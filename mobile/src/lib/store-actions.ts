import {
  doc,
  updateDoc,
  addDoc,
  collection,
  query,
  where,
  limit,
  getDocs,
  increment,
  writeBatch,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { StoreConfig } from "@/lib/store-config";
import type { StoreRequest } from "@/types/store";

/* ── Receive Stock ───────────────────────────────────────────────── */

export async function receiveStock(
  config: StoreConfig,
  itemId: string,
  itemDocId: string,
  itemName: string,
  quantity: number,
  notes: string,
  userId: string
) {
  const batch = writeBatch(db);

  // Update item quantity
  const itemRef = doc(db, config.collections.items, itemDocId);
  batch.update(itemRef, { quantity: increment(quantity), updated_by: userId });

  // Create transaction
  const txnRef = doc(collection(db, config.collections.transactions));
  batch.set(txnRef, {
    txn_id: `${config.idPrefix}-RCV-${Date.now()}`,
    type: "receive",
    item_id: itemId,
    item_name: itemName,
    quantity,
    request_id: null,
    staff_number: null,
    staff_name: null,
    notes,
    performed_by: userId,
    timestamp: new Date().toISOString(),
  });

  await batch.commit();
}

/* ── Update Item ─────────────────────────────────────────────────── */

export async function updateItem(
  config: StoreConfig,
  docId: string,
  updates: Record<string, unknown>,
  userId: string
) {
  const itemRef = doc(db, config.collections.items, docId);
  await updateDoc(itemRef, { ...updates, updated_by: userId });
}

/* ── Create Item ─────────────────────────────────────────────────── */

export async function createItem(
  config: StoreConfig,
  data: {
    name: string;
    name_ar: string;
    category: string;
    unit: string;
    quantity: number;
    reorder_level: number;
    location: string;
    branch: string;
    notes: string;
    barcode?: string;
    image_url?: string;
    custom_image_url?: string;
    description?: string;
  },
  userId: string
) {
  const itemId = `${config.idPrefix}-${Date.now()}`;
  await addDoc(collection(db, config.collections.items), {
    item_id: itemId,
    ...data,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_by: userId,
  });
  return itemId;
}

/* ── Approve Request ─────────────────────────────────────────────── */

export async function approveRequest(
  config: StoreConfig,
  request: StoreRequest,
  userId: string,
  userName: string
) {
  const reqRef = doc(db, config.collections.requests, request.id);
  await updateDoc(reqRef, {
    status: "approved",
    reviewed_by: userId,
    reviewed_by_name: userName,
    reviewed_at: new Date().toISOString(),
  });
}

/* ── Reject Request ──────────────────────────────────────────────── */

export async function rejectRequest(
  config: StoreConfig,
  request: StoreRequest,
  userId: string,
  userName: string,
  reason: string
) {
  const reqRef = doc(db, config.collections.requests, request.id);
  await updateDoc(reqRef, {
    status: "rejected",
    reviewed_by: userId,
    reviewed_by_name: userName,
    reviewed_at: new Date().toISOString(),
    notes: reason,
  });
}

/* ── Issue Request (batch: update request + create transactions + decrement items) ── */

export async function issueRequest(
  config: StoreConfig,
  request: StoreRequest,
  userId: string,
  userName: string
) {
  const batch = writeBatch(db);

  // Update request status
  const reqRef = doc(db, config.collections.requests, request.id);
  batch.update(reqRef, {
    status: "issued",
    issued_by: userId,
    issued_by_name: userName,
    issued_at: new Date().toISOString(),
  });

  // For each item in the request, create transaction + decrement quantity
  for (const reqItem of request.items) {
    const approved = reqItem.qty_approved || reqItem.qty_requested;
    if (approved <= 0) continue;

    // Find the item doc by item_id to decrement its quantity
    const itemQuery = query(
      collection(db, config.collections.items),
      where("item_id", "==", reqItem.item_id),
      limit(1)
    );
    const itemSnap = await getDocs(itemQuery);
    if (!itemSnap.empty) {
      const itemDocRef = itemSnap.docs[0].ref;
      batch.update(itemDocRef, {
        quantity: increment(-approved),
        updated_by: userId,
      });
    }

    // Create issue transaction
    const txnRef = doc(collection(db, config.collections.transactions));
    batch.set(txnRef, {
      txn_id: `${config.idPrefix}-ISS-${Date.now()}-${reqItem.item_id}`,
      type: "issue",
      item_id: reqItem.item_id,
      item_name: reqItem.name,
      quantity: approved,
      request_id: request.request_id,
      staff_number: request.requested_by,
      staff_name: request.requested_by_name,
      notes: "",
      performed_by: userId,
      timestamp: new Date().toISOString(),
    });
  }

  await batch.commit();
}

/* ── Submit Request ──────────────────────────────────────────────── */

export async function submitRequest(
  config: StoreConfig,
  items: { item_id: string; name: string; qty_requested: number }[],
  userId: string,
  userName: string,
  notes: string
) {
  const requestId = `${config.idPrefix}-REQ-${Date.now()}`;
  await addDoc(collection(db, config.collections.requests), {
    request_id: requestId,
    requested_by: userId,
    requested_by_name: userName,
    items: items.map((i) => ({ ...i, qty_approved: 0 })),
    status: "pending",
    notes,
    requested_at: new Date().toISOString(),
    reviewed_by: null,
    reviewed_by_name: null,
    reviewed_at: null,
    issued_by: null,
    issued_by_name: null,
    issued_at: null,
  });
  return requestId;
}

/* ── Quick Issue (direct issue without request — scan & hand out) ── */

export async function quickIssue(
  config: StoreConfig,
  itemDocId: string,
  itemId: string,
  itemName: string,
  quantity: number,
  recipientName: string,
  notes: string,
  userId: string,
  userName: string
) {
  const batch = writeBatch(db);

  // Decrement item quantity
  const itemRef = doc(db, config.collections.items, itemDocId);
  batch.update(itemRef, {
    quantity: increment(-quantity),
    updated_by: userId,
  });

  // Create issue transaction
  const txnRef = doc(collection(db, config.collections.transactions));
  batch.set(txnRef, {
    txn_id: `${config.idPrefix}-QIS-${Date.now()}`,
    type: "issue",
    item_id: itemId,
    item_name: itemName,
    quantity,
    request_id: null,
    staff_number: null,
    staff_name: recipientName,
    notes: notes || "Quick issue",
    performed_by: userId,
    timestamp: new Date().toISOString(),
  });

  await batch.commit();
}
