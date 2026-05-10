import { ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { SupabaseAdminService } from "../supabase/supabase-admin.service";
import type { RequestActor } from "../auth/auth.types";

type TenantScopedRow = {
  tenant_id: string;
};

type OrderItemScope = TenantScopedRow & {
  site_order_id: string;
};

@Injectable()
export class TenantAccessService {
  constructor(private readonly supabaseAdmin: SupabaseAdminService) {}

  private requireActorProfile(actor: RequestActor) {
    if (!actor.appUserId) {
      throw new UnauthorizedException("App profile not linked.");
    }
  }

  async getActorTenantIds(actor: RequestActor) {
    this.requireActorProfile(actor);
    const result = await this.supabaseAdmin
      .getClient()
      .from("tenant_memberships")
      .select("tenant_id")
      .eq("user_id", actor.appUserId)
      .eq("is_active", true);

    if (result.error) {
      throw new Error(result.error.message);
    }

    return new Set((result.data ?? []).map((row) => row.tenant_id));
  }

  async assertTenantAccess(actor: RequestActor, tenantId: string) {
    const tenantIds = await this.getActorTenantIds(actor);
    if (!tenantIds.has(tenantId)) {
      throw new ForbiddenException("You do not have access to this tenant.");
    }
  }

  async assertTenantAdmin(actor: RequestActor, tenantId: string) {
    this.requireActorProfile(actor);
    const result = await this.supabaseAdmin
      .getClient()
      .from("tenant_memberships")
      .select("tenant_id, role")
      .eq("user_id", actor.appUserId)
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .maybeSingle();

    if (result.error) {
      throw new Error(result.error.message);
    }

    if (!result.data || !["admin", "owner"].includes(String(result.data.role))) {
      throw new ForbiddenException("Admin tenant access required.");
    }
  }

  private async requireTenantScopedRow<T extends TenantScopedRow>(table: string, id: string, select = "tenant_id") {
    const result = await this.supabaseAdmin
      .getClient()
      .from(table)
      .select(select)
      .eq("id", id)
      .maybeSingle();

    if (result.error) {
      throw new Error(result.error.message);
    }

    if (!result.data) {
      throw new ForbiddenException(`${table} row not found.`);
    }

    return result.data as unknown as T;
  }

  async assertOrderItemAccess(actor: RequestActor, orderItemId: string) {
    const row = await this.requireTenantScopedRow<OrderItemScope>(
      "order_items",
      orderItemId,
      "tenant_id, site_order_id"
    );
    await this.assertTenantAccess(actor, row.tenant_id);
    return row;
  }

  async assertSiteOrderAccess(actor: RequestActor, siteOrderId: string) {
    const row = await this.requireTenantScopedRow<TenantScopedRow>("site_orders", siteOrderId, "tenant_id");
    await this.assertTenantAccess(actor, row.tenant_id);
    return row;
  }

  async assertWalletAccountAccess(actor: RequestActor, walletAccountId: string) {
    const result = await this.supabaseAdmin
      .getClient()
      .from("wallet_accounts")
      .select("id, tenant_id, user_id, available_balance")
      .eq("id", walletAccountId)
      .maybeSingle();

    if (result.error) {
      throw new Error(result.error.message);
    }

    if (!result.data) {
      throw new ForbiddenException("Wallet account not found.");
    }

    await this.assertTenantAccess(actor, result.data.tenant_id);
    return result.data;
  }

  async assertSubstituteSuggestionAccess(actor: RequestActor, suggestionId: string) {
    const result = await this.supabaseAdmin
      .getClient()
      .from("substitute_suggestions")
      .select("id, tenant_id")
      .eq("id", suggestionId)
      .maybeSingle();

    if (result.error) {
      throw new Error(result.error.message);
    }

    if (!result.data) {
      throw new ForbiddenException("Substitute suggestion not found.");
    }

    await this.assertTenantAccess(actor, result.data.tenant_id);
    return result.data;
  }

  async assertReferralRewardAccess(actor: RequestActor, rewardId: string) {
    const result = await this.supabaseAdmin
      .getClient()
      .from("referral_rewards")
      .select("id, tenant_id")
      .eq("id", rewardId)
      .maybeSingle();

    if (result.error) {
      throw new Error(result.error.message);
    }

    if (!result.data) {
      throw new ForbiddenException("Referral reward not found.");
    }

    await this.assertTenantAccess(actor, result.data.tenant_id);
    return result.data;
  }
}
