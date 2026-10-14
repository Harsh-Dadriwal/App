import test from "node:test";
import assert from "node:assert/strict";
import {
  brandFromName,
  categoryFromName,
  filterPriceList,
  indexPriceList,
  splitNamePrice
} from "../../core/gateway/price-list-taxonomy";

test("works out category and brand from Tally item names", () => {
  assert.equal(categoryFromName("01L Instant Geyser Hotmax 3Kw"), "Water Heaters");
  assert.equal(categoryFromName("Geyser Coil Tikona 2KW 7\" TP"), "Water Heaters");
  assert.equal(categoryFromName("07w SF 6KRN Sturlite (₹535) S-Twist"), "Lighting");
  assert.equal(categoryFromName("Screw Driver S19 4\" (Star)"), "Tools & Hardware");
  assert.equal(categoryFromName("12M Safecon Aurra (₹308) TP Black"), "Switches & Sockets");
  assert.equal(categoryFromName("MCB 06A SP Anchor"), "MCB & Distribution");
  assert.equal(categoryFromName("Wire Flexible 14/40 (₹835) Copper Juvas"), "Wires & Cables");
  assert.equal(brandFromName("65175B Penta Zen Switch 16A 1M Anchor(₹172)"), "Anchor");
  assert.equal(brandFromName("5L Water Heater V-Guard Maha"), "V-Guard");
  assert.equal(brandFromName("Measuring Tape 3M RG"), null);
});

test("reads the MRP tag out of item names", () => {
  assert.deepEqual(splitNamePrice("12w 3KRN Havells Crysta (₹1,590) Rimless"), { name: "12w 3KRN Havells Crysta Rimless", price: 1590 });
  assert.deepEqual(splitNamePrice("MCB 06A SP Anchor"), { name: "MCB 06A SP Anchor", price: null });
});

const base = { category: "", group_name: "", cost_price: 0 };
const items = indexPriceList([
  { ...base, item_name: "12w Panel Havells Crysta (₹900)", final_price: 600, mrp: 0, stock_label: "4 Pcs" },
  { ...base, item_name: "Panel Box 8M Safecon", final_price: 300, mrp: 0, stock_label: "0 Pcs" },
  { ...base, item_name: "Havells Fan Efficiencia (₹100)", final_price: 2500, mrp: 0, stock_label: "2 Pcs" }
]);

test("uses the name's MRP only when it is not below the selling price", () => {
  assert.equal(items[0].mrp, 900);
  assert.equal(items[0].displayName, "12w Panel Havells Crysta");
  assert.equal(items[2].mrp, 0);
});

test("search matches every word in any order, with filters and stock", () => {
  const names = (list: typeof items) => list.map((item) => item.displayName);
  assert.deepEqual(names(filterPriceList(items, { query: "havells panel", category: null, brand: null, stock: "all", sort: "relevance" })), ["12w Panel Havells Crysta"]);
  assert.deepEqual(names(filterPriceList(items, { query: "panel", category: null, brand: null, stock: "in", sort: "relevance" })), ["12w Panel Havells Crysta"]);
  assert.deepEqual(names(filterPriceList(items, { query: "", category: null, brand: "Havells", stock: "all", sort: "price-desc" })), ["Havells Fan Efficiencia", "12w Panel Havells Crysta"]);
});
