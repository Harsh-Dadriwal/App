import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export function useRows<T>(
  fetcher: (client: NonNullable<typeof supabase>) => Promise<{ data: T[]; error: string | null }>,
  deps: any[],
  options?: { realtimeTable?: string }
) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    let channel: any = null;
    
    void (async () => {
      if (!supabase) {
        setError("Supabase is not configured.");
        setData([]);
        setLoading(false);
        return;
      }

      if (options?.realtimeTable) {
        channel = supabase
          .channel(`public:${options.realtimeTable}:${Math.random().toString(36).slice(2)}`)
          .on("postgres_changes", { event: "*", schema: "public", table: options.realtimeTable }, () => {
            if (active) {
              setReloadKey((k) => k + 1);
            }
          })
          .subscribe();
      }

      setLoading(true);
      const result = await fetcher(supabase);
      if (!active) return;
      setData(result.data);
      setError(result.error);
      setLoading(false);
    })();
    
    return () => {
      active = false;
      if (channel && supabase) {
        // Run asynchronously to avoid locking the Native JS thread during fast refresh or immediate unmounts
        setTimeout(() => {
          supabase?.removeChannel(channel).catch(() => {});
        }, 100);
      }
    };
  }, [...deps, reloadKey]);

  return { data, loading, error, refetch: () => setReloadKey((value) => value + 1) };
}

export function useMutationAction() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function run(
    action: () => Promise<{ error?: { message?: string | null } | null } | void>,
    successMessage?: string
  ) {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await action();
      const maybeError = result && "error" in result ? result.error : null;
      if (maybeError?.message) {
        setError(maybeError.message);
        return false;
      }
      if (successMessage) {
        setSuccess(successMessage);
      }
      return true;
    } catch (error) {
      setError(error instanceof Error ? error.message : "Action failed.");
      return false;
    } finally {
      setLoading(false);
    }
  }

  return { loading, error, success, run, reset: () => { setError(null); setSuccess(null); } };
}
