import { createInventoryGateway } from "@mahalaxmi/core/gateway/inventory-gateway";
import { isBackendApiConfigured } from "@/lib/backend/config";
import { backendRequest } from "@/lib/backend/http";

const inventoryGateway = createInventoryGateway({ isBackendApiConfigured, backendRequest });

export const getPriceList = inventoryGateway.getPriceList;
export const syncPriceList = inventoryGateway.syncPriceList;
export const savePriceListCategoryImage = inventoryGateway.savePriceListCategoryImage;
