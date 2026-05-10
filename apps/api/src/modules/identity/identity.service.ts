import { Injectable, UnauthorizedException } from "@nestjs/common";
import { SupabaseAdminService } from "../../common/supabase/supabase-admin.service";
import { TenantsService } from "../tenants/tenants.service";
import type { RequestActor } from "../../common/auth/auth.types";

@Injectable()
export class IdentityService {
  constructor(
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly tenantsService: TenantsService
  ) {}

  async getProfile(actor: RequestActor, accessToken: string) {
    const supabase = this.supabaseAdmin.createUserClient(accessToken);
    const profileResult = await supabase
      .from("users")
      .select(
        "id, auth_user_id, default_tenant_id, full_name, email, phone, role, city, state, company_name, verification_status, is_admin_verified"
      )
      .eq("auth_user_id", actor.authUserId)
      .maybeSingle();

    if (profileResult.error) {
      throw new Error(profileResult.error.message);
    }

    return profileResult.data;
  }

  async getTenantMemberships(actor: RequestActor, accessToken: string) {
    if (!actor.appUserId) {
      throw new UnauthorizedException("App profile not linked.");
    }

    return this.tenantsService.getMembershipsForUser(actor.appUserId, accessToken);
  }

  async switchTenant(actor: RequestActor, tenantId: string, accessToken: string) {
    if (!actor.appUserId) {
      throw new UnauthorizedException("App profile not linked.");
    }

    return this.tenantsService.switchTenantForUser(actor.appUserId, tenantId, accessToken);
  }
}
