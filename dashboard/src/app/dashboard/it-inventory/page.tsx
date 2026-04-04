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
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Laptop,
  Monitor,
  Printer,
  Projector,
  Tablet,
  Phone,
  Wifi,
  HardDrive,
  Package,
  Search,
  Loader2,
  Plus,
  Upload,
  AlertTriangle,
  CheckCircle,
  Wrench,
  XCircle,
  ArrowRightLeft,
  RotateCcw,
} from "lucide-react";
import type { ITAsset, AssetType, AssetStatus, AssetCondition } from "@/types/sis";

/* ── type icon map ─────────────────────────────────────────────── */
const TYPE_ICONS: Record<AssetType, React.ElementType> = {
  laptop: Laptop,
  desktop: Monitor,
  printer: Printer,
  projector: Projector,
  tablet: Tablet,
  phone: Phone,
  network_device: Wifi,
  monitor: Monitor,
  other: Package,
};

const TYPE_LABELS: Record<AssetType, string> = {
  laptop: "Laptop",
  desktop: "Desktop",
  printer: "Printer",
  projector: "Projector",
  tablet: "Tablet",
  phone: "Phone",
  network_device: "Network Device",
  monitor: "Monitor",
  other: "Other",
};

const STATUS_COLORS: Record<AssetStatus, string> = {
  active: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  available: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
  maintenance: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
  retired: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  lost: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
};

const CONDITION_COLORS: Record<AssetCondition, string> = {
  excellent: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300",
  good: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  fair: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
  poor: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
};

interface Stats {
  total: number;
  active: number;
  available: number;
  maintenance: number;
  retired: number;
  lost: number;
  warranty_expiring: number;
  by_type: Record<string, number>;
  by_branch: Record<string, number>;
  total_value: number;
}

interface StaffMember {
  id: string;
  Staff_Number: string;
  E_Full_Name: string | null;
  A_Full_Name: string | null;
  E_Mail: string | null;
}

