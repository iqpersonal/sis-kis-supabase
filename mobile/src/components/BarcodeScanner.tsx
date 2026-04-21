import { useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Dimensions,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors, fontSize, spacing, radius } from "@/lib/theme";

const { width: SCREEN_W } = Dimensions.get("window");
const SCAN_BOX = SCREEN_W * 0.7;

interface BarcodeScannerProps {
  visible: boolean;
  onClose: () => void;
  onScanned: (barcode: string) => void;
  /** Optional title shown at top of scanner */
  title?: string;
}

export default function BarcodeScanner({
  visible,
  onClose,
  onScanned,
  title = "Scan Barcode",
}: BarcodeScannerProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const lastScanRef = useRef<string>("");

  const handleBarCodeScanned = ({ data }: { data: string }) => {
    // Debounce: ignore if same barcode scanned within 2 seconds
    if (scanned || data === lastScanRef.current) return;
    setScanned(true);
    lastScanRef.current = data;
    onScanned(data);
    // Reset after 2 seconds so user can scan again
    setTimeout(() => {
      setScanned(false);
      lastScanRef.current = "";
    }, 2000);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.title}>{title}</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Camera or Permission */}
        {!permission?.granted ? (
          <View style={styles.permissionBox}>
            <Ionicons name="camera-outline" size={64} color={colors.textMuted} />
            <Text style={styles.permText}>Camera permission is required to scan barcodes</Text>
            <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
              <Text style={styles.permBtnText}>Grant Camera Access</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.cameraWrap}>
            <CameraView
              style={StyleSheet.absoluteFillObject}
              barcodeScannerSettings={{
                barcodeTypes: [
                  "ean13", "ean8", "upc_a", "upc_e",
                  "code128", "code39", "code93",
                  "itf14", "codabar", "qr",
                ],
              }}
              onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
            />

            {/* Scan overlay */}
            <View style={styles.overlay}>
              <View style={styles.overlayTop} />
              <View style={styles.overlayMiddle}>
                <View style={styles.overlaySide} />
                <View style={styles.scanBox}>
                  {/* Corner decorators */}
                  <View style={[styles.corner, styles.cornerTL]} />
                  <View style={[styles.corner, styles.cornerTR]} />
                  <View style={[styles.corner, styles.cornerBL]} />
                  <View style={[styles.corner, styles.cornerBR]} />
                  {scanned && (
                    <View style={styles.scannedOverlay}>
                      <ActivityIndicator color="#10b981" size="large" />
                      <Text style={styles.scannedText}>Processing...</Text>
                    </View>
                  )}
                </View>
                <View style={styles.overlaySide} />
              </View>
              <View style={styles.overlayBottom}>
                <Text style={styles.hint}>
                  Point camera at barcode or QR code
                </Text>
              </View>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 50,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: "rgba(0,0,0,0.7)",
    zIndex: 10,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: "700",
    color: "#fff",
  },
  permissionBox: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
    padding: 32,
  },
  permText: {
    fontSize: fontSize.base,
    color: colors.textMuted,
    textAlign: "center",
  },
  permBtn: {
    backgroundColor: "#10b981",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: radius.lg,
  },
  permBtnText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: fontSize.base,
  },
  cameraWrap: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  overlayTop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  overlayMiddle: {
    flexDirection: "row",
    height: SCAN_BOX,
  },
  overlaySide: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  scanBox: {
    width: SCAN_BOX,
    height: SCAN_BOX,
  },
  overlayBottom: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    paddingTop: 24,
  },
  hint: {
    color: "rgba(255,255,255,0.8)",
    fontSize: fontSize.sm,
    fontWeight: "500",
  },
  corner: {
    position: "absolute",
    width: 24,
    height: 24,
    borderColor: "#10b981",
  },
  cornerTL: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3 },
  scannedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  scannedText: {
    color: "#10b981",
    fontSize: fontSize.sm,
    fontWeight: "600",
  },
});
