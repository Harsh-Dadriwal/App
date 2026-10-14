import test from "node:test";
import assert from "node:assert/strict";
import { parsePriceListDocument } from "./price-list.parser";

const tallyExport = `{
 "EWSRNO": 1,
 "EWCategory": "Wires",
 "EWGroup": "Polycab 90m",
 "EWItemName": "1.5 sq mm \\"FR\\" Copper Wire",
 "EWMRP": 2450.00,
 "EWDSCMRP": 41 %,
 "EWFINAL": 1445.50,
 "EWCOST": 1300,
 "EWCLSTK": "12 pcs",
 "EWSRNO": 2,
 "EWCategory": "Switches",
 "EWGroup": "Anchor Roma",
 "EWItemName": "6A One Way Switch",
 "EWFINAL": 38,
 "EWCLSTK": "0 pcs",
 "EWSRNO": 3,
 "EWCategory": "Switches"
}`;

const expectedTallyItems = [
  { category: "Wires", group_name: "Polycab 90m", item_name: "1.5 sq mm \"FR\" Copper Wire", final_price: 1445.5, mrp: 2450, cost_price: 1300, stock_label: "12 pcs" },
  { category: "Switches", group_name: "Anchor Roma", item_name: "6A One Way Switch", final_price: 38, mrp: 0, cost_price: 0, stock_label: "0 pcs" }
];

test("reads the raw Tally price list export, skipping records with no item name", () => {
  assert.deepEqual(parsePriceListDocument(Buffer.from(tallyExport, "utf8")), expectedTallyItems);
});

test("decodes the UTF-16LE export with a BOM that Tally writes", () => {
  const buffer = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(tallyExport, "utf16le")]);
  assert.deepEqual(parsePriceListDocument(buffer), expectedTallyItems);
});

const mahalaxmiExport = `{
    "ENVELOPE": {
        "AD SRNO": "1",
        "AD Item Name": "01L Instant Geyser Hotmax 3Kw",
        "AD MRP": 0.00,
        "AD Cost": 850.00,
        "ADLastPurc": 950.00,
        "RTP": 30 %,
        "ADRTP": 1105.00,
        "ADSTRT": 1300.00,
        "RTADMRGN": 53 %,
        "AD Closing Stock": "2 Pcs",
        "AD SRNO": "2",
        "AD Item Name": "6A Switch \\"Roma\\"",
        "ADPACK": "1 Pcs",
        "AD MRP": 1,250.00,
        "AD Cost": 977.00,
        "RTP": 20 %,
        "ADRTP": 1172.00,
        "ADSTRT": 0.00,
        "AD Closing Stock": "0 Pcs"
    }
}`;

test("reads the Mahalaxmi Tally export, using ADSTRT as the price and ADRTP when it is missing", () => {
  const buffer = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(mahalaxmiExport, "utf16le")]);
  assert.deepEqual(parsePriceListDocument(buffer), [
    { category: "", group_name: "", item_name: "01L Instant Geyser Hotmax 3Kw", final_price: 1300, mrp: 0, cost_price: 850, stock_label: "2 Pcs" },
    { category: "", group_name: "", item_name: "6A Switch \"Roma\"", final_price: 1172, mrp: 1250, cost_price: 977, stock_label: "0 Pcs" }
  ]);
});

test("falls back to a plain JSON stock-item export", () => {
  const buffer = Buffer.from(JSON.stringify({ stockItems: [{
    MASTERID: 42, NAME: "1.5 sq mm Copper Wire", PARENT: "Wires", CLOSINGBALANCE: "120 Mtr", CLOSINGRATE: "35.50/Mtr"
  }] }));
  assert.deepEqual(parsePriceListDocument(buffer), [{
    category: "", group_name: "Wires", item_name: "1.5 sq mm Copper Wire", final_price: 35.5, mrp: 0, cost_price: 0, stock_label: "120 Mtr"
  }]);
});

test("returns nothing for an unreadable document", () => {
  assert.deepEqual(parsePriceListDocument(Buffer.from("<html>Sign in</html>")), []);
});
