import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Dimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useState, useCallback } from "react";
import { useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useAuth, getStoreAccess } from "@/context/auth-context";
import { useStoreStats, type StoreStats } from "@/hooks/use-store-data";
import { GENERAL_STORE_CONFIG, IT_STORE_CONFIG, type StoreConfig } from "@/lib/store-config";
import { colors, spacing, fontSize, radius, commonStyles } from "@/lib/theme";

type IoniconsName = keyof typeof Ionicons.glyphMap;

const SCREEN_WIDTH = Dimensions.get("window").width;
const CARD_GAP = spacing.sm;
const GRID_PADDING = spacing.lg * 2;
// 3 columns with gaps
const ACTION_CARD_WIDTH = (SCREEN_WIDTH - GRID_PADDING - CARD_GAP * 2) / 3;

export default function StoreHome() {
  const { roles, user } = useAuth();
  const access = getStoreAccess(roles);

  // Default to whichever store the user has access to
  const [activeStore, setActiveStore] = useState<StoreConfig>(
    access.general ? GENERAL_STORE_CONFIG : IT_STORE_CONFIG
  );

  const { stats, loading } = useStoreStats(activeStore);
  const [refreshing, setRefreshing] = useState(false);
  const router = useRouter();

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    // Stats are real-time, so just wait a moment
    setTimeout(() => setRefreshing(false), 500);
  }, []);

  /* ── KPI definitions ── */
  const mainKpis: { label: string; value: string; icon: IoniconsName; color: string }[] = [
    { label: "Total Items", value: String(stats.totalItems), icon: "cube-outline", color: colors.primary },
    { label: "Total Qty", value: String(stats.totalQuantity), icon: "layers-outline", color: colors.primaryLight },
  ];
  const alertKpis: { label: string; value: string; icon: IoniconsName; color: string }[] = [
    { label: "Low Stock", value: String(stats.lowStock), icon: "warning-outline", color: colors.warning },
    { label: "Out of Stock", value: String(stats.outOfStock), icon: "alert-circle-outline", color: colors.danger },
    { label: "Pending", value: String(stats.pendingRequests), icon: "time-outline", color: colors.warning },
  ];

  /* ── Quick Action definitions ── */
  const actions: { label: string; icon: IoniconsName; color: string; route: string }[] = [
    { label: "Scan Item", icon: "scan-outline", color: colors.primary, route: "/(store)/scan" },
    { label: "Quick Issue", icon: "exit-outline", color: colors.danger, route: "/(store)/quick-issue" },
    { label: "Inventory", icon: "list-outline", color: colors.success, route: "/(store)/inventory" },
    { label: "Requests", icon: "clipboard-outline", color: colors.warning, route: "/(store)/requests" },
    { label: "Image Search", icon: "image-outline", color: "#3B82F6", route: "/(store)/image-search" },
    { label: "New Request", icon: "add-circle-outline", color: colors.accent, route: "/(store)/new-request" },
  ];

  return (
    <SafeAreaView style={commonStyles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.greeting}>Welcome{user?.displayName ? `, ${user.displayName}` : ""}</Text>
          <Text style={styles.subGreeting}>{activeStore.label}</Text>
        </View>

        {/* Store Switcher (only if user has both) */}
        {access.general && access.it && (
          <View style={styles.switcher}>
            <TouchableOpacity
              style={[styles.switchBtn, activeStore.type === "general" && styles.switchBtnActive]}
              onPress={() => setActiveStore(GENERAL_STORE_CONFIG)}
              activeOpacity={0.7}
            >
              <Text style={[styles.switchText, activeStore.type === "general" && styles.switchTextActive]}>
                General Store
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.switchBtn, activeStore.type === "it" && styles.switchBtnActive]}
              onPress={() => setActiveStore(IT_STORE_CONFIG)}
              activeOpacity={0.7}
            >
              <Text style={[styles.switchText, activeStore.type === "it" && styles.switchTextActive]}>
                IT Store
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Overview Stats ── */}
        {/* Row 1: Two main stat cards */}
        <View style={styles.mainKpiRow}>
          {mainKpis.map((kpi) => (
            <View key={kpi.label} style={styles.mainKpiCard}>
              <View style={[styles.kpiIconBg, { backgroundColor: kpi.color + "20" }]}>
                <Ionicons name={kpi.icon} size={22} color={kpi.color} />
              </View>
              <View style={styles.mainKpiText}>
                <Text style={styles.mainKpiValue}>{loading ? "—" : kpi.value}</Text>
                <Text style={styles.mainKpiLabel}>{kpi.label}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Row 2: Three compact alert badges */}
        <View style={styles.alertRow}>
          {alertKpis.map((kpi) => (
            <View key={kpi.label} style={styles.alertCard}>
              <View style={[styles.alertIconBg, { backgroundColor: kpi.color + "20" }]}>
                <Ionicons name={kpi.icon} size={18} color={kpi.color} />
              </View>
              <Text style={styles.alertValue}>{loading ? "—" : kpi.value}</Text>
              <Text style={styles.alertLabel}>{kpi.label}</Text>
            </View>
          ))}
        </View>

        {/* ── Quick Actions ── */}
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.actionGrid}>
          {actions.map((action) => (
            <TouchableOpacity
              key={action.label}
              style={styles.actionCard}
              activeOpacity={0.7}
              onPress={() => router.push(action.route as never)}
            >
              <View style={[styles.actionIconBg, { backgroundColor: action.color + "18" }]}>
                <Ionicons name={action.icon} size={24} color={action.color} />
              </View>
              <Text style={styles.actionLabel} numberOfLines={1}>{action.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  header: { marginBottom: spacing.lg },
  greeting: { fontSize: fontSize["2xl"], fontWeight: "700", color: colors.text },
  subGreeting: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: spacing.xs },

  /* Store switcher */
  switcher: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 4,
    marginBottom: spacing.lg,
  },
  switchBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radius.sm,
    alignItems: "center",
  },
  switchBtnActive: {
    backgroundColor: colors.primary,
  },
  switchText: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  switchTextActive: {
    color: colors.white,
  },

  /* Main KPI row (2 horizontal cards) */
  mainKpiRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  mainKpiCard: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.md,
  },
  kpiIconBg: {
    width: 42,
    height: 42,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  mainKpiText: {
    flex: 1,
  },
  mainKpiValue: {
    fontSize: fontSize.xl,
    fontWeight: "700",
    color: colors.text,
  },
  mainKpiLabel: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },

  /* Alert row (3 compact badges) */
  alertRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  alertCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    alignItems: "center",
    gap: 4,
  },
  alertIconBg: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  alertValue: {
    fontSize: fontSize.lg,
    fontWeight: "700",
    color: colors.text,
  },
  alertLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    textAlign: "center",
  },

  /* Section title */
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: "700",
    color: colors.text,
    marginBottom: spacing.md,
  },

  /* Quick Actions — 3-column grid */
  actionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: CARD_GAP,
  },
  actionCard: {
    width: ACTION_CARD_WIDTH,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.sm,
    alignItems: "center",
    gap: spacing.sm,
  },
  actionIconBg: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  actionLabel: {
    fontSize: fontSize.xs,
    fontWeight: "600",
    color: colors.text,
    textAlign: "center",
  },
});
