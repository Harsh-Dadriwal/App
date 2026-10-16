import { createShopGateway } from "@mahalaxmi/core/gateway/shop-gateway";
import { backendRequest } from "@/lib/backend/http";

const gateway = createShopGateway({ backendRequest });

export const getPriceCatalog = gateway.getPriceCatalog;
export const listOrderRequests = gateway.listOrderRequests;
export const createOrderRequest = gateway.createOrderRequest;
export const updateOrderRequestStatus = gateway.updateOrderRequestStatus;
