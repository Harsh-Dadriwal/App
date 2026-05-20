import { apiFetch } from "@/lib/api-client";
import type {
  CreateRequirementTextBatchRequestDto,
  GenerateRequirementProcurementRequestDto,
  ReviewRequirementBatchItemRequestDto
} from "@mahalaxmi/core/types/contracts";

async function handleResponse<T>(res: Response): Promise<{ data: T | null; error: string | null }> {
  try {
    const payload = await res.json().catch(() => null);
    if (!res.ok) {
      return { data: null, error: payload?.message || `Backend error ${res.status}` };
    }
    return { data: payload?.data !== undefined ? payload.data : payload, error: null };
  } catch (err: any) {
    return { data: null, error: err.message || "Unknown error" };
  }
}

export async function listRequirementBatches() {
  const res = await apiFetch("/api/v1/requirements");
  return handleResponse<any>(res);
}

export async function getRequirementBatch(batchId: string) {
  const res = await apiFetch(`/api/v1/requirements/${batchId}`);
  return handleResponse<any>(res);
}

export async function createRequirementTextBatch(body: CreateRequirementTextBatchRequestDto) {
  const res = await apiFetch("/api/v1/requirements/text", {
    method: "POST",
    body: JSON.stringify(body)
  });
  return handleResponse<any>(res);
}

export async function createRequirementUploadBatch(formData: FormData) {
  const res = await apiFetch("/api/v1/requirements/upload", {
    method: "POST",
    body: formData
  });
  return handleResponse<any>(res);
}

export async function reviewRequirementBatchItem(
  batchId: string,
  itemId: string,
  body: ReviewRequirementBatchItemRequestDto
) {
  const res = await apiFetch(`/api/v1/requirements/${batchId}/items/${itemId}/review`, {
    method: "PATCH",
    body: JSON.stringify(body)
  });
  return handleResponse<any>(res);
}

export async function generateRequirementProcurement(
  batchId: string,
  body: GenerateRequirementProcurementRequestDto = {}
) {
  const res = await apiFetch(`/api/v1/requirements/${batchId}/generate-procurement`, {
    method: "POST",
    body: JSON.stringify(body)
  });
  return handleResponse<any>(res);
}

export async function updateRequirementBatch(
  batchId: string,
  body: { site_id?: string | null }
) {
  const res = await apiFetch(`/api/v1/requirements/${batchId}`, {
    method: "PATCH",
    body: JSON.stringify(body)
  });
  return handleResponse<any>(res);
}

export async function deleteRequirementBatch(batchId: string) {
  const res = await apiFetch(`/api/v1/requirements/${batchId}`, {
    method: "DELETE"
  });
  return handleResponse<any>(res);
}
