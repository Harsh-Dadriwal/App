import { createNotificationsGateway } from "@mahalaxmi/core/gateway/notifications-gateway";
import { supabase } from "@/lib/supabase";
import { backendRequest } from "./http";
import { isBackendApiConfigured } from "./config";

const gateway = createNotificationsGateway({ isBackendApiConfigured, backendRequest, getSupabaseClient: () => supabase });

export const listNotifications = gateway.listNotifications;
export const markNotificationRead = gateway.markNotificationRead;
export const markAllNotificationsRead = gateway.markAllNotificationsRead;
export const registerPushToken = gateway.registerPushToken;
export const removePushToken = gateway.removePushToken;
