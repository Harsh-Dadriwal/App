import { BadGatewayException, Injectable, ServiceUnavailableException } from "@nestjs/common";

export type DriveProduct = {
  id: string;
  name: string;
  group: string | null;
  unit: string | null;
  closingBalance: string | null;
  closingRate: string | null;
  hsnCode: string | null;
  gstApplicable: string | null;
};

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function stringValue(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return String(value).trim() || null;
}

function pick(source: JsonRecord, keys: string[]) {
  for (const key of keys) {
    const foundKey = Object.keys(source).find((candidate) => candidate.toLowerCase() === key.toLowerCase());
    if (foundKey) return stringValue(source[foundKey]);
  }
  return null;
}

/** Supports a bare array or common export wrappers: products, items, stockItems, data. */
export function parseDriveProducts(payload: unknown): DriveProduct[] {
  const root = record(payload);
  const items = Array.isArray(payload)
    ? payload
    : ["products", "items", "stockItems", "stock_items", "data"].map((key) => root?.[key]).find(Array.isArray);

  if (!Array.isArray(items)) return [];

  return items.flatMap((item, index) => {
    const source = record(item);
    if (!source) return [];
    const name = pick(source, ["name", "item_name", "stockItemName", "stock_item_name", "stock item name"]);
    if (!name) return [];
    return [{
      id: pick(source, ["id", "masterId", "master_id", "sku", "code"]) ?? `${name}-${index}`,
      name,
      group: pick(source, ["group", "parent", "stockGroup", "stock_group"]),
      unit: pick(source, ["unit", "baseUnits", "base_units"]),
      closingBalance: pick(source, ["closingBalance", "closing_balance", "availableQty", "available_qty", "quantity", "stock"]),
      closingRate: pick(source, ["closingRate", "closing_rate", "rate", "price", "base_price"]),
      hsnCode: pick(source, ["hsnCode", "hsn_code", "hsn"]),
      gstApplicable: pick(source, ["gstApplicable", "gst_applicable", "gst"])
    }];
  });
}

@Injectable()
export class GoogleDriveProductsService {
  private get url() {
    return (process.env.GOOGLE_DRIVE_PRODUCTS_URL || "").trim();
  }

  status() {
    return {
      configured: Boolean(this.url),
      message: this.url
        ? "Stock list is ready. Refresh to load the latest items."
        : "The stock list is not available yet. Please contact support."
    };
  }

  async listProducts(query = "", limit = 100) {
    if (!this.url) throw new ServiceUnavailableException(this.status().message);

    let response: Response;
    try {
      response = await fetch(this.url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(12_000) });
    } catch {
      throw new BadGatewayException("The stock list could not be loaded right now. Please try again shortly.");
    }
    if (!response.ok) throw new BadGatewayException("The stock list could not be loaded right now. Please try again shortly.");

    let payload: unknown;
    try {
      payload = JSON.parse(await response.text());
    } catch {
      throw new BadGatewayException("The stock list is in an unexpected format. Please contact support.");
    }

    const term = query.trim().toLowerCase();
    const allProducts = parseDriveProducts(payload).sort((a, b) => a.name.localeCompare(b.name));
    if (!allProducts.length) {
      throw new BadGatewayException("No stock items were found in the latest list.");
    }
    const products = allProducts.filter((product) => !term || [product.name, product.group, product.hsnCode, product.id].some((value) => value?.toLowerCase().includes(term)));
    return { products: products.slice(0, Math.min(Math.max(limit, 1), 250)), total: products.length };
  }
}
