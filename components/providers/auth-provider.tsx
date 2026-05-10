"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@mahalaxmi/core/supabase/client";
import type { ActiveTenant, TenantMembership, UserProfile } from "@mahalaxmi/core/types/domain";
import {
  fetchAppProfile,
  fetchTenantMemberships,
  resolveActiveTenant,
  switchDefaultTenant
} from "@/lib/backend/modules/auth-gateway";
type AuthSession = {
  user: {
    id: string;
  };
} | null;

type AuthContextValue = {
  configured: boolean;
  isLoading: boolean;
  session: AuthSession;
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

function AuthProvider({ children }: { children: ReactNode }) {
  const configured = isSupabaseConfigured();
  const [isLoading, setIsLoading] = useState(true);
  const [session, setSession] = useState<AuthSession>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [tenantMemberships, setTenantMemberships] = useState<TenantMembership[]>([]);
  const [activeTenant, setActiveTenant] = useState<ActiveTenant | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

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

  async function refreshProfile(userIdOverride?: string) {
    const userId = userIdOverride ?? session?.user?.id;

    if (!userId) {
      setProfile(null);
      return null;
    }

    const { data, error } = await fetchProfileWithRetry(userId);

    if (error) {
      setErrorMessage(
        "Signed in, but the app profile could not be loaded. Run the SQL migrations in Supabase and try again."
      );
      setProfile(null);
      return null;
    }

    const nextProfile = (data ?? null) as UserProfile | null;
    setProfile(nextProfile);
    setErrorMessage("");
    await fetchTenantContext(nextProfile);
    return nextProfile;
  }

  async function refreshTenantContext(profileOverride?: UserProfile | null) {
    await fetchTenantContext(profileOverride ?? profile);
  }

  useEffect(() => {
    if (!configured) {
      setIsLoading(false);
      return;
    }

    let mounted = true;
    let unsubscribe: () => void = () => {};

    void (async () => {
      const supabase = await getSupabaseBrowserClient();

      if (!supabase || !mounted) {
        setIsLoading(false);
        return;
      }

      const { data } = await supabase.auth.getSession();

      if (!mounted) {
        return;
      }

      setSession(data.session);

      if (data.session?.user?.id) {
        const profileResult = await fetchProfileWithRetry(data.session.user.id);

        if (profileResult.error) {
          setErrorMessage(
            "Signed in, but the app profile could not be loaded. Run the SQL migrations in Supabase and try again."
          );
          setProfile(null);
        } else {
          const nextProfile = (profileResult.data ?? null) as UserProfile | null;
          setProfile(nextProfile);
          await fetchTenantContext(nextProfile);
          setErrorMessage("");
        }
      }

      setIsLoading(false);

      const listener = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
        setSession(nextSession);

        if (nextSession?.user?.id) {
          const profileResult = await fetchProfileWithRetry(nextSession.user.id);
          const nextProfile = (profileResult.data ?? null) as UserProfile | null;
          setProfile(nextProfile);
          await fetchTenantContext(nextProfile);
          setErrorMessage(
            profileResult.error
              ? "Signed in, but the app profile could not be loaded. Run the SQL migrations in Supabase and try again."
              : ""
          );
        } else {
          setProfile(null);
          setTenantMemberships([]);
          setActiveTenant(null);
          setErrorMessage("");
        }

        setIsLoading(false);
      });

      unsubscribe = listener.data.subscription.unsubscribe;
    })();

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [configured]);

  async function signOut() {
    const supabase = await getSupabaseBrowserClient();

    if (!supabase) {
      return;
    }

    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    setTenantMemberships([]);
    setActiveTenant(null);
    setErrorMessage("");
  }

  async function switchTenant(tenantId: string) {
    const supabase = await getSupabaseBrowserClient();

    if (!supabase || !profile?.id) {
      return false;
    }

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
      configured,
      isLoading,
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
    [configured, isLoading, session, profile, tenantMemberships, activeTenant, errorMessage]
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

export { AuthProvider };
export default AuthProvider;
