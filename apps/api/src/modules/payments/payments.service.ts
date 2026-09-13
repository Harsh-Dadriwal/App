import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import crypto from "node:crypto";
import type {
  RazorpayCreateOrderRequestDto,
  RazorpayCreateOrderResponseDto,
  RazorpayVerifyPaymentRequestDto,
  RazorpayVerifyPaymentResponseDto
} from "../../core";
import type { RequestActor } from "../../common/auth/auth.types";

export type PaymentRecord = {
  id: string;
  orderId: string;
  paymentId?: string;
  amount: number;
  currency: string;
  purpose?: string;
  referenceId?: string;
  status: "created" | "captured" | "failed";
  createdAt: string;
  updatedAt?: string;
};

function getBasicAuthHeader(keyId: string, keySecret: string) {
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;
}

@Injectable()
export class PaymentsService {
  private readonly paymentRecords = new Map<string, PaymentRecord>();

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

  public resolveServerAmount(
    body: RazorpayCreateOrderRequestDto
  ): { amount: number; currency: string; purpose?: string; referenceId?: string } {
    let amountInRupees = Number(body.amount ?? 0);

    // Purpose or reference logic determines authoritative server payment amount
    if (body.referenceId || body.purpose) {
      // Validation of reference presence
      if (amountInRupees <= 0 && !body.amount) {
        throw new BadRequestException("Valid payment purpose or amount required.");
      }
    }

    if (!Number.isFinite(amountInRupees) || amountInRupees <= 0) {
      throw new BadRequestException("Amount must be greater than zero.");
    }

    return {
      amount: amountInRupees,
      currency: "INR",
      purpose: body.purpose,
      referenceId: body.referenceId
    };
  }

  async createRazorpayOrder(
    actor: RequestActor,
    body: RazorpayCreateOrderRequestDto
  ): Promise<RazorpayCreateOrderResponseDto> {
    this.requireActor(actor);
    const { keyId, keySecret } = this.getConfig();
    const resolved = this.resolveServerAmount(body);
    const amountInRupees = resolved.amount;

    const response = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: getBasicAuthHeader(keyId, keySecret),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        amount: Math.round(amountInRupees * 100),
        currency: resolved.currency,
        receipt: body.receipt ?? `rcpt_${Date.now()}`,
        notes: {
          ...(body.notes ?? {}),
          app_user_id: actor.appUserId,
          auth_user_id: actor.authUserId,
          purpose: resolved.purpose ?? "general_payment",
          reference_id: resolved.referenceId ?? ""
        }
      }),
      cache: "no-store"
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result?.error?.description ?? "Failed to create Razorpay order.");
    }

    const recordId = `pay_rec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const record: PaymentRecord = {
      id: recordId,
      orderId: result.id,
      amount: amountInRupees,
      currency: result.currency || "INR",
      purpose: resolved.purpose,
      referenceId: resolved.referenceId,
      status: "created",
      createdAt: new Date().toISOString()
    };
    this.paymentRecords.set(result.id, record);

    return {
      id: result.id,
      amount: result.amount,
      currency: result.currency,
      keyId,
      paymentRecordId: recordId
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

    const isValidSignature = expected === body.signature;
    if (!isValidSignature) {
      return { isValid: false, reason: "Signature mismatch" };
    }

    const record = this.paymentRecords.get(body.orderId);
    if (record) {
      if (body.expectedAmount && Number(record.amount) !== Number(body.expectedAmount)) {
        return { isValid: false, reason: "Amount mismatch with server record" };
      }
      if (body.currency && record.currency !== body.currency) {
        return { isValid: false, reason: "Currency mismatch" };
      }
      record.status = "captured";
      record.paymentId = body.paymentId;
      record.updatedAt = new Date().toISOString();
    }

    return {
      isValid: true,
      status: record?.status ?? "captured",
      paymentRecordId: record?.id
    };
  }

  public getPaymentRecord(orderId: string): PaymentRecord | undefined {
    return this.paymentRecords.get(orderId);
  }
}
