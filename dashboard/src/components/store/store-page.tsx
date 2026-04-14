"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Package, Search, Loader2, Plus, Upload, AlertTriangle, CheckCircle,
  XCircle, ClipboardList, BarChart3, Truck, Minus, Send, Eye,
  FileDown, PackagePlus, Image as ImageIcon, Camera, Trash2, Sparkles, ScanBarcode, QrCode,
  Calendar, TrendingDown, TrendingUp, ArrowUpDown, Printer, Users, Hash,
} from "lucide-react";
import type { StoreItem, StoreRequest, StoreTransaction, StoreRequestItem } from "@/types/sis";
import type { StoreConfig } from "@/lib/store-config";
import { useAuth } from "@/context/auth-context";
import { exportToCSV } from "@/lib/export-csv";
import { uploadStoreImage, uploadStoreImageFromUrl, deleteStoreImage } from "@/lib/store-image";
import LabelGenerator from "@/components/store/label-generator";

/* ─── Props ───────────────────────────────────────────────────── */
interface StorePageProps {
  storeConfig: StoreConfig;
  apiBase: string;
}

/* ─── Helpers ─────────────────────────────────────────────────── */
interface StaffMember {
  Staff_Number: string;
  E_Full_Name: string | null;
}

type Stats = {
  total_items: number;
  total_quantity: number;
  low_stock: number;
  out_of_stock: number;
  by_category: Record<string, number>;
  pending_requests: number;
};

const STOCK_BADGE = (qty: number, reorder: number) => {
  if (qty === 0) return <Badge variant="destructive">Out of Stock</Badge>;
  if (reorder > 0 && qty <= reorder) return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300">Low Stock</Badge>;
  return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">In Stock</Badge>;
};

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
  approved: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  partially_approved: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
  issued: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
};

