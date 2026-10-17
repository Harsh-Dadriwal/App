/**
 * The Tally export has item names only, so category and brand are worked out from the
 * name. Rules are checked top to bottom and the first match wins, so more specific
 * rules (e.g. "geyser coil", "screw driver") sit above broader ones ("coil", "driver").
 */

const CATEGORY_RULES: Array<{ category: string; pattern: RegExp }> = [
  { category: "Tools & Hardware", pattern: /\b(screw|nail|measuring tape|tape|tester|plier|cutter|drill|spanner|hammer|cable tie|insulation|soldering|solder|rawal|punch|bolt|gujja|board wooden)\b/i },
  { category: "Inverters & Power", pattern: /\b(inverter|battery|batteries|ups|stabili[sz]er|stablizer|solar|spike|extension|power strip|charger|cell|duracell)\b/i },
  { category: "Fans", pattern: /\b(fan|fans|bldc|exhaust|v\.?\s?fan|blade|faf|fresh air|refresh air|down rod|bearing)\b/i },
  { category: "Coolers", pattern: /\b(cooler|coolers|f\.cooler)\b/i },
  { category: "Water Heaters", pattern: /\b(geyser|water heater|instant|immersion|heater)\b/i },
  {
    category: "Home & Kitchen Appliances",
    pattern: /\b(mixer|juicer|grinder|jmg|iron|induction|kettle|toaster|chimney|cooktop|cookop|hob|oven|otg|air fryer|fryer|egg boiler|tawa|dosa|dishwasher|hair dryer|vacuum|purifier|ro|filter|press handle|sandwich|tv|led tv|insect killer|mosquito|racket|convector|infrared|room heater|blower|trimmer|cutter|blender|chopper|bottle|flask|cookware|stove|lpg|barbecue|grill|speaker|steamer|straightner|straightener|hood|sauna|jar|freeze stand|water bag|buzzer)\b/i
  },
  { category: "MCB & Distribution", pattern: /\b(mcb|rccb|rcbo|elcb|isolator|db|distribution|changeover|fuse|kitkat|kit kat|spn|tpn|energy meter|meter|bus bar|busbar|lugs?|earthing|hooter|siren)\b/i },
  { category: "Wires & Cables", pattern: /\b(wire|wires|cable|cables|flexible|flexi|cord|lead|core|armoured|coaxial|lan)\b/i },
  { category: "Switches & Sockets", pattern: /\bboard\b.*\d+\s?sw|\b(switch|switches|socket|sockets|plate|regulator|dimmer|indicator|bell push|plug|pin top|top|combined|s\.s|module|jack|usb|bell|knob|blank|insert|conversion|mantradhara|multi holder|connector|ceiling rose|male|female|adaptor|adapter|key tag|dummy|cover)\b/i },
  // Modular switch ranges sold by module count or range code, e.g. "12M Safecon Aurra", "AP04 Safecon Ace".
  { category: "Switches & Sockets", pattern: /(\b\d{1,2}\s?m\b.*\b(safecon|vibcon|elegant|siyaa|stella|indi|anchor|penta|aurra|roma|ziva|camy)\b)|^\s*(ap|cp|hp|kr|vp)\d/i },
  {
    category: "Lighting",
    pattern: /\b(led|lite|lites|light|lights|cob|panel|bulb|batten|lamp|downlight|dl|track|flood|street|strip|rope|jhoomer|chandelier|bulkhead|profile|driver|spot|spotlight|candle|bolard|bollard|garden|hanging|gate|wall|tube|cfl|focus|smps|neon|rgb|pendant|pendent|filament|goti|cyllinder|cylinder|lantern|holder|adopter|blrn|sf|\d+k|\d+krn|series|water fall|torch|ftl|t-?5|helogen|halogen|jdcr|gu-?10|mr-?1[16])\b/i
  },
  // Most lights are named by their wattage, e.g. "07w SF 6KRN Sturlite", "Corvi Flat 4O 6w".
  { category: "Lighting", pattern: /\b\d+(\.\d+)?\s?w\b/i },
  { category: "Boxes, Pipes & Fittings", pattern: /\b(box|boxes|pipe|pipes|conduit|bend|casing|patti|clip|clips|saddle|junction|gang|surface|concealed|tee|elbow|coupler|reducer|gitti|grip)\b/i },
  { category: "Motors, Pumps & Capacitors", pattern: /\b(motor|pump|monoblock|capacitor|mfd|starter|coil|winding)\b/i }
];

