import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { sendTemplate, sendText, normalizePhone, WhatsAppError, isWhatsAppConfigured } from "@/lib/whatsapp";
import { logAudit } from "@/lib/audit";
import { FieldValue } from "firebase-admin/firestore";
import { verifyAdmin } from "@/lib/api-auth";

/**
 * POST /api/whatsapp/send
 *
 * Body:
 *   mode: "template" | "text"
 *   audience: "all" | "school" | "class" | "family"
 *   audience_filter?: { school?, targets?, family_number? }
 *   sender: string (email)
 *
 *   -- template mode --
 *   templateName: string
 *   languageCode?: string
 *   components?: TemplateComponent[]
 *
 *   -- text mode (24h window only) --
 *   text?: string
 */
export async function POST(req: NextRequest) {
  const auth = await verifyAdmin(req);
  if (!auth.ok) return auth.response;

  try {
    const data = await req.json();
    const {
      mode,
      audience,
      audience_filter,
      sender,
      templateName,
      languageCode,
      components,
      text,
    } = data;

    // ── Validation ──
    if (!mode || !audience || !sender) {
      return NextResponse.json(
        { error: "mode, audience, and sender are required" },
        { status: 400 }
      );
    }
    if (mode === "template" && !templateName) {
      return NextResponse.json(
        { error: "templateName is required for template mode" },
        { status: 400 }
      );
    }
    if (mode === "text" && !text) {
      return NextResponse.json(
        { error: "text is required for text mode" },
        { status: 400 }
      );
    }

    // ── Collect phone numbers from families ──
    const recipient = audience_filter?.recipient || "father";
    const phones = await collectPhones(audience, audience_filter, recipient);

    if (phones.length === 0) {
      return NextResponse.json(
        { error: "No phone numbers found for the selected audience" },
        { status: 404 }
      );
    }

    // ── Send messages ──
    let sent = 0;
    let failed = 0;
    const errors: { phone: string; error: string }[] = [];

    for (const phone of phones) {
      try {
        if (mode === "template") {
          await sendTemplate({
            to: phone,
            templateName,
            languageCode: languageCode || "ar",
            components: components || [],
          });
        } else {
          await sendText({ to: phone, text });
        }
        sent++;
      } catch (err) {
        failed++;
        const msg =
          err instanceof WhatsAppError ? err.message : "Unknown error";
        errors.push({ phone, error: msg });
      }
    }

    // ── Persist to Firestore for history ──
    await adminDb.collection("whatsapp_messages").add({
      mode,
      templateName: templateName || null,
      text: text || null,
      audience,
      audience_filter: audience_filter || {},
      sender,
      total_recipients: phones.length,
      sent,
      failed,
      created_at: FieldValue.serverTimestamp(),
    });

    // ── Audit ──
    await logAudit({
      actor: sender,
      action: "whatsapp.send",
      details: `Sent WhatsApp ${mode} to ${sent}/${phones.length} recipients (audience: ${audience})`,
      targetType: "whatsapp_message",
    });

    const configured = isWhatsAppConfigured();

    return NextResponse.json({ success: true, configured, total: phones.length, sent, failed, errors });
  } catch (err) {
    console.error("WhatsApp send error:", err);
    return NextResponse.json(
      { error: "Failed to send WhatsApp messages" },
      { status: 500 }
    );
  }
}

/* ─── Phone Collection ─── */

async function collectPhones(
  audience: string,
  filter?: Record<string, unknown>,
  recipient: string = "father"
): Promise<string[]> {
  const phones = new Set<string>();

  if (audience === "family" && filter?.family_number) {
    // Single family
    const snap = await adminDb
      .collection("families")
      .where("family_number", "==", String(filter.family_number))
      .limit(1)
      .get();
    snap.docs.forEach((doc) => addFamilyPhones(doc.data(), phones, recipient));
  } else if (audience === "school" && filter?.school) {
    // All families whose children are in a specific school
    const regSnap = await adminDb
      .collection("registrations")
      .where("School_Code", "==", filter.school)
      .get();
    const familyNumbers = new Set<string>();
    regSnap.docs.forEach((doc) => {
      const fn = doc.data().Family_Number;
      if (fn) familyNumbers.add(String(fn));
    });
    await fetchFamilyPhones([...familyNumbers], phones, recipient);
  } else if (audience === "class" && filter?.school) {
    // Families with children in specific classes/sections
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
    await fetchFamilyPhones([...familyNumbers], phones, recipient);
  } else {
    // "all" — every family with a phone
    const snap = await adminDb.collection("families").get();
    snap.docs.forEach((doc) => addFamilyPhones(doc.data(), phones, recipient));
  }

  return [...phones];
}

function addFamilyPhones(
  data: FirebaseFirestore.DocumentData,
  set: Set<string>,
  recipient: string = "father"
) {
  const fields =
    recipient === "father" ? ["father_phone"] :
    recipient === "mother" ? ["mother_phone"] :
    ["father_phone", "mother_phone"];

  for (const field of fields) {
    const raw = data[field];
    if (raw && typeof raw === "string" && raw.trim().length >= 9) {
      const normalized = normalizePhone(raw.trim());
      if (normalized.length >= 12) set.add(normalized);
    }
  }
}

async function fetchFamilyPhones(
  familyNumbers: string[],
  phones: Set<string>,
  recipient: string = "father"
) {
  // Firestore "in" supports up to 30 values per query
  for (let i = 0; i < familyNumbers.length; i += 30) {
    const chunk = familyNumbers.slice(i, i + 30);
    const snap = await adminDb
      .collection("families")
      .where("family_number", "in", chunk)
      .get();
    snap.docs.forEach((doc) => addFamilyPhones(doc.data(), phones, recipient));
  }
}
