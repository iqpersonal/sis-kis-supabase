import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { getCached, setCache, invalidateCache } from "@/lib/cache";
import { CACHE_MEDIUM } from "@/lib/cache-headers";
import { verifyAdmin } from "@/lib/api-auth";

/**
 * Book Catalog API
 */

const COLLECTION = "book_catalog";

export async function GET(req: NextRequest) {
  try {
    const supabase = createServiceClient();
    const grade = req.nextUrl.searchParams.get("grade");
    const year = req.nextUrl.searchParams.get("year");
    const activeOnly = req.nextUrl.searchParams.get("active_only") === "true";

    const cacheKey = `book_catalog:${grade || "all"}:${year || "all"}:${activeOnly}`;
    const cached = getCached<unknown[]>(cacheKey);
    if (cached) return NextResponse.json({ books: cached }, { headers: CACHE_MEDIUM });

    let query = supabase.from(COLLECTION).select("*").limit(5000);
    if (grade) query = query.eq("grade", grade);
    if (year) query = query.eq("year", year);
    if (activeOnly) query = query.eq("is_active", true);

    const { data, error } = await query;
    if (error) throw error;

    const books = data || [];
    setCache(cacheKey, books);
    return NextResponse.json({ books }, { headers: CACHE_MEDIUM });
  } catch (err) {
    console.error("Book Catalog GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await verifyAdmin(req);
  if (!auth.ok) return auth.response;

  try {
    const supabase = createServiceClient();
    const body = await req.json();
    const { action } = body;

    if (action === "create_book") {
      const { title, title_ar, grade, subject, price, isbn, year, is_active } = body;

      if (!title || !grade || price == null) {
        return NextResponse.json({ error: "title, grade, and price are required" }, { status: 400 });
      }
      if (typeof price !== "number" || price <= 0) {
        return NextResponse.json({ error: "price must be a positive number" }, { status: 400 });
      }

      const id = crypto.randomUUID();
      const doc = {
        id,
        title: String(title).trim(),
        title_ar: title_ar ? String(title_ar).trim() : "",
        grade: String(grade),
        subject: subject ? String(subject).trim() : "",
        price: Number(price),
        isbn: isbn ? String(isbn).trim() : "",
        year: year ? String(year) : "",
        is_active: is_active !== false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase.from(COLLECTION).insert(doc);
      if (error) throw error;
      invalidateCache("book_catalog:");
      return NextResponse.json(doc);
    }

    if (action === "update_book") {
      const { id, ...fields } = body;
      if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

      const allowed = ["title", "title_ar", "grade", "subject", "price", "isbn", "year", "is_active"];
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

      for (const key of allowed) {
        if (fields[key] !== undefined) {
          if (key === "price") {
            if (typeof fields[key] !== "number" || fields[key] <= 0) {
              return NextResponse.json({ error: "price must be a positive number" }, { status: 400 });
            }
            updates[key] = Number(fields[key]);
          } else {
            updates[key] = fields[key];
          }
        }
      }

      const { error } = await supabase.from(COLLECTION).update(updates).eq("id", id);
      if (error) throw error;
      invalidateCache("book_catalog:");
      return NextResponse.json({ success: true, id });
    }

    if (action === "delete_book") {
      const { id } = body;
      if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

      const { error } = await supabase.from(COLLECTION).delete().eq("id", id);
      if (error) throw error;
      invalidateCache("book_catalog:");
      return NextResponse.json({ success: true, id });
    }

    if (action === "bulk_import") {
      const { books } = body;
      if (!Array.isArray(books) || books.length === 0) {
        return NextResponse.json({ error: "books array is required" }, { status: 400 });
      }
      if (books.length > 500) {
        return NextResponse.json({ error: "Maximum 500 books per import" }, { status: 400 });
      }

      const rows: Record<string, unknown>[] = [];
      for (const book of books) {
        if (!book.title || !book.grade || !book.price || Number(book.price) <= 0) continue;
        rows.push({
          id: crypto.randomUUID(),
          title: String(book.title).trim(),
          title_ar: book.title_ar ? String(book.title_ar).trim() : "",
          grade: String(book.grade),
          subject: book.subject ? String(book.subject).trim() : "",
          price: Number(book.price),
          isbn: book.isbn ? String(book.isbn).trim() : "",
          year: book.year ? String(book.year) : "",
          is_active: book.is_active !== false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }

      const { error } = await supabase.from(COLLECTION).insert(rows);
      if (error) throw error;
      invalidateCache("book_catalog:");
      return NextResponse.json({ success: true, imported: rows.length });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("Book Catalog POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
