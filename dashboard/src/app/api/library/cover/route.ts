import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

/**
 * POST /api/library/cover
 * { bookId, isbn, title, author }
 *
 * Attempts to find a cover image for the book using:
 *   1. Open Library by ISBN   (free, no key)
 *   2. Google Books API by ISBN then by title+author (free, no key for basic search)
 * Saves the found cover_url to library_books/{bookId} and returns it.
 */
export async function POST(req: NextRequest) {
  try {
    const { bookId, isbn, title, author } = await req.json() as {
      bookId: string;
      isbn?: string;
      title?: string;
      author?: string;
    };

    if (!bookId) {
      return NextResponse.json({ error: "bookId is required" }, { status: 400 });
    }

    let coverUrl: string | null = null;

    // ── 1. Open Library by ISBN ──────────────────────────────────
    if (isbn) {
      const olUrl = `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`;
      // Open Library returns a 1×1 pixel GIF when the cover doesn't exist.
      // We verify by checking the Content-Length header (real covers are >5 KB).
      try {
        const probe = await fetch(olUrl, { method: "HEAD" });
        const len = Number(probe.headers.get("content-length") ?? "0");
        if (probe.ok && len > 5000) {
          coverUrl = olUrl;
        }
      } catch {
        /* ignore */
      }
    }

    // ── 2. Google Books API by ISBN ──────────────────────────────
    if (!coverUrl && isbn) {
      try {
        const gbRes = await fetch(
          `https://www.googleapis.com/books/v1/volumes?q=isbn:${encodeURIComponent(isbn)}&maxResults=1`
        );
        if (gbRes.ok) {
          const gbData = await gbRes.json() as { items?: Array<{ volumeInfo?: { imageLinks?: { thumbnail?: string; smallThumbnail?: string } } }> };
          const img = gbData.items?.[0]?.volumeInfo?.imageLinks?.thumbnail
            ?? gbData.items?.[0]?.volumeInfo?.imageLinks?.smallThumbnail;
          if (img) coverUrl = img.replace("http://", "https://");
        }
      } catch {
        /* ignore */
      }
    }

    // ── 3. Google Books API by title + author ────────────────────
    if (!coverUrl && title) {
      try {
        const q = [title, author].filter(Boolean).join("+intitle:");
        const gbRes = await fetch(
          `https://www.googleapis.com/books/v1/volumes?q=intitle:${encodeURIComponent(q)}&maxResults=1`
        );
        if (gbRes.ok) {
          const gbData = await gbRes.json() as { items?: Array<{ volumeInfo?: { imageLinks?: { thumbnail?: string; smallThumbnail?: string } } }> };
          const img = gbData.items?.[0]?.volumeInfo?.imageLinks?.thumbnail
            ?? gbData.items?.[0]?.volumeInfo?.imageLinks?.smallThumbnail;
          if (img) coverUrl = img.replace("http://", "https://");
        }
      } catch {
        /* ignore */
      }
    }

    if (!coverUrl) {
      return NextResponse.json({ message: "No cover found online for this book." });
    }

    // Save to Firestore
    await adminDb.collection("library_books").doc(bookId).update({ cover_url: coverUrl });

    return NextResponse.json({ cover_url: coverUrl });
  } catch (err) {
    console.error("Cover fetch error:", err);
    return NextResponse.json({ error: "Failed to fetch cover" }, { status: 500 });
  }
}
