import { Injectable } from "@nestjs/common";
import { SupabaseAdminService } from "../../common/supabase/supabase-admin.service";
import { QUEUE_NAMES } from "../../common/queue/queue.constants";
import { QueueService } from "../../common/queue/queue.service";
import { TenantAccessService } from "../../common/tenancy/tenant-access.service";
import type { RequestActor } from "../../common/auth/auth.types";

@Injectable()
export class NotificationsService {
  constructor(
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly queueService: QueueService,
    private readonly tenantAccess: TenantAccessService
  ) {}

  async listForUser(actor: RequestActor, userId: string, accessToken: string, tenantId?: string | null) {
    if (tenantId) {
      await this.tenantAccess.assertTenantAccess(actor, tenantId);
    }

    const supabase = this.supabaseAdmin.createUserClient(accessToken);
    let query = supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (tenantId) {
      query = query.eq("tenant_id", tenantId);
    }

    const result = await query;

    if (result.error) {
      throw new Error(result.error.message);
    }

    return result.data ?? [];
  }

  async markRead(actor: RequestActor, notificationId: string, accessToken: string) {
    const notification = await this.supabaseAdmin
      .getClient()
      .from("notifications")
      .select("id, tenant_id, user_id")
      .eq("id", notificationId)
      .maybeSingle();

    if (notification.error) {
      throw new Error(notification.error.message);
    }

    if (!notification.data || notification.data.user_id !== actor.appUserId) {
      throw new Error("Notification not found.");
    }

    await this.tenantAccess.assertTenantAccess(actor, notification.data.tenant_id);
    const supabase = this.supabaseAdmin.createUserClient(accessToken);
    const result = await supabase
      .from("notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("id", notificationId);

    if (result.error) {
      throw new Error(result.error.message);
    }

    return { id: notificationId };
  }

  async markAllRead(actor: RequestActor, notificationIds: string[], accessToken: string) {
    if (notificationIds.length === 0) {
      return [];
    }

    const verification = await this.supabaseAdmin
      .getClient()
      .from("notifications")
      .select("id, tenant_id, user_id")
      .in("id", notificationIds);

    if (verification.error) {
      throw new Error(verification.error.message);
    }

    for (const row of verification.data ?? []) {
      if (row.user_id !== actor.appUserId) {
        throw new Error("Notification ownership mismatch.");
      }
      await this.tenantAccess.assertTenantAccess(actor, row.tenant_id);
    }

    const supabase = this.supabaseAdmin.createUserClient(accessToken);
    const result = await supabase
      .from("notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .in("id", notificationIds);

    if (result.error) {
      throw new Error(result.error.message);
    }

    await this.queueService.enqueue(QUEUE_NAMES.notifications, "notifications-read", {
      notificationIds
    }, {
      jobId: `notifications-read-${notificationIds.join(",")}`,
      removeOnComplete: true
    });

    return notificationIds;
  }
}
