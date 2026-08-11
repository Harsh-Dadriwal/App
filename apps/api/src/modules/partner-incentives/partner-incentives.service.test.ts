import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { PartnerIncentivesService } from "./partner-incentives.service";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

type MockQueryResult = { data: unknown; error: null | { message: string } };

function buildChain(result: MockQueryResult | (() => Promise<MockQueryResult>)) {
  const resolve = typeof result === "function" ? result : async () => result;
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: () => chain,
    update: () => chain,
    insert: () => chain,
    delete: () => chain,
    single: resolve,
    maybeSingle: resolve,
    then: (fn: (r: MockQueryResult) => unknown) => resolve().then(fn)
  };
  return chain;
}

function createService(overrides: Record<string, unknown> = {}, supabaseOverrides: Partial<{ fromResult: MockQueryResult }> = {}) {
  const defaultResult: MockQueryResult = { data: { id: "slab-1", tier_name: "Bronze" }, error: null };
  const result = supabaseOverrides.fromResult ?? defaultResult;

  const supabaseAdmin = {
    createUserClient: () => ({
      from: () => buildChain(result)
    }),
    getClient: () => ({
      from: () => buildChain(result)
    })
  };

  const tenantAccess = {
    assertTenantAccess: async () => undefined,
    assertTenantAdmin: async () => undefined,
    ...overrides
  };

  return new PartnerIncentivesService(supabaseAdmin as any, tenantAccess as any);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PartnerIncentivesService", () => {

  // --- Guard tests ---

  it("requires linked profile for partner dashboard", async () => {
    const service = createService();
    await assert.rejects(
      () => service.listPartnerDashboard({ authUserId: "auth", appUserId: null, role: "architect", defaultTenantId: "tenant" }, "token"),
      ForbiddenException
    );
  });

  it("requires tenant admin access for admin overview", async () => {
    const service = createService({ assertTenantAdmin: async () => { throw new ForbiddenException("Admin tenant access required."); } });
    await assert.rejects(
      () => service.listAdminOverview({ authUserId: "auth", appUserId: "user", role: "architect", defaultTenantId: "tenant" }, "token"),
      ForbiddenException
    );
  });

  it("requires tenant admin access for saveScheme", async () => {
    const service = createService({ assertTenantAdmin: async () => { throw new ForbiddenException("Admin only."); } });
    await assert.rejects(
      () => service.saveScheme({ authUserId: "auth", appUserId: "user", role: "architect", defaultTenantId: "tenant" }, "token", { name: "Test", tenant_id: "tenant" }),
      ForbiddenException
    );
  });

  it("requires tenant admin access for saveSlab", async () => {
    const service = createService({ assertTenantAdmin: async () => { throw new ForbiddenException("Admin only."); } });
    await assert.rejects(
      () => service.saveSlab({ authUserId: "auth", appUserId: "user", role: "architect", defaultTenantId: "tenant" }, "token", { tenant_id: "tenant" }),
      ForbiddenException
    );
  });

  it("requires tenant admin access for deleteScheme", async () => {
    const service = createService({ assertTenantAdmin: async () => { throw new ForbiddenException("Admin only."); } });
    await assert.rejects(
      () => service.deleteScheme({ authUserId: "auth", appUserId: "user", role: "architect", defaultTenantId: "tenant" }, "token", "scheme-1"),
      ForbiddenException
    );
  });

  it("requires tenant admin access for deleteSlab", async () => {
    const service = createService({ assertTenantAdmin: async () => { throw new ForbiddenException("Admin only."); } });
    await assert.rejects(
      () => service.deleteSlab({ authUserId: "auth", appUserId: "user", role: "architect", defaultTenantId: "tenant" }, "token", "slab-1"),
      ForbiddenException
    );
  });

  // --- saveScheme ---

  it("saveScheme returns the created scheme on success", async () => {
    const service = createService({}, { fromResult: { data: { id: "scheme-1", name: "Test Scheme", status: "draft" }, error: null } });
    const result = await service.saveScheme(
      { authUserId: "auth", appUserId: "user", role: "admin", defaultTenantId: "tenant" },
      "token",
      { name: "Test Scheme", partner_type: "architect", tenant_id: "tenant" }
    );
    assert.equal((result as any).id, "scheme-1");
    assert.equal((result as any).name, "Test Scheme");
  });

  it("saveScheme accepts an existing schemeId for update", async () => {
    const service = createService({}, { fromResult: { data: { id: "scheme-1", name: "Updated", status: "active" }, error: null } });
    const result = await service.saveScheme(
      { authUserId: "auth", appUserId: "user", role: "admin", defaultTenantId: "tenant" },
      "token",
      { name: "Updated", status: "active", tenant_id: "tenant" },
      "scheme-1"
    );
    assert.equal((result as any).status, "active");
  });

  // --- saveSlab ---

  it("saveSlab returns the created slab on success", async () => {
    const service = createService({}, { fromResult: { data: { id: "slab-1", tier_name: "Silver", min_business: 500000 }, error: null } });
    const result = await service.saveSlab(
      { authUserId: "auth", appUserId: "user", role: "admin", defaultTenantId: "tenant" },
      "token",
      { tier_name: "Silver", min_business: 500000, tenant_id: "tenant", scheme_id: "scheme-1", wire_commission_percent: 2, other_commission_percent: 10, bonus_points: 5000 }
    );
    assert.equal((result as any).tier_name, "Silver");
  });

  // --- deleteScheme ---

  it("deleteScheme returns the deleted id on success", async () => {
    const service = createService({}, { fromResult: { data: null, error: null } });
    const result = await service.deleteScheme(
      { authUserId: "auth", appUserId: "user", role: "admin", defaultTenantId: "tenant" },
      "token",
      "scheme-99"
    );
    assert.equal((result as any).id, "scheme-99");
  });

  // --- deleteSlab ---

  it("deleteSlab returns the deleted id on success", async () => {
    const service = createService({}, { fromResult: { data: null, error: null } });
    const result = await service.deleteSlab(
      { authUserId: "auth", appUserId: "user", role: "admin", defaultTenantId: "tenant" },
      "token",
      "slab-42"
    );
    assert.equal((result as any).id, "slab-42");
  });

  // --- reorderSlabs ---

  it("reorderSlabs rejects an empty ids array", async () => {
    const service = createService();
    await assert.rejects(
      () => service.reorderSlabs({ authUserId: "auth", appUserId: "user", role: "admin", defaultTenantId: "tenant" }, "token", []),
      BadRequestException
    );
  });

  it("reorderSlabs requires admin tenant access", async () => {
    const service = createService({ assertTenantAdmin: async () => { throw new ForbiddenException("Admin only."); } });
    await assert.rejects(
      () => service.reorderSlabs({ authUserId: "auth", appUserId: "user", role: "architect", defaultTenantId: "tenant" }, "token", ["id-1", "id-2"]),
      ForbiddenException
    );
  });

  it("reorderSlabs returns reordered count on success", async () => {
    const service = createService({}, { fromResult: { data: null, error: null } });
    const result = await service.reorderSlabs(
      { authUserId: "auth", appUserId: "user", role: "admin", defaultTenantId: "tenant" },
      "token",
      ["id-1", "id-2", "id-3"]
    );
    assert.equal((result as any).reordered, 3);
  });

  // --- resolveRedemption ---

  it("resolveRedemption rejects an invalid status", async () => {
    const service = createService();
    await assert.rejects(
      () => service.resolveRedemption(
        { authUserId: "auth", appUserId: "user", role: "admin", defaultTenantId: "tenant" },
        "token",
        "redemption-1",
        "pending" as any
      ),
      BadRequestException
    );
  });

  it("resolveRedemption requires admin tenant access", async () => {
    const service = createService({ assertTenantAdmin: async () => { throw new ForbiddenException("Admin only."); } });
    await assert.rejects(
      () => service.resolveRedemption(
        { authUserId: "auth", appUserId: "user", role: "architect", defaultTenantId: "tenant" },
        "token",
        "redemption-1",
        "approved"
      ),
      ForbiddenException
    );
  });
});

