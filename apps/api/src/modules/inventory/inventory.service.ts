import { ForbiddenException, Injectable } from "@nestjs/common";
import { TenantAccessService } from "../../common/tenancy/tenant-access.service";
import type { RequestActor } from "../../common/auth/auth.types";

export type InventoryAction =
  | "view_products"
  | "view_price_list"
  | "create_product"
  | "edit_product"
  | "change_price"
  | "change_stock"
  | "delete_product"
  | "import_products"
  | "export_products";

@Injectable()
export class InventoryService {
  constructor(private readonly tenantAccess: TenantAccessService) {}

  async requireTenantId(actor: RequestActor) {
    const tenantId = actor.defaultTenantId;
    if (!tenantId) {
      throw new Error("No active tenant selected.");
    }

    await this.tenantAccess.assertTenantAccess(actor, tenantId);
    return tenantId;
  }

  public assertInventoryPermission(actor: RequestActor, action: InventoryAction) {
    const role = (actor.role || "").toLowerCase();
    const isAllowed =
      role === "admin" ||
      role === "tenant_admin" ||
      role === "inventory_manager" ||
      (action === "view_products") ||
      (action === "view_price_list" && (role === "warehouse_manager" || role === "pricing_manager")) ||
      (action === "change_stock" && role === "warehouse_manager") ||
      (action === "change_price" && role === "pricing_manager");

    if (!isAllowed) {
      throw new ForbiddenException("You do not have permission to do this.");
    }
  }

  /** Cost price shows what items cost the business, so it stays with admins. */
  public canViewCostPrice(actor: RequestActor) {
    const role = (actor.role || "").toLowerCase();
    return role === "admin" || role === "tenant_admin";
  }
}