// Ordered: when a name carries two brands (a series and its maker), the earlier one wins.
const BRANDS = [
  "Anchor", "Havells", "Polycab", "Finolex", "Legrand", "Schneider", "Panasonic", "Philips", "Crompton", "Bajaj",
  "Orient", "Usha", "V-Guard", "Syska", "Wipro", "Surya", "Luminous", "Symphony", "Bluestar", "Kent",
  "Safecon", "Sturlite", "T-Sun", "Xion", "Vibcon", "Aurra", "Skyline", "Applelite", "Skylab", "Juvas",
  "Indiancab", "Liteon", "Wegrow", "Ecolyf", "Gold Medal", "Bliss", "Sigma", "Krystal", "Corvi", "Altrix",
  "Greensarfer", "Onit", "Ilano", "Maharaja", "Hotmax", "Indo", "Mahalaxmi", "Penta", "Elegant", "Kovis",
  "Satyam", "Kitchenking", "Multifab", "Siyaa"
].map((name) => ({
  name,
  pattern: new RegExp(`(^|[^a-z0-9])${name.toLowerCase().replace(/[-\s]/g, "[-\\s]?")}($|[^a-z0-9])`, "i")
}));

export const OTHER_CATEGORY = "Other";

/**
 * Built-in pictures for each category, served by the web app from public/categories
 * (drawn by scripts/generate-category-images.mjs). Admin uploads replace them.
 */
export const DEFAULT_CATEGORY_IMAGE_FILES: Record<string, string> = {
  Lighting: "lighting.webp",
  Fans: "fans.webp",
  "Switches & Sockets": "switches.webp",
  "Wires & Cables": "wires.webp",
  "MCB & Distribution": "mcb.webp",
  "Inverters & Power": "inverters.webp",
  Coolers: "coolers.webp",
  "Water Heaters": "heaters.webp",
  "Home & Kitchen Appliances": "appliances.webp",
  "Tools & Hardware": "tools.webp",
  "Boxes, Pipes & Fittings": "pipes.webp",
  "Motors, Pumps & Capacitors": "motors.webp",
  [OTHER_CATEGORY]: "other.webp"
};

export function categoryFromName(itemName: string) {
  return CATEGORY_RULES.find((rule) => rule.pattern.test(itemName))?.category ?? OTHER_CATEGORY;
}

export function brandFromName(itemName: string) {
  return BRANDS.find((brand) => brand.pattern.test(itemName))?.name ?? null;
}

/** Lower-cased words of a string with punctuation removed, for search matching. */
export function searchTokens(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9.]+/g, " ").trim().split(/\s+/).filter(Boolean);
}

export type PriceListSort = "relevance" | "name" | "price-asc" | "price-desc" | "stock-desc";
export type PriceListStockFilter = "all" | "in" | "out";

type BrowsableItem = {
  category: string;
  group_name: string;
  item_name: string;
  final_price: number;
  mrp: number;
  stock_label: string;
};

export type IndexedPriceListItem<T extends BrowsableItem> = T & {
  /** Item name without the "(₹1590)" MRP tag Tally names often carry. */
  displayName: string;
  displayCategory: string;
  brand: string | null;
  stockQty: number | null;
  outOfStock: boolean;
  searchText: string;
};

// Tally item names often end with the MRP, e.g. "12w Panel Havells Crysta (₹1590)".
const NAME_PRICE = /\s*\(\s*₹\s*([0-9][0-9,]*(?:\.[0-9]+)?)\s*\)|\s*₹\s*([0-9][0-9,]*(?:\.[0-9]+)?)/;

