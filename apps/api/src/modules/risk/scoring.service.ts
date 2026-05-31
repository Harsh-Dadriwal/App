import { Injectable, BadRequestException } from "@nestjs/common";
import { SupabaseAdminService } from "../../common/supabase/supabase-admin.service";
import { TenantAccessService } from "../../common/tenancy/tenant-access.service";
import type { RequestActor } from "../../common/auth/auth.types";

@Injectable()
export class ScoringService {
  constructor(
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly tenantAccess: TenantAccessService
  ) {}

  async getRiskProfile(actor: RequestActor, contractorId: string) {
    const client = this.supabaseAdmin.getClient();
    const { data: profile, error } = await client
      .from("contractor_risk_profiles")
      .select("*")
      .eq("user_id", contractorId)
      .maybeSingle();

    if (error) {
      throw new BadRequestException(error.message);
    }

    if (profile) {
      await this.tenantAccess.assertTenantAccess(actor, profile.tenant_id);
    }

    return profile;
  }

  async recalculateRiskScore(actor: RequestActor, tenantId: string, contractorId: string) {
    await this.tenantAccess.assertTenantAccess(actor, tenantId);

    const client = this.supabaseAdmin.getClient();

    // 1. Gather outstanding schedules, disputes, and other metrics
    const [repaymentsResult, disputesResult] = await Promise.all([
      client
        .from("repayment_schedules")
        .select("status, principal_due, amount_paid")
        .eq("contractor_id", contractorId),
      client
        .from("escrow_accounts")
        .select("disputed_amount")
        .eq("customer_id", contractorId)
    ]);

    const repaymentSchedules = repaymentsResult.data ?? [];
    const disputes = disputesResult.data ?? [];

    // Calculate metrics
    const totalPayments = repaymentSchedules.length;
    const paidPayments = repaymentSchedules.filter(s => s.status === "paid").length;
    const overduePayments = repaymentSchedules.filter(s => s.status === "late").length;

    let repaymentConsistency = 100.00;
    if (totalPayments > 0) {
      repaymentConsistency = Number(((paidPayments / totalPayments) * 100).toFixed(2));
    }

    const disputeCount = disputes.filter(d => Number(d.disputed_amount) > 0).length;

    // Trust score algorithm
    let trustScore = 70.00; // Base starting score
    trustScore += (paidPayments * 2.5); // Reward payments
    trustScore -= (overduePayments * 15.0); // Penalize overdue
    trustScore -= (disputeCount * 10.0); // Penalize disputes

    // Bound trust score
    trustScore = Math.max(0, Math.min(100, trustScore));

    // Determine Risk Band
    let riskBand: "LOW" | "MODERATE" | "HIGH" | "BLOCKED" = "MODERATE";
    if (overduePayments > 0 || trustScore < 20) {
      riskBand = "BLOCKED";
    } else if (trustScore > 75) {
      riskBand = "LOW";
    } else if (trustScore > 40) {
      riskBand = "MODERATE";
    } else {
      riskBand = "HIGH";
    }

    // Default probability mapping
    const defaultProbability = Number(((100 - trustScore) / 100).toFixed(4));

    // Get active outstanding credit amount
    const outstandingCredit = repaymentSchedules
      .filter(s => s.status !== "paid" && s.status !== "cancelled")
      .reduce((sum, s) => sum + (Number(s.principal_due) - Number(s.amount_paid)), 0);

    // 2. Update Risk Profile
    const { data: updatedProfile, error: saveError } = await client
      .from("contractor_risk_profiles")
      .upsert({
        tenant_id: tenantId,
        user_id: contractorId,
        trust_score: trustScore,
        outstanding_credit: outstandingCredit,
        payment_history_score: repaymentConsistency,
        repayment_consistency: repaymentConsistency,
        dispute_count: disputeCount,
        project_completion_score: 90.00, // mock base value
        risk_band: riskBand,
        default_probability: defaultProbability,
        updated_at: new Date().toISOString()
      }, { onConflict: "user_id" })
      .select()
      .single();

    if (saveError) {
      throw new BadRequestException(saveError.message);
    }

    return updatedProfile;
  }
}
