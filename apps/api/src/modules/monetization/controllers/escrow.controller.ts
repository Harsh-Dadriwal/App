import { Body, Controller, Param, Post, Req, UseGuards } from "@nestjs/common";
import { SupabaseAuthGuard } from "../../../common/auth/supabase-auth.guard";
import { EscrowService } from "../escrow.service";
import type { AuthenticatedRequest } from "../../../common/auth/authenticated-request";

@Controller("/api/v1/escrow")
@UseGuards(SupabaseAuthGuard)
export class EscrowController {
  constructor(private readonly escrowService: EscrowService) {}

  private getAccessToken(request: AuthenticatedRequest) {
    const authHeader = request.headers.authorization || "";
    return authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
  }

  @Post("/create")
  async createEscrow(
    @Req() request: AuthenticatedRequest,
    @Body() body: { tenantId: string; siteOrderId: string; amount: number }
  ) {
    return {
      data: await this.escrowService.initializeEscrow(request.actor!, this.getAccessToken(request), body)
    };
  }

  @Post("/release/:id")
  async releaseEscrow(
    @Req() request: AuthenticatedRequest,
    @Param("id") escrowAccountId: string,
    @Body() body: { notes: string }
  ) {
    return {
      data: await this.escrowService.confirmRelease(request.actor!, this.getAccessToken(request), escrowAccountId, body)
    };
  }
}
