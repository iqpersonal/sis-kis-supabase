/**
 * Barcode product lookup using multiple free APIs + web scraping + Gemini AI.
 * Tries: Open Food Facts, UPC ItemDB, Open Beauty Facts,
 *        Open Pet Food Facts, Go-UPC (web scrape), then Gemini AI as smart fallback.
 * Also provides image upload and Google search helpers.
 */
import { auth } from "./firebase";
import * as FileSystem from "expo-file-system/legacy";

const STORAGE_BUCKET = "sis-kis.firebasestorage.app";

const GEMINI_API_KEY = "AIzaSyCylvB4JTxZhaUSK4vAUwwlrCHOYAmB2gQ";

/**
 * Normalize a barcode to a canonical form so the same physical barcode
 * always matches regardless of whether it was read as UPC-A or EAN-13.
 * - UPC-A (12 digits) is a subset of EAN-13 (with leading 0).
 * - Strips leading zeros for pure-numeric codes to unify them.
 * - For non-numeric codes (Code128, Code39, QR) just trims whitespace.
 */
export function normalizeBarcode(raw: string): string {
  const trimmed = raw.trim();
  // Non-numeric barcodes (QR codes, Code128 with letters) — just trim
  if (!/^\d+$/.test(trimmed)) return trimmed;
  // Strip leading zeros for numeric barcodes to unify UPC-A ↔ EAN-13
  const stripped = trimmed.replace(/^0+/, "") || "0";
  return stripped;
}

export interface BarcodeProduct {
  name: string;
  name_ar?: string;
  brand?: string;
  category?: string;
  image_url?: string;
  description?: string;
}

/**
 * Look up product info by barcode (EAN-13, EAN-8, UPC-A, UPC-E).
 * Tries multiple free databases in parallel. Returns first valid result.
 */
export async function lookupBarcode(barcode: string): Promise<BarcodeProduct | null> {
  const cleaned = barcode.replace(/\s/g, "").trim();
  if (!cleaned) return null;

  // Fire all free APIs in parallel for speed
  const results = await Promise.allSettled([
    tryOpenFoodFacts(cleaned),
    tryUpcItemDb(cleaned),
    tryOpenBeautyFacts(cleaned),
    tryOpenPetFoodFacts(cleaned),
    tryGoUpc(cleaned),
  ]);

  for (const r of results) {
    if (r.status === "fulfilled" && r.value) return r.value;
  }

  // If all free APIs failed, ask Gemini AI (knows most products)
  const geminiResult = await tryGemini(cleaned);
  if (geminiResult) return geminiResult;

  return null;
}

/**
 * Upload a local image (from camera/gallery) to Firebase Storage.
 * Returns the download URL.
 * Uses expo-file-system to read the file as base64, then uploads via uploadString.
 * This is the only reliable method on Android with Hermes engine.
 */
export async function uploadItemImage(
  uri: string,
  itemId: string
): Promise<string> {
  // Determine extension and content type from URI
  const uriLower = uri.toLowerCase();
  let ext = "jpg";
  let contentType = "image/jpeg";
  if (uriLower.includes(".png")) { ext = "png"; contentType = "image/png"; }
  else if (uriLower.includes(".webp")) { ext = "webp"; contentType = "image/webp"; }
  else if (uriLower.includes(".gif")) { ext = "gif"; contentType = "image/gif"; }

  // Get Firebase auth token
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  const token = await user.getIdToken();

  // Upload via Firebase Storage REST API using FileSystem.uploadAsync
  // This bypasses the JS SDK entirely — no Blob/ArrayBuffer issues on Hermes
  const storagePath = `store_items/${itemId}.${ext}`;
  const encodedPath = encodeURIComponent(storagePath);
  const uploadUrl = `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o/${encodedPath}`;

  const uploadRes = await FileSystem.uploadAsync(uploadUrl, uri, {
    httpMethod: "POST",
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": contentType,
    },
  });

  if (uploadRes.status < 200 || uploadRes.status >= 300) {
    throw new Error(`Upload failed (${uploadRes.status}): ${uploadRes.body}`);
  }

  // Get download URL from upload metadata
  const metadata = JSON.parse(uploadRes.body);
  const downloadToken = metadata.downloadTokens;
  return `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o/${encodedPath}?alt=media&token=${downloadToken}`;
}

