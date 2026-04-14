import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { sendText, normalizePhone } from "@/lib/whatsapp";

/**
 * POST /api/contact-update/[token]/send-otp
 *
 * Public. Generates a 6-digit OTP, stores it on the token doc,
 * and sends it via WhatsApp to both father & mother phone numbers.
 *
 * Rate-limited: max 3 OTP sends per token.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    const tokenRef = adminDb.collection("contact_update_tokens").doc(token);
    const tokenDoc = await tokenRef.get();

    if (!tokenDoc.exists) {
      return NextResponse.json({ error: "invalid_token", message: "Invalid link" }, { status: 404 });
    }

    const tokenData = tokenDoc.data()!;

    if (tokenData.used) {
      return NextResponse.json({ error: "token_used", message: "This link has already been used" }, { status: 410 });
    }

    if ((tokenData.otp_sends || 0) >= 3) {
      return NextResponse.json({ error: "otp_limit", message: "Maximum OTP sends reached" }, { status: 429 });
    }

    // Fetch family to get phone numbers
    const famSnap = await adminDb
      .collection("families")
      .where("family_number", "==", tokenData.family_number)
      .limit(1)
      .get();

    if (famSnap.empty) {
      return NextResponse.json({ error: "family_not_found", message: "Family not found" }, { status: 404 });
    }

    const family = famSnap.docs[0].data();

    // Generate 6-digit OTP
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutes

    // Store OTP on token doc
    await tokenRef.update({
      otp,
      otp_expires_at: expiresAt,
      otp_attempts: 0,
      otp_sends: (tokenData.otp_sends || 0) + 1,
    });

    // Send OTP via WhatsApp to both phones
    const phones: string[] = [];
    const maskedPhones: string[] = [];

    for (const field of ["father_phone", "mother_phone"] as const) {
      const raw = family[field];
      if (raw && typeof raw === "string" && raw.trim().length >= 9) {
        const normalized = normalizePhone(raw.trim());
        if (normalized.length >= 12) {
          phones.push(normalized);
          // Mask: show first 3 + **** + last 2
          const digits = normalized.replace(/\D/g, "");
          maskedPhones.push(
            digits.slice(0, 3) + "****" + digits.slice(-2)
          );
        }
      }
    }

    if (phones.length === 0) {
      return NextResponse.json({ error: "no_phones", message: "No valid phone numbers found" }, { status: 404 });
    }

    const otpMessage = `رمز التحقق الخاص بك: ${otp}\nYour verification code: ${otp}\n\nينتهي خلال 5 دقائق / Expires in 5 minutes`;

    // Send to all valid phones (fire-and-forget errors — we try all)
    const sendResults = await Promise.allSettled(
      phones.map((phone) => sendText({ to: phone, text: otpMessage }))
    );

    const sentCount = sendResults.filter((r) => r.status === "fulfilled").length;

    return NextResponse.json({
      success: true,
      masked_phones: maskedPhones,
      sent: sentCount,
      remaining_sends: 3 - ((tokenData.otp_sends || 0) + 1),
    });
  } catch (err) {
    console.error("send-otp error:", err);
    return NextResponse.json({ error: "server_error", message: "Failed to send OTP" }, { status: 500 });
  }
}
