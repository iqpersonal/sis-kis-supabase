/** Shared TypeScript types — aligned with Firestore schema */

export interface Student {
  STUDENTNUMBER: string;
  FULLNAME: string;
  fullName_en?: string;
  fullName_ar?: string;
  FAMILYNUMBER: string;
  GENDER: string;
  DATEOFBIRTH: string;
  NATIONALITYNAME: string;
  RELIGION?: string;
  CURRENTCLASS: string;
  CURRENTSECTION: string;
  SCHOOLCODE: string;
  STATUS: string;
  PASSPORTNO?: string;
  PASSPORTEXPIRYDATE?: string;
  IQAMANUMBER?: string;
  IQAMAEXPIRYDATE?: string;
}

export interface TranscriptGrade {
  subject: string;
  grade: number;
  code?: string;
  credit?: number;
}

export interface StudentRegistration {
  STUDENTNUMBER: string;
  ACADEMICYEAR: string;
  SCHOOLCODE: string;
  CURRENTCLASS: string;
  CURRENTSECTION: string;
  STATUS: string;
  TOTALFEES?: number;
  TOTALPAID?: number;
  TOTALDISCOUNT?: number;
  ABSENCEDAYS?: number;
  TARDYDAYS?: number;
  transcript_sem1?: TranscriptGrade[];
  transcript_sem2?: TranscriptGrade[];
  transcript_sem3?: TranscriptGrade[];
  attendance_by_month?: {
    month: string;
    absences: number;
    tardy: number;
  }[];
}

export interface ParentAccount {
  username: string;
  password: string;
  familyNumber: string;
}

/** student_progress collection — rich academic data per student */
export interface ProgressSubjectGrade {
  subject: string;
  subject_ar?: string;
  grade: number;
  credit_hours?: number;
  calculated?: boolean;
}

export interface ProgressYearData {
  class_code: string;
  class_name: string;
  section_code: string;
  section_name: string;
  school: string;
  overall_avg: number;
  subjects?: ProgressSubjectGrade[];
  transcript_subjects?: ProgressSubjectGrade[];
  transcript_sem1?: ProgressSubjectGrade[];
  transcript_sem2?: ProgressSubjectGrade[];
  transcript_sem3?: ProgressSubjectGrade[];
}

export interface StudentProgress {
  student_number: string;
  student_name: string;
  student_name_ar?: string;
  gender: string;
  family_number: string;
  dob?: string;
  nationality_en?: string;
  years: Record<string, ProgressYearData>;
}
