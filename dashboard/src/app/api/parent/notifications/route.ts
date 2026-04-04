import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { CACHE_PRIVATE } from "@/lib/cache-headers";

/**
 * GET /api/parent/notifications?studentNumbers=123,456
 * Returns notifications relevant to specific students (for parent portal).
 * Auto-generates from student_progress data.
 */
export async function GET(req: NextRequest) {
  const studentNumbers = req.nextUrl.searchParams
    .get("studentNumbers")
    ?.split(",")
    .filter(Boolean);

  if (!studentNumbers || studentNumbers.length === 0) {
    return NextResponse.json(
      { error: "studentNumbers query parameter is required" },
      { status: 400 }
    );
  }

  try {
    interface Notification {
      id: string;
      type: string;
      severity: "critical" | "warning" | "info";
      title: string;
      message: string;
      student_number: string;
      student_name: string;
      created_at: string;
    }

    const notifications: Notification[] = [];
    const now = new Date();
    const today = now.toISOString().slice(0, 10);

    for (const sn of studentNumbers) {
      const doc = await adminDb.collection("student_progress").doc(sn).get();
      if (!doc.exists) continue;

      const d = doc.data()!;
      const name = d.student_name || sn;

      // Get latest year
      const years = Object.keys(d.years || {}).sort();
      const latestYear = years[years.length - 1];
      const latestData = latestYear ? d.years[latestYear] : null;

      // ── Low grades ──
      if (latestData && latestData.overall_avg < 60) {
        notifications.push({
          id: `low-grade-${sn}`,
          type: "low-grade",
          severity: latestData.overall_avg < 50 ? "critical" : "warning",
          title: "Low Academic Performance",
          message: `${name} has an overall average of ${latestData.overall_avg}% in 20${latestYear}`,
          student_number: sn,
          student_name: name,
          created_at: today,
        });
      }

      // ── Failing subjects ──
      if (latestData?.subjects) {
        const failingSubjects = latestData.subjects.filter(
          (s: { grade: number; subject: string }) => s.grade < 50
        );
        if (failingSubjects.length > 0) {
          notifications.push({
            id: `failing-subjects-${sn}`,
            type: "low-grade",
            severity: "warning",
            title: "Failing Subjects",
            message: `${name} is failing ${failingSubjects.length} subject(s): ${failingSubjects
              .map((s: { subject: string }) => s.subject)
              .join(", ")}`,
            student_number: sn,
            student_name: name,
            created_at: today,
          });
        }
      }

      // ── Document expiry ──
      const checkExpiry = (
        docType: string,
        expiryField: string,
        expiredTitle: string,
        expiringTitle: string
      ) => {
        const expiry = d[expiryField];
        if (!expiry) return;
        const days = daysBetween(now, new Date(expiry));
        if (days < 0) {
          notifications.push({
            id: `${docType}-expired-${sn}`,
            type: "document-expired",
            severity: "critical",
            title: expiredTitle,
            message: `${name}'s ${docType} expired ${Math.abs(days)} days ago`,
            student_number: sn,
            student_name: name,
            created_at: today,
          });
        } else if (days <= 30) {
          notifications.push({
            id: `${docType}-expiring-${sn}`,
            type: "document-expiring",
            severity: "warning",
            title: expiringTitle,
            message: `${name}'s ${docType} expires in ${days} days`,
            student_number: sn,
            student_name: name,
            created_at: today,
          });
        }
      };

      checkExpiry("passport", "passport_expiry", "Passport Expired", "Passport Expiring Soon");
      checkExpiry("iqama", "iqama_expiry", "Iqama Expired", "Iqama Expiring Soon");

      // ── Attendance check ──
      const thirtyDaysAgo = new Date(now);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const thirtyDaysStr = thirtyDaysAgo.toISOString().slice(0, 10);

      const recentAbsences = await adminDb
        .collection("daily_attendance")
        .where("student_number", "==", sn)
        .where("status", "==", "absent")
        .where("date", ">=", thirtyDaysStr)
        .limit(50)
        .get();

      if (recentAbsences.size >= 3) {
        notifications.push({
          id: `excessive-absence-${sn}`,
          type: "absence",
          severity: recentAbsences.size >= 5 ? "critical" : "warning",
          title: "Excessive Absences",
          message: `${name} has been absent ${recentAbsences.size} times in the last 30 days`,
          student_number: sn,
          student_name: name,
          created_at: today,
        });
      }
    }

    // Sort by severity
    const severityOrder = { critical: 0, warning: 1, info: 2 };
    notifications.sort(
      (a, b) =>
        (severityOrder[a.severity] ?? 2) - (severityOrder[b.severity] ?? 2)
    );

    return NextResponse.json({
      notifications,
      total: notifications.length,
    }, { headers: CACHE_PRIVATE });
  } catch (err) {
    console.error("Parent notifications error:", err);
    return NextResponse.json(
      { error: "Failed to fetch notifications" },
      { status: 500 }
    );
  }
}

function daysBetween(from: Date, to: Date): number {
  const diff = to.getTime() - from.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}
