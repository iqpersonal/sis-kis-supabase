import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { CACHE_SHORT } from "@/lib/cache-headers";

/**
 * Book Sales — Reports API
 *
 * GET /api/book-sales/reports
 *   ?type=daily&date=2026-04-01&year=25-26
 *   ?type=range&from=2026-01-01&to=2026-03-31&year=25-26
 *   ?type=grade&year=25-26
 *   ?type=inventory&year=25-26
 *   ?type=unpaid&year=25-26
 */

const COLLECTION = "book_sales";

interface SaleDoc {
  id: string;
  receipt_number?: string;
  student_number?: string;
  student_name?: string;
  family_number?: string;
  grade?: string;
  school?: string;
  items?: { book_id: string; title: string; price: number }[];
  subtotal?: number;
  vat_amount?: number;
  total_amount?: number;
  paid_amount?: number;
  payment_method?: string;
  status?: string;
  sold_by?: string;
  year?: string;
  created_at?: unknown;
}

function extractDate(ts: unknown): Date | null {
  if (!ts) return null;
  if (typeof ts === "object" && ts !== null && "toDate" in (ts as Record<string, unknown>)) {
    return (ts as { toDate: () => Date }).toDate();
  }
  if (typeof ts === "string") return new Date(ts);
  if (typeof ts === "object" && ts !== null && "_seconds" in (ts as Record<string, unknown>)) {
    return new Date((ts as { _seconds: number })._seconds * 1000);
  }
  return null;
}

function dateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function fetchSales(year: string): Promise<SaleDoc[]> {
  let query: FirebaseFirestore.Query = adminDb.collection(COLLECTION);
  if (year) query = query.where("year", "==", year);
  const snap = await query.limit(5000).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as SaleDoc));
}

function filterByDateRange(sales: SaleDoc[], from: string, to: string): SaleDoc[] {
  const fromDate = from ? new Date(from + "T00:00:00") : new Date("2000-01-01");
  const toDate = to ? new Date(to + "T23:59:59") : new Date("2099-12-31");
  return sales.filter((s) => {
    const d = extractDate(s.created_at);
    return d ? d >= fromDate && d <= toDate : false;
  });
}

