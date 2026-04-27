/**
 * Shared backend CRUD functions for General Store & IT Store.
 * Supabase implementation — uses store_items, store_requests, store_transactions, etc.
 */

import { createServiceClient } from "@/lib/supabase-server";
import type { StoreConfig } from "./store-config";
import type { Role } from "./rbac";

type SB = ReturnType<typeof createServiceClient>;

const STORE_ALERT_RECIPIENTS: Record<StoreConfig["type"], Role[]> = {
  general: ["store_clerk", "school_admin", "super_admin"],
  it: ["it_admin", "it_manager", "school_admin", "super_admin"],
};

type StoreAlertType = "store_low_stock" | "store_out_of_stock";

function buildStoreAlertState(cfg: StoreConfig, itemDocId: string, itemData: Record<string, unknown>, quantityOverride?: number) {
  if (itemData.is_active === false) return null;
  const quantity = typeof quantityOverride === "number" ? quantityOverride : typeof itemData.quantity === "number" ? itemData.quantity : 0;
  const reorderLevel = typeof itemData.reorder_level === "number" ? itemData.reorder_level : 0;
  const itemId = String(itemData.item_id || itemDocId);
  const itemName = String(itemData.name || itemId);
  if (quantity === 0) return { alertKey: `${cfg.type}:${itemId}`, type: "store_out_of_stock" as StoreAlertType, severity: "critical" as const, title: `${cfg.label}: Out of Stock`, message: `${itemName} is out of stock`, itemId, itemName, quantity, reorderLevel };
  if (reorderLevel > 0 && quantity <= reorderLevel) return { alertKey: `${cfg.type}:${itemId}`, type: "store_low_stock" as StoreAlertType, severity: "warning" as const, title: `${cfg.label}: Low Stock`, message: `${itemName} has ${quantity} left (reorder at ${reorderLevel})`, itemId, itemName, quantity, reorderLevel };
  return null;
}

async function syncOperationalStoreAlert(supabase: SB, cfg: StoreConfig, itemDocId: string, itemData: Record<string, unknown>, quantityOverride?: number) {
  const nextState = buildStoreAlertState(cfg, itemDocId, itemData, quantityOverride);
  const alertKey = nextState?.alertKey || `${cfg.type}:${String(itemData.item_id || itemDocId)}`;
  const { data: existing } = await supabase.from("store_notifications").select("id, type, active").eq("source", "operational").eq("alert_key", alertKey).limit(10);
  const activeDocs = (existing ?? []).filter((r) => (r as Record<string, unknown>).active !== false);
  const now = new Date().toISOString();
  if (!nextState) {
    if (activeDocs.length === 0) return;
    await supabase.from("store_notifications").update({ active: false, resolved_at: now, updated_at: now }).eq("source", "operational").eq("alert_key", alertKey);
    return;
  }
  const matchingDoc = activeDocs.find((r) => (r as Record<string, unknown>).type === nextState.type);
  for (const doc of activeDocs) {
    if (matchingDoc && (doc as Record<string, unknown>).id === (matchingDoc as Record<string, unknown>).id) continue;
    await supabase.from("store_notifications").update({ active: false, resolved_at: now, updated_at: now }).eq("id", (doc as Record<string, unknown>).id as string);
  }
  if (matchingDoc) {
    await supabase.from("store_notifications").update({ title: nextState.title, message: nextState.message, severity: nextState.severity, quantity: nextState.quantity, reorder_level: nextState.reorderLevel, updated_at: now, active: true, recipient_roles: STORE_ALERT_RECIPIENTS[cfg.type] }).eq("id", (matchingDoc as Record<string, unknown>).id as string);
  } else {
    await supabase.from("store_notifications").insert({ source: "operational", type: nextState.type, severity: nextState.severity, title: nextState.title, message: nextState.message, store_type: cfg.type, scope: `${cfg.type}_store`, alert_key: nextState.alertKey, item_doc_id: itemDocId, item_id: nextState.itemId, item_name: nextState.itemName, quantity: nextState.quantity, reorder_level: nextState.reorderLevel, recipient_roles: STORE_ALERT_RECIPIENTS[cfg.type], active: true, created_at: now, updated_at: now });
  }
}

