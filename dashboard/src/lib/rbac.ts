/* ─── Role-Based Access Control (RBAC) ──────────────────────────── */

/**
 * Defines roles, permissions, and route-permission mapping for the
 * admin dashboard. Each role gets a set of permissions;
 * each dashboard route requires a specific permission.
 */

export const ROLES = {
  super_admin: "Super Admin",
  school_admin: "School Admin",
  it_manager: "IT Manager",
  academic_director: "Academic Director",
  head_of_section: "Head of Section",
  subject_coordinator: "Subject Coordinator",
  academic: "Academic Coordinator",
  finance: "Finance Officer",
  accounts: "Accounts Department",
  registrar: "Registrar",
  teacher: "Teacher",
  viewer: "Viewer",
  bookshop: "Bookshop",
  store_clerk: "Store Clerk",
  it_admin: "IT Admin",
} as const;

export type Role = keyof typeof ROLES;

/* ── Permissions ─────────────────────────────────────────────────── */

export const PERMISSIONS = [
  // Dashboard
  "dashboard.view",
  // Students
  "students.view",
  "students.edit",
  "students.profile",
  // Academics
  "academics.view",
  "subjects.view",
  "assessments.view",
  "progress.view",
  "terms.view",
  "subject_trends.view",
  "honor_roll.view",
  "at_risk.view",
  // Attendance
  "attendance.view",
  "attendance.edit",
  // Finance
  "fees.view",
  "fees.edit",
  "delinquency.view",
  // Documents
  "documents.view",
  // Library
  "library.view",
  // Notifications
  "notifications.view",
  // Analytics
  "analytics.view",
  "year_comparison.view",
  // AI Insights
  "ai_insights.view",
  // Transfers
  "transfers.view",
  "transfers.edit",
  // Export / Upload
  "bulk_export.view",
  "upload.view",
  // Settings
  "transcript_settings.view",
  "transcript_settings.edit",
  // Staff & IT Inventory
  "staff.view",
  "inventory.view",
  "inventory.manage",
  // Book Sales
  "book_sales.view",
  "book_sales.manage",
  // Certificates
  "certificates.print",
  // Quizzes
  "quizzes.view",
  "quizzes.manage",
  // Stores
  "general_store.view",
  "general_store.manage",
  "general_store.request",
  "it_store.view",
  "it_store.manage",
  "it_store.request",
  "store_reports.view",
  // Announcements & IT Tickets
  "announcements.manage",
  "tickets.manage",
  // Admin
  "admin.users",
  "admin.audit_log",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/* ── Role → Permission mapping ──────────────────────────────────── */

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  super_admin: PERMISSIONS, // all permissions

  // School Admin: full operational access minus user management & audit log
  school_admin: PERMISSIONS.filter(
    (p) => p !== "admin.users" && p !== "admin.audit_log"
  ),

  // IT Manager: IT store, inventory, tickets — no students or academics
  it_manager: [
    "dashboard.view",
    "staff.view",
    "inventory.view",
    "inventory.manage",
    "it_store.view",
    "it_store.manage",
    "it_store.request",
    "store_reports.view",
    "announcements.manage",
    "tickets.manage",
  ],

  // Academic Director: view-only, scoped to assigned major (school branch)
  academic_director: [
    "dashboard.view",
    "students.view",
    "students.profile",
    "academics.view",
    "subjects.view",
    "assessments.view",
    "progress.view",
    "terms.view",
    "subject_trends.view",
    "honor_roll.view",
    "at_risk.view",
    "attendance.view",
    "documents.view",
    "library.view",
    "analytics.view",
    "quizzes.view",
  ],

  // Head of Section: view-only, scoped to assigned major + supervised classes
  head_of_section: [
    "dashboard.view",
    "students.view",
    "students.profile",
    "academics.view",
    "subjects.view",
    "assessments.view",
    "progress.view",
    "terms.view",
    "subject_trends.view",
    "honor_roll.view",
    "at_risk.view",
    "attendance.view",
    "library.view",
    "analytics.view",
    "quizzes.view",
  ],

  // Subject Coordinator: view-only, scoped to assigned major + subjects + classes
  subject_coordinator: [
    "dashboard.view",
    "students.view",
    "students.profile",
    "academics.view",
    "subjects.view",
    "assessments.view",
    "progress.view",
    "terms.view",
    "subject_trends.view",
    "attendance.view",
  ],

  academic: [
    "dashboard.view",
    "students.view",
    "students.profile",
    "academics.view",
    "subjects.view",
    "assessments.view",
    "progress.view",
    "terms.view",
    "subject_trends.view",
    "honor_roll.view",
    "at_risk.view",
    "attendance.view",
    "library.view",
    "notifications.view",
    "analytics.view",
    "year_comparison.view",
    "ai_insights.view",
    "bulk_export.view",
  ],

  // Finance Officer: fees & delinquency only, can edit fees
  finance: [
    "dashboard.view",
    "fees.view",
    "fees.edit",
    "delinquency.view",
    "notifications.view",
    "bulk_export.view",
  ],

  // Accounts: fees & delinquency read-only, plus documents
  accounts: [
    "dashboard.view",
    "fees.view",
    "delinquency.view",
    "documents.view",
    "notifications.view",
    "bulk_export.view",
  ],

  // Registrar: student registration, documents, transfers — no academics/analytics
  registrar: [
    "dashboard.view",
    "students.view",
    "students.edit",
    "students.profile",
    "documents.view",
    "transfers.view",
    "transfers.edit",
    "upload.view",
    "notifications.view",
  ],

  teacher: [
    "dashboard.view",
    "students.view",
    "students.profile",
    "academics.view",
    "assessments.view",
    "progress.view",
    "attendance.view",
    "attendance.edit",
    "library.view",
    "notifications.view",
    "quizzes.view",
    "quizzes.manage",
  ],

  viewer: [
    "dashboard.view",
    "students.view",
    "students.profile",
    "academics.view",
    "subjects.view",
    "assessments.view",
    "progress.view",
    "terms.view",
    "subject_trends.view",
    "honor_roll.view",
    "at_risk.view",
    "attendance.view",
    "fees.view",
    "delinquency.view",
    "documents.view",
    "library.view",
    "notifications.view",
    "analytics.view",
    "year_comparison.view",
    "ai_insights.view",
  ],

  bookshop: [
    "dashboard.view",
    "book_sales.view",
    "book_sales.manage",
  ],

  store_clerk: [
    "dashboard.view",
    "general_store.view",
    "general_store.manage",
    "general_store.request",
    "store_reports.view",
  ],

  it_admin: [
    "dashboard.view",
    "inventory.view",
    "inventory.manage",
    "it_store.view",
    "it_store.manage",
    "it_store.request",
    "store_reports.view",
    "tickets.manage",
  ],
};

