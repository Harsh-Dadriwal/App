import { supabase } from "@/lib/supabase";
import { backendRequest, type BackendResult } from "./http";
import { isBackendApiConfigured } from "./config";

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

export async function paySavingsInstallment(args: Record<string, unknown>) {
  if (isBackendApiConfigured()) {
    const result = await backendRequest(`/api/v1/savings/installments/pay`, {
      method: "POST",
      body: args
    });
    if (result.data || !result.error) return result;
  }
  return runRpcFallback("pay_savings_installment", args);
}
