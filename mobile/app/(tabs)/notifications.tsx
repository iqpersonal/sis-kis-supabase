import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  collection,
  query,
  orderBy,
  getDocs,
  limit,
  doc,
  updateDoc,
  arrayUnion,
} from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { useAuth } from "@/context/auth-context";
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

interface Notification {
  id: string;
  type: string;
  severity: "critical" | "warning" | "info";
  title: string;
  message: string;
  student_number?: string;
  student_name?: string;
  created_at: string;
  read: boolean;
}

interface Message {
  id: string;
  title: string;
  body: string;
  sender: string;
  created_at: string;
  read: boolean;
}

type Tab = "alerts" | "messages";

function emojiForType(type: string) {
  switch (type) {
    case "low-grade": case "failing-subjects": return "📉";
    case "document-expired": case "document-expiring": return "📄";
    case "absence": return "📅";
    case "fee-balance": return "💰";
    case "store_low_stock": case "store_out_of_stock": return "📦";
    default: return "🔔";
  }
}

function colorForSeverity(severity: string) {
  switch (severity) {
    case "critical": return colors.danger;
    case "warning": return colors.warning;
    default: return colors.primaryLight;
  }
}

function SegmentedControl({ active, onSwitch, unreadCount }: { active: Tab; onSwitch: (t: Tab) => void; unreadCount: number }) {
  return (
    <View style={segStyles.container}>
      <TouchableOpacity style={[segStyles.tab, active === "alerts" && segStyles.tabActive]} onPress={() => onSwitch("alerts")}>
        <Text style={[segStyles.label, active === "alerts" && segStyles.labelActive]}>🔔 Alerts</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[segStyles.tab, active === "messages" && segStyles.tabActive]} onPress={() => onSwitch("messages")}>
        <Text style={[segStyles.label, active === "messages" && segStyles.labelActive]}>✉️ Messages</Text>
        {unreadCount > 0 && (
          <View style={segStyles.badge}><Text style={segStyles.badgeText}>{unreadCount > 9 ? "9+" : unreadCount}</Text></View>
        )}
      </TouchableOpacity>
    </View>
  );
}

const segStyles = StyleSheet.create({
  container: { flexDirection: "row", backgroundColor: colors.surface, borderRadius: radius.md, padding: 3, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border },
  tab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: spacing.sm, borderRadius: radius.md - 2, gap: 4 },
  tabActive: { backgroundColor: colors.primary },
  label: { fontSize: fontSize.sm, fontWeight: "600", color: colors.textMuted },
  labelActive: { color: colors.white },
  badge: { backgroundColor: colors.danger, borderRadius: 10, minWidth: 20, height: 20, alignItems: "center", justifyContent: "center", paddingHorizontal: 5 },
  badgeText: { fontSize: 11, fontWeight: "700", color: colors.white },
});

