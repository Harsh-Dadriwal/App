import { Body, Controller, Get, Headers, Post, Req, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { SupabaseAuthGuard } from "../../common/auth/supabase-auth.guard";
import { InventoryService } from "./inventory.service";
import { PriceListService, type PriceListView } from "./price-list.service";
import type { AuthenticatedRequest } from "../../common/auth/authenticated-request";

@Controller("/api/v1/inventory")
@UseGuards(SupabaseAuthGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService, private readonly priceList: PriceListService) {}

  /** Sends 304 when the caller already has this exact copy (the list runs to thousands of rows). */
  private async sendPriceList(tenantId: string, view: PriceListView, ifNoneMatch: string | undefined, response: Response) {
    const { etag, data } = await this.priceList.list(tenantId, view);
    response.setHeader("ETag", etag);
    response.setHeader("Cache-Control", "private, no-cache");
    if (ifNoneMatch && ifNoneMatch.split(",").map((tag) => tag.trim()).includes(etag)) {
      response.status(304);
      return undefined;
    }
    return { data };
  }

  /** Full price list with prices, for the shop's staff. */
  @Get("/price-list")
  async listPriceList(
    @Req() request: AuthenticatedRequest,
    @Headers("if-none-match") ifNoneMatch: string | undefined,
    @Res({ passthrough: true }) response: Response
  ) {
    this.inventoryService.assertInventoryPermission(request.actor!, "view_price_list");
    const tenantId = await this.inventoryService.requireTenantId(request.actor!);
    const view: PriceListView = this.inventoryService.canViewCostPrice(request.actor!) ? "full" : "prices";
    return this.sendPriceList(tenantId, view, ifNoneMatch, response);
  }

  /** What anyone signed in can order from: names, categories, pictures and availability, no prices. */
  @Get("/catalog")
  async listCatalog(
    @Req() request: AuthenticatedRequest,
    @Headers("if-none-match") ifNoneMatch: string | undefined,
    @Res({ passthrough: true }) response: Response
  ) {
    const tenantId = await this.inventoryService.requireTenantId(request.actor!);
    return this.sendPriceList(tenantId, "catalog", ifNoneMatch, response);
  }

  @Post("/price-list/sync")
  async syncPriceList(@Req() request: AuthenticatedRequest) {
    this.inventoryService.assertInventoryPermission(request.actor!, "import_products");
    const tenantId = await this.inventoryService.requireTenantId(request.actor!);
    return { data: await this.priceList.sync(tenantId) };
  }

  @Post("/price-list/category-image")
  async savePriceListCategoryImage(@Req() request: AuthenticatedRequest, @Body() body: { category?: string; imageUrl?: string }) {
    this.inventoryService.assertInventoryPermission(request.actor!, "import_products");
    const tenantId = await this.inventoryService.requireTenantId(request.actor!);
    return { data: await this.priceList.saveCategoryImage(tenantId, body?.category, body?.imageUrl) };
  }
}
