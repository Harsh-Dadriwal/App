import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

const TENANT_ADMIN_ROLES = ["owner", "admin"];

function reject(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Guards a Next.js API route for shop admins. The caller sends their sign-in token as
 * `Authorization: Bearer <token>`; it is checked with Supabase Auth, then the profile and
 * workspace roles are read with that same token, so row-level security still applies and no
 * service-role key is needed here. Returns a ready-made error response to send back, or
 * null when the caller is allowed.
 */
export async function requireShopAdmin(request: NextRequest): Promise<NextResponse | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return reject("This feature is not available right now. Please try again later.", 503);
  }

  const header = request.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!token) {
    return reject("Please sign in to continue.", 401);
  }

  const supabase = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } }
  });

  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user) {
    return reject("Your session has expired. Please sign in again.", 401);
  }

  const profile = await supabase
    .from("users")
    .select("id, role")
    .eq("auth_user_id", authData.user.id)
    .maybeSingle();
  if (profile.error || !profile.data) {
    return reject("Your profile could not be found. Please sign in again.", 401);
  }

  if (profile.data.role === "admin") {
    return null;
  }

  const membership = await supabase
    .from("tenant_memberships")
    .select("id")
    .eq("user_id", profile.data.id)
    .eq("is_active", true)
    .in("role", TENANT_ADMIN_ROLES)
    .limit(1);
  if (!membership.error && membership.data?.length) {
    return null;
  }

  return reject("Only shop admins can do this.", 403);
}
