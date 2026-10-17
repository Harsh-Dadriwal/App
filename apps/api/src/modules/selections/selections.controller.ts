import { Body, Controller, Get, Param, Post, Put, Req, UseGuards } from "@nestjs/common";
import { SupabaseAuthGuard } from "../../common/auth/supabase-auth.guard";
import type { AuthenticatedRequest } from "../../common/auth/authenticated-request";
import { SelectionsService } from "./selections.service";

@Controller("/api/v1/selections")
@UseGuards(SupabaseAuthGuard)
export class SelectionsController {
  constructor(private readonly selections: SelectionsService) {}

  @Get()
  async list(@Req() request: AuthenticatedRequest) {
    return { data: await this.selections.list(request.actor!) };
  }

  @Post()
  async create(@Req() request: AuthenticatedRequest, @Body() body: Record<string, unknown>) {
    return { data: await this.selections.create(request.actor!, body ?? {}) };
  }

  @Put(":id")
  async update(@Req() request: AuthenticatedRequest, @Param("id") id: string, @Body() body: Record<string, unknown>) {
    return { data: await this.selections.update(request.actor!, id, body ?? {}) };
  }

  @Post(":id/order")
  async order(@Req() request: AuthenticatedRequest, @Param("id") id: string, @Body() body: Record<string, unknown>) {
    return { data: await this.selections.order(request.actor!, id, body ?? {}) };
  }

  @Post(":id/quotation")
  async quotation(@Req() request: AuthenticatedRequest, @Param("id") id: string, @Body() body: Record<string, unknown>) {
    return { data: await this.selections.requestQuotation(request.actor!, id, body ?? {}) };
  }

  @Post(":id/close")
  async close(@Req() request: AuthenticatedRequest, @Param("id") id: string) {
    return { data: await this.selections.close(request.actor!, id) };
  }
}
