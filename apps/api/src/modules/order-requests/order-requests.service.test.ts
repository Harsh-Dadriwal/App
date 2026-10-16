import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { OrderRequestsService, allowedOrderStatusChange } from "./order-requests.service";

type Row = Record<string, any>;

function setup() {
  const tables: Record<string, Row[]> = {
    order_requests: [],
    order_request_items: [],
    tenant_memberships: [
      { tenant_id: "t1", user_id: "admin-1", role: "admin", is_active: true },
      { tenant_id: "t1", user_id: "cust-1", role: "customer", is_active: true }
    ],
    users: [
      { id: "admin-1", role: "admin", status: "active", full_name: "Shop Admin", phone: null },
      { id: "cust-1", role: "customer", status: "active", full_name: "Ravi Kumar", phone: "+919000000001" },
      { id: "cust-2", role: "customer", status: "active", full_name: "Asha", phone: null }
    ]
  };
  let nextId = 1;
  const notifications: Row[] = [];

  const table = (name: string) => {
    const filters: Array<(row: Row) => boolean> = [];
    let action: "select" | "insert" | "update" | "delete" = "select";
    let payload: any = null;
    const run = () => {
      if (action === "insert") {
        const rows = (Array.isArray(payload) ? payload : [payload]).map((row: Row) => ({
          id: `${name}-${nextId++}`,
          status: "submitted",
          order_number: `ORD-${1000 + nextId}`,
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
    ["k-panel", { displayName: "12w Panel Havells", displayCategory: "Lighting", brand: "Havells", final_price: 450, mrp: 1590, stock_label: "12 pcs", outOfStock: false }],
    ["k-fan", { displayName: "Ceiling Fan Crompton", displayCategory: "Fans", brand: "Crompton", final_price: 2100, mrp: 3200, stock_label: "0 pcs", outOfStock: true }]
  ]);
  const priceList = { findItems: async (_tenant: string, keys: string[]) => new Map(keys.map((key) => [key, catalog.get(key)])) };
  const notificationsService = { createBulkNotifications: async (args: Row) => notifications.push(args) };
  const service = new OrderRequestsService(
    { getClient: () => ({ from: table }) } as any,
    { assertTenantAccess: async () => undefined } as any,
    notificationsService as any,
    priceList as any
  );
  const actor = (id: string, role: string) => ({ authUserId: `auth-${id}`, appUserId: id, role, defaultTenantId: "t1" });
  return { service, tables, notifications, actor };
}

describe("Order requests from the price list", () => {
  it("lets the shop move orders forward and customers cancel only before confirmation", () => {
    assert.equal(allowedOrderStatusChange("admin", "submitted", "confirmed"), true);
    assert.equal(allowedOrderStatusChange("admin", "delivered", "cancelled"), false);
    assert.equal(allowedOrderStatusChange("customer", "submitted", "cancelled"), true);
    assert.equal(allowedOrderStatusChange("customer", "confirmed", "cancelled"), false);
    assert.equal(allowedOrderStatusChange("customer", "submitted", "delivered"), false);
  });

  it("creates an order with a price snapshot, merges repeated items and tells the admins", async () => {
    const { service, tables, notifications, actor } = setup();
    const result = await service.create(actor("cust-1", "customer"), {
      items: [{ key: "k-panel", quantity: 2 }, { key: "k-panel", quantity: 3 }],
      delivery_address: "12 MG Road, Jaipur"
    });
    assert.equal(result.item_count, 1);
    assert.equal(tables.order_request_items[0].quantity, 5);
    assert.equal(tables.order_request_items[0].unit_price, 450);
    assert.equal(tables.order_request_items[0].item_name, "12w Panel Havells");
    assert.deepEqual(notifications[0].userIds, ["admin-1"]);
  });

  it("refuses out-of-stock or unknown items, and an empty cart", async () => {
    const { service, tables, actor } = setup();
    const customer = actor("cust-1", "customer");
    await assert.rejects(service.create(customer, { items: [{ key: "k-fan", quantity: 1 }], delivery_address: "12 MG Road" }), /Out of stock now: Ceiling Fan/);
    await assert.rejects(service.create(customer, { items: [{ key: "gone", quantity: 1 }], delivery_address: "12 MG Road" }), /no longer in the price list/);
    await assert.rejects(service.create(customer, { items: [], delivery_address: "12 MG Road" }), /at least one item/);
    await assert.rejects(service.create(customer, { items: [{ key: "k-panel", quantity: 0 }], delivery_address: "12 MG Road" }), /Quantities/);
    assert.equal(tables.order_requests.length, 0);
  });

  it("never shows prices to the person who ordered, but shows them to the shop", async () => {
    const { service, actor } = setup();
    await service.create(actor("cust-1", "customer"), { items: [{ key: "k-panel", quantity: 2 }], delivery_address: "12 MG Road, Jaipur" });

    const mine = await service.list(actor("cust-1", "customer"));
    assert.equal(mine.canManage, false);
    assert.equal(mine.orders.length, 1);
    assert.ok(!JSON.stringify(mine).includes("450"));
    assert.ok(!("estimated_total" in mine.orders[0]));

    const theirs = await service.list(actor("cust-2", "customer"));
    assert.equal(theirs.orders.length, 0);

    const shop = await service.list(actor("admin-1", "admin"));
    assert.equal((shop.orders[0] as any).estimated_total, 900);
    assert.equal((shop.orders[0] as any).customer.full_name, "Ravi Kumar");
  });

  it("lets the shop confirm, notifies the customer, and stops customers cancelling after that", async () => {
    const { service, notifications, actor } = setup();
    const { id } = await service.create(actor("cust-1", "customer"), { items: [{ key: "k-panel", quantity: 1 }], delivery_address: "12 MG Road, Jaipur" });

    await assert.rejects(service.updateStatus(actor("cust-2", "customer"), id, { status: "cancelled" }), NotFoundException);
    await service.updateStatus(actor("admin-1", "admin"), id, { status: "confirmed", admin_note: "Delivery tomorrow" });
    assert.deepEqual(notifications.at(-1)!.userIds, ["cust-1"]);
    assert.match(notifications.at(-1)!.body, /Delivery tomorrow/);

    await assert.rejects(service.updateStatus(actor("cust-1", "customer"), id, { status: "cancelled" }), ConflictException);
  });
});
