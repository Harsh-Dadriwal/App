import { createBackendRequester } from "@mahalaxmi/core/gateway/http";
import { getActiveAccessToken, getSupabaseBrowserClient } from "@mahalaxmi/core/supabase/client";
import { getBackendApiBaseUrl, isBackendApiConfigured } from "@/lib/backend/config";
import type { BackendResult } from "@mahalaxmi/core/types/contracts";
export type { BackendResult } from "@mahalaxmi/core/types/contracts";

async function buildAuthHeaders() {
  const headers: Record<string, string> = {};
  const supabase = await getSupabaseBrowserClient();

  if (!supabase) {
    throw new Error("Supabase auth client is not configured.");
  }

  let accessToken = getActiveAccessToken();

  if (!accessToken) {
    const sessionResult = await supabase.auth.getSession();
    accessToken = sessionResult.data.session && "access_token" in sessionResult.data.session
      ? (sessionResult.data.session as { access_token?: string | null }).access_token
      : null;
  }

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  if (!headers.Authorization) {
    throw new Error("Missing authenticated session for backend request.");
  }

  return headers;
}

export const backendRequest = createBackendRequester({
  getBaseUrl: getBackendApiBaseUrl,
  isConfigured: isBackendApiConfigured,
  getAuthHeaders: buildAuthHeaders
});
