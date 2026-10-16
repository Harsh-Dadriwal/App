import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BadRequestException, HttpException } from "@nestjs/common";
import { PhoneAuthService, toE164 } from "./phone-auth.service";

type Row = Record<string, any>;

function setup(options: { profiles?: Row[]; authUsers?: Row[]; smsFails?: boolean; dailyLimit?: number } = {}) {
  process.env.OTP_SECRET = "test-secret";
  if (options.dailyLimit) process.env.TEXTBEE_DAILY_LIMIT = String(options.dailyLimit);
  else delete process.env.TEXTBEE_DAILY_LIMIT;

  const tables: Record<string, Row[]> = {
    users: options.profiles ?? [],
    phone_otp_codes: [],
    phone_otp_daily_limits: []
  };
  const authUsers: Row[] = options.authUsers ?? [];
  const sent: Array<{ phone: string; message: string }> = [];
  const calls: string[] = [];
  let nextId = 1;

  const table = (name: string) => {
    const filters: Array<(row: Row) => boolean> = [];
    let action: "select" | "update" | "delete" | "upsert" = "select";
    let payload: Row = {};
    const rows = () => tables[name];
    const run = () => {
      if (action === "upsert") {
        const existing = rows().find((row) => row.phone === payload.phone);
        if (existing) Object.assign(existing, payload);
        else rows().push({ ...payload });
        return [];
      }
      const matched = rows().filter((row) => filters.every((filter) => filter(row)));
      if (action === "update") matched.forEach((row) => Object.assign(row, payload));
      if (action === "delete") tables[name] = rows().filter((row) => !matched.includes(row));
      // Like the real client, return copies rather than the stored rows.
      return matched.map((row) => ({ ...row }));
    };
    const builder: any = {
      select: () => builder,
      update: (value: Row) => ((action = "update"), (payload = value), builder),
      delete: () => ((action = "delete"), builder),
      upsert: (value: Row) => ((action = "upsert"), (payload = value), builder),
      in: (column: string, values: unknown[]) => (filters.push((row) => values.includes(row[column])), builder),
      ilike: (column: string, value: string) => (filters.push((row) => String(row[column] ?? "").toLowerCase() === value.toLowerCase()), builder),
      eq: (column: string, value: unknown) => (filters.push((row) => row[column] === value), builder),
      limit: () => builder,
      maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: run(), error: null }).then(resolve)
    };
    return builder;
  };

  const client = {
    from: table,
    rpc: async (name: string, args: Row) => {
      assert.equal(name, "register_phone_otp_send");
      const today = tables.phone_otp_daily_limits;
      const row = today.find((r) => r.phone === args.p_phone);
      if (row) row.send_count += 1;
      else today.push({ phone: args.p_phone, send_count: 1 });
      const total = today.reduce((sum, r) => sum + r.send_count, 0);
      return { data: [{ phone_sends: (row ?? today[today.length - 1]).send_count, total_sends: total }], error: null };
    },
    auth: {
      admin: {
        listUsers: async () => ({ data: { users: authUsers }, error: null }),
        createUser: async (attrs: Row) => {
          calls.push("createUser");
          const user = { id: `auth-${nextId++}`, phone: attrs.phone, email: null, user_metadata: attrs.user_metadata };
          authUsers.push(user);
          // What the handle_new_auth_user trigger does: create the profile row.
          tables.users.push({ id: `profile-${user.id}`, auth_user_id: user.id, phone: attrs.phone, email: null, role: attrs.user_metadata.role, full_name: attrs.user_metadata.full_name });
          return { data: { user }, error: null };
        },
        getUserById: async (id: string) => ({ data: { user: authUsers.find((user) => user.id === id) ?? null }, error: null }),
        updateUserById: async (id: string, attrs: Row) => {
          calls.push(`updateUser:${Object.keys(attrs).join(",")}`);
          const user = authUsers.find((row) => row.id === id)!;
          Object.assign(user, attrs);
          // What the sync_auth_user_profile trigger does on email change.
          tables.users.filter((row) => row.auth_user_id === id).forEach((row) => (row.email = attrs.email));
          return { data: { user }, error: null };
        },
        generateLink: async ({ email }: Row) => {
          calls.push(`generateLink:${email}`);
          return { data: { properties: { hashed_token: `hash-for-${email}` } }, error: null };
        }
      }
    }
  };

  const supabaseAdmin = {
    getClient: () => client,
    createAnonClient: () => ({
      auth: {
        verifyOtp: async ({ token_hash, type }: Row) => {
          calls.push(`verifyOtp:${type}`);
          const email = String(token_hash).replace("hash-for-", "");
          const user = authUsers.find((row) => row.email === email)!;
          return {
            data: { session: { access_token: `access-${user.id}`, refresh_token: `refresh-${user.id}`, token_type: "bearer", expires_in: 3600, expires_at: 1, user: { id: user.id } } },
            error: null
          };
        }
      }
    })
  };

  const sms = {
    isConfigured: () => true,
    send: async (phone: string, message: string) => {
      if (options.smsFails) throw new Error("gateway down");
      sent.push({ phone, message });
    }
  };

  const service = new PhoneAuthService(supabaseAdmin as any, sms as any);
  const lastCode = () => sent[sent.length - 1].message.slice(0, 6);
  const ageCode = (phone: string, ms: number) => {
    const row = tables.phone_otp_codes.find((r) => r.phone === phone)!;
    row.created_at = new Date(Date.now() - ms).toISOString();
  };
  return { service, tables, authUsers, sent, calls, lastCode, ageCode };
}

