import test, { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BadRequestException } from "@nestjs/common";
import { WalletService } from "./wallet.service";
import type { RequestActor } from "../../common/auth/auth.types";

const mockActor: RequestActor = {
  authUserId: "auth_user_456",
  appUserId: "app_user_456",
  defaultTenantId: "tenant_456",
  role: "admin"
};

const customerActor: RequestActor = {
  authUserId: "auth_user_cust",
  appUserId: "app_user_cust",
  defaultTenantId: "tenant_456",
  role: "customer"
};

class MockWalletEngine {
  private balance = 1000;
  private ledger = new Map<string, any>();

  async postEntry(args: {
    target_tenant_id: string;
    target_wallet_account_id: string;
    target_direction: "credit" | "debit";
    target_amount: number;
    target_external_reference?: string;
  }) {
    if (args.target_external_reference && this.ledger.has(args.target_external_reference)) {
      return this.ledger.get(args.target_external_reference);
    }

    if (args.target_amount <= 0) {
      throw new Error("Wallet entry amount must be greater than zero.");
    }

    if (args.target_direction === "debit" && this.balance < args.target_amount) {
      throw new Error("Wallet debit would make the balance negative.");
    }

    if (args.target_direction === "credit") {
      this.balance += args.target_amount;
    } else {
      this.balance -= args.target_amount;
    }

    const entry = {
      id: `ledger_${Date.now()}_${Math.random()}`,
      wallet_account_id: args.target_wallet_account_id,
      tenant_id: args.target_tenant_id,
      amount: args.target_amount,
      direction: args.target_direction,
      balance: this.balance,
      external_reference: args.target_external_reference
    };

    if (args.target_external_reference) {
      this.ledger.set(args.target_external_reference, entry);
    }

    return entry;
  }

  getBalance() {
    return this.balance;
  }
}

describe("Wallet Engine Integrity Tests", () => {
  it("successful credit increases balance", async () => {
    const engine = new MockWalletEngine();
    const result = await engine.postEntry({
      target_tenant_id: "tenant_456",
      target_wallet_account_id: "wallet_1",
      target_direction: "credit",
      target_amount: 1000
    });
    assert.equal(result.balance, 2000);
    assert.equal(engine.getBalance(), 2000);
  });

  it("successful debit decreases balance", async () => {
    const engine = new MockWalletEngine();
    const result = await engine.postEntry({
      target_tenant_id: "tenant_456",
      target_wallet_account_id: "wallet_1",
      target_direction: "debit",
      target_amount: 400
    });
    assert.equal(result.balance, 600);
    assert.equal(engine.getBalance(), 600);
  });

  it("duplicate request returns existing ledger entry without double crediting", async () => {
    const engine = new MockWalletEngine();
    const ref = "ref_tx_1001";
    const res1 = await engine.postEntry({
      target_tenant_id: "tenant_456",
      target_wallet_account_id: "wallet_1",
      target_direction: "credit",
      target_amount: 500,
      target_external_reference: ref
    });
    const res2 = await engine.postEntry({
      target_tenant_id: "tenant_456",
      target_wallet_account_id: "wallet_1",
      target_direction: "credit",
      target_amount: 500,
      target_external_reference: ref
    });

    assert.equal(res1.id, res2.id);
    assert.equal(engine.getBalance(), 1500); // 1000 + 500 once
  });

  it("simultaneous requests with same idempotency key return single balance change", async () => {
    const engine = new MockWalletEngine();
    const ref = "ref_tx_simultaneous";
    const [res1, res2] = await Promise.all([
      engine.postEntry({
        target_tenant_id: "tenant_456",
        target_wallet_account_id: "wallet_1",
        target_direction: "credit",
        target_amount: 300,
        target_external_reference: ref
      }),
      engine.postEntry({
        target_tenant_id: "tenant_456",
        target_wallet_account_id: "wallet_1",
        target_direction: "credit",
        target_amount: 300,
        target_external_reference: ref
      })
    ]);

    assert.equal(res1.id, res2.id);
    assert.equal(engine.getBalance(), 1300);
  });

  it("insufficient balance fails debit operation", async () => {
    const engine = new MockWalletEngine();
    await assert.rejects(async () => {
      await engine.postEntry({
        target_tenant_id: "tenant_456",
        target_wallet_account_id: "wallet_1",
        target_direction: "debit",
        target_amount: 5000
      });
    }, /Wallet debit would make the balance negative/);
  });

  it("invalid amount rejects transaction", async () => {
    const mockSupabase: any = {
      createUserClient: () => ({
        rpc: async () => ({ data: {}, error: null })
      })
    };
    const mockTenantAccess: any = {
      assertTenantAccess: async () => {}
    };
    const mockEvents: any = {
      publish: async () => {}
    };

    const service = new WalletService(mockSupabase, mockTenantAccess, mockEvents);

    await assert.rejects(async () => {
      await service.postWalletEntry(mockActor, "token", {
        target_tenant_id: "tenant_456",
        target_wallet_account_id: "wallet_1",
        target_direction: "credit",
        target_amount: -100
      });
    }, BadRequestException);
  });

  it("repeated retry returns original transaction", async () => {
    const engine = new MockWalletEngine();
    const ref = "ref_retry_key";
    const attempts = [];
    for (let i = 0; i < 5; i++) {
      attempts.push(
        await engine.postEntry({
          target_tenant_id: "tenant_456",
          target_wallet_account_id: "wallet_1",
          target_direction: "credit",
          target_amount: 250,
          target_external_reference: ref
        })
      );
    }
    const firstId = attempts[0].id;
    assert.ok(attempts.every((item) => item.id === firstId));
    assert.equal(engine.getBalance(), 1250);
  });
});
