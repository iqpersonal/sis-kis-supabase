import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { getCached, setCache, invalidateCache } from "@/lib/cache";
import { CACHE_MEDIUM } from "@/lib/cache-headers";
import { verifyAdmin } from "@/lib/api-auth";

/**
 * Book Bundles API
 */

const COLLECTION = "book_bundles";

export async function GET(req: NextRequest) {
  try {
    const supabase = createServiceClient();
    const grade = req.nextUrl.searchParams.get("grade");
    const year = req.nextUrl.searchParams.get("year");
    const school = req.nextUrl.searchParams.get("school");

    const cacheKey = `book_bundles:${grade || "all"}:${year || "all"}:${school || "all"}`;
    const cached = getCached<unknown[]>(cacheKey);
    if (cached) return NextResponse.json({ bundles: cached }, { headers: CACHE_MEDIUM });

    let query = supabase.from(COLLECTION).select("*").limit(5000);
    if (grade) query = query.eq("grade", grade);
    if (year) query = query.eq("year", year);
    if (school) query = query.eq("school", school);

    const { data, error } = await query;
    if (error) throw error;

    const bundles = data || [];
    setCache(cacheKey, bundles);
    return NextResponse.json({ bundles }, { headers: CACHE_MEDIUM });
  } catch (err) {
    console.error("Book Bundles GET error:", err);
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

    if (action === "create_bundle") {
      const { grade, year, school, book_ids, name, name_ar } = body;
      if (!grade || !year || !name) {
        return NextResponse.json({ error: "grade, year, and name are required" }, { status: 400 });
      }

      let totalPrice = 0;
      if (Array.isArray(book_ids) && book_ids.length > 0) {
        const { data: books } = await supabase
          .from("book_catalog")
          .select("id, price")
          .in("id", book_ids as string[]);
        for (const b of books || []) {
          if (typeof b.price === "number") totalPrice += b.price;
        }
      }

      const id = crypto.randomUUID();
      const row = {
        id,
        grade: String(grade),
        year: String(year),
        school: school ? String(school) : "",
        book_ids: Array.isArray(book_ids) ? book_ids : [],
        total_price: totalPrice,
        name: String(name).trim(),
        name_ar: name_ar ? String(name_ar).trim() : "",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase.from(COLLECTION).insert(row);
      if (error) throw error;
      invalidateCache("book_bundles:");
      return NextResponse.json(row);
    }

    if (action === "update_bundle") {
      const { id, ...fields } = body;
      if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

      const allowed = ["grade", "year", "school", "book_ids", "name", "name_ar", "total_price"];
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      for (const key of allowed) {
        if (fields[key] !== undefined) updates[key] = fields[key];
      }

      if (Array.isArray(fields.book_ids) && fields.book_ids.length > 0 && fields.total_price === undefined) {
        let totalPrice = 0;
        const { data: books } = await supabase
          .from("book_catalog")
          .select("id, price")
          .in("id", fields.book_ids as string[]);
        for (const b of books || []) {
          if (typeof b.price === "number") totalPrice += b.price;
        }
        updates.total_price = totalPrice;
      }

      const { error } = await supabase.from(COLLECTION).update(updates).eq("id", id);
      if (error) throw error;
      invalidateCache("book_bundles:");
      return NextResponse.json({ success: true, id });
    }

    if (action === "delete_bundle") {
      const { id } = body;
      if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

      const { error } = await supabase.from(COLLECTION).delete().eq("id", id);
      if (error) throw error;
      invalidateCache("book_bundles:");
      return NextResponse.json({ success: true, id });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("Book Bundles POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
