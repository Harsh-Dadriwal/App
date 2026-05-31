import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { SupabaseAuthGuard } from "../../../common/auth/supabase-auth.guard";
import { ScoringService } from "../scoring.service";
import type { AuthenticatedRequest } from "../../../common/auth/authenticated-request";

@Controller("/api/v1/risk")
@UseGuards(SupabaseAuthGuard)
export class RiskController {
  constructor(private readonly scoringService: ScoringService) {}

  @Get("/profile/:contractorId")
  async getRiskProfile(
    @Req() request: AuthenticatedRequest,
    @Param("contractorId") contractorId: string
  ) {
    return {
      data: await this.scoringService.getRiskProfile(request.actor!, contractorId)
    };
  }

  @Post("/profile/recalculate")
  async recalculateRiskScore(
    @Req() request: AuthenticatedRequest,
    @Body() body: { tenantId: string; contractorId: string }
  ) {
    return {
      data: await this.scoringService.recalculateRiskScore(request.actor!, body.tenantId, body.contractorId)
    };
  }
}
