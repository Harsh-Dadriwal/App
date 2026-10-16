import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { SupabaseAuthGuard } from "../../common/auth/supabase-auth.guard";
import type { AuthenticatedRequest } from "../../common/auth/authenticated-request";
import { OrderRequestsService } from "./order-requests.service";

@Controller("/api/v1/order-requests")
@UseGuards(SupabaseAuthGuard)
export class OrderRequestsController {
  constructor(private readonly orderRequests: OrderRequestsService) {}

  @Get()
  async list(@Req() request: AuthenticatedRequest) {
    return { data: await this.orderRequests.list(request.actor!) };
  }

  @Post()
  async create(@Req() request: AuthenticatedRequest, @Body() body: Record<string, unknown>) {
    return { data: await this.orderRequests.create(request.actor!, body ?? {}) };
  }

  @Post(":id/status")
  async updateStatus(@Req() request: AuthenticatedRequest, @Param("id") id: string, @Body() body: Record<string, unknown>) {
    return { data: await this.orderRequests.updateStatus(request.actor!, id, body ?? {}) };
  }
}
