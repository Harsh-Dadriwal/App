import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { ForbiddenException } from "@nestjs/common";
import { WalletService } from "./wallet.service";
import type { RequestActor } from "../../common/auth/auth.types";

type Row = Record<string, any>;

/** In-memory stand-in for the supabase-js calls joinSavingsPlan makes. */
function createFakeDb(tables: Record<string, Row[]>, options: { failInstallments?: boolean } = {}) {
  let nextId = 1;
  return {
    from(table: string) {
      const filters: Array<(row: Row) => boolean> = [];
      let action: "select" | "insert" | "delete" = "select";
      let payload: Row | Row[] = {};
      let columns = "";
      const rows = () => (tables[table] ??= []);
      const withCounts = (row: Row) =>
        columns.includes("savings_installments(count)")
          ? { ...row, savings_installments: [{ count: tables.savings_installments.filter((i) => i.subscription_id === row.id).length }] }
          : row;
      const run = () => {
        if (action === "insert") {
          if (table === "savings_installments" && options.failInstallments) return { data: null, error: { message: "boom" } };
          const inserted = (Array.isArray(payload) ? payload : [payload]).map((row) => ({ id: `${table}-${nextId++}`, ...row }));
          rows().push(...inserted);
          return { data: inserted, error: null };
        }
        const matched = rows().filter((row) => filters.every((filter) => filter(row)));
        if (action === "delete") {
          tables[table] = rows().filter((row) => !matched.includes(row));
          return { data: matched, error: null };
        }
        return { data: matched.map(withCounts), error: null };
      };
      const builder: any = {
        select: (value = "") => ((columns = value), builder),
        insert: (value: Row | Row[]) => ((action = "insert"), (payload = value), builder),
        delete: () => ((action = "delete"), builder),
        eq: (column: string, value: unknown) => (filters.push((row) => row[column] === value), builder),
        limit: () => builder,
        single: async () => {
          const result = run();
          return { data: result.data?.[0] ?? null, error: result.error };
        },
        maybeSingle: async () => {
          const result = run();
          return { data: result.data?.[0] ?? null, error: result.error };
        },
        then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(run()).then(resolve, reject)
      };
      return builder;
    }
  };
}

function setup(options: { failInstallments?: boolean; templateStatus?: string } = {}) {
  const tables: Record<string, Row[]> = {
    savings_plan_templates: [{
      id: "plan-12", tenant_id: "t1", status: options.templateStatus ?? "active",
      installment_amount: 5000, installment_count: 12, frequency_days: 30, maturity_bonus_amount: 5000
    }],
    wallet_accounts: [{ id: "wallet-1", tenant_id: "t1", user_id: "cust", status: "active" }],
    savings_plan_subscriptions: [],
    savings_installments: []
  };
  const events: string[] = [];
  const service = new WalletService(
    { getClient: () => createFakeDb(tables, options) } as any,
    { assertTenantAccess: async () => undefined } as any,
    { publish: async (name: string) => { events.push(name); } } as any
  );
  const actor: RequestActor = { authUserId: "auth-cust", appUserId: "cust", role: "customer", defaultTenantId: "t1" };
  return { tables, events, service, actor };
}

describe("Joining a savings plan", () => {
  test("creates the subscription and its full instalment schedule", async () => {
    const { tables, events, service, actor } = setup();
    const result = await service.joinSavingsPlan(actor, "plan-12");

    assert.equal(result.installmentCount, 12);
    assert.equal(tables.savings_plan_subscriptions.length, 1);
    assert.equal(tables.savings_plan_subscriptions[0].wallet_account_id, "wallet-1");
    assert.equal(tables.savings_installments.length, 12);
    assert.deepEqual(tables.savings_installments.map((row) => row.installment_number), Array.from({ length: 12 }, (_, i) => i + 1));
    assert.ok(tables.savings_installments.every((row) => row.expected_amount === 5000 && row.status === "pending"));
    assert.deepEqual(events, ["wallet.savings_plan.joined"]);
  });

  test("finishes a subscription left without instalments instead of creating another", async () => {
    const { tables, service, actor } = setup();
    tables.savings_plan_subscriptions.push({
      id: "sub-orphan", tenant_id: "t1", user_id: "cust", plan_template_id: "plan-12", status: "active",
      subscription_number: "SAV-23622848", started_at: "2026-10-16"
    });

    const result = await service.joinSavingsPlan(actor, "plan-12");
    assert.equal(result.subscriptionNumber, "SAV-23622848");
    assert.equal(tables.savings_plan_subscriptions.length, 1);
    assert.equal(tables.savings_installments.length, 12);
    assert.equal(tables.savings_installments[0].due_date, "2026-10-16");
    assert.equal(tables.savings_installments[1].due_date, "2026-11-15");
  });

  test("removes a new subscription again if its instalments cannot be saved", async () => {
    const { tables, service, actor } = setup({ failInstallments: true });
    await assert.rejects(service.joinSavingsPlan(actor, "plan-12"));
    assert.equal(tables.savings_plan_subscriptions.length, 0);
  });

  test("refuses plans that are not active", async () => {
    const { service, actor } = setup({ templateStatus: "paused" });
    await assert.rejects(service.joinSavingsPlan(actor, "plan-12"), ForbiddenException);
  });
});
