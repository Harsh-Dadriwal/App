import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { ConflictException, ForbiddenException } from "@nestjs/common";
import { ServiceRequestsService, allowedStatusChange } from "./service-requests.service";
import type { RequestActor } from "../../common/auth/auth.types";

type Row = Record<string, any>;

/** Minimal in-memory stand-in for the supabase-js query builder calls the service makes. */
let nextId = 1;

function createFakeDb(tables: Record<string, Row[]>) {
  function from(table: string) {
    const filters: Array<(row: Row) => boolean> = [];
    let action: "select" | "insert" | "update" | "upsert" = "select";
    let payload: Row = {};
    let limit = Infinity;
    const rows = () => (tables[table] ??= []);

    function run() {
      if (action === "insert") {
        const row = { id: `${table}-${nextId++}`, status: "open", created_at: new Date().toISOString(), ...payload };
        rows().push(row);
        return [row];
      }
      if (action === "upsert") {
        const existing = rows().find((row) => row.service_request_id === payload.service_request_id && row.electrician_id === payload.electrician_id);
        if (existing) return [Object.assign(existing, payload)];
        const row = { id: `${table}-${nextId++}`, created_at: new Date().toISOString(), ...payload };
        rows().push(row);
        return [row];
      }
      const matched = rows().filter((row) => filters.every((filter) => filter(row))).slice(0, limit);
      if (action === "update") matched.forEach((row) => Object.assign(row, payload));
      return matched;
    }

    const builder: any = {
      select: () => builder,
      insert: (value: Row) => ((action = "insert"), (payload = value), builder),
      update: (value: Row) => ((action = "update"), (payload = value), builder),
      upsert: (value: Row) => ((action = "upsert"), (payload = value), builder),
      eq: (column: string, value: unknown) => (filters.push((row) => row[column] === value), builder),
      neq: (column: string, value: unknown) => (filters.push((row) => row[column] !== value), builder),
      in: (column: string, values: unknown[]) => (filters.push((row) => values.includes(row[column])), builder),
      or: (expression: string) => {
        const clauses = expression.split(",").map((clause) => clause.split(".eq."));
        filters.push((row) => clauses.some(([column, value]) => String(row[column]) === value));
        return builder;
      },
      order: () => builder,
      limit: (value: number) => ((limit = value), builder),
      single: async () => ({ data: run()[0] ?? null, error: null }),
      maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
      then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
        Promise.resolve({ data: run(), error: null }).then(resolve, reject)
    };
    return builder;
  }
  return { from };
}

function setup() {
  const tables: Record<string, Row[]> = {
    users: [
      { id: "cust", full_name: "Asha", phone: "9000000001", role: "customer", status: "active", verification_status: "verified" },
      { id: "el1", full_name: "Ravi", phone: "9000000002", role: "electrician", status: "active", verification_status: "verified" },
      { id: "el2", full_name: "Mohan", phone: "9000000003", role: "electrician", status: "active", verification_status: "pending" },
      { id: "el3", full_name: "Blocked", phone: null, role: "electrician", status: "blocked", verification_status: "verified" },
      { id: "arch", full_name: "Neha", phone: null, role: "architect", status: "active", verification_status: "verified" },
      { id: "elOther", full_name: "Elsewhere", phone: null, role: "electrician", status: "active", verification_status: "verified" }
    ],
    tenant_memberships: ["cust", "el1", "el2", "el3", "arch"].map((user_id) => ({ tenant_id: "t1", user_id, role: "customer", is_active: true }))
      .concat([{ tenant_id: "t2", user_id: "elOther", role: "electrician", is_active: true }]),
    service_requests: [],
    service_request_responses: []
  };
  const notifications: Array<{ userIds: string[]; title: string }> = [];
  const service = new ServiceRequestsService(
    { getClient: () => createFakeDb(tables) } as any,
    { assertTenantAccess: async () => undefined } as any,
    { createBulkNotifications: async (args: any) => { notifications.push({ userIds: args.userIds, title: args.title }); return []; } } as any
  );
  const actor = (appUserId: string, role: string): RequestActor => ({ authUserId: `auth-${appUserId}`, appUserId, role, defaultTenantId: "t1" });
  return { tables, notifications, service, actor };
}

const newRequest = {
  request_type: "installation",
  title: "Install ceiling fan",
  description: "Two fans in the bedroom",
  address: "12 MG Road",
  city: "Indore",
  contact_phone: "9000000001"
};

describe("Service requests", () => {
  test("notifies every active electrician in the workspace when a customer raises a request", async () => {
    const { service, actor, notifications } = setup();
    const result = await service.create(actor("cust", "customer"), newRequest);

    assert.equal(result.notifiedCount, 2);
    assert.deepEqual(notifications, [{ userIds: ["el1", "el2"], title: "New installation request" }]);
  });

  test("only customers can raise a request", async () => {
    const { service, actor } = setup();
    await assert.rejects(service.create(actor("el1", "electrician"), newRequest), ForbiddenException);
  });

  test("electricians see open requests without the customer's address until they are chosen", async () => {
    const { service, actor } = setup();
    const { id } = await service.create(actor("cust", "customer"), newRequest);

    const before = await service.list(actor("el1", "electrician"));
    assert.equal(before.requests[0].address, null);
    assert.equal(before.requests[0].contact_phone, null);

    await service.respond(actor("el1", "electrician"), id, { message: "Can come tomorrow", quoted_amount: 500 });
    const offered = await service.list(actor("cust", "customer"));
    await service.choose(actor("cust", "customer"), id, { response_id: offered.requests[0].responses[0].id });

    const after = await service.list(actor("el1", "electrician"));
    assert.equal(after.requests[0].address, "12 MG Road");
    assert.equal(after.requests[0].contact_phone, "9000000001");
    assert.equal(after.requests[0].status, "assigned");

    const other = await service.list(actor("el2", "electrician"));
    assert.equal(other.requests.length, 0);
  });

  test("choosing notifies the chosen electrician and the ones not picked, and cannot happen twice", async () => {
    const { service, actor, notifications } = setup();
    const { id } = await service.create(actor("cust", "customer"), newRequest);
    await service.respond(actor("el1", "electrician"), id, {});
    await service.respond(actor("el2", "electrician"), id, { quoted_amount: "" });

    const list = await service.list(actor("cust", "customer"));
    const responses = list.requests[0].responses;
    assert.equal(responses.length, 2);
    assert.equal(responses[0].verified, true);
    assert.equal(responses[1].verified, false);

    notifications.length = 0;
    await service.choose(actor("cust", "customer"), id, { response_id: responses[1].id });
    assert.deepEqual(notifications, [
      { userIds: ["el2"], title: "You got the job" },
      { userIds: ["el1"], title: "Request taken" }
    ]);

    await assert.rejects(service.choose(actor("cust", "customer"), id, { response_id: responses[0].id }), ConflictException);
    await assert.rejects(service.respond(actor("el1", "electrician"), id, {}), ConflictException);
  });

  test("status changes follow who is asking", async () => {
    assert.equal(allowedStatusChange("electrician", "assigned", "in_progress"), true);
    assert.equal(allowedStatusChange("electrician", "open", "completed"), false);
    assert.equal(allowedStatusChange("electrician", "assigned", "cancelled"), false);
    assert.equal(allowedStatusChange("customer", "open", "cancelled"), true);
    assert.equal(allowedStatusChange("customer", "in_progress", "cancelled"), false);
    assert.equal(allowedStatusChange("customer", "in_progress", "completed"), true);
  });
});
