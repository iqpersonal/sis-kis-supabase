import { StyleSheet } from "react-native";

// Design tokens matching the web dashboard theme
export const colors = {
  primary: "#1a56a8",
  primaryLight: "#2a6fc8",
  primaryDark: "#0e3d7a",

  background: "#0c1b2e",
  surface: "#132640",
  surfaceLight: "#1a3050",
  border: "#243d5c",

  text: "#f0f2f5",
  textSecondary: "#94a3b8",
  textMuted: "#64748b",

  accent: "#c9a84c",
  accentLight: "#e0c778",

  success: "#22c55e",
  warning: "#f59e0b",
  danger: "#ef4444",

  white: "#ffffff",
  black: "#000000",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const fontSize = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  "2xl": 24,
  "3xl": 30,
};

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  full: 9999,
};

// Common reusable styles
export const commonStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.background,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  title: {
    fontSize: fontSize["2xl"],
    fontWeight: "700",
    color: colors.text,
  },
  subtitle: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  input: {
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    fontSize: fontSize.base,
    color: colors.text,
  },
  buttonPrimary: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  buttonText: {
    color: colors.white,
    fontSize: fontSize.base,
    fontWeight: "600",
  },
});
