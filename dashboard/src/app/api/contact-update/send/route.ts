import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { sendTemplate, normalizePhone, isWhatsAppConfigured } from "@/lib/whatsapp";
import { verifyAdmin } from "@/lib/api-auth";
import { logAudit } from "@/lib/audit";
import crypto from "crypto";

/**
 * POST /api/contact-update/send
 *
 * Admin-only orchestrator. Generates tokens for each family in the audience,
 * then sends a WhatsApp template message with the form link to both parents.
 *
 * Body: {
 *   audience: "all" | "school" | "class" | "family",
 *   audience_filter?: { school?, targets?: [{ class, section? }], family_number? },
 *   sender: string (admin email)
 * }
 */
export async function POST(req: NextRequest) {
  const auth = await verifyAdmin(req);
  if (!auth.ok) return auth.response;
  const supabase = createServiceClient();

  try {
    const { audience, audience_filter, sender } = await req.json();
    const recipient: string = audience_filter?.recipient || "father";

    if (!audience || !sender) {
      return NextResponse.json({ error: "audience and sender are required" }, { status: 400 });
    }

    // ── Step 1: Collect families ──
    const families = await collectFamilies(supabase, audience, audience_filter);

    if (families.length === 0) {
      return NextResponse.json(
        { error: "No families with valid phone numbers found for the selected audience. Please ensure the family has a valid father or mother phone number." },
        { status: 404 }
      );
    }

    // ── Step 2: Generate tokens ──
    const tokenMap: { family_number: string; token: string; phones: string[] }[] = [];

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

        // Collect valid phones for this family based on recipient filter
        const phones: string[] = [];
        const phoneSources =
          recipient === "father" ? [fam.father_phone] :
          recipient === "mother" ? [fam.mother_phone] :
          [fam.father_phone, fam.mother_phone];
        for (const raw of phoneSources) {
          if (raw && raw.trim().length >= 9) {
            const n = normalizePhone(raw.trim());
            if (n.length >= 12) phones.push(n);
          }
        }

        tokenMap.push({ family_number: fam.family_number, token, phones });
      }

      const { error: tokenErr } = await supabase.from("contact_update_tokens").insert(tokenRows);
      if (tokenErr) throw tokenErr;
    }

    // ── Step 3: Send WhatsApp template to each phone ──
    let sent = 0;
    let failed = 0;
    const errors: { phone: string; error: string }[] = [];

    for (const entry of tokenMap) {
      for (const phone of entry.phones) {
        try {
          await sendTemplate({
            to: phone,
            templateName: "23cf7f12-d2b2-436b-854d-6ae47ec10a14",
            languageCode: "en",
            components: [
              {
                type: "button",
                parameters: [{ type: "text", text: entry.token }],
              },
            ],
          });
          sent++;
        } catch (err) {
          failed++;
          errors.push({ phone, error: err instanceof Error ? err.message : "Unknown error" });
        }
      }
    }

    // ── Step 4: Log to Firestore ──
    const { error: waLogErr } = await supabase.from("whatsapp_messages").insert({
      mode: "template",
      templateName: "contact_update_request_1",
      templateId: "23cf7f12-d2b2-436b-854d-6ae47ec10a14",
      text: null,
      audience,
      audience_filter: audience_filter || {},
      sender,
      purpose: "contact_update",
      total_families: families.length,
      total_recipients: tokenMap.reduce((s, t) => s + t.phones.length, 0),
      sent,
      failed,
      created_at: new Date().toISOString(),
    });
    if (waLogErr) throw waLogErr;

    await logAudit({
      actor: sender,
      action: "contact_update.send",
      details: `Sent contact update requests to ${sent} phones across ${families.length} families (audience: ${audience})`,
      targetType: "contact_update",
    });

    return NextResponse.json({
      success: true,
      configured: isWhatsAppConfigured(),
      total_families: families.length,
      total_phones: tokenMap.reduce((s, t) => s + t.phones.length, 0),
      sent,
      failed,
      errors: errors.slice(0, 20), // Limit error details
    });
  } catch (err) {
    console.error("contact-update send error:", err);
    return NextResponse.json({ error: "Failed to send contact update requests" }, { status: 500 });
  }
}

/* ─── Family Collection (same logic as generate-tokens route) ─── */

interface FamilyInfo {
  family_number: string;
  father_phone: string;
  mother_phone: string;
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
    const fns = new Set<string>();
    (regRows || []).forEach((row) => {
      const d = row as Record<string, unknown>;
      const fn = d.Family_Number || d.family_number;
      if (fn) fns.add(String(fn));
    });
    await fetchFamilies(supabase, [...fns], familyMap);
  } else if (audience === "class" && filter?.school) {
    const targets = (filter.targets as { class: string; section?: string }[]) || [];
    const fns = new Set<string>();
    for (const target of targets) {
      let q = supabase
        .from("registrations")
        .select("Family_Number, family_number, Section_Code, section_code")
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
        if (fn) fns.add(String(fn));
      });
    }
    await fetchFamilies(supabase, [...fns], familyMap);
  } else if (audience === "family" && filter?.family_number) {
    const fn = String(filter.family_number);
    const { data: rows } = await supabase
      .from("families")
      .select("family_number, father_phone, mother_phone")
      .eq("family_number", fn)
      .limit(1);
    (rows || []).forEach((d) => {
      if (d.family_number) {
        familyMap.set(d.family_number, {
          family_number: d.family_number,
          father_phone: d.father_phone || "",
          mother_phone: d.mother_phone || "",
        });
      }
    });
  } else {
    const { data: rows } = await supabase
      .from("families")
      .select("family_number, father_phone, mother_phone")
      .limit(10000);
    (rows || []).forEach((d) => {
      if (d.family_number) {
        familyMap.set(d.family_number, {
          family_number: d.family_number,
          father_phone: d.father_phone || "",
          mother_phone: d.mother_phone || "",
        });
      }
    });
  }

  return [...familyMap.values()].filter(
    (f) => hasValidPhone(f.father_phone) || hasValidPhone(f.mother_phone)
  );
}

function hasValidPhone(phone: string): boolean {
  if (!phone || phone.trim().length < 9) return false;
  return normalizePhone(phone.trim()).length >= 12;
}

async function fetchFamilies(
  supabase: ReturnType<typeof createServiceClient>,
  fns: string[],
  map: Map<string, FamilyInfo>
) {
  for (let i = 0; i < fns.length; i += 30) {
    const chunk = fns.slice(i, i + 30);
    const { data: rows } = await supabase
      .from("families")
      .select("family_number, father_phone, mother_phone")
      .in("family_number", chunk);
    (rows || []).forEach((d) => {
      if (d.family_number) {
        map.set(d.family_number, {
          family_number: d.family_number,
          father_phone: d.father_phone || "",
          mother_phone: d.mother_phone || "",
        });
      }
    });
  }
}
