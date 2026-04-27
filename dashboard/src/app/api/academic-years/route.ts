import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { CACHE_LONG } from "@/lib/cache-headers";

export async function GET() {
  const supabase = createServiceClient();
  try {
    const { data, error } = await supabase
      .from("academic_years")
      .select("id, Academic_Year, academic_year")
      .limit(500);
    if (error) throw error;

    const years = (data || [])
      .map((d: Record<string, unknown>) => String(d.Academic_Year ?? d.academic_year ?? d.id ?? ""))
      .filter(Boolean)
      .sort();
    return NextResponse.json({ years }, { headers: CACHE_LONG });
  } catch (err) {
    console.error("Failed to fetch academic years:", err);
    return NextResponse.json({ error: "Failed to fetch academic years" }, { status: 500 });
  }
}
