import {
  getBackendApiBaseUrlFromEnv,
  isBackendApiConfiguredForEnv
} from "@mahalaxmi/core/gateway/config";

export function getBackendApiBaseUrl() {
  return getBackendApiBaseUrlFromEnv(
    {
      NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL
    },
    ["NEXT_PUBLIC_API_BASE_URL"]
  );
}

export function isBackendApiConfigured() {
  return isBackendApiConfiguredForEnv(
    {
      NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL
    },
    ["NEXT_PUBLIC_API_BASE_URL"]
  );
}
