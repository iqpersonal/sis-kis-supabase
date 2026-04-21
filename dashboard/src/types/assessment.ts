/* ── Assessment Configuration & Grade Entry Types ─────────────────────── */

export interface SubAssessment {
  id: string;
  name_en: string;
  name_ar: string;
  max_score: number;
  order: number;
}

export interface AssessmentCategory {
  id: string;
  name_en: string;
  name_ar: string;
  weight: number; // percentage, all categories must sum to 100
  order: number;
  sub_assessments: SubAssessment[];
}

export type TemplateStatus = "draft" | "published";

export interface AssessmentTemplate {
  id: string; // Firestore doc ID: {year}_{classCode}_{subjectCode}_{semester}
  academic_year: string;
  class_code: string;
  subject_code: string;
  semester: "S1" | "S2";
  status: TemplateStatus;
  categories: AssessmentCategory[];
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface AssessmentScore {
  id: string; // Firestore doc ID: {year}_{semester}_{studentNumber}_{subjectCode}_{subAssessmentId}
  academic_year: string;
  semester: "S1" | "S2";
  student_number: string;
  subject_code: string;
  class_code: string;
  section_code: string;
  category_id: string;
  sub_assessment_id: string;
  score: number;
  max_score: number; // snapshot from template at time of entry
  recorded_by: string;
  recorded_at: string;
  updated_at: string;
}
