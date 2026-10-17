import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import { listNotifications, registerPushToken, removePushToken } from "@/lib/backend/notifications-gateway";
import type { MobileScreen } from "@/providers/navigation-provider";

/**
 * Phone notifications: the server pushes every new in-app notification to this phone
 * (see db/push_notifications.sql). Tapping one opens the matching screen.
 */

// Show notifications as a banner with sound even while the app is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true
  })
});

let registeredToken: string | null = null;

// A tiny change signal so the bell and the list refresh the moment something arrives.
const listeners = new Set<() => void>();
export function notificationsChanged() {
  listeners.forEach((listener) => listener());
}
function onNotificationsChanged(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Which screen a notification belongs to, from the module the server tags it with. */
export function screenForNotification(data: Record<string, unknown> | null | undefined): MobileScreen {
  switch (data?.module) {
    case "order_requests":
      return "orders";
    case "quotations":
      return "quotations";
    case "selections":
      return "selections";
    case "service_requests":
      return "service-requests";
    case "partner_incentives":
      return "incentives";
    case "price_list":
      return "price-list";
    case "site_notes":
      return "notes";
    default:
      return "notifications";
  }
}

/**
 * Asks for permission (once), gets this phone's Expo push token and gives it to the
 * server. Returns quietly if the person says no or the build cannot receive pushes.
 */
export async function registerForPushNotifications() {
  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Updates",
        importance: Notifications.AndroidImportance.HIGH,
        sound: "default",
        vibrationPattern: [0, 250, 200, 250],
        lightColor: "#c2570c"
      });
    }
    const current = await Notifications.getPermissionsAsync();
    const status = current.status === "granted" ? current.status : (await Notifications.requestPermissionsAsync()).status;
    if (status !== "granted") return null;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    const { data: token } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    const result = await registerPushToken(token, Platform.OS === "ios" ? "ios" : "android");
    if (!result.error) registeredToken = token;
    return token;
  } catch (error) {
    // Typically: this build has no Firebase (FCM) setup yet. In-app notifications still work.
    console.warn(`Push notifications are not available: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/** Stops pushes to this phone; called before signing out. */
export async function unregisterPushNotifications() {
  if (!registeredToken) return;
  const token = registeredToken;
  registeredToken = null;
  await removePushToken(token).catch(() => undefined);
}

let handledLaunchResponse = false;

/** Opens the right screen when a notification is tapped, and refreshes counts when one arrives. */
export function useNotificationRouting(navigate: (screen: MobileScreen) => void, enabled: boolean) {
  // Keep the latest navigate without re-subscribing on every screen change.
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  useEffect(() => {
    if (!enabled) return;
    const received = Notifications.addNotificationReceivedListener(() => notificationsChanged());
    const tapped = Notifications.addNotificationResponseReceivedListener((response) => {
      notificationsChanged();
      navigateRef.current(screenForNotification(response.notification.request.content.data as Record<string, unknown>));
    });
    // The app was opened by tapping a notification while it was closed: handle it once.
    if (!handledLaunchResponse) {
      handledLaunchResponse = true;
      void Notifications.getLastNotificationResponseAsync().then((response) => {
        if (response) navigateRef.current(screenForNotification(response.notification.request.content.data as Record<string, unknown>));
      });
    }
    return () => {
      received.remove();
      tapped.remove();
    };
  }, [enabled]);
}

export type AppNotification = {
  id: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  is_read: boolean;
  created_at: string;
};

/** The signed-in person's notifications, refreshed whenever one arrives or is read. */
export function useNotifications(userId: string | null | undefined, tenantId: string | null | undefined) {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => onNotificationsChanged(() => setVersion((value) => value + 1)), []);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    void listNotifications(userId, tenantId ?? null).then((result) => {
      if (!active) return;
      if (result.data) setItems(result.data as AppNotification[]);
      setError(result.error);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [userId, tenantId, version]);

  return { items, loading, error, unread: items.filter((item) => !item.is_read).length, refresh: () => setVersion((value) => value + 1) };
}
