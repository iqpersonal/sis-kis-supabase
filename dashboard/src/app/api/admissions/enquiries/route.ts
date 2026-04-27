import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";

export async function GET(request: NextRequest) {
  const supabase = createServiceClient();
  try {
    const params = request.nextUrl.searchParams;
    const status = params.get("status") || "";
    const limit = Math.max(1, Math.min(1000, Number(params.get("limit") || "500")));

    const query = supabase
      .from("admission_enquiries")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (status) query.eq("status", status);

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ enquiries: data || [] });
  } catch (err) {
    console.error("GET /api/admissions/enquiries error:", err);
    return NextResponse.json({ error: "Failed to fetch admission enquiries" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const supabase = createServiceClient();
  try {
    const body = await request.json();
    const refNumber = String(body.ref_number || "");
    if (!refNumber) {
      return NextResponse.json({ error: "Missing ref_number" }, { status: 400 });
    }

    const update: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (body.status) update.status = String(body.status);
    if (body.source) update.source = String(body.source);
    if (Object.prototype.hasOwnProperty.call(body, "notes")) {
      update.notes = String(body.notes || "");
    }

    const { data, error } = await supabase
      .from("admission_enquiries")
      .update(update)
      .eq("ref_number", refNumber)
      .select("*")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, enquiry: data || { ref_number: refNumber, ...update } });
  } catch (err) {
    console.error("PATCH /api/admissions/enquiries error:", err);
    return NextResponse.json({ error: "Failed to update admission enquiry" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const supabase = createServiceClient();
  try {
    const body = await request.json();
    const parentName = String(body.parent_name || "").trim();
    const phone = String(body.phone || "").trim();
    const email = String(body.email || "").trim();
    const source = String(body.source || "manual").trim() || "manual";
    const students = Array.isArray(body.students) ? body.students : [];

    if (!parentName || !phone || !email) {
      return NextResponse.json({ error: "Missing parent_name, phone or email" }, { status: 400 });
    }

    const now = new Date().toISOString();

    const { data: counter } = await supabase
      .from("admission_config")
      .select("last_number")
      .eq("id", "counter")
      .maybeSingle();

    const current = Number((counter as Record<string, unknown> | null)?.last_number ?? 1000);
    const next = current + 1;
    const refNumber = `ADM-${next}`;

    await supabase
      .from("admission_config")
      .upsert({ id: "counter", last_number: next, updated_at: now });

    const cleanStudents = students
      .map((s) => ({
        name: String(s?.name || "").trim(),
        gender: String(s?.gender || ""),
        desired_grade: String(s?.desired_grade || ""),
      }))
      .filter((s) => s.name);

    const enquiry = {
      id: refNumber,
      ref_number: refNumber,
      parent_name: parentName,
      phone,
      email,
      students: cleanStudents,
      student_count: cleanStudents.length,
      status: "new",
      source,
      created_at: now,
      updated_at: now,
    };

    const { error } = await supabase.from("admission_enquiries").upsert(enquiry);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, enquiry });
  } catch (err) {
    console.error("POST /api/admissions/enquiries error:", err);
    return NextResponse.json({ error: "Failed to create admission enquiry" }, { status: 500 });
  }
}
