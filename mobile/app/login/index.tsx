import { View, Text, TouchableOpacity, StyleSheet, Image } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors, spacing, fontSize, radius } from "@/lib/theme";

export default function LoginSelector() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Logo / Branding */}
        <View style={styles.header}>
          <Image
            source={require("../../assets/logo.png")}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.title}>SiS Mobile</Text>
          <Text style={styles.subtitle}>Khaled International Schools</Text>
        </View>

        {/* Login Options */}
        <View style={styles.buttons}>
          <TouchableOpacity
            style={styles.parentButton}
            onPress={() => router.push("/login/parent")}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Parent Portal Login"
          >
            <View style={styles.iconCircle}>
              <Ionicons name="people" size={24} color={colors.primary} />
            </View>
            <View style={styles.buttonTextContainer}>
              <Text style={styles.buttonTitle}>Parent Portal</Text>
              <Text style={styles.buttonDesc}>View your child&apos;s grades & attendance</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.adminButton}
            onPress={() => router.push("/login/admin")}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Staff Login"
          >
            <View style={[styles.iconCircle, styles.iconCircleSecondary]}>
              <Ionicons name="shield-checkmark" size={24} color={colors.textSecondary} />
            </View>
            <View style={styles.buttonTextContainer}>
              <Text style={styles.buttonTitle}>Staff Login</Text>
              <Text style={styles.buttonDesc}>Admin, teacher, and staff access</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
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
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
  },
  header: {
    alignItems: "center",
    marginBottom: spacing.xxl,
  },
  logo: {
    width: 120,
    height: 120,
    marginBottom: spacing.md,
  },
  title: {
    fontSize: fontSize["3xl"],
    fontWeight: "700",
    color: colors.text,
  },
  subtitle: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  buttons: {
    gap: spacing.md,
  },
  parentButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  adminButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary + "18",
    justifyContent: "center",
    alignItems: "center",
  },
  iconCircleSecondary: {
    backgroundColor: colors.surfaceLight,
  },
  buttonTextContainer: {
    flex: 1,
  },
  buttonTitle: {
    fontSize: fontSize.lg,
    fontWeight: "600",
    color: colors.text,
  },
  buttonDesc: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
});

