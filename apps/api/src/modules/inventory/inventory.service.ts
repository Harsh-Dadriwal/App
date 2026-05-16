import { Injectable } from "@nestjs/common";
import { SupabaseAdminService } from "../../common/supabase/supabase-admin.service";
import { QUEUE_NAMES } from "../../common/queue/queue.constants";
import { QueueService } from "../../common/queue/queue.service";
import { TenantAccessService } from "../../common/tenancy/tenant-access.service";
import type { RequestActor } from "../../common/auth/auth.types";

@Injectable()
export class InventoryService {
  constructor(
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly queueService: QueueService,
    private readonly tenantAccess: TenantAccessService
  ) {}

  private async requireTenantId(actor: RequestActor) {
    const tenantId = actor.defaultTenantId;
    if (!tenantId) {
      throw new Error("No active tenant selected.");
    }

    await this.tenantAccess.assertTenantAccess(actor, tenantId);
    return tenantId;
  }

  async listCategories(actor: RequestActor, accessToken: string) {
    const tenantId = await this.requireTenantId(actor);
    const result = await this.supabaseAdmin.createUserClient(accessToken)
      .from("product_categories")
      .select("id, name")
      .eq("tenant_id", tenantId)
      .order("name");

    if (result.error) {
      throw new Error(result.error.message);
    }

    return result.data ?? [];
  }

  async listBrands(actor: RequestActor, accessToken: string) {
    const tenantId = await this.requireTenantId(actor);
    const result = await this.supabaseAdmin.createUserClient(accessToken)
      .from("product_brands")
      .select("id, name, category_id")
      .eq("tenant_id", tenantId)
      .order("name");

    if (result.error) {
      throw new Error(result.error.message);
    }

    return result.data ?? [];
  }

  async listProducts(actor: RequestActor, accessToken: string) {
    const tenantId = await this.requireTenantId(actor);
    const result = await this.supabaseAdmin.createUserClient(accessToken)
      .from("products")
      .select("id, category_id, brand_id, item_name, sku, unit, base_price, stock_status, image_url")
      .eq("tenant_id", tenantId)
      .order("item_name", { ascending: true });

    if (result.error) {
      throw new Error(result.error.message);
    }

    return result.data ?? [];
  }

  async saveProduct(actor: RequestActor, accessToken: string, productId: string | null, payload: Record<string, unknown>) {
    const tenantId = await this.requireTenantId(actor);
    const supabase = this.supabaseAdmin.createUserClient(accessToken);
    const writePayload = {
      ...payload,
      tenant_id: tenantId
    };
    const result = productId
      ? await supabase.from("products").update(writePayload).eq("id", productId).eq("tenant_id", tenantId).select("id, sku").single()
      : await supabase.from("products").insert(writePayload).select("id, sku").single();

    if (result.error) {
      throw new Error(result.error.message);
    }

    await this.queueService.enqueue(QUEUE_NAMES.inventoryReorder, "sync-product-inventory", {
      productId: result.data.id,
      sku: result.data.sku
    }, {
      jobId: `sync-product-${result.data.id}`,
      removeOnComplete: true
    });

    return result.data;
  }

  async updateProductImage(actor: RequestActor, accessToken: string, productId: string, imageUrl: string) {
    const tenantId = await this.requireTenantId(actor);
    const result = await this.supabaseAdmin.createUserClient(accessToken)
      .from("products")
      .update({ image_url: imageUrl })
      .eq("id", productId)
      .eq("tenant_id", tenantId);

    if (result.error) {
      throw new Error(result.error.message);
    }

    return { id: productId, imageUrl };
  }

  async listLowStockAlerts(actor: RequestActor, accessToken: string) {
    const tenantId = await this.requireTenantId(actor);
    const result = await this.supabaseAdmin.createReadUserClient(accessToken)
      .from("product_inventory")
      .select("product_id, available_qty, reserved_qty, reorder_level, products:products(id, item_name, sku, stock_status, tenant_id)")
      .order("updated_at", { ascending: false });

    if (result.error) {
      throw new Error(result.error.message);
    }

    return (result.data ?? []).filter(
      (row: any) =>
        String(row.products?.tenant_id ?? "") === tenantId &&
        Number(row.available_qty ?? 0) <= Number(row.reorder_level ?? 0)
    );
  }

  async listInventoryVelocity(actor: RequestActor, accessToken: string, days: number = 30) {
    const tenantId = await this.requireTenantId(actor);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - days);

    // Get supplied order items within the last X days for this tenant
    const result = await this.supabaseAdmin.createReadUserClient(accessToken)
      .from("order_items")
      .select("product_id, quantity_supplied, products:product_id(item_name, sku, tenant_id)")
      .eq("status", "supplied")
      .gte("supplied_at", thirtyDaysAgo.toISOString());

    if (result.error) {
      throw new Error(result.error.message);
    }

    const tenantItems = (result.data ?? []).filter((row: any) => String(row.products?.tenant_id ?? "") === tenantId);

    // Aggregate quantities by product
    const velocityMap = new Map<string, { productId: string; itemName: string; sku: string; totalSupplied: number }>();
    
    for (const item of tenantItems) {
      const pId = item.product_id;
      // Handle Supabase returning an array or object for a joined relation depending on schema
      const productObj = Array.isArray(item.products) ? item.products[0] : item.products;
      
      if (!velocityMap.has(pId)) {
        velocityMap.set(pId, {
          productId: pId,
          itemName: productObj?.item_name || "Unknown",
          sku: productObj?.sku || "Unknown",
          totalSupplied: 0
        });
      }
      const entry = velocityMap.get(pId)!;
      entry.totalSupplied += Number(item.quantity_supplied || 0);
    }

    return Array.from(velocityMap.values()).sort((a, b) => b.totalSupplied - a.totalSupplied);
  }
}
