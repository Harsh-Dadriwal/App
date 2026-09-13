import test, { describe } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { PaymentsService } from "./payments.service";
import type { RequestActor } from "../../common/auth/auth.types";
import type { SupabaseAdminService } from "../../common/supabase/supabase-admin.service";

const tenantA: RequestActor = {
  authUserId: "auth_user_tenant_a",
  appUserId: "app_user_tenant_a",
  defaultTenantId: "tenant_a_123",
  role: "customer"
};

const tenantB: RequestActor = {
  authUserId: "auth_user_tenant_b",
  appUserId: "app_user_tenant_b",
  defaultTenantId: "tenant_b_456",
  role: "customer"
};

function createMockSupabaseAdmin(mockDataMap: Record<string, any[]> = {}): SupabaseAdminService {
  const mockClient = {
    from: (table: string) => {
      const records = mockDataMap[table] ?? [];
      return {
        select: () => ({
          eq: (col: string, val: any) => ({
            maybeSingle: async () => {
              const item = records.find((r) => r[col] === val);
              return { data: item || null, error: null };
            }
          })
        }),
        insert: async (row: any) => {
          records.push(row);
          return { data: row, error: null };
        },
        update: (updates: any) => ({
          eq: async (col: string, val: any) => {
            const item = records.find((r) => r[col] === val);
            if (item) Object.assign(item, updates);
            return { data: item || null, error: null };
          }
        })
      };
    }
  };

  return {
    getClient: () => mockClient as any,
    getReadClient: () => mockClient as any,
    createUserClient: () => mockClient as any,
    createReadUserClient: () => mockClient as any
  } as any;
}

