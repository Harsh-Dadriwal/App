import { Injectable, BadRequestException } from "@nestjs/common";
import { SupabaseAdminService } from "../../common/supabase/supabase-admin.service";
import { TenantAccessService } from "../../common/tenancy/tenant-access.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import type { RequestActor } from "../../common/auth/auth.types";

@Injectable()
export class FeeService {
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

  async calculateProcurementFees(orderId: string, urgency: "STANDARD" | "PRIORITY" | "EMERGENCY") {
    const supabase = this.supabaseAdmin.getReadClient();

    // 1. Fetch site order total amount
    const { data: order, error } = await supabase
      .from("site_orders")
      .select("total_amount, tenant_id")
      .eq("id", orderId)
      .maybeSingle();

    if (error || !order) {
      throw new BadRequestException("Order not found.");
    }

    const totalAmt = Number(order.total_amount);

    // Calculate processing fee: 1.5% with minimum of Rs. 100
    const calculatedFee = Math.max(100.00, Number((totalAmt * 0.015).toFixed(2)));

    // Calculate urgency pricing from urgency_pricing table (fallback to defaults if not found)
    const { data: pricing } = await supabase
      .from("urgency_pricing")
      .select("*")
      .eq("tenant_id", order.tenant_id)
      .eq("urgency_level", urgency)
      .eq("is_active", true)
      .maybeSingle();

    let urgencyFee = 0.00;
    if (pricing) {
      if (pricing.fee_type === "PERCENTAGE") {
        urgencyFee = Number((totalAmt * (Number(pricing.fee_value) / 100)).toFixed(2));
      } else {
        urgencyFee = Number(pricing.fee_value);
      }
    } else {
      // Default fallback
      if (urgency === "PRIORITY") urgencyFee = 500.00;
      else if (urgency === "EMERGENCY") urgencyFee = 1500.00;
    }

    return {
      orderId,
      subtotalAmount: totalAmt,
      processingFee: calculatedFee,
      urgencyFee,
      totalFees: calculatedFee + urgencyFee
    };
  }

  async postProcurementFee(
    actor: RequestActor,
    accessToken: string,
    args: { tenantId: string; orderId: string; feeModel: string; feeAmount: number }
  ) {
    await this.tenantAccess.assertTenantAccess(actor, args.tenantId);

    const client = this.getClient(accessToken);

    // 1. Log fee entry
    const { data: entry, error: entryError } = await client
      .from("procurement_fee_entries")
      .insert({
        tenant_id: args.tenantId,
        site_order_id: args.orderId,
        fee_model: args.feeModel,
        calculated_fee: args.feeAmount,
        waived_amount: 0.00,
        final_fee: args.feeAmount,
        payment_status: "paid"
      })
      .select()
      .single();

    if (entryError) {
      throw new BadRequestException(entryError.message);
    }

    // 2. Perform Double-Entry Ledger Booking (Debit Customer Wallet / Credit Platform Revenue)
    // Find customer wallet account
    const { data: walletAccount } = await client
      .from("wallet_accounts")
      .select("id")
      .eq("user_id", actor.appUserId)
      .maybeSingle();

    if (walletAccount) {
      // Find Platform Revenue Ledger Account
      const { data: revAccount } = await client
        .from("ledger_accounts")
        .select("id")
        .eq("account_number", "4000-REV-PROCUREMENT-FEE")
        .maybeSingle();

      const { data: walletLedgerAccount } = await client
        .from("ledger_accounts")
        .select("id")
        .eq("account_number", "2000-WALLET-LIABILITY")
        .eq("user_id", actor.appUserId)
        .maybeSingle();

      if (revAccount && walletLedgerAccount) {
        // Create ledger transaction
        const { data: tx } = await client
          .from("ledger_transactions")
          .insert({
            tenant_id: args.tenantId,
            reference_type: "PROCUREMENT_FEE",
            reference_id: entry.id,
            description: `Procurement processing fee charged for order ${args.orderId}`,
            status: "POSTED",
            created_by: actor.appUserId
          })
          .select()
          .single();

        if (tx) {
          // Debit Customer Wallet Liability
          await client.from("ledger_entries").insert({
            tenant_id: args.tenantId,
            transaction_id: tx.id,
            account_id: walletLedgerAccount.id,
            direction: "DEBIT",
            amount: args.feeAmount
          });

          // Credit Platform Revenue Account
          await client.from("ledger_entries").insert({
            tenant_id: args.tenantId,
            transaction_id: tx.id,
            account_id: revAccount.id,
            direction: "CREDIT",
            amount: args.feeAmount
          });
        }
      }
    }

    // 3. Emit Domain Event
    await this.domainEvents.publish("monetization.fees.charged", {
      actorUserId: actor.appUserId,
      orderId: args.orderId,
      feeAmount: args.feeAmount,
      feeModel: args.feeModel
    });

    return entry;
  }
}
