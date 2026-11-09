import { Injectable, ForbiddenException } from "@nestjs/common";
import { SupabaseAdminService } from "../../common/supabase/supabase-admin.service";

type Memberships = Array<Record<string, any>>;

const MEMBERSHIPS_TTL_MS = 30_000;
const MEMBERSHIPS_CACHE_LIMIT = 500;

@Injectable()
export class TenantsService {
  private readonly membershipCache = new Map<string, { value: Memberships; expiresAt: number }>();

  constructor(private readonly supabaseAdmin: SupabaseAdminService) {}

  invalidateMemberships(userId: string) {
    this.membershipCache.delete(userId);
  }

  /** `userId` always comes from the verified request actor, never from the query string. */
  async getMembershipsForUser(userId: string): Promise<Memberships> {
    const cached = this.membershipCache.get(userId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const value = await this.loadMemberships(userId);
    if (this.membershipCache.size >= MEMBERSHIPS_CACHE_LIMIT) this.membershipCache.clear();
    this.membershipCache.set(userId, { value, expiresAt: Date.now() + MEMBERSHIPS_TTL_MS });
    return value;
  }

  private async loadMemberships(userId: string): Promise<Memberships> {
    const supabase = this.supabaseAdmin.getClient();
    const membershipResult = await supabase
      .from("tenant_memberships")
      .select(
        "id, tenant_id, role, is_default, is_active, tenant:tenants(id, slug, display_name, status)"
      )
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("joined_at", { ascending: true });

    if (membershipResult.error) {
      throw new Error(membershipResult.error.message);
    }

    const memberships = ((membershipResult.data ?? []) as Array<Record<string, any>>).map((membership) => ({
      ...membership,
      tenant: Array.isArray(membership.tenant) ? membership.tenant[0] ?? null : membership.tenant ?? null
    })) as Array<Record<string, any>>;

    const tenantIds = memberships.map((membership) => membership.tenant_id);
    const brandingMap = new Map<string, any>();

    if (tenantIds.length) {
      const brandingResult = await supabase
        .from("tenant_branding")
        .select("tenant_id, app_name, logo_url, primary_color, secondary_color, accent_color")
        .in("tenant_id", tenantIds);

      if (!brandingResult.error) {
        for (const row of brandingResult.data ?? []) {
          brandingMap.set(row.tenant_id, row);
        }
      }
    }

    return memberships.map((membership) => ({
      ...membership,
      branding: brandingMap.get(membership.tenant_id) ?? null
    })) as Array<Record<string, any>>;
  }

  async switchTenantForUser(userId: string, tenantId: string) {
    const memberships = await this.getMembershipsForUser(userId);
    const hasAccess = memberships.some((membership) => membership.tenant_id === tenantId);

    if (!hasAccess) {
      throw new ForbiddenException("You do not have access to this tenant.");
    }

    const result = await this.supabaseAdmin
      .getClient()
      .from("users")
      .update({ default_tenant_id: tenantId })
      .eq("id", userId);

    if (result.error) {
      throw new Error(result.error.message);
    }

    return { tenantId };
  }
}
