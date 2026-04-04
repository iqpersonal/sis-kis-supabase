import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { CACHE_SHORT } from "@/lib/cache-headers";

function mapResult(d: FirebaseFirestore.QueryDocumentSnapshot) {
  const data = d.data();
  return {
    id: d.id,
    assignment_id: data.assignment_id || "",
    student_id: data.student_number || "",
    student_name: data.student_name || "",
    subject: data.subject || "",
    score: data.correct_count ?? 0,
    total: data.total_questions ?? 0,
    percentage: data.score ?? 0,
    mastery: data.mastery || "",
    estimated_ability: data.estimated_ability ?? 0,
    time_spent_seconds: data.time_spent_seconds ?? Math.round((data.avg_time_per_question ?? 0) * (data.total_questions ?? 0) / 1000),
    rapid_guesses: data.rapid_guesses ?? 0,
    difficulty_breakdown: data.difficulty_breakdown || {},
    completed_at: data.completed_at?._seconds
      ? new Date(data.completed_at._seconds * 1000).toISOString()
      : data.completed_at || "",
  };
}

/**
 * GET /api/quiz/results
 *   ?student=12345              → results for a specific student
 *   ?assignment=abc             → results for a specific assignment
 *   ?assignments=a,b,c          → results for multiple assignments (comma-separated, max 30)
 *   ?year=25-26                 → filter by year
 */
export async function GET(req: NextRequest) {
  const student = req.nextUrl.searchParams.get("student");
  const assignment = req.nextUrl.searchParams.get("assignment");
  const assignmentsCsv = req.nextUrl.searchParams.get("assignments");
  const year = req.nextUrl.searchParams.get("year");

  if (!student && !assignment && !assignmentsCsv) {
    return NextResponse.json(
      { error: "student, assignment, or assignments parameter required" },
      { status: 400 }
    );
  }

  try {
    // Multi-assignment fetch: split into chunks of 30 (Firestore "in" limit)
    if (assignmentsCsv) {
      const ids = assignmentsCsv.split(",").filter(Boolean);
      if (ids.length === 0) {
        return NextResponse.json({ results: [] }, { headers: CACHE_SHORT });
      }
      const allResults: any[] = [];
      for (let i = 0; i < ids.length; i += 30) {
        const chunk = ids.slice(i, i + 30);
        let q: FirebaseFirestore.Query = adminDb
          .collection("quiz_results")
          .where("assignment_id", "in", chunk);
        if (year) q = q.where("year", "==", year);
        const snap = await q.limit(500).get();
        snap.docs.forEach((d) => allResults.push(mapResult(d)));
      }
      return NextResponse.json({ results: allResults }, { headers: CACHE_SHORT });
    }

    let query: FirebaseFirestore.Query = adminDb.collection("quiz_results");

    if (student) query = query.where("student_number", "==", student);
    if (assignment) query = query.where("assignment_id", "==", assignment);
    if (year) query = query.where("year", "==", year);

    const snap = await query.limit(200).get();
    const results = snap.docs.map(mapResult);

    return NextResponse.json({ results }, { headers: CACHE_SHORT });
  } catch (err) {
    console.error("Quiz results GET error:", err);
    return NextResponse.json(
      { error: "Failed to fetch quiz results" },
      { status: 500 }
    );
  }
}
