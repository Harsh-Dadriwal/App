import { Injectable } from "@nestjs/common";
import { SupabaseAdminService } from "../../common/supabase/supabase-admin.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { TenantAccessService } from "../../common/tenancy/tenant-access.service";
import type { RequestActor } from "../../common/auth/auth.types";
import type { WalletReconciliationRowDto } from "@shared-types/backend-contracts";

@Injectable()
export class WalletService {
  constructor(
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly tenantAccess: TenantAccessService,
    private readonly domainEvents: DomainEventsService
  ) {}

  private async rpc(accessToken: string, functionName: string, args: Record<string, unknown>) {
    const result = await (this.supabaseAdmin.createUserClient(accessToken) as any).rpc(functionName, args);

    if (result.error) {
      throw new Error(result.error.message);
    }

    return result.data ?? {};
  }

  async postWalletEntry(actor: RequestActor, accessToken: string, args: Record<string, unknown>) {
    await this.tenantAccess.assertTenantAccess(actor, String(args.target_tenant_id));
    const data = await this.rpc(accessToken, "post_wallet_entry", args);
    const accountId = String((data as any)?.wallet_account_id ?? args.target_wallet_account_id ?? "");
    if (accountId) {
      await this.reconcileWalletAccount(actor, accountId);
    }
    await this.domainEvents.publish("wallet.entry.posted", {
      actorUserId: actor.appUserId,
      tenantId: args.target_tenant_id,
      walletAccountId: accountId || null,
      entryType: args.target_entry_type ?? null,
      direction: args.target_direction ?? null,
      amount: args.target_amount ?? null
    });
    return data;
  }

  async ensureWalletAccount(actor: RequestActor, accessToken: string, args: Record<string, unknown>) {
    await this.tenantAccess.assertTenantAccess(actor, String(args.target_tenant_id));
    return this.rpc(accessToken, "ensure_wallet_account", args);
  }

  async paySavingsInstallment(actor: RequestActor, accessToken: string, args: Record<string, unknown>) {
    await this.tenantAccess.assertTenantAccess(actor, String(args.target_tenant_id));
    const data = await this.rpc(accessToken, "pay_savings_installment", args);
    const accountId = String((data as any)?.wallet_account_id ?? "");
    if (accountId) {
      await this.reconcileWalletAccount(actor, accountId);
    }
    await this.domainEvents.publish("wallet.savings_installment.paid", {
      actorUserId: actor.appUserId,
      tenantId: args.target_tenant_id,
      subscriptionId: args.target_subscription_id ?? null,
      installmentId: args.target_installment_id ?? null
    });
    return data;
  }

  async resolveReferralReward(actor: RequestActor, accessToken: string, args: Record<string, unknown>) {
    await this.tenantAccess.assertReferralRewardAccess(actor, String(args.target_reward_id));
    const data = await this.rpc(accessToken, "resolve_referral_reward", args);
    const accountId = String((data as any)?.wallet_account_id ?? "");
    if (accountId) {
      await this.reconcileWalletAccount(actor, accountId);
    }
    await this.domainEvents.publish("wallet.referral_reward.resolved", {
      actorUserId: actor.appUserId,
      rewardId: args.target_reward_id,
      decision: args.target_status ?? null
    });
    return data;
  }

  async reconcileWalletAccount(actor: RequestActor, walletAccountId: string) {
    const wallet = await this.tenantAccess.assertWalletAccountAccess(actor, walletAccountId);
    const supabase = this.supabaseAdmin.getReadClient();

    const [snapshotResult, ledgerResult] = await Promise.all([
      supabase
        .from("wallet_balance_snapshots")
        .select("wallet_account_id, tenant_id, available_balance, last_ledger_entry_id")
        .eq("wallet_account_id", walletAccountId)
        .maybeSingle(),
      supabase
        .from("wallet_ledger_entries")
        .select("wallet_account_id, direction, amount, status")
        .eq("wallet_account_id", walletAccountId)
    ]);

    if (snapshotResult.error) {
      throw new Error(snapshotResult.error.message);
    }

    if (ledgerResult.error) {
      throw new Error(ledgerResult.error.message);
    }

    const ledgerBalance = (ledgerResult.data ?? []).reduce((sum, row: any) => {
      if (row.status && row.status !== "posted") {
        return sum;
      }
      const amount = Number(row.amount ?? 0);
      return sum + (row.direction === "credit" ? amount : -amount);
    }, 0);

    const snapshotBalance = Number(snapshotResult.data?.available_balance ?? 0);
    const walletBalance = Number(wallet.available_balance ?? 0);
    const drift = Number((ledgerBalance - snapshotBalance).toFixed(2));
    const walletDrift = Number((walletBalance - snapshotBalance).toFixed(2));

    if (Math.abs(drift) > 0.01 || Math.abs(walletDrift) > 0.01) {
      await this.domainEvents.publish("wallet.reconciliation.drift_detected", {
        actorUserId: actor.appUserId,
        walletAccountId,
        tenantId: wallet.tenant_id,
        ledgerBalance,
        snapshotBalance,
        walletBalance,
        drift,
        walletDrift
      });
    }

    return {
      wallet_account_id: walletAccountId,
      tenant_id: wallet.tenant_id,
      wallet_user_id: wallet.user_id,
      wallet_balance: walletBalance,
      snapshot_balance: snapshotBalance,
      ledger_balance: ledgerBalance,
      ledger_snapshot_drift: drift,
      wallet_snapshot_drift: walletDrift,
      last_ledger_entry_id: snapshotResult.data?.last_ledger_entry_id ?? null
    } satisfies WalletReconciliationRowDto;
  }

  async reconcileWalletsForTenant(actor: RequestActor, tenantId: string) {
    await this.tenantAccess.assertTenantAccess(actor, tenantId);
    const result = await this.supabaseAdmin
      .getReadClient()
      .from("wallet_accounts")
      .select("id")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });

    if (result.error) {
      throw new Error(result.error.message);
    }

    const rows: WalletReconciliationRowDto[] = [];
    for (const wallet of result.data ?? []) {
      rows.push(await this.reconcileWalletAccount(actor, wallet.id));
    }

    return rows.filter(
      (row) =>
        Math.abs(Number(row.ledger_snapshot_drift ?? 0)) > 0.01 ||
        Math.abs(Number(row.wallet_snapshot_drift ?? 0)) > 0.01
    );
  }
}
