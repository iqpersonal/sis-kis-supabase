"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
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
  FileText,
  Search,
  Loader2,
  AlertTriangle,
  ShieldAlert,
  ShieldCheck,
  Clock,
  XCircle,
  HelpCircle,
  Calendar,
  ExternalLink,
  Save,
  Filter,
} from "lucide-react";
import { useAcademicYear } from "@/context/academic-year-context";
import { useSchoolFilter } from "@/context/school-filter-context";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface DocStudent {
  student_number: string;
  student_name: string;
  student_name_ar: string;
  gender: string;
  class_name: string;
  passport_id: string;
  iqama_number: string;
  passport_expiry: string | null;
  iqama_expiry: string | null;
  passport_status: "valid" | "expiring" | "expired" | "missing" | "no-expiry";
  iqama_status: "valid" | "expiring" | "expired" | "missing" | "no-expiry";
  days_to_passport_expiry: number | null;
  days_to_iqama_expiry: number | null;
}

interface DocSummary {
  total: number;
  expired: number;
  expiring_30: number;
  expiring_60: number;
  expiring_90: number;
  missing_passport: number;
  missing_iqama: number;
  no_expiry_set: number;
}

type FilterType =
  | "all"
  | "expired"
  | "expiring-30"
  | "expiring-60"
  | "expiring-90"
  | "missing"
  | "no-expiry";

/* ------------------------------------------------------------------ */
/*  Status helpers                                                     */
/* ------------------------------------------------------------------ */

