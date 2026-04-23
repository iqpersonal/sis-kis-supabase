import { useEffect, useRef } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as Notifications from "expo-notifications";
import { AuthProvider, useAuth } from "@/context/auth-context";
import { ParentProvider, useParent } from "@/context/parent-context";
import {
  registerForPushNotifications,
  savePushToken,
} from "@/lib/push-notifications";

function PushTokenRegistrar() {
  const { familyNumber, children, selectedChild } = useParent();
  const registered = useRef(false);

  useEffect(() => {
    if (!familyNumber || registered.current) return;
    registered.current = true;

    (async () => {
      const token = await registerForPushNotifications();
      if (token) {
        const child = selectedChild || children[0];
        await savePushToken(familyNumber, token, {
          school: child?.school,
          class: child?.class,
          section: child?.section,
        });
      }
    })();
  }, [familyNumber, selectedChild, children]);

  return null;
}

/** Watches auth state and redirects to /login when signed out */
function AuthGuard() {
  const { user, loading: authLoading } = useAuth();
  const { familyNumber, loading: parentLoading } = useParent();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (authLoading || parentLoading) return;
    const isAuthenticated = !!user || !!familyNumber;
    const onLoginScreen = segments[0] === "login" || segments.length === 0;
    if (!isAuthenticated && !onLoginScreen) {
      router.replace("/login");
    }
  }, [user, familyNumber, authLoading, parentLoading, segments]);

  return null;
}

export default function RootLayout() {
  const notificationListener = useRef<Notifications.EventSubscription | null>(null);
  const responseListener = useRef<Notifications.EventSubscription | null>(null);

  useEffect(() => {
    // Listen for incoming notifications while app is open
    notificationListener.current = Notifications.addNotificationReceivedListener(() => {
      // notification is handled by the handler in push-notifications.ts
    });

    // Listen for when user taps a notification
    responseListener.current = Notifications.addNotificationResponseReceivedListener(() => {
      // could navigate to messages tab here in future
    });

    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, []);

  return (
    <AuthProvider>
      <ParentProvider>
        <PushTokenRegistrar />
        <AuthGuard />
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: "#0c1b2e" },
            animation: "slide_from_right",
          }}
        />
      </ParentProvider>
    </AuthProvider>
  );
}

