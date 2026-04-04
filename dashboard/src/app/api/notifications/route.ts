import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { CACHE_SHORT } from "@/lib/cache-headers";
import { verifyAuth } from "@/lib/api-auth";

/**
 * GET /api/notifications?limit=50&unreadOnly=true
 *   → Returns notifications, auto-generated from:
 *     - Excessive absences (≥5 days in current year)
 *     - Low grades (overall avg < 60)
 *     - Expired / expiring documents
 *
 * POST /api/notifications
 *   → Mark notification(s) as read
 *   Body: { ids: string[] } or { markAllRead: true }
 */

interface Notification {
  id: string;
  type: "absence" | "low-grade" | "document-expired" | "document-expiring" | "info";
  severity: "critical" | "warning" | "info";
  title: string;
  message: string;
  student_number?: string;
  student_name?: string;
  created_at: string;
  read: boolean;
}

// ── In-memory cache for auto-generated notifications (30-min TTL) ──
let autoNotifCache: { data: Notification[]; ts: number; year?: string; school?: string } | null = null;
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

function invalidateNotifCache() {
  autoNotifCache = null;
}

// ── GET ────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const limitParam = parseInt(req.nextUrl.searchParams.get("limit") || "100");
  const unreadOnly = req.nextUrl.searchParams.get("unreadOnly") === "true";
  const yearParam = req.nextUrl.searchParams.get("year");
  const schoolParam = req.nextUrl.searchParams.get("school"); // "0021-01" or "0021-02"

  try {
    const notifications: Notification[] = [];
    const now = new Date();
    const today = now.toISOString().slice(0, 10);

    // ── 1. Check for persisted (manually created) notifications ──
    try {
      const persistedSnap = await adminDb
        .collection("notifications")
        .orderBy("created_at", "desc")
        .limit(50)
        .get();

      for (const doc of persistedSnap.docs) {
        const d = doc.data();
        if (unreadOnly && d.read) continue;
        notifications.push({
          id: doc.id,
          type: d.type || "info",
          severity: d.severity || "info",
          title: d.title || "",
          message: d.message || "",
          student_number: d.student_number,
          student_name: d.student_name,
          created_at: d.created_at || "",
          read: d.read || false,
        });
      }
    } catch (e) {
      console.warn("Notifications: persisted query failed (index may be needed):", e);
    }

    // ── 2. Auto-generate from student_progress data (CACHED) ──
    const readIds = new Set<string>();

    try {
      const readSnap = await adminDb
        .collection("notification_reads")
        .doc("auto")
        .get();
      if (readSnap.exists) {
        const readData = readSnap.data()?.ids || [];
        for (const rid of readData) readIds.add(rid);
      }
    } catch {
      // notification_reads doc may not exist yet
    }

    // Use cached auto-generated notifications if fresh and same params
    const cacheValid = autoNotifCache
      && Date.now() - autoNotifCache.ts < CACHE_TTL
      && autoNotifCache.year === (yearParam || undefined)
      && autoNotifCache.school === (schoolParam || undefined);

    if (cacheValid && autoNotifCache) {
      for (const n of autoNotifCache.data) {
        const isRead = readIds.has(n.id);
        if (unreadOnly && isRead) continue;
        notifications.push({ ...n, read: isRead });
      }
    } else {
      // Re-scan and rebuild cache
      const autoNotifs: Notification[] = [];

      // ── 2a. Document expiry check (lightweight – no years field) ──
      try {
        const expirySnap = await adminDb
          .collection("student_progress")
          .select("student_number", "student_name", "passport_expiry", "iqama_expiry")
          .limit(2000)
          .get();

        for (const doc of expirySnap.docs) {
          const d = doc.data();
          const sn = d.student_number || doc.id;
          const name = d.student_name || sn;

          const passportExpiry = d.passport_expiry;
          const iqamaExpiry = d.iqama_expiry;

          if (passportExpiry) {
            const days = daysBetween(now, new Date(passportExpiry));
            if (days < 0) {
              autoNotifs.push({
                id: `passport-expired-${sn}`,
                type: "document-expired",
                severity: "critical",
                title: "Passport Expired",
                message: `${name}'s passport expired ${Math.abs(days)} days ago`,
                student_number: sn,
                student_name: name,
                created_at: today,
                read: false,
              });
            } else if (days <= 30) {
              autoNotifs.push({
                id: `passport-expiring-${sn}`,
                type: "document-expiring",
                severity: "warning",
                title: "Passport Expiring Soon",
                message: `${name}'s passport expires in ${days} days`,
                student_number: sn,
                student_name: name,
                created_at: today,
                read: false,
              });
            }
          }

          if (iqamaExpiry) {
            const days = daysBetween(now, new Date(iqamaExpiry));
            if (days < 0) {
              autoNotifs.push({
                id: `iqama-expired-${sn}`,
                type: "document-expired",
                severity: "critical",
                title: "Iqama Expired",
                message: `${name}'s iqama expired ${Math.abs(days)} days ago`,
                student_number: sn,
                student_name: name,
                created_at: today,
                read: false,
              });
            } else if (days <= 30) {
              autoNotifs.push({
                id: `iqama-expiring-${sn}`,
                type: "document-expiring",
                severity: "warning",
                title: "Iqama Expiring Soon",
                message: `${name}'s iqama expires in ${days} days`,
                student_number: sn,
                student_name: name,
                created_at: today,
                read: false,
              });
            }
          }
        }
      } catch (e) {
        console.warn("Notifications: document expiry query failed:", e);
      }

      // ── 2b. Low grades check (heavier – needs years field, smaller batch) ──
      try {
        const progressSnap = await adminDb
          .collection("student_progress")
          .select("student_number", "student_name", "years")
          .limit(500)
          .get();

      for (const doc of progressSnap.docs) {
        const d = doc.data();
        const sn = d.student_number || doc.id;
        const name = d.student_name || sn;

        const allYears = Object.keys(d.years || {}).sort();
        const targetYear = yearParam || allYears[allYears.length - 1];
        const latestData = targetYear ? d.years?.[targetYear] : null;

        if (schoolParam && latestData?.school !== schoolParam) continue;
        if (yearParam && !d.years?.[yearParam]) continue;

        if (latestData && latestData.overall_avg < 60) {
          autoNotifs.push({
            id: `low-grade-${sn}`,
            type: "low-grade",
            severity: latestData.overall_avg < 50 ? "critical" : "warning",
            title: "Low Academic Performance",
            message: `${name} has an overall average of ${latestData.overall_avg} in ${targetYear}`,
            student_number: sn,
            student_name: name,
            created_at: today,
            read: false,
          });
        }
      }
      } catch (e) {
        console.warn("Notifications: student_progress grades query failed:", e);
      }

      // ── 3. Check recent daily attendance for excessive absences ──
      try {
      const thirtyDaysAgo = new Date(now);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const thirtyDaysStr = thirtyDaysAgo.toISOString().slice(0, 10);

      const recentAbsences = await adminDb
        .collection("daily_attendance")
        .where("status", "==", "absent")
        .where("date", ">=", thirtyDaysStr)
        .limit(1000)
        .get();

      const absenceCounts = new Map<string, { name: string; count: number }>();
      for (const doc of recentAbsences.docs) {
        const d = doc.data();
        const sn = d.student_number;
        const existing = absenceCounts.get(sn) || {
          name: d.student_name || sn,
          count: 0,
        };
        existing.count++;
        absenceCounts.set(sn, existing);
      }

      for (const [sn, { name, count }] of absenceCounts) {
        if (count >= 3) {
          autoNotifs.push({
            id: `excessive-absence-${sn}`,
            type: "absence",
            severity: count >= 5 ? "critical" : "warning",
            title: "Excessive Absences",
            message: `${name} has been absent ${count} times in the last 30 days`,
            student_number: sn,
            student_name: name,
            created_at: today,
            read: false,
          });
        }
      }
      } catch (e) {
        console.warn("Notifications: daily_attendance query failed (composite index may be needed):", e);
      }

      // Store in cache (keyed by year/school params)
      autoNotifCache = { data: autoNotifs, ts: Date.now(), year: yearParam || undefined, school: schoolParam || undefined };

      // Apply read status and unreadOnly filter
      for (const n of autoNotifs) {
        const isRead = readIds.has(n.id);
        if (unreadOnly && isRead) continue;
        notifications.push({ ...n, read: isRead });
      }
    }

    // Sort by severity then date
    const severityOrder = { critical: 0, warning: 1, info: 2 };
    notifications.sort((a, b) => {
      const sa = severityOrder[a.severity] ?? 2;
      const sb = severityOrder[b.severity] ?? 2;
      if (sa !== sb) return sa - sb;
      return b.created_at.localeCompare(a.created_at);
    });

    // Limit
    const limited = notifications.slice(0, limitParam);
    const unreadCount = notifications.filter((n) => !n.read).length;

    return NextResponse.json({
      notifications: limited,
      total: notifications.length,
      unread_count: unreadCount,
    }, { headers: CACHE_SHORT });
  } catch (err) {
    console.error("Notifications error:", err);
    return NextResponse.json(
      { error: "Failed to fetch notifications" },
      { status: 500 }
    );
  }
}

