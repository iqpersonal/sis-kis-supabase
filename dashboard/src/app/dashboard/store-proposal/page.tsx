"use client";

import { useState, useRef, useCallback } from "react";
import { useAuth } from "@/context/auth-context";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Printer,
  ShieldAlert,
  Package,
  Cpu,
  Laptop,
  ScanBarcode,
  Brain,
  ClipboardCheck,
  TrendingUp,
  Users,
  BarChart3,
  Smartphone,
  Monitor,
  Shield,
  Globe,
  CheckCircle2,
  ArrowRight,
  Loader2,
  Settings2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ══════════════════════════════════════════════════════════════════
   Store & Inventory Management – Management Proposal
   Only accessible to super_admin · Professional print layout
   ══════════════════════════════════════════════════════════════════ */

const SECTIONS = [
  { id: "overview", label: "System Overview" },
  { id: "general-store", label: "General Store" },
  { id: "it-store", label: "IT Store" },
  { id: "it-inventory", label: "IT Inventory (IT Assets)" },
  { id: "fixed-assets", label: "Fixed Assets (School Assets)" },
  { id: "dashboard", label: "Dashboard Features" },
  { id: "mobile", label: "Mobile App Features" },
  { id: "rbac", label: "Role-Based Access" },
  { id: "tech", label: "Technology Stack" },
  { id: "cost", label: "Development Cost" },
  { id: "annual", label: "Annual Running Cost" },
  { id: "compare", label: "Competitor Comparison" },
  { id: "value", label: "Value Propositions" },
  { id: "pricing", label: "Pricing Options" },
  { id: "summary", label: "Summary" },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

/* ── Static data ── */

const GENERAL_CATEGORIES = [
  { name: "Stationery", nameAr: "قرطاسية", prefix: "GS-STN", examples: "Pens, pencils, markers, paper, notebooks" },
  { name: "Office Supplies", nameAr: "لوازم مكتبية", prefix: "GS-OFS", examples: "Staplers, tape, files, folders" },
  { name: "Cleaning Supplies", nameAr: "لوازم تنظيف", prefix: "GS-CLN", examples: "Detergent, cloths, brooms, sanitizer" },
  { name: "Classroom Materials", nameAr: "مواد صفية", prefix: "GS-CLS", examples: "Whiteboard markers, chalk, rulers" },
  { name: "Furniture", nameAr: "أثاث", prefix: "GS-FRN", examples: "Desks, chairs, shelves, cabinets" },
  { name: "Other", nameAr: "أخرى", prefix: "GS-OTH", examples: "Miscellaneous items" },
];

const IT_CATEGORIES = [
  { name: "Toner & Ink", prefix: "ITS-TNR", examples: "Printer cartridges, ink refills" },
  { name: "Cables", prefix: "ITS-CBL", examples: "HDMI, USB, Ethernet, power cables" },
  { name: "Peripherals", prefix: "ITS-PRP", examples: "Mouse, keyboard, headset, webcam" },
  { name: "Storage Media", prefix: "ITS-STG", examples: "USB drives, external HDDs, SD cards" },
  { name: "Networking", prefix: "ITS-NET", examples: "Switches, access points, patch panels" },
  { name: "Components", prefix: "ITS-CMP", examples: "RAM, SSD, power supplies, fans" },
  { name: "Other", prefix: "ITS-OTH", examples: "Miscellaneous items" },
];

const ASSET_TYPES = [
  { type: "Laptop", prefix: "KIS-LT" },
  { type: "Desktop", prefix: "KIS-DT" },
  { type: "Printer", prefix: "KIS-PR" },
  { type: "Projector", prefix: "KIS-PJ" },
  { type: "Tablet", prefix: "KIS-TB" },
  { type: "Phone", prefix: "KIS-PH" },
  { type: "Network Device", prefix: "KIS-ND" },
  { type: "Monitor", prefix: "KIS-MN" },
  { type: "Other", prefix: "KIS-OT" },
];

const FIXED_ASSET_CATEGORIES = [
  { name: "Air Conditioning", nameAr: "تكييف", prefix: "FA-AC", examples: "Split AC, central AC units, window AC" },
  { name: "Furniture — Classroom", nameAr: "أثاث صفي", prefix: "FA-FCL", examples: "Student desks, chairs, teacher desk, podium" },
  { name: "Furniture — Office", nameAr: "أثاث مكتبي", prefix: "FA-FOF", examples: "Office desks, executive chairs, conference table" },
  { name: "Electrical Appliances", nameAr: "أجهزة كهربائية", prefix: "FA-ELC", examples: "Refrigerator, microwave, water dispenser, heater" },
  { name: "Playground & Sports", nameAr: "ملاعب ورياضة", prefix: "FA-SPT", examples: "Goal posts, basketball hoop, gym equipment" },
  { name: "Safety & Security", nameAr: "أمن وسلامة", prefix: "FA-SEC", examples: "Fire extinguishers, CCTV cameras, alarm panels" },
  { name: "Laboratory Equipment", nameAr: "معدات مختبر", prefix: "FA-LAB", examples: "Microscopes, lab benches, fume hoods" },
  { name: "Kitchen & Cafeteria", nameAr: "مطبخ وكافتيريا", prefix: "FA-KIT", examples: "Industrial oven, serving counters, tables" },
  { name: "Signage & Boards", nameAr: "لوحات وإرشادات", prefix: "FA-SGN", examples: "Whiteboards, notice boards, digital signage" },
  { name: "Vehicles", nameAr: "مركبات", prefix: "FA-VEH", examples: "School buses, maintenance carts" },
  { name: "Other", nameAr: "أخرى", prefix: "FA-OTH", examples: "Miscellaneous fixed assets" },
];

const MOBILE_FEATURES = [
  { title: "Barcode Scanner", desc: "7 formats, double-read verification, torch, manual entry" },
  { title: "Quick Issue", desc: "Scan, staff autocomplete, instant stock deduction" },
  { title: "AI Image Search", desc: "Gemini 2.0 Flash Vision identifies products from photos" },
  { title: "Request Workflow", desc: "Cart-based requests, approve/reject, issue tracking" },
  { title: "Inventory Browse", desc: "Search, category filter, stock badges, scan button" },
  { title: "Real-time KPIs", desc: "5 live metrics on store home, from Firestore" },
];

const DASHBOARD_FEATURES = [
  { title: "Inventory Management", desc: "Full CRUD, dual images, barcode lookup, QR labels, CSV import" },
  { title: "Request & Approval", desc: "Multi-item requests, per-item quantity review, status tracking" },
  { title: "Issue History", desc: "Complete audit trail, type filters, CSV export" },
  { title: "IT Asset Tracking", desc: "11 KPIs, depreciation, assignment, maintenance scheduling" },
  { title: "Fixed Asset Management", desc: "School assets (AC, furniture, equipment), location tracking, maintenance" },
  { title: "Cross-Store Reports", desc: "Overview, monthly consumption, procurement/reorder analysis" },
  { title: "Professional Print", desc: "Branded print layouts with KIS header, PDF export" },
];

const RBAC_MATRIX = [
  { role: "Store Clerk", gs: true, it: false, inv: false, fa: false },
  { role: "IT Manager", gs: false, it: true, inv: true, fa: false },
  { role: "IT Admin", gs: false, it: true, inv: true, fa: false },
  { role: "Facility Manager", gs: false, it: false, inv: false, fa: true },
  { role: "Admin", gs: true, it: true, inv: true, fa: true },
  { role: "Super Admin", gs: true, it: true, inv: true, fa: true },
];

const DEV_COSTS = [
  { component: "Dashboard Store UI (General + IT + Reports)", hours: "150–200", value: "28,000–60,000" },
  { component: "IT Inventory Dashboard (KPIs, depreciation)", hours: "80–120", value: "15,000–36,000" },
  { component: "Fixed Assets Module (School assets, tracking)", hours: "60–100", value: "11,000–30,000" },
  { component: "Mobile App (11 screens, scanning, AI)", hours: "200–280", value: "37,500–84,000" },
  { component: "Backend APIs (4 endpoints + logic)", hours: "60–80", value: "11,000–24,000" },
  { component: "Barcode System (scanner, lookup, normalization)", hours: "40–60", value: "7,500–18,000" },
  { component: "AI Image Search (Gemini Vision integration)", hours: "30–40", value: "5,600–12,000" },
  { component: "Request/Approval Workflow", hours: "60–80", value: "11,000–24,000" },
  { component: "RBAC & Security (5 roles, 9 permissions)", hours: "20–30", value: "3,750–9,000" },
  { component: "Testing & QA", hours: "40–60", value: "7,500–18,000" },
];

const COMPETITORS = [
  { name: "EZOfficeInventory", annual: "13,500–45,000", notes: "No school integration, no mobile barcode app" },
  { name: "Asset Panda", annual: "15,750–67,500", notes: "Asset tracking only, no request workflow" },
  { name: "Sortly Pro", annual: "4,500–22,500", notes: "Consumer-grade, no RBAC, no depreciation" },
  { name: "UpKeep", annual: "20,250–90,000", notes: "Maintenance-focused, no school context" },
  { name: "Custom Development", annual: "112,500–300,000+", notes: "One-time + ~37,500/yr maintenance" },
];

const VALUE_PROPS = [
  { feature: "Mobile Barcode Scanning", vs_manual: "Eliminates manual counting", vs_generic: "Most require separate scanners" },
  { feature: "AI Product Identification", vs_manual: "Not possible", vs_generic: "Not available in any competitor" },
  { feature: "Request/Approval Workflow", vs_manual: "No accountability", vs_generic: "Most charge extra" },
  { feature: "IT Asset Depreciation", vs_manual: "Impossible manually", vs_generic: "Rarely in school systems" },
  { feature: "School Fixed Asset Tracking", vs_manual: "Scattered spreadsheets", vs_generic: "No school-specific categories" },
  { feature: "Dual-Platform (Web + Mobile)", vs_manual: "Desktop only at best", vs_generic: "Usually web-only" },
  { feature: "Arabic/English Bilingual", vs_manual: "Manual translation", vs_generic: "Not in western products" },
  { feature: "School-Integrated", vs_manual: "Isolated data", vs_generic: "No SIS integration" },
];

const TECH_STACK = [
  { layer: "Dashboard", tech: "Next.js 15, React 19, TypeScript, Tailwind CSS, shadcn UI" },
  { layer: "Mobile App", tech: "React Native, Expo 55, expo-camera (barcode)" },
  { layer: "Backend APIs", tech: "Next.js API Routes, Firebase Admin SDK" },
  { layer: "Database", tech: "Google Firestore (real-time, cloud-hosted)" },
  { layer: "AI Vision", tech: "Google Gemini 2.0 Flash" },
  { layer: "Image Storage", tech: "Firebase Cloud Storage" },
  { layer: "Barcode API", tech: "UPCitemdb, Open Food Facts" },
  { layer: "Authentication", tech: "Firebase Auth + RBAC" },
  { layer: "Hosting", tech: "Firebase Hosting + Cloud Run" },
];

/* ══════════════════════════════════════════════════════════════════ */
export default function StoreProposalPage() {
  const { role, loading } = useAuth();
  const printRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<Set<SectionId>>(
    () => new Set(SECTIONS.map((s) => s.id))
  );
  const [showDialog, setShowDialog] = useState(false);

  const toggle = useCallback((id: SectionId) => {
    setSelected((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }, []);

  /* ── Print via clean window (no sidebar / header / hero) ── */
  const handlePrint = useCallback(() => {
    setShowDialog(false);
    setTimeout(() => {
      const docEl = document.getElementById("store-proposal-doc");
      if (!docEl) return;

      // Gather every stylesheet from the current page
      const styles: string[] = [];
      document.querySelectorAll('link[rel="stylesheet"]').forEach((el) => {
        styles.push(`<link rel="stylesheet" href="${(el as HTMLLinkElement).href}">`);
      });
      document.querySelectorAll("style").forEach((el) => {
        styles.push(el.outerHTML);
      });

      const pw = window.open("", "_blank");
      if (!pw) { window.print(); return; } // popup-blocked fallback

      pw.document.write(
        `<!DOCTYPE html><html><head><meta charset="utf-8">` +
        `<title>KIS Store, Inventory &amp; Asset Management System</title>` +
        styles.join("\n") +
        `<style>
          @page { size: A4 portrait; margin: 14mm 12mm; }
          html, body { margin: 0; padding: 0; background: #fff; }
          .sp-doc { max-width: none; padding: 0 24px; margin: 0 auto; }
        </style>` +
        `</head><body>${docEl.outerHTML}</body></html>`
      );
      pw.document.close();

      // Wait for stylesheets, then trigger print
      const kick = () => { pw.focus(); pw.print(); };
      const fallback = setTimeout(kick, 2000);
      pw.onload = () => { clearTimeout(fallback); setTimeout(kick, 600); };
    }, 300);
  }, []);

  const vis = useCallback((id: SectionId) => selected.has(id), [selected]);

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  if (role !== "super_admin") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-950"><ShieldAlert className="h-8 w-8 text-red-600" /></div>
        <h2 className="text-xl font-bold">Access Denied</h2>
        <p className="text-muted-foreground max-w-sm">This page is restricted to Super Administrators only.</p>
      </div>
    );
  }

  let sn = 0;
  const nn = () => ++sn;

  return (
    <>
      {/* ═══ PRINT SECTION PICKER DIALOG ═══ */}
      {showDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 no-print" onClick={() => setShowDialog(false)}>
          <div className="bg-card rounded-xl shadow-2xl border w-full max-w-md mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
              <div className="flex items-center gap-2"><Settings2 className="h-5 w-5" /><h3 className="font-semibold text-lg">Select Sections to Print</h3></div>
              <button onClick={() => setShowDialog(false)} className="hover:bg-white/20 rounded-lg p-1 transition-colors"><X className="h-5 w-5" /></button>
            </div>
            <div className="px-6 py-4 max-h-[60vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm text-muted-foreground">{selected.size} / {SECTIONS.length} selected</span>
                <div className="flex gap-2">
                  <button onClick={() => setSelected(new Set(SECTIONS.map((s) => s.id)))} className="text-xs font-medium text-blue-600 hover:underline">All</button>
                  <span className="text-muted-foreground">|</span>
                  <button onClick={() => setSelected(new Set())} className="text-xs font-medium text-blue-600 hover:underline">None</button>
                </div>
              </div>
              <div className="space-y-0.5">
                {SECTIONS.map((s) => (
                  <label key={s.id} className={cn("flex items-center gap-3 rounded-lg px-3 py-2.5 cursor-pointer transition-colors", selected.has(s.id) ? "bg-blue-50 dark:bg-blue-950/30" : "hover:bg-muted/50")}>
                    <Checkbox checked={selected.has(s.id)} onCheckedChange={() => toggle(s.id)} />
                    <span className={cn("text-sm", selected.has(s.id) ? "font-medium" : "text-muted-foreground")}>{s.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="px-6 py-4 border-t bg-muted/30 flex items-center justify-between">
              <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
              <Button onClick={handlePrint} disabled={selected.size === 0} className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
                <Printer className="mr-2 h-4 w-4" />Print {selected.size} Section{selected.size !== 1 ? "s" : ""}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ SCREEN HERO ═══ */}
      <div className="mx-auto max-w-5xl px-4 no-print">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-700 via-indigo-700 to-purple-800 text-white p-8 md:p-12 mb-8 shadow-xl">
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-4">
              {[Package, Cpu, Laptop].map((Icon, i) => (
                <div key={i} className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm"><Icon className="h-5 w-5" /></div>
              ))}
            </div>
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-3">Store & Inventory Management System</h1>
            <p className="text-blue-100 text-lg max-w-2xl leading-relaxed">Complete dual-platform solution for General Store, IT Store, IT Assets, and School Fixed Assets.</p>
            <div className="flex flex-wrap gap-2 mt-5">
              {["Mobile App", "Web Dashboard", "Barcode Scanning", "AI-Powered", "Fixed Assets"].map((t) => (
                <span key={t} className="rounded-full bg-white/15 backdrop-blur-sm px-3.5 py-1 text-sm font-medium">{t}</span>
              ))}
            </div>
            <Button onClick={() => setShowDialog(true)} className="mt-8 bg-white text-blue-700 hover:bg-blue-50 font-semibold shadow-lg">
              <Printer className="mr-2 h-4 w-4" />Print / Save as PDF
            </Button>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════
          PROFESSIONAL PRINT DOCUMENT
          All styles via .sp-* classes (defined in globals.css)
         ═══════════════════════════════════════════════════════════ */}
      <div ref={printRef} id="store-proposal-doc" className="sp-doc">

        {/* ── COVER HEADER ── */}
        <div className="sp-cover">
          <div className="sp-cover-accent" />
          <div className="sp-cover-body">
            <div className="sp-cover-left">
              <div className="sp-cover-title">KIS Store, Inventory &amp; Asset Management System</div>
              <div className="sp-cover-subtitle">Management Approval &amp; Commercial Proposal</div>
            </div>
            <div className="sp-cover-right">
              <div className="sp-cover-school">Khaled International Schools</div>
              <div className="sp-cover-date">April 13, 2026</div>
              <div className="sp-cover-status">PRODUCTION — LIVE</div>
            </div>
          </div>
          <div className="sp-cover-line" />
        </div>

        {/* ── 1. OVERVIEW ── */}
        {vis("overview") && (
          <section className="sp-section">
            <h2 className="sp-h2"><span className="sp-num">{nn()}</span>System Overview</h2>
            <div className="sp-kpi-grid">
              {[
                ["4", "Dashboard Tabs", "per store"], ["11", "Mobile Screens", "dedicated"],
                ["4+", "API Endpoints", "backend"], ["6", "User Roles", "store-related"],
                ["4", "Store Modules", "integrated"], ["7", "Barcode Formats", "supported"],
                ["2", "Languages", "AR + EN"], ["33+", "Item Categories", "across stores"],
              ].map(([v, l, s]) => (
                <div key={l} className="sp-kpi">
                  <div className="sp-kpi-val">{v}</div>
                  <div className="sp-kpi-label">{l}</div>
                  <div className="sp-kpi-sub">{s}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── 2. GENERAL STORE ── */}
        {vis("general-store") && (
          <section className="sp-section">
            <h2 className="sp-h2"><span className="sp-num">{nn()}</span>General Store</h2>
            <p className="sp-p">Manages all school consumable supplies across Boys&apos; and Girls&apos; campuses.</p>
            <table className="sp-tbl">
              <thead><tr><th>Category</th><th>Arabic</th><th>ID Prefix</th><th>Examples</th></tr></thead>
              <tbody>
                {GENERAL_CATEGORIES.map((c) => (
                  <tr key={c.prefix}><td className="sp-bold">{c.name}</td><td>{c.nameAr}</td><td className="sp-mono">{c.prefix}</td><td className="sp-muted">{c.examples}</td></tr>
                ))}
              </tbody>
            </table>
            <div className="sp-box sp-box-blue">
              <div className="sp-box-title">Item Data Fields (per item)</div>
              <div className="sp-check-grid">
                {["Auto-generated Item ID", "Bilingual Name (EN/AR)", "Category & Unit", "Current Stock Quantity",
                  "Reorder Level (threshold)", "Storage Location", "Branch (Boys/Girls)", "Barcode (UPC/EAN)",
                  "Catalog Image (auto-fetched)", "Custom Photo Upload", "Notes"].map((f) => (
                  <div key={f} className="sp-check-item">✓ {f}</div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ── 3. IT STORE ── */}
        {vis("it-store") && (
          <section className="sp-section">
            <h2 className="sp-h2"><span className="sp-num">{nn()}</span>IT Store</h2>
            <p className="sp-p">Manages consumable IT supplies — toner, cables, peripherals, networking equipment, and components.</p>
            <table className="sp-tbl">
              <thead><tr><th>Category</th><th>ID Prefix</th><th>Examples</th></tr></thead>
              <tbody>
                {IT_CATEGORIES.map((c) => (
                  <tr key={c.prefix}><td className="sp-bold">{c.name}</td><td className="sp-mono">{c.prefix}</td><td className="sp-muted">{c.examples}</td></tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* ── 4. IT INVENTORY ── */}
        {vis("it-inventory") && (
          <section className="sp-section">
            <h2 className="sp-h2"><span className="sp-num">{nn()}</span>IT Inventory — IT Assets</h2>
            <p className="sp-p">Tracks high-value IT equipment with depreciation, assignment, and maintenance management.</p>
            <div className="sp-cols">
              <div>
                <table className="sp-tbl sp-tbl-compact">
                  <thead><tr><th>Asset Type</th><th>ID Prefix</th></tr></thead>
                  <tbody>{ASSET_TYPES.map((a) => <tr key={a.prefix}><td className="sp-bold">{a.type}</td><td className="sp-mono">{a.prefix}</td></tr>)}</tbody>
                </table>
              </div>
              <div>
                <div className="sp-box">
                  <div className="sp-box-title">Financial Tracking</div>
                  {[["Total Purchase Value", "Sum of all purchase prices (SAR)"], ["Current Book Value", "Purchase − accumulated depreciation"],
                    ["Depreciation Method", "Straight-line over useful life"], ["Salvage Value", "End-of-life residual value (SAR)"]].map(([k, v]) => (
                    <div key={k} className="sp-kv"><span className="sp-kv-k">{k}:</span> <span className="sp-kv-v">{v}</span></div>
                  ))}
                </div>
                <div className="sp-box" style={{ marginTop: 10 }}>
                  <div className="sp-box-title">11 Live KPI Dashboard</div>
                  <div className="sp-tags">
                    {["Total Assets", "In Use", "Available", "Maintenance", "Retired", "Lost",
                      "Warranty Expiring", "Purchase Value", "Book Value", "Depreciation", "Maint. Due"].map((k) => (
                      <span key={k} className="sp-tag">{k}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ── 5. FIXED ASSETS ── */}
        {vis("fixed-assets") && (
          <section className="sp-section">
            <h2 className="sp-h2"><span className="sp-num">{nn()}</span>Fixed Assets — School Assets</h2>
            <p className="sp-p">Tracks all non-IT school fixed assets — furniture, AC units, electrical appliances, laboratory equipment, vehicles, and more. Full lifecycle management with location tracking, maintenance scheduling, and depreciation.</p>
            <table className="sp-tbl">
              <thead><tr><th>Category</th><th>Arabic</th><th>ID Prefix</th><th>Examples</th></tr></thead>
              <tbody>
                {FIXED_ASSET_CATEGORIES.map((c) => (
                  <tr key={c.prefix}><td className="sp-bold">{c.name}</td><td>{c.nameAr}</td><td className="sp-mono">{c.prefix}</td><td className="sp-muted">{c.examples}</td></tr>
                ))}
              </tbody>
            </table>
            <div className="sp-cols">
              <div className="sp-box sp-box-blue">
                <div className="sp-box-title">Asset Data Fields</div>
                <div className="sp-check-grid">
                  {["Auto-generated Asset ID", "Bilingual Name (EN/AR)", "Category & Sub-type",
                    "Location (Building/Floor/Room)", "Branch (Boys/Girls)", "Purchase Date & Price",
                    "Warranty Period", "Condition Status", "Assigned Department",
                    "Maintenance History", "Photo Documentation", "QR Code Label"].map((f) => (
                    <div key={f} className="sp-check-item">✓ {f}</div>
                  ))}
                </div>
              </div>
              <div className="sp-box">
                <div className="sp-box-title">Lifecycle Tracking</div>
                {[["Statuses", "Active, In Maintenance, Retired, Disposed, Lost"],
                  ["Depreciation", "Straight-line over useful life"],
                  ["Maintenance", "Scheduled & on-demand, history log"],
                  ["Transfers", "Track room/building reassignments"],
                  ["Disposal", "Record disposal date, method & reason"]].map(([k, v]) => (
                  <div key={k} className="sp-kv"><span className="sp-kv-k">{k}:</span> <span className="sp-kv-v">{v}</span></div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ── 6. DASHBOARD ── */}
        {vis("dashboard") && (
          <section className="sp-section">
            <h2 className="sp-h2"><span className="sp-num">{nn()}</span>Dashboard Features (Web)</h2>
            <div className="sp-feat-grid">
              {DASHBOARD_FEATURES.map((f) => (
                <div key={f.title} className="sp-feat">
                  <div className="sp-feat-title">{f.title}</div>
                  <div className="sp-feat-desc">{f.desc}</div>
                </div>
              ))}
            </div>
            <div className="sp-box">
              <div className="sp-box-title">Request Workflow</div>
              <div className="sp-flow">
                {["New Request", "Pending", "Approved / Partial / Rejected", "Issued"].map((s, i) => (
                  <span key={s} className="sp-flow-step">
                    <span className={cn("sp-flow-badge", i === 0 && "sp-fb-blue", i === 1 && "sp-fb-yellow", i === 2 && "sp-fb-orange", i === 3 && "sp-fb-green")}>{s}</span>
                    {i < 3 && <span className="sp-flow-arrow">→</span>}
                  </span>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ── 7. MOBILE ── */}
        {vis("mobile") && (
          <section className="sp-section">
            <h2 className="sp-h2"><span className="sp-num">{nn()}</span>Mobile App Features (Android)</h2>
            <div className="sp-feat-grid">
              {MOBILE_FEATURES.map((f) => (
                <div key={f.title} className="sp-feat">
                  <div className="sp-feat-title">{f.title}</div>
                  <div className="sp-feat-desc">{f.desc}</div>
                </div>
              ))}
            </div>
            <div className="sp-box sp-box-purple">
              <div className="sp-box-title">Barcode Scanning Specification</div>
              <div className="sp-spec-grid">
                {[["Supported Formats", "QR, EAN-13, EAN-8, UPC-A, UPC-E, Code 128, Code 39"],
                  ["Verification", "2 consecutive reads required to prevent misscans"],
                  ["Fallback", "Manual barcode entry input with keyboard"],
                  ["Additional", "Torch/flash control, auto UPC↔EAN normalization, cross-store search"]].map(([k, v]) => (
                  <div key={k}><div className="sp-spec-k">{k}</div><div className="sp-spec-v">{v}</div></div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ── 8. RBAC ── */}
        {vis("rbac") && (
          <section className="sp-section">
            <h2 className="sp-h2"><span className="sp-num">{nn()}</span>Role-Based Access Control</h2>
            <table className="sp-tbl">
              <thead><tr><th>Role</th><th style={{ textAlign: "center" }}>General Store</th><th style={{ textAlign: "center" }}>IT Store</th><th style={{ textAlign: "center" }}>IT Inventory</th><th style={{ textAlign: "center" }}>Fixed Assets</th></tr></thead>
              <tbody>
                {RBAC_MATRIX.map((r) => (
                  <tr key={r.role}>
                    <td className="sp-bold">{r.role}</td>
                    {[r.gs, r.it, r.inv, r.fa].map((v, i) => (
                      <td key={i} style={{ textAlign: "center" }}>
                        <span className={v ? "sp-yes" : "sp-no"}>{v ? "✓" : "—"}</span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* ── 9. TECH ── */}
        {vis("tech") && (
          <section className="sp-section">
            <h2 className="sp-h2"><span className="sp-num">{nn()}</span>Technology Stack</h2>
            <table className="sp-tbl sp-tbl-compact">
              <thead><tr><th>Layer</th><th>Technology</th></tr></thead>
              <tbody>{TECH_STACK.map((t) => <tr key={t.layer}><td className="sp-bold">{t.layer}</td><td>{t.tech}</td></tr>)}</tbody>
            </table>
          </section>
        )}

        {/* ── 10. DEV COST ── */}
        {vis("cost") && (
          <section className="sp-section sp-page-break">
            <h2 className="sp-h2"><span className="sp-num">{nn()}</span>Development Cost (Already Built)</h2>
            <table className="sp-tbl">
              <thead><tr><th>Component</th><th style={{ textAlign: "center" }}>Est. Hours</th><th style={{ textAlign: "center" }}>Market Value (SAR)</th></tr></thead>
              <tbody>
                {DEV_COSTS.map((c) => (
                  <tr key={c.component}><td>{c.component}</td><td className="sp-mono sp-center">{c.hours}</td><td className="sp-mono sp-center">{c.value}</td></tr>
                ))}
                <tr className="sp-total"><td>Total</td><td className="sp-mono sp-center">740–1,050 hrs</td><td className="sp-mono sp-center">138,000–315,000</td></tr>
              </tbody>
            </table>
            <div className="sp-highlight">
              <div className="sp-highlight-label">Conservative Market Value</div>
              <div className="sp-highlight-val">SAR 140,000 – 210,000</div>
              <div className="sp-highlight-note">Based on regional freelance and agency rates (SAR 190–300/hr)</div>
            </div>
          </section>
        )}

        {/* ── 11. ANNUAL ── */}
        {vis("annual") && (
          <section className="sp-section">
            <h2 className="sp-h2"><span className="sp-num">{nn()}</span>Ongoing Annual Cost</h2>
            <table className="sp-tbl">
              <thead><tr><th>Service</th><th style={{ textAlign: "center" }}>Annual Cost (SAR)</th></tr></thead>
              <tbody>
                {[["Firebase (Firestore + Storage + Auth)", "450–1,350"], ["Cloud Run (SSR)", "225–675"], ["Gemini AI API (Image Search)", "90–225"]].map(([s, c]) => (
                  <tr key={s}><td>{s}</td><td className="sp-mono sp-center">{c}</td></tr>
                ))}
                <tr className="sp-total sp-total-green"><td>Total Annual Infrastructure</td><td className="sp-mono sp-center">SAR 750 – 2,250</td></tr>
              </tbody>
            </table>
          </section>
        )}

        {/* ── 12. COMPETITORS ── */}
        {vis("compare") && (
          <section className="sp-section">
            <h2 className="sp-h2"><span className="sp-num">{nn()}</span>Competitor Comparison</h2>
            <table className="sp-tbl">
              <thead><tr><th>Product</th><th style={{ textAlign: "center" }}>Annual Cost (SAR)</th><th>Limitations</th></tr></thead>
              <tbody>{COMPETITORS.map((c) => <tr key={c.name}><td className="sp-bold">{c.name}</td><td className="sp-mono sp-center">{c.annual}</td><td className="sp-muted">{c.notes}</td></tr>)}</tbody>
            </table>
          </section>
        )}

        {/* ── 13. VALUE ── */}
        {vis("value") && (
          <section className="sp-section">
            <h2 className="sp-h2"><span className="sp-num">{nn()}</span>Value Propositions</h2>
            <table className="sp-tbl">
              <thead><tr><th>Feature</th><th>vs. Manual / Spreadsheet</th><th>vs. Generic Software</th></tr></thead>
              <tbody>{VALUE_PROPS.map((v) => <tr key={v.feature}><td className="sp-bold">{v.feature}</td><td>{v.vs_manual}</td><td>{v.vs_generic}</td></tr>)}</tbody>
            </table>
          </section>
        )}

        {/* ── 14. PRICING ── */}
        {vis("pricing") && (
          <section className="sp-section">
            <h2 className="sp-h2"><span className="sp-num">{nn()}</span>Proposed Pricing</h2>
            <div className="sp-price-row">
              {[
                { opt: "Option 1", name: "General Store Only", desc: "Consumable supplies", price: "SAR 12,000 – 18,000", per: "/year", items: ["General Store + Mobile", "Barcode Scanning", "Request Workflow", "Store Reports"] },
                { opt: "Option 2", name: "IT Store + Inventory", desc: "IT supplies + IT assets", price: "SAR 15,000 – 25,000", per: "/year", items: ["IT Store + Mobile", "IT Asset Inventory", "Depreciation Tracking", "Maintenance Scheduling"] },
                { opt: "Option 3", name: "Complete Package", desc: "All 4 modules, full features", price: "SAR 28,000 – 42,000", per: "/year/school", items: ["All 4 Store Modules", "Fixed Asset Tracking", "AI Image Search", "Full Barcode Scanning", "All Reports + Export", "Priority Support"], featured: true },
              ].map((p) => (
                <div key={p.opt} className={cn("sp-price-card", p.featured && "sp-price-featured")}>
                  {p.featured && <div className="sp-price-rec">RECOMMENDED</div>}
                  <div className="sp-price-opt">{p.opt}</div>
                  <div className="sp-price-name">{p.name}</div>
                  <div className="sp-price-desc">{p.desc}</div>
                  <div className="sp-price-amount">{p.price}</div>
                  <div className="sp-price-per">{p.per}</div>
                  <div className="sp-price-list">
                    {p.items.map((it) => <div key={it}>✓ {it}</div>)}
                  </div>
                </div>
              ))}
            </div>
            <div className="sp-box" style={{ marginTop: 16 }}>
              <div className="sp-box-title">Alternative: One-Time License</div>
              <table className="sp-tbl sp-tbl-compact">
                <thead><tr><th>Item</th><th style={{ textAlign: "center" }}>Cost (SAR)</th></tr></thead>
                <tbody>
                  <tr><td className="sp-bold">One-Time License Fee</td><td className="sp-mono sp-center">50,000 – 80,000</td></tr>
                  <tr><td className="sp-bold">Annual Support &amp; Updates</td><td className="sp-mono sp-center">8,000 – 15,000</td></tr>
                  <tr><td className="sp-bold">Setup &amp; Training</td><td className="sp-mono sp-center">5,000 – 10,000</td></tr>
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ── 15. SUMMARY ── */}
        {vis("summary") && (
          <section className="sp-section">
            <div className="sp-summary">
              <div className="sp-summary-title">Executive Summary</div>
              <div className="sp-summary-stats">
                {[["Development Value", "SAR 140,000 – 210,000"], ["Annual Infrastructure", "SAR 750 – 2,250"], ["Proposed Annual License", "SAR 28,000 – 42,000"]].map(([l, v]) => (
                  <div key={l} className="sp-summary-stat">
                    <div className="sp-summary-label">{l}</div>
                    <div className="sp-summary-val">{v}</div>
                  </div>
                ))}
              </div>
              <div className="sp-summary-checks">
                {["4 Integrated Modules", "11 Mobile Screens", "7 Barcode Formats", "AI Vision Search",
                  "6 User Roles", "Fixed Asset Tracking", "Bilingual AR/EN", "Multi-Branch", "Live & Operational"].map((f) => (
                  <span key={f} className="sp-summary-check">✓ {f}</span>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ── FOOTER ── */}
        <div className="sp-doc-footer">
          <div className="sp-doc-footer-line" />
          <div className="sp-doc-footer-row">
            <span>KIS Store, Inventory & Asset Management System — Confidential</span>
            <span>April 13, 2026</span>
          </div>
        </div>
      </div>

      {/* ═══ SCREEN BOTTOM BUTTON ═══ */}
      <div className="flex justify-center mt-8 mb-16 no-print">
        <Button onClick={() => setShowDialog(true)} size="lg" className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold shadow-lg">
          <Printer className="mr-2 h-4 w-4" />Print / Save as PDF
        </Button>
      </div>
    </>
  );
}
