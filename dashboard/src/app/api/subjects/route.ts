import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { CACHE_LONG } from "@/lib/cache-headers";

export async function GET() {
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("subjects")
      .select("subject_code, e_subject_name, a_subject_name")
      .limit(2000);

    if (error) throw error;

    const subjects = (data || [])
      .map((row) => ({
        Subject_Code: String(row.subject_code || ""),
        E_Subject_Name: row.e_subject_name || "",
        A_Subject_Name: row.a_subject_name || "",
      }))
      .filter((s) => s.Subject_Code)
      .sort((a, b) =>
        (a.E_Subject_Name || a.A_Subject_Name || a.Subject_Code).localeCompare(
          b.E_Subject_Name || b.A_Subject_Name || b.Subject_Code,
        )
      );

    return NextResponse.json({ subjects }, { headers: CACHE_LONG });
  } catch (err) {
    console.error("GET /api/subjects error:", err);
    return NextResponse.json({ error: "Failed to fetch subjects" }, { status: 500 });
  }
}
