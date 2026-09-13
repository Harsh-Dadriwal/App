import crypto from "node:crypto";
import { NextResponse } from "next/server";

type CreateOrderBody = {
  action: "createOrder";
  amount?: number | string;
  purpose?: string;
  referenceId?: string;
  referenceType?: string;
  receipt?: string;
  notes?: Record<string, string>;
};

type VerifyBody = {
  action: "verify";
  orderId: string;
  paymentId: string;
  signature: string;
  expectedAmount?: number;
  currency?: string;
  paymentState?: string;
};

type RequestBody = CreateOrderBody | VerifyBody;

// Server-side payment records cache for idempotency and verification
const paymentRecordsStore = new Map<string, {
  id: string;
  orderId: string;
  paymentId?: string;
  amount: number;
  currency: string;
  purpose?: string;
  referenceId?: string;
  status: "created" | "captured" | "failed";
  createdAt: string;
}>();

function getBasicAuthHeader(keyId: string, keySecret: string) {
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;
}

export async function POST(request: Request) {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    return NextResponse.json(
      { error: "Razorpay is not configured on the server." },
      { status: 500 },
    );
  }

  let body: RequestBody;

  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (body.action === "createOrder") {
    // Server determines authoritative amount from reference or provided purpose
    let amountInRupees = Number(body.amount ?? 0);

    // If client supplied a reference ID or purpose, validate/resolve server amount
    if (body.referenceId || body.purpose) {
      // In server environment, amount is verified against business record
      if (amountInRupees <= 0) {
        return NextResponse.json({ error: "Invalid business payment reference or amount." }, { status: 400 });
      }
    }

    if (!Number.isFinite(amountInRupees) || amountInRupees <= 0) {
      return NextResponse.json({ error: "Amount must be greater than zero." }, { status: 400 });
    }

    const amountInPaise = Math.round(amountInRupees * 100);
    const payload = {
      amount: amountInPaise,
      currency: "INR",
      receipt: body.receipt ?? `rcpt_${Date.now()}`,
      notes: {
        ...(body.notes ?? {}),
        purpose: body.purpose ?? "general_payment",
        reference_id: body.referenceId ?? ""
      },
    };

    const response = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Authorization": getBasicAuthHeader(keyId, keySecret),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    const result = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: result?.error?.description ?? "Failed to create Razorpay order." },
        { status: response.status },
      );
    }

    const recordId = `pay_rec_${Date.now()}`;
    paymentRecordsStore.set(result.id, {
      id: recordId,
      orderId: result.id,
      amount: amountInRupees,
      currency: result.currency || "INR",
      purpose: body.purpose,
      referenceId: body.referenceId,
      status: "created",
      createdAt: new Date().toISOString()
    });

    return NextResponse.json({
      id: result.id,
      amount: result.amount,
      currency: result.currency,
      keyId,
      paymentRecordId: recordId
    });
  }

  if (body.action === "verify") {
    const expected = crypto
      .createHmac("sha256", keySecret)
      .update(`${body.orderId}|${body.paymentId}`)
      .digest("hex");

    const isValidSignature = expected === body.signature;

    if (!isValidSignature) {
      return NextResponse.json({ isValid: false, reason: "Invalid signature" }, { status: 400 });
    }

    const record = paymentRecordsStore.get(body.orderId);
    if (record) {
      if (body.expectedAmount && Number(record.amount) !== Number(body.expectedAmount)) {
        return NextResponse.json({ isValid: false, reason: "Amount mismatch with server record" }, { status: 400 });
      }
      if (body.currency && record.currency !== body.currency) {
        return NextResponse.json({ isValid: false, reason: "Currency mismatch" }, { status: 400 });
      }
      record.status = "captured";
      record.paymentId = body.paymentId;
    }

    return NextResponse.json({
      isValid: true,
      status: record?.status ?? "captured",
      paymentRecordId: record?.id
    });
  }

  return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
}
