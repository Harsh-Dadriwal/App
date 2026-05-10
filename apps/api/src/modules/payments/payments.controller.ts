import { Body, Controller, Post, Req, UseGuards } from "@nestjs/common";
import type {
  RazorpayCreateOrderRequestDto,
  RazorpayVerifyPaymentRequestDto
} from "@shared-types/backend-contracts";
import { SupabaseAuthGuard } from "../../common/auth/supabase-auth.guard";
import type { AuthenticatedRequest } from "../../common/auth/authenticated-request";
import { PaymentsService } from "./payments.service";

@Controller("/api/v1/payments")
@UseGuards(SupabaseAuthGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post("/razorpay/orders")
  async createOrder(
    @Req() request: AuthenticatedRequest,
    @Body() body: RazorpayCreateOrderRequestDto
  ) {
    return {
      data: await this.paymentsService.createRazorpayOrder(request.actor!, body)
    };
  }

  @Post("/razorpay/verify")
  async verifyPayment(
    @Req() request: AuthenticatedRequest,
    @Body() body: RazorpayVerifyPaymentRequestDto
  ) {
    return {
      data: this.paymentsService.verifyRazorpayPayment(request.actor!, body)
    };
  }
}
