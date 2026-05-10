import { Module } from "@nestjs/common";
import { TenancyModule } from "../../common/tenancy/tenancy.module";
import { InventoryController } from "./inventory.controller";
import { InventoryService } from "./inventory.service";

@Module({
  imports: [TenancyModule],
  controllers: [InventoryController],
  providers: [InventoryService]
})
export class InventoryModule {}
