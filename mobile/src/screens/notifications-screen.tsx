import { Feather } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { AppButton, QueryState, ScreenShell } from "@/components/ui";
import { palette, radii } from "@/lib/theme";
import { markAllNotificationsRead, markNotificationRead } from "@/lib/backend/notifications-gateway";
import { notificationsChanged, screenForNotification, useNotifications, type AppNotification } from "@/lib/notifications";
import { useAuth } from "@/providers/auth-provider";
import { useMobileNavigation } from "@/providers/navigation-provider";

function timeAgo(value: string) {
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function NotificationsScreen() {
  const { profile, activeTenant } = useAuth();
  const { navigate } = useMobileNavigation();
  const notifications = useNotifications(profile?.id, activeTenant?.id);

  async function open(item: AppNotification) {
    if (!item.is_read) {
      await markNotificationRead(item.id);
      notificationsChanged();
    }
    const screen = screenForNotification(item.data);
    if (screen !== "notifications") navigate(screen);
  }

  async function markAll() {
    const unread = notifications.items.filter((item) => !item.is_read).map((item) => item.id);
    if (!unread.length) return;
    await markAllNotificationsRead(unread);
    notificationsChanged();
  }

  return (
    <ScreenShell title="Notifications" subtitle={notifications.unread ? `${notifications.unread} unread` : "You are all caught up"} currentScreen="notifications" showBack>
      {notifications.unread ? <AppButton label="Mark all as read" icon="check" kind="secondary" onPress={() => void markAll()} /> : null}
      <QueryState loading={notifications.loading} error={notifications.error} hasData={notifications.items.length > 0} empty="No notifications yet. Orders, quotations, service requests and incentives will show up here.">
        {notifications.items.map((item) => (
          <Pressable
            key={item.id}
            onPress={() => void open(item)}
            style={({ pressed }) => [styles.item, !item.is_read && styles.unread, pressed && { opacity: 0.85 }]}
            accessibilityRole="button"
            accessibilityLabel={`${item.is_read ? "" : "Unread. "}${item.title}`}
          >
            <View style={[styles.dot, item.is_read && styles.dotRead]} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[styles.title, !item.is_read && { fontWeight: "900" }]}>{item.title}</Text>
              {item.body ? <Text style={styles.body}>{item.body}</Text> : null}
              <Text style={styles.time}>{timeAgo(item.created_at)}</Text>
            </View>
            {screenForNotification(item.data) !== "notifications" ? <Feather name="chevron-right" size={18} color={palette.muted} /> : null}
          </Pressable>
        ))}
      </QueryState>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: radii.md,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.line
  },
  unread: { backgroundColor: palette.brandSoft, borderColor: palette.lineStrong },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: palette.brand },
  dotRead: { backgroundColor: "transparent" },
  title: { fontSize: 15, fontWeight: "700", color: palette.ink },
  body: { fontSize: 13.5, color: palette.ink, lineHeight: 19 },
  time: { fontSize: 12, color: palette.muted }
});
