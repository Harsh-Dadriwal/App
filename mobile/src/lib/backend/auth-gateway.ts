import type { ActiveTenant, TenantMembership, UserProfile } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import { backendRequest, type BackendResult } from "./http";
import { isBackendApiConfigured } from "./config";

const selectString =
  "id, auth_user_id, default_tenant_id, full_name, email, phone, role, city, state, company_name, verification_status, is_admin_verified";

export async function fetchAppProfile(authUserId: string): Promise<BackendResult<UserProfile>> {
  if (isBackendApiConfigured()) {
    const result = await backendRequest<UserProfile>(
      `/api/v1/me/profile?authUserId=${encodeURIComponent(authUserId)}`
    );
    if (result.data || !result.error) {
      return result;
    }
  }

  if (!supabase) {
    return { data: null, error: "Supabase is not configured." };
  }

  const authLinkedResult = await supabase
    .from("users")
    .select(selectString)
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (authLinkedResult.data && !authLinkedResult.error) {
    return { data: authLinkedResult.data as UserProfile, error: null };
  }

  const rpcResult = await supabase.rpc("get_my_profile");
  const rpcData = Array.isArray(rpcResult.data) ? rpcResult.data[0] ?? null : rpcResult.data ?? null;
  if (rpcData && !rpcResult.error) {
    return { data: rpcData as UserProfile, error: null };
  }

  const directIdResult = await supabase
    .from("users")
    .select(selectString)
    .eq("id", authUserId)
    .maybeSingle();

  if (directIdResult.data && !directIdResult.error) {
    return { data: directIdResult.data as UserProfile, error: null };
  }

  return {
    data: null,
    error:
      authLinkedResult.error?.message ??
      rpcResult.error?.message ??
      directIdResult.error?.message ??
      "No app profile row is visible for this account."
  };
}

export async function fetchTenantMemberships(
  userId: string
): Promise<BackendResult<TenantMembership[]>> {
  if (isBackendApiConfigured()) {
    const result = await backendRequest<TenantMembership[]>(
      `/api/v1/me/tenants?userId=${encodeURIComponent(userId)}`
    );
    if (result.data || !result.error) {
      return { data: result.data ?? [], error: null };
    }
  }

  if (!supabase) {
    return { data: [], error: "Supabase is not configured." };
  }

  const membershipResult = await supabase
    .from("tenant_memberships")
    .select(
      "id, tenant_id, role, is_default, is_active, tenant:tenants(id, slug, display_name, status)"
    )
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("joined_at", { ascending: true });

  if (membershipResult.error) {
    return { data: [], error: membershipResult.error.message };
  }

  const memberships = ((membershipResult.data ?? []) as Array<Record<string, any>>).map((membership) => ({
    ...membership,
    tenant: Array.isArray(membership.tenant) ? membership.tenant[0] ?? null : membership.tenant ?? null
  })) as TenantMembership[];
  const tenantIds = memberships.map((membership) => membership.tenant_id);
  const brandingMap = new Map<string, TenantMembership["branding"]>();

  if (tenantIds.length) {
    const brandingResult = await supabase
      .from("tenant_branding")
      .select("tenant_id, app_name, logo_url, primary_color, secondary_color, accent_color")
      .in("tenant_id", tenantIds);

    for (const row of brandingResult.data ?? []) {
      brandingMap.set(row.tenant_id, {
        app_name: row.app_name,
        logo_url: row.logo_url,
        primary_color: row.primary_color,
        secondary_color: row.secondary_color,
        accent_color: row.accent_color
      });
    }
  }

  return {
    data: memberships.map((membership) => ({
      ...membership,
      branding: brandingMap.get(membership.tenant_id) ?? null
    })),
    error: null
  };
}

export function resolveActiveTenant(
  profile: UserProfile | null,
  memberships: TenantMembership[]
): ActiveTenant | null {
  const preferredTenantId =
    profile?.default_tenant_id ||
    memberships.find((membership) => membership.is_default)?.tenant_id ||
    memberships[0]?.tenant_id ||
    null;

  const activeMembership =
    memberships.find((membership) => membership.tenant_id === preferredTenantId) ??
    memberships[0] ??
    null;

  if (!activeMembership?.tenant) {
    return null;
  }

  return {
    id: activeMembership.tenant.id,
    slug: activeMembership.tenant.slug,
    display_name: activeMembership.tenant.display_name,
    status: activeMembership.tenant.status,
    membership_role: activeMembership.role,
    app_name: activeMembership.branding?.app_name ?? activeMembership.tenant.display_name,
    logo_url: activeMembership.branding?.logo_url ?? null,
    primary_color: activeMembership.branding?.primary_color ?? null,
    secondary_color: activeMembership.branding?.secondary_color ?? null,
    accent_color: activeMembership.branding?.accent_color ?? null
  };
}

export async function switchDefaultTenant(
  profileId: string,
  tenantId: string
): Promise<BackendResult<{ tenantId: string }>> {
  if (isBackendApiConfigured()) {
    const result = await backendRequest<{ tenantId: string }>(`/api/v1/me/tenants/switch`, {
      method: "POST",
      body: { tenantId }
    });
    if (result.data || !result.error) {
      return result;
    }
  }

  if (!supabase) {
    return { data: null, error: "Supabase is not configured." };
  }

  const { error } = await supabase
    .from("users")
    .update({ default_tenant_id: tenantId })
    .eq("id", profileId);

  return {
    data: error ? null : { tenantId },
    error: error?.message ?? null
  };
}
