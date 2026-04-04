import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { CACHE_SHORT } from "@/lib/cache-headers";

export async function GET() {
  try {
    const snap = await adminDb.collection("system").doc("sync_status").get();
    if (!snap.exists) {
      return NextResponse.json({ data: null }, { headers: CACHE_SHORT });
    }
    return NextResponse.json({ data: snap.data() }, { headers: CACHE_SHORT });
  } catch (err) {
    console.error("Failed to fetch sync status:", err);
    return NextResponse.json({ error: "Failed to fetch sync status" }, { status: 500 });
  }
}
