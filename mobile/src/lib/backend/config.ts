import {
  getBackendApiBaseUrlFromEnv,
  isBackendApiConfiguredForEnv
} from "@mahalaxmi/core/gateway/config";

export function getBackendApiBaseUrl() {
  return getBackendApiBaseUrlFromEnv(process.env, ["EXPO_PUBLIC_API_BASE_URL"]);
}

export function isBackendApiConfigured() {
  return isBackendApiConfiguredForEnv(process.env, ["EXPO_PUBLIC_API_BASE_URL"]);
}
