/* ── SiS Database Types ──────────────────────────────────────────────────── */

export interface Student {
  id: string; // Firestore doc id
  Student_Number: string;
  A_Student_Name: string | null;
  E_Student_Name: string | null;
  Gender: boolean | null; // true = male, false = female
  Birth_Date: string | null;
  Nationality_Code: string | null;
  Religion_Code: string | null;
  Family_Number: string | null;
  Student_Status: string | null;
  Mod_Date: string | null;
  Academic_Year: string | null;
  [key: string]: unknown;
}

export interface Registration {
  id: string;
  Student_Number: string;
  Academic_Year: string;
  School_Code: string;
  Branch_Code: string;
  Major_Code: string | null;
  Group_Code: string | null;
  Class_Code: string | null;
  Section_Code: string | null;
  Registration_Date: string | null;
  Registration_Type_Code: string | null;
  Mod_Date: string | null;
  [key: string]: unknown;
}

export interface StudentCharge {
  id: string;
  Student_Number: string;
  Academic_Year: string;
  Charge_Type_Code: string;
  Charge_Amount: number | null;
  Paid_Amount: number | null;
  Balance: number | null;
  Mod_Date: string | null;
  [key: string]: unknown;
}

export interface StudentInvoice {
  id: string;
  Student_Number: string;
  Academic_Year: string;
  Invoice_Number: string | null;
  Invoice_Date: string | null;
  Invoice_Amount: number | null;
  Payment_Type_Code: string | null;
  [key: string]: unknown;
}

export interface StudentAbsence {
  id: string;
  Student_Number: string;
  Academic_Year: string;
  Absence_Date: string | null;
  Absence_Reason_Code: string | null;
  [key: string]: unknown;
}

export interface StudentExamResult {
  id: string;
  Student_Number: string;
  Academic_Year: string;
  Exam_Code: string | null;
  Subject_Code: string | null;
  Grade: number | null;
  [key: string]: unknown;
}

export interface AcademicYear {
  id: string;
  Academic_Year: string;
  Date_From: string | null;
  Date_To: string | null;
  Current_Year: boolean;
  [key: string]: unknown;
}

export interface SisClass {
  id: string;
  Class_Code: string;
  A_Class_Name: string | null;
  E_Class_Name: string | null;
  [key: string]: unknown;
}

export interface Subject {
  id: string;
  Subject_Code: string;
  A_Subject_Name: string | null;
  E_Subject_Name: string | null;
  [key: string]: unknown;
}

export interface ChargeType {
  id: string;
  Charge_Type_Code: string;
  A_Charge_Type_Desc: string | null;
  E_Charge_Type_Desc: string | null;
  [key: string]: unknown;
}

/* ── Staff ────────────────────────────────────────────────────────── */

export interface StaffMember {
  id: string;
  Staff_Number: string;
  A_First_Name: string | null;
  E_First_Name: string | null;
  A_Father_Name: string | null;
  E_Father_Name: string | null;
  A_Family_Name: string | null;
  E_Family_Name: string | null;
  A_Full_Name: string | null;
  E_Full_Name: string | null;
  E_Mail: string | null;
  Sex: string | null;
  Birth_Date: string | null;
  Primary_Nationality: string | null;
  ID_Number: string | null;
  Employee_Group_ID: string | null;
  School_Code: string | null;
  Branch_Code: string | null;
  Position_Code: string | null;
  Enrollment_Date: string | null;
  Termination_Date: string | null;
  is_active: boolean;
  [key: string]: unknown;
}

export interface Department {
  id: string;
  Department_Code: string;
  A_Department_Desc: string | null;
  E_Department_Desc: string | null;
  [key: string]: unknown;
}

/* ── IT Inventory ────────────────────────────────────────────────── */

export type AssetType =
  | "laptop"
  | "desktop"
  | "printer"
  | "projector"
  | "tablet"
  | "phone"
  | "network_device"
  | "monitor"
  | "other";

export type AssetStatus =
  | "active"
  | "available"
  | "maintenance"
  | "retired"
  | "lost";

export type AssetCondition = "excellent" | "good" | "fair" | "poor";

