import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { PriceListService, priceListItemKey } from "./price-list.service";

type Row = Record<string, any>;

const tallyExport = `{
 "EWSRNO": 1, "EWCategory": "Wires", "EWGroup": "Polycab", "EWItemName": "1.5 sq mm Copper Wire (₹2450)",
 "EWMRP": 2450.00, "EWFINAL": 1445.50, "EWCOST": 1300, "EWCLSTK": "12 pcs",
 "EWSRNO": 2, "EWCategory": "Switches", "EWGroup": "Anchor Roma", "EWItemName": "6A One Way Switch",
 "EWFINAL": 38, "EWCLSTK": "0 pcs"
}`;

function setup() {
  process.env.GOOGLE_DRIVE_PRODUCTS_URL = "https://drive.google.com/uc?id=x";
  const tables: Record<string, Row[]> = { price_list_items: [], price_list_sync_state: [], price_list_categories: [] };
  let rpcCalls = 0;
  const table = (name: string) => {
    const filters: Array<(row: Row) => boolean> = [];
    let payload: Row | null = null;
    let range: [number, number] | null = null;
    const run = () => {
      if (payload) {
        const existing = tables[name].find((row) => row.tenant_id === payload!.tenant_id);
        if (existing) Object.assign(existing, payload);
        else tables[name].push({ ...payload });
        return [];
      }
      const rows = tables[name].filter((row) => filters.every((filter) => filter(row))).map((row) => ({ ...row }));
      return range ? rows.slice(range[0], range[1] + 1) : rows;
    };
    const builder: any = {
      select: () => builder,
      upsert: (value: Row) => ((payload = value), builder),
      eq: (column: string, value: unknown) => (filters.push((row) => row[column] === value), builder),
      order: () => builder,
      range: (from: number, to: number) => ((range = [from, to]), builder),
      maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: run(), error: null }).then(resolve)
    };
    return builder;
  };
  const client = {
    from: table,
    rpc: async (_name: string, args: Row) => {
      rpcCalls += 1;
      tables.price_list_items = args.p_items.map((item: Row) => ({ tenant_id: args.p_tenant_id, ...item }));
      return { data: args.p_items.length, error: null };
    }
  };
  globalThis.fetch = (async () => new Response(tallyExport, { headers: { "content-type": "application/octet-stream" } })) as typeof fetch;
  const service = new PriceListService({ getClient: () => client } as any);
  return { service, tables, rpcCalls: () => rpcCalls };
}

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("Price list sync and views", () => {
  it("skips re-importing an unchanged Tally export", async () => {
    const { service, rpcCalls, tables } = setup();
    const first = await service.sync("t1");
    assert.equal(first.changed, true);
    assert.equal(first.count, 2);
    const second = await service.sync("t1");
    assert.equal(second.changed, false);
    assert.equal(rpcCalls(), 1);
    assert.equal(tables.price_list_sync_state[0].item_count, 2);
  });

  it("gives customers names, categories and availability only, never a price", async () => {
    const { service } = setup();
    await service.sync("t1");
    const { data, etag } = await service.list("t1", "catalog");
    assert.equal(data.pricesHidden, true);
    assert.deepEqual(data.items[0], { key: priceListItemKey("1.5 sq mm Copper Wire (₹2450)"), name: "1.5 sq mm Copper Wire", category: "Wires", brand: "Polycab", inStock: true });
    assert.equal((data.items[1] as Row).inStock, false);
    const text = JSON.stringify(data);
    for (const price of ["2450", "1445", "1300", "38"]) assert.ok(!text.includes(price), `catalog leaked ${price}`);

    const full = await service.list("t1", "full");
    assert.equal((full.data.items[0] as Row).cost_price, 1300);
    assert.notEqual(full.etag, etag);
    const prices = await service.list("t1", "prices");
    assert.ok(!("cost_price" in (prices.data.items[0] as Row)));
  });

  it("keeps the same ETag until the list changes", async () => {
    const { service, tables } = setup();
    await service.sync("t1");
    const a = await service.list("t1", "catalog");
    const b = await service.list("t1", "catalog");
    assert.equal(a.etag, b.etag);
    tables.price_list_sync_state[0].synced_at = "2030-01-01T00:00:00Z";
    const c = await service.list("t1", "catalog");
    assert.notEqual(a.etag, c.etag);
  });

  it("finds order lines by key", async () => {
    const { service } = setup();
    await service.sync("t1");
    const key = priceListItemKey("6A One Way Switch");
    const found = await service.findItems("t1", [key, "missing"]);
    assert.equal(found.get(key)?.outOfStock, true);
    assert.equal(found.get("missing"), undefined);
  });
});
