import { useState, useRef, useCallback, useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Alert, TextInput, Keyboard, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useAuth, getStoreAccess } from "@/context/auth-context";
import { useBarcodeSearch } from "@/hooks/use-store-data";
import { normalizeBarcode } from "@/lib/barcode-lookup";
import { GENERAL_STORE_CONFIG, IT_STORE_CONFIG } from "@/lib/store-config";
import { colors, spacing, fontSize, radius, commonStyles } from "@/lib/theme";

/* Require the same barcode to be read this many consecutive times before accepting */
const REQUIRED_CONSECUTIVE_READS = 2;

export default function ScanScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [lastScanned, setLastScanned] = useState("");
  const [manualEntry, setManualEntry] = useState(false);
  const [manualBarcode, setManualBarcode] = useState("");
  const lastScanTime = useRef(0);
  const consecutiveRef = useRef<{ value: string; count: number }>({ value: "", count: 0 });
  const { searchByBarcode, searching } = useBarcodeSearch();
  const { role } = useAuth();
  const access = getStoreAccess(role);
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string; store?: string }>();
  const isQuickIssue = params.mode === "quick-issue";
  const searchingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [searchStuck, setSearchStuck] = useState(false);

  /* Reset state every time screen comes into focus (e.g. after navigating back) */
  useFocusEffect(
    useCallback(() => {
      setLastScanned("");
      setManualEntry(false);
      setManualBarcode("");
      setSearchStuck(false);
      consecutiveRef.current = { value: "", count: 0 };
      lastScanTime.current = 0;
    }, [])
  );

  /* Safety timeout: if searching hangs for >5s, unblock the camera */
  useEffect(() => {
    if (searching) {
      searchingTimeout.current = setTimeout(() => setSearchStuck(true), 5000);
    } else {
      setSearchStuck(false);
      if (searchingTimeout.current) clearTimeout(searchingTimeout.current);
    }
    return () => {
      if (searchingTimeout.current) clearTimeout(searchingTimeout.current);
    };
  }, [searching]);

  const lookupBarcode = useCallback(
    async (data: string) => {
      setLastScanned(data);

      // Search both stores if user has access to both
      const configs = [];
      if (access.general) configs.push(GENERAL_STORE_CONFIG);
      if (access.it) configs.push(IT_STORE_CONFIG);

      // If coming from quick-issue, prefer the store that was passed
      if (isQuickIssue && params.store) {
        const preferredCfg = params.store === "it" ? IT_STORE_CONFIG : GENERAL_STORE_CONFIG;
        const item = await searchByBarcode(preferredCfg.collections.items, data);
        if (item) {
          router.replace(`/(store)/quick-issue?store=${preferredCfg.type}&scannedItemId=${item.id}`);
          return;
        }
        // Also try the other store
        const otherCfgs = configs.filter((c) => c.type !== params.store);
        for (const cfg of otherCfgs) {
          const otherItem = await searchByBarcode(cfg.collections.items, data);
          if (otherItem) {
            router.replace(`/(store)/quick-issue?store=${cfg.type}&scannedItemId=${otherItem.id}`);
            return;
          }
        }
        Alert.alert(
          "Item Not Found",
          `No item found for barcode: ${data}`,
          [{ text: "Scan Again", style: "cancel" }]
        );
        return;
      }

      for (const cfg of configs) {
        const item = await searchByBarcode(cfg.collections.items, data);
        if (item) {
          router.push(`/(store)/item/${item.id}?store=${cfg.type}`);
          return;
        }
      }

      // Not found
      Alert.alert(
        "Item Not Found",
        `No item found for barcode: ${data}`,
        [
          { text: "Scan Again", style: "cancel" },
          {
            text: "Add New Item",
            onPress: () => {
              const storeType = access.general ? "general" : "it";
              router.push(
                `/(store)/item/new?store=${storeType}&barcode=${encodeURIComponent(data)}`
              );
            },
          },
        ]
      );
    },
    [access, searchByBarcode, router]
  );

  const handleBarCodeScanned = useCallback(
    async ({ data: rawData }: { data: string }) => {
      const data = normalizeBarcode(rawData);
      // Debounce: ignore reads within 300ms of each other
      const now = Date.now();
      if (now - lastScanTime.current < 300) return;
      lastScanTime.current = now;

      // Consecutive-match: require the same value N times before accepting
      if (consecutiveRef.current.value === data) {
        consecutiveRef.current.count += 1;
      } else {
        consecutiveRef.current = { value: data, count: 1 };
      }

      if (consecutiveRef.current.count < REQUIRED_CONSECUTIVE_READS) return;

      // Accepted — reset counter so it won't fire again for the same code
      consecutiveRef.current = { value: "", count: 0 };

      await lookupBarcode(data);
    },
    [lookupBarcode]
  );

  const handleManualSubmit = useCallback(() => {
    const trimmed = manualBarcode.trim();
    if (!trimmed) return;
    Keyboard.dismiss();
    setManualEntry(false);
    setManualBarcode("");
    const data = normalizeBarcode(trimmed);
    lookupBarcode(data);
  }, [manualBarcode, lookupBarcode]);

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
        <Text style={styles.permTitle}>Camera Permission Required</Text>
        <Text style={styles.permSubtitle}>
          Allow camera access to scan barcodes and QR codes
        </Text>
        <TouchableOpacity style={commonStyles.buttonPrimary} onPress={requestPermission}>
          <Text style={commonStyles.buttonText}>Allow Camera</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={torch}
        barcodeScannerSettings={{
          barcodeTypes: ["qr", "ean13", "ean8", "upc_a", "upc_e", "code128", "code39"],
        }}
        onBarcodeScanned={(searching && !searchStuck) ? undefined : handleBarCodeScanned}
      />

      {/* Overlay */}
      <SafeAreaView style={styles.overlay}>
        {/* Top bar */}
        <View style={styles.topBar}>
          <Text style={styles.title}>Scan Barcode</Text>
          <TouchableOpacity onPress={() => setTorch((t) => !t)} style={styles.torchBtn}>
            <Ionicons name={torch ? "flash" : "flash-outline"} size={24} color={colors.white} />
          </TouchableOpacity>
        </View>

        {/* Scan frame */}
        <View style={styles.frameContainer}>
          <View style={styles.frame}>
            {searching && !searchStuck && (
              <View style={styles.scanningOverlay}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            )}
          </View>
          <Text style={styles.hint}>
            {searching && !searchStuck ? "Searching..." : "Point camera at a barcode or QR code"}
          </Text>
        </View>

        {/* Last scanned + manual entry */}
        <View style={styles.bottomSection}>
          {lastScanned ? (
            <View style={styles.resultBar}>
              <Ionicons name="barcode-outline" size={20} color={colors.primary} />
              <Text style={styles.resultText} numberOfLines={1}>
                Last: {lastScanned}
              </Text>
            </View>
          ) : null}

          {manualEntry ? (
            <View style={styles.manualBar}>
              <TextInput
                style={styles.manualInput}
                placeholder="Enter barcode number..."
                placeholderTextColor={colors.textMuted}
                value={manualBarcode}
                onChangeText={setManualBarcode}
                keyboardType="default"
                autoFocus
                onSubmitEditing={handleManualSubmit}
                returnKeyType="search"
              />
              <TouchableOpacity style={styles.manualSubmitBtn} onPress={handleManualSubmit}>
                <Ionicons name="search" size={20} color={colors.white} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setManualEntry(false); setManualBarcode(""); }}>
                <Ionicons name="close-circle" size={24} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.manualEntryBtn} onPress={() => setManualEntry(true)}>
              <Ionicons name="keypad-outline" size={18} color={colors.white} />
              <Text style={styles.manualEntryText}>Enter Manually</Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.black },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: spacing.sm,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: "700",
    color: colors.white,
  },
  torchBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  frameContainer: {
    alignItems: "center",
    gap: spacing.md,
  },
  frame: {
    width: 260,
    height: 260,
    borderWidth: 2,
    borderColor: colors.primary,
    borderRadius: radius.lg,
    backgroundColor: "transparent",
    justifyContent: "center" as const,
    alignItems: "center" as const,
    overflow: "hidden" as const,
  },
  scanningOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center" as const,
    alignItems: "center" as const,
  },
  hint: {
    fontSize: fontSize.sm,
    color: colors.white,
    textAlign: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  resultBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  resultText: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.text,
  },
  bottomSection: {
    gap: spacing.sm,
  },
  manualEntryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: radius.md,
    padding: spacing.md,
  },
  manualEntryText: {
    fontSize: fontSize.sm,
    color: colors.white,
    fontWeight: "600",
  },
  manualBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  manualInput: {
    flex: 1,
    fontSize: fontSize.md,
    color: colors.text,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  manualSubmitBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  permTitle: {
    fontSize: fontSize.xl,
    fontWeight: "700",
    color: colors.text,
    marginTop: spacing.lg,
  },
  permSubtitle: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: "center",
    paddingHorizontal: spacing.xl,
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
  },
});
