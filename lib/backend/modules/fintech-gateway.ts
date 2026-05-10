import { backendRequest, type BackendResult } from "@/lib/backend/http";
import { isBackendApiConfigured } from "@/lib/backend/config";
import { getSupabaseBrowserClient } from "@/lib/supabase";

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

export async function postWalletEntry(args: Record<string, unknown>) {
  if (isBackendApiConfigured()) {
    const result = await backendRequest(`/api/v1/wallet/entries`, {
      method: "POST",
      body: args
    });

    if (result.data || !result.error) {
      return result;
    }
  }

  return runRpcFallback("post_wallet_entry", args);
}

export async function paySavingsInstallment(args: Record<string, unknown>) {
  if (isBackendApiConfigured()) {
    const result = await backendRequest(`/api/v1/savings/installments/pay`, {
      method: "POST",
      body: args
    });

    if (result.data || !result.error) {
      return result;
    }
  }

  return runRpcFallback("pay_savings_installment", args);
}

export async function ensureWalletAccount(args: Record<string, unknown>) {
  if (isBackendApiConfigured()) {
    const result = await backendRequest(`/api/v1/wallet/accounts/ensure`, {
      method: "POST",
      body: args
    });

    if (result.data || !result.error) {
      return result;
    }
  }

  return runRpcFallback("ensure_wallet_account", args);
}

export async function resolveReferralReward(args: Record<string, unknown>) {
  if (isBackendApiConfigured()) {
    const result = await backendRequest(`/api/v1/referrals/rewards/resolve`, {
      method: "POST",
      body: args
    });

    if (result.data || !result.error) {
      return result;
    }
  }

  return runRpcFallback("resolve_referral_reward", args);
}