/** Splits the "(₹1590)" tag off a name; the tag is the MRP (it is at or above the selling price for 99% of items). */
export function splitNamePrice(itemName: string) {
  const match = itemName.match(NAME_PRICE);
  if (!match) return { name: itemName.trim(), price: null };
  const price = Number((match[1] ?? match[2]).replace(/,/g, ""));
  const name = itemName.replace(match[0], " ").replace(/\s{2,}/g, " ").trim();
  return { name: name || itemName.trim(), price: Number.isFinite(price) ? price : null };
}

function stockQuantity(label: string) {
  const match = label.trim().match(/^-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : null;
}

/** Adds the derived category, brand, stock number and search text to every item once. */
export function indexPriceList<T extends BrowsableItem>(items: T[]): IndexedPriceListItem<T>[] {
  return items.map((item) => {
    const { name: displayName, price: namePrice } = splitNamePrice(item.item_name);
    // Use the name's MRP only when the MRP column is empty and it is not below the selling price.
    const mrp = item.mrp || (namePrice && namePrice >= item.final_price ? namePrice : 0);
    const displayCategory = item.category || categoryFromName(item.item_name);
    const brand = brandFromName(item.item_name) ?? (item.group_name || null);
    const stockQty = stockQuantity(item.stock_label);
    return {
      ...item,
      mrp,
      displayName,
      displayCategory,
      brand,
      stockQty,
      outOfStock: stockQty !== null && stockQty <= 0,
      searchText: ` ${searchTokens([item.item_name, displayCategory, brand ?? "", item.group_name].join(" ")).join(" ")}`
    };
  });
}

/** Counts per value, largest first. */
export function countBy<T>(items: T[], key: (item: T) => string | null) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const value = key(item);
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/**
 * Every typed word must appear somewhere in the item's name, brand or category, in any
 * order ("panel 12w havells" finds "12w Panel Havells ..."). With a search, the best
 * matches come first: whole phrase at the start of the name, then anywhere, then the rest.
 */
export function filterPriceList<T extends BrowsableItem>(
  items: IndexedPriceListItem<T>[],
  options: { query: string; category: string | null; brand: string | null; stock: PriceListStockFilter; sort: PriceListSort }
) {
  const tokens = searchTokens(options.query);
  const phrase = tokens.join(" ");
  const matched = items.filter(
    (item) =>
      (!options.category || item.displayCategory === options.category) &&
      (!options.brand || item.brand === options.brand) &&
      (options.stock === "all" || (options.stock === "out" ? item.outOfStock : !item.outOfStock)) &&
      tokens.every((token) => item.searchText.includes(token))
  );

  const byName = (a: IndexedPriceListItem<T>, b: IndexedPriceListItem<T>) => a.displayName.localeCompare(b.displayName);
  const sort = options.sort === "relevance" && !tokens.length ? "name" : options.sort;
  if (sort === "relevance") {
    const rank = (item: IndexedPriceListItem<T>) => {
      const name = ` ${searchTokens(item.displayName).join(" ")}`;
      if (name.startsWith(` ${phrase}`)) return 0;
      if (name.includes(` ${phrase}`)) return 1;
      return 2;
    };
    return matched.map((item) => ({ item, rank: rank(item) })).sort((a, b) => a.rank - b.rank || byName(a.item, b.item)).map(({ item }) => item);
  }
  return [...matched].sort((a, b) => {
    if (sort === "price-asc") return (a.final_price || Infinity) - (b.final_price || Infinity) || byName(a, b);
    if (sort === "price-desc") return b.final_price - a.final_price || byName(a, b);
    if (sort === "stock-desc") return (b.stockQty ?? -1) - (a.stockQty ?? -1) || byName(a, b);
    return byName(a, b);
  });
}

export const PRICE_LIST_SORT_LABELS: Record<PriceListSort, string> = {
  relevance: "Best match",
  name: "Name (A–Z)",
  "price-asc": "Price: low to high",
  "price-desc": "Price: high to low",
  "stock-desc": "Most in stock"
};
