import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import {
  fetchProfileWithRetry,
  isRecoverableAuthSessionError
} from "@mahalaxmi/core/auth";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { clearQueryCache, setQueryCacheScope } from "@mahalaxmi/core/hooks/query-cache";
import { configureShopStorage } from "@mahalaxmi/core/hooks/shop-store";
import { unregisterPushNotifications } from "@/lib/notifications";

// The catalogue and cart are kept on the phone so the shop opens instantly.
configureShopStorage(AsyncStorage);
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

/**
 * The signed-in user's profile and workspaces, kept on the phone so the app opens straight
 * into the workspace while fresh copies load in the background. Cleared on sign-out.
 */
const SNAPSHOT_KEY = "me:auth-snapshot:v1";
type AuthSnapshot = {
  authUserId: string;
  profile: UserProfile;
  tenantMemberships: TenantMembership[];
  activeTenant: ActiveTenant | null;
};

async function readSnapshot(authUserId: string): Promise<AuthSnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(SNAPSHOT_KEY);
    const snapshot = raw ? (JSON.parse(raw) as AuthSnapshot) : null;
    return snapshot?.authUserId === authUserId && snapshot.profile ? snapshot : null;
  } catch {
    return null;
  }
}

function writeSnapshot(snapshot: AuthSnapshot | null) {
  const write = snapshot ? AsyncStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot)) : AsyncStorage.removeItem(SNAPSHOT_KEY);
  void write.catch(() => undefined);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [tenantMemberships, setTenantMemberships] = useState<TenantMembership[]>([]);
  const [activeTenant, setActiveTenant] = useState<ActiveTenant | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  async function clearBrokenSession() {
    writeSnapshot(null);
    clearQueryCache();
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

  async function refreshProfile(userId?: string, options?: { keepOnError?: boolean }) {
    if (!userId) {
      setProfile(null);
      return null;
    }

    const result = await fetchProfileWithRetry(() => fetchAppProfile(userId));
    // Keep the remembered profile when only the background refresh failed.
    if (result.error && options?.keepOnError) {
      return null;
    }
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
          const snapshot = await readSnapshot(nextSession.user.id);
          if (snapshot && mounted) {
            // Open the workspace straight away; refreshProfile below brings it up to date.
            setProfile(snapshot.profile);
            setTenantMemberships(snapshot.tenantMemberships);
            setActiveTenant(snapshot.activeTenant);
            setLoading(false);
          }
          await refreshProfile(nextSession.user.id, { keepOnError: Boolean(snapshot) });
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

    const { data } = supabase.auth.onAuthStateChange(async (event, nextSession) => {
      try {
        setSession(nextSession);
        // INITIAL_SESSION repeats the session restored above and a token refresh keeps the
        // same user, so neither needs the profile downloaded again.
        if (event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED") {
          return;
        }
        if (nextSession?.user?.id) {
          await refreshProfile(nextSession.user.id);
        } else {
          setProfile(null);
          setTenantMemberships([]);
          setActiveTenant(null);
          setErrorMessage("");
          writeSnapshot(null);
          clearQueryCache();
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
    // Stop pushes to this phone while the session can still prove who it is.
    await unregisterPushNotifications();
    if (!supabase) return;
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.error("Mobile Supabase signOut error:", e);
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

  useEffect(() => {
    const authUserId = session?.user?.id;
    if (authUserId && profile) {
      writeSnapshot({ authUserId, profile, tenantMemberships, activeTenant });
    }
  }, [session?.user?.id, profile, tenantMemberships, activeTenant]);

  // Set during render (idempotent) so screens read the right cache on their first render.
  setQueryCacheScope(profile?.id ? `${profile.id}:${activeTenant?.id ?? "none"}` : "anon");

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
