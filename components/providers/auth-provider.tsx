"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";
import type { AuthSession, UserProfile } from "@/lib/app-types";

type AuthContextValue = {
  configured: boolean;
  isLoading: boolean;
  session: AuthSession;
  profile: UserProfile | null;
  errorMessage: string;
  refreshProfile: (userId?: string) => Promise<UserProfile | null>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchProfile(userId: string) {
  const supabase = await getSupabaseBrowserClient();
  const profileSelect =
    "id, auth_user_id, full_name, email, phone, role, city, state, company_name, verification_status, is_admin_verified";

  if (!supabase) {
    return { data: null, error: null };
  }

  const authLinkedResult = await supabase
    .from("users")
    .select(profileSelect)
    .eq("auth_user_id", userId)
    .maybeSingle();

  if (authLinkedResult.data && !authLinkedResult.error) {
    return authLinkedResult;
  }

  const rpcResult = await (supabase as any).rpc("get_my_profile");
  const rpcData = Array.isArray(rpcResult?.data) ? rpcResult.data[0] ?? null : rpcResult?.data ?? null;

  if (rpcData && !rpcResult?.error) {
    return { data: rpcData, error: null };
  }

  const directIdResult = await supabase
    .from("users")
    .select(profileSelect)
    .eq("id", userId)
    .maybeSingle();

  if (directIdResult.data && !directIdResult.error) {
    return directIdResult;
  }

  if (authLinkedResult.error || rpcResult?.error || directIdResult.error) {
    return authLinkedResult.error
      ? authLinkedResult
      : rpcResult?.error
        ? { data: null, error: rpcResult.error }
        : directIdResult;
  }

  return {
    data: null,
    error: {
      message:
        "No app profile row is visible for this account. Run the auth profile SQL patch and try again."
    }
  };
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

function AuthProvider({ children }: { children: ReactNode }) {
  const configured = isSupabaseConfigured();
  const [isLoading, setIsLoading] = useState(true);
  const [session, setSession] = useState<AuthSession>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

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
    return nextProfile;
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
          setProfile((profileResult.data ?? null) as UserProfile | null);
          setErrorMessage("");
        }
      }

      setIsLoading(false);

      const listener = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
        setSession(nextSession);

        if (nextSession?.user?.id) {
          const profileResult = await fetchProfileWithRetry(nextSession.user.id);
          setProfile((profileResult.data ?? null) as UserProfile | null);
          setErrorMessage(
            profileResult.error
              ? "Signed in, but the app profile could not be loaded. Run the SQL migrations in Supabase and try again."
              : ""
          );
        } else {
          setProfile(null);
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
    setErrorMessage("");
  }

  const value = useMemo(
    () => ({
      configured,
      isLoading,
      session,
      profile,
      errorMessage,
      refreshProfile,
      signOut
    }),
    [configured, isLoading, session, profile, errorMessage]
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
