import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { QuotationsService } from "./quotations.service";

type Row = Record<string, any>;

function setup() {
  const tables: Record<string, Row[]> = {
    quotations: [],
    quotation_items: [],
    users: [
      { id: "admin-1", full_name: "Shop Admin", phone: null, role: "admin" },
      { id: "cust-1", full_name: "Ravi Kumar", phone: "+919000000001", role: "customer" },
      { id: "cust-2", full_name: "Asha", phone: null, role: "customer" }
    ]
  };
  let nextId = 1;
  const notifications: Row[] = [];
  const orders: Row[] = [];

  const table = (name: string) => {
    const filters: Array<(row: Row) => boolean> = [];
    let action: "select" | "insert" | "update" | "delete" = "select";
    let payload: any = null;
    const run = () => {
      if (action === "insert") {
        const rows = (Array.isArray(payload) ? payload : [payload]).map((row: Row) => ({
          id: `${name}-${nextId++}`,
          status: "requested",
          quotation_number: `QT-${1000 + nextId}`,
          photo_keys: [],
          discount_amount: 0,
          created_at: new Date().toISOString(),
          ...row
        }));
        tables[name].push(...rows);
        return rows;
      }
      const matched = tables[name].filter((row) => filters.every((filter) => filter(row)));
      if (action === "update") matched.forEach((row) => Object.assign(row, payload));
      if (action === "delete") tables[name] = tables[name].filter((row) => !matched.includes(row));
      return matched.map((row) => ({ ...row }));
    };
    const builder: any = {
      select: () => builder,
      insert: (value: unknown) => ((action = "insert"), (payload = value), builder),
      update: (value: Row) => ((action = "update"), (payload = value), builder),
      delete: () => ((action = "delete"), builder),
      eq: (column: string, value: unknown) => (filters.push((row) => row[column] === value), builder),
      in: (column: string, values: unknown[]) => (filters.push((row) => values.includes(row[column])), builder),
      order: () => builder,
      limit: () => builder,
      single: async () => ({ data: run()[0] ?? null, error: null }),
      maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: run(), error: null }).then(resolve)
    };
    return builder;
  };

  const catalog = new Map<string, Row>([
    ["k-wire", { displayName: "1.5 sq mm Wire Polycab", displayCategory: "Wires & Cables", brand: "Polycab", final_price: 1450, mrp: 2450, outOfStock: false }],
    ["k-switch", { displayName: "6A Switch Anchor", displayCategory: "Switches & Sockets", brand: "Anchor", final_price: 38, mrp: 60, outOfStock: true }]
  ]);
  const service = new QuotationsService(
    { getClient: () => ({ from: table }) } as any,
    { assertTenantAccess: async () => undefined } as any,
    { createBulkNotifications: async (args: Row) => notifications.push(args) } as any,
    { findItems: async (_t: string, keys: string[]) => new Map(keys.map((key) => [key, catalog.get(key)])) } as any,
    {
      listAdminIds: async () => ["admin-1"],
      createFromQuotation: async (args: Row) => {
        orders.push(args);
        return { id: "order-1", order_number: "ORD-1001" };
      }
    } as any,
    {
      ownerPrefix: (tenantId: string, userId: string) => `quotations/${tenantId}/${userId}/`,
      viewUrls: async (keys: string[]) => keys.map((key) => `https://signed/${key}`)
    } as any
  );
  const actor = (id: string, role: string) => ({ authUserId: `auth-${id}`, appUserId: id, role, defaultTenantId: "t1" });
  return { service, tables, notifications, orders, actor };
}

describe("Quotations", () => {
  it("needs items, a photo or a note, and only accepts the person's own photos", async () => {
    const { service, actor } = setup();
    const customer = actor("cust-1", "customer");
    await assert.rejects(service.create(customer, {}), /Add items, a photo/);
    await assert.rejects(service.create(customer, { photo_keys: ["quotations/t1/cust-2/x.jpg"] }), ForbiddenException);
    const created = await service.create(customer, { photo_keys: ["quotations/t1/cust-1/list.jpg"], note: "Whole house wiring" });
    assert.equal(created.status, "requested");
  });

  it("hides prices until the shop quotes, then shows the priced quotation with the discount", async () => {
    const { service, notifications, actor } = setup();
    const customer = actor("cust-1", "customer");
    const admin = actor("admin-1", "admin");
    const { id } = await service.create(customer, { items: [{ key: "k-wire", quantity: 2 }, { key: "k-switch", quantity: 10 }] });
    assert.deepEqual(notifications[0].userIds, ["admin-1"]);

    const before = await service.list(customer);
    assert.equal(before.quotations[0].items.length, 2);
    assert.ok(!JSON.stringify(before).includes("1450"), "prices must stay hidden before quoting");

    // The shop sees today's Tally prices prefilled.
    const shopView = await service.list(admin);
    assert.equal((shopView.quotations[0].items[0] as any).unit_price, 1450);

    await assert.rejects(service.quote(customer, id, { items: [{ name: "x", quantity: 1, unit_price: 1 }] }), ForbiddenException);
    await service.quote(admin, id, {
      items: [
        { key: "k-wire", quantity: 2, unit_price: 1400 },
        { name: "Modular board 8M", category: "Switches & Sockets", quantity: 3, unit_price: 250 }
      ],
      discount_amount: 150,
      admin_note: "Includes free delivery",
      valid_days: 10
    });
    assert.match(notifications.at(-1)!.title, /is ready/);

    const after = await service.list(customer);
    const quote = after.quotations[0] as any;
    assert.equal(quote.status, "quoted");
    assert.equal(quote.subtotal, 3550);
    assert.equal(quote.total, 3400);
    assert.equal(quote.items[1].name, "Modular board 8M");
  });

  it("accepting turns the quotation into an order at the quoted prices, once", async () => {
    const { service, orders, actor } = setup();
    const customer = actor("cust-1", "customer");
    const { id } = await service.create(customer, { items: [{ key: "k-wire", quantity: 1 }] });
    await assert.rejects(service.accept(customer, id, { delivery_address: "12 MG Road" }), /priced quotation/);
    await service.quote(actor("admin-1", "admin"), id, { items: [{ key: "k-wire", quantity: 1, unit_price: 1300 }] });

    await assert.rejects(service.accept(actor("cust-2", "customer"), id, { delivery_address: "12 MG Road" }), NotFoundException);
    const result = await service.accept(customer, id, { delivery_address: "12 MG Road, Jaipur" });
    assert.equal(result.order_number, "ORD-1001");
    assert.equal(orders[0].lines[0].unit_price, 1300);
    await assert.rejects(service.accept(customer, id, { delivery_address: "12 MG Road, Jaipur" }), ConflictException);
  });

  it("refuses an expired quotation and lets the person decline instead", async () => {
    const { service, tables, actor } = setup();
    const customer = actor("cust-1", "customer");
    const { id } = await service.create(customer, { items: [{ key: "k-wire", quantity: 1 }] });
    await service.quote(actor("admin-1", "admin"), id, { items: [{ key: "k-wire", quantity: 1, unit_price: 1300 }] });
    tables.quotations[0].valid_until = "2020-01-01";

    assert.equal(((await service.list(customer)).quotations[0] as any).expired, true);
    await assert.rejects(service.accept(customer, id, { delivery_address: "12 MG Road" }), /expired/);
    const closed = await service.close(customer, id, {});
    assert.equal(closed.status, "declined");
  });
});
