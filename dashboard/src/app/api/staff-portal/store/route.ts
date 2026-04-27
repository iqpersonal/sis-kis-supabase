import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { createServiceClient } from "@/lib/supabase-server";
import { STORE_CONFIGS } from "@/lib/store-config";
import {
  getStoreItems, getStoreRequests, submitRequest, receiveStock, createPurchaseOrder,
  getPurchaseOrders, receivePurchaseOrder, getStockTakes, getStockTake, updateStockTakeCount,
} from "@/lib/store-api";

const STORE_MANAGE_ROLES = new Set(["admin", "super_admin", "school_admin", "store_clerk", "it_manager", "it_admin"]);

function extractToken(req: NextRequest): string | null {
  const h = req.headers.get("authorization");
  if (h?.startsWith("Bearer ")) return h.slice(7);
  return null;
}

type SB = ReturnType<typeof createServiceClient>;

async function getStaffInfo(supabase: SB, email: string): Promise<{ staffNumber: string; name: string } | null> {
  const { data } = await supabase.from("staff").select("Staff_Number, E_Full_Name, id").ilike("E_Mail", email).limit(1);
  if (!data || data.length === 0) return null;
  const d = data[0] as Record<string, unknown>;
  return { staffNumber: String(d.Staff_Number || d.id || ""), name: String(d.E_Full_Name || email) };
}

async function getUserRole(supabase: SB, uid: string): Promise<string | null> {
  const { data } = await supabase.from("admin_users").select("role").eq("id", uid).maybeSingle();
  return (data as Record<string,unknown>|null)?.role as string || null;
}

