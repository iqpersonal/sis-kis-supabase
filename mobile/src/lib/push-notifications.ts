import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";
import { doc, setDoc, arrayUnion, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";

// Configure how notifications appear when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Request permissions and get the Expo Push Token.
 * Returns null on emulators or when permission is denied.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  // Push only works on physical devices
  if (!Device.isDevice) {
    console.log("Push notifications require a physical device");
    return null;
  }

  // Android needs a notification channel
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#2563eb",
    });
  }

  // Check / request permission
  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    console.log("Push notification permission not granted");
    return null;
  }

  // Get Expo push token
  const tokenData = await Notifications.getExpoPushTokenAsync({
    projectId: "sis-kis", // matches the Firebase project
  });
  return tokenData.data;
}

/**
 * Store the push token in Firestore so the dashboard can target this device.
 */
export async function savePushToken(
  familyNumber: string,
  token: string,
  meta?: { school?: string; class?: string; section?: string }
) {
  const ref = doc(db, "push_tokens", familyNumber);
  await setDoc(
    ref,
    {
      tokens: arrayUnion({
        token,
        device: Platform.OS,
        updated_at: new Date().toISOString(),
      }),
      family_number: familyNumber,
      ...(meta?.school && { school: meta.school }),
      ...(meta?.class && { class: meta.class }),
      ...(meta?.section && { section: meta.section }),
      last_updated: serverTimestamp(),
    },
    { merge: true }
  );
}
