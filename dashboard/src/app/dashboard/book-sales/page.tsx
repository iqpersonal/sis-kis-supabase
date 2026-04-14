"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  Card, CardContent, CardHeader, CardTitle,
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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Search, Loader2, Plus, Upload, Trash2, Pencil, ShoppingCart,
  FileText, Ban, Printer, Download, X, Check, Users, GraduationCap,
  BookOpen, DollarSign, TrendingUp, Package, Filter, RotateCcw,
  CreditCard, Banknote, Receipt, RefreshCw, Database, BarChart3,
} from "lucide-react";
import { useLanguage } from "@/context/language-context";
import { useAcademicYear } from "@/context/academic-year-context";
import ReportsTab from "./ReportsTab";

/* ═══════════════════════════════════════════════════════════════
 *  Types
 * ═══════════════════════════════════════════════════════════════ */

interface Book {
  id: string;
  title: string;
  grade: string;
  subject: string;
  price: number;
  isbn: string;
  year: string;
  is_active: boolean;
}

interface Bundle {
  id: string;
  grade: string;
  year: string;
  school: string;
  book_ids: string[];
  total_price: number;
  name: string;
  name_ar: string;
}

interface SaleItem {
  book_id: string;
  title: string;
  price: number;
}

interface Sale {
  id: string;
  receipt_number: string;
  student_number: string;
  student_name: string;
  family_number: string;
  family_name: string;
  grade: string;
  school: string;
  items: SaleItem[];
  subtotal?: number;
  vat_amount?: number;
  vat_rate?: number;
  total_amount: number;
  paid_amount: number;
  payment_method: string;
  status: string;
  sold_by: string;
  year: string;
  created_at: unknown;
  void_reason?: string;
}

interface StudentResult {
  student_number: string;
  student_name: string;
  family_number: string;
  gender: string;
  grade: string;
  section: string;
  school: string;
}

interface Stats {
  total_sales: number;
  total_revenue: number;
  today_sales: number;
  today_revenue: number;
  voided: number;
  by_grade: Record<string, { count: number; revenue: number }>;
  by_school: Record<string, { count: number; revenue: number }>;
}

const formatSAR = (n: number) => `SAR ${n.toFixed(2)}`;

/* ═══════════════════════════════════════════════════════════════
 *  Main Page
 * ═══════════════════════════════════════════════════════════════ */

