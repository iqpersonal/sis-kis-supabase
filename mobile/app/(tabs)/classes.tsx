import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { auth } from "@/lib/firebase";
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

interface ClassInfo {
  id: string;
  className: string;
  section: string;
  subject: string;
  teacher: string;
  year: string;
  studentCount: number;
}

export default function ClassesTab() {
  const { user, roles, username } = useAuth();
  const router = useRouter();
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isTeacher = roles?.includes("teacher");

  const fetchClasses = useCallback(async () => {
    if (!user?.uid) return;
    setError(null);
    try {
      const token = await getToken();
      const param = username ? `username=${encodeURIComponent(username)}` : `uid=${user.uid}`;
      const res = await fetch(`${API_BASE}/teacher/classes?${param}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setClasses(data.classes || []);
    } catch (err) {
      console.error("Failed to fetch classes:", err);
      setError("Could not load classes. Please try again.");
    }
  }, [user?.uid, username]);

  useEffect(() => {
    setLoading(true);
    fetchClasses().finally(() => setLoading(false));
  }, [fetchClasses]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchClasses();
    setRefreshing(false);
  }, [fetchClasses]);

  return (
    <SafeAreaView style={commonStyles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        <Text style={styles.title}>My Classes</Text>
        {!isTeacher && (
          <View style={styles.infoCard}>
            <Text style={styles.infoText}>
              📋 This section shows assigned classes. Only teacher accounts have class assignments.
            </Text>
          </View>
        )}

        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 60 }} />
        ) : error ? (
          <View style={styles.empty}>
            <Text style={{ fontSize: 40 }}>⚠️</Text>
            <Text style={styles.emptyText}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => { setLoading(true); fetchClasses().finally(() => setLoading(false)); }}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : classes.length === 0 ? (
          <View style={styles.empty}>
            <Text style={{ fontSize: 48 }}>🏫</Text>
            <Text style={styles.emptyText}>No classes assigned yet.</Text>
            <Text style={styles.emptySubText}>Ask an admin to assign classes to your account.</Text>
          </View>
        ) : (
          <>
            <Text style={styles.countLabel}>
              {classes.length} class{classes.length !== 1 ? "es" : ""} assigned
            </Text>
            {classes.map((cls) => (
              <TouchableOpacity
                key={cls.id}
                style={styles.card}
                onPress={() => router.push({ pathname: "/class/[id]", params: { id: cls.id, className: cls.className, section: cls.section, subject: cls.subject, year: cls.year } })}
                activeOpacity={0.75}
              >
                <View style={styles.cardHeader}>
                  <View style={styles.classTag}>
                    <Text style={styles.classTagText}>{cls.className}</Text>
                  </View>
                  <View style={styles.sectionTag}>
                    <Text style={styles.sectionTagText}>Section {cls.section}</Text>
                  </View>
                  <View style={{ flex: 1 }} />
                  <Text style={styles.yearText}>{cls.year}</Text>
                </View>
                {cls.subject ? (
                  <Text style={styles.subject}>📚 {cls.subject}</Text>
                ) : null}
                <View style={styles.cardFooter}>
                  <Text style={styles.studentCount}>👥 {cls.studentCount} student{cls.studentCount !== 1 ? "s" : ""}</Text>
                  <Text style={styles.chevron}>›</Text>
                </View>
              </TouchableOpacity>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingBottom: 100 },
  title: { fontSize: fontSize["2xl"], fontWeight: "700", color: colors.text, marginBottom: spacing.md },
  infoCard: { backgroundColor: colors.primaryLight + "22", borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.primaryLight },
  infoText: { fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 20 },
  countLabel: { fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.md },
  empty: { alignItems: "center", justifyContent: "center", paddingVertical: 80, gap: spacing.sm },
  emptyText: { fontSize: fontSize.base, color: colors.textSecondary, textAlign: "center", fontWeight: "500" },
  emptySubText: { fontSize: fontSize.sm, color: colors.textMuted, textAlign: "center" },
  retryBtn: { marginTop: spacing.sm, backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.xl },
  retryText: { color: colors.white, fontWeight: "600", fontSize: fontSize.base },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginBottom: spacing.sm },
  classTag: { backgroundColor: colors.primary + "22", borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  classTagText: { fontSize: fontSize.sm, fontWeight: "700", color: colors.primary },
  sectionTag: { backgroundColor: colors.surface, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  sectionTagText: { fontSize: fontSize.sm, color: colors.textSecondary },
  yearText: { fontSize: fontSize.xs, color: colors.textMuted },
  subject: { fontSize: fontSize.base, color: colors.text, marginBottom: spacing.sm },
  cardFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  studentCount: { fontSize: fontSize.sm, color: colors.textMuted },
  chevron: { fontSize: 22, color: colors.textMuted, fontWeight: "300" },
});
