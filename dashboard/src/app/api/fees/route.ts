import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { CACHE_SHORT } from "@/lib/cache-headers";
import { verifyAdmin } from "@/lib/api-auth";

interface Installment { label: string; charged: number; paid: number; discount: number; balance: number; }
interface StudentFee { student_number: string; student_name: string; class_name: string; school: string; total_charged: number; total_paid: number; total_discount: number; balance: number; installments: Installment[]; status: "paid" | "partial" | "unpaid" | "overpaid"; }

let feeCache: { data: unknown; ts: number; key: string } | null = null;
const FEE_CACHE_TTL = 10 * 60 * 1000;

export async function GET(req: NextRequest) {
  const auth = await verifyAdmin(req);
  if (!auth.ok) return auth.response;

  const yearParam = req.nextUrl.searchParams.get("year") || "";
  const schoolParam = req.nextUrl.searchParams.get("school") || "all";
  const studentParam = req.nextUrl.searchParams.get("student") || "";

  const supabase = createServiceClient();

  if (studentParam) {
    try {
      const { data } = await supabase.from("student_progress").select("student_number, student_name, data").eq("student_number", studentParam.trim()).maybeSingle();
      if (!data) return NextResponse.json({ error: "Student not found" }, { status: 404 });
      const d = data as Record<string, unknown>;
      const dataObj = (d["data"] as Record<string, unknown>) || {};
      const financials = (dataObj["financials"] || {}) as Record<string, { total_charged: number; total_paid: number; total_discount: number; balance: number; installments: Installment[] }>;
      const yearsData = (dataObj["years"] || {}) as Record<string, { class_name?: string }>;
      const yearsList = Object.keys(financials).sort().map((yr) => {
        const fin = financials[yr];
        const yearInfo = yearsData[yr] || {};
        return { year: yr, class_name: yearInfo.class_name || "", total_charged: fin.total_charged || 0, total_paid: fin.total_paid || 0, total_discount: fin.total_discount || 0, balance: fin.balance || 0, installments: fin.installments || [] };
      });
      return NextResponse.json({ student_number: String(d["student_number"] || studentParam), student_name: String(d["student_name"] || ""), years: yearsList }, { headers: CACHE_SHORT });
    } catch (err) {
      console.error("Fee student detail error:", err);
      return NextResponse.json({ error: "Failed to fetch student fees" }, { status: 500 });
    }
  }

  const cacheKey = `${yearParam}|${schoolParam}`;
  if (feeCache && feeCache.key === cacheKey && Date.now() - feeCache.ts < FEE_CACHE_TTL) {
    return NextResponse.json(feeCache.data, { headers: CACHE_SHORT });
  }

  try {
    const { data: rows } = await supabase.from("student_progress").select("student_number, student_name, class_name, school, data").limit(2000);
    const students: StudentFee[] = [];
    let grandCharged = 0, grandPaid = 0, grandDiscount = 0, grandBalance = 0, paidCount = 0, partialCount = 0, unpaidCount = 0;

    for (const row of rows ?? []) {
      const d = row as Record<string, unknown>;
      const dataObj = (d["data"] as Record<string, unknown>) || {};
      const financials = (dataObj["financials"]) as Record<string, { total_charged: number; total_paid: number; total_discount: number; balance: number; installments: Installment[] }> | undefined;
      if (!financials) continue;

      const years = Object.keys(financials).sort();
      const targetYear = yearParam && financials[yearParam] ? yearParam : years[years.length - 1];
      if (!targetYear || !financials[targetYear]) continue;
      const fin = financials[targetYear];
      const yearData = ((dataObj["years"] as Record<string, { class_name?: string; school?: string }>) ?? {})[targetYear];
      const className = String(d["class_name"] || yearData?.class_name || "");
      const school = String(d["school"] || yearData?.school || "");

      if (schoolParam !== "all" && school !== schoolParam) continue;

      const status: StudentFee["status"] = fin.balance <= 0 ? (fin.total_paid > fin.total_charged ? "overpaid" : "paid") : fin.total_paid > 0 ? "partial" : "unpaid";
      students.push({ student_number: String(d["student_number"] || ""), student_name: String(d["student_name"] || ""), class_name: className, school, total_charged: fin.total_charged, total_paid: fin.total_paid, total_discount: fin.total_discount, balance: fin.balance, installments: fin.installments || [], status });

      grandCharged += fin.total_charged; grandPaid += fin.total_paid; grandDiscount += fin.total_discount; grandBalance += fin.balance;
      if (status === "paid" || status === "overpaid") paidCount++;
      else if (status === "partial") partialCount++;
      else unpaidCount++;
    }

    students.sort((a, b) => b.balance - a.balance);
    const responseData = { year: yearParam || "latest", summary: { total_students: students.length, total_charged: grandCharged, total_paid: grandPaid, total_discount: grandDiscount, total_balance: grandBalance, collection_rate: grandCharged > 0 ? Math.round(((grandPaid + grandDiscount) / grandCharged) * 100) : 100, paid_count: paidCount, partial_count: partialCount, unpaid_count: unpaidCount }, students };
    feeCache = { data: responseData, ts: Date.now(), key: cacheKey };
    return NextResponse.json(responseData, { headers: CACHE_SHORT });
  } catch (err) {
    console.error("Fees API error:", err);
    return NextResponse.json({ error: "Failed to fetch fee data" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await verifyAdmin(req);
  if (!auth.ok) return auth.response;
  feeCache = null;

  try {
    const supabase = createServiceClient();
    const body = await req.json();
    const { studentNumber, year, installmentLabel, amount, type, notes } = body as { studentNumber: string; year: string; installmentLabel?: string; amount: number; type: "payment" | "discount" | "charge" | "adjustment"; notes?: string; };
    if (!studentNumber || !year || !amount || !type) return NextResponse.json({ error: "studentNumber, year, amount, and type are required" }, { status: 400 });

    await supabase.from("fee_transactions").insert({ student_number: studentNumber, year, installment_label: installmentLabel || "", amount, type, notes: notes || "", recorded_by: auth.uid });

    // Update financials in student_progress.data JSONB
    const { data: row } = await supabase.from("student_progress").select("data").eq("student_number", studentNumber.trim()).maybeSingle();
    if (row) {
      const d = row as Record<string, unknown>;
      const dataObj = ((d["data"] as Record<string, unknown>) || {}) as Record<string, unknown>;
      const financials = (dataObj["financials"] as Record<string, { total_charged: number; total_paid: number; total_discount: number; balance: number; installments?: Installment[] }>) || {};
      if (financials[year]) {
        if (type === "payment") { financials[year].total_paid += amount; financials[year].balance -= amount; }
        else if (type === "discount") { financials[year].total_discount += amount; financials[year].balance -= amount; }
        else if (type === "charge") { financials[year].total_charged += amount; financials[year].balance += amount; }
        if (installmentLabel && financials[year].installments) {
          const inst = financials[year].installments!.find((i) => i.label === installmentLabel);
          if (inst) {
            if (type === "payment") { inst.paid += amount; inst.balance -= amount; }
            else if (type === "discount") { inst.discount += amount; inst.balance -= amount; }
            else if (type === "charge") { inst.charged += amount; inst.balance += amount; }
          }
        }
        await supabase.from("student_progress").update({ data: { ...dataObj, financials } }).eq("student_number", studentNumber.trim());
      }
    }

    const { logAudit } = await import("@/lib/audit");
    logAudit({ actor: auth.uid, action: `fee.${type}`, details: `${type} ${amount} SAR for ${studentNumber}`, targetId: String(studentNumber), targetType: "student" });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Fee POST error:", err);
    return NextResponse.json({ error: "Failed to record transaction" }, { status: 500 });
  }
}
