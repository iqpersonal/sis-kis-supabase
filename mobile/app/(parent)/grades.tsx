import { useState, useEffect } from "react";
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useParent } from "@/context/parent-context";
import { colors, spacing, fontSize, radius, commonStyles } from "@/lib/theme";
import ChildSelector from "@/components/ChildSelector";

interface TermGrades {
  year: string;
  sem: string;
  subjects: { subject: string; grade: number }[];
  average: number;
}

interface TermData {
  label: string;
  subjects: { subject: string; grade: number }[];
  avg: number;
}

interface TermBreakdown {
  year: string;
  termCount: number;
  terms: Record<string, TermData>;
}

export default function ParentGrades() {
  const { selectedChild } = useParent();
  const [terms, setTerms] = useState<TermGrades[]>([]);
  const [termBreakdown, setTermBreakdown] = useState<TermBreakdown | null>(null);
  const [showTermTable, setShowTermTable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hasUnpaidFees, setHasUnpaidFees] = useState(false);

  useEffect(() => {
    if (!selectedChild) return;
    const fetchGrades = async () => {
      setLoading(true);
      setHasUnpaidFees(false);
      setTermBreakdown(null);
      setShowTermTable(false);
      try {
        const snap = await getDoc(doc(db, "student_progress", selectedChild.studentNumber));
        if (!snap.exists()) { setTerms([]); return; }
        const progress = snap.data();
        const years = progress.years || {};
        const financials = progress.financials || {};
        const rows: TermGrades[] = [];

        // Build set of unpaid years using opening_balance logic
        const unpaidYears = new Set<string>();
        const sortedFinYears = Object.keys(financials).sort();
        for (let i = 0; i < sortedFinYears.length; i++) {
          const y = sortedFinYears[i];
          const nextY = sortedFinYears[i + 1];
          if (nextY) {
            if (((financials[nextY] as { opening_balance?: number })?.opening_balance ?? 0) > 0) unpaidYears.add(y);
          } else {
            if (((financials[y] as { balance?: number })?.balance ?? 0) > 0) unpaidYears.add(y);
          }
        }
        if (unpaidYears.size > 0) setHasUnpaidFees(true);

        // Sort years descending
        const sortedYears = Object.keys(years).sort().reverse();

        for (const yr of sortedYears) {
          // Skip years with outstanding fees
          if (unpaidYears.has(yr)) continue;

          const yd = years[yr];
          const make = (sem: string, grades: { subject: string; grade: number }[]) => {
            if (grades.length > 0) {
              const avg = grades.reduce((s, g) => s + g.grade, 0) / grades.length;
              rows.push({ year: yr, sem, subjects: grades, average: avg });
            }
          };

          const sem1 = (yd.transcript_sem1 || []).map(
            (g: { subject: string; grade: number }) => ({ subject: g.subject, grade: g.grade })
          );
          const sem2 = (yd.transcript_sem2 || []).map(
            (g: { subject: string; grade: number }) => ({ subject: g.subject, grade: g.grade })
          );

          make("Semester 1", sem1);
          make("Semester 2", sem2);
        }

        setTerms(rows.slice(0, 10));

        // Extract term-by-term breakdown for the most recent visible year
        for (const yr of sortedYears) {
          if (unpaidYears.has(yr)) continue;
          const yd = years[yr];
          if (yd.terms && Object.keys(yd.terms).length > 0) {
            setTermBreakdown({
              year: yr,
              termCount: yd.term_count ?? 2,
              terms: yd.terms,
            });
            break;
          }
        }
      } catch {
        setTerms([]);
      } finally {
        setLoading(false);
      }
    };
    fetchGrades();
  }, [selectedChild]);

  const gradeColor = (g: number) => {
    if (g >= 90) return colors.success;
    if (g >= 75) return colors.primaryLight;
    if (g >= 60) return colors.warning;
    return colors.danger;
  };

  if (!selectedChild) {
    return (
      <SafeAreaView style={commonStyles.centered}>
        <Text style={{ color: colors.textMuted }}>Select a child first</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={commonStyles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Grades</Text>
        <Text style={styles.childName}>{selectedChild.fullName}</Text>

        <ChildSelector />

        {/* Fee restriction notice */}
        {hasUnpaidFees && (
          <View style={styles.feeWarning}>
            <Text style={{ fontSize: 18 }}>🔒</Text>
            <Text style={styles.feeWarningText}>
              Grades for academic years with outstanding fees are hidden.
              Please clear your balance to view all records.
            </Text>
          </View>
        )}

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : terms.length === 0 ? (
          <Text style={styles.empty}>No grade records found</Text>
        ) : (
          <>
            {/* GPA Summary */}
            {terms.length > 0 && (() => {
              const allGrades = terms.flatMap((t) => t.subjects.map((s) => s.grade));
              const overallAvg = allGrades.length > 0 ? allGrades.reduce((a, b) => a + b, 0) / allGrades.length : 0;
              const passCount = allGrades.filter((g) => g >= 60).length;
              return (
                <View style={styles.gpaSummary}>
                  <View style={styles.gpaItem}>
                    <Text style={[styles.gpaValue, { color: gradeColor(overallAvg) }]}>
                      {overallAvg.toFixed(1)}
                    </Text>
                    <Text style={styles.gpaLabel}>Overall Avg</Text>
                  </View>
                  <View style={styles.gpaDivider} />
                  <View style={styles.gpaItem}>
                    <Text style={styles.gpaValue}>{terms.length}</Text>
                    <Text style={styles.gpaLabel}>Terms</Text>
                  </View>
                  <View style={styles.gpaDivider} />
                  <View style={styles.gpaItem}>
                    <Text style={[styles.gpaValue, { color: colors.success }]}>
                      {allGrades.length > 0 ? ((passCount / allGrades.length) * 100).toFixed(0) : 0}%
                    </Text>
                    <Text style={styles.gpaLabel}>Pass Rate</Text>
                  </View>
                </View>
              );
            })()}

          {terms.map((term, idx) => (
            <View key={idx} style={styles.termCard}>
              <View style={styles.termHeader}>
                <Text style={styles.termTitle}>
                  {term.year} — {term.sem}
                </Text>
                <View style={[styles.avgBadge, { backgroundColor: gradeColor(term.average) + "20" }]}>
                  <Text style={[styles.avgText, { color: gradeColor(term.average) }]}>
                    Avg: {term.average.toFixed(1)}
                  </Text>
                </View>
              </View>
              {term.subjects.map((s, i) => (
                <View key={i} style={styles.subjectRow}>
                  <Text style={styles.subjectName} numberOfLines={1}>{s.subject}</Text>
                  <Text style={[styles.subjectGrade, { color: gradeColor(s.grade) }]}>
                    {s.grade.toFixed(0)}
                  </Text>
                </View>
              ))}
            </View>
          ))}

          {/* Term-by-Term Breakdown Table */}
          {termBreakdown && (() => {
            const TERM_LABELS: Record<string, string> = {
              t1_assess: "T1 Assess", t1_final: "T1 Final", sem1: "Sem 1",
              t2_assess: "T2 Assess", t2_final: "T2 Final", sem2: "Sem 2",
              t3_assess: "T3 Assess", t3_final: "T3 Final", sem3: "Sem 3",
              annual: "Annual",
            };
            const allTermKeys = termBreakdown.termCount === 3
              ? ["t1_assess", "t1_final", "sem1", "t2_assess", "t2_final", "sem2", "t3_assess", "t3_final", "sem3", "annual"]
              : ["t1_assess", "t1_final", "sem1", "t2_assess", "t2_final", "sem2", "annual"];
            const activeCols = allTermKeys.filter(k => termBreakdown.terms[k]);

            // Collect all subjects
            const allSubjects = new Set<string>();
            for (const tk of activeCols) {
              const t = termBreakdown.terms[tk];
              if (t) t.subjects.forEach(s => allSubjects.add(s.subject));
            }
            const subjectList = Array.from(allSubjects).sort();

            // Build lookup: termKey → subject → grade
            const lookup: Record<string, Record<string, number>> = {};
            for (const tk of activeCols) {
              const t = termBreakdown.terms[tk];
              if (t) {
                lookup[tk] = {};
                t.subjects.forEach(s => { lookup[tk][s.subject] = s.grade; });
              }
            }

            const isSemOrAnnual = (k: string) => k.startsWith("sem") || k === "annual";

            return (
              <View style={styles.termBreakdownCard}>
                <TouchableOpacity
                  style={styles.termBreakdownToggle}
                  onPress={() => setShowTermTable(!showTermTable)}
                  activeOpacity={0.7}
                >
                  <View>
                    <Text style={styles.termBreakdownTitle}>
                      Term-by-Term Breakdown
                    </Text>
                    <Text style={styles.termBreakdownSub}>
                      20{termBreakdown.year} · {termBreakdown.termCount === 3 ? "3-term" : "2-term"} · {subjectList.length} subjects
                    </Text>
                  </View>
                  <Text style={styles.chevron}>{showTermTable ? "▲" : "▼"}</Text>
                </TouchableOpacity>

                {showTermTable && (
                  <ScrollView horizontal showsHorizontalScrollIndicator>
                    <View>
                      {/* Header row */}
                      <View style={styles.tableRow}>
                        <View style={[styles.tableCell, styles.subjectCell, styles.headerCell]}>
                          <Text style={styles.headerText}>Subject</Text>
                        </View>
                        {activeCols.map(tk => (
                          <View
                            key={tk}
                            style={[
                              styles.tableCell,
                              styles.gradeCell,
                              styles.headerCell,
                              isSemOrAnnual(tk) && (tk === "annual" ? styles.annualHeader : styles.semHeader),
                            ]}
                          >
                            <Text style={[
                              styles.headerText,
                              tk === "annual" && { color: "#1d4ed8" },
                              tk.startsWith("sem") && { color: "#7e22ce" },
                            ]}>
                              {TERM_LABELS[tk] || tk}
                            </Text>
                          </View>
                        ))}
                      </View>

                      {/* Subject rows */}
                      {subjectList.map((subj, idx) => (
                        <View key={subj} style={[styles.tableRow, idx % 2 === 1 && styles.altRow]}>
                          <View style={[styles.tableCell, styles.subjectCell]}>
                            <Text style={styles.tableCellSubjectText} numberOfLines={1}>{subj}</Text>
                          </View>
                          {activeCols.map(tk => {
                            const g = lookup[tk]?.[subj];
                            return (
                              <View
                                key={tk}
                                style={[
                                  styles.tableCell,
                                  styles.gradeCell,
                                  isSemOrAnnual(tk) && (tk === "annual" ? styles.annualCol : styles.semCol),
                                ]}
                              >
                                {g != null ? (
                                  <View style={[styles.gradePill, { backgroundColor: gradeColor(g) + "20", borderColor: gradeColor(g) + "40" }]}>
                                    <Text style={[styles.gradePillText, { color: gradeColor(g) }]}>{g}</Text>
                                  </View>
                                ) : (
                                  <Text style={styles.tableCellMuted}>—</Text>
                                )}
                              </View>
                            );
                          })}
                        </View>
                      ))}

                      {/* Average row */}
                      <View style={[styles.tableRow, styles.avgRow]}>
                        <View style={[styles.tableCell, styles.subjectCell]}>
                          <Text style={[styles.tableCellSubjectText, { fontWeight: "700" }]}>Average</Text>
                        </View>
                        {activeCols.map(tk => {
                          const t = termBreakdown.terms[tk];
                          return (
                            <View
                              key={tk}
                              style={[
                                styles.tableCell,
                                styles.gradeCell,
                                isSemOrAnnual(tk) && (tk === "annual" ? styles.annualCol : styles.semCol),
                              ]}
                            >
                              {t ? (
                                <View style={[styles.gradePill, { backgroundColor: gradeColor(t.avg) + "20", borderColor: gradeColor(t.avg) + "40" }]}>
                                  <Text style={[styles.gradePillText, { color: gradeColor(t.avg) }]}>{t.avg}</Text>
                                </View>
                              ) : (
                                <Text style={styles.tableCellMuted}>—</Text>
                              )}
                            </View>
                          );
                        })}
                      </View>
                    </View>
                  </ScrollView>
                )}
              </View>
            );
          })()}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg },
  title: { fontSize: fontSize["2xl"], fontWeight: "700", color: colors.text, marginBottom: spacing.xs },
  childName: { fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.xl },
  empty: { textAlign: "center", color: colors.textMuted, marginTop: 40 },
  feeWarning: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  feeWarningText: {
    flex: 1,
    fontSize: fontSize.xs,
    color: "#991b1b",
    lineHeight: 18,
  },
  gpaSummary: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.primary + "30",
    padding: spacing.lg,
    marginBottom: spacing.xl,
    alignItems: "center",
    justifyContent: "space-around",
  },
  gpaItem: { alignItems: "center", gap: 2 },
  gpaValue: { fontSize: fontSize.xl, fontWeight: "700", color: colors.text },
  gpaLabel: { fontSize: fontSize.xs, color: colors.textSecondary },
  gpaDivider: { width: 1, height: 30, backgroundColor: colors.border },
  termCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  termHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  termTitle: { fontSize: fontSize.base, fontWeight: "600", color: colors.text },
  avgBadge: {
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  avgText: { fontSize: fontSize.xs, fontWeight: "600" },
  subjectRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  subjectName: { flex: 1, fontSize: fontSize.sm, color: colors.text },
  subjectGrade: { fontSize: fontSize.sm, fontWeight: "600" },

  // Term-by-term breakdown
  termBreakdownCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.primary + "30",
    marginBottom: spacing.md,
    overflow: "hidden",
  },
  termBreakdownToggle: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: spacing.lg,
  },
  termBreakdownTitle: {
    fontSize: fontSize.base,
    fontWeight: "700",
    color: colors.text,
  },
  termBreakdownSub: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  chevron: { fontSize: 14, color: colors.textSecondary },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  altRow: { backgroundColor: colors.background },
  headerCell: {
    backgroundColor: "#f8fafc",
    borderBottomWidth: 2,
    borderBottomColor: colors.border,
  },
  tableCell: {
    paddingHorizontal: 8,
    paddingVertical: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  subjectCell: { width: 140, alignItems: "flex-start" },
  gradeCell: { width: 72 },
  headerText: { fontSize: fontSize.xs, fontWeight: "600", color: colors.textSecondary },
  tableCellSubjectText: { fontSize: fontSize.xs, color: colors.text, fontWeight: "500" },
  tableCellMuted: { fontSize: fontSize.xs, color: colors.textMuted },
  gradePill: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  gradePillText: { fontSize: fontSize.xs, fontWeight: "700" },
  semHeader: { backgroundColor: "#faf5ff" },
  annualHeader: { backgroundColor: "#eff6ff" },
  semCol: { backgroundColor: "#faf5ff50" },
  annualCol: { backgroundColor: "#eff6ff50" },
  avgRow: {
    backgroundColor: "#f1f5f9",
    borderTopWidth: 2,
    borderTopColor: colors.border,
  },
});

