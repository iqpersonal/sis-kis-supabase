import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
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
  doc,
  updateDoc,
  arrayUnion,
  limit,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useParent } from "@/context/parent-context";
import { colors, spacing, fontSize, radius, commonStyles } from "@/lib/theme";

/* ─── Types ─── */
interface Message {
  id: string;
  title: string;
  body: string;
  sender: string;
  created_at: string;
  read: boolean;
}

export default function MessagesScreen() {
  const { children, familyNumber, selectedChild } = useParent();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);

  const child = selectedChild || children[0];

  const fetchMessages = useCallback(async () => {
    if (!familyNumber && (!children || children.length === 0)) return;

    try {
      const q = query(
        collection(db, "messages"),
        orderBy("created_at", "desc"),
        limit(50)
      );
      const snap = await getDocs(q);

      const results: Message[] = [];
      snap.docs.forEach((d) => {
        const data = d.data();
        const audience = data.audience as string;
        const filter = data.audience_filter || {};

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
    } catch {
      setMessages([]);
    }
  }, [familyNumber, children, child]);

  const markRead = async (msg: Message) => {
    if (!familyNumber || msg.read) return;
    setMessages((prev) =>
      prev.map((m) => (m.id === msg.id ? { ...m, read: true } : m))
    );
    const ref = doc(db, "messages", msg.id);
    await updateDoc(ref, { read_by: arrayUnion(familyNumber) });
  };

  const openMessage = (msg: Message) => {
    setSelectedMessage(msg);
    if (!msg.read) markRead(msg);
  };

  useEffect(() => {
    setLoading(true);
    fetchMessages().finally(() => setLoading(false));
  }, [fetchMessages]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchMessages();
    setRefreshing(false);
  };

  const unreadCount = messages.filter((m) => !m.read).length;

  if (!children || children.length === 0) {
    return (
      <SafeAreaView style={commonStyles.container}>
        <View style={styles.scroll}>
          <Text style={styles.title}>Messages</Text>
          <View style={styles.empty}>
            <Text style={{ fontSize: 48 }}>🔐</Text>
            <Text style={styles.emptyText}>Sign in to view messages.</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={commonStyles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        <Text style={styles.title}>Messages</Text>
        {unreadCount > 0 && (
          <Text style={styles.unreadLabel}>{unreadCount} unread</Text>
        )}

        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 60 }} />
        ) : messages.length === 0 ? (
          <View style={styles.empty}>
            <Text style={{ fontSize: 48 }}>📭</Text>
            <Text style={styles.emptyText}>No messages from school yet.</Text>
            <Text style={styles.emptySubtext}>
              Pull down to refresh
            </Text>
          </View>
        ) : (
          <>
            <Text style={styles.countLabel}>
              {messages.length} message{messages.length !== 1 ? "s" : ""}
            </Text>
            {messages.map((m) => (
              <TouchableOpacity
                key={m.id}
                style={[styles.msgCard, !m.read && styles.msgCardUnread]}
                onPress={() => openMessage(m)}
                activeOpacity={0.7}
              >
                <View style={styles.msgHeader}>
                  <Text style={{ fontSize: 16 }}>{m.read ? "✉️" : "📩"}</Text>
                  <Text style={styles.msgSender}>{m.sender}</Text>
                  {!m.read && <View style={styles.unreadDot} />}
                  <Text style={styles.msgDate}>
                    {m.created_at ? formatDate(m.created_at) : ""}
                  </Text>
                </View>
                <Text style={[styles.msgTitle, !m.read && styles.msgTitleUnread]}>
                  {m.title}
                </Text>
                <Text style={styles.msgBody} numberOfLines={2}>
                  {m.body}
                </Text>
              </TouchableOpacity>
            ))}
          </>
        )}
      </ScrollView>

      {/* Message Detail Modal */}
      <Modal
        visible={!!selectedMessage}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedMessage(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{selectedMessage?.title}</Text>
              <TouchableOpacity onPress={() => setSelectedMessage(null)}>
                <Text style={styles.closeBtn}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.modalMeta}>
              <Text style={styles.modalSender}>From: {selectedMessage?.sender}</Text>
              <Text style={styles.modalDate}>
                {selectedMessage?.created_at ? formatDate(selectedMessage.created_at) : ""}
              </Text>
            </View>
            <ScrollView style={styles.modalBody}>
              <Text style={styles.modalBodyText}>{selectedMessage?.body}</Text>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function formatDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString();
  } catch {
    return "";
  }
}

const styles = StyleSheet.create({
  scroll: {
    padding: spacing.lg,
    paddingBottom: 100,
  },
  title: {
    fontSize: fontSize["2xl"],
    fontWeight: "700",
    color: colors.text,
  },
  unreadLabel: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: "600",
    marginTop: spacing.xs,
  },
  countLabel: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: spacing.md,
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
  emptySubtext: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
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
    backgroundColor: colors.primary,
    borderRadius: 4,
    marginHorizontal: 4,
  },
  msgTitle: {
    fontSize: fontSize.base,
    fontWeight: "600",
    color: colors.text,
    marginBottom: 4,
  },
  msgTitleUnread: {
    fontWeight: "700",
  },
  msgBody: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    maxHeight: "80%",
    padding: spacing.lg,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: spacing.md,
  },
  modalTitle: {
    fontSize: fontSize.lg,
    fontWeight: "700",
    color: colors.text,
    flex: 1,
    marginRight: spacing.md,
  },
  closeBtn: {
    fontSize: fontSize.xl,
    color: colors.textMuted,
    padding: spacing.xs,
  },
  modalMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalSender: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  modalDate: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  modalBody: {
    flex: 1,
  },
  modalBodyText: {
    fontSize: fontSize.base,
    color: colors.text,
    lineHeight: 24,
  },
});
