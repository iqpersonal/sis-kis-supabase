/* ─── KG Developmental Assessment Rubric ─────────────────────────── */

/**
 * Skill domains, rubric levels, and default skill checklists
 * for the KG module (KG1, KG2, KG3).
 */

/* ── Rubric Levels ─────────────────────────────────────────────── */

export const KG_LEVELS = [
  { value: "emerging",   label: "Emerging",   labelAr: "مبتدئ",   emoji: "🌱", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300", dot: "bg-orange-500" },
  { value: "developing", label: "Developing", labelAr: "نامٍ",    emoji: "🌿", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300", dot: "bg-yellow-500" },
  { value: "proficient", label: "Proficient", labelAr: "متقن",    emoji: "🌳", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300", dot: "bg-emerald-500" },
  { value: "exceeding",  label: "Exceeding",  labelAr: "متفوق",   emoji: "⭐", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300", dot: "bg-purple-500" },
] as const;

export type KgLevel = (typeof KG_LEVELS)[number]["value"];

export const KG_LEVEL_MAP = Object.fromEntries(
  KG_LEVELS.map((l) => [l.value, l])
) as Record<KgLevel, (typeof KG_LEVELS)[number]>;

/* ── Skill Domains ─────────────────────────────────────────────── */

export interface KgSkill {
  id: string;
  name: string;
  nameAr: string;
}

export interface KgDomain {
  id: string;
  name: string;
  nameAr: string;
  icon: string;      // emoji
  color: string;     // Tailwind accent
  skills: KgSkill[];
}

export const DEFAULT_KG_DOMAINS: KgDomain[] = [
  {
    id: "cognitive",
    name: "Cognitive Development",
    nameAr: "التطور المعرفي",
    icon: "🧠",
    color: "blue",
    skills: [
      { id: "cog-1", name: "Follows multi-step instructions", nameAr: "يتبع تعليمات متعددة الخطوات" },
      { id: "cog-2", name: "Sorts and classifies objects", nameAr: "يصنف الأشياء ويرتبها" },
      { id: "cog-3", name: "Demonstrates problem-solving", nameAr: "يظهر مهارات حل المشكلات" },
      { id: "cog-4", name: "Shows curiosity and asks questions", nameAr: "يظهر الفضول ويطرح الأسئلة" },
      { id: "cog-5", name: "Recalls and retells information", nameAr: "يتذكر المعلومات ويعيد سردها" },
    ],
  },
  {
    id: "language",
    name: "Language & Literacy",
    nameAr: "اللغة والقراءة والكتابة",
    icon: "📖",
    color: "violet",
    skills: [
      { id: "lang-1", name: "Recognizes letters (A–Z)", nameAr: "يتعرف على الحروف (A–Z)" },
      { id: "lang-2", name: "Recognizes Arabic letters", nameAr: "يتعرف على الحروف العربية" },
      { id: "lang-3", name: "Writes first name", nameAr: "يكتب اسمه الأول" },
      { id: "lang-4", name: "Speaks in complete sentences", nameAr: "يتحدث بجمل كاملة" },
      { id: "lang-5", name: "Identifies beginning sounds", nameAr: "يحدد الأصوات الأولى للكلمات" },
      { id: "lang-6", name: "Enjoys listening to stories", nameAr: "يستمتع بالاستماع للقصص" },
    ],
  },
  {
    id: "math",
    name: "Mathematics",
    nameAr: "الرياضيات",
    icon: "🔢",
    color: "teal",
    skills: [
      { id: "math-1", name: "Counts to 20", nameAr: "يعد حتى ٢٠" },
      { id: "math-2", name: "Recognizes numbers 1–10", nameAr: "يتعرف على الأرقام من ١ إلى ١٠" },
      { id: "math-3", name: "Understands more/less", nameAr: "يفهم مفهوم أكثر/أقل" },
      { id: "math-4", name: "Identifies basic shapes", nameAr: "يحدد الأشكال الأساسية" },
      { id: "math-5", name: "Creates simple patterns", nameAr: "ينشئ أنماطاً بسيطة" },
    ],
  },
  {
    id: "physical",
    name: "Physical Development",
    nameAr: "التطور الجسدي",
    icon: "🏃",
    color: "green",
    skills: [
      { id: "phys-1", name: "Holds pencil correctly", nameAr: "يمسك القلم بشكل صحيح" },
      { id: "phys-2", name: "Cuts with scissors", nameAr: "يقص بالمقص" },
      { id: "phys-3", name: "Runs and jumps with coordination", nameAr: "يركض ويقفز بتناسق" },
      { id: "phys-4", name: "Balances on one foot", nameAr: "يتوازن على قدم واحدة" },
      { id: "phys-5", name: "Colors within boundaries", nameAr: "يلون داخل الحدود" },
    ],
  },
  {
    id: "social",
    name: "Social-Emotional",
    nameAr: "التطور الاجتماعي والعاطفي",
    icon: "💛",
    color: "amber",
    skills: [
      { id: "soc-1", name: "Shares and takes turns", nameAr: "يشارك وينتظر دوره" },
      { id: "soc-2", name: "Expresses feelings appropriately", nameAr: "يعبر عن مشاعره بشكل مناسب" },
      { id: "soc-3", name: "Follows classroom rules", nameAr: "يتبع قوانين الصف" },
      { id: "soc-4", name: "Shows empathy toward peers", nameAr: "يظهر التعاطف مع الآخرين" },
      { id: "soc-5", name: "Works cooperatively in groups", nameAr: "يعمل بتعاون في المجموعات" },
      { id: "soc-6", name: "Manages transitions calmly", nameAr: "ينتقل بين الأنشطة بهدوء" },
    ],
  },
  {
    id: "creative",
    name: "Creative Arts",
    nameAr: "الفنون الإبداعية",
    icon: "🎨",
    color: "rose",
    skills: [
      { id: "art-1", name: "Engages in imaginative play", nameAr: "يشارك في اللعب التخيلي" },
      { id: "art-2", name: "Creates artwork with detail", nameAr: "يبتكر أعمالاً فنية بتفاصيل" },
      { id: "art-3", name: "Participates in music and movement", nameAr: "يشارك في الموسيقى والحركة" },
      { id: "art-4", name: "Uses materials creatively", nameAr: "يستخدم المواد بإبداع" },
    ],
  },
];

/* ── Helpers ──────────────────────────────────────────────────── */

export function levelToNumeric(level: KgLevel): number {
  switch (level) {
    case "emerging":   return 1;
    case "developing": return 2;
    case "proficient": return 3;
    case "exceeding":  return 4;
    default:           return 0;
  }
}

export function numericToLevel(n: number): KgLevel {
  if (n >= 3.5) return "exceeding";
  if (n >= 2.5) return "proficient";
  if (n >= 1.5) return "developing";
  return "emerging";
}

/** Average level across rated skills in a domain */
export function domainAverage(
  ratings: Record<string, KgLevel | undefined>,
  skills: KgSkill[]
): { avg: number; level: KgLevel; rated: number; total: number } {
  let sum = 0;
  let rated = 0;
  for (const s of skills) {
    const r = ratings[s.id];
    if (r) {
      sum += levelToNumeric(r);
      rated++;
    }
  }
  const avg = rated > 0 ? sum / rated : 0;
  return { avg, level: numericToLevel(avg), rated, total: skills.length };
}

/** Generate a stable document ID for a KG assessment */
export function kgAssessmentDocId(
  year: string,
  term: string,
  studentNumber: string
): string {
  return `${year}_${term}_${studentNumber}`.replace(/[\/\s]+/g, "_");
}

/* ── Term definitions ─────────────────────────────────────────── */

export const KG_TERMS = [
  { value: "term1", label: "Term 1", labelAr: "الفصل الأول" },
  { value: "term2", label: "Term 2", labelAr: "الفصل الثاني" },
  { value: "term3", label: "Term 3", labelAr: "الفصل الثالث" },
] as const;

export type KgTerm = (typeof KG_TERMS)[number]["value"];

/** Return terms filtered by the configured term_count (2 or 3). Defaults to all 3. */
export function getTermsForCount(termCount: number): typeof KG_TERMS[number][] {
  return KG_TERMS.slice(0, termCount >= 2 && termCount <= 3 ? termCount : 3) as unknown as typeof KG_TERMS[number][];
}
