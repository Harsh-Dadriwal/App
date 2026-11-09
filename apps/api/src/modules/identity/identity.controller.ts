import { Body, Controller, Get, Post, Query, Req, UseGuards } from "@nestjs/common";
import { IdentityService } from "./identity.service";
import { AccountDeletionService } from "./account-deletion.service";
import { SupabaseAuthGuard, invalidateActorCache } from "../../common/auth/supabase-auth.guard";
import type { AuthenticatedRequest } from "../../common/auth/authenticated-request";
import type { SwitchTenantRequestDto } from "../../core";

@Controller("/api/v1/me")
@UseGuards(SupabaseAuthGuard)
export class IdentityController {
  constructor(
    private readonly identityService: IdentityService,
    private readonly accountDeletion: AccountDeletionService
  ) {}

  /** Permanently deletes the signed-in person's account (asked for in the app or on the website). */
  @Post("/delete-account")
  async deleteAccount(@Req() request: AuthenticatedRequest) {
    const data = await this.accountDeletion.deleteMyAccount(request.actor!);
    invalidateActorCache(request.actor!.authUserId);
    return { data };
  }

  @Get("/profile")
  async getProfile(@Req() request: AuthenticatedRequest, @Query("authUserId") _authUserId?: string) {
    return { data: await this.identityService.getProfile(request.actor!) };
  }

  @Get("/tenants")
  async getTenants(@Req() request: AuthenticatedRequest, @Query("userId") _userId?: string) {
    return { data: await this.identityService.getTenantMemberships(request.actor!) };
  }

  @Get("/context")
  async getContext(@Req() request: AuthenticatedRequest) {
    return { data: await this.identityService.getContext(request.actor!) };
  }

  @Post("/tenants/switch")
  async switchTenant(
    @Req() request: AuthenticatedRequest,
    @Body() body: SwitchTenantRequestDto
  ) {
    return { data: await this.identityService.switchTenant(request.actor!, body.tenantId) };
  }
}
