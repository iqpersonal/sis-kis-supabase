import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";

export async function GET(request: NextRequest) {
  const supabase = createServiceClient();
  try {
    const includeEnquiries = request.nextUrl.searchParams.get("includeEnquiries") === "1";

    const { data: tests, error: testsError } = await supabase
      .from("admission_tests")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);

    if (testsError) {
      return NextResponse.json({ error: testsError.message }, { status: 500 });
    }

    if (!includeEnquiries) {
      return NextResponse.json({ tests: tests || [] });
    }

    const { data: enquiries, error: enquiriesError } = await supabase
      .from("admission_enquiries")
      .select("ref_number,parent_name,phone,students,status")
      .order("created_at", { ascending: false })
      .limit(500);

    if (enquiriesError) {
      return NextResponse.json({ error: enquiriesError.message }, { status: 500 });
    }

    return NextResponse.json({ tests: tests || [], enquiries: enquiries || [] });
  } catch (err) {
    console.error("GET /api/admissions/tests error:", err);
    return NextResponse.json({ error: "Failed to fetch admissions tests" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const supabase = createServiceClient();
  try {
    const body = await request.json();
    const now = new Date().toISOString();

    const enquiryRef = String(body.enquiry_ref || "");
    const studentName = String(body.student_name || "TBD");
    const testId = String(body.id || `${enquiryRef}_${studentName.replace(/\s+/g, "_")}_${Date.now()}`);

    const record = {
      id: testId,
      enquiry_ref: enquiryRef,
      parent_name: String(body.parent_name || enquiryRef),
      student_name: studentName,
      desired_grade: String(body.desired_grade || "TBD"),
      test_date: String(body.test_date || ""),
      time: String(body.time || ""),
      place: String(body.place || ""),
      staff: String(body.staff || ""),
      math_score: null,
      english_score: null,
      arabic_score: null,
      result: "pending",
      notes: "",
      created_at: now,
      updated_at: now,
    };

    const { error } = await supabase.from("admission_tests").upsert(record);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (enquiryRef) {
      await supabase
        .from("admission_enquiries")
        .update({ status: "test_scheduled", updated_at: now })
        .eq("ref_number", enquiryRef);
    }

    return NextResponse.json({ ok: true, test: record });
  } catch (err) {
    console.error("POST /api/admissions/tests error:", err);
    return NextResponse.json({ error: "Failed to schedule test" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const supabase = createServiceClient();
  try {
    const body = await request.json();
    const id = String(body.id || "");
    if (!id) {
      return NextResponse.json({ error: "Missing test id" }, { status: 400 });
    }

    const now = new Date().toISOString();
    const update = {
      math_score: body.math_score ?? null,
      english_score: body.english_score ?? null,
      arabic_score: body.arabic_score ?? null,
      result: body.result || "pending",
      notes: body.notes || "",
      updated_at: now,
    };

    const { data: updated, error } = await supabase
      .from("admission_tests")
      .update(update)
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const enquiryRef = String(body.enquiry_ref || "");
    if (update.result !== "pending" && enquiryRef) {
      await supabase
        .from("admission_enquiries")
        .update({ status: "test_done", updated_at: now })
        .eq("ref_number", enquiryRef);
    }

    return NextResponse.json({ ok: true, test: updated || { id, ...update } });
  } catch (err) {
    console.error("PATCH /api/admissions/tests error:", err);
    return NextResponse.json({ error: "Failed to save test scores" }, { status: 500 });
  }
}
