"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useMemo, useCallback } from "react";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Loader2, Save, FileText, Users, BarChart3,
  ClipboardCheck, Sparkles, Search, ChevronDown, ChevronRight,
} from "lucide-react";
import { useAcademicYear } from "@/context/academic-year-context";
import { useLanguage } from "@/context/language-context";
import { useAuth } from "@/context/auth-context";
import { PageTransition } from "@/components/motion";
import {
  DEFAULT_KG_DOMAINS, KG_LEVELS, KG_TERMS, KG_LEVEL_MAP,
  domainAverage, numericToLevel, getTermsForCount,
  type KgDomain, type KgLevel, type KgTerm,
} from "@/lib/kg-rubric";

/* ── Types ──────────────────────────────────────────────────────── */

interface KgClass {
  classCode: string;
  className: string;
  sections: { sectionCode: string; sectionName: string }[];
}

interface KgStudent {
  student_number: string;
  student_name: string;
  student_name_ar: string;
  class_code: string;
  class_name: string;
  section_code: string;
  section_name: string;
  gender: string;
}

interface KgAssessment {
  id: string;
  student_number: string;
  student_name: string;
  class_code: string;
  class_name: string;
  section_code: string;
  section_name: string;
  academic_year: string;
  term: string;
  ratings: Record<string, KgLevel>;
  domain_notes: Record<string, string>;
  teacher_comment: string;
  recorded_by: string;
  updated_at?: string;
}

/* ── Level Color Pill ──────────────────────────────────────────── */

function LevelPill({ level }: { level: KgLevel | undefined }) {
  if (!level) return <span className="text-xs text-muted-foreground">—</span>;
  const info = KG_LEVEL_MAP[level];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${info.color}`}>
      {info.emoji} {info.label}
    </span>
  );
}

/* ── Domain Progress Bar ─────────────────────────────────────── */

function DomainProgress({ domain, ratings }: { domain: KgDomain; ratings: Record<string, KgLevel | undefined> }) {
  const { avg, level, rated, total } = domainAverage(
    ratings as Record<string, KgLevel>,
    domain.skills,
  );
  const pct = total > 0 ? (rated / total) * 100 : 0;

  const barColor =
    level === "exceeding" ? "bg-purple-500" :
    level === "proficient" ? "bg-emerald-500" :
    level === "developing" ? "bg-yellow-500" :
    "bg-orange-500";

  return (
    <div className="flex items-center gap-3">
      <span className="text-lg">{domain.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium truncate">{domain.name}</span>
          <LevelPill level={rated > 0 ? level : undefined} />
        </div>
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${barColor}`}
            style={{ width: `${(avg / 4) * 100}%` }}
          />
        </div>
        <span className="text-[10px] text-muted-foreground">{rated}/{total} skills rated</span>
      </div>
    </div>
  );
}

/* ── Main Page ──────────────────────────────────────────────────── */

