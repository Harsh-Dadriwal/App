import { Body, Controller, Get, Post, Query, Req, UseGuards } from "@nestjs/common";
import { SupabaseAuthGuard } from "../../common/auth/supabase-auth.guard";
import { WalletService } from "./wallet.service";
import type { AuthenticatedRequest } from "../../common/auth/authenticated-request";
import type {
  EnsureWalletAccountRequestDto,
  PaySavingsInstallmentRequestDto,
  PostWalletEntryRequestDto,
  ResolveReferralRewardRequestDto
} from "@shared-types/backend-contracts";

@Controller("/api/v1")
@UseGuards(SupabaseAuthGuard)
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  private getAccessToken(request: AuthenticatedRequest) {
    const authHeader = request.headers.authorization || "";
    return authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
  }

  @Post("/wallet/entries")
  async postWalletEntry(@Req() request: AuthenticatedRequest, @Body() body: PostWalletEntryRequestDto) {
    return { data: await this.walletService.postWalletEntry(request.actor!, this.getAccessToken(request), body) };
  }

  @Post("/wallet/accounts/ensure")
  async ensureWalletAccount(@Req() request: AuthenticatedRequest, @Body() body: EnsureWalletAccountRequestDto) {
    return { data: await this.walletService.ensureWalletAccount(request.actor!, this.getAccessToken(request), body) };
  }

  @Post("/savings/installments/pay")
  async payInstallment(@Req() request: AuthenticatedRequest, @Body() body: PaySavingsInstallmentRequestDto) {
    return { data: await this.walletService.paySavingsInstallment(request.actor!, this.getAccessToken(request), body) };
  }

  @Post("/referrals/rewards/resolve")
  async resolveReferralReward(@Req() request: AuthenticatedRequest, @Body() body: ResolveReferralRewardRequestDto) {
    return { data: await this.walletService.resolveReferralReward(request.actor!, this.getAccessToken(request), body) };
  }

  @Get("/wallet/reconciliation")
  async reconcileWallets(@Req() request: AuthenticatedRequest, @Query("tenantId") tenantId?: string) {
    return {
      data: await this.walletService.reconcileWalletsForTenant(
        request.actor!,
        tenantId ?? request.actor?.defaultTenantId ?? ""
      )
    };
  }
}
