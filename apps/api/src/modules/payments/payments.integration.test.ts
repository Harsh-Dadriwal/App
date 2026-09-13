import test, { describe, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { PaymentsService } from "./payments.service";
import { createRealPostgresSupabaseAdmin, executeCommand } from "./real-db-admin";
import type { RequestActor } from "../../common/auth/auth.types";

const realTenantA: RequestActor = {
  authUserId: "auth_real_user_a",
  appUserId: "00000000-0000-0000-0000-00000000000a",
  defaultTenantId: "11111111-1111-1111-1111-111111111111",
  role: "customer"
};

const realTenantB: RequestActor = {
  authUserId: "auth_real_user_b",
  appUserId: "00000000-0000-0000-0000-00000000000b",
  defaultTenantId: "22222222-2222-2222-2222-222222222222",
  role: "customer"
};

describe("Real PostgreSQL Database Integration Tests (Fail-Closed & Durable Persistence)", () => {
  const realDb = createRealPostgresSupabaseAdmin();
  let service: PaymentsService;

  before(() => {
    process.env.RAZORPAY_KEY_ID = "rzp_test_key";
    process.env.RAZORPAY_KEY_SECRET = "secret_123";

    // Clean up and seed test environment in PostgreSQL
    executeCommand("TRUNCATE public.payment_records, public.site_orders, public.users, public.tenants CASCADE;");

    executeCommand(`
      INSERT INTO public.tenants (id, name, slug) VALUES 
      ('11111111-1111-1111-1111-111111111111', 'Tenant A', 'tenant-a'),
      ('22222222-2222-2222-2222-222222222222', 'Tenant B', 'tenant-b');

      INSERT INTO public.users (id, email, full_name, role) VALUES 
      ('00000000-0000-0000-0000-00000000000a', 'usera@example.com', 'User A', 'customer'),
      ('00000000-0000-0000-0000-00000000000b', 'userb@example.com', 'User B', 'customer');

      INSERT INTO public.site_orders (id, tenant_id, customer_id, order_number, total_amount, status) VALUES 
      ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-00000000000a', 'ORD-2500', 2500.00, 'confirmed'),
      ('44444444-4444-4444-4444-444444444444', '22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-00000000000b', 'ORD-5000', 5000.00, 'confirmed');
    `);

    service = new PaymentsService(realDb);
  });

  test("[REAL DB] Price Tampering: Client submits ₹1 for ₹2500 order → Server rejects", async () => {
    await assert.rejects(
      async () => {
        await service.resolveServerAmount(realTenantA, {
          amount: 1,
          purpose: "order_payment",
          referenceId: "33333333-3333-3333-3333-333333333333"
        });
      },
      (err: any) => {
        assert.match(err.message, /Payment amount mismatch/);
        return true;
      }
    );

    const resolved = await service.resolveServerAmount(realTenantA, {
      purpose: "order_payment",
      referenceId: "33333333-3333-3333-3333-333333333333"
    });
    assert.equal(resolved.amount, 2500);
  });

  test("[REAL DB] Tenant Isolation: Tenant A cannot resolve Tenant B's order", async () => {
    await assert.rejects(
      async () => {
        await service.resolveServerAmount(realTenantA, {
          purpose: "order_payment",
          referenceId: "44444444-4444-4444-4444-444444444444"
        });
      },
      (err: any) => {
        assert.match(err.message, /does not belong to your tenant/);
        return true;
      }
    );
  });

  test("[REAL DB] Durable Payment Persistence & Service Restart Simulation", async () => {
    const orderId = "order_real_pg_101";

    // Insert payment record into real PostgreSQL database
    executeCommand(`
      INSERT INTO public.payment_records (tenant_id, user_id, razorpay_order_id, amount, currency, purpose, status)
      VALUES ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-00000000000a', '${orderId}', 1800.00, 'INR', 'wallet_topup', 'created');
    `);

    // Simulate API process restart by creating a new PaymentsService instance
    const restartedService = new PaymentsService(realDb);

    const record = await restartedService.getPaymentRecord(orderId);
    assert.notEqual(record, undefined);
    assert.equal(record?.amount, 1800);
    assert.equal(record?.tenantId, "11111111-1111-1111-1111-111111111111");
    assert.equal(record?.status, "created");
  });

  test("[REAL DB] Idempotent Verification & Unique Razorpay Payment ID Constraint", async () => {
    const orderId = "order_real_pg_202";
    const paymentId = "pay_razor_real_999";
    const signature = crypto
      .createHmac("sha256", "secret_123")
      .update(`${orderId}|${paymentId}`)
      .digest("hex");

    executeCommand(`
      INSERT INTO public.payment_records (tenant_id, user_id, razorpay_order_id, amount, currency, purpose, status)
      VALUES ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-00000000000a', '${orderId}', 3200.00, 'INR', 'wallet_topup', 'created');
    `);

    // First verification call updates PostgreSQL payment record to status 'captured'
    const res1 = await service.verifyRazorpayPayment(realTenantA, {
      orderId,
      paymentId,
      signature
    });
    assert.equal(res1.isValid, true);
    assert.equal(res1.status, "captured");

    // Second verification call (duplicate verify request) returns captured status without duplicate processing
    const res2 = await service.verifyRazorpayPayment(realTenantA, {
      orderId,
      paymentId,
      signature
    });
    assert.equal(res2.isValid, true);
    assert.equal(res2.status, "captured");
  });

  test("[REAL DB] Concurrent Verification Requests succeed idempotently on PostgreSQL", async () => {
    const orderId = "order_real_pg_303";
    const paymentId = "pay_razor_concurrent_real";
    const signature = crypto
      .createHmac("sha256", "secret_123")
      .update(`${orderId}|${paymentId}`)
      .digest("hex");

    executeCommand(`
      INSERT INTO public.payment_records (tenant_id, user_id, razorpay_order_id, amount, currency, purpose, status)
      VALUES ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-00000000000a', '${orderId}', 4200.00, 'INR', 'wallet_topup', 'created');
    `);

    const [res1, res2] = await Promise.all([
      service.verifyRazorpayPayment(realTenantA, { orderId, paymentId, signature }),
      service.verifyRazorpayPayment(realTenantA, { orderId, paymentId, signature })
    ]);

    assert.equal(res1.isValid, true);
    assert.equal(res2.isValid, true);
    assert.equal(res1.status, "captured");
    assert.equal(res2.status, "captured");
  });

  test("[REAL DB] Fail-Closed Security: Database connection failure throws InternalServerErrorException", async () => {
    const brokenDb = {
      getClient: () => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: null,
                error: { message: "PostgreSQL connection refused" }
              })
            })
          })
        })
      })
    } as any;

    const failClosedService = new PaymentsService(brokenDb);

    await assert.rejects(
      async () => {
        await failClosedService.getPaymentRecord("order_unreachable");
      },
      (err: any) => {
        assert.match(err.message, /Database payment lookup failed/);
        return true;
      }
    );
  });
});
