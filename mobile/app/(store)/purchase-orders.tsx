import { useState, useCallback, useEffect } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Alert, ActivityIndicator, RefreshControl, Modal, ScrollView, TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useAuth, getStoreAccess } from "@/context/auth-context";
import { auth } from "@/lib/firebase";
import { GENERAL_STORE_CONFIG, IT_STORE_CONFIG, STORE_CONFIGS, type StoreConfig } from "@/lib/store-config";
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

interface POItem {
  item_id: string;
  item_name: string;
  quantity: number;
  unit_cost: number;
  received_qty: number;
}

interface PurchaseOrder {
  id: string;
  po_number: string;
  status: "draft" | "approved" | "partial" | "received" | "cancelled";
  vendor_name?: string;
  items: POItem[];
  notes?: string;
  created_at: string;
  approved_at?: string;
  received_at?: string;
  total_cost?: number;
}

const STATUS_COLORS: Record<string, string> = {
  draft: colors.textMuted,
  approved: colors.primary,
  partial: colors.warning,
  received: colors.success,
  cancelled: colors.danger,
};

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] || colors.textMuted;
  return (
    <View style={[styles.badge, { backgroundColor: color + "20" }]}>
      <Text style={[styles.badgeText, { color }]}>{status}</Text>
    </View>
  );
}

function formatDate(s?: string) {
  if (!s) return "—";
  try { return new Date(s).toLocaleDateString(); } catch { return s; }
}

