# KIS Store & Inventory Management System
# Management Approval & Commercial Proposal

---

## Executive Summary

The **KIS Store & Inventory Management System** is a fully-built, production-ready **dual-platform solution** (web dashboard + native Android mobile app) for managing school inventory operations. It covers **three integrated modules** — General Store, IT Store, and IT Asset Inventory — with barcode scanning, AI-powered product identification, request/approval workflows, and comprehensive reporting.

The system is **already deployed and operational**, accessible at `sis-kis.web.app` (dashboard) and via the KIS mobile app (Android).

---

## System at a Glance

| Metric | Count |
|--------|-------|
| Dashboard Features | Inventory, Requests, Issue History, Reports (per store) |
| Mobile App Screens | **11** dedicated store screens |
| Backend API Endpoints | **4** store APIs + image search |
| User Roles | **5** store-related roles |
| Store Modules | **3** (General Store, IT Store, IT Inventory) |
| Item Categories | **6** (General) + **7** (IT Store) + **9** (IT Inventory) |
| Barcode Formats | **7** (QR, EAN-13, EAN-8, UPC-A, UPC-E, Code 128, Code 39) |
| Languages | **2** (Arabic & English) |
| School Branches | **2** (Boys' School, Girls' School) |

---

## Module 1: General Store

Manages all school consumable supplies — stationery, office supplies, cleaning materials, classroom resources, and furniture.

### Item Categories

| Category | ID Prefix | Examples |
|----------|-----------|---------|
| Stationery | GS-STN | Pens, pencils, markers, paper, notebooks |
| Office Supplies | GS-OFS | Staplers, tape, files, folders, organizers |
| Cleaning Supplies | GS-CLN | Detergent, cloths, brooms, mops, sanitizer |
| Classroom Materials | GS-CLS | Whiteboard markers, chalk, calculators, rulers |
| Furniture | GS-FRN | Desks, chairs, shelves, cabinets |
| Other | GS-OTH | Miscellaneous items |

### Item Data Fields

| Field | Description |
|-------|-------------|
| Item ID | Auto-generated (e.g., `GS-STN-0001`) |
| Name (EN/AR) | Bilingual item name |
| Category | One of 6 categories |
| Unit | pcs, box, roll, set, bottle, etc. |
| Quantity in Stock | Current available count |
| Reorder Level | Low-stock threshold (triggers alert) |
| Location | Physical storage location (shelf, room) |
| Branch | Boys' School / Girls' School |
| Barcode | UPC/EAN barcode (scannable) |
| Catalog Image | Auto-fetched from barcode lookup |
| Custom Photo | Uploaded by staff |
| Notes | Free text |

---

## Module 2: IT Store

Manages consumable IT supplies — toner, cables, peripherals, networking equipment, storage media, and components.

### Item Categories

| Category | ID Prefix | Examples |
|----------|-----------|---------|
| Toner & Ink | ITS-TNR | Printer toner cartridges, ink refills |
| Cables | ITS-CBL | HDMI, USB, Ethernet, power cables |
| Peripherals | ITS-PRP | Mouse, keyboard, headset, webcam |
| Storage Media | ITS-STG | USB drives, external HDDs, SD cards |
| Networking | ITS-NET | Switches, access points, patch panels |
| Components | ITS-CMP | RAM, SSD, power supplies, fans |
| Other | ITS-OTH | Miscellaneous IT items |

---

## Module 3: IT Inventory (Fixed Assets)

Tracks high-value IT equipment as fixed assets with depreciation calculations, assignment management, and maintenance scheduling.

### Asset Types

| Type | ID Prefix | Examples |
|------|-----------|---------|
| Laptop | KIS-LT | Staff/student laptops |
| Desktop | KIS-DT | Lab and office desktops |
| Printer | KIS-PR | Network/local printers |
| Projector | KIS-PJ | Classroom projectors |
| Tablet | KIS-TB | iPads, Android tablets |
| Phone | KIS-PH | Desk phones, mobile phones |
| Network Device | KIS-ND | Routers, switches, APs |
| Monitor | KIS-MN | Desktop monitors, TVs |
| Other | KIS-OT | Miscellaneous equipment |

