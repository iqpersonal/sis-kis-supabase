import { View, Text, StyleSheet, TouchableOpacity, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useState, useEffect } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useAuth } from "@/context/auth-context";
import { useRouter } from "expo-router";
import { collection, query, where, getDocs, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { colors, spacing, fontSize, radius, commonStyles } from "@/lib/theme";

interface StaffProfile {
  E_Full_Name: string;
  Department_Desc: string;
  Position_Desc: string;
  Staff_Number: string;
}

export default function StaffSettings() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const [profile, setProfile] = useState<StaffProfile | null>(null);

  useEffect(() => {
    if (!user?.email) return;
    const fetch = async () => {
      try {
        const q = query(
          collection(db, "staff"),
          where("E_Mail", "==", user.email!.toLowerCase()),
          limit(1)
        );
        const snap = await getDocs(q);
        if (!snap.empty) setProfile(snap.docs[0].data() as StaffProfile);
      } catch { /* ignore */ }
    };
    fetch();
  }, [user?.email]);

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
                {(profile?.E_Full_Name || user?.email || "?").charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={styles.userInfo}>
              <Text style={styles.name}>{profile?.E_Full_Name || user?.displayName || user?.email || "Staff"}</Text>
              <Text style={styles.email}>{user?.email || "—"}</Text>
              {profile?.Position_Desc ? (
                <Text style={styles.label}>{profile.Position_Desc}</Text>
              ) : (
                <Text style={styles.label}>Staff Account</Text>
              )}
            </View>
          </View>
          {profile && (
            <>
              <View style={styles.divider} />
              <View style={styles.infoRow}>
                <Ionicons name="business-outline" size={16} color={colors.textMuted} />
                <Text style={styles.infoText}>{profile.Department_Desc || "—"}</Text>
              </View>
              {profile.Staff_Number ? (
                <>
                  <View style={styles.divider} />
                  <View style={styles.infoRow}>
                    <Ionicons name="card-outline" size={16} color={colors.textMuted} />
                    <Text style={styles.infoText}>Staff # {profile.Staff_Number}</Text>
                  </View>
                </>
              ) : null}
            </>
          )}
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
  name: {
    fontSize: fontSize.base,
    fontWeight: "700",
    color: colors.text,
  },
  email: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: 1,
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
