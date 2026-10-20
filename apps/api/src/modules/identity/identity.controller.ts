import { Body, Controller, Get, Post, Query, Req, UseGuards } from "@nestjs/common";
import { IdentityService } from "./identity.service";
import { AccountDeletionService } from "./account-deletion.service";
import { SupabaseAuthGuard } from "../../common/auth/supabase-auth.guard";
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
    return { data: await this.accountDeletion.deleteMyAccount(request.actor!) };
  }

  private getAccessToken(request: AuthenticatedRequest) {
    const authHeader = request.headers.authorization || "";
    return authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
  }

  @Get("/profile")
  async getProfile(@Req() request: AuthenticatedRequest, @Query("authUserId") _authUserId?: string) {
    return { data: await this.identityService.getProfile(request.actor!, this.getAccessToken(request)) };
  }

  @Get("/tenants")
  async getTenants(@Req() request: AuthenticatedRequest, @Query("userId") _userId?: string) {
    return { data: await this.identityService.getTenantMemberships(request.actor!, this.getAccessToken(request)) };
  }

  @Post("/tenants/switch")
  async switchTenant(
    @Req() request: AuthenticatedRequest,
    @Body() body: SwitchTenantRequestDto
  ) {
    return { data: await this.identityService.switchTenant(request.actor!, body.tenantId, this.getAccessToken(request)) };
  }
}
