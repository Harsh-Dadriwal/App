import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CreditEngineService } from "./credit-engine.service";

describe("CreditEngineService Unit Tests", () => {
  const mockSupabaseAdmin = {
    getClient: () => ({} as any)
  };
  const mockDomainEvents = {
    publish: async () => {}
  };
  const mockNotifications = {
    createBulkNotifications: async () => []
  };

  const service = new CreditEngineService(
    mockSupabaseAdmin as any,
    mockDomainEvents as any,
    mockNotifications as any
  );

  describe("predictPaymentRisk", () => {
    it("returns default risk if average delay > 30 days and has overdue invoices", () => {
      const risk = service.predictPaymentRisk({
        averagePaymentDelayDays: 35,
        utilization: 0.5,
        projectStage: "active",
        latePaymentCount: 2,
        invoiceAmount: 100000,
        overdueCount: 1
      });
      assert.equal(risk, "default risk");
    });

    it("returns high risk if delay > 15 days or late payments > 2", () => {
      const risk = service.predictPaymentRisk({
        averagePaymentDelayDays: 16,
        utilization: 0.5,
        projectStage: "active",
        latePaymentCount: 1,
        invoiceAmount: 50000,
        overdueCount: 0
      });
      assert.equal(risk, "high risk");
    });

    it("returns medium risk if utilization > 80% or delay > 7 days or project stage is on_hold", () => {
      const risk = service.predictPaymentRisk({
        averagePaymentDelayDays: 5,
        utilization: 0.85,
        projectStage: "active",
        latePaymentCount: 1,
        invoiceAmount: 50000,
        overdueCount: 0
      });
      assert.equal(risk, "medium risk");
    });

    it("returns low risk for on-time paying contractors", () => {
      const risk = service.predictPaymentRisk({
        averagePaymentDelayDays: 2,
        utilization: 0.1,
        projectStage: "active",
        latePaymentCount: 0,
        invoiceAmount: 20000,
        overdueCount: 0
      });
      assert.equal(risk, "low risk");
    });
  });

  describe("calculateRiskScore", () => {
    it("calculates a high score for fully verified, on-time paying contractor", () => {
      const result = service.calculateRiskScore({
        onTimePaymentPercentage: 100,
        averagePaymentDelayDays: 0,
        overdueInvoicesCount: 0,
        bouncedPaymentCount: 0,
        activeProjectValue: 5000000,
        completedProjectsCount: 10,
        outstandingAmount: 0,
        creditLimit: 1000000,
        gstVerified: true,
        panVerified: true,
        businessAgeMonths: 24,
        disputeCount: 0
      });

      assert.ok(result.finalScore >= 80);
      assert.equal(result.paymentScore, 100);
      assert.equal(result.projectScore, 100);
      assert.equal(result.exposureScore, 100);
    });

    it("penalizes score for bounced payments, delay, and disputes", () => {
      const result = service.calculateRiskScore({
        onTimePaymentPercentage: 50,
        averagePaymentDelayDays: 10,
        overdueInvoicesCount: 2,
        bouncedPaymentCount: 1,
        activeProjectValue: 100000,
        completedProjectsCount: 1,
        outstandingAmount: 200000,
        creditLimit: 300000,
        gstVerified: false,
        panVerified: false,
        businessAgeMonths: 6,
        disputeCount: 2
      });

      assert.ok(result.finalScore < 50);
    });
  });

  describe("getCreditLimitCap", () => {
    it("returns caps based on risk score categories", () => {
      assert.equal(service.getCreditLimitCap(90), 1000000);
      assert.equal(service.getCreditLimitCap(75), 500000);
      assert.equal(service.getCreditLimitCap(62), 300000);
      assert.equal(service.getCreditLimitCap(55), 150000);
      assert.equal(service.getCreditLimitCap(42), 50000);
      assert.equal(service.getCreditLimitCap(25), 0);
    });
  });

  describe("calculateCreditLimit", () => {
    it("caps credit limit at the risk-based cap", () => {
      // 20% of 2M = 400K, 10% of 5M = 500K, score cap (90 score) = 1M
      // min(400K, 500K, 1M) = 400K
      const limit = service.calculateCreditLimit(2000000, 5000000, 90);
      assert.equal(limit, 400000);
    });

    it("caps credit limit at the project value limit", () => {
      // 20% of 10M = 2M, 10% of 1M = 100K, score cap = 1M
      // min(2M, 100K, 1M) = 100K
      const limit = service.calculateCreditLimit(10000000, 1000000, 90);
      assert.equal(limit, 100000);
    });
  });

  describe("approveOrder", () => {
    it("rejects order if contractor is frozen", async () => {
      const mockClient = {
        from: (table: string) => {
          if (table === "contractors") {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: {
                      credit_limit: 500000,
                      available_credit: 300000,
                      credit_status: "green",
                      is_frozen: true
                    },
                    error: null
                  })
                })
              })
            };
          }
          return {} as any;
        }
      };

      (service as any).supabaseAdmin.getClient = () => mockClient;

      const approval = await service.approveOrder("contractor-123", 50000);
      assert.equal(approval.decision, "rejected");
      assert.ok(approval.reason.includes("frozen"));
    });

    it("rejects order if credit status is red", async () => {
      const mockClient = {
        from: (table: string) => {
          if (table === "contractors") {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: {
                      credit_limit: 0,
                      available_credit: 0,
                      credit_status: "red",
                      is_frozen: false
                    },
                    error: null
                  })
                })
              })
            };
          }
          return {} as any;
        }
      };

      (service as any).supabaseAdmin.getClient = () => mockClient;

      const approval = await service.approveOrder("contractor-123", 50000);
      assert.equal(approval.decision, "rejected");
      assert.ok(approval.reason.includes("Red"));
    });

    it("recommends partial advance if order exceeds available credit", async () => {
      const mockClient = {
        from: (table: string) => {
          if (table === "contractors") {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: {
                      credit_limit: 500000,
                      available_credit: 100000,
                      credit_status: "green",
                      is_frozen: false
                    },
                    error: null
                  })
                })
              })
            };
          }
          if (table === "invoices") {
            return {
              select: () => ({
                eq: () => ({
                  not: async () => ({
                    data: [], // no overdue
                    error: null
                  })
                })
              })
            };
          }
          return {} as any;
        }
      };

      (service as any).supabaseAdmin.getClient = () => mockClient;

      const approval = await service.approveOrder("contractor-123", 150000);
      assert.equal(approval.decision, "approved_with_partial_advance");
      assert.equal(approval.approvedAmount, 100000);
      assert.equal(approval.advanceRequired, 50000);
    });
  });
});