export async function getStoreStats(supabase: SB, cfg: StoreConfig) {
  const { data: rows } = await supabase.from("store_items").select("quantity, reorder_level, category, is_active").eq("store_type", cfg.type).limit(10000);
  let totalItems = 0, totalQty = 0, lowStock = 0, outOfStock = 0;
  const byCategory: Record<string, number> = {};
  for (const d of rows ?? []) {
    const row = d as Record<string, unknown>;
    if (row.is_active === false) continue;
    totalItems++;
    const qty = typeof row.quantity === "number" ? row.quantity : 0;
    totalQty += qty;
    if (qty === 0) outOfStock++;
    else if (typeof row.reorder_level === "number" && qty <= row.reorder_level) lowStock++;
    const cat = (row.category as string) || "other";
    byCategory[cat] = (byCategory[cat] || 0) + 1;
  }
  const { count: pendingRequests } = await supabase.from("store_requests").select("id", { count: "exact", head: true }).eq("store_type", cfg.type).eq("status", "pending");
  return { total_items: totalItems, total_quantity: totalQty, low_stock: lowStock, out_of_stock: outOfStock, by_category: byCategory, pending_requests: pendingRequests ?? 0 };
}

export async function getStoreItems(supabase: SB, cfg: StoreConfig, filters: { category?: string; branch?: string }) {
  let q = supabase.from("store_items").select("*").eq("store_type", cfg.type).limit(5000);
  if (filters.category && cfg.categories.includes(filters.category)) q = q.eq("category", filters.category);
  if (filters.branch) q = q.eq("branch", filters.branch);
  const { data } = await q;
  return data ?? [];
}

export async function getStoreRequests(supabase: SB, cfg: StoreConfig, filters: { status?: string; staff?: string; limit?: number }) {
  const pageLimit = filters.limit || 500;
  let q = supabase.from("store_requests").select("*").eq("store_type", cfg.type).order("requested_at", { ascending: false }).limit(pageLimit + 1);
  if (filters.status && ["pending", "approved", "partially_approved", "rejected", "issued"].includes(filters.status)) q = q.eq("status", filters.status);
  if (filters.staff) q = q.eq("requested_by", filters.staff);
  const { data } = await q;
  const hasMore = (data?.length ?? 0) > pageLimit;
  return { rows: hasMore ? (data ?? []).slice(0, pageLimit) : (data ?? []), hasMore };
}

export async function getStoreTransactions(supabase: SB, cfg: StoreConfig, filters: { type?: string; item_id?: string; limit?: number }) {
  const pageLimit = filters.limit || 500;
  let q = supabase.from("store_transactions").select("*").eq("store_type", cfg.type).order("timestamp", { ascending: false }).limit(pageLimit + 1);
  if (filters.type && ["receive", "issue"].includes(filters.type)) q = q.eq("type", filters.type);
  if (filters.item_id) q = q.eq("item_id", filters.item_id);
  const { data } = await q;
  const hasMore = (data?.length ?? 0) > pageLimit;
  return { rows: hasMore ? (data ?? []).slice(0, pageLimit) : (data ?? []), hasMore };
}

async function generateItemId(supabase: SB, cfg: StoreConfig, category: string): Promise<string> {
  const prefix = cfg.categoryPrefixes[category] || "OTH";
  const { count } = await supabase.from("store_items").select("id", { count: "exact", head: true }).eq("store_type", cfg.type).eq("category", category);
  return `${cfg.idPrefix}-${prefix}-${String((count ?? 0) + 1).padStart(4, "0")}`;
}

async function generateRequestId(supabase: SB, cfg: StoreConfig): Promise<string> {
  const { count } = await supabase.from("store_requests").select("id", { count: "exact", head: true }).eq("store_type", cfg.type);
  return `${cfg.idPrefix}-REQ-${String((count ?? 0) + 1).padStart(4, "0")}`;
}

export async function createItem(supabase: SB, cfg: StoreConfig, body: Record<string, unknown>) {
  const { name, name_ar, category, unit, quantity, reorder_level, location, branch, notes, barcode, performed_by } = body;
  if (!name || !category) return { error: "name and category are required", status: 400 };
  if (!cfg.categories.includes(category as string)) return { error: `Invalid category. Must be one of: ${cfg.categories.join(", ")}`, status: 400 };
  const barcodeStr = ((barcode as string) || "").trim();
  if (barcodeStr) {
    const { data: dup } = await supabase.from("store_items").select("id").eq("store_type", cfg.type).eq("barcode", barcodeStr).maybeSingle();
    if (dup) return { error: `An item with barcode "${barcodeStr}" already exists`, status: 409 };
  }
  const itemId = await generateItemId(supabase, cfg, category as string);
  const doc = { store_type: cfg.type, item_id: itemId, name: (name as string).trim(), name_ar: ((name_ar as string) || "").trim(), category, unit: ((unit as string) || "piece").trim(), quantity: typeof quantity === "number" && quantity >= 0 ? quantity : 0, reorder_level: typeof reorder_level === "number" && reorder_level >= 0 ? reorder_level : 0, location: ((location as string) || "").trim(), branch: ((branch as string) || "").trim(), notes: ((notes as string) || "").trim(), barcode: barcodeStr, image_url: "", custom_image_url: "", is_active: true, created_at: new Date().toISOString(), updated_by: (performed_by as string) || "system" };
  const { data: newRow } = await supabase.from("store_items").insert(doc).select("id").single();
  const newId = (newRow as Record<string, unknown> | null)?.id as string;
  await syncOperationalStoreAlert(supabase, cfg, newId, doc as Record<string, unknown>);
  return { data: { id: newId, ...doc } };
}

