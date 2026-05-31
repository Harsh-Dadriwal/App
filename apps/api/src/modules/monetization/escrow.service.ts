import { Injectable, BadRequestException, NotFoundException } from "@nestjs/common";
import { SupabaseAdminService } from "../../common/supabase/supabase-admin.service";
import { TenantAccessService } from "../../common/tenancy/tenant-access.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import type { RequestActor } from "../../common/auth/auth.types";

@Injectable()
export class EscrowService {
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

  async initializeEscrow(
    actor: RequestActor,
    accessToken: string,
    dto: { tenantId: string; siteOrderId: string; amount: number }
  ) {
    await this.tenantAccess.assertTenantAccess(actor, dto.tenantId);

    const client = this.getClient(accessToken);

    // 1. Create escrow account entry
    const { data: escrow, error } = await client
      .from("escrow_accounts")
      .insert({
        tenant_id: dto.tenantId,
        customer_id: actor.appUserId,
        site_order_id: dto.siteOrderId,
        total_escrow_amount: dto.amount,
        locked_amount: dto.amount,
        released_amount: 0.00,
        disputed_amount: 0.00,
        status: "submitted" // using submitted as locked status in finance_application_status mapping
      })
      .select()
      .single();

    if (error) {
      throw new BadRequestException(error.message);
    }

    // 2. Perform Double-Entry Booking: Debit Customer Wallet Liability, Credit Escrow Commitment
    const { data: walletAccount } = await client
      .from("ledger_accounts")
      .select("id")
      .eq("account_number", "2000-WALLET-LIABILITY")
      .eq("user_id", actor.appUserId)
      .maybeSingle();

    const { data: escrowAccount } = await client
      .from("ledger_accounts")
      .select("id")
      .eq("account_number", "2010-ESCROW-LIABILITY")
      .maybeSingle();

    if (walletAccount && escrowAccount) {
      const { data: tx } = await client
        .from("ledger_transactions")
        .insert({
          tenant_id: dto.tenantId,
          reference_type: "ESCROW_LOCK",
          reference_id: escrow.id,
          description: `Escrow locked for site order ${dto.siteOrderId}`,
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
          amount: dto.amount
        });

        // Credit Platform Escrow Liability
        await client.from("ledger_entries").insert({
          tenant_id: dto.tenantId,
          transaction_id: tx.id,
          account_id: escrowAccount.id,
          direction: "CREDIT",
          amount: dto.amount
        });

        // Log transaction history
        await client.from("escrow_transactions").insert({
          tenant_id: dto.tenantId,
          escrow_account_id: escrow.id,
          amount: dto.amount,
          type: "LOCK",
          ledger_tx_id: tx.id,
          created_by: actor.appUserId
        });
      }
    }

    // 3. Emit Domain Event
    await this.domainEvents.publish("escrow.funds.locked", {
      actorUserId: actor.appUserId,
      escrowAccountId: escrow.id,
      amount: dto.amount,
      siteOrderId: dto.siteOrderId
    });

    return escrow;
  }

  async confirmRelease(
    actor: RequestActor,
    accessToken: string,
    escrowAccountId: string,
    dto: { notes: string }
  ) {
    const client = this.getClient(accessToken);

    // Fetch escrow details
    const { data: escrow, error } = await client
      .from("escrow_accounts")
      .select("*")
      .eq("id", escrowAccountId)
      .maybeSingle();

    if (error || !escrow) {
      throw new NotFoundException("Escrow account not found.");
    }

    // Assert access
    await this.tenantAccess.assertTenantAccess(actor, escrow.tenant_id);

    if (escrow.status !== "submitted") {
      throw new BadRequestException("Escrow funds are not currently locked or in a releasable state.");
    }

    const releaseAmt = Number(escrow.locked_amount);

    // Update escrow table state
    const { data: updatedEscrow, error: updateError } = await client
      .from("escrow_accounts")
      .update({
        locked_amount: 0.00,
        released_amount: releaseAmt,
        status: "approved" // using approved as released in finance_application_status mapping
      })
      .eq("id", escrowAccountId)
      .select()
      .single();

    if (updateError) {
      throw new BadRequestException(updateError.message);
    }

    // Perform Double-Entry Booking: Debit Escrow Commitment, Credit Supplier Accounts Payable (AP)
    // Find escrow liability ledger account
    const { data: escrowAccount } = await client
      .from("ledger_accounts")
      .select("id")
      .eq("account_number", "2010-ESCROW-LIABILITY")
      .maybeSingle();

    // Find supplier Accounts Payable ledger account
    const { data: supplierAccount } = await client
      .from("ledger_accounts")
      .select("id")
      .eq("account_number", "2100-SUPPLIER-AP")
      .maybeSingle();

    if (escrowAccount && supplierAccount) {
      const { data: tx } = await client
        .from("ledger_transactions")
        .insert({
          tenant_id: escrow.tenant_id,
          reference_type: "ESCROW_RELEASE",
          reference_id: escrow.id,
          description: `Escrow released for site order ${escrow.site_order_id}. Notes: ${dto.notes}`,
          status: "POSTED",
          created_by: actor.appUserId
        })
        .select()
        .single();

      if (tx) {
        // Debit Platform Escrow Liability
        await client.from("ledger_entries").insert({
          tenant_id: escrow.tenant_id,
          transaction_id: tx.id,
          account_id: escrowAccount.id,
          direction: "DEBIT",
          amount: releaseAmt
        });

        // Credit Supplier Accounts Payable (minus flat escrow fee e.g. 1.5%)
        const platformEscrowFee = Number((releaseAmt * 0.015).toFixed(2));
        const supplierNetRelease = releaseAmt - platformEscrowFee;

        await client.from("ledger_entries").insert({
          tenant_id: escrow.tenant_id,
          transaction_id: tx.id,
          account_id: supplierAccount.id,
          direction: "CREDIT",
          amount: supplierNetRelease
        });

        // Credit Platform Fee Revenue Account
        const { data: revAccount } = await client
          .from("ledger_accounts")
          .select("id")
          .eq("account_number", "4020-REV-ESCROW-FEE")
          .maybeSingle();

        if (revAccount) {
          await client.from("ledger_entries").insert({
            tenant_id: escrow.tenant_id,
            transaction_id: tx.id,
            account_id: revAccount.id,
            direction: "CREDIT",
            amount: platformEscrowFee
          });
        }

        // Log transaction history
        await client.from("escrow_transactions").insert({
          tenant_id: escrow.tenant_id,
          escrow_account_id: escrow.id,
          amount: releaseAmt,
          type: "RELEASE",
          ledger_tx_id: tx.id,
          created_by: actor.appUserId
        });
      }
    }

    // Emit event
    await this.domainEvents.publish("escrow.funds.released", {
      actorUserId: actor.appUserId,
      escrowAccountId,
      amount: releaseAmt,
      siteOrderId: escrow.site_order_id
    });

    return updatedEscrow;
  }
}
