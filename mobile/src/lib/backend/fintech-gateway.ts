import { createFintechGateway } from "@mahalaxmi/core/gateway/fintech-gateway";
import { backendRequest, type BackendResult } from "./http";
import { isBackendApiConfigured } from "./config";
import { supabase } from "@/lib/supabase";

async function runRpcFallback(
  fn: string,
  args: Record<string, unknown>
): Promise<BackendResult<Record<string, unknown>>> {
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

export const paySavingsInstallment = fintechGateway.paySavingsInstallment;
