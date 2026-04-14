"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Package, Cpu, Loader2, AlertTriangle, XCircle, TrendingUp,
  TrendingDown, BarChart3, FileDown, Printer, Calendar,
  ArrowUpDown, ShoppingCart, ClipboardList, Hash, Users,
} from "lucide-react";
import type { StoreItem, StoreTransaction, StoreRequest } from "@/types/sis";
import { GENERAL_STORE_CONFIG, IT_STORE_CONFIG, type StoreConfig } from "@/lib/store-config";
import { useAuth } from "@/context/auth-context";
import { exportToCSV } from "@/lib/export-csv";
import ConsumptionChart from "./consumption-chart";
import ReorderReport from "./reorder-report";

/* ─── Types ───────────────────────────────────────────────────── */
type StoreSelection = "general" | "it" | "both";
type ReportTab = "overview" | "consumption" | "reorder";

interface StoreData {
  items: StoreItem[];
  transactions: StoreTransaction[];
  requests: StoreRequest[];
}

/* ─── Helpers ─────────────────────────────────────────────────── */
async function fetchStoreData(apiBase: string): Promise<StoreData> {
  const [itemsRes, txnRes, reqRes] = await Promise.all([
    fetch(`${apiBase}?action=items`),
    fetch(`${apiBase}?action=transactions&limit=5000`),
    fetch(`${apiBase}?action=requests&limit=5000`),
  ]);

  const items: StoreItem[] = itemsRes.ok ? ((await itemsRes.json()).rows ?? await itemsRes.json()) : [];
  const txnBody = txnRes.ok ? await txnRes.json() : { rows: [] };
  const transactions: StoreTransaction[] = txnBody.rows ?? txnBody;
  const reqBody = reqRes.ok ? await reqRes.json() : { rows: [] };
  const requests: StoreRequest[] = reqBody.rows ?? reqBody;

  return { items: Array.isArray(items) ? items : [], transactions, requests };
}

const STOCK_BADGE = (qty: number, reorder: number) => {
  if (qty === 0) return <Badge variant="destructive">Out of Stock</Badge>;
  if (reorder > 0 && qty <= reorder)
    return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300">Low Stock</Badge>;
  return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">In Stock</Badge>;
};

