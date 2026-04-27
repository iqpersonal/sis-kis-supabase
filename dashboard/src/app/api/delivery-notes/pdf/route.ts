import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import QRCode from "qrcode";

/**
 * Delivery Note PDF — A5 portrait
 * GET /api/delivery-notes/pdf?id=DOC_ID
 */

const PRIMARY: [number, number, number] = [41, 98, 150];
const HEADER_BG: [number, number, number] = [41, 98, 150];

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  try {
    const supabase = createServiceClient();
    const { data: doc } = await supabase.from("delivery_notes").select("*").eq("id", id).maybeSingle();
    if (!doc) {
      return NextResponse.json(
        { error: "Delivery note not found" },
        { status: 404 }
      );
    }

    const dn = doc as Record<string, unknown>;
    const origin =
      process.env.NEXT_PUBLIC_BASE_URL || "https://sis-kis.web.app";
    const pdfBuffer = await generatePDF(dn, id, origin);

    return new Response(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="delivery_note_${dn.dn_number || id}.pdf"`,
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
      },
    });
  } catch (err) {
    console.error("Delivery Note PDF error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/* ── PDF Generation ─────────────────────────────────────────────── */
async function generatePDF(
  dn: Record<string, unknown>,
  docId: string,
  origin: string
): Promise<ArrayBuffer> {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a5" });
  const pageW = 148;
  const margin = 10;
  let y = 12;

  // ── Header / Branding ──
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  pdf.setTextColor(...PRIMARY);
  pdf.text("KIS Store", pageW / 2, y, { align: "center" });
  y += 6;

  pdf.setFontSize(9);
  pdf.setTextColor(100, 100, 100);
  pdf.setFont("helvetica", "normal");
  pdf.text("Khaled International Schools", pageW / 2, y, { align: "center" });
  y += 4;
  pdf.text("Delivery Note", pageW / 2, y, { align: "center" });
  y += 6;

  // Divider
  pdf.setDrawColor(200, 200, 200);
  pdf.setLineWidth(0.3);
  pdf.line(margin, y, pageW - margin, y);
  y += 5;

  // ── DN Info ──
  pdf.setFontSize(9);
  pdf.setTextColor(50, 50, 50);
  pdf.setFont("helvetica", "bold");

  const dnNumber = (dn.dn_number as string) || docId;
  const issuedAt = dn.issued_at;
  let dateStr = "";
  if (typeof issuedAt === "string") {
    dateStr = new Date(issuedAt).toLocaleDateString("en-GB");
  } else {
    dateStr = new Date().toLocaleDateString("en-GB");
  }

  const storeLabel =
    (dn.store_type as string) === "it" ? "IT Store" : "General Store";

  pdf.text(`DN #: ${dnNumber}`, margin, y);
  pdf.text(`Date: ${dateStr}`, pageW - margin, y, { align: "right" });
  y += 5;

  pdf.setFont("helvetica", "normal");
  pdf.text(`Store: ${storeLabel}`, margin, y);
  const branch = (dn.branch as string) || "";
  if (branch) {
    pdf.text(`Branch: ${branch}`, pageW - margin, y, { align: "right" });
  }
  y += 4;

  if (dn.request_id) {
    pdf.text(`Request #: ${dn.request_id}`, margin, y);
    y += 4;
  }

  y += 2;

  // ── Receiver Info ──
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(...PRIMARY);
  pdf.text("Receiver", margin, y);
  y += 4;

  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(50, 50, 50);
  pdf.text(`Name: ${(dn.received_by_name as string) || "—"}`, margin, y);
  pdf.text(
    `Staff #: ${(dn.received_by as string) || "—"}`,
    pageW - margin,
    y,
    { align: "right" }
  );
  y += 4;
  if (dn.department) {
    pdf.text(`Department: ${dn.department}`, margin, y);
    y += 4;
  }
  y += 2;

  // ── Issuer Info ──
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(...PRIMARY);
  pdf.text("Issued By", margin, y);
  y += 4;

  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(50, 50, 50);
  pdf.text(`${(dn.issued_by_name as string) || "—"}`, margin, y);
  y += 5;

  // ── Items Table ──
  const items = Array.isArray(dn.items) ? dn.items : [];
  const tableBody = items.map(
    (
      item: {
        item_name?: string;
        quantity?: number;
        condition?: string;
        remarks?: string;
      },
      i: number
    ) => [
      String(i + 1),
      item.item_name || "",
      String(item.quantity || 0),
      (item.condition || "good").charAt(0).toUpperCase() +
        (item.condition || "good").slice(1),
      item.remarks || "",
    ]
  );

  autoTable(pdf, {
    startY: y,
    margin: { left: margin, right: margin },
    tableWidth: pageW - 2 * margin,
    head: [["#", "Item", "Qty", "Condition", "Remarks"]],
    body: tableBody,
    styles: {
      fontSize: 8,
      cellPadding: 2,
      lineColor: [220, 220, 220],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: HEADER_BG,
      textColor: [255, 255, 255],
      fontStyle: "bold",
      halign: "center",
    },
    columnStyles: {
      0: { halign: "center", cellWidth: 8 },
      1: { halign: "left" },
      2: { halign: "center", cellWidth: 14 },
      3: { halign: "center", cellWidth: 22 },
      4: { halign: "left", cellWidth: 30 },
    },
    alternateRowStyles: { fillColor: [240, 245, 250] },
  });

  y =
    (pdf as unknown as Record<string, Record<string, number>>).lastAutoTable
      .finalY + 4;

  // ── Total Items Summary ──
  pdf.setDrawColor(200, 200, 200);
  pdf.line(margin, y, pageW - margin, y);
  y += 5;

  const totalQty = items.reduce(
    (s: number, i: { quantity?: number }) => s + (i.quantity || 0),
    0
  );
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.setTextColor(50, 50, 50);
  pdf.text(`Total Items: ${items.length}`, margin, y);
  pdf.text(`Total Quantity: ${totalQty}`, pageW - margin, y, {
    align: "right",
  });
  y += 6;

  // ── Notes ──
  if (dn.notes) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(80, 80, 80);
    pdf.text(`Notes: ${dn.notes}`, margin, y);
    y += 5;
  }

  // ── Status ──
  if (dn.status === "acknowledged") {
    const ackAt = dn.acknowledged_at;
    let ackDate = "";
    if (typeof ackAt === "string") {
      ackDate = new Date(ackAt).toLocaleDateString("en-GB");
    }
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.setTextColor(34, 139, 34);
    pdf.text(
      `ACKNOWLEDGED${ackDate ? ` — ${ackDate}` : ""}`,
      pageW / 2,
      y,
      { align: "center" }
    );
    y += 6;
  }

  y += 4;

  // ── Signature Area ──
  pdf.setDrawColor(180, 180, 180);
  pdf.setLineWidth(0.2);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(100, 100, 100);

  const sigLeft = margin;
  const sigRight = pageW / 2 + 5;
  const sigWidth = pageW / 2 - margin - 5;

  // Issued By signature
  pdf.text("Issued By:", sigLeft, y);
  y += 8;
  pdf.line(sigLeft, y, sigLeft + sigWidth, y);
  y += 3;
  pdf.text("Name / Signature / Date", sigLeft, y);

  // Received By signature (same row)
  const sigY = y - 11;
  pdf.text("Received By:", sigRight, sigY);
  pdf.line(sigRight, sigY + 8, sigRight + sigWidth, sigY + 8);
  pdf.text("Name / Signature / Date", sigRight, sigY + 11);

  y += 8;

  // ── QR Code ──
  try {
    const dnUrl = `${origin}/dashboard/delivery-notes?id=${docId}`;
    const qrDataUrl = await QRCode.toDataURL(dnUrl, {
      width: 400,
      margin: 2,
      color: { dark: "#000000", light: "#ffffff" },
    });

    const qrSize = 28;
    const qrX = pageW / 2 - qrSize / 2;

    pdf.setFillColor(255, 255, 255);
    pdf.rect(qrX - 1, y, qrSize + 2, qrSize + 2, "F");
    pdf.addImage(qrDataUrl, "PNG", qrX, y + 1, qrSize, qrSize);
    y += qrSize + 4;

    pdf.setFontSize(7);
    pdf.setTextColor(150, 150, 150);
    pdf.text("Scan to view delivery note", pageW / 2, y, {
      align: "center",
    });
    y += 4;
  } catch {
    // QR generation failed, skip
  }

  // ── Footer ──
  pdf.setDrawColor(200, 200, 200);
  pdf.line(margin, y, pageW - margin, y);
  y += 4;

  pdf.setFontSize(7);
  pdf.setTextColor(130, 130, 130);
  pdf.text(
    "This is a system-generated delivery note from KIS Store Management.",
    pageW / 2,
    y,
    { align: "center" }
  );

  return pdf.output("arraybuffer");
}
