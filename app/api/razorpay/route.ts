import crypto from "node:crypto";
import { NextResponse } from "next/server";

type CreateOrderBody = {
  action: "createOrder";
  amount: number | string;
  receipt?: string;
  notes?: Record<string, string>;
};

type VerifyBody = {
  action: "verify";
  orderId: string;
  paymentId: string;
  signature: string;
};

type RequestBody = CreateOrderBody | VerifyBody;

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
    const amountInRupees = Number(body.amount);

    if (!Number.isFinite(amountInRupees) || amountInRupees <= 0) {
      return NextResponse.json({ error: "Amount must be greater than zero." }, { status: 400 });
    }

    const payload = {
      amount: Math.round(amountInRupees * 100),
      currency: "INR",
      receipt: body.receipt ?? `rcpt_${Date.now()}`,
      notes: body.notes ?? {},
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

    return NextResponse.json({
      id: result.id,
      amount: result.amount,
      currency: result.currency,
      keyId,
    });
  }

  if (body.action === "verify") {
    const expected = crypto
      .createHmac("sha256", keySecret)
      .update(`${body.orderId}|${body.paymentId}`)
      .digest("hex");

    return NextResponse.json({ isValid: expected === body.signature });
  }

  return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
}
