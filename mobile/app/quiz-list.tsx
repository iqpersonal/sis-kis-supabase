import { useState, useEffect, useCallback } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useParent } from "@/context/parent-context";
import { colors, spacing, fontSize, radius, commonStyles } from "@/lib/theme";
import { quizGet } from "@/lib/quiz-api";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";

interface Assignment {
  id: string;
  title: string;
  title_ar?: string;
  subject: string;
  class_code: string;
  duration_minutes: number;
  question_ids: string[];
  adaptive: boolean;
  status: string;
  end_date: string;
}

interface CompletedQuiz {
  assignment_id: string;
  percentage: number;
  mastery: string;
}

/* NWEA-style grade bands */
const GRADE_BANDS: Record<string, string> = {
  "pre-k": "Pre-K",
  "k-2": "K–2",
  "3-5": "3–5",
  "6-8": "6–8",
  "9-12": "9–12",
};

export default function QuizListScreen() {
  const { selectedChild } = useParent();
  const router = useRouter();

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [completed, setCompleted] = useState<Map<string, CompletedQuiz>>(new Map());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchQuizzes = useCallback(async () => {
    if (!selectedChild) return;
    try {
      // Fetch available assignments for student's class
      const data = await quizGet("assignments", {
        student: selectedChild.studentNumber,
        year: "25-26",
      });
      setAssignments((data.assignments || []).filter((a: Assignment) => a.status === "active"));

      // Fetch completed results
      const rSnap = await getDocs(
        query(
          collection(db, "quiz_results"),
          where("student_id", "==", selectedChild.studentNumber),
          where("year", "==", "25-26")
        )
      );
      const cMap = new Map<string, CompletedQuiz>();
      rSnap.docs.forEach((d) => {
        const data = d.data() as CompletedQuiz;
        cMap.set(data.assignment_id, data);
      });
      setCompleted(cMap);
    } catch (err) {
      console.error("Failed to fetch quizzes:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedChild]);

  useEffect(() => { fetchQuizzes(); }, [fetchQuizzes]);

  const onRefresh = () => { setRefreshing(true); fetchQuizzes(); };

  const masteryColor = (m: string) => {
    switch (m) {
      case "excellent": return colors.success;
      case "proficient": return colors.primary;
      case "developing": return colors.warning;
      default: return colors.danger;
    }
  };

  return (
    <SafeAreaView style={commonStyles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Quizzes</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : assignments.length === 0 ? (
          <View style={styles.center}>
            <Ionicons name="clipboard-outline" size={48} color={colors.textMuted} />
            <Text style={styles.emptyText}>No quizzes available right now</Text>
          </View>
        ) : (
          assignments.map((a) => {
            const done = completed.get(a.id);
            return (
              <TouchableOpacity
                key={a.id}
                style={styles.card}
                activeOpacity={0.7}
                onPress={() => {
                  if (done) return; // Already completed
                  router.push({
                    pathname: "/quiz",
                    params: {
                      assignmentId: a.id,
                      studentId: selectedChild!.studentNumber,
                      studentName: selectedChild!.studentName || selectedChild!.studentNumber,
                    },
                  });
                }}
              >
                <View style={styles.cardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{a.title}</Text>
                    {a.title_ar ? (
                      <Text style={styles.cardTitleAr}>{a.title_ar}</Text>
                    ) : null}
                  </View>
                  {done ? (
                    <View style={[styles.statusBadge, { backgroundColor: masteryColor(done.mastery) }]}>
                      <Text style={styles.statusText}>{done.percentage}%</Text>
                    </View>
                  ) : (
                    <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
                  )}
                </View>

                <View style={styles.cardMeta}>
                  <View style={styles.metaItem}>
                    <Ionicons name="book-outline" size={14} color={colors.textMuted} />
                    <Text style={styles.metaText}>{a.subject}</Text>
                  </View>
                  <View style={styles.metaItem}>
                    <Ionicons name="school-outline" size={14} color={colors.textMuted} />
                    <Text style={styles.metaText}>{GRADE_BANDS[a.class_code] || a.class_code}</Text>
                  </View>
                  <View style={styles.metaItem}>
                    <Ionicons name="time-outline" size={14} color={colors.textMuted} />
                    <Text style={styles.metaText}>{a.duration_minutes}m</Text>
                  </View>
                  <View style={styles.metaItem}>
                    <Ionicons name="help-circle-outline" size={14} color={colors.textMuted} />
                    <Text style={styles.metaText}>{a.question_ids?.length || 0} Qs</Text>
                  </View>
                  {a.adaptive && (
                    <View style={styles.adaptiveBadge}>
                      <Text style={styles.adaptiveText}>Adaptive</Text>
                    </View>
                  )}
                </View>

                {done && (
                  <View style={styles.completedRow}>
                    <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                    <Text style={styles.completedText}>
                      Completed — {done.mastery?.replace("_", " ")}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: fontSize.xl,
    fontWeight: "700",
    color: colors.text,
  },
  content: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  center: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
    gap: spacing.md,
  },
  emptyText: {
    fontSize: fontSize.base,
    color: colors.textMuted,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  cardTitle: {
    fontSize: fontSize.base,
    fontWeight: "600",
    color: colors.text,
  },
  cardTitleAr: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: "right",
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  statusText: {
    color: colors.white,
    fontWeight: "700",
    fontSize: fontSize.sm,
  },
  cardMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    alignItems: "center",
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metaText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  adaptiveBadge: {
    backgroundColor: "rgba(139,92,246,0.2)",
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  adaptiveText: {
    fontSize: fontSize.xs,
    fontWeight: "600",
    color: "#a78bfa",
  },
  completedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  completedText: {
    fontSize: fontSize.xs,
    color: colors.success,
  },
});
