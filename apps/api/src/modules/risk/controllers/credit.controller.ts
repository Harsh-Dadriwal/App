import { Body, Controller, Param, Post, Patch, Req, UseGuards } from "@nestjs/common";
import { SupabaseAuthGuard } from "../../../common/auth/supabase-auth.guard";
import { CreditService } from "../credit.service";
import type { AuthenticatedRequest } from "../../../common/auth/authenticated-request";

@Controller("/api/v1/credit")
@UseGuards(SupabaseAuthGuard)
export class CreditController {
  constructor(private readonly creditService: CreditService) {}

  private getAccessToken(request: AuthenticatedRequest) {
    const authHeader = request.headers.authorization || "";
    return authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
  }

  @Post("/request")
  async createCreditRequest(
    @Req() request: AuthenticatedRequest,
    @Body() body: { tenantId: string; siteId: string; requestedAmount: number; purpose: string }
  ) {
    return {
      data: await this.creditService.submitRequest(request.actor!, this.getAccessToken(request), body)
    };
  }

  @Patch("/review/:id")
  async reviewCreditRequest(
    @Req() request: AuthenticatedRequest,
    @Param("id") requestId: string,
    @Body() body: { status: "approved" | "rejected" | "under_review"; approvedAmount?: number; advanceRequiredPercentage?: number; notes: string }
  ) {
    return {
      data: await this.creditService.processReview(request.actor!, this.getAccessToken(request), requestId, body)
    };
  }
}
