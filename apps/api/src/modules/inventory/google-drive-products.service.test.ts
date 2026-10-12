import test from "node:test";
import assert from "node:assert/strict";
import { parseDriveProducts } from "./google-drive-products.service";

test("normalizes a Tally JSON stock-item export from Google Drive", () => {
  assert.deepEqual(parseDriveProducts({ stockItems: [{
    MASTERID: 42, NAME: "1.5 sq mm Copper Wire", PARENT: "Wires", BASEUNITS: "Mtr",
    CLOSINGBALANCE: "120 Mtr", CLOSINGRATE: "35.50/Mtr", HSNCODE: "8544", GSTAPPLICABLE: "Applicable"
  }] }), [{
    id: "42", name: "1.5 sq mm Copper Wire", group: "Wires", unit: "Mtr", closingBalance: "120 Mtr",
    closingRate: "35.50/Mtr", hsnCode: "8544", gstApplicable: "Applicable"
  }]);
});
