"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Headphones,
  Search,
  Loader2,
  MessageSquare,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
} from "lucide-react";
import { useAuth } from "@/context/auth-context";

interface TicketNote {
  text: string;
  author: string;
  timestamp: string;
}

interface Ticket {
  id: string;
  ticket_id: string;
  staff_number: string;
  staff_name: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  assigned_to: string | null;
  notes: TicketNote[];
  created_at: { _seconds: number } | string;
  updated_at: { _seconds: number } | string;
}

const STATUS_OPTIONS = [
  { value: "open", label: "Open", color: "bg-blue-500" },
  { value: "in_progress", label: "In Progress", color: "bg-yellow-500" },
  { value: "resolved", label: "Resolved", color: "bg-green-500" },
  { value: "closed", label: "Closed", color: "bg-gray-500" },
];

const PRIORITY_COLORS: Record<string, string> = {
  low: "secondary",
  medium: "outline",
  high: "default",
  urgent: "destructive",
};

const CATEGORY_LABELS: Record<string, string> = {
  hardware: "Hardware",
  software: "Software",
  network: "Network",
  email: "Email",
  printer: "Printer",
  access: "Access/Permissions",
  other: "Other",
};

export default function ITTicketsManagePage() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [newStatus, setNewStatus] = useState("");
  const [assignTo, setAssignTo] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchTickets = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/staff-portal/tickets?all=true", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setTickets(data.tickets || []);
    } catch (err) {
      console.error("Failed to fetch tickets:", err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  const openDetail = (t: Ticket) => {
    setSelectedTicket(t);
    setNewNote("");
    setNewStatus(t.status);
    setAssignTo(t.assigned_to || "");
    setDetailOpen(true);
  };

  const handleUpdate = async () => {
    if (!user || !selectedTicket) return;
    setSaving(true);
    try {
      const token = await user.getIdToken();
      const body: Record<string, unknown> = {
        ticketId: selectedTicket.id,
      };
      if (newStatus && newStatus !== selectedTicket.status) {
        body.status = newStatus;
      }
      if (newNote.trim()) {
        body.note = newNote.trim();
      }
      if (assignTo !== (selectedTicket.assigned_to || "")) {
        body.assigned_to = assignTo || null;
      }

      await fetch("/api/staff-portal/tickets", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      setDetailOpen(false);
      fetchTickets();
    } catch (err) {
      console.error("Failed to update ticket:", err);
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (ts: { _seconds: number } | string | undefined) => {
    if (!ts) return "—";
    if (typeof ts === "string") return new Date(ts).toLocaleDateString();
    if (typeof ts === "object" && "_seconds" in ts) {
      return new Date(ts._seconds * 1000).toLocaleDateString();
    }
    return "—";
  };

  const getStatusBadge = (status: string) => {
    const opt = STATUS_OPTIONS.find((s) => s.value === status);
    const icons: Record<string, React.ReactNode> = {
      open: <Clock className="h-3 w-3" />,
      in_progress: <Loader2 className="h-3 w-3" />,
      resolved: <CheckCircle2 className="h-3 w-3" />,
      closed: <XCircle className="h-3 w-3" />,
    };
    return (
      <Badge variant="outline" className="gap-1 capitalize">
        {icons[status]}
        {opt?.label || status}
      </Badge>
    );
  };

  const stats = {
    total: tickets.length,
    open: tickets.filter((t) => t.status === "open").length,
    inProgress: tickets.filter((t) => t.status === "in_progress").length,
    resolved: tickets.filter((t) => t.status === "resolved" || t.status === "closed").length,
  };

  const filtered = tickets.filter((t) => {
    const matchesSearch =
      t.title?.toLowerCase().includes(search.toLowerCase()) ||
      t.ticket_id?.toLowerCase().includes(search.toLowerCase()) ||
      t.staff_name?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || t.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Headphones className="h-6 w-6 text-primary" />
          IT Ticket Management
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          View, assign, and manage IT support tickets from staff
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total</CardDescription>
            <CardTitle className="text-2xl">{stats.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Open</CardDescription>
            <CardTitle className="text-2xl text-blue-600">{stats.open}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>In Progress</CardDescription>
            <CardTitle className="text-2xl text-yellow-600">{stats.inProgress}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Resolved</CardDescription>
            <CardTitle className="text-2xl text-green-600">{stats.resolved}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search tickets..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              No tickets found
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ticket ID</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Submitter</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((t) => (
                  <TableRow key={t.id} className="cursor-pointer" onClick={() => openDetail(t)}>
                    <TableCell className="font-mono text-sm">
                      {t.ticket_id}
                    </TableCell>
                    <TableCell className="font-medium max-w-[180px] truncate">
                      {t.title}
                    </TableCell>
                    <TableCell className="text-sm">
                      {t.staff_name}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {CATEGORY_LABELS[t.category] || t.category}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={PRIORITY_COLORS[t.priority] as "default" | "secondary" | "outline" | "destructive" || "outline"}
                        className="capitalize"
                      >
                        {t.priority === "urgent" && <AlertTriangle className="h-3 w-3 mr-1" />}
                        {t.priority}
                      </Badge>
                    </TableCell>
                    <TableCell>{getStatusBadge(t.status)}</TableCell>
                    <TableCell className="text-sm">
                      {formatDate(t.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" className="gap-1">
                        <MessageSquare className="h-4 w-4" />
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Ticket Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          {selectedTicket && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <span className="font-mono text-sm text-muted-foreground">
                    {selectedTicket.ticket_id}
                  </span>
                  {selectedTicket.title}
                </DialogTitle>
                <DialogDescription>
                  Submitted by {selectedTicket.staff_name} on{" "}
                  {formatDate(selectedTicket.created_at)}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2">
                {/* Description */}
                <div className="rounded-md bg-muted p-3">
                  <p className="text-sm whitespace-pre-wrap">
                    {selectedTicket.description}
                  </p>
                </div>

                {/* Info row */}
                <div className="flex gap-4 flex-wrap text-sm">
                  <div>
                    <span className="text-muted-foreground">Category:</span>{" "}
                    {CATEGORY_LABELS[selectedTicket.category] || selectedTicket.category}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Priority:</span>{" "}
                    <span className="capitalize">{selectedTicket.priority}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Assigned:</span>{" "}
                    {selectedTicket.assigned_to || "Unassigned"}
                  </div>
                </div>

                {/* Notes history */}
                {selectedTicket.notes && selectedTicket.notes.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium mb-2">Notes History</h4>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {selectedTicket.notes.map((n, i) => (
                        <div
                          key={i}
                          className="rounded bg-muted/50 p-2 text-sm"
                        >
                          <div className="flex justify-between text-xs text-muted-foreground mb-1">
                            <span>{n.author}</span>
                            <span>{new Date(n.timestamp).toLocaleString()}</span>
                          </div>
                          <p>{n.text}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Update controls */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Status</label>
                    <Select value={newStatus} onValueChange={setNewStatus}>
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map((s) => (
                          <SelectItem key={s.value} value={s.value}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Assign To</label>
                    <Input
                      value={assignTo}
                      onChange={(e) => setAssignTo(e.target.value)}
                      placeholder="IT staff email"
                      className="mt-1"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium">Add Note</label>
                  <Textarea
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    placeholder="Add a resolution note..."
                    rows={3}
                    className="mt-1"
                  />
                </div>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setDetailOpen(false)}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button onClick={handleUpdate} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Update Ticket
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
