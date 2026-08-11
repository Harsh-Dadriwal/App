import { createPartnerIncentivesGateway } from "@mahalaxmi/core/gateway/partner-incentives-gateway";
import { backendRequest } from "./http";
import { isBackendApiConfigured } from "./config";

const gateway = createPartnerIncentivesGateway({ isBackendApiConfigured, backendRequest });

export const getPartnerIncentives = gateway.getPartnerIncentives;
export const getAdminPartnerIncentives = gateway.getAdminPartnerIncentives;
export const savePartnerIncentiveScheme = gateway.saveScheme;
export const duplicatePartnerIncentiveScheme = gateway.duplicateScheme;
export const deletePartnerIncentiveScheme = gateway.deleteScheme;
export const savePartnerIncentiveSlab = gateway.saveSlab;
export const deletePartnerIncentiveSlab = gateway.deleteSlab;
