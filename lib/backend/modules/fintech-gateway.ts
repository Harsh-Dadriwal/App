import { createFintechGateway } from "@mahalaxmi/core/gateway/fintech-gateway";
import { isBackendApiConfigured } from "@/lib/backend/config";
import { getSupabaseBrowserClient } from "@mahalaxmi/core/supabase/client";
import { backendRequest, type BackendResult } from "@/lib/backend/http";

async function runRpcFallback(
  fn: string,
  args: Record<string, unknown>
): Promise<BackendResult<Record<string, unknown>>> {
  const supabase = await getSupabaseBrowserClient();

  if (!supabase) {
    return { data: null, error: "Supabase is not configured." };
  }

  const result = await (supabase as any).rpc(fn, args);
  return {
    data: result?.data ?? null,
    error: result?.error?.message ?? null
  };
}

const fintechGateway = createFintechGateway({
  isBackendApiConfigured,
  backendRequest,
  runRpcFallback
});

export const postWalletEntry = fintechGateway.postWalletEntry;
export const paySavingsInstallment = fintechGateway.paySavingsInstallment;
export const ensureWalletAccount = fintechGateway.ensureWalletAccount;
export const resolveReferralReward = fintechGateway.resolveReferralReward;
