import { useState, useCallback, useEffect } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Alert, ActivityIndicator, RefreshControl, Modal, ScrollView, TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useAuth, getStoreAccess } from "@/context/auth-context";
import { auth } from "@/lib/firebase";
import { GENERAL_STORE_CONFIG, IT_STORE_CONFIG, type StoreConfig } from "@/lib/store-config";
import { colors, spacing, fontSize, radius, commonStyles } from "@/lib/theme";

const API_BASE = "https://sis-kis.web.app/api/staff-portal";

let _cachedToken: string | undefined;
let _tokenExpiry = 0;
async function getToken(): Promise<string> {
  if (_cachedToken && Date.now() < _tokenExpiry) return _cachedToken;
  const t = await auth.currentUser?.getIdToken();
  _cachedToken = t ?? "";
  _tokenExpiry = Date.now() + 50 * 60 * 1000;
  return _cachedToken;
}

interface StockTakeItem {
  name: string;
  system_qty: number;
  counted_qty: number | null;
}

interface StockTake {
  id: string;
  take_id?: string;
  status: "in_progress" | "completed" | "cancelled";
  started_at: string;
  completed_at?: string;
  started_by_name?: string;
  items: Record<string, StockTakeItem>;
  counted: number;
  variances: number;
}

function formatDate(s?: string) {
  if (!s) return "—";
  try { return new Date(s).toLocaleDateString(); } catch { return s; }
}

const STATUS_COLORS: Record<string, string> = {
  in_progress: colors.warning,
  completed: colors.success,
  cancelled: colors.danger,
};

