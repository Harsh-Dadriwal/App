type BackendResult<T> = {
  data: T | null;
  error: string | null;
};

export type BackendRequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: Record<string, unknown> | FormData | null;
  headers?: Record<string, string>;
  requireAuth?: boolean;
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
      return { data: null, error: "Backend API is not configured." };
    }

    try {
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
      const response = await fetch(`${getBaseUrl()}${path}`, {
        method: options.method ?? "GET",
        headers: {
          ...authHeaders,
          ...(isFormData ? {} : { "Content-Type": "application/json" }),
          ...(options.headers ?? {})
        },
        body: requestBody
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
  };
}
