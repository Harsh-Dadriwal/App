import { createShopGateway } from "@mahalaxmi/core/gateway/shop-gateway";
import { backendRequest } from "./http";

const gateway = createShopGateway({ backendRequest });

export const getPriceCatalog = gateway.getPriceCatalog;
export const listOrderRequests = gateway.listOrderRequests;
export const createOrderRequest = gateway.createOrderRequest;
export const updateOrderRequestStatus = gateway.updateOrderRequestStatus;
export const listQuotations = gateway.listQuotations;
export const uploadQuotationPhoto = gateway.uploadQuotationPhoto;
export const createQuotation = gateway.createQuotation;
export const sendQuote = gateway.sendQuote;
export const acceptQuotation = gateway.acceptQuotation;
export const closeQuotation = gateway.closeQuotation;