/* ── Page ──────────────────────────────────────────────────────── */
export default function ITInventoryPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [assets, setAssets] = useState<ITAsset[]>([]);
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<AssetType | "">("");
  const [statusFilter, setStatusFilter] = useState<AssetStatus | "">("");

  // Dialogs
  const [showAdd, setShowAdd] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [showReturn, setShowReturn] = useState(false);
  const [showCsv, setShowCsv] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<ITAsset | null>(null);
  const [saving, setSaving] = useState(false);

  // Add form
  const [form, setForm] = useState({
    asset_type: "laptop" as AssetType,
    brand: "",
    model: "",
    serial_number: "",
    purchase_date: "",
    purchase_price: "",
    warranty_expiry: "",
    condition: "good" as AssetCondition,
    location: "",
    branch: "",
    notes: "",
  });

  // Assign form
  const [assignStaff, setAssignStaff] = useState("");
  const [assignSearch, setAssignSearch] = useState("");

  // Return form
  const [returnCondition, setReturnCondition] = useState<AssetCondition>("good");
  const [returnNotes, setReturnNotes] = useState("");

  // CSV
  const [csvText, setCsvText] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, assetsRes, staffRes] = await Promise.all([
        fetch("/api/it-inventory?action=stats"),
        fetch("/api/it-inventory?action=assets"),
        fetch("/api/staff?action=list"),
      ]);
      const statsData = await statsRes.json();
      const assetsData = await assetsRes.json();
      const staffData = await staffRes.json();
      setStats(statsData);
      setAssets(assetsData.assets || []);
      setStaffList(staffData.staff || []);
    } catch (err) {
      console.error("Failed to load inventory:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Filtered assets ──
  const filtered = assets.filter((a) => {
    if (typeFilter && a.asset_type !== typeFilter) return false;
    if (statusFilter && a.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        a.asset_id?.toLowerCase().includes(q) ||
        a.brand?.toLowerCase().includes(q) ||
        a.model?.toLowerCase().includes(q) ||
        a.serial_number?.toLowerCase().includes(q) ||
        a.assigned_to_name?.toLowerCase().includes(q) ||
        a.location?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // ── Handlers ──

  async function handleAdd() {
    setSaving(true);
    try {
      const res = await fetch("/api/it-inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_asset",
          ...form,
          purchase_price: form.purchase_price ? Number(form.purchase_price) : null,
        }),
      });
      if (res.ok) {
        setShowAdd(false);
        setForm({
          asset_type: "laptop",
          brand: "",
          model: "",
          serial_number: "",
          purchase_date: "",
          purchase_price: "",
          warranty_expiry: "",
          condition: "good",
          location: "",
          branch: "",
          notes: "",
        });
        fetchData();
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleAssign() {
    if (!selectedAsset || !assignStaff) return;
    setSaving(true);
    try {
      const staff = staffList.find((s) => s.Staff_Number === assignStaff);
      const res = await fetch("/api/it-inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "assign_asset",
          asset_id: selectedAsset.asset_id,
          staff_number: assignStaff,
          staff_name: staff?.E_Full_Name || assignStaff,
        }),
      });
      if (res.ok) {
        setShowAssign(false);
        setSelectedAsset(null);
        setAssignStaff("");
        fetchData();
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleReturn() {
    if (!selectedAsset) return;
    setSaving(true);
    try {
      const res = await fetch("/api/it-inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "return_asset",
          asset_id: selectedAsset.asset_id,
          condition: returnCondition,
          notes: returnNotes,
        }),
      });
      if (res.ok) {
        setShowReturn(false);
        setSelectedAsset(null);
        setReturnNotes("");
        fetchData();
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleCsvImport() {
    if (!csvText.trim()) return;
    setSaving(true);
    try {
      const lines = csvText.trim().split("\n");
      const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
      const items = lines.slice(1).map((line) => {
        const vals = line.split(",").map((v) => v.trim());
        const obj: Record<string, string> = {};
        headers.forEach((h, i) => {
          obj[h] = vals[i] || "";
        });
        return obj;
      });

      const res = await fetch("/api/it-inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "bulk_import", assets: items }),
      });
      const data = await res.json();
      if (res.ok) {
        setShowCsv(false);
        setCsvText("");
        fetchData();
        alert(`Imported ${data.imported} assets successfully.`);
      }
    } finally {
      setSaving(false);
    }
  }

  const filteredStaff = staffList.filter((s) => {
    if (!assignSearch) return true;
    const q = assignSearch.toLowerCase();
    return (
      s.E_Full_Name?.toLowerCase().includes(q) ||
      s.A_Full_Name?.toLowerCase().includes(q) ||
      s.Staff_Number?.toLowerCase().includes(q) ||
      s.E_Mail?.toLowerCase().includes(q)
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">IT Inventory</h1>
          <p className="text-muted-foreground">
            Manage IT equipment, assignments, and warranties
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowCsv(true)}>
            <Upload className="mr-2 h-4 w-4" />
            CSV Import
          </Button>
          <Button onClick={() => setShowAdd(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Asset
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="text-2xl font-bold">{stats.total}</div>
              <p className="text-xs text-muted-foreground">Total Assets</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="text-2xl font-bold text-blue-600">{stats.active}</div>
              <p className="text-xs text-muted-foreground">In Use</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="text-2xl font-bold text-green-600">{stats.available}</div>
              <p className="text-xs text-muted-foreground">Available</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="text-2xl font-bold text-yellow-600">{stats.maintenance}</div>
              <p className="text-xs text-muted-foreground">Maintenance</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="text-2xl font-bold text-gray-500">{stats.retired}</div>
              <p className="text-xs text-muted-foreground">Retired</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="text-2xl font-bold text-red-600">{stats.lost}</div>
              <p className="text-xs text-muted-foreground">Lost</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="text-2xl font-bold text-orange-600">{stats.warranty_expiring}</div>
              <p className="text-xs text-muted-foreground">Warranty Expiring</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Type breakdown cards */}
      {stats && Object.keys(stats.by_type).length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {Object.entries(stats.by_type)
            .sort(([, a], [, b]) => b - a)
            .map(([type, count]) => {
              const Icon = TYPE_ICONS[type as AssetType] || Package;
              return (
                <Card
                  key={type}
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() =>
                    setTypeFilter(typeFilter === type ? "" : (type as AssetType))
                  }
                >
                  <CardContent className="pt-4 pb-4 flex items-center gap-3">
                    <Icon className="h-8 w-8 text-muted-foreground" />
                    <div>
                      <div className="text-xl font-bold">{count}</div>
                      <p className="text-xs text-muted-foreground">
                        {TYPE_LABELS[type as AssetType] || type}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
        </div>
      )}

      {/* Filters + Search */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Assets ({filtered.length})</CardTitle>
            <div className="flex gap-2 items-center">
              <div className="relative w-64">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search assets..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8"
                />
              </div>
              <select
                className="border rounded-md px-3 py-2 text-sm bg-background"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as AssetStatus | "")}
              >
                <option value="">All Status</option>
                <option value="active">In Use</option>
                <option value="available">Available</option>
                <option value="maintenance">Maintenance</option>
                <option value="retired">Retired</option>
                <option value="lost">Lost</option>
              </select>
              <select
                className="border rounded-md px-3 py-2 text-sm bg-background"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as AssetType | "")}
              >
                <option value="">All Types</option>
                {Object.entries(TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">No assets found</p>
              <p className="text-sm">
                {assets.length === 0
                  ? "Add your first asset or import via CSV."
                  : "Try adjusting your filters."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Asset ID</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Brand / Model</TableHead>
                    <TableHead>Serial</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Condition</TableHead>
                    <TableHead>Assigned To</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Warranty</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((asset) => {
                    const Icon = TYPE_ICONS[asset.asset_type] || Package;
                    const warrantyDays = asset.warranty_expiry
                      ? Math.ceil(
                          (new Date(asset.warranty_expiry).getTime() - Date.now()) /
                            (1000 * 60 * 60 * 24)
                        )
                      : null;
                    return (
                      <TableRow key={asset.id}>
                        <TableCell className="font-mono text-sm">
                          {asset.asset_id}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Icon className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm">
                              {TYPE_LABELS[asset.asset_type] || asset.asset_type}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{asset.brand}</div>
                          <div className="text-sm text-muted-foreground">
                            {asset.model}
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {asset.serial_number}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={STATUS_COLORS[asset.status]}
                          >
                            {asset.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={CONDITION_COLORS[asset.condition]}
                          >
                            {asset.condition}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {asset.assigned_to_name || (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {asset.location || "—"}
                        </TableCell>
                        <TableCell>
                          {warrantyDays !== null ? (
                            warrantyDays < 0 ? (
                              <Badge variant="destructive">Expired</Badge>
                            ) : warrantyDays <= 30 ? (
                              <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300">
                                {warrantyDays}d left
                              </Badge>
                            ) : (
                              <span className="text-sm text-muted-foreground">
                                {warrantyDays}d
                              </span>
                            )
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {asset.status !== "active" &&
                              asset.status !== "retired" &&
                              asset.status !== "lost" && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedAsset(asset);
                                    setShowAssign(true);
                                  }}
                                  title="Assign"
                                >
                                  <ArrowRightLeft className="h-4 w-4" />
                                </Button>
                              )}
                            {asset.assigned_to && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setSelectedAsset(asset);
                                  setShowReturn(true);
                                }}
                                title="Return"
                              >
                                <RotateCcw className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
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

      {/* ── Add Asset Dialog ── */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New Asset</DialogTitle>
            <DialogDescription>
              Enter the details for the new IT asset.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Type *</label>
                <select
                  className="w-full border rounded-md px-3 py-2 text-sm bg-background mt-1"
                  value={form.asset_type}
                  onChange={(e) =>
                    setForm({ ...form, asset_type: e.target.value as AssetType })
                  }
                >
                  {Object.entries(TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Condition</label>
                <select
                  className="w-full border rounded-md px-3 py-2 text-sm bg-background mt-1"
                  value={form.condition}
                  onChange={(e) =>
                    setForm({ ...form, condition: e.target.value as AssetCondition })
                  }
                >
                  <option value="excellent">Excellent</option>
                  <option value="good">Good</option>
                  <option value="fair">Fair</option>
                  <option value="poor">Poor</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Brand *</label>
              <Input
                value={form.brand}
                onChange={(e) => setForm({ ...form, brand: e.target.value })}
                placeholder="e.g. Dell, HP, Lenovo"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Model *</label>
              <Input
                value={form.model}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
                placeholder="e.g. Latitude 5540"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Serial Number *</label>
              <Input
                value={form.serial_number}
                onChange={(e) =>
                  setForm({ ...form, serial_number: e.target.value })
                }
                placeholder="e.g. ABC123XYZ"
                className="mt-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Purchase Date</label>
                <Input
                  type="date"
                  value={form.purchase_date}
                  onChange={(e) =>
                    setForm({ ...form, purchase_date: e.target.value })
                  }
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Purchase Price (SAR)</label>
                <Input
                  type="number"
                  value={form.purchase_price}
                  onChange={(e) =>
                    setForm({ ...form, purchase_price: e.target.value })
                  }
                  placeholder="e.g. 3500"
                  className="mt-1"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Warranty Expiry</label>
                <Input
                  type="date"
                  value={form.warranty_expiry}
                  onChange={(e) =>
                    setForm({ ...form, warranty_expiry: e.target.value })
                  }
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Branch</label>
                <select
                  className="w-full border rounded-md px-3 py-2 text-sm bg-background mt-1"
                  value={form.branch}
                  onChange={(e) => setForm({ ...form, branch: e.target.value })}
                >
                  <option value="">Select branch</option>
                  <option value="0021-01">0021-01</option>
                  <option value="0021-02">0021-02</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Location</label>
              <Input
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                placeholder="e.g. Room 201, IT Office, Lab 3"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Notes</label>
              <Input
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Optional notes"
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAdd}
              disabled={saving || !form.brand || !form.model || !form.serial_number}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Add Asset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Assign Dialog ── */}
      <Dialog open={showAssign} onOpenChange={setShowAssign}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Assign Asset</DialogTitle>
            <DialogDescription>
              Assign <strong>{selectedAsset?.asset_id}</strong> ({selectedAsset?.brand}{" "}
              {selectedAsset?.model}) to a staff member.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search staff..."
                value={assignSearch}
                onChange={(e) => setAssignSearch(e.target.value)}
                className="pl-8"
              />
            </div>
            <div className="max-h-60 overflow-y-auto border rounded-md">
              {filteredStaff.slice(0, 50).map((s) => (
                <div
                  key={s.Staff_Number}
                  className={`px-3 py-2 cursor-pointer hover:bg-accent flex items-center justify-between ${
                    assignStaff === s.Staff_Number ? "bg-accent" : ""
                  }`}
                  onClick={() => setAssignStaff(s.Staff_Number)}
                >
                  <div>
                    <div className="font-medium text-sm">
                      {s.E_Full_Name || s.A_Full_Name || s.Staff_Number}
                    </div>
                    <div className="text-xs text-muted-foreground">{s.E_Mail}</div>
                  </div>
                  {assignStaff === s.Staff_Number && (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  )}
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAssign(false)}>
              Cancel
            </Button>
            <Button onClick={handleAssign} disabled={saving || !assignStaff}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Return Dialog ── */}
      <Dialog open={showReturn} onOpenChange={setShowReturn}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Return Asset</DialogTitle>
            <DialogDescription>
              Return <strong>{selectedAsset?.asset_id}</strong> from{" "}
              {selectedAsset?.assigned_to_name || "current holder"}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Condition on return</label>
              <select
                className="w-full border rounded-md px-3 py-2 text-sm bg-background mt-1"
                value={returnCondition}
                onChange={(e) =>
                  setReturnCondition(e.target.value as AssetCondition)
                }
              >
                <option value="excellent">Excellent</option>
                <option value="good">Good</option>
                <option value="fair">Fair</option>
                <option value="poor">Poor</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Notes</label>
              <Input
                value={returnNotes}
                onChange={(e) => setReturnNotes(e.target.value)}
                placeholder="Optional notes about the return"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReturn(false)}>
              Cancel
            </Button>
            <Button onClick={handleReturn} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Confirm Return
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── CSV Import Dialog ── */}
      <Dialog open={showCsv} onOpenChange={setShowCsv}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>CSV Bulk Import</DialogTitle>
            <DialogDescription>
              Paste CSV data with headers. Required columns:{" "}
              <code>asset_type, brand, model, serial_number</code>. Optional:{" "}
              <code>
                purchase_date, purchase_price, warranty_expiry, condition,
                location, branch, notes
              </code>
            </DialogDescription>
          </DialogHeader>
          <textarea
            className="w-full h-48 border rounded-md p-3 text-sm font-mono bg-background"
            placeholder={`asset_type,brand,model,serial_number,location,branch\nlaptop,Dell,Latitude 5540,ABC123,Room 201,0021-01\nprinter,HP,LaserJet Pro,XYZ789,IT Office,0021-01`}
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCsv(false)}>
              Cancel
            </Button>
            <Button onClick={handleCsvImport} disabled={saving || !csvText.trim()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
