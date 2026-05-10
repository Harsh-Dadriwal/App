import { createClient } from "@supabase/supabase-js";

type BrowserSupabaseClient = {
  auth: {
    getSession: () => Promise<{
      data: {
        session: {
          user: {
            id: string;
          };
          access_token?: string | null;
        } | null;
      };
    }>;
    onAuthStateChange: (
      callback: (
        event: string,
        session: {
          user: {
            id: string;
          };
        } | null
      ) => void
    ) => {
      data: {
        subscription: {
          unsubscribe: () => void;
        };
      };
    };
    signOut: (options?: unknown) => Promise<any>;
    signUp: (params: unknown) => Promise<any>;
    signInWithPassword: (params: unknown) => Promise<any>;
    signInWithOtp: (params: unknown) => Promise<any>;
    verifyOtp: (params: unknown) => Promise<any>;
  };
  from: (table: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<any>;
  channel: (name: string) => any;
  removeChannel: (channel: any) => Promise<any>;
};

if (typeof window === "undefined") {
  const safeStorage = {
    getItem: (_key: string) => null,
    setItem: (_key: string, _value: string) => undefined,
    removeItem: (_key: string) => undefined
  };

  const maybeStorage = (globalThis as { localStorage?: unknown }).localStorage as
    | { getItem?: unknown }
    | undefined;

  if (!maybeStorage || typeof maybeStorage.getItem !== "function") {
    Object.defineProperty(globalThis, "localStorage", {
      value: safeStorage,
      configurable: true
    });
  }
}

let browserClientPromise: Promise<BrowserSupabaseClient | null> | null = null;
let readBrowserClientPromise: Promise<BrowserSupabaseClient | null> | null = null;

function resolveEnvValue(keys: string[]) {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) {
      return value;
    }
  }

  return "";
}

export function isSupabaseConfigured() {
  return Boolean(
    resolveEnvValue(["NEXT_PUBLIC_SUPABASE_URL", "EXPO_PUBLIC_SUPABASE_URL"]) &&
      resolveEnvValue(["NEXT_PUBLIC_SUPABASE_ANON_KEY", "EXPO_PUBLIC_SUPABASE_ANON_KEY"])
  );
}

export async function getSupabaseBrowserClient() {
  if (typeof window === "undefined") {
    return null;
  }

  const url = resolveEnvValue(["NEXT_PUBLIC_SUPABASE_URL", "EXPO_PUBLIC_SUPABASE_URL"]);
  const anonKey = resolveEnvValue([
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "EXPO_PUBLIC_SUPABASE_ANON_KEY"
  ]);

  if (!url || !anonKey) {
    return null;
  }

  if (!browserClientPromise) {
    browserClientPromise = Promise.resolve(
      createClient(url, anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      }) as unknown as BrowserSupabaseClient
    );
  }

  return browserClientPromise;
}

export async function getSupabaseReadBrowserClient() {
  if (typeof window === "undefined") {
    return null;
  }

  const url = resolveEnvValue([
    "NEXT_PUBLIC_SUPABASE_READ_URL",
    "EXPO_PUBLIC_SUPABASE_READ_URL",
    "NEXT_PUBLIC_SUPABASE_URL",
    "EXPO_PUBLIC_SUPABASE_URL"
  ]);
  const anonKey = resolveEnvValue([
    "NEXT_PUBLIC_SUPABASE_READ_ANON_KEY",
    "EXPO_PUBLIC_SUPABASE_READ_ANON_KEY",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "EXPO_PUBLIC_SUPABASE_ANON_KEY"
  ]);

  if (!url || !anonKey) {
    return null;
  }

  if (!readBrowserClientPromise) {
    readBrowserClientPromise = Promise.resolve(
      createClient(url, anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      }) as unknown as BrowserSupabaseClient
    );
  }

  return readBrowserClientPromise;
}

export function createNativeSupabaseClient(
  storage: {
    getItem: (key: string) => Promise<string | null> | string | null;
    setItem: (key: string, value: string) => Promise<void> | void;
    removeItem: (key: string) => Promise<void> | void;
  }
) {
  const url = resolveEnvValue(["EXPO_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"]);
  const anonKey = resolveEnvValue([
    "EXPO_PUBLIC_SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY"
  ]);

  if (!url || !anonKey) {
    return null;
  }

  return createClient(url, anonKey, {
    auth: {
      storage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false
    }
  });
}

export function createNativeReadSupabaseClient(
  storage: {
    getItem: (key: string) => Promise<string | null> | string | null;
    setItem: (key: string, value: string) => Promise<void> | void;
    removeItem: (key: string) => Promise<void> | void;
  }
) {
  const url = resolveEnvValue([
    "EXPO_PUBLIC_SUPABASE_READ_URL",
    "EXPO_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_READ_URL",
    "NEXT_PUBLIC_SUPABASE_URL"
  ]);
  const anonKey = resolveEnvValue([
    "EXPO_PUBLIC_SUPABASE_READ_ANON_KEY",
    "EXPO_PUBLIC_SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_SUPABASE_READ_ANON_KEY",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY"
  ]);

  if (!url || !anonKey) {
    return null;
  }

  return createClient(url, anonKey, {
    auth: {
      storage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false
    }
  });
}
