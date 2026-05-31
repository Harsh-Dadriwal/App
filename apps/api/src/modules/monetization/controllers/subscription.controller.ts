import { Body, Controller, Post, Req, UseGuards } from "@nestjs/common";
import { SupabaseAuthGuard } from "../../../common/auth/supabase-auth.guard";
import { SubscriptionService } from "../subscription.service";
import type { AuthenticatedRequest } from "../../../common/auth/authenticated-request";

@Controller("/api/v1/subscriptions")
@UseGuards(SupabaseAuthGuard)
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  private getAccessToken(request: AuthenticatedRequest) {
    const authHeader = request.headers.authorization || "";
    return authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
  }

  @Post("/upgrade")
  async upgradeContractorSubscription(
    @Req() request: AuthenticatedRequest,
    @Body() body: { tenantId: string; planCode: string }
  ) {
    return {
      data: await this.subscriptionService.upgradeContractorPlan(request.actor!, this.getAccessToken(request), body)
    };
  }

  @Post("/supplier/upgrade")
  async upgradeSupplierSubscription(
    @Req() request: AuthenticatedRequest,
    @Body() body: { tenantId: string; planCode: string }
  ) {
    return {
      data: await this.subscriptionService.upgradeSupplierPlan(request.actor!, this.getAccessToken(request), body)
    };
  }
}
