import test from "node:test";
import assert from "node:assert/strict";
import { parseTallyStockItems } from "./tally.service";

test("parses the stock item fields exported by Tally", () => {
  const products = parseTallyStockItems(`
    <ENVELOPE><BODY><DATA><COLLECTION>
      <STOCKITEM><NAME>1.5 sq mm Copper Wire</NAME><MASTERID>42</MASTERID><PARENT>Wires</PARENT><BASEUNITS>Mtr</BASEUNITS><CLOSINGBALANCE>120 Mtr</CLOSINGBALANCE><CLOSINGRATE>35.50/Mtr</CLOSINGRATE><HSNCODE>8544</HSNCODE><GSTAPPLICABLE>Applicable</GSTAPPLICABLE></STOCKITEM>
    </COLLECTION></DATA></BODY></ENVELOPE>
  `);

  assert.deepEqual(products, [{
    id: "42",
    name: "1.5 sq mm Copper Wire",
    group: "Wires",
    unit: "Mtr",
    closingBalance: "120 Mtr",
    closingRate: "35.50/Mtr",
    hsnCode: "8544",
    gstApplicable: "Applicable"
  }]);
});
