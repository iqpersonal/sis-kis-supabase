import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";

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
  const supabase = createServiceClient();
  try {
    const { token } = await params;
    const { otp } = await req.json();

    if (!otp || typeof otp !== "string") {
      return NextResponse.json({ error: "otp_required", message: "OTP is required" }, { status: 400 });
    }

    const { data: tokenDoc } = await supabase
      .from("contact_update_tokens")
      .select("*")
      .eq("id", token)
      .maybeSingle();

    if (!tokenDoc) {
      return NextResponse.json({ error: "invalid_token", message: "Invalid link" }, { status: 404 });
    }

    const td = tokenDoc as Record<string, unknown>;

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
      const { error: attemptErr } = await supabase
        .from("contact_update_tokens")
        .update({ otp_attempts: attempts })
        .eq("id", token);
      if (attemptErr) throw attemptErr;
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
    const { error: verifyErr } = await supabase
      .from("contact_update_tokens")
      .update({ verified: true, otp: null, otp_expires_at: null })
      .eq("id", token);
    if (verifyErr) throw verifyErr;

    // Fetch family data for the form
    const { data: family } = await supabase
      .from("families")
      .select("*")
      .eq("family_number", String(td.family_number || ""))
      .maybeSingle();

    if (!family) {
      return NextResponse.json({ error: "family_not_found", message: "Family not found" }, { status: 404 });
    }

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
