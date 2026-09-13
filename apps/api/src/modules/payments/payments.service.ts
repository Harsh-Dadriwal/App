import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
  Logger
} from "@nestjs/common";
import crypto from "node:crypto";
import type {
  RazorpayCreateOrderRequestDto,
  RazorpayCreateOrderResponseDto,
  RazorpayVerifyPaymentRequestDto,
  RazorpayVerifyPaymentResponseDto
} from "../../core";
import type { RequestActor } from "../../common/auth/auth.types";
import { SupabaseAdminService } from "../../common/supabase/supabase-admin.service";

export type PaymentRecord = {
  id: string;
  tenantId?: string;
  userId: string;
  orderId: string;
  paymentId?: string;
  amount: number;
  currency: string;
  purpose: string;
  referenceId?: string;
  status: "created" | "captured" | "failed";
  createdAt: string;
  verifiedAt?: string;
  updatedAt?: string;
};

function getBasicAuthHeader(keyId: string, keySecret: string) {
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(private readonly supabaseAdmin: SupabaseAdminService) {}

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

  public async resolveServerAmount(
    actor: RequestActor,
    body: RazorpayCreateOrderRequestDto
  ): Promise<{ amount: number; currency: string; purpose: string; referenceId?: string }> {
    const purpose = body.purpose ?? "general_payment";
    const refId = body.referenceId;
    const clientAmount = Number(body.amount ?? 0);

    // Business payment purposes MUST resolve payable amount from authoritative server database
    if (purpose === "order_payment" || purpose === "site_order") {
      if (!refId) {
        throw new BadRequestException("Reference ID required for order payment.");
      }
      const order = await this.fetchSiteOrder(refId);
      if (!order) {
        throw new BadRequestException("Nonexistent or invalid site order reference.");
      }
      if (actor.defaultTenantId && order.tenant_id && order.tenant_id !== actor.defaultTenantId) {
        throw new BadRequestException("Order reference does not belong to your tenant.");
      }
      const dbAmount = Number(order.total_amount ?? 0);
      if (!Number.isFinite(dbAmount) || dbAmount <= 0) {
        throw new BadRequestException("Invalid order amount in server record.");
      }
      if (body.amount !== undefined && Number(body.amount) !== dbAmount) {
        throw new BadRequestException(
          `Payment amount mismatch. Server authoritative amount is ${dbAmount}, client provided ${body.amount}.`
        );
      }
      return { amount: dbAmount, currency: "INR", purpose, referenceId: refId };
    }

    if (purpose === "savings_installment") {
      if (!refId) {
        throw new BadRequestException("Reference ID required for savings installment payment.");
      }
      const installment = await this.fetchSavingsInstallment(refId);
      if (!installment) {
        throw new BadRequestException("Nonexistent or invalid savings installment reference.");
      }
      if (actor.defaultTenantId && installment.tenant_id && installment.tenant_id !== actor.defaultTenantId) {
        throw new BadRequestException("Installment reference does not belong to your tenant.");
      }
      const dueAmount = Number(installment.expected_amount ?? 0) - Number(installment.paid_amount ?? 0);
      if (!Number.isFinite(dueAmount) || dueAmount <= 0) {
        throw new BadRequestException("Savings installment is already fully paid.");
      }
      if (body.amount !== undefined && Number(body.amount) !== dueAmount) {
        throw new BadRequestException(
          `Payment amount mismatch. Authoritative installment amount is ${dueAmount}.`
        );
      }
      return { amount: dueAmount, currency: "INR", purpose, referenceId: refId };
    }

    if (purpose === "repayment_schedule") {
      if (!refId) {
        throw new BadRequestException("Reference ID required for repayment schedule payment.");
      }
      const schedule = await this.fetchRepaymentSchedule(refId);
      if (!schedule) {
        throw new BadRequestException("Nonexistent or invalid repayment schedule reference.");
      }
      if (actor.defaultTenantId && schedule.tenant_id && schedule.tenant_id !== actor.defaultTenantId) {
        throw new BadRequestException("Repayment schedule does not belong to your tenant.");
      }
      const dueAmount = Number(schedule.installment_amount ?? 0);
      if (!Number.isFinite(dueAmount) || dueAmount <= 0) {
        throw new BadRequestException("Invalid repayment schedule amount.");
      }
      if (body.amount !== undefined && Number(body.amount) !== dueAmount) {
        throw new BadRequestException(
          `Payment amount mismatch. Authoritative schedule amount is ${dueAmount}.`
        );
      }
      return { amount: dueAmount, currency: "INR", purpose, referenceId: refId };
    }

    if (purpose === "wallet_topup") {
      if (!Number.isFinite(clientAmount) || clientAmount <= 0) {
        throw new BadRequestException("Wallet top-up amount must be a positive number.");
      }
      if (clientAmount > 500000) {
        throw new BadRequestException("Wallet top-up exceeds maximum transaction limit (₹500,000).");
      }
      return { amount: clientAmount, currency: "INR", purpose, referenceId: refId };
    }

    // Default / general purpose: strictly validate non-zero positive numeric input
    if (!Number.isFinite(clientAmount) || clientAmount <= 0) {
      throw new BadRequestException("Amount must be a positive finite number.");
    }

    return { amount: clientAmount, currency: "INR", purpose, referenceId: refId };
  }

  async createRazorpayOrder(
    actor: RequestActor,
    body: RazorpayCreateOrderRequestDto
  ): Promise<RazorpayCreateOrderResponseDto> {
    this.requireActor(actor);
    const { keyId, keySecret } = this.getConfig();
    const resolved = await this.resolveServerAmount(actor, body);
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
          purpose: resolved.purpose,
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
      tenantId: actor.defaultTenantId ?? undefined,
      userId: actor.appUserId!,
      orderId: result.id,
      amount: amountInRupees,
      currency: result.currency || "INR",
      purpose: resolved.purpose,
      referenceId: resolved.referenceId,
      status: "created",
      createdAt: new Date().toISOString()
    };

    // Strictly fail closed if database insertion fails
    await this.persistPaymentRecord(record);

    return {
      id: result.id,
      amount: result.amount,
      currency: result.currency,
      keyId,
      paymentRecordId: recordId
    };
  }

  async verifyRazorpayPayment(
    actor: RequestActor,
    body: RazorpayVerifyPaymentRequestDto
  ): Promise<RazorpayVerifyPaymentResponseDto> {
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

    const record = await this.getPaymentRecord(body.orderId);
    if (record) {
      if (record.tenantId && actor.defaultTenantId && record.tenantId !== actor.defaultTenantId) {
        return { isValid: false, reason: "Payment record belongs to another tenant" };
      }

      // Idempotency: if already captured with the same paymentId, return success without re-processing
      if (record.status === "captured" && record.paymentId === body.paymentId) {
        return {
          isValid: true,
          status: "captured",
          paymentRecordId: record.id
        };
      }

      if (body.expectedAmount && Number(record.amount) !== Number(body.expectedAmount)) {
        return { isValid: false, reason: "Amount mismatch with server record" };
      }
      if (body.currency && record.currency !== body.currency) {
        return { isValid: false, reason: "Currency mismatch" };
      }

      record.status = "captured";
      record.paymentId = body.paymentId;
      record.verifiedAt = new Date().toISOString();
      record.updatedAt = new Date().toISOString();

      // Strictly fail closed if database update fails
      await this.updatePaymentRecord(record);
    }

    return {
      isValid: true,
      status: record?.status ?? "captured",
      paymentRecordId: record?.id
    };
  }

  public async getPaymentRecord(orderId: string): Promise<PaymentRecord | undefined> {
    const client = this.supabaseAdmin.getClient();
    const { data, error } = await client
      .from("payment_records")
      .select("*")
      .eq("razorpay_order_id", orderId)
      .maybeSingle();

    if (error) {
      this.logger.error(`Database error fetching payment record for order ${orderId}: ${error.message}`);
      throw new InternalServerErrorException(`Database payment lookup failed: ${error.message}`);
    }

    if (!data) {
      return undefined;
    }

    return {
      id: data.id,
      tenantId: data.tenant_id ?? undefined,
      userId: data.user_id,
      orderId: data.razorpay_order_id,
      paymentId: data.razorpay_payment_id ?? undefined,
      amount: Number(data.amount),
      currency: data.currency,
      purpose: data.purpose,
      referenceId: data.reference_id ?? undefined,
      status: data.status,
      createdAt: data.created_at,
      verifiedAt: data.verified_at ?? undefined,
      updatedAt: data.updated_at ?? undefined
    };
  }

  private async persistPaymentRecord(record: PaymentRecord): Promise<void> {
    const client = this.supabaseAdmin.getClient();
    const { error } = await client.from("payment_records").insert({
      id: record.id.startsWith("pay_rec_") ? undefined : record.id,
      tenant_id: record.tenantId ?? null,
      user_id: record.userId,
      razorpay_order_id: record.orderId,
      razorpay_payment_id: record.paymentId ?? null,
      amount: record.amount,
      currency: record.currency,
      purpose: record.purpose,
      reference_id: record.referenceId ?? null,
      status: record.status,
      created_at: record.createdAt
    });

    if (error) {
      this.logger.error(`Database error inserting payment record for order ${record.orderId}: ${error.message}`);
      throw new InternalServerErrorException(`Payment persistence failed: ${error.message}`);
    }
  }

  private async updatePaymentRecord(record: PaymentRecord): Promise<void> {
    const client = this.supabaseAdmin.getClient();
    const { error } = await client
      .from("payment_records")
      .update({
        status: record.status,
        razorpay_payment_id: record.paymentId ?? null,
        verified_at: record.verifiedAt ?? new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq("razorpay_order_id", record.orderId);

    if (error) {
      this.logger.error(`Database error updating payment record for order ${record.orderId}: ${error.message}`);
      throw new InternalServerErrorException(`Payment record update failed: ${error.message}`);
    }
  }

  private async fetchSiteOrder(orderId: string): Promise<any> {
    const client = this.supabaseAdmin.getClient();
    const { data, error } = await client.from("site_orders").select("*").eq("id", orderId).maybeSingle();
    if (error) {
      throw new InternalServerErrorException(`Database error looking up site order: ${error.message}`);
    }
    return data ?? undefined;
  }

  private async fetchSavingsInstallment(installmentId: string): Promise<any> {
    const client = this.supabaseAdmin.getClient();
    const { data, error } = await client
      .from("savings_installments")
      .select("*")
      .eq("id", installmentId)
      .maybeSingle();
    if (error) {
      throw new InternalServerErrorException(`Database error looking up savings installment: ${error.message}`);
    }
    return data ?? undefined;
  }

  private async fetchRepaymentSchedule(scheduleId: string): Promise<any> {
    const client = this.supabaseAdmin.getClient();
    const { data, error } = await client
      .from("repayment_schedules")
      .select("*")
      .eq("id", scheduleId)
      .maybeSingle();
    if (error) {
      throw new InternalServerErrorException(`Database error looking up repayment schedule: ${error.message}`);
    }
    return data ?? undefined;
  }
}
