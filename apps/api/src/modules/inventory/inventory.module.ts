import { Module } from "@nestjs/common";
import { TenancyModule } from "../../common/tenancy/tenancy.module";
import { InventoryController } from "./inventory.controller";
import { InventoryService } from "./inventory.service";
import { PriceListService } from "./price-list.service";

@Module({
  imports: [TenancyModule],
  controllers: [InventoryController],
  providers: [InventoryService, PriceListService]
})
export class InventoryModule {}
