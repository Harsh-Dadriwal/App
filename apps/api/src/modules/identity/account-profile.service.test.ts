import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BadRequestException } from "@nestjs/common";
import { AccountProfileService } from "./account-profile.service";

type Row = Record<string, any>;

function setup(users: Row[], options: { authUpdateFails?: boolean; consumeFails?: boolean } = {}) {
  const authUpdates: Array<Record<string, any>> = [];
  const consumed: Array<[string, string]> = [];
  const sent: string[] = [];

  const table = () => {
    const filters: Array<(row: Row) => boolean> = [];
    let action: "select" | "update" = "select";
    let payload: Row = {};
    let max = Infinity;
    const run = () => {
      const matched = users.filter((row) => filters.every((filter) => filter(row))).slice(0, max);
      if (action === "update") matched.forEach((row) => Object.assign(row, payload));
      return matched.map((row) => ({ ...row }));
    };
    const builder: any = {
      select: () => builder,
      update: (values: Row) => { action = "update"; payload = values; return builder; },
      eq: (column: string, value: any) => { filters.push((row) => row[column] === value); return builder; },
      neq: (column: string, value: any) => { filters.push((row) => row[column] !== value); return builder; },
      in: (column: string, values: any[]) => { filters.push((row) => values.includes(row[column])); return builder; },
      ilike: (column: string, value: string) => { filters.push((row) => String(row[column]).toLowerCase() === value.toLowerCase()); return builder; },
      limit: (n: number) => { max = n; return builder; },
      maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
      then: (resolve: (value: any) => void) => resolve({ data: run(), error: null })
    };
    return builder;
  };

  const db = {
    from: () => table(),
    auth: {
      admin: {
        getUserById: async () => ({ data: { user: { user_metadata: { role: "customer" } } }, error: null }),
        updateUserById: async (_id: string, attributes: Record<string, any>) => {
          authUpdates.push(attributes);
          return options.authUpdateFails ? { error: { message: "nope" } } : { data: {}, error: null };
        }
      }
    }
  };
  const service = new AccountProfileService(
    { getClient: () => db } as any,
    {
      sendCode: async (phone: string) => { sent.push(phone); return { phone, expiresInSeconds: 300, resendInSeconds: 45 }; },
      consumeCode: async (phone: string, code: string) => {
        if (options.consumeFails) throw new BadRequestException("That code is not right. 4 tries left.");
        consumed.push([phone, code]);
      }
    } as any
  );
  return { service, users, authUpdates, consumed, sent };
}

const me = { authUserId: "auth-1", appUserId: "u1", role: "customer", defaultTenantId: null } as any;
const base = () => [
  { id: "u1", auth_user_id: "auth-1", username: "myself", full_name: "Me Myself", phone: null, role: "customer" },
  { id: "u2", auth_user_id: "auth-2", username: "taken", full_name: "Someone", phone: "+919876543210", role: "customer" }
];

describe("AccountProfileService.updateProfile", () => {
  it("changes only the fields sent and keeps the sign-in copy of name and username in step", async () => {
    const { service, users, authUpdates } = setup(base());
    await service.updateProfile(me, { full_name: "  New Name ", city: "Gondia", role: "admin" });
    assert.equal(users[0].full_name, "New Name");
    assert.equal(users[0].city, "Gondia");
    assert.equal(users[0].role, "customer", "role can never be changed here");
    assert.equal(authUpdates[0].user_metadata.full_name, "New Name");
    assert.equal(authUpdates[0].user_metadata.role, "customer");
  });

  it("rejects a username that belongs to someone else, allows your own", async () => {
    const { service } = setup(base());
    await assert.rejects(() => service.updateProfile(me, { username: "Taken" }), /already taken/);
    await assert.doesNotReject(() => service.updateProfile(me, { username: "MySelf" }));
  });

  it("validates name and username and refuses an empty change", async () => {
    const { service } = setup(base());
    await assert.rejects(() => service.updateProfile(me, { full_name: "A" }), /full name/);
    await assert.rejects(() => service.updateProfile(me, { username: "ab" }), /username/);
    await assert.rejects(() => service.updateProfile(me, {}), /nothing to save/);
  });

  it("clears an optional field when it is sent empty", async () => {
    const rows = base();
    (rows[0] as Row).company_name = "Old Co";
    const { service, users } = setup(rows);
    await service.updateProfile(me, { company_name: "  " });
    assert.equal(users[0].company_name, null);
  });
});

describe("AccountProfileService phone", () => {
  it("texts a code to a free number", async () => {
    const { service, sent } = setup(base());
    await service.sendPhoneCode(me, "98765 11111");
    assert.deepEqual(sent, ["+919876511111"]);
  });

  it("refuses a number that belongs to another account, before sending anything", async () => {
    const { service, sent } = setup(base());
    await assert.rejects(() => service.sendPhoneCode(me, "9876543210"), /already linked to another account/);
    assert.equal(sent.length, 0);
  });

  it("refuses an invalid number", async () => {
    const { service } = setup(base());
    await assert.rejects(() => service.sendPhoneCode(me, "12345"), /valid mobile number/);
  });

  it("saves the number on the sign-in account and the profile after the right code", async () => {
    const { service, users, authUpdates, consumed } = setup(base());
    const result = await service.verifyPhone(me, "98765 11111", "123456");
    assert.equal(result.phone, "+919876511111");
    assert.deepEqual(consumed, [["+919876511111", "123456"]]);
    assert.deepEqual(authUpdates[0], { phone: "919876511111", phone_confirm: true });
    assert.equal(users[0].phone, "+919876511111");
  });

  it("saves nothing when the code is wrong", async () => {
    const { service, users, authUpdates } = setup(base(), { consumeFails: true });
    await assert.rejects(() => service.verifyPhone(me, "9876511111", "000000"), /not right/);
    assert.equal(users[0].phone, null);
    assert.equal(authUpdates.length, 0);
  });

  it("does not claim the number when sign-in refuses to store it", async () => {
    const { service, users } = setup(base(), { authUpdateFails: true });
    await assert.rejects(() => service.verifyPhone(me, "9876511111", "123456"), /could not save your number/);
    assert.equal(users[0].phone, null);
  });
});