// ── POST ───────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();

    if (body.markAllRead) {
      // Mark all auto-generated as read
      const snap = await adminDb
        .collection("notifications")
        .where("read", "==", false)
        .get();

      const batch = adminDb.batch();
      for (const doc of snap.docs) {
        batch.update(doc.ref, { read: true });
      }

      // Also mark auto-generated notifications as read
      // Store all known auto-generated IDs
      const autoIds: string[] = body.ids || [];
      if (autoIds.length > 0) {
        const autoRef = adminDb.collection("notification_reads").doc("auto");
        const existing = await autoRef.get();
        const currentIds: string[] = existing.exists
          ? existing.data()?.ids || []
          : [];
        const merged = [...new Set([...currentIds, ...autoIds])];
        batch.set(autoRef, { ids: merged, updated_at: new Date().toISOString() });
      }

      await batch.commit();
      return NextResponse.json({ success: true });
    }

    // Mark specific IDs as read
    const { ids } = body as { ids: string[] };
    if (!ids || ids.length === 0) {
      return NextResponse.json({ error: "ids required" }, { status: 400 });
    }

    const batch = adminDb.batch();

    // For persisted notifications
    const persistedIds = ids.filter((id) => !id.includes("-expired-") && !id.includes("-expiring-") && !id.startsWith("low-grade-") && !id.startsWith("excessive-absence-") && !id.startsWith("passport-") && !id.startsWith("iqama-"));
    for (const id of persistedIds) {
      const ref = adminDb.collection("notifications").doc(id);
      batch.update(ref, { read: true });
    }

    // For auto-generated notifications, store read status
    const autoIds = ids.filter((id) => !persistedIds.includes(id));
    if (autoIds.length > 0) {
      const autoRef = adminDb.collection("notification_reads").doc("auto");
      const existing = await autoRef.get();
      const currentIds: string[] = existing.exists
        ? existing.data()?.ids || []
        : [];
      const merged = [...new Set([...currentIds, ...autoIds])];
      batch.set(autoRef, {
        ids: merged,
        updated_at: new Date().toISOString(),
      });
    }

    await batch.commit();
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Notification POST error:", err);
    return NextResponse.json(
      { error: "Failed to update notifications" },
      { status: 500 }
    );
  }
}

/* ── Helpers ── */

function daysBetween(from: Date, to: Date): number {
  const diff = to.getTime() - from.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}
