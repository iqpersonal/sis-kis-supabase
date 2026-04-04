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
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useParent } from "@/context/parent-context";
import { colors, spacing, fontSize, radius, commonStyles } from "@/lib/theme";
import ChildSelector from "@/components/ChildSelector";

/* ── Types ── */
interface ProgressEntry {
  subject: string;
  month: string;
  term: string;
  academic_performance: string;
  homework_effort: string;
  participation: string;
  conduct: string;
  notes?: string;
}

const MONTH_ORDER = [
  "September","October","November","December","January",
  "February","March","April","May",
];

/* ── Color helpers ── */
function apColor(v: string) {
  if (v.includes("Outstanding")) return colors.success;
  if (v.includes("Strong")) return colors.primaryLight;
  if (v.includes("Consistent")) return colors.warning;
  if (v.includes("Improvement")) return "#f97316";
  if (v.includes("Major")) return colors.danger;
  if (v.includes("Danger")) return "#b91c1c";
  return colors.textMuted;
}

function hwColor(v: string) {
  if (v.includes("Consistently")) return colors.success;
  if (v.includes("Partially")) return colors.warning;
  return colors.danger;
}

function partColor(v: string) {
  if (v.includes("Highly")) return colors.success;
  if (v.includes("Partially")) return colors.warning;
  return colors.danger;
}

function condColor(v: string) {
  if (v.includes("Respectful")) return colors.success;
  if (v.includes("Disruptive")) return colors.warning;
  return colors.danger;
}