export default function NotificationsTab() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("alerts");
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [selectedNotif, setSelectedNotif] = useState<Notification | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [selectedMsg, setSelectedMsg] = useState<Message | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchNotifications = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/notifications?limit=100`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const list: Notification[] = (data.notifications || []).sort(
        (a: Notification, b: Notification) => {
          const order: Record<string, number> = { critical: 0, warning: 1, info: 2 };
          return (order[a.severity] ?? 2) - (order[b.severity] ?? 2);
        }
      );
      setNotifications(list);
    } catch (err) {
      console.error("Failed to fetch notifications:", err);
    }
  }, []);

  const fetchMessages = useCallback(async () => {
    try {
      const q = query(collection(db, "messages"), orderBy("created_at", "desc"), limit(50));
      const snap = await getDocs(q);
      const results: Message[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          title: data.title || "Message",
          body: data.body || "",
          sender: data.sender || "School Admin",
          created_at: data.created_at?.toDate?.() ? data.created_at.toDate().toISOString() : data.created_at || "",
          read: (data.read_by || []).includes(user?.uid),
        };
      });
      setMessages(results);
    } catch (err) {
      console.error("Failed to fetch messages:", err);
    }
  }, [user?.uid]);

  const markNotifRead = async (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    try {
      const token = await getToken();
      await fetch(`${API_BASE}/notifications`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id] }),
      });
    } catch { /* non-critical */ }
  };

  const markMsgRead = async (msgId: string) => {
    if (!user?.uid) return;
    setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, read: true } : m)));
    await updateDoc(doc(db, "messages", msgId), { read_by: arrayUnion(user.uid) });
  };

  useEffect(() => {
    setAlertsLoading(true);
    setMessagesLoading(true);
    Promise.all([
      fetchNotifications().finally(() => setAlertsLoading(false)),
      fetchMessages().finally(() => setMessagesLoading(false)),
    ]);
  }, [fetchNotifications, fetchMessages]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchNotifications(), fetchMessages()]);
    setRefreshing(false);
  }, [fetchNotifications, fetchMessages]);

  const unreadAlerts = notifications.filter((n) => !n.read).length;
  const unreadMessages = messages.filter((m) => !m.read).length;

  return (
    <SafeAreaView style={commonStyles.container}>
      <ScrollView contentContainerStyle={styles.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>
        <Text style={styles.title}>Notifications</Text>
        <SegmentedControl active={activeTab} onSwitch={setActiveTab} unreadCount={activeTab === "alerts" ? unreadMessages : unreadAlerts} />

        {activeTab === "alerts" && (
          <>
            {alertsLoading ? (
              <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 60 }} />
            ) : notifications.length === 0 ? (
              <View style={styles.empty}>
                <Text style={{ fontSize: 48 }}>✅</Text>
                <Text style={styles.emptyText}>All clear! No alerts at this time.</Text>
              </View>
            ) : (
              <>
                <Text style={styles.countLabel}>{notifications.length} alert{notifications.length !== 1 ? "s" : ""}{unreadAlerts > 0 ? ` · ${unreadAlerts} unread` : ""}</Text>
                {notifications.map((n) => (
                  <TouchableOpacity key={n.id} style={[styles.card, { borderLeftColor: colorForSeverity(n.severity) }, n.read && styles.cardRead]} onPress={() => { setSelectedNotif(n); if (!n.read) markNotifRead(n.id); }} activeOpacity={0.75}>
                    <View style={styles.cardHeader}>
                      <Text style={{ fontSize: 18 }}>{emojiForType(n.type)}</Text>
                      <Text style={[styles.cardSeverity, { color: colorForSeverity(n.severity) }]}>{n.severity.toUpperCase()}</Text>
                      {!n.read && <View style={styles.unreadDot} />}
                    </View>
                    <Text style={styles.cardTitle}>{n.title}</Text>
                    <Text style={styles.cardMessage} numberOfLines={2}>{n.message}</Text>
                    {n.student_name && <Text style={styles.cardStudent}>👤 {n.student_name}</Text>}
                  </TouchableOpacity>
                ))}
              </>
            )}
          </>
        )}

        {activeTab === "messages" && (
          <>
            {messagesLoading ? (
              <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 60 }} />
            ) : messages.length === 0 ? (
              <View style={styles.empty}>
                <Text style={{ fontSize: 48 }}>📭</Text>
                <Text style={styles.emptyText}>No messages from school yet.</Text>
              </View>
            ) : (
              <>
                <Text style={styles.countLabel}>{messages.length} message{messages.length !== 1 ? "s" : ""}{unreadMessages > 0 ? ` · ${unreadMessages} unread` : ""}</Text>
                {messages.map((m) => (
                  <TouchableOpacity key={m.id} style={[styles.msgCard, !m.read && styles.msgCardUnread]} onPress={() => { setSelectedMsg(m); if (!m.read) markMsgRead(m.id); }} activeOpacity={0.7}>
                    <View style={styles.msgHeader}>
                      <Text style={{ fontSize: 16 }}>{m.read ? "✉️" : "📩"}</Text>
                      <Text style={styles.msgSender}>{m.sender}</Text>
                      {!m.read && <View style={styles.unreadDot} />}
                      <Text style={styles.msgDate}>{m.created_at ? new Date(m.created_at).toLocaleDateString() : ""}</Text>
                    </View>
                    <Text style={[styles.msgTitle, !m.read && styles.msgTitleUnread]}>{m.title}</Text>
                    <Text style={styles.msgBody} numberOfLines={2}>{m.body}</Text>
                  </TouchableOpacity>
                ))}
              </>
            )}
          </>
        )}
      </ScrollView>

      <Modal visible={!!selectedNotif} animationType="slide" transparent onRequestClose={() => setSelectedNotif(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            {selectedNotif && (
              <>
                <View style={styles.modalHeader}>
                  <Text style={{ fontSize: 28 }}>{emojiForType(selectedNotif.type)}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.modalSeverity, { color: colorForSeverity(selectedNotif.severity) }]}>{selectedNotif.severity.toUpperCase()}</Text>
                    <Text style={styles.modalTitle}>{selectedNotif.title}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setSelectedNotif(null)} style={styles.closeBtn}><Text style={styles.closeBtnText}>✕</Text></TouchableOpacity>
                </View>
                <Text style={styles.modalBody}>{selectedNotif.message}</Text>
                {selectedNotif.student_name && <View style={styles.modalMeta}><Text style={styles.modalMetaLabel}>Student</Text><Text style={styles.modalMetaValue}>{selectedNotif.student_name}</Text></View>}
                {selectedNotif.created_at && <View style={styles.modalMeta}><Text style={styles.modalMetaLabel}>Date</Text><Text style={styles.modalMetaValue}>{new Date(selectedNotif.created_at).toLocaleDateString()}</Text></View>}
              </>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={!!selectedMsg} animationType="slide" transparent onRequestClose={() => setSelectedMsg(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            {selectedMsg && (
              <>
                <View style={styles.modalHeader}>
                  <Text style={{ fontSize: 24 }}>✉️</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.msgSender}>{selectedMsg.sender}</Text>
                    <Text style={styles.modalTitle}>{selectedMsg.title}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setSelectedMsg(null)} style={styles.closeBtn}><Text style={styles.closeBtnText}>✕</Text></TouchableOpacity>
                </View>
                <Text style={styles.modalBody}>{selectedMsg.body}</Text>
                {selectedMsg.created_at && <View style={styles.modalMeta}><Text style={styles.modalMetaLabel}>Date</Text><Text style={styles.modalMetaValue}>{new Date(selectedMsg.created_at).toLocaleDateString()}</Text></View>}
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingBottom: 100 },
  title: { fontSize: fontSize["2xl"], fontWeight: "700", color: colors.text, marginBottom: spacing.md },
  countLabel: { fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.md },
  empty: { alignItems: "center", justifyContent: "center", paddingVertical: 80, gap: spacing.md },
  emptyText: { fontSize: fontSize.base, color: colors.textSecondary, textAlign: "center" },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, borderLeftWidth: 4, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm },
  cardRead: { opacity: 0.6 },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginBottom: spacing.xs },
  cardSeverity: { fontSize: fontSize.xs, fontWeight: "700", letterSpacing: 0.5, flex: 1 },
  cardTitle: { fontSize: fontSize.base, fontWeight: "600", color: colors.text, marginBottom: 4 },
  cardMessage: { fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 20 },
  cardStudent: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 6 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
  msgCard: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border },
  msgCardUnread: { borderColor: colors.primary, borderLeftWidth: 3 },
  msgHeader: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginBottom: spacing.xs },
  msgSender: { fontSize: fontSize.xs, color: colors.textMuted, flex: 1 },
  msgDate: { fontSize: fontSize.xs, color: colors.textMuted },
  msgTitle: { fontSize: fontSize.base, fontWeight: "500", color: colors.text, marginBottom: 4 },
  msgTitleUnread: { fontWeight: "700" },
  msgBody: { fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 20 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: spacing.xl, paddingBottom: 40, maxHeight: "80%" },
  modalHeader: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md, marginBottom: spacing.lg },
  modalSeverity: { fontSize: fontSize.xs, fontWeight: "700", letterSpacing: 0.5 },
  modalTitle: { fontSize: fontSize.lg, fontWeight: "700", color: colors.text },
  modalBody: { fontSize: fontSize.base, color: colors.textSecondary, lineHeight: 24, marginBottom: spacing.lg },
  modalMeta: { flexDirection: "row", justifyContent: "space-between", paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  modalMetaLabel: { fontSize: fontSize.sm, color: colors.textMuted },
  modalMetaValue: { fontSize: fontSize.sm, color: colors.text, fontWeight: "500" },
  closeBtn: { padding: spacing.xs },
  closeBtnText: { fontSize: 18, color: colors.textMuted },
});
