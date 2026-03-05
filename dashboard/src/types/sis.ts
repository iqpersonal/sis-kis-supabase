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
