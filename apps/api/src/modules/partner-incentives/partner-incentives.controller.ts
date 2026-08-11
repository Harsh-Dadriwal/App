import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import { SupabaseAuthGuard } from "../../common/auth/supabase-auth.guard";
import type { AuthenticatedRequest } from "../../common/auth/authenticated-request";
import { PartnerIncentivesService } from "./partner-incentives.service";

@Controller("/api/v1")
@UseGuards(SupabaseAuthGuard)
export class PartnerIncentivesController {
  constructor(private readonly incentivesService: PartnerIncentivesService) {}

  private getAccessToken(request: AuthenticatedRequest) {
    const authHeader = request.headers.authorization || "";
    return authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
  }

  @Get("/partner/incentives")
  async partnerIncentives(@Req() request: AuthenticatedRequest) {
    return { data: await this.incentivesService.listPartnerDashboard(request.actor!, this.getAccessToken(request)) };
  }

  @Get("/partner/ledger")
  async partnerLedger(@Req() request: AuthenticatedRequest) {
    const data = await this.incentivesService.listPartnerDashboard(request.actor!, this.getAccessToken(request));
    return { data: data.ledger };
  }

  @Get("/partner/business")
  async partnerBusiness(@Req() request: AuthenticatedRequest) {
    const data = await this.incentivesService.listPartnerDashboard(request.actor!, this.getAccessToken(request));
    return { data: data.progress };
  }

  @Get("/partner/progress")
  async partnerProgress(@Req() request: AuthenticatedRequest) {
    const data = await this.incentivesService.listPartnerDashboard(request.actor!, this.getAccessToken(request));
    return { data: data.progress };
  }

  @Get("/admin/incentive-schemes")
  async adminOverview(@Req() request: AuthenticatedRequest, @Query("tenantId") tenantId?: string) {
    return { data: await this.incentivesService.listAdminOverview(request.actor!, this.getAccessToken(request), tenantId) };
  }

  @Post("/admin/incentive-schemes")
  async createScheme(@Req() request: AuthenticatedRequest, @Body() body: Record<string, unknown>) {
    return { data: await this.incentivesService.saveScheme(request.actor!, this.getAccessToken(request), body as any) };
  }

  @Put("/admin/incentive-schemes/:id")
  async updateScheme(@Req() request: AuthenticatedRequest, @Param("id") id: string, @Body() body: Record<string, unknown>) {
    return { data: await this.incentivesService.saveScheme(request.actor!, this.getAccessToken(request), body as any, id) };
  }

  @Patch("/admin/incentive-schemes/:id")
  async patchScheme(@Req() request: AuthenticatedRequest, @Param("id") id: string, @Body() body: Record<string, unknown>) {
    return { data: await this.incentivesService.saveScheme(request.actor!, this.getAccessToken(request), body as any, id) };
  }

  @Post("/admin/incentive-schemes/:id/duplicate")
  async duplicateScheme(@Req() request: AuthenticatedRequest, @Param("id") id: string) {
    return { data: await this.incentivesService.duplicateScheme(request.actor!, this.getAccessToken(request), id) };
  }

  @Delete("/admin/incentive-schemes/:id")
  async deleteScheme(@Req() request: AuthenticatedRequest, @Param("id") id: string) {
    return { data: await this.incentivesService.deleteScheme(request.actor!, this.getAccessToken(request), id) };
  }

  @Post("/admin/slabs")
  async createSlab(@Req() request: AuthenticatedRequest, @Body() body: Record<string, unknown>) {
    return { data: await this.incentivesService.saveSlab(request.actor!, this.getAccessToken(request), body as any) };
  }

  @Put("/admin/slabs/:id")
  async updateSlab(@Req() request: AuthenticatedRequest, @Param("id") id: string, @Body() body: Record<string, unknown>) {
    return { data: await this.incentivesService.saveSlab(request.actor!, this.getAccessToken(request), body as any, id) };
  }

  @Delete("/admin/slabs/:id")
  async deleteSlab(@Req() request: AuthenticatedRequest, @Param("id") id: string) {
    return { data: await this.incentivesService.deleteSlab(request.actor!, this.getAccessToken(request), id) };
  }

  @Patch("/admin/slabs/reorder")
  async reorderSlabs(@Req() request: AuthenticatedRequest, @Body() body: { ids: string[] }) {
    return { data: await this.incentivesService.reorderSlabs(request.actor!, this.getAccessToken(request), body.ids) };
  }

  @Get("/admin/reward-redemptions")
  async listRedemptions(
    @Req() request: AuthenticatedRequest,
    @Query("tenantId") tenantId?: string,
    @Query("status") status?: string
  ) {
    return { data: await this.incentivesService.listRedemptions(request.actor!, this.getAccessToken(request), tenantId, status) };
  }

  @Patch("/admin/reward-redemptions/:id")
  async resolveRedemption(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() body: { status: "approved" | "rejected" | "fulfilled" | "cancelled"; notes?: string }
  ) {
    return { data: await this.incentivesService.resolveRedemption(request.actor!, this.getAccessToken(request), id, body.status, body.notes) };
  }
}
