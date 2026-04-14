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
          <View style={styles.logoWrapper}>
            <Image
              source={require("../../assets/logo.png")}
              style={styles.logo}
              resizeMode="contain"
            />
          </View>
          <Text style={styles.title}>SiS Mobile</Text>
          <Text style={styles.subtitle}>Khaled International Schools</Text>
        </View>

        {/* Login Options */}
        <View style={styles.buttons}>
          <TouchableOpacity
            style={styles.parentButton}
            onPress={() => router.push("/login/parent")}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Parent Portal Login"
          >
            <View style={styles.iconCircle}>
              <Ionicons name="people" size={26} color={colors.white} />
            </View>
            <View style={styles.buttonTextContainer}>
              <Text style={styles.buttonTitle}>Parent Portal</Text>
              <Text style={styles.buttonDesc}>View your child&apos;s grades & attendance</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.accentLight} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.adminButton}
            onPress={() => router.push("/login/admin")}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Staff Login"
          >
            <View style={[styles.iconCircle, styles.iconCircleSecondary]}>
              <Ionicons name="shield-checkmark" size={26} color={colors.white} />
            </View>
            <View style={styles.buttonTextContainer}>
              <Text style={styles.buttonTitle}>Staff Login</Text>
              <Text style={styles.buttonDesc}>Admin, teacher, and staff access</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.accentLight} />
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
  logoWrapper: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: "#f5f0dc",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: spacing.lg,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  logo: {
    width: 120,
    height: 120,
  },
  title: {
    fontSize: fontSize["3xl"],
    fontWeight: "700",
    color: colors.white,
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: fontSize.sm,
    color: colors.accentLight,
    marginTop: spacing.xs,
    letterSpacing: 0.3,
  },
  buttons: {
    gap: spacing.md,
  },
  parentButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    shadowColor: colors.primaryDark,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 5,
  },
  adminButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.accent + "60",
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  iconCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "rgba(255,255,255,0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  iconCircleSecondary: {
    backgroundColor: colors.accent + "30",
  },
  buttonTextContainer: {
    flex: 1,
  },
  buttonTitle: {
    fontSize: fontSize.lg,
    fontWeight: "600",
    color: colors.white,
  },
  buttonDesc: {
    fontSize: fontSize.xs,
    color: "rgba(255,255,255,0.7)",
    marginTop: 2,
  },
});

