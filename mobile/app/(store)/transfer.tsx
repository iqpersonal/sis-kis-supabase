import { useState, useCallback, useEffect } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Alert, ActivityIndicator, TextInput, ScrollView, KeyboardAvoidingView, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { collection, onSnapshot, query, where, orderBy } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { useAuth, getStoreAccess } from "@/context/auth-context";
import { GENERAL_STORE_CONFIG, IT_STORE_CONFIG } from "@/lib/store-config";
import type { StoreItem } from "@/types/store";
import { colors, spacing, fontSize, radius, commonStyles } from "@/lib/theme";

const API_BASE = "https://sis-kis.web.app/api";

let _cachedToken: string | undefined;
let _tokenExpiry = 0;
async function getToken(): Promise<string> {
  if (_cachedToken && Date.now() < _tokenExpiry) return _cachedToken;
  const t = await auth.currentUser?.getIdToken();
  _cachedToken = t ?? "";
  _tokenExpiry = Date.now() + 50 * 60 * 1000;
  return _cachedToken;
}

interface TransferItem extends StoreItem {
  transferQty: number;
}

export default function TransferScreen() {
  const { roles } = useAuth();
  const access = getStoreAccess(roles);
  const [search, setSearch] = useState("");
  const [allItems, setAllItems] = useState<StoreItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [cart, setCart] = useState<TransferItem[]>([]);
  const [notes, setNotes] = useState("");
  const [transferring, setTransferring] = useState(false);
  const [direction, setDirection] = useState<"gen_to_it" | "it_to_gen">(
    access.general ? "gen_to_it" : "it_to_gen"
  );

  const fromConfig = direction === "gen_to_it" ? GENERAL_STORE_CONFIG : IT_STORE_CONFIG;
  const toConfig = direction === "gen_to_it" ? IT_STORE_CONFIG : GENERAL_STORE_CONFIG;

  // Load items from source store in real-time
  useEffect(() => {
    setLoadingItems(true);
    setCart([]);
    const q = query(
      collection(db, fromConfig.collections.items),
      where("is_active", "==", true),
      orderBy("name")
    );
    const unsub = onSnapshot(q, (snap) => {
      setAllItems(snap.docs.map((d) => ({ id: d.id, ...d.data() } as StoreItem)));
      setLoadingItems(false);
    }, () => setLoadingItems(false));
    return () => unsub();
  }, [fromConfig.collections.items]);

  const filteredItems = search.trim()
    ? allItems.filter((it) =>
        it.name.toLowerCase().includes(search.toLowerCase()) ||
        it.item_id.toLowerCase().includes(search.toLowerCase())
      )
    : allItems;

  const cartQty = (itemId: string) => cart.find((c) => c.item_id === itemId)?.transferQty || 0;

  const addToCart = useCallback((item: StoreItem) => {
    setCart((prev) => {
      const exists = prev.find((c) => c.item_id === item.item_id);
      if (exists) return prev; // already added, use adjust functions
      return [...prev, { ...item, transferQty: 1 }];
    });
  }, []);

  const adjustCart = useCallback((itemId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((c) => c.item_id === itemId ? { ...c, transferQty: Math.max(0, c.transferQty + delta) } : c)
        .filter((c) => c.transferQty > 0)
    );
  }, []);

  const removeFromCart = useCallback((itemId: string) => {
    setCart((prev) => prev.filter((c) => c.item_id !== itemId));
  }, []);

  const handleTransfer = async () => {
    if (cart.length === 0) {
      Alert.alert("Empty", "Add items to transfer.");
      return;
    }
    const invalid = cart.find((c) => c.transferQty > c.quantity);
    if (invalid) {
      Alert.alert("Insufficient Stock", `${invalid.name} only has ${invalid.quantity} in stock.`);
      return;
    }

    Alert.alert(
      "Confirm Transfer",
      `Transfer ${cart.length} item type(s) from ${fromConfig.label} to ${toConfig.label}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Transfer",
          onPress: async () => {
            setTransferring(true);
            try {
              const token = await getToken();
              const storeParam = direction === "gen_to_it" ? "general" : "it";
              const res = await fetch(`${API_BASE}/general-store?store=${storeParam}`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                  action: "transfer_out",
                  transfers: cart.map((c) => ({
                    item_id: c.item_id,
                    item_name: c.name,
                    quantity: c.transferQty,
                  })),
                  notes: notes.trim() || `Mobile transfer to ${toConfig.label}`,
                }),
              });
              const data = await res.json();
              if (!res.ok) throw new Error(data.error || "Transfer failed");

              Alert.alert(
                "Transfer Complete",
                `Successfully transferred items to ${toConfig.label}.`,
                [{ text: "OK", onPress: () => { setCart([]); setNotes(""); } }]
              );
            } catch (err) {
              Alert.alert("Error", err instanceof Error ? err.message : "Transfer failed.");
            } finally {
              setTransferring(false);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={commonStyles.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Inter-Store Transfer</Text>
          {/* Direction toggle (only if user has both) */}
          {access.general && access.it && (
            <View style={styles.directionRow}>
              <View style={styles.dirChip}>
                <Text style={styles.dirFrom}>{fromConfig.label}</Text>
                <Ionicons name="arrow-forward" size={16} color={colors.primary} />
                <Text style={styles.dirTo}>{toConfig.label}</Text>
              </View>
              <TouchableOpacity
                style={styles.flipBtn}
                onPress={() => {
                  setDirection((d) => d === "gen_to_it" ? "it_to_gen" : "gen_to_it");
                  setCart([]);
                }}
              >
                <Ionicons name="swap-horizontal-outline" size={18} color={colors.primary} />
                <Text style={styles.flipText}>Flip</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={{ flex: 1 }}>
          {/* Cart summary (top) */}
          {cart.length > 0 && (
            <View style={styles.cartSummary}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
                {cart.map((c) => (
                  <View key={c.item_id} style={styles.cartChip}>
                    <Text style={styles.cartChipText} numberOfLines={1}>{c.name}</Text>
                    <View style={styles.cartQtyRow}>
                      <TouchableOpacity onPress={() => adjustCart(c.item_id, -1)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Ionicons name="remove-circle" size={20} color={colors.danger} />
                      </TouchableOpacity>
                      <Text style={styles.cartQtyText}>{c.transferQty}</Text>
                      <TouchableOpacity onPress={() => adjustCart(c.item_id, 1)} disabled={c.transferQty >= c.quantity} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Ionicons name="add-circle" size={20} color={c.transferQty >= c.quantity ? colors.textMuted : colors.success} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => removeFromCart(c.item_id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Ionicons name="close-circle" size={20} color={colors.textMuted} />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Search */}
          <View style={styles.searchRow}>
            <Ionicons name="search-outline" size={18} color={colors.textMuted} style={{ marginLeft: spacing.md }} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search items..."
              placeholderTextColor={colors.textMuted}
              value={search}
              onChangeText={setSearch}
            />
          </View>

          {/* Item list */}
          {loadingItems ? (
            <View style={commonStyles.centered}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : (
            <FlatList
              data={filteredItems}
              keyExtractor={(i) => i.id}
              contentContainerStyle={styles.list}
              ListEmptyComponent={
                <View style={styles.empty}>
                  <Text style={styles.emptyText}>No items found.</Text>
                </View>
              }
              renderItem={({ item }) => {
                const inCart = cartQty(item.item_id) > 0;
                return (
                  <View style={[styles.itemRow, inCart && styles.itemRowSelected]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
                      <Text style={styles.itemMeta}>{item.item_id} · Stock: {item.quantity} {item.unit}</Text>
                    </View>
                    {item.quantity > 0 ? (
                      <TouchableOpacity
                        style={[styles.addBtn, inCart && styles.addBtnActive]}
                        onPress={() => inCart ? adjustCart(item.item_id, 1) : addToCart(item)}
                      >
                        <Ionicons name={inCart ? "add" : "add-outline"} size={18} color="#fff" />
                        {inCart && <Text style={styles.addBtnQty}>{cartQty(item.item_id)}</Text>}
                      </TouchableOpacity>
                    ) : (
                      <View style={styles.outOfStock}>
                        <Text style={styles.outText}>Out</Text>
                      </View>
                    )}
                  </View>
                );
              }}
            />
          )}
        </View>

        {/* Notes + Transfer button */}
        {cart.length > 0 && (
          <View style={styles.footer}>
            <TextInput
              style={styles.notesInput}
              placeholder="Notes (optional)"
              placeholderTextColor={colors.textMuted}
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={2}
            />
            <TouchableOpacity
              style={[styles.transferBtn, transferring && { opacity: 0.6 }]}
              onPress={handleTransfer}
              disabled={transferring}
            >
              {transferring ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="swap-horizontal-outline" size={20} color="#fff" />
                  <Text style={styles.transferBtnText}>
                    Transfer {cart.reduce((s, c) => s + c.transferQty, 0)} unit(s)
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { padding: spacing.lg, paddingBottom: spacing.sm },
  title: { fontSize: fontSize.xl, fontWeight: "700", color: colors.text, marginBottom: spacing.sm },
  directionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  dirChip: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.primary + "15", borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  dirFrom: { fontSize: fontSize.sm, fontWeight: "600", color: colors.primary },
  dirTo: { fontSize: fontSize.sm, fontWeight: "600", color: colors.primary },
  flipBtn: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  flipText: { fontSize: fontSize.sm, color: colors.primary },
  cartSummary: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  cartChip: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.primary + "50", padding: spacing.sm, minWidth: 120 },
  cartChipText: { fontSize: fontSize.xs, fontWeight: "600", color: colors.text, marginBottom: 4 },
  cartQtyRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  cartQtyText: { fontSize: fontSize.sm, fontWeight: "700", color: colors.text, minWidth: 20, textAlign: "center" },
  searchRow: { flexDirection: "row", alignItems: "center", marginHorizontal: spacing.lg, marginVertical: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  searchInput: { flex: 1, padding: spacing.md, fontSize: fontSize.sm, color: colors.text },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  itemRow: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border, gap: spacing.md },
  itemRowSelected: { backgroundColor: colors.primary + "08" },
  itemName: { fontSize: fontSize.sm, fontWeight: "600", color: colors.text },
  itemMeta: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  addBtn: { backgroundColor: colors.primary, borderRadius: radius.md, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, minWidth: 40, justifyContent: "center" },
  addBtnActive: { backgroundColor: colors.success },
  addBtnQty: { fontSize: fontSize.sm, fontWeight: "700", color: "#fff" },
  outOfStock: { backgroundColor: colors.danger + "20", borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  outText: { fontSize: fontSize.xs, color: colors.danger, fontWeight: "600" },
  empty: { paddingVertical: spacing.xxl, alignItems: "center" },
  emptyText: { fontSize: fontSize.base, color: colors.textMuted },
  footer: { padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border, gap: spacing.sm },
  notesInput: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, fontSize: fontSize.sm, color: colors.text, maxHeight: 80 },
  transferBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, backgroundColor: colors.primary, borderRadius: radius.lg, paddingVertical: spacing.md },
  transferBtnText: { fontSize: fontSize.base, fontWeight: "700", color: "#fff" },
});
