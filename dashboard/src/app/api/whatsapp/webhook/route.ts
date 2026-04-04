import { NextRequest, NextResponse } from "next/server";
import { handleInboundMessage } from "@/lib/whatsapp-bot";

/**
 * GET  /api/whatsapp/webhook — Meta verification handshake
 * POST /api/whatsapp/webhook — Incoming messages & status updates → bot replies
 */

const VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || "sis-kis-whatsapp-verify";

/* ── Verification (Meta sends a GET on setup) ── */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

/* ── Incoming events ── */
export async function POST(req: NextRequest) {
  const body = await req.json();

  // Meta always wraps in { object: "whatsapp_business_account", entry: [...] }
  if (body.object !== "whatsapp_business_account") {
    return NextResponse.json({ error: "Not a WhatsApp event" }, { status: 400 });
  }

  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field !== "messages") continue;
      const value = change.value;

      // Status updates (sent, delivered, read, failed)
      for (const status of value.statuses || []) {
        console.log(
          `[WA Status] id=${status.id} status=${status.status} recipient=${status.recipient_id}`
        );
      }

      // Incoming messages → route to bot
      for (const msg of value.messages || []) {
        const from: string = msg.from || "";
        const msgText: string = msg.text?.body || "";

        console.log(`[WA Inbound] from=${from} type=${msg.type} text=${msgText}`);

        // Only handle text messages
        if (msg.type === "text" && from && msgText) {
          // Fire-and-forget — don't block the 200 response to Meta
          handleInboundMessage(from, msgText).catch((err) =>
            console.error(`[WA Bot] Error handling message from ${from}:`, err)
          );
        }
      }
    }
  }

  // Meta expects 200 quickly
  return NextResponse.json({ status: "ok" });
}
