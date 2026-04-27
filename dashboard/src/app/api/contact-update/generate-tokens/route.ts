import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
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
  const supabase = createServiceClient();

  try {
    const { audience, audience_filter } = await req.json();

    if (!audience) {
      return NextResponse.json({ error: "audience is required" }, { status: 400 });
    }

    // Collect families based on audience
    const families = await collectFamilies(supabase, audience, audience_filter);

    if (families.length === 0) {
      return NextResponse.json({ error: "No families found for the selected audience" }, { status: 404 });
    }

    // Generate tokens in batches of 400
    const tokens: { family_number: string; token: string; father_phone: string; mother_phone: string; father_name: string }[] = [];

    for (let i = 0; i < families.length; i += 400) {
      const chunk = families.slice(i, i + 400);
      const tokenRows: Record<string, unknown>[] = [];

      for (const fam of chunk) {
        const token = crypto.randomUUID();
        tokenRows.push({
          id: token,
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

      const { error: tokenErr } = await supabase.from("contact_update_tokens").insert(tokenRows);
      if (tokenErr) throw tokenErr;
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
  supabase: ReturnType<typeof createServiceClient>,
  audience: string,
  filter?: Record<string, unknown>
): Promise<FamilyInfo[]> {
  const familyMap = new Map<string, FamilyInfo>();

  if (audience === "school" && filter?.school) {
    const { data: regRows } = await supabase
      .from("registrations")
      .select("School_Code, school_code, Family_Number, family_number")
      .or(`School_Code.eq.${String(filter.school)},school_code.eq.${String(filter.school)}`)
      .limit(10000);
    const familyNumbers = new Set<string>();
    (regRows || []).forEach((row) => {
      const d = row as Record<string, unknown>;
      const fn = d.Family_Number || d.family_number;
      if (fn) familyNumbers.add(String(fn));
    });
    await fetchFamilies(supabase, [...familyNumbers], familyMap);
  } else if (audience === "class" && filter?.school) {
    const targets = (filter.targets as { class: string; section?: string }[]) || [];
    const familyNumbers = new Set<string>();
    for (const target of targets) {
      let q = supabase
        .from("registrations")
        .select("Family_Number, family_number")
        .or(`School_Code.eq.${String(filter.school)},school_code.eq.${String(filter.school)}`)
        .or(`Class_Code.eq.${String(target.class)},class_code.eq.${String(target.class)}`)
        .limit(10000);
      if (target.section) {
        q = q.or(`Section_Code.eq.${String(target.section)},section_code.eq.${String(target.section)}`);
      }
      const { data: rows } = await q;
      (rows || []).forEach((row) => {
        const d = row as Record<string, unknown>;
        const fn = d.Family_Number || d.family_number;
        if (fn) familyNumbers.add(String(fn));
      });
    }
    await fetchFamilies(supabase, [...familyNumbers], familyMap);
  } else {
    // "all"
    const { data: rows } = await supabase
      .from("families")
      .select("family_number, father_phone, mother_phone, father_name")
      .limit(10000);
    (rows || []).forEach((d) => {
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
  supabase: ReturnType<typeof createServiceClient>,
  familyNumbers: string[],
  map: Map<string, FamilyInfo>
) {
  for (let i = 0; i < familyNumbers.length; i += 30) {
    const chunk = familyNumbers.slice(i, i + 30);
    const { data: rows } = await supabase
      .from("families")
      .select("family_number, father_phone, mother_phone, father_name")
      .in("family_number", chunk);
    (rows || []).forEach((d) => {
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
