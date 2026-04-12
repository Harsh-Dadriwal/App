import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import type { ActiveTenant, TenantMembership, UserProfile } from "@/lib/types";

type AuthContextValue = {
  configured: boolean;
  loading: boolean;
  session: any;
  profile: UserProfile | null;
  tenantMemberships: TenantMembership[];
  activeTenant: ActiveTenant | null;
  errorMessage: string;
  refreshProfile: (userId?: string) => Promise<UserProfile | null>;
  refreshTenantContext: (profileOverride?: UserProfile | null) => Promise<void>;
  switchTenant: (tenantId: string) => Promise<boolean>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchProfile(userId: string) {
  if (!supabase) {
    return { data: null, error: null };
  }

  const selectString =
    "id, auth_user_id, default_tenant_id, full_name, email, phone, role, city, state, company_name, verification_status, is_admin_verified";

  const authLinkedResult = await supabase
    .from("users")
    .select(selectString)
    .eq("auth_user_id", userId)
    .maybeSingle();

  if (authLinkedResult.data && !authLinkedResult.error) {
    return authLinkedResult;
  }

  const rpcResult = await supabase.rpc("get_my_profile");
  const rpcData = Array.isArray(rpcResult.data) ? rpcResult.data[0] ?? null : rpcResult.data ?? null;
  if (rpcData && !rpcResult.error) {
    return { data: rpcData, error: null };
  }

  const directIdResult = await supabase
    .from("users")
    .select(selectString)
    .eq("id", userId)
    .maybeSingle();

  if (directIdResult.data && !directIdResult.error) {
    return directIdResult;
  }

  return authLinkedResult.error
    ? authLinkedResult
    : rpcResult.error
      ? { data: null, error: rpcResult.error }
      : directIdResult;
}

async function fetchProfileWithRetry(userId: string, attempts = 8) {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const result = await fetchProfile(userId);
    if (result.data && !result.error) {
      return result;
    }
    lastError = result.error;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return { data: null, error: lastError };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [tenantMemberships, setTenantMemberships] = useState<TenantMembership[]>([]);
  const [activeTenant, setActiveTenant] = useState<ActiveTenant | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  async function fetchTenantContext(profileValue: UserProfile | null) {
    if (!supabase || !profileValue?.id) {
      setTenantMemberships([]);
      setActiveTenant(null);
      return;
    }

    const membershipResult = await supabase
      .from("tenant_memberships")
      .select(
        "id, tenant_id, role, is_default, is_active, tenant:tenants(id, slug, display_name, status)"
      )
      .eq("user_id", profileValue.id)
      .eq("is_active", true)
      .order("joined_at", { ascending: true });

    if (membershipResult.error) {
      setTenantMemberships([]);
      setActiveTenant(null);
      return;
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

    const enrichedMemberships = memberships.map((membership) => ({
      ...membership,
      branding: brandingMap.get(membership.tenant_id) ?? null
    }));

    setTenantMemberships(enrichedMemberships);

    const preferredTenantId =
      profileValue.default_tenant_id ||
      enrichedMemberships.find((membership) => membership.is_default)?.tenant_id ||
      enrichedMemberships[0]?.tenant_id ||
      null;

    const activeMembership =
      enrichedMemberships.find((membership) => membership.tenant_id === preferredTenantId) ??
      enrichedMemberships[0] ??
      null;

    if (!activeMembership?.tenant) {
      setActiveTenant(null);
      return;
    }

    setActiveTenant({
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
    });
  }

  async function refreshProfile(userId?: string) {
    if (!userId) {
      setProfile(null);
      return null;
    }

    const result = await fetchProfileWithRetry(userId);
    if (result.error) {
      setProfile(null);
      setErrorMessage("Signed in, but the mobile app profile could not be loaded.");
      return null;
    }

    const nextProfile = (result.data ?? null) as UserProfile | null;
    setProfile(nextProfile);
    setErrorMessage("");
    await fetchTenantContext(nextProfile);
    return nextProfile;
  }

  async function refreshTenantContext(profileOverride?: UserProfile | null) {
    await fetchTenantContext(profileOverride ?? profile);
  }

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setLoading(false);
      return;
    }

    let mounted = true;

    void (async () => {
      const {
        data: { session: nextSession }
      } = await supabase.auth.getSession();

      if (!mounted) return;

      setSession(nextSession);
      if (nextSession?.user?.id) {
        await refreshProfile(nextSession.user.id);
      }
      setLoading(false);
    })();

    const { data } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      setSession(nextSession);
      if (nextSession?.user?.id) {
        await refreshProfile(nextSession.user.id);
      } else {
        setProfile(null);
        setTenantMemberships([]);
        setActiveTenant(null);
        setErrorMessage("");
      }
      setLoading(false);
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    setTenantMemberships([]);
    setActiveTenant(null);
  }

  async function switchTenant(tenantId: string) {
    if (!supabase || !profile?.id) return false;

    const { error } = await supabase
      .from("users")
      .update({ default_tenant_id: tenantId })
      .eq("id", profile.id);

    if (error) {
      setErrorMessage(error.message);
      return false;
    }

    const nextProfile = { ...(profile as UserProfile), default_tenant_id: tenantId };
    setProfile(nextProfile);
    await fetchTenantContext(nextProfile);
    setErrorMessage("");
    return true;
  }

  const value = useMemo(
    () => ({
      configured: isSupabaseConfigured,
      loading,
      session,
      profile,
      tenantMemberships,
      activeTenant,
      errorMessage,
      refreshProfile,
      refreshTenantContext,
      switchTenant,
      signOut
    }),
    [loading, session, profile, tenantMemberships, activeTenant, errorMessage]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
