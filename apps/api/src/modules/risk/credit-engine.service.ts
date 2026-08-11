import { Injectable, BadRequestException, Inject, forwardRef } from "@nestjs/common";
import { SupabaseAdminService } from "../../common/supabase/supabase-admin.service";
import { NotificationsService } from "../notifications/notifications.service";
import { DomainEventsService } from "../../common/events/domain-events.service";

@Injectable()
export class CreditEngineService {
  constructor(
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly domainEvents: DomainEventsService,
    @Inject(forwardRef(() => NotificationsService))
    private readonly notificationsService: NotificationsService
  ) {}

  /**
   * Predicts the payment risk for a contractor based on payment delay, utilization, and active projects.
   */
  predictPaymentRisk(metrics: {
    averagePaymentDelayDays: number;
    utilization: number;
    projectStage: string;
    latePaymentCount: number;
    invoiceAmount: number;
    overdueCount: number;
  }): "low risk" | "medium risk" | "high risk" | "default risk" {
    if (metrics.overdueCount > 0 && metrics.averagePaymentDelayDays > 30) {
      return "default risk";
    }
    if (metrics.latePaymentCount > 2 || metrics.averagePaymentDelayDays > 15) {
      return "high risk";
    }
    if (
      metrics.utilization > 0.8 ||
      metrics.averagePaymentDelayDays > 7 ||
      ["on_hold", "cancelled"].includes(metrics.projectStage)
    ) {
      return "medium risk";
    }
    return "low risk";
  }

  /**
   * Calculates the risk score (0-100) based on weighted parameters.
   */
  calculateRiskScore(metrics: {
    onTimePaymentPercentage: number;
    averagePaymentDelayDays: number;
    overdueInvoicesCount: number;
    bouncedPaymentCount: number;
    activeProjectValue: number;
    completedProjectsCount: number;
    outstandingAmount: number;
    creditLimit: number;
    gstVerified: boolean;
    panVerified: boolean;
    businessAgeMonths: number;
    disputeCount: number;
  }) {
    // 1. Payment behavior (35%)
    const onTimeScore = metrics.onTimePaymentPercentage;
    const delayPenalty = Math.max(0, 100 - metrics.averagePaymentDelayDays * 4);
    const overduePenalty = Math.max(0, 100 - metrics.overdueInvoicesCount * 20);
    const bouncedPenalty = Math.max(0, 100 - metrics.bouncedPaymentCount * 25);
    const paymentScore = Math.round(
      onTimeScore * 0.4 + delayPenalty * 0.2 + overduePenalty * 0.2 + bouncedPenalty * 0.2
    );

    // 2. Project activity (20%)
    const completedScore = Math.min(100, metrics.completedProjectsCount * 15);
    const activeValueScore = Math.min(100, metrics.activeProjectValue / 50000);
    const projectScore = Math.round(completedScore * 0.5 + activeValueScore * 0.5);

    // 3. Outstanding exposure (15%)
    const utilization =
      metrics.creditLimit > 0 ? metrics.outstandingAmount / metrics.creditLimit : 0;
    const exposureScore = Math.round(Math.max(0, (1 - utilization) * 100));

    // 4. Business verification (10%)
    const gstPoints = metrics.gstVerified ? 50 : 0;
    const panPoints = metrics.panVerified ? 30 : 0;
    const agePoints = Math.min(20, metrics.businessAgeMonths * 0.5);
    const verificationScore = gstPoints + panPoints + agePoints;

    // 5. Architect and supplier references (10%) - Future references module
    const referenceScore = 80;

    // 6. Project completion behavior (10%)
    const completionScore = Math.max(0, 100 - metrics.disputeCount * 25);

    // Dynamic total risk score calculation
    const finalScore = Math.round(
      paymentScore * 0.35 +
        projectScore * 0.2 +
        exposureScore * 0.15 +
        verificationScore * 0.1 +
        referenceScore * 0.1 +
        completionScore * 0.1
    );

    return {
      finalScore: Math.max(0, Math.min(100, finalScore)),
      paymentScore,
      projectScore,
      exposureScore,
      verificationScore,
      completionScore,
      referenceScore
    };
  }

  /**
   * Retrieves the risk-score based credit limit cap.
   */
  getCreditLimitCap(score: number): number {
    if (score >= 80) return 1000000;
    if (score >= 70) return 500000;
    if (score >= 60) return 300000;
    if (score >= 50) return 150000;
    if (score >= 40) return 50000;
    return 0;
  }

