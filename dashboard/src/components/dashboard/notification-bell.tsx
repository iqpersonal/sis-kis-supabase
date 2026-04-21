"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Bell, AlertTriangle, GraduationCap, FileWarning, CalendarX, Info, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import Link from "next/link";

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

const typeIcons: Record<string, React.ElementType> = {
  absence: CalendarX,
  "low-grade": GraduationCap,
  "document-expired": FileWarning,
  "document-expiring": FileWarning,
  store_low_stock: Package,
  store_out_of_stock: Package,
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

export function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/notifications?limit=20");
      if (!res.ok) return;
      const data = await res.json();
      setNotifications(data.notifications || []);
      setUnreadCount(data.unread_count || 0);
    } catch {
      // silent fail
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on mount and every 5 minutes
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

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

  const getStudentLink = (n: Notification) => {
    if (n.student_number) return `/dashboard/student/${n.student_number}`;
    if (n.type === "document-expired" || n.type === "document-expiring")
      return "/dashboard/documents";
    return undefined;
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <Button
        variant="ghost"
        size="icon"
        className="relative h-9 w-9"
        onClick={() => setOpen(!open)}
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <Badge
            className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white border-0 hover:bg-red-500"
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </Badge>
        )}
      </Button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-96 rounded-lg border bg-card shadow-lg">
          {/* Header */}
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">Notifications</h3>
              {unreadCount > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {unreadCount} new
                </Badge>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs text-primary hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* Notification List */}
          <div className="max-h-96 overflow-y-auto">
            {loading && notifications.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
                <Bell className="h-8 w-8 opacity-30" />
                <p className="text-sm">No notifications</p>
              </div>
            ) : (
              notifications.map((n) => {
                const isStoreNotif = n.type === "store_low_stock" || n.type === "store_out_of_stock";
                const Icon = isStoreNotif ? Package : (typeIcons[n.type] || Info);
                const link = isStoreNotif
                  ? (n.store_type === "it" ? "/dashboard/it-store" : "/dashboard/general-store")
                  : getStudentLink(n);

                const handleClick = () => {
                  if (!n.read) markAsRead([n.id]);
                  setOpen(false);
                };

                const content = (
                  <>
                    <Icon
                      className={cn(
                        "mt-0.5 h-4 w-4 flex-shrink-0",
                        severityIconColors[n.severity] || "text-muted-foreground"
                      )}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium leading-tight">
                          {n.title}
                        </p>
                        {!n.read && (
                          <span className="flex-shrink-0 h-2 w-2 rounded-full bg-primary" />
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                        {n.message}
                      </p>
                    </div>
                    {n.severity === "critical" && (
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-red-500" />
                    )}
                  </>
                );

                const itemClass = cn(
                  "flex cursor-pointer items-start gap-3 border-b border-l-4 px-4 py-3 transition-colors hover:bg-muted/50 last:border-b-0",
                  severityColors[n.severity] || "",
                  n.read && "opacity-60"
                );

                return link ? (
                  <Link
                    key={n.id}
                    href={link}
                    onClick={handleClick}
                    className={itemClass}
                  >
                    {content}
                  </Link>
                ) : (
                  <div
                    key={n.id}
                    onClick={handleClick}
                    className={itemClass}
                  >
                    {content}
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="border-t px-4 py-2">
              <Link
                href="/dashboard/notifications"
                onClick={() => setOpen(false)}
                className="block text-center text-xs text-primary hover:underline"
              >
                View all notifications
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