export async function updateItem(supabase: SB, cfg: StoreConfig, body: Record<string, unknown>) {
  const { id, ...fields } = body;
  if (!id) return { error: "id required", status: 400 };
  delete fields.action;
  fields.updated_by = (fields.performed_by as string) || "system";
  delete fields.performed_by;
  const { data: existing } = await supabase.from("store_items").select("id").eq("id", id as string).eq("store_type", cfg.type).maybeSingle();
  if (!existing) return { error: "Item not found", status: 404 };
  await supabase.from("store_items").update(fields).eq("id", id as string);
  const { data: updated } = await supabase.from("store_items").select("*").eq("id", id as string).maybeSingle();
  if (updated) await syncOperationalStoreAlert(supabase, cfg, String(id), updated as Record<string, unknown>);
  return { data: { success: true } };
}

export async function deleteItem(supabase: SB, cfg: StoreConfig, body: Record<string, unknown>) {
  const { id } = body;
  if (!id) return { error: "id required", status: 400 };
  await supabase.from("store_items").delete().eq("id", id as string).eq("store_type", cfg.type);
  return { data: { success: true } };
}

export async function bulkImportItems(supabase: SB, cfg: StoreConfig, body: Record<string, unknown>) {
  const { items, performed_by } = body;
  if (!Array.isArray(items) || items.length === 0) return { error: "items array required", status: 400 };
  let imported = 0;
  for (const item of items) {
    if (!item.name || !item.category) continue;
    if (!cfg.categories.includes(item.category)) continue;
    const itemId = await generateItemId(supabase, cfg, item.category);
    await supabase.from("store_items").insert({ store_type: cfg.type, item_id: itemId, name: (item.name || "").trim(), name_ar: (item.name_ar || "").trim(), category: item.category, unit: (item.unit || "piece").trim(), quantity: typeof item.quantity === "number" ? Math.max(0, item.quantity) : 0, reorder_level: typeof item.reorder_level === "number" ? Math.max(0, item.reorder_level) : 0, location: (item.location || "").trim(), branch: (item.branch || "").trim(), notes: (item.notes || "").trim(), barcode: (item.barcode || "").trim(), image_url: "", custom_image_url: "", is_active: true, created_at: new Date().toISOString(), updated_by: (performed_by as string) || "system" });
    imported++;
  }
  return { data: { success: true, imported } };
}

export async function receiveStock(supabase: SB, cfg: StoreConfig, body: Record<string, unknown>) {
  const { item_id, quantity, notes, performed_by, performed_by_name } = body;
  if (!item_id || typeof quantity !== "number" || quantity <= 0) return { error: "item_id and positive quantity required", status: 400 };
  const { data: itemRow } = await supabase.from("store_items").select("*").eq("store_type", cfg.type).eq("item_id", String(item_id)).maybeSingle();
  if (!itemRow) return { error: "Item not found", status: 404 };
  const itemData = itemRow as Record<string, unknown>;
  const currentQty = typeof itemData.quantity === "number" ? itemData.quantity : 0;
  const newQuantity = currentQty + quantity;
  await supabase.from("store_items").update({ quantity: newQuantity }).eq("id", String(itemData.id));
  const txnId = `${cfg.idPrefix}-RCV-${Date.now()}`;
  await supabase.from("store_transactions").insert({ store_type: cfg.type, txn_id: txnId, type: "receive", item_id, item_name: itemData.name || "", quantity, request_id: null, staff_number: null, staff_name: null, notes: ((notes as string) || "").trim(), performed_by: (performed_by as string) || "system", performed_by_name: (performed_by_name as string) || "", timestamp: new Date().toISOString() });
  await syncOperationalStoreAlert(supabase, cfg, String(itemData.id), itemData, newQuantity);
  return { data: { success: true, txn_id: txnId } };
}

