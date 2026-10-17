import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { SelectionsService } from "./selections.service";

type Row = Record<string, any>;

function setup() {
  const tables: Record<string, Row[]> = {
    product_selections: [],
    product_selection_items: [],
    order_requests: [],
    quotations: [],
    tenant_memberships: [{ tenant_id: "t1", user_id: "cust-1" }],
    users: [
      { id: "elec-1", full_name: "Mohan Electric", role: "electrician", phone: "919111111111" },
      { id: "cust-1", full_name: "Ravi Kumar", role: "customer", phone: "919876543210" },
      { id: "cust-2", full_name: "Asha", role: "customer", phone: null }
    ]
  };
  let nextId = 1;
  const notifications: Row[] = [];
  const placed: Row[] = [];
  const quoted: Row[] = [];

  const table = (name: string) => {
    const filters: Array<(row: Row) => boolean> = [];
    let action: "select" | "insert" | "update" | "delete" = "select";
    let payload: any = null;
    const run = () => {
      if (action === "insert") {
        const rows = (Array.isArray(payload) ? payload : [payload]).map((row: Row) => ({
          id: `${name}-${nextId++}`,
          selection_number: `SEL-${1000 + nextId}`,
          status: "active",
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
      neq: (column: string, value: unknown) => (filters.push((row) => row[column] !== value), builder),
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
    ["k-switch", { displayName: "6A Switch Anchor", displayCategory: "Switches & Sockets", brand: "Anchor", final_price: 38, outOfStock: false }],
    ["k-wire", { displayName: "1.5 sq mm Wire", displayCategory: "Wires & Cables", brand: "Polycab", final_price: 1450, outOfStock: false }]
  ]);
  const service = new SelectionsService(
    { getClient: () => ({ from: table }) } as any,
    { assertTenantAccess: async () => undefined } as any,
    { createBulkNotifications: async (args: Row) => notifications.push(args) } as any,
    { findItems: async (_t: string, keys: string[]) => new Map(keys.map((key) => [key, catalog.get(key)])) } as any,
    { placeOrder: async (args: Row) => (placed.push(args), { id: "order-1", order_number: "ORD-2001", status: "submitted", item_count: args.quantities.size }) } as any,
    { requestQuotation: async (args: Row) => (quoted.push(args), { id: "q-1", quotation_number: "QT-2001", status: "requested" }) } as any
  );
  const actor = (id: string, role: string) => ({ authUserId: `auth-${id}`, appUserId: id, role, defaultTenantId: "t1" });
  return { service, tables, notifications, placed, quoted, actor };
}

describe("Product selections", () => {
  it("are made by electricians and architects, linking the customer by phone and telling them", async () => {
    const { service, notifications, actor } = setup();
    await assert.rejects(service.create(actor("cust-1", "customer"), { title: "My list", items: [{ key: "k-switch", quantity: 2 }] }), ForbiddenException);

    const result = await service.create(actor("elec-1", "electrician"), {
      title: "Sharma house – switches",
      customer_name: "Ravi",
      customer_phone: "98765 43210",
      items: [{ key: "k-switch", quantity: 12, note: "white" }, { key: "k-wire", quantity: 3 }]
    });
    assert.equal(result.linked_customer, true);
    assert.deepEqual(notifications[0].userIds, ["cust-1"]);
    assert.match(notifications[0].title, /Mohan Electric \(electrician\) selected products/);
  });

  it("shows the customer their selection without prices, and the shop with an estimate", async () => {
    const { service, actor } = setup();
    await service.create(actor("elec-1", "electrician"), { title: "Sharma house", customer_phone: "9876543210", items: [{ key: "k-wire", quantity: 2 }] });

    const customerView = await service.list(actor("cust-1", "customer"));
    assert.equal(customerView.selections.length, 1);
    assert.ok(!JSON.stringify(customerView).includes("1450"));
    assert.equal(customerView.selections[0].created_by!.full_name, "Mohan Electric");

    assert.equal((await service.list(actor("cust-2", "customer"))).selections.length, 0);
    const shop = await service.list(actor("admin-1", "admin"));
    assert.equal((shop.selections[0] as any).estimated_total, 2900);
  });

  it("orders for the customer with the electrician credited, and marks the selection ordered", async () => {
    const { service, tables, placed, quoted, notifications, actor } = setup();
    const { id } = await service.create(actor("elec-1", "electrician"), { title: "Sharma house", customer_phone: "9876543210", items: [{ key: "k-switch", quantity: 5 }] });

    await assert.rejects(service.order(actor("cust-2", "customer"), id, { delivery_address: "12 MG Road" }), NotFoundException);
    await service.order(actor("cust-1", "customer"), id, { delivery_address: "12 MG Road, Jaipur" });
    assert.equal(placed[0].customerId, "cust-1");
    assert.equal(placed[0].partnerId, "elec-1");
    assert.equal(placed[0].quantities.get("k-switch"), 5);
    assert.equal(tables.product_selections[0].status, "ordered");
    assert.deepEqual(notifications.at(-1)!.userIds, ["elec-1"]);

    await service.requestQuotation(actor("cust-1", "customer"), id, {});
    assert.equal(quoted[0].partnerId, "elec-1");
    assert.equal(quoted[0].selectionId, id);
  });
});
