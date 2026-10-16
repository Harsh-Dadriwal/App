import { BadRequestException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { SupabaseAdminService } from "../../common/supabase/supabase-admin.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { TenantAccessService } from "../../common/tenancy/tenant-access.service";
import type { RequestActor } from "../../common/auth/auth.types";
import type { WalletReconciliationRowDto } from "../../core";

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

    const amount = Number(args.target_amount ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException("Wallet entry amount must be greater than zero.");
    }

    if (
      actor.role === "customer" &&
      args.target_direction === "credit" &&
      amount < 500
    ) {
      throw new BadRequestException("Minimum deposit amount is ₹500.");
    }

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

  /**
   * Enrols the signed-in user in a savings plan: the subscription and its full instalment
   * schedule. Runs with the service role because instalment rows may only be written by
   * workspace admins under RLS; access is checked here instead. A subscription left
   * without instalments by an earlier failed attempt is completed rather than duplicated.
   */
  async joinSavingsPlan(actor: RequestActor, templateId: unknown) {
    const userId = actor.appUserId;
    if (!userId) throw new UnauthorizedException("Your profile could not be found. Please sign in again.");
    const tenantId = actor.defaultTenantId;
    if (!tenantId) throw new BadRequestException("Please select a workspace.");
    await this.tenantAccess.assertTenantAccess(actor, tenantId);
    if (typeof templateId !== "string" || !templateId) throw new BadRequestException("Choose a savings plan to join.");

    const db = this.supabaseAdmin.getClient();
    const template = await db
      .from("savings_plan_templates")
      .select("id, tenant_id, status, installment_amount, installment_count, frequency_days, maturity_bonus_amount")
      .eq("id", templateId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (template.error) throw new Error(template.error.message);
    if (!template.data) throw new NotFoundException("This savings plan could not be found.");
    if (template.data.status !== "active") throw new ForbiddenException("This savings plan is not open for new members right now.");

    const installmentCount = Number(template.data.installment_count);
    const installmentAmount = Number(template.data.installment_amount);
    const frequencyDays = Number(template.data.frequency_days) || 30;
    if (!(installmentCount > 0) || !(installmentAmount > 0)) {
      throw new BadRequestException("This savings plan is not set up correctly. Please contact support.");
    }

    const wallet = await db
      .from("wallet_accounts")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("user_id", userId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (wallet.error) throw new Error(wallet.error.message);
    if (!wallet.data) throw new BadRequestException("Your wallet is not set up yet. Please contact support to activate it.");

    const addDays = (date: Date, days: number) => new Date(date.getTime() + days * 86_400_000).toISOString().slice(0, 10);

    // Reuse a subscription to this plan that has no instalments (an earlier failed join).
    const existing = await db
      .from("savings_plan_subscriptions")
      .select("id, subscription_number, started_at, savings_installments(count)")
      .eq("tenant_id", tenantId)
      .eq("user_id", userId)
      .eq("plan_template_id", templateId)
      .eq("status", "active");
    if (existing.error) throw new Error(existing.error.message);
    const unfinished = (existing.data ?? []).find((row: any) => Number(row.savings_installments?.[0]?.count ?? 0) === 0);

    let subscription: { id: string; subscription_number: string; started_at: string };
    let createdNow = false;
    if (unfinished) {
      subscription = unfinished as typeof subscription;
    } else {
      const today = new Date();
      const inserted = await db
        .from("savings_plan_subscriptions")
        .insert({
          tenant_id: tenantId,
          wallet_account_id: wallet.data.id,
          user_id: userId,
          plan_template_id: templateId,
          subscription_number: `SAV-${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 90 + 10)}`,
          status: "active",
          started_at: today.toISOString().slice(0, 10),
          maturity_date: addDays(today, frequencyDays * installmentCount),
          installment_amount: installmentAmount,
          installment_count: installmentCount,
          maturity_bonus_amount: Number(template.data.maturity_bonus_amount ?? 0),
          created_by: userId
        })
        .select("id, subscription_number, started_at")
        .single();
      if (inserted.error) throw new Error(inserted.error.message);
      subscription = inserted.data;
      createdNow = true;
    }

    const start = new Date(`${subscription.started_at}T00:00:00Z`);
    const rows = Array.from({ length: installmentCount }, (_, index) => ({
      tenant_id: tenantId,
      subscription_id: subscription.id,
      installment_number: index + 1,
      due_date: addDays(start, frequencyDays * index),
      expected_amount: installmentAmount,
      status: "pending"
    }));
    const installments = await db.from("savings_installments").insert(rows);
    if (installments.error) {
      // Never leave a subscription behind without its schedule.
      if (createdNow) await db.from("savings_plan_subscriptions").delete().eq("id", subscription.id);
      throw new Error(installments.error.message);
    }

    await this.domainEvents.publish("wallet.savings_plan.joined", {
      actorUserId: userId,
      tenantId,
      subscriptionId: subscription.id,
      planTemplateId: templateId
    });

    return { subscriptionId: subscription.id, subscriptionNumber: subscription.subscription_number, installmentCount };
  }

  async ensureWalletAccount(actor: RequestActor, accessToken: string, args: Record<string, unknown>) {
    await this.tenantAccess.assertTenantAccess(actor, String(args.target_tenant_id));
    return this.rpc(accessToken, "ensure_wallet_account", args);
  }

  async paySavingsInstallment(actor: RequestActor, accessToken: string, args: Record<string, unknown>) {
    const installmentId = typeof args.target_installment_id === "string" ? args.target_installment_id : "";
    if (!installmentId) throw new BadRequestException("Choose an instalment to pay.");

    const db = this.supabaseAdmin.getClient();
    const installment = await db
      .from("savings_installments")
      .select("id, tenant_id, subscription_id, installment_number")
      .eq("id", installmentId)
      .maybeSingle();
    if (installment.error) throw new Error(installment.error.message);
    if (!installment.data) throw new NotFoundException("This instalment could not be found.");
    await this.tenantAccess.assertTenantAccess(actor, installment.data.tenant_id);

    // Instalments are paid in order: an earlier one still open blocks this payment.
    const earlier = await db
      .from("savings_installments")
      .select("installment_number")
      .eq("subscription_id", installment.data.subscription_id)
      .lt("installment_number", installment.data.installment_number)
      .in("status", ["pending", "late"])
      .order("installment_number", { ascending: true })
      .limit(1);
    if (earlier.error) throw new Error(earlier.error.message);
    if (earlier.data?.length) {
      throw new BadRequestException(
        `Please pay instalment ${earlier.data[0].installment_number} first. Instalments are paid one after another.`
      );
    }

    const data = await this.rpc(accessToken, "pay_savings_installment", {
      target_installment_id: installmentId,
      payment_amount: args.payment_amount ?? null,
      note_text: args.note_text ?? null
    });
    const accountId = String((data as any)?.wallet_account_id ?? "");
    if (accountId) {
      await this.reconcileWalletAccount(actor, accountId);
    }
    await this.domainEvents.publish("wallet.savings_installment.paid", {
      actorUserId: actor.appUserId,
      tenantId: installment.data.tenant_id,
      subscriptionId: installment.data.subscription_id,
      installmentId
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
