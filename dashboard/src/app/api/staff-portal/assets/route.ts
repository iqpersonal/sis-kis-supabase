import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { createServiceClient } from "@/lib/supabase-server";

function extractToken(req: NextRequest): string | null {
  const h = req.headers.get("authorization");
  if (h?.startsWith("Bearer ")) return h.slice(7);
  return null;
}

export async function GET(req: NextRequest) {
  const token = extractToken(req);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let decoded;
  try { decoded = await adminAuth.verifyIdToken(token); } catch { return NextResponse.json({ error: "Invalid token" }, { status: 401 }); }

  const email = decoded.email || "";
  const supabase = createServiceClient();

  const { data: staffRows } = await supabase.from("staff").select("Staff_Number, id").ilike("E_Mail", email).limit(1);
  const staffRow = staffRows && staffRows.length > 0 ? staffRows[0] as Record<string,unknown> : null;
  if (!staffRow) return NextResponse.json({ error: "Staff not found" }, { status: 404 });

  const staffNumber = String(staffRow.Staff_Number || staffRow.id || "");
  const { data } = await supabase.from("it_assets").select("*").eq("assigned_to", staffNumber);
  return NextResponse.json({ assets: data ?? [] });
}
