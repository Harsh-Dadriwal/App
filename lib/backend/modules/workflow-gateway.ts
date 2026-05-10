import { createWorkflowGateway } from "@mahalaxmi/core/gateway/workflow-gateway";
import { backendRequest, type BackendResult } from "@/lib/backend/http";
import { isBackendApiConfigured } from "@/lib/backend/config";
const workflowGateway = createWorkflowGateway({
  isBackendApiConfigured,
  backendRequest
});

export const approveOrderItemByCustomer = workflowGateway.approveOrderItemByCustomer;
export const respondToSubstitute = workflowGateway.respondToSubstitute;
export const reviewOrderItemByArchitect = workflowGateway.reviewOrderItemByArchitect;
export const transitionSiteOrder = workflowGateway.transitionSiteOrder;
export const markOrderItemSupplied = workflowGateway.markOrderItemSupplied;
export const suggestSubstituteItem = workflowGateway.suggestSubstituteItem;
export const verifyProfessionalUser = workflowGateway.verifyProfessionalUser;
