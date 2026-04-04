/**
 * WhatsApp Business Cloud API — helper functions.
 * Used by server-side API routes only.
 *
 * ⚠️  TO ACTIVATE: Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID
 *     in your .env.local file. Until then, messages will be recorded in
 *     Firestore but NOT actually delivered via WhatsApp.
 */

const GRAPH_API = "https://graph.facebook.com/v21.0";

/** Returns config if WhatsApp API credentials are set, null otherwise. */
function getConfig(): { token: string; phoneNumberId: string } | null {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) return null;
  return { token, phoneNumberId };
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

export interface WhatsAppApiError {
  error: {
    message: string;
    type: string;
    code: number;
    error_subcode?: number;
    fbtrace_id: string;
  };
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
    // API not configured yet — return a stub so history still records
    return { messaging_product: "whatsapp", contacts: [{ input: params.to, wa_id: params.to }], messages: [{ id: "not-configured" }] };
  }
  const { token, phoneNumberId } = config;
  const { to, templateName, languageCode = "ar", components } = params;

  const body: Record<string, unknown> = {
    messaging_product: "whatsapp",
    to: normalizePhone(to),
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode },
      ...(components?.length ? { components } : {}),
    },
  };

  const res = await fetch(`${GRAPH_API}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok) throw new WhatsAppError(data as WhatsAppApiError, res.status);
  return data as WhatsAppApiResponse;
}

/**
 * Send a free-form text message (only works within the 24-hour customer-service window).
 */
export async function sendText(
  params: SendTextParams
): Promise<WhatsAppApiResponse> {
  const config = getConfig();
  if (!config) {
    // API not configured yet — return a stub so history still records
    return { messaging_product: "whatsapp", contacts: [{ input: params.to, wa_id: params.to }], messages: [{ id: "not-configured" }] };
  }
  const { token, phoneNumberId } = config;
  const { to, text } = params;

  const body = {
    messaging_product: "whatsapp",
    to: normalizePhone(to),
    type: "text",
    text: { preview_url: false, body: text },
  };

  const res = await fetch(`${GRAPH_API}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok) throw new WhatsAppError(data as WhatsAppApiError, res.status);
  return data as WhatsAppApiResponse;
}

/* ─── Utilities ─── */

/** Strip spaces/dashes and prepend + if missing. */
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
  code: number;
  subcode?: number;
  fbtraceId: string;

  constructor(data: WhatsAppApiError, status: number) {
    super(data.error.message);
    this.name = "WhatsAppError";
    this.status = status;
    this.code = data.error.code;
    this.subcode = data.error.error_subcode;
    this.fbtraceId = data.error.fbtrace_id;
  }
}
