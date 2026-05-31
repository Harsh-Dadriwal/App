import { Injectable, BadRequestException, ForbiddenException } from "@nestjs/common";
import { SupabaseAdminService } from "../../common/supabase/supabase-admin.service";
import { TenantAccessService } from "../../common/tenancy/tenant-access.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import type { RequestActor } from "../../common/auth/auth.types";

@Injectable()
export class CreditService {
  constructor(
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly tenantAccess: TenantAccessService,
    private readonly domainEvents: DomainEventsService
  ) {}

  private getClient(accessToken?: string) {
    return accessToken
      ? this.supabaseAdmin.createUserClient(accessToken)
      : this.supabaseAdmin.getClient();
  }

  async submitRequest(
    actor: RequestActor,
    accessToken: string,
    dto: { tenantId: string; siteId: string; requestedAmount: number; purpose: string }
  ) {
    await this.tenantAccess.assertTenantAccess(actor, dto.tenantId);

    const client = this.getClient(accessToken);

    // 1. Fetch risk profile to perform initial auto-eval
    const { data: riskProfile } = await client
      .from("contractor_risk_profiles")
      .select("*")
      .eq("user_id", actor.appUserId)
      .maybeSingle();

    let initialStatus = "submitted";
    let autoReviewNotes = "";

    if (riskProfile) {
      if (riskProfile.risk_band === "BLOCKED") {
        initialStatus = "rejected";
        autoReviewNotes = "Auto-rejected: Contractor risk profile status is BLOCKED.";
      } else if (Number(riskProfile.trust_score) < 40) {
        initialStatus = "rejected";
        autoReviewNotes = "Auto-rejected: Trust score is below minimum threshold.";
      }
    }

    // 2. Insert Credit Request
    const { data: creditRequest, error } = await client
      .from("credit_requests")
      .insert({
        tenant_id: dto.tenantId,
        contractor_id: actor.appUserId,
        site_id: dto.siteId,
        requested_amount: dto.requestedAmount,
        purpose: dto.purpose,
        status: initialStatus === "rejected" ? "rejected" : "submitted",
        review_notes: autoReviewNotes || null,
        reviewed_at: initialStatus === "rejected" ? new Date().toISOString() : null
      })
      .select()
      .single();

    if (error) {
      throw new BadRequestException(error.message);
    }

    // 3. Emit Domain Event
    await this.domainEvents.publish("credit.request.submitted", {
      actorUserId: actor.appUserId,
      tenantId: dto.tenantId,
      requestId: creditRequest.id,
      requestedAmount: dto.requestedAmount,
      status: creditRequest.status
    });

    return creditRequest;
  }

  async processReview(
    actor: RequestActor,
    accessToken: string,
    requestId: string,
    dto: {
      status: "approved" | "rejected" | "under_review";
      approvedAmount?: number;
      advanceRequiredPercentage?: number;
      notes: string;
    }
  ) {
    const client = this.getClient(accessToken);

    // Check credit request details
    const { data: creditRequest, error: fetchError } = await client
      .from("credit_requests")
      .select("*")
      .eq("id", requestId)
      .maybeSingle();

    if (fetchError || !creditRequest) {
      throw new BadRequestException("Credit request not found.");
    }

    // Ensure actor is admin or has tenant admin access
    await this.tenantAccess.assertTenantAdmin(actor, creditRequest.tenant_id);

    // Update the request
    const { data: updatedRequest, error: updateError } = await client
      .from("credit_requests")
      .update({
        status: dto.status,
        approved_amount: dto.approvedAmount ?? null,
        advance_required_percentage: dto.advanceRequiredPercentage ?? 0,
        reviewer_id: actor.appUserId,
        review_notes: dto.notes,
        reviewed_at: new Date().toISOString()
      })
      .eq("id", requestId)
      .select()
      .single();

    if (updateError) {
      throw new BadRequestException(updateError.message);
    }

    // If approved, update active credit limits for the contractor
    if (dto.status === "approved" && dto.approvedAmount) {
      const { data: activeLimit } = await client
        .from("credit_limits")
        .select("*")
        .eq("contractor_id", creditRequest.contractor_id)
        .eq("is_active", true)
        .maybeSingle();

      if (activeLimit) {
        const newAllocated = Number(activeLimit.allocated_limit) + Number(dto.approvedAmount);
        const newAvailable = Number(activeLimit.available_limit) + Number(dto.approvedAmount);

        await client
          .from("credit_limits")
          .update({
            allocated_limit: newAllocated,
            available_limit: newAvailable
          })
          .eq("id", activeLimit.id);
      } else {
        await client.from("credit_limits").insert({
          tenant_id: creditRequest.tenant_id,
          contractor_id: creditRequest.contractor_id,
          allocated_limit: dto.approvedAmount,
          available_limit: dto.approvedAmount,
          utilized_amount: 0,
          is_active: true
        });
      }
    }

    // Emit event
    await this.domainEvents.publish("credit.request.reviewed", {
      actorUserId: actor.appUserId,
      requestId,
      status: dto.status,
      approvedAmount: dto.approvedAmount ?? null,
      reviewerId: actor.appUserId
    });

    return updatedRequest;
  }
}
