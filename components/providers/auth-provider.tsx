"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import { fetchProfileWithRetry } from "@mahalaxmi/core/auth";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@mahalaxmi/core/supabase/client";
import type { ActiveTenant, TenantMembership, UserProfile } from "@mahalaxmi/core/types/domain";
import { clearQueryCache, configureQueryCacheStorage, setQueryCacheScope } from "@mahalaxmi/core/hooks/query-cache";
import { configureShopStorage } from "@mahalaxmi/core/hooks/shop-store";
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

// Page data cached for this browser tab survives a reload (see query-cache.ts).
if (typeof window !== "undefined") {
  try {
    configureQueryCacheStorage(window.sessionStorage);
    // The catalogue and cart outlive the tab so the shop opens instantly next time.
    configureShopStorage(window.localStorage);
  } catch {
    // Storage blocked: the in-memory cache still works.
  }
}

/**
 * The signed-in user's profile and workspaces, kept on this device so a reload opens the
 * workspace at once while fresh copies load in the background. Cleared on sign-out.
 */
const SNAPSHOT_KEY = "me:auth-snapshot:v1";
type AuthSnapshot = {
  authUserId: string;
  profile: UserProfile;
  tenantMemberships: TenantMembership[];
  activeTenant: ActiveTenant | null;
};

function readSnapshot(authUserId: string): AuthSnapshot | null {
  try {
    const raw = window.localStorage.getItem(SNAPSHOT_KEY);
    const snapshot = raw ? (JSON.parse(raw) as AuthSnapshot) : null;
    return snapshot?.authUserId === authUserId && snapshot.profile ? snapshot : null;
  } catch {
    return null;
  }
}

function writeSnapshot(snapshot: AuthSnapshot | null) {
  try {
    if (snapshot) window.localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
    else window.localStorage.removeItem(SNAPSHOT_KEY);
  } catch {
    // Storage blocked: the app just loads from the network as before.
  }
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

    const { data, error } = await fetchProfileWithRetry(() => fetchAppProfile(userId));

    if (error) {
      setErrorMessage(
        "Signed in, but your profile could not be loaded. Please try again or contact support."
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
      const sessionUserId = data.session?.user?.id;

      const snapshot = sessionUserId ? readSnapshot(sessionUserId) : null;
      if (snapshot) {
        // Open the workspace straight away; the fetches below refresh it.
        setProfile(snapshot.profile);
        setTenantMemberships(snapshot.tenantMemberships);
        setActiveTenant(snapshot.activeTenant);
        setIsLoading(false);
      }

      if (sessionUserId) {
        const profileResult = await fetchProfileWithRetry(() => fetchAppProfile(sessionUserId));

        if (profileResult.error && snapshot) {
          // Keep the remembered profile when only the background refresh failed.
        } else if (profileResult.error) {
          setErrorMessage(
            "Signed in, but your profile could not be loaded. Please try again or contact support."
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

      const listener = supabase.auth.onAuthStateChange(async (event, nextSession) => {
        setSession(nextSession);

        // INITIAL_SESSION repeats the session loaded above, and a token refresh does not
        // change who is signed in; refetching the profile for either only adds a delay.
        if ((event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED") && nextSession?.user?.id === sessionUserId) {
          return;
        }

        if (nextSession?.user?.id) {
          const profileResult = await fetchProfileWithRetry(() => fetchAppProfile(nextSession.user.id));
          const nextProfile = (profileResult.data ?? null) as UserProfile | null;
          setProfile(nextProfile);
          await fetchTenantContext(nextProfile);
          setErrorMessage(
            profileResult.error
              ? "Signed in, but your profile could not be loaded. Please try again or contact support."
              : ""
          );
        } else {
          setProfile(null);
          setTenantMemberships([]);
          setActiveTenant(null);
          setErrorMessage("");
          writeSnapshot(null);
          clearQueryCache();
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

    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.error("Supabase signOut error:", e);
    } finally {
      setSession(null);
      setProfile(null);
      setTenantMemberships([]);
      setActiveTenant(null);
      setErrorMessage("");
      writeSnapshot(null);
      clearQueryCache();
    }
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

  useEffect(() => {
    const authUserId = session?.user?.id;
    if (authUserId && profile) {
      writeSnapshot({ authUserId, profile, tenantMemberships, activeTenant });
    }
  }, [session?.user?.id, profile, tenantMemberships, activeTenant]);

  // Set during render (idempotent) so pages read the right cache on their first render.
  setQueryCacheScope(profile?.id ? `${profile.id}:${activeTenant?.id ?? "none"}` : "anon");

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
