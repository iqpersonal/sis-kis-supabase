import { useEffect, useRef } from "react";
import { View, Animated, StyleSheet, type ViewStyle } from "react-native";
import { colors, radius, spacing } from "@/lib/theme";

interface SkeletonProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

export function SkeletonBox({
  width = "100%",
  height = 20,
  borderRadius = radius.sm,
  style,
}: SkeletonProps) {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        {
          width: width as number,
          height,
          borderRadius,
          backgroundColor: colors.surfaceLight,
          opacity,
        },
        style,
      ]}
    />
  );
}

/** Skeleton placeholder for a KPI / stat card */
export function SkeletonCard() {
  return (
    <View style={styles.card}>
      <SkeletonBox width={32} height={32} borderRadius={radius.md} />
      <SkeletonBox width="60%" height={22} style={{ marginTop: spacing.sm }} />
      <SkeletonBox width="40%" height={14} style={{ marginTop: spacing.xs }} />
    </View>
  );
}

/** Skeleton placeholder for a list row */
export function SkeletonRow() {
  return (
    <View style={styles.row}>
      <SkeletonBox width={44} height={44} borderRadius={22} />
      <View style={styles.rowText}>
        <SkeletonBox width="70%" height={16} />
        <SkeletonBox width="45%" height={12} style={{ marginTop: spacing.xs }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "48%",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    alignItems: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.md,
  },
  rowText: {
    flex: 1,
    gap: spacing.xs,
  },
});
