# KIS Student Information System (SiS)
## Comprehensive School Management Platform

---

# Project Overview

**Khaled International Schools (KIS)** — A unified, multi-tier digital platform that manages the entire student lifecycle from enrollment to graduation, covering academics, finance, attendance, communications, and operations across multiple school branches.

**Platform Components:**
- **Admin Dashboard** — Web-based management console (Next.js)
- **Mobile App** — Native mobile experience for parents and staff (React Native / Expo)
- **Data Pipeline** — Automated sync from SIS SQL Server to cloud database (Python)
- **Cloud Infrastructure** — Firebase (Authentication, Firestore, Hosting, Storage)

---

# Technology Stack

| Layer | Technology |
|-------|-----------|
| **Dashboard Frontend** | Next.js 15, React 19, TypeScript, Tailwind CSS, shadcn UI |
| **Mobile App** | React Native, Expo, expo-router (Android & iOS) |
| **Backend** | Next.js API Routes, Firebase Admin SDK |
| **Database** | Google Firestore (cloud) + SQL Server (source) |
| **Authentication** | Firebase Auth with Role-Based Access Control |
| **AI & Analytics** | Google Gemini AI API, Recharts |
| **Communications** | WhatsApp Business API |
| **PDF Generation** | jsPDF with auto-table |
| **Deployment** | Firebase Hosting + Cloud Run SSR |

---

# User Roles & Access Control

The system supports **14 distinct user roles** with **34 granular permissions**, ensuring every user sees only what they need.

| Role | Primary Function |
|------|-----------------|
| **Super Admin** | Full system control — all features and settings |
| **IT Manager** | IT inventory, store management, staff directory |
| **Academic Director** | School-wide academic oversight (branch-scoped) |
| **Head of Section** | Departmental leadership (class-scoped) |
| **Subject Coordinator** | Subject-specific academic management |
| **Academic Coordinator** | Full academics, analytics, and AI insights |
| **Finance Officer** | Revenue management, fees, invoicing |
| **Accounts Department** | Finance monitoring, documents, analytics |
| **Registrar** | Student records, transfers, enrollment |
| **Teacher** | Attendance, assessments, quiz creation |
| **Viewer** | Read-only access to all data |
| **Bookshop** | Book catalog and sales management |
| **Store Clerk** | General store inventory and requests |
| **IT Admin** | IT infrastructure and equipment tracking |

**Scoped Access:** Roles can be scoped by school branch, class, or subject for fine-grained control.

---

# Dashboard Features — Academic Management

## Student Records & Profiles
- Comprehensive student search with advanced filtering
- Individual student profiles with full academic and financial history
- Multi-year progress tracking with subject-level detail

## Grade Management
- Term-by-term grade viewing (Assessment, Exam, Semester, Annual)
- Subject performance analytics per class and section
- Subject trend analysis across academic years
- Automatic grade computation from SIS Server

## Honor Roll & At-Risk Identification
- **Honor Roll** — Automatically identifies and ranks top-performing students
- **At-Risk Dashboard** — Early warning system flagging students with declining grades or attendance issues

## Assessments & Quizzes
- Quiz creation and management for teachers
- Adaptive difficulty levels
- Session-based tracking with timed assessments
- Multi-format questions with competency-based evaluation
- Real-time feedback and mastery scoring

---

# Dashboard Features — Attendance & Operations

## Attendance Tracking
- Bulk and daily attendance management per class
- Absence and tardy record tracking
- Attendance analytics with trend visualization

## Student Transfers
- Transfer documentation and workflow management
- Inter-branch transfer support

## Document Management
- Certificate and document expiry tracking
- Automated alerts for expiring documents

## Diploma Generation
- Diploma creation, customization, and bulk printing
- Branded templates with multi-language support

---

# Dashboard Features — Finance

## Fee Management
- Fee collection, invoicing, and payment tracking
- Installment plan management
- Automatic balance calculation
- Payment status monitoring

## Delinquency Tracking
- Outstanding balance identification and follow-up
- Overdue account reporting

## Book Sales (Point of Sale)
- Complete book catalog management by grade
- Grade-based book bundles
- Point-of-sale interface with student search
- Cash/bank transfer payment recording
- Branded receipt generation (PDF)
- Sales history with filtering and CSV export
- KPI dashboard: Total Sales, Revenue, Daily Stats

---

# Dashboard Features — Inventory & Stores

## General Store
- School supplies inventory management
- Stock tracking and reorder alerts
- Request and issue workflow

## IT Store & IT Inventory
- IT equipment inventory with asset tracking
- Barcode-based item management
- Depreciation tracking
- Equipment assignment and maintenance logs

## Library Management
- Library catalog and inventory
- Book checkout and return tracking

## Store Reports
- Inventory analytics across all store types
- Usage reports and trend tracking

---

# Dashboard Features — Communications

## WhatsApp Integration
- Template-based messaging via WhatsApp Business API
- Audience filtering: All parents, by school, by class, or individual
- Real-time delivery tracking (Sent, Delivered, Failed)
- Webhook support for incoming responses
- Contact update request campaigns

