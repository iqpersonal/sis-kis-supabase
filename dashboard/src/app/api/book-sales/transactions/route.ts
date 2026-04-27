import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { CACHE_SHORT } from "@/lib/cache-headers";
import { verifyAuth } from "@/lib/api-auth";

/**
 * Book Sales - Transactions API  (independent from school finance)
 */

const COLLECTION = "book_sales";

// -- GET --------------------------------------------------------
export async function GET(req: NextRequest) {
  const action = req.nextUrl.searchParams.get("action") || "list";
  const supabase = createServiceClient();

  try {
    if (action === "stats") {
      const year = req.nextUrl.searchParams.get("year") || "";
      const school = req.nextUrl.searchParams.get("school") || "";

      let query = supabase
        .from(COLLECTION)
        .select("status, total_amount, paid_amount, grade, school, created_at")
        .limit(5000);
      if (year) query = query.eq("year", year);
      if (school) query = query.eq("school", school);

      const { data, error } = await query;
      if (error) throw error;

      let totalSales = 0;
      let totalRevenue = 0;
      let todaySales = 0;
      let todayRevenue = 0;
      let voided = 0;
      const byGrade: Record<string, { count: number; revenue: number }> = {};
      const bySchool: Record<string, { count: number; revenue: number }> = {};

      const todayStr = new Date().toISOString().slice(0, 10);

      for (const d of data || []) {
        if (d.status === "voided") {
          voided++;
          continue;
        }

        totalSales++;
        const amt = typeof d.paid_amount === "number" ? d.paid_amount : 0;
        totalRevenue += amt;

        const created = typeof d.created_at === "string" ? d.created_at : "";
        if (created.slice(0, 10) === todayStr) {
          todaySales++;
          todayRevenue += amt;
        }

        const g = (d.grade as string) || "unknown";
        if (!byGrade[g]) byGrade[g] = { count: 0, revenue: 0 };
        byGrade[g].count++;
        byGrade[g].revenue += amt;

        const s = (d.school as string) || "unknown";
        if (!bySchool[s]) bySchool[s] = { count: 0, revenue: 0 };
        bySchool[s].count++;
        bySchool[s].revenue += amt;
      }

      return NextResponse.json(
        {
          total_sales: totalSales,
          total_revenue: totalRevenue,
          today_sales: todaySales,
          today_revenue: todayRevenue,
          voided,
          by_grade: byGrade,
          by_school: bySchool,
        },
        { headers: CACHE_SHORT }
      );
    }

    const id = req.nextUrl.searchParams.get("id");
    if (id) {
      const { data, error } = await supabase.from(COLLECTION).select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      if (!data) return NextResponse.json({ error: "Sale not found" }, { status: 404 });
      return NextResponse.json({ sale: data }, { headers: CACHE_SHORT });
    }

    const year = req.nextUrl.searchParams.get("year");
    const school = req.nextUrl.searchParams.get("school");
    const grade = req.nextUrl.searchParams.get("grade");
    const status = req.nextUrl.searchParams.get("status");
    const family = req.nextUrl.searchParams.get("family");
    const from = req.nextUrl.searchParams.get("from");
    const to = req.nextUrl.searchParams.get("to");

    let query = supabase.from(COLLECTION).select("*").limit(5000);
    if (year) query = query.eq("year", year);
    if (school) query = query.eq("school", school);
    if (grade) query = query.eq("grade", grade);
    if (status) query = query.eq("status", status);
    if (family) query = query.eq("family_number", family);

    const { data, error } = await query;
    if (error) throw error;
    let sales = (data || []) as Array<Record<string, unknown>>;

    sales.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));

    if (from || to) {
      const fromDate = from ? new Date(from) : new Date("2000-01-01");
      const toDate = to ? new Date(to + "T23:59:59") : new Date("2099-12-31");
      sales = sales.filter((s) => {
        const ca = s.created_at;
        if (typeof ca !== "string") return true;
        const d = new Date(ca);
        return d >= fromDate && d <= toDate;
      });
    }

    return NextResponse.json({ sales }, { headers: CACHE_SHORT });
  } catch (err) {
    console.error("Book Sales GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// -- POST -------------------------------------------------------
export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth.ok) return auth.response;

  const supabase = createServiceClient();

  try {
    const body = await req.json();
    const { action } = body;

    if (action === "create_sale") {
      const {
        student_number,
        student_name,
        family_number,
        family_name,
        grade,
        school,
        items,
        paid_amount,
        payment_method,
        sold_by,
        year,
      } = body;

      if (!student_number || !student_name || !items || !Array.isArray(items) || items.length === 0) {
        return NextResponse.json(
          { error: "student_number, student_name, and items[] are required" },
          { status: 400 }
        );
      }

      for (const item of items) {
        if (typeof item.price !== "number" || item.price < 0) {
          return NextResponse.json(
            { error: "Each item must have a valid non-negative price" },
            { status: 400 }
          );
        }
      }

      let subtotal = 0;
      const cleanItems = items.map((item: { book_id?: string; title?: string; price?: number }) => {
        const price = item.price as number;
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
      const receiptYear = year || new Date().getFullYear().toString();

      const counterId = `counter_${receiptYear}`;
      const { data: counterRow } = await supabase
        .from("book_sales_meta")
        .select("count")
        .eq("id", counterId)
        .maybeSingle();
      const nextNum = Number(counterRow?.count || 0) + 1;
      const { error: counterErr } = await supabase
        .from("book_sales_meta")
        .upsert({ id: counterId, count: nextNum }, { onConflict: "id" });
      if (counterErr) throw counterErr;

      const receiptNumber = `BK-${receiptYear}-${String(nextNum).padStart(4, "0")}`;
      const saleId = crypto.randomUUID();

      const sale = {
        id: saleId,
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
        created_at: new Date().toISOString(),
      };

      const { error } = await supabase.from(COLLECTION).insert(sale);
      if (error) throw error;

      return NextResponse.json({ id: saleId, ...sale });
    }

    if (action === "void_sale") {
      const { id, reason, voided_by } = body;
      if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
      if (!reason) return NextResponse.json({ error: "reason is required for voiding" }, { status: 400 });

      const { data: sale, error: findErr } = await supabase
        .from(COLLECTION)
        .select("id, status")
        .eq("id", id)
        .maybeSingle();
      if (findErr) throw findErr;
      if (!sale) return NextResponse.json({ error: "Sale not found" }, { status: 404 });
      if (sale.status === "voided") {
        return NextResponse.json({ error: "Sale is already voided" }, { status: 400 });
      }

      const { error: updErr } = await supabase
        .from(COLLECTION)
        .update({
          status: "voided",
          void_reason: String(reason),
          voided_by: voided_by || "",
          voided_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (updErr) throw updErr;

      return NextResponse.json({ success: true, id });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("Book Sales POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
