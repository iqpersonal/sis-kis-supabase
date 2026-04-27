import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";

export async function GET(request: NextRequest) {
  const supabase = createServiceClient();
  try {
    const includeEnquiries = request.nextUrl.searchParams.get("includeEnquiries") === "1";

    const { data: interviews, error: interviewsError } = await supabase
      .from("admission_interviews")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);

    if (interviewsError) {
      return NextResponse.json({ error: interviewsError.message }, { status: 500 });
    }

    if (!includeEnquiries) {
      return NextResponse.json({ interviews: interviews || [] });
    }

    const { data: enquiries, error: enquiriesError } = await supabase
      .from("admission_enquiries")
      .select("ref_number,parent_name,phone,students,status")
      .order("created_at", { ascending: false })
      .limit(500);

    if (enquiriesError) {
      return NextResponse.json({ error: enquiriesError.message }, { status: 500 });
    }

    return NextResponse.json({ interviews: interviews || [], enquiries: enquiries || [] });
  } catch (err) {
    console.error("GET /api/admissions/interviews error:", err);
    return NextResponse.json({ error: "Failed to fetch admission interviews" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const supabase = createServiceClient();
  try {
    const body = await request.json();
    const now = new Date().toISOString();

    const enquiryRef = String(body.enquiry_ref || "");
    const studentName = String(body.student_name || "TBD");
    const id = String(body.id || `${enquiryRef}_${studentName.replace(/\s+/g, "_")}_int_${Date.now()}`);

    const record = {
      id,
      enquiry_ref: enquiryRef,
      parent_name: String(body.parent_name || enquiryRef),
      student_name: studentName,
      desired_grade: String(body.desired_grade || "TBD"),
      interview_date: String(body.interview_date || ""),
      interview_time: String(body.interview_time || ""),
      place: String(body.place || ""),
      interviewer: String(body.interviewer || ""),
      outcome: "pending",
      notes: "",
      created_at: now,
      updated_at: now,
    };

    const { error } = await supabase.from("admission_interviews").upsert(record);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (enquiryRef) {
      await supabase
        .from("admission_enquiries")
        .update({ status: "interview_scheduled", updated_at: now })
        .eq("ref_number", enquiryRef);
    }

    return NextResponse.json({ ok: true, interview: record });
  } catch (err) {
    console.error("POST /api/admissions/interviews error:", err);
    return NextResponse.json({ error: "Failed to schedule interview" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const supabase = createServiceClient();
  try {
    const body = await request.json();
    const id = String(body.id || "");
    if (!id) {
      return NextResponse.json({ error: "Missing interview id" }, { status: 400 });
    }

    const now = new Date().toISOString();
    const update = {
      outcome: String(body.outcome || "pending"),
      notes: String(body.notes || ""),
      interviewer: String(body.interviewer || ""),
      updated_at: now,
    };

    const { data: updated, error } = await supabase
      .from("admission_interviews")
      .update(update)
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const enquiryRef = String(body.enquiry_ref || "");
    if (update.outcome !== "pending" && enquiryRef) {
      await supabase
        .from("admission_enquiries")
        .update({ status: "interview_done", updated_at: now })
        .eq("ref_number", enquiryRef);
    }

    return NextResponse.json({ ok: true, interview: updated || { id, ...update } });
  } catch (err) {
    console.error("PATCH /api/admissions/interviews error:", err);
    return NextResponse.json({ error: "Failed to save interview result" }, { status: 500 });
  }
}
