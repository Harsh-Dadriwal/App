import { Injectable, UnauthorizedException } from "@nestjs/common";
import { SupabaseAdminService } from "../../common/supabase/supabase-admin.service";
import { TenantsService } from "../tenants/tenants.service";
import type { RequestActor } from "../../common/auth/auth.types";
import { ACTOR_PROFILE_COLUMNS, invalidateActorCache } from "../../common/auth/supabase-auth.guard";

@Injectable()
export class IdentityService {
  constructor(
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly tenantsService: TenantsService
  ) {}

  async getProfile(actor: RequestActor) {
    // The auth guard has already read this row for the request.
    if (actor.profile) {
      return actor.profile;
    }

    const profileResult = await this.supabaseAdmin
      .getClient()
      .from("users")
      .select(ACTOR_PROFILE_COLUMNS)
      .eq("auth_user_id", actor.authUserId)
      .maybeSingle();

    if (profileResult.error) {
      throw new Error(profileResult.error.message);
    }

    return profileResult.data;
  }

  async getTenantMemberships(actor: RequestActor) {
    if (!actor.appUserId) {
      throw new UnauthorizedException("Your profile could not be found. Please sign in again.");
    }

    return this.tenantsService.getMembershipsForUser(actor.appUserId);
  }

  /** Profile and workspaces in one call, so signing in needs a single round trip. */
  async getContext(actor: RequestActor) {
    const profile = await this.getProfile(actor);
    const tenantMemberships = actor.appUserId
      ? await this.tenantsService.getMembershipsForUser(actor.appUserId)
      : [];

    return { profile, tenantMemberships };
  }

  async switchTenant(actor: RequestActor, tenantId: string) {
    if (!actor.appUserId) {
      throw new UnauthorizedException("Your profile could not be found. Please sign in again.");
    }

    const result = await this.tenantsService.switchTenantForUser(actor.appUserId, tenantId);
    invalidateActorCache(actor.authUserId);
    return result;
  }
}
