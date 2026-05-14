import { Body, Controller, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { SupabaseAuthGuard } from "../../common/auth/supabase-auth.guard";
import type { AuthenticatedRequest } from "../../common/auth/authenticated-request";
import type { AcceptTaskBidRequestDto, SubmitTaskBidRequestDto } from "@mahalaxmi/core/types/contracts";
import { MaintenanceService } from "./maintenance.service";

@Controller("/api/v1")
@UseGuards(SupabaseAuthGuard)
export class MaintenanceController {
  constructor(private readonly maintenanceService: MaintenanceService) {}

  @Post("/tasks/:id/bids")
  async submitBid(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() body: SubmitTaskBidRequestDto
  ) {
    return {
      data: await this.maintenanceService.submitBid(request.actor!, id, body)
    };
  }

  @Patch("/tasks/:id/accept-bid")
  async acceptBid(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() body: AcceptTaskBidRequestDto
  ) {
    return {
      data: await this.maintenanceService.acceptBid(request.actor!, id, body)
    };
  }
}
