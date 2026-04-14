import { useState } from "react";
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useAuth, getStoreAccess } from "@/context/auth-context";
import { useStoreItems } from "@/hooks/use-store-data";
import { GENERAL_STORE_CONFIG, IT_STORE_CONFIG, type StoreConfig } from "@/lib/store-config";
import type { StoreItem } from "@/types/store";
import { colors, spacing, fontSize, radius, commonStyles } from "@/lib/theme";

function StockBadge({ item }: { item: StoreItem }) {
  const isOut = item.quantity === 0;
  const isLow = item.quantity > 0 && item.quantity <= item.reorder_level;
  const bg = isOut ? colors.danger : isLow ? colors.warning : colors.success;
  const label = isOut ? "Out" : isLow ? "Low" : `${item.quantity}`;
  return (
    <View style={[styles.stockBadge, { backgroundColor: bg + "20" }]}>
      <Text style={[styles.stockText, { color: bg }]}>{label}</Text>
    </View>
  );
}

function ItemRow({ item, config, onPress }: { item: StoreItem; config: StoreConfig; onPress: () => void }) {
  const imgSrc = item.image_url || item.custom_image_url;
  return (
    <TouchableOpacity style={styles.row} activeOpacity={0.7} onPress={onPress}>
      {imgSrc ? (
        <Image source={{ uri: imgSrc }} style={styles.thumb} />
      ) : (
        <View style={styles.thumbPlaceholder}>
          <Ionicons name="cube-outline" size={24} color={colors.textMuted} />
        </View>
      )}
      <View style={styles.rowInfo}>
        <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.rowId}>{item.item_id} • {config.categoryLabels[item.category] || item.category}</Text>
      </View>
      <StockBadge item={item} />
    </TouchableOpacity>
  );
}

export default function InventoryScreen() {
  const { role } = useAuth();
  const access = getStoreAccess(role);
  const router = useRouter();

  const [activeStore, setActiveStore] = useState<StoreConfig>(
    access.general ? GENERAL_STORE_CONFIG : IT_STORE_CONFIG
  );
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | undefined>();

  const { items, loading } = useStoreItems(activeStore, {
    searchText: search,
    categoryFilter,
  });

  const handleItemPress = (item: StoreItem) => {
    router.push({
      pathname: "/(store)/item/[id]",
      params: { id: item.id, store: activeStore.type },
    });
  };

  return (
    <SafeAreaView style={commonStyles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Inventory</Text>
        {access.general && access.it && (
          <View style={styles.miniSwitcher}>
            <TouchableOpacity
              style={[styles.miniBtn, activeStore.type === "general" && styles.miniBtnActive]}
              onPress={() => { setActiveStore(GENERAL_STORE_CONFIG); setCategoryFilter(undefined); }}
            >
              <Text style={[styles.miniText, activeStore.type === "general" && styles.miniTextActive]}>GS</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.miniBtn, activeStore.type === "it" && styles.miniBtnActive]}
              onPress={() => { setActiveStore(IT_STORE_CONFIG); setCategoryFilter(undefined); }}
            >
              <Text style={[styles.miniText, activeStore.type === "it" && styles.miniTextActive]}>IT</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Search */}
      <View style={styles.searchRow}>
        <Ionicons name="search-outline" size={20} color={colors.textMuted} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name, ID, or barcode..."
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

      {/* Category Filter Chips */}
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={["all", ...activeStore.categories]}
        style={styles.chipList}
        contentContainerStyle={styles.chipContent}
        keyExtractor={(c) => c}
        renderItem={({ item: cat }) => {
          const active = cat === "all" ? !categoryFilter : categoryFilter === cat;
          return (
            <TouchableOpacity
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => setCategoryFilter(cat === "all" ? undefined : cat)}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {cat === "all" ? "All" : activeStore.categoryLabels[cat] || cat}
              </Text>
            </TouchableOpacity>
          );
        }}
      />

      {/* Items List */}
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <ItemRow item={item} config={activeStore} onPress={() => handleItemPress(item)} />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="cube-outline" size={48} color={colors.textMuted} />
            <Text style={styles.emptyText}>
              {loading ? "Loading..." : "No items found"}
            </Text>
          </View>
        }
      />

      {/* Scan FAB */}
      <TouchableOpacity
        style={styles.fab}
        activeOpacity={0.8}
        onPress={() => router.push("/(store)/scan")}
      >
        <Ionicons name="scan" size={24} color={colors.white} />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  title: { fontSize: fontSize["2xl"], fontWeight: "700", color: colors.text },
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
  chipList: { maxHeight: 44, marginBottom: spacing.sm },
  chipContent: { paddingHorizontal: spacing.lg, gap: spacing.xs },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: fontSize.xs, fontWeight: "600", color: colors.textSecondary },
  chipTextActive: { color: colors.white },
  list: { paddingHorizontal: spacing.lg, paddingBottom: 80 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.md,
  },
  thumb: { width: 48, height: 48, borderRadius: radius.sm },
  thumbPlaceholder: {
    width: 48, height: 48, borderRadius: radius.sm,
    backgroundColor: colors.surfaceLight,
    justifyContent: "center", alignItems: "center",
  },
  rowInfo: { flex: 1 },
  rowName: { fontSize: fontSize.base, fontWeight: "600", color: colors.text },
  rowId: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  stockBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.full },
  stockText: { fontSize: fontSize.xs, fontWeight: "700" },
  empty: { alignItems: "center", paddingVertical: spacing.xxl, gap: spacing.sm },
  emptyText: { fontSize: fontSize.base, color: colors.textSecondary },
  fab: {
    position: "absolute",
    bottom: 20,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    justifyContent: "center",
    alignItems: "center",
    elevation: 4,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
});
