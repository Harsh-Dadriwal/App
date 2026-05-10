import { createNotificationsGateway } from "@mahalaxmi/core/gateway/notifications-gateway";
import { isBackendApiConfigured } from "@/lib/backend/config";
import { getSupabaseBrowserClient } from "@mahalaxmi/core/supabase/client";
import { backendRequest } from "@/lib/backend/http";

const notificationsGateway = createNotificationsGateway({
  isBackendApiConfigured,
  backendRequest,
  getSupabaseClient: getSupabaseBrowserClient
});

export const listNotifications = notificationsGateway.listNotifications;
export const markNotificationRead = notificationsGateway.markNotificationRead;
export const markAllNotificationsRead = notificationsGateway.markAllNotificationsRead;
