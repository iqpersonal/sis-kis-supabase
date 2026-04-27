"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/auth-context";
import { useLanguage } from "@/context/language-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DoorOpen,
  Plus,
  Pencil,
  Trash2,
  X,
  Save,
  RefreshCw,
} from "lucide-react";
import { getSupabase } from "@/lib/supabase";

/* ── Types ──────────────────────────────────────────────────── */
interface Hall {
  id: string;
  hallName: string;
  campus: string;
  rows: number;
  columns: number;
  isActive: boolean;
}

/* ── Page ───────────────────────────────────────────────────── */
export default function ExamHallsPage() {
  const { user } = useAuth();
  const { t, isRTL } = useLanguage();

  const [halls, setHalls] = useState<Hall[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingHall, setEditingHall] = useState<Hall | null>(null);
  const [form, setForm] = useState({ hallName: "", campus: "Boys", rows: 5, columns: 5 });
  const [saving, setSaving] = useState(false);

  async function getAuthHeaders() {
    const { data: { session } } = await getSupabase().auth.getSession();
    const token = session?.access_token;
    return {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
  }

  async function loadHalls() {
    setLoading(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/admin/exam-seating/halls", { headers });
      if (!res.ok) throw new Error("Failed to fetch halls");
      const data = await res.json();
      setHalls(data.halls || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load halls");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (user) loadHalls();
  }, [user]);

  function openAdd() {
    setEditingHall(null);
    setForm({ hallName: "", campus: "Boys", rows: 5, columns: 5 });
    setShowModal(true);
  }

  function openEdit(hall: Hall) {
    setEditingHall(hall);
    setForm({
      hallName: hall.hallName,
      campus: hall.campus,
      rows: hall.rows,
      columns: hall.columns,
    });
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.hallName.trim()) return;
    setSaving(true);
    try {
      const headers = await getAuthHeaders();
      if (editingHall) {
        // Update
        await fetch("/api/admin/exam-seating/halls", {
          method: "PUT",
          headers,
          body: JSON.stringify({ id: editingHall.id, ...form }),
        });
      } else {
        // Create
        await fetch("/api/admin/exam-seating/halls", {
          method: "POST",
          headers,
          body: JSON.stringify(form),
        });
      }
      setShowModal(false);
      await loadHalls();
    } catch {
      setError("Failed to save hall");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(hall: Hall) {
    if (!confirm(`Delete hall "${hall.hallName}"?`)) return;
    try {
      const headers = await getAuthHeaders();
      await fetch("/api/admin/exam-seating/halls", {
        method: "DELETE",
        headers,
        body: JSON.stringify({ id: hall.id }),
      });
      await loadHalls();
    } catch {
      setError("Failed to delete hall");
    }
  }

  async function toggleActive(hall: Hall) {
    try {
      const headers = await getAuthHeaders();
      await fetch("/api/admin/exam-seating/halls", {
        method: "PUT",
        headers,
        body: JSON.stringify({ id: hall.id, isActive: !hall.isActive }),
      });
      setHalls((prev) =>
        prev.map((h) => (h.id === hall.id ? { ...h, isActive: !h.isActive } : h))
      );
    } catch {
      setError("Failed to update hall");
    }
  }

  const boysHalls = halls.filter((h) => h.campus === "Boys");
  const girlsHalls = halls.filter((h) => h.campus === "Girls");

  return (
    <div className="space-y-6" dir={isRTL ? "rtl" : "ltr"}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <DoorOpen className="h-6 w-6" />
            Exam Halls
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage exam halls and their seating layout
          </p>
        </div>
        <Button onClick={openAdd} className="gap-2">
          <Plus className="h-4 w-4" />
          Add Hall
        </Button>
      </div>

      {error && (
        <div className="bg-destructive/10 text-destructive text-sm px-4 py-2 rounded-md">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : halls.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No exam halls configured yet. Click &quot;Add Hall&quot; to get started.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Boys' School Halls */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300">
                  Boys&apos; School
                </span>
                <span className="text-xs text-muted-foreground">{boysHalls.length} halls</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <HallTable halls={boysHalls} onEdit={openEdit} onDelete={handleDelete} onToggle={toggleActive} />
            </CardContent>
          </Card>

          {/* Girls' School Halls */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300">
                  Girls&apos; School
                </span>
                <span className="text-xs text-muted-foreground">{girlsHalls.length} halls</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <HallTable halls={girlsHalls} onEdit={openEdit} onDelete={handleDelete} onToggle={toggleActive} />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background rounded-lg shadow-lg w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                {editingHall ? "Edit Hall" : "Add New Hall"}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium mb-1 block">Hall Name</label>
                <Input
                  value={form.hallName}
                  onChange={(e) => setForm((f) => ({ ...f, hallName: e.target.value }))}
                  placeholder="e.g. Hall A, Room 101"
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-1 block">Campus</label>
                <select
                  value={form.campus}
                  onChange={(e) => setForm((f) => ({ ...f, campus: e.target.value }))}
                  className="w-full h-9 rounded-md border bg-background px-3 text-sm"
                >
                  <option value="Boys">Boys&apos; School</option>
                  <option value="Girls">Girls&apos; School</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium mb-1 block">Rows</label>
                  <Input
                    type="number"
                    min={1}
                    max={50}
                    value={form.rows}
                    onChange={(e) => setForm((f) => ({ ...f, rows: parseInt(e.target.value) || 1 }))}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Columns</label>
                  <Input
                    type="number"
                    min={1}
                    max={50}
                    value={form.columns}
                    onChange={(e) => setForm((f) => ({ ...f, columns: parseInt(e.target.value) || 1 }))}
                  />
                </div>
              </div>

              <div className="text-sm text-muted-foreground">
                Total capacity: <strong>{form.rows * form.columns}</strong> seats
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowModal(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving || !form.hallName.trim()} className="gap-2">
                <Save className="h-4 w-4" />
                {saving ? "Saving..." : editingHall ? "Update" : "Create"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Hall Table Component ───────────────────────────────────── */
function HallTable({
  halls,
  onEdit,
  onDelete,
  onToggle,
}: {
  halls: Hall[];
  onEdit: (h: Hall) => void;
  onDelete: (h: Hall) => void;
  onToggle: (h: Hall) => void;
}) {
  if (halls.length === 0) {
    return (
      <p className="text-sm text-muted-foreground px-4 py-6 text-center">
        No halls configured
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="bg-muted/50">
          <TableHead className="font-semibold">Name</TableHead>
          <TableHead className="font-semibold text-center">Layout</TableHead>
          <TableHead className="font-semibold text-center">Capacity</TableHead>
          <TableHead className="font-semibold text-center">Status</TableHead>
          <TableHead className="font-semibold text-center">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {halls.map((hall) => (
          <TableRow key={hall.id}>
            <TableCell className="font-medium">{hall.hallName}</TableCell>
            <TableCell className="text-center text-sm">
              {hall.rows} × {hall.columns}
            </TableCell>
            <TableCell className="text-center">
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                {hall.rows * hall.columns}
              </span>
            </TableCell>
            <TableCell className="text-center">
              <button
                onClick={() => onToggle(hall)}
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium cursor-pointer transition-colors ${
                  hall.isActive
                    ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 hover:bg-green-200"
                    : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-200"
                }`}
              >
                {hall.isActive ? "Active" : "Inactive"}
              </button>
            </TableCell>
            <TableCell className="text-center">
              <div className="flex items-center justify-center gap-1">
                <button
                  onClick={() => onEdit(hall)}
                  className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                  title="Edit"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => onDelete(hall)}
                  className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                  title="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
