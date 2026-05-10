import { Body, Controller, Param, Post, Req, UseGuards } from "@nestjs/common";
import { SupabaseAuthGuard } from "../../common/auth/supabase-auth.guard";
import { WorkflowsService } from "./workflows.service";
import type { AuthenticatedRequest } from "../../common/auth/authenticated-request";
import type {
  ArchitectReviewRequestDto,
  CustomerDecisionRequestDto,
  MarkSuppliedRequestDto,
  SiteOrderTransitionRequestDto,
  SubstituteResponseRequestDto,
  SuggestSubstituteRequestDto,
  VerifyProfessionalRequestDto
} from "@shared-types/backend-contracts";

@Controller("/api/v1")
@UseGuards(SupabaseAuthGuard)
export class WorkflowsController {
  constructor(private readonly workflowsService: WorkflowsService) {}

  private getAccessToken(request: AuthenticatedRequest) {
    const authHeader = request.headers.authorization || "";
    return authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
  }

  @Post("/workflows/order-items/:id/customer-decision")
  async customerDecision(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() body: CustomerDecisionRequestDto
  ) {
    return {
      data: await this.workflowsService.approveOrderItemByCustomer(request.actor!, this.getAccessToken(request), {
        ...body,
        target_order_item_id: body.target_order_item_id || id
      })
    };
  }

  @Post("/workflows/substitutes/:id/respond")
  async respondToSubstitute(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() body: SubstituteResponseRequestDto
  ) {
    return {
      data: await this.workflowsService.respondToSubstitute(request.actor!, this.getAccessToken(request), {
        ...body,
        suggestion_id: body.suggestion_id || id
      })
    };
  }

  @Post("/workflows/order-items/:id/architect-review")
  async architectReview(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() body: ArchitectReviewRequestDto
  ) {
    return {
      data: await this.workflowsService.reviewOrderItemByArchitect(request.actor!, this.getAccessToken(request), {
        ...body,
        target_order_item_id: body.target_order_item_id || id
      })
    };
  }

  @Post("/workflows/site-orders/:id/transition")
  async transitionSiteOrder(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() body: SiteOrderTransitionRequestDto
  ) {
    return {
      data: await this.workflowsService.transitionSiteOrder(request.actor!, this.getAccessToken(request), {
        ...body,
        target_site_order_id: body.target_site_order_id || id
      })
    };
  }

  @Post("/workflows/order-items/:id/mark-supplied")
  async markSupplied(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() body: MarkSuppliedRequestDto
  ) {
    return {
      data: await this.workflowsService.markOrderItemSupplied(request.actor!, this.getAccessToken(request), {
        ...body,
        target_order_item_id: body.target_order_item_id || id
      })
    };
  }

  @Post("/workflows/order-items/:id/suggest-substitute")
  async suggestSubstitute(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() body: SuggestSubstituteRequestDto
  ) {
    return {
      data: await this.workflowsService.suggestSubstituteItem(request.actor!, this.getAccessToken(request), {
        ...body,
        original_item_id: body.original_item_id || id
      })
    };
  }

  @Post("/admin/users/:id/verify")
  async verifyProfessional(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() body: VerifyProfessionalRequestDto
  ) {
    return {
      data: await this.workflowsService.verifyProfessionalUser(request.actor!, this.getAccessToken(request), {
        ...body,
        target_user_id: body.target_user_id || id
      })
    };
  }
}
