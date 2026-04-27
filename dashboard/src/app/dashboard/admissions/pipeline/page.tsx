"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Phone, Mail, GripVertical, User } from "lucide-react";

/* ── Kanban columns ── */
const COLUMNS = [
  { id: "new", label: "New", color: "border-t-blue-500 bg-blue-50/50 dark:bg-blue-950/20" },
  { id: "contacted", label: "Contacted", color: "border-t-cyan-500 bg-cyan-50/50 dark:bg-cyan-950/20" },
  { id: "test_scheduled", label: "Test Scheduled", color: "border-t-amber-500 bg-amber-50/50 dark:bg-amber-950/20" },
  { id: "test_done", label: "Test Done", color: "border-t-purple-500 bg-purple-50/50 dark:bg-purple-950/20" },
  { id: "interview_scheduled", label: "Interview Scheduled", color: "border-t-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/20" },
  { id: "interview_done", label: "Interview Done", color: "border-t-violet-500 bg-violet-50/50 dark:bg-violet-950/20" },
  { id: "offer_sent", label: "Offer Sent", color: "border-t-orange-500 bg-orange-50/50 dark:bg-orange-950/20" },
  { id: "accepted", label: "Accepted", color: "border-t-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20" },
  { id: "enrolled", label: "Enrolled", color: "border-t-green-500 bg-green-50/50 dark:bg-green-950/20" },
];

const STATUS_BADGE_COLOR: Record<string, string> = {
  new: "bg-blue-100 text-blue-800",
  contacted: "bg-cyan-100 text-cyan-800",
  test_scheduled: "bg-amber-100 text-amber-800",
  test_done: "bg-purple-100 text-purple-800",
  interview_scheduled: "bg-indigo-100 text-indigo-800",
  interview_done: "bg-violet-100 text-violet-800",
  offer_sent: "bg-orange-100 text-orange-800",
  accepted: "bg-emerald-100 text-emerald-800",
  enrolled: "bg-green-100 text-green-800",
};

interface Student { name: string; gender: string; desired_grade: string }

interface Enquiry {
  ref_number: string;
  parent_name: string;
  phone: string;
  email: string;
  students: Student[];
  student_count: number;
  status: string;
  source?: string;
  created_at: string;
}

export default function PipelinePage() {
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragItem, setDragItem] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/admissions/enquiries?limit=1000", { cache: "no-store" });
      const json = await res.json();
      const all = (json.enquiries || []) as Enquiry[];
      all.sort((a, b) => b.created_at.localeCompare(a.created_at));
      setEnquiries(all);
    } catch (err) {
      console.error("Failed to load pipeline:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* ── Drag and drop handlers ── */
  function handleDragStart(e: React.DragEvent, refNumber: string) {
    e.dataTransfer.setData("text/plain", refNumber);
    e.dataTransfer.effectAllowed = "move";
    setDragItem(refNumber);
  }

  function handleDragOver(e: React.DragEvent, colId: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverCol(colId);
  }

  function handleDragLeave() {
    setDragOverCol(null);
  }

  async function handleDrop(e: React.DragEvent, newStatus: string) {
    e.preventDefault();
    setDragOverCol(null);
    setDragItem(null);
    const refNumber = e.dataTransfer.getData("text/plain");
    if (!refNumber) return;

    const enquiry = enquiries.find((eq) => eq.ref_number === refNumber);
    if (!enquiry || enquiry.status === newStatus) return;

    // Optimistic update
    setEnquiries((prev) =>
      prev.map((eq) => eq.ref_number === refNumber ? { ...eq, status: newStatus } : eq)
    );

    try {
      await fetch("/api/admissions/enquiries", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ref_number: refNumber, status: newStatus }),
      });
    } catch (err) {
      console.error("Failed to update status:", err);
      // Revert on failure
      setEnquiries((prev) =>
        prev.map((eq) => eq.ref_number === refNumber ? { ...eq, status: enquiry.status } : eq)
      );
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex gap-4 overflow-x-auto pb-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="min-w-[280px] h-[500px] rounded-xl flex-shrink-0" />
          ))}
        </div>
      </div>
    );
  }

  // Active counts (exclude rejected/withdrawn)
  const activeEnquiries = enquiries.filter((e) => e.status !== "rejected" && e.status !== "withdrawn");
  const rejectedCount = enquiries.filter((e) => e.status === "rejected" || e.status === "withdrawn").length;

  return (
    <div className="space-y-4 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Admission Pipeline</h1>
          <p className="text-sm text-muted-foreground">
            {activeEnquiries.length} active enquiries
            {rejectedCount > 0 && ` · ${rejectedCount} rejected/withdrawn (hidden)`}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData}>Refresh</Button>
      </div>

      {/* Kanban board */}
      <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: "calc(100vh - 200px)" }}>
        {COLUMNS.map((col) => {
          const items = activeEnquiries.filter((e) => e.status === col.id);
          const isOver = dragOverCol === col.id;

          return (
            <div
              key={col.id}
              className={`min-w-[280px] max-w-[280px] flex flex-col rounded-xl border-t-4 ${col.color} border border-border/50 transition-all ${
                isOver ? "ring-2 ring-primary ring-offset-2" : ""
              }`}
              onDragOver={(e) => handleDragOver(e, col.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, col.id)}
            >
              {/* Column header */}
              <div className="p-3 flex items-center justify-between border-b border-border/50">
                <span className="text-sm font-semibold">{col.label}</span>
                <Badge variant="secondary" className="text-xs">
                  {items.length}
                </Badge>
              </div>

              {/* Cards */}
              <div className="flex-1 p-2 space-y-2 overflow-y-auto">
                {items.length === 0 ? (
                  <div className="text-xs text-muted-foreground text-center py-8">
                    Drop here
                  </div>
                ) : (
                  items.map((item) => (
                    <div
                      key={item.ref_number}
                      draggable
                      onDragStart={(e) => handleDragStart(e, item.ref_number)}
                      onDragEnd={() => { setDragItem(null); setDragOverCol(null); }}
                      className={`bg-background rounded-lg border p-3 cursor-grab active:cursor-grabbing shadow-sm hover:shadow-md transition-shadow ${
                        dragItem === item.ref_number ? "opacity-50" : ""
                      }`}
                    >
                      {/* Ref & grip */}
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-mono text-[10px] text-muted-foreground">{item.ref_number}</span>
                        <GripVertical className="h-3 w-3 text-muted-foreground" />
                      </div>

                      {/* Parent name */}
                      <p className="text-sm font-medium leading-tight">{item.parent_name}</p>

                      {/* Students */}
                      <div className="mt-2 space-y-0.5">
                        {item.students?.map((s, i) => (
                          <div key={i} className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            <User className="h-3 w-3" />
                            <span>{s.name}</span>
                            <span className="mx-0.5">·</span>
                            <Badge variant="outline" className="text-[10px] px-1 py-0">{s.desired_grade}</Badge>
                          </div>
                        ))}
                      </div>

                      {/* Contact */}
                      <div className="mt-2 flex items-center gap-3 text-[10px] text-muted-foreground">
                        <span className="flex items-center gap-0.5"><Phone className="h-2.5 w-2.5" />{item.phone.slice(-8)}</span>
                        <Badge variant="outline" className="text-[9px] px-1 py-0 capitalize">{item.source || "wa"}</Badge>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
