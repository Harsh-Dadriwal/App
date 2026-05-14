import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException
} from "@nestjs/common";
import {
  BID_STATUS,
  HANDYMAN_SERVICE_ROLES,
  MAINTENANCE_TASK_STATUS,
  type AppRole,
  type HandymanServiceRole
} from "@mahalaxmi/core/types/domain";
import type { AcceptTaskBidRequestDto, SubmitTaskBidRequestDto } from "@mahalaxmi/core/types/contracts";
import type { RequestActor } from "../../common/auth/auth.types";
import { QUEUE_NAMES } from "../../common/queue/queue.constants";
import { QueueService } from "../../common/queue/queue.service";
import { SupabaseAdminService } from "../../common/supabase/supabase-admin.service";
import { TenantAccessService } from "../../common/tenancy/tenant-access.service";
import { NotificationsService } from "../notifications/notifications.service";

const ASSIGNMENT_MONITOR_MS = 48 * 60 * 60 * 1000;
export const TASK_ASSIGNMENT_MONITOR_JOB = "maintenance-task-assignment-monitor";

type MaintenanceTaskRow = {
  id: string;
  tenant_id: string;
  status: string;
  category: string | null;
  budget_range: number | null;
  max_budget: number | null;
  assigned_handyman_id: string | null;
};

function isHandymanRole(role: string | null): role is HandymanServiceRole {
  return Boolean(role && HANDYMAN_SERVICE_ROLES.includes(role as HandymanServiceRole));
}

@Injectable()
export class MaintenanceService {
  constructor(
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly tenantAccess: TenantAccessService,
    private readonly queueService: QueueService,
    private readonly notificationsService: NotificationsService
  ) {}

  private async getTaskForTenant(actor: RequestActor, taskId: string) {
    const baseTask = await this.tenantAccess.assertTaskAccess(actor, taskId);
    const result = await this.supabaseAdmin
      .getClient()
      .from("tasks")
      .select(
        "id, tenant_id, status, category, budget_range, max_budget, assigned_handyman_id, assignment_deadline"
      )
      .eq("id", taskId)
      .eq("tenant_id", baseTask.tenant_id)
      .maybeSingle();

    if (result.error) {
      throw new Error(result.error.message);
    }

    if (!result.data) {
      throw new ConflictException("Task not found.");
    }

    return result.data as MaintenanceTaskRow & { assignment_deadline?: string | null };
  }

  private assertArchitectOrCustomer(actor: RequestActor) {
    if (!actor.appUserId) {
      throw new UnauthorizedException("App profile not linked.");
    }

    if (!["architect", "customer"].includes(actor.role ?? "")) {
      throw new ForbiddenException("Only site architects or customers can accept bids.");
    }
  }

  private getTaskBudgetCeiling(task: MaintenanceTaskRow) {
    return task.max_budget ?? task.budget_range ?? null;
  }

  private buildAssignmentDeadline() {
    return new Date(Date.now() + ASSIGNMENT_MONITOR_MS).toISOString();
  }

  private async prepareFintechLedgerReleasePlaceholder(args: {
    taskId: string;
    acceptedBidId: string;
    amount: number;
    handymanId: string;
  }) {
    return {
      integration: "fintech-ledger",
      status: "pending_task_completion",
      taskId: args.taskId,
      acceptedBidId: args.acceptedBidId,
      amount: args.amount,
      handymanId: args.handymanId
    };
  }

  async submitBid(actor: RequestActor, taskId: string, body: SubmitTaskBidRequestDto) {
    if (!actor.appUserId) {
      throw new UnauthorizedException("App profile not linked.");
    }

    if (!isHandymanRole(actor.role)) {
      throw new ForbiddenException("Only approved handyman roles can submit bids.");
    }

    if (body.amount <= 0 || body.estimated_days <= 0) {
      throw new BadRequestException("Bid amount and estimated days must be greater than zero.");
    }

    const task = await this.getTaskForTenant(actor, taskId);

    if (task.status !== MAINTENANCE_TASK_STATUS.OPEN) {
      throw new ConflictException("This task is not open for bidding.");
    }

    if (!task.category || task.category !== actor.role) {
      throw new ForbiddenException("Your trade role does not match this task category.");
    }

    const budgetCeiling = this.getTaskBudgetCeiling(task);
    if (budgetCeiling !== null && body.amount > budgetCeiling) {
      throw new BadRequestException(`Bid amount exceeds the task ceiling of ${budgetCeiling}.`);
    }

    const existingBid = await this.supabaseAdmin
      .getClient()
      .from("bids")
      .select("id, status")
      .eq("task_id", task.id)
      .eq("handyman_id", actor.appUserId)
      .in("status", [BID_STATUS.PENDING, BID_STATUS.ACCEPTED])
      .maybeSingle();

    if (existingBid.error) {
      throw new Error(existingBid.error.message);
    }

    if (existingBid.data) {
      throw new ConflictException("You have already submitted an active bid for this task.");
    }

    const bidInsert = await this.supabaseAdmin
      .getClient()
      .from("bids")
      .insert({
        task_id: task.id,
        handyman_id: actor.appUserId,
        amount: body.amount,
        estimated_days: body.estimated_days,
        status: BID_STATUS.PENDING
      })
      .select("id, task_id, handyman_id, amount, estimated_days, status, created_at")
      .maybeSingle();

    if (bidInsert.error) {
      throw new Error(bidInsert.error.message);
    }

    return bidInsert.data;
  }

