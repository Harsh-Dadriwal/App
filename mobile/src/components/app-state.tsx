import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export function useRows<T>(
  fetcher: (client: NonNullable<typeof supabase>) => Promise<{ data: T[]; error: string | null }>,
  deps: any[]
) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    void (async () => {
      if (!supabase) {
        setError("Supabase is not configured.");
        setData([]);
        setLoading(false);
        return;
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
