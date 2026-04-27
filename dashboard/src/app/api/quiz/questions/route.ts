import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { CACHE_SHORT, CACHE_NONE } from "@/lib/cache-headers";

interface QuizQuestion {
  text: string; text_ar?: string; type: "mcq"; subject: string; class_code: string; difficulty: number;
  options: { label: string; text: string; text_ar?: string }[]; correct_option: string;
  explanation?: string; standard?: string; created_by: string; year: string;
}

export async function GET(req: NextRequest) {
  const subject = req.nextUrl.searchParams.get("subject");
  const difficulty = req.nextUrl.searchParams.get("difficulty");
  const classCode = req.nextUrl.searchParams.get("class");
  const createdBy = req.nextUrl.searchParams.get("createdBy");
  const year = req.nextUrl.searchParams.get("year");
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") || "200"), 2000);
  const supabase = createServiceClient();

  try {
    let q = supabase.from("quiz_questions").select("*").limit(limit);
    if (subject) q = q.eq("subject", subject);
    if (difficulty) q = q.eq("difficulty", parseInt(difficulty));
    if (classCode) q = q.eq("class_code", classCode);
    if (year) q = q.eq("year", year);
    if (createdBy) {
      const variants = [createdBy];
      if (!createdBy.includes("@")) variants.push(`${createdBy}@kis-riyadh.com`);
      q = q.in("created_by", variants);
    }
    const { data } = await q;
    const questions = (data ?? []).sort((a, b) => {
      const ta = new Date((a as Record<string,unknown>).created_at as string || 0).getTime();
      const tb = new Date((b as Record<string,unknown>).created_at as string || 0).getTime();
      return tb - ta;
    });
    return NextResponse.json({ questions, total: questions.length }, { headers: CACHE_SHORT });
  } catch (err) {
    console.error("Quiz questions GET error:", err);
    return NextResponse.json({ error: "Failed to fetch questions" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const supabase = createServiceClient();
  try {
    const body = await req.json();
    const { action } = body;

    if (action === "create") {
      const q = body.question as QuizQuestion;
      if (!q.text || !q.subject || !q.class_code || !q.correct_option || !q.options?.length) return NextResponse.json({ error: "text, subject, class_code, options, and correct_option required" }, { status: 400 });
      if (q.difficulty < 1 || q.difficulty > 5) return NextResponse.json({ error: "difficulty must be 1-5" }, { status: 400 });
      const { data } = await supabase.from("quiz_questions").insert({ ...q, type: "mcq", created_at: new Date().toISOString(), updated_at: new Date().toISOString() }).select("id").single();
      return NextResponse.json({ success: true, questionId: (data as Record<string,unknown>).id }, { headers: CACHE_NONE });
    }

    if (action === "bulk_create") {
      const questions = body.questions as QuizQuestion[];
      if (!questions?.length) return NextResponse.json({ error: "questions array required" }, { status: 400 });
      const now = new Date().toISOString();
      const rows = questions.filter((q) => q.text && q.subject && q.class_code && q.correct_option && q.options?.length)
        .map((q) => ({ ...q, type: "mcq" as const, difficulty: Math.max(1, Math.min(5, q.difficulty || 3)), created_at: now, updated_at: now }));
      const { data } = await supabase.from("quiz_questions").insert(rows).select("id");
      const ids = (data ?? []).map((r) => (r as Record<string,unknown>).id as string);
      return NextResponse.json({ success: true, count: ids.length, ids }, { headers: CACHE_NONE });
    }

    if (action === "update") {
      const { questionId, updates } = body;
      if (!questionId) return NextResponse.json({ error: "questionId required" }, { status: 400 });
      const { created_at, ...safeUpdates } = updates;
      await supabase.from("quiz_questions").update({ ...safeUpdates, updated_at: new Date().toISOString() }).eq("id", questionId);
      return NextResponse.json({ success: true }, { headers: CACHE_NONE });
    }

    if (action === "delete") {
      const { questionId } = body;
      if (!questionId) return NextResponse.json({ error: "questionId required" }, { status: 400 });
      // Check if used in active assignment
      const { data: assignments } = await supabase.from("quiz_assignments").select("id").eq("status", "active").limit(1000);
      const active = (assignments ?? []).filter((a) => {
        const ids = (a as Record<string,unknown>).question_ids as string[] || [];
        return Array.isArray(ids) && ids.includes(questionId);
      });
      if (active.length > 0) return NextResponse.json({ error: "Cannot delete: question is used in an active quiz assignment" }, { status: 409 });
      await supabase.from("quiz_questions").delete().eq("id", questionId);
      return NextResponse.json({ success: true }, { headers: CACHE_NONE });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err) {
    console.error("Quiz questions POST error:", err);
    return NextResponse.json({ error: "Failed to process request" }, { status: 500 });
  }
}
