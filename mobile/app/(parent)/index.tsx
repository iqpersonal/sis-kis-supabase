import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useParent } from "@/context/parent-context";
import { colors, spacing, fontSize, radius, commonStyles } from "@/lib/theme";

type IoniconsName = keyof typeof Ionicons.glyphMap;

const quickLinks: { icon: IoniconsName; label: string; note: string; route: string; color: string }[] = [
  { icon: "ribbon-outline", label: "Grades", note: "View all subjects", route: "/(parent)/grades", color: colors.primary },
  { icon: "calendar-outline", label: "Attendance", note: "Check absence record", route: "/(parent)/attendance", color: colors.warning },
  { icon: "wallet-outline", label: "Fees", note: "Fee balance & payments", route: "/(parent)/fees", color: colors.success },
  { icon: "document-text-outline", label: "Documents", note: "Passport & Iqama", route: "/(parent)/documents", color: colors.danger },
  { icon: "clipboard-outline", label: "Quizzes", note: "Take adaptive quizzes", route: "/quiz-list", color: "#8b5cf6" },
  { icon: "mail-outline", label: "Messages", note: "School messages", route: "/(parent)/messages", color: colors.primaryLight },
];

export default function ParentHome() {
  const { children, selectedChild, selectChild, familyNumber } = useParent();
  const router = useRouter();

  return (
    <SafeAreaView style={commonStyles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.greeting}>Welcome back</Text>
              <Text style={styles.familyNum}>Family #{familyNumber}</Text>
            </View>
            <Image
              source={require("../../assets/logo.png")}
              style={styles.headerLogo}
              resizeMode="contain"
            />
          </View>
        </View>

        {/* Child Selector */}
        {children.length > 1 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Your Children</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.childRow}>
              {children.map((child) => (
                <TouchableOpacity
                  key={child.studentNumber}
                  style={[
                    styles.childChip,
                    selectedChild?.studentNumber === child.studentNumber && styles.childChipActive,
                  ]}
                  onPress={() => selectChild(child)}
                  activeOpacity={0.7}
                >
                  <View style={styles.childAvatar}>
                    <Text style={styles.childAvatarText}>
                      {child.fullName.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.childName} numberOfLines={1}>
                    {child.fullName.split(" ")[0]}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Selected Child Card */}
        {selectedChild && (
          <View style={styles.childCard}>
            <View style={styles.childCardHeader}>
              <View style={styles.bigAvatar}>
                <Text style={styles.bigAvatarText}>
                  {selectedChild.fullName.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={styles.childCardInfo}>
                <Text style={styles.childFullName}>{selectedChild.fullName}</Text>
                {selectedChild.fullNameAr ? (
                  <Text style={styles.childFullNameAr}>{selectedChild.fullNameAr}</Text>
                ) : null}
                <Text style={styles.childMeta}>
                  {selectedChild.class} • #{selectedChild.studentNumber}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Quick Links */}
        <Text style={styles.sectionTitle}>Quick Access</Text>
        <View style={styles.quickLinks}>
          {quickLinks.map((item) => (
            <TouchableOpacity
              key={item.label}
              style={styles.quickCard}
              activeOpacity={0.7}
              onPress={() => router.push(item.route)}
              accessibilityRole="button"
              accessibilityLabel={item.label}
            >
              <View style={[styles.quickIconBg, { backgroundColor: item.color + "18" }]}>
                <Ionicons name={item.icon} size={22} color={item.color} />
              </View>
              <Text style={styles.quickLabel}>{item.label}</Text>
              <Text style={styles.quickNote}>{item.note}</Text>
            </TouchableOpacity>
          ))}
        </View>
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
  familyNum: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: "600",
    color: colors.text,
    marginBottom: spacing.md,
  },
  childRow: {
    flexDirection: "row",
  },
  childChip: {
    alignItems: "center",
    gap: spacing.xs,
    marginRight: spacing.md,
    padding: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    minWidth: 72,
  },
  childChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + "15",
  },
  childAvatar: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.primaryDark,
    justifyContent: "center",
    alignItems: "center",
  },
  childAvatarText: {
    fontSize: fontSize.lg,
    fontWeight: "700",
    color: colors.white,
  },
  childName: {
    fontSize: fontSize.xs,
    color: colors.text,
    fontWeight: "500",
  },
  childCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.xl,
  },
  childCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  bigAvatar: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: colors.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  bigAvatarText: {
    fontSize: fontSize.xl,
    fontWeight: "700",
    color: colors.white,
  },
  childCardInfo: {
    flex: 1,
  },
  childFullName: {
    fontSize: fontSize.lg,
    fontWeight: "600",
    color: colors.text,
  },
  childFullNameAr: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  childMeta: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  quickLinks: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  quickCard: {
    width: "48%",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  quickIconBg: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: spacing.xs,
  },
  quickLabel: {
    fontSize: fontSize.base,
    fontWeight: "600",
    color: colors.text,
  },
  quickNote: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
});

