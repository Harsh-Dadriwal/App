import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import type { ActiveTenant, TenantMembership, UserProfile } from "@mahalaxmi/core/types/domain";
import {
  fetchAppProfile,
  fetchTenantMemberships,
  resolveActiveTenant,
  switchDefaultTenant
} from "@/lib/backend/auth-gateway";

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

function isRecoverableAuthSessionError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("invalid refresh token") ||
    message.includes("refresh token not found") ||
    message.includes("invalid_grant")
  );
}

async function fetchProfileWithRetry(userId: string, attempts = 8) {
  let lastError: string | null = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const result = await fetchAppProfile(userId);
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

  async function clearBrokenSession() {
    if (!supabase) {
      return;
    }

    try {
      await supabase.auth.signOut({ scope: "local" } as any);
    } catch {
      // Ignore follow-up auth cleanup failures while recovering from stale tokens.
    }

    setSession(null);
    setProfile(null);
    setTenantMemberships([]);
    setActiveTenant(null);
    setErrorMessage("");
  }

  async function fetchTenantContext(profileValue: UserProfile | null) {
    if (!profileValue?.id) {
      setTenantMemberships([]);
      setActiveTenant(null);
      return;
    }

    const membershipResult = await fetchTenantMemberships(profileValue.id);

    if (membershipResult.error) {
      setTenantMemberships([]);
      setActiveTenant(null);
      return;
    }

    const enrichedMemberships = membershipResult.data ?? [];

    setTenantMemberships(enrichedMemberships);
    setActiveTenant(resolveActiveTenant(profileValue, enrichedMemberships));
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
      try {
        const {
          data: { session: nextSession }
        } = await supabase.auth.getSession();

        if (!mounted) return;

        setSession(nextSession);
        if (nextSession?.user?.id) {
          await refreshProfile(nextSession.user.id);
        }
      } catch (error) {
        if (isRecoverableAuthSessionError(error)) {
          await clearBrokenSession();
        } else {
          setErrorMessage(error instanceof Error ? error.message : "Unable to restore session.");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    })();

    const { data } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      try {
        setSession(nextSession);
        if (nextSession?.user?.id) {
          await refreshProfile(nextSession.user.id);
        } else {
          setProfile(null);
          setTenantMemberships([]);
          setActiveTenant(null);
          setErrorMessage("");
        }
      } catch (error) {
        if (isRecoverableAuthSessionError(error)) {
          await clearBrokenSession();
        } else {
          setErrorMessage(error instanceof Error ? error.message : "Unable to refresh auth session.");
        }
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

    const { error } = await switchDefaultTenant(profile.id, tenantId);

    if (error) {
      setErrorMessage(error);
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
      configured: Boolean(isSupabaseConfigured),
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
