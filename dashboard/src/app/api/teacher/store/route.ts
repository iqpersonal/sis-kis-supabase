import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { STORE_CONFIGS } from "@/lib/store-config";

async function getTeacher(uid: string, supabase: ReturnType<typeof createServiceClient>) {
  const { data } = await supabase.from("admin_users").select("id, email, display_name, role").eq("id", uid).maybeSingle();
  if (!data) return null;
  const d = data as Record<string, unknown>;
  if (d["role"] !== "teacher") return null;
  return { uid: String(d["id"]), email: String(d["email"] || ""), displayName: String(d["display_name"] || "") };
}

async function getStaffInfo(email: string, supabase: ReturnType<typeof createServiceClient>) {
  const { data } = await supabase.from("staff").select("id, employee_id, full_name").ilike('"E_Mail"', email).maybeSingle();
  if (!data) return null;
  const d = data as Record<string, unknown>;
  return { staffNumber: String(d["employee_id"] || d["id"]), name: String(d["full_name"] || email) };
}

export async function GET(req: NextRequest) {
  const uid = req.nextUrl.searchParams.get("uid");
  if (!uid) return NextResponse.json({ error: "uid required" }, { status: 400 });

  const supabase = createServiceClient();
  const teacher = await getTeacher(uid, supabase);
  if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const action = req.nextUrl.searchParams.get("action") || "items";
  const storeType = req.nextUrl.searchParams.get("store") || "general";

  if (action === "items") {
    const config = STORE_CONFIGS[storeType as keyof typeof STORE_CONFIGS];
    if (!config) return NextResponse.json({ error: "Invalid store type" }, { status: 400 });

    const { data: items } = await supabase
      .from("store_items")
      .select("*")
      .eq("store_type", storeType)
      .eq("is_active", true)
      .order("name");

    return NextResponse.json({ items: items ?? [] });
  }

  if (action === "requests") {
    const staffInfo = await getStaffInfo(teacher.email, supabase);
    const requestedBy = staffInfo?.staffNumber || uid;

    const { data: requests } = await supabase
      .from("store_requests")
      .select("*")
      .eq("requested_by", requestedBy)
      .order("requested_at", { ascending: false })
      .limit(60);

    return NextResponse.json({ requests: requests ?? [] });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { uid, store, items, notes } = body;
  if (!uid) return NextResponse.json({ error: "uid required" }, { status: 400 });

  const supabase = createServiceClient();
  const teacher = await getTeacher(uid, supabase);
  if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!store || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "Store type and items are required" }, { status: 400 });
  }

  const config = STORE_CONFIGS[store as keyof typeof STORE_CONFIGS];
  if (!config) return NextResponse.json({ error: "Invalid store type" }, { status: 400 });

  const staffInfo = await getStaffInfo(teacher.email, supabase);
  const requestedBy = staffInfo?.staffNumber || uid;
  const requestedByName = staffInfo?.name || teacher.displayName;

  // Auto-increment counter
  const counterId = `${store}_requests`;
  const { data: counterRow } = await supabase.from("counters").select("count").eq("id", counterId).maybeSingle();
  const nextNum = ((counterRow as Record<string, unknown> | null)?.["count"] as number ?? 0) + 1;
  const requestId = `${config.idPrefix}-REQ-${String(nextNum).padStart(4, "0")}`;

  const id = crypto.randomUUID();
  await supabase.from("store_requests").insert({
    id,
    request_id: requestId,
    store_type: store,
    requested_by: requestedBy,
    requested_by_name: requestedByName,
    items: items.map((i: { item_id: string; item_name: string; quantity: number }) => ({
      item_id: i.item_id, item_name: i.item_name, qty_requested: i.quantity, qty_approved: 0,
    })),
    status: "pending",
    notes: notes || "",
    requested_at: new Date().toISOString(),
  });

  await supabase.from("counters").upsert({ id: counterId, count: nextNum });

  return NextResponse.json({ id, request_id: requestId, success: true }, { status: 201 });
}
