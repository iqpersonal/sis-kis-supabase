import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";

/**
 * POST /api/library/cover
 * { bookId, isbn, title, author }
 * Fetches cover image from Open Library / Google Books and saves to library_books.
 */
export async function POST(req: NextRequest) {
  try {
    const { bookId, isbn, title, author } = await req.json() as {
      bookId: string; isbn?: string; title?: string; author?: string;
    };

    if (!bookId) return NextResponse.json({ error: "bookId is required" }, { status: 400 });

    let coverUrl: string | null = null;

    // 1. Open Library by ISBN
    if (isbn) {
      const olUrl = `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`;
      try {
        const probe = await fetch(olUrl, { method: "HEAD" });
        const len = Number(probe.headers.get("content-length") ?? "0");
        if (probe.ok && len > 5000) coverUrl = olUrl;
      } catch { /* ignore */ }
    }

    // 2. Google Books by ISBN
    if (!coverUrl && isbn) {
      try {
        const gbRes = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${encodeURIComponent(isbn)}&maxResults=1`);
        if (gbRes.ok) {
          const gbData = await gbRes.json() as { items?: Array<{ volumeInfo?: { imageLinks?: { thumbnail?: string; smallThumbnail?: string } } }> };
          const img = gbData.items?.[0]?.volumeInfo?.imageLinks?.thumbnail ?? gbData.items?.[0]?.volumeInfo?.imageLinks?.smallThumbnail;
          if (img) coverUrl = img.replace("http://", "https://");
        }
      } catch { /* ignore */ }
    }

    // 3. Google Books by title + author
    if (!coverUrl && title) {
      try {
        const q = [title, author].filter(Boolean).join("+intitle:");
        const gbRes = await fetch(`https://www.googleapis.com/books/v1/volumes?q=intitle:${encodeURIComponent(q)}&maxResults=1`);
        if (gbRes.ok) {
          const gbData = await gbRes.json() as { items?: Array<{ volumeInfo?: { imageLinks?: { thumbnail?: string; smallThumbnail?: string } } }> };
          const img = gbData.items?.[0]?.volumeInfo?.imageLinks?.thumbnail ?? gbData.items?.[0]?.volumeInfo?.imageLinks?.smallThumbnail;
          if (img) coverUrl = img.replace("http://", "https://");
        }
      } catch { /* ignore */ }
    }

    if (!coverUrl) return NextResponse.json({ message: "No cover found online for this book." });

    const supabase = createServiceClient();
    await supabase.from("library_books").update({ cover_url: coverUrl, updated_at: new Date().toISOString() }).eq("id", bookId);

    return NextResponse.json({ cover_url: coverUrl });
  } catch (err) {
    console.error("Cover fetch error:", err);
    return NextResponse.json({ error: "Failed to fetch cover" }, { status: 500 });
  }
}
