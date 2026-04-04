"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Bell,
  AlertTriangle,
  GraduationCap,
  FileWarning,
  CalendarX,
  Info,
  CheckCheck,
  ExternalLink,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useAcademicYear } from "@/context/academic-year-context";
import { useSchoolFilter } from "@/context/school-filter-context";

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

const typeIcons: Record<string, React.ElementType> = {
  absence: CalendarX,
  "low-grade": GraduationCap,
  "document-expired": FileWarning,
  "document-expiring": FileWarning,
  info: Info,
};

const severityColors: Record<string, string> = {
  critical: "border-l-red-500 bg-red-50 dark:bg-red-950/20",
  warning: "border-l-amber-500 bg-amber-50 dark:bg-amber-950/20",
  info: "border-l-blue-500 bg-blue-50 dark:bg-blue-950/20",
};

const severityIconColors: Record<string, string> = {
  critical: "text-red-500",
  warning: "text-amber-500",
  info: "text-blue-500",
};

const typeLabels: Record<string, string> = {
  absence: "Attendance",
  "low-grade": "Academics",
  "document-expired": "Documents",
  "document-expiring": "Documents",
  info: "General",
};

type FilterType = "all" | "absence" | "low-grade" | "documents" | "critical";

export default function NotificationsPage() {
  const { selectedYear } = useAcademicYear();
  const { schoolFilter } = useSchoolFilter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>("all");
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set("limit", "100");
      if (selectedYear) params.set("year", selectedYear);
      if (schoolFilter !== "all") params.set("school", schoolFilter);
      const res = await fetch(`/api/notifications?${params}`);
      if (!res.ok) return;
      const data = await res.json();
      setNotifications(data.notifications || []);
      setUnreadCount(data.unread_count || 0);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [selectedYear, schoolFilter]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const markAsRead = async (ids: string[]) => {
    try {
      await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      setNotifications((prev) =>
        prev.map((n) => (ids.includes(n.id) ? { ...n, read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - ids.length));
    } catch {
      // silent
    }
  };

  const markAllRead = async () => {
    const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
    if (unreadIds.length === 0) return;
    try {
      await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAllRead: true, ids: unreadIds }),
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch {
      // silent
    }
  };

  const filtered = notifications.filter((n) => {
    if (filter === "all") return true;
    if (filter === "absence") return n.type === "absence";
    if (filter === "low-grade") return n.type === "low-grade";
    if (filter === "documents")
      return n.type === "document-expired" || n.type === "document-expiring";
    if (filter === "critical") return n.severity === "critical";
    return true;
  });

  // Stats
  const stats = {
    total: notifications.length,
    critical: notifications.filter((n) => n.severity === "critical").length,
    attendance: notifications.filter((n) => n.type === "absence").length,
    academic: notifications.filter((n) => n.type === "low-grade").length,
    documents: notifications.filter(
      (n) => n.type === "document-expired" || n.type === "document-expiring"
    ).length,
  };

  const filters: { key: FilterType; label: string; count: number; color?: string }[] = [
    { key: "all", label: "All", count: stats.total },
    { key: "critical", label: "Critical", count: stats.critical, color: "text-red-600" },
    { key: "absence", label: "Attendance", count: stats.attendance },
    { key: "low-grade", label: "Academics", count: stats.academic },
    { key: "documents", label: "Documents", count: stats.documents },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bell className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
            <p className="text-sm text-muted-foreground">
              {unreadCount > 0
                ? `${unreadCount} unread notification${unreadCount !== 1 ? "s" : ""}`
                : "All caught up!"}
            </p>
          </div>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={markAllRead}>
            <CheckCheck className="mr-2 h-4 w-4" />
            Mark All Read
          </Button>
        )}
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <Button
            key={f.key}
            variant={filter === f.key ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(f.key)}
            className={cn(
              filter !== f.key && f.color
            )}
          >
            {f.label}
            <Badge
              variant="secondary"
              className={cn(
                "ml-2",
                filter === f.key && "bg-primary-foreground/20 text-primary-foreground"
              )}
            >
              {f.count}
            </Badge>
          </Button>
        ))}
      </div>

      {/* Notifications List */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {filter === "all"
              ? "All Notifications"
              : `${filters.find((f) => f.key === filter)?.label} Notifications`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
              <Bell className="h-12 w-12 opacity-20" />
              <p className="text-sm">No notifications in this category</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((n) => {
                const Icon = typeIcons[n.type] || Info;
                const link = n.student_number
                  ? `/dashboard/student/${n.student_number}`
                  : n.type === "document-expired" || n.type === "document-expiring"
                    ? "/dashboard/documents"
                    : undefined;

                return (
                  <div
                    key={n.id}
                    className={cn(
                      "flex items-start gap-4 rounded-lg border border-l-4 p-4 transition-colors",
                      severityColors[n.severity] || "",
                      n.read && "opacity-60"
                    )}
                  >
                    <Icon
                      className={cn(
                        "mt-0.5 h-5 w-5 flex-shrink-0",
                        severityIconColors[n.severity]
                      )}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold">{n.title}</p>
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1.5 py-0"
                        >
                          {typeLabels[n.type] || n.type}
                        </Badge>
                        {n.severity === "critical" && (
                          <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                        )}
                        {!n.read && (
                          <span className="h-2 w-2 rounded-full bg-primary flex-shrink-0" />
                        )}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {n.message}
                      </p>
                      {n.student_name && (
                        <p className="mt-1 text-xs text-muted-foreground/70">
                          Student: {n.student_name}
                          {n.student_number && ` (#${n.student_number})`}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {link && (
                        <Link
                          href={link}
                          className="text-xs text-primary hover:underline flex items-center gap-1"
                        >
                          View
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      )}
                      {!n.read && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => markAsRead([n.id])}
                        >
                          Mark read
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
