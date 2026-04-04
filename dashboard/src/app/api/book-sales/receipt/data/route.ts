import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { CACHE_MEDIUM } from "@/lib/cache-headers";

/**
 * Public Receipt Data API (no auth — used by QR code scanner)
 *
 * GET /api/book-sales/receipt/data?id=xxx
 *   Returns receipt JSON for the given sale ID.
 */

export async function GET(req: NextRequest) {
  const saleId = req.nextUrl.searchParams.get("id");
  if (!saleId || typeof saleId !== "string" || saleId.length > 128) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  try {
    const doc = await adminDb.collection("book_sales").doc(saleId).get();
    if (!doc.exists) {
      return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
    }

    const sale = doc.data()!;

    // Serialize Firestore timestamp
    let created_at = "";
    if (sale.created_at?.toDate) {
      created_at = sale.created_at.toDate().toISOString();
    } else if (typeof sale.created_at === "string") {
      created_at = sale.created_at;
    }

    let voided_at = "";
    if (sale.voided_at?.toDate) {
      voided_at = sale.voided_at.toDate().toISOString();
    } else if (typeof sale.voided_at === "string") {
      voided_at = sale.voided_at;
    }

    return NextResponse.json({
      id: doc.id,
      receipt_number: sale.receipt_number || "",
      student_name: sale.student_name || "",
      student_number: sale.student_number || "",
      family_number: sale.family_number || "",
      family_name: sale.family_name || "",
      grade: sale.grade || "",
      school: sale.school || "",
      items: Array.isArray(sale.items) ? sale.items : [],
      subtotal: typeof sale.subtotal === "number" ? sale.subtotal : 0,
      vat_amount: typeof sale.vat_amount === "number" ? sale.vat_amount : 0,
      vat_rate: typeof sale.vat_rate === "number" ? sale.vat_rate : 15,
      total_amount: typeof sale.total_amount === "number" ? sale.total_amount : 0,
      paid_amount: typeof sale.paid_amount === "number" ? sale.paid_amount : 0,
      payment_method: sale.payment_method || "cash",
      status: sale.status || "paid",
      year: sale.year || "",
      created_at,
      void_reason: sale.void_reason || "",
      voided_at,
    }, { headers: CACHE_MEDIUM });
  } catch (err) {
    console.error("Receipt data error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
