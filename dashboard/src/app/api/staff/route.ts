import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getCached, setCache } from "@/lib/cache";
import { CACHE_MEDIUM } from "@/lib/cache-headers";

/**
 * Staff API
 *
 * GET /api/staff
 *   ?action=list         → all staff (active by default)
 *   ?action=all          → all staff including terminated
 *   ?action=detail&id=X  → single staff member
 *   ?action=departments  → list departments
 *   ?action=stats        → staff KPIs
 */

export async function GET(req: NextRequest) {
  const action = req.nextUrl.searchParams.get("action") || "list";

  try {
    // ── Active staff list ──
    if (action === "list") {
      const snap = await adminDb
        .collection("staff")
        .where("is_active", "==", true)
        .limit(5000)
        .get();
      const staff = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      return NextResponse.json({ staff }, { headers: CACHE_MEDIUM });
    }

    // ── All staff ──
    if (action === "all") {
      const snap = await adminDb.collection("staff").limit(5000).get();
      const staff = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      return NextResponse.json({ staff }, { headers: CACHE_MEDIUM });
    }

    // ── Single staff detail ──
    if (action === "detail") {
      const id = req.nextUrl.searchParams.get("id");
      if (!id) {
        return NextResponse.json({ error: "id required" }, { status: 400 });
      }
      const doc = await adminDb.collection("staff").doc(id).get();
      if (!doc.exists) {
        return NextResponse.json({ error: "Staff not found" }, { status: 404 });
      }

      // Also fetch assigned assets
      const assetsSnap = await adminDb
        .collection("it_assets")
        .where("assigned_to", "==", id)
        .get();
      const assets = assetsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      return NextResponse.json({
        staff: { id: doc.id, ...doc.data() },
        assets,
      }, { headers: CACHE_MEDIUM });
    }

    // ── Departments ──
    if (action === "departments") {
      const cached = getCached<object[]>("departments");
      if (cached) return NextResponse.json({ departments: cached }, { headers: CACHE_MEDIUM });

      const snap = await adminDb.collection("departments").get();
      const departments = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setCache("departments", departments);
      return NextResponse.json({ departments }, { headers: CACHE_MEDIUM });
    }

    // ── Stats ──
    if (action === "stats") {
      const [activeSnap, allSnap, deptSnap] = await Promise.all([
        adminDb.collection("staff").where("is_active", "==", true).count().get(),
        adminDb.collection("staff").count().get(),
        adminDb.collection("departments").count().get(),
      ]);

      return NextResponse.json({
        total: allSnap.data().count,
        active: activeSnap.data().count,
        terminated: allSnap.data().count - activeSnap.data().count,
        departments: deptSnap.data().count,
      }, { headers: CACHE_MEDIUM });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("Staff API error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
