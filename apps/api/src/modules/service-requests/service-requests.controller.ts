import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { SupabaseAuthGuard } from "../../common/auth/supabase-auth.guard";
import type { AuthenticatedRequest } from "../../common/auth/authenticated-request";
import { ServiceRequestsService } from "./service-requests.service";

@Controller("/api/v1/service-requests")
@UseGuards(SupabaseAuthGuard)
export class ServiceRequestsController {
  constructor(private readonly serviceRequestsService: ServiceRequestsService) {}

  @Get()
  async list(@Req() request: AuthenticatedRequest) {
    return { data: await this.serviceRequestsService.list(request.actor!) };
  }

  @Post()
  async create(@Req() request: AuthenticatedRequest, @Body() body: Record<string, unknown>) {
    return { data: await this.serviceRequestsService.create(request.actor!, body ?? {}) };
  }

  @Post(":id/responses")
  async respond(@Req() request: AuthenticatedRequest, @Param("id") id: string, @Body() body: Record<string, unknown>) {
    return { data: await this.serviceRequestsService.respond(request.actor!, id, body ?? {}) };
  }

  @Post(":id/choose")
  async choose(@Req() request: AuthenticatedRequest, @Param("id") id: string, @Body() body: Record<string, unknown>) {
    return { data: await this.serviceRequestsService.choose(request.actor!, id, body ?? {}) };
  }

  @Post(":id/status")
  async updateStatus(@Req() request: AuthenticatedRequest, @Param("id") id: string, @Body() body: Record<string, unknown>) {
    return { data: await this.serviceRequestsService.updateStatus(request.actor!, id, body ?? {}) };
  }
}