describe("Phone OTP via TextBee", () => {
  it("normalises Indian numbers to +91", () => {
    assert.equal(toE164("98765 43210"), "+919876543210");
    assert.equal(toE164("919876543210"), "+919876543210");
    assert.equal(toE164("+91 98765-43210"), "+919876543210");
    assert.equal(toE164("12345"), null);
  });

  it("texts a 6-digit code and stores only its hash", async () => {
    const { service, tables, sent } = setup();
    await service.sendCode("9876543210");
    assert.equal(sent.length, 1);
    assert.equal(sent[0].phone, "+919876543210");
    assert.match(sent[0].message, /^\d{6} is your Mahalaxmi Electricals login code/);
    const stored = tables.phone_otp_codes[0];
    assert.equal(stored.phone, "+919876543210");
    assert.ok(!JSON.stringify(stored).includes(sent[0].message.slice(0, 6)));
  });

  it("makes people wait between codes and caps codes per number per day", async () => {
    const { service, ageCode } = setup();
    await service.sendCode("9876543210");
    await assert.rejects(service.sendCode("9876543210"), (error: unknown) => error instanceof HttpException && error.getStatus() === 429);
    for (let i = 0; i < 4; i += 1) {
      ageCode("+919876543210", 60_000);
      await service.sendCode("9876543210");
    }
    ageCode("+919876543210", 60_000);
    await assert.rejects(service.sendCode("9876543210"), /today's limit/);
  });

  it("stops all sending when the SIM's daily cap is reached", async () => {
    const { service } = setup({ dailyLimit: 2 });
    await service.sendCode("9000000001");
    await service.sendCode("9000000002");
    await assert.rejects(service.sendCode("9000000003"), /busy right now/);
  });

  it("does not keep a code that could not be sent", async () => {
    const { service, tables } = setup({ smsFails: true });
    await assert.rejects(service.sendCode("9876543210"), /could not send the code/);
    assert.equal(tables.phone_otp_codes.length, 0);
  });

  it("asks a new number for its profile instead of creating an account, and the code works only once", async () => {
    const { service, tables, authUsers, lastCode } = setup();
    await service.sendCode("9000000001");
    const code = lastCode();

    const result = await service.verifyCode("9000000001", code);

    assert.equal(result.status, "needs_profile");
    assert.ok("signupToken" in result && result.signupToken);
    assert.equal(authUsers.length, 0);
    assert.equal(tables.users.length, 0);
    await assert.rejects(service.verifyCode("9000000001", code), /expired/);
  });

  it("creates a customer account from the profile step with name, username and email, ignoring any role sent", async () => {
    const { service, tables, lastCode } = setup();
    await service.sendCode("9000000001");
    const pending = await service.verifyCode("9000000001", lastCode());
    assert.equal(pending.status, "needs_profile");

    const result = await service.completeSignup((pending as any).signupToken, {
      full_name: "Ravi Kumar",
      username: "Ravi.K",
      email: "Ravi@Example.com",
      role: "electrician"
    });

    assert.equal(result.status, "signed_in");
    assert.equal(result.isNewUser, true);
    assert.equal(result.session.refresh_token, "refresh-auth-1");
    assert.equal(tables.users[0].role, "customer");
    assert.equal(tables.users[0].full_name, "Ravi Kumar");
    assert.equal(tables.users[0].email, "ravi@example.com");
  });

  it("requires a name and a free username, and always creates a customer", async () => {
    const { service, tables, lastCode } = setup({
      profiles: [{ id: "p-other", auth_user_id: "auth-other", phone: "+919111111111", username: "taken.name", email: null }],
      authUsers: [{ id: "auth-other", phone: "919111111111", email: "other@example.com" }]
    });
    await service.sendCode("9000000002");
    const { signupToken } = (await service.verifyCode("9000000002", lastCode())) as any;

    await assert.rejects(service.completeSignup(signupToken, { username: "someone" }), /full name/);
    await assert.rejects(service.completeSignup(signupToken, { full_name: "Asha", username: "ab" }), /username/);
    await assert.rejects(service.completeSignup(signupToken, { full_name: "Asha", username: "Taken.Name" }), /already taken/);

    await service.completeSignup(signupToken, { full_name: "Asha Sharma", username: "asha", role: "admin" });
    const created = tables.users.find((row) => row.full_name === "Asha Sharma")!;
    assert.equal(created.role, "customer");
    assert.equal(created.email, null);
  });

  it("refuses a forged or expired sign-up pass", async () => {
    const { service } = setup();
    await assert.rejects(service.completeSignup("bogus.token", { full_name: "A B", username: "abc" }), /expired/);
    const body = Buffer.from(JSON.stringify({ phone: "+919000000003", exp: Date.now() - 1 })).toString("base64url");
    await assert.rejects(service.completeSignup(`${body}.not-the-signature`, { full_name: "A B", username: "abc" }), /expired/);
  });

  it("reports which sign-up details are already taken", async () => {
    const { service } = setup({
      profiles: [{ id: "p1", auth_user_id: "auth-a", phone: "919876543210", username: "asha", email: "asha@example.com" }]
    });
    const result = await service.checkAvailability({ username: "ASHA", email: "new@example.com", phone: "9876543210" });
    assert.deepEqual(result, { username: { available: false }, email: { available: true }, phone: { available: false } });
  });

  it("signs in a returning user without changing their real email", async () => {
    const { service, calls, lastCode } = setup({
      profiles: [{ id: "p1", auth_user_id: "auth-a", phone: "919876543210", email: "asha@example.com" }],
      authUsers: [{ id: "auth-a", phone: "919876543210", email: "asha@example.com" }]
    });
    await service.sendCode("+91 98765 43210");
    const result = await service.verifyCode("9876543210", lastCode());
    assert.equal(result.status, "signed_in");
    assert.equal((result as any).isNewUser, false);
    assert.equal((result as any).session.access_token, "access-auth-a");
    assert.ok(!calls.some((call) => call.startsWith("updateUser")));
  });

  it("allows 5 wrong tries, then throws the code away", async () => {
    const { service, tables, lastCode } = setup();
    await service.sendCode("9000000001");
    const right = lastCode();
    const wrong = right === "000000" ? "111111" : "000000";
    for (let i = 4; i >= 1; i -= 1) {
      await assert.rejects(service.verifyCode("9000000001", wrong), new RegExp(`${i} tr(y|ies) left`));
    }
    await assert.rejects(service.verifyCode("9000000001", wrong), BadRequestException);
    await assert.rejects(service.verifyCode("9000000001", right), (error: unknown) => error instanceof HttpException && error.getStatus() === 429);
    assert.equal(tables.phone_otp_codes.length, 0);
  });

});