/* ── Screen ── */
export default function ProgressReportScreen() {
  const { selectedChild } = useParent();
  const [entries, setEntries] = useState<ProgressEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [feeBlocked, setFeeBlocked] = useState(false);

  useEffect(() => {
    if (!selectedChild) return;
    const fetch_ = async () => {
      setLoading(true);
      setFeeBlocked(false);
      try {
        /* ── Fee check ── */
        const currentYear = "25-26";
        const progSnap = await getDoc(doc(db, "student_progress", selectedChild.studentNumber));
        if (progSnap.exists()) {
          const fin = progSnap.data().financials || {};
          const sortedFinYears = Object.keys(fin).sort();
          let blocked = false;
          for (let i = 0; i < sortedFinYears.length; i++) {
            const y = sortedFinYears[i];
            const nextY = sortedFinYears[i + 1];
            if (y === currentYear) {
              if (nextY) {
                if ((fin[nextY]?.opening_balance ?? 0) > 0) blocked = true;
              } else {
                if ((fin[y]?.balance ?? 0) > 0) blocked = true;
              }
            }
          }
          if (blocked) {
            setFeeBlocked(true);
            setEntries([]);
            return;
          }
        }

        /* ── Fetch progress reports ── */
        const q = query(
          collection(db, "progress_reports"),
          where("student_number", "==", selectedChild.studentNumber),
          where("academic_year", "==", "25-26")
        );
        const snap = await getDocs(q);
        const rows: ProgressEntry[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            subject: data.subject || "",
            month: data.month || "",
            term: data.term || "",
            academic_performance: data.academic_performance || "",
            homework_effort: data.homework_effort || "",
            participation: data.participation || "",
            conduct: data.conduct || "",
            notes: data.notes || "",
          };
        });
        setEntries(rows);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    };
    fetch_();
  }, [selectedChild]);

  /* Group by month */
  const availableMonths = MONTH_ORDER.filter((m) =>
    entries.some((e) => e.month === m)
  );
  const filtered = selectedMonth
    ? entries.filter((e) => e.month === selectedMonth)
    : entries;
  const grouped: Record<string, ProgressEntry[]> = {};
  for (const e of filtered) {
    (grouped[e.month] = grouped[e.month] || []).push(e);
  }
  const orderedMonths = MONTH_ORDER.filter((m) => grouped[m]);

  if (!selectedChild) {
    return (
      <SafeAreaView style={commonStyles.safeArea}>
        <ScrollView style={commonStyles.container}>
          <ChildSelector />
          <Text style={styles.empty}>Select a child to view progress reports.</Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={commonStyles.safeArea}>
      <ScrollView style={commonStyles.container}>
        <ChildSelector />
        <Text style={styles.title}>Progress Report</Text>

        {loading ? (
          <ActivityIndicator color={colors.primary} size="large" style={{ marginTop: 40 }} />
        ) : feeBlocked ? (
          <View style={styles.emptyCard}>
            <Text style={{ fontSize: 48, marginBottom: spacing.md }}>🔒</Text>
            <Text style={{ color: colors.danger, fontSize: fontSize.lg, fontWeight: "700", marginBottom: spacing.xs }}>
              Progress Report Restricted
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: fontSize.sm, textAlign: "center" }}>
              Progress reports are restricted due to outstanding fees. Please contact the school administration to clear your balance.
            </Text>
          </View>
        ) : entries.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No progress reports available yet.</Text>
          </View>
        ) : (
          <>
            {/* Month filter pills */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pills}>
              <TouchableOpacity
                style={[styles.pill, !selectedMonth && styles.pillActive]}
                onPress={() => setSelectedMonth(null)}
              >
                <Text style={[styles.pillText, !selectedMonth && styles.pillTextActive]}>All</Text>
              </TouchableOpacity>
              {availableMonths.map((m) => (
                <TouchableOpacity
                  key={m}
                  style={[styles.pill, selectedMonth === m && styles.pillActive]}
                  onPress={() => setSelectedMonth(m === selectedMonth ? null : m)}
                >
                  <Text style={[styles.pillText, selectedMonth === m && styles.pillTextActive]}>
                    {m.slice(0, 3)}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Month cards */}
            {orderedMonths.map((month) => (
              <View key={month} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.monthLabel}>{month}</Text>
                  <Text style={styles.termLabel}>{grouped[month][0]?.term}</Text>
                </View>

                {grouped[month].map((r) => (
                  <View key={r.subject} style={styles.subjectRow}>
                    <Text style={styles.subjectName}>{r.subject}</Text>

                    <View style={styles.badges}>
                      <View style={[styles.badge, { backgroundColor: apColor(r.academic_performance) + "22" }]}>
                        <View style={[styles.dot, { backgroundColor: apColor(r.academic_performance) }]} />
                        <Text style={[styles.badgeText, { color: apColor(r.academic_performance) }]} numberOfLines={1}>
                          {r.academic_performance}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.miniRow}>
                      <MiniTag label="HW" value={shortHw(r.homework_effort)} color={hwColor(r.homework_effort)} />
                      <MiniTag label="Part" value={shortPart(r.participation)} color={partColor(r.participation)} />
                      <MiniTag label="Cond" value={shortCond(r.conduct)} color={condColor(r.conduct)} />
                    </View>

                    {r.notes ? (
                      <Text style={styles.notes}>{r.notes}</Text>
                    ) : null}
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

/* ── Short labels ── */
function shortHw(v: string) {
  if (v.includes("Consistently")) return "Done";
  if (v.includes("Partially")) return "Partial";
  return "Missing";
}
function shortPart(v: string) {
  if (v.includes("Highly")) return "High";
  if (v.includes("Partially")) return "Partial";
  return "Low";
}
function shortCond(v: string) {
  if (v.includes("Respectful")) return "Good";
  if (v.includes("Disruptive")) return "Fair";
  return "Poor";
}

/* ── Mini tag component ── */
function MiniTag({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={[styles.miniTag, { borderColor: color + "44" }]}>
      <Text style={[styles.miniLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.miniValue, { color }]}>{value}</Text>
    </View>
  );
}

/* ── Styles ── */
const styles = StyleSheet.create({
  title: {
    color: colors.text,
    fontSize: fontSize["2xl"],
    fontWeight: "700",
    marginBottom: spacing.md,
    marginTop: spacing.sm,
  },
  empty: {
    color: colors.textMuted,
    fontSize: fontSize.base,
    textAlign: "center",
    marginTop: spacing.xl,
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.xl,
    alignItems: "center",
    marginTop: spacing.lg,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: fontSize.base,
  },
  pills: {
    marginBottom: spacing.md,
    flexDirection: "row",
  },
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceLight,
    marginRight: spacing.sm,
  },
  pillActive: {
    backgroundColor: colors.primary,
  },
  pillText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: "500",
  },
  pillTextActive: {
    color: colors.white,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  monthLabel: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: "600",
  },
  termLabel: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
  },
  subjectRow: {
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  subjectName: {
    color: colors.text,
    fontSize: fontSize.base,
    fontWeight: "600",
    marginBottom: spacing.xs,
  },
  badges: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: spacing.xs,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.sm,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: spacing.xs,
  },
  badgeText: {
    fontSize: fontSize.xs,
    fontWeight: "600",
  },
  miniRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  miniTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  miniLabel: {
    fontSize: fontSize.xs - 1,
    fontWeight: "500",
  },
  miniValue: {
    fontSize: fontSize.xs,
    fontWeight: "600",
  },
  notes: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: spacing.xs,
    fontStyle: "italic",
  },
});
