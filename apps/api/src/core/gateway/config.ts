function normalizeBaseUrl(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized.replace(/\/+$/, "") : "";
}

export function getBackendApiBaseUrlFromEnv(
  env: Record<string, string | undefined>,
  keys: string[]
) {
  for (const key of keys) {
    const value = normalizeBaseUrl(env[key]);
    if (value) {
      return value;
    }
  }

  return "";
}

export function isBackendApiConfiguredForEnv(
  env: Record<string, string | undefined>,
  keys: string[]
) {
  return Boolean(getBackendApiBaseUrlFromEnv(env, keys));
}