  async acceptBid(actor: RequestActor, taskId: string, body: AcceptTaskBidRequestDto) {
    this.assertArchitectOrCustomer(actor);

    const task = await this.getTaskForTenant(actor, taskId);

    if (![MAINTENANCE_TASK_STATUS.OPEN, MAINTENANCE_TASK_STATUS.BIDDING_CLOSED].includes(task.status as any)) {
      throw new ConflictException("Task is not in a state that allows accepting bids.");
    }

    const bidResult = await this.supabaseAdmin
      .getClient()
      .from("bids")
      .select("id, task_id, handyman_id, amount, estimated_days, status")
      .eq("id", body.bid_id)
      .eq("task_id", task.id)
      .maybeSingle();

    if (bidResult.error) {
      throw new Error(bidResult.error.message);
    }

    if (!bidResult.data) {
      throw new ConflictException("Selected bid was not found for this task.");
    }

    if (bidResult.data.status !== BID_STATUS.PENDING) {
      throw new ConflictException("Only pending bids can be accepted.");
    }

    const assignmentDeadline = this.buildAssignmentDeadline();
    const taskUpdate = await this.supabaseAdmin
      .getClient()
      .from("tasks")
      .update({
        status: MAINTENANCE_TASK_STATUS.ASSIGNED,
        assigned_handyman_id: bidResult.data.handyman_id,
        assignment_deadline: assignmentDeadline
      })
      .eq("id", task.id)
      .eq("tenant_id", task.tenant_id)
      .in("status", [MAINTENANCE_TASK_STATUS.OPEN, MAINTENANCE_TASK_STATUS.BIDDING_CLOSED])
      .select("id, tenant_id, status, assigned_handyman_id, assignment_deadline")
      .maybeSingle();

    if (taskUpdate.error) {
      throw new Error(taskUpdate.error.message);
    }

    if (!taskUpdate.data) {
      throw new ConflictException("Task was updated by another action before the bid could be accepted.");
    }

    const acceptResult = await this.supabaseAdmin
      .getClient()
      .from("bids")
      .update({ status: BID_STATUS.ACCEPTED })
      .eq("id", bidResult.data.id)
      .eq("task_id", task.id)
      .select("id")
      .maybeSingle();

    if (acceptResult.error) {
      throw new Error(acceptResult.error.message);
    }

    const rejectOthers = await this.supabaseAdmin
      .getClient()
      .from("bids")
      .update({ status: BID_STATUS.REJECTED })
      .eq("task_id", task.id)
      .neq("id", bidResult.data.id)
      .eq("status", BID_STATUS.PENDING);

    if (rejectOthers.error) {
      throw new Error(rejectOthers.error.message);
    }

    await this.queueService.enqueue(
      QUEUE_NAMES.maintenanceTasks,
      TASK_ASSIGNMENT_MONITOR_JOB,
      {
        taskId: task.id,
        tenantId: task.tenant_id,
        acceptedBidId: bidResult.data.id,
        assignedHandymanId: bidResult.data.handyman_id
      },
      {
        delay: ASSIGNMENT_MONITOR_MS,
        jobId: `${TASK_ASSIGNMENT_MONITOR_JOB}:${task.id}`,
        removeOnComplete: true,
        removeOnFail: 50
      }
    );

    const fintechSettlement = await this.prepareFintechLedgerReleasePlaceholder({
      taskId: task.id,
      acceptedBidId: bidResult.data.id,
      amount: Number(bidResult.data.amount),
      handymanId: bidResult.data.handyman_id
    });

    await this.notificationsService.createBulkNotifications({
      tenantId: task.tenant_id,
      userIds: [bidResult.data.handyman_id],
      title: "Task assigned",
      body: "Your bid has been accepted. Start work within 48 hours to keep the assignment.",
      type: "general",
      data: {
        taskId: task.id,
        bidId: bidResult.data.id,
        status: MAINTENANCE_TASK_STATUS.ASSIGNED,
        fintechSettlement
      }
    });

    return {
      taskId: task.id,
      acceptedBidId: bidResult.data.id,
      assignedHandymanId: bidResult.data.handyman_id,
      assignmentDeadline,
      fintechSettlement
    };
  }
}