export default function StockTakesScreen() {
  const { roles } = useAuth();
  const access = getStoreAccess(roles);
  const [activeStore, setActiveStore] = useState<StoreConfig>(
    access.general ? GENERAL_STORE_CONFIG : IT_STORE_CONFIG
  );
  const [takes, setTakes] = useState<StockTake[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Active stock take detail view
  const [activeTake, setActiveTake] = useState<StockTake | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [savingItem, setSavingItem] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<string, string>>({});

  const fetchTakes = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch(
        `${API_BASE}/store?action=stock_takes&store=${activeStore.type}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTakes(data.stock_takes || []);
    } catch (err) {
      console.error("Failed to fetch stock takes:", err);
      Alert.alert("Error", "Could not load stock takes.");
    }
  }, [activeStore.type]);

  useEffect(() => {
    setLoading(true);
    fetchTakes().finally(() => setLoading(false));
  }, [fetchTakes]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchTakes();
    setRefreshing(false);
  }, [fetchTakes]);

  const openDetail = async (take: StockTake) => {
    setLoadingDetail(true);
    setActiveTake(take);
    try {
      const token = await getToken();
      const res = await fetch(
        `${API_BASE}/store?action=stock_take&id=${take.id}&store=${activeStore.type}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const st = data.stock_take as StockTake;
      setActiveTake(st);
      // Pre-fill current counts
      const initCounts: Record<string, string> = {};
      Object.entries(st.items).forEach(([id, it]) => {
        initCounts[id] = it.counted_qty !== null ? String(it.counted_qty) : "";
      });
      setCounts(initCounts);
    } catch (err) {
      Alert.alert("Error", "Could not load stock take details.");
    } finally {
      setLoadingDetail(false);
    }
  };

  const saveCount = async (itemId: string) => {
    if (!activeTake) return;
    const val = counts[itemId];
    if (val === "" || isNaN(Number(val))) {
      Alert.alert("Invalid", "Enter a valid number.");
      return;
    }
    setSavingItem(itemId);
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/store`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_stock_take_count",
          store: activeStore.type,
          items: [],
          stock_take_id: activeTake.id,
          item_id: itemId,
          counted_qty: Number(val),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      // Update local state
      setActiveTake((prev) => {
        if (!prev) return prev;
        const updated = { ...prev };
        updated.items = { ...updated.items };
        updated.items[itemId] = { ...updated.items[itemId], counted_qty: Number(val) };
        updated.counted = data.counted;
        updated.variances = data.variances;
        return updated;
      });
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Failed to save count.");
    } finally {
      setSavingItem(null);
    }
  };

  const renderTake = ({ item: take }: { item: StockTake }) => {
    const color = STATUS_COLORS[take.status] || colors.textMuted;
    const totalItems = Object.keys(take.items).length;
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.75}
        onPress={() => openDetail(take)}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.takeId}>{take.take_id || take.id.slice(0, 8)}</Text>
          <View style={[styles.badge, { backgroundColor: color + "20" }]}>
            <Text style={[styles.badgeText, { color }]}>{take.status.replace("_", " ")}</Text>
          </View>
        </View>
        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Ionicons name="cube-outline" size={14} color={colors.textMuted} />
            <Text style={styles.metaText}>{totalItems} items</Text>
          </View>
          <View style={styles.metaItem}>
            <Ionicons name="checkmark-outline" size={14} color={colors.textMuted} />
            <Text style={styles.metaText}>{take.counted} counted</Text>
          </View>
          {take.variances > 0 && (
            <View style={styles.metaItem}>
              <Ionicons name="warning-outline" size={14} color={colors.danger} />
              <Text style={[styles.metaText, { color: colors.danger }]}>{take.variances} variances</Text>
            </View>
          )}
        </View>
        <Text style={styles.date}>Started: {formatDate(take.started_at)}</Text>
        {take.started_by_name ? <Text style={styles.date}>By: {take.started_by_name}</Text> : null}
        {take.status === "in_progress" && (
          <View style={styles.openBadge}>
            <Text style={styles.openBadgeText}>Tap to count →</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const itemEntries = activeTake ? Object.entries(activeTake.items) : [];

  return (
    <SafeAreaView style={commonStyles.container}>
      {/* Store Switcher */}
      {access.general && access.it && (
        <View style={styles.switcher}>
          <TouchableOpacity
            style={[styles.switchBtn, activeStore.type === "general" && styles.switchBtnActive]}
            onPress={() => { setActiveStore(GENERAL_STORE_CONFIG); setLoading(true); }}
          >
            <Text style={[styles.switchText, activeStore.type === "general" && styles.switchTextActive]}>General</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.switchBtn, activeStore.type === "it" && styles.switchBtnActive]}
            onPress={() => { setActiveStore(IT_STORE_CONFIG); setLoading(true); }}
          >
            <Text style={[styles.switchText, activeStore.type === "it" && styles.switchTextActive]}>IT Store</Text>
          </TouchableOpacity>
        </View>
      )}

      <Text style={styles.title}>Stock Takes</Text>

      {loading ? (
        <View style={commonStyles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={takes}
          keyExtractor={(t) => t.id}
          renderItem={renderTake}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="clipboard-outline" size={48} color={colors.textMuted} />
              <Text style={styles.emptyText}>No stock takes found.</Text>
              <Text style={styles.emptySubText}>Stock takes are created from the web dashboard.</Text>
            </View>
          }
        />
      )}

      {/* Detail Modal */}
      <Modal visible={!!activeTake} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setActiveTake(null)}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>
              {activeTake?.take_id || "Stock Take"}
            </Text>
            <View style={{ width: 24 }} />
          </View>

          {loadingDetail ? (
            <View style={commonStyles.centered}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : (
            <>
              {activeTake && (
                <View style={styles.progressBar}>
                  <Text style={styles.progressText}>
                    {activeTake.counted}/{Object.keys(activeTake.items).length} counted
                    {activeTake.variances > 0 ? ` · ${activeTake.variances} variances` : ""}
                  </Text>
                  <View style={styles.progressTrack}>
                    <View
                      style={[
                        styles.progressFill,
                        {
                          width: `${Math.round((activeTake.counted / Math.max(Object.keys(activeTake.items).length, 1)) * 100)}%`,
                        },
                      ]}
                    />
                  </View>
                </View>
              )}
              <ScrollView contentContainerStyle={styles.modalScroll}>
                {itemEntries.map(([itemId, it]) => {
                  const hasVariance = it.counted_qty !== null && it.counted_qty !== it.system_qty;
                  return (
                    <View
                      key={itemId}
                      style={[styles.countRow, hasVariance && styles.countRowVariance]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.countName} numberOfLines={2}>{it.name}</Text>
                        <Text style={styles.countMeta}>
                          System: {it.system_qty}
                          {it.counted_qty !== null ? ` · Counted: ${it.counted_qty}` : " · Not counted"}
                          {hasVariance ? ` · Diff: ${it.counted_qty! - it.system_qty}` : ""}
                        </Text>
                      </View>
                      {activeTake?.status === "in_progress" && (
                        <View style={styles.countInputRow}>
                          <TextInput
                            style={styles.countInput}
                            value={counts[itemId] ?? ""}
                            onChangeText={(v) => setCounts((p) => ({ ...p, [itemId]: v.replace(/[^0-9]/g, "") }))}
                            keyboardType="numeric"
                            placeholder="—"
                            placeholderTextColor={colors.textMuted}
                            selectTextOnFocus
                          />
                          <TouchableOpacity
                            style={[styles.saveBtn, savingItem === itemId && { opacity: 0.5 }]}
                            onPress={() => saveCount(itemId)}
                            disabled={savingItem === itemId}
                          >
                            {savingItem === itemId
                              ? <ActivityIndicator size="small" color="#fff" />
                              : <Ionicons name="checkmark" size={16} color="#fff" />}
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  );
                })}
              </ScrollView>
            </>
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: fontSize.xl, fontWeight: "700", color: colors.text, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
  switcher: { flexDirection: "row", margin: spacing.lg, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  switchBtn: { flex: 1, paddingVertical: spacing.sm, alignItems: "center" },
  switchBtnActive: { backgroundColor: colors.primary },
  switchText: { fontSize: fontSize.sm, fontWeight: "600", color: colors.textSecondary },
  switchTextActive: { color: "#fff" },
  list: { padding: spacing.lg, paddingTop: spacing.sm },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.md },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.xs },
  takeId: { fontSize: fontSize.base, fontWeight: "700", color: colors.text },
  badge: { borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  badgeText: { fontSize: fontSize.xs, fontWeight: "600", textTransform: "capitalize" },
  metaRow: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.xs },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { fontSize: fontSize.sm, color: colors.textSecondary },
  date: { fontSize: fontSize.xs, color: colors.textMuted },
  openBadge: { marginTop: spacing.sm, backgroundColor: colors.primary + "18", borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 4, alignSelf: "flex-start" },
  openBadgeText: { fontSize: fontSize.xs, fontWeight: "600", color: colors.primary },
  empty: { alignItems: "center", paddingVertical: spacing.xxl, gap: spacing.sm },
  emptyText: { fontSize: fontSize.base, color: colors.textMuted },
  emptySubText: { fontSize: fontSize.sm, color: colors.textMuted, textAlign: "center" },
  // Modal
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalTitle: { fontSize: fontSize.lg, fontWeight: "700", color: colors.text },
  progressBar: { padding: spacing.lg, paddingBottom: spacing.sm },
  progressText: { fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.xs },
  progressTrack: { height: 6, backgroundColor: colors.border, borderRadius: 3, overflow: "hidden" },
  progressFill: { height: 6, backgroundColor: colors.primary, borderRadius: 3 },
  modalScroll: { padding: spacing.lg },
  countRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  countRowVariance: { backgroundColor: colors.danger + "08" },
  countName: { fontSize: fontSize.sm, fontWeight: "600", color: colors.text },
  countMeta: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  countInputRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  countInput: { width: 56, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm, textAlign: "center", fontSize: fontSize.base, color: colors.text, backgroundColor: colors.surface },
  saveBtn: { backgroundColor: colors.primary, borderRadius: radius.md, padding: spacing.sm, alignItems: "center", justifyContent: "center", width: 32, height: 32 },
});
