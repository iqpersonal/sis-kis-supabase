import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { CACHE_PRIVATE } from "@/lib/cache-headers";

function daysBetween(from: Date, to: Date): number {
  return Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

export async function GET(req: NextRequest) {
  const studentNumbers = req.nextUrl.searchParams.get("studentNumbers")?.split(",").filter(Boolean);
  if (!studentNumbers || studentNumbers.length === 0) {
    return NextResponse.json({ error: "studentNumbers query parameter is required" }, { status: 400 });
  }

  try {
    const supabase = createServiceClient();
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysStr = thirtyDaysAgo.toISOString().slice(0, 10);

    interface Notification {
      id: string; type: string; severity: "critical" | "warning" | "info";
      title: string; message: string; student_number: string; student_name: string; created_at: string;
    }
    const notifications: Notification[] = [];

    const { data: progressRows } = await supabase
      .from("student_progress")
      .select("student_number, student_name, overall_annual, overall_sem1, overall_sem2, passport_expiry, iqama_expiry, data")
      .in("student_number", studentNumbers);

    for (const row of progressRows ?? []) {
      const d = row as Record<string, unknown>;
      const sn = String(d["student_number"]);
      const name = String(d["student_name"] || sn);

      // Low overall average
      const avg = Number(d["overall_annual"] ?? d["overall_sem2"] ?? d["overall_sem1"] ?? 100);
      if (avg < 60) {
        notifications.push({ id: `low-grade-${sn}`, type: "low-grade", severity: avg < 50 ? "critical" : "warning", title: "Low Academic Performance", message: `${name} has an overall average of ${avg}%`, student_number: sn, student_name: name, created_at: today });
      }

      // Document expiry checks
      const checkExpiry = (docType: string, expiryField: string, expiredTitle: string, expiringTitle: string) => {
        const expiry = d[expiryField];
        if (!expiry) return;
        const days = daysBetween(now, new Date(String(expiry)));
        if (days < 0) {
          notifications.push({ id: `${docType}-expired-${sn}`, type: "document-expired", severity: "critical", title: expiredTitle, message: `${name}'s ${docType} expired ${Math.abs(days)} days ago`, student_number: sn, student_name: name, created_at: today });
        } else if (days <= 30) {
          notifications.push({ id: `${docType}-expiring-${sn}`, type: "document-expiring", severity: "warning", title: expiringTitle, message: `${name}'s ${docType} expires in ${days} days`, student_number: sn, student_name: name, created_at: today });
        }
      };
      checkExpiry("passport", "passport_expiry", "Passport Expired", "Passport Expiring Soon");
      checkExpiry("iqama", "iqama_expiry", "Iqama Expired", "Iqama Expiring Soon");
    }

    // Attendance checks — batch per student
    for (const sn of studentNumbers) {
      const { count } = await supabase.from("daily_attendance").select("*", { count: "exact", head: true }).eq("student_number", sn).eq("status", "absent").gte("date", thirtyDaysStr);
      if ((count ?? 0) >= 3) {
        const name = (progressRows ?? []).find((r) => (r as Record<string, unknown>)["student_number"] === sn) ? String(((progressRows ?? []).find((r) => (r as Record<string, unknown>)["student_number"] === sn) as Record<string, unknown>)["student_name"] || sn) : sn;
        notifications.push({ id: `excessive-absence-${sn}`, type: "absence", severity: (count ?? 0) >= 5 ? "critical" : "warning", title: "Excessive Absences", message: `${name} has been absent ${count} times in the last 30 days`, student_number: sn, student_name: name, created_at: today });
      }
    }

    const severityOrder: Record<string, number> = { critical: 0, warning: 1, info: 2 };
    notifications.sort((a, b) => (severityOrder[a.severity] ?? 2) - (severityOrder[b.severity] ?? 2));

    return NextResponse.json({ notifications, total: notifications.length }, { headers: CACHE_PRIVATE });
  } catch (err) {
    console.error("Parent notifications error:", err);
    return NextResponse.json({ error: "Failed to generate notifications" }, { status: 500 });
  }
}
