import { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { colors, spacing, fontSize, radius, commonStyles } from "@/lib/theme";
import type { StudentProgress } from "@/types";

function gradeColor(g: number): string {
  if (g >= 90) return colors.success;
  if (g >= 75) return colors.primaryLight;
  if (g >= 60) return colors.warning;
  return colors.danger;
}

export default function SubjectDetailScreen() {
  const { student, subject } = useLocalSearchParams<{
    student: string;
    subject: string;
  }>();
  const decodedSubject = subject ? decodeURIComponent(subject) : "";

  const [progress, setProgress] = useState<StudentProgress | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!student) return;
    const fetchData = async () => {
      setLoading(true);
      try {
        const ref = doc(db, "student_progress", student);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          setProgress(snap.data() as StudentProgress);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [student]);

  if (loading) {
    return (
      <SafeAreaView style={commonStyles.centered}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (!progress) {
    return (
      <SafeAreaView style={commonStyles.centered}>
        <Text style={{ color: colors.textMuted }}>Student not found</Text>
      </SafeAreaView>
    );
  }

  // Gather subject grades across all years
  const yearKeys = Object.keys(progress.years).sort();
  const yearGrades: {
    year: string;
    className: string;
    grade: number | null;
    sem1: number | null;
    sem2: number | null;
    sem3: number | null;
  }[] = [];

  for (const yr of yearKeys) {
    const yd = progress.years[yr];

    // Find subject in annual / transcript_subjects
    const annual =
      (yd.transcript_subjects || yd.subjects || []).find(
        (s) => s.subject === decodedSubject
      )?.grade ?? null;

    const sem1 =
      (yd.transcript_sem1 || []).find((s) => s.subject === decodedSubject)
        ?.grade ?? null;
    const sem2 =
      (yd.transcript_sem2 || []).find((s) => s.subject === decodedSubject)
        ?.grade ?? null;
    const sem3 =
      (yd.transcript_sem3 || []).find((s) => s.subject === decodedSubject)
        ?.grade ?? null;

    if (annual !== null || sem1 !== null || sem2 !== null || sem3 !== null) {
      yearGrades.push({
        year: yr,
        className: yd.class_name,
        grade: annual,
        sem1,
        sem2,
        sem3,
      });
    }
  }

  // Calculate trend
  const grades = yearGrades.map((y) => y.grade).filter((g): g is number => g !== null);
  const trend =
    grades.length >= 2 ? grades[grades.length - 1] - grades[grades.length - 2] : null;
  const avg = grades.length > 0 ? grades.reduce((a, b) => a + b, 0) / grades.length : 0;
  const highest = grades.length > 0 ? Math.max(...grades) : 0;
  const lowest = grades.length > 0 ? Math.min(...grades) : 0;

  // Max for bar chart
  const maxGrade = 100;

  return (
    <SafeAreaView style={commonStyles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>{decodedSubject}</Text>
        <Text style={styles.subtitle}>{progress.student_name}</Text>

        {yearGrades.length === 0 ? (
          <Text style={styles.empty}>
            No records found for this subject
          </Text>
        ) : (
          <>
            {/* Stats Cards */}
            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Average</Text>
                <Text style={[styles.statValue, { color: gradeColor(avg) }]}>
                  {avg.toFixed(1)}
                </Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Highest</Text>
                <Text style={[styles.statValue, { color: colors.success }]}>
                  {highest.toFixed(0)}
                </Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Lowest</Text>
                <Text style={[styles.statValue, { color: gradeColor(lowest) }]}>
                  {lowest.toFixed(0)}
                </Text>
              </View>
              {trend !== null && (
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>Trend</Text>
                  <Text
                    style={[
                      styles.statValue,
                      { color: trend >= 0 ? colors.success : colors.danger },
                    ]}
                  >
                    {trend >= 0 ? "▲" : "▼"}{Math.abs(trend).toFixed(1)}
                  </Text>
                </View>
              )}
            </View>

            {/* Grade Trend Bar Chart */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Grade History</Text>
              <View style={styles.chartCard}>
                {yearGrades.map((item) => (
                  <View key={item.year} style={styles.barRow}>
                    <View style={styles.barLabelCol}>
                      <Text style={styles.barLabel}>{item.className}</Text>
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
                            width: `${((item.grade ?? 0) / maxGrade) * 100}%`,
                            backgroundColor: gradeColor(item.grade ?? 0),
                          },
                        ]}
                      />
                    </View>
                    <Text
                      style={[
                        styles.barValue,
                        { color: gradeColor(item.grade ?? 0) },
                      ]}
                    >
                      {item.grade !== null ? item.grade.toFixed(0) : "—"}
                    </Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Semester Breakdown Table */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Semester Breakdown</Text>
              <View style={styles.tableCard}>
                <View style={styles.tableHeader}>
                  <Text style={[styles.headerCell, { flex: 1.2 }]}>Year</Text>
                  <Text style={styles.headerCell}>Class</Text>
                  <Text style={styles.headerCell}>Sem 1</Text>
                  <Text style={styles.headerCell}>Sem 2</Text>
                  <Text style={styles.headerCell}>Total</Text>
                </View>
                {yearGrades.map((item) => (
                  <View key={item.year} style={styles.tableRow}>
                    <Text style={[styles.cell, { flex: 1.2 }]}>
                      {item.year.length === 5 ? `20${item.year}` : item.year}
                    </Text>
                    <Text style={styles.cell}>{item.className}</Text>
                    <Text
                      style={[
                        styles.cell,
                        item.sem1 !== null && { color: gradeColor(item.sem1) },
                      ]}
                    >
                      {item.sem1 !== null ? item.sem1.toFixed(0) : "—"}
                    </Text>
                    <Text
                      style={[
                        styles.cell,
                        item.sem2 !== null && { color: gradeColor(item.sem2) },
                      ]}
                    >
                      {item.sem2 !== null ? item.sem2.toFixed(0) : "—"}
                    </Text>
                    <Text
                      style={[
                        styles.cell,
                        item.grade !== null && {
                          color: gradeColor(item.grade),
                          fontWeight: "700",
                        },
                      ]}
                    >
                      {item.grade !== null ? item.grade.toFixed(0) : "—"}
                    </Text>
                  </View>
                ))}
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
  subtitle: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.xl,
  },
  empty: { textAlign: "center", color: colors.textMuted, marginTop: 40 },

  // Stats
  statsRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.xl,
    flexWrap: "wrap",
  },
  statCard: {
    flex: 1,
    minWidth: 70,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    alignItems: "center",
    gap: 2,
  },
  statLabel: { fontSize: 10, color: colors.textSecondary },
  statValue: { fontSize: fontSize.lg, fontWeight: "700", color: colors.text },

  // Section
  section: { marginBottom: spacing.xl },
  sectionTitle: {
    fontSize: fontSize.base,
    fontWeight: "600",
    color: colors.text,
    marginBottom: spacing.md,
  },

  // Chart
  chartCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.md,
  },
  barRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  barLabelCol: { flex: 1 },
  barLabel: { fontSize: fontSize.xs, color: colors.text, fontWeight: "500" },
  barYear: { fontSize: 10, color: colors.textMuted },
  barTrack: {
    flex: 2,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.border,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: 8,
    opacity: 0.85,
  },
  barValue: {
    width: 35,
    fontSize: fontSize.sm,
    fontWeight: "700",
    textAlign: "right",
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
});
