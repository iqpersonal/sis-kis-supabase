import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { CACHE_PRIVATE } from "@/lib/cache-headers";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const familyNumber = params.get("familyNumber");
  const school = params.get("school");
  const classCode = params.get("class");
  const section = params.get("section");

  if (!familyNumber) return NextResponse.json({ error: "familyNumber is required" }, { status: 400 });

  try {
    const supabase = createServiceClient();
    const { data: rows } = await supabase
      .from("messages")
      .select("id, title, body, sender, audience, audience_filter, read_by, created_at")
      .order("created_at", { ascending: false })
      .limit(50);

    interface MessageOut {
      id: string; title: string; body: string; sender: string;
      audience: string; created_at: string; read: boolean;
    }
    const messages: MessageOut[] = [];

    for (const row of rows ?? []) {
      const data = row as Record<string, unknown>;
      const audience = String(data["audience"] || "");
      const filter = (data["audience_filter"] as Record<string, unknown>) || {};

      let match = false;
      if (audience === "all") {
        match = true;
      } else if (audience === "school" && school) {
        match = String(filter["school"] || "") === school;
      } else if (audience === "class" && school && classCode) {
        match = String(filter["school"] || "") === school && String(filter["class"] || "") === classCode && (!filter["section"] || String(filter["section"]) === section);
      } else if (audience === "family") {
        match = String(filter["family_number"] || "") === String(familyNumber);
      }

      if (match) {
        const readBy: string[] = (data["read_by"] as string[]) || [];
        const createdAt = data["created_at"] ? String(data["created_at"]) : "";
        messages.push({ id: String(data["id"]), title: String(data["title"] || "Message"), body: String(data["body"] || ""), sender: String(data["sender"] || "School Admin"), audience, created_at: createdAt, read: readBy.includes(String(familyNumber)) });
      }
    }

    return NextResponse.json({ messages }, { headers: CACHE_PRIVATE });
  } catch (err) {
    console.error("Parent messages error:", err);
    return NextResponse.json({ error: "Failed to fetch messages" }, { status: 500 });
  }
}
