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
  Megaphone,
  Search,
  Loader2,
  Plus,
  Pencil,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import { useAuth } from "@/context/auth-context";

interface Announcement {
  id: string;
  title: string;
  body: string;
  author_name: string;
  author_uid: string;
  target: "all" | "teachers" | "non-teaching" | "admin";
  priority: "normal" | "urgent";
  is_active: boolean;
  created_at: { _seconds: number } | string;
  expires_at: string | null;
}

export default function AnnouncementsManagePage() {
  const { user } = useAuth();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [target, setTarget] = useState<string>("all");
  const [priority, setPriority] = useState<string>("normal");
  const [expiresAt, setExpiresAt] = useState("");

  const fetchAnnouncements = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/staff-portal/announcements", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setAnnouncements(data.announcements || []);
    } catch (err) {
      console.error("Failed to fetch announcements:", err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchAnnouncements();
  }, [fetchAnnouncements]);

  const openCreate = () => {
    setEditing(null);
    setTitle("");
    setBody("");
    setTarget("all");
    setPriority("normal");
    setExpiresAt("");
    setDialogOpen(true);
  };

  const openEdit = (a: Announcement) => {
    setEditing(a);
    setTitle(a.title);
    setBody(a.body);
    setTarget(a.target);
    setPriority(a.priority);
    setExpiresAt(a.expires_at || "");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!user || !title.trim() || !body.trim()) return;
    setSaving(true);
    try {
      const token = await user.getIdToken();
      if (editing) {
        // Update via PATCH
        await fetch("/api/staff-portal/announcements", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            announcementId: editing.id,
            title,
            content: body,
            target,
            priority,
            expires_at: expiresAt || null,
          }),
        });
      } else {
        // Create new
        await fetch("/api/staff-portal/announcements", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            title,
            content: body,
            target,
            priority,
            expires_at: expiresAt || null,
          }),
        });
      }
      setDialogOpen(false);
      fetchAnnouncements();
    } catch (err) {
      console.error("Failed to save announcement:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!user) return;
    if (!confirm("Are you sure you want to deactivate this announcement?")) return;
    try {
      const token = await user.getIdToken();
      await fetch("/api/staff-portal/announcements", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ announcementId: id }),
      });
      fetchAnnouncements();
    } catch (err) {
      console.error("Failed to delete announcement:", err);
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

  const filtered = announcements.filter(
    (a) =>
      a.title?.toLowerCase().includes(search.toLowerCase()) ||
      a.body?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Megaphone className="h-6 w-6 text-primary" />
            Announcements
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage announcements visible to all staff members
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          New Announcement
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total</CardDescription>
            <CardTitle className="text-2xl">{announcements.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Active</CardDescription>
            <CardTitle className="text-2xl text-green-600">
              {announcements.filter((a) => a.is_active).length}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Urgent</CardDescription>
            <CardTitle className="text-2xl text-red-600">
              {announcements.filter((a) => a.priority === "urgent").length}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search announcements..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
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
              No announcements found
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Author</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium max-w-[200px] truncate">
                      {a.title}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {a.target}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {a.priority === "urgent" ? (
                        <Badge variant="destructive" className="gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          Urgent
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Normal</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {a.author_name}
                    </TableCell>
                    <TableCell className="text-sm">
                      {formatDate(a.created_at)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {a.expires_at ? formatDate(a.expires_at) : "Never"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEdit(a)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleDelete(a.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit Announcement" : "New Announcement"}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? "Update announcement details"
                : "Create a new announcement for staff"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium">Title</label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Announcement title"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Content</label>
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Announcement content..."
                rows={4}
                className="mt-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Target Audience</label>
                <Select value={target} onValueChange={setTarget}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Staff</SelectItem>
                    <SelectItem value="teachers">Teachers Only</SelectItem>
                    <SelectItem value="non-teaching">Non-Teaching</SelectItem>
                    <SelectItem value="admin">Admin Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Priority</label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">
                Expires At (optional)
              </label>
              <Input
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !title.trim() || !body.trim()}
            >
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editing ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
