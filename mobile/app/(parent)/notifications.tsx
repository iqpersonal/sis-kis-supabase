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
import { useParent } from "@/context/parent-context";
import { colors, spacing, fontSize, radius, commonStyles } from "@/lib/theme";
import { API_BASE } from "@/lib/api-config";

interface Notification {
  id: string;
  type: string;
  severity: "critical" | "warning" | "info";
  title: string;
  message: string;
  student_number: string;
  student_name: string;
}

const severityConfig = {
  critical: { emoji: "🔴", bg: colors.danger + "15", border: colors.danger + "40", color: colors.danger, label: "Critical" },
  warning: { emoji: "🟡", bg: colors.warning + "15", border: colors.warning + "40", color: colors.warning, label: "Warning" },
  info: { emoji: "🔵", bg: colors.primary + "15", border: colors.primary + "40", color: colors.primary, label: "Info" },
};

export default function NotificationsScreen() {
  const { children } = useParent();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchNotifications = useCallback(async () => {
    if (!children || children.length === 0) return;
    try {
      const studentNumbers = children.map((c) => c.studentNumber).join(",");
      const res = await fetch(
        `${API_BASE}/parent/notifications?studentNumbers=${encodeURIComponent(studentNumbers)}`
      );
      if (res.ok) {
        const json = await res.json();
        setNotifications(json.notifications || []);
      } else {
        setNotifications([]);
      }
    } catch {
      setNotifications([]);
    }
  }, [children]);

  useEffect(() => {
    setLoading(true);
    fetchNotifications().finally(() => setLoading(false));
  }, [fetchNotifications]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchNotifications();
    setRefreshing(false);
  };

  const criticalCount = notifications.filter((n) => n.severity === "critical").length;
  const warningCount = notifications.filter((n) => n.severity === "warning").length;

  if (!children || children.length === 0) {
    return (
      <SafeAreaView style={commonStyles.container}>
        <View style={styles.scroll}>
          <Text style={styles.title}>Notifications</Text>
          <View style={styles.empty}>
            <Text style={{ fontSize: 48 }}>🔐</Text>
            <Text style={styles.emptyText}>Sign in to view notifications.</Text>
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
        <Text style={styles.title}>Notifications</Text>

        {/* Summary badges */}
        {(criticalCount > 0 || warningCount > 0) && (
          <View style={styles.badgeRow}>
            {criticalCount > 0 && (
              <View style={[styles.badge, { backgroundColor: colors.danger + "15" }]}>
                <Text style={[styles.badgeText, { color: colors.danger }]}>
                  🔴 {criticalCount} critical
                </Text>
              </View>
            )}
            {warningCount > 0 && (
              <View style={[styles.badge, { backgroundColor: colors.warning + "15" }]}>
                <Text style={[styles.badgeText, { color: colors.warning }]}>
                  🟡 {warningCount} warning{warningCount !== 1 ? "s" : ""}
                </Text>
              </View>
            )}
          </View>
        )}

        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 60 }} />
        ) : notifications.length === 0 ? (
          <View style={styles.empty}>
            <Text style={{ fontSize: 48 }}>✅</Text>
            <Text style={styles.emptyText}>All clear! No alerts.</Text>
            <Text style={styles.emptySubtext}>
              We{"'"}ll notify you about grades, documents, attendance, and fees.
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            <Text style={styles.countLabel}>
              {notifications.length} alert{notifications.length !== 1 ? "s" : ""}
            </Text>
            {notifications.map((n) => {
              const cfg = severityConfig[n.severity] || severityConfig.info;
              return (
                <View
                  key={n.id}
                  style={[styles.card, { backgroundColor: cfg.bg, borderColor: cfg.border }]}
                >
                  <View style={styles.cardHeader}>
                    <Text style={{ fontSize: 18 }}>{cfg.emoji}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardTitle}>{n.title}</Text>
                      <Text style={styles.cardStudent}>{n.student_name}</Text>
                    </View>
                    <View style={[styles.severityBadge, { backgroundColor: cfg.color + "20" }]}>
                      <Text style={[styles.severityText, { color: cfg.color }]}>
                        {cfg.label}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.cardMessage}>{n.message}</Text>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
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
  badgeRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  badge: {
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: fontSize.xs,
    fontWeight: "600",
  },
  countLabel: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.md,
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
  emptySubtext: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: "center",
    paddingHorizontal: spacing.xl,
  },
  list: {
    marginTop: spacing.md,
  },
  card: {
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  cardTitle: {
    fontSize: fontSize.base,
    fontWeight: "600",
    color: colors.text,
  },
  cardStudent: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 1,
  },
  severityBadge: {
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  severityText: {
    fontSize: fontSize.xs,
    fontWeight: "600",
  },
  cardMessage: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 20,
    marginLeft: 26,
  },
});
