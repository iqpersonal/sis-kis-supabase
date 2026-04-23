"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
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
  Package,
  Search,
  Loader2,
  Plus,
  Upload,
  Wrench,
  Wind,
  School,
  Briefcase,
  Zap,
  Dumbbell,
  Shield,
  FlaskConical,
  UtensilsCrossed,
  MapPin,
  Car,
  MoreHorizontal,
  Pencil,
  Trash2,
  History,
  QrCode,
} from "lucide-react";
import { useAuth } from "@/context/auth-context";
import AssetLabelGenerator, { type AssetLabelItem } from "@/components/inventory/asset-label-generator";

/* ── Types ─────────────────────────────────────────────────────── */
type FACategory =
  | "ac"
  | "furniture_classroom"
  | "furniture_office"
  | "electrical"
  | "playground_sports"
  | "safety_security"
  | "laboratory"
  | "kitchen_cafeteria"
  | "signage"
  | "vehicles"
  | "other";

type FAStatus = "active" | "available" | "maintenance" | "retired" | "lost";
type FACondition = "excellent" | "good" | "fair" | "poor";

interface FAAsset {
  id: string;
  asset_id: string;
  category: FACategory;
  name: string;
  name_ar?: string;
  serial_number?: string;
  department?: string;
  purchase_date?: string;
  purchase_price?: number;
  warranty_expiry?: string;
  status: FAStatus;
  condition: FACondition;
  location?: string;
  branch?: string;
  notes?: string;
  useful_life_years?: number;
  salvage_value?: number;
  next_maintenance_date?: string;
  maintenance_interval_days?: number;
  created_at?: string;
  updated_by?: string;
}

interface FAStats {
  total: number;
  active: number;
  available: number;
  maintenance: number;
  retired: number;
  lost: number;
  warranty_expiring: number;
  maintenance_due: number;
  total_value: number;
  total_depreciation: number;
  total_book_value: number;
  by_category: Record<string, number>;
  by_branch: Record<string, number>;
}

/* ── Constants ──────────────────────────────────────────────────── */
const CATEGORY_LABELS: Record<FACategory, string> = {
  ac: "Air Conditioning",
  furniture_classroom: "Furniture — Classroom",
  furniture_office: "Furniture — Office",
  electrical: "Electrical Appliances",
  playground_sports: "Playground & Sports",
  safety_security: "Safety & Security",
  laboratory: "Laboratory Equipment",
  kitchen_cafeteria: "Kitchen & Cafeteria",
  signage: "Signage & Boards",
  vehicles: "Vehicles",
  other: "Other",
};

const CATEGORY_ICONS: Record<FACategory, React.ElementType> = {
  ac: Wind,
  furniture_classroom: School,
  furniture_office: Briefcase,
  electrical: Zap,
  playground_sports: Dumbbell,
  safety_security: Shield,
  laboratory: FlaskConical,
  kitchen_cafeteria: UtensilsCrossed,
  signage: MapPin,
  vehicles: Car,
  other: Package,
};

const STATUS_COLORS: Record<FAStatus, string> = {
  active: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  available: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
  maintenance: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
  retired: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  lost: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
};

const CONDITION_COLORS: Record<FACondition, string> = {
  excellent: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300",
  good: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  fair: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
  poor: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
};

const BRANCH_OPTIONS: Record<string, string> = {
  "0021-01": "Boys' School (0021-01)",
  "0021-02": "Girls' School (0021-02)",
};

const ALL_CATEGORIES: FACategory[] = [
  "ac", "furniture_classroom", "furniture_office", "electrical",
  "playground_sports", "safety_security", "laboratory",
  "kitchen_cafeteria", "signage", "vehicles", "other",
];

const EMPTY_FORM = {
  category: "furniture_classroom" as FACategory,
  name: "",
  name_ar: "",
  serial_number: "",
  department: "",
  purchase_date: "",
  purchase_price: "",
  warranty_expiry: "",
  condition: "good" as FACondition,
  status: "available" as FAStatus,
  location: "",
  branch: "",
  notes: "",
  useful_life_years: "",
  salvage_value: "",
  next_maintenance_date: "",
  maintenance_interval_days: "",
};