/* ─── Main Component ──────────────────────────────────────────── */
export default function StorePage({ storeConfig: cfg, apiBase }: StorePageProps) {
  const { user } = useAuth();
  const [tab, setTab] = useState<"inventory" | "requests" | "history" | "reports">("inventory");
  const [loading, setLoading] = useState(true);

  // Data
  const [stats, setStats] = useState<Stats | null>(null);
  const [items, setItems] = useState<StoreItem[]>([]);
  const [requests, setRequests] = useState<StoreRequest[]>([]);
  const [transactions, setTransactions] = useState<StoreTransaction[]>([]);
  const [staffList, setStaffList] = useState<StaffMember[]>([]);

  // Filters
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState("all");
  const [reqStatusFilter, setReqStatusFilter] = useState("all");
  const [txnTypeFilter, setTxnTypeFilter] = useState("all");

  // Dialogs
  const [showAdd, setShowAdd] = useState(false);
  const [showReceive, setShowReceive] = useState(false);
  const [showCsv, setShowCsv] = useState(false);
  const [showRequest, setShowRequest] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [showLabels, setShowLabels] = useState(false);
  const [editItem, setEditItem] = useState<StoreItem | null>(null);

  // Form state — Add Item
  const [addForm, setAddForm] = useState({ name: "", name_ar: "", category: cfg.categories[0] as string, unit: "piece", quantity: 0, reorder_level: 5, location: "", branch: "", notes: "", barcode: "" });

  // Image search state
  const [imgSearchResults, setImgSearchResults] = useState<string[]>([]);
  const [imgSearching, setImgSearching] = useState(false);
  const [imgUploading, setImgUploading] = useState(false);
  const [imgError, setImgError] = useState("");

  // Form state — Receive Stock
  const [receiveForm, setReceiveForm] = useState({ item_id: "", quantity: 1, notes: "" });
  const [receiveItemName, setReceiveItemName] = useState("");

  // Form state — Submit Request
  const [reqForm, setReqForm] = useState<{ staff: string; staffName: string; items: { item_id: string; name: string; qty: number }[]; notes: string }>({ staff: "", staffName: "", items: [], notes: "" });

  // Form state — Review Request
  const [reviewReq, setReviewReq] = useState<StoreRequest | null>(null);
  const [reviewItems, setReviewItems] = useState<StoreRequestItem[]>([]);

  // CSV
  const [csvText, setCsvText] = useState("");

  // Saving
  const [saving, setSaving] = useState(false);

  /* ── Fetch ───────────────────────────────────────────────────── */
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const bust = `&_t=${Date.now()}`;
      const [statsRes, itemsRes, reqRes, txnRes, staffRes] = await Promise.all([
        fetch(`${apiBase}?action=stats${bust}`),
        fetch(`${apiBase}?action=items${bust}`),
        fetch(`${apiBase}?action=requests${bust}`),
        fetch(`${apiBase}?action=transactions${bust}`),
        fetch(`/api/staff?action=list${bust}`),
      ]);
      const [statsData, itemsData, reqData, txnData, staffData] = await Promise.all([
        statsRes.json(),
        itemsRes.json(),
        reqRes.json(),
        txnRes.json(),
        staffRes.json(),
      ]);
      setStats(statsData);
      setItems(itemsData.items || []);
      setRequests(reqData.requests || []);
      setTransactions(txnData.transactions || []);
      setStaffList(staffData.staff || []);
    } catch (e) {
      console.error("Failed to fetch store data:", e);
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* ── POST helper ─────────────────────────────────────────────── */
  const postAction = async (action: string, payload: Record<string, unknown>) => {
    setSaving(true);
    try {
      const res = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      return data;
    } finally {
      setSaving(false);
    }
  };

  /* ── Handlers ────────────────────────────────────────────────── */
  const handleAddItem = async () => {
    await postAction("create_item", addForm);
    setShowAdd(false);
    setAddForm({ name: "", name_ar: "", category: cfg.categories[0] as string, unit: "piece", quantity: 0, reorder_level: 5, location: "", branch: "", notes: "", barcode: "" });
    setImgSearchResults([]);
    fetchData();
  };

  const handleEditItem = async () => {
    if (!editItem) return;
    await postAction("update_item", { id: editItem.id, name: editItem.name, name_ar: editItem.name_ar, category: editItem.category, unit: editItem.unit, reorder_level: editItem.reorder_level, location: editItem.location, branch: editItem.branch, notes: editItem.notes, is_active: editItem.is_active, barcode: editItem.barcode || "", image_url: editItem.image_url || "", custom_image_url: editItem.custom_image_url || "" });
    setEditItem(null);
    setImgSearchResults([]);
    fetchData();
  };

  /* ── Image search ────────────────────────────────────────────── */
  const handleImageSearch = async (barcode?: string, query?: string) => {
    if (!barcode && !query) return;
    setImgSearching(true);
    setImgSearchResults([]);
    setImgError("");
    try {
      const res = await fetch("/api/store-image-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ barcode: barcode || undefined, query: query || undefined }),
      });
      const data = await res.json();
      const imgs = data.images || [];
      setImgSearchResults(imgs);
      if (imgs.length === 0) setImgError("No images found for this search.");
    } catch {
      setImgError("Image search failed. Please try again.");
    } finally {
      setImgSearching(false);
    }
  };

  const handleSelectSearchImage = async (imageUrl: string, item: StoreItem) => {
    setImgUploading(true);
    setImgError("");
    try {
      const url = await uploadStoreImageFromUrl(cfg.type, item.id, "catalog", imageUrl);
      setEditItem((prev) => prev ? { ...prev, image_url: url } : prev);
      setImgSearchResults([]);
    } catch {
      setImgError("Failed to save image. Please try another.");
    } finally {
      setImgUploading(false);
    }
  };

  const handleUploadCustomImage = async (file: File, item: StoreItem) => {
    setImgUploading(true);
    setImgError("");
    try {
      const url = await uploadStoreImage(cfg.type, item.id, "custom", file);
      setEditItem((prev) => prev ? { ...prev, custom_image_url: url } : prev);
    } catch {
      setImgError("Failed to upload image. Please try again.");
    } finally {
      setImgUploading(false);
    }
  };

  const handleRemoveImage = async (slot: "catalog" | "custom", item: StoreItem) => {
    setImgError("");
    try {
      await deleteStoreImage(cfg.type, item.id, slot);
      if (slot === "catalog") setEditItem((prev) => prev ? { ...prev, image_url: "" } : prev);
      else setEditItem((prev) => prev ? { ...prev, custom_image_url: "" } : prev);
    } catch {
      setImgError("Failed to remove image. Please try again.");
    }
  };

  const handleReceive = async () => {
    await postAction("receive_stock", receiveForm);
    setShowReceive(false);
    setReceiveForm({ item_id: "", quantity: 1, notes: "" });
    setReceiveItemName("");
    fetchData();
  };

  const handleCsvImport = async () => {
    const lines = csvText.trim().split("\n").filter(Boolean);
    if (lines.length < 2) return;
    const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
    const parsed = lines.slice(1).map((line) => {
      const vals = line.split(",").map((s) => s.trim());
      const obj: Record<string, string | number> = {};
      headers.forEach((h, i) => { obj[h] = vals[i] || ""; });
      // Coerce numeric fields
      if (typeof obj.quantity === "string") obj.quantity = parseInt(obj.quantity as string) || 0;
      if (typeof obj.reorder_level === "string") obj.reorder_level = parseInt(obj.reorder_level as string) || 0;
      if (!obj.category) obj.category = "other";
      if (!obj.unit) obj.unit = "piece";
      return obj;
    });
    await postAction("bulk_import", { items: parsed });
    setShowCsv(false);
    setCsvText("");
    fetchData();
  };

  const handleSubmitRequest = async () => {
    await postAction("submit_request", {
      requested_by: reqForm.staff,
      requested_by_name: reqForm.staffName,
      items: reqForm.items.map((i) => ({ item_id: i.item_id, name: i.name, qty_requested: i.qty })),
      notes: reqForm.notes,
    });
    setShowRequest(false);
    setReqForm({ staff: "", staffName: "", items: [], notes: "" });
    fetchData();
  };

  const handleApprove = async (status: "approved" | "partially_approved" | "rejected") => {
    if (!reviewReq) return;
    await postAction("approve_request", { id: reviewReq.id, status, items: reviewItems, reviewed_by: user?.uid || "unknown", reviewed_by_name: user?.email || "Unknown" });
    setShowReview(false);
    setReviewReq(null);
    fetchData();
  };

  const handleIssue = async (reqId: string) => {
    await postAction("issue_request", { id: reqId, issued_by: user?.uid || "unknown", issued_by_name: user?.email || "Unknown" });
    fetchData();
  };

  /* ── Filtered data ───────────────────────────────────────────── */
  const filteredItems = items.filter((i) => {
    if (categoryFilter !== "all" && i.category !== categoryFilter) return false;
    if (stockFilter === "low" && (i.quantity === 0 || i.quantity > i.reorder_level)) return false;
    if (stockFilter === "out" && i.quantity !== 0) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!i.name.toLowerCase().includes(q) && !i.item_id.toLowerCase().includes(q) && !(i.name_ar || "").toLowerCase().includes(q)) return false;
    }
    return i.is_active !== false;
  });

  const filteredRequests = requests.filter((r) => {
    if (reqStatusFilter !== "all" && r.status !== reqStatusFilter) return false;
    return true;
  });

  const filteredTransactions = transactions.filter((t) => {
    if (txnTypeFilter !== "all" && t.type !== txnTypeFilter) return false;
    return true;
  });

  /* ── Loading ─────────────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading {cfg.label}...
      </div>
    );
  }

  /* ── Tab bar ─────────────────────────────────────────────────── */
  const tabs = [
    { key: "inventory" as const, label: "Inventory", icon: Package },
    { key: "requests" as const, label: "Requests", icon: ClipboardList, badge: stats?.pending_requests },
    { key: "history" as const, label: "Issue History", icon: Truck },
    { key: "reports" as const, label: "Reports", icon: BarChart3 },
  ];

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between no-print">
        <div>
          <h1 className="text-2xl font-bold">{cfg.label}</h1>
          <p className="text-muted-foreground">Manage inventory, requests, and stock movements</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-muted p-1 no-print">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${tab === t.key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            <t.icon className="h-4 w-4" />
            {t.label}
            {t.badge ? <Badge variant="destructive" className="ml-1 h-5 min-w-[20px] px-1.5 text-xs">{t.badge}</Badge> : null}
          </button>
        ))}
      </div>

      {/* ═══════════════ TAB: INVENTORY ═══════════════ */}
      {tab === "inventory" && (
        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Total Items</p><p className="text-2xl font-bold">{stats?.total_items ?? 0}</p></CardContent></Card>
            <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Total Quantity</p><p className="text-2xl font-bold">{stats?.total_quantity ?? 0}</p></CardContent></Card>
            <Card className="border-yellow-200 dark:border-yellow-800"><CardContent className="pt-6"><p className="text-sm text-yellow-600">Low Stock</p><p className="text-2xl font-bold text-yellow-600">{stats?.low_stock ?? 0}</p></CardContent></Card>
            <Card className="border-red-200 dark:border-red-800"><CardContent className="pt-6"><p className="text-sm text-red-600">Out of Stock</p><p className="text-2xl font-bold text-red-600">{stats?.out_of_stock ?? 0}</p></CardContent></Card>
            <Card className="border-blue-200 dark:border-blue-800"><CardContent className="pt-6"><p className="text-sm text-blue-600">Pending Requests</p><p className="text-2xl font-bold text-blue-600">{stats?.pending_requests ?? 0}</p></CardContent></Card>
          </div>

          {/* Category breakdown */}
          {stats?.by_category && Object.keys(stats.by_category).length > 0 && (
            <div className="flex flex-wrap gap-2">
              {Object.entries(stats.by_category).map(([cat, count]) => (
                <button key={cat} onClick={() => setCategoryFilter(cat === categoryFilter ? "all" : cat)} className={`rounded-full border px-3 py-1 text-sm transition-colors ${categoryFilter === cat ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80"}`}>
                  {cfg.categoryLabels[cat] || cat} ({count})
                </button>
              ))}
              {categoryFilter !== "all" && (
                <button onClick={() => setCategoryFilter("all")} className="rounded-full border px-3 py-1 text-sm text-muted-foreground hover:bg-muted">Clear</button>
              )}
            </div>
          )}

          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search items..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
            </div>
            <select value={stockFilter} onChange={(e) => setStockFilter(e.target.value)} className="rounded-md border bg-background px-3 py-2 text-sm">
              <option value="all">All Stock</option>
              <option value="low">Low Stock</option>
              <option value="out">Out of Stock</option>
            </select>
            <Button onClick={() => setShowAdd(true)} size="sm"><Plus className="mr-1 h-4 w-4" /> Add Item</Button>
            <Button onClick={() => setShowLabels(true)} variant="outline" size="sm"><QrCode className="mr-1 h-4 w-4" /> QR Labels</Button>
            <Button onClick={() => setShowCsv(true)} variant="outline" size="sm"><Upload className="mr-1 h-4 w-4" /> CSV Import</Button>
          </div>

          {/* Items table */}
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12"></TableHead>
                    <TableHead>Item ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Barcode</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead className="text-right">In Stock</TableHead>
                    <TableHead className="text-right">Reorder</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredItems.length === 0 ? (
                    <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground">No items found</TableCell></TableRow>
                  ) : filteredItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        {(item.image_url || item.custom_image_url) ? (
                          <img src={item.image_url || item.custom_image_url} alt="" className="h-8 w-8 rounded object-cover" />
                        ) : (
                          <div className="flex h-8 w-8 items-center justify-center rounded bg-muted"><ImageIcon className="h-4 w-4 text-muted-foreground" /></div>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{item.item_id}</TableCell>
                      <TableCell className="font-medium"><button className="text-left hover:underline hover:text-primary transition-colors" onClick={() => setEditItem({ ...item })}>{item.name}</button></TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{item.barcode || "—"}</TableCell>
                      <TableCell><Badge variant="outline">{cfg.categoryLabels[item.category] || item.category}</Badge></TableCell>
                      <TableCell>{item.unit}</TableCell>
                      <TableCell className="text-right font-semibold">{item.quantity}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{item.reorder_level}</TableCell>
                      <TableCell>{STOCK_BADGE(item.quantity, item.reorder_level)}</TableCell>
                      <TableCell className="text-muted-foreground">{item.location}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" title="Receive Stock" onClick={() => { setReceiveForm({ item_id: item.item_id, quantity: 1, notes: "" }); setReceiveItemName(item.name); setShowReceive(true); }}>
                            <PackagePlus className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" title="Edit" onClick={() => setEditItem({ ...item })}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ═══════════════ TAB: REQUESTS ═══════════════ */}
      {tab === "requests" && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            <select value={reqStatusFilter} onChange={(e) => setReqStatusFilter(e.target.value)} className="rounded-md border bg-background px-3 py-2 text-sm">
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="partially_approved">Partially Approved</option>
              <option value="rejected">Rejected</option>
              <option value="issued">Issued</option>
            </select>
            <Button onClick={() => setShowRequest(true)} size="sm"><Send className="mr-1 h-4 w-4" /> New Request</Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Request ID</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Requester</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRequests.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No requests found</TableCell></TableRow>
                  ) : filteredRequests.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs">{r.request_id}</TableCell>
                      <TableCell>{new Date(r.requested_at).toLocaleDateString()}</TableCell>
                      <TableCell>{r.requested_by_name || r.requested_by}</TableCell>
                      <TableCell>{r.items.length} item(s)</TableCell>
                      <TableCell><Badge className={STATUS_BADGE[r.status] || ""}>{r.status.replace("_", " ")}</Badge></TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {r.status === "pending" && (
                            <Button size="sm" variant="outline" onClick={() => { setReviewReq(r); setReviewItems(r.items.map((i) => ({ ...i, qty_approved: i.qty_requested }))); setShowReview(true); }}>
                              <CheckCircle className="mr-1 h-4 w-4" /> Review
                            </Button>
                          )}
                          {(r.status === "approved" || r.status === "partially_approved") && (
                            <Button size="sm" onClick={() => handleIssue(r.id)} disabled={saving}>
                              <Truck className="mr-1 h-4 w-4" /> Issue
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ═══════════════ TAB: HISTORY ═══════════════ */}
      {tab === "history" && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            <select value={txnTypeFilter} onChange={(e) => setTxnTypeFilter(e.target.value)} className="rounded-md border bg-background px-3 py-2 text-sm">
              <option value="all">All Types</option>
              <option value="receive">Received</option>
              <option value="issue">Issued</option>
            </select>
            <Button variant="outline" size="sm" onClick={() => {
              const headers = ["Txn ID", "Date", "Type", "Item ID", "Item Name", "Quantity", "Request ID", "Staff", "Performed By"];
              const rows = filteredTransactions.map((t) => [
                t.txn_id, new Date(t.timestamp).toLocaleDateString(), t.type,
                t.item_id, t.item_name, t.quantity,
                t.request_id || "", t.staff_name || "", t.performed_by,
              ]);
              exportToCSV(`${cfg.idPrefix}_transactions`, headers, rows);
            }}>
              <FileDown className="mr-1 h-4 w-4" /> Export CSV
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead>Staff</TableHead>
                    <TableHead>Request #</TableHead>
                    <TableHead>By</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTransactions.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No transactions found</TableCell></TableRow>
                  ) : filteredTransactions.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell>{new Date(t.timestamp).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <Badge className={t.type === "receive" ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300" : "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300"}>
                          {t.type === "receive" ? "Received" : "Issued"}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">{t.item_name}</TableCell>
                      <TableCell className="text-right font-semibold">{t.quantity}</TableCell>
                      <TableCell>{t.staff_name || "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{t.request_id || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{t.performed_by}</TableCell>
                      <TableCell className="text-muted-foreground max-w-[200px] truncate">{t.notes}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ═══════════════ TAB: REPORTS ═══════════════ */}
      {tab === "reports" && (
        <StoreReportsSection items={items} transactions={transactions} requests={requests} cfg={cfg} />
      )}

      {/* ═══════════════ DIALOGS ═══════════════ */}

      {/* Add Item Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Add New Item</DialogTitle>
            <DialogDescription>Add a new item to the {cfg.label} inventory</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-sm font-medium">Name *</label><Input value={addForm.name} onChange={(e) => setAddForm({ ...addForm, name: e.target.value })} /></div>
              <div><label className="text-sm font-medium">Arabic Name</label><Input value={addForm.name_ar} onChange={(e) => setAddForm({ ...addForm, name_ar: e.target.value })} dir="rtl" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Category *</label>
                <select value={addForm.category} onChange={(e) => setAddForm({ ...addForm, category: e.target.value })} className="w-full rounded-md border bg-background px-3 py-2 text-sm">
                  {cfg.categories.map((c) => <option key={c} value={c}>{cfg.categoryLabels[c] || c}</option>)}
                </select>
              </div>
              <div><label className="text-sm font-medium">Unit</label><Input value={addForm.unit} onChange={(e) => setAddForm({ ...addForm, unit: e.target.value })} placeholder="piece, box, ream..." /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-sm font-medium">Initial Quantity</label><Input type="number" min={0} value={addForm.quantity} onChange={(e) => setAddForm({ ...addForm, quantity: parseInt(e.target.value) || 0 })} /></div>
              <div><label className="text-sm font-medium">Reorder Level</label><Input type="number" min={0} value={addForm.reorder_level} onChange={(e) => setAddForm({ ...addForm, reorder_level: parseInt(e.target.value) || 0 })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-sm font-medium">Location</label><Input value={addForm.location} onChange={(e) => setAddForm({ ...addForm, location: e.target.value })} placeholder="Shelf A, Room 103..." /></div>
              <div><label className="text-sm font-medium">Branch</label><Input value={addForm.branch} onChange={(e) => setAddForm({ ...addForm, branch: e.target.value })} /></div>
            </div>
            <div><label className="text-sm font-medium">Barcode</label><Input value={addForm.barcode} onChange={(e) => setAddForm({ ...addForm, barcode: e.target.value })} placeholder="EAN/UPC barcode (optional)" /></div>
            <div><label className="text-sm font-medium">Notes</label><Input value={addForm.notes} onChange={(e) => setAddForm({ ...addForm, notes: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={handleAddItem} disabled={saving || !addForm.name}>{saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />} Add Item</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Item Dialog */}
      <Dialog open={!!editItem} onOpenChange={(open) => { if (!open) { setEditItem(null); setImgSearchResults([]); } }}>
        <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Item</DialogTitle>
            <DialogDescription>{editItem?.item_id}</DialogDescription>
          </DialogHeader>
          {editItem && (
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div><label className="text-sm font-medium">Name</label><Input value={editItem.name} onChange={(e) => setEditItem({ ...editItem, name: e.target.value })} /></div>
                <div><label className="text-sm font-medium">Arabic Name</label><Input value={editItem.name_ar} onChange={(e) => setEditItem({ ...editItem, name_ar: e.target.value })} dir="rtl" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Category</label>
                  <select value={editItem.category} onChange={(e) => setEditItem({ ...editItem, category: e.target.value })} className="w-full rounded-md border bg-background px-3 py-2 text-sm">
                    {cfg.categories.map((c) => <option key={c} value={c}>{cfg.categoryLabels[c] || c}</option>)}
                  </select>
                </div>
                <div><label className="text-sm font-medium">Unit</label><Input value={editItem.unit} onChange={(e) => setEditItem({ ...editItem, unit: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="text-sm font-medium">Reorder Level</label><Input type="number" min={0} value={editItem.reorder_level} onChange={(e) => setEditItem({ ...editItem, reorder_level: parseInt(e.target.value) || 0 })} /></div>
                <div><label className="text-sm font-medium">Location</label><Input value={editItem.location} onChange={(e) => setEditItem({ ...editItem, location: e.target.value })} /></div>
              </div>
              <div><label className="text-sm font-medium">Barcode</label><Input value={editItem.barcode || ""} onChange={(e) => setEditItem({ ...editItem, barcode: e.target.value })} placeholder="EAN/UPC barcode (optional)" /></div>
              <div><label className="text-sm font-medium">Notes</label><Input value={editItem.notes} onChange={(e) => setEditItem({ ...editItem, notes: e.target.value })} /></div>

              {/* ── Images Section ─────────────────────────────── */}
              <div className="rounded-lg border p-4 space-y-4">
                <h4 className="text-sm font-semibold flex items-center gap-2"><ImageIcon className="h-4 w-4" /> Product Images</h4>

                {/* Current images */}
                <div className="grid grid-cols-2 gap-4">
                  {/* Catalog image (AI/web) */}
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">Catalog Image</label>
                    {editItem.image_url ? (
                      <div className="relative group">
                        <img src={editItem.image_url} alt="Catalog" className="h-28 w-full rounded-md object-contain border bg-muted" />
                        <button onClick={() => handleRemoveImage("catalog", editItem)} className="absolute top-1 right-1 rounded-full bg-destructive/90 p-1 text-white opacity-0 group-hover:opacity-100 transition-opacity" title="Remove">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex h-28 items-center justify-center rounded-md border-2 border-dashed text-muted-foreground text-xs">No catalog image</div>
                    )}
                  </div>
                  {/* Custom image (uploaded) */}
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">Custom Photo</label>
                    {editItem.custom_image_url ? (
                      <div className="relative group">
                        <img src={editItem.custom_image_url} alt="Custom" className="h-28 w-full rounded-md object-contain border bg-muted" />
                        <button onClick={() => handleRemoveImage("custom", editItem)} className="absolute top-1 right-1 rounded-full bg-destructive/90 p-1 text-white opacity-0 group-hover:opacity-100 transition-opacity" title="Remove">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex h-28 items-center justify-center rounded-md border-2 border-dashed text-muted-foreground text-xs">No custom photo</div>
                    )}
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" disabled={imgSearching || imgUploading} onClick={() => handleImageSearch(editItem.barcode, editItem.name)}>
                    {imgSearching ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Sparkles className="mr-1 h-3 w-3" />}
                    AI Search
                  </Button>
                  <Button type="button" variant="outline" size="sm" disabled={imgUploading} onClick={() => document.getElementById("custom-photo-upload")?.click()}>
                    {imgUploading ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Camera className="mr-1 h-3 w-3" />}
                    Upload Photo
                  </Button>
                  <input id="custom-photo-upload" type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadCustomImage(f, editItem); e.target.value = ""; }} />
                </div>

                {/* AI search results grid */}
                {imgError && <p className="text-xs text-destructive font-medium">{imgError}</p>}
                {imgSearchResults.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">Select an image to use as catalog photo:</p>
                    <div className="grid grid-cols-3 gap-2">
                      {imgSearchResults.map((url, i) => (
                        <button key={i} onClick={() => handleSelectSearchImage(url, editItem)} className="relative rounded-md border-2 border-transparent hover:border-primary overflow-hidden h-24 transition-colors" disabled={imgUploading}>
                          <img src={url} alt={`Result ${i + 1}`} className="h-full w-full object-contain bg-muted" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditItem(null); setImgSearchResults([]); }}>Cancel</Button>
            <Button onClick={handleEditItem} disabled={saving || imgUploading}>{(saving || imgUploading) ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Receive Stock Dialog */}
      <Dialog open={showReceive} onOpenChange={setShowReceive}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Receive Stock</DialogTitle>
            <DialogDescription>Add received quantity for: {receiveItemName}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div><label className="text-sm font-medium">Quantity</label><Input type="number" min={1} value={receiveForm.quantity} onChange={(e) => setReceiveForm({ ...receiveForm, quantity: parseInt(e.target.value) || 1 })} /></div>
            <div><label className="text-sm font-medium">Notes</label><Input value={receiveForm.notes} onChange={(e) => setReceiveForm({ ...receiveForm, notes: e.target.value })} placeholder="Supplier, invoice #..." /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReceive(false)}>Cancel</Button>
            <Button onClick={handleReceive} disabled={saving || receiveForm.quantity <= 0}>{saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <PackagePlus className="mr-1 h-4 w-4" />} Receive</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CSV Import Dialog */}
      <Dialog open={showCsv} onOpenChange={setShowCsv}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>CSV Import</DialogTitle>
            <DialogDescription>Paste CSV with a header row. Required: <code>name, category</code>. Optional: <code>unit, quantity, reorder_level, location, barcode</code></DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <textarea value={csvText} onChange={(e) => setCsvText(e.target.value)} rows={8} className="w-full rounded-md border bg-background p-3 text-sm font-mono" placeholder={`name,category,unit,quantity,reorder_level,location\nA4 Paper,stationery,ream,100,20,Shelf A\nBlue Pen,stationery,box,50,10,Shelf B`} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCsv(false)}>Cancel</Button>
            <Button onClick={handleCsvImport} disabled={saving || !csvText.trim()}>{saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Upload className="mr-1 h-4 w-4" />} Import</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Submit Request Dialog */}
      <Dialog open={showRequest} onOpenChange={setShowRequest}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>New Requisition Request</DialogTitle>
            <DialogDescription>Submit a request for items from {cfg.label}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div>
              <label className="text-sm font-medium">Requester *</label>
              <select value={reqForm.staff} onChange={(e) => {
                const s = staffList.find((s) => s.Staff_Number === e.target.value);
                setReqForm({ ...reqForm, staff: e.target.value, staffName: s?.E_Full_Name || "" });
              }} className="w-full rounded-md border bg-background px-3 py-2 text-sm">
                <option value="">Select staff member...</option>
                {staffList.map((s) => <option key={s.Staff_Number} value={s.Staff_Number}>{s.E_Full_Name || s.Staff_Number}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Items *</label>
              {reqForm.items.map((ri, idx) => (
                <div key={idx} className="flex items-center gap-2 mt-2">
                  <select value={ri.item_id} onChange={(e) => {
                    const item = items.find((i) => i.item_id === e.target.value);
                    const newItems = [...reqForm.items];
                    newItems[idx] = { item_id: e.target.value, name: item?.name || "", qty: ri.qty };
                    setReqForm({ ...reqForm, items: newItems });
                  }} className="flex-1 rounded-md border bg-background px-3 py-2 text-sm">
                    <option value="">Select item...</option>
                    {items.filter((i) => i.is_active !== false).map((i) => <option key={i.item_id} value={i.item_id}>{i.name} ({i.quantity} available)</option>)}
                  </select>
                  <Input type="number" min={1} value={ri.qty} onChange={(e) => {
                    const newItems = [...reqForm.items];
                    newItems[idx] = { ...ri, qty: parseInt(e.target.value) || 1 };
                    setReqForm({ ...reqForm, items: newItems });
                  }} className="w-20" />
                  <Button variant="ghost" size="sm" onClick={() => {
                    const newItems = reqForm.items.filter((_, i) => i !== idx);
                    setReqForm({ ...reqForm, items: newItems });
                  }}><Minus className="h-4 w-4" /></Button>
                </div>
              ))}
              <Button variant="outline" size="sm" className="mt-2" onClick={() => setReqForm({ ...reqForm, items: [...reqForm.items, { item_id: "", name: "", qty: 1 }] })}>
                <Plus className="mr-1 h-4 w-4" /> Add Item
              </Button>
            </div>
            <div><label className="text-sm font-medium">Notes</label><Input value={reqForm.notes} onChange={(e) => setReqForm({ ...reqForm, notes: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRequest(false)}>Cancel</Button>
            <Button onClick={handleSubmitRequest} disabled={saving || !reqForm.staff || reqForm.items.length === 0 || reqForm.items.some((i) => !i.item_id)}>
              {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />} Submit Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Review Request Dialog */}
      <Dialog open={showReview} onOpenChange={setShowReview}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Review Request</DialogTitle>
            <DialogDescription>Request {reviewReq?.request_id} from {reviewReq?.requested_by_name || reviewReq?.requested_by}</DialogDescription>
          </DialogHeader>
          {reviewReq && (
            <div className="py-4 space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Requested</TableHead>
                    <TableHead className="text-right">Approve Qty</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reviewItems.map((ri, idx) => (
                    <TableRow key={idx}>
                      <TableCell>{ri.name}</TableCell>
                      <TableCell className="text-right">{ri.qty_requested}</TableCell>
                      <TableCell className="text-right">
                        <Input type="number" min={0} max={ri.qty_requested} value={ri.qty_approved} onChange={(e) => {
                          const newItems = [...reviewItems];
                          newItems[idx] = { ...ri, qty_approved: Math.min(ri.qty_requested, Math.max(0, parseInt(e.target.value) || 0)) };
                          setReviewItems(newItems);
                        }} className="w-20 ml-auto" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {reviewReq.notes && <p className="text-sm text-muted-foreground">Notes: {reviewReq.notes}</p>}
            </div>
          )}
          <DialogFooter className="flex gap-2">
            <Button variant="destructive" onClick={() => handleApprove("rejected")} disabled={saving}>
              <XCircle className="mr-1 h-4 w-4" /> Reject
            </Button>
            <Button variant="outline" onClick={() => handleApprove("partially_approved")} disabled={saving}>
              Partial Approve
            </Button>
            <Button onClick={() => handleApprove("approved")} disabled={saving}>
              <CheckCircle className="mr-1 h-4 w-4" /> Approve All
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* QR Label Generator */}
      <LabelGenerator items={items} open={showLabels} onOpenChange={setShowLabels} storeLabel={cfg.label} />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   STORE REPORTS — comprehensive reporting component
   ═══════════════════════════════════════════════════════════════ */

type StoreReportType = "inventory" | "issues" | "movements" | "low-stock" | "requests" | "valuation";

interface StoreReportsSectionProps {
  items: StoreItem[];
  transactions: StoreTransaction[];
  requests: StoreRequest[];
  cfg: StoreConfig;
}

function StoreReportsSection({ items, transactions, requests, cfg }: StoreReportsSectionProps) {
  const [reportType, setReportType] = useState<StoreReportType>("inventory");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const reportRef = useRef<HTMLDivElement>(null);

  const activeItems = items.filter((i) => i.is_active !== false);

  // Date-filtered transactions
  const filteredTxns = transactions.filter((t) => {
    if (!dateFrom && !dateTo) return true;
    const d = t.timestamp?.slice(0, 10) || "";
    if (dateFrom && d < dateFrom) return false;
    if (dateTo && d > dateTo) return false;
    return true;
  });

  // Date-filtered requests
  const filteredReqs = requests.filter((r) => {
    if (!dateFrom && !dateTo) return true;
    const d = r.requested_at?.slice(0, 10) || "";
    if (dateFrom && d < dateFrom) return false;
    if (dateTo && d > dateTo) return false;
    return true;
  });

  const issueTxns = filteredTxns.filter((t) => t.type === "issue");
  const receiveTxns = filteredTxns.filter((t) => t.type === "receive");
  const totalIssued = issueTxns.reduce((s, t) => s + t.quantity, 0);
  const totalReceived = receiveTxns.reduce((s, t) => s + t.quantity, 0);

  const reportTabs: { key: StoreReportType; label: string; icon: React.ReactNode }[] = [
    { key: "inventory", label: "Full Inventory", icon: <Package className="h-4 w-4" /> },
    { key: "issues", label: "Issue Report", icon: <Truck className="h-4 w-4" /> },
    { key: "movements", label: "Stock Movement", icon: <ArrowUpDown className="h-4 w-4" /> },
    { key: "low-stock", label: "Low Stock", icon: <AlertTriangle className="h-4 w-4" /> },
    { key: "requests", label: "Request Analysis", icon: <ClipboardList className="h-4 w-4" /> },
    { key: "valuation", label: "Category Summary", icon: <BarChart3 className="h-4 w-4" /> },
  ];

  /* ── CSV Export ── */
  function handleExport() {
    const dateLabel = dateFrom && dateTo ? `${dateFrom}_to_${dateTo}` : "all";
    if (reportType === "inventory") {
      exportToCSV(`inventory-report-${cfg.type}.csv`,
        ["Item ID", "Name", "Name (Arabic)", "Category", "Unit", "Quantity", "Reorder Level", "Location", "Barcode", "Status"],
        activeItems.map((i) => [i.item_id, i.name, i.name_ar, cfg.categoryLabels[i.category] || i.category, i.unit, i.quantity, i.reorder_level, i.location, i.barcode || "", i.quantity === 0 ? "Out of Stock" : i.quantity <= i.reorder_level ? "Low Stock" : "In Stock"]),
      );
    } else if (reportType === "issues") {
      exportToCSV(`issue-report-${cfg.type}-${dateLabel}.csv`,
        ["Date", "Time", "Item", "Quantity", "Request ID", "Recipient", "Issued By", "Notes"],
        issueTxns.map((t) => [t.timestamp?.slice(0, 10), t.timestamp?.slice(11, 16), t.item_name, t.quantity, t.request_id || "Quick Issue", t.staff_name || "—", t.performed_by, t.notes]),
      );
    } else if (reportType === "movements") {
      exportToCSV(`stock-movements-${cfg.type}-${dateLabel}.csv`,
        ["Date", "Time", "Type", "Item", "Quantity", "Request ID", "Performed By", "Notes"],
        filteredTxns.map((t) => [t.timestamp?.slice(0, 10), t.timestamp?.slice(11, 16), t.type === "issue" ? "Issued" : "Received", t.item_name, t.quantity, t.request_id || "—", t.performed_by, t.notes]),
      );
    } else if (reportType === "low-stock") {
      const lowItems = activeItems.filter((i) => i.quantity === 0 || (i.reorder_level > 0 && i.quantity <= i.reorder_level));
      exportToCSV(`low-stock-${cfg.type}.csv`,
        ["Item", "Category", "Current Qty", "Reorder Level", "Status"],
        lowItems.map((i) => [i.name, cfg.categoryLabels[i.category] || i.category, i.quantity, i.reorder_level, i.quantity === 0 ? "Out of Stock" : "Low Stock"]),
      );
    } else if (reportType === "requests") {
      exportToCSV(`request-analysis-${cfg.type}-${dateLabel}.csv`,
        ["Date", "Request ID", "Requester", "Status", "Items", "Total Qty Requested", "Total Qty Approved"],
        filteredReqs.map((r) => [r.requested_at?.slice(0, 10), r.request_id, r.requested_by_name, r.status, r.items.length, r.items.reduce((s, i) => s + i.qty_requested, 0), r.items.reduce((s, i) => s + (i.qty_approved || 0), 0)]),
      );
    } else if (reportType === "valuation") {
      exportToCSV(`category-summary-${cfg.type}.csv`,
        ["Category", "Items", "Total Qty", "Low Stock Items", "Out of Stock Items"],
        cfg.categories.map((cat) => {
          const ci = activeItems.filter((i) => i.category === cat);
          return [cfg.categoryLabels[cat] || cat, ci.length, ci.reduce((s, i) => s + i.quantity, 0), ci.filter((i) => i.reorder_level > 0 && i.quantity <= i.reorder_level && i.quantity > 0).length, ci.filter((i) => i.quantity === 0).length];
        }),
      );
    }
  }

  const reportLabel = reportTabs.find((rt) => rt.key === reportType)?.label || reportType;

  /* ── Professional Print ── */
  function handlePrint() {
    const el = reportRef.current;
    if (!el) return;
    const today = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    // Clone all tables & cards from the report area
    const tables = el.querySelectorAll("table");
    let tablesHtml = "";
    tables.forEach((t) => { tablesHtml += t.outerHTML; });
    // If no tables, grab everything
    if (!tablesHtml) tablesHtml = el.innerHTML;

    const periodText = dateFrom || dateTo
      ? `Period: ${dateFrom || "start"} — ${dateTo || "present"}`
      : "All dates";

    const win = window.open("", "_blank", "width=1100,height=800");
    if (!win) return;
    win.document.write(`<!DOCTYPE html>
<html><head><title>${cfg.label} — ${reportLabel}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a1a; background: #fff; padding: 20mm 15mm; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1a365d; padding-bottom: 14px; margin-bottom: 18px; }
  .header h1 { font-size: 20pt; font-weight: 700; color: #1a365d; margin-bottom: 2px; }
  .header h2 { font-size: 13pt; font-weight: 600; color: #2d3748; margin-bottom: 4px; }
  .header p { font-size: 9pt; color: #666; }
  .header .right { text-align: right; }
  .header .right p { font-size: 9pt; color: #888; }
  .summary { display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 18px; }
  .summary .stat { border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 16px; min-width: 120px; }
  .summary .stat .label { font-size: 8pt; color: #666; text-transform: uppercase; letter-spacing: 0.5px; }
  .summary .stat .value { font-size: 16pt; font-weight: 700; color: #1a365d; }
  table { width: 100%; border-collapse: collapse; font-size: 9pt; margin-top: 10px; }
  th { background: #edf2f7; color: #1a365d; font-weight: 700; border-bottom: 2px solid #2d3748; padding: 8px 10px; text-align: left; white-space: nowrap; }
  td { border-bottom: 1px solid #e2e8f0; padding: 6px 10px; color: #2d3748; }
  tr:nth-child(even) { background: #f7fafc; }
  tr:hover { background: #edf2f7; }
  .text-right { text-align: right; }
  .font-semibold { font-weight: 600; }
  .font-bold { font-weight: 700; }
  .font-medium { font-weight: 500; }
  .text-yellow-600 { color: #d69e2e; }
  .text-red-600 { color: #e53e3e; }
  .text-emerald-600, .text-green-600 { color: #38a169; }
  .text-muted-foreground { color: #718096; }
  .text-xs { font-size: 8pt; }
  .text-sm { font-size: 9pt; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 8pt; font-weight: 600; }
  .badge-green { background: #c6f6d5; color: #22543d; }
  .badge-yellow { background: #fefcbf; color: #744210; }
  .badge-red { background: #fed7d7; color: #742a2a; }
  .footer { margin-top: 30px; padding-top: 10px; border-top: 1px solid #e2e8f0; font-size: 8pt; color: #a0aec0; display: flex; justify-content: space-between; }
  @media print { body { padding: 0; } @page { size: A4 landscape; margin: 12mm 10mm; } }
</style>
</head><body>
<div class="header">
  <div>
    <h1>Khaled International Schools</h1>
    <h2>${cfg.label} — ${reportLabel}</h2>
    <p>Generated: ${today} &nbsp;|&nbsp; ${periodText}</p>
  </div>
  <div class="right">
    <p>KIS Student Information System</p>
    <p>Report Date: ${today}</p>
  </div>
</div>
${tablesHtml}
<div class="footer">
  <span>KIS SiS — ${cfg.label} ${reportLabel}</span>
  <span>Printed: ${new Date().toLocaleString("en-GB")}</span>
</div>
</body></html>`);
    win.document.close();
    // Let content render before triggering print
    setTimeout(() => { win.print(); }, 400);
  }

  return (
    <div className="space-y-6">
      {/* Report Type Tabs + Controls */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-2 mb-4">
            {reportTabs.map((rt) => (
              <Button key={rt.key} size="sm" variant={reportType === rt.key ? "default" : "outline"} onClick={() => setReportType(rt.key)} className="gap-1.5">
                {rt.icon} {rt.label}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {reportType !== "inventory" && reportType !== "low-stock" && reportType !== "valuation" && (
              <>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <Input type="date" className="w-40" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                  <span className="text-muted-foreground">to</span>
                  <Input type="date" className="w-40" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                </div>
                {(dateFrom || dateTo) && (
                  <Button size="sm" variant="ghost" onClick={() => { setDateFrom(""); setDateTo(""); }}>Clear dates</Button>
                )}
              </>
            )}
            <div className="ml-auto flex gap-2">
              <Button size="sm" variant="outline" onClick={handleExport} className="gap-1.5">
                <FileDown className="h-4 w-4" /> Export CSV
              </Button>
              <Button size="sm" variant="outline" onClick={handlePrint} className="gap-1.5">
                <Printer className="h-4 w-4" /> Print
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Report content area — ref for print extraction */}
      <div ref={reportRef}>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card className="border-0 shadow-sm"><CardContent className="pt-4 pb-3 px-4">
          <div className="flex items-center justify-between mb-1"><span className="text-xs text-muted-foreground font-medium">Total Items</span><Package className="h-4 w-4 text-blue-500" /></div>
          <div className="text-lg font-bold">{activeItems.length}</div>
        </CardContent></Card>
        <Card className="border-0 shadow-sm"><CardContent className="pt-4 pb-3 px-4">
          <div className="flex items-center justify-between mb-1"><span className="text-xs text-muted-foreground font-medium">Total Units</span><Hash className="h-4 w-4 text-indigo-500" /></div>
          <div className="text-lg font-bold">{activeItems.reduce((s, i) => s + i.quantity, 0)}</div>
        </CardContent></Card>
        <Card className="border-0 shadow-sm"><CardContent className="pt-4 pb-3 px-4">
          <div className="flex items-center justify-between mb-1"><span className="text-xs text-muted-foreground font-medium">Issued</span><TrendingUp className="h-4 w-4 text-red-500" /></div>
          <div className="text-lg font-bold">{totalIssued}</div>
        </CardContent></Card>
        <Card className="border-0 shadow-sm"><CardContent className="pt-4 pb-3 px-4">
          <div className="flex items-center justify-between mb-1"><span className="text-xs text-muted-foreground font-medium">Received</span><TrendingDown className="h-4 w-4 text-emerald-500" /></div>
          <div className="text-lg font-bold">{totalReceived}</div>
        </CardContent></Card>
        <Card className="border-0 shadow-sm"><CardContent className="pt-4 pb-3 px-4">
          <div className="flex items-center justify-between mb-1"><span className="text-xs text-muted-foreground font-medium">Low Stock</span><AlertTriangle className="h-4 w-4 text-yellow-500" /></div>
          <div className="text-lg font-bold text-yellow-600">{activeItems.filter((i) => i.reorder_level > 0 && i.quantity <= i.reorder_level && i.quantity > 0).length}</div>
        </CardContent></Card>
        <Card className="border-0 shadow-sm"><CardContent className="pt-4 pb-3 px-4">
          <div className="flex items-center justify-between mb-1"><span className="text-xs text-muted-foreground font-medium">Out of Stock</span><XCircle className="h-4 w-4 text-red-500" /></div>
          <div className="text-lg font-bold text-red-600">{activeItems.filter((i) => i.quantity === 0).length}</div>
        </CardContent></Card>
      </div>

      {/* ── Report: Full Inventory ── */}
      {reportType === "inventory" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Package className="h-5 w-5" /> Full Inventory Report</CardTitle>
            <CardDescription>Complete list of all active inventory items with current stock levels</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Reorder</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeItems.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)).map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="text-xs text-muted-foreground font-mono">{i.item_id}</TableCell>
                    <TableCell className="font-medium">{i.name}{i.name_ar ? <span className="text-muted-foreground ml-1 text-xs">({i.name_ar})</span> : null}</TableCell>
                    <TableCell>{cfg.categoryLabels[i.category] || i.category}</TableCell>
                    <TableCell>{i.unit}</TableCell>
                    <TableCell className="text-sm">{i.location || "—"}</TableCell>
                    <TableCell className="text-right font-semibold">{i.quantity}</TableCell>
                    <TableCell className="text-right">{i.reorder_level}</TableCell>
                    <TableCell>{STOCK_BADGE(i.quantity, i.reorder_level)}</TableCell>
                  </TableRow>
                ))}
                {activeItems.length === 0 && (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No items in inventory</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* ── Report: Issue Report ── */}
      {reportType === "issues" && (
        <div className="space-y-6">
          {/* Top Issued Items Bar Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Truck className="h-5 w-5" /> Top Issued Items</CardTitle>
              <CardDescription>Most frequently issued items by total quantity{dateFrom || dateTo ? ` (${dateFrom || "start"} → ${dateTo || "now"})` : ""}</CardDescription>
            </CardHeader>
            <CardContent>
              {(() => {
                const byItem: Record<string, { name: string; qty: number; count: number }> = {};
                for (const t of issueTxns) {
                  if (!byItem[t.item_id]) byItem[t.item_id] = { name: t.item_name, qty: 0, count: 0 };
                  byItem[t.item_id].qty += t.quantity;
                  byItem[t.item_id].count++;
                }
                const sorted = Object.entries(byItem).sort((a, b) => b[1].qty - a[1].qty).slice(0, 15);
                if (sorted.length === 0) return <p className="text-muted-foreground text-center py-8">No issues recorded{dateFrom || dateTo ? " for the selected period" : ""}</p>;
                const maxQty = sorted[0][1].qty;
                return (
                  <div className="space-y-2">
                    {sorted.map(([itemId, { name, qty, count }]) => (
                      <div key={itemId} className="flex items-center gap-3">
                        <span className="w-44 truncate text-sm font-medium">{name}</span>
                        <div className="flex-1 rounded-full bg-muted h-5 overflow-hidden">
                          <div className="h-full rounded-full bg-red-500/80" style={{ width: `${(qty / maxQty) * 100}%` }} />
                        </div>
                        <span className="text-sm font-semibold w-16 text-right">{qty} units</span>
                        <span className="text-xs text-muted-foreground w-14 text-right">({count}×)</span>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </CardContent>
          </Card>

          {/* Issue Detail Table */}
          <Card>
            <CardHeader>
              <CardTitle>Issue Transactions Detail</CardTitle>
              <CardDescription>{issueTxns.length} transactions — {totalIssued} total units issued</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead>Request</TableHead>
                    <TableHead>Recipient</TableHead>
                    <TableHead>Issued By</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {issueTxns.sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || "")).map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="text-sm">{t.timestamp?.slice(0, 10)}<br /><span className="text-xs text-muted-foreground">{t.timestamp?.slice(11, 16)}</span></TableCell>
                      <TableCell className="font-medium">{t.item_name}</TableCell>
                      <TableCell className="text-right font-semibold">{t.quantity}</TableCell>
                      <TableCell className="text-xs">{t.request_id || <span className="text-muted-foreground">Quick Issue</span>}</TableCell>
                      <TableCell className="text-sm">{t.staff_name || "—"}</TableCell>
                      <TableCell className="text-sm">{t.performed_by}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[150px] truncate">{t.notes || "—"}</TableCell>
                    </TableRow>
                  ))}
                  {issueTxns.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No issue transactions found</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Report: Stock Movement ── */}
      {reportType === "movements" && (
        <div className="space-y-6">
          {/* Daily Movement Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><ArrowUpDown className="h-5 w-5" /> Daily Stock Movement</CardTitle>
              <CardDescription>Receive vs Issue activity by day</CardDescription>
            </CardHeader>
            <CardContent>
              {(() => {
                const byDate: Record<string, { received: number; issued: number; txns: number }> = {};
                for (const t of filteredTxns) {
                  const d = t.timestamp?.slice(0, 10) || "unknown";
                  if (!byDate[d]) byDate[d] = { received: 0, issued: 0, txns: 0 };
                  if (t.type === "receive") byDate[d].received += t.quantity;
                  else byDate[d].issued += t.quantity;
                  byDate[d].txns++;
                }
                const dates = Object.entries(byDate).sort((a, b) => b[0].localeCompare(a[0]));
                if (dates.length === 0) return <p className="text-muted-foreground text-center py-8">No transactions found</p>;
                const maxQty = Math.max(...dates.map(([, d]) => Math.max(d.received, d.issued)));
                return (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Transactions</TableHead>
                        <TableHead className="text-right text-emerald-600">Received</TableHead>
                        <TableHead className="text-right text-red-600">Issued</TableHead>
                        <TableHead className="text-right">Net</TableHead>
                        <TableHead>Activity</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dates.map(([date, d]) => (
                        <TableRow key={date}>
                          <TableCell className="font-medium">{date}</TableCell>
                          <TableCell>{d.txns}</TableCell>
                          <TableCell className="text-right font-semibold text-emerald-600">+{d.received}</TableCell>
                          <TableCell className="text-right font-semibold text-red-600">-{d.issued}</TableCell>
                          <TableCell className={`text-right font-bold ${d.received - d.issued >= 0 ? "text-emerald-600" : "text-red-600"}`}>{d.received - d.issued >= 0 ? "+" : ""}{d.received - d.issued}</TableCell>
                          <TableCell>
                            <div className="flex gap-1 h-3 w-32">
                              {d.received > 0 && <div className="bg-emerald-500 rounded-sm" style={{ width: `${(d.received / maxQty) * 100}%` }} />}
                              {d.issued > 0 && <div className="bg-red-500 rounded-sm" style={{ width: `${(d.issued / maxQty) * 100}%` }} />}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                );
              })()}
            </CardContent>
          </Card>

          {/* All Transactions */}
          <Card>
            <CardHeader>
              <CardTitle>All Transactions</CardTitle>
              <CardDescription>{filteredTxns.length} transactions total — {totalReceived} received, {totalIssued} issued</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead>Request</TableHead>
                    <TableHead>By</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTxns.sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || "")).map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="text-sm">{t.timestamp?.slice(0, 10)}<br /><span className="text-xs text-muted-foreground">{t.timestamp?.slice(11, 16)}</span></TableCell>
                      <TableCell>
                        <Badge className={t.type === "receive" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300" : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300"}>
                          {t.type === "receive" ? "Received" : "Issued"}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">{t.item_name}</TableCell>
                      <TableCell className="text-right font-semibold">{t.quantity}</TableCell>
                      <TableCell className="text-xs">{t.request_id || "—"}</TableCell>
                      <TableCell className="text-sm">{t.performed_by}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[150px] truncate">{t.notes || "—"}</TableCell>
                    </TableRow>
                  ))}
                  {filteredTxns.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No transactions found</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Report: Low Stock ── */}
      {reportType === "low-stock" && (
        <div className="space-y-6">
          {/* Out of Stock */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><XCircle className="h-5 w-5 text-red-500" /> Out of Stock Items</CardTitle>
            </CardHeader>
            <CardContent>
              {(() => {
                const oos = activeItems.filter((i) => i.quantity === 0);
                if (oos.length === 0) return <p className="text-emerald-600 text-center py-8 font-medium">No items are out of stock</p>;
                return (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead>Reorder Level</TableHead>
                        <TableHead>Last Activity</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {oos.map((i) => {
                        const lastTxn = transactions.filter((t) => t.item_id === i.item_id).sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""))[0];
                        return (
                          <TableRow key={i.id}>
                            <TableCell className="font-medium">{i.name}</TableCell>
                            <TableCell>{cfg.categoryLabels[i.category] || i.category}</TableCell>
                            <TableCell>{i.location || "—"}</TableCell>
                            <TableCell>{i.reorder_level}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{lastTxn ? `${lastTxn.type === "issue" ? "Issued" : "Received"} ${lastTxn.timestamp?.slice(0, 10)}` : "Never"}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                );
              })()}
            </CardContent>
          </Card>

          {/* Low Stock */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-yellow-500" /> Low Stock Items</CardTitle>
              <CardDescription>Items at or below reorder level</CardDescription>
            </CardHeader>
            <CardContent>
              {(() => {
                const low = activeItems.filter((i) => i.reorder_level > 0 && i.quantity <= i.reorder_level && i.quantity > 0).sort((a, b) => a.quantity - b.quantity);
                if (low.length === 0) return <p className="text-emerald-600 text-center py-8 font-medium">All items are above reorder level</p>;
                return (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead className="text-right">Current</TableHead>
                        <TableHead className="text-right">Reorder Level</TableHead>
                        <TableHead className="text-right">Deficit</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {low.map((i) => (
                        <TableRow key={i.id}>
                          <TableCell className="font-medium">{i.name}</TableCell>
                          <TableCell>{cfg.categoryLabels[i.category] || i.category}</TableCell>
                          <TableCell className="text-right font-semibold text-yellow-600">{i.quantity}</TableCell>
                          <TableCell className="text-right">{i.reorder_level}</TableCell>
                          <TableCell className="text-right font-semibold text-red-600">-{i.reorder_level - i.quantity}</TableCell>
                          <TableCell>{STOCK_BADGE(i.quantity, i.reorder_level)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                );
              })()}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Report: Request Analysis ── */}
      {reportType === "requests" && (
        <div className="space-y-6">
          {/* Request Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {(["pending", "approved", "partially_approved", "issued", "rejected"] as const).map((status) => {
              const count = filteredReqs.filter((r) => r.status === status).length;
              return (
                <Card key={status} className="border-0 shadow-sm">
                  <CardContent className="pt-4 pb-3 px-4">
                    <Badge className={STATUS_BADGE[status] || ""}>{status.replace("_", " ")}</Badge>
                    <p className="text-2xl font-bold mt-2">{count}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Top Requesters */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> Top Requesters</CardTitle>
              <CardDescription>Users with the most requests</CardDescription>
            </CardHeader>
            <CardContent>
              {(() => {
                const byUser: Record<string, { name: string; count: number; totalQty: number }> = {};
                for (const r of filteredReqs) {
                  const key = r.requested_by;
                  if (!byUser[key]) byUser[key] = { name: r.requested_by_name || key, count: 0, totalQty: 0 };
                  byUser[key].count++;
                  byUser[key].totalQty += r.items.reduce((s, i) => s + i.qty_requested, 0);
                }
                const sorted = Object.entries(byUser).sort((a, b) => b[1].count - a[1].count).slice(0, 10);
                if (sorted.length === 0) return <p className="text-muted-foreground text-center py-8">No requests found</p>;
                return (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Requester</TableHead>
                        <TableHead className="text-right">Requests</TableHead>
                        <TableHead className="text-right">Total Items Requested</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sorted.map(([uid, d]) => (
                        <TableRow key={uid}>
                          <TableCell className="font-medium">{d.name}</TableCell>
                          <TableCell className="text-right">{d.count}</TableCell>
                          <TableCell className="text-right">{d.totalQty}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                );
              })()}
            </CardContent>
          </Card>

          {/* Most Requested Items */}
          <Card>
            <CardHeader>
              <CardTitle>Most Requested Items</CardTitle>
            </CardHeader>
            <CardContent>
              {(() => {
                const byItem: Record<string, { name: string; qtyReq: number; qtyApproved: number; times: number }> = {};
                for (const r of filteredReqs) {
                  for (const it of r.items) {
                    if (!byItem[it.item_id]) byItem[it.item_id] = { name: it.name, qtyReq: 0, qtyApproved: 0, times: 0 };
                    byItem[it.item_id].qtyReq += it.qty_requested;
                    byItem[it.item_id].qtyApproved += it.qty_approved || 0;
                    byItem[it.item_id].times++;
                  }
                }
                const sorted = Object.entries(byItem).sort((a, b) => b[1].qtyReq - a[1].qtyReq).slice(0, 15);
                if (sorted.length === 0) return <p className="text-muted-foreground text-center py-8">No requests found</p>;
                const maxQty = sorted[0][1].qtyReq;
                return (
                  <div className="space-y-2">
                    {sorted.map(([itemId, d]) => (
                      <div key={itemId} className="flex items-center gap-3">
                        <span className="w-44 truncate text-sm font-medium">{d.name}</span>
                        <div className="flex-1 rounded-full bg-muted h-5 overflow-hidden relative">
                          <div className="h-full rounded-full bg-blue-500/30 absolute" style={{ width: `${(d.qtyReq / maxQty) * 100}%` }} />
                          <div className="h-full rounded-full bg-blue-600" style={{ width: `${(d.qtyApproved / maxQty) * 100}%` }} />
                        </div>
                        <span className="text-sm font-semibold w-20 text-right">{d.qtyApproved}/{d.qtyReq}</span>
                        <span className="text-xs text-muted-foreground w-10 text-right">({d.times}×)</span>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Report: Category Summary ── */}
      {reportType === "valuation" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5" /> Inventory by Category</CardTitle>
            <CardDescription>Stock distribution across categories</CardDescription>
          </CardHeader>
          <CardContent>
            {(() => {
              const maxQty = Math.max(...cfg.categories.map((cat) => activeItems.filter((i) => i.category === cat).reduce((s, i) => s + i.quantity, 0)), 1);
              return (
                <div className="space-y-6">
                  {/* Visual bars */}
                  <div className="space-y-3 no-print">
                    {cfg.categories.map((cat) => {
                      const ci = activeItems.filter((i) => i.category === cat);
                      const totalQty = ci.reduce((s, i) => s + i.quantity, 0);
                      const lowCount = ci.filter((i) => i.reorder_level > 0 && i.quantity <= i.reorder_level).length;
                      return (
                        <div key={cat} className="flex items-center gap-3">
                          <span className="w-40 text-sm font-medium truncate">{cfg.categoryLabels[cat] || cat}</span>
                          <div className="flex-1 rounded-full bg-muted h-6 overflow-hidden">
                            <div className="h-full rounded-full bg-primary/80" style={{ width: `${(totalQty / maxQty) * 100}%` }} />
                          </div>
                          <span className="text-sm font-semibold w-24 text-right">{totalQty} units</span>
                          <span className="text-xs text-muted-foreground w-16 text-right">{ci.length} items</span>
                          {lowCount > 0 && <Badge variant="outline" className="text-yellow-600 border-yellow-300">{lowCount} low</Badge>}
                        </div>
                      );
                    })}
                  </div>

                  {/* Summary table */}
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Category</TableHead>
                        <TableHead className="text-right">Items</TableHead>
                        <TableHead className="text-right">Total Units</TableHead>
                        <TableHead className="text-right">Low Stock</TableHead>
                        <TableHead className="text-right">Out of Stock</TableHead>
                        <TableHead className="text-right">Issued (all time)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cfg.categories.map((cat) => {
                        const ci = activeItems.filter((i) => i.category === cat);
                        const itemIds = new Set(ci.map((i) => i.item_id));
                        const catIssued = transactions.filter((t) => t.type === "issue" && itemIds.has(t.item_id)).reduce((s, t) => s + t.quantity, 0);
                        const totalQty = ci.reduce((s, i) => s + i.quantity, 0);
                        const low = ci.filter((i) => i.reorder_level > 0 && i.quantity <= i.reorder_level && i.quantity > 0).length;
                        const oos = ci.filter((i) => i.quantity === 0).length;
                        return (
                          <TableRow key={cat}>
                            <TableCell className="font-medium">{cfg.categoryLabels[cat] || cat}</TableCell>
                            <TableCell className="text-right">{ci.length}</TableCell>
                            <TableCell className="text-right font-semibold">{totalQty}</TableCell>
                            <TableCell className="text-right">{low > 0 ? <span className="text-yellow-600 font-semibold">{low}</span> : "0"}</TableCell>
                            <TableCell className="text-right">{oos > 0 ? <span className="text-red-600 font-semibold">{oos}</span> : "0"}</TableCell>
                            <TableCell className="text-right">{catIssued}</TableCell>
                          </TableRow>
                        );
                      })}
                      {/* Totals row */}
                      <TableRow className="border-t-2 font-bold">
                        <TableCell>TOTAL</TableCell>
                        <TableCell className="text-right">{activeItems.length}</TableCell>
                        <TableCell className="text-right">{activeItems.reduce((s, i) => s + i.quantity, 0)}</TableCell>
                        <TableCell className="text-right text-yellow-600">{activeItems.filter((i) => i.reorder_level > 0 && i.quantity <= i.reorder_level && i.quantity > 0).length}</TableCell>
                        <TableCell className="text-right text-red-600">{activeItems.filter((i) => i.quantity === 0).length}</TableCell>
                        <TableCell className="text-right">{totalIssued}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              );
            })()}
          </CardContent>
        </Card>
      )}
      </div>{/* end reportRef */}
    </div>
  );
}
