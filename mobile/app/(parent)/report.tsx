import { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { doc, getDoc } from "firebase/firestore";
import { useRouter } from "expo-router";
import { db } from "@/lib/firebase";
import { useParent } from "@/context/parent-context";
import { colors, spacing, fontSize, radius, commonStyles } from "@/lib/theme";
import ChildSelector from "@/components/ChildSelector";
import type { StudentProgress, ProgressYearData } from "@/types";

function gradePoints(g: number): number {
  if (g >= 90) return 4;
  if (g >= 80) return 3;
  if (g >= 70) return 2;
  if (g >= 60) return 1;
  return 0;
}

function gradeColor(g: number): string {
  if (g >= 90) return colors.success;
  if (g >= 75) return colors.primaryLight;
  if (g >= 60) return colors.warning;
  return colors.danger;
}

function letterGrade(g: number): string {
  if (g >= 90) return "A";
  if (g >= 80) return "B";
  if (g >= 70) return "C";
  if (g >= 60) return "D";
  return "F";
}

export default function AcademicReport() {
  const { selectedChild } = useParent();
  const router = useRouter();
  const [progress, setProgress] = useState<StudentProgress | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedChild) return;
    const fetchProgress = async () => {
      setLoading(true);
      try {
        const ref = doc(db, "student_progress", selectedChild.studentNumber);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          setProgress(snap.data() as StudentProgress);
        } else {
          setProgress(null);
        }
      } catch {
        setProgress(null);
      } finally {
        setLoading(false);
      }
    };
    fetchProgress();
  }, [selectedChild]);

  if (!selectedChild) {
    return (
      <SafeAreaView style={commonStyles.centered}>
        <Text style={{ color: colors.textMuted }}>Select a child first</Text>
      </SafeAreaView>
    );
  }

  const yearKeys = progress ? Object.keys(progress.years).sort() : [];
  const yearData = yearKeys.map((yr) => ({
    year: yr,
    ...progress!.years[yr],
  }));

  // GPA per year
  const gpaPerYear = yearData.map((yd) => {
    const subs = yd.transcript_subjects || yd.subjects || [];
    const calc = subs.filter((s) => s.calculated && (s.credit_hours ?? 0) > 0);
    let w = 0,
      c = 0;
    for (const s of calc) {
      w += gradePoints(s.grade) * (s.credit_hours ?? 1);
      c += s.credit_hours ?? 1;
    }
    return {
      year: yd.year,
      className: yd.class_name,
      avg: yd.overall_avg,
      gpa: c > 0 ? w / c : 0,
    };
  });

  // Cumulative GPA
  let cumW = 0,
    cumC = 0;
  for (const yd of yearData) {
    const subs = yd.transcript_subjects || yd.subjects || [];
    const calc = subs.filter((s) => s.calculated && (s.credit_hours ?? 0) > 0);
    for (const s of calc) {
      cumW += gradePoints(s.grade) * (s.credit_hours ?? 1);
      cumC += s.credit_hours ?? 1;
    }
  }
  const cumulativeGPA = cumC > 0 ? cumW / cumC : 0;

  // Subject analysis from latest year
  const latestYear = yearKeys.length > 0 ? progress!.years[yearKeys[yearKeys.length - 1]] : null;
  const latestSubjects = latestYear
    ? (latestYear.subjects || latestYear.transcript_subjects || [])
        .filter((s) => typeof s.grade === "number" && s.grade > 0)
        .sort((a, b) => b.grade - a.grade)
    : [];

  const strongest = latestSubjects.slice(0, 3);
  const weakest = latestSubjects.slice(-3).reverse();

  // Year-over-year trend
  const allAvgs = yearData.map((y) => y.overall_avg).filter((v) => typeof v === "number");
  const trend =
    allAvgs.length >= 2 ? allAvgs[allAvgs.length - 1] - allAvgs[allAvgs.length - 2] : null;

  // Bar chart max
  const maxAvg = Math.max(...allAvgs, 100);

  return (
    <SafeAreaView style={commonStyles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Academic Report</Text>
        <Text style={styles.childName}>{selectedChild.fullName}</Text>

        <ChildSelector />

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : !progress || yearKeys.length === 0 ? (
          <Text style={styles.empty}>No academic data available</Text>
        ) : (
          <>
            {/* Cumulative GPA Card */}
            <View style={styles.gpaCard}>
              <View style={styles.gpaMain}>
                <Text style={styles.gpaValue}>{cumulativeGPA.toFixed(2)}</Text>
                <Text style={styles.gpaLabel}>Cumulative GPA</Text>
                <Text style={styles.gpaScale}>/ 4.00</Text>
              </View>
              <View style={styles.gpaRight}>
                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>Latest Avg</Text>
                  <Text style={[styles.statValue, { color: gradeColor(allAvgs[allAvgs.length - 1]) }]}>
                    {allAvgs[allAvgs.length - 1]?.toFixed(1)}%
                  </Text>
                </View>
                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>Years</Text>
                  <Text style={styles.statValue}>{yearKeys.length}</Text>
                </View>
                {trend !== null && (
                  <View style={styles.statRow}>
                    <Text style={styles.statLabel}>Trend</Text>
                    <Text
                      style={[
                        styles.statValue,
                        { color: trend >= 0 ? colors.success : colors.danger },
                      ]}
                    >
                      {trend >= 0 ? "▲" : "▼"} {Math.abs(trend).toFixed(1)}%
                    </Text>
                  </View>
                )}
              </View>
            </View>

            {/* GPA Trend Bar Chart */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Average Trend</Text>
              <View style={styles.chartCard}>
                {gpaPerYear.map((item, idx) => (
                  <View key={item.year} style={styles.barRow}>
                    <View style={styles.barLabelCol}>
                      <Text style={styles.barLabel}>{item.className || item.year}</Text>
                      <Text style={styles.barYear}>
                        {item.year.length === 5
                          ? `20${item.year}`
                          : item.year}
                      </Text>
                    </View>
                    <View style={styles.barTrack}>
                      <View
                        style={[
                          styles.barFill,
                          {
                            width: `${(item.avg / maxAvg) * 100}%`,
                            backgroundColor: gradeColor(item.avg),
                          },
                        ]}
                      />
                    </View>
                    <View style={styles.barValueCol}>
                      <Text style={[styles.barValue, { color: gradeColor(item.avg) }]}>
                        {item.avg.toFixed(1)}
                      </Text>
                      <Text style={styles.barGpa}>{item.gpa.toFixed(2)}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>

            {/* Subject Strength Analysis */}
            {latestSubjects.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>
                  Subject Analysis — {latestYear?.class_name || yearKeys[yearKeys.length - 1]}
                </Text>

                {/* Strongest */}
                <View style={styles.analysisCard}>
                  <Text style={styles.analysisTitle}>🌟 Strongest</Text>
                  {strongest.map((s) => (
                    <TouchableOpacity
                      key={s.subject}
                      style={styles.subjectRow}
                      onPress={() =>
                        router.push(
                          `/subject-detail?student=${selectedChild.studentNumber}&subject=${encodeURIComponent(s.subject)}`
                        )
                      }
                      activeOpacity={0.7}
                    >
                      <Text style={styles.subjectName} numberOfLines={1}>
                        {s.subject}
                      </Text>
                      <View style={styles.gradeRow}>
                        <Text style={[styles.subjectGrade, { color: gradeColor(s.grade) }]}>
                          {s.grade.toFixed(0)}%
                        </Text>
                        <Text style={[styles.letterBadge, { color: gradeColor(s.grade) }]}>
                          {letterGrade(s.grade)}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Weakest */}
                <View style={[styles.analysisCard, { marginTop: spacing.sm }]}>
                  <Text style={styles.analysisTitle}>⚠️ Needs Attention</Text>
                  {weakest.map((s) => (
                    <TouchableOpacity
                      key={s.subject}
                      style={styles.subjectRow}
                      onPress={() =>
                        router.push(
                          `/subject-detail?student=${selectedChild.studentNumber}&subject=${encodeURIComponent(s.subject)}`
                        )
                      }
                      activeOpacity={0.7}
                    >
                      <Text style={styles.subjectName} numberOfLines={1}>
                        {s.subject}
                      </Text>
                      <View style={styles.gradeRow}>
                        <Text style={[styles.subjectGrade, { color: gradeColor(s.grade) }]}>
                          {s.grade.toFixed(0)}%
                        </Text>
                        <Text style={[styles.letterBadge, { color: gradeColor(s.grade) }]}>
                          {letterGrade(s.grade)}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* All Subjects - Latest Year */}
            {latestSubjects.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>All Subjects</Text>
                <View style={styles.chartCard}>
                  {latestSubjects.map((s) => (
                    <TouchableOpacity
                      key={s.subject}
                      style={styles.barRow}
                      onPress={() =>
                        router.push(
                          `/subject-detail?student=${selectedChild.studentNumber}&subject=${encodeURIComponent(s.subject)}`
                        )
                      }
                      activeOpacity={0.7}
                    >
                      <View style={[styles.barLabelCol, { flex: 2 }]}>
                        <Text style={styles.barLabel} numberOfLines={1}>
                          {s.subject}
                        </Text>
                      </View>
                      <View style={styles.barTrack}>
                        <View
                          style={[
                            styles.barFill,
                            {
                              width: `${s.grade}%`,
                              backgroundColor: gradeColor(s.grade),
                            },
                          ]}
                        />
                      </View>
                      <View style={styles.barValueCol}>
                        <Text style={[styles.barValue, { color: gradeColor(s.grade) }]}>
                          {s.grade.toFixed(0)}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* Year-over-Year Table */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Year-over-Year Summary</Text>
              <View style={styles.tableCard}>
                <View style={styles.tableHeader}>
                  <Text style={[styles.headerCell, { flex: 1.5 }]}>Year</Text>
                  <Text style={styles.headerCell}>Class</Text>
                  <Text style={styles.headerCell}>Avg</Text>
                  <Text style={styles.headerCell}>GPA</Text>
                  <Text style={styles.headerCell}>Grade</Text>
                </View>
                {gpaPerYear.map((item) => (
                  <View key={item.year} style={styles.tableRow}>
                    <Text style={[styles.cell, { flex: 1.5 }]}>
                      {item.year.length === 5 ? `20${item.year}` : item.year}
                    </Text>
                    <Text style={styles.cell}>{item.className}</Text>
                    <Text style={[styles.cell, { color: gradeColor(item.avg), fontWeight: "600" }]}>
                      {item.avg.toFixed(1)}
                    </Text>
                    <Text style={[styles.cell, { fontWeight: "600" }]}>
                      {item.gpa.toFixed(2)}
                    </Text>
                    <Text style={[styles.cell, { color: gradeColor(item.avg) }]}>
                      {letterGrade(item.avg)}
                    </Text>
                  </View>
                ))}
                {/* Cumulative row */}
                <View style={[styles.tableRow, styles.totalRow]}>
                  <Text style={[styles.cell, styles.totalCell, { flex: 1.5 }]}>Cumulative</Text>
                  <Text style={[styles.cell, styles.totalCell]}>—</Text>
                  <Text style={[styles.cell, styles.totalCell]}>
                    {allAvgs.length > 0
                      ? (allAvgs.reduce((a, b) => a + b, 0) / allAvgs.length).toFixed(1)
                      : "—"}
                  </Text>
                  <Text style={[styles.cell, styles.totalCell]}>{cumulativeGPA.toFixed(2)}</Text>
                  <Text style={[styles.cell, styles.totalCell]}>
                    {letterGrade(
                      allAvgs.length > 0
                        ? allAvgs.reduce((a, b) => a + b, 0) / allAvgs.length
                        : 0
                    )}
                  </Text>
                </View>
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg },
  title: {
    fontSize: fontSize["2xl"],
    fontWeight: "700",
    color: colors.text,
    marginBottom: spacing.xs,
  },
  childName: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  empty: { textAlign: "center", color: colors.textMuted, marginTop: 40 },

  // GPA Card
  gpaCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.primary + "40",
    padding: spacing.lg,
    flexDirection: "row",
    marginBottom: spacing.xl,
  },
  gpaMain: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRightWidth: 1,
    borderRightColor: colors.border,
    paddingRight: spacing.md,
  },
  gpaValue: {
    fontSize: 36,
    fontWeight: "800",
    color: colors.primary,
  },
  gpaLabel: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  gpaScale: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  gpaRight: {
    flex: 1,
    paddingLeft: spacing.md,
    justifyContent: "center",
    gap: spacing.sm,
  },
  statRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  statLabel: { fontSize: fontSize.xs, color: colors.textSecondary },
  statValue: { fontSize: fontSize.sm, fontWeight: "600", color: colors.text },

  // Section
  section: { marginBottom: spacing.xl },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: "600",
    color: colors.text,
    marginBottom: spacing.md,
  },

  // Bar Chart
  chartCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  barRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  barLabelCol: {
    flex: 1,
  },
  barLabel: {
    fontSize: fontSize.xs,
    color: colors.text,
    fontWeight: "500",
  },
  barYear: {
    fontSize: 10,
    color: colors.textMuted,
  },
  barTrack: {
    flex: 2,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.border,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: 7,
    opacity: 0.85,
  },
  barValueCol: {
    width: 45,
    alignItems: "flex-end",
  },
  barValue: {
    fontSize: fontSize.xs,
    fontWeight: "700",
  },
  barGpa: {
    fontSize: 10,
    color: colors.textMuted,
  },

  // Analysis Cards
  analysisCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  analysisTitle: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: colors.text,
    marginBottom: spacing.sm,
  },
  subjectRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  subjectName: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.text,
  },
  gradeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  subjectGrade: {
    fontSize: fontSize.sm,
    fontWeight: "600",
  },
  letterBadge: {
    fontSize: fontSize.xs,
    fontWeight: "700",
  },

  // Table
  tableCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  tableHeader: {
    flexDirection: "row",
    padding: spacing.sm,
    backgroundColor: colors.primaryDark,
  },
  headerCell: {
    flex: 1,
    fontSize: fontSize.xs,
    fontWeight: "600",
    color: colors.white,
    textAlign: "center",
  },
  tableRow: {
    flexDirection: "row",
    padding: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  cell: {
    flex: 1,
    fontSize: fontSize.xs,
    color: colors.text,
    textAlign: "center",
  },
  totalRow: {
    backgroundColor: colors.primaryDark + "20",
  },
  totalCell: {
    fontWeight: "700",
    color: colors.primary,
  },
});
