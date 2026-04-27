import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { CACHE_SHORT } from "@/lib/cache-headers";
import { verifyAuth } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

interface Notification {
  id: string;
  type: "absence" | "low-grade" | "document-expired" | "document-expiring" | "info" | "store_low_stock" | "store_out_of_stock";
  severity: "critical" | "warning" | "info";
  title: string;
  message: string;
  student_number?: string;
  student_name?: string;
  store_type?: "general" | "it";
  created_at: string;
  read: boolean;
}

let autoNotifCache: { data: Notification[]; ts: number; year?: string; school?: string } | null = null;
const CACHE_TTL = 30 * 60 * 1000;

function daysBetween(from: Date, to: Date): number {
  return Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth.ok) return auth.response;

  const supabase = createServiceClient();
  const limitParam = parseInt(req.nextUrl.searchParams.get("limit") || "100");
  const unreadOnly = req.nextUrl.searchParams.get("unreadOnly") === "true";
  const yearParam = req.nextUrl.searchParams.get("year");
  const schoolParam = req.nextUrl.searchParams.get("school");

  try {
    const notifications: Notification[] = [];
    const now = new Date();
    const today = now.toISOString().slice(0, 10);

    const { data: userRow } = await supabase.from("admin_users").select("secondary_roles").eq("id", auth.uid).maybeSingle();
    const secondaryRoles: string[] = Array.isArray((userRow as Record<string,unknown>|null)?.secondary_roles) ? ((userRow as Record<string,unknown>).secondary_roles as string[]) : [];
    const roleSet = new Set<string>([auth.role, ...secondaryRoles]);

    // 1. Persisted admin notifications
    try {
      const { data: persisted } = await supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(50);
      for (const d of persisted ?? []) {
        const row = d as Record<string,unknown>;
        if (unreadOnly && row.read) continue;
        notifications.push({ id: String(row.id), type: (row.type || "info") as Notification["type"], severity: (row.severity || "info") as Notification["severity"], title: String(row.title || ""), message: String(row.message || row.body || ""), student_number: row.student_number as string|undefined, student_name: row.student_name as string|undefined, created_at: String(row.created_at || ""), read: Boolean(row.read) });
      }
    } catch (e) { console.warn("Notifications: persisted query failed:", e); }

    // 2. Auto-generated (cached)
    const { data: autoReadRow } = await supabase.from("notification_reads").select("ids").eq("doc_id", "auto").maybeSingle();
    const readIds = new Set<string>(Array.isArray((autoReadRow as Record<string,unknown>|null)?.ids) ? ((autoReadRow as Record<string,unknown>).ids as string[]) : []);

    const cacheValid = autoNotifCache && Date.now() - autoNotifCache.ts < CACHE_TTL && autoNotifCache.year === (yearParam||undefined) && autoNotifCache.school === (schoolParam||undefined);

    if (cacheValid && autoNotifCache) {
      for (const n of autoNotifCache.data) { const isRead=readIds.has(n.id); if (unreadOnly && isRead) continue; notifications.push({ ...n, read: isRead }); }
    } else {
      const autoNotifs: Notification[] = [];

      // 2a. Document expiry
      try {
        const { data: progRows } = await supabase.from("student_progress").select("student_number, student_name, passport_expiry, iqama_expiry").limit(2000);
        for (const d of progRows ?? []) {
          const row = d as Record<string,unknown>;
          const sn = String(row.student_number || ""); const name = String(row.student_name || sn);
          for (const [field, prefix, label] of [["passport_expiry","passport","Passport"],["iqama_expiry","iqama","Iqama"]] as [string,string,string][]) {
            if (!row[field]) continue;
            const days = daysBetween(now, new Date(row[field] as string));
            if (days < 0) autoNotifs.push({ id: `${prefix}-expired-${sn}`, type: "document-expired", severity: "critical", title: `${label} Expired`, message: `${name}'s ${label.toLowerCase()} expired ${Math.abs(days)} days ago`, student_number: sn, student_name: name, created_at: today, read: false });
            else if (days <= 30) autoNotifs.push({ id: `${prefix}-expiring-${sn}`, type: "document-expiring", severity: "warning", title: `${label} Expiring Soon`, message: `${name}'s ${label.toLowerCase()} expires in ${days} days`, student_number: sn, student_name: name, created_at: today, read: false });
          }
        }
      } catch (e) { console.warn("Notifications: document expiry query failed:", e); }

      // 2b. Low grades
      try {
        const { data: progRows } = await supabase.from("student_progress").select("student_number, student_name, years").limit(500);
        for (const d of progRows ?? []) {
          const row = d as Record<string,unknown>;
          const sn = String(row.student_number || ""); const name = String(row.student_name || sn);
          const allYears = Object.keys((row.years as Record<string,unknown>) || {}).sort();
          const targetYear = yearParam || allYears[allYears.length - 1];
          const latestData = targetYear ? (row.years as Record<string,Record<string,unknown>>)?.[targetYear] : null;
          if (schoolParam && latestData?.school !== schoolParam) continue;
          if (yearParam && !(row.years as Record<string,unknown>)?.[yearParam]) continue;
          if (latestData && (latestData.overall_avg as number) < 60) autoNotifs.push({ id: `low-grade-${sn}`, type: "low-grade", severity: (latestData.overall_avg as number) < 50 ? "critical" : "warning", title: "Low Academic Performance", message: `${name} has an overall average of ${latestData.overall_avg} in ${targetYear}`, student_number: sn, student_name: name, created_at: today, read: false });
        }
      } catch (e) { console.warn("Notifications: grades query failed:", e); }

      // 2c. Excessive absences
      try {
        const thirtyDaysAgo = new Date(now); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const { data: absRows } = await supabase.from("daily_attendance").select("student_number, student_name").eq("status", "absent").gte("date", thirtyDaysAgo.toISOString().slice(0, 10)).limit(1000);
        const counts = new Map<string, { name: string; count: number }>();
        for (const d of absRows ?? []) { const row=d as Record<string,unknown>; const sn=String(row.student_number||""); const existing=counts.get(sn)||{name:String(row.student_name||sn),count:0}; existing.count++; counts.set(sn,existing); }
        for (const [sn, { name, count }] of counts) if (count >= 3) autoNotifs.push({ id: `excessive-absence-${sn}`, type: "absence", severity: count>=5?"critical":"warning", title: "Excessive Absences", message: `${name} has been absent ${count} times in the last 30 days`, student_number: sn, student_name: name, created_at: today, read: false });
      } catch (e) { console.warn("Notifications: attendance query failed:", e); }

      autoNotifCache = { data: autoNotifs, ts: Date.now(), year: yearParam||undefined, school: schoolParam||undefined };
      for (const n of autoNotifs) { const isRead=readIds.has(n.id); if (unreadOnly && isRead) continue; notifications.push({ ...n, read: isRead }); }
    }

    // 3. Store notifications
    try {
      const { data: storeReadRow } = await supabase.from("notification_reads").select("ids").eq("doc_id", `store_${auth.uid}`).maybeSingle();
      const storeReadIds = new Set<string>(Array.isArray((storeReadRow as Record<string,unknown>|null)?.ids) ? ((storeReadRow as Record<string,unknown>).ids as string[]) : []);
      const { data: storeNotifs } = await supabase.from("store_notifications").select("*").eq("source", "operational").order("created_at", { ascending: false }).limit(100);
      for (const d of storeNotifs ?? []) {
        const row = d as Record<string,unknown>;
        if (row.active === false) continue;
        const recipientRoles: string[] = Array.isArray(row.recipient_roles) ? row.recipient_roles as string[] : [];
        if (!recipientRoles.some((role) => roleSet.has(role))) continue;
        const isRead = storeReadIds.has(String(row.id));
        if (unreadOnly && isRead) continue;
        notifications.push({ id: `store:${row.id}`, type: (row.type||"info") as Notification["type"], severity: (row.severity||"info") as Notification["severity"], title: String(row.title||""), message: String(row.message||""), store_type: row.store_type==="it"?"it":"general", created_at: String(row.created_at||today), read: isRead });
      }
    } catch (e) { console.warn("Notifications: store query failed:", e); }

    const severityOrder: Record<string,number> = { critical: 0, warning: 1, info: 2 };
    notifications.sort((a, b) => { const sa=severityOrder[a.severity]??2, sb=severityOrder[b.severity]??2; if (sa!==sb) return sa-sb; return b.created_at.localeCompare(a.created_at); });

    return NextResponse.json({ notifications: notifications.slice(0, limitParam), total: notifications.length, unread_count: notifications.filter((n) => !n.read).length }, { headers: CACHE_SHORT });
  } catch (err) {
    console.error("Notifications error:", err);
    return NextResponse.json({ error: "Failed to fetch notifications" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth.ok) return auth.response;

  const supabase = createServiceClient();
  try {
    const body = await req.json();
    const inputIds: string[] = Array.isArray(body.ids) ? body.ids : [];
    const storeIds = inputIds.filter((id) => id.startsWith("store:")).map((id) => id.slice("store:".length));
    const ids = inputIds.filter((id) => !id.startsWith("store:"));

    if (body.markAllRead) {
      await supabase.from("notifications").update({ read: true }).eq("read", false);
      if (ids.length > 0) {
        const { data: existing } = await supabase.from("notification_reads").select("ids").eq("doc_id", "auto").maybeSingle();
        const currentIds: string[] = Array.isArray((existing as Record<string,unknown>|null)?.ids) ? ((existing as Record<string,unknown>).ids as string[]) : [];
        const merged = [...new Set([...currentIds, ...ids])];
        await supabase.from("notification_reads").upsert({ doc_id: "auto", ids: merged, updated_at: new Date().toISOString() });
      }
      if (storeIds.length > 0) {
        const { data: existing } = await supabase.from("notification_reads").select("ids").eq("doc_id", `store_${auth.uid}`).maybeSingle();
        const currentIds: string[] = Array.isArray((existing as Record<string,unknown>|null)?.ids) ? ((existing as Record<string,unknown>).ids as string[]) : [];
        const merged = [...new Set([...currentIds, ...storeIds])];
        await supabase.from("notification_reads").upsert({ doc_id: `store_${auth.uid}`, ids: merged, updated_at: new Date().toISOString() });
      }
      return NextResponse.json({ success: true });
    }

    if (ids.length === 0 && storeIds.length === 0) return NextResponse.json({ error: "ids required" }, { status: 400 });

    const autoIdPatterns = ["-expired-", "-expiring-", "low-grade-", "excessive-absence-", "passport-", "iqama-"];
    const persistedIds = ids.filter((id) => !autoIdPatterns.some((p) => id.includes(p)));
    const autoIds = ids.filter((id) => !persistedIds.includes(id));

    if (persistedIds.length > 0) await supabase.from("notifications").update({ read: true }).in("id", persistedIds);
    if (autoIds.length > 0) {
      const { data: existing } = await supabase.from("notification_reads").select("ids").eq("doc_id", "auto").maybeSingle();
      const currentIds: string[] = Array.isArray((existing as Record<string,unknown>|null)?.ids) ? ((existing as Record<string,unknown>).ids as string[]) : [];
      const merged = [...new Set([...currentIds, ...autoIds])];
      await supabase.from("notification_reads").upsert({ doc_id: "auto", ids: merged, updated_at: new Date().toISOString() });
    }
    if (storeIds.length > 0) {
      const { data: existing } = await supabase.from("notification_reads").select("ids").eq("doc_id", `store_${auth.uid}`).maybeSingle();
      const currentIds: string[] = Array.isArray((existing as Record<string,unknown>|null)?.ids) ? ((existing as Record<string,unknown>).ids as string[]) : [];
      const merged = [...new Set([...currentIds, ...storeIds])];
      await supabase.from("notification_reads").upsert({ doc_id: `store_${auth.uid}`, ids: merged, updated_at: new Date().toISOString() });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Notification POST error:", err);
    return NextResponse.json({ error: "Failed to update notifications" }, { status: 500 });
  }
}
