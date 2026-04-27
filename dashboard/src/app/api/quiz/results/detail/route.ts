import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { CACHE_SHORT } from "@/lib/cache-headers";

function toIndex(val: unknown): number | null {
  if (val == null) return null;
  if (typeof val === "number") return val;
  if (typeof val === "string" && /^[A-Da-d]$/.test(val)) {
    return val.toUpperCase().charCodeAt(0) - 65;
  }
  const n = Number(val);
  return isNaN(n) ? null : n;
}

export async function GET(req: NextRequest) {
  const assignmentId = req.nextUrl.searchParams.get("assignment");
  const studentNumber = req.nextUrl.searchParams.get("student");

  if (!assignmentId || !studentNumber) {
    return NextResponse.json({ error: "assignment and student parameters required" }, { status: 400 });
  }

  const supabase = createServiceClient();

  try {
    const { data: sessionRows } = await supabase
      .from("quiz_sessions")
      .select("answered, total_questions")
      .eq("assignment_id", assignmentId)
      .eq("student_number", studentNumber)
      .limit(1);

    if (!sessionRows || sessionRows.length === 0) {
      return NextResponse.json({ error: "No session found for this student and assignment" }, { status: 404 });
    }

    const session = sessionRows[0] as Record<string, unknown>;
    const answered: Record<string, unknown>[] = (session.answered as Record<string, unknown>[]) || [];

    if (answered.length === 0) return NextResponse.json({ questions: [] }, { headers: CACHE_SHORT });

    const questionIds = answered.map((a) => a.questionId as string);

    // Fetch questions in chunks of 100
    const questionMap: Record<string, Record<string, unknown>> = {};
    for (let i = 0; i < questionIds.length; i += 100) {
      const chunk = questionIds.slice(i, i + 100);
      const { data: qRows } = await supabase.from("quiz_questions").select("*").in("id", chunk);
      (qRows ?? []).forEach((q) => { questionMap[(q as Record<string, unknown>).id as string] = q as Record<string, unknown>; });
    }

    const questions = answered.map((a, idx) => {
      const q = questionMap[a.questionId as string];
      if (!q) {
        return {
          number: idx + 1, questionId: a.questionId, text: "(Question deleted)", options: [],
          selectedOption: a.selectedOption, correctOption: null, isCorrect: a.isCorrect,
          difficulty: a.difficulty, timeSpent: a.timeSpent,
        };
      }
      const correctIdx = toIndex(q.correct_option);
      const isCorrect = correctIdx != null && a.selectedOption === correctIdx;
      return {
        number: idx + 1, questionId: a.questionId,
        text: q.text || "", text_ar: q.text_ar || "",
        options: ((q.options as {label:string;text:string;text_ar?:string}[]) || []).map((o) => ({
          label: o.label, text: o.text, text_ar: o.text_ar || "",
        })),
        selectedOption: a.selectedOption, correctOption: correctIdx, isCorrect,
        difficulty: a.difficulty, timeSpent: a.timeSpent,
      };
    });

    return NextResponse.json({ questions }, { headers: CACHE_SHORT });
  } catch (err) {
    console.error("Quiz results detail error:", err);
    return NextResponse.json({ error: "Failed to fetch result details" }, { status: 500 });
  }
}