### Asset Data Fields

| Field | Description |
|-------|-------------|
| Asset ID | Auto-generated (e.g., `KIS-LT-0001`) |
| Type, Brand, Model | Equipment identification |
| Serial Number | Unique serial (duplicate check enforced) |
| Purchase Date & Price (SAR) | Financial tracking |
| Warranty Expiry | Alert when warranty ends |
| Status | Active, Available, Maintenance, Retired, Lost |
| Condition | Excellent, Good, Fair, Poor |
| Assigned To | Current staff assignment |
| Location & Branch | Physical location |
| Useful Life (Years) | For depreciation calculation |
| Salvage Value (SAR) | End-of-life value |
| Maintenance Schedule | Next maintenance date + interval |

### Financial Calculations

| KPI | Calculation |
|-----|-------------|
| **Total Purchase Value** | Sum of all asset purchase prices |
| **Current Book Value** | Purchase price − accumulated depreciation |
| **Total Depreciation** | Purchase value − current book value |
| **Depreciation Method** | Straight-line: `(purchase_price − salvage_value) / useful_life_years` |

---

## Dashboard Features (Web)

### Inventory Management

| Feature | Description |
|---------|-------------|
| **KPI Dashboard** | Total items, total quantity, low stock count, out of stock, pending requests |
| **Category Breakdown** | Visual category chips showing item count per category |
| **Search & Filter** | Search by name, ID, barcode, Arabic name; filter by category and stock level |
| **Item Table** | Full inventory table with images, barcode, stock badges, edit/receive actions |
| **Add New Item** | Form with bilingual names, category, unit, location, barcode, images |
| **Edit Item** | Full edit dialog with dual image slots (catalog + custom photo) |
| **Receive Stock** | Receive incoming stock with quantity and notes; auto-updates stock level |
| **QR Label Printing** | Generate and print QR code labels for items |
| **Bulk CSV Import** | Upload items from CSV file |

### Request & Approval Workflow

| Feature | Description |
|---------|-------------|
| **New Request** | Multi-item request with staff picker and cart system |
| **Status Tracking** | Pending → Approved/Partially Approved/Rejected → Issued |
| **Review Dialog** | Per-item quantity approval (approve full, reduce, or reject individual items) |
| **Issue Items** | Batch stock deduction when approved request is issued |
| **Request History** | Filterable log of all requests with status |

### Issue History & Transactions

| Feature | Description |
|---------|-------------|
| **Transaction Log** | Complete history of all receive and issue operations |
| **Type Filter** | Filter by received / issued / all |
| **CSV Export** | Export transaction data for external reporting |

### IT Inventory Dashboard (11 KPIs)

| KPI Card | Description |
|----------|-------------|
| Total Assets | Count of all registered assets |
| In Use | Assets currently assigned to staff |
| Available | Assets ready for assignment |
| In Maintenance | Assets under repair |
| Retired | Decommissioned assets |
| Lost | Missing/unaccounted assets |
| Warranty Expiring | Assets with warranty ending within 90 days |
| Total Purchase Value | Sum of all purchase prices (SAR) |
| Current Book Value | Depreciated value of all assets (SAR) |
| Total Depreciation | Accumulated depreciation (SAR) |
| Maintenance Due | Assets with maintenance due within 14 days |

### IT Inventory Actions

| Action | Description |
|--------|-------------|
| Add Asset | Register new asset with serial number duplicate check |
| Edit Asset | Update any field |
| Assign to Staff | Assign equipment to a staff member (validates against staff directory) |
| Return from Staff | Return with condition assessment |
| Change Status | Active / Available / Maintenance / Retired / Lost |
| Schedule Maintenance | Set next maintenance date and recurring interval |
| Complete Maintenance | Mark done; auto-schedules next if interval exists |
| CSV Import | Bulk import assets from CSV |

### Store Reports (Cross-Store Analytics)

