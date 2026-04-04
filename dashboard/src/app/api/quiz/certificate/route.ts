import { NextRequest, NextResponse } from "next/server";
import { jsPDF } from "jspdf";
import { adminDb } from "@/lib/firebase-admin";

export async function GET(req: NextRequest) {
  const resultId = req.nextUrl.searchParams.get("resultId");
  if (!resultId) {
    return NextResponse.json({ error: "resultId required" }, { status: 400 });
  }

  try {
    // Fetch result
    const resultSnap = await adminDb.collection("quiz_results").doc(resultId).get();
    if (!resultSnap.exists) {
      return NextResponse.json({ error: "Result not found" }, { status: 404 });
    }
    const result = resultSnap.data()!;

    // Fetch assignment for title
    let quizTitle = "Quiz";
    let subject = "";
    if (result.assignment_id) {
      const aSnap = await adminDb.collection("quiz_assignments").doc(result.assignment_id).get();
      if (aSnap.exists) {
        const a = aSnap.data()!;
        quizTitle = a.title || "Quiz";
        subject = a.subject || "";
      }
    }

    const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const W = 297;
    const H = 210;

    // ─── Background ──────────────────────────────────────────
    pdf.setFillColor(250, 250, 255);
    pdf.rect(0, 0, W, H, "F");

    // Border frame
    pdf.setDrawColor(37, 99, 235);
    pdf.setLineWidth(2);
    pdf.rect(10, 10, W - 20, H - 20);
    pdf.setLineWidth(0.5);
    pdf.rect(14, 14, W - 28, H - 28);

    // Corner accents
    const corners = [
      [18, 18], [W - 18, 18], [18, H - 18], [W - 18, H - 18],
    ];
    pdf.setFillColor(37, 99, 235);
    for (const [cx, cy] of corners) {
      pdf.circle(cx, cy, 2, "F");
    }

    // ─── Header ──────────────────────────────────────────────
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(14);
    pdf.setTextColor(100, 100, 100);
    pdf.text("KHALED INTERNATIONAL SCHOOLS", W / 2, 30, { align: "center" });

    pdf.setFontSize(28);
    pdf.setTextColor(37, 99, 235);
    pdf.text("GROWTH CERTIFICATE", W / 2, 45, { align: "center" });

    // Decorative line under title
    pdf.setDrawColor(37, 99, 235);
    pdf.setLineWidth(1);
    pdf.line(W / 2 - 50, 50, W / 2 + 50, 50);

    // ─── Body ────────────────────────────────────────────────
    pdf.setFontSize(13);
    pdf.setTextColor(60, 60, 60);
    pdf.setFont("helvetica", "normal");
    pdf.text("This certificate is awarded to", W / 2, 65, { align: "center" });

    // Student name
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(22);
    pdf.setTextColor(30, 30, 30);
    pdf.text(result.student_name || result.student_id, W / 2, 80, { align: "center" });

    // Achievement line
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(13);
    pdf.setTextColor(60, 60, 60);
    pdf.text(
      `for achieving ${result.mastery?.replace("_", " ").toUpperCase()} mastery`,
      W / 2, 92,
      { align: "center" }
    );
    pdf.text(`in ${quizTitle}${subject ? ` — ${subject}` : ""}`, W / 2, 100, { align: "center" });

    // ─── Score Box ───────────────────────────────────────────
    const boxW = 80;
    const boxH = 40;
    const boxX = W / 2 - boxW / 2;
    const boxY = 110;

    pdf.setFillColor(37, 99, 235);
    pdf.roundedRect(boxX, boxY, boxW, boxH, 4, 4, "F");

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(28);
    pdf.setTextColor(255, 255, 255);
    pdf.text(`${result.percentage}%`, W / 2, boxY + 18, { align: "center" });

    pdf.setFontSize(12);
    pdf.text(`${result.score} / ${result.total} correct`, W / 2, boxY + 30, { align: "center" });

    // ─── Details ─────────────────────────────────────────────
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.setTextColor(100, 100, 100);

    const detailY = boxY + boxH + 12;
    const ability = result.estimated_ability?.toFixed(1) || "—";
    const time = result.time_spent_seconds
      ? `${Math.floor(result.time_spent_seconds / 60)}m ${result.time_spent_seconds % 60}s`
      : "—";

    pdf.text(`Estimated Ability: ${ability}    |    Time: ${time}    |    Year: ${result.year || "25-26"}`, W / 2, detailY, { align: "center" });

    // ─── Footer ──────────────────────────────────────────────
    const footY = H - 30;

    // Date
    const dateStr = result.completed_at
      ? new Date(result.completed_at._seconds ? result.completed_at._seconds * 1000 : result.completed_at).toLocaleDateString("en-US", {
          year: "numeric", month: "long", day: "numeric",
        })
      : new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

    pdf.setFontSize(10);
    pdf.setTextColor(100, 100, 100);
    pdf.text(`Date: ${dateStr}`, 30, footY, { align: "left" });

    // Signature line
    pdf.setDrawColor(150, 150, 150);
    pdf.setLineWidth(0.3);
    pdf.line(W - 100, footY - 2, W - 30, footY - 2);
    pdf.setFontSize(9);
    pdf.text("Academic Director", W - 65, footY + 4, { align: "center" });

    // Verification note
    pdf.setFontSize(7);
    pdf.setTextColor(160, 160, 160);
    pdf.text(`Certificate ID: ${resultId}`, W / 2, H - 16, { align: "center" });

    // ─── Output ──────────────────────────────────────────────
    const pdfBuffer = Buffer.from(pdf.output("arraybuffer"));

    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="growth-certificate-${result.student_id}.pdf"`,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (err: any) {
    console.error("Certificate generation error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
