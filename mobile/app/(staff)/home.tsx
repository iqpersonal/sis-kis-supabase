import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { useAuth } from "@/context/auth-context";
import { collection, query, where, getDocs, limit } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { colors, spacing, fontSize, radius, commonStyles } from "@/lib/theme";

const API_BASE = "https://sis-kis.web.app/api/staff-portal";

interface StaffProfile {
  E_Full_Name: string;
  A_Full_Name: string;
  Department_Desc: string;
  Position_Desc: string;
  E_Mail: string;
  Staff_Number: string;
}

interface Announcement {
  id: string;
  title: string;
  body: string;
  priority: string;
  created_at: string | { seconds: number };
}

export default function StaffHome() {
  const { user } = useAuth();
  const router = useRouter();
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [profileMissing, setProfileMissing] = useState(false);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    if (!user?.email) return;
    try {
      // Fetch staff profile from Firestore (client-side, by email)
      const staffQ = query(
        collection(db, "staff"),
        where("E_Mail", "==", user.email.toLowerCase()),
        limit(1)
      );
      const staffSnap = await getDocs(staffQ);
      if (!staffSnap.empty) {
        setProfile(staffSnap.docs[0].data() as StaffProfile);
        setProfileMissing(false);
      } else {
        setProfileMissing(true);
      }

      // Fetch announcements via API (respects expires_at + target filtering)
      try {
        const token = await auth.currentUser?.getIdToken();
        const res = await fetch(`${API_BASE}/announcements?limit=5`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setAnnouncements(data.announcements || []);
        }
      } catch {
        // fallback: show nothing rather than crash
        setAnnouncements([]);
      }
    } catch (err) {
      console.error("Failed to load staff data:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.email]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const formatDate = (ts: string | { seconds: number } | undefined) => {
    if (!ts) return "";
    if (typeof ts === "string") return new Date(ts).toLocaleDateString();
    if ("seconds" in ts) return new Date(ts.seconds * 1000).toLocaleDateString();
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
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10b981" />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.greeting}>Welcome back,</Text>
          <Text style={styles.name}>
            {profile?.E_Full_Name || user?.displayName || user?.email || "Staff"}
          </Text>
          {profile?.Position_Desc ? (
            <Text style={styles.subtitle}>{profile.Position_Desc}</Text>
          ) : null}
        </View>

        {/* Profile missing warning */}
        {profileMissing && (
          <View style={styles.warningCard}>
            <Ionicons name="alert-circle-outline" size={18} color="#f59e0b" />
            <Text style={styles.warningText}>
              No staff record found for {user?.email}. Contact HR or IT to link your account.
            </Text>
          </View>
        )}

        {/* Quick Stats */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: "#10b98120" }]}>
            <Ionicons name="person-outline" size={24} color="#10b981" />
            <Text style={styles.statLabel}>Staff #</Text>
            <Text style={styles.statValue}>{profile?.Staff_Number || "—"}</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: "#3b82f620" }]}>
            <Ionicons name="business-outline" size={24} color="#3b82f6" />
            <Text style={styles.statLabel}>Dept</Text>
            <Text style={styles.statValue} numberOfLines={2}>
              {profile?.Department_Desc || "—"}
            </Text>
          </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.actionsRow}>
            <TouchableOpacity style={styles.actionCard} onPress={() => router.push("/(staff)/tickets")}>
              <Ionicons name="headset-outline" size={28} color="#3b82f6" />
              <Text style={styles.actionLabel}>IT Ticket</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionCard} onPress={() => router.push("/(staff)/store")}>
              <Ionicons name="cube-outline" size={28} color="#10b981" />
              <Text style={styles.actionLabel}>Request Items</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionCard} onPress={() => router.push("/(staff)/assets")}>
              <Ionicons name="laptop-outline" size={28} color="#8b5cf6" />
              <Text style={styles.actionLabel}>My Assets</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Recent Announcements */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Announcements</Text>
          {announcements.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="megaphone-outline" size={32} color={colors.textMuted} />
              <Text style={styles.emptyText}>No announcements</Text>
            </View>
          ) : (
            announcements.map((a) => (
              <View
                key={a.id}
                style={[styles.announcementCard, a.priority === "urgent" && styles.announcementUrgent]}
              >
                {a.priority === "urgent" && (
                  <View style={styles.urgentBadge}>
                    <Ionicons name="warning" size={12} color="#fff" />
                    <Text style={styles.urgentText}>Urgent</Text>
                  </View>
                )}
                <Text style={styles.announcementTitle}>{a.title}</Text>
                <Text style={styles.announcementBody} numberOfLines={3}>
                  {a.body}
                </Text>
                <Text style={styles.announcementDate}>{formatDate(a.created_at)}</Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.lg },
  header: { marginBottom: spacing.lg },
  greeting: { fontSize: fontSize.base, color: colors.textSecondary },
  name: { fontSize: fontSize["2xl"], fontWeight: "700", color: colors.text, marginTop: 2 },
  subtitle: { fontSize: fontSize.sm, color: "#10b981", marginTop: 4 },
  warningCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    backgroundColor: "#f59e0b18",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#f59e0b",
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  warningText: { flex: 1, fontSize: fontSize.sm, color: "#92400e", lineHeight: 20 },
  statsRow: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.lg },
  statCard: { flex: 1, borderRadius: radius.lg, padding: spacing.md, alignItems: "center", gap: spacing.xs },
  statLabel: { fontSize: fontSize.xs, color: colors.textSecondary },
  statValue: { fontSize: fontSize.base, fontWeight: "600", color: colors.text, textAlign: "center" },
  section: { marginBottom: spacing.lg },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: "600", color: colors.text, marginBottom: spacing.md },
  actionsRow: { flexDirection: "row", gap: spacing.sm },
  actionCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    alignItems: "center",
    gap: spacing.xs,
  },
  actionLabel: { fontSize: fontSize.xs, fontWeight: "600", color: colors.textSecondary, textAlign: "center" },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    alignItems: "center",
    gap: spacing.sm,
  },
  emptyText: { fontSize: fontSize.sm, color: colors.textMuted },
  announcementCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  announcementUrgent: { borderColor: "#ef4444", borderLeftWidth: 4 },
  urgentBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#ef4444",
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignSelf: "flex-start",
    marginBottom: spacing.xs,
  },
  urgentText: { fontSize: fontSize.xs, fontWeight: "600", color: "#fff" },
  announcementTitle: { fontSize: fontSize.base, fontWeight: "600", color: colors.text, marginBottom: 4 },
  announcementBody: { fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 20 },
  announcementDate: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: spacing.xs },
});

