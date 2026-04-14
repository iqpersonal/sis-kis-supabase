"use client";

import { useEffect, useState, useCallback } from "react";
import { useStaffAuth } from "@/context/staff-auth-context";
import { getFirebaseAuth } from "@/lib/firebase";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Wrench, Plus, Clock, CheckCircle2, AlertCircle } from "lucide-react";
import type { ITTicket } from "@/types/sis";

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  open: { label: "Open", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400", icon: AlertCircle },
  "in-progress": { label: "In Progress", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400", icon: Clock },
  resolved: { label: "Resolved", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400", icon: CheckCircle2 },
  closed: { label: "Closed", color: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400", icon: CheckCircle2 },
};

const CATEGORIES = [
  { value: "hardware", label: "Hardware" },
  { value: "software", label: "Software" },
  { value: "network", label: "Network" },
  { value: "access", label: "Access / Permissions" },
  { value: "other", label: "Other" },
];

const PRIORITIES = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

async function getToken() {
  const auth = getFirebaseAuth();
  return auth.currentUser?.getIdToken() ?? null;
}

export default function StaffTicketsPage() {
  const { staff } = useStaffAuth();
  const [tickets, setTickets] = useState<ITTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("other");
  const [priority, setPriority] = useState("medium");

  const loadTickets = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch("/api/staff-portal/tickets", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setTickets(data.tickets || []);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (staff) loadTickets();
  }, [staff, loadTickets]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;
    setSubmitting(true);

    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch("/api/staff-portal/tickets", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title, description, category, priority }),
      });

      if (res.ok) {
        setTitle("");
        setDescription("");
        setCategory("other");
        setPriority("medium");
        setDialogOpen(false);
        loadTickets();
      }
    } catch {
      // silently fail
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Wrench className="h-6 w-6 text-orange-500" />
            IT Support Tickets
          </h1>
          <p className="text-muted-foreground">
            Submit and track IT support requests
          </p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-orange-600 hover:bg-orange-700">
              <Plus className="h-4 w-4 mr-1" />
              New Ticket
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Create IT Support Ticket</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Title</label>
                <Input
                  placeholder="Brief description of the issue"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Description</label>
                <Textarea
                  placeholder="Detailed description of the problem..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  required
                  rows={4}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Category</label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Priority</label>
                  <Select value={priority} onValueChange={setPriority}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRIORITIES.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button
                type="submit"
                className="w-full bg-orange-600 hover:bg-orange-700"
                disabled={submitting}
              >
                {submitting ? "Submitting..." : "Submit Ticket"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-orange-500 border-t-transparent" />
        </div>
      ) : tickets.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            You have no IT tickets. Click &quot;New Ticket&quot; to submit one.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {tickets.map((t) => {
            const cfg = STATUS_CONFIG[t.status] || STATUS_CONFIG.open;
            const StatusIcon = cfg.icon;
            return (
              <Card key={t.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <CardTitle className="text-base">{t.title}</CardTitle>
                      <p className="text-xs text-muted-foreground">
                        {t.ticket_id} • {t.category} •{" "}
                        {t.created_at
                          ? new Date(t.created_at).toLocaleDateString("en-US", {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            })
                          : "—"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${
                          t.priority === "high"
                            ? "border-red-500 text-red-500"
                            : t.priority === "medium"
                              ? "border-yellow-500 text-yellow-500"
                              : ""
                        }`}
                      >
                        {t.priority}
                      </Badge>
                      <Badge className={`text-[10px] ${cfg.color} border-0`}>
                        <StatusIcon className="h-3 w-3 mr-1" />
                        {cfg.label}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {t.description}
                  </p>
                  {t.notes && t.notes.length > 0 && (
                    <div className="mt-3 border-t pt-3 space-y-2">
                      <p className="text-xs font-medium">Updates:</p>
                      {t.notes.map((n, i) => (
                        <div
                          key={i}
                          className="text-xs bg-muted/50 rounded p-2"
                        >
                          <span className="font-medium">{n.author}</span>
                          <span className="text-muted-foreground">
                            {" "}
                            •{" "}
                            {new Date(n.timestamp).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                          <p className="mt-1">{n.text}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
