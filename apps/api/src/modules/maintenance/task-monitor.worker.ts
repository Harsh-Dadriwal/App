import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { Job, Worker } from "bullmq";
import { BID_STATUS, MAINTENANCE_TASK_STATUS } from "@mahalaxmi/core/types/domain";
import { QUEUE_NAMES } from "../../common/queue/queue.constants";
import { SupabaseAdminService } from "../../common/supabase/supabase-admin.service";
import { NotificationsService } from "../notifications/notifications.service";
import { TASK_ASSIGNMENT_MONITOR_JOB } from "./maintenance.service";

type TaskMonitorPayload = {
  taskId: string;
  tenantId: string;
  acceptedBidId: string;
  assignedHandymanId: string;
};

@Injectable()
export class TaskMonitorWorker implements OnModuleDestroy {
  private readonly logger = new Logger(TaskMonitorWorker.name);
  private readonly worker?: Worker;

  constructor(
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly notificationsService: NotificationsService
  ) {
    if (process.env.DISABLE_QUEUES === "true" || !process.env.REDIS_URL) {
      this.logger.log("Maintenance task monitor worker is disabled.");
      return;
    }

    this.worker = new Worker(
      QUEUE_NAMES.maintenanceTasks,
      async (job) => this.handle(job as Job<TaskMonitorPayload>),
      {
        connection: {
          url: process.env.REDIS_URL
        }
      }
    );
  }

  private async handle(job: Job<TaskMonitorPayload>) {
    if (job.name !== TASK_ASSIGNMENT_MONITOR_JOB) {
      return;
    }

    const { taskId, tenantId, acceptedBidId, assignedHandymanId } = job.data;
    const client = this.supabaseAdmin.getClient();

    const taskResult = await client
      .from("tasks")
      .select("id, tenant_id, status, assigned_handyman_id")
      .eq("id", taskId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (taskResult.error) {
      throw new Error(taskResult.error.message);
    }

    if (!taskResult.data) {
      this.logger.warn(`Task ${taskId} no longer exists; skipping assignment monitor.`);
      return;
    }

    if (taskResult.data.status !== MAINTENANCE_TASK_STATUS.ASSIGNED) {
      return;
    }

    const resetTask = await client
      .from("tasks")
      .update({
        status: MAINTENANCE_TASK_STATUS.OPEN,
        assigned_handyman_id: null,
        assignment_deadline: null
      })
      .eq("id", taskId)
      .eq("tenant_id", tenantId)
      .eq("status", MAINTENANCE_TASK_STATUS.ASSIGNED);

    if (resetTask.error) {
      throw new Error(resetTask.error.message);
    }

    const expireAcceptedBid = await client
      .from("bids")
      .update({ status: BID_STATUS.EXPIRED })
      .eq("id", acceptedBidId)
      .eq("task_id", taskId)
      .eq("status", BID_STATUS.ACCEPTED);

    if (expireAcceptedBid.error) {
      throw new Error(expireAcceptedBid.error.message);
    }

    const priorBidders = await client
      .from("bids")
      .select("handyman_id")
      .eq("task_id", taskId)
      .neq("handyman_id", assignedHandymanId);

    if (priorBidders.error) {
      throw new Error(priorBidders.error.message);
    }

    const userIds = [...new Set((priorBidders.data ?? []).map((row) => row.handyman_id).filter(Boolean))];

    await this.notificationsService.createBulkNotifications({
      tenantId,
      userIds,
      title: "Task reopened for bidding",
      body: "A previously assigned handyman did not start work in time. You can bid on this task again.",
      type: "general",
      data: {
        taskId,
        reopenedFromBidId: acceptedBidId,
        status: MAINTENANCE_TASK_STATUS.OPEN
      }
    });
  }

  async onModuleDestroy() {
    if (this.worker) {
      await this.worker.close();
    }
  }
}
