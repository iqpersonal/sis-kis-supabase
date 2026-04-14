import { useState, useEffect } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Image, Alert, Modal, ActivityIndicator, Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as ImagePicker from "expo-image-picker";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/auth-context";
import { useItemTransactions } from "@/hooks/use-store-data";
import { STORE_CONFIGS, type StoreConfig } from "@/lib/store-config";
import { receiveStock, updateItem, createItem } from "@/lib/store-actions";
import { lookupBarcode, uploadItemImage, googleImageSearchUrl, googleBarcodeSearchUrl, normalizeBarcode, type BarcodeProduct } from "@/lib/barcode-lookup";
import type { StoreItem, StoreTransaction } from "@/types/store";
import { colors, spacing, fontSize, radius, commonStyles } from "@/lib/theme";

export default function ItemDetailScreen() {
  const params = useLocalSearchParams<{ id: string; store: string; barcode?: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const storeType = (params.store || "general") as "general" | "it";
  const config: StoreConfig = STORE_CONFIGS[storeType];
  const isNew = params.id === "new";

  const [item, setItem] = useState<StoreItem | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  // Receive stock modal
  const [receiveModal, setReceiveModal] = useState(false);
  const [receiveQty, setReceiveQty] = useState("");
  const [receiveNotes, setReceiveNotes] = useState("");

  // Edit mode
  const [editing, setEditing] = useState(isNew);
  const [editForm, setEditForm] = useState({
    name: "",
    name_ar: "",
    category: config.categories[0] as string,
    unit: "pcs",
    quantity: 0,
    reorder_level: 5,
    location: "",
    branch: "",
    notes: "",
    barcode: params.barcode || "",
    description: "",
    image_url: "",
  });

  // Local image picked from camera/gallery (not yet uploaded)
  const [localImageUri, setLocalImageUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Barcode product lookup
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupDone, setLookupDone] = useState(false);

  // Transactions
  const { transactions } = useItemTransactions(config, item?.item_id);

  // Auto-lookup barcode when arriving from scan with a barcode
  useEffect(() => {
    if (isNew && params.barcode) {
      setEditForm((f) => ({ ...f, barcode: params.barcode || "" }));
      // Auto-lookup product info
      if (!lookupDone) {
        handleBarcodeLookup(params.barcode);
      }
    }
  }, [isNew, params.barcode]);

  const handleBarcodeLookup = async (barcode?: string) => {
    const code = barcode || editForm.barcode;
    if (!code?.trim()) return Alert.alert("No Barcode", "Enter or scan a barcode first.");
    setLookingUp(true);
    try {
      const product = await lookupBarcode(code);
      setLookupDone(true);
      if (!product) {
        // Offer to search Google when auto-lookup fails
        Alert.alert(
          "Not Found in Databases",
          "No product info found in barcode databases.\nSearch Google to find the product?",
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Search Google",
              onPress: () => Linking.openURL(googleBarcodeSearchUrl(code)),
            },
            {
              text: "Search Images",
              onPress: () => Linking.openURL(googleImageSearchUrl(code)),
            },
          ]
        );
        return;
      }
      // Auto-fill form — only fill empty fields so we don't overwrite user edits
      setEditForm((f) => ({
        ...f,
        name: f.name || product.name || "",
        name_ar: f.name_ar || product.name_ar || "",
        notes: f.notes || (product.brand ? `Brand: ${product.brand}` : ""),
        description: f.description || product.description || "",
        image_url: f.image_url || product.image_url || "",
      }));

      // If product has an image URL, auto-upload to Firebase Storage
      if (product.image_url && !editForm.image_url) {
        try {
          setUploading(true);
          const storageUrl = await uploadItemImage(
            product.image_url,
            `${config.idPrefix}-lookup-${code}`
          );
          setEditForm((f) => ({ ...f, image_url: storageUrl }));
        } catch {
          // Keep external URL as fallback — it's already set above
          console.log("Auto-upload failed, keeping external URL");
        } finally {
          setUploading(false);
        }
      }

      const parts = [product.name];
      if (product.brand) parts.push(product.brand);
      if (product.description) parts.push(product.description);
      if (product.image_url) parts.push("\n📷 Product image found!");
      Alert.alert("Product Found", parts.join(" — "), [{ text: "OK" }]);
    } catch {
      if (!barcode) Alert.alert("Error", "Failed to look up barcode.");
    } finally {
      setLookingUp(false);
    }
  };

  useEffect(() => {
    if (isNew) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, config.collections.items, params.id));
        if (snap.exists()) {
          const data = { id: snap.id, ...snap.data() } as StoreItem;
          setItem(data);
          setEditForm({
            name: data.name,
            name_ar: data.name_ar,
            category: data.category,
            unit: data.unit,
            quantity: data.quantity,
            reorder_level: data.reorder_level,
            location: data.location,
            branch: data.branch,
            notes: data.notes,
            barcode: data.barcode || "",
            description: (data as unknown as Record<string, string>).description || "",
            image_url: data.image_url || "",
          });
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [params.id, isNew, config.collections.items]);

  const handleSave = async () => {
    if (!editForm.name.trim()) return Alert.alert("Error", "Name is required");
    setSaving(true);
    try {
      if (isNew) {
        // Upload local image to Firebase Storage if picked
        let finalImageUrl = editForm.image_url || "";
        if (localImageUri) {
          setUploading(true);
          try {
            finalImageUrl = await uploadItemImage(localImageUri, `${config.idPrefix}-${Date.now()}`);
          } catch (uploadErr: unknown) {
            console.error("Image upload failed:", uploadErr);
            Alert.alert("Image Upload Failed", uploadErr instanceof Error ? uploadErr.message : "Could not upload image. The item will be saved without an image.");
          }
          setUploading(false);
        }
        await createItem(config, {
          name: editForm.name,
          name_ar: editForm.name_ar,
          category: editForm.category,
          unit: editForm.unit,
          quantity: editForm.quantity,
          reorder_level: editForm.reorder_level,
          location: editForm.location,
          branch: editForm.branch,
          notes: editForm.notes,
          ...(editForm.barcode ? { barcode: normalizeBarcode(editForm.barcode) } : {}),
          ...(finalImageUrl ? { image_url: finalImageUrl } : {}),
          ...(editForm.description ? { description: editForm.description } : {}),
        }, user?.uid || "unknown");
        Alert.alert("Success", "Item created", [{ text: "OK", onPress: () => router.back() }]);
      } else if (item) {
        // Upload local image if picked
        let finalImageUrl = editForm.image_url || "";
        if (localImageUri) {
          setUploading(true);
          try {
            finalImageUrl = await uploadItemImage(localImageUri, item.item_id);
          } catch (uploadErr: unknown) {
            console.error("Image upload failed:", uploadErr);
            Alert.alert("Image Upload Failed", uploadErr instanceof Error ? uploadErr.message : "Could not upload image. The item will be saved without an image.");
          }
          setUploading(false);
        }
        await updateItem(config, item.id, {
          name: editForm.name,
          name_ar: editForm.name_ar,
          category: editForm.category,
          unit: editForm.unit,
          reorder_level: editForm.reorder_level,
          location: editForm.location,
          branch: editForm.branch,
          notes: editForm.notes,
          barcode: editForm.barcode ? normalizeBarcode(editForm.barcode) : "",
          image_url: finalImageUrl || "",
          description: editForm.description || "",
        }, user?.uid || "unknown");
        setItem({ ...item, ...editForm, image_url: finalImageUrl || "" });
        setLocalImageUri(null);
        setEditing(false);
      }
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleReceive = async () => {
    const qty = parseInt(receiveQty);
    if (!qty || qty <= 0) return Alert.alert("Error", "Enter a valid quantity");
    if (!item) return;
    setSaving(true);
    try {
      await receiveStock(config, item.item_id, item.id, item.name, qty, receiveNotes, user?.uid || "unknown");
      setItem({ ...item, quantity: item.quantity + qty });
      setReceiveModal(false);
      setReceiveQty("");
      setReceiveNotes("");
      Alert.alert("Success", `Received ${qty} ${item.unit}`);
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={commonStyles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (!isNew && !item) {
    return (
      <SafeAreaView style={commonStyles.centered}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.danger} />
        <Text style={{ color: colors.text, marginTop: spacing.md }}>Item not found</Text>
      </SafeAreaView>
    );
  }

  const imgSrc = item?.image_url || item?.custom_image_url;

  return (
    <SafeAreaView style={commonStyles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Back + Header */}
        <View style={styles.topRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.title} numberOfLines={1}>
            {isNew ? "New Item" : item?.name || ""}
          </Text>
          {!isNew && !editing && (
            <TouchableOpacity onPress={() => setEditing(true)}>
              <Ionicons name="create-outline" size={24} color={colors.primary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Product Images */}
        {!isNew && (
          <View style={styles.imageSection}>
            {item?.image_url ? (
              <View style={styles.imageBox}>
                <Image source={{ uri: item.image_url }} style={styles.productImage} resizeMode="cover" />
                <Text style={styles.imageLabel}>Catalog</Text>
              </View>
            ) : null}
            {item?.custom_image_url ? (
              <View style={styles.imageBox}>
                <Image source={{ uri: item.custom_image_url }} style={styles.productImage} resizeMode="cover" />
                <Text style={styles.imageLabel}>Custom</Text>
              </View>
            ) : null}
            {!item?.image_url && !item?.custom_image_url && (
              <View style={styles.noImage}>
                <Ionicons name="image-outline" size={48} color={colors.textMuted} />
                <Text style={styles.noImageText}>No product image</Text>
              </View>
            )}
          </View>
        )}

        {/* Info / Edit Form */}
        {editing ? (
          <View style={styles.form}>
            <Text style={styles.formLabel}>Name *</Text>
            <TextInput
              style={commonStyles.input}
              value={editForm.name}
              onChangeText={(v) => setEditForm((f) => ({ ...f, name: v }))}
              placeholder="Product name"
              placeholderTextColor={colors.textMuted}
            />
            <Text style={styles.formLabel}>Name (Arabic)</Text>
            <TextInput
              style={commonStyles.input}
              value={editForm.name_ar}
              onChangeText={(v) => setEditForm((f) => ({ ...f, name_ar: v }))}
              placeholder="اسم المنتج"
              placeholderTextColor={colors.textMuted}
            />
            <Text style={styles.formLabel}>Barcode</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <TextInput
                style={[commonStyles.input, { flex: 1 }]}
                value={editForm.barcode}
                onChangeText={(v) => setEditForm((f) => ({ ...f, barcode: v }))}
                placeholder="UPC / EAN / Custom"
                placeholderTextColor={colors.textMuted}
              />
              <TouchableOpacity
                style={{
                  backgroundColor: colors.primary,
                  borderRadius: radius.md,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 4,
                  opacity: lookingUp ? 0.7 : 1,
                }}
                onPress={() => handleBarcodeLookup()}
                disabled={lookingUp}
              >
                {lookingUp ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <Ionicons name="search" size={18} color={colors.white} />
                )}
                <Text style={{ color: colors.white, fontSize: fontSize.sm, fontWeight: "600" }}>
                  {lookingUp ? "Looking up..." : "Lookup"}
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.formLabel}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll}>
              {(config.categories as string[]).map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[styles.catChip, editForm.category === cat && styles.catChipActive]}
                  onPress={() => setEditForm((f) => ({ ...f, category: cat }))}
                >
                  <Text style={[styles.catChipText, editForm.category === cat && styles.catChipTextActive]}>
                    {config.categoryLabels[cat] || cat}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <Text style={styles.formLabel}>Unit</Text>
            <TextInput
              style={commonStyles.input}
              value={editForm.unit}
              onChangeText={(v) => setEditForm((f) => ({ ...f, unit: v }))}
              placeholder="pcs, box, roll..."
              placeholderTextColor={colors.textMuted}
            />
            {isNew && (
              <>
                <Text style={styles.formLabel}>Initial Quantity</Text>
                <TextInput
                  style={commonStyles.input}
                  value={String(editForm.quantity)}
                  onChangeText={(v) => setEditForm((f) => ({ ...f, quantity: parseInt(v) || 0 }))}
                  keyboardType="numeric"
                  placeholderTextColor={colors.textMuted}
                />
              </>
            )}
            <Text style={styles.formLabel}>Reorder Level</Text>
            <TextInput
              style={commonStyles.input}
              value={String(editForm.reorder_level)}
              onChangeText={(v) => setEditForm((f) => ({ ...f, reorder_level: parseInt(v) || 0 }))}
              keyboardType="numeric"
              placeholderTextColor={colors.textMuted}
            />
            <Text style={styles.formLabel}>Location</Text>
            <TextInput
              style={commonStyles.input}
              value={editForm.location}
              onChangeText={(v) => setEditForm((f) => ({ ...f, location: v }))}
              placeholder="Shelf A3, Room 102..."
              placeholderTextColor={colors.textMuted}
            />
            <Text style={styles.formLabel}>Description</Text>
            <TextInput
              style={[commonStyles.input, { minHeight: 60 }]}
              value={editForm.description}
              onChangeText={(v) => setEditForm((f) => ({ ...f, description: v }))}
              multiline
              placeholder="Product description (auto-filled from barcode lookup)"
              placeholderTextColor={colors.textMuted}
            />

            {/* Product Image Section */}
            <Text style={styles.formLabel}>Product Image</Text>
            {(localImageUri || editForm.image_url) ? (
              <View style={styles.imagePreviewBox}>
                <Image
                  source={{ uri: localImageUri || editForm.image_url }}
                  style={styles.previewImage}
                  resizeMode="cover"
                />
                <TouchableOpacity
                  style={styles.removeImageBtn}
                  onPress={() => {
                    setLocalImageUri(null);
                    setEditForm((f) => ({ ...f, image_url: "" }));
                  }}
                >
                  <Ionicons name="close-circle" size={26} color={colors.danger} />
                </TouchableOpacity>
                <Text style={styles.imageSourceLabel}>
                  {localImageUri ? "Camera / Gallery" : "From barcode lookup"}
                </Text>
              </View>
            ) : (
              <View style={styles.noImageEdit}>
                <Ionicons name="image-outline" size={36} color={colors.textMuted} />
                <Text style={styles.noImageText}>No image yet</Text>
              </View>
            )}
            <View style={styles.imageActions}>
              <TouchableOpacity
                style={styles.imageActionBtn}
                onPress={async () => {
                  const { status } = await ImagePicker.requestCameraPermissionsAsync();
                  if (status !== "granted") return Alert.alert("Permission needed", "Camera access is required.");
                  const result = await ImagePicker.launchCameraAsync({
                    quality: 0.7,
                    allowsEditing: true,
                    aspect: [1, 1],
                  });
                  if (!result.canceled && result.assets[0]) {
                    setLocalImageUri(result.assets[0].uri);
                  }
                }}
              >
                <Ionicons name="camera-outline" size={20} color={colors.primary} />
                <Text style={styles.imageActionText}>Take Photo</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.imageActionBtn}
                onPress={async () => {
                  const result = await ImagePicker.launchImageLibraryAsync({
                    quality: 0.7,
                    allowsEditing: true,
                    aspect: [1, 1],
                  });
                  if (!result.canceled && result.assets[0]) {
                    setLocalImageUri(result.assets[0].uri);
                  }
                }}
              >
                <Ionicons name="images-outline" size={20} color={colors.primary} />
                <Text style={styles.imageActionText}>Gallery</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.imageActionBtn}
                onPress={() => {
                  const q = editForm.name || editForm.barcode || "product";
                  Linking.openURL(googleImageSearchUrl(q));
                }}
              >
                <Ionicons name="search-outline" size={20} color={colors.primary} />
                <Text style={styles.imageActionText}>Google</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.formLabel}>Notes</Text>
            <TextInput
              style={[commonStyles.input, { minHeight: 60 }]}
              value={editForm.notes}
              onChangeText={(v) => setEditForm((f) => ({ ...f, notes: v }))}
              multiline
              placeholderTextColor={colors.textMuted}
            />

            <View style={styles.formActions}>
              {!isNew && (
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditing(false)}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[commonStyles.buttonPrimary, { flex: 1 }]}
                onPress={handleSave}
                disabled={saving}
              >
                <Text style={commonStyles.buttonText}>{saving || uploading ? (uploading ? "Uploading image..." : "Saving...") : isNew ? "Create Item" : "Save Changes"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : item ? (
          <View style={styles.infoSection}>
            <InfoRow label="Item ID" value={item.item_id} />
            {item.barcode && <InfoRow label="Barcode" value={item.barcode} />}
            <InfoRow label="Category" value={config.categoryLabels[item.category] || item.category} />
            <InfoRow label="Unit" value={item.unit} />
            <InfoRow label="Location" value={item.location || "—"} />

            {/* Stock Level */}
            <View style={styles.stockCard}>
              <Text style={styles.stockLabel}>Stock Level</Text>
              <Text style={[styles.stockValue, {
                color: item.quantity === 0 ? colors.danger : item.quantity <= item.reorder_level ? colors.warning : colors.success,
              }]}>
                {item.quantity} {item.unit}
              </Text>
              <View style={styles.stockBar}>
                <View
                  style={[styles.stockBarFill, {
                    width: `${Math.min((item.quantity / Math.max(item.reorder_level * 3, 1)) * 100, 100)}%`,
                    backgroundColor: item.quantity === 0 ? colors.danger : item.quantity <= item.reorder_level ? colors.warning : colors.success,
                  }]}
                />
              </View>
              <Text style={styles.reorderText}>Reorder level: {item.reorder_level}</Text>
            </View>

            {/* Action Buttons */}
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: colors.success + "15", borderColor: colors.success + "40" }]}
                onPress={() => setReceiveModal(true)}
              >
                <Ionicons name="add-circle-outline" size={20} color={colors.success} />
                <Text style={[styles.actionBtnText, { color: colors.success }]}>Receive Stock</Text>
              </TouchableOpacity>
            </View>

            {/* Recent Transactions */}
            {transactions.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>Recent Transactions</Text>
                {transactions.map((txn) => (
                  <TxnRow key={txn.id} txn={txn} />
                ))}
              </>
            )}
          </View>
        ) : null}
      </ScrollView>

      {/* Receive Stock Modal */}
      <Modal visible={receiveModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Receive Stock</Text>
            <Text style={styles.modalSubtitle}>{item?.name}</Text>

            <Text style={styles.formLabel}>Quantity *</Text>
            <TextInput
              style={commonStyles.input}
              value={receiveQty}
              onChangeText={setReceiveQty}
              keyboardType="numeric"
              placeholder="Enter quantity"
              placeholderTextColor={colors.textMuted}
              autoFocus
            />
            <Text style={styles.formLabel}>Notes</Text>
            <TextInput
              style={commonStyles.input}
              value={receiveNotes}
              onChangeText={setReceiveNotes}
              placeholder="PO number, supplier..."
              placeholderTextColor={colors.textMuted}
            />

            <View style={styles.formActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setReceiveModal(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[commonStyles.buttonPrimary, { flex: 1 }]}
                onPress={handleReceive}
                disabled={saving}
              >
                <Text style={commonStyles.buttonText}>{saving ? "Saving..." : "Receive"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function TxnRow({ txn }: { txn: StoreTransaction }) {
  const isReceive = txn.type === "receive";
  return (
    <View style={styles.txnRow}>
      <Ionicons
        name={isReceive ? "arrow-down-circle-outline" : "arrow-up-circle-outline"}
        size={20}
        color={isReceive ? colors.success : colors.warning}
      />
      <View style={styles.txnInfo}>
        <Text style={styles.txnText}>
          {isReceive ? "Received" : "Issued"} {txn.quantity} units
        </Text>
        <Text style={styles.txnDate}>{new Date(txn.timestamp).toLocaleDateString()}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingBottom: 40 },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.surface, justifyContent: "center", alignItems: "center",
    borderWidth: 1, borderColor: colors.border,
  },
  title: { flex: 1, fontSize: fontSize.xl, fontWeight: "700", color: colors.text },
  imageSection: {
    flexDirection: "row",
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  imageBox: { flex: 1, alignItems: "center", gap: spacing.xs },
  productImage: {
    width: "100%",
    height: 160,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  imageLabel: { fontSize: fontSize.xs, color: colors.textSecondary },
  noImage: {
    flex: 1,
    height: 120,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.xs,
  },
  noImageText: { fontSize: fontSize.sm, color: colors.textMuted },
  infoSection: { gap: spacing.md },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  infoLabel: { fontSize: fontSize.sm, color: colors.textSecondary },
  infoValue: { fontSize: fontSize.sm, fontWeight: "600", color: colors.text },
  stockCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  stockLabel: { fontSize: fontSize.sm, color: colors.textSecondary },
  stockValue: { fontSize: fontSize["2xl"], fontWeight: "700" },
  stockBar: {
    height: 8,
    backgroundColor: colors.surfaceLight,
    borderRadius: 4,
    overflow: "hidden",
  },
  stockBarFill: { height: 8, borderRadius: 4 },
  reorderText: { fontSize: fontSize.xs, color: colors.textMuted },
  actionRow: { flexDirection: "row", gap: spacing.sm },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: 14,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  actionBtnText: { fontSize: fontSize.sm, fontWeight: "600" },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: "700",
    color: colors.text,
    marginTop: spacing.md,
  },
  txnRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  txnInfo: { flex: 1 },
  txnText: { fontSize: fontSize.sm, fontWeight: "600", color: colors.text },
  txnDate: { fontSize: fontSize.xs, color: colors.textSecondary },
  // Form
  form: { gap: spacing.md },
  formLabel: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  catScroll: { marginVertical: spacing.xs },
  catChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing.xs,
  },
  catChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  catChipText: { fontSize: fontSize.xs, fontWeight: "600", color: colors.textSecondary },
  catChipTextActive: { color: colors.white },
  formActions: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  cancelBtn: {
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: "center",
    alignItems: "center",
  },
  cancelText: { fontSize: fontSize.base, fontWeight: "600", color: colors.textSecondary },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  modalTitle: { fontSize: fontSize.xl, fontWeight: "700", color: colors.text },
  modalSubtitle: { fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.lg },
  // Image edit section
  imagePreviewBox: {
    alignItems: "center",
    gap: spacing.xs,
    position: "relative",
  },
  previewImage: {
    width: "100%",
    height: 200,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  removeImageBtn: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: colors.surface,
    borderRadius: 13,
  },
  imageSourceLabel: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontStyle: "italic",
  },
  noImageEdit: {
    height: 100,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: "dashed",
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.xs,
  },
  imageActions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  imageActionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: colors.primary + "12",
    borderWidth: 1,
    borderColor: colors.primary + "30",
  },
  imageActionText: {
    fontSize: fontSize.xs,
    fontWeight: "600",
    color: colors.primary,
  },
});
