import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";

/**
 * GET /api/contact-update/[token]/validate
 *
 * Public. Validates the token and returns family data for the form.
 * Marks the token as verified (bypassing OTP).
 * The token UUID itself serves as the authentication secret.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const supabase = createServiceClient();
  try {
    const { token } = await params;

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

    // Mark as verified
    const { error: verifyErr } = await supabase
      .from("contact_update_tokens")
      .update({ verified: true })
      .eq("id", token);
    if (verifyErr) throw verifyErr;

    // Fetch family data
    const { data: family } = await supabase
      .from("families")
      .select("*")
      .eq("family_number", String(td.family_number || ""))
      .maybeSingle();

    if (!family) {
      return NextResponse.json({ error: "family_not_found", message: "Family not found" }, { status: 404 });
    }

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
    console.error("validate error:", err);
    return NextResponse.json({ error: "server_error", message: "Validation failed" }, { status: 500 });
  }
}
