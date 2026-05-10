import { createAuthGateway } from "@mahalaxmi/core/gateway/auth-gateway";
import { supabase } from "@/lib/supabase";
import { backendRequest, type BackendResult } from "./http";
import { isBackendApiConfigured } from "./config";
const authGateway = createAuthGateway({
  isBackendApiConfigured,
  backendRequest,
  getSupabaseClient: async () => supabase
});

export const fetchAppProfile: (authUserId: string) => Promise<BackendResult<any>> =
  authGateway.fetchAppProfile;
export const fetchTenantMemberships = authGateway.fetchTenantMemberships;
export const resolveActiveTenant = authGateway.resolveActiveTenant;
export const switchDefaultTenant = authGateway.switchDefaultTenant;
