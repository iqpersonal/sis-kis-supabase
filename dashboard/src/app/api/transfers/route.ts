import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { CACHE_SHORT } from "@/lib/cache-headers";
import { verifyAdmin } from "@/lib/api-auth";

/* ────────────────────── GET ────────────────────── */

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const year = searchParams.get("year");
    const school = searchParams.get("school");
    const statusFilter = searchParams.get("status"); // pending | approved | completed | cancelled

    // Fetch transfer/withdrawal records
    let query = adminDb.collection("student_transfers").orderBy("created_at", "desc");

    const snap = await query.limit(500).get();

    interface TransferRecord {
      id: string;
      student_number: string;
      student_name: string;
      class_name: string;
      school: string;
      type: "transfer" | "withdrawal";
      status: "pending" | "approved" | "completed" | "cancelled";
      reason: string;
      destination_school: string;
      effective_date: string;
      notes: string;
      created_at: string;
      updated_at: string;
      created_by: string;
    }

    let records: TransferRecord[] = snap.docs.map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        student_number: d.student_number || "",
        student_name: d.student_name || "",
        class_name: d.class_name || "",
        school: d.school || "",
        type: d.type || "transfer",
        status: d.status || "pending",
        reason: d.reason || "",
        destination_school: d.destination_school || "",
        effective_date: d.effective_date || "",
        notes: d.notes || "",
        created_at: d.created_at?.toDate?.()
          ? d.created_at.toDate().toISOString()
          : d.created_at || "",
        updated_at: d.updated_at?.toDate?.()
          ? d.updated_at.toDate().toISOString()
          : d.updated_at || "",
        created_by: d.created_by || "",
      };
    });

    // Apply filters
    if (year) {
      records = records.filter((r) => {
        const rYear = r.effective_date?.substring(0, 4);
        return rYear === year.substring(0, 4);
      });
    }
    if (school && school !== "all") {
      records = records.filter((r) => r.school === school);
    }
    if (statusFilter) {
      records = records.filter((r) => r.status === statusFilter);
    }

    // Summary
    const summary = {
      total: records.length,
      transfers: records.filter((r) => r.type === "transfer").length,
      withdrawals: records.filter((r) => r.type === "withdrawal").length,
      pending: records.filter((r) => r.status === "pending").length,
      approved: records.filter((r) => r.status === "approved").length,
      completed: records.filter((r) => r.status === "completed").length,
      cancelled: records.filter((r) => r.status === "cancelled").length,
    };

    return NextResponse.json({ records, summary }, { headers: CACHE_SHORT });
  } catch (error) {
    console.error("Error fetching transfers:", error);
    return NextResponse.json({ records: [], summary: { total: 0, transfers: 0, withdrawals: 0, pending: 0, approved: 0, completed: 0, cancelled: 0 } });
  }
}

/* ────────────────────── POST - Create Transfer/Withdrawal ────────────────────── */

export async function POST(req: NextRequest) {
  const auth = await verifyAdmin(req);
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();
    const {
      studentNumber,
      type,
      reason,
      destinationSchool,
      effectiveDate,
      notes,
    } = body;

    if (!studentNumber || !type) {
      return NextResponse.json(
        { error: "studentNumber and type are required" },
        { status: 400 }
      );
    }

    // Look up the student from student_progress
    const progressSnap = await adminDb
      .collection("student_progress")
      .where("student_number", "==", String(studentNumber))
      .limit(1)
      .get();

    let studentName = "";
    let className = "";
    let school = "";

    if (!progressSnap.empty) {
      const sd = progressSnap.docs[0].data();
      studentName = sd.student_name || sd.student_name_ar || "";
      className = sd.class_name || "";
      school = sd.school || "";
    }

    const now = new Date();

    const record = {
      student_number: String(studentNumber),
      student_name: studentName,
      class_name: className,
      school,
      type: type as "transfer" | "withdrawal",
      status: "pending" as const,
      reason: reason || "",
      destination_school: destinationSchool || "",
      effective_date: effectiveDate || now.toISOString().substring(0, 10),
      notes: notes || "",
      created_at: now,
      updated_at: now,
      created_by: "admin",
    };

    const docRef = await adminDb.collection("student_transfers").add(record);

    // Audit log
    const { logAudit } = await import("@/lib/audit");
    logAudit({ actor: "admin", action: `transfer.create`, details: `${type} for ${studentName || studentNumber}`, targetId: String(studentNumber), targetType: "student" });

    return NextResponse.json({
      success: true,
      id: docRef.id,
      record: { ...record, id: docRef.id, created_at: now.toISOString(), updated_at: now.toISOString() },
    });
  } catch (error) {
    console.error("Error creating transfer:", error);
    return NextResponse.json(
      { error: "Failed to create transfer record" },
      { status: 500 }
    );
  }
}

/* ────────────────────── PUT - Update Status ────────────────────── */

export async function PUT(req: NextRequest) {
  const auth = await verifyAdmin(req);
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();
    const { id, status, notes } = body;

    if (!id || !status) {
      return NextResponse.json(
        { error: "id and status are required" },
        { status: 400 }
      );
    }

    const validStatuses = ["pending", "approved", "completed", "cancelled"];
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `Status must be one of: ${validStatuses.join(", ")}` },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {
      status,
      updated_at: new Date(),
    };
    if (notes !== undefined) {
      updateData.notes = notes;
    }

    await adminDb.collection("student_transfers").doc(id).update(updateData);

    // Audit log
    const { logAudit } = await import("@/lib/audit");
    logAudit({ actor: "admin", action: `transfer.${status}`, details: `Transfer ${id} status → ${status}`, targetId: id, targetType: "transfer" });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating transfer:", error);
    return NextResponse.json(
      { error: "Failed to update transfer record" },
      { status: 500 }
    );
  }
}
