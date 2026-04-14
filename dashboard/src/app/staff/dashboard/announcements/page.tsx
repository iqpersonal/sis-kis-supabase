"use client";

import { useEffect, useState } from "react";
import { useStaffAuth } from "@/context/staff-auth-context";
import { getFirebaseAuth } from "@/lib/firebase";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Megaphone, AlertTriangle } from "lucide-react";
import type { Announcement } from "@/types/sis";

export default function StaffAnnouncementsPage() {
  const { staff } = useStaffAuth();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!staff) return;

    async function load() {
      try {
        const auth = getFirebaseAuth();
        const token = await auth.currentUser?.getIdToken();
        if (!token) return;

        const res = await fetch("/api/staff-portal/announcements", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setAnnouncements(data.announcements || []);
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [staff]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Megaphone className="h-6 w-6 text-blue-500" />
          Announcements
        </h1>
        <p className="text-muted-foreground">
          School-wide announcements and updates
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
        </div>
      ) : announcements.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No announcements at this time.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {announcements.map((a) => (
            <Card
              key={a.id}
              className={
                a.priority === "urgent"
                  ? "border-orange-500/50 bg-orange-50/50 dark:bg-orange-950/10"
                  : ""
              }
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    {a.priority === "urgent" && (
                      <AlertTriangle className="h-4 w-4 text-orange-500" />
                    )}
                    {a.title}
                  </CardTitle>
                  <div className="flex items-center gap-2 shrink-0">
                    {a.priority === "urgent" && (
                      <Badge variant="destructive" className="text-[10px]">
                        Urgent
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-[10px]">
                      {a.target === "all"
                        ? "All Staff"
                        : a.target === "teachers"
                          ? "Teachers"
                          : "Non-Teaching"}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">{a.body}</p>
                <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
                  <span>By {a.author_name}</span>
                  <span>•</span>
                  <span>
                    {a.created_at
                      ? new Date(a.created_at).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })
                      : "—"}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
