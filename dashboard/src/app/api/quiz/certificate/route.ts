import { NextRequest, NextResponse } from "next/server";
import { jsPDF } from "jspdf";
import { createServiceClient } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const resultId = req.nextUrl.searchParams.get("resultId");
  if (!resultId) return NextResponse.json({ error: "resultId required" }, { status: 400 });

  const supabase = createServiceClient();

  try {
    const { data: resultRow } = await supabase.from("quiz_results").select("*").eq("id", resultId).maybeSingle();
    if (!resultRow) return NextResponse.json({ error: "Result not found" }, { status: 404 });

    const result = resultRow as Record<string, unknown>;

    let quizTitle = "Quiz";
    let subject = "";
    if (result.assignment_id) {
      const { data: aRow } = await supabase.from("quiz_assignments").select("title,subject").eq("id", result.assignment_id).maybeSingle();
      if (aRow) {
        const a = aRow as Record<string, unknown>;
        quizTitle = a.title as string || "Quiz";
        subject = a.subject as string || "";
      }
    }

    const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const W = 297;
    const H = 210;

    pdf.setFillColor(250, 250, 255);
    pdf.rect(0, 0, W, H, "F");
    pdf.setDrawColor(37, 99, 235);
    pdf.setLineWidth(2);
    pdf.rect(10, 10, W - 20, H - 20);
    pdf.setLineWidth(0.5);
    pdf.rect(14, 14, W - 28, H - 28);

    const corners: [number, number][] = [[18, 18], [W - 18, 18], [18, H - 18], [W - 18, H - 18]];
    pdf.setFillColor(37, 99, 235);
    for (const [cx, cy] of corners) pdf.circle(cx, cy, 2, "F");

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(14);
    pdf.setTextColor(100, 100, 100);
    pdf.text("KHALED INTERNATIONAL SCHOOLS", W / 2, 30, { align: "center" });

    pdf.setFontSize(28);
    pdf.setTextColor(37, 99, 235);
    pdf.text("GROWTH CERTIFICATE", W / 2, 45, { align: "center" });

    pdf.setDrawColor(37, 99, 235);
    pdf.setLineWidth(1);
    pdf.line(W / 2 - 50, 50, W / 2 + 50, 50);

    pdf.setFontSize(13);
    pdf.setTextColor(60, 60, 60);
    pdf.setFont("helvetica", "normal");
    pdf.text("This certificate is awarded to", W / 2, 65, { align: "center" });

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(22);
    pdf.setTextColor(30, 30, 30);
    pdf.text((result.student_name as string) || (result.student_number as string) || "", W / 2, 80, { align: "center" });

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(13);
    pdf.setTextColor(60, 60, 60);
    const masteryStr = ((result.mastery as string) || "").replace("_", " ").toUpperCase();
    pdf.text(`for achieving ${masteryStr} mastery`, W / 2, 92, { align: "center" });
    pdf.text(`in ${quizTitle}${subject ? ` — ${subject}` : ""}`, W / 2, 100, { align: "center" });

    const boxW = 80, boxH = 40, boxX = W / 2 - boxW / 2, boxY = 110;
    pdf.setFillColor(37, 99, 235);
    pdf.roundedRect(boxX, boxY, boxW, boxH, 4, 4, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(28);
    pdf.setTextColor(255, 255, 255);
    pdf.text(`${result.score ?? result.percentage}%`, W / 2, boxY + 18, { align: "center" });
    pdf.setFontSize(12);
    pdf.text(`${result.correct_count} / ${result.total_questions} correct`, W / 2, boxY + 30, { align: "center" });

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.setTextColor(100, 100, 100);
    const detailY = boxY + boxH + 12;
    const ability = result.estimated_ability != null ? (result.estimated_ability as number).toFixed(1) : "—";
    const totalMs = (result.total_time as number) ?? 0;
    const totalSec = Math.round(totalMs / 1000);
    const time = totalSec > 0 ? `${Math.floor(totalSec / 60)}m ${totalSec % 60}s` : "—";
    pdf.text(`Estimated Ability: ${ability}    |    Time: ${time}    |    Year: ${result.year || "25-26"}`, W / 2, detailY, { align: "center" });

    const footY = H - 30;
    const dateStr = result.completed_at
      ? new Date(result.completed_at as string).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
      : new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    pdf.setFontSize(10);
    pdf.setTextColor(100, 100, 100);
    pdf.text(`Date: ${dateStr}`, 30, footY, { align: "left" });

    pdf.setDrawColor(150, 150, 150);
    pdf.setLineWidth(0.3);
    pdf.line(W - 100, footY - 2, W - 30, footY - 2);
    pdf.setFontSize(9);
    pdf.text("Academic Director", W - 65, footY + 4, { align: "center" });

    pdf.setFontSize(7);
    pdf.setTextColor(160, 160, 160);
    pdf.text(`Certificate ID: ${resultId}`, W / 2, H - 16, { align: "center" });

    const pdfBuffer = Buffer.from(pdf.output("arraybuffer"));
    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="growth-certificate-${result.student_number}.pdf"`,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (err: unknown) {
    console.error("Certificate generation error:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}