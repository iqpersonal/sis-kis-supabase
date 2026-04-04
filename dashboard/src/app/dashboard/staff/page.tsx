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
} from "@/components/ui/dialog";
import {
  Users,
  Search,
  Loader2,
  Mail,
  UserCheck,
  UserX,
  Building,
  Laptop,
} from "lucide-react";
import type { StaffMember, ITAsset } from "@/types/sis";

interface StaffStats {
  total: number;
  active: number;
  terminated: number;
  departments: number;
}

interface Department {
  id: string;
  Department_Code: string;
  A_Department_Desc: string | null;
  E_Department_Desc: string | null;
}

export default function StaffDirectoryPage() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [stats, setStats] = useState<StaffStats | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showActive, setShowActive] = useState(true);
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);
  const [staffAssets, setStaffAssets] = useState<ITAsset[]>([]);
  const [showDetail, setShowDetail] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const action = showActive ? "list" : "all";
      const [staffRes, statsRes, deptRes] = await Promise.all([
        fetch(`/api/staff?action=${action}`),
        fetch("/api/staff?action=stats"),
        fetch("/api/staff?action=departments"),
      ]);
      const staffData = await staffRes.json();
      const statsData = await statsRes.json();
      const deptData = await deptRes.json();
      setStaff(staffData.staff || []);
      setStats(statsData);
      setDepartments(deptData.departments || []);
    } catch (err) {
      console.error("Failed to load staff:", err);
    } finally {
      setLoading(false);
    }
  }, [showActive]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function openDetail(member: StaffMember) {
    setSelectedStaff(member);
    setShowDetail(true);
    try {
      const res = await fetch(
        `/api/staff?action=detail&id=${member.Staff_Number}`
      );
      const data = await res.json();
      setStaffAssets(data.assets || []);
    } catch {
      setStaffAssets([]);
    }
  }

  const filtered = staff.filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      s.E_Full_Name?.toLowerCase().includes(q) ||
      s.A_Full_Name?.toLowerCase().includes(q) ||
      s.Staff_Number?.toLowerCase().includes(q) ||
      s.E_Mail?.toLowerCase().includes(q) ||
      s.ID_Number?.toLowerCase().includes(q)
    );
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Staff Directory</h1>
        <p className="text-muted-foreground">
          View staff members, departments, and assigned IT equipment
        </p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4 pb-4 flex items-center gap-3">
              <Users className="h-8 w-8 text-muted-foreground" />
              <div>
                <div className="text-2xl font-bold">{stats.total}</div>
                <p className="text-xs text-muted-foreground">Total Staff</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4 flex items-center gap-3">
              <UserCheck className="h-8 w-8 text-green-600" />
              <div>
                <div className="text-2xl font-bold text-green-600">
                  {stats.active}
                </div>
                <p className="text-xs text-muted-foreground">Active</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4 flex items-center gap-3">
              <UserX className="h-8 w-8 text-red-600" />
              <div>
                <div className="text-2xl font-bold text-red-600">
                  {stats.terminated}
                </div>
                <p className="text-xs text-muted-foreground">Terminated</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4 flex items-center gap-3">
              <Building className="h-8 w-8 text-blue-600" />
              <div>
                <div className="text-2xl font-bold text-blue-600">
                  {stats.departments}
                </div>
                <p className="text-xs text-muted-foreground">Departments</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Department cards */}
      {departments.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {departments.map((d) => (
            <Card key={d.Department_Code} className="text-center">
              <CardContent className="pt-3 pb-3">
                <div className="text-sm font-medium">
                  {d.E_Department_Desc}
                </div>
                <div className="text-xs text-muted-foreground">
                  {d.A_Department_Desc}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Staff Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>
              Staff Members ({filtered.length})
            </CardTitle>
            <div className="flex gap-2 items-center">
              <div className="relative w-64">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search staff..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8"
                />
              </div>
              <Button
                variant={showActive ? "default" : "outline"}
                size="sm"
                onClick={() => setShowActive(true)}
              >
                Active
              </Button>
              <Button
                variant={!showActive ? "default" : "outline"}
                size="sm"
                onClick={() => setShowActive(false)}
              >
                All
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Staff #</TableHead>
                  <TableHead>Name (EN)</TableHead>
                  <TableHead>Name (AR)</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Gender</TableHead>
                  <TableHead>Nationality</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.slice(0, 100).map((s) => (
                  <TableRow
                    key={s.Staff_Number}
                    className="cursor-pointer hover:bg-accent/50"
                    onClick={() => openDetail(s)}
                  >
                    <TableCell className="font-mono text-sm">
                      {s.Staff_Number}
                    </TableCell>
                    <TableCell className="font-medium">
                      {s.E_Full_Name || "—"}
                    </TableCell>
                    <TableCell dir="rtl">{s.A_Full_Name || "—"}</TableCell>
                    <TableCell className="text-sm">
                      {s.E_Mail ? (
                        <span className="flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          {s.E_Mail}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      {s.Sex === "True" || s.Sex === "true"
                        ? "Male"
                        : s.Sex === "False" || s.Sex === "false"
                        ? "Female"
                        : "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {s.Primary_Nationality || "—"}
                    </TableCell>
                    <TableCell>
                      {s.is_active ? (
                        <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="destructive">Terminated</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm">
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {filtered.length > 100 && (
            <p className="text-sm text-muted-foreground text-center py-2">
              Showing 100 of {filtered.length} results. Use search to narrow
              down.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Staff Detail Dialog ── */}
      <Dialog open={showDetail} onOpenChange={setShowDetail}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedStaff?.E_Full_Name || selectedStaff?.A_Full_Name}
            </DialogTitle>
            <DialogDescription>
              Staff #{selectedStaff?.Staff_Number}
            </DialogDescription>
          </DialogHeader>
          {selectedStaff && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Name (EN):</span>
                  <p className="font-medium">
                    {selectedStaff.E_Full_Name || "—"}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Name (AR):</span>
                  <p className="font-medium" dir="rtl">
                    {selectedStaff.A_Full_Name || "—"}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Email:</span>
                  <p>{selectedStaff.E_Mail || "—"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Gender:</span>
                  <p>
                    {selectedStaff.Sex === "True" || selectedStaff.Sex === "true"
                      ? "Male"
                      : "Female"}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">ID Number:</span>
                  <p>{selectedStaff.ID_Number || "—"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Nationality:</span>
                  <p>{selectedStaff.Primary_Nationality || "—"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Birth Date:</span>
                  <p>{selectedStaff.Birth_Date || "—"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Status:</span>
                  <p>
                    {selectedStaff.is_active ? (
                      <Badge className="bg-green-100 text-green-800">
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="destructive">Terminated</Badge>
                    )}
                  </p>
                </div>
              </div>

              {/* Assigned IT Assets */}
              <div>
                <h3 className="font-semibold flex items-center gap-2 mb-2">
                  <Laptop className="h-4 w-4" />
                  Assigned IT Assets ({staffAssets.length})
                </h3>
                {staffAssets.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No IT assets assigned.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {staffAssets.map((a) => (
                      <div
                        key={a.id}
                        className="flex items-center justify-between border rounded-md px-3 py-2"
                      >
                        <div>
                          <span className="font-mono text-sm">
                            {a.asset_id}
                          </span>
                          <span className="ml-2 text-sm">
                            {a.brand} {a.model}
                          </span>
                        </div>
                        <Badge variant="secondary">{a.asset_type}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
