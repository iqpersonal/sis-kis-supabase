# KIS Student Information System (SiS)
# Management Approval & Commercial Proposal

---

## Executive Summary

The **KIS Student Information System (SiS)** is a fully-built, production-ready **school management platform** that digitizes and unifies the entire student lifecycle — from enrollment to graduation — across multiple school branches. It replaces fragmented manual processes with a single integrated system covering academics, finance, attendance, communications, inventory, and AI-powered analytics.

The system is **already deployed and operational**, not a concept or prototype. It consists of:
- A **web-based admin dashboard** for school administrators, teachers, and staff
- A **native Android mobile app** for parents, students, and store staff
- A **WhatsApp chatbot** for parent self-service
- An **automated data pipeline** syncing data from the existing SQL Server SIS

---

## Platform at a Glance

| Metric | Count |
|--------|-------|
| Admin Dashboard Pages | **43** |
| Backend API Endpoints | **68** |
| Mobile App Screens | **33** |
| Web Portal Pages (Teacher/Parent/Student) | **18** |
| User Roles with RBAC | **14** |
| Granular Permissions | **46** |
| Firestore Database Collections | **20+** |
| Data Pipeline Scripts | **160** |
| Languages Supported | **2** (Arabic & English) |
| School Branches Supported | **2+** (scalable) |

---

## Module Breakdown & Feature Inventory

### 1. Academic Management
| Feature | Description |
|---------|-------------|
| Student Records & Profiles | Comprehensive student search, individual profiles, full academic/financial history |
| Grade Management | Term-by-term grades (Assessment, Exam, Semester, Annual), subject analytics |
| Honor Roll | Automated identification and ranking of top-performing students |
| At-Risk Early Warning | AI-flagged students with declining grades or attendance |
| Subject Trends | Cross-year subject performance analysis |
| Year-over-Year Comparison | Side-by-side academic year statistics |
| Progress Tracking | Multi-year student progress with visual charts |
| Transcript Management | Configurable transcript settings, multi-language output |

### 2. Assessment & Quiz Engine
| Feature | Description |
|---------|-------------|
| Quiz Creation | Teachers create quizzes with adaptive difficulty levels |
| Multi-Format Questions | Multiple choice, competency-based evaluation |
| Session-Based Testing | Timed assessments with real-time tracking |
| Auto-Grading | Instant feedback and mastery scoring |
| Quiz Reports | Detailed analytics per quiz, per student, per class |
| Student Portal Quizzes | Students take assigned quizzes from their portal |

### 3. Attendance
| Feature | Description |
|---------|-------------|
| Daily Attendance | Bulk and per-class attendance management |
| Absence/Tardy Tracking | Records with reason codes and history |
| Attendance Analytics | Trend visualization, percentage calculations |
| Teacher Attendance | Teachers record attendance directly from their portal |
| Parent View | Real-time attendance visible to parents on mobile |

### 4. Finance
| Feature | Description |
|---------|-------------|
| Fee Management | Fee collection, invoicing, payment tracking |
| Installment Plans | Manage split-payment arrangements |
| Auto Balance Calculation | Real-time outstanding amounts |
| Delinquency Tracking | Overdue account identification and follow-up |
| Fee Reports | Financial analytics with export options |
| Parent Fee View | Parents see balances directly on mobile |

### 5. Book Sales (Point-of-Sale)
| Feature | Description |
|---------|-------------|
| Book Catalog | Grade-based book lists and management |
| Grade Bundles | Pre-configured book bundles per grade |
| POS Interface | Student search, item selection, payment recording |
| Payment Methods | Cash and bank transfer support |
| Receipt Generation | Branded PDF receipts |
| Sales Reports | Revenue KPIs, daily stats, CSV export |

### 6. Inventory & Store Management
| Feature | Description |
|---------|-------------|
| General Store | School supplies inventory, stock tracking, reorder alerts |
| IT Store | IT equipment with asset tracking and depreciation |
| IT Inventory | Full equipment registry with maintenance logs |
| Barcode Scanning | Mobile barcode/QR scanner for item lookup |
| Product Image Search | Web-based product image identification |
| Quick Issue | Fast item dispensing with staff autocomplete |
| Store Requests | Formal request and approval workflow |
| Store Reports | Cross-store analytics, usage trends |
| Library | Book catalog, checkout/return tracking |

### 7. Communications
| Feature | Description |
|---------|-------------|
| WhatsApp Business API | Template messaging to parents via Gupshup |
| Audience Targeting | Filter by school, class, section, or individual |
| Delivery Tracking | Real-time sent/delivered/failed status |
| WhatsApp Chatbot | Parents query grades, fees, attendance via WhatsApp |
| Contact Update Campaign | WhatsApp-based parent contact update with OTP verification |
| Internal Notifications | System notifications for staff |
| Push Notifications | Mobile push alerts for parents |
| Internal Messaging | Staff communication within the platform |

