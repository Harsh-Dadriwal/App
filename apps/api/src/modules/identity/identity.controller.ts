import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { IdentityService } from "./identity.service";
import { AccountDeletionService } from "./account-deletion.service";
import { AccountProfileService } from "./account-profile.service";
import { SupabaseAuthGuard, invalidateActorCache } from "../../common/auth/supabase-auth.guard";
import type { AuthenticatedRequest } from "../../common/auth/authenticated-request";
import type { SwitchTenantRequestDto } from "../../core";

@Controller("/api/v1/me")
@UseGuards(SupabaseAuthGuard)
export class IdentityController {
  constructor(
    private readonly identityService: IdentityService,
    private readonly accountDeletion: AccountDeletionService,
    private readonly accountProfile: AccountProfileService
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

  /** Body: any of { full_name, username, company_name, city, state }. */
  @Patch("/profile")
  async updateProfile(@Req() request: AuthenticatedRequest, @Body() body: Record<string, unknown>) {
    return { data: await this.accountProfile.updateProfile(request.actor!, body ?? {}) };
  }

  /** Body: { phone } - texts a code to the number the person wants to add or switch to. */
  @Post("/phone/send-code")
  @HttpCode(HttpStatus.OK)
  async sendPhoneCode(@Req() request: AuthenticatedRequest, @Body() body: Record<string, unknown>) {
    return { data: await this.accountProfile.sendPhoneCode(request.actor!, body?.phone) };
  }

  /** Body: { phone, code } - saves the number once the code is right. */
  @Post("/phone/verify")
  @HttpCode(HttpStatus.OK)
  async verifyPhone(@Req() request: AuthenticatedRequest, @Body() body: Record<string, unknown>) {
    return { data: await this.accountProfile.verifyPhone(request.actor!, body?.phone, body?.code) };
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
