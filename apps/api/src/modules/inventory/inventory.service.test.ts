import test, { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ForbiddenException } from "@nestjs/common";
import { InventoryService } from "./inventory.service";
import type { RequestActor } from "../../common/auth/auth.types";

const adminActor: RequestActor = {
  authUserId: "auth_admin",
  appUserId: "user_admin",
  defaultTenantId: "tenant_1",
  role: "admin"
};

const customerActor: RequestActor = {
  authUserId: "auth_cust",
  appUserId: "user_cust",
  defaultTenantId: "tenant_1",
  role: "customer"
};

const warehouseActor: RequestActor = {
  authUserId: "auth_wh",
  appUserId: "user_wh",
  defaultTenantId: "tenant_1",
  role: "warehouse_manager"
};

describe("Inventory Permissions Enforcement", () => {
  it("allows viewing products for all users in tenant", () => {
    const service = new InventoryService({} as any, {} as any, {} as any);
    assert.doesNotThrow(() => {
      service.assertInventoryPermission(customerActor, "view_products");
    });
  });

  it("denies product creation for regular customer", () => {
    const service = new InventoryService({} as any, {} as any, {} as any);
    assert.throws(() => {
      service.assertInventoryPermission(customerActor, "create_product");
    }, ForbiddenException);
  });

  it("denies product deletion for warehouse manager", () => {
    const service = new InventoryService({} as any, {} as any, {} as any);
    assert.throws(() => {
      service.assertInventoryPermission(warehouseActor, "delete_product");
    }, ForbiddenException);
  });

  it("allows stock changes for warehouse manager", () => {
    const service = new InventoryService({} as any, {} as any, {} as any);
    assert.doesNotThrow(() => {
      service.assertInventoryPermission(warehouseActor, "change_stock");
    });
  });

  it("allows all inventory actions for platform/tenant admin", () => {
    const service = new InventoryService({} as any, {} as any, {} as any);
    const actions = [
      "view_products",
      "create_product",
      "edit_product",
      "change_price",
      "change_stock",
      "delete_product",
      "import_products",
      "export_products"
    ] as const;

    for (const action of actions) {
      assert.doesNotThrow(() => {
        service.assertInventoryPermission(adminActor, action);
      });
    }
  });
});
