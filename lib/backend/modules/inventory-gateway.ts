import { createInventoryGateway } from "@mahalaxmi/core/gateway/inventory-gateway";
import { isBackendApiConfigured } from "@/lib/backend/config";
import { getSupabaseBrowserClient } from "@mahalaxmi/core/supabase/client";
import { backendRequest } from "@/lib/backend/http";

const inventoryGateway = createInventoryGateway({
  isBackendApiConfigured,
  backendRequest,
  getSupabaseClient: getSupabaseBrowserClient
});

export const listProductCategories = inventoryGateway.listProductCategories;
export const listProductBrands = inventoryGateway.listProductBrands;
export const listInventoryProducts = inventoryGateway.listInventoryProducts;
export const saveInventoryProduct = inventoryGateway.saveInventoryProduct;
export const updateProductImage = inventoryGateway.updateProductImage;
