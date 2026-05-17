import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function normalizeUsername(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._]/g, "")
    .slice(0, 24);
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function normalizePhone(value: string) {
  return value.replace(/[^0-9+]/g, "");
}

export async function POST(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    return NextResponse.json(
      {
        available: true,
        checks: {
          username: { available: true },
          email: { available: true },
          phone: { available: true }
        }
      },
      { status: 200 }
    );
  }

  const payload = (await request.json().catch(() => ({}))) as {
    username?: string;
    email?: string;
    phone?: string;
  };

  const username = payload.username ? normalizeUsername(payload.username) : "";
  const email = payload.email ? normalizeEmail(payload.email) : "";
  const phone = payload.phone ? normalizePhone(payload.phone) : "";

  const supabase = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  const [usernameResult, emailResult, phoneResult] = await Promise.all([
    username
      ? supabase.from("users").select("id").ilike("username", username).limit(1)
      : Promise.resolve({ data: [], error: null } as any),
    email
      ? supabase.from("users").select("id").ilike("email", email).limit(1)
      : Promise.resolve({ data: [], error: null } as any),
    phone
      ? supabase.from("users").select("id").eq("phone", phone).limit(1)
      : Promise.resolve({ data: [], error: null } as any)
  ]);

  const errors = [usernameResult.error, emailResult.error, phoneResult.error]
    .filter(Boolean)
    .map((error: any) => error.message);

  if (errors.length) {
    return NextResponse.json({ error: errors[0] }, { status: 500 });
  }

  const checks = {
    username: {
      available: username ? (usernameResult.data?.length ?? 0) === 0 : true
    },
    email: {
      available: email ? (emailResult.data?.length ?? 0) === 0 : true
    },
    phone: {
      available: phone ? (phoneResult.data?.length ?? 0) === 0 : true
    }
  };

  return NextResponse.json({
    available: checks.username.available && checks.email.available && checks.phone.available,
    checks
  });
}
