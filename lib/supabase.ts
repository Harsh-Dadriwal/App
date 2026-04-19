type BrowserSupabaseClient = {
  auth: {
    getSession: () => Promise<{
      data: {
        session: {
          user: {
            id: string;
          };
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
    signOut: () => Promise<any>;
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

export async function getSupabaseBrowserClient() {
  if (typeof window === "undefined") {
    return null;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return null;
  }

  if (!browserClientPromise) {
    browserClientPromise = import("@supabase/supabase-js").then((mod) => {
      const createClient = (mod as any).createClient as (
        supabaseUrl: string,
        supabaseKey: string,
        options: unknown
      ) => BrowserSupabaseClient;

      return createClient(url, anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      });
    });
  }

  return browserClientPromise;
}

export function isSupabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