export async function adjustStock(supabase: SB, cfg: StoreConfig, body: Record<string, unknown>) {
  const { item_id, quantity, reason, notes, performed_by, performed_by_name } = body;
  if (!item_id || typeof quantity !== "number" || quantity === 0) return { error: "item_id and non-zero quantity required", status: 400 };
  if (!reason || typeof reason !== "string") return { error: "reason is required for adjustments", status: 400 };
  const { data: itemRow } = await supabase.from("store_items").select("*").eq("store_type", cfg.type).eq("item_id", String(item_id)).maybeSingle();
  if (!itemRow) return { error: "Item not found", status: 404 };
  const itemData = itemRow as Record<string, unknown>;
  const currentQty = typeof itemData.quantity === "number" ? itemData.quantity : 0;
  const newQuantity = currentQty + quantity;
  if (newQuantity < 0) return { error: `Cannot adjust below zero. Current stock: ${currentQty}`, status: 400 };
  await supabase.from("store_items").update({ quantity: newQuantity }).eq("id", String(itemData.id));
  const txnId = `${cfg.idPrefix}-ADJ-${Date.now()}`;
  await supabase.from("store_transactions").insert({ store_type: cfg.type, txn_id: txnId, type: "adjustment", item_id, item_name: itemData.name || "", quantity, reason, notes: ((notes as string) || "").trim(), performed_by: (performed_by as string) || "system", performed_by_name: (performed_by_name as string) || "", timestamp: new Date().toISOString() });
  await syncOperationalStoreAlert(supabase, cfg, String(itemData.id), itemData, newQuantity);
  return { data: { success: true, txn_id: txnId, new_quantity: newQuantity } };
}

export async function returnStock(supabase: SB, cfg: StoreConfig, body: Record<string, unknown>) {
  const { item_id, quantity, staff_number, staff_name, reason, notes, performed_by, performed_by_name } = body;
  if (!item_id || typeof quantity !== "number" || quantity <= 0) return { error: "item_id and positive quantity required", status: 400 };
  if (!reason || typeof reason !== "string") return { error: "reason is required for returns", status: 400 };
  const { data: itemRow } = await supabase.from("store_items").select("*").eq("store_type", cfg.type).eq("item_id", String(item_id)).maybeSingle();
  if (!itemRow) return { error: "Item not found", status: 404 };
  const itemData = itemRow as Record<string, unknown>;
  const currentQty = typeof itemData.quantity === "number" ? itemData.quantity : 0;
  const newQuantity = currentQty + quantity;
  await supabase.from("store_items").update({ quantity: newQuantity }).eq("id", String(itemData.id));
  const txnId = `${cfg.idPrefix}-RET-${Date.now()}`;
  await supabase.from("store_transactions").insert({ store_type: cfg.type, txn_id: txnId, type: "return", item_id, item_name: itemData.name || "", quantity, staff_number: (staff_number as string) || null, staff_name: (staff_name as string) || null, reason, notes: ((notes as string) || "").trim(), performed_by: (performed_by as string) || "system", performed_by_name: (performed_by_name as string) || "", timestamp: new Date().toISOString() });
  await syncOperationalStoreAlert(supabase, cfg, String(itemData.id), itemData, newQuantity);
  return { data: { success: true, txn_id: txnId } };
}

export async function submitRequest(supabase: SB, cfg: StoreConfig, body: Record<string, unknown>) {
  const { requested_by, requested_by_name, items, notes } = body;
  if (!requested_by || !Array.isArray(items) || items.length === 0) return { error: "requested_by and items array required", status: 400 };
  const requestId = await generateRequestId(supabase, cfg);
  const requestItems = (items as Array<{ item_id: string; name: string; qty_requested: number }>).map((i) => ({ item_id: i.item_id, name: i.name || "", qty_requested: typeof i.qty_requested === "number" ? Math.max(1, i.qty_requested) : 1, qty_approved: 0 }));
  const doc = { store_type: cfg.type, request_id: requestId, requested_by, requested_by_name: ((requested_by_name as string) || "").trim(), items: requestItems, status: "pending", notes: ((notes as string) || "").trim(), requested_at: new Date().toISOString(), reviewed_by: null, reviewed_by_name: null, reviewed_at: null, issued_by: null, issued_by_name: null, issued_at: null };
  const { data: newRow } = await supabase.from("store_requests").insert(doc).select("id").single();
  return { data: { id: (newRow as Record<string, unknown> | null)?.id, ...doc } };
}

