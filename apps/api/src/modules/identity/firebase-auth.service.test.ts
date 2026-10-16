import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { UnauthorizedException } from "@nestjs/common";
import { FirebaseAuthService, firebaseAdminWrapper } from "./firebase-auth.service";

// Firebase verification is mocked: "token-<digits>" is a valid token for +<digits>.
firebaseAdminWrapper.verifyIdToken = async (token: string) => {
  const match = token.match(/^token-(\d+)$/);
  if (match) return { uid: `fb-${match[1]}`, phone_number: `+${match[1]}` };
  throw new Error("Invalid token mock error");
};

type Row = Record<string, any>;

function setup(options: { profiles?: Row[]; authUsers?: Row[] } = {}) {
  process.env.FIREBASE_PROJECT_ID = "test-project";
  const profiles: Row[] = options.profiles ?? [];
  const authUsers: Row[] = options.authUsers ?? [];
  const calls: string[] = [];
  let nextId = 1;

  const usersTable = () => {
    const filters: Array<(row: Row) => boolean> = [];
    let update: Row | null = null;
    const run = () => {
      const matched = profiles.filter((row) => filters.every((filter) => filter(row)));
      if (update) matched.forEach((row) => Object.assign(row, update));
      return matched;
    };
    const builder: any = {
      select: () => builder,
      update: (value: Row) => ((update = value), builder),
      in: (column: string, values: unknown[]) => (filters.push((row) => values.includes(row[column])), builder),
      eq: (column: string, value: unknown) => (filters.push((row) => row[column] === value), builder),
      limit: () => builder,
      maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: run(), error: null }).then(resolve)
    };
    return builder;
  };

  const client = {
    from: (table: string) => {
      assert.equal(table, "users");
      return usersTable();
    },
    auth: {
      admin: {
        listUsers: async () => ({ data: { users: authUsers }, error: null }),
        createUser: async (attrs: Row) => {
          calls.push("createUser");
          const user = { id: `auth-${nextId++}`, phone: attrs.phone, email: null, user_metadata: attrs.user_metadata };
          authUsers.push(user);
          // What the handle_new_auth_user trigger does: create the profile row.
          profiles.push({ id: `profile-${user.id}`, auth_user_id: user.id, phone: attrs.phone, email: null, role: attrs.user_metadata.role, full_name: attrs.user_metadata.full_name });
          return { data: { user }, error: null };
        },
        getUserById: async (id: string) => ({ data: { user: authUsers.find((user) => user.id === id) ?? null }, error: null }),
        updateUserById: async (id: string, attrs: Row) => {
          calls.push(`updateUser:${Object.keys(attrs).join(",")}`);
          const user = authUsers.find((row) => row.id === id)!;
          Object.assign(user, attrs);
          // What the sync_auth_user_profile trigger does on email change.
          profiles.filter((row) => row.auth_user_id === id).forEach((row) => (row.email = attrs.email));
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

  return { service: new FirebaseAuthService(supabaseAdmin as any), profiles, authUsers, calls };
}

describe("Phone sign-in (Firebase -> Supabase session)", () => {
  it("signs in a returning user with a real Supabase session, without touching their email", async () => {
    const { service, calls } = setup({
      profiles: [{ id: "p1", auth_user_id: "auth-a", phone: "+919876543210", email: "asha@example.com" }],
      authUsers: [{ id: "auth-a", phone: "919876543210", email: "asha@example.com" }]
    });

    const result = await service.exchangeFirebaseTokenForSupabaseSession("token-919876543210");

    assert.equal(result.isNewUser, false);
    assert.equal(result.session.access_token, "access-auth-a");
    assert.equal(result.session.refresh_token, "refresh-auth-a");
    assert.deepEqual(calls, ["generateLink:asha@example.com", "verifyOtp:magiclink"]);
  });

  it("finds a user whose profile stores the number without the plus sign", async () => {
    const { service, calls } = setup({
      profiles: [{ id: "p1", auth_user_id: "auth-a", phone: "919876543210", email: "asha@example.com" }],
      authUsers: [{ id: "auth-a", phone: "919876543210", email: "asha@example.com" }]
    });
    const result = await service.exchangeFirebaseTokenForSupabaseSession("token-919876543210");
    assert.equal(result.isNewUser, false);
    assert.ok(!calls.includes("createUser"));
  });

  it("signs up a new user with their name and role, and keeps the placeholder email off their profile", async () => {
    const { service, profiles, calls } = setup();

    const result = await service.exchangeFirebaseTokenForSupabaseSession("token-919000000001", {
      full_name: "Ravi Kumar",
      username: "Ravi.K",
      role: "electrician"
    });

    assert.equal(result.isNewUser, true);
    assert.equal(result.session.refresh_token, "refresh-auth-1");
    assert.equal(profiles[0].role, "electrician");
    assert.equal(profiles[0].full_name, "Ravi Kumar");
    assert.equal(profiles[0].email, null);
    assert.ok(calls.includes("updateUser:email,email_confirm"));
  });

  it("creates a customer when the requested role is not one people can sign up as", async () => {
    const { service, profiles } = setup();
    await service.exchangeFirebaseTokenForSupabaseSession("token-919000000002", { role: "admin" });
    assert.equal(profiles[0].role, "customer");
    assert.equal(profiles[0].full_name, "Customer 0002");
  });

  it("rejects an invalid Firebase token", async () => {
    const { service } = setup();
    await assert.rejects(service.exchangeFirebaseTokenForSupabaseSession("bad"), UnauthorizedException);
  });
});
