import type { BackendRequestOptions } from "./http";
import type {
  CreateRequirementTextBatchRequestDto,
  GenerateRequirementProcurementRequestDto,
  ReviewRequirementBatchItemRequestDto
} from "../types/contracts";
import type {
  RequirementBatch,
  RequirementBatchItem,
  RequirementBatchItemCandidate,
  RequirementBatchSource
} from "../types/domain";

type BackendResult<T> = {
  data: T | null;
  error: string | null;
};

type RequirementGatewayDependencies = {
  isBackendApiConfigured: () => boolean;
  backendRequest: <T>(
    path: string,
    options?: BackendRequestOptions
  ) => Promise<BackendResult<T>>;
};

type RequirementBatchDetails = RequirementBatch & {
  sources: RequirementBatchSource[];
  items: Array<
    RequirementBatchItem & {
      candidates: RequirementBatchItemCandidate[];
    }
  >;
};

export function createRequirementsGateway({
  isBackendApiConfigured,
  backendRequest
}: RequirementGatewayDependencies) {
  async function listRequirementBatches() {
    if (!isBackendApiConfigured()) {
      return {
        data: [] as RequirementBatch[],
        error: "Backend API is not configured."
      };
    }

    return backendRequest<RequirementBatch[]>("/api/v1/requirements");
  }

  async function getRequirementBatch(batchId: string) {
    if (!isBackendApiConfigured()) {
      return {
        data: null,
        error: "Backend API is not configured."
      };
    }

    return backendRequest<RequirementBatchDetails>(`/api/v1/requirements/${batchId}`);
  }

  async function createRequirementTextBatch(body: CreateRequirementTextBatchRequestDto) {
    if (!isBackendApiConfigured()) {
      return {
        data: null,
        error: "Backend API is not configured."
      };
    }

    return backendRequest<RequirementBatch>("/api/v1/requirements/text", {
      method: "POST",
      body
    });
  }

  async function createRequirementUploadBatch(formData: FormData) {
    if (!isBackendApiConfigured()) {
      return {
        data: null,
        error: "Backend API is not configured."
      };
    }

    return backendRequest<RequirementBatch>("/api/v1/requirements/upload", {
      method: "POST",
      body: formData
    });
  }

  async function reviewRequirementBatchItem(
    batchId: string,
    itemId: string,
    body: ReviewRequirementBatchItemRequestDto
  ) {
    if (!isBackendApiConfigured()) {
      return {
        data: null,
        error: "Backend API is not configured."
      };
    }

    return backendRequest<RequirementBatchItem>(
      `/api/v1/requirements/${batchId}/items/${itemId}/review`,
      {
        method: "PATCH",
        body
      }
    );
  }

  async function generateRequirementProcurement(
    batchId: string,
    body: GenerateRequirementProcurementRequestDto = {}
  ) {
    if (!isBackendApiConfigured()) {
      return {
        data: null,
        error: "Backend API is not configured."
      };
    }

    return backendRequest<Record<string, unknown>>(
      `/api/v1/requirements/${batchId}/generate-procurement`,
      {
        method: "POST",
        body
      }
    );
  }

  return {
    listRequirementBatches,
    getRequirementBatch,
    createRequirementTextBatch,
    createRequirementUploadBatch,
    reviewRequirementBatchItem,
    generateRequirementProcurement
  };
}