### 8. AI & Analytics (Google Gemini)
| Feature | Description |
|---------|-------------|
| AI Insights Dashboard | AI-powered academic performance analysis |
| Pattern Detection | Subject performance pattern identification |
| At-Risk Recommendations | AI-generated intervention suggestions |
| Trend Forecasting | Academic trend prediction |
| KPI Dashboard | Visual charts and metrics for all data |
| Custom Reports | PDF and CSV export with configurable parameters |

### 9. Document & Reporting
| Feature | Description |
|---------|-------------|
| Report Cards | Semester and annual report cards in English & Arabic |
| Transcripts | Student transcripts with configurable layouts |
| Diploma Generation | Bulk diploma creation with branded templates |
| PDF Reports | Custom PDF generation for any data set |
| Bulk CSV Export | Mass data export for external analysis |
| Document Expiry | Certificate/document expiration tracking with alerts |
| Audit Log | Complete audit trail of all admin operations |

### 10. Administration
| Feature | Description |
|---------|-------------|
| User Management | Create/edit admin users with role assignment |
| 14-Role RBAC | Granular role-based access control |
| Class Assignment | Assign teachers/coordinators to specific classes |
| Bulk User Upload | CSV-based bulk user creation |
| Multi-School | Per-branch filtering across all screens |
| Academic Year | Multi-year data with year switching |
| Data Upload | SQL Server backup upload and sync |

---

## Portal Summary

| Portal | Platform | Users | Key Features |
|--------|----------|-------|-------------|
| **Admin Dashboard** | Web | Admins, Coordinators, Finance, Registrar | Full system management (43 pages) |
| **Teacher Portal** | Web | Teachers | Attendance, grades, quizzes, progress reports (10 pages) |
| **Parent Portal** | Web + Mobile | Parents | Grades, attendance, fees, reports, library, push notifications |
| **Student Portal** | Web + Mobile | Students | Grades, attendance, quizzes, classmate browser |
| **Store Portal** | Mobile | Store Clerks, IT Managers | Inventory, scanning, quick issue, requests |

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Dashboard | Next.js 15, React 19, TypeScript, Tailwind CSS, shadcn UI |
| Mobile App | React Native, Expo 55, expo-router (Android) |
| Backend | Next.js API Routes (68 endpoints), Firebase Admin SDK |
| Database | Google Firestore (cloud) + SQL Server (source) |
| Authentication | Firebase Auth + Role-Based Access Control |
| AI Engine | Google Gemini AI API |
| WhatsApp | Gupshup WhatsApp Business API |
| PDF Engine | jsPDF with auto-table |
| Hosting | Firebase Hosting + Cloud Run (SSR) |
| Mobile Build | Android APK (native ARM64) |

---

## Cost Analysis

### A. Development Cost (Already Invested)

Based on industry rates for equivalent custom software development:

| Component | Est. Development Hours | Rate (USD/hr) | Cost (USD) |
|-----------|----------------------|---------------|------------|
| Admin Dashboard (43 pages, 68 APIs) | 800–1,000 hrs | $50–$80 | $40,000–$80,000 |
| Mobile App (33 screens, 3 portals) | 400–550 hrs | $50–$80 | $20,000–$44,000 |
| Data Pipeline (160 scripts, SQL→Firestore) | 200–300 hrs | $50–$80 | $10,000–$24,000 |
| WhatsApp Integration & Chatbot | 80–120 hrs | $50–$80 | $4,000–$9,600 |
| AI Analytics (Gemini integration) | 60–100 hrs | $50–$80 | $3,000–$8,000 |
| Quiz/Assessment Engine | 80–120 hrs | $50–$80 | $4,000–$9,600 |
| Book Sales POS | 60–80 hrs | $50–$80 | $3,000–$6,400 |
| Inventory/Store System | 100–150 hrs | $50–$80 | $5,000–$12,000 |
| RBAC & Security (14 roles, 46 perms) | 60–80 hrs | $50–$80 | $3,000–$6,400 |
| Testing, QA, Deployment | 200–300 hrs | $50–$80 | $10,000–$24,000 |
| **TOTAL DEVELOPMENT** | **2,040–2,800 hrs** | | **$102,000–$224,000** |

> **Conservative market value: $100,000–$150,000 USD**
> **Mid-range market value: $150,000–$225,000 USD**

### B. Ongoing Infrastructure Cost (Annual)

| Service | Monthly (USD) | Annual (USD) |
|---------|--------------|-------------|
| Firebase Blaze Plan (Firestore, Hosting, Auth, Storage) | $25–$80 | $300–$960 |
| Cloud Run SSR Function | $10–$30 | $120–$360 |
| Gupshup WhatsApp API (messaging) | $20–$50 | $240–$600 |
| Google Gemini AI API | $5–$20 | $60–$240 |
| Domain & SSL | $2 | $24 |
| **TOTAL INFRASTRUCTURE** | **$62–$182** | **$744–$2,184** |

> Infrastructure cost is **extremely low** due to Firebase's pay-as-you-go model and efficient caching.

