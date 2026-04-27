import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { createServiceClient } from "@/lib/supabase-server";

function extractToken(req: NextRequest): string | null {
  const h = req.headers.get("authorization");
  if (h?.startsWith("Bearer ")) return h.slice(7);
  return null;
}

async function getStaffNumber(supabase: ReturnType<typeof createServiceClient>, email: string): Promise<string | null> {
  const { data } = await supabase.from("staff").select("Staff_Number, id").ilike("E_Mail", email).limit(1);
  if (!data || data.length === 0) return null;
  const row = data[0] as Record<string, unknown>;
  return String(row.Staff_Number || row.id || "");
}

export async function GET(req: NextRequest) {
  const token = extractToken(req);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let decoded;
  try { decoded = await adminAuth.verifyIdToken(token); } catch { return NextResponse.json({ error: "Invalid token" }, { status: 401 }); }

  const supabase = createServiceClient();
  const wantAll = req.nextUrl.searchParams.get("all") === "true";

  if (wantAll) {
    const { data: adminRow } = await supabase.from("admin_users").select("id").eq("id", decoded.uid).maybeSingle();
    if (!adminRow) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { data } = await supabase.from("it_tickets").select("*").order("created_at", { ascending: false }).limit(200);
    return NextResponse.json({ tickets: data ?? [] });
  }

  const staffNumber = await getStaffNumber(supabase, decoded.email || "");
  if (!staffNumber) return NextResponse.json({ error: "Staff not found" }, { status: 404 });

  const { data } = await supabase.from("it_tickets").select("*").eq("staff_number", staffNumber).order("created_at", { ascending: false }).limit(50);
  return NextResponse.json({ tickets: data ?? [] });
}

export async function POST(req: NextRequest) {
  const token = extractToken(req);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let decoded;
  try { decoded = await adminAuth.verifyIdToken(token); } catch { return NextResponse.json({ error: "Invalid token" }, { status: 401 }); }

  const email = decoded.email || "";
  const supabase = createServiceClient();
  const staffNumber = await getStaffNumber(supabase, email);
  if (!staffNumber) return NextResponse.json({ error: "Staff not found" }, { status: 404 });

  const { data: staffRow } = await supabase.from("staff").select("E_Full_Name").eq("Staff_Number", staffNumber).maybeSingle();
  const staffName = (staffRow as Record<string,unknown>|null)?.E_Full_Name as string || email;

  const body = await req.json();
  const { title, description, category, priority } = body;
  if (!title || !description) return NextResponse.json({ error: "Title and description are required" }, { status: 400 });

  // Generate ticket ID using counter
  const { data: counterRow } = await supabase.from("counters").select("count").eq("id", "it_tickets").maybeSingle();
  const nextNum = ((counterRow as Record<string,unknown>|null)?.count as number || 0) + 1;
  const ticketId = `IT-TKT-${String(nextNum).padStart(4, "0")}`;

  const { data: newRow } = await supabase.from("it_tickets").insert({ ticket_id: ticketId, staff_number: staffNumber, staff_name: staffName, title, description, category: category || "other", priority: priority || "medium", status: "open", assigned_to: null, notes: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString() }).select("id").maybeSingle();

  await supabase.from("counters").upsert({ id: "it_tickets", count: nextNum });

  return NextResponse.json({ id: (newRow as Record<string,unknown>|null)?.id, ticket_id: ticketId, success: true }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const token = extractToken(req);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let decoded;
  try { decoded = await adminAuth.verifyIdToken(token); } catch { return NextResponse.json({ error: "Invalid token" }, { status: 401 }); }

  const supabase = createServiceClient();
  const body = await req.json();
  const { ticketId, note, status, assigned_to } = body;
  if (!ticketId) return NextResponse.json({ error: "ticketId is required" }, { status: 400 });

  const { data: existing } = await supabase.from("it_tickets").select("*").eq("id", ticketId).maybeSingle();
  if (!existing) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (status) updates.status = status;
  if (assigned_to !== undefined) updates.assigned_to = assigned_to;

  if (note) {
    const currentNotes = Array.isArray((existing as Record<string,unknown>).notes) ? (existing as Record<string,unknown>).notes as unknown[] : [];
    updates.notes = [...currentNotes, { text: note, author: decoded.email || "unknown", timestamp: new Date().toISOString() }];
  }

  await supabase.from("it_tickets").update(updates).eq("id", ticketId);
  return NextResponse.json({ success: true });
}
