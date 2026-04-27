import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";

/**
 * POST /api/diploma-verifications
 * Body: { verifications: { id, studentName, studentNumber, ceremonyDate }[] }
 */
export async function POST(req: NextRequest) {
  const supabase = createServiceClient();
  try {
    const { verifications } = await req.json() as {
      verifications: { id: string; studentName: string; studentNumber: string; ceremonyDate: string }[];
    };

    if (!verifications?.length) {
      return NextResponse.json({ error: "verifications array required" }, { status: 400 });
    }

    const now = new Date().toISOString();
    const rows = verifications.map((v) => ({
      id: v.id,
      student_name: v.studentName,
      student_number: v.studentNumber,
      ceremony_date: v.ceremonyDate,
      issued_at: now,
    }));

    await supabase.from("diploma_verifications").upsert(rows);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Diploma verifications POST error:", err);
    return NextResponse.json({ error: "Failed to save verifications" }, { status: 500 });
  }
}

/**
 * GET /api/diploma-verifications?id=UUID
 */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const supabase = createServiceClient();
  try {
    const { data } = await supabase.from("diploma_verifications").select("*").eq("id", id).maybeSingle();
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(data);
  } catch (err) {
    console.error("Diploma verifications GET error:", err);
    return NextResponse.json({ error: "Failed to fetch verification" }, { status: 500 });
  }
}