// ── Build summary from a list of sales ──
function buildSummary(sales: SaleDoc[]) {
  let totalTransactions = 0;
  let totalRevenue = 0;
  let totalVAT = 0;
  let totalSubtotal = 0;
  let itemsSold = 0;
  let voided = 0;
  const byPaymentMethod: Record<string, { count: number; revenue: number }> = {};
  const byGrade: Record<string, { count: number; revenue: number; students: Set<string> }> = {};
  const bySchool: Record<string, { count: number; revenue: number }> = {};
  const byBook: Record<string, { title: string; count: number; revenue: number }> = {};
  const byDate: Record<string, { count: number; revenue: number; vat: number }> = {};
  const soldStudents = new Set<string>();

  for (const s of sales) {
    if (s.status === "voided") { voided++; continue; }

    totalTransactions++;
    const paid = s.paid_amount ?? s.total_amount ?? 0;
    const sub = s.subtotal ?? (paid / 1.15);
    const vat = s.vat_amount ?? (paid - sub);
    totalRevenue += paid;
    totalSubtotal += sub;
    totalVAT += vat;
    itemsSold += s.items?.length ?? 0;

    if (s.student_number) soldStudents.add(s.student_number);

    // By payment method
    const method = s.payment_method || "unknown";
    if (!byPaymentMethod[method]) byPaymentMethod[method] = { count: 0, revenue: 0 };
    byPaymentMethod[method].count++;
    byPaymentMethod[method].revenue += paid;

    // By grade
    const grade = s.grade || "Unknown";
    if (!byGrade[grade]) byGrade[grade] = { count: 0, revenue: 0, students: new Set() };
    byGrade[grade].count++;
    byGrade[grade].revenue += paid;
    if (s.student_number) byGrade[grade].students.add(s.student_number);

    // By school
    const school = s.school || "Unknown";
    if (!bySchool[school]) bySchool[school] = { count: 0, revenue: 0 };
    bySchool[school].count++;
    bySchool[school].revenue += paid;

    // By book
    for (const item of s.items || []) {
      const key = item.book_id || item.title;
      if (!byBook[key]) byBook[key] = { title: item.title, count: 0, revenue: 0 };
      byBook[key].count++;
      byBook[key].revenue += item.price || 0;
    }

    // By date
    const d = extractDate(s.created_at);
    if (d) {
      const ds = dateStr(d);
      if (!byDate[ds]) byDate[ds] = { count: 0, revenue: 0, vat: 0 };
      byDate[ds].count++;
      byDate[ds].revenue += paid;
      byDate[ds].vat += vat;
    }
  }

  // Serialize grade students sets to counts
  const byGradeSerialized: Record<string, { count: number; revenue: number; unique_students: number }> = {};
  for (const [g, v] of Object.entries(byGrade)) {
    byGradeSerialized[g] = { count: v.count, revenue: v.revenue, unique_students: v.students.size };
  }

  return {
    total_transactions: totalTransactions,
    total_revenue: Math.round(totalRevenue * 100) / 100,
    total_subtotal: Math.round(totalSubtotal * 100) / 100,
    total_vat: Math.round(totalVAT * 100) / 100,
    items_sold: itemsSold,
    voided,
    unique_students: soldStudents.size,
    by_payment_method: byPaymentMethod,
    by_grade: byGradeSerialized,
    by_school: bySchool,
    by_book: byBook,
    by_date: byDate,
  };
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const type = sp.get("type") || "daily";
    const year = sp.get("year") || "";

    const allSales = await fetchSales(year);

    // ── Daily report ──
    if (type === "daily") {
      const date = sp.get("date") || dateStr(new Date());
      const daySales = filterByDateRange(allSales, date, date);
      const summary = buildSummary(daySales);

      // Include individual transactions for the daily table
      const transactions = daySales
        .filter((s) => s.status !== "voided")
        .map((s) => ({
          id: s.id,
          receipt_number: s.receipt_number,
          student_name: s.student_name,
          student_number: s.student_number,
          family_number: s.family_number,
          grade: s.grade,
          school: s.school,
          items_count: s.items?.length ?? 0,
          subtotal: s.subtotal ?? ((s.paid_amount ?? 0) / 1.15),
          vat: s.vat_amount ?? ((s.paid_amount ?? 0) - ((s.paid_amount ?? 0) / 1.15)),
          total: s.total_amount ?? s.paid_amount ?? 0,
          paid: s.paid_amount ?? 0,
          payment_method: s.payment_method,
          sold_by: s.sold_by,
          time: extractDate(s.created_at)?.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) || "",
        }));

      return NextResponse.json({ date, summary, transactions }, { headers: CACHE_SHORT });
    }

    // ── Date range report ──
    if (type === "range") {
      const from = sp.get("from") || "";
      const to = sp.get("to") || "";
      if (!from || !to) {
        return NextResponse.json({ error: "from and to dates are required" }, { status: 400 });
      }
      const rangeSales = filterByDateRange(allSales, from, to);
      const summary = buildSummary(rangeSales);
      return NextResponse.json({ from, to, summary }, { headers: CACHE_SHORT });
    }

    // ── Grade report ──
    if (type === "grade") {
      const summary = buildSummary(allSales.filter((s) => s.status !== "voided"));

      // Also get total enrolled students from browse index for comparison
      let enrolledByGrade: Record<string, number> = {};
      try {
        const browseDoc = await adminDb.collection("parent_config").doc(`browse_${year}`).get();
        if (browseDoc.exists) {
          const buckets = (browseDoc.data()?.buckets ?? {}) as Record<string, unknown[]>;
          for (const [, entries] of Object.entries(buckets)) {
            const list = entries as { class?: string }[];
            for (const e of list) {
              const g = e.class || "Unknown";
              enrolledByGrade[g] = (enrolledByGrade[g] || 0) + 1;
            }
          }
        }
      } catch { /* ignore */ }

      return NextResponse.json({ summary, enrolled_by_grade: enrolledByGrade }, { headers: CACHE_SHORT });
    }

    // ── Inventory / book report ──
    if (type === "inventory") {
      const summary = buildSummary(allSales.filter((s) => s.status !== "voided"));

      // Get book catalog for reference (total available titles)
      const catalogSnap = await adminDb.collection("book_catalog")
        .where("year", "==", year)
        .select("title", "grade", "price", "is_active")
        .get();
      const catalog = catalogSnap.docs.map((d) => ({
        id: d.id,
        ...d.data() as { title: string; grade: string; price: number; is_active: boolean },
        sold: summary.by_book[d.id]?.count || 0,
        revenue: summary.by_book[d.id]?.revenue || 0,
      }));

      return NextResponse.json({ summary, catalog }, { headers: CACHE_SHORT });
    }

    // ── Unpaid families report ──
    if (type === "unpaid") {
      // Get sold student numbers
      const soldStudents = new Set<string>();
      for (const s of allSales) {
        if (s.status !== "voided" && s.student_number) {
          soldStudents.add(s.student_number);
        }
      }

      // Get all enrolled students from browse index
      const browseDoc = await adminDb.collection("parent_config").doc(`browse_${year}`).get();
      if (!browseDoc.exists) {
        return NextResponse.json({ unpaid: [], total_enrolled: 0, total_paid: soldStudents.size });
      }

      const SCHOOL_MAP: Record<string, string> = { "0021-01": "Boys", "0021-02": "Girls" };
      const buckets = (browseDoc.data()?.buckets ?? {}) as Record<string, { sn: string; name: string; fam: string; class?: string }[]>;
      const unpaid: { student_number: string; student_name: string; family_number: string; grade: string; school: string }[] = [];
      let totalEnrolled = 0;

      for (const [key, entries] of Object.entries(buckets)) {
        const parts = key.split("__");
        const schoolCode = parts[2] || "";
        const school = SCHOOL_MAP[schoolCode] || schoolCode;
        for (const e of entries) {
          totalEnrolled++;
          if (!soldStudents.has(e.sn)) {
            unpaid.push({
              student_number: e.sn,
              student_name: e.name,
              family_number: e.fam,
              grade: e.class || "",
              school,
            });
          }
        }
      }

      // Sort by grade then name
      unpaid.sort((a, b) => a.grade.localeCompare(b.grade) || a.student_name.localeCompare(b.student_name));

      return NextResponse.json({
        unpaid,
        total_enrolled: totalEnrolled,
        total_paid: soldStudents.size,
        total_unpaid: unpaid.length,
      }, { headers: CACHE_SHORT });
    }

    return NextResponse.json({ error: "Invalid report type" }, { status: 400 });
  } catch (err) {
    console.error("Book Sales Reports error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