/** Google Image search URL */
export function googleImageSearchUrl(query: string): string {
  return `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(query)}`;
}

/** Google search URL for barcode product info */
export function googleBarcodeSearchUrl(barcode: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(barcode + " barcode product")}`;
}

async function tryOpenFoodFacts(barcode: string): Promise<BarcodeProduct | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=product_name,product_name_ar,brands,categories,image_url,generic_name`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);

    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== 1 || !data.product) return null;

    const p = data.product;
    const name = p.product_name || p.brands || "";
    if (!name) return null;

    return {
      name: name.substring(0, 100),
      name_ar: p.product_name_ar || undefined,
      brand: p.brands || undefined,
      category: p.categories?.split(",")[0]?.trim() || undefined,
      image_url: p.image_url || undefined,
      description: p.generic_name?.substring(0, 200) || undefined,
    };
  } catch {
    return null;
  }
}

async function tryUpcItemDb(barcode: string): Promise<BarcodeProduct | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(
      `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(barcode)}`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);

    if (!res.ok) return null;
    const data = await res.json();
    if (!data.items || data.items.length === 0) return null;

    const item = data.items[0];
    return {
      name: (item.title || "").substring(0, 100),
      brand: item.brand || undefined,
      category: item.category || undefined,
      image_url: item.images?.[0] || undefined,
      description: item.description?.substring(0, 200) || undefined,
    };
  } catch {
    return null;
  }
}

async function tryOpenBeautyFacts(barcode: string): Promise<BarcodeProduct | null> {
  return tryOpenXFacts("openbeautyfacts", barcode);
}

async function tryOpenPetFoodFacts(barcode: string): Promise<BarcodeProduct | null> {
  return tryOpenXFacts("openpetfoodfacts", barcode);
}

