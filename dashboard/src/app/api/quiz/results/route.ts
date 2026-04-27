import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { CACHE_SHORT } from "@/lib/cache-headers";

function mapResult(r: Record<string, unknown>) {
  return {
    id: r.id,
    assignment_id: r.assignment_id || "",
    student_id: r.student_number || "",
    student_name: r.student_name || "",
    subject: r.subject || "",
    score: r.correct_count ?? 0,
    total: r.total_questions ?? 0,
    percentage: r.score ?? 0,
    mastery: r.mastery || "",
    estimated_ability: r.estimated_ability ?? 0,
    time_spent_seconds: r.total_time != null
      ? Math.round((r.total_time as number) / 1000)
      : Math.round(((r.avg_time_per_question as number ?? 0) * (r.total_questions as number ?? 0)) / 1000),
    rapid_guesses: r.rapid_guess_count ?? 0,
    difficulty_breakdown: r.difficulty_breakdown || {},
    completed_at: r.completed_at ? new Date(r.completed_at as string).toISOString() : "",
  };
}

export async function GET(req: NextRequest) {
  const student = req.nextUrl.searchParams.get("student");
  const assignment = req.nextUrl.searchParams.get("assignment");
  const assignmentsCsv = req.nextUrl.searchParams.get("assignments");
  const year = req.nextUrl.searchParams.get("year");
  const supabase = createServiceClient();

  if (!student && !assignment && !assignmentsCsv) {
    return NextResponse.json({ error: "student, assignment, or assignments parameter required" }, { status: 400 });
  }

  try {
    if (assignmentsCsv) {
      const ids = assignmentsCsv.split(",").filter(Boolean);
      if (ids.length === 0) return NextResponse.json({ results: [] }, { headers: CACHE_SHORT });

      const allResults: ReturnType<typeof mapResult>[] = [];
      for (let i = 0; i < ids.length; i += 100) {
        const chunk = ids.slice(i, i + 100);
        let q = supabase.from("quiz_results").select("*").in("assignment_id", chunk).limit(500);
        if (year) q = q.eq("year", year);
        const { data } = await q;
        (data ?? []).forEach((r) => allResults.push(mapResult(r as Record<string, unknown>)));
      }
      return NextResponse.json({ results: allResults }, { headers: CACHE_SHORT });
    }

    let q = supabase.from("quiz_results").select("*").limit(200);
    if (student) q = q.eq("student_number", student);
    if (assignment) q = q.eq("assignment_id", assignment);
    if (year) q = q.eq("year", year);

    const { data } = await q;
    const results = (data ?? []).map((r) => mapResult(r as Record<string, unknown>));
    return NextResponse.json({ results }, { headers: CACHE_SHORT });
  } catch (err) {
    console.error("Quiz results GET error:", err);
    return NextResponse.json({ error: "Failed to fetch quiz results" }, { status: 500 });
  }
}