import { useEffect } from "react";
import { Tabs, Redirect } from "expo-router";
import { StyleSheet, BackHandler, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useAuth, isStoreRole } from "@/context/auth-context";
import { colors, fontSize } from "@/lib/theme";

export default function TabLayout() {
  // Prevent Android back button from navigating to login screen
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const handler = () => {
      BackHandler.exitApp();
      return true;
    };
    BackHandler.addEventListener("hardwareBackPress", handler);
    return () => BackHandler.removeEventListener("hardwareBackPress", handler);
  }, []);
  const insets = useSafeAreaInsets();
  const bottomPadding = Math.max(insets.bottom, 12);
  const { role } = useAuth();

  // Store-only roles should never be in (tabs) — redirect to (store)
  if (isStoreRole(role)) {
    return <Redirect href="/(store)" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 60 + bottomPadding,
          paddingBottom: bottomPadding,
          paddingTop: 6,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: styles.tabLabel,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Dashboard",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="grid-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="students"
        options={{
          title: "Students",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="school-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: "Alerts",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="notifications-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabLabel: {
    fontSize: fontSize.xs,
    fontWeight: "500",
  },
});