/* ── Route → Permission mapping ──────────────────────────────────  */

export const ROUTE_PERMISSIONS: Record<string, Permission> = {
  "/dashboard": "dashboard.view",
  "/dashboard/reports": "students.view",
  "/dashboard/students": "students.profile",
  "/dashboard/academics": "academics.view",
  "/dashboard/subjects": "subjects.view",
  "/dashboard/assessments": "assessments.view",
  "/dashboard/progress": "progress.view",
  "/dashboard/terms": "terms.view",
  "/dashboard/subject-trends": "subject_trends.view",
  "/dashboard/honor-roll": "honor_roll.view",
  "/dashboard/at-risk": "at_risk.view",
  "/dashboard/attendance": "attendance.view",
  "/dashboard/delinquency": "delinquency.view",
  "/dashboard/documents": "documents.view",
  "/dashboard/library": "library.view",
  "/dashboard/notifications": "notifications.view",
  "/dashboard/messages": "notifications.view",
  "/dashboard/fees": "fees.view",
  "/dashboard/transfers": "transfers.view",
  "/dashboard/bulk-export": "bulk_export.view",
  "/dashboard/pdf-reports": "bulk_export.view",
  "/dashboard/analytics": "analytics.view",
  "/dashboard/compare": "year_comparison.view",
  "/dashboard/ai-insights": "ai_insights.view",
  "/dashboard/transcript-settings": "transcript_settings.view",
  "/dashboard/upload": "upload.view",
  "/dashboard/admin/users": "admin.users",
  "/dashboard/admin/class-assignment": "admin.users",
  "/dashboard/audit-log": "admin.audit_log",
  "/dashboard/staff": "staff.view",
  "/dashboard/it-inventory": "inventory.view",
  "/dashboard/general-store": "general_store.view",
  "/dashboard/it-store": "it_store.view",
  "/dashboard/store-reports": "store_reports.view",
  "/dashboard/book-sales": "book_sales.view",
  "/dashboard/diplomas": "certificates.print",
  "/dashboard/quizzes": "quizzes.view",
  "/dashboard/announcements": "announcements.manage",
  "/dashboard/it-tickets": "tickets.manage",
};

/* ── Helper functions ────────────────────────────────────────────  */

/** Roles that are scoped to a specific major (school branch) */
export const MAJOR_SCOPED_ROLES: readonly Role[] = [
  "academic_director",
  "head_of_section",
  "subject_coordinator",
] as const;

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function getPermissionsForRole(role: Role): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}

export function canAccessRoute(role: Role, pathname: string): boolean {
  // Exact match first
  const perm = ROUTE_PERMISSIONS[pathname];
  if (perm) return hasPermission(role, perm);

  // Check parent route (e.g., /dashboard/students/12345 → /dashboard/students)
  const segments = pathname.split("/").filter(Boolean);
  while (segments.length > 1) {
    segments.pop();
    const parent = "/" + segments.join("/");
    const parentPerm = ROUTE_PERMISSIONS[parent];
    if (parentPerm) return hasPermission(role, parentPerm);
  }

  // Default: allow dashboard.view for any unmatched /dashboard route
  return hasPermission(role, "dashboard.view");
}
