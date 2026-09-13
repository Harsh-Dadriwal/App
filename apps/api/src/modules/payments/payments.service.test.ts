import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { PaymentsService } from "./payments.service";
import type { RequestActor } from "../../common/auth/auth.types";

const mockActor: RequestActor = {
  authUserId: "auth_user_123",
  appUserId: "app_user_123",
  defaultTenantId: "tenant_123",
  role: "customer"
};

test("PaymentsService — resolveServerAmount derives server payment amount", () => {
  const service = new PaymentsService();

  const resolved = service.resolveServerAmount({
    amount: 1500,
    purpose: "site_order_payment",
    referenceId: "order_999"
  });

  assert.equal(resolved.amount, 1500);
  assert.equal(resolved.currency, "INR");
  assert.equal(resolved.purpose, "site_order_payment");
  assert.equal(resolved.referenceId, "order_999");
});

test("PaymentsService — verifyRazorpayPayment performs HMAC verification & amount matching", () => {
  const service = new PaymentsService();
  process.env.RAZORPAY_KEY_ID = "rzp_test_key";
  process.env.RAZORPAY_KEY_SECRET = "secret_123";

  const orderId = "order_123456";
  const paymentId = "pay_987654";
  const expectedSignature = crypto
    .createHmac("sha256", "secret_123")
    .update(`${orderId}|${paymentId}`)
    .digest("hex");

  const validVerification = service.verifyRazorpayPayment(mockActor, {
    orderId,
    paymentId,
    signature: expectedSignature
  });

  assert.equal(validVerification.isValid, true);

  const invalidVerification = service.verifyRazorpayPayment(mockActor, {
    orderId,
    paymentId,
    signature: "invalid_sig"
  });

  assert.equal(invalidVerification.isValid, false);
});
