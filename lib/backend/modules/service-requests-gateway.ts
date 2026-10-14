import { createServiceRequestsGateway } from "@mahalaxmi/core/gateway/service-requests-gateway";
import { backendRequest } from "@/lib/backend/http";

const gateway = createServiceRequestsGateway({ backendRequest });

export const listServiceRequests = gateway.listServiceRequests;
export const createServiceRequest = gateway.createServiceRequest;
export const offerToTakeServiceRequest = gateway.offerToTakeServiceRequest;
export const chooseServiceRequestElectrician = gateway.chooseServiceRequestElectrician;
export const updateServiceRequestStatus = gateway.updateServiceRequestStatus;
