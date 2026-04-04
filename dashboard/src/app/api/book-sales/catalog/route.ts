import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { getCached, setCache, invalidateCache } from "@/lib/cache";
import { CACHE_MEDIUM } from "@/lib/cache-headers";
import { verifyAdmin } from "@/lib/api-auth";

/**
 * Book Catalog API
 *
 * GET /api/book-sales/catalog
 *   ?grade=10          → filter by grade
 *   ?year=25-26        → filter by year
 *   ?active_only=true  → only active books
 *
 * POST /api/book-sales/catalog
 *   { action: "create_book", ...fields }
 *   { action: "update_book", id, ...fields }
 *   { action: "delete_book", id }
 *   { action: "bulk_import", books: [...] }
 */

const COLLECTION = "book_catalog";

// ── GET ────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const grade = req.nextUrl.searchParams.get("grade");
    const year = req.nextUrl.searchParams.get("year");
    const activeOnly = req.nextUrl.searchParams.get("active_only") === "true";

    const cacheKey = `book_catalog:${grade || "all"}:${year || "all"}:${activeOnly}`;
    const cached = getCached<unknown[]>(cacheKey);
    if (cached) return NextResponse.json({ books: cached }, { headers: CACHE_MEDIUM });

    let query: FirebaseFirestore.Query = adminDb.collection(COLLECTION);

    if (grade) query = query.where("grade", "==", grade);
    if (year) query = query.where("year", "==", year);
    if (activeOnly) query = query.where("is_active", "==", true);

    const snap = await query.get();
    const books = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    setCache(cacheKey, books);
    return NextResponse.json({ books }, { headers: CACHE_MEDIUM });
  } catch (err) {
    console.error("Book Catalog GET error:", err);
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

    // ── Create book ──
    if (action === "create_book") {
      const { title, title_ar, grade, subject, price, isbn, year, is_active } = body;

      if (!title || !grade || price == null) {
        return NextResponse.json(
          { error: "title, grade, and price are required" },
          { status: 400 }
        );
      }
      if (typeof price !== "number" || price <= 0) {
        return NextResponse.json(
          { error: "price must be a positive number" },
          { status: 400 }
        );
      }

      const doc = {
        title: String(title).trim(),
        title_ar: title_ar ? String(title_ar).trim() : "",
        grade: String(grade),
        subject: subject ? String(subject).trim() : "",
        price: Number(price),
        isbn: isbn ? String(isbn).trim() : "",
        year: year ? String(year) : "",
        is_active: is_active !== false,
        created_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
      };

      const ref = await adminDb.collection(COLLECTION).add(doc);
      invalidateCache("book_catalog:");
      return NextResponse.json({ id: ref.id, ...doc });
    }

    // ── Update book ──
    if (action === "update_book") {
      const { id, ...fields } = body;
      if (!id) {
        return NextResponse.json({ error: "id is required" }, { status: 400 });
      }

      // Only allow known fields
      const allowed = ["title", "title_ar", "grade", "subject", "price", "isbn", "year", "is_active"];
      const updates: Record<string, unknown> = { updated_at: FieldValue.serverTimestamp() };
      for (const key of allowed) {
        if (fields[key] !== undefined) {
          if (key === "price") {
            if (typeof fields[key] !== "number" || fields[key] <= 0) {
              return NextResponse.json({ error: "price must be a positive number" }, { status: 400 });
            }
          }
          updates[key] = key === "price" ? Number(fields[key]) : fields[key];
        }
      }

      await adminDb.collection(COLLECTION).doc(id).update(updates);
      invalidateCache("book_catalog:");
      return NextResponse.json({ success: true, id });
    }

    // ── Delete book ──
    if (action === "delete_book") {
      const { id } = body;
      if (!id) {
        return NextResponse.json({ error: "id is required" }, { status: 400 });
      }
      await adminDb.collection(COLLECTION).doc(id).delete();
      invalidateCache("book_catalog:");
      return NextResponse.json({ success: true, id });
    }

    // ── Bulk import ──
    if (action === "bulk_import") {
      const { books } = body;
      if (!Array.isArray(books) || books.length === 0) {
        return NextResponse.json({ error: "books array is required" }, { status: 400 });
      }
      if (books.length > 500) {
        return NextResponse.json({ error: "Maximum 500 books per import" }, { status: 400 });
      }

      const batch = adminDb.batch();
      let count = 0;

      for (const book of books) {
        if (!book.title || !book.grade || !book.price || Number(book.price) <= 0) continue;

        const ref = adminDb.collection(COLLECTION).doc();
        batch.set(ref, {
          title: String(book.title).trim(),
          title_ar: book.title_ar ? String(book.title_ar).trim() : "",
          grade: String(book.grade),
          subject: book.subject ? String(book.subject).trim() : "",
          price: Number(book.price),
          isbn: book.isbn ? String(book.isbn).trim() : "",
          year: book.year ? String(book.year) : "",
          is_active: book.is_active !== false,
          created_at: FieldValue.serverTimestamp(),
          updated_at: FieldValue.serverTimestamp(),
        });
        count++;
      }

      await batch.commit();
      invalidateCache("book_catalog:");
      return NextResponse.json({ success: true, imported: count });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("Book Catalog POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