function statusBadge(
  status: string,
  days: number | null
): { label: string; className: string; icon: React.ReactNode } {
  switch (status) {
    case "expired":
      return {
        label: `Expired${days !== null ? ` (${Math.abs(days)}d ago)` : ""}`,
        className:
          "bg-red-100 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800",
        icon: <XCircle className="h-3 w-3" />,
      };
    case "expiring":
      return {
        label: `${days}d left`,
        className:
          (days ?? 999) <= 30
            ? "bg-red-50 text-red-600 border-red-200 dark:bg-red-950/30 dark:text-red-400"
            : (days ?? 999) <= 60
            ? "bg-orange-50 text-orange-600 border-orange-200 dark:bg-orange-950/30 dark:text-orange-400"
            : "bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400",
        icon: <Clock className="h-3 w-3" />,
      };
    case "missing":
      return {
        label: "No Document",
        className:
          "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400",
        icon: <ShieldAlert className="h-3 w-3" />,
      };
    case "no-expiry":
      return {
        label: "No Expiry Set",
        className:
          "bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400",
        icon: <HelpCircle className="h-3 w-3" />,
      };
    case "valid":
      return {
        label: `Valid${days !== null ? ` (${days}d)` : ""}`,
        className:
          "bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400",
        icon: <ShieldCheck className="h-3 w-3" />,
      };
    default:
      return {
        label: status,
        className: "bg-muted text-muted-foreground",
        icon: null,
      };
  }
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function DocumentExpiryPage() {
  const router = useRouter();
  const { selectedYear } = useAcademicYear();
  const { schoolFilter } = useSchoolFilter();
  const [students, setStudents] = useState<DocStudent[]>([]);
  const [summary, setSummary] = useState<DocSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>("all");
  const [searchTerm, setSearchTerm] = useState("");

  // Edit dialog
  const [editStudent, setEditStudent] = useState<DocStudent | null>(null);
  const [editPassportExpiry, setEditPassportExpiry] = useState("");
  const [editIqamaExpiry, setEditIqamaExpiry] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("filter", filter);
      params.set("limit", "5000");
      if (selectedYear) params.set("year", selectedYear);
      if (schoolFilter !== "all") params.set("school", schoolFilter);
      const res = await fetch(`/api/document-expiry?${params}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setStudents(data.students || []);
      setSummary(data.summary || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [filter, selectedYear, schoolFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Filter students by search term (client-side)
  const filteredStudents = searchTerm
    ? students.filter(
        (s) =>
          s.student_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          s.student_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
          s.passport_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
          s.iqama_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
          s.class_name.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : students;

  const handleEditClick = (student: DocStudent) => {
    setEditStudent(student);
    setEditPassportExpiry(student.passport_expiry || "");
    setEditIqamaExpiry(student.iqama_expiry || "");
  };

  const handleSave = async () => {
    if (!editStudent) return;
    setSaving(true);
    try {
      const res = await fetch("/api/document-expiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentNumber: editStudent.student_number,
          passport_expiry: editPassportExpiry || null,
          iqama_expiry: editIqamaExpiry || null,
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
      setEditStudent(null);
      // Refresh data
      fetchData();
    } catch (err) {
      console.error("Save error:", err);
      alert("Failed to save expiry dates. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const FILTERS: { value: FilterType; label: string; count?: number; color?: string }[] = [
    { value: "all", label: "All Students", count: summary?.total },
    {
      value: "expired",
      label: "Expired",
      count: summary?.expired,
      color: "text-red-600",
    },
    {
      value: "expiring-30",
      label: "Expiring (30d)",
      count: summary?.expiring_30,
      color: "text-red-500",
    },
    {
      value: "expiring-60",
      label: "Expiring (60d)",
      count: summary?.expiring_60,
      color: "text-orange-500",
    },
    {
      value: "expiring-90",
      label: "Expiring (90d)",
      count: summary?.expiring_90,
      color: "text-amber-500",
    },
    {
      value: "missing",
      label: "Missing Doc",
      count: (summary?.missing_passport ?? 0) + (summary?.missing_iqama ?? 0),
      color: "text-slate-500",
    },
    {
      value: "no-expiry",
      label: "No Expiry Set",
      count: summary?.no_expiry_set,
      color: "text-blue-500",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <FileText className="h-6 w-6 text-purple-500" />
          Document Expiry Tracking
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Monitor passport and iqama expiry dates for all students.
          Click a student row to set or update expiry dates.
        </p>
      </div>

      {/* Summary KPIs */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`rounded-xl border-2 p-3 text-center transition-all hover:shadow-md ${
                filter === f.value
                  ? "border-blue-500 bg-blue-50 dark:bg-blue-950/20"
                  : "border-muted hover:border-blue-300"
              }`}
            >
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {f.label}
              </p>
              <p className={`text-xl font-bold mt-1 ${f.color || ""}`}>
                {f.count ?? "—"}
              </p>
            </button>
          ))}
        </div>
      )}

      {/* Search */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, student number, passport or iqama..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Badge variant="secondary" className="shrink-0">
              {filteredStudents.length} students
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="pt-0 px-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-3 text-muted-foreground">Loading documents…</span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <AlertTriangle className="h-8 w-8 text-red-400" />
              <p className="text-red-600">{error}</p>
              <Button variant="outline" onClick={fetchData}>
                Retry
              </Button>
            </div>
          ) : filteredStudents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2">
              <ShieldCheck className="h-10 w-10 text-emerald-400" />
              <p className="text-muted-foreground">
                {searchTerm
                  ? "No students match your search."
                  : "No students found for this filter."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="text-xs">Student</TableHead>
                    <TableHead className="text-xs">Class</TableHead>
                    <TableHead className="text-xs">Passport</TableHead>
                    <TableHead className="text-xs">Passport Expiry</TableHead>
                    <TableHead className="text-xs">Iqama</TableHead>
                    <TableHead className="text-xs">Iqama Expiry</TableHead>
                    <TableHead className="text-xs w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredStudents.map((s) => {
                    const pBadge = statusBadge(
                      s.passport_status,
                      s.days_to_passport_expiry
                    );
                    const iBadge = statusBadge(
                      s.iqama_status,
                      s.days_to_iqama_expiry
                    );
                    return (
                      <TableRow
                        key={s.student_number}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => handleEditClick(s)}
                      >
                        <TableCell>
                          <div>
                            <p className="text-sm font-medium truncate max-w-[200px]">
                              {s.student_name || s.student_number}
                            </p>
                            <p className="text-[11px] text-muted-foreground font-mono">
                              {s.student_number}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {s.class_name || "—"}
                        </TableCell>
                        <TableCell className="text-sm font-mono">
                          {s.passport_id || (
                            <span className="text-muted-foreground italic">None</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={`gap-1 text-[11px] border ${pBadge.className}`}
                          >
                            {pBadge.icon}
                            {pBadge.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm font-mono">
                          {s.iqama_number || (
                            <span className="text-muted-foreground italic">None</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={`gap-1 text-[11px] border ${iBadge.className}`}
                          >
                            {iBadge.icon}
                            {iBadge.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(
                                `/dashboard/student/${encodeURIComponent(s.student_number)}`
                              );
                            }}
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Edit Expiry Dialog ── */}
      <Dialog
        open={!!editStudent}
        onOpenChange={(open) => !open && setEditStudent(null)}
      >
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-purple-500" />
              Update Document Expiry
            </DialogTitle>
            <DialogDescription>
              {editStudent?.student_name} ({editStudent?.student_number})
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-4">
            {/* Passport Expiry */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                Passport Expiry Date
                {editStudent?.passport_id && (
                  <span className="text-xs text-muted-foreground font-mono">
                    ({editStudent.passport_id})
                  </span>
                )}
              </label>
              {editStudent?.passport_id ? (
                <Input
                  type="date"
                  value={editPassportExpiry}
                  onChange={(e) => setEditPassportExpiry(e.target.value)}
                />
              ) : (
                <p className="text-sm text-muted-foreground italic py-2">
                  No passport number recorded for this student.
                </p>
              )}
            </div>

            {/* Iqama Expiry */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <CreditCardIcon className="h-4 w-4 text-muted-foreground" />
                Iqama Expiry Date
                {editStudent?.iqama_number && (
                  <span className="text-xs text-muted-foreground font-mono">
                    ({editStudent.iqama_number})
                  </span>
                )}
              </label>
              {editStudent?.iqama_number ? (
                <Input
                  type="date"
                  value={editIqamaExpiry}
                  onChange={(e) => setEditIqamaExpiry(e.target.value)}
                />
              ) : (
                <p className="text-sm text-muted-foreground italic py-2">
                  No iqama number recorded for this student.
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditStudent(null)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* Simple credit card icon since we don't have it from lucide already imported */
function CreditCardIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect width="20" height="14" x="2" y="5" rx="2" />
      <line x1="2" x2="22" y1="10" y2="10" />
    </svg>
  );
}
