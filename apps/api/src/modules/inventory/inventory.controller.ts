import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { SupabaseAuthGuard } from "../../common/auth/supabase-auth.guard";
import { InventoryService } from "./inventory.service";
import { TallyService } from "./tally.service";
import type { AuthenticatedRequest } from "../../common/auth/authenticated-request";

@Controller("/api/v1/inventory")
@UseGuards(SupabaseAuthGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService, private readonly tallyService: TallyService) {}

  private getAccessToken(request: AuthenticatedRequest) {
    const authHeader = request.headers.authorization || "";
    return authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
  }

  @Get("/categories")
  async listCategories(@Req() request: AuthenticatedRequest) {
    return { data: await this.inventoryService.listCategories(request.actor!, this.getAccessToken(request)) };
  }

  @Get("/brands")
  async listBrands(@Req() request: AuthenticatedRequest) {
    return { data: await this.inventoryService.listBrands(request.actor!, this.getAccessToken(request)) };
  }

  @Get("/products")
  async listProducts(@Req() request: AuthenticatedRequest) {
    return { data: await this.inventoryService.listProducts(request.actor!, this.getAccessToken(request)) };
  }

  @Get("/tally/status")
  async tallyStatus(@Req() request: AuthenticatedRequest) {
    this.inventoryService.assertInventoryPermission(request.actor!, "view_products");
    return { data: this.tallyService.status() };
  }

  @Get("/tally/products")
  async listTallyProducts(@Req() request: AuthenticatedRequest, @Query("query") query?: string, @Query("limit") limit?: string) {
    this.inventoryService.assertInventoryPermission(request.actor!, "view_products");
    return { data: await this.tallyService.listProducts(query, Number(limit) || 100) };
  }

  @Get("/alerts/low-stock")
  async lowStockAlerts(@Req() request: AuthenticatedRequest) {
    return { data: await this.inventoryService.listLowStockAlerts(request.actor!, this.getAccessToken(request)) };
  }

  @Get("/alerts/velocity")
  async inventoryVelocity(@Req() request: AuthenticatedRequest) {
    return { data: await this.inventoryService.listInventoryVelocity(request.actor!, this.getAccessToken(request), 30) };
  }

  @Post("/products")
  async createProduct(@Req() request: AuthenticatedRequest, @Body() body: Record<string, unknown>) {
    return { data: await this.inventoryService.saveProduct(request.actor!, this.getAccessToken(request), null, body) };
  }

  @Patch("/products/:id")
  async updateProduct(@Req() request: AuthenticatedRequest, @Param("id") id: string, @Body() body: Record<string, unknown>) {
    return { data: await this.inventoryService.saveProduct(request.actor!, this.getAccessToken(request), id, body) };
  }

  @Post("/products/:id/image")
  async updateImage(@Req() request: AuthenticatedRequest, @Param("id") id: string, @Body() body: { imageUrl: string }) {
    return { data: await this.inventoryService.updateProductImage(request.actor!, this.getAccessToken(request), id, body.imageUrl) };
  }
}
