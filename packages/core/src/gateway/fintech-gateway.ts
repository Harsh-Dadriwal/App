import type { BackendRequestOptions } from "./http";
import type { BackendResult } from "../types/contracts";

type FintechGatewayDependencies = {
  isBackendApiConfigured: () => boolean;
  backendRequest: <T>(
    path: string,
    options?: BackendRequestOptions
  ) => Promise<BackendResult<T>>;
  runRpcFallback?: (
    fn: string,
    args: Record<string, unknown>
  ) => Promise<BackendResult<Record<string, unknown>>>;
};

function callRpcFallback(
  runRpcFallback: FintechGatewayDependencies["runRpcFallback"],
  fn: string,
  args: Record<string, unknown>
) {
  if (!runRpcFallback) {
    return Promise.resolve({
      data: null,
      error: "Backend API is not configured."
    } satisfies BackendResult<Record<string, unknown>>);
  }

  return runRpcFallback(fn, args);
}

export function createFintechGateway({
  isBackendApiConfigured,
  backendRequest,
  runRpcFallback
}: FintechGatewayDependencies) {
  async function postWalletEntry(args: Record<string, unknown>) {
    if (isBackendApiConfigured()) {
      const result = await backendRequest(`/api/v1/wallet/entries`, {
        method: "POST",
        body: args
      });

      if (result.data || !result.error) {
        return result;
      }
    }

    return callRpcFallback(runRpcFallback, "post_wallet_entry", args);
  }

  async function paySavingsInstallment(args: Record<string, unknown>) {
    if (isBackendApiConfigured()) {
      const result = await backendRequest(`/api/v1/savings/installments/pay`, {
        method: "POST",
        body: args
      });

      if (result.data || !result.error) {
        return result;
      }
    }

    return callRpcFallback(runRpcFallback, "pay_savings_installment", args);
  }

  async function ensureWalletAccount(args: Record<string, unknown>) {
    if (isBackendApiConfigured()) {
      const result = await backendRequest(`/api/v1/wallet/accounts/ensure`, {
        method: "POST",
        body: args
      });

      if (result.data || !result.error) {
        return result;
      }
    }

    return callRpcFallback(runRpcFallback, "ensure_wallet_account", args);
  }

  async function resolveReferralReward(args: Record<string, unknown>) {
    if (isBackendApiConfigured()) {
      const result = await backendRequest(`/api/v1/referrals/rewards/resolve`, {
        method: "POST",
        body: args
      });

      if (result.data || !result.error) {
        return result;
      }
    }

    return callRpcFallback(runRpcFallback, "resolve_referral_reward", args);
  }

  return {
    postWalletEntry,
    paySavingsInstallment,
    ensureWalletAccount,
    resolveReferralReward
  };
}
