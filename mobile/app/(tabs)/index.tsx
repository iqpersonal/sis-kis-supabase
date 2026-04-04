import { View, Text, StyleSheet, ScrollView, RefreshControl, Image, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useEffect, useState, useCallback } from "react";
import { doc, getDoc } from "firebase/firestore";
import Ionicons from "@expo/vector-icons/Ionicons";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/auth-context";
import { SkeletonCard } from "@/components/Skeleton";
import Toast from "@/components/Toast";
import { colors, spacing, fontSize, radius, commonStyles } from "@/lib/theme";

type IoniconsName = keyof typeof Ionicons.glyphMap;

interface KPI {
  label: string;
  value: string;
  icon: IoniconsName;
  color: string;
}

export default function DashboardTab() {
  const { user } = useAuth();
  const [kpis, setKpis] = useState<KPI[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [toastVisible, setToastVisible] = useState(false);

  const fetchSummary = useCallback(async () => {
    try {
      const summaryDoc = await getDoc(doc(db, "summaries", "latest"));
      if (summaryDoc.exists()) {
        const data = summaryDoc.data();
        const all = data.all || {};
        const acad = all.academics || {};
        const fin = all.financials || {};

        setKpis([
          { label: "Total Students", value: String(all.total_students || 0), icon: "school-outline", color: colors.primary },
          { label: "Active", value: String(all.active_registrations || 0), icon: "checkmark-circle-outline", color: colors.success },
          { label: "Pass Rate", value: `${acad.pass_rate || 0}%`, icon: "trending-up-outline", color: colors.success },
          { label: "Avg Grade", value: (acad.avg_grade || 0).toFixed(1), icon: "ribbon-outline", color: colors.primaryLight },
          { label: "Absence Days", value: String(acad.total_absence_days || 0), icon: "calendar-outline", color: colors.warning },
          { label: "Collection", value: `${((fin.totalPaid || 0) / Math.max(fin.totalCharges || 1, 1) * 100).toFixed(0)}%`, icon: "wallet-outline", color: colors.primary },
        ]);
        setError("");
      }
    } catch {
      setError("Failed to load dashboard data");
      setToastVisible(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchSummary();
    setRefreshing(false);
  }, [fetchSummary]);

  return (
    <SafeAreaView style={commonStyles.container}>
      <Toast
        message={error}
        type="error"
        visible={toastVisible}
        onHide={() => setToastVisible(false)}
      />
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.greeting}>
                Welcome back{user?.displayName ? `, ${user.displayName}` : ""}
              </Text>
              <Text style={styles.subGreeting}>Khaled International Schools</Text>
            </View>
            <Image
              source={require("../../assets/logo.png")}
              style={styles.headerLogo}
              resizeMode="contain"
            />
          </View>
        </View>

        {/* KPI Grid */}
        {loading ? (
          <View style={styles.grid}>
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <SkeletonCard key={i} />
            ))}
          </View>
        ) : error && kpis.length === 0 ? (
          <View style={styles.errorContainer}>
            <Ionicons name="cloud-offline-outline" size={48} color={colors.textMuted} />
            <Text style={styles.errorText}>Could not load data</Text>
            <TouchableOpacity
              onPress={onRefresh}
              style={styles.retryBtn}
              activeOpacity={0.8}
            >
              <Text style={styles.retryText}>Tap to retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.grid}>
            {kpis.map((kpi) => (
              <View key={kpi.label} style={styles.kpiCard}>
                <View style={[styles.kpiIconBg, { backgroundColor: kpi.color + "18" }]}>
                  <Ionicons name={kpi.icon} size={24} color={kpi.color} />
                </View>
                <Text style={styles.kpiValue}>{kpi.value}</Text>
                <Text style={styles.kpiLabel}>{kpi.label}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    padding: spacing.lg,
  },
  header: {
    marginBottom: spacing.xl,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  headerLogo: {
    width: 48,
    height: 48,
  },
  greeting: {
    fontSize: fontSize["2xl"],
    fontWeight: "700",
    color: colors.text,
  },
  subGreeting: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  kpiCard: {
    width: "48%",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    alignItems: "center",
    gap: spacing.xs,
  },
  kpiIconBg: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: spacing.xs,
  },
  kpiValue: {
    fontSize: fontSize.xl,
    fontWeight: "700",
    color: colors.text,
  },
  kpiLabel: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  errorContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
  },
  errorText: {
    fontSize: fontSize.base,
    color: colors.textSecondary,
  },
  retryBtn: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  retryText: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: "600",
  },
});

