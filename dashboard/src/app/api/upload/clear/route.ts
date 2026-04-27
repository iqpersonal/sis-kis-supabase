import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { verifySuperAdmin } from "@/lib/api-auth";

export async function DELETE(req: NextRequest) {
  const auth = await verifySuperAdmin(req);
  if (!auth.ok) return auth.response;

  const supabase = createServiceClient();
  const { count, error } = await supabase.from("reports").delete().gte("id", "").select("id", { count: "exact", head: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, message: `Deleted ${count ?? 0} document(s)`, count: count ?? 0 });
}
