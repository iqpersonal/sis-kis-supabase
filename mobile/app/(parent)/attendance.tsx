import { useState, useEffect } from "react";
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from "react-native";
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

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                     "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function ParentAttendance() {
  const { selectedChild } = useParent();
  const [months, setMonths] = useState<MonthRow[]>([]);
  const [totalAbs, setTotalAbs] = useState(0);
  const [totalTardy, setTotalTardy] = useState(0);
  const [loading, setLoading] = useState(false);

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

        // Aggregate by month
        const monthMap: Record<string, { absences: number; tardy: number }> = {};
        let absTotal = 0;
        let tardTotal = 0;

        absSnap.docs.forEach((d) => {
          const data = d.data();
          const days = Number(data.No_of_Days) || 1;
          absTotal += days;
          const dateStr = String(data.Absence_Date || "");
          const dt = new Date(dateStr);
          if (!isNaN(dt.getTime())) {
            const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
            const label = `${MONTH_NAMES[dt.getMonth()]} ${dt.getFullYear()}`;
            if (!monthMap[key]) monthMap[key] = { absences: 0, tardy: 0 };
            monthMap[key].absences += days;
            // Store label for display
            (monthMap[key] as { absences: number; tardy: number; label?: string }).label = label;
          }
        });

        tardySnap.docs.forEach((d) => {
          const data = d.data();
          tardTotal += 1;
          const dateStr = String(data.Tardy_Date || data.Absence_Date || "");
          const dt = new Date(dateStr);
          if (!isNaN(dt.getTime())) {
            const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
            const label = `${MONTH_NAMES[dt.getMonth()]} ${dt.getFullYear()}`;
            if (!monthMap[key]) monthMap[key] = { absences: 0, tardy: 0 };
            monthMap[key].tardy += 1;
            (monthMap[key] as { absences: number; tardy: number; label?: string }).label = label;
          }
        });

        setTotalAbs(absTotal);
        setTotalTardy(tardTotal);
        setMonths(
          Object.entries(monthMap)
            .sort(([a], [b]) => b.localeCompare(a))
            .map(([, v]) => ({
              month: (v as { absences: number; tardy: number; label?: string }).label || "",
              absences: v.absences,
              tardy: v.tardy,
            }))
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
});

