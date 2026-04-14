import { NextRequest, NextResponse } from "next/server";
import { handleInboundMessage } from "@/lib/whatsapp-bot";

/**
 * GET  /api/whatsapp/webhook — Gupshup/Meta verification handshake
 * POST /api/whatsapp/webhook — Incoming Gupshup events → bot replies
 */

const VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || "sis-kis-whatsapp-verify";

/**
 * In-memory dedup cache — prevents duplicate replies when Gupshup retries.
 * Stores message IDs for 5 minutes. Safe because Cloud Functions instances
 * are reused across requests within their lifecycle.
 */
const recentMessages = new Map<string, number>();
const DEDUP_TTL = 5 * 60 * 1000; // 5 minutes

function isDuplicate(msgId: string): boolean {
  if (!msgId) return false;
  const now = Date.now();
  // Prune old entries (keep map small)
  if (recentMessages.size > 500) {
    for (const [k, ts] of recentMessages) {
      if (now - ts > DEDUP_TTL) recentMessages.delete(k);
    }
  }
  if (recentMessages.has(msgId)) return true;
  recentMessages.set(msgId, now);
  return false;
}

/* ── Verification (webhook setup) ── */
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

/* ── Incoming Gupshup events ── */
export async function POST(req: NextRequest) {
  const body = await req.json();

  // Gupshup sends { app, type, payload, ... }
  const eventType = body.type;

  if (eventType === "message" || eventType === "message-event") {
    const payload = body.payload;

    if (eventType === "message-event") {
      // Status updates (sent, delivered, read, failed)
      const status = payload?.type || "unknown";
      const dest = payload?.destination || "";
      const msgId = payload?.id || payload?.gsId || "";
      console.log(`[WA Status] id=${msgId} status=${status} destination=${dest}`);
      return NextResponse.json({ status: "ok" });
    }

    // Incoming message
    if (eventType === "message") {
      const from: string = payload?.source || payload?.sender?.phone || "";
      const msgType: string = payload?.type || "";
      const msgText: string = payload?.payload?.text || payload?.text || "";
      const msgId: string = payload?.id || payload?.msgid || "";

      console.log(`[WA Inbound] id=${msgId} from=${from} type=${msgType} text=${msgText}`);

      // Skip duplicate messages (Gupshup retries)
      if (isDuplicate(msgId)) {
        console.log(`[WA Bot] Duplicate message ${msgId} — skipping`);
        return NextResponse.json({ status: "ok" });
      }

      // Only handle text messages
      if (msgType === "text" && from && msgText) {
        try {
          await handleInboundMessage(from, msgText);
        } catch (err) {
          console.error(`[WA Bot] Error handling message from ${from}:`, err);
        }
      }
    }
  }

  return NextResponse.json({ status: "ok" });
}
