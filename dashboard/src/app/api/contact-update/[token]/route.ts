import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";

/**
 * POST /api/contact-update/[token]
 *
 * Public (token + verified = auth). Submits the contact update form.
 * Updates `families/{family_number}`, writes audit to `contact_updates`,
 * and marks the token as used.
 *
 * Body: { contact: { father_phone, mother_phone, father_email, mother_email,
 *                     address_city, address_district, address_street,
 *                     emergency_name, emergency_phone,
 *                     father_workplace, mother_workplace } }
 */

const ALLOWED_FIELDS = [
  "father_phone", "mother_phone",
  "father_email", "mother_email",
  "address_city", "address_district", "address_street",
  "emergency_name", "emergency_phone",
  "father_workplace", "mother_workplace",
] as const;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const supabase = createServiceClient();
  try {
    const { token } = await params;
    const { contact } = await req.json();

    if (!contact || typeof contact !== "object") {
      return NextResponse.json({ error: "invalid_body", message: "contact object is required" }, { status: 400 });
    }

    // Validate token
    const { data: tokenRow, error: tokenErr } = await supabase
      .from("contact_update_tokens")
      .select("*")
      .eq("id", token)
      .maybeSingle();

    if (tokenErr || !tokenRow) {
      return NextResponse.json({ error: "invalid_token", message: "Invalid link" }, { status: 404 });
    }

    const td = tokenRow as Record<string, unknown>;

    if (td.used) {
      return NextResponse.json({ error: "token_used", message: "This link has already been used" }, { status: 410 });
    }

    if (!td.verified) {
      return NextResponse.json({ error: "not_verified", message: "OTP verification required" }, { status: 403 });
    }

    // Fetch current family data
    const { data: famRow, error: famErr } = await supabase
      .from("families")
      .select("*")
      .eq("family_number", String(td.family_number || ""))
      .maybeSingle();

    if (famErr || !famRow) {
      return NextResponse.json({ error: "family_not_found", message: "Family not found" }, { status: 404 });
    }

    const oldData = famRow as Record<string, string>;

    // Build sanitized update — only allowed fields, trimmed strings
    const newValues: Record<string, string> = {};
    const oldValues: Record<string, string> = {};

    for (const field of ALLOWED_FIELDS) {
      const val = typeof contact[field] === "string" ? contact[field].trim() : "";
      newValues[field] = val;
      oldValues[field] = oldData[field] || "";
    }

    // Basic validation
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    for (const field of ["father_email", "mother_email"] as const) {
      if (newValues[field] && !emailRe.test(newValues[field])) {
        return NextResponse.json({ error: "invalid_email", message: `Invalid email: ${field}` }, { status: 400 });
      }
    }

    for (const field of ["father_phone", "mother_phone", "emergency_phone"] as const) {
      const digits = newValues[field].replace(/\D/g, "");
      if (newValues[field] && digits.length < 9) {
        return NextResponse.json({ error: "invalid_phone", message: `Phone too short: ${field}` }, { status: 400 });
      }
    }

    // Compute diff — only changed fields
    const changedFields: string[] = [];
    for (const field of ALLOWED_FIELDS) {
      if (newValues[field] !== oldValues[field]) {
        changedFields.push(field);
      }
    }

    // Update family doc
    const { error: famUpdateErr } = await supabase
      .from("families")
      .update({
      ...newValues,
      contact_updated_at: new Date().toISOString(),
      contact_updated_via: "whatsapp_form",
      })
      .eq("family_number", String(td.family_number || ""));
    if (famUpdateErr) throw famUpdateErr;

    // Write audit record
    const { error: auditErr } = await supabase.from("contact_updates").insert({
      family_number: td.family_number,
      token,
      old_values: oldValues,
      new_values: newValues,
      changed_fields: changedFields,
      submitted_at: new Date().toISOString(),
      verified_phone: true,
    });
    if (auditErr) throw auditErr;

    // Mark token as used
    const { error: tokenUpdateErr } = await supabase
      .from("contact_update_tokens")
      .update({ used: true, submitted_at: new Date().toISOString() })
      .eq("id", token);
    if (tokenUpdateErr) throw tokenUpdateErr;

    return NextResponse.json({
      success: true,
      changed_fields: changedFields,
      message: changedFields.length > 0
        ? `Updated ${changedFields.length} field(s)`
        : "No changes detected",
    });
  } catch (err) {
    console.error("contact-update submit error:", err);
    return NextResponse.json({ error: "server_error", message: "Failed to save updates" }, { status: 500 });
  }
}
