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
  /** For electricians/architects: their own order, or one of their customers' orders. */
  relation?: "mine" | "customer";
  customer_name?: string;
  /** Only sent to the shop's admins. */
  customer?: { id: string; full_name: string; phone: string | null; role: string | null } | null;
  /** Only for the shop: the electrician/architect who earns incentives on this order. */
  partner?: { id: string; full_name: string; role: string | null } | null;
  from_selection?: boolean;
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

export type QuotationStatus = "requested" | "quoted" | "accepted" | "declined" | "cancelled";

export type QuotationItem = {
  key: string;
  name: string;
  category: string;
  brand: string | null;
  quantity: number;
  /** Shown once the shop has priced the quotation (always to the shop). */
  unit_price?: number;
  mrp?: number;
};

export type Quotation = {
  id: string;
  quotation_number: string;
  status: QuotationStatus;
  expired: boolean;
  note: string | null;
  contact_phone: string | null;
  /** Signed links to the requirement-list photos, valid for an hour. */
  photo_urls: string[];
  admin_note: string | null;
  valid_until: string | null;
  quoted_at: string | null;
  order_request_id: string | null;
  created_at: string;
  subtotal?: number;
  discount_amount?: number;
  total?: number;
  customer?: { id: string; full_name: string; phone: string | null; role: string | null };
  items: QuotationItem[];
};

export type QuotationList = { canManage: boolean; quotations: Quotation[] };

export type CreateQuotationInput = {
  items: Array<{ key: string; quantity: number }>;
  photo_keys: string[];
  note?: string;
  contact_phone?: string;
};

export type QuoteLineInput = { key?: string; name: string; category?: string; brand?: string | null; quantity: number; unit_price: number };

export const QUOTATION_STATUS_LABELS: Record<QuotationStatus, string> = {
  requested: "Waiting for prices",
  quoted: "Quotation ready",
  accepted: "Accepted — ordered",
  declined: "Declined",
  cancelled: "Cancelled"
};

export const MAX_QUOTATION_PHOTOS = 6;

export type SelectionStatus = "active" | "ordered" | "closed";

export type ProductSelection = {
  id: string;
  selection_number: string;
  title: string;
  status: SelectionStatus;
  site_note: string | null;
  customer_name: string | null;
  /** Shown to the professional who made it and to the shop. */
  customer_phone: string | null;
  customer_linked: boolean;
  created_by: { id: string; full_name: string; role: string; phone: string | null } | null;
  created_at: string;
  updated_at: string;
  orders: Array<{ number: string; status: OrderRequestStatus }>;
  quotations: Array<{ number: string; status: QuotationStatus }>;
  /** Only for the shop: what the selection is worth at today's prices. */
  estimated_total?: number;
  items: Array<{ key: string; name: string; category: string; brand: string | null; quantity: number; note: string | null; unit_price?: number | null; in_stock?: boolean }>;
};

export type SelectionList = { role: "admin" | "partner" | "customer"; selections: ProductSelection[] };

export type SaveSelectionInput = {
  title: string;
  customer_name?: string;
  customer_phone?: string;
  site_note?: string;
  items: Array<{ key: string; quantity: number; note?: string }>;
};

export const SELECTION_STATUS_LABELS: Record<SelectionStatus, string> = {
  active: "Shared",
  ordered: "Ordered",
  closed: "Closed"
};

/** Plain-text list for sharing a selection on WhatsApp (never includes prices). */
export function selectionShareText(selection: Pick<ProductSelection, "title" | "selection_number" | "items" | "site_note">, from: string) {
  const lines = selection.items.map((item, index) => `${index + 1}. ${item.name} × ${item.quantity}${item.note ? ` (${item.note})` : ""}`);
  return [
    `*${selection.title}* (${selection.selection_number})`,
    `Products selected by ${from}:`,
    ...lines,
    selection.site_note ? `Note: ${selection.site_note}` : "",
    "Order these in the Mahalaxmi Electricals app → Selections."
  ]
    .filter(Boolean)
    .join("\n");
}

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

  function listQuotations() {
    return backendRequest<QuotationList>("/api/v1/quotations", { timeoutMs: 20_000 });
  }

  /** `form` carries one photo in the "file" field (a File on the web, { uri, name, type } on phones). */
  function uploadQuotationPhoto(form: FormData) {
    return backendRequest<{ key: string }>("/api/v1/quotations/photos", { method: "POST", body: form, timeoutMs: 60_000 });
  }

  function createQuotation(input: CreateQuotationInput) {
    return backendRequest<{ id: string; quotation_number: string; status: QuotationStatus }>("/api/v1/quotations", {
      method: "POST",
      body: input,
      timeoutMs: 20_000
    });
  }

  function sendQuote(quotationId: string, input: { items: QuoteLineInput[]; discount_amount: number; admin_note?: string; valid_days: number }) {
    return backendRequest<{ id: string; status: QuotationStatus; total: number; valid_until: string }>(`/api/v1/quotations/${quotationId}/quote`, {
      method: "POST",
      body: input,
      timeoutMs: 20_000
    });
  }

  function acceptQuotation(quotationId: string, input: { delivery_address: string; contact_phone?: string; note?: string }) {
    return backendRequest<{ id: string; status: QuotationStatus; order_number: string }>(`/api/v1/quotations/${quotationId}/accept`, {
      method: "POST",
      body: input,
      timeoutMs: 20_000
    });
  }

  function closeQuotation(quotationId: string, adminNote?: string) {
    return backendRequest<{ id: string; status: QuotationStatus }>(`/api/v1/quotations/${quotationId}/close`, {
      method: "POST",
      body: adminNote ? { admin_note: adminNote } : {},
      timeoutMs: 15_000
    });
  }

  function listSelections() {
    return backendRequest<SelectionList>("/api/v1/selections", { timeoutMs: 20_000 });
  }

  function saveSelection(input: SaveSelectionInput, selectionId?: string) {
    return backendRequest<{ id: string; selection_number?: string; linked_customer: boolean }>(
      selectionId ? `/api/v1/selections/${selectionId}` : "/api/v1/selections",
      { method: selectionId ? "PUT" : "POST", body: input, timeoutMs: 20_000 }
    );
  }

  function orderSelection(selectionId: string, input: { delivery_address: string; contact_phone?: string; note?: string }) {
    return backendRequest<{ id: string; order_number: string }>(`/api/v1/selections/${selectionId}/order`, { method: "POST", body: input, timeoutMs: 20_000 });
  }

  function quoteSelection(selectionId: string, input: { note?: string; contact_phone?: string } = {}) {
    return backendRequest<{ id: string; quotation_number: string }>(`/api/v1/selections/${selectionId}/quotation`, { method: "POST", body: input, timeoutMs: 20_000 });
  }

  function closeSelection(selectionId: string) {
    return backendRequest<{ id: string; status: SelectionStatus }>(`/api/v1/selections/${selectionId}/close`, { method: "POST", body: {}, timeoutMs: 15_000 });
  }

  return {
    listSelections,
    saveSelection,
    orderSelection,
    quoteSelection,
    closeSelection,
    getPriceCatalog,
    listOrderRequests,
    createOrderRequest,
    updateOrderRequestStatus,
    listQuotations,
    uploadQuotationPhoto,
    createQuotation,
    sendQuote,
    acceptQuotation,
    closeQuotation
  };
}