/* ─── Main Component ──────────────────────────────────────────── */
export default function StoreReportsPage() {
  const { user, can } = useAuth();
  const [store, setStore] = useState<StoreSelection>("both");
  const [tab, setTab] = useState<ReportTab>("overview");
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Raw data per store
  const [gsData, setGsData] = useState<StoreData>({ items: [], transactions: [], requests: [] });
  const [itsData, setItsData] = useState<StoreData>({ items: [], transactions: [], requests: [] });

  // Determine which stores the user can see
  const canGS = can("general_store.view");
  const canIT = can("it_store.view");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const fetches: Promise<void>[] = [];
      if (canGS) fetches.push(fetchStoreData("/api/general-store").then(setGsData));
      if (canIT) fetches.push(fetchStoreData("/api/it-store").then(setItsData));
      await Promise.all(fetches);
    } catch (e) {
      console.error("Failed to load store data", e);
    } finally {
      setLoading(false);
    }
  }, [canGS, canIT]);

  useEffect(() => { loadData(); }, [loadData]);

  // Set default store selection based on permissions
  useEffect(() => {
    if (canGS && canIT) setStore("both");
    else if (canGS) setStore("general");
    else if (canIT) setStore("it");
  }, [canGS, canIT]);

  // Merged data based on store selection
  const data = useMemo(() => {
    const items: (StoreItem & { _store: "general" | "it" })[] = [];
    const transactions: (StoreTransaction & { _store: "general" | "it" })[] = [];
    const requests: (StoreRequest & { _store: "general" | "it" })[] = [];

    if (store === "general" || store === "both") {
      items.push(...gsData.items.map((i) => ({ ...i, _store: "general" as const })));
      transactions.push(...gsData.transactions.map((t) => ({ ...t, _store: "general" as const })));
      requests.push(...gsData.requests.map((r) => ({ ...r, _store: "general" as const })));
    }
    if (store === "it" || store === "both") {
      items.push(...itsData.items.map((i) => ({ ...i, _store: "it" as const })));
      transactions.push(...itsData.transactions.map((t) => ({ ...t, _store: "it" as const })));
      requests.push(...itsData.requests.map((r) => ({ ...r, _store: "it" as const })));
    }
    return { items, transactions, requests };
  }, [store, gsData, itsData]);

  // Active items only
  const activeItems = useMemo(() => data.items.filter((i) => i.is_active !== false), [data.items]);

  // Date-filtered transactions
  const filteredTxns = useMemo(() => data.transactions.filter((t) => {
    if (!dateFrom && !dateTo) return true;
    const d = t.timestamp?.slice(0, 10) || "";
    if (dateFrom && d < dateFrom) return false;
    if (dateTo && d > dateTo) return false;
    return true;
  }), [data.transactions, dateFrom, dateTo]);

  // Date-filtered requests
  const filteredReqs = useMemo(() => data.requests.filter((r) => {
    if (!dateFrom && !dateTo) return true;
    const d = r.requested_at?.slice(0, 10) || "";
    if (dateFrom && d < dateFrom) return false;
    if (dateTo && d > dateTo) return false;
    return true;
  }), [data.requests, dateFrom, dateTo]);

  const issueTxns = useMemo(() => filteredTxns.filter((t) => t.type === "issue"), [filteredTxns]);
  const receiveTxns = useMemo(() => filteredTxns.filter((t) => t.type === "receive"), [filteredTxns]);
  const totalIssued = issueTxns.reduce((s, t) => s + t.quantity, 0);
  const totalReceived = receiveTxns.reduce((s, t) => s + t.quantity, 0);
  const lowStockItems = activeItems.filter((i) => i.reorder_level > 0 && i.quantity <= i.reorder_level && i.quantity > 0);
  const outOfStockItems = activeItems.filter((i) => i.quantity === 0);
  const pendingReqs = filteredReqs.filter((r) => r.status === "pending");

  // Config getter
  const getCfg = (s: "general" | "it"): StoreConfig =>
    s === "general" ? GENERAL_STORE_CONFIG : IT_STORE_CONFIG;

  const getCategoryLabel = (item: StoreItem & { _store: "general" | "it" }) =>
    getCfg(item._store).categoryLabels[item.category] || item.category;

  const storeLabel = (s: "general" | "it") => s === "general" ? "General" : "IT";

  /* ── Report tabs ── */
  const reportTabs: { key: ReportTab; label: string; icon: React.ReactNode }[] = [
    { key: "overview", label: "Overview", icon: <BarChart3 className="h-4 w-4" /> },
    { key: "consumption", label: "Monthly Consumption", icon: <TrendingUp className="h-4 w-4" /> },
    { key: "reorder", label: "Procurement / Reorder", icon: <ShoppingCart className="h-4 w-4" /> },
  ];

  /* ── Store selector options ── */
  const storeOptions: { key: StoreSelection; label: string; icon: React.ReactNode }[] = [];
  if (canGS && canIT) storeOptions.push({ key: "both", label: "Both Stores", icon: <Package className="h-4 w-4" /> });
  if (canGS) storeOptions.push({ key: "general", label: "General Store", icon: <Package className="h-4 w-4" /> });
  if (canIT) storeOptions.push({ key: "it", label: "IT Store", icon: <Cpu className="h-4 w-4" /> });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const storeDesc = store === "both" ? "General Store & IT Store" : store === "general" ? "General Store" : "IT Store";
  const tabLabel = reportTabs.find((rt) => rt.key === tab)?.label || tab;
  const reportRef = useRef<HTMLDivElement>(null);

  /* ── Professional Print ── */
  function handlePrint() {
    const el = reportRef.current;
    if (!el) return;
    const today = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    const tables = el.querySelectorAll("table");
    let tablesHtml = "";
    tables.forEach((t) => { tablesHtml += t.outerHTML; });
    if (!tablesHtml) tablesHtml = el.innerHTML;

    const periodText = dateFrom || dateTo
      ? `Period: ${dateFrom || "start"} — ${dateTo || "present"}`
      : "All dates";

    const win = window.open("", "_blank", "width=1100,height=800");
    if (!win) return;
    win.document.write(`<!DOCTYPE html>
<html><head><title>${storeDesc} — ${tabLabel}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a1a; background: #fff; padding: 20mm 15mm; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1a365d; padding-bottom: 14px; margin-bottom: 18px; }
  .header h1 { font-size: 20pt; font-weight: 700; color: #1a365d; margin-bottom: 2px; }
  .header h2 { font-size: 13pt; font-weight: 600; color: #2d3748; margin-bottom: 4px; }
  .header p { font-size: 9pt; color: #666; }
  .header .right { text-align: right; }
  .header .right p { font-size: 9pt; color: #888; }
  table { width: 100%; border-collapse: collapse; font-size: 9pt; margin-top: 10px; margin-bottom: 20px; }
  th { background: #edf2f7; color: #1a365d; font-weight: 700; border-bottom: 2px solid #2d3748; padding: 8px 10px; text-align: left; white-space: nowrap; }
  td { border-bottom: 1px solid #e2e8f0; padding: 6px 10px; color: #2d3748; }
  tr:nth-child(even) { background: #f7fafc; }
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
  .footer { margin-top: 30px; padding-top: 10px; border-top: 1px solid #e2e8f0; font-size: 8pt; color: #a0aec0; display: flex; justify-content: space-between; }
  @media print { body { padding: 0; } @page { size: A4 landscape; margin: 12mm 10mm; } }
</style>
</head><body>
<div class="header">
  <div>
    <h1>Khaled International Schools</h1>
    <h2>${storeDesc} — ${tabLabel}</h2>
    <p>Generated: ${today} &nbsp;|&nbsp; ${periodText}</p>
  </div>
  <div class="right">
    <p>KIS Student Information System</p>
    <p>Report Date: ${today}</p>
  </div>
</div>
${tablesHtml}
<div class="footer">
  <span>KIS SiS — ${storeDesc} ${tabLabel}</span>
  <span>Printed: ${new Date().toLocaleString("en-GB")}</span>
</div>
</body></html>`);
    win.document.close();
    setTimeout(() => { win.print(); }, 400);
  }

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div>
        <h1 className="text-2xl font-bold">Store Reports</h1>
        <p className="text-muted-foreground">Unified reporting for General Store & IT Store</p>
      </div>

      {/* ── Controls: Store Selector + Report Tabs + Date Range ── */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          {/* Store selector */}
          {storeOptions.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {storeOptions.map((opt) => (
                <Button key={opt.key} size="sm" variant={store === opt.key ? "default" : "outline"} onClick={() => setStore(opt.key)} className="gap-1.5">
                  {opt.icon} {opt.label}
                </Button>
              ))}
            </div>
          )}
          {/* Report tabs */}
          <div className="flex flex-wrap gap-2">
            {reportTabs.map((rt) => (
              <Button key={rt.key} size="sm" variant={tab === rt.key ? "default" : "outline"} onClick={() => setTab(rt.key)} className="gap-1.5">
                {rt.icon} {rt.label}
              </Button>
            ))}
          </div>
          {/* Date range (for consumption tab) */}
          {tab !== "reorder" && (
            <div className="flex flex-wrap items-center gap-3">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <Input type="date" className="w-40" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              <span className="text-muted-foreground">to</span>
              <Input type="date" className="w-40" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              {(dateFrom || dateTo) && (
                <Button size="sm" variant="ghost" onClick={() => { setDateFrom(""); setDateTo(""); }}>Clear</Button>
              )}
              <div className="ml-auto">
                <Button size="sm" variant="outline" onClick={handlePrint} className="gap-1.5">
                  <Printer className="h-4 w-4" /> Print
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── KPI Summary Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
        <KPICard label="Total Items" value={activeItems.length} icon={<Package className="h-4 w-4 text-blue-500" />} />
        <KPICard label="Total Units" value={activeItems.reduce((s, i) => s + i.quantity, 0)} icon={<Hash className="h-4 w-4 text-indigo-500" />} />
        <KPICard label="Issued" value={totalIssued} icon={<TrendingUp className="h-4 w-4 text-red-500" />} />
        <KPICard label="Received" value={totalReceived} icon={<TrendingDown className="h-4 w-4 text-emerald-500" />} />
        <KPICard label="Low Stock" value={lowStockItems.length} icon={<AlertTriangle className="h-4 w-4 text-yellow-500" />} color="text-yellow-600" />
        <KPICard label="Out of Stock" value={outOfStockItems.length} icon={<XCircle className="h-4 w-4 text-red-500" />} color="text-red-600" />
        <KPICard label="Pending Requests" value={pendingReqs.length} icon={<ClipboardList className="h-4 w-4 text-orange-500" />} color="text-orange-600" />
      </div>

      {/* ── Tab Content ── */}
      <div ref={reportRef}>
      {tab === "overview" && (
        <OverviewSection
          activeItems={activeItems}
          issueTxns={issueTxns}
          receiveTxns={receiveTxns}
          filteredReqs={filteredReqs}
          getCfg={getCfg}
          getCategoryLabel={getCategoryLabel}
          storeLabel={storeLabel}
          showStore={store === "both"}
        />
      )}

      {tab === "consumption" && (
        <ConsumptionChart
          transactions={filteredTxns}
          storeLabel={storeLabel}
          showStore={store === "both"}
          dateFrom={dateFrom}
          dateTo={dateTo}
        />
      )}

      {tab === "reorder" && (
        <ReorderReport
          items={activeItems}
          getCfg={getCfg}
          getCategoryLabel={getCategoryLabel}
          storeLabel={storeLabel}
          showStore={store === "both"}
        />
      )}
      </div>{/* end reportRef */}
    </div>
  );
}

