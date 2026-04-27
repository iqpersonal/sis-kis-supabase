import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import QRCode from "qrcode";

/**
 * Book Sales - Receipt PDF API
 */

const PRIMARY: [number, number, number] = [41, 98, 150];
const HEADER_BG: [number, number, number] = [41, 98, 150];

export async function GET(req: NextRequest) {
  const saleId = req.nextUrl.searchParams.get("id");
  if (!saleId) return NextResponse.json({ error: "id is required" }, { status: 400 });

  try {
    const supabase = createServiceClient();
    const { data: sale, error } = await supabase.from("book_sales").select("*").eq("id", saleId).maybeSingle();
    if (error) throw error;
    if (!sale) return NextResponse.json({ error: "Sale not found" }, { status: 404 });

    const origin = process.env.NEXT_PUBLIC_BASE_URL || "https://sis-kis.web.app";
    const pdfBuffer = await generateReceiptPDF(sale as Record<string, unknown>, saleId, origin);

    return new Response(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="receipt_${(sale as Record<string, unknown>).receipt_number || saleId}.pdf"`,
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
      },
    });
  } catch (err) {
    console.error("Book Sales Receipt error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

async function generateReceiptPDF(sale: Record<string, unknown>, saleId: string, origin: string): Promise<ArrayBuffer> {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a5" });
  const pageW = 148;
  const margin = 10;
  let y = 12;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  pdf.setTextColor(...PRIMARY);
  pdf.text("KIS Bookshop", pageW / 2, y, { align: "center" });
  y += 6;

  pdf.setFontSize(9);
  pdf.setTextColor(100, 100, 100);
  pdf.setFont("helvetica", "normal");
  pdf.text("Khaled International Schools", pageW / 2, y, { align: "center" });
  y += 4;
  pdf.text("Book Sales Receipt", pageW / 2, y, { align: "center" });
  y += 6;

  pdf.setDrawColor(200, 200, 200);
  pdf.setLineWidth(0.3);
  pdf.line(margin, y, pageW - margin, y);
  y += 5;

  pdf.setFontSize(9);
  pdf.setTextColor(50, 50, 50);
  pdf.setFont("helvetica", "bold");

  const receiptNumber = (sale.receipt_number as string) || saleId;
  const createdAt = sale.created_at;
  const dateStr = typeof createdAt === "string"
    ? new Date(createdAt).toLocaleDateString("en-GB")
    : new Date().toLocaleDateString("en-GB");

  pdf.text(`Receipt #: ${receiptNumber}`, margin, y);
  pdf.text(`Date: ${dateStr}`, pageW - margin, y, { align: "right" });
  y += 5;

  pdf.setFont("helvetica", "normal");
  pdf.text(`Student: ${sale.student_name || ""}`, margin, y);
  pdf.text(`SN: ${sale.student_number || ""}`, pageW - margin, y, { align: "right" });
  y += 4;
  pdf.text(`Family: ${sale.family_name || ""} (${sale.family_number || ""})`, margin, y);
  pdf.text(`Grade: ${sale.grade || ""}`, pageW - margin, y, { align: "right" });
  y += 4;
  if (sale.school) {
    pdf.text(`School: ${sale.school}`, margin, y);
    y += 4;
  }
  y += 2;

  const items = Array.isArray(sale.items) ? sale.items : [];
  const tableBody = items.map((item: { title?: string; price?: number }, i: number) => [
    String(i + 1),
    item.title || "",
    `SAR ${(item.price || 0).toFixed(2)}`,
  ]);

  autoTable(pdf, {
    startY: y,
    margin: { left: margin, right: margin },
    tableWidth: pageW - 2 * margin,
    head: [["#", "Book Title", "Price"]],
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
      0: { halign: "center", cellWidth: 10 },
      1: { halign: "left" },
      2: { halign: "right", cellWidth: 28 },
    },
    alternateRowStyles: { fillColor: [240, 245, 250] },
  });

  y = (pdf as unknown as Record<string, Record<string, number>>).lastAutoTable.finalY + 4;

  pdf.setDrawColor(200, 200, 200);
  pdf.line(margin, y, pageW - margin, y);
  y += 5;

  const subtotal = typeof sale.subtotal === "number" ? sale.subtotal : 0;
  const vatAmount = typeof sale.vat_amount === "number" ? sale.vat_amount : 0;
  const totalAmount = typeof sale.total_amount === "number" ? sale.total_amount : Math.round((subtotal + vatAmount) * 100) / 100;
  const paidAmount = typeof sale.paid_amount === "number" ? sale.paid_amount : totalAmount;

  pdf.setFontSize(9);
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(80, 80, 80);
  pdf.text("Subtotal:", margin, y);
  pdf.text(`SAR ${subtotal.toFixed(2)}`, pageW - margin, y, { align: "right" });
  y += 4;
  pdf.text("VAT (15%):", margin, y);
  pdf.text(`SAR ${vatAmount.toFixed(2)}`, pageW - margin, y, { align: "right" });
  y += 5;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.setTextColor(50, 50, 50);
  pdf.text("Total (incl. VAT):", margin, y);
  pdf.text(`SAR ${totalAmount.toFixed(2)}`, pageW - margin, y, { align: "right" });
  y += 5;

  pdf.setFontSize(9);
  pdf.setFont("helvetica", "normal");
  pdf.text("Paid:", margin, y);
  pdf.text(`SAR ${paidAmount.toFixed(2)}`, pageW - margin, y, { align: "right" });
  y += 4;
  pdf.text(`Payment: ${(sale.payment_method as string) || "Cash"}`, margin, y);
  y += 6;

  if (sale.status === "voided") {
    pdf.setFontSize(24);
    pdf.setTextColor(220, 50, 50);
    pdf.setFont("helvetica", "bold");
    pdf.text("VOIDED", pageW / 2, y + 6, { align: "center" });
    y += 14;
    pdf.setFontSize(8);
    pdf.setTextColor(150, 50, 50);
    if (sale.void_reason) {
      pdf.text(`Reason: ${sale.void_reason}`, margin, y);
      y += 4;
    }
  }

  const receiptUrl = `${origin}/receipt/${saleId}`;
  try {
    const qrDataUrl = await QRCode.toDataURL(receiptUrl, {
      width: 400,
      margin: 2,
      color: { dark: "#000000", light: "#ffffff" },
    });
    const qrSize = 40;
    const qrX = pageW / 2 - qrSize / 2;
    pdf.setFillColor(255, 255, 255);
    pdf.rect(qrX - 2, y, qrSize + 4, qrSize + 4, "F");
    pdf.addImage(qrDataUrl, "PNG", qrX, y + 2, qrSize, qrSize);
    y += qrSize + 6;
    pdf.setFontSize(7);
    pdf.setTextColor(150, 150, 150);
    pdf.text("Scan to view receipt on your device", pageW / 2, y, { align: "center" });
    y += 5;
  } catch {
    y += 2;
  }

  pdf.setDrawColor(200, 200, 200);
  pdf.line(margin, y, pageW - margin, y);
  y += 4;

  pdf.setFontSize(7);
  pdf.setTextColor(130, 130, 130);
  pdf.setFont("helvetica", "normal");
  if (sale.sold_by) {
    pdf.text(`Sold by: ${sale.sold_by}`, margin, y);
    y += 3;
  }
  pdf.text("Thank you for your purchase!", pageW / 2, y + 2, { align: "center" });

  return pdf.output("arraybuffer");
}
