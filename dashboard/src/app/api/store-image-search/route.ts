import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/store-image-search
 * Body: { barcode?: string, query?: string }
 *
 * Strategy:
 * 1. If barcode provided → UPCitemdb free API → returns product images
 * 2. If no barcode result OR query provided → Google Custom Search Images
 * 3. Returns array of image URLs (candidates)
 */

const GOOGLE_CSE_KEY = process.env.GOOGLE_CUSTOM_SEARCH_KEY || "";
const GOOGLE_CSE_CX = process.env.GOOGLE_CUSTOM_SEARCH_CX || "";

interface SearchResult {
  images: string[];
  source: "barcode_db" | "web_search" | "none";
  product_name?: string;
}

/* ── UPCitemdb free tier (up to 100 req/day) ──────────────────── */
async function searchByBarcode(barcode: string): Promise<SearchResult> {
  try {
    const res = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(barcode)}`, {
      headers: { "Accept": "application/json" },
    });
    if (!res.ok) return { images: [], source: "none" };

    const data = await res.json();
    const items = data.items || [];
    if (items.length === 0) return { images: [], source: "none" };

    const item = items[0];
    const images: string[] = [];
    if (item.images && Array.isArray(item.images)) {
      images.push(...item.images.slice(0, 6));
    }
    return {
      images,
      source: images.length > 0 ? "barcode_db" : "none",
      product_name: item.title || undefined,
    };
  } catch {
    return { images: [], source: "none" };
  }
}

/* ── Google Custom Search Images ──────────────────────────────── */
async function searchByQuery(query: string): Promise<SearchResult> {
  // Try Google CSE if keys are configured
  if (GOOGLE_CSE_KEY && GOOGLE_CSE_CX) {
    try {
      const url = new URL("https://www.googleapis.com/customsearch/v1");
      url.searchParams.set("key", GOOGLE_CSE_KEY);
      url.searchParams.set("cx", GOOGLE_CSE_CX);
      url.searchParams.set("q", query + " product");
      url.searchParams.set("searchType", "image");
      url.searchParams.set("num", "6");
      url.searchParams.set("safe", "active");
      url.searchParams.set("imgSize", "medium");

      const res = await fetch(url.toString());
      if (res.ok) {
        const data = await res.json();
        const images = (data.items || [])
          .map((item: { link?: string }) => item.link)
          .filter((link: string | undefined): link is string => !!link)
          .slice(0, 6);
        if (images.length > 0) return { images, source: "web_search" };
      }
    } catch { /* fall through to free alternatives */ }
  }

  // Free fallback: Open Food Facts text search
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=6&fields=image_url,image_front_url,image_front_small_url`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (res.ok) {
      const data = await res.json();
      const images = (data.products || [])
        .map((p: { image_url?: string; image_front_url?: string }) => p.image_front_url || p.image_url)
        .filter((u: string | undefined): u is string => !!u)
        .slice(0, 6);
      if (images.length > 0) return { images, source: "web_search" };
    }
  } catch { /* fall through */ }

  return { images: [], source: "none" };
}

/* ── Handler ──────────────────────────────────────────────────── */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { barcode, query } = body as { barcode?: string; query?: string };

    if (!barcode && !query) {
      return NextResponse.json({ error: "Provide barcode or query" }, { status: 400 });
    }

    // Step 1: Try barcode lookup
    let result: SearchResult = { images: [], source: "none" };
    if (barcode) {
      result = await searchByBarcode(barcode.trim());
    }

    // Step 2: If barcode returned nothing, fall back to text search
    if (result.images.length === 0 && (query || result.product_name)) {
      const searchText = query || result.product_name || "";
      if (searchText) {
        result = await searchByQuery(searchText);
      }
    }

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
