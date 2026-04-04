/* ─── Role-Based Access Control (RBAC) ──────────────────────────── */

/**
 * Defines roles, permissions, and route-permission mapping for the
 * admin dashboard. Each role gets a set of permissions;
 * each dashboard route requires a specific permission.
 */

export const ROLES = {
  super_admin: "Super Admin",
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
  // Admin
  "admin.users",
  "admin.audit_log",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/* ── Role → Permission mapping ──────────────────────────────────── */

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  super_admin: PERMISSIONS, // all permissions

  // IT Manager gets all academic + staff + inventory
  it_manager: [
    "dashboard.view",
    "students.view",
    "students.profile",
    "staff.view",
    "inventory.view",
    "inventory.manage",
    "notifications.view",
    "analytics.view",
    "bulk_export.view",
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

  finance: [
    "dashboard.view",
    "students.view",
    "students.profile",
    "fees.view",
    "fees.edit",
    "delinquency.view",
    "notifications.view",
    "analytics.view",
    "bulk_export.view",
  ],

  accounts: [
    "dashboard.view",
    "students.view",
    "students.profile",
    "fees.view",
    "delinquency.view",
    "documents.view",
    "notifications.view",
    "analytics.view",
    "bulk_export.view",
  ],

  registrar: [
    "dashboard.view",
    "students.view",
    "students.edit",
    "students.profile",
    "documents.view",
    "transfers.view",
    "transfers.edit",
    "notifications.view",
    "analytics.view",
    "upload.view",
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
    "students.view",
    "students.profile",
    "book_sales.view",
    "book_sales.manage",
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
  "/dashboard/book-sales": "book_sales.view",
  "/dashboard/diplomas": "certificates.print",
  "/dashboard/quizzes": "quizzes.view",
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