### C. Comparable Market Products

| Product | Annual Cost | Notes |
|---------|------------|-------|
| PowerSchool | $8,000–$25,000/school | Limited to academics only |
| Infinite Campus | $10,000–$30,000/school | No WhatsApp, no POS, no AI |
| SchoolMint | $5,000–$15,000/school | Enrollment focused only |
| Gradelink | $3,000–$8,000/school | Basic grade & attendance |
| Custom SIS (outsourced) | $100,000–$300,000 | One-time, plus $20K+/yr maintenance |
| **KIS SiS (this system)** | **See pricing below** | **All-in-one: Academics + Finance + POS + Inventory + WhatsApp + AI + Mobile** |

---

## Proposed Pricing (Per School License)

### Option 1: One-Time License + Annual Support

| Item | Price (SAR) | Price (USD) |
|------|-------------|-------------|
| One-Time License Fee | 150,000–250,000 | $40,000–$67,000 |
| Annual Support & Updates | 25,000–40,000 | $6,700–$10,700 |
| Implementation & Training | 15,000–25,000 | $4,000–$6,700 |

### Option 2: Annual SaaS Subscription (Per School)

| Plan | Annual (SAR) | Annual (USD) | Includes |
|------|-------------|-------------|----------|
| **Standard** | 40,000–60,000 | $10,700–$16,000 | Dashboard + Mobile + Data Sync |
| **Professional** | 60,000–90,000 | $16,000–$24,000 | Standard + WhatsApp + AI + POS |
| **Enterprise** | 90,000–150,000 | $24,000–$40,000 | Professional + Custom Branding + Priority Support |

### Option 3: Per-Student Pricing

| Tier | Per Student/Year (SAR) | Per Student/Year (USD) |
|------|----------------------|----------------------|
| Up to 500 students | 120–180 | $32–$48 |
| 500–1,500 students | 80–120 | $21–$32 |
| 1,500+ students | 50–80 | $13–$21 |

> **Example:** A school with 1,000 students at SAR 100/student = **SAR 100,000/year** ($26,700)

---

## Competitive Advantages

| Advantage | Detail |
|-----------|--------|
| **All-in-One** | No need for 5+ separate systems — academics, finance, POS, inventory, communications all unified |
| **WhatsApp Native** | Direct parent communication via the #1 messaging app in the region |
| **AI-Powered** | Automated at-risk detection and academic insights — not available in most school systems |
| **Mobile-First** | Native Android app for parents, students, and store staff |
| **Arabic & English** | Full bilingual support with RTL — critical for Saudi/Gulf market |
| **Low Infrastructure Cost** | Firebase serverless = no server management, scales automatically |
| **SQL Server Compatible** | Integrates with existing SIS databases — no data migration needed |
| **14-Role RBAC** | Most granular access control in the market for school systems |
| **Barcode/QR Scanning** | Mobile inventory management with camera integration |
| **Rapid Deployment** | Can be deployed to a new school in 1–2 weeks |

---

## Implementation Timeline (New School)

| Phase | Duration | Activities |
|-------|----------|-----------|
| **Setup** | 1–2 days | Firebase project, DNS, hosting configuration |
| **Data Import** | 2–3 days | SQL Server backup integration, data pipeline setup |
| **Configuration** | 2–3 days | Roles, users, class assignments, school branding |
| **Testing** | 2–3 days | End-to-end testing, data verification |
| **Training** | 2–3 days | Admin, teacher, parent, and store staff training |
| **Go Live** | 1 day | Production cutover |
| **TOTAL** | **10–15 business days** | |

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Data Security | Firebase Auth, encrypted SecureStore, Firestore rules, audit logging |
| System Downtime | Firebase 99.95% SLA, serverless architecture, no server to maintain |
| Data Loss | Firestore automatic backups, SQL Server source remains intact |
| Scalability | Firebase auto-scales — no capacity planning needed |
| Vendor Lock-in | Standard tech stack (React, Node.js) — portable if needed |

---

## Approval Request

We request management approval to:

1. **Continue operating** the system for KIS at current infrastructure costs (~SAR 3,000–6,000/year)
2. **License the platform** to other schools in the region as an additional revenue stream
3. **Allocate budget** for ongoing enhancements and support (1 developer)

### Expected ROI

| Scenario | Year 1 Revenue | Year 2+ Revenue |
|----------|---------------|----------------|
| **1 school licensed** (SaaS) | SAR 60,000–90,000 | SAR 60,000–90,000 |
| **3 schools licensed** | SAR 180,000–270,000 | SAR 180,000–270,000 |
| **5 schools licensed** | SAR 300,000–450,000 | SAR 300,000–450,000 |
| **Internal cost** (KIS only) | Saves SAR 30,000–80,000/yr vs. commercial SIS | Ongoing savings |

> The platform pays for itself with **a single external school license**.

---

*Document prepared: April 13, 2026*
*System Status: Production — Live at sis-kis.web.app*
