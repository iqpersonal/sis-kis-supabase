import { useState, useCallback, useEffect, useMemo } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Alert, ActivityIndicator, Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { collection, getDocs, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth, getStoreAccess } from "@/context/auth-context";
import { useStoreItems } from "@/hooks/use-store-data";
import { STORE_CONFIGS, GENERAL_STORE_CONFIG, IT_STORE_CONFIG, type StoreConfig } from "@/lib/store-config";
import { quickIssue } from "@/lib/store-actions";
import type { StoreItem } from "@/types/store";
import { colors, spacing, fontSize, radius, commonStyles } from "@/lib/theme";

export default function QuickIssueScreen() {
  const params = useLocalSearchParams<{ store?: string; scannedItemId?: string }>();
  const router = useRouter();
  const { role, user } = useAuth();
  const access = getStoreAccess(role);

  const storeType = (params.store || (access.general ? "general" : "it")) as "general" | "it";
  const config: StoreConfig = STORE_CONFIGS[storeType];

  const [search, setSearch] = useState("");
  const [selectedItem, setSelectedItem] = useState<StoreItem | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [recipient, setRecipient] = useState("");
  const [notes, setNotes] = useState("");
  const [issuing, setIssuing] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Load staff names once from admin_users
  const [staffNames, setStaffNames] = useState<string[]>([]);
  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(collection(db, "admin_users"));
        const names: string[] = [];
        snap.forEach((d) => {
          const n = d.data().displayName;
          if (n) names.push(n);
        });
        names.sort((a, b) => a.localeCompare(b));
        setStaffNames(names);
      } catch (_) { /* ignore */ }
    })();
  }, []);

  const filteredStaff = useMemo(() => {
    const q = recipient.trim().toLowerCase();
    if (!q) return [];
    return staffNames.filter((n) => n.toLowerCase().includes(q)).slice(0, 8);
  }, [recipient, staffNames]);

  const { items, loading } = useStoreItems(config, { searchText: search });

  // Auto-select item when returning from barcode scan
  useEffect(() => {
    if (params.scannedItemId && !selectedItem) {
      (async () => {
        try {
          const snap = await getDoc(doc(db, config.collections.items, params.scannedItemId!));
          if (snap.exists()) {
            setSelectedItem({ id: snap.id, ...snap.data() } as StoreItem);
          }
        } catch (_) { /* ignore */ }
      })();
    }
  }, [params.scannedItemId]);

  const handleSelectItem = useCallback((item: StoreItem) => {
    setSelectedItem(item);
    setSearch("");
  }, []);

  const handleIssue = async () => {
    if (!selectedItem) return Alert.alert("Error", "Select an item first");
    const qty = parseInt(quantity);
    if (!qty || qty <= 0) return Alert.alert("Error", "Enter a valid quantity");
    if (qty > selectedItem.quantity) {
      return Alert.alert("Insufficient Stock", `Only ${selectedItem.quantity} ${selectedItem.unit} available`);
    }
    if (!recipient.trim()) return Alert.alert("Error", "Enter recipient name");

    setIssuing(true);
    try {
      await quickIssue(
        config,
        selectedItem.id,
        selectedItem.item_id,
        selectedItem.name,
        qty,
        recipient.trim(),
        notes,
        user?.uid || "unknown",
        user?.displayName || "Store Clerk"
      );
      Alert.alert(
        "Issued Successfully",
        `${qty} ${selectedItem.unit} of "${selectedItem.name}" issued to ${recipient.trim()}`,
        [{ text: "OK", onPress: () => router.back() }]
      );
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Issue failed");
    } finally {
      setIssuing(false);
    }
  };

  return (
    <SafeAreaView style={commonStyles.container}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Header */}
        <View style={styles.topRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Quick Issue</Text>
          <View style={{ width: 24 }} />
        </View>

        <Text style={styles.subtitle}>
          Issue items directly without a formal request
        </Text>

        {/* Selected Item */}
        {selectedItem ? (
          <View style={styles.selectedCard}>
            <View style={styles.selectedHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.selectedName}>{selectedItem.name}</Text>
                {selectedItem.name_ar ? (
                  <Text style={styles.selectedNameAr}>{selectedItem.name_ar}</Text>
                ) : null}
                <Text style={styles.selectedMeta}>
                  {selectedItem.item_id} · {config.categoryLabels[selectedItem.category] || selectedItem.category}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.clearBtn}
                onPress={() => setSelectedItem(null)}
              >
                <Ionicons name="close-circle" size={24} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <View style={styles.stockRow}>
              <Ionicons
                name="cube-outline"
                size={16}
                color={selectedItem.quantity <= selectedItem.reorder_level ? colors.warning : colors.success}
              />
              <Text style={[styles.stockText, {
                color: selectedItem.quantity <= selectedItem.reorder_level ? colors.warning : colors.success,
              }]}>
                {selectedItem.quantity} {selectedItem.unit} in stock
              </Text>
            </View>
          </View>
        ) : (
          <>
            {/* Search */}
            <Text style={styles.label}>Search Item</Text>
            <View style={styles.searchRow}>
              <Ionicons name="search" size={18} color={colors.textMuted} style={{ marginLeft: 12 }} />
              <TextInput
                style={styles.searchInput}
                value={search}
                onChangeText={setSearch}
                placeholder="Type item name, ID, or barcode..."
                placeholderTextColor={colors.textMuted}
                autoFocus
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => setSearch("")} style={{ paddingRight: 12 }}>
                  <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>

            {/* Scan button */}
            <TouchableOpacity
              style={styles.scanBtn}
              onPress={() => router.push(`/(store)/scan?mode=quick-issue&store=${storeType}`)}
            >
              <Ionicons name="scan-outline" size={20} color={colors.primary} />
              <Text style={styles.scanBtnText}>Scan Barcode Instead</Text>
            </TouchableOpacity>

            {/* Results */}
            {loading ? (
              <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 20 }} />
            ) : search.length >= 2 ? (
              <View style={styles.resultsList}>
                {items.length === 0 ? (
                  <Text style={styles.noResults}>No items found</Text>
                ) : (
                  items.slice(0, 15).map((item) => (
                    <TouchableOpacity
                      key={item.id}
                      style={styles.resultItem}
                      onPress={() => handleSelectItem(item)}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.resultName} numberOfLines={1}>{item.name}</Text>
                        <Text style={styles.resultMeta}>
                          {item.item_id} · {item.quantity} {item.unit}
                        </Text>
                      </View>
                      <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
                    </TouchableOpacity>
                  ))
                )}
              </View>
            ) : search.length > 0 ? (
              <Text style={styles.noResults}>Type at least 2 characters to search</Text>
            ) : null}
          </>
        )}

        {/* Issue Form — visible only when item selected */}
        {selectedItem && (
          <View style={styles.form}>
            <Text style={styles.label}>Quantity *</Text>
            <View style={styles.qtyRow}>
              <TouchableOpacity
                style={styles.qtyBtn}
                onPress={() => setQuantity(String(Math.max(1, (parseInt(quantity) || 1) - 1)))}
              >
                <Ionicons name="remove" size={20} color={colors.text} />
              </TouchableOpacity>
              <TextInput
                style={styles.qtyInput}
                value={quantity}
                onChangeText={setQuantity}
                keyboardType="numeric"
                textAlign="center"
              />
              <TouchableOpacity
                style={styles.qtyBtn}
                onPress={() => setQuantity(String((parseInt(quantity) || 0) + 1))}
              >
                <Ionicons name="add" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>
            {parseInt(quantity) > selectedItem.quantity && (
              <Text style={styles.warnText}>
                Exceeds available stock ({selectedItem.quantity} {selectedItem.unit})
              </Text>
            )}

            <Text style={styles.label}>Issued To *</Text>
            <View style={{ zIndex: 10 }}>
              <TextInput
                style={commonStyles.input}
                value={recipient}
                onChangeText={(t) => { setRecipient(t); setShowSuggestions(true); }}
                placeholder="Recipient name (teacher, staff...)"
                placeholderTextColor={colors.textMuted}
              />
              {showSuggestions && filteredStaff.length > 0 && (
                <View style={styles.suggestionsBox}>
                  {filteredStaff.map((name) => (
                    <TouchableOpacity
                      key={name}
                      style={styles.suggestionRow}
                      onPress={() => { setRecipient(name); setShowSuggestions(false); }}
                    >
                      <Ionicons name="person-outline" size={16} color={colors.textSecondary} />
                      <Text style={styles.suggestionText}>{name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            <Text style={styles.label}>Notes</Text>
            <TextInput
              style={[commonStyles.input, { minHeight: 60 }]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Purpose, department, etc."
              placeholderTextColor={colors.textMuted}
              multiline
            />

            <TouchableOpacity
              style={[commonStyles.buttonPrimary, styles.issueBtn, issuing && { opacity: 0.7 }]}
              onPress={handleIssue}
              disabled={issuing}
            >
              {issuing ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Ionicons name="exit-outline" size={20} color={colors.white} />
              )}
              <Text style={commonStyles.buttonText}>
                {issuing ? "Issuing..." : `Issue ${quantity} ${selectedItem.unit}`}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingBottom: 40 },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.xs,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.surface, alignItems: "center", justifyContent: "center",
  },
  title: { fontSize: fontSize["2xl"], fontWeight: "700", color: colors.text },
  subtitle: {
    fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.lg,
    textAlign: "center",
  },
  label: {
    fontSize: fontSize.sm, fontWeight: "600", color: colors.textSecondary,
    marginBottom: spacing.xs, marginTop: spacing.md,
  },
  searchRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: colors.surface, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
  },
  searchInput: {
    flex: 1, fontSize: fontSize.base, color: colors.text,
    paddingHorizontal: 10, paddingVertical: 12,
  },
  scanBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 10, marginTop: spacing.sm,
    borderWidth: 1, borderColor: colors.primary + "40", borderRadius: radius.md,
    backgroundColor: colors.primary + "10",
  },
  scanBtnText: { fontSize: fontSize.sm, fontWeight: "600", color: colors.primary },
  resultsList: { marginTop: spacing.sm },
  resultItem: {
    flexDirection: "row", alignItems: "center",
    paddingVertical: 12, paddingHorizontal: spacing.md,
    backgroundColor: colors.surface, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, marginBottom: spacing.xs,
  },
  resultName: { fontSize: fontSize.base, fontWeight: "600", color: colors.text },
  resultMeta: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  noResults: {
    fontSize: fontSize.sm, color: colors.textMuted, textAlign: "center", marginTop: 20,
  },
  selectedCard: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.primary + "40",
    padding: spacing.md,
  },
  selectedHeader: { flexDirection: "row", alignItems: "flex-start" },
  selectedName: { fontSize: fontSize.lg, fontWeight: "700", color: colors.text },
  selectedNameAr: {
    fontSize: fontSize.base, color: colors.textSecondary, marginTop: 2,
    textAlign: "right",
  },
  selectedMeta: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 4 },
  clearBtn: { padding: 4 },
  stockRow: {
    flexDirection: "row", alignItems: "center", gap: 6,
    marginTop: spacing.sm, paddingTop: spacing.sm,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  stockText: { fontSize: fontSize.sm, fontWeight: "600" },
  form: { marginTop: spacing.md },
  qtyRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
  },
  qtyBtn: {
    width: 44, height: 44, borderRadius: radius.md,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    alignItems: "center", justifyContent: "center",
  },
  qtyInput: {
    flex: 1, fontSize: fontSize.xl, fontWeight: "700", color: colors.text,
    backgroundColor: colors.surface, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    paddingVertical: 10,
  },
  warnText: { fontSize: fontSize.xs, color: colors.danger, marginTop: 4 },
  issueBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, marginTop: spacing.lg,
  },
  suggestionsBox: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    marginTop: 4,
    overflow: "hidden",
  },
  suggestionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  suggestionText: {
    fontSize: fontSize.base,
    color: colors.text,
  },
});
