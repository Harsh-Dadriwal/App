import type { BackendRequestOptions } from "./http";
import type { BackendResult } from "../types/contracts";
import { searchTokens } from "./price-list-taxonomy";

/** A price list item as customers see it: no prices, only whether it is in stock. */
export type CatalogItem = {
  key: string;
  name: string;
  category: string;
  brand: string | null;
  inStock: boolean;
};

export type PriceCatalog = {
  configured: boolean;
  syncedAt: string | null;
  pricesHidden: true;
  items: CatalogItem[];
  categoryImages: Record<string, string>;
};

export type OrderRequestStatus = "submitted" | "confirmed" | "ready" | "delivered" | "cancelled";

export type OrderRequestItem = {
  key: string;
  name: string;
  category: string;
  brand: string | null;
  quantity: number;
  /** Only sent to the shop's admins. */
  unit_price?: number;
  mrp?: number;
};

export type OrderRequest = {
  id: string;
  order_number: string;
  status: OrderRequestStatus;
  delivery_address: string;
  contact_phone: string | null;
  note: string | null;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
  item_count: number;
  total_quantity: number;
  /** Only sent to the shop's admins. */
  customer?: { id: string; full_name: string; phone: string | null; role: string | null } | null;
  estimated_total?: number;
  items: OrderRequestItem[];
};

export type OrderRequestList = { canManage: boolean; orders: OrderRequest[] };

export type CreateOrderRequestInput = {
  items: Array<{ key: string; quantity: number }>;
  delivery_address: string;
  contact_phone?: string;
  note?: string;
};

export const ORDER_STATUS_LABELS: Record<OrderRequestStatus, string> = {
  submitted: "Order received",
  confirmed: "Confirmed",
  ready: "Packed & ready",
  delivered: "Delivered",
  cancelled: "Cancelled"
};

/** The next steps the shop can take on an order, in the order they appear as buttons. */
export const ORDER_NEXT_STATUSES: Record<OrderRequestStatus, OrderRequestStatus[]> = {
  submitted: ["confirmed", "ready", "cancelled"],
  confirmed: ["ready", "delivered", "cancelled"],
  ready: ["delivered", "cancelled"],
  delivered: [],
  cancelled: []
};

export const ORDER_STATUS_ACTIONS: Record<OrderRequestStatus, string> = {
  submitted: "Received",
  confirmed: "Confirm",
  ready: "Mark ready",
  delivered: "Mark delivered",
  cancelled: "Cancel order"
};

export type IndexedCatalogItem = CatalogItem & { searchText: string };

export function indexCatalog(items: CatalogItem[]): IndexedCatalogItem[] {
  return items.map((item) => ({ ...item, searchText: ` ${searchTokens(`${item.name} ${item.brand ?? ""} ${item.category}`).join(" ")}` }));
}

/**
 * Every typed word must appear in the item's name, brand or category, in any order. With a
 * search, names starting with the phrase come first; in-stock items always come before
 * out-of-stock ones.
 */
export function filterCatalog(
  items: IndexedCatalogItem[],
  options: { query: string; category: string | null; brand: string | null; inStockOnly: boolean }
) {
  const tokens = searchTokens(options.query);
  const phrase = ` ${tokens.join(" ")}`;
  const matched = items.filter(
    (item) =>
      (!options.category || item.category === options.category) &&
      (!options.brand || item.brand === options.brand) &&
      (!options.inStockOnly || item.inStock) &&
      tokens.every((token) => item.searchText.includes(token))
  );
  const rank = (item: IndexedCatalogItem) => {
    if (!tokens.length) return 0;
    const name = ` ${searchTokens(item.name).join(" ")}`;
    return name.startsWith(phrase) ? 0 : name.includes(phrase) ? 1 : 2;
  };
  return matched
    .map((item) => ({ item, rank: rank(item) }))
    .sort((a, b) => Number(b.item.inStock) - Number(a.item.inStock) || a.rank - b.rank || a.item.name.localeCompare(b.item.name))
    .map(({ item }) => item);
}

type ShopGatewayDependencies = {
  backendRequest: <T>(path: string, options?: BackendRequestOptions) => Promise<BackendResult<T>>;
};

export function createShopGateway({ backendRequest }: ShopGatewayDependencies) {
  function getPriceCatalog() {
    return backendRequest<PriceCatalog>("/api/v1/inventory/catalog", { timeoutMs: 30_000 });
  }

  function listOrderRequests() {
    return backendRequest<OrderRequestList>("/api/v1/order-requests", { timeoutMs: 15_000 });
  }

  function createOrderRequest(input: CreateOrderRequestInput) {
    return backendRequest<{ id: string; order_number: string; status: OrderRequestStatus; item_count: number }>("/api/v1/order-requests", {
      method: "POST",
      body: input,
      timeoutMs: 20_000
    });
  }

  function updateOrderRequestStatus(orderId: string, status: OrderRequestStatus, adminNote?: string) {
    return backendRequest<{ id: string; status: OrderRequestStatus }>(`/api/v1/order-requests/${orderId}/status`, {
      method: "POST",
      body: { status, ...(adminNote ? { admin_note: adminNote } : {}) },
      timeoutMs: 15_000
    });
  }

  return { getPriceCatalog, listOrderRequests, createOrderRequest, updateOrderRequestStatus };
}
