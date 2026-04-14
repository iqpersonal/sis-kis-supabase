import { View, Text, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth, getStoreAccess } from "@/context/auth-context";
import { colors, spacing, fontSize, radius, commonStyles } from "@/lib/theme";

export default function StoreSettingsTab() {
  const router = useRouter();
  const { user, role, signOut } = useAuth();
  const access = getStoreAccess(role);

  const storeLabel = access.general && access.it
    ? "General Store & IT Store"
    : access.general
    ? "General Store"
    : "IT Store";

  const handleSignOut = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          await signOut();
          router.replace("/login");
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={commonStyles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Settings</Text>

        {/* Profile Card */}
        <View style={styles.card}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {user?.displayName?.charAt(0)?.toUpperCase() || "U"}
            </Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>
              {user?.displayName || "User"}
            </Text>
            <Text style={styles.profileEmail}>{user?.email}</Text>
            <View style={styles.roleBadge}>
              <Text style={styles.roleText}>{(role || "admin").replace("_", " ")}</Text>
            </View>
          </View>
        </View>

        {/* Menu Items */}
        <View style={styles.menu}>
          <View style={styles.menuItem}>
            <Text style={styles.menuLabel}>Store Access</Text>
            <Text style={styles.menuValue}>{storeLabel}</Text>
          </View>
          <View style={styles.menuItem}>
            <Text style={styles.menuLabel}>App Version</Text>
            <Text style={styles.menuValue}>1.1.0</Text>
          </View>
          <View style={styles.menuItem}>
            <Text style={styles.menuLabel}>Project</Text>
            <Text style={styles.menuValue}>sis-kis</Text>
          </View>
        </View>

        {/* Sign Out */}
        <TouchableOpacity
          style={styles.signOutBtn}
          onPress={handleSignOut}
          activeOpacity={0.7}
        >
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, padding: spacing.lg },
  title: {
    fontSize: fontSize["2xl"],
    fontWeight: "700",
    color: colors.text,
    marginBottom: spacing.xl,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: colors.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: { fontSize: fontSize.xl, fontWeight: "700", color: colors.white },
  profileInfo: { flex: 1 },
  profileName: { fontSize: fontSize.lg, fontWeight: "600", color: colors.text },
  profileEmail: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  roleBadge: {
    alignSelf: "flex-start",
    backgroundColor: colors.primary + "20",
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    marginTop: spacing.xs,
  },
  roleText: {
    fontSize: fontSize.xs,
    fontWeight: "600",
    color: colors.primary,
    textTransform: "capitalize",
  },
  menu: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xl,
  },
  menuItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  menuLabel: { fontSize: fontSize.base, color: colors.text },
  menuValue: { fontSize: fontSize.sm, color: colors.textSecondary },
  signOutBtn: {
    backgroundColor: colors.danger + "15",
    borderWidth: 1,
    borderColor: colors.danger + "40",
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: "center",
  },
  signOutText: { fontSize: fontSize.base, fontWeight: "600", color: colors.danger },
});