export default function BookSalesPage() {
  const { t, isRTL } = useLanguage();
  const { years, selectedYear } = useAcademicYear();

  const [tab, setTab] = useState<"pos" | "history" | "catalog" | "reports">("pos");
  const [loading, setLoading] = useState(false);

  // ── Catalog state ──
  const [books, setBooks] = useState<Book[]>([]);
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [catalogGradeFilter, setCatalogGradeFilter] = useState("");
  const [catalogSearch, setCatalogSearch] = useState("");
  const [showAddBook, setShowAddBook] = useState(false);
  const [editingBook, setEditingBook] = useState<Book | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [showBundleDialog, setShowBundleDialog] = useState(false);
  const [editingBundle, setEditingBundle] = useState<Bundle | null>(null);

  // ── POS state ──
  const [studentSearch, setStudentSearch] = useState("");
  const [searchResults, setSearchResults] = useState<StudentResult[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<StudentResult | null>(null);
  const [familyMembers, setFamilyMembers] = useState<StudentResult[]>([]);
  const [cartItems, setCartItems] = useState<{ book_id: string; title: string; price: number; checked: boolean }[]>([]);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [posLoading, setPosLoading] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);

  // ── Filter state ──
  const [filterMajor, setFilterMajor] = useState("");
  const [filterClass, setFilterClass] = useState("");
  const [filterSection, setFilterSection] = useState("");
  const [filterTree, setFilterTree] = useState<Record<string, Record<string, string[]>>>({});
  const [availableMajors, setAvailableMajors] = useState<string[]>([]);

  // ── History state ──
  const [sales, setSales] = useState<Sale[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [historySearch, setHistorySearch] = useState("");
  const [historyStatus, setHistoryStatus] = useState("");
  const [historyGrade, setHistoryGrade] = useState("");

  // ── Void dialog ──
  const [voidingSale, setVoidingSale] = useState<Sale | null>(null);
  const [voidReason, setVoidReason] = useState("");

  // ── Book form state ──
  const [bookForm, setBookForm] = useState({
    title: "", grade: "", subject: "", price: "", isbn: "", year: "", is_active: true,
  });

  // ── Bundle form state ──
  const [bundleForm, setBundleForm] = useState({
    name: "", name_ar: "", grade: "", school: "", book_ids: [] as string[],
  });

  // ── Import state ──
  const [importCsv, setImportCsv] = useState("");
  const [importYear, setImportYear] = useState(selectedYear || "");

  // ── Sync state ──
  const [showSyncDialog, setShowSyncDialog] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncLogs, setSyncLogs] = useState<string[]>([]);
  const [syncProgress, setSyncProgress] = useState(0);
  const [syncDone, setSyncDone] = useState(false);
  const [syncSuccess, setSyncSuccess] = useState(false);
  const [syncYear, setSyncYear] = useState(selectedYear || "");

  /* ───────── Data Fetching ─────────────────────────────────── */

  const fetchCatalog = useCallback(async () => {
    try {
      const [bRes, buRes] = await Promise.all([
        fetch(`/api/book-sales/catalog?year=${selectedYear || ""}`),
        fetch(`/api/book-sales/bundles?year=${selectedYear || ""}`),
      ]);
      if (!bRes.ok) throw new Error(`Catalog API: ${bRes.status}`);
      if (!buRes.ok) throw new Error(`Bundles API: ${buRes.status}`);
      const bData = await bRes.json();
      const buData = await buRes.json();
      setBooks(bData.books || []);
      setBundles(buData.bundles || []);
    } catch (err) {
      console.error("Failed to load catalog:", err);
    }
  }, [selectedYear]);

  const fetchHistory = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (selectedYear) params.set("year", selectedYear);
      if (historyStatus) params.set("status", historyStatus);
      if (historyGrade) params.set("grade", historyGrade);

      const [salesRes, statsRes] = await Promise.all([
        fetch(`/api/book-sales/transactions?action=list&${params}`),
        fetch(`/api/book-sales/transactions?action=stats&year=${selectedYear || ""}`),
      ]);
      if (!salesRes.ok) throw new Error(`Sales API: ${salesRes.status}`);
      if (!statsRes.ok) throw new Error(`Stats API: ${statsRes.status}`);
      const salesData = await salesRes.json();
      const statsData = await statsRes.json();
      setSales(salesData.sales || []);
      setStats(statsData);
    } catch (err) {
      console.error("Failed to load sales:", err);
    }
  }, [selectedYear, historyStatus, historyGrade]);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchCatalog(), fetchHistory()]).finally(() => setLoading(false));
  }, [fetchCatalog, fetchHistory]);

  /* ───────── Load filter meta (cascading tree) ────────────── */

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/book-sales/search?meta=1&year=${selectedYear || ""}`);
        const data = await res.json();
        setAvailableMajors(data.majors || []);
        setFilterTree(data.tree || {});
      } catch { /* ignore */ }
    })();
  }, [selectedYear]);

  // Derived cascading options
  const availableClasses = useMemo(() => {
    if (!filterMajor) {
      // All classes across all majors
      const set = new Set<string>();
      for (const classes of Object.values(filterTree)) {
        for (const cls of Object.keys(classes)) set.add(cls);
      }
      return Array.from(set);
    }
    return Object.keys(filterTree[filterMajor] || {});
  }, [filterTree, filterMajor]);

  const availableSections = useMemo(() => {
    if (filterMajor && filterClass) {
      return filterTree[filterMajor]?.[filterClass] || [];
    }
    if (filterClass) {
      const set = new Set<string>();
      for (const classes of Object.values(filterTree)) {
        if (classes[filterClass]) {
          for (const s of classes[filterClass]) set.add(s);
        }
      }
      return Array.from(set).sort();
    }
    if (filterMajor) {
      const set = new Set<string>();
      for (const sections of Object.values(filterTree[filterMajor] || {})) {
        for (const s of sections) set.add(s);
      }
      return Array.from(set).sort();
    }
    return [];
  }, [filterTree, filterMajor, filterClass]);

  /* ───────── Student Search (debounced) ────────────────────── */

  useEffect(() => {
    const hasFilters = filterMajor || filterClass || filterSection;
    if (studentSearch.length < 2 && !hasFilters) { setSearchResults([]); return; }
    const timer = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const params = new URLSearchParams();
        if (selectedYear) params.set("year", selectedYear);

        if (studentSearch.length >= 2) {
          const isId = /^[\d-]+$/.test(studentSearch);
          if (isId) {
            // Digits + hyphens → student or family number
            const digits = studentSearch.replace(/-/g, "");
            // Family numbers are shorter (e.g. 0021-4521 = 8 digits), student numbers longer (e.g. 0021-452111 = 10)
            if (digits.length <= 8) params.set("family", studentSearch);
            else params.set("student", studentSearch);
          } else {
            params.set("q", studentSearch);
          }
        } else if (hasFilters) {
          params.set("browse", "1");
        }

        if (filterMajor) params.set("major", filterMajor);
        if (filterClass) params.set("class", filterClass);
        if (filterSection) params.set("section", filterSection);

        const res = await fetch(`/api/book-sales/search?${params}`);
        const data = await res.json();
        setSearchResults(data.results || []);
      } catch { setSearchResults([]); }
      finally { setSearchLoading(false); }
    }, 300);
    return () => clearTimeout(timer);
  }, [studentSearch, selectedYear, filterMajor, filterClass, filterSection]);

  /* ───────── Select student → load bundle + family ──────── */

  const selectStudent = useCallback(async (s: StudentResult) => {
    setSelectedStudent(s);
    setSearchResults([]);
    setStudentSearch("");

    // Normalize grade for book matching: "Grade 6 - Boys" → "Grade 6", "KG3" → "KG3"
    const baseGrade = (s.grade || "").replace(/\s*-\s*(Boys|Girls)$/i, "").trim();

    // Find matching bundle for grade
    const bundle = bundles.find((b) => b.grade === s.grade || b.grade === baseGrade);
    if (bundle && bundle.book_ids.length > 0) {
      const bundleBooks = books.filter((bk) => bundle.book_ids.includes(bk.id));
      setCartItems(bundleBooks.map((bk) => ({
        book_id: bk.id, title: bk.title, price: bk.price, checked: true,
      })));
    } else {
      // Fall back: all books for that grade
      const gradeBooks = books.filter((bk) => (bk.grade === s.grade || bk.grade === baseGrade) && bk.is_active);
      setCartItems(gradeBooks.map((bk) => ({
        book_id: bk.id, title: bk.title, price: bk.price, checked: true,
      })));
    }

    // Fetch family members
    if (s.family_number) {
      try {
        const res = await fetch(`/api/book-sales/search?family=${s.family_number}&year=${selectedYear || ""}`);
        const data = await res.json();
        setFamilyMembers((data.results || []).filter((fm: StudentResult) => fm.student_number !== s.student_number));
      } catch {
        setFamilyMembers([]);
      }
    }
  }, [bundles, books, selectedYear]);

  /* ───────── Record Sale ──────────────────────────────────── */

  const recordSale = useCallback(async () => {
    if (!selectedStudent || cartItems.filter((c) => c.checked).length === 0) return;
    setPosLoading(true);
    try {
      const checkedItems = cartItems.filter((c) => c.checked);
      const res = await fetch("/api/book-sales/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_sale",
          student_number: selectedStudent.student_number,
          student_name: selectedStudent.student_name,
          family_number: selectedStudent.family_number,
          family_name: selectedStudent.family_number || "",
          grade: selectedStudent.grade,
          school: selectedStudent.school,
          items: checkedItems.map((c) => ({ book_id: c.book_id, title: c.title, price: c.price })),
          payment_method: paymentMethod,
          sold_by: "POS",
          year: selectedYear || "",
        }),
      });
      const data = await res.json();
      if (data.id) {
        // Open receipt PDF in new tab
        window.open(`/api/book-sales/receipt?id=${data.id}`, "_blank");
        // Reset POS
        setSelectedStudent(null);
        setCartItems([]);
        setFamilyMembers([]);
        // Refresh history
        fetchHistory();
      }
    } catch (err) {
      console.error("Sale failed:", err);
    } finally {
      setPosLoading(false);
    }
  }, [selectedStudent, cartItems, paymentMethod, selectedYear, fetchHistory]);

  /* ───────── Save Book (create/edit) ──────────────────────── */

  const saveBook = useCallback(async () => {
    const payload = {
      action: editingBook ? "update_book" : "create_book",
      ...(editingBook ? { id: editingBook.id } : {}),
      title: bookForm.title,
      grade: bookForm.grade,
      subject: bookForm.subject,
      price: parseFloat(bookForm.price) || 0,
      isbn: bookForm.isbn,
      year: bookForm.year || selectedYear || "",
      is_active: bookForm.is_active,
    };
    try {
      await fetch("/api/book-sales/catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setShowAddBook(false);
      setEditingBook(null);
      fetchCatalog();
    } catch (err) {
      console.error("Save book failed:", err);
    }
  }, [bookForm, editingBook, selectedYear, fetchCatalog]);

  /* ───────── Delete Book ──────────────────────────────────── */

  const deleteBook = useCallback(async (id: string) => {
    if (!confirm("Delete this book?")) return;
    try {
      await fetch("/api/book-sales/catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete_book", id }),
      });
      fetchCatalog();
    } catch (err) {
      console.error("Delete book failed:", err);
    }
  }, [fetchCatalog]);

  /* ───────── CSV Import ───────────────────────────────────── */

  const handleImport = useCallback(async () => {
    if (!importCsv.trim() || !importYear) return;
    const lines = importCsv.trim().split("\n");
    const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
    const booksArr = lines.slice(1).map((line) => {
      const cols = line.split(",").map((c) => c.trim());
      const obj: Record<string, string> = {};
      header.forEach((h, i) => { obj[h] = cols[i] || ""; });
      return {
        title: obj.title || "",
        grade: obj.grade || "",
        subject: obj.subject || "",
        price: parseFloat(obj.price) || 0,
        isbn: obj.isbn || "",
        year: importYear,
        is_active: true,
      };
    }).filter((b) => b.title && b.grade && b.price > 0);

    try {
      const res = await fetch("/api/book-sales/catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "bulk_import", books: booksArr }),
      });
      const data = await res.json();
      alert(`Imported ${data.imported || 0} books`);
      setShowImport(false);
      setImportCsv("");
      fetchCatalog();
    } catch (err) {
      console.error("Import failed:", err);
    }
  }, [importCsv, importYear, fetchCatalog]);

  /* ───────── Save Bundle ──────────────────────────────────── */

  const saveBundle = useCallback(async () => {
    const payload = {
      action: editingBundle ? "update_bundle" : "create_bundle",
      ...(editingBundle ? { id: editingBundle.id } : {}),
      name: bundleForm.name,
      name_ar: bundleForm.name_ar,
      grade: bundleForm.grade,
      school: bundleForm.school,
      book_ids: bundleForm.book_ids,
      year: selectedYear || "",
    };
    try {
      await fetch("/api/book-sales/bundles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setShowBundleDialog(false);
      setEditingBundle(null);
      fetchCatalog();
    } catch (err) {
      console.error("Save bundle failed:", err);
    }
  }, [bundleForm, editingBundle, selectedYear, fetchCatalog]);

  /* ───────── Void Sale ────────────────────────────────────── */

  const confirmVoid = useCallback(async () => {
    if (!voidingSale || !voidReason.trim()) return;
    try {
      await fetch("/api/book-sales/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "void_sale", id: voidingSale.id, reason: voidReason }),
      });
      setVoidingSale(null);
      setVoidReason("");
      fetchHistory();
    } catch (err) {
      console.error("Void failed:", err);
    }
  }, [voidingSale, voidReason, fetchHistory]);

  /* ───────── Export CSV ───────────────────────────────────── */

  const exportCSV = useCallback(() => {
    const headers = ["Receipt #", "Date", "Student", "Student #", "Family #", "Grade", "School", "Items", "Subtotal", "VAT", "Total", "Paid", "Method", "Status"];
    const rows = sales.map((s) => {
      const sub = typeof s.subtotal === "number" ? s.subtotal : 0;
      const vat = typeof s.vat_amount === "number" ? s.vat_amount : 0;
      return [
        s.receipt_number,
        formatDate(s.created_at),
        s.student_name,
        s.student_number,
        s.family_number,
        s.grade,
        s.school,
        (s.items || []).map((i) => i.title).join("; "),
        sub.toFixed(2),
        vat.toFixed(2),
        s.total_amount,
        s.paid_amount,
        s.payment_method,
        s.status,
      ];
    });
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `book-sales-${selectedYear || "all"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [sales, selectedYear]);

  /* ───────── Database Sync ──────────────────────────────── */

  const startSync = useCallback(async () => {
    setSyncing(true);
    setSyncLogs([]);
    setSyncProgress(0);
    setSyncDone(false);
    setSyncSuccess(false);
    setShowSyncDialog(true);

    try {
      const res = await fetch("/api/trigger-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preset: "booksale", year: syncYear || selectedYear }),
      });

      if (!res.ok || !res.body) {
        setSyncLogs((prev) => [...prev, `Error: HTTP ${res.status}`]);
        setSyncing(false);
        setSyncDone(true);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const chunk of lines) {
          const dataLine = chunk.replace(/^data: /, "").trim();
          if (!dataLine) continue;
          try {
            const evt = JSON.parse(dataLine);
            if (evt.type === "log") {
              setSyncLogs((prev) => [...prev, evt.message]);
            } else if (evt.type === "progress") {
              setSyncProgress(evt.percent || 0);
              setSyncLogs((prev) => [...prev, `▶ ${evt.message}`]);
            } else if (evt.type === "done") {
              setSyncProgress(100);
              setSyncSuccess(evt.success);
              setSyncDone(true);
              setSyncing(false);
              setSyncLogs((prev) => [...prev, evt.message]);
            }
          } catch { /* ignore parse errors */ }
        }
      }

      // Invalidate server-side search cache
      await fetch("/api/book-sales/search", { method: "POST" });

      // Reload filter meta
      try {
        const metaRes = await fetch(`/api/book-sales/search?meta=1&year=${selectedYear || ""}`);
        const data = await metaRes.json();
        setAvailableMajors(data.majors || []);
        setFilterTree(data.tree || {});
      } catch { /* ignore */ }
    } catch (err) {
      setSyncLogs((prev) => [...prev, `Error: ${err instanceof Error ? err.message : "Unknown"}`]);
      setSyncDone(true);
      setSyncing(false);
    }
  }, [syncYear, selectedYear]);

  /* ───────── Filtered lists ───────────────────────────────── */

  const filteredBooks = useMemo(() => {
    let list = books;
    if (catalogGradeFilter) list = list.filter((b) => b.grade === catalogGradeFilter);
    if (catalogSearch) {
      const q = catalogSearch.toLowerCase();
      list = list.filter((b) =>
        b.title.toLowerCase().includes(q) ||
        b.subject.toLowerCase().includes(q) ||
        b.isbn.includes(catalogSearch)
      );
    }
    return list;
  }, [books, catalogGradeFilter, catalogSearch]);

  const filteredSales = useMemo(() => {
    if (!historySearch) return sales;
    const q = historySearch.toLowerCase();
    return sales.filter((s) =>
      s.student_name.toLowerCase().includes(q) ||
      s.family_number.includes(historySearch) ||
      s.receipt_number.toLowerCase().includes(q) ||
      s.student_number.includes(historySearch)
    );
  }, [sales, historySearch]);

  const cartSubtotal = useMemo(
    () => cartItems.filter((c) => c.checked).reduce((sum, c) => sum + c.price, 0),
    [cartItems]
  );
  const cartVat = useMemo(() => Math.round(cartSubtotal * 0.15 * 100) / 100, [cartSubtotal]);
  const cartTotal = useMemo(() => Math.round((cartSubtotal + cartVat) * 100) / 100, [cartSubtotal, cartVat]);

  const grades = useMemo(() => {
    const set = new Set(books.map((b) => b.grade));
    return Array.from(set).sort();
  }, [books]);

  /* ───────── Render ───────────────────────────────────────── */

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Header with gradient ── */}
      <div className="rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 p-6 text-white shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-white/20 p-2.5">
              <BookOpen className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Bookshop</h1>
              <p className="text-emerald-100 text-sm">Point of Sale &amp; Inventory Management</p>
            </div>
          </div>
          {stats && (
            <div className="hidden md:flex items-center gap-6">
              <div className="text-right">
                <div className="text-emerald-100 text-xs uppercase tracking-wider">Today</div>
                <div className="text-xl font-bold">{stats.today_sales} <span className="text-sm font-normal text-emerald-200">sales</span></div>
              </div>
              <div className="w-px h-10 bg-white/30" />
              <div className="text-right">
                <div className="text-emerald-100 text-xs uppercase tracking-wider">Revenue</div>
                <div className="text-xl font-bold">{formatSAR(stats.today_revenue)}</div>
              </div>
            </div>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSyncDone(false);
              setSyncLogs([]);
              setSyncProgress(0);
              setSyncYear(selectedYear || "");
              setShowSyncDialog(true);
            }}
            disabled={syncing}
            className="bg-white/15 hover:bg-white/25 text-white border-0 gap-2"
          >
            {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
            Sync Data
          </Button>
        </div>
      </div>

      {/* ── Tab Bar ── */}
      <div className="flex gap-1 bg-muted/50 rounded-lg p-1">
        {([
          { key: "pos" as const, label: "Point of Sale", icon: <CreditCard className="h-4 w-4" /> },
          { key: "history" as const, label: "Sales History", icon: <Receipt className="h-4 w-4" /> },
          { key: "catalog" as const, label: "Book Catalog", icon: <Package className="h-4 w-4" /> },
          { key: "reports" as const, label: "Reports", icon: <BarChart3 className="h-4 w-4" /> },
        ]).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-md transition-all flex-1 justify-center ${
              tab === t.key
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* ═══════════ TAB 1: POINT OF SALE ═══════════ */}
      {tab === "pos" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Student search + filters + info + family */}
          <div className="lg:col-span-4 space-y-4">
            {/* Search & Filters Card */}
            <Card className="border-2 border-dashed border-emerald-200 dark:border-emerald-900">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Search className="h-4 w-4 text-emerald-600" />
                  Find Student
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Name, student #, or family #..."
                    value={studentSearch}
                    onChange={(e) => setStudentSearch(e.target.value)}
                    className="pl-9 h-10"
                  />
                </div>

                {/* Filter row: Major → Class → Section */}
                <div className="grid grid-cols-3 gap-2">
                  <Select value={filterMajor} onValueChange={(v) => {
                    const val = v === "__all__" ? "" : v;
                    setFilterMajor(val);
                    // Reset child filters if they become invalid
                    if (val) {
                      const classes = Object.keys(filterTree[val] || {});
                      if (filterClass && !classes.includes(filterClass)) { setFilterClass(""); setFilterSection(""); }
                    }
                  }}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Major" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All Majors</SelectItem>
                      {availableMajors.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={filterClass} onValueChange={(v) => {
                    const val = v === "__all__" ? "" : v;
                    setFilterClass(val);
                    // Reset section if it becomes invalid
                    if (val && filterMajor) {
                      const secs = filterTree[filterMajor]?.[val] || [];
                      if (filterSection && !secs.includes(filterSection)) setFilterSection("");
                    }
                  }}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Class" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All Classes</SelectItem>
                      {availableClasses.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select
                    value={filterSection}
                    onValueChange={(v) => setFilterSection(v === "__all__" ? "" : v)}
                    disabled={availableSections.length === 0}
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Section" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All Sections</SelectItem>
                      {availableSections.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {(filterMajor || filterClass || filterSection) && (
                  <Button
                    variant="ghost" size="sm"
                    className="w-full text-xs text-muted-foreground h-7"
                    onClick={() => { setFilterMajor(""); setFilterClass(""); setFilterSection(""); }}
                  >
                    <RotateCcw className="h-3 w-3 mr-1" /> Clear filters
                  </Button>
                )}

                {searchLoading && (
                  <div className="text-sm text-muted-foreground flex items-center gap-2 py-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching...
                  </div>
                )}

                {/* Search results dropdown */}
                {searchResults.length > 0 && (
                  <div className="border rounded-lg max-h-64 overflow-auto divide-y shadow-sm">
                    {searchResults.map((s) => (
                      <button
                        key={s.student_number}
                        onClick={() => selectStudent(s)}
                        className="w-full text-left px-3 py-2.5 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors"
                      >
                        <div className="font-medium text-sm">{s.student_name}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-muted-foreground">{s.student_number}</span>
                          {s.grade && <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">{s.grade}</Badge>}
                          {s.school && <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">{s.school}</Badge>}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Selected student info */}
            {selectedStudent && (
              <Card className="border-emerald-300 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20">
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="h-10 w-10 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-sm">
                        {selectedStudent.student_name.charAt(0)}
                      </div>
                      <div>
                        <div className="font-semibold text-sm">{selectedStudent.student_name}</div>
                        <div className="text-xs text-muted-foreground">{selectedStudent.student_number}</div>
                      </div>
                    </div>
                    <Button
                      variant="ghost" size="sm"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => { setSelectedStudent(null); setCartItems([]); setFamilyMembers([]); }}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                    <div className="flex items-center gap-1.5">
                      <GraduationCap className="h-3 w-3 text-muted-foreground" />
                      <span className="text-muted-foreground">Grade:</span>
                      <span className="font-medium">{selectedStudent.grade || "—"}</span>
                      {selectedStudent.section && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{selectedStudent.section}</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Users className="h-3 w-3 text-muted-foreground" />
                      <span className="text-muted-foreground">Family:</span>
                      <span className="font-medium">{selectedStudent.family_number}</span>
                    </div>
                    <div className="col-span-2 flex items-center gap-1.5">
                      <BookOpen className="h-3 w-3 text-muted-foreground" />
                      <span className="text-muted-foreground">School:</span>
                      <span className="font-medium">{selectedStudent.school || "—"}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Family members */}
            {familyMembers.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Users className="h-4 w-4 text-blue-600" />
                    Family Members ({familyMembers.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="pb-3">
                  <div className="space-y-1.5">
                    {familyMembers.map((fm) => (
                      <button
                        key={fm.student_number}
                        onClick={() => selectStudent(fm)}
                        className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md hover:bg-muted/70 transition-colors text-left"
                      >
                        <div className="h-7 w-7 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 flex items-center justify-center text-xs font-medium">
                          {fm.student_name.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{fm.student_name}</div>
                          <div className="text-xs text-muted-foreground">{fm.grade || "—"} {fm.section}</div>
                        </div>
                        <ShoppingCart className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right: Cart + Payment */}
          <div className="lg:col-span-8 space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <ShoppingCart className="h-4 w-4 text-emerald-600" />
                    Shopping Cart
                    {cartItems.filter((c) => c.checked).length > 0 && (
                      <Badge className="bg-emerald-600 text-white ml-1">{cartItems.filter((c) => c.checked).length}</Badge>
                    )}
                  </CardTitle>
                  {selectedStudent && (
                    <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => {
                      const available = books.filter(
                        (bk) => bk.is_active && bk.grade === selectedStudent?.grade && !cartItems.some((c) => c.book_id === bk.id)
                      );
                      if (available.length === 0) { alert("No more books to add"); return; }
                      setCartItems((prev) => [
                        ...prev,
                        ...available.map((bk) => ({ book_id: bk.id, title: bk.title, price: bk.price, checked: false })),
                      ]);
                    }}>
                      <Plus className="h-3 w-3 mr-1" /> More Books
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {cartItems.length === 0 ? (
                  <div className="text-center py-12">
                    <ShoppingCart className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-muted-foreground text-sm">
                      {selectedStudent ? "No books in bundle for this grade" : "Select a student to begin"}
                    </p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {cartItems.map((item, i) => (
                      <div key={item.book_id} className={`flex items-center gap-3 py-2.5 ${!item.checked ? "opacity-50" : ""}`}>
                        <input
                          type="checkbox"
                          checked={item.checked}
                          onChange={() => {
                            setCartItems((prev) => prev.map((c, idx) =>
                              idx === i ? { ...c, checked: !c.checked } : c
                            ));
                          }}
                          className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                        />
                        <BookOpen className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="flex-1 text-sm">{item.title}</span>
                        <span className="text-sm font-semibold tabular-nums">{formatSAR(item.price)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Payment summary */}
            {selectedStudent && cartItems.filter((c) => c.checked).length > 0 && (
              <Card className="border-emerald-200 dark:border-emerald-900 shadow-md">
                <CardContent className="pt-5 pb-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Totals */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Subtotal ({cartItems.filter((c) => c.checked).length} books)</span>
                        <span className="tabular-nums">{formatSAR(cartSubtotal)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">VAT (15%)</span>
                        <span className="tabular-nums">{formatSAR(cartVat)}</span>
                      </div>
                      <div className="flex justify-between text-lg font-bold pt-2 border-t">
                        <span>Total</span>
                        <span className="text-emerald-700 dark:text-emerald-400 tabular-nums">{formatSAR(cartTotal)}</span>
                      </div>
                    </div>

                    {/* Payment method + button */}
                    <div className="space-y-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => setPaymentMethod("cash")}
                          className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border-2 text-sm font-medium transition-all ${
                            paymentMethod === "cash"
                              ? "border-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400"
                              : "border-muted hover:border-muted-foreground/30"
                          }`}
                        >
                          <Banknote className="h-4 w-4" /> Cash
                        </button>
                        <button
                          onClick={() => setPaymentMethod("bank_transfer")}
                          className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border-2 text-sm font-medium transition-all ${
                            paymentMethod === "bank_transfer"
                              ? "border-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400"
                              : "border-muted hover:border-muted-foreground/30"
                          }`}
                        >
                          <CreditCard className="h-4 w-4" /> Transfer
                        </button>
                      </div>
                      <Button
                        className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white shadow-md"
                        onClick={recordSale}
                        disabled={posLoading}
                      >
                        {posLoading ? (
                          <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Processing...</>
                        ) : (
                          <><Printer className="h-4 w-4 mr-2" /> Complete Sale & Print</>
                        )}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* ═══════════ TAB 2: SALES HISTORY ═══════════ */}
      {tab === "history" && (
        <div className="space-y-4">
          {/* KPI Cards */}
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/30 dark:to-blue-900/10 border-blue-200 dark:border-blue-900">
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="rounded-md bg-blue-100 dark:bg-blue-900 p-1.5"><ShoppingCart className="h-3.5 w-3.5 text-blue-700 dark:text-blue-300" /></div>
                    <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">Total Sales</span>
                  </div>
                  <div className="text-2xl font-bold">{stats.total_sales}</div>
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-950/30 dark:to-emerald-900/10 border-emerald-200 dark:border-emerald-900">
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="rounded-md bg-emerald-100 dark:bg-emerald-900 p-1.5"><DollarSign className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-300" /></div>
                    <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">Total Revenue</span>
                  </div>
                  <div className="text-2xl font-bold">{formatSAR(stats.total_revenue)}</div>
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-br from-amber-50 to-amber-100/50 dark:from-amber-950/30 dark:to-amber-900/10 border-amber-200 dark:border-amber-900">
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="rounded-md bg-amber-100 dark:bg-amber-900 p-1.5"><TrendingUp className="h-3.5 w-3.5 text-amber-700 dark:text-amber-300" /></div>
                    <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">Today&apos;s Sales</span>
                  </div>
                  <div className="text-2xl font-bold">{stats.today_sales}</div>
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-br from-purple-50 to-purple-100/50 dark:from-purple-950/30 dark:to-purple-900/10 border-purple-200 dark:border-purple-900">
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="rounded-md bg-purple-100 dark:bg-purple-900 p-1.5"><DollarSign className="h-3.5 w-3.5 text-purple-700 dark:text-purple-300" /></div>
                    <span className="text-xs text-purple-600 dark:text-purple-400 font-medium">Today&apos;s Revenue</span>
                  </div>
                  <div className="text-2xl font-bold">{formatSAR(stats.today_revenue)}</div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Filter bar */}
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search receipts, students, family..."
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Select value={historyStatus} onValueChange={(v) => setHistoryStatus(v === "__all__" ? "" : v)}>
                  <SelectTrigger className="w-[130px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All Status</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="voided">Voided</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={historyGrade} onValueChange={(v) => setHistoryGrade(v === "__all__" ? "" : v)}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Grade" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All Grades</SelectItem>
                    {grades.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={exportCSV} className="ml-auto">
                  <Download className="h-3.5 w-3.5 mr-1.5" /> Export CSV
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Sales table */}
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="font-semibold">Receipt #</TableHead>
                    <TableHead className="font-semibold">Date</TableHead>
                    <TableHead className="font-semibold">Student</TableHead>
                    <TableHead className="font-semibold">Grade</TableHead>
                    <TableHead className="font-semibold">Items</TableHead>
                    <TableHead className="text-right font-semibold">Total</TableHead>
                    <TableHead className="font-semibold">Status</TableHead>
                    <TableHead className="text-right font-semibold">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSales.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-12">
                        <Receipt className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
                        <p className="text-muted-foreground text-sm">No sales found</p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredSales.map((s) => (
                      <TableRow key={s.id} className="hover:bg-muted/30">
                        <TableCell className="font-mono text-sm font-medium">{s.receipt_number}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{formatDate(s.created_at)}</TableCell>
                        <TableCell>
                          <div className="font-medium text-sm">{s.student_name}</div>
                          <div className="text-xs text-muted-foreground">Fam: {s.family_number}</div>
                        </TableCell>
                        <TableCell><Badge variant="outline" className="text-xs">{s.grade}</Badge></TableCell>
                        <TableCell className="text-sm">{s.items.length} books</TableCell>
                        <TableCell className="text-right font-semibold text-sm tabular-nums">{formatSAR(s.total_amount)}</TableCell>
                        <TableCell>
                          <Badge
                            variant={s.status === "voided" ? "destructive" : "secondary"}
                            className={s.status === "paid" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300" : ""}
                          >
                            {s.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0"
                              onClick={() => window.open(`/api/book-sales/receipt?id=${s.id}`, "_blank")}
                              title="Print Receipt"
                            >
                              <Printer className="h-4 w-4" />
                            </Button>
                            {s.status !== "voided" && (
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0"
                                onClick={() => { setVoidingSale(s); setVoidReason(""); }}
                                title="Void Sale"
                              >
                                <Ban className="h-4 w-4 text-destructive" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ═══════════ TAB 3: BOOK CATALOG ═══════════ */}
      {tab === "catalog" && (
        <div className="space-y-4">
          {/* Stats row */}
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-4 pb-3 flex items-center gap-3">
                <div className="rounded-md bg-blue-100 dark:bg-blue-900 p-2"><BookOpen className="h-4 w-4 text-blue-700 dark:text-blue-300" /></div>
                <div>
                  <div className="text-xs text-muted-foreground">Total Books</div>
                  <div className="text-xl font-bold">{books.length}</div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3 flex items-center gap-3">
                <div className="rounded-md bg-emerald-100 dark:bg-emerald-900 p-2"><Check className="h-4 w-4 text-emerald-700 dark:text-emerald-300" /></div>
                <div>
                  <div className="text-xs text-muted-foreground">Active</div>
                  <div className="text-xl font-bold">{books.filter((b) => b.is_active).length}</div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3 flex items-center gap-3">
                <div className="rounded-md bg-purple-100 dark:bg-purple-900 p-2"><Package className="h-4 w-4 text-purple-700 dark:text-purple-300" /></div>
                <div>
                  <div className="text-xs text-muted-foreground">Bundles</div>
                  <div className="text-xl font-bold">{bundles.length}</div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Toolbar */}
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="relative w-64">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search books..."
                      value={catalogSearch}
                      onChange={(e) => setCatalogSearch(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <Select value={catalogGradeFilter} onValueChange={(v) => setCatalogGradeFilter(v === "__all__" ? "" : v)}>
                    <SelectTrigger className="w-[150px]">
                      <SelectValue placeholder="All Grades" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All Grades</SelectItem>
                      {grades.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => {
                    setEditingBook(null);
                    setBookForm({ title: "", grade: "", subject: "", price: "", isbn: "", year: selectedYear || "", is_active: true });
                    setShowAddBook(true);
                  }}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add Book
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => { setImportYear(selectedYear || ""); setShowImport(true); }}>
                    <Upload className="h-3.5 w-3.5 mr-1" /> CSV Import
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => {
                    setEditingBundle(null);
                    setBundleForm({ name: "", name_ar: "", grade: "", school: "", book_ids: [] });
                    setShowBundleDialog(true);
                  }}>
                    <FileText className="h-3.5 w-3.5 mr-1" /> Bundles
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Books table */}
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="font-semibold">Title</TableHead>
                    <TableHead className="font-semibold">Grade</TableHead>
                    <TableHead className="font-semibold">Subject</TableHead>
                    <TableHead className="text-right font-semibold">Price</TableHead>
                    <TableHead className="font-semibold">ISBN</TableHead>
                    <TableHead className="font-semibold">Status</TableHead>
                    <TableHead className="text-right font-semibold">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBooks.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-12">
                        <Package className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
                        <p className="text-muted-foreground text-sm">No books found. Add books or import CSV.</p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredBooks.map((b) => (
                      <TableRow key={b.id} className="hover:bg-muted/30">
                        <TableCell className="font-medium">{b.title}</TableCell>
                        <TableCell><Badge variant="outline" className="text-xs">{b.grade}</Badge></TableCell>
                        <TableCell className="text-sm text-muted-foreground">{b.subject || "—"}</TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">{formatSAR(b.price)}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{b.isbn || "—"}</TableCell>
                        <TableCell>
                          <Badge variant="secondary"
                            className={b.is_active ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300" : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"}>
                            {b.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => {
                              setEditingBook(b);
                              setBookForm({
                                title: b.title, grade: b.grade,
                                subject: b.subject, price: String(b.price), isbn: b.isbn,
                                year: b.year, is_active: b.is_active,
                              });
                              setShowAddBook(true);
                            }}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => deleteBook(b.id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Bundles section */}
          {bundles.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Package className="h-4 w-4 text-purple-600" />
                  Grade Bundles
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {bundles.map((bu) => (
                    <div key={bu.id} className="border rounded-lg p-4 hover:shadow-sm transition-shadow bg-gradient-to-br from-purple-50/50 to-transparent dark:from-purple-950/10">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="font-semibold text-sm">{bu.name}</div>
                          {bu.name_ar && <div className="text-xs text-muted-foreground mt-0.5">{bu.name_ar}</div>}
                        </div>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => {
                          setEditingBundle(bu);
                          setBundleForm({
                            name: bu.name, name_ar: bu.name_ar, grade: bu.grade,
                            school: bu.school, book_ids: bu.book_ids,
                          });
                          setShowBundleDialog(true);
                        }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <Badge variant="outline" className="text-xs">{bu.grade}</Badge>
                        <span className="text-xs text-muted-foreground">{bu.book_ids.length} books</span>
                      </div>
                      <div className="font-semibold text-sm mt-2 text-emerald-700 dark:text-emerald-400">{formatSAR(bu.total_price)}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ═══════════ TAB 4: REPORTS ═══════════ */}
      {tab === "reports" && <ReportsTab selectedYear={selectedYear || ""} />}

      {/* ═══════════ DIALOGS ═══════════ */}

      {/* Add/Edit Book Dialog */}
      <Dialog open={showAddBook} onOpenChange={setShowAddBook}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingBook ? "Edit Book" : "Add Book"}</DialogTitle>
            <DialogDescription>Enter the book details below.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Title (English) *" value={bookForm.title}
              onChange={(e) => setBookForm((f) => ({ ...f, title: e.target.value }))} />
            <div className="grid grid-cols-2 gap-3">
              <Input placeholder="Grade *" value={bookForm.grade}
                onChange={(e) => setBookForm((f) => ({ ...f, grade: e.target.value }))} />
              <Input placeholder="Subject" value={bookForm.subject}
                onChange={(e) => setBookForm((f) => ({ ...f, subject: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input placeholder="Price (SAR) *" type="number" value={bookForm.price}
                onChange={(e) => setBookForm((f) => ({ ...f, price: e.target.value }))} />
              <Input placeholder="ISBN" value={bookForm.isbn}
                onChange={(e) => setBookForm((f) => ({ ...f, isbn: e.target.value }))} />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={bookForm.is_active}
                onChange={(e) => setBookForm((f) => ({ ...f, is_active: e.target.checked }))}
                className="h-4 w-4" />
              <span className="text-sm">Active</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddBook(false)}>Cancel</Button>
            <Button onClick={saveBook} disabled={!bookForm.title || !bookForm.grade || !bookForm.price}>
              {editingBook ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CSV Import Dialog */}
      <Dialog open={showImport} onOpenChange={setShowImport}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>CSV Import</DialogTitle>
            <DialogDescription>
              Paste CSV with columns: title, grade, subject, price, isbn. The selected academic year will be applied to all imported books.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium whitespace-nowrap">Academic Year:</label>
            <select
              className="border rounded-md px-3 py-2 text-sm bg-background flex-1"
              value={importYear}
              onChange={(e) => setImportYear(e.target.value)}
            >
              <option value="">Select Year...</option>
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <Button variant="link" size="sm" className="px-0 h-auto text-xs"
            onClick={() => {
              const template = [
                "title,grade,subject,price,isbn",
                "Mathematics - Student Book,10,Math,85,978-0-123456-01-0",
                "Science - Student Book,10,Science,90,978-0-123456-02-7",
                "English Language Arts,10,English,75,978-0-123456-03-4",
                "Arabic Language,10,Arabic,70,978-0-123456-04-1",
                "Islamic Studies,10,Islamic Studies,60,978-0-123456-05-8",
                "Social Studies,10,Social Studies,65,978-0-123456-06-5",
                "Computer Science,10,ICT,55,978-0-123456-07-2",
                "Art & Design,10,Art,45,978-0-123456-08-9",
              ].join("\n");
              const blob = new Blob([template], { type: "text/csv" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "book_catalog_template.csv";
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            <Download className="h-3 w-3 mr-1" /> Download sample CSV template
          </Button>
          <textarea
            className="w-full h-48 border rounded-md p-3 text-sm font-mono bg-background"
            placeholder={"title,grade,subject,price,isbn\nMath Book,10,Math,50,978-123"}
            value={importCsv}
            onChange={(e) => setImportCsv(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowImport(false)}>Cancel</Button>
            <Button onClick={handleImport} disabled={!importCsv.trim() || !importYear}>Import</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bundle Dialog */}
      <Dialog open={showBundleDialog} onOpenChange={setShowBundleDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingBundle ? "Edit Bundle" : "Create Bundle"}</DialogTitle>
            <DialogDescription>Select books to include in this grade bundle.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Bundle Name *" value={bundleForm.name}
              onChange={(e) => setBundleForm((f) => ({ ...f, name: e.target.value }))} />
            <Input placeholder="Bundle Name (Arabic)" value={bundleForm.name_ar}
              onChange={(e) => setBundleForm((f) => ({ ...f, name_ar: e.target.value }))} />
            <div className="grid grid-cols-2 gap-3">
              <Input placeholder="Grade *" value={bundleForm.grade}
                onChange={(e) => setBundleForm((f) => ({ ...f, grade: e.target.value }))} />
              <select
                className="border rounded-md px-3 py-2 text-sm bg-background"
                value={bundleForm.school}
                onChange={(e) => setBundleForm((f) => ({ ...f, school: e.target.value }))}
              >
                <option value="">All Schools</option>
                <option value="boys">Boys</option>
                <option value="girls">Girls</option>
              </select>
            </div>
            <div className="border rounded-md max-h-48 overflow-auto p-2">
              <div className="text-xs text-muted-foreground mb-1">Select books:</div>
              {books.filter((b) => !bundleForm.grade || b.grade === bundleForm.grade).map((b) => (
                <label key={b.id} className="flex items-center gap-2 py-1 text-sm">
                  <input
                    type="checkbox"
                    checked={bundleForm.book_ids.includes(b.id)}
                    onChange={(e) => {
                      setBundleForm((f) => ({
                        ...f,
                        book_ids: e.target.checked
                          ? [...f.book_ids, b.id]
                          : f.book_ids.filter((id) => id !== b.id),
                      }));
                    }}
                    className="h-4 w-4"
                  />
                  {b.title} — {formatSAR(b.price)}
                </label>
              ))}
            </div>
            <div className="text-sm font-medium">
              Total: {formatSAR(
                books.filter((b) => bundleForm.book_ids.includes(b.id)).reduce((sum, b) => sum + b.price, 0)
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBundleDialog(false)}>Cancel</Button>
            <Button onClick={saveBundle} disabled={!bundleForm.name || !bundleForm.grade}>
              {editingBundle ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Void Sale Dialog */}
      <Dialog open={!!voidingSale} onOpenChange={() => setVoidingSale(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Void Sale</DialogTitle>
            <DialogDescription>
              Void receipt {voidingSale?.receipt_number}? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder="Reason for voiding *"
            value={voidReason}
            onChange={(e) => setVoidReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setVoidingSale(null)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmVoid} disabled={!voidReason.trim()}>
              Void Sale
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Database Sync Dialog ── */}
      <Dialog open={showSyncDialog} onOpenChange={(open) => { if (!syncing) setShowSyncDialog(open); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Book Sale Data Sync
            </DialogTitle>
            <DialogDescription>
              Syncs only student, registration, and family data for book sales — not all school tables.
            </DialogDescription>
          </DialogHeader>

          {/* Year selector (only before sync starts) */}
          {!syncing && !syncDone && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Academic Year</label>
              <select
                value={syncYear}
                onChange={(e) => setSyncYear(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {years.map((y) => (
                  <option key={typeof y === "string" ? y : (y as { Year_ID?: string })?.Year_ID || ""} value={typeof y === "string" ? y : (y as { Year_ID?: string })?.Year_ID || ""}>
                    {typeof y === "string" ? y : (y as { Year_ID?: string })?.Year_ID || ""}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Only students, registrations, and families for this year will be synced.
              </p>
              <Button onClick={startSync} className="w-full">
                <Database className="h-4 w-4 mr-2" />
                Start Sync
              </Button>
            </div>
          )}

          {/* Progress bar */}
          {(syncing || syncDone) && (
          <div className="space-y-3">
            <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  syncDone
                    ? syncSuccess ? "bg-emerald-500" : "bg-red-500"
                    : "bg-blue-500"
                }`}
                style={{ width: `${syncProgress}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground text-center">
              {syncDone
                ? syncSuccess ? "Sync completed successfully!" : "Sync finished with errors"
                : syncing ? `Syncing... ${syncProgress}%` : "Starting..."}
            </p>
          </div>
          )}

          {/* Log output */}
          {(syncing || syncDone) && (
          <div
            className="bg-muted/50 rounded-lg p-3 max-h-64 overflow-y-auto font-mono text-xs space-y-0.5"
            ref={(el) => { if (el) el.scrollTop = el.scrollHeight; }}
          >
            {syncLogs.length === 0 && (
              <p className="text-muted-foreground italic">Waiting for output...</p>
            )}
            {syncLogs.map((line, i) => (
              <div
                key={i}
                className={
                  line.includes("✓") ? "text-emerald-600" :
                  line.includes("✗") || line.includes("⚠") || line.startsWith("Error") ? "text-red-600" :
                  line.startsWith("▶") ? "text-blue-600 font-semibold" :
                  "text-foreground"
                }
              >
                {line}
              </div>
            ))}
          </div>
          )}

          <DialogFooter>
            {syncDone ? (
              <Button onClick={() => setShowSyncDialog(false)}>Close</Button>
            ) : syncing ? (
              <Button variant="outline" disabled>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Syncing...
              </Button>
            ) : (
              <Button variant="outline" onClick={() => setShowSyncDialog(false)}>Cancel</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── Helpers ────────────────────────────────────────────────── */

function formatDate(ts: unknown): string {
  if (!ts) return "—";
  try {
    if (typeof ts === "object" && ts !== null && "toDate" in (ts as Record<string, unknown>)) {
      return (ts as { toDate: () => Date }).toDate().toLocaleDateString("en-GB");
    }
    if (typeof ts === "string") return new Date(ts).toLocaleDateString("en-GB");
    if (typeof ts === "object" && ts !== null && "_seconds" in (ts as Record<string, unknown>)) {
      return new Date((ts as { _seconds: number })._seconds * 1000).toLocaleDateString("en-GB");
    }
  } catch { /* ignore */ }
  return "—";
}
