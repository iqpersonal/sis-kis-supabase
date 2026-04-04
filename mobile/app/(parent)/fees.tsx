import { useState, useEffect } from "react";
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { doc, getDoc, collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useParent } from "@/context/parent-context";
import { colors, spacing, fontSize, radius, commonStyles } from "@/lib/theme";
import ChildSelector from "@/components/ChildSelector";

interface FeeRow {
  year: string;
  openingBalance: number;
  paid: number;
  balance: number;
}

export default function ParentFees() {
  const { selectedChild } = useParent();
  const [activeRow, setActiveRow] = useState<FeeRow | null>(null);
  const [previousRows, setPreviousRows] = useState<FeeRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedChild) return;
    const fetchFees = async () => {
      setLoading(true);
      try {
        /* Fetch student financials */
        const snap = await getDoc(doc(db, "student_progress", selectedChild.studentNumber));
        if (!snap.exists()) {
          setActiveRow(null);
          setPreviousRows([]);
          return;
        }
        const financials = snap.data().financials || {};
        const years = Object.keys(financials).sort().reverse();
        if (years.length === 0) {
          setActiveRow(null);
          setPreviousRows([]);
          return;
        }

        /* Determine active year: try academic_years collection, fallback to newest */
        let currentYear = years[0];
        try {
          const aySnap = await getDocs(collection(db, "academic_years"));
          if (!aySnap.empty) {
            const docs = aySnap.docs.map((d) => d.data());
            const currentDoc = docs.find((d) => d.Current_Year === true);
            if (currentDoc) {
              const cy = String(currentDoc.Academic_Year);
              if (financials[cy]) currentYear = cy;
            }
          }
        } catch {
          /* academic_years not accessible – use newest year from financials */
        }

        const toRow = (yr: string): FeeRow => {
          const f = financials[yr] || {};
          const charged = f.total_charged || 0;
          const paid = f.total_paid || 0;
          const discount = f.total_discount || 0;
          const balance = f.balance ?? (charged - paid - discount);
          return { year: yr, openingBalance: charged, paid, balance };
        };

        /* Active year */
        setActiveRow(toRow(currentYear));

        /* Previous years with outstanding balance only */
        const prev = years
          .filter((yr) => yr !== currentYear)
          .map(toRow)
          .filter((r) => r.balance > 0);
        setPreviousRows(prev);
      } catch {
        setActiveRow(null);
        setPreviousRows([]);
      } finally {
        setLoading(false);
      }
    };
    fetchFees();
  }, [selectedChild]);

  const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 0 });

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
        <Text style={styles.title}>Fees</Text>
        <Text style={styles.childName}>{selectedChild.fullName}</Text>

        <ChildSelector />

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : (
          <>
            {/* Active academic year */}
            {activeRow ? (
              <View style={styles.activeCard}>
                <Text style={styles.activeCardTitle}>
                  Academic Year {activeRow.year}
                </Text>

                <View style={styles.summaryRow}>
                  <View style={styles.summaryCard}>
                    <Text style={styles.summaryLabel}>Opening Balance</Text>
                    <Text style={styles.summaryValue}>
                      {fmt(activeRow.openingBalance)}
                    </Text>
                  </View>
                </View>
                <View style={styles.summaryRow}>
                  <View style={styles.summaryCard}>
                    <Text style={styles.summaryLabel}>Paid</Text>
                    <Text style={[styles.summaryValue, { color: colors.success }]}>
                      {fmt(activeRow.paid)}
                    </Text>
                  </View>
                  <View style={styles.summaryCard}>
                    <Text style={styles.summaryLabel}>Balance</Text>
                    <Text
                      style={[
                        styles.summaryValue,
                        { color: activeRow.balance > 0 ? colors.danger : colors.success },
                      ]}
                    >
                      {fmt(activeRow.balance)}
                    </Text>
                  </View>
                </View>
              </View>
            ) : (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>
                  No fee records found
                </Text>
              </View>
            )}

            {/* Previous years with outstanding balance */}
            {previousRows.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>Previous Outstanding</Text>
                {previousRows.map((f) => (
                  <View key={f.year} style={styles.feeCard}>
                    <Text style={styles.feeYear}>{f.year}</Text>
                    <View style={styles.feeRow}>
                      <Text style={styles.feeLabel}>Opening Balance</Text>
                      <Text style={styles.feeValue}>{fmt(f.openingBalance)}</Text>
                    </View>
                    <View style={styles.feeRow}>
                      <Text style={styles.feeLabel}>Paid</Text>
                      <Text style={[styles.feeValue, { color: colors.success }]}>
                        {fmt(f.paid)}
                      </Text>
                    </View>
                    <View style={[styles.feeRow, { borderBottomWidth: 0 }]}>
                      <Text style={[styles.feeLabel, { fontWeight: "600" }]}>
                        Balance
                      </Text>
                      <Text
                        style={[
                          styles.feeValue,
                          { fontWeight: "700", color: colors.danger },
                        ]}
                      >
                        {fmt(f.balance)}
                      </Text>
                    </View>
                  </View>
                ))}
              </>
            )}
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
    marginBottom: spacing.xl,
  },
  activeCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  activeCardTitle: {
    fontSize: fontSize.base,
    fontWeight: "700",
    color: colors.text,
    marginBottom: spacing.md,
  },
  summaryRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: "center",
    gap: 4,
  },
  summaryLabel: { fontSize: fontSize.xs, color: colors.textSecondary },
  summaryValue: { fontSize: fontSize.lg, fontWeight: "700", color: colors.text },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    alignItems: "center",
  },
  emptyText: { fontSize: fontSize.sm, color: colors.textMuted },
  sectionTitle: {
    fontSize: fontSize.base,
    fontWeight: "600",
    color: colors.text,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  feeCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginTop: spacing.md,
  },
  feeYear: {
    fontSize: fontSize.base,
    fontWeight: "600",
    color: colors.text,
    marginBottom: spacing.md,
  },
  feeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  feeLabel: { fontSize: fontSize.sm, color: colors.textSecondary },
  feeValue: { fontSize: fontSize.sm, color: colors.text },
});

