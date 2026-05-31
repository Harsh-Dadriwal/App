import { Injectable, BadRequestException } from "@nestjs/common";
import { SupabaseAdminService } from "../../common/supabase/supabase-admin.service";
import { TenantAccessService } from "../../common/tenancy/tenant-access.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import type { RequestActor } from "../../common/auth/auth.types";

@Injectable()
export class SubscriptionService {
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

  async upgradeContractorPlan(
    actor: RequestActor,
    accessToken: string,
    dto: { tenantId: string; planCode: string }
  ) {
    await this.tenantAccess.assertTenantAccess(actor, dto.tenantId);

    const client = this.getClient(accessToken);

    // 1. Fetch active subscription plan details
    const { data: plan, error: planError } = await client
      .from("contractor_subscription_plans")
      .select("*")
      .eq("tenant_id", dto.tenantId)
      .eq("code", dto.planCode)
      .eq("is_active", true)
      .maybeSingle();

    if (planError || !plan) {
      throw new BadRequestException("Active subscription plan not found.");
    }

    // 2. Perform Double-Entry Booking: Debit Customer Wallet Liability, Credit SaaS Subscription Revenue
    const { data: walletAccount } = await client
      .from("ledger_accounts")
      .select("id")
      .eq("account_number", "2000-WALLET-LIABILITY")
      .eq("user_id", actor.appUserId)
      .maybeSingle();

    const { data: revAccount } = await client
      .from("ledger_accounts")
      .select("id")
      .eq("account_number", "4030-REV-SUBSCRIPTION")
      .maybeSingle();

    const priceAmt = Number(plan.price_amount);

    if (walletAccount && revAccount && priceAmt > 0) {
      const { data: tx } = await client
        .from("ledger_transactions")
        .insert({
          tenant_id: dto.tenantId,
          reference_type: "SAAS_SUBSCRIPTION_PURCHASE",
          reference_id: plan.id,
          description: `Contractor plan upgraded to ${dto.planCode}`,
          status: "POSTED",
          created_by: actor.appUserId
        })
        .select()
        .single();

      if (tx) {
        // Debit Customer Wallet Liability
        await client.from("ledger_entries").insert({
          tenant_id: dto.tenantId,
          transaction_id: tx.id,
          account_id: walletAccount.id,
          direction: "DEBIT",
          amount: priceAmt
        });

        // Credit Platform Revenue Account
        await client.from("ledger_entries").insert({
          tenant_id: dto.tenantId,
          transaction_id: tx.id,
          account_id: revAccount.id,
          direction: "CREDIT",
          amount: priceAmt
        });
      }
    }

    // 3. Emit Domain Event
    await this.domainEvents.publish("monetization.subscription.upgraded", {
      actorUserId: actor.appUserId,
      tenantId: dto.tenantId,
      planCode: dto.planCode,
      userType: "contractor"
    });

    return { status: "success", planCode: dto.planCode };
  }

  async upgradeSupplierPlan(
    actor: RequestActor,
    accessToken: string,
    dto: { tenantId: string; planCode: string }
  ) {
    await this.tenantAccess.assertTenantAccess(actor, dto.tenantId);

    const client = this.getClient(accessToken);

    // 1. Fetch active subscription plan details
    const { data: plan, error: planError } = await client
      .from("supplier_subscription_plans")
      .select("*")
      .eq("tenant_id", dto.tenantId)
      .eq("code", dto.planCode)
      .eq("is_active", true)
      .maybeSingle();

    if (planError || !plan) {
      throw new BadRequestException("Active supplier premium plan not found.");
    }

    // 2. Perform Double-Entry Booking: Debit Supplier Wallet Liability (AP offset), Credit Supplier Listings Revenue
    const { data: walletAccount } = await client
      .from("ledger_accounts")
      .select("id")
      .eq("account_number", "2100-SUPPLIER-AP") // Debit Supplier accounts payable or their liability wallet
      .eq("user_id", actor.appUserId)
      .maybeSingle();

    const { data: revAccount } = await client
      .from("ledger_accounts")
      .select("id")
      .eq("account_number", "4040-REV-SUPPLIER-PREM")
      .maybeSingle();

    const priceAmt = Number(plan.price);

    if (walletAccount && revAccount && priceAmt > 0) {
      const { data: tx } = await client
        .from("ledger_transactions")
        .insert({
          tenant_id: dto.tenantId,
          reference_type: "SUPPLIER_PREMIUM_UPGRADE",
          reference_id: plan.id,
          description: `Supplier premium plan upgraded to ${dto.planCode}`,
          status: "POSTED",
          created_by: actor.appUserId
        })
        .select()
        .single();

      if (tx) {
        // Debit Supplier AP
        await client.from("ledger_entries").insert({
          tenant_id: dto.tenantId,
          transaction_id: tx.id,
          account_id: walletAccount.id,
          direction: "DEBIT",
          amount: priceAmt
        });

        // Credit Platform Revenue Account
        await client.from("ledger_entries").insert({
          tenant_id: dto.tenantId,
          transaction_id: tx.id,
          account_id: revAccount.id,
          direction: "CREDIT",
          amount: priceAmt
        });
      }
    }

    // 3. Emit Domain Event
    await this.domainEvents.publish("monetization.subscription.upgraded", {
      actorUserId: actor.appUserId,
      tenantId: dto.tenantId,
      planCode: dto.planCode,
      userType: "supplier"
    });

    return { status: "success", planCode: dto.planCode };
  }
}
