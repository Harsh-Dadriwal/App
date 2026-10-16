import { createAuthGateway } from "@mahalaxmi/core/gateway/auth-gateway";
import { getSupabaseBrowserClient } from "@mahalaxmi/core/supabase/client";
import { backendRequest, type BackendResult } from "@/lib/backend/http";
import { isBackendApiConfigured } from "@/lib/backend/config";
const authGateway = createAuthGateway({
  isBackendApiConfigured,
  backendRequest,
  getSupabaseClient: getSupabaseBrowserClient
});

export const fetchAppProfile: (authUserId: string) => Promise<BackendResult<any>> =
  authGateway.fetchAppProfile;
export const fetchTenantMemberships = authGateway.fetchTenantMemberships;
export const resolveActiveTenant = authGateway.resolveActiveTenant;
export const switchDefaultTenant = authGateway.switchDefaultTenant;
export const sendPhoneOtp = authGateway.sendPhoneOtp;
export const verifyPhoneOtp = authGateway.verifyPhoneOtp;
export const completePhoneSignup = authGateway.completePhoneSignup;
export const checkSignupAvailability = authGateway.checkSignupAvailability;
