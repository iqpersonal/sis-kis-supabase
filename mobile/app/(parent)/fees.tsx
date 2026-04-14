import { useState, useEffect } from "react";
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { doc, getDoc, collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useParent } from "@/context/parent-context";
import { colors, spacing, fontSize, radius, commonStyles } from "@/lib/theme";
import ChildSelector from "@/components/ChildSelector";

interface Installment {
  label: string;
  charged: number;
  paid: number;
  discount: number;
  balance: number;
}

interface FeeRow {
  year: string;
  totalCharged: number;
  paid: number;
  discount: number;
  balance: number;
  installments: Installment[];
}

export default function ParentFees() {
  const { selectedChild } = useParent();
  const [activeRow, setActiveRow] = useState<FeeRow | null>(null);
  const [previousRows, setPreviousRows] = useState<FeeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedYear, setExpandedYear] = useState<string | null>(null);

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
          const installments: Installment[] = (f.installments || []).map((inst: Record<string, unknown>) => ({
            label: (inst.label as string) || "Installment",
            charged: (inst.charged as number) || 0,
            paid: (inst.paid as number) || 0,
            discount: (inst.discount as number) || 0,
            balance: (inst.balance as number) || 0,
          }));
          return { year: yr, totalCharged: charged, paid, discount, balance, installments };
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
                <View style={styles.activeCardHeader}>
                  <Text style={styles.activeCardTitle}>
                    Academic Year {activeRow.year}
                  </Text>
                  <View style={[styles.statusBadge, { backgroundColor: activeRow.balance <= 0 ? "#dcfce7" : "#fef3c7" }]}>
                    <Text style={{ fontSize: fontSize.xs, fontWeight: "600", color: activeRow.balance <= 0 ? "#166534" : "#92400e" }}>
                      {activeRow.balance <= 0 ? "Fully Paid" : "Balance Due"}
                    </Text>
                  </View>
                </View>

                {/* Summary cards */}
                <View style={styles.summaryRow}>
                  <View style={styles.summaryCard}>
                    <Text style={styles.summaryLabel}>Total Fees</Text>
                    <Text style={styles.summaryValue}>{fmt(activeRow.totalCharged)}</Text>
                  </View>
                  <View style={styles.summaryCard}>
                    <Text style={styles.summaryLabel}>Paid</Text>
                    <Text style={[styles.summaryValue, { color: colors.success }]}>{fmt(activeRow.paid)}</Text>
                  </View>
                </View>
                <View style={styles.summaryRow}>
                  {activeRow.discount > 0 && (
                    <View style={styles.summaryCard}>
                      <Text style={styles.summaryLabel}>Discount</Text>
                      <Text style={[styles.summaryValue, { color: "#7e22ce" }]}>{fmt(activeRow.discount)}</Text>
                    </View>
                  )}
                  <View style={styles.summaryCard}>
                    <Text style={styles.summaryLabel}>Balance</Text>
                    <Text style={[styles.summaryValue, { color: activeRow.balance > 0 ? colors.danger : colors.success }]}>
                      {fmt(activeRow.balance)}
                    </Text>
                  </View>
                </View>

                {/* Progress bar */}
                {activeRow.totalCharged > 0 && (() => {
                  const pct = Math.min(100, ((activeRow.paid + activeRow.discount) / activeRow.totalCharged) * 100);
                  const barColor = pct >= 100 ? colors.success : pct >= 50 ? colors.primary : colors.warning;
                  return (
                    <View style={styles.progressContainer}>
                      <View style={styles.progressTrack}>
                        <View style={[styles.progressBar, { width: `${pct}%` as unknown as number, backgroundColor: barColor }]} />
                      </View>
                      <Text style={[styles.progressText, { color: barColor }]}>{pct.toFixed(0)}% paid</Text>
                    </View>
                  );
                })()}

                {/* Installment breakdown */}
                {activeRow.installments.length > 0 && (
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => setExpandedYear(expandedYear === activeRow.year ? null : activeRow.year)}
                  >
                    <View style={styles.installmentToggle}>
                      <Text style={styles.installmentToggleText}>
                        Installment Details ({activeRow.installments.length})
                      </Text>
                      <Text style={styles.chevron}>{expandedYear === activeRow.year ? "▲" : "▼"}</Text>
                    </View>
                  </TouchableOpacity>
                )}
                {expandedYear === activeRow.year && activeRow.installments.map((inst, idx) => (
                  <View key={idx} style={styles.installmentRow}>
                    <View style={styles.installmentHeader}>
                      <Text style={styles.installmentLabel}>{inst.label}</Text>
                      <View style={[styles.installmentStatusBadge, { backgroundColor: inst.balance <= 0 ? "#dcfce7" : "#fef3c7" }]}>
                        <Text style={{ fontSize: 10, fontWeight: "600", color: inst.balance <= 0 ? "#166534" : "#92400e" }}>
                          {inst.balance <= 0 ? "Paid" : "Pending"}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.installmentDetail}>
                      <View style={styles.installmentCell}>
                        <Text style={styles.installmentCellLabel}>Charged</Text>
                        <Text style={styles.installmentCellValue}>{fmt(inst.charged)}</Text>
                      </View>
                      <View style={styles.installmentCell}>
                        <Text style={styles.installmentCellLabel}>Paid</Text>
                        <Text style={[styles.installmentCellValue, { color: colors.success }]}>{fmt(inst.paid)}</Text>
                      </View>
                      {inst.discount > 0 && (
                        <View style={styles.installmentCell}>
                          <Text style={styles.installmentCellLabel}>Disc.</Text>
                          <Text style={[styles.installmentCellValue, { color: "#7e22ce" }]}>{fmt(inst.discount)}</Text>
                        </View>
                      )}
                      <View style={styles.installmentCell}>
                        <Text style={styles.installmentCellLabel}>Balance</Text>
                        <Text style={[styles.installmentCellValue, { color: inst.balance > 0 ? colors.danger : colors.success }]}>
                          {fmt(inst.balance)}
                        </Text>
                      </View>
                    </View>
                  </View>
                ))}
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
                    <View style={styles.activeCardHeader}>
                      <Text style={styles.feeYear}>{f.year}</Text>
                      <View style={[styles.statusBadge, { backgroundColor: "#fef3c7" }]}>
                        <Text style={{ fontSize: fontSize.xs, fontWeight: "600", color: "#92400e" }}>Balance Due</Text>
                      </View>
                    </View>
                    <View style={styles.feeRow}>
                      <Text style={styles.feeLabel}>Total Fees</Text>
                      <Text style={styles.feeValue}>{fmt(f.totalCharged)}</Text>
                    </View>
                    <View style={styles.feeRow}>
                      <Text style={styles.feeLabel}>Paid</Text>
                      <Text style={[styles.feeValue, { color: colors.success }]}>
                        {fmt(f.paid)}
                      </Text>
                    </View>
                    {f.discount > 0 && (
                      <View style={styles.feeRow}>
                        <Text style={styles.feeLabel}>Discount</Text>
                        <Text style={[styles.feeValue, { color: "#7e22ce" }]}>
                          {fmt(f.discount)}
                        </Text>
                      </View>
                    )}
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

                    {/* Installments for previous years */}
                    {f.installments.length > 0 && (
                      <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => setExpandedYear(expandedYear === f.year ? null : f.year)}
                      >
                        <View style={styles.installmentToggle}>
                          <Text style={styles.installmentToggleText}>
                            Installments ({f.installments.length})
                          </Text>
                          <Text style={styles.chevron}>{expandedYear === f.year ? "▲" : "▼"}</Text>
                        </View>
                      </TouchableOpacity>
                    )}
                    {expandedYear === f.year && f.installments.map((inst, idx) => (
                      <View key={idx} style={styles.installmentRow}>
                        <View style={styles.installmentHeader}>
                          <Text style={styles.installmentLabel}>{inst.label}</Text>
                          <View style={[styles.installmentStatusBadge, { backgroundColor: inst.balance <= 0 ? "#dcfce7" : "#fef3c7" }]}>
                            <Text style={{ fontSize: 10, fontWeight: "600", color: inst.balance <= 0 ? "#166534" : "#92400e" }}>
                              {inst.balance <= 0 ? "Paid" : "Pending"}
                            </Text>
                          </View>
                        </View>
                        <View style={styles.installmentDetail}>
                          <View style={styles.installmentCell}>
                            <Text style={styles.installmentCellLabel}>Charged</Text>
                            <Text style={styles.installmentCellValue}>{fmt(inst.charged)}</Text>
                          </View>
                          <View style={styles.installmentCell}>
                            <Text style={styles.installmentCellLabel}>Paid</Text>
                            <Text style={[styles.installmentCellValue, { color: colors.success }]}>{fmt(inst.paid)}</Text>
                          </View>
                          <View style={styles.installmentCell}>
                            <Text style={styles.installmentCellLabel}>Balance</Text>
                            <Text style={[styles.installmentCellValue, { color: inst.balance > 0 ? colors.danger : colors.success }]}>
                              {fmt(inst.balance)}
                            </Text>
                          </View>
                        </View>
                      </View>
                    ))}
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
  },
  activeCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  statusBadge: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
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

  // Progress bar
  progressContainer: {
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    gap: 4,
  },
  progressTrack: {
    height: 8,
    backgroundColor: colors.border,
    borderRadius: 4,
    overflow: "hidden",
  },
  progressBar: {
    height: "100%",
    borderRadius: 4,
  },
  progressText: {
    fontSize: fontSize.xs,
    fontWeight: "600",
    textAlign: "right",
  },

  // Installment section
  installmentToggle: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: spacing.sm,
  },
  installmentToggleText: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: colors.primary,
  },
  chevron: { fontSize: 12, color: colors.textSecondary },
  installmentRow: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginTop: spacing.sm,
  },
  installmentHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  installmentLabel: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: colors.text,
  },
  installmentStatusBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  installmentDetail: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  installmentCell: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  installmentCellLabel: {
    fontSize: 10,
    color: colors.textMuted,
  },
  installmentCellValue: {
    fontSize: fontSize.xs,
    fontWeight: "600",
    color: colors.text,
  },
});

