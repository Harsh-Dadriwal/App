import type { BackendRequestOptions } from "./http";
import type { BackendResult } from "../types/contracts";

type InventoryGatewayDependencies = {
  isBackendApiConfigured: () => boolean;
  backendRequest: <T>(
    path: string,
    options?: BackendRequestOptions
  ) => Promise<BackendResult<T>>;
  getSupabaseClient: () => Promise<any | null> | any | null;
};

export function createInventoryGateway({
  isBackendApiConfigured,
  backendRequest,
  getSupabaseClient
}: InventoryGatewayDependencies) {
  async function listProductCategories(): Promise<BackendResult<any[]>> {
    if (isBackendApiConfigured()) {
      const result = await backendRequest<any[]>(`/api/v1/inventory/categories`);
      if (result.data || !result.error) {
        return { data: result.data ?? [], error: null };
      }
    }

    const supabase = await getSupabaseClient();
    if (!supabase) {
      return { data: [], error: "Supabase is not configured." };
    }

    const { data, error } = await supabase.from("product_categories").select("id, name").order("name");
    return { data: data ?? [], error: error?.message ?? null };
  }

  async function listProductBrands(): Promise<BackendResult<any[]>> {
    if (isBackendApiConfigured()) {
      const result = await backendRequest<any[]>(`/api/v1/inventory/brands`);
      if (result.data || !result.error) {
        return { data: result.data ?? [], error: null };
      }
    }

    const supabase = await getSupabaseClient();
    if (!supabase) {
      return { data: [], error: "Supabase is not configured." };
    }

    const { data, error } = await supabase
      .from("product_brands")
      .select("id, name, category_id")
      .order("name");
    return { data: data ?? [], error: error?.message ?? null };
  }

  async function listInventoryProducts(): Promise<BackendResult<any[]>> {
    if (isBackendApiConfigured()) {
      const result = await backendRequest<any[]>(`/api/v1/inventory/products`);
      if (result.data || !result.error) {
        return { data: result.data ?? [], error: null };
      }
    }

    const supabase = await getSupabaseClient();
    if (!supabase) {
      return { data: [], error: "Supabase is not configured." };
    }

    const { data, error } = await supabase
      .from("products")
      .select("id, category_id, brand_id, item_name, sku, unit, base_price, stock_status, image_url")
      .order("item_name", { ascending: true });
    return { data: data ?? [], error: error?.message ?? null };
  }

  async function saveInventoryProduct(args: {
    editingId?: string | null;
    payload: Record<string, unknown>;
  }): Promise<BackendResult<{ id: string; sku: string | null }>> {
    if (isBackendApiConfigured()) {
      const path = args.editingId
        ? `/api/v1/inventory/products/${args.editingId}`
        : `/api/v1/inventory/products`;
      const method = args.editingId ? "PATCH" : "POST";
      const result = await backendRequest<{ id: string; sku: string | null }>(path, {
        method,
        body: args.payload
      });

      if (result.data || !result.error) {
        return result;
      }
    }

    const supabase = await getSupabaseClient();
    if (!supabase) {
      return { data: null, error: "Supabase is not configured." };
    }

    const result = args.editingId
      ? await supabase.from("products").update(args.payload).eq("id", args.editingId).select("id, sku").single()
      : await supabase.from("products").insert(args.payload).select("id, sku").single();

    return { data: result.data ?? null, error: result.error?.message ?? null };
  }

  async function updateProductImage(productId: string, imageUrl: string) {
    if (isBackendApiConfigured()) {
      const result = await backendRequest(`/api/v1/inventory/products/${productId}/image`, {
        method: "POST",
        body: { imageUrl }
      });

      if (result.data || !result.error) {
        return result;
      }
    }

    const supabase = await getSupabaseClient();
    if (!supabase) {
      return { data: null, error: "Supabase is not configured." };
    }

    const result = await supabase.from("products").update({ image_url: imageUrl }).eq("id", productId);
    return { data: result.data ?? null, error: result.error?.message ?? null };
  }

  return {
    listProductCategories,
    listProductBrands,
    listInventoryProducts,
    saveInventoryProduct,
    updateProductImage
  };
}