| Feature | Description |
|---------|-------------|
| **Store Selector** | View reports for General Store, IT Store, or both combined |
| **Date Range Filter** | Custom date range for all analytics |
| **Overview Tab** | Total items, units, issued/received quantities, low/out-of-stock |
| **Monthly Consumption** | Trend chart showing monthly issue/receive patterns |
| **Procurement/Reorder** | Auto-generated reorder suggestions based on stock levels |
| **Professional Print** | Branded print layout with KIS school header |
| **CSV Export** | Download transaction data |

---

## Mobile App Features (Android)

### Store Home Screen
- **Store Switcher** — Toggle between General Store and IT Store
- **5 KPI Cards** — Total Items, Total Quantity, Low Stock, Out of Stock, Pending Requests
- **6 Quick Actions** — Scan Item, Quick Issue, Inventory, Requests, Image Search, New Request

### Barcode Scanner
| Feature | Description |
|---------|-------------|
| **Camera Scanning** | Real-time barcode detection using device camera |
| **7 Barcode Formats** | QR, EAN-13, EAN-8, UPC-A, UPC-E, Code 128, Code 39 |
| **Double-Read Verification** | Requires 2 consecutive reads to prevent misscans |
| **Torch/Flash** | Toggle flashlight for low-light scanning |
| **Manual Entry** | Type barcode number if scanning is difficult |
| **Auto-Normalization** | Handles UPC-A ↔ EAN-13 leading zero differences |
| **Cross-Store Search** | Searches both stores if user has dual access |
| **Not Found → Add** | Offers "Add New Item" when barcode isn't in inventory |
| **Quick-Issue Mode** | Scans directly into issue flow from Quick Issue screen |

### Quick Issue (Fast Dispensing)
| Feature | Description |
|---------|-------------|
| **Search or Scan** | Find items by name/ID/barcode text search or camera scan |
| **Item Preview** | Shows item details, image, stock level before issuing |
| **Quantity Selector** | +/− buttons with stock validation (prevents over-issue) |
| **Staff Autocomplete** | Recipient field with live suggestions from staff directory |
| **Notes** | Optional notes for purpose/department |
| **Instant Processing** | Creates transaction + decrements stock in a single batch |

### Inventory Browser
| Feature | Description |
|---------|-------------|
| **Store Switcher** | Toggle General / IT store |
| **Search** | Search by name, item ID, or barcode |
| **Category Filter** | Horizontal filter chips for category selection |
| **Item Cards** | Thumbnails, stock badges (Out of Stock / Low Stock / quantity) |
| **Scan FAB** | Floating action button to launch barcode scanner |

### Request Management (Mobile)
| Feature | Description |
|---------|-------------|
| **Status Tabs** | Pending, Approved, Issued, All |
| **Request Cards** | Expandable cards showing line items with quantities |
| **Approve/Reject** | Manager actions on pending requests |
| **Issue Items** | Issue approved requests from mobile |
| **New Request** | Cart-based multi-item request submission |

### New Request (Cart UI)
| Feature | Description |
|---------|-------------|
| **Item Browser** | Search + category chips to find items |
| **Add to Cart** | Tap to add items to request cart |
| **Cart Modal** | Adjust quantities, remove items, add notes |
| **Submit** | Creates pending request for manager approval |

### AI Image Search (Gemini Vision)
| Feature | Description |
|---------|-------------|
| **Camera/Gallery** | Take photo or select from gallery |
| **AI Analysis** | Google Gemini 2.0 Flash Vision identifies the product |
| **Keyword Extraction** | AI generates keywords + description from image |
| **Inventory Matching** | Matches keywords against inventory names/categories |
| **Result Ranking** | Top 10 matches with relevance scores |
| **Direct Navigation** | Tap result to go to item detail |

### Item Detail
| Feature | Description |
|---------|-------------|
| **Full Info** | Image(s), item ID, barcode, category, unit, location |
| **Stock Level Bar** | Visual color-coded stock indicator (red/yellow/green) |
| **Receive Stock** | Modal with quantity + notes |
| **Transaction History** | Last 10 transactions for this item |
| **Edit Mode** | Full form with bilingual names, barcode field |
| **Barcode Lookup** | Queries UPCitemdb + Open Food Facts; auto-fills name/description/image |
| **Photo Options** | Take photo, pick from gallery, Google Image Search |
| **Create New** | Auto-pre-fills barcode when coming from "not found" scan |