/** Shared helper for all Open *Facts APIs (same response format) */
async function tryOpenXFacts(domain: string, barcode: string): Promise<BarcodeProduct | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(
      `https://world.${domain}.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=product_name,brands,categories,image_url,generic_name`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);

    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== 1 || !data.product) return null;

    const p = data.product;
    const name = p.product_name || p.brands || "";
    if (!name) return null;

    return {
      name: name.substring(0, 100),
      brand: p.brands || undefined,
      category: p.categories?.split(",")[0]?.trim() || undefined,
      image_url: p.image_url || undefined,
      description: p.generic_name?.substring(0, 200) || undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Scrape Go-UPC public page — covers general products (shoes, electronics, etc.)
 * that food/beauty databases don't have.
 */
async function tryGoUpc(barcode: string): Promise<BarcodeProduct | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(
      `https://go-upc.com/barcode/${encodeURIComponent(barcode)}`,
      {
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36",
          "Accept": "text/html",
        },
      }
    );
    clearTimeout(timeout);

    if (!res.ok) return null;
    const html = await res.text();

    // Extract product name — look for the product-name heading
    const nameMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
    const rawName = nameMatch?.[1]?.replace(/<[^>]+>/g, "").trim();
    if (!rawName || rawName.length < 2 || rawName.toLowerCase().includes("not found")) return null;

    // Extract image from product-image or og:image
    let image_url: string | undefined;
    const ogImgMatch = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/);
    if (ogImgMatch?.[1]?.startsWith("http") && !ogImgMatch[1].includes("go-upc.com/assets")) {
      image_url = ogImgMatch[1];
    }
    if (!image_url) {
      const imgMatch = html.match(/<img[^>]*src="(https?:\/\/[^"]+)"[^>]*alt="[^"]*product/i);
      if (imgMatch?.[1]) image_url = imgMatch[1];
    }

    // Extract brand and category from info table
    let brand: string | undefined;
    let category: string | undefined;
    let description: string | undefined;

    const brandMatch = html.match(/Brand[\s\S]*?<\/[^>]+>\s*<[^>]+>([\s\S]*?)<\//);
    if (brandMatch) brand = brandMatch[1].replace(/<[^>]+>/g, "").trim() || undefined;

    const catMatch = html.match(/Category[\s\S]*?<\/[^>]+>\s*<[^>]+>([\s\S]*?)<\//);
    if (catMatch) category = catMatch[1].replace(/<[^>]+>/g, "").trim() || undefined;

    const descMatch = html.match(/Description[\s\S]*?<\/[^>]+>\s*<[^>]+>([\s\S]*?)<\//);
    if (descMatch) description = descMatch[1].replace(/<[^>]+>/g, "").trim().substring(0, 200) || undefined;

    return {
      name: rawName.substring(0, 100),
      brand,
      category,
      image_url,
      description,
    };
  } catch {
    return null;
  }
}

/**
 * Use Gemini AI to identify a product by barcode.
 * Gemini has broad knowledge of products across all categories.
 */
async function tryGemini(barcode: string): Promise<BarcodeProduct | null> {
  if (!GEMINI_API_KEY) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const prompt = `I scanned a product barcode: ${barcode}

Identify this product. Return ONLY a JSON object (no markdown, no code fences) with these fields:
- "name": product name in English (required)
- "name_ar": product name in Arabic if known (optional)  
- "brand": brand name (optional)
- "category": product category like "Electronics", "Shoes", "Stationery", "Food", etc. (optional)
- "description": brief 1-2 sentence product description (optional)
- "image_url": a direct URL to a product image if you know one (optional, must be a real working https URL to a .jpg/.png/.webp image)

If you cannot identify this barcode at all, return exactly: {"name":""}`;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 300,
          },
        }),
      }
    );
    clearTimeout(timeout);

    if (!res.ok) return null;
    const data = await res.json();

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;

    // Parse JSON — strip any markdown fences Gemini might add
    const jsonStr = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(jsonStr);

    if (!parsed.name || parsed.name.trim() === "") return null;

    // Validate image_url looks legitimate
    let image_url = parsed.image_url || undefined;
    if (image_url && (!image_url.startsWith("https://") || image_url.includes("example.com"))) {
      image_url = undefined;
    }

    // If Gemini didn't return a valid image, try to find one via Google Search grounding
    if (!image_url && parsed.name) {
      try {
        image_url = await findProductImage(parsed.name, barcode);
      } catch { /* no image — fine */ }
    }

    return {
      name: String(parsed.name).substring(0, 100),
      name_ar: parsed.name_ar || undefined,
      brand: parsed.brand || undefined,
      category: parsed.category || undefined,
      description: parsed.description?.substring(0, 200) || undefined,
      image_url,
    };
  } catch {
    return null;
  }
}

/**
 * Use Gemini with Google Search grounding to find a real product image URL.
 */
async function findProductImage(productName: string, barcode: string): Promise<string | undefined> {
  if (!GEMINI_API_KEY) return undefined;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `Find a real product image URL for: "${productName}" (barcode: ${barcode}). 
Return ONLY the direct https URL to a .jpg, .png, or .webp product image. No text, no explanation, just the URL.
The URL must be a real, working, direct link to an image file (not a search page or HTML page).
If you cannot find one, return exactly: NONE`,
                },
              ],
            },
          ],
          tools: [{ google_search: {} }],
          generationConfig: { temperature: 0, maxOutputTokens: 200 },
        }),
      }
    );
    clearTimeout(timeout);

    if (!res.ok) return undefined;
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text || text === "NONE" || !text.startsWith("https://")) return undefined;

    // Extract URL (Gemini might add extra text)
    const urlMatch = text.match(/https:\/\/[^\s"')]+\.(jpg|jpeg|png|webp)/i);
    return urlMatch?.[0] || undefined;
  } catch {
    return undefined;
  }
}