export default function PurchaseOrdersScreen() {
  const { roles } = useAuth();
  const access = getStoreAccess(roles);
  const [activeStore, setActiveStore] = useState<StoreConfig>(
    access.general ? GENERAL_STORE_CONFIG : IT_STORE_CONFIG
  );
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
  const [receiving, setReceiving] = useState(false);
  const [receiveQtys, setReceiveQtys] = useState<Record<string, string>>({});

  const fetchOrders = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch(
        `${API_BASE}/store?action=purchase_orders&store=${activeStore.type}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setOrders(data.purchase_orders || []);
    } catch (err) {
      console.error("Failed to fetch POs:", err);
      Alert.alert("Error", "Could not load purchase orders.");
    }
  }, [activeStore.type]);

  useEffect(() => {
    setLoading(true);
    fetchOrders().finally(() => setLoading(false));
  }, [fetchOrders]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchOrders();
    setRefreshing(false);
  }, [fetchOrders]);

  const openReceive = (po: PurchaseOrder) => {
    // Pre-fill with remaining quantities
    const qtys: Record<string, string> = {};
    po.items.forEach((it) => {
      const remaining = it.quantity - it.received_qty;
      qtys[it.item_id] = remaining > 0 ? String(remaining) : "0";
    });
    setReceiveQtys(qtys);
    setSelectedPO(po);
  };

  const handleReceive = async () => {
    if (!selectedPO) return;
    const received_items = Object.entries(receiveQtys)
      .filter(([, qty]) => Number(qty) > 0)
      .map(([item_id, qty]) => ({ item_id, quantity: Number(qty) }));

    if (received_items.length === 0) {
      Alert.alert("No items", "Enter quantities to receive.");
      return;
    }

    setReceiving(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/store`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "receive_po",
          store: activeStore.type,
          items: received_items.map((i) => ({ item_id: i.item_id, item_name: "", quantity: i.quantity })),
          po_id: selectedPO.id,
          received_items,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");

      Alert.alert(
        "Stock Received",
        `PO ${data.po_number} — received ${data.total_qty} units.\nStatus: ${data.status}`,
        [{ text: "OK", onPress: () => { setSelectedPO(null); fetchOrders(); } }]
      );
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Failed to receive stock.");
    } finally {
      setReceiving(false);
    }
  };

  const renderOrder = ({ item: po }: { item: PurchaseOrder }) => {
    const receivable = po.status === "approved" || po.status === "partial";
    const totalItems = po.items.length;
    const totalQty = po.items.reduce((s, i) => s + i.quantity, 0);
    const receivedQty = po.items.reduce((s, i) => s + i.received_qty, 0);

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.75}
        onPress={() => receivable ? openReceive(po) : null}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.poNumber}>{po.po_number}</Text>
          <StatusBadge status={po.status} />
        </View>
        {po.vendor_name ? (
          <Text style={styles.vendor}>Vendor: {po.vendor_name}</Text>
        ) : null}
        <View style={styles.metaRow}>
          <Text style={styles.meta}>{totalItems} item{totalItems !== 1 ? "s" : ""}</Text>
          <Text style={styles.meta}>Ordered: {totalQty}</Text>
          <Text style={styles.meta}>Received: {receivedQty}</Text>
        </View>
        <Text style={styles.date}>Created: {formatDate(po.created_at)}</Text>
        {receivable && (
          <TouchableOpacity style={styles.receiveBtn} onPress={() => openReceive(po)}>
            <Ionicons name="download-outline" size={16} color="#fff" />
            <Text style={styles.receiveBtnText}>Receive Stock</Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={commonStyles.container}>
      {/* Store Switcher */}
      {access.general && access.it && (
        <View style={styles.switcher}>
          <TouchableOpacity
            style={[styles.switchBtn, activeStore.type === "general" && styles.switchBtnActive]}
            onPress={() => { setActiveStore(GENERAL_STORE_CONFIG); setLoading(true); }}
          >
            <Text style={[styles.switchText, activeStore.type === "general" && styles.switchTextActive]}>
              General
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.switchBtn, activeStore.type === "it" && styles.switchBtnActive]}
            onPress={() => { setActiveStore(IT_STORE_CONFIG); setLoading(true); }}
          >
            <Text style={[styles.switchText, activeStore.type === "it" && styles.switchTextActive]}>
              IT Store
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <Text style={styles.title}>Purchase Orders</Text>

      {loading ? (
        <View style={commonStyles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(po) => po.id}
          renderItem={renderOrder}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="document-text-outline" size={48} color={colors.textMuted} />
              <Text style={styles.emptyText}>No purchase orders found.</Text>
            </View>
          }
        />
      )}

      {/* Receive Modal */}
      <Modal visible={!!selectedPO} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setSelectedPO(null)}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Receive — {selectedPO?.po_number}</Text>
            <View style={{ width: 24 }} />
          </View>

          <ScrollView contentContainerStyle={styles.modalScroll}>
            {selectedPO?.vendor_name ? (
              <Text style={styles.modalVendor}>Vendor: {selectedPO.vendor_name}</Text>
            ) : null}
            <Text style={styles.modalSub}>Enter quantities received for each item:</Text>

            {selectedPO?.items.map((it) => {
              const remaining = it.quantity - it.received_qty;
              return (
                <View key={it.item_id} style={styles.receiveRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.receiveItemName} numberOfLines={2}>{it.item_name}</Text>
                    <Text style={styles.receiveItemMeta}>
                      Ordered: {it.quantity} · Received: {it.received_qty} · Remaining: {remaining}
                    </Text>
                  </View>
                  <TextInput
                    style={[styles.qtyInput, remaining <= 0 && styles.qtyInputDisabled]}
                    value={receiveQtys[it.item_id] || "0"}
                    onChangeText={(v) => setReceiveQtys((prev) => ({ ...prev, [it.item_id]: v.replace(/[^0-9]/g, "") }))}
                    keyboardType="numeric"
                    editable={remaining > 0}
                    selectTextOnFocus
                  />
                </View>
              );
            })}
          </ScrollView>

          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={[styles.submitBtn, receiving && { opacity: 0.6 }]}
              onPress={handleReceive}
              disabled={receiving}
            >
              {receiving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
                  <Text style={styles.submitBtnText}>Confirm Receipt</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
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
  poNumber: { fontSize: fontSize.base, fontWeight: "700", color: colors.text },
  badge: { borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  badgeText: { fontSize: fontSize.xs, fontWeight: "600", textTransform: "capitalize" },
  vendor: { fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.xs },
  metaRow: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.xs },
  meta: { fontSize: fontSize.sm, color: colors.textSecondary },
  date: { fontSize: fontSize.xs, color: colors.textMuted, marginBottom: spacing.sm },
  receiveBtn: { flexDirection: "row", alignItems: "center", gap: spacing.xs, backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, alignSelf: "flex-start" },
  receiveBtnText: { fontSize: fontSize.sm, fontWeight: "600", color: "#fff" },
  empty: { alignItems: "center", paddingVertical: spacing.xxl, gap: spacing.md },
  emptyText: { fontSize: fontSize.base, color: colors.textMuted },
  // Modal
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalTitle: { fontSize: fontSize.lg, fontWeight: "700", color: colors.text },
  modalScroll: { padding: spacing.lg },
  modalVendor: { fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.xs },
  modalSub: { fontSize: fontSize.sm, color: colors.textMuted, marginBottom: spacing.lg },
  receiveRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  receiveItemName: { fontSize: fontSize.sm, fontWeight: "600", color: colors.text },
  receiveItemMeta: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  qtyInput: { width: 64, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm, textAlign: "center", fontSize: fontSize.base, fontWeight: "600", color: colors.text, backgroundColor: colors.surface },
  qtyInputDisabled: { opacity: 0.4 },
  modalFooter: { padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border },
  submitBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, backgroundColor: colors.primary, borderRadius: radius.lg, paddingVertical: spacing.md },
  submitBtnText: { fontSize: fontSize.base, fontWeight: "700", color: "#fff" },
});
