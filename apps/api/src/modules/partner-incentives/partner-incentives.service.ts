import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { SupabaseAdminService } from "../../common/supabase/supabase-admin.service";
import { TenantAccessService } from "../../common/tenancy/tenant-access.service";
import type { RequestActor } from "../../common/auth/auth.types";

type SaveSchemePayload = {
  tenant_id?: string;
  name?: string;
  partner_type?: string;
  status?: "draft" | "active" | "archived";
  effective_from?: string;
  effective_to?: string | null;
  description?: string | null;
};

type SaveSlabPayload = {
  tenant_id?: string;
  scheme_id?: string;
  tier_name?: string;
  min_business?: number;
  max_business?: number | null;
  wire_commission_percent?: number;
  other_commission_percent?: number;
  bonus_points?: number;
  color?: string | null;
  icon?: string | null;
  description?: string | null;
  sort_order?: number;
  is_active?: boolean;
};

@Injectable()
export class PartnerIncentivesService {
  constructor(
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly tenantAccess: TenantAccessService
  ) {}

  private requireProfile(actor: RequestActor) {
    if (!actor.appUserId) {
      throw new ForbiddenException("App profile not linked.");
    }
  }

  private async requireTenant(actor: RequestActor, tenantId?: string | null) {
    const resolvedTenantId = tenantId || actor.defaultTenantId;
    if (!resolvedTenantId) {
      throw new BadRequestException("A tenant is required.");
    }
    await this.tenantAccess.assertTenantAccess(actor, resolvedTenantId);
    return resolvedTenantId;
  }

  private async requireAdminTenant(actor: RequestActor, tenantId?: string | null) {
    const resolvedTenantId = await this.requireTenant(actor, tenantId);
    await this.tenantAccess.assertTenantAdmin(actor, resolvedTenantId);
    return resolvedTenantId;
  }

  async listPartnerDashboard(actor: RequestActor, accessToken: string) {
    this.requireProfile(actor);
    const tenantId = await this.requireTenant(actor);
    const supabase = this.supabaseAdmin.createUserClient(accessToken);
    const currentYear = new Date().getFullYear();

    const [progress, ledger, wallet, rewards, slabs] = await Promise.all([
      supabase
        .from("vw_partner_incentive_progress")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("partner_id", actor.appUserId)
        .eq("business_year", currentYear)
        .maybeSingle(),
      supabase
        .from("partner_commission_ledger")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("partner_id", actor.appUserId)
        .order("posted_at", { ascending: false })
        .limit(100),
      supabase
        .from("partner_points_wallet")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("partner_id", actor.appUserId)
        .maybeSingle(),
      supabase
        .from("partner_reward_redemptions")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("partner_id", actor.appUserId)
        .order("requested_at", { ascending: false })
        .limit(50),
      supabase
        .from("partner_incentive_slabs")
        .select("*, scheme:partner_incentive_schemes!inner(status, partner_type)")
        .eq("tenant_id", tenantId)
        .eq("scheme.status", "active")
        .order("sort_order", { ascending: true })
    ]);

    const error = progress.error || ledger.error || wallet.error || rewards.error || slabs.error;
    if (error) {
      throw new Error(error.message);
    }

    return {
      progress: progress.data ?? null,
      ledger: ledger.data ?? [],
      wallet: wallet.data ?? null,
      rewards: rewards.data ?? [],
      slabs: slabs.data ?? []
    };
  }

