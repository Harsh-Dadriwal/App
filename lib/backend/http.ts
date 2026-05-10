import { getSupabaseBrowserClient } from "@/lib/supabase";
import { getBackendApiBaseUrl, isBackendApiConfigured } from "@/lib/backend/config";
import type { BackendResult } from "@shared-types/backend-contracts";
export type { BackendResult } from "@shared-types/backend-contracts";

type BackendRequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: Record<string, unknown> | null;
  headers?: Record<string, string>;
  requireAuth?: boolean;
};

async function buildAuthHeaders() {
  const headers: Record<string, string> = {};
  const supabase = await getSupabaseBrowserClient();

  if (!supabase) {
    throw new Error("Supabase auth client is not configured.");
  }

  const sessionResult = await supabase.auth.getSession();
  const accessToken = sessionResult.data.session && "access_token" in sessionResult.data.session
    ? (sessionResult.data.session as { access_token?: string | null }).access_token
    : null;

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  if (!headers.Authorization) {
    throw new Error("Missing authenticated session for backend request.");
  }

  return headers;
}

export async function backendRequest<T>(
  path: string,
  options: BackendRequestOptions = {}
): Promise<BackendResult<T>> {
  if (!isBackendApiConfigured()) {
    return { data: null, error: "Backend API is not configured." };
  }

  try {
    const authHeaders = options.requireAuth === false ? {} : await buildAuthHeaders();
    const response = await fetch(`${getBackendApiBaseUrl()}${path}`, {
      method: options.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
        ...(options.headers ?? {})
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      return {
        data: null,
        error:
          (payload &&
          typeof payload === "object" &&
          "message" in payload &&
          typeof payload.message === "string"
            ? payload.message
            : null) ?? `Backend request failed with status ${response.status}.`
      };
    }

    return {
      data: (payload && typeof payload === "object" && "data" in payload
        ? (payload as { data: T }).data
        : (payload as T)) ?? null,
      error: null
    };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : "Backend request failed."
    };
  }
}