/* ── Page ──────────────────────────────────────────────────────── */
export default function FixedAssetsPage() {
  const { user, can } = useAuth();
  const canManage = can("fixed_assets.manage");

  const [stats, setStats] = useState<FAStats | null>(null);
  const [assets, setAssets] = useState<FAAsset[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<FACategory | "">("");
  const [statusFilter, setStatusFilter] = useState<FAStatus | "">("");
  const [branchFilter, setBranchFilter] = useState("");

  // Dialogs
  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showStatus, setShowStatus] = useState(false);
  const [showMaintenance, setShowMaintenance] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showCsv, setShowCsv] = useState(false);
  const [showLabels, setShowLabels] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<FAAsset | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [editForm, setEditForm] = useState({ ...EMPTY_FORM });

  const [newStatus, setNewStatus] = useState<FAStatus>("available");
  const [statusNotes, setStatusNotes] = useState("");

  const [maintDate, setMaintDate] = useState("");
  const [maintInterval, setMaintInterval] = useState("");
  const [maintNotes, setMaintNotes] = useState("");

  const [history, setHistory] = useState<Array<{ id: string; action: string; timestamp: string; performed_by: string; notes: string }>>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [csvText, setCsvText] = useState("");

  /* ── Data fetch ── */
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, assetsRes] = await Promise.all([
        fetch("/api/fixed-assets?action=stats"),
        fetch("/api/fixed-assets?action=assets"),
      ]);
      if (statsRes.ok) setStats(await statsRes.json());
      if (assetsRes.ok) {
        const d = await assetsRes.json();
        setAssets(d.assets || []);
      }
    } catch (err) {
      console.error("Failed to load fixed assets:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* ── Filtering ── */
  const filtered = assets.filter((a) => {
    if (categoryFilter && a.category !== categoryFilter) return false;
    if (statusFilter && a.status !== statusFilter) return false;
    if (branchFilter && a.branch !== branchFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        a.asset_id?.toLowerCase().includes(q) ||
        a.name?.toLowerCase().includes(q) ||
        a.name_ar?.toLowerCase().includes(q) ||
        a.location?.toLowerCase().includes(q) ||
        a.department?.toLowerCase().includes(q) ||
        a.serial_number?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  /* ── Post helper ── */
  async function post(body: Record<string, unknown>) {
    const res = await fetch("/api/fixed-assets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, performed_by: user?.email || "unknown" }),
    });
    return res;
  }

  /* ── Add asset ── */
  async function handleAdd() {
    if (!form.category || !form.name) return;
    setSaving(true);
    try {
      const res = await post({
        action: "create_asset",
        ...form,
        purchase_price: form.purchase_price ? Number(form.purchase_price) : null,
        useful_life_years: form.useful_life_years ? Number(form.useful_life_years) : null,
        salvage_value: form.salvage_value ? Number(form.salvage_value) : null,
        maintenance_interval_days: form.maintenance_interval_days ? Number(form.maintenance_interval_days) : null,
      });
      if (res.ok) {
        setShowAdd(false);
        setForm({ ...EMPTY_FORM });
        fetchData();
      }
    } finally { setSaving(false); }
  }

  /* ── Edit asset ── */
  function openEdit(asset: FAAsset) {
    setSelectedAsset(asset);
    setEditForm({
      category: asset.category,
      name: asset.name,
      name_ar: asset.name_ar || "",
      serial_number: asset.serial_number || "",
      department: asset.department || "",
      purchase_date: asset.purchase_date || "",
      purchase_price: asset.purchase_price != null ? String(asset.purchase_price) : "",
      warranty_expiry: asset.warranty_expiry || "",
      condition: asset.condition,
      status: asset.status,
      location: asset.location || "",
      branch: asset.branch || "",
      notes: asset.notes || "",
      useful_life_years: asset.useful_life_years != null ? String(asset.useful_life_years) : "",
      salvage_value: asset.salvage_value != null ? String(asset.salvage_value) : "",
      next_maintenance_date: asset.next_maintenance_date || "",
      maintenance_interval_days: asset.maintenance_interval_days != null ? String(asset.maintenance_interval_days) : "",
    });
    setShowEdit(true);
  }

  async function handleEdit() {
    if (!selectedAsset) return;
    setSaving(true);
    try {
      const res = await post({
        action: "update_asset",
        id: selectedAsset.id,
        ...editForm,
        purchase_price: editForm.purchase_price ? Number(editForm.purchase_price) : null,
        useful_life_years: editForm.useful_life_years ? Number(editForm.useful_life_years) : null,
        salvage_value: editForm.salvage_value ? Number(editForm.salvage_value) : null,
        maintenance_interval_days: editForm.maintenance_interval_days ? Number(editForm.maintenance_interval_days) : null,
      });
      if (res.ok) {
        setShowEdit(false);
        setSelectedAsset(null);
        fetchData();
      }
    } finally { setSaving(false); }
  }

  /* ── Status change ── */
  function openStatus(asset: FAAsset) {
    setSelectedAsset(asset);
    setNewStatus(asset.status);
    setStatusNotes("");
    setShowStatus(true);
  }

  async function handleStatusChange() {
    if (!selectedAsset) return;
    setSaving(true);
    try {
      const res = await post({
        action: "update_status",
        asset_id: selectedAsset.asset_id,
        status: newStatus,
        notes: statusNotes,
      });
      if (res.ok) {
        setShowStatus(false);
        setSelectedAsset(null);
        fetchData();
      }
    } finally { setSaving(false); }
  }

  /* ── Schedule maintenance ── */
  function openMaintenance(asset: FAAsset) {
    setSelectedAsset(asset);
    setMaintDate(asset.next_maintenance_date || "");
    setMaintInterval(asset.maintenance_interval_days != null ? String(asset.maintenance_interval_days) : "");
    setMaintNotes("");
    setShowMaintenance(true);
  }

  async function handleScheduleMaintenance() {
    if (!selectedAsset || !maintDate) return;
    setSaving(true);
    try {
      const res = await post({
        action: "schedule_maintenance",
        asset_id: selectedAsset.asset_id,
        next_maintenance_date: maintDate,
        maintenance_interval_days: maintInterval ? Number(maintInterval) : null,
        notes: maintNotes,
      });
      if (res.ok) {
        setShowMaintenance(false);
        setSelectedAsset(null);
        fetchData();
      }
    } finally { setSaving(false); }
  }

  /* ── History ── */
  async function openHistory(asset: FAAsset) {
    setSelectedAsset(asset);
    setShowHistory(true);
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/fixed-assets?action=history&asset_id=${encodeURIComponent(asset.asset_id)}`);
      if (res.ok) {
        const d = await res.json();
        setHistory(d.history || []);
      }
    } finally { setHistoryLoading(false); }
  }

  /* ── Delete ── */
  function openDelete(asset: FAAsset) {
    setSelectedAsset(asset);
    setShowDelete(true);
  }

  async function handleDelete() {
    if (!selectedAsset) return;
    setSaving(true);
    try {
      const res = await post({ action: "delete_asset", id: selectedAsset.id });
      if (res.ok) {
        setShowDelete(false);
        setSelectedAsset(null);
        fetchData();
      }
    } finally { setSaving(false); }
  }

  /* ── CSV Import ── */
  async function handleCsvImport() {
    if (!csvText.trim()) return;
    setSaving(true);
    try {
      const lines = csvText.trim().split("\n");
      const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
      const items = lines.slice(1).map((line) => {
        const vals = line.split(",").map((v) => v.trim());
        const obj: Record<string, string> = {};
        headers.forEach((h, i) => { obj[h] = vals[i] || ""; });
        return obj;
      });
      const res = await post({ action: "bulk_import", assets: items });
      const data = await res.json();
      if (res.ok) {
        setShowCsv(false);
        setCsvText("");
        fetchData();
        alert(`Imported ${data.imported} assets successfully.`);
      }
    } finally { setSaving(false); }
  }

  /* ── Loading ── */
  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  /* ── Render ── */
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Fixed Assets</h1>
          <p className="text-muted-foreground">
            Manage school physical assets — furniture, A/C, lab equipment, vehicles, and more
          </p>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowLabels(true)}>
              <QrCode className="mr-2 h-4 w-4" />
              Print Labels
            </Button>
            <Button variant="outline" onClick={() => setShowCsv(true)}>
              <Upload className="mr-2 h-4 w-4" />
              CSV Import
            </Button>
            <Button onClick={() => { setForm({ ...EMPTY_FORM }); setShowAdd(true); }}>
              <Plus className="mr-2 h-4 w-4" />
              Add Asset
            </Button>
          </div>
        )}
      </div>

      {/* KPI Cards */}
      {stats && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
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
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="text-2xl font-bold text-purple-600">{stats.maintenance_due}</div>
                <p className="text-xs text-muted-foreground">Maintenance Due</p>
              </CardContent>
            </Card>
          </div>

          {/* Financial KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="text-2xl font-bold">
                  {stats.total_value.toLocaleString()}{" "}
                  <span className="text-sm font-normal text-muted-foreground">SAR</span>
                </div>
                <p className="text-xs text-muted-foreground">Total Purchase Value</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="text-2xl font-bold text-emerald-600">
                  {stats.total_book_value.toLocaleString()}{" "}
                  <span className="text-sm font-normal text-muted-foreground">SAR</span>
                </div>
                <p className="text-xs text-muted-foreground">Current Book Value</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="text-2xl font-bold text-amber-600">
                  {stats.total_depreciation.toLocaleString()}{" "}
                  <span className="text-sm font-normal text-muted-foreground">SAR</span>
                </div>
                <p className="text-xs text-muted-foreground">Total Depreciation</p>
              </CardContent>
            </Card>
          </div>

          {/* Category breakdown cards */}
          {Object.keys(stats.by_category).length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {Object.entries(stats.by_category)
                .sort(([, a], [, b]) => b - a)
                .map(([cat, count]) => {
                  const Icon = CATEGORY_ICONS[cat as FACategory] || Package;
                  return (
                    <Card
                      key={cat}
                      className={`cursor-pointer hover:shadow-md transition-shadow ${categoryFilter === cat ? "ring-2 ring-primary" : ""}`}
                      onClick={() => setCategoryFilter(categoryFilter === cat ? "" : (cat as FACategory))}
                    >
                      <CardContent className="pt-4 pb-4 flex items-center gap-3">
                        <Icon className="h-7 w-7 text-muted-foreground" />
                        <div>
                          <div className="text-xl font-bold">{count}</div>
                          <p className="text-xs text-muted-foreground">
                            {CATEGORY_LABELS[cat as FACategory] || cat}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
            </div>
          )}
        </>
      )}

      {/* Assets Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <CardTitle>Assets ({filtered.length})</CardTitle>
            <div className="flex flex-wrap gap-2 items-center">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search assets..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 w-56"
                />
              </div>
              <select
                className="border rounded-md px-3 py-2 text-sm bg-background"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value as FACategory | "")}
              >
                <option value="">All Categories</option>
                {ALL_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                ))}
              </select>
              <select
                className="border rounded-md px-3 py-2 text-sm bg-background"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as FAStatus | "")}
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
                value={branchFilter}
                onChange={(e) => setBranchFilter(e.target.value)}
              >
                <option value="">All Branches</option>
                {Object.entries(BRANCH_OPTIONS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
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
                    <TableHead>Category</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Condition</TableHead>
                    <TableHead>Location / Dept.</TableHead>
                    <TableHead>Branch</TableHead>
                    <TableHead className="text-right">Purchase (SAR)</TableHead>
                    <TableHead>Next Maint.</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((asset) => {
                    const Icon = CATEGORY_ICONS[asset.category] || Package;
                    const maintDays = asset.next_maintenance_date
                      ? Math.ceil(
                          (new Date(asset.next_maintenance_date).getTime() - Date.now()) /
                            (1000 * 60 * 60 * 24)
                        )
                      : null;
                    return (
                      <TableRow key={asset.id}>
                        <TableCell className="font-mono text-sm">{asset.asset_id}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            <span className="text-sm">{CATEGORY_LABELS[asset.category] || asset.category}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{asset.name}</div>
                          {asset.name_ar && (
                            <div className="text-sm text-muted-foreground" dir="rtl">{asset.name_ar}</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={STATUS_COLORS[asset.status]}>
                            {asset.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={CONDITION_COLORS[asset.condition]}>
                            {asset.condition}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          <div>{asset.location || "—"}</div>
                          {asset.department && (
                            <div className="text-muted-foreground text-xs">{asset.department}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {BRANCH_OPTIONS[asset.branch || ""] || asset.branch || "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {asset.purchase_price != null
                            ? asset.purchase_price.toLocaleString()
                            : "—"}
                        </TableCell>
                        <TableCell>
                          {maintDays !== null ? (
                            maintDays < 0 ? (
                              <Badge variant="destructive">Overdue</Badge>
                            ) : maintDays <= 14 ? (
                              <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300">
                                {maintDays}d
                              </Badge>
                            ) : (
                              <span className="text-sm text-muted-foreground">{maintDays}d</span>
                            )
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openHistory(asset)}
                              title="View History"
                            >
                              <History className="h-4 w-4" />
                            </Button>
                            {canManage && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => openStatus(asset)}
                                  title="Change Status"
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => openMaintenance(asset)}
                                  title="Schedule Maintenance"
                                >
                                  <Wrench className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => openEdit(asset)}
                                  title="Edit"
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-destructive hover:text-destructive"
                                  onClick={() => openDelete(asset)}
                                  title="Delete"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </>
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Fixed Asset</DialogTitle>
            <DialogDescription>Record a new school physical asset</DialogDescription>
          </DialogHeader>
          <AssetForm form={form} onChange={(k, v) => setForm((prev) => ({ ...prev, [k]: v }))} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={saving || !form.name || !form.category}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save Asset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Asset Dialog ── */}
      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Asset — {selectedAsset?.asset_id}</DialogTitle>
            <DialogDescription>Update asset information</DialogDescription>
          </DialogHeader>
          <AssetForm form={editForm} onChange={(k, v) => setEditForm((prev) => ({ ...prev, [k]: v }))} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEdit(false)}>Cancel</Button>
            <Button onClick={handleEdit} disabled={saving || !editForm.name}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Status Change Dialog ── */}
      <Dialog open={showStatus} onOpenChange={setShowStatus}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Status — {selectedAsset?.asset_id}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium">New Status</label>
              <select
                className="w-full mt-1 border rounded-md px-3 py-2 text-sm bg-background"
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value as FAStatus)}
              >
                <option value="active">Active (In Use)</option>
                <option value="available">Available</option>
                <option value="maintenance">Under Maintenance</option>
                <option value="retired">Retired</option>
                <option value="lost">Lost</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Notes</label>
              <Input
                className="mt-1"
                placeholder="Reason for status change..."
                value={statusNotes}
                onChange={(e) => setStatusNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowStatus(false)}>Cancel</Button>
            <Button onClick={handleStatusChange} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Update Status
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Schedule Maintenance Dialog ── */}
      <Dialog open={showMaintenance} onOpenChange={setShowMaintenance}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule Maintenance — {selectedAsset?.asset_id}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium">Next Maintenance Date *</label>
              <Input
                className="mt-1"
                type="date"
                value={maintDate}
                onChange={(e) => setMaintDate(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Maintenance Interval (days)</label>
              <Input
                className="mt-1"
                type="number"
                placeholder="e.g. 90"
                value={maintInterval}
                onChange={(e) => setMaintInterval(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Notes</label>
              <Input
                className="mt-1"
                placeholder="Maintenance notes..."
                value={maintNotes}
                onChange={(e) => setMaintNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMaintenance(false)}>Cancel</Button>
            <Button onClick={handleScheduleMaintenance} disabled={saving || !maintDate}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── History Dialog ── */}
      <Dialog open={showHistory} onOpenChange={setShowHistory}>
        <DialogContent className="max-w-xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>History — {selectedAsset?.asset_id}</DialogTitle>
            <DialogDescription>{selectedAsset?.name}</DialogDescription>
          </DialogHeader>
          {historyLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : history.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No history recorded yet.</p>
          ) : (
            <div className="space-y-3">
              {history.map((h) => (
                <div key={h.id} className="border rounded-lg p-3 text-sm space-y-1">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="capitalize">{h.action.replace("_", " ")}</Badge>
                    <span className="text-muted-foreground text-xs">
                      {new Date(h.timestamp).toLocaleString()}
                    </span>
                  </div>
                  <p>{h.notes}</p>
                  <p className="text-xs text-muted-foreground">by {h.performed_by}</p>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm Dialog ── */}
      <Dialog open={showDelete} onOpenChange={setShowDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Asset</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{" "}
              <strong>{selectedAsset?.asset_id}</strong> — {selectedAsset?.name}?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDelete(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── CSV Import Dialog ── */}
      <Dialog open={showCsv} onOpenChange={setShowCsv}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>CSV Import</DialogTitle>
            <DialogDescription>
              Paste CSV data with headers: category, name, name_ar, serial_number, department,
              purchase_date, purchase_price, warranty_expiry, status, condition, location, branch,
              notes, useful_life_years, salvage_value
            </DialogDescription>
          </DialogHeader>
          <textarea
            className="w-full h-48 border rounded-md p-2 text-sm font-mono resize-y bg-background"
            placeholder="category,name,name_ar,purchase_date,purchase_price,branch..."
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCsv(false)}>Cancel</Button>
            <Button onClick={handleCsvImport} disabled={saving || !csvText.trim()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Label Generator ── */}
      <AssetLabelGenerator
        open={showLabels}
        onOpenChange={setShowLabels}
        title="Fixed Asset Labels"
        items={assets.map((a): AssetLabelItem => ({
          id: a.id,
          asset_id: a.asset_id,
          name: a.name,
          subtitle: a.name_ar || a.serial_number || undefined,
          detail: [a.department, a.location].filter(Boolean).join(" · ") || undefined,
          tag: BRANCH_OPTIONS[a.branch ?? ""] || a.branch || undefined,
        }))}
      />
    </div>
  );
}

/* ── Asset Form (shared between Add & Edit) ─────────────────────── */
interface AssetFormProps {
  form: typeof EMPTY_FORM;
  onChange: (key: string, value: string) => void;
}

function AssetForm({ form, onChange }: AssetFormProps) {
  const field = (label: string, key: keyof typeof EMPTY_FORM, type = "text", required = false) => (
    <div>
      <label className="text-sm font-medium">{label}{required && " *"}</label>
      <Input
        className="mt-1"
        type={type}
        value={form[key]}
        onChange={(e) => onChange(key, e.target.value)}
      />
    </div>
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
      {/* Category */}
      <div className="md:col-span-2">
        <label className="text-sm font-medium">Category *</label>
        <select
          className="w-full mt-1 border rounded-md px-3 py-2 text-sm bg-background"
          value={form.category}
          onChange={(e) => onChange("category", e.target.value)}
        >
          {ALL_CATEGORIES.map((c) => (
            <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
          ))}
        </select>
      </div>

      {field("Name (English) *", "name", "text", true)}
      {field("Name (Arabic)", "name_ar")}
      {field("Serial / Tag Number", "serial_number")}
      {field("Department / Room", "department")}
      {field("Purchase Date", "purchase_date", "date")}
      {field("Purchase Price (SAR)", "purchase_price", "number")}
      {field("Warranty Expiry", "warranty_expiry", "date")}

      {/* Condition */}
      <div>
        <label className="text-sm font-medium">Condition</label>
        <select
          className="w-full mt-1 border rounded-md px-3 py-2 text-sm bg-background"
          value={form.condition}
          onChange={(e) => onChange("condition", e.target.value)}
        >
          <option value="excellent">Excellent</option>
          <option value="good">Good</option>
          <option value="fair">Fair</option>
          <option value="poor">Poor</option>
        </select>
      </div>

      {/* Status */}
      <div>
        <label className="text-sm font-medium">Status</label>
        <select
          className="w-full mt-1 border rounded-md px-3 py-2 text-sm bg-background"
          value={form.status}
          onChange={(e) => onChange("status", e.target.value)}
        >
          <option value="available">Available</option>
          <option value="active">Active (In Use)</option>
          <option value="maintenance">Under Maintenance</option>
          <option value="retired">Retired</option>
          <option value="lost">Lost</option>
        </select>
      </div>

      {field("Location", "location")}

      {/* Branch */}
      <div>
        <label className="text-sm font-medium">Branch</label>
        <select
          className="w-full mt-1 border rounded-md px-3 py-2 text-sm bg-background"
          value={form.branch}
          onChange={(e) => onChange("branch", e.target.value)}
        >
          <option value="">— Select —</option>
          {Object.entries(BRANCH_OPTIONS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      {field("Useful Life (years)", "useful_life_years", "number")}
      {field("Salvage Value (SAR)", "salvage_value", "number")}
      {field("Next Maintenance Date", "next_maintenance_date", "date")}
      {field("Maintenance Interval (days)", "maintenance_interval_days", "number")}

      <div className="md:col-span-2">
        <label className="text-sm font-medium">Notes</label>
        <Input
          className="mt-1"
          value={form.notes}
          onChange={(e) => onChange("notes", e.target.value)}
          placeholder="Optional notes..."
        />
      </div>
    </div>
  );
}
