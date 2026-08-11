import { Body, Controller, Get, Param, Post, Patch, Req, UseGuards, ForbiddenException, BadRequestException } from "@nestjs/common";
import { SupabaseAuthGuard } from "../../../common/auth/supabase-auth.guard";
import { CreditService } from "../credit.service";
import { CreditEngineService } from "../credit-engine.service";
import { SupabaseAdminService } from "../../../common/supabase/supabase-admin.service";
import type { AuthenticatedRequest } from "../../../common/auth/authenticated-request";

@Controller("/api/v1/credit")
@UseGuards(SupabaseAuthGuard)
export class CreditController {
  constructor(
    private readonly creditService: CreditService,
    private readonly creditEngineService: CreditEngineService,
    private readonly supabaseAdmin: SupabaseAdminService
  ) {}

  private getAccessToken(request: AuthenticatedRequest) {
    const authHeader = request.headers.authorization || "";
    return authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
  }

  private assertAdminOrSelf(request: AuthenticatedRequest, contractorId: string) {
    const actor = request.actor;
    if (!actor) throw new ForbiddenException("Unauthorized request.");
    if (actor.role !== "admin" && actor.appUserId !== contractorId) {
      throw new ForbiddenException("Access denied. You cannot query another contractor's data.");
    }
  }

  @Post("/request")
  async createCreditRequest(
    @Req() request: AuthenticatedRequest,
    @Body() body: { tenantId: string; siteId: string; requestedAmount: number; purpose: string }
  ) {
    return {
      data: await this.creditService.submitRequest(request.actor!, this.getAccessToken(request), body)
    };
  }

  @Patch("/review/:id")
  async reviewCreditRequest(
    @Req() request: AuthenticatedRequest,
    @Param("id") requestId: string,
    @Body() body: { status: "approved" | "rejected" | "under_review"; approvedAmount?: number; advanceRequiredPercentage?: number; notes: string }
  ) {
    return {
      data: await this.creditService.processReview(request.actor!, this.getAccessToken(request), requestId, body)
    };
  }

  @Post("/recalculate/:contractorId")
  async recalculateCredit(
    @Req() request: AuthenticatedRequest,
    @Param("contractorId") contractorId: string
  ) {
    this.assertAdminOrSelf(request, contractorId);
    return {
      data: await this.creditEngineService.updateCreditProfile(contractorId, request.actor?.appUserId || "system", "On-demand recalculation requested.")
    };
  }

  @Get("/profile/:contractorId")
  async getCreditProfile(
    @Req() request: AuthenticatedRequest,
    @Param("contractorId") contractorId: string
  ) {
    this.assertAdminOrSelf(request, contractorId);
    const client = this.supabaseAdmin.getClient();
    const [{ data: contractor, error: cErr }, { data: profile, error: pErr }] = await Promise.all([
      client.from("contractors").select("*").eq("id", contractorId).maybeSingle(),
      client.from("credit_profiles").select("*").eq("contractor_id", contractorId).maybeSingle()
    ]);

    if (cErr) throw new BadRequestException(cErr.message);
    if (pErr) throw new BadRequestException(pErr.message);

    return {
      data: contractor ? { ...contractor, profile: profile || null } : null
    };
  }

  @Get("/history/:contractorId")
  async getCreditHistory(
    @Req() request: AuthenticatedRequest,
    @Param("contractorId") contractorId: string
  ) {
    this.assertAdminOrSelf(request, contractorId);
    const { data, error } = await this.supabaseAdmin.getClient()
      .from("credit_audit_logs")
      .select("*")
      .eq("contractor_id", contractorId)
      .order("created_at", { ascending: false });

    if (error) throw new BadRequestException(error.message);
    return { data };
  }

  @Post("/approve-order")
  async approveOrder(
    @Req() request: AuthenticatedRequest,
    @Body() body: { contractorId: string; orderAmount: number }
  ) {
    if (!body.contractorId || !body.orderAmount) {
      throw new BadRequestException("contractorId and orderAmount are required.");
    }
    return {
      data: await this.creditEngineService.approveOrder(body.contractorId, body.orderAmount)
    };
  }

  @Post("/manual-review")
  async manualReview(
    @Req() request: AuthenticatedRequest,
    @Body() body: {
      contractorId: string;
      action: "increase_limit" | "decrease_limit" | "freeze_credit" | "unfreeze_credit";
      amount?: number;
      notes?: string;
    }
  ) {
    if (request.actor?.role !== "admin") {
      throw new ForbiddenException("Only finance admins can perform manual reviews.");
    }
    if (!body.contractorId || !body.action) {
      throw new BadRequestException("contractorId and action are required.");
    }
    return {
      data: await this.creditEngineService.processManualReview(
        request.actor.appUserId || "admin",
        body.contractorId,
        body.action,
        body.amount,
        body.notes
      )
    };
  }

  @Get("/dashboard")
  async getDashboard(@Req() request: AuthenticatedRequest) {
    if (request.actor?.role !== "admin") {
      throw new ForbiddenException("Only finance admins can access the credit dashboard.");
    }

    const client = this.supabaseAdmin.getClient();

    // 1. Fetch all contractors
    const { data: contractors, error: cErr } = await client
      .from("contractors")
      .select("credit_limit, available_credit, risk_score, credit_status, is_frozen");

    if (cErr) throw new BadRequestException(cErr.message);

    // 2. Fetch all unpaid invoices
    const { data: invoices, error: iErr } = await client
      .from("invoices")
      .select("invoice_amount, due_date, payment_status")
      .not("payment_status", "eq", "paid");

    if (iErr) throw new BadRequestException(iErr.message);

    const totalExposure = (contractors ?? []).reduce((sum, c) => sum + Number(c.credit_limit || 0), 0);
    const frozenAccounts = (contractors ?? []).filter(c => c.is_frozen).length;

    const riskCategoryCount = { green: 0, yellow: 0, orange: 0, red: 0 };
    (contractors ?? []).forEach(c => {
      const status = (c.credit_status || "red") as "green" | "yellow" | "orange" | "red";
      if (riskCategoryCount[status] !== undefined) {
        riskCategoryCount[status]++;
      }
    });

    const now = new Date();
    const next30Days = new Date();
    next30Days.setDate(now.getDate() + 30);

    let overdueExposure = 0;
    let expectedCollections = 0;
    let totalOutstanding = 0;

    if (invoices) {
      for (const inv of invoices) {
        const amt = Number(inv.invoice_amount || 0);
        const dueDate = new Date(inv.due_date);
        totalOutstanding += amt;

        if (dueDate < now) {
          overdueExposure += amt;
        } else if (dueDate <= next30Days) {
          expectedCollections += amt;
        }
      }
    }

    const creditUtilization = totalExposure > 0 ? (totalOutstanding / totalExposure) * 100 : 0;

    return {
      data: {
        totalExposure,
        overdueExposure,
        riskCategoryCount,
        creditUtilization: Number(creditUtilization.toFixed(2)),
        expectedCollections,
        frozenAccounts
      }
    };
  }
}