---

## Role-Based Access Control

### Mobile App Roles

| Role | General Store | IT Store | IT Inventory |
|------|:------------:|:--------:|:------------:|
| Store Clerk | ✅ | — | — |
| IT Manager | — | ✅ | ✅ |
| IT Admin | — | ✅ | ✅ |
| Admin | ✅ | ✅ | ✅ |
| Super Admin | ✅ | ✅ | ✅ |

### Dashboard Permissions

| Permission | Store Clerk | IT Admin | IT Manager | Admin |
|-----------|:-----------:|:--------:|:----------:|:-----:|
| `general_store.view` | ✅ | — | — | ✅ |
| `general_store.manage` | ✅ | — | — | ✅ |
| `general_store.request` | ✅ | — | — | ✅ |
| `it_store.view` | — | ✅ | ✅ | ✅ |
| `it_store.manage` | — | ✅ | ✅ | ✅ |
| `it_store.request` | — | ✅ | — | ✅ |
| `inventory.view` | — | ✅ | ✅ | ✅ |
| `inventory.manage` | — | ✅ | ✅ | ✅ |
| `store_reports.view` | ✅ | ✅ | ✅ | ✅ |

---

## Transaction Types & Audit Trail

| Transaction | ID Format | Trigger |
|-------------|-----------|---------|
| Stock Received | `GS-RCV-{timestamp}` | Manual receive on item |
| Formal Issue | `GS-ISS-{timestamp}` | Issuing approved request |
| Quick Issue | `GS-QIS-{timestamp}` | Direct issue from Quick Issue screen |

> All transactions are logged with: who performed it, when, quantity, item, recipient, and notes.

---

## Data Architecture

### Firestore Collections

| Module | Items | Requests | Transactions |
|--------|-------|----------|-------------|
| General Store | `gs_items` | `gs_requests` | `gs_transactions` |
| IT Store | `its_items` | `its_requests` | `its_transactions` |
| IT Inventory | `it_assets` | — | `it_asset_history` |

### Request Workflow States

```
New Request → Pending → Approved / Partially Approved / Rejected → Issued
                ↓
            Cancelled
```

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Dashboard | Next.js 15, React 19, TypeScript, Tailwind CSS, shadcn UI |
| Mobile App | React Native, Expo 55, expo-camera (barcode) |
| Backend APIs | Next.js API Routes, Firebase Admin SDK |
| Database | Google Firestore (real-time, cloud-hosted) |
| AI Vision | Google Gemini 2.0 Flash (image identification) |
| Image Storage | Firebase Cloud Storage |
| Barcode API | UPCitemdb, Open Food Facts |
| Authentication | Firebase Auth + RBAC |
| Hosting | Firebase Hosting + Cloud Run |

---

## Cost Analysis

### A. Development Cost (Already Built)

| Component | Est. Hours | Rate (USD/hr) | Value (USD) |
|-----------|-----------|---------------|-------------|
| Dashboard Store UI (General + IT + Reports) | 150–200 hrs | $50–$80 | $7,500–$16,000 |
| IT Inventory Dashboard (11 KPIs, depreciation) | 80–120 hrs | $50–$80 | $4,000–$9,600 |
| Mobile App (11 screens, scanning, AI search) | 200–280 hrs | $50–$80 | $10,000–$22,400 |
| Backend APIs (4 endpoints + logic) | 60–80 hrs | $50–$80 | $3,000–$6,400 |
| Barcode System (scanner, lookup, normalization) | 40–60 hrs | $50–$80 | $2,000–$4,800 |
| AI Image Search (Gemini Vision integration) | 30–40 hrs | $50–$80 | $1,500–$3,200 |
| Request/Approval Workflow | 60–80 hrs | $50–$80 | $3,000–$6,400 |
| RBAC & Security (5 roles, 9 permissions) | 20–30 hrs | $50–$80 | $1,000–$2,400 |
| Testing & QA | 40–60 hrs | $50–$80 | $2,000–$4,800 |
| **TOTAL** | **680–950 hrs** | | **$34,000–$76,000** |

