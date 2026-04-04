import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { CACHE_SHORT } from "@/lib/cache-headers";
import { verifyAdmin } from "@/lib/api-auth";
/**
 * GET  /api/fees?year=24-25&school=all
 *   → Returns all students' financial data for the given year with summary stats.
 *
 * POST /api/fees
 *   → Record a manual payment or adjustment.
 *   Body: { studentNumber, year, installmentLabel, amount, type: "payment"|"discount"|"charge", notes }
 */

interface Installment {
  label: string;
  charged: number;
  paid: number;
  discount: number;
  balance: number;
}

interface StudentFee {
  student_number: string;
  student_name: string;
  class_name: string;
  school: string;
  total_charged: number;
  total_paid: number;
  total_discount: number;
  balance: number;
  installments: Installment[];
  status: "paid" | "partial" | "unpaid" | "overpaid";
}

// ── In-memory cache for fee data (10-min TTL) ──
let feeCache: { data: unknown; ts: number; key: string } | null = null;
const FEE_CACHE_TTL = 10 * 60 * 1000;

// ── GET ────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const auth = await verifyAdmin(req);
  if (!auth.ok) return auth.response;

  const yearParam = req.nextUrl.searchParams.get("year") || "";
  const schoolParam = req.nextUrl.searchParams.get("school") || "all";
  const studentParam = req.nextUrl.searchParams.get("student") || "";

  // ── Single student: return all-years fee history ──
  if (studentParam) {
    try {
      const docSnap = await adminDb
        .collection("student_progress")
        .doc(studentParam)
        .get();
      if (!docSnap.exists) {
        return NextResponse.json({ error: "Student not found" }, { status: 404 });
      }
      const d = docSnap.data()!;
      const financials = (d.financials || {}) as Record<string, {
        total_charged: number;
        total_paid: number;
        total_discount: number;
        balance: number;
        installments: Installment[];
      }>;
      const yearsData = d.years || {};

      const yearsList = Object.keys(financials).sort().map((yr) => {
        const fin = financials[yr];
        const yearInfo = yearsData[yr] || {};
        return {
          year: yr,
          class_name: yearInfo.class_name || "",
          total_charged: fin.total_charged || 0,
          total_paid: fin.total_paid || 0,
          total_discount: fin.total_discount || 0,
          balance: fin.balance || 0,
          installments: fin.installments || [],
        };
      });

      return NextResponse.json({
        student_number: d.student_number || docSnap.id,
        student_name: d.student_name || "",
        years: yearsList,
      }, { headers: CACHE_SHORT });
    } catch (err) {
      console.error("Fee student detail error:", err);
      return NextResponse.json({ error: "Failed to fetch student fees" }, { status: 500 });
    }
  }

  // ── All students: return list for given year ──

  // Return cached result if same params and still fresh
  const cacheKey = `${yearParam}|${schoolParam}`;
  if (feeCache && feeCache.key === cacheKey && Date.now() - feeCache.ts < FEE_CACHE_TTL) {
    return NextResponse.json(feeCache.data, { headers: CACHE_SHORT });
  }

  try {
    const snap = await adminDb
      .collection("student_progress")
      .select("student_number", "student_name", "financials", "years")
      .limit(2000)
      .get();

    const students: StudentFee[] = [];
    let grandCharged = 0;
    let grandPaid = 0;
    let grandDiscount = 0;
    let grandBalance = 0;
    let paidCount = 0;
    let partialCount = 0;
    let unpaidCount = 0;

    for (const doc of snap.docs) {
      const d = doc.data();
      const financials = d.financials as Record<string, {
        total_charged: number;
        total_paid: number;
        total_discount: number;
        balance: number;
        installments: Installment[];
      }> | undefined;

      if (!financials) continue;

      // Find the correct year — match param or use latest
      const years = Object.keys(financials).sort();
      const targetYear = yearParam && financials[yearParam]
        ? yearParam
        : years[years.length - 1];

      if (!targetYear || !financials[targetYear]) continue;

      const fin = financials[targetYear];

      // Get class info from years data
      const yearData = d.years?.[targetYear];
      const className = yearData?.class_name || "";
      const school = yearData?.school || "";

      // School filter
      if (schoolParam !== "all" && school !== schoolParam) continue;

      const status: StudentFee["status"] =
        fin.balance <= 0 && fin.total_paid > 0
          ? fin.total_paid > fin.total_charged
            ? "overpaid"
            : "paid"
          : fin.total_paid > 0
            ? "partial"
            : "unpaid";

      students.push({
        student_number: d.student_number || doc.id,
        student_name: d.student_name || doc.id,
        class_name: className,
        school,
        total_charged: fin.total_charged,
        total_paid: fin.total_paid,
        total_discount: fin.total_discount,
        balance: fin.balance,
        installments: fin.installments || [],
        status,
      });

      grandCharged += fin.total_charged;
      grandPaid += fin.total_paid;
      grandDiscount += fin.total_discount;
      grandBalance += fin.balance;

      if (status === "paid" || status === "overpaid") paidCount++;
      else if (status === "partial") partialCount++;
      else unpaidCount++;
    }

    // Sort by balance descending (highest debts first)
    students.sort((a, b) => b.balance - a.balance);

    const responseData = {
      year: yearParam || "latest",
      summary: {
        total_students: students.length,
        total_charged: grandCharged,
        total_paid: grandPaid,
        total_discount: grandDiscount,
        total_balance: grandBalance,
        collection_rate:
          grandCharged > 0
            ? Math.round(((grandPaid + grandDiscount) / grandCharged) * 100)
            : 100,
        paid_count: paidCount,
        partial_count: partialCount,
        unpaid_count: unpaidCount,
      },
      students,
    };

    // Cache the result
    feeCache = { data: responseData, ts: Date.now(), key: cacheKey };

    return NextResponse.json(responseData, { headers: CACHE_SHORT });
  } catch (err) {
    console.error("Fees API error:", err);
    return NextResponse.json(
      { error: "Failed to fetch fee data" },
      { status: 500 }
    );
  }
}