export interface ITAsset {
  id: string;
  asset_id: string;
  asset_type: AssetType;
  brand: string;
  model: string;
  serial_number: string;
  purchase_date: string | null;
  purchase_price: number | null;
  warranty_expiry: string | null;
  status: AssetStatus;
  condition: AssetCondition;
  location: string;
  branch: string;
  assigned_to: string | null;
  assigned_to_name: string | null;
  assigned_date: string | null;
  notes: string;
  specs: Record<string, string>;
  created_at: string;
  updated_by: string;
  /* ── Depreciation ── */
  useful_life_years: number | null;
  salvage_value: number | null;
  /* ── Maintenance scheduling ── */
  next_maintenance_date: string | null;
  maintenance_interval_days: number | null;
}

export interface ITAssetHistory {
  id: string;
  asset_id: string;
  action: "assigned" | "returned" | "maintenance" | "status_change" | "created" | "updated";
  from_staff: string | null;
  to_staff: string | null;
  timestamp: string;
  performed_by: string;
  notes: string;
}

/* ── Store Inventory (General Store & IT Store) ──────────────────── */

export type StoreType = "general" | "it";

export type GeneralStoreCategory =
  | "stationery"
  | "office_supplies"
  | "cleaning"
  | "classroom"
  | "furniture"
  | "other";

export type ITStoreCategory =
  | "toner_ink"
  | "cables"
  | "peripherals"
  | "storage"
  | "networking"
  | "components"
  | "other";

export type RequestStatus =
  | "pending"
  | "approved"
  | "partially_approved"
  | "rejected"
  | "issued";

export interface StoreItem {
  id: string;
  item_id: string;
  name: string;
  name_ar: string;
  category: string;
  unit: string;
  quantity: number;
  reorder_level: number;
  location: string;
  branch: string;
  notes: string;
  barcode?: string;
  image_url?: string;
  custom_image_url?: string;
  is_active: boolean;
  created_at: string;
  updated_by: string;
}

export interface StoreRequestItem {
  item_id: string;
  name: string;
  qty_requested: number;
  qty_approved: number;
}

export interface StoreRequest {
  id: string;
  request_id: string;
  requested_by: string;
  requested_by_name: string;
  items: StoreRequestItem[];
  status: RequestStatus;
  notes: string;
  requested_at: string;
  reviewed_by: string | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  issued_by: string | null;
  issued_by_name: string | null;
  issued_at: string | null;
}

export interface StoreTransaction {
  id: string;
  txn_id: string;
  type: "receive" | "issue";
  item_id: string;
  item_name: string;
  quantity: number;
  request_id: string | null;
  staff_number: string | null;
  staff_name: string | null;
  notes: string;
  performed_by: string;
  timestamp: string;
}

/* ── Staff Portal ────────────────────────────────────────────────── */

export type AnnouncementTarget = "all" | "teachers" | "non-teaching";
export type AnnouncementPriority = "normal" | "urgent";

export interface Announcement {
  id: string;
  title: string;
  body: string;
  author_name: string;
  author_uid: string;
  target: AnnouncementTarget;
  priority: AnnouncementPriority;
  is_active: boolean;
  created_at: string;
  expires_at: string | null;
}

export type TicketCategory =
  | "hardware"
  | "software"
  | "network"
  | "access"
  | "other";

export type TicketPriority = "low" | "medium" | "high";

export type TicketStatus = "open" | "in-progress" | "resolved" | "closed";

export interface TicketNote {
  text: string;
  author: string;
  timestamp: string;
}

export interface ITTicket {
  id: string;
  ticket_id: string;
  staff_number: string;
  staff_name: string;
  title: string;
  description: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  assigned_to: string | null;
  notes: TicketNote[];
  created_at: string;
  updated_at: string;
}

/** Dashboard KPI summary (computed client-side from Firestore collections) */
export interface DashboardStats {
  totalStudents: number;
  activeStudents: number;
  totalRegistrations: number;
  totalRevenue: number;
  totalCollected: number;
  outstandingBalance: number;
  attendanceRate: number;
  averageGrade: number;
}
