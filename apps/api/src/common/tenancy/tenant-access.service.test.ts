import assert from "node:assert/strict";
import test from "node:test";
import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import type { RequestActor } from "../auth/auth.types";
import { TenantAccessService } from "./tenant-access.service";

type QueryResult = {
  data?: any;
  error?: { message: string } | null;
};

function createActor(overrides: Partial<RequestActor> = {}): RequestActor {
  return {
    authUserId: "auth-user-1",
    appUserId: "app-user-1",
    role: "customer",
    defaultTenantId: "tenant-1",
    ...overrides
  };
}

function createSupabaseClient(results: Record<string, QueryResult>) {
  return {
    from(table: string) {
      const keyBase = `${table}:`;
      const state = {
        filters: [] as string[],
        mode: "select"
      };

      const resolve = async () => {
        const filterKey = state.filters.join("|");
        const exactKey = `${keyBase}${filterKey}:${state.mode}`;
        const fallbackKey = `${keyBase}${filterKey}`;
        const result = results[exactKey] ?? results[fallbackKey];
        if (!result) {
          throw new Error(`No mock result for ${exactKey}`);
        }
        return {
          data: result.data ?? null,
          error: result.error ?? null
        };
      };

      const builder = {
        select(_columns: string) {
          return builder;
        },
        eq(column: string, value: unknown) {
          state.filters.push(`${column}=${String(value)}`);
          return builder;
        },
        maybeSingle() {
          state.mode = "maybeSingle";
          return resolve();
        },
        then(onFulfilled: (value: any) => any, onRejected?: (reason: unknown) => any) {
          return resolve().then(onFulfilled, onRejected);
        }
      };

      return builder;
    }
  };
}

function createService(results: Record<string, QueryResult>) {
  const supabaseAdmin = {
    getClient: () => createSupabaseClient(results)
  };

  return new TenantAccessService(supabaseAdmin as any);
}

test("getActorTenantIds requires an app profile", async () => {
  const service = createService({});

  await assert.rejects(
    () => service.getActorTenantIds(createActor({ appUserId: null })),
    (error: unknown) =>
      error instanceof UnauthorizedException &&
      error.message === "App profile not linked."
  );
});

test("assertTenantAccess rejects users outside the tenant", async () => {
  const service = createService({
    "tenant_memberships:user_id=app-user-1|is_active=true": {
      data: [{ tenant_id: "tenant-2" }]
    }
  });

  await assert.rejects(
    () => service.assertTenantAccess(createActor(), "tenant-1"),
    (error: unknown) =>
      error instanceof ForbiddenException &&
      error.message === "You do not have access to this tenant."
  );
});

test("assertTenantAdmin grants access immediately for platform admin role", async () => {
  // No mock results needed — the shortcut returns before any DB call
  const service = createService({});
  // Should resolve without throwing
  await assert.doesNotReject(() =>
    service.assertTenantAdmin(createActor({ role: "admin" }), "tenant-1")
  );
});

test("assertTenantAdmin rejects non-admin membership role", async () => {
  const service = createService({
    "tenant_memberships:user_id=app-user-1|tenant_id=tenant-1|is_active=true:maybeSingle": {
      data: { tenant_id: "tenant-1", role: "member" }
    }
  });

  await assert.rejects(
    () => service.assertTenantAdmin(createActor({ role: "customer" }), "tenant-1"),
    (error: unknown) =>
      error instanceof ForbiddenException &&
      error.message === "Admin tenant access required."
  );
});

test("assertOrderItemAccess returns scoped row after validating tenant membership", async () => {
  const service = createService({
    "order_items:id=item-7:maybeSingle": {
      data: { tenant_id: "tenant-1", site_order_id: "order-4" }
    },
    "tenant_memberships:user_id=app-user-1|is_active=true": {
      data: [{ tenant_id: "tenant-1" }]
    }
  });

  const row = await service.assertOrderItemAccess(createActor(), "item-7");

  assert.deepEqual(row, { tenant_id: "tenant-1", site_order_id: "order-4" });
});

test("assertSubstituteSuggestionAccess throws a friendly not-found error", async () => {
  const service = createService({
    "substitute_suggestions:id=suggestion-9:maybeSingle": {
      data: null
    }
  });

  await assert.rejects(
    () => service.assertSubstituteSuggestionAccess(createActor(), "suggestion-9"),
    (error: unknown) =>
      error instanceof ForbiddenException &&
      error.message === "Substitute suggestion not found."
  );
});
