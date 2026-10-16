const UNAVAILABLE_MESSAGE = "This service is temporarily unavailable. Please try again shortly.";
const SERVER_ERROR_MESSAGE = "Something went wrong on our side. Please try again.";

/** Keeps raw server/framework text (routes, status codes, stack-like messages) away from end users. */
function toFriendlyError(message: string | null, status: number): string {
  if (status === 401) return "Your session has expired. Please log in again.";
  if (status === 403) return "You do not have permission to do this.";
  if (status === 404 || (message && /^Cannot (GET|POST|PUT|PATCH|DELETE) /i.test(message))) {
    return "This feature is not available right now. Please try again later.";
  }
  if (status === 429) return "Too many requests. Please wait a moment and try again.";
  if (status === 504) return "The server took too long to respond. Please try again.";
  // The API words its 502/503 messages for users (e.g. why a sync failed); platform
  // errors with these codes carry no `message`, so they still fall back below.
  if ((status === 502 || status === 503) && message && !/exception|error:|\bat\s+\S+\s*\(/i.test(message)) {
    return message.trim();
  }
  if (status >= 500) return SERVER_ERROR_MESSAGE;
  return message?.trim() || SERVER_ERROR_MESSAGE;
}

type BackendResult<T> = {
  data: T | null;
  error: string | null;
};

export type BackendRequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: Record<string, unknown> | FormData | null;
  headers?: Record<string, string>;
  requireAuth?: boolean;
  timeoutMs?: number;
};

type BackendHttpConfig = {
  getBaseUrl: () => string;
  isConfigured: () => boolean;
  getAuthHeaders: () => Promise<Record<string, string>>;
};

export function createBackendRequester({ getBaseUrl, isConfigured, getAuthHeaders }: BackendHttpConfig) {
  return async function backendRequest<T>(
    path: string,
    options: BackendRequestOptions = {}
  ): Promise<BackendResult<T>> {
    if (!isConfigured()) {
      return { data: null, error: "This service is temporarily unavailable. Please try again shortly." };
    }

    try {
      const baseUrl = getBaseUrl();
      // Browsers block http API calls from an https page. React Native has a `window`
      // but no `window.location`, so read it optionally.
      if (
        typeof window !== "undefined" &&
        window.location?.protocol === "https:" &&
        baseUrl.startsWith("http://")
      ) {
        return {
          data: null,
          error:
            UNAVAILABLE_MESSAGE
        };
      }

      const authHeaders = options.requireAuth === false ? {} : await getAuthHeaders();
      const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
      let requestBody: BodyInit | undefined;

      if (options.body == null) {
        requestBody = undefined;
      } else if (isFormData) {
        requestBody = options.body as FormData;
      } else {
        requestBody = JSON.stringify(options.body);
      }
      const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
      const timeoutId = controller ? setTimeout(() => controller.abort(), options.timeoutMs ?? 2500) : null;

      let response: Response;
      try {
        response = await fetch(`${baseUrl}${path}`, {
          method: options.method ?? "GET",
          headers: {
            ...authHeaders,
            ...(isFormData ? {} : { "Content-Type": "application/json" }),
            ...(options.headers ?? {})
          },
          body: requestBody,
          ...(controller ? { signal: controller.signal } : {})
        });
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        const rawMessage =
          payload && typeof payload === "object" && "message" in payload
            ? Array.isArray((payload as { message: unknown }).message)
              ? ((payload as { message: unknown[] }).message as unknown[]).filter((m) => typeof m === "string").join(" ")
              : typeof (payload as { message: unknown }).message === "string"
                ? ((payload as { message: string }).message)
                : null
            : null;
        if (response.status >= 400 && typeof console !== "undefined") {
          console.warn(`Request to ${path} failed with status ${response.status}: ${rawMessage ?? "no message"}`);
        }
        return { data: null, error: toFriendlyError(rawMessage, response.status) };
      }

      return {
        data: (payload && typeof payload === "object" && "data" in payload
          ? (payload as { data: T }).data
          : (payload as T)) ?? null,
        error: null
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Backend request failed.";
      if (typeof console !== "undefined") console.warn(`Request to ${path} failed: ${message}`);

      if (message === "Load failed" || message === "Failed to fetch" || /network request failed/i.test(message)) {
        return { data: null, error: "We could not connect right now. Please check your internet connection and try again." };
      }
      if (/abort/i.test(message)) {
        return { data: null, error: "This is taking longer than expected. Please try again." };
      }

      return { data: null, error: SERVER_ERROR_MESSAGE };
    }
  };
}
