import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { CACHE_MEDIUM } from "@/lib/cache-headers";
import { verifyAdmin } from "@/lib/api-auth";

/**
 * Library Settings API
 *
 * GET  /api/library/settings → fetch current settings
 * POST /api/library/settings → update settings
 */

const DOC_ID = "library_settings";
const COLLECTION = "app_config";

export interface LibrarySettings {
  default_loan_days: number;       // default 14
  max_books_per_student: number;   // default 3
  overdue_fine_per_day: number;    // default 0 (SAR)
  lost_book_fee: number;           // default 50 (SAR)
  grace_period_days: number;       // default 0
  categories: string[];            // predefined categories
  conditions: string[];            // condition options for check-in
}

const DEFAULT_SETTINGS: LibrarySettings = {
  default_loan_days: 14,
  max_books_per_student: 3,
  overdue_fine_per_day: 0,
  lost_book_fee: 50,
  grace_period_days: 0,
  categories: [
    "Fiction",
    "Non-Fiction",
    "Science",
    "Mathematics",
    "Islamic Studies",
    "Arabic Literature",
    "English Literature",
    "History",
    "Geography",
    "Children",
    "Reference",
    "Other",
  ],
  conditions: ["excellent", "good", "fair", "poor", "damaged"],
};

export async function GET() {
  try {
    const doc = await adminDb.collection(COLLECTION).doc(DOC_ID).get();
    const data = doc.exists ? { ...DEFAULT_SETTINGS, ...doc.data() } : DEFAULT_SETTINGS;
    return NextResponse.json(data, { headers: CACHE_MEDIUM });
  } catch (err) {
    console.error("Library settings GET error:", err);
    return NextResponse.json(DEFAULT_SETTINGS, { headers: CACHE_MEDIUM });
  }
}

export async function POST(req: NextRequest) {
  const auth = await verifyAdmin(req);
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();
    const updates: Partial<LibrarySettings> = {};

    if (typeof body.default_loan_days === "number" && body.default_loan_days > 0)
      updates.default_loan_days = body.default_loan_days;
    if (typeof body.max_books_per_student === "number" && body.max_books_per_student > 0)
      updates.max_books_per_student = body.max_books_per_student;
    if (typeof body.overdue_fine_per_day === "number" && body.overdue_fine_per_day >= 0)
      updates.overdue_fine_per_day = body.overdue_fine_per_day;
    if (typeof body.lost_book_fee === "number" && body.lost_book_fee >= 0)
      updates.lost_book_fee = body.lost_book_fee;
    if (typeof body.grace_period_days === "number" && body.grace_period_days >= 0)
      updates.grace_period_days = body.grace_period_days;
    if (Array.isArray(body.categories))
      updates.categories = body.categories.filter((c: unknown) => typeof c === "string" && c.length > 0);
    if (Array.isArray(body.conditions))
      updates.conditions = body.conditions.filter((c: unknown) => typeof c === "string" && c.length > 0);

    await adminDb.collection(COLLECTION).doc(DOC_ID).set(updates, { merge: true });

    return NextResponse.json({ success: true, settings: { ...DEFAULT_SETTINGS, ...updates } });
  } catch (err) {
    console.error("Library settings POST error:", err);
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  }
}
