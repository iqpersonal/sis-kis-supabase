import { NextResponse } from "next/server";
import { isWhatsAppConfigured } from "@/lib/whatsapp";

/** GET /api/whatsapp/status — check if WhatsApp API credentials are configured. */
export async function GET() {
  return NextResponse.json({ configured: isWhatsAppConfigured() });
}