export async function approveRequest(supabase: SB, cfg: StoreConfig, body: Record<string, unknown>) {
  const { id, status, items, reviewed_by, reviewed_by_name, notes } = body;
  if (!id || !status) return { error: "id and status required", status: 400 };
  const validStatuses = ["approved", "partially_approved", "rejected"];
  if (!validStatuses.includes(status as string)) return { error: `status must be one of: ${validStatuses.join(", ")}`, status: 400 };
  const { data: existing } = await supabase.from("store_requests").select("*").eq("id", id as string).eq("store_type", cfg.type).maybeSingle();
  if (!existing) return { error: "Request not found", status: 404 };
  if ((existing as Record<string, unknown>).status !== "pending") return { error: "Can only review pending requests", status: 400 };
  const updates: Record<string, unknown> = { status, reviewed_by: reviewed_by || null, reviewed_by_name: reviewed_by_name || null, reviewed_at: new Date().toISOString() };
  if (Array.isArray(items)) updates.items = items;
  if (notes) updates.notes = notes;
  await supabase.from("store_requests").update(updates).eq("id", id as string);
  const reqData = existing as Record<string, unknown>;
  try {
    const statusLabel = status === "approved" ? "Approved" : status === "partially_approved" ? "Partially Approved" : "Rejected";
    await supabase.from("store_notifications").insert({ type: "request_status", request_id: reqData.request_id || id, staff_number: reqData.requested_by, staff_name: reqData.requested_by_name || "", title: `Request ${statusLabel}`, message: `Your store request ${reqData.request_id || ""} has been ${statusLabel.toLowerCase()}`, read: false, created_at: new Date().toISOString() });
  } catch (e) { console.warn("Failed to create request notification:", e); }
  return { data: { success: true } };
}

export async function issueRequest(supabase: SB, cfg: StoreConfig, body: Record<string, unknown>) {
  const { id, issued_by, issued_by_name } = body;
  if (!id) return { error: "id required", status: 400 };
  const { data: existing } = await supabase.from("store_requests").select("*").eq("id", id as string).eq("store_type", cfg.type).maybeSingle();
  if (!existing) return { error: "Request not found", status: 404 };
  const reqData = existing as Record<string, unknown>;
  if (!["approved", "partially_approved"].includes(reqData.status as string)) return { error: "Can only issue approved requests", status: 400 };
  const requestItems = reqData.items as Array<{ item_id: string; name: string; qty_approved: number }>;
  const now = new Date().toISOString();
  for (const ri of requestItems) {
    if (ri.qty_approved <= 0) continue;
    const { data: itemRow } = await supabase.from("store_items").select("*").eq("store_type", cfg.type).eq("item_id", ri.item_id).maybeSingle();
    if (itemRow) {
      const itemData = itemRow as Record<string, unknown>;
      const currentQty = typeof itemData.quantity === "number" ? itemData.quantity : 0;
      const deductQty = Math.min(ri.qty_approved, currentQty);
      if (deductQty > 0) {
        await supabase.from("store_items").update({ quantity: currentQty - deductQty }).eq("id", String(itemData.id));
        await supabase.from("store_transactions").insert({ store_type: cfg.type, txn_id: `${cfg.idPrefix}-ISS-${Date.now()}-${ri.item_id}`, type: "issue", item_id: ri.item_id, item_name: ri.name, quantity: deductQty, request_id: reqData.request_id, staff_number: reqData.requested_by, staff_name: reqData.requested_by_name || "", notes: `Issued via request ${reqData.request_id}`, performed_by: (issued_by as string) || "system", performed_by_name: (issued_by_name as string) || "", timestamp: now });
      }
    }
  }
  await supabase.from("store_requests").update({ status: "issued", issued_by: issued_by || null, issued_by_name: issued_by_name || null, issued_at: now }).eq("id", id as string);
  // Auto-create delivery note
  const dnPrefix = cfg.type === "general" ? "GEN" : "IT";
  const dnYear = new Date().getFullYear();
  const dnPattern = `DN-${dnPrefix}-${dnYear}-`;
  const { data: dnRows } = await supabase.from("delivery_notes").select("dn_number").gte("dn_number", dnPattern).lte("dn_number", dnPattern + "\uFFFF").order("dn_number", { ascending: false }).limit(1);
  let dnSeq = 1;
  if (dnRows && dnRows.length > 0) { const lastDn = (dnRows[0] as Record<string, unknown>).dn_number as string; const parts = lastDn.split("-"); dnSeq = (parseInt(parts[parts.length - 1], 10) || 0) + 1; }
  const dnNumber = `${dnPattern}${String(dnSeq).padStart(4, "0")}`;
  const dnItems = requestItems.filter((ri) => ri.qty_approved > 0).map((ri) => ({ item_id: ri.item_id, item_name: ri.name, quantity: ri.qty_approved, condition: "good", remarks: "" }));
  const { data: dnRow } = await supabase.from("delivery_notes").insert({ dn_number: dnNumber, store_type: cfg.type, branch: "", request_id: reqData.request_id || null, items: dnItems, issued_by: issued_by || "system", issued_by_name: (issued_by_name as string) || "", received_by: reqData.requested_by || "", received_by_name: reqData.requested_by_name || "", received_by_name_ar: "", department: "", status: "pending_acknowledgment", issued_at: now, acknowledged_at: null, notes: `Auto-created from request ${reqData.request_id}`, created_at: now }).select("id").single();
  try { await supabase.from("store_notifications").insert({ type: "request_issued", request_id: reqData.request_id || "", staff_number: reqData.requested_by, staff_name: reqData.requested_by_name || "", title: "Items Ready for Pickup", message: `Your request ${reqData.request_id || ""} has been issued. Delivery Note: ${dnNumber}`, dn_number: dnNumber, read: false, created_at: now }); } catch (e) { console.warn("Failed to create issue notification:", e); }
  return { data: { success: true, dn_id: (dnRow as Record<string, unknown> | null)?.id, dn_number: dnNumber } };
}

