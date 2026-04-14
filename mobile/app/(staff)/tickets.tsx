import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  TextInput,
  Alert,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useAuth } from "@/context/auth-context";
import { auth } from "@/lib/firebase";
import { colors, spacing, fontSize, radius, commonStyles } from "@/lib/theme";

const API_BASE = "https://sis-kis.web.app/api/staff-portal";

interface Ticket {
  id: string;
  ticket_id: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  created_at: { _seconds: number } | string;
}

const STATUS_COLORS: Record<string, string> = {
  open: "#3b82f6",
  in_progress: "#f59e0b",
  resolved: "#22c55e",
  closed: "#64748b",
};

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  resolved: "Resolved",
  closed: "Closed",
};

export default function StaffTickets() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("other");
  const [submitting, setSubmitting] = useState(false);

  const getToken = async () => {
    return await auth.currentUser?.getIdToken();
  };

  const fetchTickets = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`${API_BASE}/tickets`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setTickets(data.tickets || []);
    } catch (err) {
      console.error("Failed to fetch tickets:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  const handleSubmit = async () => {
    if (!title.trim() || !description.trim()) {
      Alert.alert("Error", "Please fill in title and description");
      return;
    }
    setSubmitting(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/tickets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          category,
          priority: "medium",
        }),
      });
      const data = await res.json();
      if (data.success) {
        Alert.alert("Success", `Ticket ${data.ticket_id} created`);
        setTitle("");
        setDescription("");
        setShowForm(false);
        fetchTickets();
      } else {
        Alert.alert("Error", data.error || "Failed to create ticket");
      }
    } catch (err) {
      Alert.alert("Error", "Failed to submit ticket");
    } finally {
      setSubmitting(false);
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

  if (loading) {
    return (
      <View style={commonStyles.centered}>
        <ActivityIndicator size="large" color="#10b981" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchTickets(); }} tintColor="#10b981" />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>IT Support</Text>
            <Text style={styles.subtitle}>{tickets.length} ticket(s)</Text>
          </View>
          <TouchableOpacity
            style={styles.newBtn}
            onPress={() => setShowForm(!showForm)}
          >
            <Ionicons
              name={showForm ? "close" : "add"}
              size={20}
              color="#fff"
            />
            <Text style={styles.newBtnText}>{showForm ? "Cancel" : "New"}</Text>
          </TouchableOpacity>
        </View>

        {/* New Ticket Form */}
        {showForm && (
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>Submit New Ticket</Text>
            <TextInput
              style={styles.input}
              placeholder="Title"
              placeholderTextColor={colors.textMuted}
              value={title}
              onChangeText={setTitle}
            />
            <TextInput
              style={[styles.input, styles.textarea]}
              placeholder="Describe your issue..."
              placeholderTextColor={colors.textMuted}
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
            {/* Category chips */}
            <View style={styles.chips}>
              {["hardware", "software", "network", "email", "printer", "other"].map(
                (cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[
                      styles.chip,
                      category === cat && styles.chipActive,
                    ]}
                    onPress={() => setCategory(cat)}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        category === cat && styles.chipTextActive,
                      ]}
                    >
                      {cat}
                    </Text>
                  </TouchableOpacity>
                )
              )}
            </View>
            <TouchableOpacity
              style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
              onPress={handleSubmit}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitText}>Submit Ticket</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Tickets List */}
        {tickets.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="headset-outline" size={48} color={colors.textMuted} />
            <Text style={styles.emptyText}>No tickets yet</Text>
            <Text style={styles.emptySubtext}>
              Tap &ldquo;New&rdquo; to submit an IT support request
            </Text>
          </View>
        ) : (
          tickets.map((t) => (
            <View key={t.id} style={styles.ticketCard}>
              <View style={styles.ticketHeader}>
                <Text style={styles.ticketId}>{t.ticket_id}</Text>
                <View
                  style={[
                    styles.statusBadge,
                    { backgroundColor: (STATUS_COLORS[t.status] || "#64748b") + "25" },
                  ]}
                >
                  <View
                    style={[
                      styles.statusDot,
                      { backgroundColor: STATUS_COLORS[t.status] || "#64748b" },
                    ]}
                  />
                  <Text
                    style={[
                      styles.statusText,
                      { color: STATUS_COLORS[t.status] || "#64748b" },
                    ]}
                  >
                    {STATUS_LABELS[t.status] || t.status}
                  </Text>
                </View>
              </View>
              <Text style={styles.ticketTitle}>{t.title}</Text>
              <Text style={styles.ticketDesc} numberOfLines={2}>
                {t.description}
              </Text>
              <View style={styles.ticketFooter}>
                <Text style={styles.ticketCategory}>{t.category}</Text>
                <Text style={styles.ticketDate}>{formatDate(t.created_at)}</Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    padding: spacing.lg,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: fontSize["2xl"],
    fontWeight: "700",
    color: colors.text,
  },
  subtitle: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  newBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#10b981",
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  newBtnText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: fontSize.sm,
  },
  formCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "#10b98140",
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  formTitle: {
    fontSize: fontSize.lg,
    fontWeight: "600",
    color: colors.text,
    marginBottom: spacing.md,
  },
  input: {
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: fontSize.base,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  textarea: {
    minHeight: 100,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: "#10b98125",
    borderColor: "#10b981",
  },
  chipText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    textTransform: "capitalize",
  },
  chipTextActive: {
    color: "#10b981",
    fontWeight: "600",
  },
  submitBtn: {
    backgroundColor: "#10b981",
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: "center",
  },
  submitText: {
    color: "#fff",
    fontSize: fontSize.base,
    fontWeight: "600",
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
  emptySubtext: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  ticketCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  ticketHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xs,
  },
  ticketId: {
    fontSize: fontSize.xs,
    fontWeight: "600",
    color: colors.textMuted,
    fontFamily: "monospace",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: fontSize.xs,
    fontWeight: "600",
  },
  ticketTitle: {
    fontSize: fontSize.base,
    fontWeight: "600",
    color: colors.text,
    marginBottom: 4,
  },
  ticketDesc: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
  ticketFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  ticketCategory: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    textTransform: "capitalize",
  },
  ticketDate: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
});
