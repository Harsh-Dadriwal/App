import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import type { RequestActor } from "../../common/auth/auth.types";
import { WorkflowsService } from "./workflows.service";

function createActor(overrides: Partial<RequestActor> = {}): RequestActor {
  return {
    authUserId: "auth-user-1",
    appUserId: "app-user-1",
    role: "customer",
    defaultTenantId: "tenant-1",
    ...overrides
  };
}

function createService(options?: {
  rpcResult?: { data?: unknown; error?: { message: string } | null };
  publish?: (eventName: string, payload: Record<string, unknown>) => Promise<void>;
}) {
  const calls = {
    access: [] as Array<{ actor: RequestActor; id: string }>,
    siteOrderAccess: [] as Array<{ actor: RequestActor; id: string }>,
    substituteAccess: [] as Array<{ actor: RequestActor; id: string }>,
    rpc: [] as Array<{ functionName: string; args: Record<string, unknown> }>,
    publish: [] as Array<{ eventName: string; payload: Record<string, unknown> }>
  };

  const supabaseAdmin = {
    createUserClient(accessToken: string) {
      assert.equal(accessToken, "token-1");
      return {
        rpc: async (functionName: string, args: Record<string, unknown>) => {
          calls.rpc.push({ functionName, args });
          return options?.rpcResult ?? { data: { ok: true }, error: null };
        }
      };
    }
  };

  const tenantAccess = {
    assertOrderItemAccess: async (actor: RequestActor, id: string) => {
      calls.access.push({ actor, id });
    },
    assertSiteOrderAccess: async (actor: RequestActor, id: string) => {
      calls.siteOrderAccess.push({ actor, id });
    },
    assertSubstituteSuggestionAccess: async (actor: RequestActor, id: string) => {
      calls.substituteAccess.push({ actor, id });
    }
  };

  const domainEvents = {
    publish: async (eventName: string, payload: Record<string, unknown>) => {
      calls.publish.push({ eventName, payload });
      await options?.publish?.(eventName, payload);
    }
  };

  return {
    service: new WorkflowsService(supabaseAdmin as any, tenantAccess as any, domainEvents as any),
    calls
  };
}

test("approveOrderItemByCustomer checks access, calls RPC, and publishes a workflow event", async () => {
  const { service, calls } = createService({ rpcResult: { data: { status: "approved" }, error: null } });
  const actor = createActor();
  const args = { target_order_item_id: "item-42", approve: true, note_text: "Looks good" };

  const result = await service.approveOrderItemByCustomer(actor, "token-1", args);

  assert.deepEqual(result, { status: "approved" });
  assert.deepEqual(calls.access, [{ actor, id: "item-42" }]);
  assert.deepEqual(calls.rpc, [{ functionName: "approve_order_item_by_customer", args }]);
  assert.deepEqual(calls.publish, [
    {
      eventName: "workflow.order_item.customer_decision.completed",
      payload: {
        actorUserId: "app-user-1",
        targetOrderItemId: "item-42",
        approve: true,
        noteText: "Looks good"
      }
    }
  ]);
});

test("reviewOrderItemByArchitect returns RPC data even if event publishing fails", async () => {
  const { service, calls } = createService({
    rpcResult: { data: { status: "reviewed" }, error: null },
    publish: async () => {
      throw new Error("event bus unavailable");
    }
  });

  const result = await service.reviewOrderItemByArchitect(createActor({ role: "architect" }), "token-1", {
    target_order_item_id: "item-9",
    approve: false,
    note_text: "Use a different brand"
  });

  assert.deepEqual(result, { status: "reviewed" });
  assert.equal(calls.publish.length, 1);
});

test("approveOrderItemByCustomer converts Supabase RPC errors into BadRequestException", async () => {
  const { service } = createService({
    rpcResult: { data: null, error: { message: "invalid state transition" } }
  });

  await assert.rejects(
    () =>
      service.approveOrderItemByCustomer(createActor(), "token-1", {
        target_order_item_id: "item-1",
        approve: true
      }),
    (error: unknown) =>
      error instanceof BadRequestException &&
      error.message === "invalid state transition"
  );
});

test("verifyProfessionalUser blocks non-admin users before invoking RPC", async () => {
  const { service, calls } = createService();

  await assert.rejects(
    () =>
      service.verifyProfessionalUser(createActor({ role: "customer" }), "token-1", {
        target_user_id: "user-77",
        approve: true
      }),
    (error: unknown) =>
      error instanceof ForbiddenException &&
      error.message === "Only admin users can verify professionals."
  );

  assert.equal(calls.rpc.length, 0);
  assert.equal(calls.publish.length, 0);
});
