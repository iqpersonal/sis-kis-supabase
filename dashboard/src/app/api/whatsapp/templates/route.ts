import { NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/api-auth";
import { NextRequest } from "next/server";

export interface GupshupTemplate {
  id: string;           // UUID
  elementName: string;  // the name used when sending
  languageCode: string;
  category: string;
  status: string;
  data: string;         // body text (may contain {{1}}, {{2}}, …)
  paramCount: number;   // max param index found in body
}

/**
 * GET /api/whatsapp/templates
 * Fetches all approved WhatsApp templates from Gupshup.
 */
export async function GET(req: NextRequest) {
  const auth = await verifyAdmin(req);
  if (!auth.ok) return auth.response;

  const apiKey = process.env.GUPSHUP_API_KEY;
  const appId = process.env.GUPSHUP_APP_ID;

  if (!apiKey || !appId) {
    return NextResponse.json(
      { error: "Gupshup credentials not configured (GUPSHUP_API_KEY / GUPSHUP_APP_ID)" },
      { status: 503 }
    );
  }

  try {
    const res = await fetch(`https://api.gupshup.io/wa/app/${appId}/template`, {
      headers: { apikey: apiKey },
      // 10s timeout
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const body = await res.text();
      return NextResponse.json(
        { error: `Gupshup API error ${res.status}: ${body.slice(0, 200)}` },
        { status: 502 }
      );
    }

    const json = await res.json();
    const raw: Record<string, unknown>[] = json.templates || [];

    const templates: GupshupTemplate[] = raw.map((t) => {
      const body = String(t.data || "");
      const matches = [...body.matchAll(/\{\{(\d+)\}\}/g)];
      const paramCount = matches.length > 0
        ? Math.max(...matches.map((m) => parseInt(m[1])))
        : 0;
      return {
        id: String(t.id || ""),
        elementName: String(t.elementName || ""),
        languageCode: String(t.languageCode || ""),
        category: String(t.category || ""),
        status: String(t.status || ""),
        data: body,
        paramCount,
      };
    });

    // Sort: APPROVED first, then alphabetically
    templates.sort((a, b) => {
      if (a.status === "APPROVED" && b.status !== "APPROVED") return -1;
      if (a.status !== "APPROVED" && b.status === "APPROVED") return 1;
      return a.elementName.localeCompare(b.elementName);
    });

    return NextResponse.json({ templates });
  } catch (err) {
    console.error("Failed to fetch Gupshup templates:", err);
    return NextResponse.json({ error: "Failed to fetch templates" }, { status: 500 });
  }
}
