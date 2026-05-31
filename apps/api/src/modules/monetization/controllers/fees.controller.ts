import { Body, Controller, Get, Post, Query, Req, UseGuards } from "@nestjs/common";
import { SupabaseAuthGuard } from "../../../common/auth/supabase-auth.guard";
import { FeeService } from "../fee.service";
import type { AuthenticatedRequest } from "../../../common/auth/authenticated-request";

@Controller("/api/v1/fees")
@UseGuards(SupabaseAuthGuard)
export class FeesController {
  constructor(private readonly feeService: FeeService) {}

  private getAccessToken(request: AuthenticatedRequest) {
    const authHeader = request.headers.authorization || "";
    return authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
  }

  @Get("/calculate")
  async calculateFees(
    @Query("orderId") orderId: string,
    @Query("urgency") urgency: "STANDARD" | "PRIORITY" | "EMERGENCY"
  ) {
    return {
      data: await this.feeService.calculateProcurementFees(orderId, urgency)
    };
  }

  @Post("/charge")
  async chargeFee(
    @Req() request: AuthenticatedRequest,
    @Body() body: { tenantId: string; orderId: string; feeModel: string; feeAmount: number }
  ) {
    return {
      data: await this.feeService.postProcurementFee(request.actor!, this.getAccessToken(request), body)
    };
  }
}
