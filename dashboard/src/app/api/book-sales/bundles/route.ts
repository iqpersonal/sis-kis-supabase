import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue, FieldPath } from "firebase-admin/firestore";
import { getCached, setCache, invalidateCache } from "@/lib/cache";
import { CACHE_MEDIUM } from "@/lib/cache-headers";
import { verifyAdmin } from "@/lib/api-auth";

/**
 * Book Bundles API
 *
 * GET /api/book-sales/bundles
 *   ?grade=10          → filter by grade
 *   ?year=25-26        → filter by year
 *   ?school=boys|girls → filter by school
 *
 * POST /api/book-sales/bundles
 *   { action: "create_bundle", ...fields }
 *   { action: "update_bundle", id, ...fields }
 *   { action: "delete_bundle", id }
 */

const COLLECTION = "book_bundles";

// ── GET ────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const grade = req.nextUrl.searchParams.get("grade");
    const year = req.nextUrl.searchParams.get("year");
    const school = req.nextUrl.searchParams.get("school");

    const cacheKey = `book_bundles:${grade || "all"}:${year || "all"}:${school || "all"}`;
    const cached = getCached<unknown[]>(cacheKey);
    if (cached) return NextResponse.json({ bundles: cached }, { headers: CACHE_MEDIUM });

    let query: FirebaseFirestore.Query = adminDb.collection(COLLECTION);

    if (grade) query = query.where("grade", "==", grade);
    if (year) query = query.where("year", "==", year);
    if (school) query = query.where("school", "==", school);

    const snap = await query.get();
    const bundles = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    setCache(cacheKey, bundles);
    return NextResponse.json({ bundles }, { headers: CACHE_MEDIUM });
  } catch (err) {
    console.error("Book Bundles GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── POST ───────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const auth = await verifyAdmin(req);
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();
    const { action } = body;

    // ── Create bundle ──
    if (action === "create_bundle") {
      const { grade, year, school, book_ids, name, name_ar } = body;

      if (!grade || !year || !name) {
        return NextResponse.json(
          { error: "grade, year, and name are required" },
          { status: 400 }
        );
      }

      // Auto-calculate total_price from book prices
      let totalPrice = 0;
      if (Array.isArray(book_ids) && book_ids.length > 0) {
        const bookSnap = await adminDb.collection("book_catalog")
          .where(FieldPath.documentId(), "in", book_ids.slice(0, 30)) // Firestore "in" limit = 30
          .get();
        for (const doc of bookSnap.docs) {
          const d = doc.data();
          if (typeof d.price === "number") totalPrice += d.price;
        }
      }

      const doc = {
        grade: String(grade),
        year: String(year),
        school: school ? String(school) : "",
        book_ids: Array.isArray(book_ids) ? book_ids : [],
        total_price: totalPrice,
        name: String(name).trim(),
        name_ar: name_ar ? String(name_ar).trim() : "",
        created_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
      };

      const ref = await adminDb.collection(COLLECTION).add(doc);
      invalidateCache("book_bundles:");
      return NextResponse.json({ id: ref.id, ...doc });
    }

    // ── Update bundle ──
    if (action === "update_bundle") {
      const { id, ...fields } = body;
      if (!id) {
        return NextResponse.json({ error: "id is required" }, { status: 400 });
      }

      const allowed = ["grade", "year", "school", "book_ids", "name", "name_ar", "total_price"];
      const updates: Record<string, unknown> = { updated_at: FieldValue.serverTimestamp() };

      for (const key of allowed) {
        if (fields[key] !== undefined) updates[key] = fields[key];
      }

      // Recalculate total if book_ids changed
      if (Array.isArray(fields.book_ids) && fields.book_ids.length > 0 && fields.total_price === undefined) {
        let totalPrice = 0;
        const bookSnap = await adminDb.collection("book_catalog")
          .where(FieldPath.documentId(), "in", fields.book_ids.slice(0, 30))
          .get();
        for (const doc of bookSnap.docs) {
          const d = doc.data();
          if (typeof d.price === "number") totalPrice += d.price;
        }
        updates.total_price = totalPrice;
      }

      await adminDb.collection(COLLECTION).doc(id).update(updates);
      invalidateCache("book_bundles:");
      return NextResponse.json({ success: true, id });
    }

    // ── Delete bundle ──
    if (action === "delete_bundle") {
      const { id } = body;
      if (!id) {
        return NextResponse.json({ error: "id is required" }, { status: 400 });
      }
      await adminDb.collection(COLLECTION).doc(id).delete();
      invalidateCache("book_bundles:");
      return NextResponse.json({ success: true, id });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("Book Bundles POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
