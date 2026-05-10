import { createWorkflowGateway } from "@mahalaxmi/core/gateway/workflow-gateway";
import { backendRequest, type BackendResult } from "./http";
import { isBackendApiConfigured } from "./config";
const workflowGateway = createWorkflowGateway({
  isBackendApiConfigured,
  backendRequest
});

export const approveOrderItemByCustomer = workflowGateway.approveOrderItemByCustomer;
export const respondToSubstitute = workflowGateway.respondToSubstitute;
export const reviewOrderItemByArchitect = workflowGateway.reviewOrderItemByArchitect;
