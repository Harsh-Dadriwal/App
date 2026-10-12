import { createPaymentsGateway } from "@mahalaxmi/core/gateway/payments-gateway";
import { backendRequest } from "./http";

const gateway = createPaymentsGateway({ backendRequest });

export const createRazorpayOrder = gateway.createRazorpayOrder;
export const verifyRazorpayPayment = gateway.verifyRazorpayPayment;
