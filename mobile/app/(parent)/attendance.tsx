import { useState, useEffect } from "react";
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { collection, query, where, getDocs, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useParent } from "@/context/parent-context";
import { colors, spacing, fontSize, radius, commonStyles } from "@/lib/theme";
import ChildSelector from "@/components/ChildSelector";

interface MonthRow {
  month: string;
  absences: number;
  tardy: number;
}

interface YearRow {
  year: string;
  absences: number;
  tardy: number;
}

interface AbsenceRecord {
  date: string;
  days: number;
  reason: string;
  year: string;
}

interface TardyRecord {
  date: string;
  reason: string;
  year: string;
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                     "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function ParentAttendance() {
  const { selectedChild } = useParent();
  const [months, setMonths] = useState<MonthRow[]>([]);
  const [years, setYears] = useState<YearRow[]>([]);
  const [recentAbsences, setRecentAbsences] = useState<AbsenceRecord[]>([]);
  const [recentTardies, setRecentTardies] = useState<TardyRecord[]>([]);
  const [totalAbs, setTotalAbs] = useState(0);
  const [totalTardy, setTotalTardy] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showAllAbsences, setShowAllAbsences] = useState(false);
  const [showAllTardies, setShowAllTardies] = useState(false);

  useEffect(() => {
    if (!selectedChild) return;
    const fetchAttendance = async () => {
      setLoading(true);
      try {
        // Fetch absences
        const absQuery = query(
          collection(db, "student_absence"),
          where("Student_Number", "==", selectedChild.studentNumber),
          limit(500)
        );
        const absSnap = await getDocs(absQuery);

        // Fetch tardies
        const tardyQuery = query(
          collection(db, "student_tardy"),
          where("Student_Number", "==", selectedChild.studentNumber),
          limit(500)
        );
        const tardySnap = await getDocs(tardyQuery);

        // Aggregate by month + year, collect individual records
        const monthMap: Record<string, { absences: number; tardy: number; label?: string }> = {};
        const yearMap: Record<string, { absences: number; tardy: number }> = {};
        const absRecords: AbsenceRecord[] = [];
        const tardRecords: TardyRecord[] = [];
        let absTotal = 0;
        let tardTotal = 0;

        absSnap.docs.forEach((d) => {
          const data = d.data();
          const days = Number(data.No_of_Days) || 1;
          absTotal += days;
          const dateStr = String(data.Absence_Date || "");
          const yearCode = String(data.Year_Code || "");
          const dt = new Date(dateStr);

          absRecords.push({
            date: dateStr,
            days,
            reason: data.Absence_Reason_Desc || data.Absence_Reason_Code || "",
            year: yearCode,
          });

          if (yearCode) {
            if (!yearMap[yearCode]) yearMap[yearCode] = { absences: 0, tardy: 0 };
            yearMap[yearCode].absences += days;
          }

          if (!isNaN(dt.getTime())) {
            const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
            const label = `${MONTH_NAMES[dt.getMonth()]} ${dt.getFullYear()}`;
            if (!monthMap[key]) monthMap[key] = { absences: 0, tardy: 0 };
            monthMap[key].absences += days;
            monthMap[key].label = label;
          }
        });

        tardySnap.docs.forEach((d) => {
          const data = d.data();
          tardTotal += 1;
          const dateStr = String(data.Tardy_Date || data.Absence_Date || "");
          const yearCode = String(data.Year_Code || "");
          const dt = new Date(dateStr);

          tardRecords.push({
            date: dateStr,
            reason: data.Tardy_Reason_Desc || data.Tardy_Reason_Code || "",
            year: yearCode,
          });

          if (yearCode) {
            if (!yearMap[yearCode]) yearMap[yearCode] = { absences: 0, tardy: 0 };
            yearMap[yearCode].tardy += 1;
          }

          if (!isNaN(dt.getTime())) {
            const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
            const label = `${MONTH_NAMES[dt.getMonth()]} ${dt.getFullYear()}`;
            if (!monthMap[key]) monthMap[key] = { absences: 0, tardy: 0 };
            monthMap[key].tardy += 1;
            monthMap[key].label = label;
          }
        });

        setTotalAbs(absTotal);
        setTotalTardy(tardTotal);
        setMonths(
          Object.entries(monthMap)
            .sort(([a], [b]) => b.localeCompare(a))
            .map(([, v]) => ({
              month: v.label || "",
              absences: v.absences,
              tardy: v.tardy,
            }))
        );
        setYears(
          Object.entries(yearMap)
            .sort(([a], [b]) => b.localeCompare(a))
            .map(([k, v]) => ({
              year: `20${k}`,
              absences: v.absences,
              tardy: v.tardy,
            }))
        );
        setRecentAbsences(
          absRecords
            .filter((r) => r.date)
            .sort((a, b) => b.date.localeCompare(a.date))
            .slice(0, 20)
        );
        setRecentTardies(
          tardRecords
            .filter((r) => r.date)
            .sort((a, b) => b.date.localeCompare(a.date))
            .slice(0, 20)
        );
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    };
    fetchAttendance();
  }, [selectedChild]);

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
        <Text style={styles.title}>Attendance</Text>
        <Text style={styles.childName}>{selectedChild.fullName}</Text>

        <ChildSelector />

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : (
          <>
            {/* Summary Cards */}
            <View style={styles.summaryRow}>
              <View style={[styles.summaryCard, styles.abCard]}>
                <Text style={styles.summaryValue}>{totalAbs}</Text>
                <Text style={styles.summaryLabel}>Absence Days</Text>
              </View>
              <View style={[styles.summaryCard, styles.tardyCard]}>
                <Text style={styles.summaryValue}>{totalTardy}</Text>
                <Text style={styles.summaryLabel}>Tardy Days</Text>
              </View>
            </View>

            {/* Monthly Breakdown */}
            {months.length > 0 && (
              <View style={styles.table}>
                <Text style={styles.sectionTitle}>Monthly Breakdown</Text>
                <View style={styles.tableHeader}>
                  <Text style={[styles.headerCell, { flex: 2 }]}>Month</Text>
                  <Text style={styles.headerCell}>Absences</Text>
                  <Text style={styles.headerCell}>Tardy</Text>
                </View>
                {months.map((m) => (
                  <View key={m.month} style={styles.tableRow}>
                    <Text style={[styles.cell, { flex: 2 }]}>{m.month}</Text>
                    <Text style={[styles.cell, m.absences > 3 && { color: colors.danger }]}>
                      {m.absences}
                    </Text>
                    <Text style={[styles.cell, m.tardy > 3 && { color: colors.warning }]}>
                      {m.tardy}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* Yearly Breakdown */}
            {years.length > 0 && (
              <View style={[styles.table, { marginTop: spacing.md }]}>
                <Text style={styles.sectionTitle}>Yearly Breakdown</Text>
                <View style={styles.tableHeader}>
                  <Text style={[styles.headerCell, { flex: 2 }]}>Year</Text>
                  <Text style={styles.headerCell}>Absences</Text>
                  <Text style={styles.headerCell}>Tardy</Text>
                </View>
                {years.map((y) => (
                  <View key={y.year} style={styles.tableRow}>
                    <Text style={[styles.cell, { flex: 2, fontWeight: "600" }]}>{y.year}</Text>
                    <Text style={[styles.cell, y.absences > 10 && { color: colors.danger }]}>
                      {y.absences}
                    </Text>
                    <Text style={[styles.cell, y.tardy > 10 && { color: colors.warning }]}>
                      {y.tardy}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* Recent Absences */}
            {recentAbsences.length > 0 && (
              <View style={[styles.table, { marginTop: spacing.md }]}>
                <Text style={styles.sectionTitle}>Recent Absences</Text>
                {(showAllAbsences ? recentAbsences : recentAbsences.slice(0, 5)).map((r, i) => (
                  <View key={`abs-${i}`} style={styles.recordRow}>
                    <View style={styles.recordDot} />
                    <View style={{ flex: 1 }}>
                      <View style={styles.recordHeader}>
                        <Text style={styles.recordDate}>{formatDate(r.date)}</Text>
                        <View style={styles.daysBadge}>
                          <Text style={styles.daysBadgeText}>
                            {r.days} day{r.days !== 1 ? "s" : ""}
                          </Text>
                        </View>
                      </View>
                      {r.reason ? (
                        <Text style={styles.recordReason}>{r.reason}</Text>
                      ) : null}
                    </View>
                  </View>
                ))}
                {recentAbsences.length > 5 && (
                  <TouchableOpacity
                    onPress={() => setShowAllAbsences(!showAllAbsences)}
                    style={styles.showMoreBtn}
                  >
                    <Text style={styles.showMoreText}>
                      {showAllAbsences ? "Show less" : `Show all ${recentAbsences.length}`}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Recent Tardies */}
            {recentTardies.length > 0 && (
              <View style={[styles.table, { marginTop: spacing.md }]}>
                <Text style={styles.sectionTitle}>Recent Tardies</Text>
                {(showAllTardies ? recentTardies : recentTardies.slice(0, 5)).map((r, i) => (
                  <View key={`tard-${i}`} style={styles.recordRow}>
                    <View style={[styles.recordDot, { backgroundColor: colors.warning }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.recordDate}>{formatDate(r.date)}</Text>
                      {r.reason ? (
                        <Text style={styles.recordReason}>{r.reason}</Text>
                      ) : null}
                    </View>
                  </View>
                ))}
                {recentTardies.length > 5 && (
                  <TouchableOpacity
                    onPress={() => setShowAllTardies(!showAllTardies)}
                    style={styles.showMoreBtn}
                  >
                    <Text style={styles.showMoreText}>
                      {showAllTardies ? "Show less" : `Show all ${recentTardies.length}`}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return dateStr;
  }
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg },
  title: { fontSize: fontSize["2xl"], fontWeight: "700", color: colors.text, marginBottom: spacing.xs },
  childName: { fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.xl },
  summaryRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.xl },
  summaryCard: {
    flex: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: "center",
    gap: spacing.xs,
  },
  abCard: { backgroundColor: colors.danger + "15", borderWidth: 1, borderColor: colors.danger + "30" },
  tardyCard: { backgroundColor: colors.warning + "15", borderWidth: 1, borderColor: colors.warning + "30" },
  summaryValue: { fontSize: fontSize["2xl"], fontWeight: "700", color: colors.text },
  summaryLabel: { fontSize: fontSize.xs, color: colors.textSecondary },
  table: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  sectionTitle: { fontSize: fontSize.base, fontWeight: "600", color: colors.text, marginBottom: spacing.md },
  tableHeader: { flexDirection: "row", paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerCell: { flex: 1, fontSize: fontSize.xs, fontWeight: "600", color: colors.textSecondary },
  tableRow: { flexDirection: "row", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  cell: { flex: 1, fontSize: fontSize.sm, color: colors.text },
  recordRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  recordDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.danger,
    marginTop: 5,
  },
  recordHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  recordDate: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: colors.text,
  },
  daysBadge: {
    backgroundColor: colors.danger + "15",
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  daysBadgeText: {
    fontSize: fontSize.xs,
    color: colors.danger,
    fontWeight: "600",
  },
  recordReason: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  showMoreBtn: {
    alignItems: "center",
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
  },
  showMoreText: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: "600",
  },
});

