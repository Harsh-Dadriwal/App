import { backendRequest, type BackendResult } from "@/lib/backend/http";

export async function createCreditRequest(dto: {
  tenantId: string;
  siteId: string;
  requestedAmount: number;
  purpose: string;
}): Promise<BackendResult<any>> {
  return backendRequest("/api/v1/credit/request", {
    method: "POST",
    body: dto
  });
}

export async function reviewCreditRequest(
  id: string,
  dto: {
    status: "approved" | "rejected" | "under_review";
    approvedAmount?: number;
    advanceRequiredPercentage?: number;
    notes: string;
  }
): Promise<BackendResult<any>> {
  return backendRequest(`/api/v1/credit/review/${id}`, {
    method: "PATCH",
    body: dto
  });
}

export async function createEscrowAccount(dto: {
  tenantId: string;
  siteOrderId: string;
  amount: number;
}): Promise<BackendResult<any>> {
  return backendRequest("/api/v1/escrow/create", {
    method: "POST",
    body: dto
  });
}

export async function releaseEscrowAccount(
  id: string,
  dto: { notes: string }
): Promise<BackendResult<any>> {
  return backendRequest(`/api/v1/escrow/release/${id}`, {
    method: "POST",
    body: dto
  });
}

export async function calculateFees(
  orderId: string,
  urgency: "STANDARD" | "PRIORITY" | "EMERGENCY"
): Promise<BackendResult<any>> {
  return backendRequest(`/api/v1/fees/calculate?orderId=${orderId}&urgency=${urgency}`, {
    method: "GET"
  });
}

export async function upgradeSubscription(dto: {
  tenantId: string;
  planCode: string;
}): Promise<BackendResult<any>> {
  return backendRequest("/api/v1/subscriptions/upgrade", {
    method: "POST",
    body: dto
  });
}
