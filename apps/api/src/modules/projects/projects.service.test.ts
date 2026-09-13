import test, { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { ProjectsService } from "./projects.service";
import type { RequestActor } from "../../common/auth/auth.types";

const adminActor: RequestActor = {
  authUserId: "auth_admin",
  appUserId: "user_admin",
  defaultTenantId: "tenant_100",
  role: "admin"
};

const outsiderActor: RequestActor = {
  authUserId: "auth_outsider",
  appUserId: "user_outsider",
  defaultTenantId: "tenant_200",
  role: "customer"
};

describe("ProjectsService Data Access & Permissions", () => {
  it("rejects project access for user outside tenant", async () => {
    const mockSupabase: any = {
      getClient: () => ({
        from: (table: string) => {
          if (table === "projects") {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: { id: "proj_1", tenant_id: "tenant_100", customer_id: "user_owner", created_by: "user_owner" },
                    error: null
                  })
                })
              })
            };
          }
          return {};
        }
      })
    };

    const mockTenantAccess: any = {
      assertTenantAccess: async (_actor: RequestActor, tenantId: string) => {
        if (tenantId !== outsiderActor.defaultTenantId) {
          throw new ForbiddenException("You do not have access to this tenant.");
        }
      }
    };

    const service = new ProjectsService(mockSupabase, mockTenantAccess);

    await assert.rejects(async () => {
      await service.get(outsiderActor, "proj_1");
    }, ForbiddenException);
  });

  it("rejects adding project member if user is not an active member of tenant", async () => {
    const mockSupabase: any = {
      getClient: () => ({
        from: (table: string) => {
          if (table === "projects") {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: { id: "proj_1", tenant_id: "tenant_100", customer_id: "user_admin", created_by: "user_admin" },
                    error: null
                  })
                })
              })
            };
          }
          if (table === "tenant_memberships") {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    eq: () => ({
                      maybeSingle: async () => ({ data: null, error: null }) // Not a member of tenant
                    })
                  })
                })
              })
            };
          }
          return {};
        }
      })
    };

    const mockTenantAccess: any = {
      assertTenantAccess: async () => {}
    };

    const service = new ProjectsService(mockSupabase, mockTenantAccess);

    await assert.rejects(async () => {
      await service.addMember(adminActor, "proj_1", {
        user_id: "user_outsider",
        role_key: "electrician"
      });
    }, /Selected user is not an active member of this tenant/);
  });
});
