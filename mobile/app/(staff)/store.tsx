import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useAuth } from "@/context/auth-context";
import { auth } from "@/lib/firebase";
import { colors, spacing, fontSize, radius, commonStyles } from "@/lib/theme";

const API_BASE = "https://sis-kis.web.app/api/staff-portal";

interface StoreItem {
  id: string;
  name: string;
  category: string;
  quantity: number;
  barcode: string;
}

interface StoreRequest {
  id: string;
  items: { name: string; quantity: number }[];
  status: string;
  store_type: string;
  created_at: { _seconds: number } | string;
}

export default function StaffStore() {
  const { user } = useAuth();
  const [items, setItems] = useState<StoreItem[]>([]);
  const [requests, setRequests] = useState<StoreRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<"browse" | "history">("browse");
  const [cart, setCart] = useState<Record<string, number>>({});

  const fetchData = useCallback(async () => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const res = await fetch(`${API_BASE}/store`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setItems(data.items || []);
      setRequests(data.requests || []);
    } catch (err) {
      console.error("Failed to fetch store data:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const addToCart = (itemId: string) => {
    setCart((prev) => ({
      ...prev,
      [itemId]: (prev[itemId] || 0) + 1,
    }));
  };

  const removeFromCart = (itemId: string) => {
    setCart((prev) => {
      const n = { ...prev };
      if (n[itemId] > 1) {
        n[itemId]--;
      } else {
        delete n[itemId];
      }
      return n;
    });
  };

  const cartCount = Object.values(cart).reduce((a, b) => a + b, 0);

  const submitRequest = async () => {
    if (cartCount === 0) return;
    try {
      const token = await auth.currentUser?.getIdToken();
      const cartItems = Object.entries(cart).map(([id, qty]) => {
        const item = items.find((i) => i.id === id);
        return { item_id: id, name: item?.name || id, quantity: qty };
      });
      const res = await fetch(`${API_BASE}/store`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          items: cartItems,
          store_type: "general",
        }),
      });
      const data = await res.json();
      if (data.success) {
        Alert.alert("Success", "Request submitted successfully");
        setCart({});
        fetchData();
      } else {
        Alert.alert("Error", data.error || "Failed to submit request");
      }
    } catch {
      Alert.alert("Error", "Failed to submit request");
    }
  };

  const formatDate = (ts: { _seconds: number } | string | undefined) => {
    if (!ts) return "";
    if (typeof ts === "string") return new Date(ts).toLocaleDateString();
    if (typeof ts === "object" && "_seconds" in ts) {
      return new Date(ts._seconds * 1000).toLocaleDateString();
    }
    return "";
  };

  const STATUS_COLORS: Record<string, string> = {
    pending: "#f59e0b",
    approved: "#22c55e",
    rejected: "#ef4444",
    fulfilled: "#3b82f6",
  };

  if (loading) {
    return (
      <View style={commonStyles.centered}>
        <ActivityIndicator size="large" color="#10b981" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Tab Switch */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabBtn, tab === "browse" && styles.tabActive]}
          onPress={() => setTab("browse")}
        >
          <Text style={[styles.tabText, tab === "browse" && styles.tabTextActive]}>
            Browse Items
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, tab === "history" && styles.tabActive]}
          onPress={() => setTab("history")}
        >
          <Text style={[styles.tabText, tab === "history" && styles.tabTextActive]}>
            My Requests
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); fetchData(); }}
            tintColor="#10b981"
          />
        }
      >
        {tab === "browse" ? (
          <>
            {items.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="cube-outline" size={48} color={colors.textMuted} />
                <Text style={styles.emptyText}>No items available</Text>
              </View>
            ) : (
              items.map((item) => (
                <View key={item.id} style={styles.itemCard}>
                  <View style={styles.itemInfo}>
                    <Text style={styles.itemName}>{item.name}</Text>
                    <Text style={styles.itemCategory}>{item.category}</Text>
                    <Text style={styles.itemQty}>
                      In stock: {item.quantity}
                    </Text>
                  </View>
                  <View style={styles.cartControls}>
                    {cart[item.id] ? (
                      <View style={styles.qtyControls}>
                        <TouchableOpacity
                          onPress={() => removeFromCart(item.id)}
                          style={styles.qtyBtn}
                        >
                          <Ionicons name="remove" size={18} color="#10b981" />
                        </TouchableOpacity>
                        <Text style={styles.qtyText}>{cart[item.id]}</Text>
                        <TouchableOpacity
                          onPress={() => addToCart(item.id)}
                          style={styles.qtyBtn}
                        >
                          <Ionicons name="add" size={18} color="#10b981" />
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity
                        onPress={() => addToCart(item.id)}
                        style={styles.addBtn}
                      >
                        <Ionicons name="add" size={18} color="#fff" />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              ))
            )}

            {/* Cart Summary */}
            {cartCount > 0 && (
              <TouchableOpacity style={styles.cartBar} onPress={submitRequest}>
                <Text style={styles.cartText}>
                  Submit Request ({cartCount} item{cartCount > 1 ? "s" : ""})
                </Text>
                <Ionicons name="arrow-forward" size={20} color="#fff" />
              </TouchableOpacity>
            )}
          </>
        ) : (
          <>
            {requests.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="clipboard-outline" size={48} color={colors.textMuted} />
                <Text style={styles.emptyText}>No requests yet</Text>
              </View>
            ) : (
              requests.map((r) => (
                <View key={r.id} style={styles.requestCard}>
                  <View style={styles.requestHeader}>
                    <Text style={styles.requestDate}>
                      {formatDate(r.created_at)}
                    </Text>
                    <View
                      style={[
                        styles.statusBadge,
                        {
                          backgroundColor:
                            (STATUS_COLORS[r.status] || "#64748b") + "20",
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusText,
                          {
                            color: STATUS_COLORS[r.status] || "#64748b",
                          },
                        ]}
                      >
                        {r.status}
                      </Text>
                    </View>
                  </View>
                  {r.items?.map((item, idx) => (
                    <Text key={idx} style={styles.requestItem}>
                      {item.name} × {item.quantity}
                    </Text>
                  ))}
                </View>
              ))
            )}
          </>
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
  tabBar: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 14,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabActive: {
    borderBottomColor: "#10b981",
  },
  tabText: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: colors.textMuted,
  },
  tabTextActive: {
    color: "#10b981",
  },
  scroll: {
    padding: spacing.lg,
    paddingBottom: 100,
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
  itemCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: fontSize.base,
    fontWeight: "600",
    color: colors.text,
  },
  itemCategory: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    textTransform: "capitalize",
    marginTop: 2,
  },
  itemQty: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  cartControls: {
    alignItems: "center",
  },
  qtyControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  qtyBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#10b98120",
    justifyContent: "center",
    alignItems: "center",
  },
  qtyText: {
    fontSize: fontSize.base,
    fontWeight: "600",
    color: colors.text,
    minWidth: 24,
    textAlign: "center",
  },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#10b981",
    justifyContent: "center",
    alignItems: "center",
  },
  cartBar: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: "#10b981",
    borderRadius: radius.lg,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  cartText: {
    color: "#fff",
    fontSize: fontSize.base,
    fontWeight: "600",
  },
  requestCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  requestHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xs,
  },
  requestDate: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  statusBadge: {
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  statusText: {
    fontSize: fontSize.xs,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  requestItem: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
