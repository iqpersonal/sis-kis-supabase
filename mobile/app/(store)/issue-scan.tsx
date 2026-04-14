import { useState, useCallback, useRef } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator, TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useAuth } from "@/context/auth-context";
import { STORE_CONFIGS, type StoreConfig } from "@/lib/store-config";
import { issueRequest } from "@/lib/store-actions";
import { useBarcodeSearch } from "@/hooks/use-store-data";
import { normalizeBarcode } from "@/lib/barcode-lookup";
import type { StoreRequest, StoreRequestItem } from "@/types/store";
import { colors, spacing, fontSize, radius, commonStyles } from "@/lib/theme";

interface ScannedItem extends StoreRequestItem {
  scanned: boolean;
  scannedQty: number;
}

export default function IssueScanScreen() {
  const params = useLocalSearchParams<{
    store: string;
    requestId: string;
    requestDocId: string;
    requestedBy: string;
    requestedByName: string;
    requestedAt: string;
    items: string; // JSON stringified
    notes: string;
  }>();
  const router = useRouter();
  const { user } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();

  const storeType = (params.store || "general") as "general" | "it";
  const config: StoreConfig = STORE_CONFIGS[storeType];

  // Parse request items
  const requestItems: StoreRequestItem[] = (() => {
    try { return JSON.parse(params.items || "[]"); } catch { return []; }
  })();

  const [scannedItems, setScannedItems] = useState<ScannedItem[]>(
    requestItems.map((it) => ({
      ...it,
      scanned: false,
      scannedQty: 0,
    }))
  );
  const [scanMode, setScanMode] = useState(false);
  const [torch, setTorch] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [issued, setIssued] = useState(false);
  const [lastScanned, setLastScanned] = useState("");
  const lastScanTime = useRef(0);
  const consecutiveRef = useRef<{ value: string; count: number }>({ value: "", count: 0 });
  const { searchByBarcode } = useBarcodeSearch();

  const allScanned = scannedItems.every((it) => it.scanned);
  const someScanned = scannedItems.some((it) => it.scanned);

  const processBarcode = useCallback(
    async (data: string) => {
      setLastScanned(data);

      // Search for the scanned barcode in the store
      const found = await searchByBarcode(config.collections.items, data);
      if (!found) {
        Alert.alert("Not Found", `Barcode "${data}" not found in ${config.label}`);
        return;
      }

      // Check if this item is in the request
      const idx = scannedItems.findIndex(
        (it) => it.item_id === found.item_id
      );
      if (idx === -1) {
        Alert.alert("Not in Request", `"${found.name}" is not part of this request.`);
        return;
      }

      const target = scannedItems[idx];
      const needed = (target.qty_approved || target.qty_requested);
      if (target.scannedQty >= needed) {
        Alert.alert("Already Scanned", `"${found.name}" already fully scanned (${needed}).`);
        return;
      }

      // Mark as scanned
      setScannedItems((prev) => {
        const updated = [...prev];
        const newQty = updated[idx].scannedQty + 1;
        updated[idx] = {
          ...updated[idx],
          scannedQty: newQty,
          scanned: newQty >= needed,
        };
        return updated;
      });

      // Feedback
      Alert.alert(
        "Scanned",
        `${found.name} — ${scannedItems[idx].scannedQty + 1}/${needed}`,
        [{ text: "OK" }]
      );
    },
    [scannedItems, config, searchByBarcode]
  );

  const handleBarCodeScanned = useCallback(
    async ({ data: rawData }: { data: string }) => {
      const data = normalizeBarcode(rawData);
      const now = Date.now();
      if (now - lastScanTime.current < 300) return;
      lastScanTime.current = now;

      // Consecutive-match: require same value 2 times before accepting
      if (consecutiveRef.current.value === data) {
        consecutiveRef.current.count += 1;
      } else {
        consecutiveRef.current = { value: data, count: 1 };
      }

      if (consecutiveRef.current.count < 2) return;
      consecutiveRef.current = { value: "", count: 0 };

      await processBarcode(data);
    },
    [processBarcode]
  );

  // Manual mark as scanned
  const toggleManual = (idx: number) => {
    setScannedItems((prev) => {
      const updated = [...prev];
      const needed = updated[idx].qty_approved || updated[idx].qty_requested;
      if (updated[idx].scanned) {
        updated[idx] = { ...updated[idx], scanned: false, scannedQty: 0 };
      } else {
        updated[idx] = { ...updated[idx], scanned: true, scannedQty: needed };
      }
      return updated;
    });
  };

  // Mark all
  const markAll = () => {
    setScannedItems((prev) =>
      prev.map((it) => ({
        ...it,
        scanned: true,
        scannedQty: it.qty_approved || it.qty_requested,
      }))
    );
  };

  // Issue items
  const handleConfirmIssue = async () => {
    if (!someScanned) return Alert.alert("Error", "Scan or check at least one item first.");

    const checkedItems = scannedItems.filter((it) => it.scanned);
    Alert.alert(
      "Confirm Issue",
      `Issue ${checkedItems.length} item(s) from request ${params.requestId}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Issue & Print",
          onPress: async () => {
            setIssuing(true);
            try {
              // Build the request object for the issueRequest function
              const reqObj: StoreRequest = {
                id: params.requestDocId,
                request_id: params.requestId,
                requested_by: params.requestedBy,
                requested_by_name: params.requestedByName,
                items: checkedItems.map((it) => ({
                  item_id: it.item_id,
                  name: it.name,
                  qty_requested: it.qty_requested,
                  qty_approved: it.qty_approved || it.qty_requested,
                })),
                status: "approved",
                notes: params.notes || "",
                requested_at: params.requestedAt || new Date().toISOString(),
                reviewed_by: null,
                reviewed_by_name: null,
                reviewed_at: null,
                issued_by: null,
                issued_by_name: null,
                issued_at: null,
              };

              await issueRequest(config, reqObj, user?.uid || "", user?.displayName || "Store Clerk");
              setIssued(true);

              // Generate and share delivery note
              await generateDeliveryNote(checkedItems);
            } catch (e: unknown) {
              Alert.alert("Error", e instanceof Error ? e.message : "Issue failed");
            } finally {
              setIssuing(false);
            }
          },
        },
      ]
    );
  };

  // Generate PDF delivery note
  const generateDeliveryNote = async (items: ScannedItem[]) => {
    const now = new Date();
    const dateStr = now.toLocaleDateString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
    });
    const timeStr = now.toLocaleTimeString("en-GB", {
      hour: "2-digit", minute: "2-digit",
    });

    const itemRows = items
      .map(
        (it, i) => `
      <tr>
        <td style="padding:6px 8px;border:1px solid #ddd;text-align:center">${i + 1}</td>
        <td style="padding:6px 8px;border:1px solid #ddd">${it.item_id}</td>
        <td style="padding:6px 8px;border:1px solid #ddd">${it.name}</td>
        <td style="padding:6px 8px;border:1px solid #ddd;text-align:center">${it.qty_approved || it.qty_requested}</td>
        <td style="padding:6px 8px;border:1px solid #ddd;text-align:center">${it.scannedQty}</td>
      </tr>`
      )
      .join("");

    const html = `
    <html>
    <head>
      <meta charset="utf-8" />
      <style>
        body { font-family: Arial, sans-serif; padding: 20px; color: #333; }
        .header { text-align: center; border-bottom: 2px solid #1a5276; padding-bottom: 12px; margin-bottom: 16px; }
        .header h1 { margin: 0; font-size: 20px; color: #1a5276; }
        .header h2 { margin: 4px 0 0; font-size: 14px; color: #666; font-weight: normal; }
        .info { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
        .info-item { width: 48%; font-size: 12px; }
        .info-label { font-weight: bold; color: #555; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 20px; }
        th { background: #1a5276; color: white; padding: 8px; border: 1px solid #1a5276; text-align: left; }
        .total { text-align: right; font-size: 13px; font-weight: bold; margin-bottom: 30px; }
        .sig-section { display: flex; justify-content: space-between; margin-top: 40px; }
        .sig-box { width: 45%; text-align: center; }
        .sig-line { border-top: 1px solid #333; margin-top: 50px; padding-top: 6px; font-size: 12px; }
        .footer { text-align: center; font-size: 10px; color: #999; margin-top: 30px; border-top: 1px solid #eee; padding-top: 8px; }
        .notes { font-size: 11px; color: #666; margin-bottom: 16px; padding: 8px; background: #f9f9f9; border-radius: 4px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>KHALED INTERNATIONAL SCHOOLS</h1>
        <h2>${config.label} — Delivery Note</h2>
      </div>

      <div class="info">
        <div class="info-item"><span class="info-label">Request ID:</span> ${params.requestId}</div>
        <div class="info-item"><span class="info-label">Date:</span> ${dateStr} ${timeStr}</div>
        <div class="info-item"><span class="info-label">Requested By:</span> ${params.requestedByName}</div>
        <div class="info-item"><span class="info-label">Issued By:</span> ${user?.displayName || "Store Clerk"}</div>
      </div>

      ${params.notes ? `<div class="notes"><strong>Notes:</strong> ${params.notes}</div>` : ""}

      <table>
        <thead>
          <tr>
            <th style="width:30px">#</th>
            <th>Item ID</th>
            <th>Description</th>
            <th style="width:60px;text-align:center">Approved</th>
            <th style="width:60px;text-align:center">Issued</th>
          </tr>
        </thead>
        <tbody>
          ${itemRows}
        </tbody>
      </table>

      <div class="total">
        Total Items: ${items.length} &nbsp;|&nbsp;
        Total Qty Issued: ${items.reduce((s, it) => s + it.scannedQty, 0)}
      </div>

      <div class="sig-section">
        <div class="sig-box">
          <div class="sig-line">Issued By (Store)</div>
        </div>
        <div class="sig-box">
          <div class="sig-line">Received By (Signature)</div>
        </div>
      </div>

      <div class="footer">
        Generated on ${dateStr} at ${timeStr} — KIS Store Management System
      </div>
    </body>
    </html>`;

    try {
      const { uri } = await Print.printToFileAsync({ html, width: 595, height: 842 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "application/pdf",
          dialogTitle: "Delivery Note",
          UTI: "com.adobe.pdf",
        });
      } else {
        // Fallback: direct print
        await Print.printAsync({ uri });
      }
    } catch (e) {
      // If sharing/print fails, offer direct print
      try {
        await Print.printAsync({ html });
      } catch {
        Alert.alert("Print Error", "Could not print delivery note. Items have been issued successfully.");
      }
    }
  };

  // Print again after issue
  const handleReprintNote = () => {
    const checkedItems = scannedItems.filter((it) => it.scanned);
    generateDeliveryNote(checkedItems);
  };

  // ── Scanner View ──
  if (scanMode) {
    if (!permission) {
      return (
        <SafeAreaView style={commonStyles.centered}>
          <Text style={{ color: colors.text }}>Loading camera...</Text>
        </SafeAreaView>
      );
    }
    if (!permission.granted) {
      return (
        <SafeAreaView style={commonStyles.centered}>
          <Ionicons name="camera-outline" size={64} color={colors.textMuted} />
          <Text style={{ color: colors.text, marginTop: 12 }}>Camera Permission Required</Text>
          <TouchableOpacity style={commonStyles.buttonPrimary} onPress={requestPermission}>
            <Text style={commonStyles.buttonText}>Allow Camera</Text>
          </TouchableOpacity>
        </SafeAreaView>
      );
    }

    return (
      <View style={{ flex: 1 }}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          enableTorch={torch}
          barcodeScannerSettings={{
            barcodeTypes: ["qr", "ean13", "ean8", "upc_a", "upc_e", "code128", "code39"],
          }}
          onBarcodeScanned={handleBarCodeScanned}
        />
        <SafeAreaView style={scanStyles.overlay}>
          <View style={scanStyles.topBar}>
            <TouchableOpacity onPress={() => setScanMode(false)} style={scanStyles.closeBtn}>
              <Ionicons name="close" size={28} color={colors.white} />
            </TouchableOpacity>
            <Text style={scanStyles.title}>Scan Items to Issue</Text>
            <TouchableOpacity onPress={() => setTorch((t) => !t)} style={scanStyles.torchBtn}>
              <Ionicons name={torch ? "flash" : "flash-outline"} size={22} color={colors.white} />
            </TouchableOpacity>
          </View>

          {/* Progress */}
          <View style={scanStyles.progress}>
            <Text style={scanStyles.progressText}>
              {scannedItems.filter((it) => it.scanned).length} / {scannedItems.length} items scanned
            </Text>
          </View>

          {/* Scanned list overlay */}
          <ScrollView style={scanStyles.itemList}>
            {scannedItems.map((it, idx) => {
              const needed = it.qty_approved || it.qty_requested;
              return (
                <View key={idx} style={[scanStyles.itemRow, it.scanned && scanStyles.itemRowDone]}>
                  <Ionicons
                    name={it.scanned ? "checkmark-circle" : "ellipse-outline"}
                    size={22}
                    color={it.scanned ? colors.success : colors.white + "60"}
                  />
                  <Text style={[scanStyles.itemName, it.scanned && scanStyles.itemNameDone]} numberOfLines={1}>
                    {it.name}
                  </Text>
                  <Text style={scanStyles.itemQty}>
                    {it.scannedQty}/{needed}
                  </Text>
                </View>
              );
            })}
          </ScrollView>

          {allScanned && (
            <TouchableOpacity
              style={scanStyles.doneBtn}
              onPress={() => setScanMode(false)}
            >
              <Text style={scanStyles.doneBtnText}>All Scanned — Continue</Text>
            </TouchableOpacity>
          )}
        </SafeAreaView>
      </View>
    );
  }

  // ── Issue Complete View ──
  if (issued) {
    return (
      <SafeAreaView style={commonStyles.centered}>
        <Ionicons name="checkmark-circle" size={80} color={colors.success} />
        <Text style={styles.doneTitle}>Items Issued Successfully</Text>
        <Text style={styles.doneSubtitle}>
          {scannedItems.filter((it) => it.scanned).length} items issued for {params.requestId}
        </Text>
        <View style={styles.doneActions}>
          <TouchableOpacity style={[commonStyles.buttonPrimary, { flexDirection: "row", gap: 8 }]} onPress={handleReprintNote}>
            <Ionicons name="print-outline" size={20} color={colors.white} />
            <Text style={commonStyles.buttonText}>Print Delivery Note Again</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.doneBackBtn]}
            onPress={() => router.back()}
          >
            <Text style={styles.doneBackText}>Back to Requests</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Main Checklist View ──
  return (
    <SafeAreaView style={commonStyles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Header */}
        <View style={styles.topRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Issue Items</Text>
          <View style={{ width: 36 }} />
        </View>

        {/* Request Info */}
        <View style={styles.reqInfo}>
          <Text style={styles.reqId}>{params.requestId}</Text>
          <Text style={styles.reqMeta}>
            Requested by: {params.requestedByName}
          </Text>
          {params.notes ? (
            <Text style={styles.reqNotes}>Notes: {params.notes}</Text>
          ) : null}
        </View>

        {/* Scan Button */}
        <TouchableOpacity style={styles.scanBtn} onPress={() => setScanMode(true)}>
          <Ionicons name="scan-outline" size={24} color={colors.white} />
          <Text style={styles.scanBtnText}>Scan Items with Barcode</Text>
        </TouchableOpacity>

        {/* Or mark all manually */}
        <TouchableOpacity style={styles.markAllBtn} onPress={markAll}>
          <Ionicons name="checkmark-done" size={18} color={colors.primary} />
          <Text style={styles.markAllText}>Mark All as Checked</Text>
        </TouchableOpacity>

        {/* Item Checklist */}
        <Text style={styles.sectionTitle}>
          Items ({scannedItems.filter((it) => it.scanned).length}/{scannedItems.length} verified)
        </Text>

        {scannedItems.map((it, idx) => {
          const needed = it.qty_approved || it.qty_requested;
          return (
            <TouchableOpacity
              key={idx}
              style={[styles.itemCard, it.scanned && styles.itemCardDone]}
              onPress={() => toggleManual(idx)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={it.scanned ? "checkmark-circle" : "ellipse-outline"}
                size={26}
                color={it.scanned ? colors.success : colors.textMuted}
              />
              <View style={{ flex: 1 }}>
                <Text style={[styles.itemName, it.scanned && styles.itemNameDone]}>{it.name}</Text>
                <Text style={styles.itemMeta}>{it.item_id}</Text>
              </View>
              <View style={styles.itemQtyBox}>
                <Text style={styles.itemQtyLabel}>Qty</Text>
                <Text style={styles.itemQtyValue}>{needed}</Text>
              </View>
            </TouchableOpacity>
          );
        })}

        {/* Issue Button */}
        <TouchableOpacity
          style={[
            commonStyles.buttonPrimary,
            styles.issueBtn,
            !someScanned && { opacity: 0.5 },
            issuing && { opacity: 0.7 },
          ]}
          onPress={handleConfirmIssue}
          disabled={!someScanned || issuing}
        >
          {issuing ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Ionicons name="exit-outline" size={20} color={colors.white} />
          )}
          <Text style={commonStyles.buttonText}>
            {issuing ? "Issuing..." : `Issue ${scannedItems.filter((it) => it.scanned).length} Items & Print Note`}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ──

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingBottom: 40 },
  topRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.surface, alignItems: "center", justifyContent: "center",
  },
  title: { fontSize: fontSize["2xl"], fontWeight: "700", color: colors.text },
  reqInfo: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.md,
  },
  reqId: { fontSize: fontSize.lg, fontWeight: "700", color: colors.primary },
  reqMeta: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 4 },
  reqNotes: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 4, fontStyle: "italic" },
  scanBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    backgroundColor: colors.primary, borderRadius: radius.md,
    paddingVertical: 14, marginBottom: spacing.sm,
  },
  scanBtnText: { fontSize: fontSize.base, fontWeight: "700", color: colors.white },
  markAllBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    paddingVertical: 10, marginBottom: spacing.md,
    borderWidth: 1, borderColor: colors.primary + "40", borderRadius: radius.md,
    backgroundColor: colors.primary + "10",
  },
  markAllText: { fontSize: fontSize.sm, fontWeight: "600", color: colors.primary },
  sectionTitle: {
    fontSize: fontSize.sm, fontWeight: "600", color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  itemCard: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: colors.surface, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    padding: spacing.md, marginBottom: spacing.xs,
  },
  itemCardDone: { borderColor: colors.success + "40", backgroundColor: colors.success + "08" },
  itemName: { fontSize: fontSize.base, fontWeight: "600", color: colors.text },
  itemNameDone: { textDecorationLine: "line-through", color: colors.success },
  itemMeta: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  itemQtyBox: { alignItems: "center" },
  itemQtyLabel: { fontSize: fontSize.xs, color: colors.textMuted },
  itemQtyValue: { fontSize: fontSize.lg, fontWeight: "700", color: colors.text },
  issueBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, marginTop: spacing.lg,
  },
  doneTitle: { fontSize: fontSize["2xl"], fontWeight: "700", color: colors.text, marginTop: spacing.lg },
  doneSubtitle: { fontSize: fontSize.base, color: colors.textSecondary, marginTop: spacing.xs },
  doneActions: { marginTop: spacing.xl, gap: spacing.md, width: "80%" },
  doneBackBtn: {
    paddingVertical: 12, borderRadius: radius.md, alignItems: "center",
    borderWidth: 1, borderColor: colors.border,
  },
  doneBackText: { fontSize: fontSize.base, fontWeight: "600", color: colors.textSecondary },
});

const scanStyles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: "space-between" },
  topBar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.lg, paddingTop: spacing.sm,
  },
  closeBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center",
  },
  title: { fontSize: fontSize.lg, fontWeight: "700", color: colors.white },
  torchBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center",
  },
  progress: {
    alignSelf: "center", backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: radius.full, paddingHorizontal: 16, paddingVertical: 6,
  },
  progressText: { color: colors.white, fontSize: fontSize.sm, fontWeight: "600" },
  itemList: {
    maxHeight: 250, backgroundColor: "rgba(0,0,0,0.7)",
    borderRadius: radius.lg, marginHorizontal: spacing.lg,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  itemRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.1)",
  },
  itemRowDone: { opacity: 0.6 },
  itemName: { flex: 1, fontSize: fontSize.sm, color: colors.white },
  itemNameDone: { textDecorationLine: "line-through" },
  itemQty: { fontSize: fontSize.sm, fontWeight: "700", color: colors.white },
  doneBtn: {
    backgroundColor: colors.success, borderRadius: radius.md,
    marginHorizontal: spacing.lg, marginBottom: spacing.lg,
    paddingVertical: 14, alignItems: "center",
  },
  doneBtnText: { fontSize: fontSize.base, fontWeight: "700", color: colors.white },
});
