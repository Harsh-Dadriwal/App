import { getSupabaseBrowserClient } from "@mahalaxmi/core/supabase/client";
import { getBackendApiBaseUrl } from "@/lib/backend/config";

export async function apiFetch(endpoint: string, options: RequestInit = {}) {
  const supabase = await getSupabaseBrowserClient();
  let session = null;

  if (supabase) {
    const { data } = await supabase.auth.getSession();
    session = data.session;
  }

  const headers = new Headers(options.headers);

  if (session?.access_token) {
    headers.set("Authorization", `Bearer ${session.access_token}`);
  }

  if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  // Disable aggressive caching to ensure data is always fresh and fetched instantly
  headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
  headers.set("Pragma", "no-cache");
  headers.set("Expires", "0");

  const url = `${getBackendApiBaseUrl()}${endpoint}`;

  return fetch(url, {
    cache: "no-store",
    ...options,
    headers,
  });
}
