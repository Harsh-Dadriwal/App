import { BadRequestException, ForbiddenException, Injectable, Logger } from "@nestjs/common";
import { SupabaseAdminService } from "../../common/supabase/supabase-admin.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { TenantAccessService } from "../../common/tenancy/tenant-access.service";
import type { RequestActor } from "../../common/auth/auth.types";

@Injectable()
export class WorkflowsService {
  private readonly logger = new Logger(WorkflowsService.name);

  constructor(
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly tenantAccess: TenantAccessService,
    private readonly domainEvents: DomainEventsService
  ) {}

  private async rpc(accessToken: string, functionName: string, args: Record<string, unknown>) {
    const result = await (this.supabaseAdmin.createUserClient(accessToken) as any).rpc(functionName, args);

    if (result.error) {
      throw new BadRequestException(result.error.message);
    }

    return result.data ?? {};
  }

  private async publishEvent(eventName: string, payload: Record<string, unknown>) {
    try {
      await this.domainEvents.publish(eventName, payload);
    } catch (error) {
      this.logger.warn(
        `Workflow event publish failed for ${eventName}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  async approveOrderItemByCustomer(actor: RequestActor, accessToken: string, args: Record<string, unknown>) {
    await this.tenantAccess.assertOrderItemAccess(actor, String(args.target_order_item_id));
    const data = await this.rpc(accessToken, "approve_order_item_by_customer", args);
    await this.publishEvent("workflow.order_item.customer_decision.completed", {
      actorUserId: actor.appUserId,
      targetOrderItemId: args.target_order_item_id,
      approve: args.approve,
      noteText: args.note_text ?? null
    });
    return data;
  }

  async respondToSubstitute(actor: RequestActor, accessToken: string, args: Record<string, unknown>) {
    await this.tenantAccess.assertSubstituteSuggestionAccess(actor, String(args.suggestion_id));
    const data = await this.rpc(accessToken, "respond_to_substitute", args);
    await this.publishEvent("workflow.substitute.response.completed", {
      actorUserId: actor.appUserId,
      suggestionId: args.suggestion_id,
      acceptChoice: args.accept_choice
    });
    return data;
  }

  async reviewOrderItemByArchitect(actor: RequestActor, accessToken: string, args: Record<string, unknown>) {
    await this.tenantAccess.assertOrderItemAccess(actor, String(args.target_order_item_id));
    const data = await this.rpc(accessToken, "review_order_item_by_architect", args);
    await this.publishEvent("workflow.order_item.architect_review.completed", {
      actorUserId: actor.appUserId,
      targetOrderItemId: args.target_order_item_id,
      approve: args.approve,
      noteText: args.note_text ?? null
    });
    return data;
  }

  async transitionSiteOrder(actor: RequestActor, accessToken: string, args: Record<string, unknown>) {
    await this.tenantAccess.assertSiteOrderAccess(actor, String(args.target_site_order_id));
    const data = await this.rpc(accessToken, "transition_site_order", args);
    await this.publishEvent("workflow.site_order.transition.completed", {
      actorUserId: actor.appUserId,
      targetSiteOrderId: args.target_site_order_id,
      transitionKey: args.target_transition_key,
      noteText: args.note_text ?? null
    });
    return data;
  }

  async markOrderItemSupplied(actor: RequestActor, accessToken: string, args: Record<string, unknown>) {
    await this.tenantAccess.assertOrderItemAccess(actor, String(args.target_order_item_id));
    const data = await this.rpc(accessToken, "mark_order_item_supplied", args);
    await this.publishEvent("workflow.order_item.supply.completed", {
      actorUserId: actor.appUserId,
      targetOrderItemId: args.target_order_item_id,
      suppliedQty: args.supplied_qty,
      noteText: args.note_text ?? null
    });
    return data;
  }

  async suggestSubstituteItem(actor: RequestActor, accessToken: string, args: Record<string, unknown>) {
    await this.tenantAccess.assertOrderItemAccess(actor, String(args.original_item_id));
    const data = await this.rpc(accessToken, "suggest_substitute_item", args);
    await this.publishEvent("workflow.substitute.suggested", {
      actorUserId: actor.appUserId,
      originalItemId: args.original_item_id,
      suggestedProduct: args.suggested_product,
      reasonText: args.reason_text ?? null
    });
    return data;
  }

  async verifyProfessionalUser(actor: RequestActor, accessToken: string, args: Record<string, unknown>) {
    if (actor.role !== "admin") {
      throw new ForbiddenException("Only admin users can verify professionals.");
    }

    const data = await this.rpc(accessToken, "verify_professional_user", args);
    await this.publishEvent("workflow.user_verification.completed", {
      actorUserId: actor.appUserId,
      targetUserId: args.target_user_id,
      approve: args.approve,
      adminNote: args.admin_note ?? null
    });
    return data;
  }
}
