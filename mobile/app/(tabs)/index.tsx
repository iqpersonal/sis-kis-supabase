import { View, Text, StyleSheet, ScrollView, RefreshControl, Image, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useEffect, useState, useCallback } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/context/auth-context";
import { SkeletonCard } from "@/components/Skeleton";
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

type IoniconsName = keyof typeof Ionicons.glyphMap;

interface KPI {
  label: string;
  value: string;
  icon: IoniconsName;
  color: string;
}

interface QuickAction {
  label: string;
  icon: IoniconsName;
  route: string;
  color: string;
}

interface ClassInfo {
  id: string;
  className: string;
  section: string;
  subject: string;
  year: string;
  studentCount: number;
}

export default function DashboardTab() {
  const { user, roles, username } = useAuth();
  const router = useRouter();
  const isTeacher = roles?.includes("teacher");
  const isAdmin = roles?.some((r) =>
    ["admin", "school_admin", "super_admin"].includes(r)
  );
  const isLibrarian = roles?.includes("librarian");

  const [kpis, setKpis] = useState<KPI[]>([]);
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const fetchData = useCallback(async () => {
    if (!user?.uid) return;
    setError("");
    try {
      if (isTeacher) {
        const token = await getToken();
        const param = username ? `username=${encodeURIComponent(username)}` : `uid=${user.uid}`;
        const res = await fetch(`${API_BASE}/teacher/classes?${param}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const cls: ClassInfo[] = data.classes || [];
        setClasses(cls);
        const totalStudents = cls.reduce((s, c) => s + (c.studentCount || 0), 0);
        const subjects = [...new Set(cls.map((c) => c.subject).filter(Boolean))];
        setKpis([
          { label: "My Classes", value: String(cls.length), icon: "library-outline", color: colors.primary },
          { label: "My Students", value: String(totalStudents), icon: "people-outline", color: colors.success },
          { label: "Subjects", value: String(subjects.length), icon: "book-outline", color: colors.primaryLight },
          ...(isLibrarian
            ? [{ label: "Library Access", value: "Active", icon: "bookmarks-outline" as IoniconsName, color: colors.warning }]
            : []),
        ]);
      } else if (isAdmin) {
        // Admins: show generic welcome; full stats on web dashboard
        setKpis([
          { label: "Students", value: "—", icon: "school-outline", color: colors.primary },
          { label: "Active", value: "—", icon: "checkmark-circle-outline", color: colors.success },
          { label: "Absence", value: "—", icon: "calendar-outline", color: colors.warning },
          { label: "Alerts", value: "—", icon: "notifications-outline", color: colors.danger },
        ]);
      }
    } catch {
      setError("Could not load dashboard data");
    }
  }, [user?.uid, username, isTeacher, isAdmin, isLibrarian]);

  useEffect(() => {
    setLoading(true);
    fetchData().finally(() => setLoading(false));
  }, [fetchData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  // Quick action cards based on role
  const quickActions: QuickAction[] = [
    ...(isTeacher
      ? [
          { label: "My Classes", icon: "library-outline" as IoniconsName, route: "/(tabs)/classes", color: colors.primary },
          { label: "Students", icon: "people-outline" as IoniconsName, route: "/(tabs)/students", color: colors.success },
        ]
      : [
          { label: "Students", icon: "people-outline" as IoniconsName, route: "/(tabs)/students", color: colors.success },
        ]),
    { label: "Alerts", icon: "notifications-outline" as IoniconsName, route: "/(tabs)/alerts", color: colors.warning },
    ...(isLibrarian
      ? [{ label: "Library", icon: "bookmarks-outline" as IoniconsName, route: "/(tabs)/library", color: colors.primaryLight }]
      : []),
  ];

  const firstName = user?.displayName?.split(" ")[0] ?? "";

  return (
    <SafeAreaView style={commonStyles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.greeting}>
                Welcome back{firstName ? `, ${firstName}` : ""}
              </Text>
              <Text style={styles.subGreeting}>Khaled International Schools</Text>
            </View>
            <Image
              source={require("../../assets/logo.png")}
              style={styles.headerLogo}
              resizeMode="contain"
            />
          </View>
          {/* Role badges */}
          <View style={styles.roleBadges}>
            {roles?.map((r) => (
              <View key={r} style={styles.roleBadge}>
                <Text style={styles.roleBadgeText}>{r.replace(/_/g, " ")}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* KPI Grid */}
        {loading ? (
          <View style={styles.grid}>
            {[1, 2, 3, 4].map((i) => (
              <SkeletonCard key={i} />
            ))}
          </View>
        ) : error ? (
          <View style={styles.errorContainer}>
            <Ionicons name="cloud-offline-outline" size={48} color={colors.textMuted} />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={onRefresh} style={styles.retryBtn} activeOpacity={0.8}>
              <Text style={styles.retryText}>Tap to retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.grid}>
            {kpis.map((kpi) => (
              <View key={kpi.label} style={styles.kpiCard}>
                <View style={[styles.kpiIconBg, { backgroundColor: kpi.color + "18" }]}>
                  <Ionicons name={kpi.icon} size={24} color={kpi.color} />
                </View>
                <Text style={styles.kpiValue}>{kpi.value}</Text>
                <Text style={styles.kpiLabel}>{kpi.label}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Quick Actions */}
        <Text style={styles.sectionTitle}>Quick Access</Text>
        <View style={styles.actionsGrid}>
          {quickActions.map((a) => (
            <TouchableOpacity
              key={a.label}
              style={styles.actionCard}
              activeOpacity={0.75}
              onPress={() => router.push(a.route as never)}
            >
              <View style={[styles.actionIcon, { backgroundColor: a.color + "18" }]}>
                <Ionicons name={a.icon} size={26} color={a.color} />
              </View>
              <Text style={styles.actionLabel}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Class list for teachers */}
        {isTeacher && classes.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>My Classes</Text>
            <View style={styles.classList}>
              {classes.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={styles.classCard}
                  activeOpacity={0.75}
                  onPress={() => router.push("/(tabs)/classes" as never)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.className}>{c.className}</Text>
                    <Text style={styles.classMeta}>{c.section} · {c.subject}</Text>
                  </View>
                  <View style={styles.studentCount}>
                    <Ionicons name="people-outline" size={14} color={colors.textMuted} />
                    <Text style={styles.studentCountText}>{c.studentCount}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    padding: spacing.lg,
  },
  header: {
    marginBottom: spacing.xl,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  headerLogo: {
    width: 48,
    height: 48,
  },
  greeting: {
    fontSize: fontSize["2xl"],
    fontWeight: "700",
    color: colors.text,
  },
  subGreeting: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  kpiCard: {
    width: "48%",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    alignItems: "center",
    gap: spacing.xs,
  },
  kpiIconBg: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: spacing.xs,
  },
  kpiValue: {
    fontSize: fontSize.xl,
    fontWeight: "700",
    color: colors.text,
  },
  kpiLabel: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  errorContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
  },
  errorText: {
    fontSize: fontSize.base,
    color: colors.textSecondary,
  },
  retryBtn: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  retryText: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: "600",
  },
  roleBadges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  roleBadge: {
    backgroundColor: colors.primary + "18",
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  roleBadgeText: {
    fontSize: fontSize.xs,
    color: colors.primary,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  sectionTitle: {
    fontSize: fontSize.base,
    fontWeight: "700",
    color: colors.text,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  actionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  actionCard: {
    width: "48%",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    alignItems: "center",
    gap: spacing.sm,
  },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  actionLabel: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: colors.text,
    textAlign: "center",
  },
  classList: {
    gap: spacing.sm,
  },
  classCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.md,
  },
  className: {
    fontSize: fontSize.sm,
    fontWeight: "700",
    color: colors.text,
  },
  classMeta: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  studentCount: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  studentCountText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontWeight: "600",
  },
});

