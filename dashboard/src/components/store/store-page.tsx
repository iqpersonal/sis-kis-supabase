"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
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
  FileText, ClipboardCheck, ClipboardPen, ShoppingCart, ArrowRightLeft,
} from "lucide-react";
import type { StoreItem, StoreRequest, StoreTransaction, StoreRequestItem, DeliveryNote } from "@/types/sis";
import type { StoreConfig } from "@/lib/store-config";
import { useAuth } from "@/context/auth-context";
import { getFirebaseAuth } from "@/lib/firebase";
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
  const { user, can } = useAuth();
  const canManage = can(cfg.type === "general" ? "general_store.manage" : "it_store.manage");
  const [tab, setTab] = useState<"inventory" | "requests" | "history" | "delivery_notes" | "reports" | "stock_take" | "purchase_orders">("inventory");
  const [loading, setLoading] = useState(true);

  // Data
  const [stats, setStats] = useState<Stats | null>(null);
  const [items, setItems] = useState<StoreItem[]>([]);
  const [requests, setRequests] = useState<StoreRequest[]>([]);
  const [transactions, setTransactions] = useState<StoreTransaction[]>([]);
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [deliveryNotes, setDeliveryNotes] = useState<DeliveryNote[]>([]);

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
  const [showQuickIssue, setShowQuickIssue] = useState(false);
  const [issuedDn, setIssuedDn] = useState<{ id: string; dn_number: string } | null>(null);
  const [showAdjust, setShowAdjust] = useState(false);
  const [showReturn, setShowReturn] = useState(false);

  // Purchase Orders
  const [purchaseOrders, setPurchaseOrders] = useState<Array<{ id: string; po_number: string; supplier: string; status: string; total_cost: number; items: Array<{ item_id: string; item_name: string; quantity: number; unit_cost: number; received_qty: number }>; created_at: string; created_by: string; notes?: string; expected_date?: string }>>([]);
  const [showCreatePO, setShowCreatePO] = useState(false);
  const [poForm, setPoForm] = useState({ supplier: "", notes: "", expected_date: "", items: [] as Array<{ item_id: string; item_name: string; quantity: number; unit_cost: number }> });
  const [showReceivePO, setShowReceivePO] = useState<string | null>(null);
  const [receivePoItems, setReceivePoItems] = useState<Record<string, number>>({});
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferItems_state, setTransferItems_state] = useState<Array<{ item_id: string; item_name: string; quantity: number }>>([]);

  // Stock Take
  const [stockTakes, setStockTakes] = useState<Array<{ id: string; status: string; created_at: string; created_by: string; item_count: number; counted: number; variances: number; completed_at?: string; adjustments_applied?: boolean }>>([]);
  const [activeStockTake, setActiveStockTake] = useState<{ id: string; status: string; items: Record<string, { name: string; system_qty: number; counted_qty: number | null }>; [k: string]: unknown } | null>(null);
  const [stLoading, setStLoading] = useState(false);

  // Delivery notes filter
  const [dnStatusFilter, setDnStatusFilter] = useState("all");
  const [dnBranchFilter, setDnBranchFilter] = useState("all");
  const [alertsExpanded, setAlertsExpanded] = useState(false);
  const [qiError, setQiError] = useState<string | null>(null);

  // Quick Issue form
  const [qiForm, setQiForm] = useState<{
    staff: string;
    staffName: string;
    staffNameAr: string;
    department: string;
    branch: string;
    items: { item_id: string; item_name: string; qty: number; condition: string; remarks: string }[];
    notes: string;
  }>({ staff: "", staffName: "", staffNameAr: "", department: "", branch: "", items: [], notes: "" });
  const [qiStaffSearch, setQiStaffSearch] = useState("");
  const [qiStaffDropdownOpen, setQiStaffDropdownOpen] = useState(false);

  // Form state — Add Item
  const [addForm, setAddForm] = useState({ name: "", name_ar: "", category: cfg.categories[0] as string, unit: "piece", quantity: 0, reorder_level: 5, location: "", branch: "", notes: "", barcode: "", unit_cost: 0, expiry_date: "" });

  // Image search state
  const [imgSearchResults, setImgSearchResults] = useState<string[]>([]);
  const [imgSearching, setImgSearching] = useState(false);
  const [imgUploading, setImgUploading] = useState(false);
  const [imgError, setImgError] = useState("");

  // Form state — Receive Stock
  const [receiveForm, setReceiveForm] = useState({ item_id: "", quantity: 1, notes: "" });
  const [receiveItemName, setReceiveItemName] = useState("");

  // Form state — Adjust Stock
  const [adjustForm, setAdjustForm] = useState({ item_id: "", quantity: 0, reason: "", notes: "" });
  const [adjustItemName, setAdjustItemName] = useState("");

  // Form state — Return Stock
  const [returnForm, setReturnForm] = useState({ item_id: "", quantity: 1, staff_number: "", staff_name: "", reason: "", notes: "" });
  const [returnItemName, setReturnItemName] = useState("");

  // Form state — Submit Request
  const [reqForm, setReqForm] = useState<{ staff: string; staffName: string; items: { item_id: string; name: string; qty: number }[]; notes: string }>({ staff: "", staffName: "", items: [], notes: "" });
  const [staffSearch, setStaffSearch] = useState("");
  const [staffDropdownOpen, setStaffDropdownOpen] = useState(false);
  const filteredStaffList = useMemo(() => {
    const q = staffSearch.trim().toLowerCase();
    if (!q) return staffList.slice(0, 20);
    return staffList.filter((s) => (s.E_Full_Name || s.Staff_Number).toLowerCase().includes(q)).slice(0, 20);
  }, [staffSearch, staffList]);

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
      const [statsRes, itemsRes, reqRes, txnRes, staffRes, dnRes] = await Promise.all([
        fetch(`${apiBase}?action=stats${bust}`),
        fetch(`${apiBase}?action=items${bust}`),
        fetch(`${apiBase}?action=requests${bust}`),
        fetch(`${apiBase}?action=transactions${bust}`),
        fetch(`/api/staff?action=list${bust}`),
        fetch(`/api/delivery-notes?action=list&storeType=${cfg.type}${bust}`),
      ]);
      const [statsData, itemsData, reqData, txnData, staffData, dnData] = await Promise.all([
        statsRes.json(),
        itemsRes.json(),
        reqRes.json(),
        txnRes.json(),
        staffRes.json(),
        dnRes.json(),
      ]);
      setStats(statsData);
      setItems(itemsData.items || []);
      setRequests(reqData.requests || []);
      setTransactions(txnData.transactions || []);
      setStaffList(staffData.staff || []);
      setDeliveryNotes(dnData.deliveryNotes || []);
    } catch (e) {
      console.error("Failed to fetch store data:", e);
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { if (tab === "stock_take") fetchStockTakes(); }, [tab]);
  useEffect(() => { if (tab === "purchase_orders") fetchPOs(); }, [tab]);

  /* ── POST helper ─────────────────────────────────────────────── */
  const postAction = async (action: string, payload: Record<string, unknown>) => {
    setSaving(true);
    try {
      const token = await getFirebaseAuth().currentUser?.getIdToken();
      const res = await fetch(apiBase, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ action, performed_by: user?.uid || "unknown", performed_by_name: user?.displayName || user?.email || "Unknown", ...payload }),
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
    setAddForm({ name: "", name_ar: "", category: cfg.categories[0] as string, unit: "piece", quantity: 0, reorder_level: 5, location: "", branch: "", notes: "", barcode: "", unit_cost: 0, expiry_date: "" });
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
    await postAction("receive_stock", { ...receiveForm, performed_by: user?.uid || "unknown", performed_by_name: user?.displayName || user?.email || "Unknown" });
    setShowReceive(false);
    setReceiveForm({ item_id: "", quantity: 1, notes: "" });
    setReceiveItemName("");
    fetchData();
  };

  const handleAdjust = async () => {
    await postAction("adjust_stock", { ...adjustForm });
    setShowAdjust(false);
    setAdjustForm({ item_id: "", quantity: 0, reason: "", notes: "" });
    setAdjustItemName("");
    fetchData();
  };

  const handleReturn = async () => {
    await postAction("return_stock", { ...returnForm });
    setShowReturn(false);
    setReturnForm({ item_id: "", quantity: 1, staff_number: "", staff_name: "", reason: "", notes: "" });
    setReturnItemName("");
    fetchData();
  };

  // ── Stock Take handlers ──
  const fetchStockTakes = async () => {
    try {
      const res = await fetch(`${apiBase}?action=stock_takes`);
      const data = await res.json();
      setStockTakes(data.stock_takes || []);
    } catch { /* ignore */ }
  };

  const loadStockTake = async (id: string) => {
    setStLoading(true);
    try {
      const res = await fetch(`${apiBase}?action=stock_take&id=${id}`);
      const data = await res.json();
      setActiveStockTake(data.stock_take || null);
    } catch { /* ignore */ }
    setStLoading(false);
  };

  const handleCreateStockTake = async () => {
    const data = await postAction("create_stock_take", {});
    if (data?.id) {
      await fetchStockTakes();
      loadStockTake(data.id);
    }
  };

  const handleCountUpdate = async (itemId: string, counted: number) => {
    if (!activeStockTake) return;
    await postAction("update_stock_take_count", { stock_take_id: activeStockTake.id, item_id: itemId, counted_qty: counted });
    // Update local state
    setActiveStockTake((prev) => {
      if (!prev) return prev;
      const items = { ...prev.items };
      items[itemId] = { ...items[itemId], counted_qty: counted };
      let countedN = 0, variancesN = 0;
      Object.values(items).forEach((it) => { if (it.counted_qty !== null) { countedN++; if (it.counted_qty !== it.system_qty) variancesN++; } });
      return { ...prev, items, counted: countedN, variances: variancesN };
    });
  };

  const handleCompleteStockTake = async (applyAdjustments: boolean) => {
    if (!activeStockTake) return;
    await postAction("complete_stock_take", { stock_take_id: activeStockTake.id, apply_adjustments: applyAdjustments });
    setActiveStockTake(null);
    fetchStockTakes();
    if (applyAdjustments) fetchData();
  };

  const handleCancelStockTake = async (id: string) => {
    if (!confirm("Are you sure you want to cancel and delete this stock take? This cannot be undone.")) return;
    try {
      await postAction("cancel_stock_take", { stock_take_id: id });
    } catch {
      // Already deleted or completed — that's fine
    }
    setActiveStockTake(null);
    fetchStockTakes();
  };

  // ── Purchase Order handlers ──
  const fetchPOs = async () => {
    try {
      const res = await fetch(`${apiBase}?action=purchase_orders`);
      const data = await res.json();
      setPurchaseOrders(data.purchase_orders || []);
    } catch { /* ignore */ }
  };

  const handleCreatePO = async () => {
    if (!poForm.supplier || poForm.items.length === 0) return;
    await postAction("create_po", { ...poForm });
    setShowCreatePO(false);
    setPoForm({ supplier: "", notes: "", expected_date: "", items: [] });
    fetchPOs();
  };

  const handleApprovePO = async (id: string) => {
    await postAction("approve_po", { id });
    fetchPOs();
  };

  const handleReceivePO = async (id: string) => {
    const receivedItems = Object.entries(receivePoItems)
      .filter(([, qty]) => qty > 0)
      .map(([item_id, quantity]) => ({ item_id, quantity }));
    if (receivedItems.length === 0) return;
    await postAction("receive_po", { id, received_items: receivedItems });
    setShowReceivePO(null);
    setReceivePoItems({});
    fetchPOs();
    fetchData();
  };

  const handleTransfer = async () => {
    if (transferItems_state.length === 0) return;
    await postAction("transfer_out", { transfers: transferItems_state });
    setShowTransfer(false);
    setTransferItems_state([]);
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
    const result = await postAction("issue_request", { id: reqId, issued_by: user?.uid || "unknown", issued_by_name: user?.displayName || user?.email || "Unknown" });
    if (result?.dn_id) {
      setIssuedDn({ id: result.dn_id, dn_number: result.dn_number });
    }
    fetchData();
  };

  const handleQuickIssue = async () => {
    const token = await getFirebaseAuth().currentUser?.getIdToken();
    setSaving(true);
    try {
      const res = await fetch("/api/delivery-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          action: "quick_issue",
          store_type: cfg.type,
          branch: qiForm.branch,
          items: qiForm.items.map((i) => ({ item_id: i.item_id, item_name: i.item_name, quantity: i.qty, condition: i.condition, remarks: i.remarks })),
          received_by: qiForm.staff,
          received_by_name: qiForm.staffName,
          received_by_name_ar: qiForm.staffNameAr,
          department: qiForm.department,
          notes: qiForm.notes,
          issued_by: user?.uid || "unknown",
          issued_by_name: user?.email || "Unknown",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setShowQuickIssue(false);
      setQiForm({ staff: "", staffName: "", staffNameAr: "", department: "", branch: "", items: [], notes: "" });
      setQiStaffSearch("");
      setQiError(null);
      if (data.dn_number) {
        setIssuedDn({ id: data.id, dn_number: data.dn_number });
      }
      fetchData();
    } catch (e) {
      console.error("Quick issue error:", e);
      setQiError(e instanceof Error ? e.message : "Quick issue failed. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleAcknowledge = async (dnId: string) => {
    const token = await getFirebaseAuth().currentUser?.getIdToken();
    setSaving(true);
    try {
      await fetch("/api/delivery-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ action: "acknowledge", id: dnId }),
      });
      fetchData();
    } finally {
      setSaving(false);
    }
  };

  const filteredQiStaffList = useMemo(() => {
    const q = qiStaffSearch.trim().toLowerCase();
    if (!q) return staffList.slice(0, 20);
    return staffList.filter((s) => (s.E_Full_Name || s.Staff_Number).toLowerCase().includes(q)).slice(0, 20);
  }, [qiStaffSearch, staffList]);

  /* ── Filtered data ───────────────────────────────────────────── */
  const lowStockItems = useMemo(() => items.filter((i) => i.is_active !== false && i.reorder_level > 0 && i.quantity <= i.reorder_level && i.quantity > 0), [items]);
  const outOfStockItems = useMemo(() => items.filter((i) => i.is_active !== false && i.quantity === 0), [items]);
  const expiringItems = useMemo(() => {
    const now = new Date();
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    return items.filter((i) => {
      if (!i.expiry_date || i.is_active === false) return false;
      const exp = new Date(i.expiry_date);
      return exp <= in30Days;
    }).sort((a, b) => new Date(a.expiry_date!).getTime() - new Date(b.expiry_date!).getTime());
  }, [items]);

  const filteredItems = items.filter((i) => {
    if (categoryFilter !== "all" && i.category !== categoryFilter) return false;
    if (stockFilter === "low" && (i.quantity === 0 || i.quantity > i.reorder_level)) return false;
    if (stockFilter === "out" && i.quantity !== 0) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!i.name.toLowerCase().includes(q) && !i.item_id.toLowerCase().includes(q) && !(i.name_ar || "").toLowerCase().includes(q) && !(i.barcode || "").toLowerCase().includes(q)) return false;
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

  const filteredDNs = deliveryNotes.filter((dn) => {
    if (dnStatusFilter !== "all" && dn.status !== dnStatusFilter) return false;
    if (dnBranchFilter !== "all" && dn.branch !== dnBranchFilter) return false;
    return true;
  });

  const pendingDNs = deliveryNotes.filter((dn) => dn.status === "pending_acknowledgment").length;

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
    { key: "delivery_notes" as const, label: "Delivery Notes", icon: FileText, badge: pendingDNs || undefined },
    { key: "history" as const, label: "Issue History", icon: Truck },
    { key: "reports" as const, label: "Reports", icon: BarChart3 },
    ...(canManage ? [{ key: "purchase_orders" as const, label: "Purchase Orders", icon: ShoppingCart }] : []),
    ...(canManage ? [{ key: "stock_take" as const, label: "Stock Take", icon: ClipboardPen }] : []),
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
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Total Items</p><p className="text-2xl font-bold">{stats?.total_items ?? 0}</p></CardContent></Card>
            <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Total Quantity</p><p className="text-2xl font-bold">{stats?.total_quantity ?? 0}</p></CardContent></Card>
            <Card className="border-green-200 dark:border-green-800"><CardContent className="pt-6"><p className="text-sm text-green-600">Inventory Value</p><p className="text-2xl font-bold text-green-600">{items.reduce((s, i) => s + (i.quantity || 0) * (i.unit_cost || 0), 0).toLocaleString()}</p></CardContent></Card>
            <Card className="border-yellow-200 dark:border-yellow-800"><CardContent className="pt-6"><p className="text-sm text-yellow-600">Low Stock</p><p className="text-2xl font-bold text-yellow-600">{stats?.low_stock ?? 0}</p></CardContent></Card>
            <Card className="border-red-200 dark:border-red-800"><CardContent className="pt-6"><p className="text-sm text-red-600">Out of Stock</p><p className="text-2xl font-bold text-red-600">{stats?.out_of_stock ?? 0}</p></CardContent></Card>
            <Card className="border-blue-200 dark:border-blue-800"><CardContent className="pt-6"><p className="text-sm text-blue-600">Pending Requests</p><p className="text-2xl font-bold text-blue-600">{stats?.pending_requests ?? 0}</p></CardContent></Card>
          </div>

          {/* Low Stock Alert Banner */}
          {(lowStockItems.length > 0 || outOfStockItems.length > 0 || expiringItems.length > 0) && (
            <div className="rounded-lg border border-yellow-300 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-950/30 p-4">
              <button onClick={() => setAlertsExpanded(!alertsExpanded)} className="w-full flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-yellow-600" />
                  <span className="font-semibold text-yellow-800 dark:text-yellow-300">
                    Stock Alerts: {outOfStockItems.length > 0 && <span className="text-red-600">{outOfStockItems.length} out of stock</span>}
                    {outOfStockItems.length > 0 && lowStockItems.length > 0 && ", "}
                    {lowStockItems.length > 0 && <span className="text-yellow-700 dark:text-yellow-400">{lowStockItems.length} low stock</span>}
                    {(outOfStockItems.length > 0 || lowStockItems.length > 0) && expiringItems.length > 0 && ", "}
                    {expiringItems.length > 0 && <span className="text-orange-600">{expiringItems.length} expiring soon</span>}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">{alertsExpanded ? "▲ Hide" : "▼ Show details"}</span>
              </button>
              {alertsExpanded && (
                <div className="mt-3 space-y-1 max-h-48 overflow-y-auto">
                  {outOfStockItems.map((i) => (
                    <div key={i.id} className="flex items-center justify-between text-sm py-1 px-2 rounded bg-red-50 dark:bg-red-950/30">
                      <span className="font-medium text-red-700 dark:text-red-400">{i.name}</span>
                      <Badge variant="destructive" className="text-xs">OUT OF STOCK</Badge>
                    </div>
                  ))}
                  {lowStockItems.map((i) => (
                    <div key={i.id} className="flex items-center justify-between text-sm py-1 px-2 rounded bg-yellow-50 dark:bg-yellow-950/20">
                      <span className="font-medium text-yellow-800 dark:text-yellow-300">{i.name}</span>
                      <span className="text-xs text-yellow-700 dark:text-yellow-400">{i.quantity} left (reorder at {i.reorder_level})</span>
                    </div>
                  ))}
                  {expiringItems.map((i) => {
                    const isExpired = new Date(i.expiry_date!) < new Date();
                    return (
                      <div key={`exp-${i.id}`} className={`flex items-center justify-between text-sm py-1 px-2 rounded ${isExpired ? "bg-red-50 dark:bg-red-950/30" : "bg-orange-50 dark:bg-orange-950/20"}`}>
                        <span className={`font-medium ${isExpired ? "text-red-700 dark:text-red-400" : "text-orange-700 dark:text-orange-400"}`}>{i.name}</span>
                        <span className={`text-xs ${isExpired ? "text-red-600 font-semibold" : "text-orange-600"}`}>
                          {isExpired ? "EXPIRED" : `Expires ${new Date(i.expiry_date!).toLocaleDateString()}`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

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
              <Input placeholder="Search by name, ID, or barcode..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
            </div>
            <select value={stockFilter} onChange={(e) => setStockFilter(e.target.value)} className="rounded-md border bg-background px-3 py-2 text-sm">
              <option value="all">All Stock</option>
              <option value="low">Low Stock</option>
              <option value="out">Out of Stock</option>
            </select>
            {canManage && <Button onClick={() => setShowAdd(true)} size="sm"><Plus className="mr-1 h-4 w-4" /> Add Item</Button>}
            {canManage && <Button onClick={() => { setReceiveForm({ item_id: "", quantity: 1, notes: "" }); setReceiveItemName(""); setShowReceive(true); }} variant="default" size="sm"><PackagePlus className="mr-1 h-4 w-4" /> Receive Stock</Button>}
            {canManage && <Button onClick={() => setShowAdjust(true)} variant="outline" size="sm"><ArrowUpDown className="mr-1 h-4 w-4" /> Adjust</Button>}
            {canManage && <Button onClick={() => setShowReturn(true)} variant="outline" size="sm"><Truck className="mr-1 h-4 w-4" /> Return</Button>}
            {canManage && <Button onClick={() => setShowTransfer(true)} variant="outline" size="sm"><ArrowRightLeft className="mr-1 h-4 w-4" /> Transfer</Button>}
            {canManage && <Button onClick={() => setShowLabels(true)} variant="outline" size="sm"><QrCode className="mr-1 h-4 w-4" /> QR Labels</Button>}
            {canManage && <Button onClick={() => setShowCsv(true)} variant="outline" size="sm"><Upload className="mr-1 h-4 w-4" /> CSV Import</Button>}
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
                    <TableHead className="text-right">Unit Cost</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                    <TableHead className="text-right">Reorder</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Location</TableHead>
                    {canManage && <TableHead className="text-right">Actions</TableHead>}
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
                      <TableCell className="font-medium">{canManage ? <button className="text-left hover:underline hover:text-primary transition-colors" onClick={() => setEditItem({ ...item })}>{item.name}</button> : item.name}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{item.barcode || "—"}</TableCell>
                      <TableCell><Badge variant="outline">{cfg.categoryLabels[item.category] || item.category}</Badge></TableCell>
                      <TableCell>{item.unit}</TableCell>
                      <TableCell className="text-right font-semibold">{item.quantity}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{item.unit_cost ? item.unit_cost.toLocaleString() : "—"}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{item.unit_cost ? ((item.quantity || 0) * item.unit_cost).toLocaleString() : "—"}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{item.reorder_level}</TableCell>
                      <TableCell>{STOCK_BADGE(item.quantity, item.reorder_level)}</TableCell>
                      <TableCell className="text-muted-foreground">{item.location}</TableCell>
                      {canManage && <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" title="Receive Stock" onClick={() => { setReceiveForm({ item_id: item.item_id, quantity: 1, notes: "" }); setReceiveItemName(item.name); setShowReceive(true); }}>
                            <PackagePlus className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" title="Edit" onClick={() => setEditItem({ ...item })}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>}
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
            {canManage && <Button onClick={() => setShowRequest(true)} size="sm"><Send className="mr-1 h-4 w-4" /> New Request</Button>}
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
                    {canManage && <TableHead className="text-right">Actions</TableHead>}
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
                      {canManage && <TableCell className="text-right">
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
                      </TableCell>}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ═══════════════ TAB: DELIVERY NOTES ═══════════════ */}
      {tab === "delivery_notes" && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            <select value={dnStatusFilter} onChange={(e) => setDnStatusFilter(e.target.value)} className="rounded-md border bg-background px-3 py-2 text-sm">
              <option value="all">All Statuses</option>
              <option value="pending_acknowledgment">Pending</option>
              <option value="acknowledged">Acknowledged</option>
            </select>
            <select value={dnBranchFilter} onChange={(e) => setDnBranchFilter(e.target.value)} className="rounded-md border bg-background px-3 py-2 text-sm">
              <option value="all">All Branches</option>
              <option value="boys">Boys</option>
              <option value="girls">Girls</option>
            </select>
            {canManage && (
              <Button onClick={() => setShowQuickIssue(true)} size="sm">
                <Truck className="mr-1 h-4 w-4" /> Quick Issue
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => {
              const headers = ["DN #", "Date", "Store", "Branch", "Receiver", "Department", "Items", "Status", "Request #"];
              const rows = filteredDNs.map((dn) => [
                dn.dn_number, new Date(dn.issued_at).toLocaleDateString(), dn.store_type,
                dn.branch, dn.received_by_name || dn.received_by, dn.department,
                dn.items.length, dn.status.replace("_", " "), dn.request_id || "",
              ]);
              exportToCSV(`${cfg.idPrefix}_delivery_notes`, headers, rows);
            }}>
              <FileDown className="mr-1 h-4 w-4" /> Export CSV
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>DN #</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Receiver</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead className="text-center">Items</TableHead>
                    <TableHead>Branch</TableHead>
                    <TableHead>Request #</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDNs.length === 0 ? (
                    <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No delivery notes found</TableCell></TableRow>
                  ) : filteredDNs.map((dn) => (
                    <TableRow key={dn.id}>
                      <TableCell className="font-mono text-xs">{dn.dn_number}</TableCell>
                      <TableCell>{new Date(dn.issued_at).toLocaleDateString()}</TableCell>
                      <TableCell>{dn.received_by_name || dn.received_by || "—"}</TableCell>
                      <TableCell>{dn.department || "—"}</TableCell>
                      <TableCell className="text-center">{dn.items.length}</TableCell>
                      <TableCell>{dn.branch || "—"}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{dn.request_id || "—"}</TableCell>
                      <TableCell>
                        {dn.status === "acknowledged" ? (
                          <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">Acknowledged</Badge>
                        ) : (
                          <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300">Pending</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" title="Print PDF" onClick={() => window.open(`/api/delivery-notes/pdf?id=${dn.id}`, "_blank")}>
                            <Printer className="h-4 w-4" />
                          </Button>
                          {dn.status === "pending_acknowledgment" && canManage && (
                            <Button size="sm" variant="outline" onClick={() => handleAcknowledge(dn.id)} disabled={saving}>
                              <ClipboardCheck className="h-4 w-4 mr-1" /> Acknowledge
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
              <option value="adjustment">Adjustments</option>
              <option value="return">Returns</option>
              <option value="transfer_out">Transfers Out</option>
              <option value="transfer_in">Transfers In</option>
            </select>
            <Button variant="outline" size="sm" onClick={() => {
              const headers = ["Txn ID", "Date", "Type", "Item ID", "Item Name", "Quantity", "Reason", "Request ID", "Staff", "Performed By"];
              const rows = filteredTransactions.map((t) => [
                t.txn_id, new Date(t.timestamp).toLocaleDateString(), t.type,
                t.item_id, t.item_name, t.quantity, t.reason || "",
                t.request_id || "", t.staff_name || "", t.performed_by_name || t.performed_by,
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
                        <Badge className={
                          t.type === "receive" ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300"
                          : t.type === "adjustment" ? "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300"
                          : t.type === "return" ? "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300"
                          : "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300"
                        }>
                          {t.type === "receive" ? "Received" : t.type === "adjustment" ? "Adjusted" : t.type === "return" ? "Returned" : "Issued"}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">{t.item_name}</TableCell>
                      <TableCell className="text-right font-semibold">{t.type === "adjustment" && t.quantity > 0 ? "+" : ""}{t.quantity}</TableCell>
                      <TableCell>{t.staff_name || "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{t.request_id || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{t.performed_by_name || t.performed_by}</TableCell>
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
        <StoreReportsSection items={items} transactions={transactions} requests={requests} deliveryNotes={deliveryNotes} cfg={cfg} />
      )}

      {/* ═══════════════ TAB: REPORTS ═══════════════ */}
      {tab === "reports" && (
        <StoreReportsSection items={items} transactions={transactions} requests={requests} deliveryNotes={deliveryNotes} cfg={cfg} />
      )}

      {/* ═══════════════ TAB: PURCHASE ORDERS ═══════════════ */}
      {tab === "purchase_orders" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Purchase Orders</h2>
            <Button onClick={() => setShowCreatePO(true)}>
              <Plus className="mr-1 h-4 w-4" /> New PO
            </Button>
          </div>

          {purchaseOrders.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <ShoppingCart className="h-12 w-12 text-muted-foreground mb-2" />
                <p className="text-muted-foreground">No purchase orders yet.</p>
              </CardContent>
            </Card>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PO #</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead className="text-right">Total Cost</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchaseOrders.map((po) => (
                  <TableRow key={po.id}>
                    <TableCell className="font-medium">{po.po_number}</TableCell>
                    <TableCell>{po.supplier}</TableCell>
                    <TableCell>{po.items.length} items</TableCell>
                    <TableCell className="text-right">{po.total_cost.toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge variant={po.status === "received" ? "default" : po.status === "approved" ? "secondary" : po.status === "partial" ? "outline" : "destructive"}>
                        {po.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{new Date(po.created_at).toLocaleDateString()}</TableCell>
                    <TableCell className="space-x-1">
                      {po.status === "draft" && (
                        <Button size="sm" variant="outline" onClick={() => handleApprovePO(po.id)}>
                          <CheckCircle className="mr-1 h-3 w-3" /> Approve
                        </Button>
                      )}
                      {(po.status === "approved" || po.status === "partial") && (
                        <Button size="sm" variant="outline" onClick={() => { setShowReceivePO(po.id); setReceivePoItems({}); }}>
                          <PackagePlus className="mr-1 h-3 w-3" /> Receive
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      )}

      {/* ═══════════════ TAB: STOCK TAKE ═══════════════ */}
      {tab === "stock_take" && (
        <div className="space-y-4">
          {activeStockTake ? (
            /* ── Active Stock Take Detail ── */
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Stock Take in Progress</CardTitle>
                  <CardDescription>
                    {(activeStockTake as { counted?: number }).counted ?? 0} of {Object.keys(activeStockTake.items).length} items counted
                    {(activeStockTake as { variances?: number }).variances ? ` · ${(activeStockTake as { variances?: number }).variances} variances` : ""}
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setActiveStockTake(null)}>Back</Button>
                  {activeStockTake.status === "in_progress" && (
                    <>
                      <Button variant="destructive" size="sm" onClick={() => handleCancelStockTake(activeStockTake.id)} disabled={saving}>
                        Cancel Stock Take
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleCompleteStockTake(false)} disabled={saving}>
                        Complete (No Adjust)
                      </Button>
                      <Button size="sm" onClick={() => handleCompleteStockTake(true)} disabled={saving}>
                        {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-1 h-4 w-4" />}
                        Complete & Apply
                      </Button>
                    </>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="mb-4 relative max-w-sm">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input placeholder="Search items by name..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
                </div>
                {stLoading ? (
                  <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead className="text-center">System Qty</TableHead>
                        <TableHead className="text-center">Counted Qty</TableHead>
                        <TableHead className="text-center">Variance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Object.entries(activeStockTake.items).filter(([, it]) => !search || it.name.toLowerCase().includes(search.toLowerCase())).sort((a, b) => a[1].name.localeCompare(b[1].name)).map(([itemId, it]) => {
                        const variance = it.counted_qty !== null ? it.counted_qty - it.system_qty : null;
                        return (
                          <TableRow key={itemId} className={variance !== null && variance !== 0 ? "bg-yellow-50 dark:bg-yellow-950/20" : ""}>
                            <TableCell className="font-medium">{it.name}</TableCell>
                            <TableCell className="text-center">{it.system_qty}</TableCell>
                            <TableCell className="text-center">
                              {activeStockTake.status === "in_progress" ? (
                                <Input
                                  type="number"
                                  min={0}
                                  className="w-20 mx-auto text-center"
                                  defaultValue={it.counted_qty ?? ""}
                                  placeholder="—"
                                  onBlur={(e) => {
                                    const v = e.target.value;
                                    if (v !== "" && !isNaN(Number(v))) handleCountUpdate(itemId, Number(v));
                                  }}
                                />
                              ) : (
                                it.counted_qty ?? "—"
                              )}
                            </TableCell>
                            <TableCell className="text-center">
                              {variance !== null ? (
                                <span className={variance === 0 ? "text-green-600" : variance > 0 ? "text-blue-600 font-semibold" : "text-red-600 font-semibold"}>
                                  {variance > 0 ? "+" : ""}{variance}
                                </span>
                              ) : "—"}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          ) : (
            /* ── Stock Take List ── */
            <>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Stock Takes</h2>
                <Button onClick={handleCreateStockTake} disabled={saving}>
                  {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />}
                  New Stock Take
                </Button>
              </div>
              {stockTakes.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <ClipboardPen className="h-12 w-12 text-muted-foreground mb-2" />
                    <p className="text-muted-foreground">No stock takes yet. Start a new one to count your inventory.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-3">
                  {stockTakes.map((st) => (
                    <Card key={st.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => loadStockTake(st.id)}>
                      <CardContent className="flex items-center justify-between py-4">
                        <div>
                          <p className="font-medium">
                            {new Date(st.created_at).toLocaleDateString()} — {st.item_count} items
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Created by {st.created_by} · {st.counted}/{st.item_count} counted
                            {st.variances > 0 && ` · ${st.variances} variances`}
                          </p>
                        </div>
                        <Badge variant={st.status === "completed" ? "default" : "secondary"}>
                          {st.status === "completed" ? (st.adjustments_applied ? "Applied" : "Completed") : "In Progress"}
                        </Badge>
                        {st.status === "in_progress" && (
                          <Button variant="ghost" size="sm" className="ml-2 text-red-500 hover:text-red-700" onClick={(e) => { e.stopPropagation(); handleCancelStockTake(st.id); }} disabled={saving} title="Cancel stock take">
                            ✕
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
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
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-sm font-medium">Unit Cost</label><Input type="number" min={0} step={0.01} value={addForm.unit_cost || ""} onChange={(e) => setAddForm({ ...addForm, unit_cost: parseFloat(e.target.value) || 0 })} placeholder="0.00" /></div>
              <div><label className="text-sm font-medium">Expiry Date</label><Input type="date" value={addForm.expiry_date} onChange={(e) => setAddForm({ ...addForm, expiry_date: e.target.value })} /></div>
            </div>
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
              <div className="grid grid-cols-2 gap-4">
                <div><label className="text-sm font-medium">Unit Cost</label><Input type="number" min={0} step={0.01} value={editItem.unit_cost || ""} onChange={(e) => setEditItem({ ...editItem, unit_cost: parseFloat(e.target.value) || 0 })} placeholder="0.00" /></div>
                <div><label className="text-sm font-medium">Expiry Date</label><Input type="date" value={editItem.expiry_date || ""} onChange={(e) => setEditItem({ ...editItem, expiry_date: e.target.value })} /></div>
              </div>
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
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Receive Stock</DialogTitle>
            <DialogDescription>{receiveItemName ? `Add received quantity for: ${receiveItemName}` : "Select an item and enter received quantity"}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {!receiveItemName && (
              <div>
                <label className="text-sm font-medium">Item *</label>
                <select
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm mt-1"
                  value={receiveForm.item_id}
                  onChange={(e) => {
                    const sel = items.find((i) => i.item_id === e.target.value);
                    setReceiveForm({ ...receiveForm, item_id: e.target.value });
                    setReceiveItemName(sel ? sel.name : "");
                  }}
                >
                  <option value="">Select item...</option>
                  {items.filter((i) => i.is_active !== false).map((i) => (
                    <option key={i.id} value={i.item_id}>{i.name} {i.barcode ? `[${i.barcode}]` : ""} ({i.quantity} in stock)</option>
                  ))}
                </select>
              </div>
            )}
            {receiveItemName && !receiveForm.item_id && <input type="hidden" />}
            <div><label className="text-sm font-medium">Quantity *</label><Input type="number" min={1} value={receiveForm.quantity} onChange={(e) => setReceiveForm({ ...receiveForm, quantity: parseInt(e.target.value) || 1 })} /></div>
            <div>
              <label className="text-sm font-medium">Purchase Order <span className="text-muted-foreground font-normal">(optional)</span></label>
              <select
                className="w-full rounded-md border bg-background px-3 py-2 text-sm mt-1"
                value={receiveForm.notes.startsWith("PO:") ? receiveForm.notes : ""}
                onChange={(e) => {
                  if (e.target.value) {
                    setReceiveForm({ ...receiveForm, notes: e.target.value });
                  } else {
                    setReceiveForm({ ...receiveForm, notes: receiveForm.notes.startsWith("PO:") ? "" : receiveForm.notes });
                  }
                }}
              >
                <option value="">No PO (direct receive)</option>
                {purchaseOrders.filter((po) => po.status === "approved" || po.status === "partial").map((po) => (
                  <option key={po.id} value={`PO: ${po.po_number} — ${po.supplier}`}>{po.po_number} — {po.supplier}</option>
                ))}
              </select>
            </div>
            <div><label className="text-sm font-medium">Notes</label><Input value={receiveForm.notes.startsWith("PO:") ? "" : receiveForm.notes} onChange={(e) => setReceiveForm({ ...receiveForm, notes: e.target.value })} placeholder="Supplier, invoice #, delivery ref..." /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReceive(false)}>Cancel</Button>
            <Button onClick={handleReceive} disabled={saving || receiveForm.quantity <= 0 || !receiveForm.item_id}>{saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <PackagePlus className="mr-1 h-4 w-4" />} Receive</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Adjust Stock Dialog */}
      <Dialog open={showAdjust} onOpenChange={setShowAdjust}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle>Adjust Stock</DialogTitle>
            <DialogDescription>Increase or decrease stock with a reason. Use negative numbers to reduce.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div>
              <label className="text-sm font-medium">Item</label>
              <select
                className="w-full rounded-md border bg-background px-3 py-2 text-sm mt-1"
                value={adjustForm.item_id}
                onChange={(e) => {
                  const sel = items.find((i) => i.item_id === e.target.value);
                  setAdjustForm({ ...adjustForm, item_id: e.target.value });
                  setAdjustItemName(sel ? `${sel.name} (current: ${sel.quantity})` : "");
                }}
              >
                <option value="">Select item...</option>
                {items.filter((i) => i.is_active !== false).map((i) => (
                  <option key={i.id} value={i.item_id}>{i.name} ({i.quantity} in stock)</option>
                ))}
              </select>
              {adjustItemName && <p className="text-xs text-muted-foreground mt-1">{adjustItemName}</p>}
            </div>
            <div><label className="text-sm font-medium">Quantity (+/-)</label><Input type="number" value={adjustForm.quantity} onChange={(e) => setAdjustForm({ ...adjustForm, quantity: parseInt(e.target.value) || 0 })} placeholder="e.g. -5 or +10" /></div>
            <div>
              <label className="text-sm font-medium">Reason *</label>
              <select className="w-full rounded-md border bg-background px-3 py-2 text-sm mt-1" value={adjustForm.reason} onChange={(e) => setAdjustForm({ ...adjustForm, reason: e.target.value })}>
                <option value="">Select reason...</option>
                <option value="Physical count correction">Physical count correction</option>
                <option value="Damaged/expired items">Damaged/expired items</option>
                <option value="Lost/missing items">Lost/missing items</option>
                <option value="Data entry error">Data entry error</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div><label className="text-sm font-medium">Notes</label><Input value={adjustForm.notes} onChange={(e) => setAdjustForm({ ...adjustForm, notes: e.target.value })} placeholder="Additional details..." /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdjust(false)}>Cancel</Button>
            <Button onClick={handleAdjust} disabled={saving || !adjustForm.item_id || adjustForm.quantity === 0 || !adjustForm.reason}>{saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ArrowUpDown className="mr-1 h-4 w-4" />} Adjust</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Return Stock Dialog */}
      <Dialog open={showReturn} onOpenChange={setShowReturn}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle>Return Stock</DialogTitle>
            <DialogDescription>Record items returned by staff back to inventory.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div>
              <label className="text-sm font-medium">Item</label>
              <select
                className="w-full rounded-md border bg-background px-3 py-2 text-sm mt-1"
                value={returnForm.item_id}
                onChange={(e) => {
                  const sel = items.find((i) => i.item_id === e.target.value);
                  setReturnForm({ ...returnForm, item_id: e.target.value });
                  setReturnItemName(sel ? sel.name : "");
                }}
              >
                <option value="">Select item...</option>
                {items.filter((i) => i.is_active !== false).map((i) => (
                  <option key={i.id} value={i.item_id}>{i.name}</option>
                ))}
              </select>
            </div>
            <div><label className="text-sm font-medium">Quantity</label><Input type="number" min={1} value={returnForm.quantity} onChange={(e) => setReturnForm({ ...returnForm, quantity: parseInt(e.target.value) || 1 })} /></div>
            <div><label className="text-sm font-medium">Staff Name</label><Input value={returnForm.staff_name} onChange={(e) => setReturnForm({ ...returnForm, staff_name: e.target.value })} placeholder="Who is returning?" /></div>
            <div>
              <label className="text-sm font-medium">Reason *</label>
              <select className="w-full rounded-md border bg-background px-3 py-2 text-sm mt-1" value={returnForm.reason} onChange={(e) => setReturnForm({ ...returnForm, reason: e.target.value })}>
                <option value="">Select reason...</option>
                <option value="No longer needed">No longer needed</option>
                <option value="Wrong item issued">Wrong item issued</option>
                <option value="Excess quantity">Excess quantity</option>
                <option value="Defective replacement">Defective replacement</option>
                <option value="Staff transfer/departure">Staff transfer/departure</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div><label className="text-sm font-medium">Notes</label><Input value={returnForm.notes} onChange={(e) => setReturnForm({ ...returnForm, notes: e.target.value })} placeholder="Additional details..." /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReturn(false)}>Cancel</Button>
            <Button onClick={handleReturn} disabled={saving || !returnForm.item_id || returnForm.quantity <= 0 || !returnForm.reason}>{saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Truck className="mr-1 h-4 w-4" />} Return</Button>
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
      <Dialog open={showRequest} onOpenChange={(open) => { setShowRequest(open); if (!open) { setStaffSearch(""); setStaffDropdownOpen(false); } }}>
        <DialogContent className="sm:max-w-[600px]" onClick={() => setStaffDropdownOpen(false)}>
          <DialogHeader>
            <DialogTitle>New Requisition Request</DialogTitle>
            <DialogDescription>Submit a request for items from {cfg.label}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div>
              <label className="text-sm font-medium">Requester *</label>
              <div className="relative" onClick={(e) => e.stopPropagation()}>
                <Input
                  value={staffSearch}
                  onChange={(e) => { setStaffSearch(e.target.value); setStaffDropdownOpen(true); if (!e.target.value) setReqForm({ ...reqForm, staff: "", staffName: "" }); }}
                  onFocus={() => setStaffDropdownOpen(true)}
                  placeholder={reqForm.staffName || "Search staff by name..."}
                  className={reqForm.staff ? "border-green-500" : ""}
                />
                {reqForm.staff && (
                  <div className="flex items-center gap-1 mt-1">
                    <CheckCircle className="h-3 w-3 text-green-600" />
                    <span className="text-xs text-green-600">{reqForm.staffName} ({reqForm.staff})</span>
                    <button type="button" className="text-xs text-muted-foreground hover:text-destructive ml-1" onClick={() => { setReqForm({ ...reqForm, staff: "", staffName: "" }); setStaffSearch(""); }}>✕</button>
                  </div>
                )}
                {staffDropdownOpen && filteredStaffList.length > 0 && (
                  <div className="absolute z-50 mt-1 w-full max-h-48 overflow-auto rounded-md border bg-popover shadow-md">
                    {filteredStaffList.map((s) => (
                      <button
                        key={s.Staff_Number}
                        type="button"
                        className="w-full px-3 py-2 text-left text-sm hover:bg-accent flex justify-between items-center"
                        onClick={() => {
                          setReqForm({ ...reqForm, staff: s.Staff_Number, staffName: s.E_Full_Name || s.Staff_Number });
                          setStaffSearch("");
                          setStaffDropdownOpen(false);
                        }}
                      >
                        <span>{s.E_Full_Name || s.Staff_Number}</span>
                        <span className="text-xs text-muted-foreground">{s.Staff_Number}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
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

      {/* ═══════════════ DIALOG: QUICK ISSUE ═══════════════ */}
      <Dialog open={showQuickIssue} onOpenChange={(open) => { setShowQuickIssue(open); if (!open) setQiError(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Truck className="h-5 w-5" /> Quick Issue</DialogTitle>
            <DialogDescription>Issue items directly without a prior request. A delivery note will be created automatically.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Receiver */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Receiver (Staff)</label>
              <div className="relative">
                <Input
                  placeholder="Search staff by name or number…"
                  value={qiStaffSearch || qiForm.staffName}
                  onChange={(e) => { setQiStaffSearch(e.target.value); setQiStaffDropdownOpen(true); }}
                  onFocus={() => setQiStaffDropdownOpen(true)}
                />
                {qiStaffDropdownOpen && filteredQiStaffList.length > 0 && (
                  <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg max-h-40 overflow-y-auto">
                    {filteredQiStaffList.map((s) => (
                      <button key={s.Staff_Number} className="w-full px-3 py-2 text-left text-sm hover:bg-accent"
                        onClick={() => {
                          setQiForm({ ...qiForm, staff: s.Staff_Number, staffName: s.E_Full_Name || s.Staff_Number });
                          setQiStaffSearch("");
                          setQiStaffDropdownOpen(false);
                        }}>
                        {s.E_Full_Name || s.Staff_Number} <span className="text-muted-foreground">({s.Staff_Number})</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {qiForm.staff && <p className="text-xs text-muted-foreground">Selected: {qiForm.staffName} ({qiForm.staff})</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium">Department</label>
                <Input value={qiForm.department} onChange={(e) => setQiForm({ ...qiForm, department: e.target.value })} placeholder="e.g. Science Dept" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Branch</label>
                <select value={qiForm.branch} onChange={(e) => setQiForm({ ...qiForm, branch: e.target.value })} className="w-full rounded-md border bg-background px-3 py-2 text-sm">
                  <option value="">— Select —</option>
                  <option value="boys">Boys</option>
                  <option value="girls">Girls</option>
                </select>
              </div>
            </div>

            {/* Items */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Items</label>
                <Button size="sm" variant="outline" onClick={() => setQiForm({ ...qiForm, items: [...qiForm.items, { item_id: "", item_name: "", qty: 1, condition: "good", remarks: "" }] })}>
                  <Plus className="mr-1 h-3 w-3" /> Add Item
                </Button>
              </div>
              {qiForm.items.map((it, idx) => (
                <div key={idx} className="rounded-md border p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <select
                      value={it.item_id}
                      onChange={(e) => {
                        const sel = items.find((i) => i.item_id === e.target.value);
                        const updated = [...qiForm.items];
                        updated[idx] = { ...it, item_id: e.target.value, item_name: sel?.name || "" };
                        setQiForm({ ...qiForm, items: updated });
                      }}
                      className="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
                    >
                      <option value="">Select item…</option>
                      {items.filter((i) => i.is_active !== false).map((i) => (
                        <option key={i.item_id} value={i.item_id}>{i.name} ({i.quantity} avail.)</option>
                      ))}
                    </select>
                    <Input
                      type="number" min={1} value={it.qty}
                      onChange={(e) => { const updated = [...qiForm.items]; updated[idx] = { ...it, qty: parseInt(e.target.value) || 1 }; setQiForm({ ...qiForm, items: updated }); }}
                      className="w-20" placeholder="Qty"
                    />
                    <Button size="sm" variant="ghost" onClick={() => { const updated = qiForm.items.filter((_, i) => i !== idx); setQiForm({ ...qiForm, items: updated }); }}>
                      <Minus className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={it.condition}
                      onChange={(e) => { const updated = [...qiForm.items]; updated[idx] = { ...it, condition: e.target.value }; setQiForm({ ...qiForm, items: updated }); }}
                      className="rounded-md border bg-background px-3 py-1.5 text-xs"
                    >
                      <option value="good">Good</option>
                      <option value="damaged">Damaged</option>
                      <option value="partial">Partial</option>
                    </select>
                    <Input
                      value={it.remarks}
                      onChange={(e) => { const updated = [...qiForm.items]; updated[idx] = { ...it, remarks: e.target.value }; setQiForm({ ...qiForm, items: updated }); }}
                      className="flex-1 text-xs h-8" placeholder="Remarks (optional)"
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">Notes</label>
              <Input value={qiForm.notes} onChange={(e) => setQiForm({ ...qiForm, notes: e.target.value })} placeholder="Optional notes" />
            </div>
          </div>

          <DialogFooter>
            {qiError && (
              <p className="flex-1 text-sm text-red-600 flex items-center gap-1">
                <XCircle className="h-4 w-4 shrink-0" /> {qiError}
              </p>
            )}
            <Button variant="outline" onClick={() => setShowQuickIssue(false)}>Cancel</Button>
            <Button onClick={handleQuickIssue} disabled={saving || !qiForm.staff || qiForm.items.length === 0 || qiForm.items.some((i) => !i.item_id)}>
              {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Truck className="mr-1 h-4 w-4" />}
              Issue & Create DN
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════════ DIALOG: DN CREATED TOAST ═══════════════ */}
      <Dialog open={!!issuedDn} onOpenChange={() => setIssuedDn(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-600"><CheckCircle className="h-5 w-5" /> Delivery Note Created</DialogTitle>
          </DialogHeader>
          <p className="text-sm">
            Delivery note <span className="font-mono font-semibold">{issuedDn?.dn_number}</span> has been created successfully.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIssuedDn(null)}>Close</Button>
            <Button onClick={() => { if (issuedDn) window.open(`/api/delivery-notes/pdf?id=${issuedDn.id}`, "_blank"); setIssuedDn(null); }}>
              <Printer className="mr-1 h-4 w-4" /> Print DN
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transfer Dialog */}
      <Dialog open={showTransfer} onOpenChange={setShowTransfer}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Transfer to {cfg.type === "general" ? "IT Store" : "General Store"}</DialogTitle>
            <DialogDescription>Select items to transfer to the other store.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <select className="w-full border rounded px-2 py-1.5 text-sm" onChange={(e) => {
              const item = items.find((i) => i.item_id === e.target.value);
              if (item && !transferItems_state.find((t) => t.item_id === item.item_id)) {
                setTransferItems_state([...transferItems_state, { item_id: item.item_id, item_name: item.name, quantity: 1 }]);
              }
              e.target.value = "";
            }}>
              <option value="">+ Add item...</option>
              {items.filter((i) => (i.quantity || 0) > 0).map((i) => (
                <option key={i.item_id} value={i.item_id}>{i.name} (qty: {i.quantity})</option>
              ))}
            </select>
            {transferItems_state.map((ti, idx) => {
              const srcItem = items.find((i) => i.item_id === ti.item_id);
              const maxQty = srcItem?.quantity || 0;
              return (
                <div key={ti.item_id} className="flex items-center gap-2 text-sm">
                  <span className="flex-1 truncate">{ti.item_name}</span>
                  <Input type="number" min={1} max={maxQty} className="w-20" value={ti.quantity}
                    onChange={(e) => {
                      const updated = [...transferItems_state];
                      updated[idx] = { ...updated[idx], quantity: Math.min(Number(e.target.value) || 1, maxQty) };
                      setTransferItems_state(updated);
                    }} />
                  <Button variant="ghost" size="sm" onClick={() => setTransferItems_state(transferItems_state.filter((_, i) => i !== idx))}>
                    <XCircle className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTransfer(false)}>Cancel</Button>
            <Button onClick={handleTransfer} disabled={saving || transferItems_state.length === 0}>
              {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ArrowRightLeft className="mr-1 h-4 w-4" />}
              Transfer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* QR Label Generator */}
      <LabelGenerator items={items} open={showLabels} onOpenChange={setShowLabels} storeLabel={cfg.label} />

      {/* Create PO Dialog */}
      <Dialog open={showCreatePO} onOpenChange={setShowCreatePO}>
        <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Purchase Order</DialogTitle>
            <DialogDescription>Add supplier details and items to order.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Supplier name *" value={poForm.supplier} onChange={(e) => setPoForm({ ...poForm, supplier: e.target.value })} />
            <Input type="date" placeholder="Expected delivery date" value={poForm.expected_date} onChange={(e) => setPoForm({ ...poForm, expected_date: e.target.value })} />
            <Input placeholder="Notes" value={poForm.notes} onChange={(e) => setPoForm({ ...poForm, notes: e.target.value })} />
            <div className="border rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Items</p>
                <select className="border rounded px-2 py-1 text-sm" onChange={(e) => {
                  const item = items.find((i) => i.item_id === e.target.value);
                  if (item && !poForm.items.find((i) => i.item_id === item.item_id)) {
                    setPoForm({ ...poForm, items: [...poForm.items, { item_id: item.item_id, item_name: item.name, quantity: 1, unit_cost: 0 }] });
                  }
                  e.target.value = "";
                }}>
                  <option value="">+ Add item...</option>
                  {items.map((i) => <option key={i.item_id} value={i.item_id}>{i.name}</option>)}
                </select>
              </div>
              {poForm.items.map((pi, idx) => (
                <div key={pi.item_id} className="flex items-center gap-2 text-sm">
                  <span className="flex-1 truncate">{pi.item_name}</span>
                  <Input type="number" min={1} className="w-20" placeholder="Qty" value={pi.quantity} onChange={(e) => {
                    const updated = [...poForm.items];
                    updated[idx] = { ...updated[idx], quantity: Number(e.target.value) || 1 };
                    setPoForm({ ...poForm, items: updated });
                  }} />
                  <Input type="number" min={0} className="w-24" placeholder="Unit cost" value={pi.unit_cost || ""} onChange={(e) => {
                    const updated = [...poForm.items];
                    updated[idx] = { ...updated[idx], unit_cost: Number(e.target.value) || 0 };
                    setPoForm({ ...poForm, items: updated });
                  }} />
                  <Button variant="ghost" size="sm" onClick={() => setPoForm({ ...poForm, items: poForm.items.filter((_, i) => i !== idx) })}>
                    <XCircle className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              {poForm.items.length > 0 && (
                <p className="text-sm text-muted-foreground text-right">
                  Total: {poForm.items.reduce((s, i) => s + i.quantity * i.unit_cost, 0).toLocaleString()}
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreatePO(false)}>Cancel</Button>
            <Button onClick={handleCreatePO} disabled={saving || !poForm.supplier || poForm.items.length === 0}>
              {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ShoppingCart className="mr-1 h-4 w-4" />}
              Create PO
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Receive PO Dialog */}
      <Dialog open={!!showReceivePO} onOpenChange={() => setShowReceivePO(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Receive Items</DialogTitle>
            <DialogDescription>Enter quantities received for this purchase order.</DialogDescription>
          </DialogHeader>
          {showReceivePO && (() => {
            const po = purchaseOrders.find((p) => p.id === showReceivePO);
            if (!po) return null;
            return (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">PO: {po.po_number} — {po.supplier}</p>
                {po.items.map((pi) => {
                  const remaining = pi.quantity - pi.received_qty;
                  return (
                    <div key={pi.item_id} className="flex items-center gap-3 text-sm">
                      <span className="flex-1">{pi.item_name} (need {remaining})</span>
                      <Input type="number" min={0} max={remaining} className="w-20" value={receivePoItems[pi.item_id] || ""} placeholder="0"
                        onChange={(e) => setReceivePoItems({ ...receivePoItems, [pi.item_id]: Math.min(Number(e.target.value) || 0, remaining) })} />
                    </div>
                  );
                })}
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReceivePO(null)}>Cancel</Button>
            <Button onClick={() => showReceivePO && handleReceivePO(showReceivePO)} disabled={saving}>
              {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <PackagePlus className="mr-1 h-4 w-4" />}
              Receive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   STORE REPORTS — comprehensive reporting component
   ═══════════════════════════════════════════════════════════════ */

type StoreReportType = "inventory" | "issues" | "movements" | "low-stock" | "requests" | "valuation" | "delivery-notes" | "staff-consumption" | "department" | "branch-comparison" | "item-ledger" | "monthly-summary" | "stale-stock";

interface StoreReportsSectionProps {
  items: StoreItem[];
  transactions: StoreTransaction[];
  requests: StoreRequest[];
  deliveryNotes: DeliveryNote[];
  cfg: StoreConfig;
}

function StoreReportsSection({ items, transactions, requests, deliveryNotes, cfg }: StoreReportsSectionProps) {
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

  // Date-filtered delivery notes
  const filteredDNs = deliveryNotes.filter((dn) => {
    if (!dateFrom && !dateTo) return true;
    const d = dn.issued_at?.slice(0, 10) || "";
    if (dateFrom && d < dateFrom) return false;
    if (dateTo && d > dateTo) return false;
    return true;
  });

  // Selected item for item-ledger report
  const [ledgerItemId, setLedgerItemId] = useState("");

  // Stale stock threshold (days)
  const [staleDays, setStaleDays] = useState(30);

  const reportTabs: { key: StoreReportType; label: string; icon: React.ReactNode }[] = [
    { key: "inventory", label: "Full Inventory", icon: <Package className="h-4 w-4" /> },
    { key: "issues", label: "Issue Report", icon: <Truck className="h-4 w-4" /> },
    { key: "movements", label: "Stock Movement", icon: <ArrowUpDown className="h-4 w-4" /> },
    { key: "low-stock", label: "Low Stock", icon: <AlertTriangle className="h-4 w-4" /> },
    { key: "requests", label: "Request Analysis", icon: <ClipboardList className="h-4 w-4" /> },
    { key: "valuation", label: "Category Summary", icon: <BarChart3 className="h-4 w-4" /> },
    { key: "delivery-notes", label: "Delivery Notes", icon: <FileText className="h-4 w-4" /> },
    { key: "staff-consumption", label: "Staff Consumption", icon: <Users className="h-4 w-4" /> },
    { key: "department", label: "Department", icon: <ClipboardList className="h-4 w-4" /> },
    { key: "branch-comparison", label: "Branch Comparison", icon: <ArrowUpDown className="h-4 w-4" /> },
    { key: "item-ledger", label: "Item Ledger", icon: <Search className="h-4 w-4" /> },
    { key: "monthly-summary", label: "Monthly Summary", icon: <Calendar className="h-4 w-4" /> },
    { key: "stale-stock", label: "Stale Stock", icon: <AlertTriangle className="h-4 w-4" /> },
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
        issueTxns.map((t) => [t.timestamp?.slice(0, 10), t.timestamp?.slice(11, 16), t.item_name, t.quantity, t.request_id || "Quick Issue", t.staff_name || "—", t.performed_by_name || t.performed_by, t.notes]),
      );
    } else if (reportType === "movements") {
      exportToCSV(`stock-movements-${cfg.type}-${dateLabel}.csv`,
        ["Date", "Time", "Type", "Item", "Quantity", "Request ID", "Performed By", "Notes"],
        filteredTxns.map((t) => [t.timestamp?.slice(0, 10), t.timestamp?.slice(11, 16), t.type === "issue" ? "Issued" : "Received", t.item_name, t.quantity, t.request_id || "—", t.performed_by_name || t.performed_by, t.notes]),
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
    } else if (reportType === "delivery-notes") {
      exportToCSV(`delivery-notes-${cfg.type}-${dateLabel}.csv`,
        ["DN #", "Date", "Branch", "Receiver", "Department", "Items", "Status", "Request #", "Issued By", "Notes"],
        filteredDNs.map((dn) => [dn.dn_number, dn.issued_at?.slice(0, 10), dn.branch, dn.received_by_name || dn.received_by, dn.department, dn.items.length, dn.status.replace("_", " "), dn.request_id || "Quick Issue", dn.issued_by_name || dn.issued_by, dn.notes]),
      );
    } else if (reportType === "staff-consumption") {
      const byStaff: Record<string, { name: string; qty: number; count: number }> = {};
      for (const t of issueTxns) { const k = t.staff_number || t.staff_name || "unknown"; if (!byStaff[k]) byStaff[k] = { name: t.staff_name || k, qty: 0, count: 0 }; byStaff[k].qty += t.quantity; byStaff[k].count++; }
      exportToCSV(`staff-consumption-${cfg.type}-${dateLabel}.csv`,
        ["Staff", "Total Qty", "Transactions"],
        Object.values(byStaff).sort((a, b) => b.qty - a.qty).map((s) => [s.name, s.qty, s.count]),
      );
    } else if (reportType === "department") {
      const byDept: Record<string, { qty: number; dns: number }> = {};
      for (const dn of filteredDNs) { const d = dn.department || "Unspecified"; if (!byDept[d]) byDept[d] = { qty: 0, dns: 0 }; byDept[d].qty += dn.items.reduce((s, i) => s + i.quantity, 0); byDept[d].dns++; }
      exportToCSV(`department-consumption-${cfg.type}-${dateLabel}.csv`,
        ["Department", "Delivery Notes", "Total Items"],
        Object.entries(byDept).sort((a, b) => b[1].qty - a[1].qty).map(([dept, d]) => [dept, d.dns, d.qty]),
      );
    } else if (reportType === "branch-comparison") {
      const branches = ["boys", "girls"];
      const rows = branches.map((br) => {
        const bDns = filteredDNs.filter((d) => d.branch === br);
        return [br, bDns.length, bDns.reduce((s, d) => s + d.items.reduce((ss, i) => ss + i.quantity, 0), 0)];
      });
      exportToCSV(`branch-comparison-${cfg.type}-${dateLabel}.csv`, ["Branch", "Delivery Notes", "Total Items"], rows);
    } else if (reportType === "item-ledger") {
      const itemTxns = transactions.filter((t) => t.item_id === ledgerItemId).sort((a, b) => (a.timestamp || "").localeCompare(b.timestamp || ""));
      let balance = 0;
      exportToCSV(`item-ledger-${ledgerItemId}-${dateLabel}.csv`,
        ["Date", "Type", "Qty", "Running Balance", "Staff", "Request", "By", "Notes"],
        itemTxns.map((t) => { balance += t.type === "receive" ? t.quantity : -t.quantity; return [t.timestamp?.slice(0, 10), t.type, t.quantity, balance, t.staff_name || "", t.request_id || "", t.performed_by_name || t.performed_by, t.notes]; }),
      );
    } else if (reportType === "monthly-summary") {
      const byMonth: Record<string, { received: number; issued: number; requests: number }> = {};
      for (const t of filteredTxns) { const m = t.timestamp?.slice(0, 7) || "unknown"; if (!byMonth[m]) byMonth[m] = { received: 0, issued: 0, requests: 0 }; if (t.type === "receive") byMonth[m].received += t.quantity; else byMonth[m].issued += t.quantity; }
      for (const r of filteredReqs) { const m = r.requested_at?.slice(0, 7) || "unknown"; if (!byMonth[m]) byMonth[m] = { received: 0, issued: 0, requests: 0 }; byMonth[m].requests++; }
      exportToCSV(`monthly-summary-${cfg.type}-${dateLabel}.csv`,
        ["Month", "Received", "Issued", "Net", "Requests"],
        Object.entries(byMonth).sort().map(([m, d]) => [m, d.received, d.issued, d.received - d.issued, d.requests]),
      );
    } else if (reportType === "stale-stock") {
      const now = Date.now();
      const staleItems = activeItems.map((item) => {
        const lastTxn = transactions.filter((t) => t.item_id === item.item_id).sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""))[0];
        const lastDate = lastTxn?.timestamp ? new Date(lastTxn.timestamp).getTime() : 0;
        const daysSince = lastDate ? Math.floor((now - lastDate) / 86400000) : 9999;
        return { ...item, daysSince, lastDate: lastTxn?.timestamp?.slice(0, 10) || "Never" };
      }).filter((i) => i.daysSince >= staleDays && i.quantity > 0).sort((a, b) => b.daysSince - a.daysSince);
      exportToCSV(`stale-stock-${cfg.type}.csv`,
        ["Item", "Category", "Qty", "Last Activity", "Days Since"],
        staleItems.map((i) => [i.name, cfg.categoryLabels[i.category] || i.category, i.quantity, i.lastDate, i.daysSince]),
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
            {reportType !== "inventory" && reportType !== "low-stock" && reportType !== "valuation" && reportType !== "stale-stock" && reportType !== "item-ledger" && (
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
                      <TableCell className="text-sm">{t.performed_by_name || t.performed_by}</TableCell>
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
                      <TableCell className="text-sm">{t.performed_by_name || t.performed_by}</TableCell>
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

      {/* ── Report: Delivery Notes ── */}
      {reportType === "delivery-notes" && (
        <div className="space-y-6">
          {/* DN Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {(() => {
              const total = filteredDNs.length;
              const pending = filteredDNs.filter((d) => d.status === "pending_acknowledgment").length;
              const acknowledged = filteredDNs.filter((d) => d.status === "acknowledged").length;
              const totalItems = filteredDNs.reduce((s, d) => s + d.items.reduce((ss, i) => ss + i.quantity, 0), 0);
              return (<>
                <Card className="border-0 shadow-sm"><CardContent className="pt-4 pb-3 px-4"><div className="flex items-center justify-between mb-1"><span className="text-xs text-muted-foreground font-medium">Total DNs</span><FileText className="h-4 w-4 text-blue-500" /></div><div className="text-lg font-bold">{total}</div></CardContent></Card>
                <Card className="border-0 shadow-sm"><CardContent className="pt-4 pb-3 px-4"><div className="flex items-center justify-between mb-1"><span className="text-xs text-muted-foreground font-medium">Pending</span><AlertTriangle className="h-4 w-4 text-yellow-500" /></div><div className="text-lg font-bold text-yellow-600">{pending}</div></CardContent></Card>
                <Card className="border-0 shadow-sm"><CardContent className="pt-4 pb-3 px-4"><div className="flex items-center justify-between mb-1"><span className="text-xs text-muted-foreground font-medium">Acknowledged</span><CheckCircle className="h-4 w-4 text-green-500" /></div><div className="text-lg font-bold text-green-600">{acknowledged}</div></CardContent></Card>
                <Card className="border-0 shadow-sm"><CardContent className="pt-4 pb-3 px-4"><div className="flex items-center justify-between mb-1"><span className="text-xs text-muted-foreground font-medium">Total Items</span><Hash className="h-4 w-4 text-indigo-500" /></div><div className="text-lg font-bold">{totalItems}</div></CardContent></Card>
              </>);
            })()}
          </div>

          {/* Acknowledgment Rate */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><ClipboardCheck className="h-5 w-5" /> Acknowledgment Rate</CardTitle>
              <CardDescription>Percentage of delivery notes acknowledged by receivers</CardDescription>
            </CardHeader>
            <CardContent>
              {(() => {
                const total = filteredDNs.length;
                const ack = filteredDNs.filter((d) => d.status === "acknowledged").length;
                const rate = total > 0 ? Math.round((ack / total) * 100) : 0;
                return (
                  <div className="space-y-3">
                    <div className="flex items-center gap-4">
                      <div className="flex-1 rounded-full bg-muted h-6 overflow-hidden">
                        <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${rate}%` }} />
                      </div>
                      <span className="text-xl font-bold">{rate}%</span>
                    </div>
                    <p className="text-sm text-muted-foreground">{ack} of {total} delivery notes acknowledged</p>
                  </div>
                );
              })()}
            </CardContent>
          </Card>

          {/* DN Detail Table */}
          <Card>
            <CardHeader>
              <CardTitle>Delivery Notes Detail</CardTitle>
              <CardDescription>{filteredDNs.length} delivery notes in selected period</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>DN #</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Receiver</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Branch</TableHead>
                    <TableHead className="text-center">Items</TableHead>
                    <TableHead>Request</TableHead>
                    <TableHead>Issued By</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDNs.sort((a, b) => (b.issued_at || "").localeCompare(a.issued_at || "")).map((dn) => (
                    <TableRow key={dn.id}>
                      <TableCell className="font-mono text-xs">{dn.dn_number}</TableCell>
                      <TableCell className="text-sm">{dn.issued_at?.slice(0, 10)}</TableCell>
                      <TableCell className="font-medium">{dn.received_by_name || dn.received_by || "—"}</TableCell>
                      <TableCell>{dn.department || "—"}</TableCell>
                      <TableCell>{dn.branch || "—"}</TableCell>
                      <TableCell className="text-center">{dn.items.reduce((s, i) => s + i.quantity, 0)}</TableCell>
                      <TableCell className="font-mono text-xs">{dn.request_id || <span className="text-muted-foreground">Quick Issue</span>}</TableCell>
                      <TableCell className="text-sm">{dn.issued_by_name || dn.issued_by}</TableCell>
                      <TableCell>
                        {dn.status === "acknowledged"
                          ? <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">Acknowledged</Badge>
                          : <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300">Pending</Badge>}
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredDNs.length === 0 && (
                    <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No delivery notes found</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Report: Staff Consumption ── */}
      {reportType === "staff-consumption" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> Staff Consumption Ranking</CardTitle>
              <CardDescription>Items issued per staff member{dateFrom || dateTo ? ` (${dateFrom || "start"} → ${dateTo || "now"})` : ""}</CardDescription>
            </CardHeader>
            <CardContent>
              {(() => {
                const byStaff: Record<string, { name: string; qty: number; count: number; items: Record<string, number> }> = {};
                for (const t of issueTxns) {
                  const k = t.staff_number || t.staff_name || "unknown";
                  if (!byStaff[k]) byStaff[k] = { name: t.staff_name || k, qty: 0, count: 0, items: {} };
                  byStaff[k].qty += t.quantity;
                  byStaff[k].count++;
                  byStaff[k].items[t.item_name] = (byStaff[k].items[t.item_name] || 0) + t.quantity;
                }
                const sorted = Object.entries(byStaff).sort((a, b) => b[1].qty - a[1].qty);
                if (sorted.length === 0) return <p className="text-muted-foreground text-center py-8">No issues recorded</p>;
                const maxQty = sorted[0][1].qty;
                return (
                  <div className="space-y-1">
                    {sorted.map(([uid, s], idx) => (
                      <details key={uid} className="group">
                        <summary className="flex items-center gap-3 cursor-pointer py-1.5 hover:bg-accent rounded px-2">
                          <span className="text-xs text-muted-foreground w-6 text-right">{idx + 1}.</span>
                          <span className="w-44 truncate text-sm font-medium">{s.name}</span>
                          <div className="flex-1 rounded-full bg-muted h-4 overflow-hidden">
                            <div className="h-full rounded-full bg-orange-500/80" style={{ width: `${(s.qty / maxQty) * 100}%` }} />
                          </div>
                          <span className="text-sm font-semibold w-20 text-right">{s.qty} units</span>
                          <span className="text-xs text-muted-foreground w-14 text-right">({s.count}×)</span>
                        </summary>
                        <div className="ml-12 mb-2 pl-4 border-l-2">
                          <Table>
                            <TableHeader><TableRow><TableHead>Item</TableHead><TableHead className="text-right">Qty</TableHead></TableRow></TableHeader>
                            <TableBody>
                              {Object.entries(s.items).sort((a, b) => b[1] - a[1]).map(([item, qty]) => (
                                <TableRow key={item}><TableCell className="text-sm">{item}</TableCell><TableCell className="text-right font-semibold">{qty}</TableCell></TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </details>
                    ))}
                  </div>
                );
              })()}
            </CardContent>
          </Card>

          {/* Summary Table */}
          <Card>
            <CardHeader><CardTitle>Staff Consumption Table</CardTitle></CardHeader>
            <CardContent>
              {(() => {
                const byStaff: Record<string, { name: string; qty: number; count: number; uniqueItems: Set<string> }> = {};
                for (const t of issueTxns) {
                  const k = t.staff_number || t.staff_name || "unknown";
                  if (!byStaff[k]) byStaff[k] = { name: t.staff_name || k, qty: 0, count: 0, uniqueItems: new Set() };
                  byStaff[k].qty += t.quantity;
                  byStaff[k].count++;
                  byStaff[k].uniqueItems.add(t.item_id);
                }
                const sorted = Object.entries(byStaff).sort((a, b) => b[1].qty - a[1].qty);
                if (sorted.length === 0) return <p className="text-muted-foreground text-center py-8">No data</p>;
                return (
                  <Table>
                    <TableHeader><TableRow><TableHead>#</TableHead><TableHead>Staff</TableHead><TableHead className="text-right">Total Qty</TableHead><TableHead className="text-right">Transactions</TableHead><TableHead className="text-right">Unique Items</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {sorted.map(([uid, s], idx) => (
                        <TableRow key={uid}>
                          <TableCell>{idx + 1}</TableCell>
                          <TableCell className="font-medium">{s.name}</TableCell>
                          <TableCell className="text-right font-semibold">{s.qty}</TableCell>
                          <TableCell className="text-right">{s.count}</TableCell>
                          <TableCell className="text-right">{s.uniqueItems.size}</TableCell>
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

      {/* ── Report: Department Consumption ── */}
      {reportType === "department" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><ClipboardList className="h-5 w-5" /> Department Consumption</CardTitle>
              <CardDescription>Items issued per department (from delivery notes){dateFrom || dateTo ? ` (${dateFrom || "start"} → ${dateTo || "now"})` : ""}</CardDescription>
            </CardHeader>
            <CardContent>
              {(() => {
                const byDept: Record<string, { qty: number; dns: number; items: Record<string, number> }> = {};
                for (const dn of filteredDNs) {
                  const dept = dn.department || "Unspecified";
                  if (!byDept[dept]) byDept[dept] = { qty: 0, dns: 0, items: {} };
                  byDept[dept].dns++;
                  for (const it of dn.items) {
                    byDept[dept].qty += it.quantity;
                    byDept[dept].items[it.item_name] = (byDept[dept].items[it.item_name] || 0) + it.quantity;
                  }
                }
                const sorted = Object.entries(byDept).sort((a, b) => b[1].qty - a[1].qty);
                if (sorted.length === 0) return <p className="text-muted-foreground text-center py-8">No delivery notes found</p>;
                const maxQty = sorted[0][1].qty;
                return (
                  <div className="space-y-1">
                    {sorted.map(([dept, d]) => (
                      <details key={dept} className="group">
                        <summary className="flex items-center gap-3 cursor-pointer py-1.5 hover:bg-accent rounded px-2">
                          <span className="w-44 truncate text-sm font-medium">{dept}</span>
                          <div className="flex-1 rounded-full bg-muted h-4 overflow-hidden">
                            <div className="h-full rounded-full bg-purple-500/80" style={{ width: `${(d.qty / maxQty) * 100}%` }} />
                          </div>
                          <span className="text-sm font-semibold w-20 text-right">{d.qty} units</span>
                          <span className="text-xs text-muted-foreground w-14 text-right">{d.dns} DNs</span>
                        </summary>
                        <div className="ml-12 mb-2 pl-4 border-l-2">
                          <Table>
                            <TableHeader><TableRow><TableHead>Item</TableHead><TableHead className="text-right">Qty</TableHead></TableRow></TableHeader>
                            <TableBody>
                              {Object.entries(d.items).sort((a, b) => b[1] - a[1]).map(([item, qty]) => (
                                <TableRow key={item}><TableCell className="text-sm">{item}</TableCell><TableCell className="text-right font-semibold">{qty}</TableCell></TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </details>
                    ))}
                  </div>
                );
              })()}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Department Summary Table</CardTitle></CardHeader>
            <CardContent>
              {(() => {
                const byDept: Record<string, { qty: number; dns: number; uniqueItems: Set<string> }> = {};
                for (const dn of filteredDNs) {
                  const dept = dn.department || "Unspecified";
                  if (!byDept[dept]) byDept[dept] = { qty: 0, dns: 0, uniqueItems: new Set() };
                  byDept[dept].dns++;
                  for (const it of dn.items) { byDept[dept].qty += it.quantity; byDept[dept].uniqueItems.add(it.item_id); }
                }
                const sorted = Object.entries(byDept).sort((a, b) => b[1].qty - a[1].qty);
                if (sorted.length === 0) return <p className="text-muted-foreground text-center py-8">No data</p>;
                return (
                  <Table>
                    <TableHeader><TableRow><TableHead>Department</TableHead><TableHead className="text-right">Delivery Notes</TableHead><TableHead className="text-right">Total Qty</TableHead><TableHead className="text-right">Unique Items</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {sorted.map(([dept, d]) => (
                        <TableRow key={dept}><TableCell className="font-medium">{dept}</TableCell><TableCell className="text-right">{d.dns}</TableCell><TableCell className="text-right font-semibold">{d.qty}</TableCell><TableCell className="text-right">{d.uniqueItems.size}</TableCell></TableRow>
                      ))}
                    </TableBody>
                  </Table>
                );
              })()}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Report: Branch Comparison ── */}
      {reportType === "branch-comparison" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><ArrowUpDown className="h-5 w-5" /> Boys vs Girls Comparison</CardTitle>
              <CardDescription>Side-by-side consumption comparison by branch{dateFrom || dateTo ? ` (${dateFrom || "start"} → ${dateTo || "now"})` : ""}</CardDescription>
            </CardHeader>
            <CardContent>
              {(() => {
                const data: Record<string, { boys: number; girls: number }> = {};
                for (const dn of filteredDNs) {
                  for (const it of dn.items) {
                    if (!data[it.item_name]) data[it.item_name] = { boys: 0, girls: 0 };
                    if (dn.branch === "boys") data[it.item_name].boys += it.quantity;
                    else if (dn.branch === "girls") data[it.item_name].girls += it.quantity;
                  }
                }
                const sorted = Object.entries(data).sort((a, b) => (b[1].boys + b[1].girls) - (a[1].boys + a[1].girls));
                if (sorted.length === 0) return <p className="text-muted-foreground text-center py-8">No delivery notes with branch info found</p>;

                const boysDNs = filteredDNs.filter((d) => d.branch === "boys");
                const girlsDNs = filteredDNs.filter((d) => d.branch === "girls");
                const boysTotal = boysDNs.reduce((s, d) => s + d.items.reduce((ss, i) => ss + i.quantity, 0), 0);
                const girlsTotal = girlsDNs.reduce((s, d) => s + d.items.reduce((ss, i) => ss + i.quantity, 0), 0);

                return (
                  <div className="space-y-6">
                    {/* Summary */}
                    <div className="grid grid-cols-2 gap-4">
                      <Card className="border-blue-200 dark:border-blue-800"><CardContent className="pt-4 pb-3 text-center">
                        <p className="text-xs text-muted-foreground uppercase font-medium mb-1">Boys Branch</p>
                        <p className="text-2xl font-bold text-blue-600">{boysTotal} units</p>
                        <p className="text-xs text-muted-foreground">{boysDNs.length} delivery notes</p>
                      </CardContent></Card>
                      <Card className="border-pink-200 dark:border-pink-800"><CardContent className="pt-4 pb-3 text-center">
                        <p className="text-xs text-muted-foreground uppercase font-medium mb-1">Girls Branch</p>
                        <p className="text-2xl font-bold text-pink-600">{girlsTotal} units</p>
                        <p className="text-xs text-muted-foreground">{girlsDNs.length} delivery notes</p>
                      </CardContent></Card>
                    </div>

                    {/* Per-item comparison */}
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Item</TableHead>
                          <TableHead className="text-right text-blue-600">Boys</TableHead>
                          <TableHead className="text-center">Comparison</TableHead>
                          <TableHead className="text-right text-pink-600">Girls</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sorted.slice(0, 30).map(([item, d]) => {
                          const total = d.boys + d.girls;
                          const boysP = total > 0 ? Math.round((d.boys / total) * 100) : 50;
                          return (
                            <TableRow key={item}>
                              <TableCell className="font-medium">{item}</TableCell>
                              <TableCell className="text-right font-semibold text-blue-600">{d.boys}</TableCell>
                              <TableCell>
                                <div className="flex h-3 rounded-full overflow-hidden bg-muted">
                                  <div className="bg-blue-500 h-full" style={{ width: `${boysP}%` }} />
                                  <div className="bg-pink-500 h-full" style={{ width: `${100 - boysP}%` }} />
                                </div>
                              </TableCell>
                              <TableCell className="text-right font-semibold text-pink-600">{d.girls}</TableCell>
                              <TableCell className="text-right font-bold">{total}</TableCell>
                            </TableRow>
                          );
                        })}
                        <TableRow className="border-t-2 font-bold">
                          <TableCell>TOTAL</TableCell>
                          <TableCell className="text-right text-blue-600">{boysTotal}</TableCell>
                          <TableCell />
                          <TableCell className="text-right text-pink-600">{girlsTotal}</TableCell>
                          <TableCell className="text-right">{boysTotal + girlsTotal}</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                );
              })()}
            </CardContent>
          </Card>

          {/* By Category */}
          <Card>
            <CardHeader><CardTitle>Branch Comparison by Category</CardTitle></CardHeader>
            <CardContent>
              {(() => {
                const catData: Record<string, { boys: number; girls: number }> = {};
                for (const dn of filteredDNs) {
                  for (const it of dn.items) {
                    const item = items.find((i) => i.item_id === it.item_id);
                    const cat = item ? (cfg.categoryLabels[item.category] || item.category) : "Other";
                    if (!catData[cat]) catData[cat] = { boys: 0, girls: 0 };
                    if (dn.branch === "boys") catData[cat].boys += it.quantity;
                    else if (dn.branch === "girls") catData[cat].girls += it.quantity;
                  }
                }
                const sorted = Object.entries(catData).sort((a, b) => (b[1].boys + b[1].girls) - (a[1].boys + a[1].girls));
                if (sorted.length === 0) return <p className="text-muted-foreground text-center py-8">No data</p>;
                const maxTotal = Math.max(...sorted.map(([, d]) => d.boys + d.girls));
                return (
                  <div className="space-y-3">
                    {sorted.map(([cat, d]) => (
                      <div key={cat} className="flex items-center gap-3">
                        <span className="w-36 text-sm font-medium truncate">{cat}</span>
                        <div className="flex-1 flex h-5 rounded-full overflow-hidden bg-muted">
                          <div className="bg-blue-500 h-full" style={{ width: `${(d.boys / maxTotal) * 100}%` }} />
                          <div className="bg-pink-500 h-full" style={{ width: `${(d.girls / maxTotal) * 100}%` }} />
                        </div>
                        <span className="text-xs w-24 text-right"><span className="text-blue-600">{d.boys}</span> / <span className="text-pink-600">{d.girls}</span></span>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Report: Item Ledger ── */}
      {reportType === "item-ledger" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Search className="h-5 w-5" /> Item Ledger</CardTitle>
              <CardDescription>Select an item to view its full receive/issue history with running balance</CardDescription>
            </CardHeader>
            <CardContent>
              <select value={ledgerItemId} onChange={(e) => setLedgerItemId(e.target.value)} className="w-full rounded-md border bg-background px-3 py-2 text-sm mb-4">
                <option value="">— Select an item —</option>
                {activeItems.sort((a, b) => a.name.localeCompare(b.name)).map((i) => (
                  <option key={i.item_id} value={i.item_id}>{i.name} (Current: {i.quantity})</option>
                ))}
              </select>
              {ledgerItemId && (() => {
                const itemTxns = transactions.filter((t) => t.item_id === ledgerItemId).sort((a, b) => (a.timestamp || "").localeCompare(b.timestamp || ""));
                const selectedItem = items.find((i) => i.item_id === ledgerItemId);
                if (itemTxns.length === 0) return <p className="text-muted-foreground text-center py-8">No transactions found for this item</p>;

                let balance = 0;
                const rows = itemTxns.map((t) => {
                  const delta = t.type === "receive" ? t.quantity : -t.quantity;
                  balance += delta;
                  return { ...t, delta, balance };
                });

                return (
                  <div className="space-y-4">
                    {/* Item info */}
                    <div className="flex items-center gap-4 p-3 bg-accent/50 rounded-md">
                      <div>
                        <p className="font-semibold">{selectedItem?.name}</p>
                        <p className="text-xs text-muted-foreground">{selectedItem?.item_id} • {cfg.categoryLabels[selectedItem?.category || ""] || selectedItem?.category} • Current stock: <span className="font-semibold">{selectedItem?.quantity}</span></p>
                      </div>
                    </div>

                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead className="text-right">Balance</TableHead>
                          <TableHead>Staff</TableHead>
                          <TableHead>Request</TableHead>
                          <TableHead>By</TableHead>
                          <TableHead>Notes</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.map((r, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="text-sm">{r.timestamp?.slice(0, 10)}<br /><span className="text-xs text-muted-foreground">{r.timestamp?.slice(11, 16)}</span></TableCell>
                            <TableCell>
                              <Badge className={r.type === "receive" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300" : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300"}>
                                {r.type === "receive" ? "Received" : "Issued"}
                              </Badge>
                            </TableCell>
                            <TableCell className={`text-right font-semibold ${r.delta >= 0 ? "text-emerald-600" : "text-red-600"}`}>{r.delta >= 0 ? "+" : ""}{r.delta}</TableCell>
                            <TableCell className="text-right font-bold">{r.balance}</TableCell>
                            <TableCell className="text-sm">{r.staff_name || "—"}</TableCell>
                            <TableCell className="font-mono text-xs">{r.request_id || "—"}</TableCell>
                            <TableCell className="text-sm">{r.performed_by_name || r.performed_by}</TableCell>
                            <TableCell className="text-xs text-muted-foreground max-w-[150px] truncate">{r.notes || "—"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Report: Monthly Summary ── */}
      {reportType === "monthly-summary" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Calendar className="h-5 w-5" /> Monthly Summary</CardTitle>
              <CardDescription>Month-over-month stock activity trends{dateFrom || dateTo ? ` (${dateFrom || "start"} → ${dateTo || "now"})` : ""}</CardDescription>
            </CardHeader>
            <CardContent>
              {(() => {
                const byMonth: Record<string, { received: number; issued: number; requests: number; dns: number }> = {};
                for (const t of filteredTxns) {
                  const m = t.timestamp?.slice(0, 7) || "unknown";
                  if (!byMonth[m]) byMonth[m] = { received: 0, issued: 0, requests: 0, dns: 0 };
                  if (t.type === "receive") byMonth[m].received += t.quantity;
                  else byMonth[m].issued += t.quantity;
                }
                for (const r of filteredReqs) {
                  const m = r.requested_at?.slice(0, 7) || "unknown";
                  if (!byMonth[m]) byMonth[m] = { received: 0, issued: 0, requests: 0, dns: 0 };
                  byMonth[m].requests++;
                }
                for (const dn of filteredDNs) {
                  const m = dn.issued_at?.slice(0, 7) || "unknown";
                  if (!byMonth[m]) byMonth[m] = { received: 0, issued: 0, requests: 0, dns: 0 };
                  byMonth[m].dns++;
                }

                const months = Object.entries(byMonth).sort((a, b) => a[0].localeCompare(b[0]));
                if (months.length === 0) return <p className="text-muted-foreground text-center py-8">No activity recorded</p>;
                const maxActivity = Math.max(...months.map(([, d]) => Math.max(d.received, d.issued)));

                return (
                  <div className="space-y-4">
                    {/* Visual bars */}
                    <div className="space-y-3">
                      {months.map(([month, d], idx) => {
                        const prev = idx > 0 ? months[idx - 1][1] : null;
                        const netChange = d.received - d.issued;
                        const prevNet = prev ? prev.received - prev.issued : null;
                        return (
                          <div key={month} className="space-y-1">
                            <div className="flex items-center gap-3">
                              <span className="w-20 text-sm font-medium">{month}</span>
                              <div className="flex-1 space-y-1">
                                <div className="flex h-3 gap-0.5">
                                  {d.received > 0 && <div className="bg-emerald-500 rounded-sm h-full" style={{ width: `${(d.received / maxActivity) * 100}%` }} title={`Received: ${d.received}`} />}
                                  {d.issued > 0 && <div className="bg-red-500 rounded-sm h-full" style={{ width: `${(d.issued / maxActivity) * 100}%` }} title={`Issued: ${d.issued}`} />}
                                </div>
                              </div>
                              <span className="text-xs w-16 text-right text-emerald-600">+{d.received}</span>
                              <span className="text-xs w-16 text-right text-red-600">-{d.issued}</span>
                              <span className={`text-xs w-16 text-right font-semibold ${netChange >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                                {netChange >= 0 ? "+" : ""}{netChange}
                                {prevNet !== null && netChange !== prevNet && (
                                  netChange > prevNet
                                    ? <TrendingUp className="inline h-3 w-3 ml-0.5" />
                                    : <TrendingDown className="inline h-3 w-3 ml-0.5" />
                                )}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Table */}
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Month</TableHead>
                          <TableHead className="text-right text-emerald-600">Received</TableHead>
                          <TableHead className="text-right text-red-600">Issued</TableHead>
                          <TableHead className="text-right">Net</TableHead>
                          <TableHead className="text-right">Requests</TableHead>
                          <TableHead className="text-right">Delivery Notes</TableHead>
                          <TableHead>Trend</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {months.map(([month, d], idx) => {
                          const net = d.received - d.issued;
                          const prev = idx > 0 ? months[idx - 1][1] : null;
                          const prevNet = prev ? prev.received - prev.issued : null;
                          return (
                            <TableRow key={month}>
                              <TableCell className="font-medium">{month}</TableCell>
                              <TableCell className="text-right font-semibold text-emerald-600">+{d.received}</TableCell>
                              <TableCell className="text-right font-semibold text-red-600">-{d.issued}</TableCell>
                              <TableCell className={`text-right font-bold ${net >= 0 ? "text-emerald-600" : "text-red-600"}`}>{net >= 0 ? "+" : ""}{net}</TableCell>
                              <TableCell className="text-right">{d.requests}</TableCell>
                              <TableCell className="text-right">{d.dns}</TableCell>
                              <TableCell>
                                {prevNet !== null && (net > prevNet ? <TrendingUp className="h-4 w-4 text-emerald-500" /> : net < prevNet ? <TrendingDown className="h-4 w-4 text-red-500" /> : <span className="text-muted-foreground">—</span>)}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                        <TableRow className="border-t-2 font-bold">
                          <TableCell>TOTAL</TableCell>
                          <TableCell className="text-right text-emerald-600">+{totalReceived}</TableCell>
                          <TableCell className="text-right text-red-600">-{totalIssued}</TableCell>
                          <TableCell className={`text-right ${totalReceived - totalIssued >= 0 ? "text-emerald-600" : "text-red-600"}`}>{totalReceived - totalIssued >= 0 ? "+" : ""}{totalReceived - totalIssued}</TableCell>
                          <TableCell className="text-right">{filteredReqs.length}</TableCell>
                          <TableCell className="text-right">{filteredDNs.length}</TableCell>
                          <TableCell />
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Report: Stale Stock ── */}
      {reportType === "stale-stock" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-500" /> Stale / Dormant Stock</CardTitle>
              <CardDescription>Items with stock on hand but no activity in the last {staleDays} days. These may be obsolete or forgotten.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3 mb-4">
                <label className="text-sm font-medium">Threshold (days):</label>
                <Input type="number" min={7} max={365} value={staleDays} onChange={(e) => setStaleDays(parseInt(e.target.value) || 30)} className="w-24" />
              </div>
              {(() => {
                const now = Date.now();
                const staleItems = activeItems.map((item) => {
                  const lastTxn = transactions.filter((t) => t.item_id === item.item_id).sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""))[0];
                  const lastDate = lastTxn?.timestamp ? new Date(lastTxn.timestamp).getTime() : 0;
                  const daysSince = lastDate ? Math.floor((now - lastDate) / 86400000) : 9999;
                  return { ...item, daysSince, lastDate: lastTxn?.timestamp?.slice(0, 10) || "Never", lastType: lastTxn?.type || "" };
                }).filter((i) => i.daysSince >= staleDays && i.quantity > 0).sort((a, b) => b.daysSince - a.daysSince);

                if (staleItems.length === 0) return <p className="text-emerald-600 text-center py-8 font-medium">No stale stock found — all items with stock have recent activity</p>;

                const totalStaleUnits = staleItems.reduce((s, i) => s + i.quantity, 0);

                return (
                  <div className="space-y-4">
                    <div className="flex gap-3">
                      <Badge variant="outline" className="text-amber-600 border-amber-300">{staleItems.length} stale items</Badge>
                      <Badge variant="outline" className="text-amber-600 border-amber-300">{totalStaleUnits} units dormant</Badge>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Item</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead className="text-right">Qty on Hand</TableHead>
                          <TableHead>Last Activity</TableHead>
                          <TableHead>Last Type</TableHead>
                          <TableHead className="text-right">Days Since</TableHead>
                          <TableHead>Severity</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {staleItems.map((i) => (
                          <TableRow key={i.id}>
                            <TableCell className="font-medium">{i.name}</TableCell>
                            <TableCell>{cfg.categoryLabels[i.category] || i.category}</TableCell>
                            <TableCell className="text-right font-semibold">{i.quantity}</TableCell>
                            <TableCell className="text-sm">{i.lastDate}</TableCell>
                            <TableCell className="text-sm">{i.lastType ? (i.lastType === "receive" ? "Received" : "Issued") : "—"}</TableCell>
                            <TableCell className="text-right font-semibold">{i.daysSince === 9999 ? "∞" : i.daysSince}</TableCell>
                            <TableCell>
                              {i.daysSince >= 180 ? <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300">Critical</Badge>
                                : i.daysSince >= 90 ? <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300">High</Badge>
                                : <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300">Watch</Badge>}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </div>
      )}

      </div>{/* end reportRef */}
    </div>
  );
}
