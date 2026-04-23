import { useState, useMemo, useCallback } from "react";
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  Image, Alert, Modal, KeyboardAvoidingView, Platform, ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useAuth, getStoreAccess } from "@/context/auth-context";
import { useStoreItems } from "@/hooks/use-store-data";
import { GENERAL_STORE_CONFIG, IT_STORE_CONFIG, type StoreConfig } from "@/lib/store-config";
import { submitRequest } from "@/lib/store-actions";
import type { StoreItem } from "@/types/store";
import { colors, spacing, fontSize, radius, commonStyles } from "@/lib/theme";

/* ── Types ───────────────────────────────────────────────────────── */

interface CartItem {
  item_id: string;
  name: string;
  qty_requested: number;
  image_url?: string;
  available: number;
  unit: string;
}

/* ── Components ──────────────────────────────────────────────────── */

function ItemCard({
  item,
  config,
  cartQty,
  onAdd,
}: {
  item: StoreItem;
  config: StoreConfig;
  cartQty: number;
  onAdd: (item: StoreItem) => void;
}) {
  const imgSrc = item.custom_image_url || item.image_url;
  return (
    <View style={s.itemCard}>
      {imgSrc ? (
        <Image source={{ uri: imgSrc }} style={s.itemImg} />
      ) : (
        <View style={s.itemImgPlaceholder}>
          <Ionicons name="cube-outline" size={32} color={colors.textMuted} />
        </View>
      )}
      <View style={s.itemInfo}>
        <Text style={s.itemName} numberOfLines={1}>{item.name}</Text>
        {item.name_ar ? <Text style={s.itemNameAr} numberOfLines={1}>{item.name_ar}</Text> : null}
        <Text style={s.itemMeta}>
          {item.item_id} • {config.categoryLabels[item.category] || item.category}
        </Text>
        <Text style={s.itemStock}>
          Available: <Text style={{ fontWeight: "700" }}>{item.quantity}</Text> {item.unit}
        </Text>
      </View>
      <TouchableOpacity
        style={[s.addBtn, cartQty > 0 && s.addBtnInCart]}
        onPress={() => onAdd(item)}
      >
        <Ionicons
          name={cartQty > 0 ? "checkmark-circle" : "add-circle"}
          size={28}
          color={cartQty > 0 ? colors.success : colors.primary}
        />
        {cartQty > 0 && <Text style={s.addBtnQty}>{cartQty}</Text>}
      </TouchableOpacity>
    </View>
  );
}

