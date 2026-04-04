import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Switch,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  orderBy,
  limit,
  updateDoc,
  arrayUnion,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useParent } from "@/context/parent-context";
import { colors, spacing, fontSize, radius, commonStyles } from "@/lib/theme";
import AsyncStorage from "@react-native-async-storage/async-storage";

/* ─── Types ─── */
interface Alert {
  id: string;
  type: string;
  severity: "critical" | "warning" | "info";
  title: string;
  message: string;
  studentName: string;
}

interface Message {
  id: string;
  title: string;
  body: string;
  sender: string;
  created_at: string;
  read: boolean;
}

/* ─── Constants ─── */
const ALERT_TYPES = [
  { key: "low-grade", label: "Low Grades", emoji: "📉" },
  { key: "failing-subjects", label: "Failing Subjects", emoji: "📉" },
  { key: "document-expiry", label: "Document Expiry", emoji: "📄" },
  { key: "absence", label: "Excessive Absences", emoji: "📅" },
  { key: "fee-balance", label: "Fee Balance", emoji: "💰" },
] as const;

type AlertKey = (typeof ALERT_TYPES)[number]["key"];
type Tab = "alerts" | "messages";

const STORAGE_KEY = "sis_alert_toggles";

function daysBetween(from: Date, to: Date): number {
  return Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

/* ─── Segmented Control ─── */
function SegmentedControl({
  active,
  onSwitch,
  unreadCount,
}: {
  active: Tab;
  onSwitch: (tab: Tab) => void;
  unreadCount: number;
}) {
  return (
    <View style={segStyles.container}>
      <TouchableOpacity
        style={[segStyles.tab, active === "alerts" && segStyles.tabActive]}
        onPress={() => onSwitch("alerts")}
      >
        <Text style={[segStyles.label, active === "alerts" && segStyles.labelActive]}>
          🔔 Alerts
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[segStyles.tab, active === "messages" && segStyles.tabActive]}
        onPress={() => onSwitch("messages")}
      >
        <Text style={[segStyles.label, active === "messages" && segStyles.labelActive]}>
          ✉️ Messages
        </Text>
        {unreadCount > 0 && (
          <View style={segStyles.badge}>
            <Text style={segStyles.badgeText}>{unreadCount > 9 ? "9+" : unreadCount}</Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}

const segStyles = StyleSheet.create({
  container: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 3,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.sm,
    borderRadius: radius.md - 2,
    gap: 4,
  },
  tabActive: {
    backgroundColor: colors.primary,
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: colors.textMuted,
  },
  labelActive: {
    color: colors.white,
  },
  badge: {
    backgroundColor: colors.danger,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.white,
  },
});

/* ─── Main Component ─── */
export default function NotificationsTab() {
  const { children, familyNumber, selectedChild } = useParent();
  const [activeTab, setActiveTab] = useState<Tab>("alerts");

  // ── Alerts state ──
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [toggles, setToggles] = useState<Record<AlertKey, boolean>>({
    "low-grade": true,
    "failing-subjects": true,
    "document-expiry": true,
    absence: true,
    "fee-balance": true,
  });

  // ── Messages state ──
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);

  const [refreshing, setRefreshing] = useState(false);

  // Load toggle preferences
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((val) => {
      if (val) {
        try {
          setToggles((prev) => ({ ...prev, ...JSON.parse(val) }));
        } catch {
          /* ignore */
        }
      }
    });
  }, []);

  const setToggle = (key: AlertKey, value: boolean) => {
    setToggles((prev) => {
      const next = { ...prev, [key]: value };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  /* ─── Fetch alerts (same logic as before) ─── */
  const fetchAlerts = useCallback(async () => {
    if (!children || children.length === 0) return;
    const results: Alert[] = [];
    const now = new Date();

    for (const child of children) {
      const sn = child.studentNumber;
      const name = child.fullName || sn;

      const progressDoc = await getDoc(doc(db, "student_progress", sn));
      if (!progressDoc.exists()) continue;
      const d = progressDoc.data();

      const years = Object.keys(d.years || {}).sort();
      const latestYear = years[years.length - 1];
      const latestData = latestYear ? d.years[latestYear] : null;

      if (latestData && latestData.overall_avg != null && latestData.overall_avg < 60) {
        results.push({
          id: `low-grade-${sn}`,
          type: "low-grade",
          severity: latestData.overall_avg < 50 ? "critical" : "warning",
          title: "Low Academic Performance",
          message: `${name} has an overall average of ${latestData.overall_avg}% in 20${latestYear}`,
          studentName: name,
        });
      }

      if (latestData?.subjects) {
        const failing = latestData.subjects.filter((s: { grade: number }) => s.grade < 50);
        if (failing.length > 0) {
          results.push({
            id: `failing-${sn}`,
            type: "failing-subjects",
            severity: "warning",
            title: "Failing Subjects",
            message: `${name} is failing ${failing.length} subject(s): ${failing.map((s: { subject: string }) => s.subject).join(", ")}`,
            studentName: name,
          });
        }
      }

      const checkExpiry = (docType: string, field: string, expTitle: string, soonTitle: string) => {
        const expiry = d[field];
        if (!expiry) return;
        const days = daysBetween(now, new Date(expiry));
        if (days < 0) {
          results.push({
            id: `${docType}-expired-${sn}`, type: "document-expiry", severity: "critical",
            title: expTitle, message: `${name}'s ${docType} expired ${Math.abs(days)} days ago`, studentName: name,
          });
        } else if (days <= 30) {
          results.push({
            id: `${docType}-expiring-${sn}`, type: "document-expiry", severity: "warning",
            title: soonTitle, message: `${name}'s ${docType} expires in ${days} days`, studentName: name,
          });
        }
      };
      checkExpiry("passport", "passport_expiry", "Passport Expired", "Passport Expiring Soon");
      checkExpiry("iqama", "iqama_expiry", "Iqama Expired", "Iqama Expiring Soon");

      const thirtyDaysAgo = new Date(now);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const absQuery = query(
        collection(db, "student_absence"),
        where("Student_Number", "==", sn),
        where("Absence_Date", ">=", thirtyDaysAgo.toISOString().slice(0, 10))
      );
      const absSnap = await getDocs(absQuery);
      let recentDays = 0;
      absSnap.docs.forEach((ad) => { recentDays += Number(ad.data().No_of_Days) || 1; });
      if (recentDays >= 3) {
        results.push({
          id: `absence-${sn}`, type: "absence",
          severity: recentDays >= 5 ? "critical" : "warning",
          title: "Excessive Absences",
          message: `${name} has ${recentDays} absence day(s) in the last 30 days`, studentName: name,
        });
      }

      if (d.financials) {
        const finYears = Object.keys(d.financials).sort();
        const latestFin = finYears[finYears.length - 1];
        const fin = latestFin ? d.financials[latestFin] : null;
        if (fin && fin.balance > 0) {
          results.push({
            id: `fee-balance-${sn}`, type: "fee-balance",
            severity: fin.balance > 5000 ? "warning" : "info",
            title: "Outstanding Fee Balance",
            message: `${name} has an outstanding balance of ${Number(fin.balance).toLocaleString()} SAR for 20${latestFin}`,
            studentName: name,
          });
        }
      }
    }

    const order = { critical: 0, warning: 1, info: 2 };
    results.sort((a, b) => (order[a.severity] ?? 2) - (order[b.severity] ?? 2));
    setAlerts(results);
  }, [children]);

  /* ─── Fetch messages from Firestore ─── */
  const fetchMessages = useCallback(async () => {
    if (!familyNumber && (!children || children.length === 0)) return;

    // Messages can target: all, specific school, class, or family
    // We fetch all messages and filter client-side for simplicity
    const q = query(
      collection(db, "messages"),
      orderBy("created_at", "desc"),
      limit(50)
    );
    const snap = await getDocs(q);
    const child = selectedChild || children[0];

    const results: Message[] = [];
    snap.docs.forEach((d) => {
      const data = d.data();
      const audience = data.audience as string;
      const filter = data.audience_filter || {};

      // Check if this message targets the current parent
      let match = false;
      if (audience === "all") {
        match = true;
      } else if (audience === "school" && child) {
        match = filter.school === child.school;
      } else if (audience === "class" && child) {
        match =
          filter.school === child.school &&
          filter.class === child.class &&
          (!filter.section || filter.section === child.section);
      } else if (audience === "family") {
        match = filter.family_number === familyNumber;
      }

      if (match) {
        const readBy = data.read_by || [];
        results.push({
          id: d.id,
          title: data.title || "Message",
          body: data.body || "",
          sender: data.sender || "School Admin",
          created_at: data.created_at?.toDate?.()
            ? data.created_at.toDate().toISOString()
            : data.created_at || "",
          read: readBy.includes(familyNumber),
        });
      }
    });

    setMessages(results);
  }, [familyNumber, children, selectedChild]);

  /* ─── Mark message as read ─── */
  const markRead = async (msgId: string) => {
    if (!familyNumber) return;
    setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, read: true } : m)));
    const ref = doc(db, "messages", msgId);
    await updateDoc(ref, { read_by: arrayUnion(familyNumber) });
  };

  /* ─── Initial fetch ─── */
  useEffect(() => {
    setAlertsLoading(true);
    setMessagesLoading(true);
    Promise.all([fetchAlerts(), fetchMessages()]).finally(() => {
      setAlertsLoading(false);
      setMessagesLoading(false);
    });
  }, [fetchAlerts, fetchMessages]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchAlerts(), fetchMessages()]);
    setRefreshing(false);
  };

  /* ─── Helpers ─── */
  const emojiForType = (type: string) => {
    switch (type) {
      case "low-grade": case "failing-subjects": return "📉";
      case "document-expiry": return "📄";
      case "absence": return "📅";
      case "fee-balance": return "💰";
      default: return "🔔";
    }
  };
  const colorForSeverity = (severity: string) => {
    switch (severity) {
      case "critical": return colors.danger;
      case "warning": return colors.warning;
      default: return colors.primaryLight;
    }
  };

  const filteredAlerts = alerts.filter((n) => toggles[n.type as AlertKey] !== false);
  const unreadMessages = messages.filter((m) => !m.read).length;

  /* ─── Not signed in ─── */
  if (!children || children.length === 0) {
    return (
      <SafeAreaView style={commonStyles.container}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.title}>Notifications</Text>
          <View style={styles.empty}>
            <Text style={{ fontSize: 48 }}>🔐</Text>
            <Text style={styles.emptyText}>Sign in as a parent to see notifications.</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  /* ─── Render ─── */
  return (
    <SafeAreaView style={commonStyles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        <Text style={styles.title}>Notifications</Text>

        {/* Segmented control */}
        <SegmentedControl active={activeTab} onSwitch={setActiveTab} unreadCount={unreadMessages} />

        {/* ════════ ALERTS TAB ════════ */}
        {activeTab === "alerts" && (
          <>
            <View style={styles.headerRow}>
              <Text style={styles.sectionTitle}>System Alerts</Text>
              <TouchableOpacity onPress={() => setShowSettings((v) => !v)} style={styles.settingsBtn}>
                <Text style={{ fontSize: 20 }}>⚙️</Text>
              </TouchableOpacity>
            </View>

            {showSettings && (
              <View style={styles.settingsPanel}>
                <Text style={styles.settingsHeading}>Alert Filters</Text>
                {ALERT_TYPES.map((at) => (
                  <View key={at.key} style={styles.toggleRow}>
                    <Text style={{ fontSize: 16 }}>{at.emoji}</Text>
                    <Text style={styles.toggleLabel}>{at.label}</Text>
                    <Switch
                      value={toggles[at.key]}
                      onValueChange={(val) => setToggle(at.key, val)}
                      trackColor={{ false: colors.border, true: colors.primaryLight }}
                      thumbColor={toggles[at.key] ? colors.primary : colors.textMuted}
                    />
                  </View>
                ))}
              </View>
            )}

            {alertsLoading ? (
              <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 60 }} />
            ) : filteredAlerts.length === 0 ? (
              <View style={styles.empty}>
                <Text style={{ fontSize: 48 }}>✅</Text>
                <Text style={styles.emptyText}>
                  {alerts.length === 0 ? "All clear! No alerts at this time." : "No alerts for the selected filters."}
                </Text>
              </View>
            ) : (
              <>
                <Text style={styles.countLabel}>
                  {filteredAlerts.length} alert{filteredAlerts.length !== 1 ? "s" : ""}
                  {filteredAlerts.length < alerts.length ? ` (${alerts.length - filteredAlerts.length} hidden)` : ""}
                </Text>
                {filteredAlerts.map((n) => (
                  <View key={n.id} style={[styles.card, { borderLeftColor: colorForSeverity(n.severity) }]}>
                    <View style={styles.cardHeader}>
                      <Text style={{ fontSize: 18 }}>{emojiForType(n.type)}</Text>
                      <Text style={[styles.cardSeverity, { color: colorForSeverity(n.severity) }]}>
                        {n.severity.toUpperCase()}
                      </Text>
                    </View>
                    <Text style={styles.cardTitle}>{n.title}</Text>
                    <Text style={styles.cardMessage}>{n.message}</Text>
                  </View>
                ))}
              </>
            )}
          </>
        )}

        {/* ════════ MESSAGES TAB ════════ */}
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
                <Text style={styles.countLabel}>
                  {messages.length} message{messages.length !== 1 ? "s" : ""}
                  {unreadMessages > 0 ? ` · ${unreadMessages} unread` : ""}
                </Text>
                {messages.map((m) => (
                  <TouchableOpacity
                    key={m.id}
                    style={[styles.msgCard, !m.read && styles.msgCardUnread]}
                    onPress={() => markRead(m.id)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.msgHeader}>
                      <Text style={{ fontSize: 16 }}>{m.read ? "✉️" : "📩"}</Text>
                      <Text style={styles.msgSender}>{m.sender}</Text>
                      {!m.read && <View style={styles.unreadDot} />}
                      <Text style={styles.msgDate}>
                        {m.created_at ? new Date(m.created_at).toLocaleDateString() : ""}
                      </Text>
                    </View>
                    <Text style={[styles.msgTitle, !m.read && styles.msgTitleUnread]}>{m.title}</Text>
                    <Text style={styles.msgBody} numberOfLines={3}>{m.body}</Text>
                  </TouchableOpacity>
                ))}
              </>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/* ─── Styles ─── */
const styles = StyleSheet.create({
  scroll: {
    padding: spacing.lg,
    paddingBottom: 100,
  },
  title: {
    fontSize: fontSize["2xl"],
    fontWeight: "700",
    color: colors.text,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: "600",
    color: colors.text,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  settingsBtn: { padding: spacing.xs },
  settingsPanel: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  settingsHeading: {
    fontSize: fontSize.base,
    fontWeight: "600",
    color: colors.text,
    marginBottom: spacing.sm,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  toggleLabel: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  countLabel: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  empty: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 80,
    gap: spacing.md,
  },
  emptyText: {
    fontSize: fontSize.base,
    color: colors.textSecondary,
    textAlign: "center",
  },
  // Alert cards
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderLeftWidth: 4,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  cardSeverity: {
    fontSize: fontSize.xs,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  cardTitle: {
    fontSize: fontSize.base,
    fontWeight: "600",
    color: colors.text,
    marginBottom: 4,
  },
  cardMessage: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  // Message cards
  msgCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  msgCardUnread: {
    borderColor: colors.primary,
    borderLeftWidth: 3,
  },
  msgHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  msgSender: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    flex: 1,
  },
  msgDate: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  msgTitle: {
    fontSize: fontSize.base,
    fontWeight: "500",
    color: colors.text,
    marginBottom: 4,
  },
  msgTitleUnread: {
    fontWeight: "700",
  },
  msgBody: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
});

