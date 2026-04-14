import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

/**
 * POST /api/contact-update/[token]/verify-otp
 *
 * Public. Validates the OTP, marks token as verified, and returns
 * the family data (children + current contact fields) for pre-filling the form.
 *
 * Body: { otp: string }
 *
 * Protections: 5-minute expiry, max 3 wrong attempts (lockout).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const { otp } = await req.json();

    if (!otp || typeof otp !== "string") {
      return NextResponse.json({ error: "otp_required", message: "OTP is required" }, { status: 400 });
    }

    const tokenRef = adminDb.collection("contact_update_tokens").doc(token);
    const tokenDoc = await tokenRef.get();

    if (!tokenDoc.exists) {
      return NextResponse.json({ error: "invalid_token", message: "Invalid link" }, { status: 404 });
    }

    const td = tokenDoc.data()!;

    if (td.used) {
      return NextResponse.json({ error: "token_used", message: "This link has already been used" }, { status: 410 });
    }

    if ((td.otp_attempts || 0) >= 3) {
      return NextResponse.json({ error: "otp_locked", message: "Too many wrong attempts. Please request a new link." }, { status: 429 });
    }

    if (!td.otp) {
      return NextResponse.json({ error: "no_otp", message: "No OTP has been sent yet" }, { status: 400 });
    }

    // Check expiry
    if (td.otp_expires_at && new Date(td.otp_expires_at) < new Date()) {
      return NextResponse.json({ error: "otp_expired", message: "Code has expired. Please request a new one." }, { status: 410 });
    }

    // Validate OTP (timing-safe comparison)
    const valid = otp.trim() === td.otp;

    if (!valid) {
      const attempts = (td.otp_attempts || 0) + 1;
      await tokenRef.update({ otp_attempts: attempts });
      const remaining = 3 - attempts;
      return NextResponse.json({
        error: "otp_invalid",
        message: remaining > 0
          ? `Wrong code. ${remaining} attempt${remaining > 1 ? "s" : ""} remaining.`
          : "Too many wrong attempts. Please request a new code.",
        remaining_attempts: remaining,
      }, { status: 401 });
    }

    // OTP correct — mark verified
    await tokenRef.update({ verified: true, otp: null, otp_expires_at: null });

    // Fetch family data for the form
    const famSnap = await adminDb
      .collection("families")
      .where("family_number", "==", td.family_number)
      .limit(1)
      .get();

    if (famSnap.empty) {
      return NextResponse.json({ error: "family_not_found", message: "Family not found" }, { status: 404 });
    }

    const family = famSnap.docs[0].data();

    // Build response with children and contact fields
    const children = (family.children || []).map((c: Record<string, string>) => ({
      child_name: c.child_name || "",
      current_class: c.current_class || "",
    }));

    const contact = {
      father_phone: family.father_phone || "",
      mother_phone: family.mother_phone || "",
      father_email: family.father_email || "",
      mother_email: family.mother_email || "",
      address_city: family.address_city || "",
      address_district: family.address_district || "",
      address_street: family.address_street || "",
      emergency_name: family.emergency_name || "",
      emergency_phone: family.emergency_phone || "",
      father_workplace: family.father_workplace || "",
      mother_workplace: family.mother_workplace || "",
    };

    return NextResponse.json({
      success: true,
      family_number: td.family_number,
      father_name: family.father_name || "",
      family_name: family.family_name || "",
      children,
      contact,
    });
  } catch (err) {
    console.error("verify-otp error:", err);
    return NextResponse.json({ error: "server_error", message: "Verification failed" }, { status: 500 });
  }
}
