import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
import { CACHE_SHORT } from "@/lib/cache-headers";

/**
 * GET /api/admin/audit-log?limit=50&action=user.create&startAfter=<docId>
 * Returns audit log entries sorted by timestamp descending.
 * Requires super_admin or academic role.
 */

async function verifyAuditAccess(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    const snap = await adminDb.collection("admin_users").doc(decoded.uid).get();
    if (!snap.exists) return null;
    const role = snap.data()?.role;
    if (role === "super_admin") return decoded.email || decoded.uid;
    return null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const caller = await verifyAuditAccess(req);
  if (!caller) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") || "50"), 200);
  const actionFilter = url.searchParams.get("action") || "";
  const startAfter = url.searchParams.get("startAfter") || "";

  let query = adminDb
    .collection("audit_log")
    .orderBy("timestamp", "desc")
    .limit(limit);

  if (actionFilter) {
    query = query.where("action", "==", actionFilter);
  }

  if (startAfter) {
    const cursor = await adminDb.collection("audit_log").doc(startAfter).get();
    if (cursor.exists) {
      query = query.startAfter(cursor);
    }
  }

  const snap = await query.get();
  const entries = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  return NextResponse.json({ entries, count: entries.length }, { headers: CACHE_SHORT });
}
