import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { getCached, setCache } from "@/lib/cache";
import { CACHE_MEDIUM } from "@/lib/cache-headers";

/**
 * GET /api/staff
 *   ?action=list         → active staff
 *   ?action=all          → all staff including terminated
 *   ?action=detail&id=X  → single staff member
 *   ?action=departments  → list departments
 *   ?action=stats        → staff KPIs
 */
export async function GET(req: NextRequest) {
  const action = req.nextUrl.searchParams.get("action") || "list";
  const supabase = createServiceClient();

  try {
    if (action === "list") {
      const { data: staff } = await supabase
        .from("staff")
        .select("*")
        .eq("is_active", true)
        .limit(5000);
      return NextResponse.json({ staff: staff ?? [] }, { headers: CACHE_MEDIUM });
    }

    if (action === "all") {
      const { data: staff } = await supabase.from("staff").select("*").limit(5000);
      return NextResponse.json({ staff: staff ?? [] }, { headers: CACHE_MEDIUM });
    }

    if (action === "detail") {
      const id = req.nextUrl.searchParams.get("id");
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

      const [{ data: staffRow, error }, { data: assets }] = await Promise.all([
        supabase.from("staff").select("*").eq("id", id).maybeSingle(),
        supabase.from("it_assets").select("*").eq("assigned_to", id),
      ]);

      if (error || !staffRow) {
        return NextResponse.json({ error: "Staff not found" }, { status: 404 });
      }

      return NextResponse.json({ staff: staffRow, assets: assets ?? [] }, { headers: CACHE_MEDIUM });
    }

    if (action === "departments") {
      const cached = getCached<object[]>("departments");
      if (cached) return NextResponse.json({ departments: cached }, { headers: CACHE_MEDIUM });

      const { data: departments } = await supabase.from("departments").select("*");
      setCache("departments", departments ?? []);
      return NextResponse.json({ departments: departments ?? [] }, { headers: CACHE_MEDIUM });
    }

    if (action === "stats") {
      const [{ count: activeCount }, { count: totalCount }, { count: deptCount }] = await Promise.all([
        supabase.from("staff").select("*", { count: "exact", head: true }).eq("is_active", true),
        supabase.from("staff").select("*", { count: "exact", head: true }),
        supabase.from("departments").select("*", { count: "exact", head: true }),
      ]);

      const total = totalCount ?? 0;
      const active = activeCount ?? 0;
      return NextResponse.json(
        { total, active, terminated: total - active, departments: deptCount ?? 0 },
        { headers: CACHE_MEDIUM }
      );
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("Staff API error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
