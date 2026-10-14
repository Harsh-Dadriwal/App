export type ParsedPriceListItem = {
  category: string;
  group_name: string;
  item_name: string;
  final_price: number;
  mrp: number;
  cost_price: number;
  stock_label: string;
};

type JsonRecord = Record<string, unknown>;

/**
 * Field names used by each known Tally TDL export. Every record starts with its `marker`
 * key; lists of keys are tried in order and the first one with a value wins.
 */
type TallyFormat = {
  marker: string;
  itemName: string;
  category: string[];
  group: string[];
  finalPrice: string[];
  mrp: string[];
  cost: string[];
  stock: string[];
};

const TALLY_FORMATS: TallyFormat[] = [
  // Electro World export.
  {
    marker: "EWSRNO",
    itemName: "EWItemName",
    category: ["EWCategory"],
    group: ["EWGroup"],
    finalPrice: ["EWFINAL"],
    mrp: ["EWMRP"],
    cost: ["EWCOST"],
    stock: ["EWCLSTK"]
  },
  // Mahalaxmi export. ADSTRT is the selling price (AD Cost plus the RTADMRGN margin);
  // ADRTP (cost plus the RTP markup) is used when ADSTRT is missing. It has no category or
  // group yet; the keys listed here are picked up automatically if they are added to the TDL.
  {
    marker: "AD SRNO",
    itemName: "AD Item Name",
    category: ["AD Category", "ADCategory", "ADCATEGORY"],
    group: ["AD Group", "ADGroup", "ADGROUP"],
    finalPrice: ["ADSTRT", "ADRTP"],
    mrp: ["AD MRP", "ADMRP"],
    cost: ["AD Cost", "ADCOST"],
    stock: ["AD Closing Stock", "ADCLSTK"]
  }
];

function decodeText(buffer: Buffer) {
  if (buffer[0] === 0xff && buffer[1] === 0xfe) return buffer.toString("utf16le").slice(1);
  if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) return buffer.toString("utf8").slice(1);
  return buffer.toString("utf8");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const stringPatterns = new Map<string, RegExp>();
const numberPatterns = new Map<string, RegExp>();

function extractString(record: string, keys: string[]) {
  for (const key of keys) {
    let pattern = stringPatterns.get(key);
    if (!pattern) {
      pattern = new RegExp(`"${escapeRegExp(key)}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`);
      stringPatterns.set(key, pattern);
    }
    const value = record.match(pattern)?.[1].replace(/\\(.)/g, "$1").trim();
    if (value) return value;
  }
  return "";
}

function extractNumber(record: string, keys: string[]) {
  for (const key of keys) {
    let pattern = numberPatterns.get(key);
    if (!pattern) {
      pattern = new RegExp(`"${escapeRegExp(key)}"\\s*:\\s*"?\\s*(-?[0-9][0-9,]*\\.?[0-9]*)`);
      numberPatterns.set(key, pattern);
    }
    const match = record.match(pattern);
    const value = match ? Number(match[1].replace(/,/g, "")) : NaN;
    if (Number.isFinite(value) && value !== 0) return value;
  }
  return 0;
}

/**
 * Tally TDL exports are named *.json but are not valid JSON: UTF-16LE with a BOM, records
 * back to back with no array wrapper, and unquoted values such as `"RTP": 30 %,`. Each
 * record is therefore read field by field.
 */
function parseTallyRecords(text: string): ParsedPriceListItem[] {
  const format = TALLY_FORMATS.find((candidate) => new RegExp(`"${escapeRegExp(candidate.marker)}"\\s*:`).test(text));
  if (!format) return [];

  const splitter = new RegExp(`(?="${escapeRegExp(format.marker)}"\\s*:)`, "g");
  return text.split(splitter).slice(1).flatMap((record) => {
    const itemName = extractString(record, [format.itemName]);
    if (!itemName) return [];
    return [{
      category: extractString(record, format.category),
      group_name: extractString(record, format.group),
      item_name: itemName,
      final_price: extractNumber(record, format.finalPrice),
      mrp: extractNumber(record, format.mrp),
      cost_price: extractNumber(record, format.cost),
      stock_label: extractString(record, format.stock)
    }];
  });
}

function record(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function pick(source: JsonRecord, keys: string[]) {
  for (const key of keys) {
    const foundKey = Object.keys(source).find((candidate) => candidate.toLowerCase() === key.toLowerCase());
    const value = foundKey ? source[foundKey] : null;
    if (value !== null && value !== undefined && String(value).trim()) return String(value).trim();
  }
  return null;
}

function leadingNumber(value: string | null) {
  const parsed = value ? Number.parseFloat(value.replace(/,/g, "")) : NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Plain JSON stock-item exports: a bare array or a products/items/stockItems/data wrapper. */
function parseJsonStockItems(text: string): ParsedPriceListItem[] {
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return [];
  }

  const root = record(payload);
  const items = Array.isArray(payload)
    ? payload
    : ["products", "items", "stockItems", "stock_items", "data"].map((key) => root?.[key]).find(Array.isArray);
  if (!Array.isArray(items)) return [];

  return items.flatMap((item) => {
    const source = record(item);
    const itemName = source ? pick(source, ["name", "item_name", "stockItemName", "stock_item_name", "stock item name"]) : null;
    if (!source || !itemName) return [];
    return [{
      category: pick(source, ["category", "stockCategory", "stock_category"]) ?? "",
      group_name: pick(source, ["group", "group_name", "parent", "stockGroup", "stock_group"]) ?? "",
      item_name: itemName,
      final_price: leadingNumber(pick(source, ["final_price", "finalPrice", "closingRate", "closing_rate", "rate", "price", "base_price"])),
      mrp: leadingNumber(pick(source, ["mrp"])),
      cost_price: leadingNumber(pick(source, ["cost_price", "costPrice", "cost"])),
      stock_label: pick(source, ["stock_label", "closingBalance", "closing_balance", "availableQty", "available_qty", "quantity", "stock"]) ?? ""
    }];
  });
}

export function parsePriceListDocument(buffer: Buffer): ParsedPriceListItem[] {
  const text = decodeText(buffer);
  const tallyItems = parseTallyRecords(text);
  return tallyItems.length ? tallyItems : parseJsonStockItems(text);
}
