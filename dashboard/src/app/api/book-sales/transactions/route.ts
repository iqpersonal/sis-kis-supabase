import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { CACHE_SHORT } from "@/lib/cache-headers";
import { verifyAuth } from "@/lib/api-auth";

/**
 * Book Sales — Transactions API  (independent from school finance)
 *
 * GET /api/book-sales/transactions
 *   ?action=stats           → KPI summary
 *   ?action=list             → list sales (default)
 *   ?year=25-26             → filter by year
 *   ?school=boys|girls      → filter by school
 *   ?grade=10               → filter by grade
 *   ?status=paid|voided     → filter by status
 *   ?family=1234            → filter by family number
 *   ?from=2026-01-01&to=2026-03-31 → date range
 *   ?id=xxx                 → single sale detail
 *
 * POST /api/book-sales/transactions
 *   { action: "create_sale", student_number, student_name, family_number,
 *     family_name, grade, school, items[], paid_amount, payment_method, sold_by, year }
 *   { action: "void_sale", id, reason, voided_by }
 */

const COLLECTION = "book_sales";

// ── GET ────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const action = req.nextUrl.searchParams.get("action") || "list";

  try {
    // ── Stats ──
    if (action === "stats") {
      const year = req.nextUrl.searchParams.get("year") || "";
      let query: FirebaseFirestore.Query = adminDb.collection(COLLECTION);
      if (year) query = query.where("year", "==", year);

      const snap = await query.select(
        "status", "total_amount", "paid_amount", "grade", "school", "created_at"
      ).get();

      let totalSales = 0, totalRevenue = 0, todaySales = 0, todayRevenue = 0;
      let voided = 0;
      const byGrade: Record<string, { count: number; revenue: number }> = {};
      const bySchool: Record<string, { count: number; revenue: number }> = {};

      const todayStr = new Date().toISOString().slice(0, 10);

      for (const doc of snap.docs) {
        const d = doc.data();
        if (d.status === "voided") { voided++; continue; }

        totalSales++;
        const amt = typeof d.paid_amount === "number" ? d.paid_amount : 0;
        totalRevenue += amt;

        // Today's sales
        let dateStr = "";
        if (d.created_at?.toDate) {
          dateStr = d.created_at.toDate().toISOString().slice(0, 10);
        } else if (typeof d.created_at === "string") {
          dateStr = d.created_at.slice(0, 10);
        }
        if (dateStr === todayStr) { todaySales++; todayRevenue += amt; }

        // By grade
        const g = (d.grade as string) || "unknown";
        if (!byGrade[g]) byGrade[g] = { count: 0, revenue: 0 };
        byGrade[g].count++;
        byGrade[g].revenue += amt;

        // By school
        const s = (d.school as string) || "unknown";
        if (!bySchool[s]) bySchool[s] = { count: 0, revenue: 0 };
        bySchool[s].count++;
        bySchool[s].revenue += amt;
      }

      return NextResponse.json({
        total_sales: totalSales,
        total_revenue: totalRevenue,
        today_sales: todaySales,
        today_revenue: todayRevenue,
        voided,
        by_grade: byGrade,
        by_school: bySchool,
      }, { headers: CACHE_SHORT });
    }

    // ── Single sale detail ──
    const id = req.nextUrl.searchParams.get("id");
    if (id) {
      const doc = await adminDb.collection(COLLECTION).doc(id).get();
      if (!doc.exists) {
        return NextResponse.json({ error: "Sale not found" }, { status: 404 });
      }
      return NextResponse.json({ sale: { id: doc.id, ...doc.data() } }, { headers: CACHE_SHORT });
    }

    // ── List sales ──
    const year = req.nextUrl.searchParams.get("year");
    const school = req.nextUrl.searchParams.get("school");
    const grade = req.nextUrl.searchParams.get("grade");
    const status = req.nextUrl.searchParams.get("status");
    const family = req.nextUrl.searchParams.get("family");
    const from = req.nextUrl.searchParams.get("from");
    const to = req.nextUrl.searchParams.get("to");

    // Use single-field where clauses only, sort client-side to avoid composite index requirements
    let query: FirebaseFirestore.Query = adminDb.collection(COLLECTION);

    if (year) query = query.where("year", "==", year);
    if (school) query = query.where("school", "==", school);
    if (grade) query = query.where("grade", "==", grade);
    if (status) query = query.where("status", "==", status);
    if (family) query = query.where("family_number", "==", family);

    const snap = await query.limit(500).get();
    let sales = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    // Sort by created_at descending (client-side)
    sales.sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
      const getTime = (v: unknown): number => {
        if (v && typeof v === "object" && "toDate" in (v as object)) return (v as { toDate: () => Date }).toDate().getTime();
        if (typeof v === "string") return new Date(v).getTime();
        return 0;
      };
      return getTime(b.created_at) - getTime(a.created_at);
    });

    // Date range filter (client-side — Firestore doesn't support range on two fields with orderBy)
    if (from || to) {
      const fromDate = from ? new Date(from) : new Date("2000-01-01");
      const toDate = to ? new Date(to + "T23:59:59") : new Date("2099-12-31");
      sales = sales.filter((s: Record<string, unknown>) => {
        const ca = s.created_at as { toDate?: () => Date } | string | undefined;
        let d: Date;
        if (ca && typeof ca === "object" && "toDate" in ca && ca.toDate) {
          d = ca.toDate();
        } else if (typeof ca === "string") {
          d = new Date(ca);
        } else {
          return true;
        }
        return d >= fromDate && d <= toDate;
      });
    }

    return NextResponse.json({ sales }, { headers: CACHE_SHORT });
  } catch (err) {
    console.error("Book Sales GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── POST ───────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();
    const { action } = body;

    // ── Create sale ──
    if (action === "create_sale") {
      const {
        student_number, student_name, family_number, family_name,
        grade, school, items, paid_amount, payment_method, sold_by, year,
      } = body;

      if (!student_number || !student_name || !items || !Array.isArray(items) || items.length === 0) {
        return NextResponse.json(
          { error: "student_number, student_name, and items[] are required" },
          { status: 400 }
        );
      }

      // Calculate total from items + 15% VAT
      let subtotal = 0;
      const cleanItems = items.map((item: { book_id?: string; title?: string; price?: number }) => {
        const price = typeof item.price === "number" ? item.price : 0;
        subtotal += price;
        return {
          book_id: item.book_id || "",
          title: item.title || "",
          price,
        };
      });
      const vatRate = 0.15;
      const vatAmount = Math.round(subtotal * vatRate * 100) / 100;
      const totalAmount = Math.round((subtotal + vatAmount) * 100) / 100;

      // Generate receipt number atomically: BK-{year}-{sequential}
      const receiptYear = year || new Date().getFullYear().toString();
      const counterRef = adminDb.collection("book_sales_meta").doc(`counter_${receiptYear}`);
      const nextNum = await adminDb.runTransaction(async (tx) => {
        const counterDoc = await tx.get(counterRef);
        const current = counterDoc.exists ? (counterDoc.data()?.count || 0) : 0;
        const next = current + 1;
        tx.set(counterRef, { count: next }, { merge: true });
        return next;
      });
      const receiptNumber = `BK-${receiptYear}-${String(nextNum).padStart(4, "0")}`;

      const sale = {
        receipt_number: receiptNumber,
        student_number: String(student_number),
        student_name: String(student_name),
        family_number: family_number ? String(family_number) : "",
        family_name: family_name ? String(family_name) : "",
        grade: grade ? String(grade) : "",
        school: school ? String(school) : "",
        items: cleanItems,
        subtotal,
        vat_amount: vatAmount,
        vat_rate: 15,
        total_amount: totalAmount,
        paid_amount: typeof paid_amount === "number" ? paid_amount : totalAmount,
        payment_method: payment_method || "cash",
        status: "paid",
        sold_by: sold_by || "",
        year: receiptYear,
        created_at: FieldValue.serverTimestamp(),
      };

      const ref = await adminDb.collection(COLLECTION).add(sale);
      return NextResponse.json({ id: ref.id, ...sale });
    }

    // ── Void sale ──
    if (action === "void_sale") {
      const { id, reason, voided_by } = body;
      if (!id) {
        return NextResponse.json({ error: "id is required" }, { status: 400 });
      }
      if (!reason) {
        return NextResponse.json({ error: "reason is required for voiding" }, { status: 400 });
      }

      const docRef = adminDb.collection(COLLECTION).doc(id);
      const doc = await docRef.get();
      if (!doc.exists) {
        return NextResponse.json({ error: "Sale not found" }, { status: 404 });
      }
      if (doc.data()?.status === "voided") {
        return NextResponse.json({ error: "Sale is already voided" }, { status: 400 });
      }

      await docRef.update({
        status: "voided",
        void_reason: String(reason),
        voided_by: voided_by || "",
        voided_at: FieldValue.serverTimestamp(),
      });

      return NextResponse.json({ success: true, id });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("Book Sales POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
