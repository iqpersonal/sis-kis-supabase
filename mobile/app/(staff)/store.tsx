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
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useAuth, getStoreAccess } from "@/context/auth-context";
import { auth } from "@/lib/firebase";
import { colors, spacing, fontSize, radius, commonStyles } from "@/lib/theme";
import BarcodeScanner from "@/components/BarcodeScanner";

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
  request_id?: string;
  items: { item_name?: string; name?: string; qty_requested?: number; quantity?: number }[];
  status: string;
  store_type?: string;
  store?: string;
  requested_at?: string;
  created_at?: { _seconds: number } | string;
}

interface PurchaseOrder {
  id: string;
  po_number: string;
  supplier: string;
  status: string;
  items: { item_id: string; item_name: string; quantity: number; unit_cost: number; received_qty: number }[];
  created_at: string;
  expected_date?: string;
}

export default function StaffStore() {
  const { user, role } = useAuth();
  const storeAccess = getStoreAccess(role);
  const [items, setItems] = useState<StoreItem[]>([]);
  const [requests, setRequests] = useState<StoreRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<"browse" | "history" | "issue" | "receive">("browse");
  const [cart, setCart] = useState<Record<string, number>>({});
  // Issue mode state
  const [canIssue, setCanIssue] = useState(false);
  const [issueCart, setIssueCart] = useState<Record<string, number>>({});
  const [recipientName, setRecipientName] = useState("");
  const [department, setDepartment] = useState("");
  const [issuing, setIssuing] = useState(false);
  // Receive mode state
  const [receiveCart, setReceiveCart] = useState<Record<string, number>>({});
  const [receiving, setReceiving] = useState(false);
  // PO receive state
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
  const [poReceiveQtys, setPoReceiveQtys] = useState<Record<string, string>>({});
  // Store notifications
  const [storeNotifs, setStoreNotifs] = useState<{ id: string; title: string; message: string; created_at: string }[]>([]);
  // Scanner state
  const [scannerVisible, setScannerVisible] = useState(false);
  const [scanTarget, setScanTarget] = useState<"browse" | "issue" | "receive">("browse");

  const openScanner = (target: "browse" | "issue" | "receive") => {
    setScanTarget(target);
    setScannerVisible(true);
  };

  const handleScanned = (barcode: string) => {
    setScannerVisible(false);
    const found = items.find(
      (i) => i.barcode === barcode || i.id === barcode
    );
    if (!found) {
      Alert.alert("Not Found", `No item matched barcode: ${barcode}`);
      return;
    }
    if (scanTarget === "browse") {
      setCart((prev) => ({ ...prev, [found.id]: (prev[found.id] || 0) + 1 }));
      Alert.alert("Added to Request", `${found.name} (qty: ${(cart[found.id] || 0) + 1})`);
    } else if (scanTarget === "receive") {
      setReceiveCart((prev) => ({ ...prev, [found.id]: (prev[found.id] || 0) + 1 }));
      Alert.alert("Added to Receive", `${found.name} (qty: ${(receiveCart[found.id] || 0) + 1})`);
    } else {
      if (found.quantity <= 0) {
        Alert.alert("Out of Stock", `${found.name} has no stock available`);
        return;
      }
      const current = issueCart[found.id] || 0;
      if (current >= found.quantity) {
        Alert.alert("Max Reached", `${found.name} — all ${found.quantity} already in cart`);
        return;
      }
      setIssueCart((prev) => ({ ...prev, [found.id]: current + 1 }));
      Alert.alert("Added to Issue", `${found.name} (qty: ${current + 1})`);
    }
  };

  const fetchData = useCallback(async () => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const storeType = storeAccess.general ? "general" : storeAccess.it ? "it" : "general";
      const [itemsRes, reqsRes, roleRes, notifsRes, posRes] = await Promise.all([
        fetch(`${API_BASE}/store?action=items&store=${storeType}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE}/store?action=requests`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE}/store?action=role`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE}/store?action=notifications`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE}/store?action=purchase_orders&store=${storeType}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      const itemsData = await itemsRes.json();
      setItems(itemsData.items || []);
      try {
        const reqsData = await reqsRes.json();
        setRequests(reqsData.requests || []);
      } catch { /* ignore */ }
      try {
        const roleData = await roleRes.json();
        setCanIssue(roleData.canIssue === true);
      } catch { /* ignore */ }
      try {
        const notifsData = await notifsRes.json();
        setStoreNotifs(notifsData.notifications || []);
      } catch { /* ignore */ }
      try {
        const posData = await posRes.json();
        setPurchaseOrders((posData.purchase_orders || []).filter((p: PurchaseOrder) => p.status === "approved" || p.status === "partial"));
      } catch { /* ignore */ }
    } catch (err) {
      console.error("Failed to fetch store data:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [storeAccess]);

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
      const storeType = storeAccess.general ? "general" : "it";
      const cartItems = Object.entries(cart).map(([id, qty]) => {
        const item = items.find((i) => i.id === id);
        return { item_id: id, item_name: item?.name || id, quantity: qty };
      });
      const res = await fetch(`${API_BASE}/store`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          store: storeType,
          items: cartItems,
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

  /* ── Quick Issue (storekeeper direct issue) ── */
  const issueCartCount = Object.values(issueCart).reduce((a, b) => a + b, 0);

  const submitQuickIssue = async () => {
    if (issueCartCount === 0) return;
    if (!recipientName.trim()) {
      Alert.alert("Required", "Enter recipient name");
      return;
    }
    setIssuing(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const storeType = storeAccess.general ? "general" : "it";
      const cartItems = Object.entries(issueCart).map(([id, qty]) => {
        const item = items.find((i) => i.id === id);
        return { item_id: id, item_name: item?.name || id, quantity: qty };
      });
      const res = await fetch(`${API_BASE}/store`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: "quick_issue",
          store: storeType,
          items: cartItems,
          recipient_name: recipientName.trim(),
          department: department.trim(),
          notes: `Mobile quick issue to ${recipientName.trim()}`,
        }),
      });
      const data = await res.json();
      if (data.success) {
        Alert.alert(
          "Items Issued ✓",
          `${data.items_issued} item(s) issued (${data.total_qty} units)\nDN: ${data.dn_number}`
        );
        setIssueCart({});
        setRecipientName("");
        setDepartment("");
        fetchData();
      } else {
        Alert.alert("Error", data.error || "Failed to issue items");
      }
    } catch {
      Alert.alert("Error", "Failed to issue items");
    } finally {
      setIssuing(false);
    }
  };

  /* ── Receive Stock against PO ── */
  const submitReceivePO = async () => {
    if (!selectedPO) return;
    const received_items = Object.entries(poReceiveQtys)
      .map(([item_id, qty]) => ({ item_id, quantity: parseInt(qty) || 0 }))
      .filter((r) => r.quantity > 0);
    if (received_items.length === 0) {
      Alert.alert("Error", "Enter at least one quantity to receive");
      return;
    }
    setReceiving(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const storeType = storeAccess.general ? "general" : "it";
      const res = await fetch(`${API_BASE}/store`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "receive_po", store: storeType, items: received_items, po_id: selectedPO.id }),
      });
      const data = await res.json();
      if (data.success) {
        Alert.alert("PO Received ✓", `${data.items_received} item(s) received against ${data.po_number}. Status: ${data.status}`);
        setSelectedPO(null);
        setPoReceiveQtys({});
        fetchData();
      } else {
        Alert.alert("Error", data.error || "Failed to receive against PO");
      }
    } catch {
      Alert.alert("Error", "Failed to receive against PO");
    } finally {
      setReceiving(false);
    }
  };

  /* ── Receive Stock (storekeeper) ── */
  const receiveCartCount = Object.values(receiveCart).reduce((a, b) => a + b, 0);

  const submitReceive = async () => {
    if (receiveCartCount === 0) return;
    setReceiving(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const storeType = storeAccess.general ? "general" : "it";
      const cartItems = Object.entries(receiveCart).map(([id, qty]) => {
        const item = items.find((i) => i.id === id);
        return { item_id: id, item_name: item?.name || id, quantity: qty };
      });
      const res = await fetch(`${API_BASE}/store`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: "receive_stock",
          store: storeType,
          items: cartItems,
          notes: "Mobile receive",
        }),
      });
      const data = await res.json();
      if (data.success) {
        Alert.alert(
          "Stock Received ✓",
          `${data.items_received} item(s) received (${data.total_qty} units)`
        );
        setReceiveCart({});
        fetchData();
      } else {
        Alert.alert("Error", data.error || "Failed to receive stock");
      }
    } catch {
      Alert.alert("Error", "Failed to receive stock");
    } finally {
      setReceiving(false);
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
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Text style={[styles.tabText, tab === "history" && styles.tabTextActive]}>
              My Requests
            </Text>
            {storeNotifs.length > 0 && (
              <View style={styles.notifBadge}>
                <Text style={styles.notifBadgeText}>{storeNotifs.length}</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
        {canIssue && (
          <TouchableOpacity
            style={[styles.tabBtn, tab === "issue" && styles.tabActiveIssue]}
            onPress={() => setTab("issue")}
          >
            <Text style={[styles.tabText, tab === "issue" && styles.tabTextActiveIssue]}>
              Issue Items
            </Text>
          </TouchableOpacity>
        )}
        {canIssue && (
          <TouchableOpacity
            style={[styles.tabBtn, tab === "receive" && styles.tabActiveReceive]}
            onPress={() => setTab("receive")}
          >
            <Text style={[styles.tabText, tab === "receive" && styles.tabTextActiveReceive]}>
              Receive
            </Text>
          </TouchableOpacity>
        )}
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
            {/* Scan button */}
            <TouchableOpacity style={styles.scanBar} onPress={() => openScanner("browse")}>
              <Ionicons name="scan-outline" size={20} color="#10b981" />
              <Text style={styles.scanBarText}>Scan Barcode to Add</Text>
            </TouchableOpacity>

            {/* Low stock alerts */}
            {(() => {
              const lowItems = items.filter((i) => i.quantity > 0 && i.quantity <= 5);
              const outItems = items.filter((i) => i.quantity === 0);
              if (lowItems.length === 0 && outItems.length === 0) return null;
              return (
                <View style={styles.alertBanner}>
                  <Ionicons name="alert-circle" size={18} color="#f59e0b" />
                  <Text style={styles.alertText}>
                    {outItems.length > 0 && <Text style={{ color: "#ef4444" }}>{outItems.length} out of stock</Text>}
                    {outItems.length > 0 && lowItems.length > 0 && " · "}
                    {lowItems.length > 0 && <Text style={{ color: "#f59e0b" }}>{lowItems.length} low stock</Text>}
                  </Text>
                </View>
              );
            })()}

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
        ) : tab === "history" ? (
          <>
            {/* Store Notifications */}
            {storeNotifs.length > 0 && storeNotifs.map((n) => (
              <View key={n.id} style={styles.notifCard}>
                <Ionicons name="notifications" size={16} color="#10b981" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.notifTitle}>{n.title}</Text>
                  <Text style={styles.notifMsg}>{n.message}</Text>
                </View>
              </View>
            ))}

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
                      {formatDate(r.requested_at || r.created_at)}
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
                      {item.item_name || item.name} × {item.qty_requested || item.quantity}
                    </Text>
                  ))}
                </View>
              ))
            )}
          </>        ) : (
          /* ── Issue Items Tab ── */
          <>
            {/* Scan button for issue */}
            <TouchableOpacity style={[styles.scanBar, { borderColor: "#f59e0b" }]} onPress={() => openScanner("issue")}>
              <Ionicons name="scan-outline" size={20} color="#f59e0b" />
              <Text style={[styles.scanBarText, { color: "#f59e0b" }]}>Scan Barcode to Issue</Text>
            </TouchableOpacity>

            {/* Recipient Info */}
            <View style={styles.issueHeader}>
              <Ionicons name="person-outline" size={18} color="#f59e0b" />
              <Text style={styles.issueLabel}>Recipient Name *</Text>
              <TextInput
                style={styles.issueInput}
                placeholder="Who is receiving the items?"
                placeholderTextColor={colors.textMuted}
                value={recipientName}
                onChangeText={setRecipientName}
                autoCapitalize="words"
              />
              <Text style={[styles.issueLabel, { marginTop: 10 }]}>Department</Text>
              <TextInput
                style={styles.issueInput}
                placeholder="e.g. Admin, IT, Maintenance"
                placeholderTextColor={colors.textMuted}
                value={department}
                onChangeText={setDepartment}
                autoCapitalize="words"
              />
            </View>

            {/* Item picker */}
            {items.filter((i) => i.quantity > 0).length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="cube-outline" size={48} color={colors.textMuted} />
                <Text style={styles.emptyText}>No items in stock</Text>
              </View>
            ) : (
              items.filter((i) => i.quantity > 0).map((item) => (
                <View key={item.id} style={[styles.itemCard, issueCart[item.id] ? { borderColor: "#f59e0b80" } : {}]}>
                  <View style={styles.itemInfo}>
                    <Text style={styles.itemName}>{item.name}</Text>
                    <Text style={styles.itemCategory}>{item.category}</Text>
                    <Text style={styles.itemQty}>Available: {item.quantity}</Text>
                  </View>
                  <View style={styles.cartControls}>
                    {issueCart[item.id] ? (
                      <View style={styles.qtyControls}>
                        <TouchableOpacity
                          onPress={() => {
                            setIssueCart((prev) => {
                              const n = { ...prev };
                              if (n[item.id] > 1) n[item.id]--;
                              else delete n[item.id];
                              return n;
                            });
                          }}
                          style={[styles.qtyBtn, { backgroundColor: "#f59e0b20" }]}
                        >
                          <Ionicons name="remove" size={18} color="#f59e0b" />
                        </TouchableOpacity>
                        <Text style={styles.qtyText}>{issueCart[item.id]}</Text>
                        <TouchableOpacity
                          onPress={() => {
                            if ((issueCart[item.id] || 0) < item.quantity) {
                              setIssueCart((prev) => ({ ...prev, [item.id]: (prev[item.id] || 0) + 1 }));
                            }
                          }}
                          style={[styles.qtyBtn, { backgroundColor: "#f59e0b20" }]}
                        >
                          <Ionicons name="add" size={18} color="#f59e0b" />
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity
                        onPress={() => setIssueCart((prev) => ({ ...prev, [item.id]: 1 }))}
                        style={[styles.addBtn, { backgroundColor: "#f59e0b" }]}
                      >
                        <Ionicons name="arrow-forward" size={18} color="#fff" />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              ))
            )}

            {/* Submit Issue */}
            {issueCartCount > 0 && (
              <TouchableOpacity
                style={[styles.cartBar, { backgroundColor: "#f59e0b" }]}
                onPress={submitQuickIssue}
                disabled={issuing}
              >
                {issuing ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="send" size={18} color="#fff" />
                    <Text style={styles.cartText}>
                      Issue {issueCartCount} item{issueCartCount > 1 ? "s" : ""}{recipientName.trim() ? " to " + recipientName.trim() : ""}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </>        ) : tab === "receive" ? (
          /* ── Receive Stock Tab ── */
          <>
            {/* Mode toggle */}
            <View style={{ flexDirection: "row", marginBottom: 12, gap: 8 }}>
              <TouchableOpacity
                style={[styles.modeBtn, !selectedPO && { backgroundColor: "#6366f1" }]}
                onPress={() => { setSelectedPO(null); setPoReceiveQtys({}); }}
              >
                <Text style={[styles.modeBtnText, !selectedPO && { color: "#fff" }]}>Free Receive</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modeBtn, selectedPO !== null && purchaseOrders.length > 0 && { backgroundColor: "#0ea5e9" }]}
                onPress={() => {
                  if (purchaseOrders.length === 0) {
                    Alert.alert("No POs", "No approved purchase orders found");
                    return;
                  }
                  if (!selectedPO && purchaseOrders.length > 0) setSelectedPO(purchaseOrders[0]);
                }}
              >
                <Text style={[styles.modeBtnText, selectedPO !== null && { color: "#fff" }]}>
                  Receive vs PO {purchaseOrders.length > 0 ? `(${purchaseOrders.length})` : ""}
                </Text>
              </TouchableOpacity>
            </View>

            {selectedPO ? (
              /* ─── PO Receive Mode ─── */
              <>
                {/* PO selector */}
                <View style={styles.poCard}>
                  <Text style={styles.poCardLabel}>Purchase Order</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                    {purchaseOrders.map((po) => (
                      <TouchableOpacity
                        key={po.id}
                        style={[styles.poChip, selectedPO?.id === po.id && styles.poChipActive]}
                        onPress={() => { setSelectedPO(po); setPoReceiveQtys({}); }}
                      >
                        <Text style={[styles.poChipText, selectedPO?.id === po.id && styles.poChipTextActive]}>
                          {po.po_number}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  <Text style={styles.poSupplier}>{selectedPO.supplier}</Text>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <Text style={[styles.poStatus, selectedPO.status === "partial" && { color: "#f59e0b" }]}>
                      {selectedPO.status.toUpperCase()}
                    </Text>
                  </View>
                </View>

                {/* PO Items */}
                {selectedPO.items.map((poItem) => {
                  const remaining = poItem.quantity - (poItem.received_qty || 0);
                  const qty = poReceiveQtys[poItem.item_id] || "";
                  return (
                    <View key={poItem.item_id} style={styles.poItemRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.itemName}>{poItem.item_name}</Text>
                        <Text style={styles.itemCategory}>
                          Ordered: {poItem.quantity} | Received: {poItem.received_qty || 0} | Remaining: {remaining}
                        </Text>
                      </View>
                      {remaining > 0 ? (
                        <TextInput
                          style={styles.poQtyInput}
                          placeholder="Qty"
                          placeholderTextColor={colors.textMuted}
                          keyboardType="numeric"
                          value={qty}
                          onChangeText={(v) => setPoReceiveQtys((prev) => ({ ...prev, [poItem.item_id]: v }))}
                          maxLength={5}
                        />
                      ) : (
                        <View style={styles.poQtyDone}>
                          <Ionicons name="checkmark-circle" size={22} color="#10b981" />
                        </View>
                      )}
                    </View>
                  );
                })}

                <TouchableOpacity
                  style={[styles.cartBar, { backgroundColor: "#0ea5e9" }]}
                  onPress={submitReceivePO}
                  disabled={receiving}
                >
                  {receiving ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="receipt-outline" size={18} color="#fff" />
                      <Text style={styles.cartText}>Receive Against PO</Text>
                    </>
                  )}
                </TouchableOpacity>
              </>
            ) : (
              /* ─── Free Receive Mode ─── */
              <>
                {/* Scan button for receive */}
                <TouchableOpacity style={[styles.scanBar, { borderColor: "#6366f1" }]} onPress={() => openScanner("receive")}>
                  <Ionicons name="scan-outline" size={20} color="#6366f1" />
                  <Text style={[styles.scanBarText, { color: "#6366f1" }]}>Scan Barcode to Receive</Text>
                </TouchableOpacity>

                {/* Item picker */}
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
                        <Text style={styles.itemQty}>Current stock: {item.quantity}</Text>
                      </View>
                      {receiveCart[item.id] ? (
                        <View style={styles.cartControls}>
                          <View style={styles.qtyControls}>
                            <TouchableOpacity
                              style={[styles.qtyBtn, { backgroundColor: "#6366f120" }]}
                              onPress={() => setReceiveCart((prev) => {
                                const n = { ...prev };
                                if (n[item.id] > 1) n[item.id]--;
                                else delete n[item.id];
                                return n;
                              })}
                            >
                              <Ionicons name="remove" size={18} color="#6366f1" />
                            </TouchableOpacity>
                            <Text style={styles.qtyText}>{receiveCart[item.id]}</Text>
                            <TouchableOpacity
                              style={[styles.qtyBtn, { backgroundColor: "#6366f120" }]}
                              onPress={() => setReceiveCart((prev) => ({ ...prev, [item.id]: (prev[item.id] || 0) + 1 }))}
                            >
                              <Ionicons name="add" size={18} color="#6366f1" />
                            </TouchableOpacity>
                          </View>
                        </View>
                      ) : (
                        <TouchableOpacity
                          style={[styles.addBtn, { backgroundColor: "#6366f1" }]}
                          onPress={() => setReceiveCart((prev) => ({ ...prev, [item.id]: 1 }))}
                        >
                          <Ionicons name="add" size={20} color="#fff" />
                        </TouchableOpacity>
                      )}
                    </View>
                  ))
                )}

                {/* Submit Receive */}
                {receiveCartCount > 0 && (
                  <TouchableOpacity
                    style={[styles.cartBar, { backgroundColor: "#6366f1" }]}
                    onPress={submitReceive}
                    disabled={receiving}
                  >
                    {receiving ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="download-outline" size={18} color="#fff" />
                        <Text style={styles.cartText}>
                          Receive {receiveCartCount} item{receiveCartCount > 1 ? "s" : ""}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
              </>
            )}
          </>        )      </ScrollView>

      {/* Barcode Scanner Modal */}
      <BarcodeScanner
        visible={scannerVisible}
        onClose={() => setScannerVisible(false)}
        onScanned={handleScanned}
        title={scanTarget === "browse" ? "Scan to Request" : scanTarget === "receive" ? "Scan to Receive" : "Scan to Issue"}
      />
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
  tabActiveIssue: {
    borderBottomColor: "#f59e0b",
  },
  tabText: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: colors.textMuted,
  },
  tabTextActive: {
    color: "#10b981",
  },
  tabTextActiveIssue: {
    color: "#f59e0b",
  },
  tabActiveReceive: {
    borderBottomColor: "#6366f1",
  },
  tabTextActiveReceive: {
    color: "#6366f1",
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#6366f1",
    alignItems: "center",
  },
  modeBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6366f1",
  },
  poCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#0ea5e930",
  },
  poCardLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textMuted,
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  poChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#0ea5e9",
    marginRight: 8,
  },
  poChipActive: {
    backgroundColor: "#0ea5e9",
  },
  poChipText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#0ea5e9",
  },
  poChipTextActive: {
    color: "#fff",
  },
  poSupplier: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textPrimary,
    marginBottom: 4,
  },
  poStatus: {
    fontSize: 11,
    fontWeight: "700",
    color: "#10b981",
    backgroundColor: "#10b98115",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  poItemRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  poQtyInput: {
    width: 64,
    borderWidth: 1,
    borderColor: "#0ea5e9",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    textAlign: "center",
    fontSize: 15,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  poQtyDone: {
    width: 64,
    alignItems: "center",
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
  issueHeader: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "#f59e0b40",
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: 4,
  },
  issueLabel: {
    fontSize: fontSize.xs,
    fontWeight: "600",
    color: colors.textSecondary,
    marginBottom: 2,
    marginTop: 4,
  },
  issueInput: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: fontSize.sm,
    color: colors.text,
  },
  scanBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1.5,
    borderColor: "#10b981",
    borderStyle: "dashed",
    borderRadius: radius.lg,
    paddingVertical: 14,
    marginBottom: spacing.md,
  },
  scanBarText: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: "#10b981",
  },
  alertBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fef3c7",
    borderRadius: radius.md,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: spacing.md,
  },
  alertText: {
    fontSize: fontSize.xs,
    fontWeight: "600",
    color: "#92400e",
  },
  notifBadge: {
    backgroundColor: "#ef4444",
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
  },
  notifBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
  },
  notifCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "#ecfdf5",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#10b98130",
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  notifTitle: {
    fontSize: fontSize.sm,
    fontWeight: "700",
    color: "#065f46",
  },
  notifMsg: {
    fontSize: fontSize.xs,
    color: "#047857",
    marginTop: 2,
  },
});
