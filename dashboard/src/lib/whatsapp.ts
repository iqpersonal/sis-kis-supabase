/**
 * WhatsApp via Gupshup API — helper functions.
 * Used by server-side API routes only.
 *
 * ⚠️  TO ACTIVATE: Set GUPSHUP_API_KEY and GUPSHUP_SOURCE_PHONE
 *     in your .env.local file. Until then, messages will be recorded in
 *     Firestore but NOT actually delivered via WhatsApp.
 */

const GUPSHUP_API = "https://api.gupshup.io/wa/api/v1";

/** Returns config if Gupshup API credentials are set, null otherwise. */
function getConfig(): { apiKey: string; sourcePhone: string; appName: string } | null {
  const apiKey = process.env.GUPSHUP_API_KEY;
  const sourcePhone = process.env.GUPSHUP_SOURCE_PHONE;
  const appName = process.env.GUPSHUP_APP_NAME || "kisapp";
  if (!apiKey || !sourcePhone) return null;
  return { apiKey, sourcePhone, appName };
}

/** True when the API env vars are filled in. */
export function isWhatsAppConfigured(): boolean {
  return getConfig() !== null;
}

/* ─── Types ─── */

export interface TemplateComponent {
  type: "header" | "body" | "button";
  parameters: { type: string; text?: string; image?: { link: string } }[];
}

export interface SendTemplateParams {
  to: string; // E.164 format, e.g. "+966501234567"
  templateName: string;
  templateId?: string; // Gupshup template UUID — use this when available; more reliable than elementName
  languageCode?: string; // default "ar"
  components?: TemplateComponent[];
}

export interface SendTextParams {
  to: string;
  text: string;
}

export interface WhatsAppApiResponse {
  messaging_product: string;
  contacts: { input: string; wa_id: string }[];
  messages: { id: string }[];
}

/* ─── Public helpers ─── */

/**
 * Send a pre-approved template message (required for business-initiated chats).
 */
export async function sendTemplate(
  params: SendTemplateParams
): Promise<WhatsAppApiResponse> {
  const config = getConfig();
  if (!config) {
    return { messaging_product: "whatsapp", contacts: [{ input: params.to, wa_id: params.to }], messages: [{ id: "not-configured" }] };
  }
  const { apiKey, sourcePhone, appName } = config;
  const { to, templateName, templateId, languageCode = "ar", components } = params;
  const dest = normalizePhone(to).replace("+", "");

  // Extract template parameters from components
  const templateParams: string[] = [];
  if (components?.length) {
    for (const comp of components) {
      for (const param of comp.parameters || []) {
        if (param.text) templateParams.push(param.text);
      }
    }
  }

  // Prefer UUID over element name — Gupshup reliably accepts UUID; element name causes 4003
  const templateObj: Record<string, unknown> = {
    id: templateId || templateName,
    params: templateParams,
  };

  const formBody = new URLSearchParams({
    source: sourcePhone,
    destination: dest,
    template: JSON.stringify(templateObj),
    "src.name": appName,
  });

  // 10-second timeout to prevent hanging if Gupshup API is slow
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  let res: Response;
  try {
    res = await fetch(`${GUPSHUP_API}/template/msg`, {
      method: "POST",
      headers: {
        apikey: apiKey,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formBody.toString(),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  const data = await res.json();
  if (!res.ok || data.status === "error") {
    throw new WhatsAppError(
      data.message || data.reason || JSON.stringify(data),
      res.status
    );
  }

  return {
    messaging_product: "whatsapp",
    contacts: [{ input: to, wa_id: dest }],
    messages: [{ id: data.messageId || data.id || "sent" }],
  };
}

/**
 * Send a free-form text message (only works within the 24-hour customer-service window).
 */
export async function sendText(
  params: SendTextParams
): Promise<WhatsAppApiResponse> {
  const config = getConfig();
  if (!config) {
    return { messaging_product: "whatsapp", contacts: [{ input: params.to, wa_id: params.to }], messages: [{ id: "not-configured" }] };
  }
  const { apiKey, sourcePhone, appName } = config;
  const { to, text } = params;
  const dest = normalizePhone(to).replace("+", "");

  const message = JSON.stringify({ type: "text", text });

  const formBody = new URLSearchParams({
    channel: "whatsapp",
    source: sourcePhone,
    destination: dest,
    message,
    "src.name": appName,
  });

  // 10-second timeout to prevent hanging if Gupshup API is slow
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  let res: Response;
  try {
    res = await fetch(`${GUPSHUP_API}/msg`, {
      method: "POST",
      headers: {
        apikey: apiKey,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formBody.toString(),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  const data = await res.json();
  if (!res.ok || data.status === "error") {
    throw new WhatsAppError(
      data.message || data.reason || JSON.stringify(data),
      res.status
    );
  }

  return {
    messaging_product: "whatsapp",
    contacts: [{ input: to, wa_id: dest }],
    messages: [{ id: data.messageId || data.id || "sent" }],
  };
}

/* ─── Utilities ─── */

/** Strip spaces/dashes, normalize Saudi numbers, return digits only (no +). */
export function normalizePhone(phone: string): string {
  let cleaned = phone.replace(/[\s\-()]/g, "");
  if (!cleaned.startsWith("+")) cleaned = "+" + cleaned;
  // Saudi numbers: convert 05x → +9665x
  if (cleaned.startsWith("+05")) cleaned = "+966" + cleaned.slice(2);
  if (cleaned.startsWith("+5") && cleaned.length === 10)
    cleaned = "+966" + cleaned.slice(1);
  return cleaned;
}

/** Custom error class for WhatsApp API failures. */
export class WhatsAppError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "WhatsAppError";
    this.status = status;
  }
}
