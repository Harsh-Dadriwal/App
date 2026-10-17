import { backendRequest, type BackendResult } from "@/lib/backend/http";

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

export async function releaseEscrowAccount(
  id: string,
  dto: { notes: string }
): Promise<BackendResult<any>> {
  return backendRequest(`/api/v1/escrow/release/${id}`, {
    method: "POST",
    body: dto
  });
}
