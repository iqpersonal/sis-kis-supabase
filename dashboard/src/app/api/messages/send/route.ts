import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { verifyAdmin } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await verifyAdmin(req);
  if (!auth.ok) return auth.response;

  try {
    const supabase = createServiceClient();
    const data = await req.json();
    const { title, body, audience, audience_filter, sender } = data;

    if (!title || !body || !audience || !sender) return NextResponse.json({ error: "title, body, audience, and sender are required" }, { status: 400 });

    const msgId = crypto.randomUUID();
    await supabase.from("messages").insert({ id: msgId, title, body, audience, audience_filter: audience_filter || {}, sender, read_by: [], created_at: new Date().toISOString() });

    // Collect push tokens
    let pushTokens: string[] = [];

    if (audience === "all") {
      const { data: rows } = await supabase.from("push_tokens").select("tokens");
      for (const row of rows ?? []) {
        const tokens = (row as Record<string, unknown>)["tokens"] as Array<{ token: string }>;
        tokens.forEach((t) => { if (t.token) pushTokens.push(t.token); });
      }
    } else if (audience === "school" && audience_filter?.school) {
      const { data: rows } = await supabase.from("push_tokens").select("tokens").eq("school", audience_filter.school);
      for (const row of rows ?? []) {
        const tokens = (row as Record<string, unknown>)["tokens"] as Array<{ token: string }>;
        tokens.forEach((t) => { if (t.token) pushTokens.push(t.token); });
      }
    } else if (audience === "class" && audience_filter?.school) {
      const targets: { class: string; section?: string }[] = audience_filter.targets || [];
      const classCodes = [...new Set(targets.map((t) => t.class))];
      for (const classCode of classCodes) {
        let q = supabase.from("push_tokens").select("tokens, section").eq("school", audience_filter.school).eq("class", classCode);
        const sectionsForClass = targets.filter((t) => t.class === classCode && t.section).map((t) => t.section!);
        if (sectionsForClass.length > 0) q = q.in("section", sectionsForClass);
        const { data: rows } = await q;
        for (const row of rows ?? []) {
          const tokens = (row as Record<string, unknown>)["tokens"] as Array<{ token: string }>;
          tokens.forEach((t) => { if (t.token) pushTokens.push(t.token); });
        }
      }
      pushTokens = [...new Set(pushTokens)];
    } else if (audience === "family" && audience_filter?.family_number) {
      const { data: rows } = await supabase.from("push_tokens").select("tokens").eq("family_number", String(audience_filter.family_number));
      for (const row of rows ?? []) {
        const tokens = (row as Record<string, unknown>)["tokens"] as Array<{ token: string }>;
        tokens.forEach((t) => { if (t.token) pushTokens.push(t.token); });
      }
    }

    let pushSent = 0;
    if (pushTokens.length > 0) {
      for (let i = 0; i < pushTokens.length; i += 100) {
        const chunk = pushTokens.slice(i, i + 100);
        const messages = chunk.map((token) => ({ to: token, sound: "default" as const, title, body: body.length > 200 ? body.slice(0, 197) + "..." : body, data: { messageId: msgId } }));
        const resp = await fetch("https://exp.host/--/api/v2/push/send", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(messages) });
        if (resp.ok) pushSent += chunk.length;
      }
    }

    return NextResponse.json({ success: true, messageId: msgId, pushTokensFound: pushTokens.length, pushSent });
  } catch (err) {
    console.error("Send message error:", err);
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
  }
}