> **Conservative market value: $35,000–$50,000 USD (SAR 130,000–190,000)**

### B. Ongoing Cost (Annual)

| Service | Annual (USD) | Annual (SAR) |
|---------|-------------|-------------|
| Firebase (Firestore + Storage + Auth) | $120–$360 | 450–1,350 |
| Cloud Run (SSR) | $60–$180 | 225–675 |
| Gemini AI API (image search) | $24–$60 | 90–225 |
| **TOTAL** | **$200–$600** | **SAR 750–2,250** |

### C. Comparable Products

| Product | Annual Cost | Notes |
|---------|------------|-------|
| EZOfficeInventory | $3,600–$12,000 | No school integration, no barcode mobile app |
| Asset Panda | $4,200–$18,000 | Asset tracking only, no request workflow |
| Sortly Pro | $1,200–$6,000 | Consumer-grade, no RBAC, no IT depreciation |
| UpKeep | $5,400–$24,000 | Maintenance-focused, no school context |
| Custom Development | $30,000–$80,000 | One-time + $10K/yr maintenance |
| **KIS Store System** | **See below** | **3 stores + mobile scanning + AI + RBAC + school-integrated** |

---

## Proposed Pricing

### Option 1: Standalone Store Module License

| Item | Price (SAR) | Price (USD) |
|------|-------------|-------------|
| One-Time License | 50,000–80,000 | $13,000–$21,000 |
| Annual Support & Updates | 8,000–15,000 | $2,100–$4,000 |
| Setup & Training | 5,000–10,000 | $1,300–$2,700 |

### Option 2: Annual SaaS Subscription (Per School)

| Plan | Annual (SAR) | Annual (USD) | Includes |
|------|-------------|-------------|----------|
| **General Store Only** | 12,000–18,000 | $3,200–$4,800 | General Store + Mobile + Reports |
| **IT Store + Inventory** | 15,000–25,000 | $4,000–$6,700 | IT Store + IT Inventory + Depreciation + Mobile |
| **Complete Package** | 22,000–35,000 | $5,900–$9,300 | All 3 modules + AI Image Search + Barcode Scanning |

### Option 3: As Part of Full SiS Platform

The store modules are included at no additional cost with the full SiS platform license (SAR 60,000–150,000/year), adding significant value to the overall package.

---

## Key Value Propositions

| Feature | vs. Manual/Spreadsheet | vs. Generic Inventory Software |
|---------|----------------------|-------------------------------|
| **Mobile Barcode Scanning** | Eliminates manual counting | Most require separate scanners |
| **AI Product Identification** | N/A | Not available in any competitor |
| **Request/Approval Workflow** | No accountability | Most charge extra for workflows |
| **IT Asset Depreciation** | Impossible manually | Rarely included in school systems |
| **Dual-Platform (Web + Mobile)** | Desktop only | Usually web-only |
| **Arabic/English Bilingual** | Manual translation | Not available in western products |
| **Multi-Store (GS + IT)** | Separate spreadsheets | Separate licenses required |
| **School-Integrated** | Isolated data | No integration with SIS data |
| **Staff Autocomplete** | Manual entry | No staff directory link |
| **Real-Time Stock Alerts** | Discover too late | Basic email alerts only |

---

## Summary

The KIS Store & Inventory Management System provides:

- **3 integrated modules** — General Store, IT Store, IT Inventory
- **11 mobile screens** with barcode scanning, AI image search, and quick issue
- **Full request/approval workflow** — from request to issue with audit trail
- **IT asset tracking** with depreciation, maintenance scheduling, and assignment management
- **Cross-store reporting** with charts, reorder analysis, and professional print
- **5 user roles** with granular permissions per store
- **7 barcode formats** with camera scanning + manual fallback
- **AI-powered product identification** using Google Gemini Vision
- **Bilingual** Arabic & English with dual-name item support
- **Multi-branch** — Boys' and Girls' schools

**Total development value: SAR 130,000–190,000**
**Annual infrastructure cost: SAR 750–2,250**
**Proposed annual license: SAR 22,000–35,000/school**

---

*Document prepared: April 13, 2026*
*System Status: Production — Live and operational*
