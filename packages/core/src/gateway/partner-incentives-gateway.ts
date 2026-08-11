import type { BackendRequestOptions } from "./http";

type BackendResult<T> = { data: T | null; error: string | null };
type BackendRequest = <T>(path: string, options?: BackendRequestOptions) => Promise<BackendResult<T>>;

export type PartnerIncentiveOverview = {
  progress: Record<string, unknown> | null;
  ledger: Record<string, unknown>[];
  wallet: Record<string, unknown> | null;
  rewards: Record<string, unknown>[];
  slabs: Record<string, unknown>[];
};

export type AdminPartnerIncentiveOverview = {
  schemes: Record<string, unknown>[];
  slabs: Record<string, unknown>[];
  reports: Record<string, unknown>[];
  ledger: Record<string, unknown>[];
};

export function createPartnerIncentivesGateway({
  isBackendApiConfigured,
  backendRequest
}: {
  isBackendApiConfigured: () => boolean;
  backendRequest: BackendRequest;
}) {
  const ensureConfigured = () => {
    if (!isBackendApiConfigured()) {
      return { data: null, error: "Backend API is not configured." };
    }
    return null;
  };

  return {
    async getPartnerIncentives() {
      return ensureConfigured() ?? backendRequest<PartnerIncentiveOverview>("/api/v1/partner/incentives");
    },
    async getAdminPartnerIncentives(tenantId?: string) {
      const query = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : "";
      return ensureConfigured() ?? backendRequest<AdminPartnerIncentiveOverview>(`/api/v1/admin/incentive-schemes${query}`);
    },
    async saveScheme(payload: Record<string, unknown>, schemeId?: string | null) {
      return ensureConfigured() ?? backendRequest<Record<string, unknown>>(
        schemeId ? `/api/v1/admin/incentive-schemes/${schemeId}` : "/api/v1/admin/incentive-schemes",
        { method: schemeId ? "PUT" : "POST", body: payload }
      );
    },
    async duplicateScheme(schemeId: string) {
      return ensureConfigured() ?? backendRequest<Record<string, unknown>>(`/api/v1/admin/incentive-schemes/${schemeId}/duplicate`, { method: "POST" });
    },
    async deleteScheme(schemeId: string) {
      return ensureConfigured() ?? backendRequest<Record<string, unknown>>(`/api/v1/admin/incentive-schemes/${schemeId}`, { method: "DELETE" });
    },
    async saveSlab(payload: Record<string, unknown>, slabId?: string | null) {
      return ensureConfigured() ?? backendRequest<Record<string, unknown>>(
        slabId ? `/api/v1/admin/slabs/${slabId}` : "/api/v1/admin/slabs",
        { method: slabId ? "PUT" : "POST", body: payload }
      );
    },
    async deleteSlab(slabId: string) {
      return ensureConfigured() ?? backendRequest<Record<string, unknown>>(`/api/v1/admin/slabs/${slabId}`, { method: "DELETE" });
    },
    async reorderSlabs(ids: string[]) {
      return ensureConfigured() ?? backendRequest<{ reordered: number }>("/api/v1/admin/slabs/reorder", { method: "PATCH", body: { ids } });
    },
    async listAdminRedemptions(tenantId?: string, status?: string) {
      const params = new URLSearchParams();
      if (tenantId) params.set("tenantId", tenantId);
      if (status) params.set("status", status);
      const query = params.toString() ? `?${params.toString()}` : "";
      return ensureConfigured() ?? backendRequest<Record<string, unknown>[]>(`/api/v1/admin/reward-redemptions${query}`);
    },
    async resolveRedemption(redemptionId: string, status: "approved" | "rejected" | "fulfilled" | "cancelled", notes?: string) {
      return ensureConfigured() ?? backendRequest<Record<string, unknown>>(
        `/api/v1/admin/reward-redemptions/${redemptionId}`,
        { method: "PATCH", body: { status, notes } }
      );
    }
  };
}
