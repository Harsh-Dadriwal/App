import { createInventoryGateway } from "@mahalaxmi/core/gateway/inventory-gateway";
import { backendRequest } from "./http";
import { isBackendApiConfigured } from "./config";

const gateway = createInventoryGateway({ isBackendApiConfigured, backendRequest });

export const getPriceList = gateway.getPriceList;
export const syncPriceList = gateway.syncPriceList;
