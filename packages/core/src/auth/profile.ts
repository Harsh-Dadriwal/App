import type { BackendResult } from "../types/contracts";

export function isRecoverableAuthSessionError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("invalid refresh token") ||
    message.includes("refresh token not found") ||
    message.includes("invalid_grant")
  );
}

export async function fetchProfileWithRetry<T>(
  loadProfile: () => Promise<BackendResult<T>>,
  attempts = 8,
  delayMs = 250
) {
  let lastError: string | null = null;
  const maxAttempts = Math.max(1, attempts);

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const result = await loadProfile();

    if (result.data && !result.error) {
      return result;
    }

    lastError = result.error;
    if (attempt < maxAttempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return { data: null, error: lastError } satisfies BackendResult<T>;
}