export async function GET(req: NextRequest) {
  const token = extractToken(req);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let decoded;
  try { decoded = await adminAuth.verifyIdToken(token); } catch { return NextResponse.json({ error: "Invalid token" }, { status: 401 }); }

  const action = req.nextUrl.searchParams.get("action") || "items";
  const storeType = req.nextUrl.searchParams.get("store") || "general";
  const supabase = createServiceClient();

  if (action === "items") {
    const config = STORE_CONFIGS[storeType as keyof typeof STORE_CONFIGS];
    if (!config) return NextResponse.json({ error: "Invalid store type" }, { status: 400 });
    const items = await getStoreItems(supabase, config, {});
    const active = items.filter((i) => (i as Record<string,unknown>).is_active !== false);
    return NextResponse.json({ items: active });
  }

  if (action === "requests") {
    const staffInfo = await getStaffInfo(supabase, decoded.email || "");
    if (!staffInfo) return NextResponse.json({ error: "Staff not found" }, { status: 404 });
    const [gsResult, itsResult] = await Promise.all([
      getStoreRequests(supabase, STORE_CONFIGS.general, { staff: staffInfo.staffNumber, limit: 30 }),
      getStoreRequests(supabase, STORE_CONFIGS.it, { staff: staffInfo.staffNumber, limit: 30 }),
    ]);
    const requests = [
      ...gsResult.rows.map((r) => ({ ...(r as Record<string,unknown>), store: "general" })),
      ...itsResult.rows.map((r) => ({ ...(r as Record<string,unknown>), store: "it" })),
    ].sort((a, b) => String((b as Record<string,unknown>).requested_at || "").localeCompare(String((a as Record<string,unknown>).requested_at || "")));
    return NextResponse.json({ requests });
  }

  if (action === "role") {
    const role = await getUserRole(supabase, decoded.uid);
    return NextResponse.json({ role: role || "staff", canIssue: !!role && STORE_MANAGE_ROLES.has(role) });
  }

  if (action === "notifications") {
    const staffInfo = await getStaffInfo(supabase, decoded.email || "");
    if (!staffInfo) return NextResponse.json({ notifications: [] });
    try {
      const { data } = await supabase.from("store_notifications").select("*").eq("staff_number", staffInfo.staffNumber).eq("read", false).order("created_at", { ascending: false }).limit(20);
      return NextResponse.json({ notifications: data ?? [] });
    } catch { return NextResponse.json({ notifications: [] }); }
  }

  if (action === "purchase_orders") {
    const role = await getUserRole(supabase, decoded.uid);
    if (!role || !STORE_MANAGE_ROLES.has(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const config = STORE_CONFIGS[storeType as keyof typeof STORE_CONFIGS] || STORE_CONFIGS.general;
    const purchase_orders = await getPurchaseOrders(supabase, config);
    return NextResponse.json({ purchase_orders });
  }

  if (action === "stock_takes") {
    const role = await getUserRole(supabase, decoded.uid);
    if (!role || !STORE_MANAGE_ROLES.has(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const config = STORE_CONFIGS[storeType as keyof typeof STORE_CONFIGS] || STORE_CONFIGS.general;
    const result = await getStockTakes(supabase, config);
    return NextResponse.json({ stock_takes: result });
  }

  if (action === "stock_take") {
    const role = await getUserRole(supabase, decoded.uid);
    if (!role || !STORE_MANAGE_ROLES.has(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const config = STORE_CONFIGS[storeType as keyof typeof STORE_CONFIGS] || STORE_CONFIGS.general;
    const result = await getStockTake(supabase, config, id);
    if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ stock_take: result });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

export async function POST(req: NextRequest) {
  const token = extractToken(req);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let decoded;
  try { decoded = await adminAuth.verifyIdToken(token); } catch { return NextResponse.json({ error: "Invalid token" }, { status: 401 }); }

  const supabase = createServiceClient();
  const staffInfo = await getStaffInfo(supabase, decoded.email || "");
  if (!staffInfo) return NextResponse.json({ error: "Staff not found" }, { status: 404 });

  const body = await req.json();
  const { store, items, notes, action } = body;

  if (!store || !items || !Array.isArray(items) || items.length === 0) return NextResponse.json({ error: "Store type and items are required" }, { status: 400 });
  const config = STORE_CONFIGS[store as keyof typeof STORE_CONFIGS];
  if (!config) return NextResponse.json({ error: "Invalid store type" }, { status: 400 });

  if (action === "quick_issue") {
    const { recipient_name, department, branch } = body;
    if (!recipient_name?.trim()) return NextResponse.json({ error: "Recipient name is required" }, { status: 400 });
    const role = await getUserRole(supabase, decoded.uid);
    if (!role || !STORE_MANAGE_ROLES.has(role)) return NextResponse.json({ error: "Not authorized to issue items" }, { status: 403 });

    const now = new Date().toISOString();
    const issuedItems: Array<{ item_id: string; item_name: string; quantity: number }> = [];

    for (const it of items) {
      if (!it.item_id || !it.quantity || it.quantity <= 0) continue;
      const { data: itemRows } = await supabase.from("store_items").select("*").eq("store_type", config.type).eq("item_id", String(it.item_id)).limit(1);
      if (!itemRows || itemRows.length === 0) continue;
      const itemData = itemRows[0] as Record<string, unknown>;
      const currentQty = typeof itemData.quantity === "number" ? itemData.quantity : 0;
      const deductQty = Math.min(it.quantity, currentQty);
      if (deductQty <= 0) continue;

      await supabase.from("store_items").update({ quantity: currentQty - deductQty }).eq("id", String(itemData.id));
      await supabase.from("store_transactions").insert({ store_type: config.type, txn_id: `${config.idPrefix}-ISS-${Date.now()}-${it.item_id}`, type: "issue", item_id: it.item_id, item_name: itemData.name || it.item_name || "", quantity: deductQty, request_id: null, staff_number: null, staff_name: recipient_name.trim(), notes: notes || "Quick issue (mobile)", performed_by: decoded.uid, performed_by_name: staffInfo.name, timestamp: now });
      issuedItems.push({ item_id: String(it.item_id), item_name: String(itemData.name || it.item_name || ""), quantity: deductQty });
    }

    if (issuedItems.length === 0) return NextResponse.json({ error: "No valid items to issue (check stock levels)" }, { status: 400 });

    // Auto-create delivery note
    const dnPrefix = store === "it" ? "IT" : "GEN";
    const dnYear = new Date().getFullYear();
    const dnPattern = `DN-${dnPrefix}-${dnYear}-`;
    const { data: dnRows } = await supabase.from("delivery_notes").select("dn_number").like("dn_number", `${dnPattern}%`).order("dn_number", { ascending: false }).limit(1);
    let dnSeq = 1;
    if (dnRows && dnRows.length > 0) { const last = (dnRows[0] as Record<string,unknown>).dn_number as string; dnSeq = (parseInt(last.split("-").pop() || "0", 10) || 0) + 1; }
    const dnNumber = `${dnPattern}${String(dnSeq).padStart(4, "0")}`;

    await supabase.from("delivery_notes").insert({ dn_number: dnNumber, store_type: store, branch: branch || "", request_id: null, items: issuedItems.map((i) => ({ ...i, condition: "good", remarks: "" })), issued_by: decoded.uid, issued_by_name: staffInfo.name, received_by: "", received_by_name: recipient_name.trim(), received_by_name_ar: "", department: (department || "").trim(), status: "pending_acknowledgment", issued_at: now, acknowledged_at: null, notes: notes || "", created_at: now });

    return NextResponse.json({ success: true, dn_number: dnNumber, items_issued: issuedItems.length, total_qty: issuedItems.reduce((s, i) => s + i.quantity, 0) }, { status: 201 });
  }

  if (action === "receive_stock") {
    const userRole = await getUserRole(supabase, decoded.uid);
    if (!userRole || !STORE_MANAGE_ROLES.has(userRole)) return NextResponse.json({ error: "Not authorized to receive stock" }, { status: 403 });
    const receivedItems: { item_id: string; item_name: string; quantity: number }[] = [];
    for (const ri of items as Array<{ item_id: string; item_name: string; quantity: number }>) {
      if (!ri.item_id || typeof ri.quantity !== "number" || ri.quantity <= 0) continue;
      const result = await receiveStock(supabase, config, { item_id: ri.item_id, quantity: ri.quantity, notes: notes || `Mobile receive by ${staffInfo.name}`, performed_by: decoded.uid, performed_by_name: staffInfo.name });
      if (!result.error) receivedItems.push(ri);
    }
    if (receivedItems.length === 0) return NextResponse.json({ error: "No valid items to receive" }, { status: 400 });
    return NextResponse.json({ success: true, items_received: receivedItems.length, total_qty: receivedItems.reduce((s, i) => s + i.quantity, 0) }, { status: 201 });
  }

  if (action === "receive_po") {
    const userRole = await getUserRole(supabase, decoded.uid);
    if (!userRole || !STORE_MANAGE_ROLES.has(userRole)) return NextResponse.json({ error: "Not authorized to receive stock" }, { status: 403 });
    const { po_id, received_items } = body;
    if (!po_id || !Array.isArray(received_items) || received_items.length === 0) return NextResponse.json({ error: "po_id and received_items required" }, { status: 400 });
    const result = await receivePurchaseOrder(supabase, config, { id: po_id, received_items, performed_by: decoded.uid, performed_by_name: staffInfo.name });
    if (result.error) return NextResponse.json({ error: result.error }, { status: result.status || 400 });
    return NextResponse.json({ success: true, ...result.data }, { status: 201 });
  }

  if (action === "update_stock_take_count") {
    const userRole = await getUserRole(supabase, decoded.uid);
    if (!userRole || !STORE_MANAGE_ROLES.has(userRole)) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    const { stock_take_id, item_id, counted_qty } = body;
    if (!stock_take_id || !item_id || counted_qty === undefined) return NextResponse.json({ error: "stock_take_id, item_id, counted_qty required" }, { status: 400 });
    const result = await updateStockTakeCount(supabase, config, { id: stock_take_id, item_id, counted_qty });
    if (result.error) return NextResponse.json({ error: result.error }, { status: result.status || 400 });
    return NextResponse.json(result.data ?? { success: true });
  }

  // Default: submit request
  const result = await submitRequest(supabase, config, { requested_by: staffInfo.staffNumber, requested_by_name: staffInfo.name, items: items.map((i: { item_id: string; item_name: string; quantity: number }) => ({ item_id: i.item_id, name: i.item_name, qty_requested: i.quantity })), notes: notes || "" });
  if (result.error) return NextResponse.json({ error: result.error }, { status: result.status || 400 });
  return NextResponse.json({ ...(result.data as Record<string,unknown>), success: true }, { status: 201 });
}
