import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { AccountDeletionService } from "./account-deletion.service";

type Row = Record<string, any>;

function setup() {
  const tables: Record<string, Row[]> = {
    users: [{ id: "cust-1", full_name: "Ravi Kumar", username: "ravi", phone: "+919876543210", email: "ravi@example.com", city: "Jaipur", status: "active", auth_user_id: "auth-1" }],
    tenant_memberships: [{ tenant_id: "t1", user_id: "cust-1", is_active: true }],
    quotations: [{ id: "q1", customer_id: "cust-1", photo_keys: ["quotations/t1/cust-1/a.jpg"] }],
    push_tokens: [{ token: "ExponentPushToken[x]", user_id: "cust-1" }],
    order_requests: [{ id: "o1", customer_id: "cust-1" }]
  };
  const deletedAuthUsers: string[] = [];
  const deletedPhotoOwners: string[] = [];
  const table = (name: string) => {
    const filters: Array<(row: Row) => boolean> = [];
    let action: "select" | "update" | "delete" = "select";
    let payload: Row = {};
    const run = () => {
      const matched = tables[name].filter((row) => filters.every((filter) => filter(row)));
      if (action === "update") matched.forEach((row) => Object.assign(row, payload));
      if (action === "delete") tables[name] = tables[name].filter((row) => !matched.includes(row));
      return matched.map((row) => ({ ...row }));
    };
    const builder: any = {
      select: () => builder,
      update: (value: Row) => ((action = "update"), (payload = value), builder),
      delete: () => ((action = "delete"), builder),
      eq: (column: string, value: unknown) => (filters.push((row) => row[column] === value), builder),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: run(), error: null }).then(resolve)
    };
    return builder;
  };
  const client = { from: table, auth: { admin: { deleteUser: async (id: string) => (deletedAuthUsers.push(id), { error: null }) } } };
  const service = new AccountDeletionService(
    { getClient: () => client } as any,
    { deleteOwnerPhotos: async (tenantId: string, userId: string) => (deletedPhotoOwners.push(`${tenantId}/${userId}`), 1) } as any
  );
  return { service, tables, deletedAuthUsers, deletedPhotoOwners };
}

describe("Account deletion", () => {
  it("removes the sign-in, photos and personal details but keeps the anonymous order history", async () => {
    const { service, tables, deletedAuthUsers, deletedPhotoOwners } = setup();
    await service.deleteMyAccount({ authUserId: "auth-1", appUserId: "cust-1", role: "customer", defaultTenantId: "t1" });

    assert.deepEqual(deletedAuthUsers, ["auth-1"]);
    assert.deepEqual(deletedPhotoOwners, ["t1/cust-1"]);
    const person = tables.users[0];
    assert.equal(person.full_name, "Deleted user");
    assert.equal(person.phone, null);
    assert.equal(person.email, null);
    assert.equal(person.city, null);
    assert.equal(person.status, "inactive");
    assert.ok(!JSON.stringify(tables.users).includes("Ravi"));
    assert.equal(tables.push_tokens.length, 0);
    assert.deepEqual(tables.quotations[0].photo_keys, []);
    assert.equal(tables.tenant_memberships[0].is_active, false);
    assert.equal(tables.order_requests.length, 1, "orders are kept for tax records");
  });

  it("does not let shop admins delete their account from the app", async () => {
    const { service } = setup();
    await assert.rejects(service.deleteMyAccount({ authUserId: "auth-9", appUserId: "admin-1", role: "admin", defaultTenantId: "t1" }), ForbiddenException);
  });
});
