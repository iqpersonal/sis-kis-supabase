import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { verifyAuth } from "@/lib/api-auth";
import { hasPermission } from "@/lib/rbac";
import { CACHE_SHORT, CACHE_NONE } from "@/lib/cache-headers";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

async function nextDnNumber(supabase: ReturnType<typeof createServiceClient>, storeType: string): Promise<string> {
  const prefix = storeType === "general" ? "GEN" : "IT";
  const year = new Date().getFullYear();
  const pattern = `DN-${prefix}-${year}-`;
  const { data } = await supabase.from("delivery_notes").select("dn_number").like("dn_number", `${pattern}%`).order("dn_number", { ascending: false }).limit(1).maybeSingle();
  let seq = 1;
  if (data) {
    const last = (data as Record<string, unknown>).dn_number as string;
    const parts = last.split("-");
    seq = (parseInt(parts[parts.length - 1], 10) || 0) + 1;
  }
  return `${pattern}${String(seq).padStart(4, "0")}`;
}

function storePermission(storeType: string) {
  return storeType === "it" ? "it_store.manage" : "general_store.manage";
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const action = sp.get("action") || "list";
  const supabase = createServiceClient();

  try {
    if (action === "single") {
      const id = sp.get("id");
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
      const { data } = await supabase.from("delivery_notes").select("*").eq("id", id).maybeSingle();
      if (!data) return NextResponse.json({ error: "Delivery note not found" }, { status: 404 });
      return NextResponse.json({ deliveryNote: data }, { headers: CACHE_SHORT });
    }

    const storeType = sp.get("storeType") || "general";
    let q = supabase.from("delivery_notes").select("*").eq("store_type", storeType).order("issued_at", { ascending: false }).limit(200);

    const status = sp.get("status");
    if (status && status !== "all") q = q.eq("status", status);
    const branch = sp.get("branch");
    if (branch && branch !== "all") q = q.eq("branch", branch);

    const { data: notes } = await q;
    return NextResponse.json({ deliveryNotes: notes ?? [] }, { headers: CACHE_SHORT });
  } catch (err) {
    console.error("Delivery notes GET error:", err);
    return NextResponse.json({ error: "Failed to fetch delivery notes" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServiceClient();
  try {
    const body = await req.json();
    const { action } = body;

    if (action === "create_from_request") {
      const { request_id, store_type, branch, received_by, received_by_name, received_by_name_ar, department, notes, items, issued_by, issued_by_name } = body;
      if (!request_id || !store_type) return NextResponse.json({ error: "request_id and store_type are required" }, { status: 400 });
      if (!hasPermission(auth.role!, storePermission(store_type))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

      const now = new Date().toISOString();
      const dnNumber = await nextDnNumber(supabase, store_type);
      const dnData = { dn_number: dnNumber, store_type, branch: branch || "", request_id, items: items || [], issued_by: issued_by || auth.uid, issued_by_name: issued_by_name || auth.role || "", received_by: received_by || "", received_by_name: received_by_name || "", received_by_name_ar: received_by_name_ar || "", department: department || "", status: "pending_acknowledgment", issued_at: now, acknowledged_at: null, notes: notes || "", created_at: now };

      const { data: inserted } = await supabase.from("delivery_notes").insert(dnData).select("id").single();
      logAudit({ actor: auth.uid!, action: "delivery_note.create", details: `Created DN ${dnNumber}`, targetId: dnNumber, targetType: "delivery_note" });
      return NextResponse.json({ success: true, id: (inserted as Record<string, unknown> | null)?.id, dn_number: dnNumber }, { headers: CACHE_NONE });
    }

    if (action === "quick_issue") {
      const { store_type, branch, items, received_by, received_by_name, received_by_name_ar, department, notes, issued_by, issued_by_name } = body;
      if (!store_type || !items || !Array.isArray(items) || items.length === 0) return NextResponse.json({ error: "store_type and items[] are required" }, { status: 400 });
      if (!hasPermission(auth.role!, storePermission(store_type))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

      const now = new Date().toISOString();
      const dnNumber = await nextDnNumber(supabase, store_type);
      const txnPrefix = store_type === "general" ? "GS" : "ITS";
      const dnItems: Array<{ item_id: string; item_name: string; quantity: number; condition: string; remarks: string }> = [];

      for (const it of items) {
        if (!it.item_id || !it.quantity || it.quantity <= 0) continue;
        const { data: itemRow } = await supabase.from("store_items").select("*").eq("store_type", store_type).eq("item_id", it.item_id).maybeSingle();
        if (!itemRow) continue;
        const itemData = itemRow as Record<string, unknown>;
        const currentQty = (itemData.quantity as number) || 0;
        const deductQty = Math.min(it.quantity, currentQty);
        if (deductQty > 0) {
          await supabase.from("store_items").update({ quantity: currentQty - deductQty }).eq("store_type", store_type).eq("item_id", it.item_id);
          await supabase.from("store_transactions").insert({ txn_id: `${txnPrefix}-ISS-${Date.now()}-${it.item_id}`, store_type, type: "issue", item_id: it.item_id, item_name: itemData.name || it.item_name || "", quantity: deductQty, request_id: null, staff_number: received_by || null, staff_name: received_by_name || null, notes: "Quick issue", performed_by: issued_by || auth.uid || "system", timestamp: now });
        }
        dnItems.push({ item_id: it.item_id, item_name: (itemData.name as string) || it.item_name || "", quantity: deductQty || it.quantity, condition: it.condition || "good", remarks: it.remarks || "" });
      }

      if (dnItems.length === 0) return NextResponse.json({ error: "No valid items to issue" }, { status: 400 });

      const { data: dnRow } = await supabase.from("delivery_notes").insert({ dn_number: dnNumber, store_type, branch: branch || "", request_id: null, items: dnItems, issued_by: issued_by || auth.uid, issued_by_name: issued_by_name || "", received_by: received_by || "", received_by_name: received_by_name || "", received_by_name_ar: received_by_name_ar || "", department: department || "", status: "pending_acknowledgment", issued_at: now, acknowledged_at: null, notes: notes || "", created_at: now }).select("id").single();

      logAudit({ actor: auth.uid!, action: "delivery_note.quick_issue", details: `Quick issued DN ${dnNumber}`, targetId: dnNumber, targetType: "delivery_note" });
      return NextResponse.json({ success: true, id: (dnRow as Record<string, unknown> | null)?.id, dn_number: dnNumber }, { headers: CACHE_NONE });
    }

    if (action === "acknowledge") {
      const { id } = body;
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
      const { data } = await supabase.from("delivery_notes").select("*").eq("id", id).maybeSingle();
      if (!data) return NextResponse.json({ error: "Delivery note not found" }, { status: 404 });
      const dnData = data as Record<string, unknown>;
      if (dnData.status === "acknowledged") return NextResponse.json({ error: "Already acknowledged" }, { status: 400 });

      await supabase.from("delivery_notes").update({ status: "acknowledged", acknowledged_at: new Date().toISOString() }).eq("id", id);
      logAudit({ actor: auth.uid!, action: "delivery_note.acknowledge", details: `Acknowledged DN ${dnData.dn_number}`, targetId: dnData.dn_number as string, targetType: "delivery_note" });
      return NextResponse.json({ success: true }, { headers: CACHE_NONE });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("Delivery notes POST error:", err);
    return NextResponse.json({ error: "Failed to process delivery note" }, { status: 500 });
  }
}