## Notifications & Messages
- System notification management
- Internal messaging between staff

---

# Dashboard Features — AI & Analytics

## AI Insights Dashboard
- AI-powered academic performance analysis (Google Gemini)
- Subject performance pattern detection
- At-risk student identification with recommendations
- Academic trend forecasting
- Rule-based fallback for deterministic insights

## Analytics & Reporting
- KPI metrics dashboard with visual charts
- Year-over-year academic comparisons
- Customizable reports with PDF export
- Bulk CSV/PDF export capability

## Report Card & Transcript Generation
- Semester and annual report cards
- Student transcripts with configurable settings
- Multi-language output (English & Arabic)
- Custom branding with school logo and headers

---

# Mobile App — Parent Portal

A dedicated mobile experience giving parents real-time access to their children's information.

## Features
- **Dashboard** — Overview of all children with key stats
- **Child Selector** — Switch between multiple children
- **Grades** — View grades by year and term
- **Attendance** — Real-time attendance records
- **Fee Balance** — Payment status and outstanding amounts
- **Academic Reports** — Download and view report cards
- **Notifications** — Push notifications for important updates

---

# Mobile App — Student Portal

Students can access their own academic information and engage with learning.

## Features
- **Home Screen** — Personal academic overview
- **Classmate Browser** — View classmates
- **Quizzes** — Take assigned quizzes with adaptive difficulty
- **Notifications** — Receive school updates
- **Subject Details** — Detailed subject information

---

# Mobile App — Store Clerk Portal

Dedicated interface for inventory staff with mobile scanning capabilities.

## Features
- **Inventory Management** — View and manage stock
- **Barcode Scanning** — Scan items for quick lookup and processing
- **Product Image Search** — Barcode + web search for product identification
- **Quick Issue Workflow** — Fast item dispensing
- **Store Requests** — Track and fulfill requests
- **Item Detail Views** — Full product information

---

# Data Architecture

## Cloud Database (Google Firestore)
- **20+ collections** synced from SQL Server source
- Core data: Students, Registrations, Grades, Attendance, Finance
- Generated data: Student Progress (multi-year history), Family credentials
- Operational data: Audit logs, Book sales, IT inventory, Library

## Data Pipeline (Automated Sync)
1. **Extract** — Restore SQL Server backup, query all tables
2. **Transform** — Convert to JSON-safe format
3. **Load** — Batch upload to Firestore (400 records/batch)
4. **Enrich** — Generate student progress profiles, family records
5. **Resume** — Automatic resume on interruption with progress tracking

## Multi-School Support
- Two branches: School 0021-01 and School 0021-02
- Per-school filtering on all dashboard screens
- Unified reporting across branches

---

# Security & Compliance

## Authentication
- Firebase Authentication for all users
- Separate login flows: Admin, Teacher, Parent, Student
- Secure token storage on mobile (Expo Secure Store)
- WhatsApp OTP verification for parent contact updates

## Access Control
- Role-Based Access Control (RBAC) with 14 roles and 34 permissions
- Scoped access by school branch, class, and subject
- Middleware-enforced route protection

## Audit Trail
- Comprehensive audit logging for all admin operations
- Contact update audit with old → new value tracking
- Financial transaction logging

---

# Internationalization

## Bilingual Support
- Full **Arabic** and **English** language support
- RTL (Right-to-Left) layout for Arabic
- Language toggle available on all screens
- All student data stored in dual fields (Arabic + English)
- Reports generated in both languages

---

# Key Statistics

| Metric | Count |
|--------|-------|
| **Dashboard Modules** | 39 |
| **Mobile App Screens** | 12+ |
| **Backend API Endpoints** | 32 |
| **User Roles** | 14 |
| **Permissions** | 34 |
| **Firestore Collections** | 20+ |
| **Languages Supported** | 2 (Arabic, English) |
| **School Branches** | 2 |

---

# Upcoming Features

## Parent Contact Update via WhatsApp
- Admin sends WhatsApp message with tokenized link
- Parent verifies identity via WhatsApp OTP (zero cost)
- Self-service form to update 11 contact fields
- Immediate database update with full audit trail
- No login required — lightweight mobile-first UX

---

# Summary

**KIS SiS** is a **comprehensive, unified school management platform** that covers the entire student lifecycle — from enrollment to graduation — with integrated academic tracking, financial management, inventory control, parent communications, and AI-powered analytics.

**Key Differentiators:**
- **All-in-one platform** — No need for separate systems for grades, fees, attendance, communications
- **AI-powered insights** — Automatic identification of at-risk students and performance trends
- **WhatsApp integration** — Direct communication channel with parents
- **Mobile-first parent experience** — Real-time access to grades, fees, and attendance
- **Multi-language** — Full Arabic and English bilingual support
- **14-role RBAC** — Granular access control for every staff function
- **Automated data pipeline** — Seamless sync from SIS SQL Server to cloud
- **Book sales POS** — Integrated point-of-sale for school bookshop
- **Inventory management** — General store, IT assets, and library tracking
