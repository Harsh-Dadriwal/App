import { Body, Controller, Get, Post, Query, Req, UseGuards } from "@nestjs/common";
import { SupabaseAuthGuard } from "../../common/auth/supabase-auth.guard";
import type { AuthenticatedRequest } from "../../common/auth/authenticated-request";
import { NotificationsService } from "./notifications.service";

@Controller("/api/v1/notifications")
@UseGuards(SupabaseAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  private getAccessToken(request: AuthenticatedRequest) {
    const authHeader = request.headers.authorization || "";
    return authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
  }

  @Get()
  async list(
    @Req() request: AuthenticatedRequest,
    @Query("tenantId") tenantId?: string
  ) {
    return {
      data: await this.notificationsService.listForUser(
        request.actor!,
        request.actor?.appUserId ?? "",
        this.getAccessToken(request),
        tenantId ?? request.actor?.defaultTenantId
      )
    };
  }

  @Post("/push-token")
  async registerPushToken(@Req() request: AuthenticatedRequest, @Body() body: { token?: string; platform?: string }) {
    return { data: await this.notificationsService.registerPushToken(request.actor!, body?.token, body?.platform) };
  }

  @Post("/push-token/remove")
  async removePushToken(@Req() request: AuthenticatedRequest, @Body() body: { token?: string }) {
    return { data: await this.notificationsService.removePushToken(request.actor!, body?.token) };
  }

  @Post("/mark-read")
  async markRead(@Req() request: AuthenticatedRequest, @Body() body: { notificationId: string }) {
    return {
      data: await this.notificationsService.markRead(request.actor!, body.notificationId, this.getAccessToken(request))
    };
  }

  @Post("/mark-all-read")
  async markAllRead(@Req() request: AuthenticatedRequest, @Body() body: { notificationIds: string[] }) {
    return {
      data: await this.notificationsService.markAllRead(request.actor!, body.notificationIds ?? [], this.getAccessToken(request))
    };
  }
}
