import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from "react-native";
import { useParent } from "@/context/parent-context";
import { colors, spacing, fontSize, radius } from "@/lib/theme";

export default function ChildSelector() {
  const { children, selectedChild, selectChild } = useParent();

  if (children.length <= 1) return null;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.row}>
      {children.map((child) => (
        <TouchableOpacity
          key={child.studentNumber}
          style={[
            styles.chip,
            selectedChild?.studentNumber === child.studentNumber && styles.chipActive,
          ]}
          onPress={() => selectChild(child)}
          activeOpacity={0.7}
        >
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {child.fullName.charAt(0).toUpperCase()}
            </Text>
          </View>
          <Text style={styles.name} numberOfLines={1}>
            {child.fullName.split(" ")[0]}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    marginBottom: spacing.md,
  },
  chip: {
    alignItems: "center",
    gap: spacing.xs,
    marginRight: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    minWidth: 72,
  },
  chipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + "15",
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.primaryDark,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    fontSize: fontSize.base,
    fontWeight: "700",
    color: colors.white,
  },
  name: {
    fontSize: fontSize.xs,
    color: colors.text,
    fontWeight: "500",
  },
});
