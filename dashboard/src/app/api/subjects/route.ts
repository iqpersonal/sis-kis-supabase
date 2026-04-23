import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export async function GET() {
  try {
    const snap = await adminDb
      .collection("subjects")
      .select("Subject_Code", "E_Subject_Name", "A_Subject_Name")
      .limit(2000)
      .get();

    const subjects = snap.docs
      .map((doc) => {
        const d = doc.data();
        return {
          Subject_Code: String(d.Subject_Code || doc.id || ""),
          E_Subject_Name: d.E_Subject_Name || "",
          A_Subject_Name: d.A_Subject_Name || "",
        };
      })
      .filter((s) => s.Subject_Code)
      .sort((a, b) =>
        (a.E_Subject_Name || a.A_Subject_Name || a.Subject_Code).localeCompare(
          b.E_Subject_Name || b.A_Subject_Name || b.Subject_Code,
        ),
      );

    return NextResponse.json({ subjects });
  } catch (err) {
    console.error("GET /api/subjects error:", err);
    return NextResponse.json({ error: "Failed to fetch subjects" }, { status: 500 });
  }
}
