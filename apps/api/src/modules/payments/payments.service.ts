import { Injectable, UnauthorizedException } from "@nestjs/common";
import crypto from "node:crypto";
import type {
  RazorpayCreateOrderRequestDto,
  RazorpayCreateOrderResponseDto,
  RazorpayVerifyPaymentRequestDto,
  RazorpayVerifyPaymentResponseDto
} from "@mahalaxmi/core/types/contracts";
import type { RequestActor } from "../../common/auth/auth.types";

function getBasicAuthHeader(keyId: string, keySecret: string) {
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;
}

@Injectable()
export class PaymentsService {
  private getConfig() {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
      throw new Error("Razorpay is not configured on the server.");
    }

    return { keyId, keySecret };
  }

  private requireActor(actor: RequestActor) {
    if (!actor.authUserId || !actor.appUserId) {
      throw new UnauthorizedException("Authenticated app user required.");
    }
  }

  async createRazorpayOrder(
    actor: RequestActor,
    body: RazorpayCreateOrderRequestDto
  ): Promise<RazorpayCreateOrderResponseDto> {
    this.requireActor(actor);
    const { keyId, keySecret } = this.getConfig();
    const amountInRupees = Number(body.amount);

    if (!Number.isFinite(amountInRupees) || amountInRupees <= 0) {
      throw new Error("Amount must be greater than zero.");
    }

    const response = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: getBasicAuthHeader(keyId, keySecret),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        amount: Math.round(amountInRupees * 100),
        currency: "INR",
        receipt: body.receipt ?? `rcpt_${Date.now()}`,
        notes: {
          ...(body.notes ?? {}),
          app_user_id: actor.appUserId,
          auth_user_id: actor.authUserId
        }
      }),
      cache: "no-store"
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result?.error?.description ?? "Failed to create Razorpay order.");
    }

    return {
      id: result.id,
      amount: result.amount,
      currency: result.currency,
      keyId
    };
  }

  verifyRazorpayPayment(
    actor: RequestActor,
    body: RazorpayVerifyPaymentRequestDto
  ): RazorpayVerifyPaymentResponseDto {
    this.requireActor(actor);
    const { keySecret } = this.getConfig();
    const expected = crypto
      .createHmac("sha256", keySecret)
      .update(`${body.orderId}|${body.paymentId}`)
      .digest("hex");

    return {
      isValid: expected === body.signature
    };
  }
}