export async function cancelRequest(supabase: SB, cfg: StoreConfig, body: Record<string, unknown>) {
  const { id } = body;
  if (!id) return { error: "id required", status: 400 };
  const { data: existing } = await supabase.from("store_requests").select("status").eq("id", id as string).eq("store_type", cfg.type).maybeSingle();
  if (!existing) return { error: "Request not found", status: 404 };
  if ((existing as Record<string, unknown>).status !== "pending") return { error: "Can only cancel pending requests", status: 400 };
  await supabase.from("store_requests").update({ status: "rejected", reviewed_at: new Date().toISOString() }).eq("id", id as string);
  return { data: { success: true } };
}

export async function createStockTake(supabase: SB, cfg: StoreConfig, body: Record<string, unknown>, user: string) {
  const notes = (body.notes as string) || "";
  const { data: snap } = await supabase.from("store_items").select("id, name, quantity").eq("store_type", cfg.type);
  const items: Record<string, { name: string; system_qty: number; counted_qty: number | null }> = {};
  (snap ?? []).forEach((d) => { const row = d as Record<string, unknown>; items[String(row.id)] = { name: String(row.name || row.id), system_qty: (row.quantity as number) ?? 0, counted_qty: null }; });
  const { data: newRow } = await supabase.from("stock_takes").insert({ store_type: cfg.type, status: "in_progress", created_by: user, created_at: new Date().toISOString(), notes, items, item_count: Object.keys(items).length, counted: 0, variances: 0 }).select("id").single();
  return { data: { success: true, id: (newRow as Record<string, unknown> | null)?.id } };
}

export async function getStockTakes(supabase: SB, cfg: StoreConfig) {
  const { data } = await supabase.from("stock_takes").select("*").eq("store_type", cfg.type).order("created_at", { ascending: false }).limit(20);
  return { data: { stock_takes: data ?? [] } };
}

export async function getStockTake(supabase: SB, cfg: StoreConfig, id: string) {
  const { data } = await supabase.from("stock_takes").select("*").eq("id", id).eq("store_type", cfg.type).maybeSingle();
  if (!data) return { error: "Stock take not found", status: 404 };
  return { data: { stock_take: data } };
}

export async function updateStockTakeCount(supabase: SB, cfg: StoreConfig, body: Record<string, unknown>) {
  const { stock_take_id, item_id, counted_qty } = body;
  if (!stock_take_id || !item_id || counted_qty === undefined) return { error: "stock_take_id, item_id, counted_qty required", status: 400 };
  const { data: doc } = await supabase.from("stock_takes").select("*").eq("id", stock_take_id as string).eq("store_type", cfg.type).maybeSingle();
  if (!doc) return { error: "Stock take not found", status: 404 };
  const docData = doc as Record<string, unknown>;
  if (docData.status !== "in_progress") return { error: "Stock take is not in progress", status: 400 };
  const items = docData.items as Record<string, { name: string; system_qty: number; counted_qty: number | null }>;
  if (!items[item_id as string]) return { error: "Item not in this stock take", status: 404 };
  items[item_id as string].counted_qty = Number(counted_qty);
  let counted = 0, variances = 0;
  Object.values(items).forEach((it) => { if (it.counted_qty !== null) { counted++; if (it.counted_qty !== it.system_qty) variances++; } });
  await supabase.from("stock_takes").update({ items, counted, variances }).eq("id", stock_take_id as string);
  return { data: { success: true, counted, variances } };
}

