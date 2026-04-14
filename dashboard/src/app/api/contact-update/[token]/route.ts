import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

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
  try {
    const { token } = await params;
    const { contact } = await req.json();

    if (!contact || typeof contact !== "object") {
      return NextResponse.json({ error: "invalid_body", message: "contact object is required" }, { status: 400 });
    }

    // Validate token
    const tokenRef = adminDb.collection("contact_update_tokens").doc(token);
    const tokenDoc = await tokenRef.get();

    if (!tokenDoc.exists) {
      return NextResponse.json({ error: "invalid_token", message: "Invalid link" }, { status: 404 });
    }

    const td = tokenDoc.data()!;

    if (td.used) {
      return NextResponse.json({ error: "token_used", message: "This link has already been used" }, { status: 410 });
    }

    if (!td.verified) {
      return NextResponse.json({ error: "not_verified", message: "OTP verification required" }, { status: 403 });
    }

    // Fetch current family data
    const famSnap = await adminDb
      .collection("families")
      .where("family_number", "==", td.family_number)
      .limit(1)
      .get();

    if (famSnap.empty) {
      return NextResponse.json({ error: "family_not_found", message: "Family not found" }, { status: 404 });
    }

    const famDoc = famSnap.docs[0];
    const oldData = famDoc.data();

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
    await famDoc.ref.update({
      ...newValues,
      contact_updated_at: new Date().toISOString(),
      contact_updated_via: "whatsapp_form",
    });

    // Write audit record
    await adminDb.collection("contact_updates").add({
      family_number: td.family_number,
      token,
      old_values: oldValues,
      new_values: newValues,
      changed_fields: changedFields,
      submitted_at: new Date().toISOString(),
      verified_phone: true,
    });

    // Mark token as used
    await tokenRef.update({ used: true, submitted_at: new Date().toISOString() });

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