export default function KgAssessmentPage() {
  const { selectedYear, loading: yearLoading } = useAcademicYear();
  const { t, locale } = useLanguage();
  const { user } = useAuth();

  const year = selectedYear || "25-26";

  // Filters
  const [classCode, setClassCode] = useState<string>("all");
  const [sectionCode, setSectionCode] = useState<string>("all");
  const [term, setTerm] = useState<KgTerm>("term1");
  const [searchQuery, setSearchQuery] = useState("");
  const [termCount, setTermCount] = useState(3);

  // Derived: visible terms based on academic year setting
  const visibleTerms = useMemo(() => getTermsForCount(termCount), [termCount]);

  // Data
  const [classes, setClasses] = useState<KgClass[]>([]);
  const [students, setStudents] = useState<KgStudent[]>([]);
  const [assessments, setAssessments] = useState<KgAssessment[]>([]);
  const [domains, setDomains] = useState<KgDomain[]>(DEFAULT_KG_DOMAINS);

  // UI state
  const [loading, setLoading] = useState(true);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<KgStudent | null>(null);
  const [editAssessment, setEditAssessment] = useState<KgAssessment | null>(null);

  // Dirty tracking for unsaved changes
  const [dirtyRatings, setDirtyRatings] = useState<Record<string, KgLevel>>({});
  const [dirtyNotes, setDirtyNotes] = useState<Record<string, string>>({});
  const [dirtyComment, setDirtyComment] = useState("");

  /* ── Fetch KG classes + term config ── */
  useEffect(() => {
    if (!year) return;
    setLoading(true);
    (async () => {
      try {
        const [classesRes, termRes] = await Promise.all([
          fetch(`/api/kg?action=classes&year=${year}`),
          fetch(`/api/academic-year?year=${year}`),
        ]);
        if (classesRes.ok) {
          const data = await classesRes.json();
          setClasses(data.classes || []);
        }
        if (termRes.ok) {
          const termData = await termRes.json();
          setTermCount(termData.term_count ?? 3);
        }
      } catch (err) {
        console.error("Failed to fetch KG classes:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [year]);

  /* ── Fetch students when class/section changes ── */
  useEffect(() => {
    if (classCode === "all" || !year) {
      setStudents([]);
      return;
    }
    setLoadingStudents(true);
    const controller = new AbortController();
    (async () => {
      try {
        const params = new URLSearchParams({ action: "students", year, classCode });
        if (sectionCode !== "all") params.set("sectionCode", sectionCode);
        const res = await fetch(`/api/kg?${params}`, { signal: controller.signal });
        if (res.ok) {
          const data = await res.json();
          setStudents(data.students || []);
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          console.error("Failed to fetch KG students:", err);
        }
      } finally {
        if (!controller.signal.aborted) setLoadingStudents(false);
      }
    })();
    return () => controller.abort();
  }, [year, classCode, sectionCode]);

  /* ── Fetch existing assessments when class/section/term changes ── */
  useEffect(() => {
    if (classCode === "all" || !year || !term) {
      setAssessments([]);
      return;
    }
    const controller = new AbortController();
    (async () => {
      try {
        const params = new URLSearchParams({ action: "list", year, term, classCode });
        if (sectionCode !== "all") params.set("sectionCode", sectionCode);
        const res = await fetch(`/api/kg?${params}`, { signal: controller.signal });
        if (res.ok) {
          const data = await res.json();
          setAssessments(data.assessments || []);
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          console.error("Failed to fetch assessments:", err);
        }
      }
    })();
    return () => controller.abort();
  }, [year, classCode, sectionCode, term]);

  /* ── Available sections for selected class ── */
  const availableSections = useMemo(() => {
    if (classCode === "all") return [];
    const cls = classes.find((c) => c.classCode === classCode);
    return cls?.sections || [];
  }, [classes, classCode]);

  /* ── Lookup existing assessment for a student ── */
  const getAssessment = useCallback(
    (studentNumber: string): KgAssessment | undefined =>
      assessments.find((a) => a.student_number === studentNumber),
    [assessments],
  );

  /* ── Filtered students ── */
  const filteredStudents = useMemo(() => {
    if (!searchQuery) return students;
    const q = searchQuery.toLowerCase();
    return students.filter(
      (s) =>
        s.student_name.toLowerCase().includes(q) ||
        s.student_name_ar.includes(q) ||
        s.student_number.includes(q),
    );
  }, [students, searchQuery]);

  /* ── KPIs ── */
  const kpis = useMemo(() => {
    const totalStudents = students.length;
    const assessed = students.filter((s) => getAssessment(s.student_number)).length;
    const pending = totalStudents - assessed;

    // Average proficiency across all assessed students
    let totalAvg = 0;
    let avgCount = 0;
    for (const a of assessments) {
      const allSkills = domains.flatMap((d) => d.skills);
      let sum = 0;
      let count = 0;
      for (const s of allSkills) {
        const r = a.ratings?.[s.id];
        if (r) {
          sum += KG_LEVEL_MAP[r as KgLevel] ? ({ emerging: 1, developing: 2, proficient: 3, exceeding: 4 }[r as KgLevel] || 0) : 0;
          count++;
        }
      }
      if (count > 0) {
        totalAvg += sum / count;
        avgCount++;
      }
    }

    return {
      totalStudents,
      assessed,
      pending,
      avgLevel: avgCount > 0 ? numericToLevel(totalAvg / avgCount) : null,
    };
  }, [students, assessments, domains, getAssessment]);

  /* ── Open student assessment modal ── */
  const openStudentAssessment = (student: KgStudent) => {
    const existing = getAssessment(student.student_number);
    setSelectedStudent(student);
    setDirtyRatings(existing?.ratings || {});
    setDirtyNotes(existing?.domain_notes || {});
    setDirtyComment(existing?.teacher_comment || "");
    setEditAssessment(existing || null);
  };

  /* ── Save assessment ── */
  const handleSave = async () => {
    if (!selectedStudent || !year) return;
    setSaving(true);
    try {
      const payload: KgAssessment = {
        id: editAssessment?.id || `${year}_${term}_${selectedStudent.student_number}`.replace(/[\/\s]+/g, "_"),
        student_number: selectedStudent.student_number,
        student_name: selectedStudent.student_name,
        class_code: classCode,
        class_name: selectedStudent.class_name,
        section_code: selectedStudent.section_code,
        section_name: selectedStudent.section_name,
        academic_year: year,
        term,
        ratings: dirtyRatings,
        domain_notes: dirtyNotes,
        teacher_comment: dirtyComment,
        recorded_by: user?.email || "unknown",
      };

      const res = await fetch("/api/kg", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", assessments: [payload] }),
      });

      if (res.ok) {
        // Update local state
        setAssessments((prev) => {
          const idx = prev.findIndex((a) => a.student_number === selectedStudent.student_number && a.term === term);
          const updated = { ...payload, updated_at: new Date().toISOString() };
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = updated;
            return next;
          }
          return [...prev, updated];
        });
        setSelectedStudent(null);
      }
    } catch (err) {
      console.error("Failed to save assessment:", err);
    } finally {
      setSaving(false);
    }
  };

  /* ── Render ──────────────────────────────────────────────────── */

  if (yearLoading || loading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="mt-2 h-4 w-96" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader className="pb-2"><Skeleton className="h-4 w-24" /></CardHeader>
              <CardContent><Skeleton className="h-8 w-16" /></CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <PageTransition>
      <div className="space-y-6 p-6">
        {/* ── Header ── */}
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="h-7 w-7 text-purple-500" />
            <span className="bg-gradient-to-r from-purple-600 to-pink-500 bg-clip-text text-transparent">
              KG Assessment
            </span>
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Developmental skills assessment for Kindergarten students — {year}
          </p>
        </div>

        {/* ── KPI Cards ── */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="border-l-4 border-l-purple-500">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">KG Students</CardTitle>
              <Users className="h-4 w-4 text-purple-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{kpis.totalStudents}</div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-emerald-500">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Assessed</CardTitle>
              <ClipboardCheck className="h-4 w-4 text-emerald-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-600">{kpis.assessed}</div>
              <p className="text-xs text-muted-foreground">
                {kpis.totalStudents > 0 ? Math.round((kpis.assessed / kpis.totalStudents) * 100) : 0}% complete
              </p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-amber-500">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Pending</CardTitle>
              <FileText className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-600">{kpis.pending}</div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-blue-500">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Avg. Level</CardTitle>
              <BarChart3 className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              {kpis.avgLevel ? (
                <LevelPill level={kpis.avgLevel} />
              ) : (
                <span className="text-sm text-muted-foreground">No data</span>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Filters ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Filters</CardTitle>
            <CardDescription>Select class, section, and term to assess students.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              <div className="w-44">
                <Label className="text-xs">Class</Label>
                <Select
                  value={classCode}
                  onValueChange={(v) => { setClassCode(v); setSectionCode("all"); }}
                >
                  <SelectTrigger><SelectValue placeholder="Select class…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All KG Classes</SelectItem>
                    {classes.map((c) => (
                      <SelectItem key={c.classCode} value={c.classCode}>
                        {c.className || `Class ${c.classCode}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="w-44">
                <Label className="text-xs">Section</Label>
                <Select value={sectionCode} onValueChange={setSectionCode}>
                  <SelectTrigger><SelectValue placeholder="All sections" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sections</SelectItem>
                    {availableSections.map((s) => (
                      <SelectItem key={s.sectionCode} value={s.sectionCode}>
                        {s.sectionName || s.sectionCode}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="w-44">
                <Label className="text-xs">Term</Label>
                <Select value={term} onValueChange={(v) => setTerm(v as KgTerm)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {visibleTerms.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {locale === "ar" ? t.labelAr : t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {classCode !== "all" && (
                <div className="w-56 self-end">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search students…"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ── Student List ── */}
        {classCode === "all" ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Sparkles className="mx-auto h-12 w-12 mb-3 text-purple-300" />
              <p className="text-lg font-medium">Select a KG class to begin assessment</p>
              <p className="text-sm">Choose a class and term above to see students</p>
            </CardContent>
          </Card>
        ) : loadingStudents ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Card key={i}><CardContent className="py-6"><Skeleton className="h-16 w-full" /></CardContent></Card>
            ))}
          </div>
        ) : filteredStudents.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              No students found for this selection.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filteredStudents.map((student) => {
              const existing = getAssessment(student.student_number);
              const isAssessed = !!existing;
              const ratedSkills = existing
                ? Object.keys(existing.ratings || {}).length
                : 0;
              const totalSkills = domains.flatMap((d) => d.skills).length;

              return (
                <Card
                  key={student.student_number}
                  className={`cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5 ${
                    isAssessed
                      ? "border-emerald-200 dark:border-emerald-800/50"
                      : "border-orange-200 dark:border-orange-800/50"
                  }`}
                  onClick={() => openStudentAssessment(student)}
                >
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold truncate">{student.student_name}</p>
                        {student.student_name_ar && (
                          <p className="text-sm text-muted-foreground truncate" dir="rtl">
                            {student.student_name_ar}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          #{student.student_number} · {student.section_name || student.section_code}
                        </p>
                      </div>
                      <div className="ml-2 flex-shrink-0">
                        {isAssessed ? (
                          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700">
                            {ratedSkills}/{totalSkills}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-orange-50 text-orange-600 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-700">
                            Pending
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Domain mini-bars */}
                    {isAssessed && (
                      <div className="mt-3 grid grid-cols-6 gap-1">
                        {domains.map((d) => {
                          const { avg } = domainAverage(existing!.ratings as Record<string, KgLevel>, d.skills);
                          const barPct = (avg / 4) * 100;
                          return (
                            <div key={d.id} className="flex flex-col items-center" title={d.name}>
                              <span className="text-xs">{d.icon}</span>
                              <div className="h-1 w-full rounded-full bg-muted mt-0.5 overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-purple-500 transition-all"
                                  style={{ width: `${barPct}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* ── Assessment Dialog ── */}
        <Dialog open={!!selectedStudent} onOpenChange={(open) => { if (!open) setSelectedStudent(null); }}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-purple-500" />
                Assess: {selectedStudent?.student_name}
              </DialogTitle>
              <p className="text-sm text-muted-foreground">
                {selectedStudent?.student_name_ar && (
                  <span dir="rtl">{selectedStudent.student_name_ar} · </span>
                )}
                #{selectedStudent?.student_number} · {selectedStudent?.section_name || selectedStudent?.section_code}
                {" · "}
                {visibleTerms.find((t) => t.value === term)?.label}
              </p>
            </DialogHeader>

            <div className="space-y-6 mt-4">
              {/* Domain summary bar at top */}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {domains.map((domain) => (
                  <DomainProgress key={domain.id} domain={domain} ratings={dirtyRatings} />
                ))}
              </div>

              {/* Skill assessment per domain */}
              {domains.map((domain) => (
                <DomainAssessmentSection
                  key={domain.id}
                  domain={domain}
                  ratings={dirtyRatings}
                  notes={dirtyNotes[domain.id] || ""}
                  locale={locale}
                  onRate={(skillId, level) => {
                    setDirtyRatings((prev) => ({ ...prev, [skillId]: level }));
                  }}
                  onNote={(note) => {
                    setDirtyNotes((prev) => ({ ...prev, [domain.id]: note }));
                  }}
                />
              ))}

              {/* Teacher overall comment */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Teacher Comment</CardTitle>
                </CardHeader>
                <CardContent>
                  <textarea
                    value={dirtyComment}
                    onChange={(e) => setDirtyComment(e.target.value)}
                    placeholder="Overall observations, recommendations, and notes for parents…"
                    className="w-full min-h-[80px] rounded-lg border bg-background px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                  />
                </CardContent>
              </Card>

              {/* Save button */}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setSelectedStudent(null)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={saving}
                  className="bg-gradient-to-r from-purple-600 to-pink-500 text-white hover:from-purple-700 hover:to-pink-600"
                >
                  {saving ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…</>
                  ) : (
                    <><Save className="mr-2 h-4 w-4" /> Save Assessment</>
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </PageTransition>
  );
}

/* ── Domain Assessment Section ─────────────────────────────────── */

function DomainAssessmentSection({
  domain,
  ratings,
  notes,
  locale,
  onRate,
  onNote,
}: {
  domain: KgDomain;
  ratings: Record<string, KgLevel>;
  notes: string;
  locale: string;
  onRate: (skillId: string, level: KgLevel) => void;
  onNote: (note: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  const domainColorMap: Record<string, string> = {
    blue: "border-l-blue-500",
    violet: "border-l-violet-500",
    teal: "border-l-teal-500",
    green: "border-l-green-500",
    amber: "border-l-amber-500",
    rose: "border-l-rose-500",
  };

  return (
    <Card className={`border-l-4 ${domainColorMap[domain.color] || "border-l-gray-500"}`}>
      <CardHeader
        className="pb-2 cursor-pointer select-none"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <span className="text-lg">{domain.icon}</span>
            {locale === "ar" ? domain.nameAr : domain.name}
          </CardTitle>
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-3">
          {domain.skills.map((skill) => {
            const current = ratings[skill.id];
            return (
              <div key={skill.id} className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-4">
                <span className="text-sm min-w-0 flex-1">
                  {locale === "ar" ? skill.nameAr : skill.name}
                </span>
                <div className="flex gap-1 flex-shrink-0">
                  {KG_LEVELS.map((level) => (
                    <button
                      key={level.value}
                      onClick={() => onRate(skill.id, level.value)}
                      className={`rounded-full px-2.5 py-1 text-xs font-medium transition-all ${
                        current === level.value
                          ? `${level.color} ring-2 ring-offset-1 ring-current shadow-sm`
                          : "bg-muted/50 text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {level.emoji}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}

          {/* Domain-level note */}
          <div className="mt-3 pt-2 border-t">
            <input
              type="text"
              value={notes}
              onChange={(e) => onNote(e.target.value)}
              placeholder={`Notes for ${domain.name}…`}
              className="w-full rounded-md border bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-purple-500/50"
            />
          </div>
        </CardContent>
      )}
    </Card>
  );
}