  async listAdminOverview(actor: RequestActor, accessToken: string, tenantId?: string) {
    const resolvedTenantId = await this.requireAdminTenant(actor, tenantId);
    const supabase = this.supabaseAdmin.createUserClient(accessToken);
    const [schemes, slabs, reports, ledger] = await Promise.all([
      supabase.from("partner_incentive_schemes").select("*").eq("tenant_id", resolvedTenantId).order("created_at", { ascending: false }),
      supabase.from("partner_incentive_slabs").select("*").eq("tenant_id", resolvedTenantId).order("sort_order", { ascending: true }),
      supabase.from("vw_partner_incentive_reports").select("*").eq("tenant_id", resolvedTenantId).order("total_business", { ascending: false }),
      supabase.from("partner_commission_ledger").select("*").eq("tenant_id", resolvedTenantId).order("posted_at", { ascending: false }).limit(100)
    ]);

    const error = schemes.error || slabs.error || reports.error || ledger.error;
    if (error) {
      throw new Error(error.message);
    }

    return {
      schemes: schemes.data ?? [],
      slabs: slabs.data ?? [],
      reports: reports.data ?? [],
      ledger: ledger.data ?? []
    };
  }

  async saveScheme(actor: RequestActor, accessToken: string, payload: SaveSchemePayload, schemeId?: string | null) {
    const tenantId = await this.requireAdminTenant(actor, payload.tenant_id);
    const supabase = this.supabaseAdmin.createUserClient(accessToken);
    const writePayload = {
      name: payload.name,
      partner_type: payload.partner_type ?? "all",
      status: payload.status ?? "draft",
      effective_from: payload.effective_from,
      effective_to: payload.effective_to ?? null,
      description: payload.description ?? null,
      tenant_id: tenantId,
      created_by: actor.appUserId
    };

    const result = schemeId
      ? await supabase.from("partner_incentive_schemes").update(writePayload).eq("id", schemeId).eq("tenant_id", tenantId).select("*").single()
      : await supabase.from("partner_incentive_schemes").insert(writePayload).select("*").single();

    if (result.error) {
      throw new Error(result.error.message);
    }

    return result.data;
  }

  async duplicateScheme(actor: RequestActor, accessToken: string, schemeId: string) {
    const tenantId = await this.requireTenant(actor);
    await this.requireAdminTenant(actor, tenantId);
    const supabase = this.supabaseAdmin.createUserClient(accessToken);
    const source = await supabase.from("partner_incentive_schemes").select("*").eq("id", schemeId).eq("tenant_id", tenantId).single();
    if (source.error) throw new Error(source.error.message);

    const created = await supabase.from("partner_incentive_schemes").insert({
      tenant_id: tenantId,
      name: `${source.data.name} Copy`,
      partner_type: source.data.partner_type,
      status: "draft",
      effective_from: source.data.effective_from,
      effective_to: source.data.effective_to,
      description: source.data.description,
      created_by: actor.appUserId
    }).select("*").single();
    if (created.error) throw new Error(created.error.message);

    const slabs = await supabase.from("partner_incentive_slabs").select("*").eq("scheme_id", schemeId).eq("tenant_id", tenantId);
    if (slabs.error) throw new Error(slabs.error.message);
    if ((slabs.data ?? []).length) {
      const insert = await supabase.from("partner_incentive_slabs").insert((slabs.data ?? []).map((slab: any) => ({
        tenant_id: tenantId,
        scheme_id: created.data.id,
        tier_name: slab.tier_name,
        min_business: slab.min_business,
        max_business: slab.max_business,
        wire_commission_percent: slab.wire_commission_percent,
        other_commission_percent: slab.other_commission_percent,
        bonus_points: slab.bonus_points,
        color: slab.color,
        icon: slab.icon,
        description: slab.description,
        sort_order: slab.sort_order,
        is_active: slab.is_active
      })));
      if (insert.error) throw new Error(insert.error.message);
    }
    return created.data;
  }

  async deleteScheme(actor: RequestActor, accessToken: string, schemeId: string) {
    const tenantId = await this.requireAdminTenant(actor);
    const result = await this.supabaseAdmin.createUserClient(accessToken)
      .from("partner_incentive_schemes")
      .delete()
      .eq("id", schemeId)
      .eq("tenant_id", tenantId);
    if (result.error) throw new Error(result.error.message);
    return { id: schemeId };
  }

