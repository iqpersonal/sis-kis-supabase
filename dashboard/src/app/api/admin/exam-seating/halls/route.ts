import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";

/* ── Auth helper: Super Admin + Admin + Principal ────────────── */
async function verifyAccess(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;
  try {
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    const snap = await adminDb.collection("admin_users").doc(decoded.uid).get();
    if (!snap.exists) return false;
    const role = snap.data()?.role;
    return ["super_admin", "school_admin", "academic_director"].includes(role);
  } catch {
    return false;
  }
}

const COLLECTION = "exam_halls";

/* ── GET: List all halls ─────────────────────────────────────── */
export async function GET(req: NextRequest) {
  if (!(await verifyAccess(req)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const snap = await adminDb.collection(COLLECTION).orderBy("hallName").get();
    const halls = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    return NextResponse.json({ halls });
  } catch (err) {
    console.error("[exam-halls] GET error:", err);
    return NextResponse.json({ error: "Failed to fetch halls" }, { status: 500 });
  }
}

/* ── POST: Create a new hall ─────────────────────────────────── */
export async function POST(req: NextRequest) {
  if (!(await verifyAccess(req)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await req.json();
    const { hallName, campus, rows, columns } = body as {
      hallName: string;
      campus: string;
      rows: number;
      columns: number;
    };

    if (!hallName || !campus || !rows || !columns) {
      return NextResponse.json({ error: "hallName, campus, rows, columns required" }, { status: 400 });
    }
    if (rows < 1 || rows > 50 || columns < 1 || columns > 50) {
      return NextResponse.json({ error: "rows/columns must be 1-50" }, { status: 400 });
    }

    const doc = await adminDb.collection(COLLECTION).add({
      hallName: String(hallName).trim(),
      campus: String(campus),
      rows: Number(rows),
      columns: Number(columns),
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    return NextResponse.json({ id: doc.id, ok: true });
  } catch (err) {
    console.error("[exam-halls] POST error:", err);
    return NextResponse.json({ error: "Failed to create hall" }, { status: 500 });
  }
}

/* ── PUT: Update a hall ──────────────────────────────────────── */
export async function PUT(req: NextRequest) {
  if (!(await verifyAccess(req)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await req.json();
    const { id, hallName, campus, rows, columns, isActive } = body as {
      id: string;
      hallName?: string;
      campus?: string;
      rows?: number;
      columns?: number;
      isActive?: boolean;
    };

    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const update: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (hallName !== undefined) update.hallName = String(hallName).trim();
    if (campus !== undefined) update.campus = String(campus);
    if (rows !== undefined) {
      if (rows < 1 || rows > 50) return NextResponse.json({ error: "rows must be 1-50" }, { status: 400 });
      update.rows = Number(rows);
    }
    if (columns !== undefined) {
      if (columns < 1 || columns > 50) return NextResponse.json({ error: "columns must be 1-50" }, { status: 400 });
      update.columns = Number(columns);
    }
    if (isActive !== undefined) update.isActive = Boolean(isActive);

    await adminDb.collection(COLLECTION).doc(id).update(update);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[exam-halls] PUT error:", err);
    return NextResponse.json({ error: "Failed to update hall" }, { status: 500 });
  }
}

/* ── DELETE: Remove a hall ───────────────────────────────────── */
export async function DELETE(req: NextRequest) {
  if (!(await verifyAccess(req)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const { id } = (await req.json()) as { id: string };
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    await adminDb.collection(COLLECTION).doc(id).delete();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[exam-halls] DELETE error:", err);
    return NextResponse.json({ error: "Failed to delete hall" }, { status: 500 });
  }
}
