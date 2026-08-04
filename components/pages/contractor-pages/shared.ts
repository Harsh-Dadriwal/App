import type { AppRole } from "@mahalaxmi/core/types/domain";

export function matchesQuery(value: string, query: string) {
  return value.toLowerCase().includes(query.trim().toLowerCase());
}

export const COMMON_PRODUCT_UNITS = ["pcs", "box", "set", "pair", "m", "kg", "roll", "bundle", "ltr"];

export const ELECTRICIAN_ORDER_ITEM_STEPS = [
  { label: "Site & order", description: "Project and order" },
  { label: "Category", description: "Catalog group" },
  { label: "Brand", description: "Manufacturer" },
  { label: "Product", description: "Pick catalog item" },
  { label: "Line details", description: "Qty, price, approval" }
] as const;

export const ELECTRICIAN_BID_STEPS = [
  { label: "Project & offer", description: "Site and bid amount" },
  { label: "Details", description: "Timeline and notes" }
] as const;

export const ADMIN_MANAGED_USER_ROLES: AppRole[] = [
  "customer",
  "electrician",
  "architect",
  "pop_man",
  "carpenter",
  "painter",
  "tiles_man",
  "plumber",
  "supplier"
];

export const ADMIN_PRODUCT_STEPS = [
  { label: "Category", description: "Where it belongs" },
  { label: "Brand", description: "Manufacturer or line" },
  { label: "Details", description: "Name, code, unit" },
  { label: "Price & photo", description: "Stock and image" }
] as const;
