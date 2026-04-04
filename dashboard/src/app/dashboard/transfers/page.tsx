"use client";

import { useEffect, useState, useCallback } from "react";
import {
  ArrowRightLeft,
  LogOut,
  Search,
  Plus,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronDown,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAcademicYear } from "@/context/academic-year-context";
import { useSchoolFilter } from "@/context/school-filter-context";
import { useLanguage } from "@/context/language-context";
import { cn } from "@/lib/utils";

/* ────────────────────── Types ────────────────────── */

interface TransferRecord {
  id: string;
  student_number: string;
  student_name: string;
  class_name: string;
  school: string;
  type: "transfer" | "withdrawal";
  status: "pending" | "approved" | "completed" | "cancelled";
  reason: string;
  destination_school: string;
  effective_date: string;
  notes: string;
  created_at: string;
  updated_at: string;
  created_by: string;
}

interface Summary {
  total: number;
  transfers: number;
  withdrawals: number;
  pending: number;
  approved: number;
  completed: number;
  cancelled: number;
}

type StatusFilter = "all" | "pending" | "approved" | "completed" | "cancelled";

/* ────────────────────── Helpers ────────────────────── */

const statusConfig: Record<
  string,
  { label: string; icon: React.ElementType; className: string }
> = {
  pending: {
    label: "Pending",
    icon: Clock,
    className: "bg-amber-50 text-amber-700 border-amber-200",
  },
  approved: {
    label: "Approved",
    icon: CheckCircle2,
    className: "bg-blue-50 text-blue-700 border-blue-200",
  },
  completed: {
    label: "Completed",
    icon: CheckCircle2,
    className: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  cancelled: {
    label: "Cancelled",
    icon: XCircle,
    className: "bg-gray-50 text-gray-500 border-gray-200",
  },
};

function formatDate(iso: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

/* ────────────────────── Page ────────────────────── */

export default function TransfersPage() {
  const { selectedYear } = useAcademicYear();
  const { schoolFilter } = useSchoolFilter();
  const { t } = useLanguage();

  const [records, setRecords] = useState<TransferRecord[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<StatusFilter>("all");

  // New record dialog
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newType, setNewType] = useState<"transfer" | "withdrawal">("transfer");
  const [newStudentNumber, setNewStudentNumber] = useState("");
  const [newReason, setNewReason] = useState("");
  const [newDestination, setNewDestination] = useState("");
  const [newEffectiveDate, setNewEffectiveDate] = useState(
    new Date().toISOString().substring(0, 10)
  );
  const [newNotes, setNewNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Status update dialog
  const [updateRecord, setUpdateRecord] = useState<TransferRecord | null>(null);
  const [newStatus, setNewStatus] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedYear) params.set("year", selectedYear);
      if (schoolFilter !== "all") params.set("school", schoolFilter);
      const res = await fetch(`/api/transfers?${params}`);
      if (res.ok) {
        const data = await res.json();
        setRecords(data.records || []);
        setSummary(data.summary || null);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [selectedYear, schoolFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filtered = records.filter((r) => {
    if (filterStatus !== "all" && r.status !== filterStatus) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        r.student_name.toLowerCase().includes(q) ||
        r.student_number.includes(q) ||
        r.class_name.toLowerCase().includes(q) ||
        r.reason.toLowerCase().includes(q)
      );
    }
    return true;
  }).sort((a, b) => a.student_name.localeCompare(b.student_name));

  const handleCreate = async () => {
    if (!newStudentNumber) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentNumber: newStudentNumber,
          type: newType,
          reason: newReason,
          destinationSchool: newDestination,
          effectiveDate: newEffectiveDate,
          notes: newNotes,
        }),
      });
      if (res.ok) {
        setShowNewDialog(false);
        setNewStudentNumber("");
        setNewReason("");
        setNewDestination("");
        setNewNotes("");
        fetchData();
      } else {
        setError("Failed to create transfer record");
      }
    } catch {
      setError("Network error — please try again");
    } finally {
      setSaving(false);
    }
  };

  const handleStatusUpdate = async () => {
    if (!updateRecord || !newStatus) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/transfers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: updateRecord.id,
          status: newStatus,
        }),
      });
      if (!res.ok) {
        setError("Failed to update transfer status");
      }
      setUpdateRecord(null);
      setNewStatus("");
      fetchData();
    } catch {
      setError("Network error — please try again");
    } finally {
      setSaving(false);
    }
  };

  const filters: { key: StatusFilter; label: string; count: number }[] = [
    { key: "all", label: t("all"), count: summary?.total || 0 },
    { key: "pending", label: "Pending", count: summary?.pending || 0 },
    { key: "approved", label: "Approved", count: summary?.approved || 0 },
    { key: "completed", label: "Completed", count: summary?.completed || 0 },
    { key: "cancelled", label: "Cancelled", count: summary?.cancelled || 0 },
  ];

  return (
    <div className="space-y-6">
      {/* Error banner */}
      {error && (
        <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ArrowRightLeft className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Transfers & Withdrawals
            </h1>
            <p className="text-sm text-muted-foreground">
              Manage student transfers and withdrawals
            </p>
          </div>
        </div>
        <Button size="sm" onClick={() => setShowNewDialog(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Request
        </Button>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-blue-100 p-2">
                  <ArrowRightLeft className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-blue-700">
                    {summary.transfers}
                  </p>
                  <p className="text-xs text-muted-foreground">Transfers</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-red-100 p-2">
                  <LogOut className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-red-700">
                    {summary.withdrawals}
                  </p>
                  <p className="text-xs text-muted-foreground">Withdrawals</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-amber-100 p-2">
                  <Clock className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-amber-700">
                    {summary.pending}
                  </p>
                  <p className="text-xs text-muted-foreground">Pending</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-emerald-100 p-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-emerald-700">
                    {summary.completed}
                  </p>
                  <p className="text-xs text-muted-foreground">Completed</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters + Search */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-2">
          {filters.map((f) => (
            <Button
              key={f.key}
              variant={filterStatus === f.key ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterStatus(f.key)}
            >
              {f.label}
              <Badge
                variant="secondary"
                className={cn(
                  "ml-2",
                  filterStatus === f.key &&
                    "bg-primary-foreground/20 text-primary-foreground"
                )}
              >
                {f.count}
              </Badge>
            </Button>
          ))}
        </div>
        <div className="relative ml-auto w-64">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={`${t("search")}...`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Records Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Records</CardTitle>
          <CardDescription>
            {filtered.length} records found
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
              <ArrowRightLeft className="h-12 w-12 opacity-20" />
              <p className="text-sm">{t("noData")}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowNewDialog(true)}
              >
                <Plus className="mr-2 h-4 w-4" />
                Create First Record
              </Button>
            </div>
          ) : (
            <div className="max-h-[600px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card z-10">
                  <tr className="border-b text-left">
                    <th className="px-3 py-2 font-medium text-muted-foreground">
                      Type
                    </th>
                    <th className="px-3 py-2 font-medium text-muted-foreground">
                      {t("studentNumber")}
                    </th>
                    <th className="px-3 py-2 font-medium text-muted-foreground">
                      {t("name")}
                    </th>
                    <th className="px-3 py-2 font-medium text-muted-foreground">
                      {t("grade")}
                    </th>
                    <th className="px-3 py-2 font-medium text-muted-foreground">
                      Reason
                    </th>
                    <th className="px-3 py-2 font-medium text-muted-foreground">
                      Date
                    </th>
                    <th className="px-3 py-2 font-medium text-muted-foreground text-center">
                      {t("status")}
                    </th>
                    <th className="px-3 py-2 font-medium text-muted-foreground">
                      {t("actions")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => {
                    const sc = statusConfig[r.status];
                    const StatusIcon = sc.icon;
                    return (
                      <tr key={r.id} className="border-b hover:bg-muted/50">
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            {r.type === "transfer" ? (
                              <ArrowRightLeft className="h-3.5 w-3.5 text-blue-500" />
                            ) : (
                              <LogOut className="h-3.5 w-3.5 text-red-500" />
                            )}
                            <span className="capitalize text-xs font-medium">
                              {r.type}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {r.student_number}
                        </td>
                        <td className="px-3 py-2 font-medium">
                          {r.student_name || "—"}
                        </td>
                        <td className="px-3 py-2">{r.class_name || "—"}</td>
                        <td className="px-3 py-2 max-w-[200px] truncate">
                          {r.reason || "—"}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {formatDate(r.effective_date)}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-bold ${sc.className}`}
                          >
                            <StatusIcon className="h-3 w-3" />
                            {sc.label}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          {r.status !== "completed" &&
                            r.status !== "cancelled" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => {
                                  setUpdateRecord(r);
                                  setNewStatus("");
                                }}
                              >
                                <ChevronDown className="mr-1 h-3 w-3" />
                                Update
                              </Button>
                            )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* New Transfer/Withdrawal Dialog */}
      <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Transfer / Withdrawal</DialogTitle>
            <DialogDescription>
              Record a student transfer or withdrawal request
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Type</label>
              <div className="flex gap-2">
                <Button
                  variant={newType === "transfer" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setNewType("transfer")}
                  className="flex-1"
                >
                  <ArrowRightLeft className="mr-2 h-4 w-4" />
                  Transfer
                </Button>
                <Button
                  variant={newType === "withdrawal" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setNewType("withdrawal")}
                  className="flex-1"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Withdrawal
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">{t("studentNumber")}</label>
              <Input
                value={newStudentNumber}
                onChange={(e) => setNewStudentNumber(e.target.value)}
                placeholder="Enter student number"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Reason</label>
              <Input
                value={newReason}
                onChange={(e) => setNewReason(e.target.value)}
                placeholder="e.g. Family relocation"
              />
            </div>

            {newType === "transfer" && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Destination School</label>
                <Input
                  value={newDestination}
                  onChange={(e) => setNewDestination(e.target.value)}
                  placeholder="Name of receiving school"
                />
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">Effective Date</label>
              <Input
                type="date"
                value={newEffectiveDate}
                onChange={(e) => setNewEffectiveDate(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Notes</label>
              <Input
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                placeholder="Optional notes..."
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setShowNewDialog(false)}
              >
                {t("cancel")}
              </Button>
              <Button
                onClick={handleCreate}
                disabled={saving || !newStudentNumber}
              >
                {saving ? t("loading") : t("save")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Status Update Dialog */}
      <Dialog
        open={!!updateRecord}
        onOpenChange={() => setUpdateRecord(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Update Status</DialogTitle>
            <DialogDescription>
              {updateRecord?.student_name} (#{updateRecord?.student_number})
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Current status:{" "}
              <span className="font-medium capitalize">
                {updateRecord?.status}
              </span>
            </p>

            <div className="space-y-2">
              <label className="text-sm font-medium">New Status</label>
              <div className="flex flex-col gap-2">
                {["pending", "approved", "completed", "cancelled"]
                  .filter((s) => s !== updateRecord?.status)
                  .map((s) => {
                    const sc = statusConfig[s];
                    return (
                      <Button
                        key={s}
                        variant={newStatus === s ? "default" : "outline"}
                        size="sm"
                        onClick={() => setNewStatus(s)}
                        className="justify-start"
                      >
                        <sc.icon className="mr-2 h-4 w-4" />
                        {sc.label}
                      </Button>
                    );
                  })}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setUpdateRecord(null)}
              >
                {t("cancel")}
              </Button>
              <Button
                onClick={handleStatusUpdate}
                disabled={saving || !newStatus}
              >
                {saving ? t("loading") : "Update"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
