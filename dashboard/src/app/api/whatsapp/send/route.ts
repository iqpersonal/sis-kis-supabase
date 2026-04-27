import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { sendTemplate, sendText, normalizePhone, WhatsAppError, isWhatsAppConfigured } from "@/lib/whatsapp";
import { logAudit } from "@/lib/audit";
import { verifyAdmin } from "@/lib/api-auth";

export async function POST(req: NextRequest) {
  const auth = await verifyAdmin(req);
  if (!auth.ok) return auth.response;

  const supabase = createServiceClient();
  try {
    const data = await req.json();
    const { mode, audience, audience_filter, sender, templateName, templateId, languageCode, components, text } = data;

    if (!mode || !audience || !sender) return NextResponse.json({ error: "mode, audience, and sender are required" }, { status: 400 });
    if (mode === "template" && !templateName) return NextResponse.json({ error: "templateName is required for template mode" }, { status: 400 });
    if (mode === "text" && !text) return NextResponse.json({ error: "text is required for text mode" }, { status: 400 });

    const recipient = audience_filter?.recipient || "father";
    const phones = await collectPhones(supabase, audience, audience_filter, recipient);
    if (phones.length === 0) return NextResponse.json({ error: "No phone numbers found for the selected audience" }, { status: 404 });

    let sent = 0, failed = 0;
    const errors: { phone: string; error: string }[] = [];

    for (const phone of phones) {
      try {
        if (mode === "template") await sendTemplate({ to: phone, templateName, templateId, languageCode: languageCode || "ar", components: components || [] });
        else await sendText({ to: phone, text });
        sent++;
      } catch (err) {
        failed++;
        errors.push({ phone, error: err instanceof WhatsAppError ? err.message : "Unknown error" });
      }
    }

    await supabase.from("whatsapp_messages").insert({ mode, templateName: templateName||null, templateId: templateId||null, text: text||null, audience, audience_filter: audience_filter||{}, sender, total_recipients: phones.length, sent, failed, created_at: new Date().toISOString() });

    await logAudit({ actor: sender, action: "whatsapp.send", details: `Sent WhatsApp ${mode} to ${sent}/${phones.length} recipients (audience: ${audience})`, targetType: "whatsapp_message" });

    return NextResponse.json({ success: true, configured: isWhatsAppConfigured(), total: phones.length, sent, failed, errors });
  } catch (err) {
    console.error("WhatsApp send error:", err);
    return NextResponse.json({ error: "Failed to send WhatsApp messages" }, { status: 500 });
  }
}

type SB = ReturnType<typeof createServiceClient>;

async function collectPhones(supabase: SB, audience: string, filter?: Record<string,unknown>, recipient: string = "father"): Promise<string[]> {
  const phones = new Set<string>();

  if (audience === "manual" && Array.isArray(filter?.phones)) {
    for (const raw of filter.phones as string[]) { const n = normalizePhone(String(raw).trim()); if (n.length >= 12) phones.add(n); }
  } else if (audience === "family" && filter?.family_number) {
    const { data } = await supabase.from("families").select("*").eq("family_number", String(filter.family_number)).limit(1);
    (data ?? []).forEach((d) => addFamilyPhones(d as Record<string,unknown>, phones, recipient));
  } else if (audience === "school" && filter?.school) {
    const { data: regRows } = await supabase.from("registrations").select('"Family_Number"').eq("School_Code", filter.school);
    const familyNumbers = [...new Set((regRows ?? []).map((r) => String((r as Record<string,unknown>)["Family_Number"] || "")).filter(Boolean))];
    await fetchFamilyPhones(supabase, familyNumbers, phones, recipient);
  } else if (audience === "class" && filter?.school) {
    const targets = (filter.targets as { class: string; section?: string }[]) || [];
    const familySet = new Set<string>();
    for (const target of targets) {
      let q = supabase.from("registrations").select('"Family_Number"').eq("School_Code", filter.school).eq("Class_Code", target.class);
      if (target.section) q = q.eq("Section_Code", target.section);
      const { data: rows } = await q;
      (rows ?? []).forEach((r) => { const fn = String((r as Record<string,unknown>)["Family_Number"] || ""); if (fn) familySet.add(fn); });
    }
    await fetchFamilyPhones(supabase, [...familySet], phones, recipient);
  } else {
    const { data } = await supabase.from("families").select("*").limit(10000);
    (data ?? []).forEach((d) => addFamilyPhones(d as Record<string,unknown>, phones, recipient));
  }

  return [...phones];
}

function addFamilyPhones(data: Record<string,unknown>, set: Set<string>, recipient: string = "father") {
  const fields = recipient === "father" ? ["father_phone"] : recipient === "mother" ? ["mother_phone"] : ["father_phone", "mother_phone"];
  for (const field of fields) {
    const raw = data[field];
    if (raw && typeof raw === "string" && raw.trim().length >= 9) { const n = normalizePhone(raw.trim()); if (n.length >= 12) set.add(n); }
  }
}

async function fetchFamilyPhones(supabase: SB, familyNumbers: string[], phones: Set<string>, recipient: string = "father") {
  for (let i = 0; i < familyNumbers.length; i += 200) {
    const chunk = familyNumbers.slice(i, i + 200);
    const { data } = await supabase.from("families").select("father_phone, mother_phone").in("family_number", chunk);
    (data ?? []).forEach((d) => addFamilyPhones(d as Record<string,unknown>, phones, recipient));
  }
}
