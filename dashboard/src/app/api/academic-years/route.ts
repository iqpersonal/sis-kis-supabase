import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { CACHE_LONG } from "@/lib/cache-headers";

export async function GET() {
  try {
    const snap = await adminDb.collection("academic_years").get();
    const years = snap.docs
      .map((d) => String(d.data().Academic_Year ?? ""))
      .filter(Boolean)
      .sort();
    return NextResponse.json({ years }, { headers: CACHE_LONG });
  } catch (err) {
    console.error("Failed to fetch academic years:", err);
    return NextResponse.json({ error: "Failed to fetch academic years" }, { status: 500 });
  }
}
