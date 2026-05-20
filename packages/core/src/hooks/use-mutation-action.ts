import { useState } from "react";

export type MutationResultLike =
  | void
  | {
      error?: { message?: string | null } | string | null;
    };

type MutationErrorLike = { message?: string | null } | string | null | undefined;

function normalizeMutationError(error: MutationErrorLike) {
  return typeof error === "string" ? error : error?.message ?? null;
}

export function broadcastMutation() {
  if (typeof window !== "undefined") {
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent("supabase-mutation"));
    }, 0);
  }
}

export function useSharedMutationAction() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function run(
    action: () => Promise<MutationResultLike>,
    successMessage?: string
  ) {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await action();
      const maybeError = result && "error" in result ? result.error : null;
      const normalizedError = normalizeMutationError(maybeError);

      if (normalizedError) {
        setError(normalizedError);
        return false;
      }

      if (successMessage) {
        setSuccess(successMessage);
      }

      // Instantly trigger global refresh of all active UI data views
      broadcastMutation();

      return true;
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Action failed.");
      return false;
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setError(null);
    setSuccess(null);
  }

  return { loading, error, success, run, reset };
}

