import type { BackendRequestOptions } from "./http";
import type {
  BackendResult,
  RazorpayCreateOrderRequestDto,
  RazorpayCreateOrderResponseDto,
  RazorpayVerifyPaymentRequestDto,
  RazorpayVerifyPaymentResponseDto
} from "../types/contracts";

type PaymentsGatewayDependencies = {
  backendRequest: <T>(
    path: string,
    options?: BackendRequestOptions
  ) => Promise<BackendResult<T>>;
};

export function createPaymentsGateway({ backendRequest }: PaymentsGatewayDependencies) {
  async function createRazorpayOrder(args: RazorpayCreateOrderRequestDto) {
    return backendRequest<RazorpayCreateOrderResponseDto>("/api/v1/payments/razorpay/orders", {
      method: "POST",
      body: args
    });
  }

  async function verifyRazorpayPayment(args: RazorpayVerifyPaymentRequestDto) {
    return backendRequest<RazorpayVerifyPaymentResponseDto>("/api/v1/payments/razorpay/verify", {
      method: "POST",
      body: args
    });
  }

  return {
    createRazorpayOrder,
    verifyRazorpayPayment
  };
}
