import { useEffect, useState } from "react";
import { supabase, supabaseRead } from "@/lib/supabase";
import { useSharedMutationAction } from "@shared-types/use-mutation-action";

export function useRows<T>(
  fetcher: (client: NonNullable<typeof supabase>) => Promise<{ data: T[]; error: string | null }>,
  deps: any[],
  options?: { realtimeTable?: string; clientType?: "primary" | "read" }
) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    let channel: any = null;
    let currentClient: typeof supabase | null = null;
    
    void (async () => {
      const resolvedClientType =
        options?.clientType ?? (options?.realtimeTable ? "primary" : "read");
      const client = resolvedClientType === "read" ? supabaseRead : supabase;
      currentClient = client;

      if (!client) {
        setError(`${resolvedClientType === "read" ? "Supabase read client" : "Supabase"} is not configured.`);
        setData([]);
        setLoading(false);
        return;
      }

      if (options?.realtimeTable) {
        channel = client
          .channel(`public:${options.realtimeTable}:${Math.random().toString(36).slice(2)}`)
          .on("postgres_changes", { event: "*", schema: "public", table: options.realtimeTable }, () => {
            if (active) {
              setReloadKey((k) => k + 1);
            }
          })
          .subscribe();
      }

      setLoading(true);
      const result = await fetcher(client);
      if (!active) return;
      setData(result.data);
      setError(result.error);
      setLoading(false);
    })();
    
    return () => {
      active = false;
      if (channel && currentClient) {
        // Run asynchronously to avoid locking the Native JS thread during fast refresh or immediate unmounts
        setTimeout(() => {
          currentClient?.removeChannel(channel).catch(() => {});
        }, 100);
      }
    };
  }, [...deps, reloadKey]);

  return { data, loading, error, refetch: () => setReloadKey((value) => value + 1) };
}

export function useMutationAction() {
  const mutation = useSharedMutationAction();
  return {
    loading: mutation.loading,
    error: mutation.error,
    success: mutation.success,
    run: mutation.run,
    reset: mutation.reset
  };
}
