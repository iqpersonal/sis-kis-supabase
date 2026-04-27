import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase-server";
import ReceiptActions from "./receipt-actions";

/* ═══════════════════════════════════════════════════════════════
 *  Server Component — fetches data at render time (no client fetch)
 * ═══════════════════════════════════════════════════════════════ */

interface ReceiptData {
  id: string;
  receipt_number: string;
  student_name: string;
  student_number: string;
  family_number: string;
  family_name: string;
  grade: string;
  school: string;
  items: { book_id: string; title: string; price: number }[];
  subtotal: number;
  vat_amount: number;
  vat_rate: number;
  total_amount: number;
  paid_amount: number;
  payment_method: string;
  status: string;
  year: string;
  created_at: string;
  void_reason: string;
  voided_at: string;
}

const formatSAR = (n: number) => `SAR ${n.toFixed(2)}`;

function formatDate(iso: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
    });
  } catch {
    return "—";
  }
}

async function getReceipt(id: string): Promise<ReceiptData | null> {
  if (!id || id.length > 128) return null;
  try {
    const supabase = createServiceClient();
    const { data: sale } = await supabase
      .from("book_sales")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (!sale) return null;

    return {
      id: String(sale.id || ""),
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
      created_at: typeof sale.created_at === "string" ? sale.created_at : (sale.created_at ? String(sale.created_at) : ""),
      void_reason: sale.void_reason || "",
      voided_at: typeof sale.voided_at === "string" ? sale.voided_at : (sale.voided_at ? String(sale.voided_at) : ""),
    };
  } catch {
    return null;
  }
}

export default async function ReceiptViewerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const receipt = await getReceipt(id);

  if (!receipt) {
    notFound();
  }

  const isVoided = receipt.status === "voided";

  return (
    <div className="min-h-screen bg-gray-50 py-6 px-4">
      <div className="max-w-md mx-auto">

        {/* ── Receipt Card ─────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">

          {/* Header */}
          <div className="bg-[#296296] text-white px-6 py-5 text-center">
            <h1 className="text-xl font-bold tracking-wide">KIS Bookshop</h1>
            <p className="text-blue-100 text-xs mt-1">Khaled International Schools</p>
            <p className="text-blue-200 text-xs">Book Sales Receipt</p>
          </div>

          {/* Voided Banner */}
          {isVoided && (
            <div className="bg-red-50 border-b border-red-200 px-6 py-3 text-center">
              <span className="text-red-600 font-bold text-lg tracking-widest">⛔ VOIDED</span>
              {receipt.void_reason && (
                <p className="text-red-500 text-xs mt-1">Reason: {receipt.void_reason}</p>
              )}
            </div>
          )}

          {/* Receipt Details */}
          <div className="px-6 py-4 space-y-3">
            {/* Receipt # and Date */}
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-500">Receipt #</span>
              <span className="font-mono font-semibold text-gray-800">{receipt.receipt_number}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-500">Date</span>
              <span className="text-gray-800">{formatDate(receipt.created_at)}</span>
            </div>

            <hr className="border-gray-100" />

            {/* Student Info */}
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Student</span>
                <span className="text-gray-800 font-medium text-right">{receipt.student_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Student #</span>
                <span className="text-gray-800 font-mono">{receipt.student_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Family #</span>
                <span className="text-gray-800">{receipt.family_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Grade</span>
                <span className="text-gray-800">{receipt.grade}</span>
              </div>
              {receipt.school && (
                <div className="flex justify-between">
                  <span className="text-gray-500">School</span>
                  <span className="text-gray-800 capitalize">{receipt.school}</span>
                </div>
              )}
            </div>

            <hr className="border-gray-100" />

            {/* Items */}
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Books Purchased</div>
              <div className="space-y-2">
                {receipt.items.map((item, i) => (
                  <div key={i} className="flex justify-between items-start text-sm">
                    <div className="flex items-start gap-2 flex-1 min-w-0">
                      <span className="text-gray-400 text-xs mt-0.5">{i + 1}.</span>
                      <span className="text-gray-800 break-words">{item.title}</span>
                    </div>
                    <span className="text-gray-800 font-medium whitespace-nowrap ml-3">
                      {formatSAR(item.price)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <hr className="border-gray-100" />

            {/* Totals */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Subtotal</span>
                <span className="text-gray-800">{formatSAR(receipt.subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">VAT ({receipt.vat_rate}%)</span>
                <span className="text-gray-800">{formatSAR(receipt.vat_amount)}</span>
              </div>
              <div className="flex justify-between text-base font-bold pt-1 border-t border-gray-100">
                <span className="text-gray-800">Total (incl. VAT)</span>
                <span className="text-[#296296]">{formatSAR(receipt.total_amount)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Paid</span>
                <span className="text-gray-800">{formatSAR(receipt.paid_amount)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Payment</span>
                <span className="text-gray-800 capitalize">
                  {receipt.payment_method === "bank_transfer" ? "Bank Transfer" : "Cash"}
                </span>
              </div>
            </div>

            <hr className="border-gray-100" />

            {/* Year */}
            <div className="flex justify-between text-xs text-gray-400">
              <span>Academic Year</span>
              <span>{receipt.year}</span>
            </div>
          </div>

          {/* Footer */}
          <div className="bg-gray-50 px-6 py-3 text-center">
            <p className="text-xs text-gray-400">Thank you for your purchase!</p>
          </div>
        </div>

        {/* ── Action Buttons (client component) ───────── */}
        <ReceiptActions
          saleId={receipt.id}
          receiptNumber={receipt.receipt_number}
          studentName={receipt.student_name}
          grade={receipt.grade}
          totalAmount={receipt.total_amount}
          status={receipt.status}
        />

        {/* Branding */}
        <div className="text-center mt-6 mb-4">
          <p className="text-[10px] text-gray-300">KIS Student Information System</p>
        </div>
      </div>
    </div>
  );
}
