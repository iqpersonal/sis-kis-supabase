import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

/**
 * GET /api/staff-portal/announcements
 * Returns active announcements. Optionally filter by ?target=all|teachers|non-teaching
 *
 * POST /api/staff-portal/announcements
 * Creates a new announcement (admin only — must have admin_users doc)
 */

function extractToken(req: NextRequest): string | null {
  const h = req.headers.get("authorization");
  if (h?.startsWith("Bearer ")) return h.slice(7);
  return null;
}

export async function GET(req: NextRequest) {
  const token = extractToken(req);
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await adminAuth.verifyIdToken(token);
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const target = req.nextUrl.searchParams.get("target");
  const now = new Date().toISOString();

  try {
    const query = adminDb
      .collection("announcements")
      .where("is_active", "==", true)
      .orderBy("created_at", "desc")
      .limit(50);

    // Fetch all active then filter client-side (Firestore doesn't support OR on different fields easily)
    const snap = await query.get();

    const announcements = snap.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((a: Record<string, unknown>) => {
        // Filter expired
        if (a.expires_at && (a.expires_at as string) < now) return false;
        // Filter by target if specified
        if (target && target !== "all") {
          return a.target === "all" || a.target === target;
        }
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
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(token);
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  // Check admin role
  const adminSnap = await adminDb
    .collection("admin_users")
    .doc(decoded.uid)
    .get();
  if (!adminSnap.exists) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { title, content, target, priority, expires_at } = body;

  if (!title || !content) {
    return NextResponse.json(
      { error: "Title and content are required" },
      { status: 400 }
    );
  }

  const doc = {
    title,
    body: content,
    author_name: adminSnap.data()?.name || decoded.email || "Admin",
    author_uid: decoded.uid,
    target: target || "all",
    priority: priority || "normal",
    is_active: true,
    created_at: FieldValue.serverTimestamp(),
    expires_at: expires_at || null,
  };

  const ref = await adminDb.collection("announcements").add(doc);

  return NextResponse.json({ id: ref.id, success: true }, { status: 201 });
}

/**
 * PATCH /api/staff-portal/announcements
 * Updates an existing announcement (admin only)
 */
export async function PATCH(req: NextRequest) {
  const token = extractToken(req);
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(token);
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const adminSnap = await adminDb.collection("admin_users").doc(decoded.uid).get();
  if (!adminSnap.exists) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { announcementId, title, content, target, priority, expires_at } = body;

  if (!announcementId) {
    return NextResponse.json({ error: "announcementId is required" }, { status: 400 });
  }

  const ref = adminDb.collection("announcements").doc(announcementId);
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Announcement not found" }, { status: 404 });
  }

  const updates: Record<string, unknown> = {
    updated_at: FieldValue.serverTimestamp(),
  };
  if (title !== undefined) updates.title = title;
  if (content !== undefined) updates.body = content;
  if (target !== undefined) updates.target = target;
  if (priority !== undefined) updates.priority = priority;
  if (expires_at !== undefined) updates.expires_at = expires_at;

  await ref.update(updates);
  return NextResponse.json({ success: true });
}

/**
 * DELETE /api/staff-portal/announcements
 * Deactivates an announcement (admin only)
 */
export async function DELETE(req: NextRequest) {
  const token = extractToken(req);
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(token);
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const adminSnap = await adminDb.collection("admin_users").doc(decoded.uid).get();
  if (!adminSnap.exists) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { announcementId } = body;

  if (!announcementId) {
    return NextResponse.json({ error: "announcementId is required" }, { status: 400 });
  }

  const ref = adminDb.collection("announcements").doc(announcementId);
  await ref.update({ is_active: false, updated_at: FieldValue.serverTimestamp() });

  return NextResponse.json({ success: true });
}
