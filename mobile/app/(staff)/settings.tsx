import { View, Text, StyleSheet, TouchableOpacity, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useAuth } from "@/context/auth-context";
import { useRouter } from "expo-router";
import { colors, spacing, fontSize, radius, commonStyles } from "@/lib/theme";

export default function StaffSettings() {
  const { user, signOut } = useAuth();
  const router = useRouter();

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
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Settings</Text>

        {/* Account info */}
        <View style={styles.card}>
          <View style={styles.avatarRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {user?.email?.charAt(0).toUpperCase() || "?"}
              </Text>
            </View>
            <View style={styles.userInfo}>
              <Text style={styles.email}>{user?.email || "—"}</Text>
              <Text style={styles.label}>Staff Account</Text>
            </View>
          </View>
        </View>

        {/* Info items */}
        <View style={styles.card}>
          <View style={styles.infoRow}>
            <Ionicons name="information-circle-outline" size={20} color={colors.textMuted} />
            <Text style={styles.infoText}>App Version 1.0.0</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.infoRow}>
            <Ionicons name="globe-outline" size={20} color={colors.textMuted} />
            <Text style={styles.infoText}>Khaled International Schools</Text>
          </View>
        </View>

        {/* Sign out */}
        <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
          <Ionicons name="log-out-outline" size={20} color="#ef4444" />
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
  },
  title: {
    fontSize: fontSize["2xl"],
    fontWeight: "700",
    color: colors.text,
    marginBottom: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  avatarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#10b98130",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    fontSize: fontSize.xl,
    fontWeight: "700",
    color: "#10b981",
  },
  userInfo: {
    flex: 1,
  },
  email: {
    fontSize: fontSize.base,
    fontWeight: "600",
    color: colors.text,
  },
  label: {
    fontSize: fontSize.xs,
    color: "#10b981",
    marginTop: 2,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  infoText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.xs,
  },
  signOutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: "#ef444415",
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "#ef444440",
    padding: spacing.md,
    marginTop: spacing.md,
  },
  signOutText: {
    fontSize: fontSize.base,
    fontWeight: "600",
    color: "#ef4444",
  },
});