// ── POST ───────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const auth = await verifyAdmin(req);
  if (!auth.ok) return auth.response;

  // Invalidate fee cache on any write
  feeCache = null;

  try {
    const body = await req.json();
    const { studentNumber, year, installmentLabel, amount, type, notes } = body as {
      studentNumber: string;
      year: string;
      installmentLabel?: string;
      amount: number;
      type: "payment" | "discount" | "charge" | "adjustment";
      notes?: string;
    };

    if (!studentNumber || !year || !amount || !type) {
      return NextResponse.json(
        { error: "studentNumber, year, amount, and type are required" },
        { status: 400 }
      );
    }

    // Log the transaction
    await adminDb.collection("fee_transactions").add({
      student_number: studentNumber,
      year,
      installment_label: installmentLabel || "",
      amount,
      type,
      notes: notes || "",
      created_at: new Date().toISOString(),
    });

    // Optionally update the student_progress financials  
    // (In production, this would update the installment balances)
    const docRef = adminDb.collection("student_progress").doc(studentNumber);
    const docSnap = await docRef.get();

    if (docSnap.exists) {
      const data = docSnap.data()!;
      const financials = data.financials || {};

      if (financials[year]) {
        if (type === "payment") {
          financials[year].total_paid = (financials[year].total_paid || 0) + amount;
          financials[year].balance = (financials[year].balance || 0) - amount;
        } else if (type === "discount") {
          financials[year].total_discount = (financials[year].total_discount || 0) + amount;
          financials[year].balance = (financials[year].balance || 0) - amount;
        } else if (type === "charge") {
          financials[year].total_charged = (financials[year].total_charged || 0) + amount;
          financials[year].balance = (financials[year].balance || 0) + amount;
        }

        // Update installment if specified
        if (installmentLabel && financials[year].installments) {
          const inst = financials[year].installments.find(
            (i: Installment) => i.label === installmentLabel
          );
          if (inst) {
            if (type === "payment") {
              inst.paid = (inst.paid || 0) + amount;
              inst.balance = (inst.balance || 0) - amount;
            } else if (type === "discount") {
              inst.discount = (inst.discount || 0) + amount;
              inst.balance = (inst.balance || 0) - amount;
            } else if (type === "charge") {
              inst.charged = (inst.charged || 0) + amount;
              inst.balance = (inst.balance || 0) + amount;
            }
          }
        }

        await docRef.update({ financials });
      }
    }

    // Audit log
    const { logAudit } = await import("@/lib/audit");
    logAudit({ actor: "admin", action: `fee.${type}`, details: `${type} ${amount} SAR for ${studentNumber}`, targetId: String(studentNumber), targetType: "student" });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Fee POST error:", err);
    return NextResponse.json(
      { error: "Failed to record transaction" },
      { status: 500 }
    );
  }
}
