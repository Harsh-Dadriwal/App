import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { BadRequestException } from "@nestjs/common";
import { WalletService } from "./wallet.service";
import { nextPayableInstallments } from "../../core/gateway/fintech-gateway";
import type { RequestActor } from "../../common/auth/auth.types";

type Row = Record<string, any>;

function createFakeDb(tables: Record<string, Row[]>) {
  return {
    from(table: string) {
      const filters: Array<(row: Row) => boolean> = [];
      let sortKey: string | null = null;
      let max = Infinity;
      const run = () => {
        const rows = (tables[table] ?? []).filter((row) => filters.every((filter) => filter(row)));
        if (sortKey) rows.sort((a, b) => a[sortKey!] - b[sortKey!]);
        return { data: rows.slice(0, max), error: null };
      };
      const builder: any = {
        select: () => builder,
        eq: (column: string, value: unknown) => (filters.push((row) => row[column] === value), builder),
        lt: (column: string, value: number) => (filters.push((row) => row[column] < value), builder),
        in: (column: string, values: unknown[]) => (filters.push((row) => values.includes(row[column])), builder),
        order: (column: string) => ((sortKey = column), builder),
        limit: (value: number) => ((max = value), builder),
        maybeSingle: async () => ({ data: run().data[0] ?? null, error: null }),
        then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(run()).then(resolve, reject)
      };
      return builder;
    }
  };
}

const schedule = (statuses: string[]) =>
  statuses.map((status, index) => ({
    id: `inst-${index + 1}`,
    tenant_id: "t1",
    subscription_id: "sub-1",
    installment_number: index + 1,
    status
  }));

function setup(statuses: string[]) {
  const tables = { savings_installments: schedule(statuses) };
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const service = new WalletService(
    {
      getClient: () => createFakeDb(tables),
      createUserClient: () => ({
        rpc: async (name: string, args: Record<string, unknown>) => {
          rpcCalls.push({ name, args });
          return { data: {}, error: null };
        }
      })
    } as any,
    { assertTenantAccess: async () => undefined } as any,
    { publish: async () => undefined } as any
  );
  const actor: RequestActor = { authUserId: "auth-cust", appUserId: "cust", role: "customer", defaultTenantId: "t1" };
  return { service, actor, rpcCalls };
}

describe("Savings instalments are paid in order", () => {
  test("the next payable instalment is the lowest-numbered open one per plan", () => {
    const rows = [
      ...schedule(["paid", "late", "pending"]),
      { id: "other-1", tenant_id: "t1", subscription_id: "sub-2", installment_number: 1, status: "pending" }
    ];
    const next = nextPayableInstallments(rows);
    assert.equal(next.get("sub-1")?.id, "inst-2");
    assert.equal(next.get("sub-2")?.id, "other-1");
  });

  test("refuses to pay instalment 2 while instalment 1 is unpaid", async () => {
    const { service, actor, rpcCalls } = setup(["pending", "pending"]);
    await assert.rejects(
      service.paySavingsInstallment(actor, "token", { target_installment_id: "inst-2", payment_amount: 5000 }),
      (error: unknown) => error instanceof BadRequestException && /instalment 1 first/.test(error.message)
    );
    assert.equal(rpcCalls.length, 0);
  });

  test("pays the next instalment, sending only the database function's own fields", async () => {
    const { service, actor, rpcCalls } = setup(["paid", "pending", "pending"]);
    await service.paySavingsInstallment(actor, "token", {
      target_installment_id: "inst-2",
      payment_amount: 5000,
      note_text: "Razorpay installment payment: pay_123",
      target_tenant_id: "t1"
    });
    assert.deepEqual(rpcCalls, [{
      name: "pay_savings_installment",
      args: { target_installment_id: "inst-2", payment_amount: 5000, note_text: "Razorpay installment payment: pay_123" }
    }]);
  });
});
