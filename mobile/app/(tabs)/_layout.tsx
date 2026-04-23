import { useEffect } from "react";
import { Tabs, Redirect } from "expo-router";
import { StyleSheet, BackHandler, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useAuth, isStoreRole, hasLibraryAccess } from "@/context/auth-context";
import { colors, fontSize } from "@/lib/theme";

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const bottomPadding = Math.max(insets.bottom, 12);
  const { user, roles } = useAuth();

  // Prevent Android back button from exiting while authenticated
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const handler = () => {
      if (!user) return false; // let AuthGuard handle navigation
      BackHandler.exitApp();
      return true;
    };
    BackHandler.addEventListener("hardwareBackPress", handler);
    return () => BackHandler.removeEventListener("hardwareBackPress", handler);
  }, [user]);

  // Store-only roles should never be in (tabs) — redirect to (store)
  if (isStoreRole(roles)) {
    return <Redirect href="/(store)" />;
  }

  const showLibrary = hasLibraryAccess(roles);
  const showClasses = roles?.includes("teacher");

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
        name="classes"
        options={{
          title: "Classes",
          href: showClasses ? undefined : null,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="easel-outline" size={size} color={color} />
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
        name="library"
        options={{
          title: "Library",
          href: showLibrary ? undefined : null,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="book-outline" size={size} color={color} />
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