  async saveSlab(actor: RequestActor, accessToken: string, payload: SaveSlabPayload, slabId?: string | null) {
    const tenantId = await this.requireAdminTenant(actor, payload.tenant_id);
    const supabase = this.supabaseAdmin.createUserClient(accessToken);
    const writePayload = { ...payload, tenant_id: tenantId };
    const result = slabId
      ? await supabase.from("partner_incentive_slabs").update(writePayload).eq("id", slabId).eq("tenant_id", tenantId).select("*").single()
      : await supabase.from("partner_incentive_slabs").insert(writePayload).select("*").single();

    if (result.error) throw new Error(result.error.message);
    return result.data;
  }

  async deleteSlab(actor: RequestActor, accessToken: string, slabId: string) {
    const tenantId = await this.requireAdminTenant(actor);
    const result = await this.supabaseAdmin.createUserClient(accessToken)
      .from("partner_incentive_slabs")
      .delete()
      .eq("id", slabId)
      .eq("tenant_id", tenantId);
    if (result.error) throw new Error(result.error.message);
    return { id: slabId };
  }

  /**
   * Bulk-reorder slabs by assigning sequential sort_order values matching the
   * provided ID order. Each slab is updated individually to respect RLS.
   */
  async reorderSlabs(actor: RequestActor, accessToken: string, orderedIds: string[]) {
    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      throw new BadRequestException("orderedIds must be a non-empty array.");
    }
    const tenantId = await this.requireAdminTenant(actor);
    const supabase = this.supabaseAdmin.createUserClient(accessToken);

    const updates = orderedIds.map((id, index) =>
      supabase
        .from("partner_incentive_slabs")
        .update({ sort_order: index })
        .eq("id", id)
        .eq("tenant_id", tenantId)
    );

    const results = await Promise.all(updates);
    const failed = results.find((r) => r.error);
    if (failed?.error) throw new Error(failed.error.message);

    return { reordered: orderedIds.length };
  }

  /**
   * List all reward redemption requests for the tenant (admin view).
   * Optionally filter by status.
   */
  async listRedemptions(actor: RequestActor, accessToken: string, tenantId?: string, status?: string) {
    const resolvedTenantId = await this.requireAdminTenant(actor, tenantId);
    const supabase = this.supabaseAdmin.createUserClient(accessToken);

    let query = supabase
      .from("partner_reward_redemptions")
      .select("*, partner:users!partner_reward_redemptions_partner_id_fkey(id, full_name, role)")
      .eq("tenant_id", resolvedTenantId)
      .order("requested_at", { ascending: false })
      .limit(200);

    if (status) {
      query = query.eq("status", status);
    }

    const result = await query;
    if (result.error) throw new Error(result.error.message);
    return result.data ?? [];
  }

  /**
   * Approve, reject, fulfil, or cancel a reward redemption request.
   * Only admins can call this. The resolved_by field is set to the acting user.
   */
  async resolveRedemption(
    actor: RequestActor,
    accessToken: string,
    redemptionId: string,
    status: "approved" | "rejected" | "fulfilled" | "cancelled",
    notes?: string | null
  ) {
    const ALLOWED_STATUSES = ["approved", "rejected", "fulfilled", "cancelled"] as const;
    if (!ALLOWED_STATUSES.includes(status)) {
      throw new BadRequestException(`Invalid status. Must be one of: ${ALLOWED_STATUSES.join(", ")}.`);
    }

    await this.requireAdminTenant(actor);
    const supabase = this.supabaseAdmin.createUserClient(accessToken);

    const result = await supabase
      .from("partner_reward_redemptions")
      .update({
        status,
        notes: notes ?? null,
        resolved_at: new Date().toISOString(),
        resolved_by: actor.appUserId
      })
      .eq("id", redemptionId)
      .select("*")
      .single();

    if (result.error) throw new Error(result.error.message);
    return result.data;
  }
}
