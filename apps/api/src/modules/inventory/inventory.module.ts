import { Module } from "@nestjs/common";
import { TenancyModule } from "../../common/tenancy/tenancy.module";
import { InventoryController } from "./inventory.controller";
import { InventoryService } from "./inventory.service";
import { GoogleDriveProductsService } from "./google-drive-products.service";

@Module({
  imports: [TenancyModule],
  controllers: [InventoryController],
  providers: [InventoryService, GoogleDriveProductsService]
})
export class InventoryModule {}
