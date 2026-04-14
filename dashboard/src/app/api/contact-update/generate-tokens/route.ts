import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { verifyAdmin } from "@/lib/api-auth";
import { normalizePhone } from "@/lib/whatsapp";
import crypto from "crypto";

/**
 * POST /api/contact-update/generate-tokens
 *
 * Admin-only. Generates a unique token per family for the contact-update form.
 * Reuses the same audience logic as the WhatsApp send route.
 *
 * Body: { audience: "all"|"school"|"class", audience_filter?: { school?, targets? } }
 * Returns: { tokens: [{ family_number, token, father_phone, mother_phone, father_name }] }
 */
export async function POST(req: NextRequest) {
  const auth = await verifyAdmin(req);
  if (!auth.ok) return auth.response;

  try {
    const { audience, audience_filter } = await req.json();

    if (!audience) {
      return NextResponse.json({ error: "audience is required" }, { status: 400 });
    }

    // Collect families based on audience
    const families = await collectFamilies(audience, audience_filter);

    if (families.length === 0) {
      return NextResponse.json({ error: "No families found for the selected audience" }, { status: 404 });
    }

    // Generate tokens in batches of 400
    const tokens: { family_number: string; token: string; father_phone: string; mother_phone: string; father_name: string }[] = [];

    for (let i = 0; i < families.length; i += 400) {
      const batch = adminDb.batch();
      const chunk = families.slice(i, i + 400);

      for (const fam of chunk) {
        const token = crypto.randomUUID();
        const ref = adminDb.collection("contact_update_tokens").doc(token);
        batch.set(ref, {
          family_number: fam.family_number,
          used: false,
          verified: false,
          otp: null,
          otp_expires_at: null,
          otp_attempts: 0,
          otp_sends: 0,
          created_at: new Date().toISOString(),
        });
        tokens.push({
          family_number: fam.family_number,
          token,
          father_phone: fam.father_phone,
          mother_phone: fam.mother_phone,
          father_name: fam.father_name,
        });
      }

      await batch.commit();
    }

    return NextResponse.json({ success: true, tokens, count: tokens.length });
  } catch (err) {
    console.error("generate-tokens error:", err);
    return NextResponse.json({ error: "Failed to generate tokens" }, { status: 500 });
  }
}

/* ─── Family Collection Logic (reused from WhatsApp send) ─── */

interface FamilyInfo {
  family_number: string;
  father_phone: string;
  mother_phone: string;
  father_name: string;
}

async function collectFamilies(
  audience: string,
  filter?: Record<string, unknown>
): Promise<FamilyInfo[]> {
  const familyMap = new Map<string, FamilyInfo>();

  if (audience === "school" && filter?.school) {
    const regSnap = await adminDb
      .collection("registrations")
      .where("School_Code", "==", filter.school)
      .get();
    const familyNumbers = new Set<string>();
    regSnap.docs.forEach((doc) => {
      const fn = doc.data().Family_Number;
      if (fn) familyNumbers.add(String(fn));
    });
    await fetchFamilies([...familyNumbers], familyMap);
  } else if (audience === "class" && filter?.school) {
    const targets = (filter.targets as { class: string; section?: string }[]) || [];
    const familyNumbers = new Set<string>();
    for (const target of targets) {
      let q: FirebaseFirestore.Query = adminDb
        .collection("registrations")
        .where("School_Code", "==", filter.school)
        .where("Class_Code", "==", target.class);
      if (target.section) {
        q = q.where("Section_Code", "==", target.section);
      }
      const snap = await q.get();
      snap.docs.forEach((doc) => {
        const fn = doc.data().Family_Number;
        if (fn) familyNumbers.add(String(fn));
      });
    }
    await fetchFamilies([...familyNumbers], familyMap);
  } else {
    // "all"
    const snap = await adminDb.collection("families").get();
    snap.docs.forEach((doc) => {
      const d = doc.data();
      if (d.family_number) {
        familyMap.set(d.family_number, {
          family_number: d.family_number,
          father_phone: d.father_phone || "",
          mother_phone: d.mother_phone || "",
          father_name: d.father_name || "",
        });
      }
    });
  }

  // Only include families with at least one valid phone
  return [...familyMap.values()].filter(
    (f) => hasValidPhone(f.father_phone) || hasValidPhone(f.mother_phone)
  );
}

function hasValidPhone(phone: string): boolean {
  if (!phone || phone.trim().length < 9) return false;
  const normalized = normalizePhone(phone.trim());
  return normalized.length >= 12;
}

async function fetchFamilies(
  familyNumbers: string[],
  map: Map<string, FamilyInfo>
) {
  for (let i = 0; i < familyNumbers.length; i += 30) {
    const chunk = familyNumbers.slice(i, i + 30);
    const snap = await adminDb
      .collection("families")
      .where("family_number", "in", chunk)
      .get();
    snap.docs.forEach((doc) => {
      const d = doc.data();
      if (d.family_number) {
        map.set(d.family_number, {
          family_number: d.family_number,
          father_phone: d.father_phone || "",
          mother_phone: d.mother_phone || "",
          father_name: d.father_name || "",
        });
      }
    });
  }
}
