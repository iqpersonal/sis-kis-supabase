/**
 * Progress Report Rubric — constants, enums, and helper functions.
 *
 * Matches the school's "Progress Report Evaluation Rubric" document.
 */

/* ── Academic Performance bands ── */
export const ACADEMIC_BANDS = [
  { label: "Outstanding Achievement", range: "Above 90", min: 91, max: 100 },
  { label: "Strong Achievement", range: "80–90", min: 80, max: 90 },
  { label: "Consistent Achievement", range: "70–79", min: 70, max: 79 },
  { label: "Showing Improvement", range: "65–69", min: 65, max: 69 },
  { label: "Major Efforts Required", range: "60–64", min: 60, max: 64 },
  { label: "Danger of Failing", range: "Below 60", min: 0, max: 59 },
] as const;

export type AcademicBandLabel = (typeof ACADEMIC_BANDS)[number]["label"];

/** Map a numeric score (0-100) to the rubric band label */
export function scoreToBand(score: number | null | undefined): AcademicBandLabel | "" {
  if (score == null || isNaN(score)) return "";
  for (const band of ACADEMIC_BANDS) {
    if (score >= band.min && score <= band.max) return band.label;
  }
  return "";
}

/** Colour class for each academic band */
export function bandColor(label: string): string {
  switch (label) {
    case "Outstanding Achievement":
      return "text-green-700 bg-green-50";
    case "Strong Achievement":
      return "text-blue-700 bg-blue-50";
    case "Consistent Achievement":
      return "text-yellow-700 bg-yellow-50";
    case "Showing Improvement":
      return "text-orange-600 bg-orange-50";
    case "Major Efforts Required":
      return "text-red-600 bg-red-50";
    case "Danger of Failing":
      return "text-red-800 bg-red-100";
    default:
      return "";
  }
}

/* ── Homework Effort ── */
export const HOMEWORK_OPTIONS = [
  "Consistently Completed",
  "Partially Completed",
  "Not Completed",
] as const;

export type HomeworkEffort = (typeof HOMEWORK_OPTIONS)[number];

export function homeworkColor(v: string): string {
  switch (v) {
    case "Consistently Completed":
      return "text-green-700 bg-green-50";
    case "Partially Completed":
      return "text-yellow-700 bg-yellow-50";
    case "Not Completed":
      return "text-red-700 bg-red-50";
    default:
      return "";
  }
}

/* ── In-Class Participation ── */
export const PARTICIPATION_OPTIONS = [
  "Highly Engaged",
  "Partially Engaged",
  "Rarely Engaged",
] as const;

export type Participation = (typeof PARTICIPATION_OPTIONS)[number];

export function participationColor(v: string): string {
  switch (v) {
    case "Highly Engaged":
      return "text-green-700 bg-green-50";
    case "Partially Engaged":
      return "text-yellow-700 bg-yellow-50";
    case "Rarely Engaged":
      return "text-red-700 bg-red-50";
    default:
      return "";
  }
}

/* ── Conduct ── */
export const CONDUCT_OPTIONS = [
  "Respectful & Cooperative",
  "Disruptive",
  "Un-cooperative",
] as const;

export type Conduct = (typeof CONDUCT_OPTIONS)[number];

export function conductColor(v: string): string {
  switch (v) {
    case "Respectful & Cooperative":
      return "text-green-700 bg-green-50";
    case "Disruptive":
      return "text-yellow-700 bg-yellow-50";
    case "Un-cooperative":
      return "text-red-700 bg-red-50";
    default:
      return "";
  }
}

/* ── Months & Terms ── */
export const MONTHS = [
  "September",
  "October",
  "November",
  "December",
  "January",
  "February",
  "March",
  "April",
  "May",
] as const;

export type ReportMonth = (typeof MONTHS)[number];

const FIRST_TERM_MONTHS = new Set(["September", "October", "November", "December", "January"]);

export function monthToTerm(month: string): "First Term" | "Second Term" {
  return FIRST_TERM_MONTHS.has(month) ? "First Term" : "Second Term";
}

/* ── Document ID helper ── */
export function progressReportDocId(
  year: string,
  month: string,
  studentNumber: string,
  subject: string,
): string {
  const safe = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `${safe(year)}_${safe(month)}_${safe(studentNumber)}_${safe(subject)}`;
}