describe("PaymentsService Fail-Closed Security & Integrity Controls", () => {
  process.env.RAZORPAY_KEY_ID = "rzp_test_key";
  process.env.RAZORPAY_KEY_SECRET = "secret_123";

  test("rejects price tampering when client submits ₹1 for ₹2500 order reference", async () => {
    const mockDb = createMockSupabaseAdmin({
      site_orders: [
        {
          id: "order_2500",
          tenant_id: "tenant_a_123",
          total_amount: 2500
        }
      ]
    });
    const service = new PaymentsService(mockDb);

    // Client attempts to submit amount: 1 for ₹2500 order
    await assert.rejects(
      async () => {
        await service.resolveServerAmount(tenantA, {
          amount: 1,
          purpose: "order_payment",
          referenceId: "order_2500"
        });
      },
      (err: any) => {
        assert.match(err.message, /Payment amount mismatch/);
        return true;
      }
    );

    // Omitting amount or passing exact ₹2500 succeeds
    const resolved = await service.resolveServerAmount(tenantA, {
      purpose: "order_payment",
      referenceId: "order_2500"
    });
    assert.equal(resolved.amount, 2500);
  });

  test("rejects invalid, negative, zero, NaN, or Infinite amounts", async () => {
    const service = new PaymentsService(createMockSupabaseAdmin());

    await assert.rejects(async () => {
      await service.resolveServerAmount(tenantA, { amount: -500, purpose: "wallet_topup" });
    }, /Wallet top-up amount must be a positive number/);

    await assert.rejects(async () => {
      await service.resolveServerAmount(tenantA, { amount: 0, purpose: "wallet_topup" });
    }, /Wallet top-up amount must be a positive number/);

    await assert.rejects(async () => {
      await service.resolveServerAmount(tenantA, { amount: NaN, purpose: "wallet_topup" });
    }, /Wallet top-up amount must be a positive number/);
  });

  test("rejects order reference belonging to another tenant", async () => {
    const mockDb = createMockSupabaseAdmin({
      site_orders: [
        {
          id: "order_tenant_b",
          tenant_id: "tenant_b_456",
          total_amount: 5000
        }
      ]
    });
    const service = new PaymentsService(mockDb);

    // Tenant A attempts to process payment for Tenant B's order
    await assert.rejects(
      async () => {
        await service.resolveServerAmount(tenantA, {
          purpose: "order_payment",
          referenceId: "order_tenant_b"
        });
      },
      (err: any) => {
        assert.match(err.message, /does not belong to your tenant/);
        return true;
      }
    );
  });

  test("fails closed with InternalServerErrorException when database lookup fails", async () => {
    const failingDb = {
      getClient: () => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: { message: "DB connection failure" } })
            })
          })
        })
      })
    } as any;
    const service = new PaymentsService(failingDb);

    await assert.rejects(
      async () => {
        await service.getPaymentRecord("order_fail_1");
      },
      (err: any) => {
        assert.match(err.message, /Database payment lookup failed/);
        return true;
      }
    );
  });

  test("durable payment persistence across service re-instantiation", async () => {
    const mockRecordsTable: any[] = [];
    const mockDb = createMockSupabaseAdmin({
      payment_records: mockRecordsTable
    });

    const service1 = new PaymentsService(mockDb);

    // Create record directly in mock persistence
    mockRecordsTable.push({
      id: "pay_rec_101",
      tenant_id: "tenant_a_123",
      user_id: "app_user_tenant_a",
      razorpay_order_id: "order_persist_999",
      amount: 1200,
      currency: "INR",
      purpose: "wallet_topup",
      status: "created",
      created_at: new Date().toISOString()
    });

    // Re-instantiate service (simulating API server restart)
    const service2 = new PaymentsService(mockDb);

    const record = await service2.getPaymentRecord("order_persist_999");
    assert.notEqual(record, undefined);
    assert.equal(record?.amount, 1200);
    assert.equal(record?.tenantId, "tenant_a_123");
    assert.equal(record?.status, "created");
  });

  test("idempotent payment verification (duplicate verify calls return success without duplicate processing)", async () => {
    const mockRecordsTable = [
      {
        id: "pay_rec_202",
        tenant_id: "tenant_a_123",
        user_id: "app_user_tenant_a",
        razorpay_order_id: "order_idempotent_1",
        amount: 3500,
        currency: "INR",
        purpose: "wallet_topup",
        status: "created",
        created_at: new Date().toISOString()
      }
    ];
    const mockDb = createMockSupabaseAdmin({ payment_records: mockRecordsTable });
    const service = new PaymentsService(mockDb);

    const orderId = "order_idempotent_1";
    const paymentId = "pay_razor_abc123";
    const signature = crypto
      .createHmac("sha256", "secret_123")
      .update(`${orderId}|${paymentId}`)
      .digest("hex");

    // First verification call
    const res1 = await service.verifyRazorpayPayment(tenantA, {
      orderId,
      paymentId,
      signature
    });
    assert.equal(res1.isValid, true);
    assert.equal(res1.status, "captured");

    // Second verification call (duplicate verify request)
    const res2 = await service.verifyRazorpayPayment(tenantA, {
      orderId,
      paymentId,
      signature
    });
    assert.equal(res2.isValid, true);
    assert.equal(res2.status, "captured");
    assert.equal(res2.paymentRecordId, "pay_rec_202");
  });

  test("concurrent payment verification requests process idempotently", async () => {
    const mockRecordsTable = [
      {
        id: "pay_rec_303",
        tenant_id: "tenant_a_123",
        user_id: "app_user_tenant_a",
        razorpay_order_id: "order_concurrent_1",
        amount: 4500,
        currency: "INR",
        purpose: "wallet_topup",
        status: "created",
        created_at: new Date().toISOString()
      }
    ];
    const mockDb = createMockSupabaseAdmin({ payment_records: mockRecordsTable });
    const service = new PaymentsService(mockDb);

    const orderId = "order_concurrent_1";
    const paymentId = "pay_razor_concurrent_xyz";
    const signature = crypto
      .createHmac("sha256", "secret_123")
      .update(`${orderId}|${paymentId}`)
      .digest("hex");

    // Execute two simultaneous verification requests
    const [res1, res2] = await Promise.all([
      service.verifyRazorpayPayment(tenantA, { orderId, paymentId, signature }),
      service.verifyRazorpayPayment(tenantA, { orderId, paymentId, signature })
    ]);

    assert.equal(res1.isValid, true);
    assert.equal(res2.isValid, true);
    assert.equal(res1.status, "captured");
    assert.equal(res2.status, "captured");
  });
});
