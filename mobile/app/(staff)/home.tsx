import { useEffect, useState } from "react";
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
import { useAuth } from "@/context/auth-context";
import { collection, query, where, getDocs, orderBy, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { colors, spacing, fontSize, radius, commonStyles } from "@/lib/theme";

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
  created_at: { seconds: number };
}

export default function StaffHome() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    if (!user?.email) return;
    try {
      // Fetch staff profile
      const staffQ = query(
        collection(db, "staff"),
        where("E_Mail", "==", user.email.toLowerCase()),
        limit(1)
      );
      const staffSnap = await getDocs(staffQ);
      if (!staffSnap.empty) {
        setProfile(staffSnap.docs[0].data() as StaffProfile);
      }

      // Fetch recent announcements
      const annQ = query(
        collection(db, "announcements"),
        where("is_active", "==", true),
        orderBy("created_at", "desc"),
        limit(5)
      );
      const annSnap = await getDocs(annQ);
      setAnnouncements(
        annSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Announcement))
      );
    } catch (err) {
      console.error("Failed to load staff data:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [user]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
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
            {profile?.E_Full_Name || user?.email || "Staff"}
          </Text>
          {profile?.Position_Desc && (
            <Text style={styles.subtitle}>{profile.Position_Desc}</Text>
          )}
        </View>

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
            <Text style={styles.statValue} numberOfLines={1}>
              {profile?.Department_Desc || "—"}
            </Text>
          </View>
        </View>

        {/* Recent Announcements */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Announcements</Text>
          {announcements.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="megaphone-outline" size={32} color={colors.textMuted} />
              <Text style={styles.emptyText}>No announcements</Text>
            </View>
          ) : (
            announcements.map((a) => (
              <View key={a.id} style={styles.announcementCard}>
                {a.priority === "urgent" && (
                  <View style={styles.urgentBadge}>
                    <Ionicons name="warning" size={12} color="#fff" />
                    <Text style={styles.urgentText}>Urgent</Text>
                  </View>
                )}
                <Text style={styles.announcementTitle}>{a.title}</Text>
                <Text style={styles.announcementBody} numberOfLines={2}>
                  {a.body}
                </Text>
                {a.created_at?.seconds && (
                  <Text style={styles.announcementDate}>
                    {new Date(a.created_at.seconds * 1000).toLocaleDateString()}
                  </Text>
                )}
              </View>
            ))
          )}
        </View>
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
    marginBottom: spacing.lg,
  },
  greeting: {
    fontSize: fontSize.base,
    color: colors.textSecondary,
  },
  name: {
    fontSize: fontSize["2xl"],
    fontWeight: "700",
    color: colors.text,
    marginTop: 2,
  },
  subtitle: {
    fontSize: fontSize.sm,
    color: "#10b981",
    marginTop: 4,
  },
  statsRow: {
    flexDirection: "row",
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  statCard: {
    flex: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    alignItems: "center",
    gap: spacing.xs,
  },
  statLabel: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  statValue: {
    fontSize: fontSize.base,
    fontWeight: "600",
    color: colors.text,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: "600",
    color: colors.text,
    marginBottom: spacing.md,
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    alignItems: "center",
    gap: spacing.sm,
  },
  emptyText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  announcementCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
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
  urgentText: {
    fontSize: fontSize.xs,
    fontWeight: "600",
    color: "#fff",
  },
  announcementTitle: {
    fontSize: fontSize.base,
    fontWeight: "600",
    color: colors.text,
    marginBottom: 4,
  },
  announcementBody: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  announcementDate: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
});