export async function completeStockTake(supabase: SB, cfg: StoreConfig, body: Record<string, unknown>, user: string) {
  const { stock_take_id, apply_adjustments } = body;
  if (!stock_take_id) return { error: "stock_take_id required", status: 400 };
  const { data: doc } = await supabase.from("stock_takes").select("*").eq("id", stock_take_id as string).eq("store_type", cfg.type).maybeSingle();
  if (!doc) return { error: "Stock take not found", status: 404 };
  const docData = doc as Record<string, unknown>;
  if (docData.status !== "in_progress") return { error: "Stock take is not in progress", status: 400 };
  const items = docData.items as Record<string, { name: string; system_qty: number; counted_qty: number | null }>;
  if (apply_adjustments) {
    for (const [itemId, it] of Object.entries(items)) {
      if (it.counted_qty !== null && it.counted_qty !== it.system_qty) {
        await supabase.from("store_items").update({ quantity: it.counted_qty }).eq("id", itemId).eq("store_type", cfg.type);
        await supabase.from("store_transactions").insert({ store_type: cfg.type, txn_id: `ADJ-ST-${Date.now()}-${itemId.slice(0, 4)}`, item_id: itemId, item_name: it.name, type: "adjustment", quantity: it.counted_qty - it.system_qty, reason: "Physical count correction (Stock Take)", performed_by: user, timestamp: new Date().toISOString() });
      }
    }
  }
  await supabase.from("stock_takes").update({ status: "completed", completed_at: new Date().toISOString(), completed_by: user, adjustments_applied: !!apply_adjustments }).eq("id", stock_take_id as string);
  return { data: { success: true } };
}

export async function cancelStockTake(supabase: SB, cfg: StoreConfig, body: Record<string, unknown>) {
  const { stock_take_id } = body;
  if (!stock_take_id) return { error: "stock_take_id required", status: 400 };
  const { data: doc } = await supabase.from("stock_takes").select("status").eq("id", stock_take_id as string).eq("store_type", cfg.type).maybeSingle();
  if (!doc) return { error: "Stock take not found", status: 404 };
  if ((doc as Record<string, unknown>).status !== "in_progress") return { error: "Only in-progress stock takes can be cancelled", status: 400 };
  await supabase.from("stock_takes").delete().eq("id", stock_take_id as string);
  return { data: { success: true } };
}

export async function createPurchaseOrder(supabase: SB, cfg: StoreConfig, body: Record<string, unknown>, user: string) {
  const { supplier, items: poItems, notes, expected_date } = body;
  if (!supplier || !Array.isArray(poItems) || poItems.length === 0) return { error: "supplier and items required", status: 400 };
  const pfx = cfg.type === "general" ? "gs_" : "its_";
  const { data: counterRow } = await supabase.from("counters").select("count").eq("id", `${pfx}po`).maybeSingle();
  const nextNum = ((counterRow as Record<string, unknown> | null)?.count as number ?? 0) + 1;
  await supabase.from("counters").upsert({ id: `${pfx}po`, count: nextNum });
  const poNumber = `${cfg.idPrefix}-PO-${String(nextNum).padStart(4, "0")}`;
  const orderItems = (poItems as Array<{ item_id: string; item_name: string; quantity: number; unit_cost?: number }>).map((i) => ({ item_id: i.item_id, item_name: i.item_name, quantity: i.quantity, unit_cost: i.unit_cost || 0, received_qty: 0 }));
  const totalCost = orderItems.reduce((s, i) => s + i.quantity * i.unit_cost, 0);
  const { data: newRow } = await supabase.from("purchase_orders").insert({ store_type: cfg.type, po_number: poNumber, supplier: supplier as string, status: "draft", items: orderItems, total_cost: totalCost, notes: (notes as string) || "", expected_date: (expected_date as string) || null, created_by: user, created_at: new Date().toISOString() }).select("id").single();
  return { data: { success: true, id: (newRow as Record<string, unknown> | null)?.id, po_number: poNumber } };
}

export async function getPurchaseOrders(supabase: SB, cfg: StoreConfig) {
  const { data } = await supabase.from("purchase_orders").select("*").eq("store_type", cfg.type).order("created_at", { ascending: false }).limit(50);
  return { data: { purchase_orders: data ?? [] } };
}

export async function approvePurchaseOrder(supabase: SB, cfg: StoreConfig, body: Record<string, unknown>, user: string) {
  const { id } = body;
  if (!id) return { error: "id required", status: 400 };
  const { data: doc } = await supabase.from("purchase_orders").select("status").eq("id", id as string).eq("store_type", cfg.type).maybeSingle();
  if (!doc) return { error: "PO not found", status: 404 };
  if ((doc as Record<string, unknown>).status !== "draft") return { error: "Can only approve draft POs", status: 400 };
  await supabase.from("purchase_orders").update({ status: "approved", approved_at: new Date().toISOString(), approved_by: user }).eq("id", id as string);
  return { data: { success: true } };
}

