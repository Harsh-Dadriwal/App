import {
  getBackendApiBaseUrlFromEnv,
  isBackendApiConfiguredForEnv
} from "@mahalaxmi/core/gateway/config";

// Expo only bakes EXPO_PUBLIC_* values into a release build when they are read as
// `process.env.EXPO_PUBLIC_...` directly; passing `process.env` itself leaves them empty.
const env = {
  EXPO_PUBLIC_API_BASE_URL: process.env.EXPO_PUBLIC_API_BASE_URL
};

export function getBackendApiBaseUrl() {
  return getBackendApiBaseUrlFromEnv(env, ["EXPO_PUBLIC_API_BASE_URL"]);
}

export function isBackendApiConfigured() {
  return isBackendApiConfiguredForEnv(env, ["EXPO_PUBLIC_API_BASE_URL"]);
}
