import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { createServiceClient } from "@/lib/supabase-server";

function extractToken(req: NextRequest): string | null {
  const h = req.headers.get("authorization");
  if (h?.startsWith("Bearer ")) return h.slice(7);
  return null;
}

export async function GET(req: NextRequest) {
  const token = extractToken(req);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { await adminAuth.verifyIdToken(token); } catch { return NextResponse.json({ error: "Invalid token" }, { status: 401 }); }

  const target = req.nextUrl.searchParams.get("target");
  const now = new Date().toISOString();
  const supabase = createServiceClient();

  try {
    const { data } = await supabase.from("announcements").select("*").eq("is_active", true).order("created_at", { ascending: false }).limit(50);
    const announcements = (data ?? []).filter((a: Record<string, unknown>) => {
      if (a.expires_at && (a.expires_at as string) < now) return false;
      if (target && target !== "all") return a.target === "all" || a.target === target;
      return true;
    });
    return NextResponse.json({ announcements });
  } catch (err) {
    console.error("Announcements fetch error:", err);
    return NextResponse.json({ announcements: [] });
  }
}

export async function POST(req: NextRequest) {
  const token = extractToken(req);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let decoded;
  try { decoded = await adminAuth.verifyIdToken(token); } catch { return NextResponse.json({ error: "Invalid token" }, { status: 401 }); }

  const supabase = createServiceClient();
  const { data: adminRow } = await supabase.from("admin_users").select("name").eq("id", decoded.uid).maybeSingle();
  if (!adminRow) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { title, content, target, priority, expires_at } = body;
  if (!title || !content) return NextResponse.json({ error: "Title and content are required" }, { status: 400 });

  const { data: newRow } = await supabase.from("announcements").insert({ title, body: content, author_name: (adminRow as Record<string,unknown>).name || decoded.email || "Admin", author_uid: decoded.uid, target: target || "all", priority: priority || "normal", is_active: true, created_at: new Date().toISOString(), expires_at: expires_at || null }).select("id").maybeSingle();
  return NextResponse.json({ id: (newRow as Record<string,unknown>|null)?.id, success: true }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const token = extractToken(req);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let decoded;
  try { decoded = await adminAuth.verifyIdToken(token); } catch { return NextResponse.json({ error: "Invalid token" }, { status: 401 }); }

  const supabase = createServiceClient();
  const { data: adminRow } = await supabase.from("admin_users").select("id").eq("id", decoded.uid).maybeSingle();
  if (!adminRow) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { announcementId, title, content, target, priority, expires_at } = body;
  if (!announcementId) return NextResponse.json({ error: "announcementId is required" }, { status: 400 });

  const { data: existing } = await supabase.from("announcements").select("id").eq("id", announcementId).maybeSingle();
  if (!existing) return NextResponse.json({ error: "Announcement not found" }, { status: 404 });

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (title !== undefined) updates.title = title;
  if (content !== undefined) updates.body = content;
  if (target !== undefined) updates.target = target;
  if (priority !== undefined) updates.priority = priority;
  if (expires_at !== undefined) updates.expires_at = expires_at;

  await supabase.from("announcements").update(updates).eq("id", announcementId);
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const token = extractToken(req);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let decoded;
  try { decoded = await adminAuth.verifyIdToken(token); } catch { return NextResponse.json({ error: "Invalid token" }, { status: 401 }); }

  const supabase = createServiceClient();
  const { data: adminRow } = await supabase.from("admin_users").select("id").eq("id", decoded.uid).maybeSingle();
  if (!adminRow) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { announcementId } = body;
  if (!announcementId) return NextResponse.json({ error: "announcementId is required" }, { status: 400 });

  await supabase.from("announcements").update({ is_active: false, updated_at: new Date().toISOString() }).eq("id", announcementId);
  return NextResponse.json({ success: true });
}
