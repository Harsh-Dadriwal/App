import type { BackendRequestOptions } from "./http";
import type { BackendResult } from "../types/contracts";
import { resolveActiveTenant, type TenantMembership, type UserProfile } from "../types/domain";

type AuthGatewayDependencies = {
  isBackendApiConfigured: () => boolean;
  backendRequest: <T>(
    path: string,
    options?: BackendRequestOptions
  ) => Promise<BackendResult<T>>;
  getSupabaseClient: () => Promise<any | null> | any | null;
};

const profileSelect =
  "id, auth_user_id, default_tenant_id, username, full_name, email, phone, role, city, state, company_name, verification_status, is_admin_verified";

export type PhoneSignupProfile = { full_name: string; username: string; email?: string; role?: string };
type PhoneSession = { access_token: string; refresh_token: string };
export type PhoneSignedIn = { status: "signed_in"; isNewUser: boolean; session: PhoneSession };
export type PhoneVerifyResult = PhoneSignedIn | { status: "needs_profile"; phone: string; signupToken: string };

export function createAuthGateway({
  isBackendApiConfigured,
  backendRequest,
  getSupabaseClient
}: AuthGatewayDependencies) {
  const pendingProfileRequests = new Map<string, Promise<BackendResult<UserProfile>>>();

  async function fetchAppProfile(authUserId: string): Promise<BackendResult<UserProfile>> {
    const existing = pendingProfileRequests.get(authUserId);
    if (existing) {
      return existing;
    }

    const promise = (async () => {
      try {
        if (isBackendApiConfigured()) {
          const result = await backendRequest<UserProfile>(
            `/api/v1/me/profile?authUserId=${encodeURIComponent(authUserId)}`
          );

          if (result.data) {
            return result;
          }
        }

        const supabase = await getSupabaseClient();

        if (!supabase) {
          return { data: null, error: "Supabase is not configured." };
        }

        const authLinkedResult = await supabase
          .from("users")
          .select(profileSelect)
          .eq("auth_user_id", authUserId)
          .maybeSingle();

        if (authLinkedResult.data && !authLinkedResult.error) {
          return { data: authLinkedResult.data as UserProfile, error: null };
        }

        const directIdResult = await supabase
          .from("users")
          .select(profileSelect)
          .eq("id", authUserId)
          .maybeSingle();

        if (directIdResult.data && !directIdResult.error) {
          return { data: directIdResult.data as UserProfile, error: null };
        }

        const rpcResult = await (supabase as any).rpc("get_my_profile");
        const rpcData = Array.isArray(rpcResult?.data)
          ? rpcResult.data[0] ?? null
          : rpcResult?.data ?? null;

        if (rpcData && !rpcResult?.error) {
          return { data: rpcData as UserProfile, error: null };
        }

        return {
          data: null,
          error:
            authLinkedResult.error?.message ??
            directIdResult.error?.message ??
            rpcResult?.error?.message ??
            "No app profile row is visible for this account."
        };
      } finally {
        pendingProfileRequests.delete(authUserId);
      }
    })();

    pendingProfileRequests.set(authUserId, promise);
    return promise;
  }

  async function fetchTenantMemberships(
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

    const supabase = await getSupabaseClient();

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

    const memberships = ((membershipResult.data ?? []) as Array<Record<string, any>>).map(
      (membership) => ({
        ...membership,
        tenant: Array.isArray(membership.tenant)
          ? membership.tenant[0] ?? null
          : membership.tenant ?? null
      })
    ) as TenantMembership[];
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

  async function switchDefaultTenant(
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

    const supabase = await getSupabaseClient();

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

  /** Texts a 6-digit sign-in code to the number (sent by the API through TextBee). */
  async function sendPhoneOtp(phone: string) {
    return backendRequest<{ phone: string; expiresInSeconds: number; resendInSeconds: number }>("/api/v1/auth/otp/send", {
      method: "POST",
      body: { phone },
      requireAuth: false,
      timeoutMs: 20_000
    });
  }

  /**
   * Checks the code. An existing number is signed in (store the session with
   * supabase.auth.setSession); a new number gets { status: "needs_profile", signupToken }
   * and finishes with completePhoneSignup.
   */
  async function verifyPhoneOtp(phone: string, code: string) {
    return backendRequest<PhoneVerifyResult>("/api/v1/auth/otp/verify", {
      method: "POST",
      body: { phone, code },
      requireAuth: false,
      timeoutMs: 20_000
    });
  }

  /** Creates the account for a just-verified new number and signs it in. */
  async function completePhoneSignup(signupToken: string, profile: PhoneSignupProfile) {
    return backendRequest<PhoneSignedIn>("/api/v1/auth/otp/complete-signup", {
      method: "POST",
      body: { signupToken, profile },
      requireAuth: false,
      timeoutMs: 20_000
    });
  }

  /** Which of a username, email or phone number are still free (for sign-up forms). */
  async function checkSignupAvailability(values: { username?: string; email?: string; phone?: string }) {
    return backendRequest<Record<"username" | "email" | "phone", { available: boolean }>>("/api/v1/auth/otp/availability", {
      method: "POST",
      body: values,
      requireAuth: false,
      timeoutMs: 15_000
    });
  }

  return {
    fetchAppProfile,
    fetchTenantMemberships,
    resolveActiveTenant,
    switchDefaultTenant,
    sendPhoneOtp,
    verifyPhoneOtp,
    completePhoneSignup,
    checkSignupAvailability
  };
}
