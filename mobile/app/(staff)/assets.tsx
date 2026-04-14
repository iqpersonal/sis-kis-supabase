import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useAuth } from "@/context/auth-context";
import { auth } from "@/lib/firebase";
import { colors, spacing, fontSize, radius, commonStyles } from "@/lib/theme";

const API_BASE = "https://sis-kis.web.app/api/staff-portal";

interface ITAsset {
  id: string;
  asset_tag: string;
  type: string;
  brand: string;
  model: string;
  serial_number: string;
  status: string;
  assigned_to: string;
  location: string;
}

const TYPE_ICONS: Record<string, string> = {
  laptop: "laptop-outline",
  desktop: "desktop-outline",
  monitor: "tv-outline",
  printer: "print-outline",
  phone: "phone-portrait-outline",
  tablet: "tablet-portrait-outline",
  projector: "videocam-outline",
};

export default function StaffAssets() {
  const { user } = useAuth();
  const [assets, setAssets] = useState<ITAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAssets = useCallback(async () => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const res = await fetch(`${API_BASE}/assets`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setAssets(data.assets || []);
    } catch (err) {
      console.error("Failed to fetch assets:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  if (loading) {
    return (
      <View style={commonStyles.centered}>
        <ActivityIndicator size="large" color="#10b981" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); fetchAssets(); }}
            tintColor="#10b981"
          />
        }
      >
        <View style={styles.header}>
          <Text style={styles.title}>My Assets</Text>
          <Text style={styles.subtitle}>
            {assets.length} device{assets.length !== 1 ? "s" : ""} assigned
          </Text>
        </View>

        {assets.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="laptop-outline" size={48} color={colors.textMuted} />
            <Text style={styles.emptyText}>No assets assigned</Text>
            <Text style={styles.emptySubtext}>
              Contact IT if you believe this is incorrect
            </Text>
          </View>
        ) : (
          assets.map((a) => (
            <View key={a.id} style={styles.assetCard}>
              <View style={styles.iconWrapper}>
                <Ionicons
                  name={(TYPE_ICONS[a.type?.toLowerCase()] || "hardware-chip-outline") as keyof typeof Ionicons.glyphMap}
                  size={28}
                  color="#10b981"
                />
              </View>
              <View style={styles.assetInfo}>
                <Text style={styles.assetModel}>
                  {a.brand} {a.model}
                </Text>
                <Text style={styles.assetTag}>{a.asset_tag}</Text>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Type:</Text>
                  <Text style={styles.detailValue}>{a.type}</Text>
                </View>
                {a.serial_number && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>S/N:</Text>
                    <Text style={styles.detailValue}>{a.serial_number}</Text>
                  </View>
                )}
                {a.location && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Location:</Text>
                    <Text style={styles.detailValue}>{a.location}</Text>
                  </View>
                )}
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Status:</Text>
                  <View
                    style={[
                      styles.statusBadge,
                      {
                        backgroundColor:
                          a.status === "active" ? "#10b98120" : "#f59e0b20",
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusText,
                        {
                          color:
                            a.status === "active" ? "#10b981" : "#f59e0b",
                        },
                      ]}
                    >
                      {a.status}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    padding: spacing.lg,
  },
  header: {
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: fontSize["2xl"],
    fontWeight: "700",
    color: colors.text,
  },
  subtitle: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  empty: {
    alignItems: "center",
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
  },
  emptyText: {
    fontSize: fontSize.lg,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  emptySubtext: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  assetCard: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.md,
  },
  iconWrapper: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#10b98115",
    justifyContent: "center",
    alignItems: "center",
  },
  assetInfo: {
    flex: 1,
  },
  assetModel: {
    fontSize: fontSize.base,
    fontWeight: "600",
    color: colors.text,
  },
  assetTag: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontFamily: "monospace",
    marginBottom: spacing.xs,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: 2,
  },
  detailLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  detailValue: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    textTransform: "capitalize",
  },
  statusBadge: {
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  statusText: {
    fontSize: fontSize.xs,
    fontWeight: "600",
    textTransform: "capitalize",
  },
});
