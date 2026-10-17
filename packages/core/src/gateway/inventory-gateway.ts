import type { BackendRequestOptions } from "./http";
import type { BackendResult } from "../types/contracts";

type InventoryGatewayDependencies = {
  isBackendApiConfigured: () => boolean;
  backendRequest: <T>(
    path: string,
    options?: BackendRequestOptions
  ) => Promise<BackendResult<T>>;
};

export type PriceListItem = {
  category: string;
  group_name: string;
  item_name: string;
  final_price: number;
  mrp: number;
  /** Only sent to admins; absent for everyone else. */
  cost_price?: number;
  stock_label: string;
};

export type PriceList = {
  configured: boolean;
  syncedAt: string | null;
  items: PriceListItem[];
  categoryImages: Record<string, string>;
};

const PRICE_LIST_UNAVAILABLE = "The price list is not available right now. Please try again shortly.";

export function formatPriceListAmount(value: number) {
  return `\u20b9${Math.round(Number(value) || 0).toLocaleString("en-IN")}`;
}

export function createInventoryGateway({ isBackendApiConfigured, backendRequest }: InventoryGatewayDependencies) {
  async function getPriceList(): Promise<BackendResult<PriceList>> {
    if (!isBackendApiConfigured()) {
      return { data: null, error: PRICE_LIST_UNAVAILABLE };
    }
    return backendRequest("/api/v1/inventory/price-list", { timeoutMs: 30_000 });
  }

  async function syncPriceList(): Promise<BackendResult<{ count: number; syncedAt: string }>> {
    if (!isBackendApiConfigured()) {
      return { data: null, error: PRICE_LIST_UNAVAILABLE };
    }
    return backendRequest("/api/v1/inventory/price-list/sync", { method: "POST", timeoutMs: 60_000 });
  }

  async function savePriceListCategoryImage(category: string, imageUrl: string): Promise<BackendResult<{ category: string; imageUrl: string }>> {
    if (!isBackendApiConfigured()) {
      return { data: null, error: PRICE_LIST_UNAVAILABLE };
    }
    return backendRequest("/api/v1/inventory/price-list/category-image", { method: "POST", body: { category, imageUrl } });
  }

  return {
    getPriceList,
    syncPriceList,
    savePriceListCategoryImage
  };
}