function CartRow({
  ci,
  onQtyChange,
  onRemove,
}: {
  ci: CartItem;
  onQtyChange: (id: string, qty: number) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <View style={s.cartRow}>
      <View style={s.cartRowInfo}>
        <Text style={s.cartRowName} numberOfLines={1}>{ci.name}</Text>
        <Text style={s.cartRowMeta}>Available: {ci.available} {ci.unit}</Text>
      </View>
      <View style={s.qtyControl}>
        <TouchableOpacity
          style={s.qtyBtn}
          onPress={() => ci.qty_requested <= 1 ? onRemove(ci.item_id) : onQtyChange(ci.item_id, ci.qty_requested - 1)}
        >
          <Ionicons name={ci.qty_requested <= 1 ? "trash-outline" : "remove"} size={18} color={ci.qty_requested <= 1 ? colors.danger : colors.text} />
        </TouchableOpacity>
        <Text style={s.qtyText}>{ci.qty_requested}</Text>
        <TouchableOpacity
          style={s.qtyBtn}
          onPress={() => onQtyChange(ci.item_id, ci.qty_requested + 1)}
        >
          <Ionicons name="add" size={18} color={colors.text} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

/* ── Main Screen ─────────────────────────────────────────────────── */

export default function NewRequestScreen() {
  const { roles, user } = useAuth();
  const access = getStoreAccess(roles);
  const router = useRouter();

  const [activeStore, setActiveStore] = useState<StoreConfig>(
    access.general ? GENERAL_STORE_CONFIG : IT_STORE_CONFIG
  );
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | undefined>();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [notes, setNotes] = useState("");
  const [showCart, setShowCart] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const { items, loading } = useStoreItems(activeStore, {
    searchText: search,
    categoryFilter,
  });

  // Map: item_id => qty in cart
  const cartMap = useMemo(() => {
    const m: Record<string, number> = {};
    cart.forEach((c) => { m[c.item_id] = c.qty_requested; });
    return m;
  }, [cart]);

  const handleAddToCart = useCallback((item: StoreItem) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.item_id === item.item_id);
      if (existing) {
        // Already in cart — increase qty
        return prev.map((c) =>
          c.item_id === item.item_id
            ? { ...c, qty_requested: c.qty_requested + 1 }
            : c
        );
      }
      return [
        ...prev,
        {
          item_id: item.item_id,
          name: item.name,
          qty_requested: 1,
          image_url: item.custom_image_url || item.image_url,
          available: item.quantity,
          unit: item.unit,
        },
      ];
    });
  }, []);

  const handleQtyChange = useCallback((itemId: string, qty: number) => {
    setCart((prev) => prev.map((c) => (c.item_id === itemId ? { ...c, qty_requested: qty } : c)));
  }, []);

  const handleRemove = useCallback((itemId: string) => {
    setCart((prev) => prev.filter((c) => c.item_id !== itemId));
  }, []);

  const handleSubmit = async () => {
    if (cart.length === 0) {
      Alert.alert("Empty Cart", "Please add at least one item to your request.");
      return;
    }
    Alert.alert(
      "Submit Request",
      `Submit request with ${cart.length} item${cart.length > 1 ? "s" : ""}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Submit",
          onPress: async () => {
            setSubmitting(true);
            try {
              const reqId = await submitRequest(
                activeStore,
                cart.map((c) => ({ item_id: c.item_id, name: c.name, qty_requested: c.qty_requested })),
                user?.uid || "",
                user?.displayName || "",
                notes.trim()
              );
              Alert.alert("Success", `Request ${reqId} submitted successfully.`);
              setCart([]);
              setNotes("");
              setShowCart(false);
              router.back();
            } catch (e: unknown) {
              Alert.alert("Error", e instanceof Error ? e.message : "Failed to submit request");
            }
            setSubmitting(false);
          },
        },
      ]
    );
  };

  const totalItems = cart.reduce((sum, c) => sum + c.qty_requested, 0);

  return (
    <SafeAreaView style={commonStyles.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={s.title}>New Request</Text>
        {access.general && access.it && (
          <View style={s.miniSwitcher}>
            <TouchableOpacity
              style={[s.miniBtn, activeStore.type === "general" && s.miniBtnActive]}
              onPress={() => { setActiveStore(GENERAL_STORE_CONFIG); setCategoryFilter(undefined); }}
            >
              <Text style={[s.miniText, activeStore.type === "general" && s.miniTextActive]}>GS</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.miniBtn, activeStore.type === "it" && s.miniBtnActive]}
              onPress={() => { setActiveStore(IT_STORE_CONFIG); setCategoryFilter(undefined); }}
            >
              <Text style={[s.miniText, activeStore.type === "it" && s.miniTextActive]}>IT</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Search */}
      <View style={s.searchRow}>
        <Ionicons name="search-outline" size={20} color={colors.textMuted} style={s.searchIcon} />
        <TextInput
          style={s.searchInput}
          placeholder="Search items by name, ID, or barcode..."
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={setSearch}
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch("")}>
            <Ionicons name="close-circle" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Category Chips */}
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={["all", ...activeStore.categories]}
        style={s.chipList}
        contentContainerStyle={s.chipContent}
        keyExtractor={(c) => c}
        renderItem={({ item: cat }) => {
          const active = cat === "all" ? !categoryFilter : categoryFilter === cat;
          return (
            <TouchableOpacity
              style={[s.chip, active && s.chipActive]}
              onPress={() => setCategoryFilter(cat === "all" ? undefined : cat)}
            >
              <Text style={[s.chipText, active && s.chipTextActive]}>
                {cat === "all" ? "All" : activeStore.categoryLabels[cat] || cat}
              </Text>
            </TouchableOpacity>
          );
        }}
      />

      {/* Items Grid */}
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        contentContainerStyle={s.list}
        renderItem={({ item }) => (
          <ItemCard
            item={item}
            config={activeStore}
            cartQty={cartMap[item.item_id] || 0}
            onAdd={handleAddToCart}
          />
        )}
        ListEmptyComponent={
          <View style={s.empty}>
            <Ionicons name="cube-outline" size={48} color={colors.textMuted} />
            <Text style={s.emptyText}>{loading ? "Loading items..." : "No items found"}</Text>
          </View>
        }
      />

      {/* Cart FAB */}
      {cart.length > 0 && (
        <TouchableOpacity
          style={s.cartFab}
          activeOpacity={0.8}
          onPress={() => setShowCart(true)}
        >
          <Ionicons name="cart" size={24} color={colors.white} />
          <View style={s.cartBadge}>
            <Text style={s.cartBadgeText}>{totalItems}</Text>
          </View>
        </TouchableOpacity>
      )}

      {/* Cart Modal */}
      <Modal visible={showCart} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={s.cartModal}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={{ flex: 1 }}
          >
            {/* Cart Header */}
            <View style={s.cartHeader}>
              <TouchableOpacity onPress={() => setShowCart(false)}>
                <Ionicons name="close" size={28} color={colors.text} />
              </TouchableOpacity>
              <Text style={s.cartTitle}>
                Cart ({cart.length} item{cart.length !== 1 ? "s" : ""})
              </Text>
              <TouchableOpacity
                onPress={() => {
                  Alert.alert("Clear Cart", "Remove all items?", [
                    { text: "Cancel", style: "cancel" },
                    { text: "Clear", style: "destructive", onPress: () => setCart([]) },
                  ]);
                }}
              >
                <Ionicons name="trash-outline" size={24} color={colors.danger} />
              </TouchableOpacity>
            </View>

            {/* Cart Items */}
            <ScrollView style={s.cartScroll} contentContainerStyle={s.cartScrollContent}>
              {cart.map((ci) => (
                <CartRow
                  key={ci.item_id}
                  ci={ci}
                  onQtyChange={handleQtyChange}
                  onRemove={handleRemove}
                />
              ))}

              {cart.length === 0 && (
                <View style={s.empty}>
                  <Ionicons name="cart-outline" size={48} color={colors.textMuted} />
                  <Text style={s.emptyText}>Cart is empty</Text>
                </View>
              )}

              {/* Notes */}
              <Text style={s.notesLabel}>Notes (optional)</Text>
              <TextInput
                style={s.notesInput}
                placeholder="Add any notes for this request..."
                placeholderTextColor={colors.textMuted}
                value={notes}
                onChangeText={setNotes}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </ScrollView>

            {/* Submit Button */}
            <View style={s.submitBar}>
              <View style={s.submitSummary}>
                <Text style={s.submitTotal}>{totalItems} item{totalItems !== 1 ? "s" : ""}</Text>
                <Text style={s.submitStore}>{activeStore.label}</Text>
              </View>
              <TouchableOpacity
                style={[s.submitBtn, (submitting || cart.length === 0) && s.submitBtnDisabled]}
                onPress={handleSubmit}
                disabled={submitting || cart.length === 0}
              >
                <Text style={s.submitBtnText}>
                  {submitting ? "Submitting..." : "Submit Request"}
                </Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

/* ── Styles ──────────────────────────────────────────────────────── */

const s = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  backBtn: { marginRight: spacing.xs },
  title: { flex: 1, fontSize: fontSize["2xl"], fontWeight: "700", color: colors.text },
  miniSwitcher: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 2,
  },
  miniBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.sm },
  miniBtnActive: { backgroundColor: colors.primary },
  miniText: { fontSize: fontSize.xs, fontWeight: "600", color: colors.textSecondary },
  miniTextActive: { color: colors.white },

  // Search
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginHorizontal: spacing.lg,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  searchIcon: { marginRight: spacing.sm },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: fontSize.base,
    color: colors.text,
  },

  // Category chips
  chipList: { maxHeight: 44, marginBottom: spacing.sm },
  chipContent: { paddingHorizontal: spacing.lg, gap: spacing.xs },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: fontSize.sm, fontWeight: "600", color: colors.textSecondary },
  chipTextActive: { color: colors.white },

  // Items list
  list: { paddingHorizontal: spacing.lg, paddingBottom: 100 },
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
  itemImg: {
    width: 60,
    height: 60,
    borderRadius: radius.md,
    backgroundColor: colors.background,
  },
  itemImgPlaceholder: {
    width: 60,
    height: 60,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  itemInfo: { flex: 1, marginLeft: spacing.md },
  itemName: { fontSize: fontSize.base, fontWeight: "600", color: colors.text },
  itemNameAr: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 1 },
  itemMeta: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  itemStock: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  addBtn: { padding: spacing.sm, alignItems: "center" },
  addBtnInCart: { backgroundColor: colors.success + "10", borderRadius: radius.md },
  addBtnQty: { fontSize: fontSize.xs, fontWeight: "700", color: colors.success, marginTop: 1 },

  // Empty
  empty: { alignItems: "center", paddingVertical: spacing.xxl, gap: spacing.sm },
  emptyText: { fontSize: fontSize.base, color: colors.textSecondary },

  // Cart FAB
  cartFab: {
    position: "absolute",
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
  },
  cartBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: colors.danger,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  cartBadgeText: { fontSize: 11, fontWeight: "700", color: colors.white },

  // Cart Modal
  cartModal: { flex: 1, backgroundColor: colors.background },
  cartHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  cartTitle: { fontSize: fontSize.xl, fontWeight: "700", color: colors.text },
  cartScroll: { flex: 1 },
  cartScrollContent: { padding: spacing.lg },
  cartRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cartRowInfo: { flex: 1 },
  cartRowName: { fontSize: fontSize.base, fontWeight: "600", color: colors.text },
  cartRowMeta: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  qtyControl: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  qtyBtn: { padding: 10 },
  qtyText: {
    fontSize: fontSize.base,
    fontWeight: "700",
    color: colors.text,
    minWidth: 30,
    textAlign: "center",
  },

  // Notes
  notesLabel: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: colors.text,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  notesInput: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    fontSize: fontSize.base,
    color: colors.text,
    minHeight: 80,
  },

  // Submit bar
  submitBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  submitSummary: { flex: 1 },
  submitTotal: { fontSize: fontSize.base, fontWeight: "700", color: colors.text },
  submitStore: { fontSize: fontSize.xs, color: colors.textMuted },
  submitBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: radius.md,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { fontSize: fontSize.base, fontWeight: "700", color: colors.white },
});