  /**
   * Calculates the dynamic credit limit.
   */
  calculateCreditLimit(
    annualPurchaseVolume: number,
    activeProjectValue: number,
    riskScore: number
  ): number {
    const riskCap = this.getCreditLimitCap(riskScore);
    // Baseline defaults for new contractors to prevent limit from dropping to 0
    const annualVal = annualPurchaseVolume > 0 ? annualPurchaseVolume : 500000;
    const activeVal = activeProjectValue > 0 ? activeProjectValue : 1000000;

    return Math.min(
      Math.round(0.2 * annualVal),
      Math.round(0.1 * activeVal),
      riskCap
    );
  }

  /**
   * Map score to credit status.
   */
  getCreditStatus(score: number): "green" | "yellow" | "orange" | "red" {
    if (score >= 80) return "green";
    if (score >= 60) return "yellow";
    if (score >= 40) return "orange";
    return "red";
  }

  /**
   * Aggregates contractor data, recalculates profiles, scores, limits, and updates tables.
   */
  async updateCreditProfile(contractorId: string, performedBy = "system", notes?: string) {
    const client = this.supabaseAdmin.getClient();

    // 1. Fetch user/contractor details
    const { data: user, error: userError } = await client
      .from("users")
      .select("id, created_at, gst_number, default_tenant_id")
      .eq("id", contractorId)
      .maybeSingle();

    if (userError || !user) {
      throw new BadRequestException("Contractor user profile not found.");
    }

    const tenantId = user.default_tenant_id || "00000000-0000-0000-0000-000000000000";

    // 2. Fetch existing contractor and credit profile records
    const [{ data: existingContractor }, { data: existingProfile }] = await Promise.all([
      client.from("contractors").select("*").eq("id", contractorId).maybeSingle(),
      client.from("credit_profiles").select("*").eq("contractor_id", contractorId).maybeSingle()
    ]);

    // 3. Query all projects
    const { data: projects } = await client
      .from("projects")
      .select("id, status, project_value")
      .or(`customer_id.eq.${contractorId},created_by.eq.${contractorId}`);

    const activeProjectValue = (projects ?? [])
      .filter((p) => p.status !== "completed" && p.status !== "cancelled")
      .reduce((sum, p) => sum + Number(p.project_value || 0), 0);

    const completedProjectsCount = (projects ?? []).filter((p) => p.status === "completed").length;

    // 4. Query invoices and payments
    const { data: invoices } = await client
      .from("invoices")
      .select("*")
      .eq("contractor_id", contractorId);

    const now = new Date();
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(now.getMonth() - 12);

    let annualPurchaseVolume = 0;
    let outstandingAmount = 0;
    let overdueInvoicesCount = 0;
    let totalInvoices = 0;
    let paidInvoicesCount = 0;
    let totalDelayDays = 0;
    let latePaymentCount = 0;
    let maxDelayDays = 0;

    if (invoices && invoices.length > 0) {
      totalInvoices = invoices.length;
      for (const invoice of invoices) {
        const invAmount = Number(invoice.invoice_amount || 0);
        const invoiceCreatedAt = new Date(invoice.created_at);

        if (invoiceCreatedAt >= twelveMonthsAgo) {
          annualPurchaseVolume += invAmount;
        }

        if (invoice.payment_status !== "paid") {
          outstandingAmount += invAmount;
          const dueDate = new Date(invoice.due_date);
          if (dueDate < now) {
            overdueInvoicesCount++;
          }
        } else {
          paidInvoicesCount++;
          const delay = Number(invoice.days_late || 0);
          totalDelayDays += delay;
          if (delay > 0) {
            latePaymentCount++;
          }
          if (delay > maxDelayDays) {
            maxDelayDays = delay;
          }
        }
      }
    }

    const averagePaymentDelayDays = paidInvoicesCount > 0 ? totalDelayDays / paidInvoicesCount : 0;
    const onTimePaymentPercentage =
      totalInvoices > 0 ? ((totalInvoices - latePaymentCount) / totalInvoices) * 100 : 100;

    // 5. Query disputes from escrow or other areas
    const { data: disputes } = await client
      .from("escrow_accounts")
      .select("disputed_amount")
      .eq("customer_id", contractorId);
    const disputeCount = (disputes ?? []).filter((d) => Number(d.disputed_amount) > 0).length;

    // Business age calculation
    const userCreatedAt = new Date(user.created_at);
    const businessAgeMonths = Math.max(
      1,
      (now.getFullYear() - userCreatedAt.getFullYear()) * 12 +
        now.getMonth() -
        userCreatedAt.getMonth()
    );

    const gstVerified = Boolean(user.gst_number);
    const panVerified = existingProfile?.pan_verified || false;
    const bouncedPaymentCount = existingProfile?.bounced_payment_count || 0;

    // 6. Calculate risk score
    const existingLimit = existingContractor?.credit_limit || 0;
    const scoreResult = this.calculateRiskScore({
      onTimePaymentPercentage,
      averagePaymentDelayDays,
      overdueInvoicesCount,
      bouncedPaymentCount,
      activeProjectValue,
      completedProjectsCount,
      outstandingAmount,
      creditLimit: Number(existingLimit),
      gstVerified,
      panVerified,
      businessAgeMonths,
      disputeCount
    });

    // 7. Calculate Credit Limit & Available credit
    const nextLimit = this.calculateCreditLimit(
      annualPurchaseVolume,
      activeProjectValue,
      scoreResult.finalScore
    );
    const nextAvailable = Math.max(0, nextLimit - outstandingAmount);
    const nextStatus = this.getCreditStatus(scoreResult.finalScore);

    // Check for delinquency freeze trigger: if any unpaid invoice is overdue > 30 days
    let autoFreeze = existingContractor?.is_frozen || false;
    if (invoices) {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(now.getDate() - 30);
      const criticallyOverdue = invoices.some(
        (inv) =>
          inv.payment_status !== "paid" &&
          new Date(inv.due_date) < thirtyDaysAgo
      );
      if (criticallyOverdue && !autoFreeze) {
        autoFreeze = true;
      }
    }

    // 8. Upsert Credit Profile metrics
    const { error: profileUpsertError } = await client
      .from("credit_profiles")
      .upsert(
        {
          contractor_id: contractorId,
          annual_purchase_volume: annualPurchaseVolume,
          active_project_value: activeProjectValue,
          outstanding_amount: outstandingAmount,
          average_payment_delay_days: averagePaymentDelayDays,
          on_time_payment_percentage: onTimePaymentPercentage,
          bounced_payment_count: bouncedPaymentCount,
          completed_projects: completedProjectsCount,
          late_payment_count: latePaymentCount,
          total_invoices: totalInvoices,
          total_payments: paidInvoicesCount,
          business_age_months: businessAgeMonths,
          gst_verified: gstVerified,
          pan_verified: panVerified,
          updated_at: new Date().toISOString()
        },
        { onConflict: "contractor_id" }
      );

    if (profileUpsertError) {
      throw new Error(`Failed to update credit profile: ${profileUpsertError.message}`);
    }

    // 9. Upsert Contractor credit summary
    const previousScore = existingContractor?.risk_score || 100;
    const previousLimit = existingContractor?.credit_limit || 0;
    const creditVersion = (existingContractor?.credit_version || 1) + 1;

    const { error: contractorUpsertError } = await client
      .from("contractors")
      .upsert(
        {
          id: contractorId,
          credit_limit: nextLimit,
          available_credit: nextAvailable,
          risk_score: scoreResult.finalScore,
          credit_status: nextStatus,
          is_frozen: autoFreeze,
          credit_version: creditVersion,
          last_credit_review: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        { onConflict: "id" }
      );

    if (contractorUpsertError) {
      throw new Error(`Failed to update contractor summary: ${contractorUpsertError.message}`);
    }

    // 10. Record detailed score historical log
    await client.from("credit_scores").insert({
      contractor_id: contractorId,
      score: scoreResult.finalScore,
      payment_score: scoreResult.paymentScore,
      project_score: scoreResult.projectScore,
      exposure_score: scoreResult.exposureScore,
      verification_score: scoreResult.verificationScore,
      completion_score: scoreResult.completionScore,
      final_credit_limit: nextLimit,
      decision: autoFreeze ? "frozen" : nextStatus === "red" ? "rejected" : "approved",
      reason: notes || `Auto-calculated score: ${scoreResult.finalScore}`
    });

    // 11. Log to credit_audit_logs if change in score or limit
    if (previousScore !== scoreResult.finalScore || Number(previousLimit) !== nextLimit) {
      await client.from("credit_audit_logs").insert({
        contractor_id: contractorId,
        previous_score: previousScore,
        new_score: scoreResult.finalScore,
        previous_limit: previousLimit,
        new_limit: nextLimit,
        triggering_event: performedBy === "system" ? "auto_recalculation" : "manual_review",
        performed_by: performedBy,
        notes: notes || `Credit update triggered by ${performedBy}`
      });

      // 12. Send notifications on limits changes
      if (nextLimit > Number(previousLimit)) {
        await this.notificationsService.createBulkNotifications({
          tenantId,
          userIds: [contractorId],
          title: "Credit Limit Increased",
          body: `Congratulations! Your credit limit has been increased to ₹${nextLimit.toLocaleString(
            "en-IN"
          )}.`,
          type: "credit"
        });
      }

      await this.notificationsService.createBulkNotifications({
        tenantId,
        userIds: [contractorId],
        title: "Credit Score Updated",
        body: `Your credit risk score was recalculated to ${scoreResult.finalScore} (${nextStatus.toUpperCase()}).`,
        type: "credit"
      });
    }

    // Freeze notification trigger
    if (autoFreeze && !existingContractor?.is_frozen) {
      await this.notificationsService.createBulkNotifications({
        tenantId,
        userIds: [contractorId],
        title: "Credit Line Frozen",
        body: `Your credit facility has been frozen due to overdue invoices. Please settle outstanding dues immediately.`,
        type: "credit"
      });
    }

    // 80% Credit Utilization trigger check
    const newUtilization = nextLimit > 0 ? outstandingAmount / nextLimit : 0;
    if (newUtilization >= 0.8 && (existingLimit > 0 ? (existingContractor?.available_credit || 0) / existingLimit > 0.2 : true)) {
      await this.notificationsService.createBulkNotifications({
        tenantId,
        userIds: [contractorId],
        title: "High Credit Utilization Alert",
        body: `Warning: You have utilized ${Math.round(
          newUtilization * 100
        )}% of your available credit line.`,
        type: "credit"
      });
    }

    // Publish domain event
    await this.domainEvents.publish("credit.profile.updated", {
      contractorId,
      score: scoreResult.finalScore,
      limit: nextLimit,
      available: nextAvailable,
      status: nextStatus
    });

    return {
      contractorId,
      score: scoreResult.finalScore,
      limit: nextLimit,
      available: nextAvailable,
      status: nextStatus,
      isFrozen: autoFreeze
    };
  }

  /**
   * Process manual review/override from a finance admin.
   */
  async processManualReview(
    actorEmail: string,
    contractorId: string,
    action: "increase_limit" | "decrease_limit" | "freeze_credit" | "unfreeze_credit",
    amount?: number,
    notes?: string
  ) {
    const client = this.supabaseAdmin.getClient();

    // Fetch existing contractor record
    const { data: contractor, error: fetchErr } = await client
      .from("contractors")
      .select("*")
      .eq("id", contractorId)
      .maybeSingle();

    if (fetchErr || !contractor) {
      throw new BadRequestException("Contractor record not found.");
    }

    const prevLimit = Number(contractor.credit_limit || 0);
    const prevAvailable = Number(contractor.available_credit || 0);
    let nextLimit = prevLimit;
    let nextAvailable = prevAvailable;
    let nextFrozen = contractor.is_frozen;

    if (action === "increase_limit") {
      if (!amount || amount <= 0) throw new BadRequestException("Invalid increase amount.");
      nextLimit = prevLimit + amount;
      nextAvailable = prevAvailable + amount;
    } else if (action === "decrease_limit") {
      if (!amount || amount <= 0) throw new BadRequestException("Invalid decrease amount.");
      nextLimit = Math.max(0, prevLimit - amount);
      nextAvailable = Math.max(0, prevAvailable - amount);
    } else if (action === "freeze_credit") {
      nextFrozen = true;
    } else if (action === "unfreeze_credit") {
      nextFrozen = false;
    }

    // Update contractor details
    const { error: updateErr } = await client
      .from("contractors")
      .update({
        credit_limit: nextLimit,
        available_credit: nextAvailable,
        is_frozen: nextFrozen,
        last_credit_review: new Date().toISOString(),
        credit_version: (contractor.credit_version || 1) + 1,
        updated_at: new Date().toISOString()
      })
      .eq("id", contractorId);

    if (updateErr) {
      throw new Error(`Failed manual review update: ${updateErr.message}`);
    }

    // Create Audit Log entry
    await client.from("credit_audit_logs").insert({
      contractor_id: contractorId,
      previous_score: contractor.risk_score,
      new_score: contractor.risk_score,
      previous_limit: prevLimit,
      new_limit: nextLimit,
      triggering_event: `manual_${action}`,
      performed_by: actorEmail,
      notes: notes || `Manual action: ${action} processed by admin.`
    });

    // Send notification
    const { data: user } = await client
      .from("users")
      .select("default_tenant_id")
      .eq("id", contractorId)
      .maybeSingle();

    const tenantId = user?.default_tenant_id || "00000000-0000-0000-0000-000000000000";

    await this.notificationsService.createBulkNotifications({
      tenantId,
      userIds: [contractorId],
      title: action.replace("_", " ").toUpperCase(),
      body: `Your credit facility has been updated: ${action.replace("_", " ")} by administrative review.`,
      type: "credit"
    });

    return {
      contractorId,
      limit: nextLimit,
      available: nextAvailable,
      isFrozen: nextFrozen
    };
  }

  /**
   * Evaluates if a proposed order is approved or rejected based on available credit.
   */
  async approveOrder(contractorId: string, orderAmount: number) {
    const client = this.supabaseAdmin.getClient();

    // Get current contractor info
    const { data: contractor, error: fetchErr } = await client
      .from("contractors")
      .select("credit_limit, available_credit, credit_status, is_frozen")
      .eq("id", contractorId)
      .maybeSingle();

    if (fetchErr || !contractor) {
      return {
        decision: "rejected",
        approvedAmount: 0,
        advanceRequired: orderAmount,
        reason: "Contractor credit profile not found."
      };
    }

    const availableCredit = Number(contractor.available_credit || 0);
    const creditStatus = contractor.credit_status;
    const isFrozen = contractor.is_frozen;

    // Rule 1: Frozen account
    if (isFrozen) {
      return {
        decision: "rejected",
        approvedAmount: 0,
        advanceRequired: orderAmount,
        reason: "Credit facility is frozen."
      };
    }

    // Rule 2: Red status (Score < 40)
    if (creditStatus === "red") {
      return {
        decision: "rejected",
        approvedAmount: 0,
        advanceRequired: orderAmount,
        reason: "Credit status is Red. Advance payment only."
      };
    }

    // Fetch overdue invoices check
    const { data: invoices } = await client
      .from("invoices")
      .select("due_date")
      .eq("contractor_id", contractorId)
      .not("payment_status", "eq", "paid");

    const now = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(now.getDate() - 30);

    const criticallyOverdue = (invoices ?? []).some(
      (inv) => new Date(inv.due_date) < thirtyDaysAgo
    );

    // Rule 3: Critically overdue invoices (>30 days)
    if (criticallyOverdue) {
      // Freeze contractor account automatically
      await client.from("contractors").update({ is_frozen: true }).eq("id", contractorId);
      return {
        decision: "rejected",
        approvedAmount: 0,
        advanceRequired: orderAmount,
        reason: "Credit frozen due to invoices critically overdue by > 30 days."
      };
    }

    // Rule 4: Order amount exceeds available credit limit
    if (orderAmount > availableCredit) {
      const approvedAmount = availableCredit;
      const advanceRequired = orderAmount - availableCredit;
      return {
        decision: "approved_with_partial_advance",
        approvedAmount,
        advanceRequired,
        reason: "Order amount exceeds available credit line."
      };
    }

    // Rule 5: Credit Status Orange (40-59) - require partial advance
    if (creditStatus === "orange") {
      const advanceRequired = Math.round(orderAmount * 0.3); // 30% advance required
      const approvedAmount = orderAmount - advanceRequired;
      return {
        decision: "approved_with_partial_advance",
        approvedAmount,
        advanceRequired,
        reason: "Credit status is Orange (Project-linked). 30% advance payment required."
      };
    }

    // Rule 6: High utilization alert (utilization > 80%)
    const limit = Number(contractor.credit_limit || 0);
    const outstanding = limit - availableCredit;
    const utilization = limit > 0 ? outstanding / limit : 0;
    if (utilization >= 0.8) {
      const advanceRequired = Math.round(orderAmount * 0.2); // 20% advance required
      const approvedAmount = orderAmount - advanceRequired;
      return {
        decision: "approved_with_partial_advance",
        approvedAmount,
        advanceRequired,
        reason: "Credit utilization exceeds 80%. 20% advance required."
      };
    }

    // Rule 7: Full approval
    return {
      decision: "approved",
      approvedAmount: orderAmount,
      advanceRequired: 0,
      reason: "Order verified and approved under active credit terms."
    };
  }

  /**
   * Recalculates all contractors.
   */
  async recalculateAllContractors() {
    const client = this.supabaseAdmin.getClient();
    const { data: users, error } = await client
      .from("users")
      .select("id")
      .or(`role.eq.customer,role.eq.electrician`); // Recalculate customers/electricians acting as contractors

    if (error || !users) {
      throw new Error(`Failed to list contractors: ${error?.message}`);
    }

    const results = [];
    for (const u of users) {
      try {
        const res = await this.updateCreditProfile(u.id, "system", "Periodic system-wide credit recalculation.");
        results.push({ id: u.id, status: "success", res });
      } catch (err: any) {
        results.push({ id: u.id, status: "error", error: err.message });
      }
    }

    return results;
  }
}