export async function receivePurchaseOrder(supabase: SB, cfg: StoreConfig, body: Record<string, unknown>, user: string) {
  const { id, received_items } = body;
  if (!id || !Array.isArray(received_items)) return { error: "id and received_items required", status: 400 };
  const { data: doc } = await supabase.from("purchase_orders").select("*").eq("id", id as string).eq("store_type", cfg.type).maybeSingle();
  if (!doc) return { error: "PO not found", status: 404 };
  const poData = doc as Record<string, unknown>;
  if (poData.status !== "approved" && poData.status !== "partial") return { error: "PO must be approved first", status: 400 };
  const poItems = poData.items as Array<{ item_id: string; item_name: string; quantity: number; unit_cost: number; received_qty: number }>;
  const now = new Date().toISOString();
  for (const ri of received_items as Array<{ item_id: string; quantity: number }>) {
    const poItem = poItems.find((p) => p.item_id === ri.item_id);
    if (!poItem) continue;
    poItem.received_qty = Math.min(poItem.received_qty + ri.quantity, poItem.quantity);
    const { data: itemRow } = await supabase.from("store_items").select("id, quantity").eq("store_type", cfg.type).eq("item_id", ri.item_id).maybeSingle();
    if (itemRow) {
      const row = itemRow as Record<string, unknown>;
      await supabase.from("store_items").update({ quantity: ((row.quantity as number) || 0) + ri.quantity }).eq("id", String(row.id));
      await supabase.from("store_transactions").insert({ store_type: cfg.type, txn_id: `${cfg.idPrefix}-PO-RCV-${Date.now()}-${ri.item_id.slice(0, 4)}`, type: "receive", item_id: ri.item_id, item_name: poItem.item_name, quantity: ri.quantity, reason: `PO ${poData.po_number}`, performed_by: user, performed_by_name: user, timestamp: now });
    }
  }
  const allReceived = poItems.every((p) => p.received_qty >= p.quantity);
  await supabase.from("purchase_orders").update({ items: poItems, status: allReceived ? "received" : "partial", ...(allReceived ? { received_at: now } : {}) }).eq("id", id as string);
  return { data: { success: true, status: allReceived ? "received" : "partial" } };
}

export async function transferItems(supabase: SB, fromCfg: StoreConfig, toCfg: StoreConfig, body: Record<string, unknown>, user: string) {
  const { transfers } = body;
  if (!Array.isArray(transfers) || transfers.length === 0) return { error: "transfers array required", status: 400 };
  const now = new Date().toISOString();
  const transferId = `TRF-${Date.now()}`;
  for (const t of transfers as Array<{ item_id: string; item_name: string; quantity: number; dest_item_id?: string }>) {
    if (!t.item_id || typeof t.quantity !== "number" || t.quantity <= 0) continue;
    const { data: srcRow } = await supabase.from("store_items").select("id, quantity").eq("store_type", fromCfg.type).eq("item_id", t.item_id).maybeSingle();
    if (!srcRow) continue;
    const src = srcRow as Record<string, unknown>;
    const srcQty = (src.quantity as number) || 0;
    if (srcQty < t.quantity) continue;
    await supabase.from("store_items").update({ quantity: srcQty - t.quantity }).eq("id", String(src.id));
    await supabase.from("store_transactions").insert({ store_type: fromCfg.type, txn_id: `${fromCfg.idPrefix}-TRF-OUT-${Date.now()}-${t.item_id.slice(0, 4)}`, type: "transfer_out", item_id: t.item_id, item_name: t.item_name || "", quantity: -t.quantity, reason: `Transfer to ${toCfg.label} (${transferId})`, performed_by: user, performed_by_name: user, timestamp: now });
    if (t.dest_item_id) {
      const { data: destRow } = await supabase.from("store_items").select("id, quantity").eq("store_type", toCfg.type).eq("item_id", t.dest_item_id).maybeSingle();
      if (destRow) {
        const dest = destRow as Record<string, unknown>;
        await supabase.from("store_items").update({ quantity: ((dest.quantity as number) || 0) + t.quantity }).eq("id", String(dest.id));
        await supabase.from("store_transactions").insert({ store_type: toCfg.type, txn_id: `${toCfg.idPrefix}-TRF-IN-${Date.now()}-${t.item_id.slice(0, 4)}`, type: "transfer_in", item_id: t.dest_item_id, item_name: t.item_name || "", quantity: t.quantity, reason: `Transfer from ${fromCfg.label} (${transferId})`, performed_by: user, performed_by_name: user, timestamp: now });
      }
    }
  }
  return { data: { success: true, transfer_id: transferId } };
}