/* ─── Small Components ────────────────────────────────────────── */

function KPICard({ label, value, icon, color }: { label: string; value: number; icon: React.ReactNode; color?: string }) {
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="pt-4 pb-3 px-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-muted-foreground font-medium">{label}</span>
          {icon}
        </div>
        <div className={`text-lg font-bold ${color || ""}`}>{value.toLocaleString()}</div>
      </CardContent>
    </Card>
  );
}

/* ─── Overview Section ────────────────────────────────────────── */
interface OverviewProps {
  activeItems: (StoreItem & { _store: "general" | "it" })[];
  issueTxns: (StoreTransaction & { _store: "general" | "it" })[];
  receiveTxns: (StoreTransaction & { _store: "general" | "it" })[];
  filteredReqs: (StoreRequest & { _store: "general" | "it" })[];
  getCfg: (s: "general" | "it") => StoreConfig;
  getCategoryLabel: (i: StoreItem & { _store: "general" | "it" }) => string;
  storeLabel: (s: "general" | "it") => string;
  showStore: boolean;
}

function OverviewSection({ activeItems, issueTxns, receiveTxns, filteredReqs, getCfg, getCategoryLabel, storeLabel, showStore }: OverviewProps) {
  // Category breakdown
  const catBreakdown = useMemo(() => {
    const map = new Map<string, { store: string; category: string; itemCount: number; totalQty: number; lowStock: number; outOfStock: number }>();
    for (const item of activeItems) {
      const key = `${item._store}:${item.category}`;
      if (!map.has(key)) {
        map.set(key, { store: storeLabel(item._store), category: getCategoryLabel(item), itemCount: 0, totalQty: 0, lowStock: 0, outOfStock: 0 });
      }
      const row = map.get(key)!;
      row.itemCount++;
      row.totalQty += item.quantity;
      if (item.quantity === 0) row.outOfStock++;
      else if (item.reorder_level > 0 && item.quantity <= item.reorder_level) row.lowStock++;
    }
    return Array.from(map.values()).sort((a, b) => a.store.localeCompare(b.store) || b.totalQty - a.totalQty);
  }, [activeItems, getCategoryLabel, storeLabel]);

  // Top issued items
  const topIssued = useMemo(() => {
    const byItem: Record<string, { name: string; store: string; qty: number; count: number }> = {};
    for (const t of issueTxns) {
      const key = `${t._store}:${t.item_id}`;
      if (!byItem[key]) byItem[key] = { name: t.item_name, store: storeLabel(t._store), qty: 0, count: 0 };
      byItem[key].qty += t.quantity;
      byItem[key].count++;
    }
    return Object.values(byItem).sort((a, b) => b.qty - a.qty).slice(0, 15);
  }, [issueTxns, storeLabel]);

  // Top requesters
  const topRequesters = useMemo(() => {
    const byPerson: Record<string, { name: string; totalReqs: number; totalQty: number }> = {};
    for (const r of filteredReqs) {
      const key = r.requested_by;
      if (!byPerson[key]) byPerson[key] = { name: r.requested_by_name || r.requested_by, totalReqs: 0, totalQty: 0 };
      byPerson[key].totalReqs++;
      byPerson[key].totalQty += r.items.reduce((s, i) => s + i.qty_requested, 0);
    }
    return Object.values(byPerson).sort((a, b) => b.totalQty - a.totalQty).slice(0, 15);
  }, [filteredReqs]);

  // Request status summary
  const reqStatusSummary = useMemo(() => {
    const counts: Record<string, number> = { pending: 0, approved: 0, partially_approved: 0, rejected: 0, issued: 0 };
    for (const r of filteredReqs) counts[r.status] = (counts[r.status] || 0) + 1;
    return counts;
  }, [filteredReqs]);

  const maxQty = topIssued.length > 0 ? topIssued[0].qty : 1;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Category Breakdown */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5" /> Category Breakdown</CardTitle>
          <CardDescription>Inventory distribution by category across stores</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                {showStore && <TableHead>Store</TableHead>}
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Items</TableHead>
                <TableHead className="text-right">Total Qty</TableHead>
                <TableHead className="text-right">Low Stock</TableHead>
                <TableHead className="text-right">Out of Stock</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {catBreakdown.map((row, i) => (
                <TableRow key={i}>
                  {showStore && <TableCell><Badge variant="outline">{row.store}</Badge></TableCell>}
                  <TableCell className="font-medium">{row.category}</TableCell>
                  <TableCell className="text-right">{row.itemCount}</TableCell>
                  <TableCell className="text-right font-semibold">{row.totalQty.toLocaleString()}</TableCell>
                  <TableCell className="text-right">{row.lowStock > 0 ? <span className="text-yellow-600 font-semibold">{row.lowStock}</span> : "—"}</TableCell>
                  <TableCell className="text-right">{row.outOfStock > 0 ? <span className="text-red-600 font-semibold">{row.outOfStock}</span> : "—"}</TableCell>
                </TableRow>
              ))}
              {catBreakdown.length === 0 && (
                <TableRow><TableCell colSpan={showStore ? 6 : 5} className="text-center py-8 text-muted-foreground">No inventory data</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Top Issued Items */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5" /> Top Issued Items</CardTitle>
          <CardDescription>Most frequently issued items by quantity</CardDescription>
        </CardHeader>
        <CardContent>
          {topIssued.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No issue transactions in this period</p>
          ) : (
            <div className="space-y-2">
              {topIssued.map((item, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-5 text-right">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{item.name}</span>
                      {showStore && <Badge variant="outline" className="text-[10px] px-1">{item.store}</Badge>}
                    </div>
                    <div className="h-2 bg-muted rounded-full mt-1 overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${(item.qty / maxQty) * 100}%` }} />
                    </div>
                  </div>
                  <span className="text-sm font-bold tabular-nums w-12 text-right">{item.qty}</span>
                  <span className="text-xs text-muted-foreground w-14 text-right">({item.count} txn)</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Top Requesters + Request Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> Top Requesters</CardTitle>
          <CardDescription>Staff members with highest request volume</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Status Summary */}
          <div className="flex flex-wrap gap-3">
            {Object.entries(reqStatusSummary).filter(([, v]) => v > 0).map(([status, count]) => (
              <div key={status} className="flex items-center gap-1.5">
                <Badge variant="outline" className="capitalize">{status.replace("_", " ")}</Badge>
                <span className="text-sm font-bold">{count}</span>
              </div>
            ))}
          </div>
          {/* Top Requesters Table */}
          {topRequesters.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">No requests in this period</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Staff</TableHead>
                  <TableHead className="text-right">Requests</TableHead>
                  <TableHead className="text-right">Qty Requested</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topRequesters.map((p, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="text-right">{p.totalReqs}</TableCell>
                    <TableCell className="text-right font-semibold">{p.totalQty}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
