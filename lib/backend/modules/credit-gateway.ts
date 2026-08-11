import { backendRequest, type BackendResult } from "@/lib/backend/http";

export async function recalculateCredit(contractorId: string): Promise<BackendResult<any>> {
  return backendRequest(`/api/v1/credit/recalculate/${contractorId}`, {
    method: "POST"
  });
}

export async function getCreditProfile(contractorId: string): Promise<BackendResult<any>> {
  return backendRequest(`/api/v1/credit/profile/${contractorId}`, {
    method: "GET"
  });
}

export async function getCreditHistory(contractorId: string): Promise<BackendResult<any>> {
  return backendRequest(`/api/v1/credit/history/${contractorId}`, {
    method: "GET"
  });
}

export async function approveOrder(dto: {
  contractorId: string;
  orderAmount: number;
}): Promise<BackendResult<any>> {
  return backendRequest("/api/v1/credit/approve-order", {
    method: "POST",
    body: dto
  });
}

export async function manualCreditReview(dto: {
  contractorId: string;
  action: "increase_limit" | "decrease_limit" | "freeze_credit" | "unfreeze_credit";
  amount?: number;
  notes?: string;
}): Promise<BackendResult<any>> {
  return backendRequest("/api/v1/credit/manual-review", {
    method: "POST",
    body: dto
  });
}

export async function getCreditDashboard(): Promise<BackendResult<any>> {
  return backendRequest("/api/v1/credit/dashboard", {
    method: "GET"
  });
}
