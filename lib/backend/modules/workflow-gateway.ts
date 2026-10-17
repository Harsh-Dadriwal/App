import { createWorkflowGateway } from "@mahalaxmi/core/gateway/workflow-gateway";
import { backendRequest, type BackendResult } from "@/lib/backend/http";
import { isBackendApiConfigured } from "@/lib/backend/config";
const workflowGateway = createWorkflowGateway({
  isBackendApiConfigured,
  backendRequest
});

export const markOrderItemSupplied = workflowGateway.markOrderItemSupplied;
export const verifyProfessionalUser = workflowGateway.verifyProfessionalUser;
