import { createPartnerIncentivesGateway } from "@mahalaxmi/core/gateway/partner-incentives-gateway";
import { backendRequest } from "@/lib/backend/http";
import { isBackendApiConfigured } from "@/lib/backend/config";

const gateway = createPartnerIncentivesGateway({ isBackendApiConfigured, backendRequest });

export const savePartnerIncentiveScheme = gateway.saveScheme;
export const duplicatePartnerIncentiveScheme = gateway.duplicateScheme;
export const deletePartnerIncentiveScheme = gateway.deleteScheme;
export const savePartnerIncentiveSlab = gateway.saveSlab;
export const deletePartnerIncentiveSlab = gateway.deleteSlab;
export const resolveRedemption = gateway.resolveRedemption;
