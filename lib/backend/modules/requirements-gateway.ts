import { createRequirementsGateway } from "@mahalaxmi/core/gateway/requirements-gateway";
import { isBackendApiConfigured } from "@/lib/backend/config";
import { backendRequest } from "@/lib/backend/http";

const requirementsGateway = createRequirementsGateway({
  isBackendApiConfigured,
  backendRequest
});

export const listRequirementBatches = requirementsGateway.listRequirementBatches;
export const getRequirementBatch = requirementsGateway.getRequirementBatch;
export const createRequirementTextBatch = requirementsGateway.createRequirementTextBatch;
export const createRequirementUploadBatch = requirementsGateway.createRequirementUploadBatch;
export const reviewRequirementBatchItem = requirementsGateway.reviewRequirementBatchItem;
export const generateRequirementProcurement = requirementsGateway.generateRequirementProcurement;
