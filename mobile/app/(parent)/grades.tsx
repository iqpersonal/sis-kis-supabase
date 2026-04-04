import { useState, useEffect } from "react";
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from "react-native";
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

export default function ParentGrades() {
  const { selectedChild } = useParent();
  const [terms, setTerms] = useState<TermGrades[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasUnpaidFees, setHasUnpaidFees] = useState(false);

  useEffect(() => {
    if (!selectedChild) return;
    const fetchGrades = async () => {
      setLoading(true);
      setHasUnpaidFees(false);
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
});

