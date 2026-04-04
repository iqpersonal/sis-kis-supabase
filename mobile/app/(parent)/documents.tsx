import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useParent } from "@/context/parent-context";
import { colors, spacing, fontSize, radius, commonStyles } from "@/lib/theme";

/* ─── Types ─── */
interface DocInfo {
  label: string;
  number: string;
  expiry: string;
  status: "valid" | "expiring" | "expired" | "missing";
  daysLeft: number | null;
}

function daysBetween(from: Date, to: Date): number {
  return Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

function getDocStatus(expiryStr: string | null): { status: DocInfo["status"]; daysLeft: number | null } {
  if (!expiryStr) return { status: "missing", daysLeft: null };
  const expiry = new Date(expiryStr);
  if (isNaN(expiry.getTime())) return { status: "missing", daysLeft: null };
  const days = daysBetween(new Date(), expiry);
  if (days < 0) return { status: "expired", daysLeft: days };
  if (days <= 30) return { status: "expiring", daysLeft: days };
  return { status: "valid", daysLeft: days };
}

const statusConfig = {
  valid: { emoji: "✅", label: "Valid", color: colors.success },
  expiring: { emoji: "⚠️", label: "Expiring Soon", color: colors.warning },
  expired: { emoji: "❌", label: "Expired", color: colors.danger },
  missing: { emoji: "➖", label: "Not Available", color: colors.textMuted },
};

export default function DocumentsScreen() {
  const { children, selectedChild } = useParent();
  const [documents, setDocuments] = useState<DocInfo[]>([]);
  const [studentData, setStudentData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const child = selectedChild || children[0];

  const fetchDocuments = useCallback(async () => {
    if (!child) return;

    try {
      // Fetch from students collection
      const snap = await getDoc(doc(db, "students", child.studentNumber));
      if (!snap.exists()) {
        setDocuments([]);
        return;
      }
      const data = snap.data();
      setStudentData(data);

      const docs: DocInfo[] = [];

      // Passport
      const passportNo = (data.PASSPORTNO || data.passport_no || "") as string;
      const passportExpiry = (data.PASSPORTEXPIRYDATE || data.passport_expiry || "") as string;
      const passportStatus = getDocStatus(passportExpiry || null);
      docs.push({
        label: "Passport",
        number: passportNo || "—",
        expiry: passportExpiry ? new Date(passportExpiry).toLocaleDateString() : "—",
        ...passportStatus,
      });

      // Iqama / National ID
      const iqamaNo = (data.IQAMANUMBER || data.iqama_number || "") as string;
      const iqamaExpiry = (data.IQAMAEXPIRYDATE || data.iqama_expiry || "") as string;
      const iqamaStatus = getDocStatus(iqamaExpiry || null);
      docs.push({
        label: "Iqama / National ID",
        number: iqamaNo || "—",
        expiry: iqamaExpiry ? new Date(iqamaExpiry).toLocaleDateString() : "—",
        ...iqamaStatus,
      });

      // Also check student_progress for additional expiry info
      const progressSnap = await getDoc(doc(db, "student_progress", child.studentNumber));
      if (progressSnap.exists()) {
        const pd = progressSnap.data();
        // Update with progress data if main record was missing
        if (!passportExpiry && pd.passport_expiry) {
          const pStatus = getDocStatus(pd.passport_expiry);
          docs[0] = {
            ...docs[0],
            expiry: new Date(pd.passport_expiry).toLocaleDateString(),
            ...pStatus,
          };
        }
        if (!iqamaExpiry && pd.iqama_expiry) {
          const iStatus = getDocStatus(pd.iqama_expiry);
          docs[1] = {
            ...docs[1],
            expiry: new Date(pd.iqama_expiry).toLocaleDateString(),
            ...iStatus,
          };
        }
      }

      setDocuments(docs);
    } catch {
      setDocuments([]);
    }
  }, [child]);

  useEffect(() => {
    setLoading(true);
    fetchDocuments().finally(() => setLoading(false));
  }, [fetchDocuments]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchDocuments();
    setRefreshing(false);
  };

  if (!child) {
    return (
      <SafeAreaView style={commonStyles.container}>
        <View style={styles.scroll}>
          <Text style={styles.title}>Documents</Text>
          <View style={styles.empty}>
            <Text style={{ fontSize: 48 }}>🔐</Text>
            <Text style={styles.emptyText}>No child selected.</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={commonStyles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        <Text style={styles.title}>Documents</Text>
        <Text style={styles.subtitle}>
          {child.fullName} • #{child.studentNumber}
        </Text>

        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 60 }} />
        ) : (
          <>
            {/* Status Summary */}
            <View style={styles.summaryRow}>
              {documents.map((d) => {
                const cfg = statusConfig[d.status];
                return (
                  <View key={d.label} style={[styles.summaryCard, { borderBottomColor: cfg.color }]}>
                    <Text style={{ fontSize: 24 }}>{cfg.emoji}</Text>
                    <Text style={styles.summaryLabel}>{d.label}</Text>
                    <Text style={[styles.summaryStatus, { color: cfg.color }]}>{cfg.label}</Text>
                  </View>
                );
              })}
            </View>

            {/* Document Details */}
            {documents.map((d) => {
              const cfg = statusConfig[d.status];
              return (
                <View key={d.label} style={[styles.card, { borderLeftColor: cfg.color }]}>
                  <View style={styles.cardHeader}>
                    <Text style={{ fontSize: 20 }}>
                      {d.label === "Passport" ? "🛂" : "🪪"}
                    </Text>
                    <Text style={styles.cardTitle}>{d.label}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: cfg.color + "20" }]}>
                      <Text style={[styles.statusBadgeText, { color: cfg.color }]}>
                        {cfg.label}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Number</Text>
                    <Text style={styles.detailValue}>{d.number}</Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Expiry Date</Text>
                    <Text style={[styles.detailValue, d.status === "expired" && { color: colors.danger }]}>
                      {d.expiry}
                    </Text>
                  </View>

                  {d.daysLeft !== null && (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>
                        {d.daysLeft < 0 ? "Expired" : "Days Remaining"}
                      </Text>
                      <Text style={[styles.detailValue, { color: cfg.color, fontWeight: "700" }]}>
                        {d.daysLeft < 0 ? `${Math.abs(d.daysLeft)} days ago` : `${d.daysLeft} days`}
                      </Text>
                    </View>
                  )}
                </View>
              );
            })}

            {/* Additional Info */}
            {studentData && (
              <View style={styles.infoCard}>
                <Text style={styles.cardTitle}>Additional Information</Text>
                <InfoRow label="Nationality" value={(studentData.NATIONALITYNAME || "—") as string} />
                <InfoRow label="Date of Birth" value={(studentData.DATEOFBIRTH || "—") as string} />
                <InfoRow label="Gender" value={(studentData.GENDER || "—") as string} />
                <InfoRow label="Religion" value={(studentData.RELIGION || "—") as string} />
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    padding: spacing.lg,
    paddingBottom: 100,
  },
  title: {
    fontSize: fontSize["2xl"],
    fontWeight: "700",
    color: colors.text,
  },
  subtitle: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  empty: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 80,
    gap: spacing.md,
  },
  emptyText: {
    fontSize: fontSize.base,
    color: colors.textSecondary,
    textAlign: "center",
  },
  summaryRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomWidth: 3,
    padding: spacing.md,
    alignItems: "center",
    gap: spacing.xs,
  },
  summaryLabel: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontWeight: "500",
  },
  summaryStatus: {
    fontSize: fontSize.xs,
    fontWeight: "700",
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  cardTitle: {
    fontSize: fontSize.base,
    fontWeight: "600",
    color: colors.text,
    flex: 1,
  },
  statusBadge: {
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  statusBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: "600",
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  detailLabel: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  detailValue: {
    fontSize: fontSize.sm,
    color: colors.text,
    fontWeight: "500",
  },
  infoCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginTop: spacing.sm,
  },
});
