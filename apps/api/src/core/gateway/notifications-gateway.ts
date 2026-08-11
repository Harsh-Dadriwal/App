import type { BackendRequestOptions } from "./http";
import type { BackendResult } from "../types/contracts";

type NotificationsGatewayDependencies = {
  isBackendApiConfigured: () => boolean;
  backendRequest: <T>(
    path: string,
    options?: BackendRequestOptions
  ) => Promise<BackendResult<T>>;
  getSupabaseClient: () => Promise<any | null> | any | null;
};

export function createNotificationsGateway({
  isBackendApiConfigured,
  backendRequest,
  getSupabaseClient
}: NotificationsGatewayDependencies) {
  async function listNotifications(
    userId: string,
    tenantId?: string | null
  ): Promise<BackendResult<any[]>> {
    if (isBackendApiConfigured()) {
      const query = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : "";
      const result = await backendRequest<any[]>(`/api/v1/notifications${query}`);

      if (result.data || !result.error) {
        return { data: result.data ?? [], error: null };
      }
    }

    const supabase = await getSupabaseClient();

    if (!supabase) {
      return { data: [], error: "Supabase is not configured." };
    }

    const { data, error } = await supabase
      .from("notifications")
      .select("id, title, body, is_read, data, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(8);

    return { data: data ?? [], error: error?.message ?? null };
  }

  async function markNotificationRead(notificationId: string) {
    if (isBackendApiConfigured()) {
      const result = await backendRequest(`/api/v1/notifications/mark-read`, {
        method: "POST",
        body: { notificationId }
      });

      if (result.data || !result.error) {
        return result;
      }
    }

    const supabase = await getSupabaseClient();

    if (!supabase) {
      return { data: null, error: "Supabase is not configured." };
    }

    const result = await supabase
      .from("notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("id", notificationId);

    return { data: result.data ?? null, error: result.error?.message ?? null };
  }

  async function markAllNotificationsRead(notificationIds: string[]) {
    if (notificationIds.length === 0) {
      return { data: [], error: null };
    }

    if (isBackendApiConfigured()) {
      const result = await backendRequest(`/api/v1/notifications/mark-all-read`, {
        method: "POST",
        body: { notificationIds }
      });

      if (result.data || !result.error) {
        return result;
      }
    }

    const supabase = await getSupabaseClient();

    if (!supabase) {
      return { data: null, error: "Supabase is not configured." };
    }

    const result = await supabase
      .from("notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .in("id", notificationIds);

    return { data: result.data ?? null, error: result.error?.message ?? null };
  }

  return {
    listNotifications,
    markNotificationRead,
    markAllNotificationsRead
  };
}
